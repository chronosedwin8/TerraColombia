import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_DISCLAIMERS, buildMeta } from '@terracolombia/shared';
import {
  csvBundle,
  findOgr2Ogr,
  renderExport,
  resetOgrCache,
  splitByLicense,
  toCsv,
  toGeoJson,
} from '../src/exporters.js';
import { buildSourcesTable, buildSourcesText, sanitizeSheetName, toTabular } from '../src/tabular.js';
import { SOURCES_SHEET_NAME, type ReportTable } from '../src/types.js';
import { createZip } from '../src/zip.js';
import { SOURCES, VERIFICATION, parcelSpec } from './fixtures.js';

/** Lista los nombres de las entradas de un ZIP leyendo su directorio central. */
function zipEntryNames(buf: Buffer): string[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd, 'el ZIP no tiene registro de fin de directorio central').toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(buf.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

const sampleTable: ReportTable = {
  id: 'muestra',
  title: 'Tabla de muestra',
  columns: [
    { key: 'a', label: 'Concepto' },
    { key: 'b', label: 'Valor', align: 'right' },
  ],
  rows: [
    { a: 'con; punto y coma', b: 10 },
    { a: 'con "comillas"', b: null },
    { a: 'con\nsalto', b: 'NO_DISPONIBLE' },
  ],
  sourceDatasetIds: ['igac-catastro-terreno'],
  shareAlike: true,
  hasCadastralValue: true,
};

describe('toCsv', () => {
  it('usa punto y coma y BOM para que Excel en es-CO lo abra bien', () => {
    const csv = toCsv(sampleTable);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Concepto;Valor');
    expect(csv).toContain('\r\n');
  });

  it('entrecomilla los valores con separador, comillas o saltos de línea', () => {
    const csv = toCsv(sampleTable, { bom: false });
    expect(csv).toContain('"con; punto y coma";10');
    expect(csv).toContain('"con ""comillas"""');
    expect(csv).toContain('"con\nsalto"');
  });

  it('traduce NO_DISPONIBLE al texto para el usuario', () => {
    expect(toCsv(sampleTable, { bom: false })).toContain('No disponible');
  });

  it('declara la procedencia y la advertencia del avalúo en las notas de cabecera', () => {
    const csv = toCsv(sampleTable, { bom: false });
    expect(csv).toContain('# Datasets de origen: igac-catastro-terreno');
    expect(csv).toContain('avalúo catastral ≠ valor comercial');
    expect(csv).toContain(`# Consulte ${SOURCES_SHEET_NAME}.txt`);
  });

  it('explica una tabla vacía en lugar de dejarla en blanco', () => {
    const csv = toCsv(
      { ...sampleTable, rows: [], emptyMessage: 'No hay construcciones registradas.' },
      { bom: false },
    );
    expect(csv).toContain('No hay construcciones registradas.');
  });

  it('permite cambiar el separador cuando el consumidor es una máquina', () => {
    expect(toCsv(sampleTable, { bom: false, delimiter: ',' })).toContain('Concepto,Valor');
  });
});

describe('toGeoJson', () => {
  const fc = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [-74.8, 10.9] },
        properties: { npn: '08001', accesibilidad: 88, secreto: 'x' },
      },
    ],
  };

  it('declara EPSG:4326 y adjunta la procedencia', () => {
    const out = JSON.parse(toGeoJson(fc, { meta: buildMeta(SOURCES) }));
    expect(out.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::4326');
    expect(out.terracolombia.sources).toHaveLength(SOURCES.length);
    const igac = out.terracolombia.sources.find((s: { source: string }) => s.source === 'IGAC');
    expect(igac.shareAlike).toBe(true);
    expect(igac.attribution).toContain('CC BY-SA 4.0');
    const dane = out.terracolombia.sources.find((s: { source: string }) => s.source === 'DANE');
    expect(dane.shareAlike).toBe(false);
  });

  it('puede recortar las propiedades exportadas', () => {
    const out = JSON.parse(toGeoJson(fc, { onlyProperties: ['npn'] }));
    expect(out.features[0].properties).toEqual({ npn: '08001' });
  });

  it('separa los indicadores propios de los datos ShareAlike', () => {
    const { shareAlike, own } = splitByLicense(fc, ['accesibilidad'], 'npn');
    expect(Object.keys(shareAlike.features[0]!.properties)).toEqual(
      expect.arrayContaining(['npn', 'secreto']),
    );
    expect(Object.keys(shareAlike.features[0]!.properties)).not.toContain('accesibilidad');
    expect(own).not.toBeNull();
    expect(Object.keys(own!.features[0]!.properties).sort()).toEqual(['accesibilidad', 'npn']);
  });

  it('sin indicadores propios declarados, todo se trata como ShareAlike', () => {
    const { own } = splitByLicense(fc, [], 'npn');
    expect(own).toBeNull();
  });
});

