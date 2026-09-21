/* eslint-disable @typescript-eslint/no-explicit-any */
import { MESSAGES, NOT_AVAILABLE } from '@terracolombia/shared';
import {
  OWN_INDICATORS_PART,
  REPORT_KIND_TITLE,
  REPORT_LEVEL_LABEL,
  SHARE_ALIKE_PART,
  SOURCES_SHEET_NAME,
  type ReportSpec,
  type ReportTable,
} from './types.js';
import { toTabular, type TabularWorkbook } from './tabular.js';

/**
 * Exportación a XLSX con ExcelJS: **una hoja por sección del informe** más la hoja
 * `FUENTES_Y_LICENCIA`, que es obligatoria en toda exportación (PLAN.md §11).
 *
 * Convenciones es-CO:
 * - Los formatos numéricos se declaran con la sintaxis neutra de OOXML (`#.##0` con punto de
 *   millares no es portable), así que se usa `#,##0`; Excel lo muestra con los separadores
 *   del sistema, que en es-CO son punto para miles y coma para decimales.
 * - La moneda se declara como `"$" #,##0` porque el informe siempre está en pesos colombianos.
 * - Encabezados congelados, autofiltro y anchos de columna declarados en la tabla.
 */

const HEADER_FILL = 'FFF9F9F7';
const HEADER_FONT = 'FF0B0B0B';
const SA_TAB_COLOR = 'FF2A78D6';
const TC_TAB_COLOR = 'FF1BAF7A';

export class XlsxUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      'No está instalado el paquete "exceljs", necesario para exportar a XLSX.\n' +
        'Instálalo con:  pnpm add exceljs -F @terracolombia/reports',
    );
    this.name = 'XlsxUnavailableError';
    this.cause = cause;
  }
}

async function loadExcelJs(): Promise<any> {
  try {
    const mod = await import('exceljs');
    return (mod as any).default ?? mod;
  } catch (e) {
    throw new XlsxUnavailableError(e);
  }
}

function cellValue(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (v === NOT_AVAILABLE) return MESSAGES.common.notAvailable;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return String(v);
}

function writeTable(sheet: any, table: ReportTable, noteLines: readonly string[]): void {
  let row = 1;

  sheet.getCell(row, 1).value = table.title;
  sheet.getCell(row, 1).font = { bold: true, size: 13 };
  row += 1;

  for (const line of noteLines) {
    sheet.getCell(row, 1).value = line;
    sheet.getCell(row, 1).font = { size: 9, italic: true, color: { argb: 'FF52514E' } };
    row += 1;
  }

  if (table.note) {
    sheet.getCell(row, 1).value = table.note;
    sheet.getCell(row, 1).font = { size: 9, italic: true, color: { argb: 'FF52514E' } };
    row += 1;
  }
  if (table.hasCadastralValue) {
    sheet.getCell(row, 1).value =
      'Advertencia: avalúo catastral ≠ valor comercial. El avalúo catastral es un valor fiscal determinado por la autoridad catastral y habitualmente difiere del valor de mercado.';
    sheet.getCell(row, 1).font = { size: 9, bold: true, color: { argb: 'FFD03B3B' } };
    row += 1;
  }
  row += 1;

  const headerRow = row;
  table.columns.forEach((col, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFC3C2B7' } } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getColumn(i + 1).width = col.width ?? 18;
    if (col.numFmt) sheet.getColumn(i + 1).numFmt = col.numFmt;
  });

  if (table.rows.length === 0) {
    sheet.getCell(headerRow + 1, 1).value =
      table.emptyMessage ?? MESSAGES.common.notAvailableLong;
    sheet.getCell(headerRow + 1, 1).font = { italic: true, color: { argb: 'FF898781' } };
  } else {
    table.rows.forEach((r, ri) => {
      table.columns.forEach((col, ci) => {
        const cell = sheet.getCell(headerRow + 1 + ri, ci + 1);
        cell.value = cellValue(r[col.key]);
        cell.alignment = {
          horizontal: col.align ?? 'left',
          vertical: 'top',
          wrapText: (col.width ?? 18) > 30,
        };
        if (col.numFmt && typeof cell.value === 'number') cell.numFmt = col.numFmt;
      });
    });
  }

  // Encabezados congelados y autofiltro sobre la tabla.
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }];
  if (table.rows.length > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + table.rows.length, column: table.columns.length },
    };
  }
}

/**
 * Genera el libro de trabajo. **Siempre** crea la hoja `FUENTES_Y_LICENCIA`, incluso si el
 * informe no declara ninguna fuente (en ese caso la hoja lo dice explícitamente).
 */
