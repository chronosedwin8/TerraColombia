import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from './errors.js';
import { buildMeta, isAvailable, NOT_AVAILABLE, IGAC_ATTRIBUTION_TEMPLATE } from './provenance.js';
import type { SourceRef } from './provenance.js';
import { ALL_DISCLAIMERS, DISCLAIMERS, LICENSES, isShareAlike } from './legal.js';
import { CREDIT_COST, PLANS, entitlementsFor } from './plans.js';
import { GLOSSARY, GLOSSARY_BY_ID } from './glossary.js';
import { formatArea, formatCop, formatDistance, formatNumber, interpolate, MESSAGES } from './i18n.js';
import { AreaAnalyzeSchema, ChangeCompareSchema, ParcelQuerySchema, SuitabilityRequestSchema } from './dsl.js';
import { AREA_ANALYSIS_HARD_LIMIT_KM2, H3_RES, SRID, ZONE_LABEL } from './constants.js';

function sourceRef(over: Partial<SourceRef> = {}): SourceRef {
  return {
    datasetId: 'igac-cadastre',
    source: 'IGAC',
    name: 'Base Catastral',
    cutDate: '2026-09-01',
    license: 'CC-BY-SA-4.0',
    attribution: 'Fuente: IGAC, Base Catastral, corte 2026-09, CC BY-SA 4.0',
    url: null,
    synthetic: false,
    ...over,
  };
}

describe('constantes', () => {
  it('los SRID son los que exige el plan', () => {
    expect(SRID.WGS84).toBe(4326);
    expect(SRID.MAGNA_SIRGAS).toBe(4686);
    expect(SRID.ORIGEN_NACIONAL).toBe(9377);
  });

  it('las resoluciones H3 son 8 y 9', () => {
    expect(H3_RES.COARSE).toBe(8);
    expect(H3_RES.FINE).toBe(9);
  });

  it('las etiquetas de zona cubren urbano y rural', () => {
    expect(ZONE_LABEL['01']).toBe('Urbano');
    expect(ZONE_LABEL['02']).toBe('Rural');
  });
});

describe('procedencia', () => {
  it('buildMeta toma la fecha de corte más reciente', () => {
    const meta = buildMeta([
      sourceRef({ cutDate: '2026-01-01' }),
      sourceRef({ datasetId: 'dane-divipola', cutDate: '2026-09-01' }),
    ]);
    expect(meta.cutDate).toBe('2026-09-01');
  });

  it('marca synthetic si alguna fuente lo es', () => {
    const meta = buildMeta([sourceRef(), sourceRef({ datasetId: 'demo', synthetic: true })]);
    expect(meta.synthetic).toBe(true);
  });

  it('sin fuentes deja la fecha de corte en null', () => {
    expect(buildMeta([]).cutDate).toBeNull();
  });

  it('siempre lleva marca de tiempo de generación', () => {
    expect(() => new Date(buildMeta([]).generatedAt).toISOString()).not.toThrow();
  });

  it('isAvailable distingue el valor ausente del valor cero', () => {
    expect(isAvailable(0)).toBe(true);
    expect(isAvailable('')).toBe(true);
    expect(isAvailable(null)).toBe(false);
    expect(isAvailable(NOT_AVAILABLE)).toBe(false);
  });

  it('la plantilla de atribución del IGAC nombra la licencia y el corte', () => {
    const text = IGAC_ATTRIBUTION_TEMPLATE('2026-09');
    expect(text).toContain('IGAC');
    expect(text).toContain('2026-09');
    expect(text).toContain('CC BY-SA 4.0');
  });
});

describe('legal', () => {
  it('hay al menos las ocho advertencias obligatorias del plan', () => {
    expect(ALL_DISCLAIMERS.length).toBeGreaterThanOrEqual(8);
    for (const d of ALL_DISCLAIMERS) expect(d.length).toBeGreaterThan(40);
  });

  it('las cuatro advertencias que nombra el plan están presentes', () => {
    expect(DISCLAIMERS.notCertificate).toContain('certificado catastral');
    expect(DISCLAIMERS.notAppraisal).toContain('avalúo');
    expect(DISCLAIMERS.notUrbanNorm).toContain('norma urbanística');
    expect(DISCLAIMERS.notTitleStudy).toContain('estudio de títulos');
  });

  it('isShareAlike reconoce CC BY-SA y ODbL, y no CC BY', () => {
    expect(isShareAlike(LICENSES.CC_BY_SA_4.id)).toBe(true);
    expect(isShareAlike(LICENSES.ODBL.id)).toBe(true);
    expect(isShareAlike(LICENSES.CC_BY_4.id)).toBe(false);
    expect(isShareAlike('licencia-inventada')).toBe(false);
  });
});