describe('modelo tabular', () => {
  it('siempre produce la tabla FUENTES_Y_LICENCIA con las cuatro columnas obligatorias', () => {
    const t = buildSourcesTable(buildMeta(SOURCES), VERIFICATION);
    const keys = t.columns.map((c) => c.key);
    expect(keys).toContain('source');
    expect(keys).toContain('dataset');
    expect(keys).toContain('cutDate');
    expect(keys).toContain('license');
    expect(t.rows).toHaveLength(SOURCES.length);
    expect(t.rows.map((r) => r['shareAlike'])).toContain('Sí');
    expect(t.rows.map((r) => r['snapshot'])).toContain('snap_igac_2026_07');
  });

  it('la tabla de fuentes existe incluso sin fuentes y lo dice', () => {
    const t = buildSourcesTable(buildMeta([]), VERIFICATION);
    expect(t.rows).toHaveLength(0);
    expect(t.emptyMessage).toMatch(/no declara fuentes/i);
  });

  it('el texto de fuentes incluye los descargos íntegros y la nota del avalúo', () => {
    const text = buildSourcesText(parcelSpec(), VERIFICATION);
    for (const d of ALL_DISCLAIMERS) expect(text).toContain(d);
    expect(text).toContain('avalúo catastral ≠ valor comercial');
    expect(text).toContain('Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0');
    expect(text).toContain('DATOS DE DEMOSTRACIÓN');
    expect(text).toContain('misma licencia');
    expect(text).toContain('Concepto de abogado');
  });

  it('separa las hojas ShareAlike de las propias y las ordena primero', () => {
    const model = toTabular(parcelSpec());
    expect(model.sheets.length).toBeGreaterThan(5);
    const groups = model.sheets.map((s) => s.group);
    expect(groups).toContain('shareAlike');
    expect(groups).toContain('own');
    // Todas las ShareAlike van antes de las propias.
    expect(groups.lastIndexOf('shareAlike')).toBeLessThan(groups.indexOf('own'));
    for (const s of model.sheets) {
      expect(s.name.startsWith(s.group === 'shareAlike' ? 'SA_' : 'TC_')).toBe(true);
    }
  });

  it('una tabla con fuente ShareAlike se clasifica como ShareAlike aunque no lo declare', () => {
    const model = toTabular(parcelSpec());
    const hydro = model.sheets.find((s) => s.table.id === 'poblacion');
    expect(hydro?.group).toBe('own'); // DANE no es ShareAlike
    const parcels = model.sheets.find((s) => s.table.id === 'identificacion');
    expect(parcels?.group).toBe('shareAlike'); // IGAC CC BY-SA 4.0
    const roads = model.sheets.find((s) => s.table.id === 'vias');
    expect(roads?.group).toBe('shareAlike'); // OSM ODbL
  });

  it('los nombres de hoja son válidos para Excel y únicos', () => {
    const model = toTabular(parcelSpec());
    const seen = new Set<string>();
    for (const s of model.sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[\\/?*[\]:]/);
      expect(seen.has(s.name)).toBe(false);
      seen.add(s.name);
    }
  });

  it('sanitizeSheetName trunca, limpia y desambigua', () => {
    const used = new Set<string>();
    expect(sanitizeSheetName('Fuentes / Licencia: 2026', used)).toBe('Fuentes_Licencia_2026');
    expect(sanitizeSheetName('Fuentes / Licencia: 2026', used)).toBe('Fuentes_Licencia_2026_2');
    expect(sanitizeSheetName('x'.repeat(60), used).length).toBe(31);
  });
});

