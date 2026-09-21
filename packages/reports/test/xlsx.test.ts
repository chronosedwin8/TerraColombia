import { describe, expect, it } from 'vitest';
import { ALL_DISCLAIMERS, buildMeta } from '@terracolombia/shared';
import { toXlsx } from '../src/xlsx.js';
import { toTabular } from '../src/tabular.js';
import { SOURCES_SHEET_NAME } from '../src/types.js';
import { parcelSpec } from './fixtures.js';

/**
 * Pruebas contra **ExcelJS de verdad**: se genera el libro, se vuelve a abrir y se comprueba lo
 * que contiene. `exporters.test.ts` sustituye ExcelJS por un doble para probar la lógica de qué
 * hojas se crean; aquí se comprueba que el archivo resultante es un XLSX válido y legible.
 */

async function readBack(buffer: Buffer) {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe('toXlsx contra ExcelJS real', () => {
  it('produce un XLSX válido que se puede volver a abrir', async () => {
    const buffer = await toXlsx(parcelSpec());
    // Firma de un archivo ZIP, que es lo que es un XLSX.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    const wb = await readBack(buffer);
    expect(wb.worksheets.length).toBeGreaterThan(3);
  });

  it('la hoja FUENTES_Y_LICENCIA existe y trae las columnas obligatorias', async () => {
    const wb = await readBack(await toXlsx(parcelSpec()));
    const sheet = wb.getWorksheet(SOURCES_SHEET_NAME);
    expect(sheet, `falta la hoja ${SOURCES_SHEET_NAME}`).toBeDefined();

    const values: string[] = [];
    sheet!.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string') values.push(cell.value);
      });
    });
    const text = values.join('\n');

    expect(text).toContain('Fuente');
    expect(text).toContain('Dataset');
    expect(text).toContain('Fecha de corte');
    expect(text).toContain('Licencia');
    expect(text).toContain('igac-catastro-terreno');
    expect(text).toContain('CC-BY-SA-4.0');
    expect(text).toContain('2026-07-31');
    expect(text).toContain('avalúo catastral ≠ valor comercial');
    for (const d of ALL_DISCLAIMERS) expect(text).toContain(d);
  });

  it('crea la hoja FUENTES_Y_LICENCIA incluso sin fuentes declaradas', async () => {
    const wb = await readBack(await toXlsx(parcelSpec({ meta: buildMeta([]) })));
    const sheet = wb.getWorksheet(SOURCES_SHEET_NAME);
    expect(sheet).toBeDefined();
    const first = sheet!.getCell(1, 1).value;
    expect(String(first)).toBe(SOURCES_SHEET_NAME);
  });

  it('crea una hoja por sección, con el prefijo de su grupo de licencia', async () => {
    const model = toTabular(parcelSpec());
    const wb = await readBack(await toXlsx(parcelSpec(), model));
    const names = wb.worksheets.map((w) => w.name);

    expect(names[0]).toBe('RESUMEN');
    expect(names).toContain(SOURCES_SHEET_NAME);
    for (const sheet of model.sheets) expect(names).toContain(sheet.name);

    const shareAlike = names.filter((n) => n.startsWith('SA_'));
    const own = names.filter((n) => n.startsWith('TC_'));
    expect(shareAlike.length).toBeGreaterThan(0);
    expect(own.length).toBeGreaterThan(0);
  });

  it('congela el encabezado y declara el autofiltro de cada tabla con filas', async () => {
    const model = toTabular(parcelSpec());
    const wb = await readBack(await toXlsx(parcelSpec(), model));
    const sheetModel = model.sheets.find((s) => s.table.rows.length > 0);
    expect(sheetModel).toBeDefined();

    const sheet = wb.getWorksheet(sheetModel!.name);
    expect(sheet).toBeDefined();
    expect(sheet!.views?.[0]?.state).toBe('frozen');
    expect(sheet!.autoFilter).toBeTruthy();
  });

  it('cada hoja de datos declara su grupo de licencia y sus datasets de origen', async () => {
    const model = toTabular(parcelSpec());
    const wb = await readBack(await toXlsx(parcelSpec(), model));

    for (const sheetModel of model.sheets) {
      const sheet = wb.getWorksheet(sheetModel.name);
      const header: string[] = [];
      for (let r = 1; r <= 5; r += 1) {
        const value = sheet!.getCell(r, 1).value;
        if (typeof value === 'string') header.push(value);
      }
      const text = header.join('\n');
      expect(text).toContain('Grupo de licencia');
      expect(text).toContain('Datasets de origen');
      if (sheetModel.group === 'shareAlike') expect(text).toContain('SHAREALIKE');
      else expect(text).toContain('TERRACOLOMBIA');
    }
  });

  it('el resumen advierte de los datos de demostración', async () => {
    const wb = await readBack(await toXlsx(parcelSpec()));
    const sheet = wb.getWorksheet('RESUMEN');
    const values: string[] = [];
    sheet!.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string') values.push(cell.value);
      });
    });
    expect(values.join('\n')).toContain('DATOS DE DEMOSTRACIÓN');
  });

  it('conserva los números como números, no como texto', async () => {
    const model = toTabular(parcelSpec());
    const wb = await readBack(await toXlsx(parcelSpec(), model));
    const sheetModel = model.sheets.find((s) => s.table.id === 'identificacion');
    const sheet = wb.getWorksheet(sheetModel!.name);

    let foundNumber = false;
    sheet!.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'number') foundNumber = true;
      });
    });
    expect(foundNumber).toBe(true);
  });
});