export async function toXlsx(spec: ReportSpec, workbookModel?: TabularWorkbook): Promise<Buffer> {
  const ExcelJS = await loadExcelJs();
  const model = workbookModel ?? toTabular(spec);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TerraColombia';
  wb.created = new Date(spec.verification.issuedAt);
  wb.title = spec.titleOverride ?? REPORT_KIND_TITLE[spec.kind];
  wb.company = 'TerraColombia';

  // ── Portada ────────────────────────────────────────────────────────────────
  const cover = wb.addWorksheet('RESUMEN', { properties: { tabColor: { argb: 'FF184F95' } } });
  cover.getColumn(1).width = 44;
  cover.getColumn(2).width = 80;
  const coverRows: Array<[string, string]> = [
    ['Informe', wb.title],
    ['Nivel', REPORT_LEVEL_LABEL[spec.level]],
    ['Identificador', spec.verification.reportId],
    ['Emitido', spec.verification.issuedAt],
    ['Verificación', spec.verification.verifyUrl],
    ['Huella SHA-256', spec.verification.checksum ?? MESSAGES.common.notAvailable],
    ['Fecha de corte más reciente', spec.meta.cutDate ?? MESSAGES.common.notAvailable],
    ['Datos de demostración', spec.meta.synthetic ? 'SÍ — DATOS DE DEMOSTRACIÓN' : 'No'],
  ];
  cover.getCell(1, 1).value = wb.title;
  cover.getCell(1, 1).font = { bold: true, size: 15 };
  coverRows.forEach(([k, v], i) => {
    cover.getCell(i + 3, 1).value = k;
    cover.getCell(i + 3, 1).font = { bold: true };
    cover.getCell(i + 3, 2).value = v;
  });
  let coverRow = coverRows.length + 5;
  cover.getCell(coverRow, 1).value = 'Cómo está organizado este archivo';
  cover.getCell(coverRow, 1).font = { bold: true, size: 12 };
  coverRow += 1;
  for (const line of [
    `Hojas "SA_…" (${SHARE_ALIKE_PART}): datos abiertos con cláusula ShareAlike (IGAC CC BY-SA 4.0, OSM ODbL).`,
    `Hojas "TC_…" (${OWN_INDICATORS_PART}): indicadores calculados por TerraColombia.`,
    `Hoja "${SOURCES_SHEET_NAME}": fuente, dataset, fecha de corte, licencia y atribución de cada cifra.`,
    'La separación existe porque la cláusula ShareAlike puede alcanzar a las bases derivadas que usted publique.',
  ]) {
    cover.getCell(coverRow, 1).value = line;
    cover.getCell(coverRow, 1).alignment = { wrapText: true };
    cover.mergeCells(coverRow, 1, coverRow, 2);
    coverRow += 1;
  }
  if (spec.meta.synthetic) {
    coverRow += 1;
    cover.getCell(coverRow, 1).value =
      'DATOS DE DEMOSTRACIÓN: este archivo contiene al menos un snapshot sintético. Las cifras no provienen de la fuente oficial.';
    cover.getCell(coverRow, 1).font = { bold: true, color: { argb: 'FFD03B3B' } };
    cover.mergeCells(coverRow, 1, coverRow, 2);
  }

  // ── Una hoja por sección ───────────────────────────────────────────────────
  for (const sheetModel of model.sheets) {
    const ws = wb.addWorksheet(sheetModel.name, {
      properties: {
        tabColor: { argb: sheetModel.group === 'shareAlike' ? SA_TAB_COLOR : TC_TAB_COLOR },
      },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const noteLines =
      sheetModel.group === 'shareAlike'
        ? [
            'Grupo de licencia: DATOS ABIERTOS CON CLÁUSULA SHAREALIKE. Si redistribuye estos datos o publica una base derivada, mantenga la misma licencia y la atribución de la hoja FUENTES_Y_LICENCIA.',
            `Datasets de origen: ${sheetModel.table.sourceDatasetIds.join(', ') || MESSAGES.common.notAvailable}`,
          ]
        : [
            'Grupo de licencia: INDICADORES PROPIOS DE TERRACOLOMBIA (no arrastran la cláusula ShareAlike por sí mismos).',
            `Datasets de origen: ${sheetModel.table.sourceDatasetIds.join(', ') || MESSAGES.common.notAvailable}`,
          ];
    writeTable(ws, sheetModel.table, noteLines);
  }

  // ── Hoja de fuentes: obligatoria ───────────────────────────────────────────
  const sourcesSheet = wb.addWorksheet(SOURCES_SHEET_NAME, {
    properties: { tabColor: { argb: 'FFD03B3B' } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  writeTable(sourcesSheet, model.sources, [
    'Regla del producto: toda cifra lleva fuente, dataset, fecha de corte y licencia. Sin procedencia no se publica.',
  ]);

  // Advertencias legales debajo de la tabla de fuentes.
  const legalStart = model.sources.rows.length + 8;
  const legalLines = model.sourcesText.split('\n');
  legalLines.forEach((line, i) => {
    const cell = sourcesSheet.getCell(legalStart + i, 1);
    cell.value = line;
    cell.font = { size: 9, name: 'Consolas' };
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