describe('paquete CSV', () => {
  it('separa por licencia y añade FUENTES_Y_LICENCIA en txt y csv', () => {
    const names = zipEntryNames(csvBundle(toTabular(parcelSpec())));
    expect(names).toContain(`${SOURCES_SHEET_NAME}.txt`);
    expect(names).toContain(`${SOURCES_SHEET_NAME}.csv`);
    expect(names.some((n) => n.startsWith('DATOS_ABIERTOS_SHAREALIKE/'))).toBe(true);
    expect(names.some((n) => n.startsWith('INDICADORES_TERRACOLOMBIA/'))).toBe(true);
  });
});

describe('renderExport', () => {
  it('entrega el CSV como ZIP con la hoja de fuentes', async () => {
    const out = await renderExport({ spec: parcelSpec(), format: 'csv' });
    expect(out.contentType).toBe('application/zip');
    expect(out.filename.endsWith('.zip')).toBe(true);
    expect(zipEntryNames(out.buffer)).toContain(`${SOURCES_SHEET_NAME}.txt`);
  });

  it('entrega el GeoJSON como ZIP con la capa y las fuentes', async () => {
    const out = await renderExport({ spec: parcelSpec(), format: 'geojson' });
    const names = zipEntryNames(out.buffer);
    expect(names).toContain(`${SOURCES_SHEET_NAME}.txt`);
    expect(names.some((n) => n.endsWith('.geojson'))).toBe(true);
  });

  it('el nombre del archivo es seguro y no filtra rutas', async () => {
    const out = await renderExport({
      spec: parcelSpec(),
      format: 'csv',
      filenameBase: '../../etc/passwd',
    });
    expect(out.filename).not.toContain('/');
    expect(out.filename).not.toContain('..');
  });
});

describe('detección de GDAL', () => {
  beforeEach(() => {
    resetOgrCache();
  });

  it('respeta GDAL_OGR2OGR cuando el archivo existe', () => {
    const existing = process.execPath; // un ejecutable que seguro existe
    const previous = process.env['GDAL_OGR2OGR'];
    process.env['GDAL_OGR2OGR'] = existing;
    try {
      expect(findOgr2Ogr()).toBe(existing);
    } finally {
      if (previous === undefined) delete process.env['GDAL_OGR2OGR'];
      else process.env['GDAL_OGR2OGR'] = previous;
      resetOgrCache();
    }
  });

  it('cae al nombre en el PATH cuando no hay ninguna ruta conocida', () => {
    const previous = process.env['GDAL_OGR2OGR'];
    process.env['GDAL_OGR2OGR'] = 'C:\\ruta\\que\\no\\existe\\ogr2ogr.exe';
    try {
      expect(findOgr2Ogr()).toMatch(/ogr2ogr/);
    } finally {
      if (previous === undefined) delete process.env['GDAL_OGR2OGR'];
      else process.env['GDAL_OGR2OGR'] = previous;
      resetOgrCache();
    }
  });
});

describe('escritor ZIP', () => {
  it('rechaza rutas que se escapan del paquete', () => {
    expect(() => createZip([{ name: '../fuera.txt', content: 'x' }])).toThrow(/no permitido/i);
  });

  it('el ZIP se puede releer entrada por entrada', () => {
    const buf = createZip([
      { name: 'a.txt', content: 'contenido a' },
      { name: 'dir/b.csv', content: 'x'.repeat(500) },
    ]);
    expect(zipEntryNames(buf)).toEqual(['a.txt', 'dir/b.csv']);
  });
});