describe('planes', () => {
  it('el plan gratis no permite exportar ni buscar en avanzado', () => {
    const free = entitlementsFor('free');
    expect(free.canExport).toBe(false);
    expect(free.canUseAdvancedSearch).toBe(false);
    expect(free.watermark).toBe(true);
    expect(free.detailedQueriesPerMonth).toBe(3);
  });

  it('los límites crecen de gratis a Pro y de Pro a Business', () => {
    const free = entitlementsFor('free');
    const pro = entitlementsFor('pro');
    const business = entitlementsFor('business');
    expect(pro.maxAnalysisAreaKm2).toBeGreaterThan(free.maxAnalysisAreaKm2);
    expect(business.maxAnalysisAreaKm2).toBeGreaterThan(pro.maxAnalysisAreaKm2);
    expect(business.seats).toBeGreaterThan(pro.seats);
    expect(pro.rateLimitPerMinute).toBeGreaterThan(free.rateLimitPerMinute);
  });

  it('ningún plan permite analizar más que el techo absoluto', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.entitlements.maxAnalysisAreaKm2).toBeLessThanOrEqual(
        AREA_ANALYSIS_HARD_LIMIT_KM2,
      );
    }
  });

  it('Enterprise se cotiza, no tiene precio de lista', () => {
    expect(PLANS.enterprise.monthlyPriceCop).toBeNull();
  });

  it('todas las operaciones de crédito tienen costo positivo', () => {
    for (const [op, cost] of Object.entries(CREDIT_COST)) {
      expect(cost, `${op} debería costar más de cero`).toBeGreaterThan(0);
    }
  });

  it('el informe técnico cuesta más que el resumen', () => {
    expect(CREDIT_COST.report_technical).toBeGreaterThan(CREDIT_COST.report_full);
    expect(CREDIT_COST.report_full).toBeGreaterThan(CREDIT_COST.report_summary);
  });
});

describe('glosario', () => {
  it('los identificadores son únicos', () => {
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada término tiene una explicación en lenguaje claro', () => {
    for (const g of GLOSSARY) {
      expect(g.plain.length, `${g.id} necesita explicación`).toBeGreaterThan(30);
      expect(g.term.length).toBeGreaterThan(2);
    }
  });

  it('el índice por id coincide con la lista', () => {
    expect(Object.keys(GLOSSARY_BY_ID)).toHaveLength(GLOSSARY.length);
    expect(GLOSSARY_BY_ID.npn?.term).toContain('NPN');
  });

  it('están los términos que el plan exige explicar', () => {
    for (const id of ['npn', 'avaluo_catastral', 'destino_economico', 'vocacion_uso', 'h3']) {
      expect(GLOSSARY_BY_ID[id], `falta el término ${id}`).toBeDefined();
    }
  });

  it('el avalúo catastral advierte que no es precio de venta', () => {
    expect(GLOSSARY_BY_ID.avaluo_catastral?.plain).toContain('No es el precio');
  });
});

describe('formatos es-CO', () => {
  it('formatNumber usa el separador de miles colombiano', () => {
    expect(formatNumber(1234567)).toMatch(/1[.  ]?234[.  ]?567/);
  });

  it('formatCop incluye el símbolo de peso', () => {
    expect(formatCop(250000)).toContain('$');
  });

  it('formatArea pasa a hectáreas por encima de una hectárea', () => {
    expect(formatArea(15000)).toContain('ha');
    expect(formatArea(500)).toContain('m²');
    expect(formatArea(500)).not.toContain('ha');
  });

  it('formatDistance pasa a kilómetros por encima de 1000 m', () => {
    expect(formatDistance(1500)).toContain('km');
    expect(formatDistance(800)).toContain('m');
  });

  it('todos los formatos devuelven "No disponible" ante null', () => {
    for (const fn of [formatNumber, formatCop, formatArea, formatDistance]) {
      expect(fn(null)).toBe(MESSAGES.common.notAvailable);
      expect(fn(undefined)).toBe(MESSAGES.common.notAvailable);
    }
  });

  it('nunca devuelven cero cuando el dato falta', () => {
    expect(formatNumber(null)).not.toContain('0');
    expect(formatArea(null)).not.toContain('0');
  });

  it('interpolate reemplaza las variables de la plantilla', () => {
    expect(interpolate('Área {area} de {limit}', { area: 5, limit: 10 })).toBe('Área 5 de 10');
  });

  it('interpolate deja visible la variable que falta, no una cadena vacía', () => {
    expect(interpolate('Hola {nombre}', {})).toBe('Hola {nombre}');
  });
});

