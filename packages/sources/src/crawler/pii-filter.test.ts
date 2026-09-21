import { describe, expect, it } from 'vitest';
import {
  classifyPiiColumn,
  detectPiiContent,
  isPiiColumn,
  normalizeColumnName,
  redactValue,
  sanitizeRecord,
} from '../../../../etl/config/pii-blocklist.js';
import { findPiiAdjacentColumns, PiiLog, sanitizeSample } from './pii-filter.js';

const ctx = { source: 'igac' as const, container: 'svc/MapServer', layer: 'R_TERRENO' };

describe('normalizeColumnName', () => {
  it('quita tildes, baja a minúsculas y unifica separadores', () => {
    expect(normalizeColumnName('Nombre Propietario')).toBe('nombre_propietario');
    expect(normalizeColumnName('NÚMERO.DOCUMENTO')).toBe('numero_documento');
    expect(normalizeColumnName('__DIRECCIÓN--PREDIO__')).toBe('direccion_predio');
    expect(normalizeColumnName('Teléfono')).toBe('telefono');
  });
});

describe('isPiiColumn — columnas que SÍ son datos personales', () => {
  const positives = [
    'PROPIETARIO',
    'NOMBRE_PROPIETARIO',
    'nombre propietario',
    'NOM_PROP',
    'R1_NOMBRES',
    'APELLIDO1',
    'RAZON_SOCIAL',
    'NUMERO_DOCUMENTO',
    'CEDULA',
    'CÉDULA',
    'DOC_IDENTIDAD',
    'NIT',
    'NIT_PROPIETARIO',
    'TELEFONO',
    'TEL_2',
    'CELULAR',
    'CORREO_ELECTRONICO',
    'EMAIL',
    'DIRECCION_CORRESPONDENCIA',
    'direccion_notificacion',
    'NOTARIA',
    'FECHA_NACIMIENTO',
    'ESTADO_CIVIL',
    'USUARIO_CREACION',
    'last_edited_user',
    'CONTRIBUYENTE',
    'poseedor',
    'owner_name',
    'mailing_address',
  ];
  for (const name of positives) {
    it(`descarta ${name}`, () => {
      expect(isPiiColumn(name)).toBe(true);
    });
  }
});

describe('isPiiColumn — falsos positivos que NO deben descartarse', () => {
  const negatives = [
    // Campos reales de Dato_Fundamental_Catastro (IGAC), verificados en Fase 0
    'CODIGO',
    'MANZANA_CO',
    'NUMERO_SUB',
    'CODIGO_ANT',
    'GLOBALID_S',
    'SHAPE_Leng',
    'SHAPE_Area',
    'GlobalID',
    'FID',
    // Topónimos y nombres de cosas
    'NOMBRE_GEOGRAFICO',
    'NOMBRE_MUNICIPIO',
    'NOMBRE_VEREDA',
    'nombre_departamento',
    'NOMBRE_VIA',
    'nombre_establecimiento',
    'NOMBRE_SEDE',
    'nombre_area_protegida',
    'NOMBRE_CAPA',
    // Dirección del inmueble: dato público del predio
    'DIRECCION',
    'DIRECCION_PREDIO',
    'direccion_normalizada',
    // Medidas y códigos
    'AREA_TERRENO',
    'AVALUO_CATASTRAL',
    'DESTINO_ECONOMICO',
    'POBLACION_TOTAL',
    'MATRICULA_INMOBILIARIA',
  ];
  for (const name of negatives) {
    it(`conserva ${name}`, () => {
      expect(isPiiColumn(name)).toBe(false);
    });
  }
});

describe('classifyPiiColumn', () => {
  it('reporta la regla que produjo el descarte', () => {
    const v = classifyPiiColumn('NOMBRE_PROPIETARIO');
    expect(v.pii).toBe(true);
    if (v.pii) expect(v.ruleId).toBe('exact');
  });

  it('usa el patrón de titularidad cuando no hay coincidencia exacta', () => {
    const v = classifyPiiColumn('R2_PROPIETARIO_JURIDICO');
    expect(v.pii).toBe(true);
    if (v.pii) expect(v.ruleId).toBe('owner');
  });

  it('atrapa las abreviaturas de los R1/R2 por el patrón de nombre', () => {
    const v = classifyPiiColumn('R2_NOM_PROP');
    expect(v.pii).toBe(true);
    if (v.pii) expect(v.ruleId).toBe('person_name');
  });

  it('marca la matrícula inmobiliaria como adyacente, no como PII', () => {
    const v = classifyPiiColumn('MATRICULA_INMOBILIARIA');
    expect(v.pii).toBe(false);
    if (!v.pii) expect(v.adjacent).toBe(true);
  });
});