// ─── XLSX ─────────────────────────────────────────────────────────────────────

/**
 * ExcelJS se sustituye por un doble que registra las hojas y las celdas escritas. Así el test
 * comprueba la lógica real de `toXlsx` (qué hojas crea y con qué contenido) sin depender de
 * que el binario de ExcelJS esté instalado en el entorno de CI.
 */
interface FakeSheet {
  name: string;
  cells: Map<string, unknown>;
}

const created: FakeSheet[] = [];

vi.mock('exceljs', () => {
  class FakeWorksheet {
    readonly cells = new Map<string, unknown>();
    views: unknown;
    autoFilter: unknown;
    constructor(readonly name: string) {}
    getCell(row: number, col: number) {
      const key = `${row}:${col}`;
      const cells = this.cells;
      return {
        set value(v: unknown) {
          cells.set(key, v);
        },
        get value() {
          return cells.get(key);
        },
        font: undefined,
        fill: undefined,
        border: undefined,
        alignment: undefined,
        numFmt: undefined,
      };
    }
    getColumn() {
      return { width: 0, numFmt: '' };
    }
    mergeCells() {}
  }
  class FakeWorkbook {
    creator = '';
    created = new Date();
    title = '';
    company = '';
    readonly xlsx = {
      writeBuffer: async () => Buffer.from('xlsx-falso'),
    };
    addWorksheet(name: string) {
      const ws = new FakeWorksheet(name);
      created.push({ name, cells: ws.cells });
      return ws;
    }
  }
  return { default: { Workbook: FakeWorkbook }, Workbook: FakeWorkbook };
});

describe('toXlsx', () => {
  beforeEach(() => {
    created.length = 0;
  });

  it('siempre crea la hoja FUENTES_Y_LICENCIA', async () => {
    const { toXlsx } = await import('../src/xlsx.js');
    await toXlsx(parcelSpec());
    expect(created.map((s) => s.name)).toContain(SOURCES_SHEET_NAME);
  });

  it('crea la hoja FUENTES_Y_LICENCIA incluso si el informe no declara fuentes', async () => {
    const { toXlsx } = await import('../src/xlsx.js');
    await toXlsx(parcelSpec({ meta: buildMeta([]) }));
    expect(created.map((s) => s.name)).toContain(SOURCES_SHEET_NAME);
  });

  it('crea una hoja por sección, además del resumen y las fuentes', async () => {
    const { toXlsx } = await import('../src/xlsx.js');
    const model = toTabular(parcelSpec());
    await toXlsx(parcelSpec(), model);
    const names = created.map((s) => s.name);
    expect(names[0]).toBe('RESUMEN');
    expect(names).toHaveLength(model.sheets.length + 2);
    for (const sheet of model.sheets) expect(names).toContain(sheet.name);
  });

  it('la hoja de fuentes incluye los descargos y la advertencia del avalúo', async () => {
    const { toXlsx } = await import('../src/xlsx.js');
    await toXlsx(parcelSpec());
    const sheet = created.find((s) => s.name === SOURCES_SHEET_NAME);
    const text = [...(sheet?.cells.values() ?? [])].filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain('avalúo catastral ≠ valor comercial');
    for (const d of ALL_DISCLAIMERS) expect(text).toContain(d);
  });

  it('el resumen advierte cuando los datos son de demostración', async () => {
    const { toXlsx } = await import('../src/xlsx.js');
    await toXlsx(parcelSpec());
    const cover = created.find((s) => s.name === 'RESUMEN');
    const text = [...(cover?.cells.values() ?? [])].filter((v) => typeof v === 'string').join('\n');
    expect(text).toContain('DATOS DE DEMOSTRACIÓN');
    expect(text).toContain(SOURCES_SHEET_NAME);
  });
});