describe('errores', () => {
  it('cada código tiene su estado HTTP', () => {
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.timeout().statusCode).toBe(504);
    expect(AppError.invalidNpn('x').statusCode).toBe(400);
    expect(AppError.insufficientCredits(10, 2).statusCode).toBe(402);
  });

  it('areaTooLarge dice el área pedida y el límite', () => {
    const e = AppError.areaTooLarge(12.5, 5);
    expect(e.message).toContain('12.50');
    expect(e.message).toContain('5');
    expect(e.details.area).toBe(12.5);
  });

  it('toJSON expone código, mensaje y detalles', () => {
    const json = AppError.parcelNotFound('123').toJSON();
    expect(json.error.code).toBe('PARCEL_NOT_FOUND');
    expect(json.error.details.npn).toBe('123');
  });

  it('isAppError distingue de un Error corriente', () => {
    expect(isAppError(AppError.notFound())).toBe(true);
    expect(isAppError(new Error('otro'))).toBe(false);
  });

  it('los mensajes están en español y son accionables', () => {
    expect(AppError.invalidNpn('x').message).toContain('30 dígitos');
    expect(AppError.parcelNotFound('x').message).toContain('dirección');
  });
});

describe('DSL de consulta', () => {
  it('exige alcance para no barrer el país entero', () => {
    expect(() => ParcelQuerySchema.parse({ scope: {} })).toThrow();
    expect(ParcelQuerySchema.parse({ scope: { municipality: '08758' } }).limit).toBe(100);
  });

  it('acepta departamento como alcance', () => {
    expect(ParcelQuerySchema.parse({ scope: { department: '08' } }).scope.department).toBe('08');
  });

  it('aplica los valores por omisión', () => {
    const q = ParcelQuerySchema.parse({ scope: { municipality: '08758' } });
    expect(q.sort).toBe('area_m2:desc');
    expect(q.geometry).toBe('centroid');
    expect(q.near).toEqual([]);
  });

  it('rechaza un orden por un campo que no existe', () => {
    expect(() =>
      ParcelQuerySchema.parse({ scope: { municipality: '08758' }, sort: 'propietario:asc' }),
    ).toThrow();
  });

  it('rechaza un límite por encima del máximo', () => {
    expect(() =>
      ParcelQuerySchema.parse({ scope: { municipality: '08758' }, limit: 99999 }),
    ).toThrow();
  });

  it('acepta el ejemplo del plan', () => {
    const q = ParcelQuerySchema.parse({
      scope: { municipality: '08573' },
      where: { zone: 'urbano', area_m2: { gte: 1000 }, economic_use: ['lote'] },
      near: [
        { layer: 'road', class: ['primary', 'trunk'], max_m: 300 },
        { layer: 'school', max_m: 800 },
      ],
      sort: 'area_m2:desc',
      limit: 100,
    });
    expect(q.near).toHaveLength(2);
    expect(q.where.area_m2?.gte).toBe(1000);
  });

  it('rechaza una capa de proximidad desconocida', () => {
    expect(() =>
      ParcelQuerySchema.parse({
        scope: { municipality: '08758' },
        near: [{ layer: 'propietarios', max_m: 100 }],
      }),
    ).toThrow();
  });
});

describe('DSL de zona, aptitud y cambio', () => {
  it('el radio tiene tope', () => {
    expect(() =>
      AreaAnalyzeSchema.parse({ scope: { kind: 'radius', center: [-74, 4], radiusM: 999999 } }),
    ).toThrow();
  });

  it('acepta municipio como ámbito', () => {
    const a = AreaAnalyzeSchema.parse({ scope: { kind: 'municipality', muniCode: '08758' } });
    expect(a.scope.kind).toBe('municipality');
  });

  it('la aptitud solo acepta usos del catálogo', () => {
    expect(() =>
      SuitabilityRequestSchema.parse({
        target: { kind: 'parcel', npn: '087580101010200010001000000000' },
        use: 'mineria_ilegal',
      }),
    ).toThrow();
    const ok = SuitabilityRequestSchema.parse({
      target: { kind: 'parcel', npn: '087580101010200010001000000000' },
      use: 'colegio',
    });
    expect(ok.use).toBe('colegio');
  });

  it('la comparación de cambio exige dos fechas con formato', () => {
    expect(() =>
      ChangeCompareSchema.parse({
        scope: { kind: 'municipality', muniCode: '08758' },
        fromCutDate: 'ayer',
        toCutDate: '2026-09-01',
      }),
    ).toThrow();
  });
});
