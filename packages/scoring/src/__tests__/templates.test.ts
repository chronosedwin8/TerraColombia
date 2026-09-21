import { describe, expect, it } from 'vitest';
import { LocationIntelSchema } from '@terracolombia/shared';
import {
  BUSINESS_TEMPLATES,
  TEMPLATE_LIST,
  auditTemplate,
  defaultExplainRanking,
  getTemplate,
  rankingDrivers,
  templateOverrides,
  templateSourceDatasetIds,
  templateWeights,
  type RankedCellLike,
} from '../templates.js';
import { toFactorScore } from '../indicators.js';

const PLANTILLAS_OBLIGATORIAS = [
  'colegio',
  'retail_barrio',
  'supermercado',
  'farmacia',
  'clinica_ips',
  'bodega_logistica',
  'restaurante',
  'gimnasio',
  'vivienda_vis',
  'hotel',
];

describe('catálogo de plantillas', () => {
  it('trae todas las plantillas obligatorias del plan', () => {
    for (const id of PLANTILLAS_OBLIGATORIAS) {
      expect(getTemplate(id), `falta la plantilla ${id}`).toBeDefined();
    }
    expect(TEMPLATE_LIST).toHaveLength(PLANTILLAS_OBLIGATORIAS.length);
  });

  it('cada plantilla es coherente y está documentada', () => {
    for (const t of TEMPLATE_LIST) {
      expect(auditTemplate(t), t.id).toEqual([]);
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.audience.length).toBeGreaterThan(10);
      expect(t.hardFilters.length).toBeGreaterThan(0);
      for (const filter of t.hardFilters) {
        expect(filter.description.length, `${t.id}/${filter.id}`).toBeGreaterThan(30);
        expect(filter.indicators.length).toBeGreaterThan(0);
      }
    }
  });

  it('los pesos por omisión de cada plantilla suman 1', () => {
    for (const t of TEMPLATE_LIST) {
      const total = t.indicators.reduce((acc, i) => acc + i.weight, 0);
      expect(total, t.id).toBeCloseTo(1, 6);
    }
  });

  it('la resolución recomendada es una de las admitidas por el DSL compartido', () => {
    for (const t of TEMPLATE_LIST) {
      const parsed = LocationIntelSchema.parse({
        templateId: t.id,
        scope: { kind: 'municipality', muniCode: '08573' },
        resolution: t.recommendedResolution,
      });
      expect(parsed.resolution).toBe(t.recommendedResolution);
    }
  });

  it('todos los filtros duros distinguen "descarta" de "no hay datos"', () => {
    for (const t of TEMPLATE_LIST) {
      for (const filter of t.hardFilters) {
        expect(filter.excludes({}), `${t.id}/${filter.id}`).toBeNull();
      }
    }
  });
});

describe('plantilla de colegio', () => {
  const colegio = BUSINESS_TEMPLATES.colegio;

  it('usa exactamente los cuatro criterios que pide el plan', () => {
    expect(colegio).toBeDefined();
    const ids = colegio?.indicators.map((i) => i.indicator) ?? [];
    expect(ids).toContain('school_age_population');
    expect(ids).toContain('school_seats_per_100_school_age');
    expect(ids).toContain('large_parcels_count');
    expect(ids).toContain('road_access_index');
  });

  it('trata la oferta existente como competencia: menos cupos, más puntaje', () => {
    const saturado = toFactorScore('school_seats_per_100_school_age', 110, 1);
    const desatendido = toFactorScore('school_seats_per_100_school_age', 10, 1);
    expect(saturado.score ?? 100).toBeLessThan(desatendido.score ?? 0);
    expect(saturado.direction).toBe('lower_is_better');
  });
});

describe('utilidades de plantilla', () => {
  it('templateWeights y templateOverrides extraen lo declarado', () => {
    const clinica = BUSINESS_TEMPLATES.clinica_ips;
    expect(clinica).toBeDefined();
    if (!clinica) return;
    const weights = templateWeights(clinica);
    expect(weights.distance_health_facility_m).toBe(0.2);
    const overrides = templateOverrides(clinica);
    // La clínica invierte la orientación de la distancia a IPS: lejos es oportunidad.
    expect(overrides.distance_health_facility_m).toBeDefined();
    expect(overrides.distance_health_facility_m?.direction).toBe('higher_is_better');
  });

  it('la inversión declarada cambia el puntaje del factor', () => {
    const clinica = BUSINESS_TEMPLATES.clinica_ips;
    if (!clinica) return;
    const overrides = templateOverrides(clinica);
    const cerca = toFactorScore(
      'distance_health_facility_m',
      500,
      1,
      overrides.distance_health_facility_m,
    );
    const lejos = toFactorScore(
      'distance_health_facility_m',
      8000,
      1,
      overrides.distance_health_facility_m,
    );
    expect(lejos.score ?? 0).toBeGreaterThan(cerca.score ?? 100);
  });

  it('reporta los datasets que necesita, sin repetir', () => {
    for (const t of TEMPLATE_LIST) {
      const ids = templateSourceDatasetIds(t);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(ids);
    }
  });
});

describe('explainRanking', () => {
  function celda(h3: string, score: number, popScore: number): RankedCellLike {
    return {
      h3,
      score,
      excluded: false,
      factors: [
        { ...toFactorScore('population_density_per_km2', 1, 0.5), score: popScore },
        { ...toFactorScore('road_access_index', 50, 0.5), score: 50 },
      ],
    };
  }

  it('nombra los factores que separan a las mejores celdas', () => {
    const cells = [celda('a', 90, 100), celda('b', 80, 90), celda('c', 30, 10)];
    const drivers = rankingDrivers(cells);
    expect(drivers[0]?.indicator).toBe('population_density_per_km2');
    expect(drivers[0]?.topMean).toBeGreaterThan(drivers[0]?.overallMean ?? 0);
    const text = defaultExplainRanking({ name: 'Prueba' })(cells);
    expect(text).toContain('Prueba');
    expect(text).toContain('densidad de población');
    expect(text).toContain('La decisión, y los criterios, son tuyos.');
  });

  it('dice la verdad cuando no hay nada que ordenar', () => {
    const text = defaultExplainRanking({ name: 'Prueba' })([]);
    expect(text).toContain('Ninguna celda');
  });

  it('es determinista', () => {
    const cells = [celda('a', 90, 100), celda('b', 90, 100)];
    expect(rankingDrivers(cells)).toEqual(rankingDrivers(cells));
  });
});