describe('detectPiiContent', () => {
  it('detecta correos', () => {
    expect(detectPiiContent('contacto@ejemplo.com')?.patternId).toBe('email');
  });

  it('detecta NIT con dígito de verificación', () => {
    expect(detectPiiContent('900.123.456-7')?.patternId).toBe('co_nit');
  });

  it('detecta celular colombiano', () => {
    expect(detectPiiContent('3151234567')?.patternId).toBe('co_phone');
  });

  it('detecta cédula con separadores de miles', () => {
    expect(detectPiiContent('1.032.456.789')?.patternId).toBe('co_cedula');
  });

  it('detecta nombre completo de persona', () => {
    expect(detectPiiContent('Maria Fernanda Rojas Castillo')?.patternId).toBe('person_full_name');
  });

  it('no marca el código predial de 30 dígitos', () => {
    expect(detectPiiContent('080010101000000010001000000000')).toBeNull();
  });

  it('no marca el código anterior de 20 dígitos', () => {
    expect(detectPiiContent('08001010100000001000')).toBeNull();
  });

  it('no marca un GlobalID de ArcGIS', () => {
    expect(detectPiiContent('{A6F1D0E2-3C4B-4A5D-9E8F-0123456789AB}')).toBeNull();
  });

  it('no marca áreas ni coordenadas', () => {
    expect(detectPiiContent('1234.5678')).toBeNull();
    expect(detectPiiContent('-74.0721')).toBeNull();
  });

  it('no marca fechas ISO', () => {
    expect(detectPiiContent('2026-09-18T00:00:40.000Z')).toBeNull();
  });

  it('no marca el código DANE de 12 dígitos como teléfono (falso positivo real de Fase 0)', () => {
    // Observado en la columna `codigo_dane` de MEN_ESTABLECIMIENTOS_EDUCATIVOS:
    // los últimos 10 dígitos de un código de 12 pasaban por celular.
    expect(detectPiiContent('312345678901', 'codigo_dane')).toBeNull();
    expect(detectPiiContent('218150001809', 'codigo_dane_sede')).toBeNull();
    // Y tampoco en una columna opaca: el patrón exige que no haya dígitos antes.
    expect(detectPiiContent('312345678901', 'campo_x')).toBeNull();
    // Un celular real de 10 dígitos sí se detecta.
    expect(detectPiiContent('3151234567', 'campo_x')?.patternId).toBe('co_phone');
  });

  it('reconoce el prefijo de código aunque venga pegado (codigoprestador)', () => {
    // Observado en el REPS: `codigoprestador` traía un NIT/cédula del prestador
    // como identificador del registro y se redactaba de más.
    expect(detectPiiContent('91001234', 'codigoprestador')).toBeNull();
    expect(detectPiiContent('91001234', 'secuencial')).toBeNull();
    expect(detectPiiContent('91001234', 'observacion')?.patternId).toBe('co_cedula');
  });

  it('omite la heurística numérica en columnas declaradas de código o medida', () => {
    // 5551234 aislado dispararía `co_cedula`; el nombre de columna lo evita.
    expect(detectPiiContent('5551234', 'AREA_TERRENO')).toBeNull();
    expect(detectPiiContent('5551234', 'CODIGO_MANZANA')).toBeNull();
    // Pero en una columna opaca sí se marca.
    expect(detectPiiContent('5551234', 'CAMPO_12')?.patternId).toBe('co_cedula');
  });

  it('sigue detectando correo aun en columna de código', () => {
    expect(detectPiiContent('a@b.co', 'CODIGO')?.patternId).toBe('email');
  });
});

describe('redactValue', () => {
  it('no devuelve el valor original ni su hash', () => {
    const out = redactValue('1032456789', 'co_cedula');
    expect(out).toBe('[REDACTADO:co_cedula]');
    expect(out).not.toContain('1032456789');
  });
});

describe('sanitizeRecord', () => {
  it('elimina columnas PII y redacta valores sospechosos', () => {
    const { clean, droppedColumns, redactedColumns } = sanitizeRecord({
      CODIGO: '080010101000000010001000000000',
      NOMBRE_PROPIETARIO: 'Juan Pérez',
      AREA_TERRENO: 350.5,
      CAMPO_LIBRE: 'escribir a juan@correo.com',
    });
    expect(Object.keys(clean).sort()).toEqual(['AREA_TERRENO', 'CAMPO_LIBRE', 'CODIGO']);
    expect(droppedColumns.map((d) => d.column)).toEqual(['NOMBRE_PROPIETARIO']);
    expect(redactedColumns.map((r) => r.column)).toEqual(['CAMPO_LIBRE']);
    expect(clean.CAMPO_LIBRE).toBe('[REDACTADO:email]');
    expect(JSON.stringify(clean)).not.toContain('Juan');
  });
});

describe('sanitizeSample', () => {
  it('decide el descarte por columna sobre toda la muestra, no fila por fila', () => {
    const log = new PiiLog();
    const rows = [
      { CODIGO: '1', PROPIETARIO: 'Ana Maria Torres Vega' },
      { CODIGO: '2' }, // esta fila no trae la columna
    ];
    const out = sanitizeSample(rows, ctx, log);
    expect(out.droppedColumns).toEqual(['PROPIETARIO']);
    expect(out.rows).toEqual([{ CODIGO: '1' }, { CODIGO: '2' }]);
    expect(JSON.stringify(out.rows)).not.toContain('Ana');
  });

  it('registra cada descarte en el log con la regla y el contenedor', () => {
    const log = new PiiLog();
    sanitizeSample([{ CEDULA: '1032456789', TELEFONO: '3151234567' }], ctx, log);
    expect(log.droppedCount).toBe(2);
    const columns = log.all.map((r) => r.column).sort();
    expect(columns).toEqual(['CEDULA', 'TELEFONO']);
    expect(log.all[0]?.container).toBe('svc/MapServer');
    expect(log.all[0]?.layer).toBe('R_TERRENO');
    expect(log.all[0]?.detectedBy).toBe('column-name');
  });

  it('registra una sola vez por columna aunque varias filas coincidan', () => {
    const log = new PiiLog();
    const out = sanitizeSample(
      [{ OBS: 'a@b.com' }, { OBS: 'c@d.com' }, { OBS: 'e@f.com' }],
      ctx,
      log,
    );
    expect(log.redactedCount).toBe(1);
    expect(out.redactedColumns).toEqual(['OBS']);
    expect(out.rows).toHaveLength(3);
    for (const row of out.rows) expect(row.OBS).toBe('[REDACTADO:email]');
  });

  it('no altera una muestra limpia', () => {
    const log = new PiiLog();
    const rows = [{ CODIGO: '080010101000000010001000000000', SHAPE_Area: 0.0000123 }];
    const out = sanitizeSample(rows, ctx, log);
    expect(out.rows).toEqual(rows);
    expect(log.all).toHaveLength(0);
  });
});

describe('PiiLog', () => {
  it('agrupa por columna y regla', () => {
    const log = new PiiLog();
    for (const layer of ['R_TERRENO', 'U_TERRENO']) {
      log.add({
        source: 'igac',
        container: 'svc',
        layer,
        column: 'PROPIETARIO',
        detectedBy: 'column-name',
        ruleId: 'owner',
        reason: 'x',
        action: 'dropped',
      });
    }
    const grouped = log.groupByColumn();
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.occurrences).toHaveLength(2);
  });

  it('fusiona otro log', () => {
    const a = new PiiLog();
    const b = new PiiLog();
    b.add({
      source: 'men',
      container: 'x',
      layer: 'y',
      column: 'CORREO',
      detectedBy: 'column-name',
      ruleId: 'email',
      reason: 'z',
      action: 'dropped',
    });
    a.merge(b);
    expect(a.droppedCount).toBe(1);
  });
});

describe('findPiiAdjacentColumns', () => {
  it('encuentra identificadores registrales sin descartarlos', () => {
    expect(findPiiAdjacentColumns(['CODIGO', 'MATRICULA_INMOBILIARIA', 'FMI'])).toEqual([
      'MATRICULA_INMOBILIARIA',
      'FMI',
    ]);
  });
});
