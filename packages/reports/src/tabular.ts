import {
  ALL_DISCLAIMERS,
  IGAC_ATTRIBUTION_TEMPLATE,
  LEGAL_PENDING,
  MESSAGES,
  isShareAlike,
  type ResponseMeta,
} from '@terracolombia/shared';
import {
  OWN_INDICATORS_PART,
  REPORT_KIND_TITLE,
  REPORT_LEVEL_LABEL,
  SHARE_ALIKE_PART,
  SOURCES_SHEET_NAME,
  type ReportIndicator,
  type ReportSpec,
  type ReportTable,
  type ReportVerification,
} from './types.js';
import { parcelReportTables } from './templates/parcel-report.js';

/**
 * Modelo tabular intermedio: el puente entre el informe y las exportaciones.
 *
 * Reglas que impone este módulo, y que por eso no se pueden olvidar en un exportador
 * concreto (PLAN.md §2 y §11):
 *
 * 1. **Toda** exportación lleva la hoja/archivo `FUENTES_Y_LICENCIA`.
 * 2. Los datos con cláusula **ShareAlike** (IGAC CC BY-SA 4.0, OSM ODbL) van en hojas y
 *    archivos **separados** de los indicadores propios de TerraColombia, porque la cláusula
 *    puede alcanzar a las bases derivadas de quien los redistribuya. La separación se marca
 *    en el nombre (`SA_` frente a `TC_`) y se explica en `FUENTES_Y_LICENCIA`.
 * 3. Ninguna tabla se exporta sin `sourceDatasetIds`.
 */

export type LicenseGroup = 'shareAlike' | 'own';

export interface TabularSheet {
  /** Nombre saneado para hoja de XLSX (≤ 31 caracteres) y para nombre de archivo. */
  name: string;
  title: string;
  table: ReportTable;
  group: LicenseGroup;
}

export interface TabularWorkbook {
  /** Hojas de datos, ya ordenadas: primero ShareAlike, después indicadores propios. */
  sheets: TabularSheet[];
  /** Tabla de procedencia. Siempre presente. */
  sources: ReportTable;
  /** Versión en texto plano de la procedencia, para `FUENTES_Y_LICENCIA.txt` en los ZIP. */
  sourcesText: string;
  /** Nombre base sugerido para los archivos de la exportación. */
  filenameBase: string;
}

const FORBIDDEN_SHEET_CHARS = /[\\/?*[\]:]/g;

/** Nombre válido de hoja de Excel: sin caracteres prohibidos y con 31 caracteres como máximo. */
export function sanitizeSheetName(name: string, used: Set<string> = new Set()): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(FORBIDDEN_SHEET_CHARS, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 31);
  let candidate = base.length > 0 ? base : 'Hoja';
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Nombre de archivo seguro (sin rutas, sin caracteres raros). */
export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120) || 'exportacion';
}

/**
 * Decide el grupo de licencia de una tabla. Conservador: si alguna de sus fuentes tiene
 * cláusula ShareAlike, la tabla entera va al grupo ShareAlike.
 */
export function licenseGroupOf(table: ReportTable, meta: ResponseMeta): LicenseGroup {
  if (table.shareAlike === true) return 'shareAlike';
  const contaminated = table.sourceDatasetIds.some((id) => {
    const source = meta.sources.find((s) => s.datasetId === id);
    return source ? isShareAlike(source.license) : false;
  });
  return contaminated ? 'shareAlike' : 'own';
}

/** Convierte los indicadores propios en una tabla exportable con su fórmula y procedencia. */
export function indicatorsTable(
  indicators: readonly ReportIndicator[],
  id = 'indicadores',
  title = 'Indicadores calculados por TerraColombia',
): ReportTable {
  return {
    id,
    title,
    columns: [
      { key: 'label', label: 'Indicador', width: 34 },
      { key: 'value', label: 'Valor', width: 20 },
      { key: 'unit', label: 'Unidad', width: 12 },
      { key: 'flag', label: 'Estado', width: 12 },
      { key: 'formula', label: 'Fórmula', width: 48 },
      { key: 'explanation', label: 'Explicación', width: 60 },
      { key: 'sources', label: 'Datasets de origen', width: 34 },
    ],
    rows: indicators.map((i) => ({
      label: i.label,
      value: typeof i.rawValue === 'number' ? i.rawValue : i.value,
      unit: i.unit,
      flag: i.flag ?? null,
      formula: i.formula,
      explanation: i.explanation,
      sources: i.sourceDatasetIds.join(', '),
    })),
    emptyMessage: 'Este informe no calculó indicadores propios.',
    sourceDatasetIds: [...new Set(indicators.flatMap((i) => i.sourceDatasetIds))],
    shareAlike: false,
  };
}

/** Tabla `FUENTES_Y_LICENCIA`. Obligatoria en toda exportación. */
export function buildSourcesTable(meta: ResponseMeta, verification: ReportVerification): ReportTable {
  return {
    id: 'fuentes_y_licencia',
    title: SOURCES_SHEET_NAME,
    columns: [
      { key: 'source', label: 'Fuente', width: 22 },
      { key: 'dataset', label: 'Dataset', width: 40 },
      { key: 'datasetId', label: 'Identificador', width: 30 },
      { key: 'cutDate', label: 'Fecha de corte', width: 16 },
      { key: 'license', label: 'Licencia', width: 22 },
      { key: 'shareAlike', label: 'ShareAlike', width: 12 },
      { key: 'attribution', label: 'Atribución exigida', width: 56 },
      { key: 'url', label: 'URL', width: 46 },
      { key: 'snapshot', label: 'Snapshot', width: 28 },
      { key: 'synthetic', label: 'Sintético', width: 12 },
    ],
    rows: meta.sources.map((s) => ({
      source: s.source,
      dataset: s.name,
      datasetId: s.datasetId,
      cutDate: s.cutDate,
      license: s.license,
      shareAlike: isShareAlike(s.license) ? 'Sí' : 'No',
      attribution: s.attribution,
      url: s.url,
      snapshot: verification.snapshotIds[s.datasetId] ?? null,
      synthetic: s.synthetic ? 'Sí — DATOS DE DEMOSTRACIÓN' : 'No',
    })),
    emptyMessage:
      'Esta exportación no declara fuentes, lo que no debería ocurrir: sin procedencia no se publica ninguna cifra.',
    sourceDatasetIds: meta.sources.map((s) => s.datasetId),
  };
}

/** Versión en texto plano de la procedencia, para el `FUENTES_Y_LICENCIA.txt` de los ZIP. */
export function buildSourcesText(spec: ReportSpec, verification: ReportVerification): string {
  const lines: string[] = [];
  const title = spec.titleOverride ?? REPORT_KIND_TITLE[spec.kind];
  lines.push('FUENTES Y LICENCIA');
  lines.push('='.repeat(72));
  lines.push('');
  lines.push(`Informe: ${title}`);
  lines.push(`Nivel: ${REPORT_LEVEL_LABEL[spec.level]}`);
  lines.push(`Identificador: ${verification.reportId}`);
  lines.push(`Emitido: ${verification.issuedAt}`);
  lines.push(`Verificación: ${verification.verifyUrl}`);
  if (verification.checksum) lines.push(`Huella SHA-256: ${verification.checksum}`);
  lines.push(`Fecha de corte más reciente: ${spec.meta.cutDate ?? MESSAGES.common.notAvailable}`);
  lines.push('');

  if (spec.meta.synthetic) {
    lines.push('*** DATOS DE DEMOSTRACIÓN ***');
    lines.push(
      'Esta exportación contiene al menos un snapshot sintético de demostración. Las cifras no',
      'provienen de la fuente oficial y no deben usarse para decidir nada.',
    );
    lines.push('');
  }

  lines.push('FUENTES');
  lines.push('-'.repeat(72));
  if (spec.meta.sources.length === 0) {
    lines.push('No se declaró ninguna fuente. Reporte este identificador de informe.');
  }
  for (const s of spec.meta.sources) {
    lines.push(`* ${s.source} — ${s.name}`);
    lines.push(`  Identificador del dataset : ${s.datasetId}`);
    lines.push(`  Fecha de corte            : ${s.cutDate ?? MESSAGES.common.notAvailable}`);
    lines.push(`  Licencia                  : ${s.license}${isShareAlike(s.license) ? ' (ShareAlike)' : ''}`);
    lines.push(`  Atribución exigida        : ${s.attribution}`);
    lines.push(`  URL                       : ${s.url ?? MESSAGES.common.notAvailable}`);
    lines.push(`  Snapshot                  : ${verification.snapshotIds[s.datasetId] ?? MESSAGES.common.notAvailable}`);
    lines.push('');
  }

  const igacCut = spec.meta.sources.find((s) => /igac/i.test(s.source))?.cutDate;
  if (igacCut) {
    lines.push('ATRIBUCIÓN OBLIGATORIA AL REUTILIZAR ESTOS DATOS');
    lines.push('-'.repeat(72));
    lines.push(IGAC_ATTRIBUTION_TEMPLATE(igacCut.slice(0, 7)));
    lines.push('');
  }

  lines.push('SEPARACIÓN DE LICENCIAS EN ESTA EXPORTACIÓN');
  lines.push('-'.repeat(72));
  lines.push(
    `Los archivos y hojas cuyo nombre empieza por "SA_" (${SHARE_ALIKE_PART}) contienen datos`,
    'abiertos con cláusula ShareAlike (IGAC CC BY-SA 4.0, OpenStreetMap ODbL). Si usted los',
    'redistribuye, o publica una base derivada de ellos, debe mantener la misma licencia y',
    'conservar la atribución de arriba.',
    '',
    `Los archivos y hojas cuyo nombre empieza por "TC_" (${OWN_INDICATORS_PART}) contienen`,
    'indicadores calculados por TerraColombia. Se entregan separados precisamente para que',
    'usted pueda distinguir qué parte del contenido arrastra la obligación ShareAlike.',
    '',
    'TerraColombia no reclama exclusividad sobre los datos abiertos: el servicio es la',
    'normalización, el cruce, el análisis y el SLA.',
  );
  lines.push('');

  lines.push('ADVERTENCIAS LEGALES');
  lines.push('-'.repeat(72));
  ALL_DISCLAIMERS.forEach((d, i) => {
    lines.push(`${i + 1}. ${d}`);
    lines.push('');
  });

  lines.push('AVISO SOBRE DATOS ECONÓMICOS');
  lines.push('-'.repeat(72));
  lines.push('avalúo catastral ≠ valor comercial');
  lines.push(
    'Cualquier cifra de avalúo catastral que aparezca en esta exportación es un valor fiscal',
    'determinado por la autoridad catastral y habitualmente difiere del valor de mercado.',
  );
  lines.push('');

  lines.push('PENDIENTES LEGALES DECLARADOS POR EL PRODUCTO');
  lines.push('-'.repeat(72));
  LEGAL_PENDING.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  lines.push('');

  if (spec.meta.warnings.length > 0) {
    lines.push('ADVERTENCIAS SOBRE ESTOS DATOS');
    lines.push('-'.repeat(72));
    spec.meta.warnings.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Recolección de tablas por tipo de informe ────────────────────────────────

function tablesOf(spec: ReportSpec): ReportTable[] {
  switch (spec.kind) {
    case 'parcel':
      return [
        ...parcelReportTables(spec.data),
        indicatorsTable(spec.data.indicators),
        ...spec.data.annexes.map((a) => a.table),
      ];
    case 'area': {
      const d = spec.data;
      return [
        d.parcels,
        d.landUse,
        d.population,
        d.education,
        d.health,
        d.commerce,
        d.roads,
        d.soils,
        d.hazards,
        d.protectedAreas,
        d.ethnicTerritories,
        d.potZones,
        d.relief,
        ...d.extraSections.flatMap((s) => s.tables),
        indicatorsTable([...d.headline, ...d.indicators]),
        ...d.annexes.map((a) => a.table),
      ];
    }
    case 'location': {
      const d = spec.data;
      return [
        d.topCells,
        d.candidateParcels,
        d.thresholds,
        ...d.extraSections.flatMap((s) => s.tables),
        indicatorsTable([...d.headline, ...d.indicators]),
        ...d.annexes.map((a) => a.table),
      ];
    }
    case 'change': {
      const d = spec.data;
      return [
        d.byType,
        d.createdParcels,
        d.removedParcels,
        d.geometryChanges,
        d.attributeChanges,
        d.newBuildings,
        ...d.extraSections.flatMap((s) => s.tables),
        indicatorsTable([...d.headline, ...d.indicators]),
        ...d.annexes.map((a) => a.table),
      ];
    }
    case 'municipality': {
      const d = spec.data;
      return [
        d.population,
        d.cadastralDynamics,
        d.landUse,
        d.education,
        d.health,
        d.rankings,
        ...d.timeSeries,
        ...d.extraSections.flatMap((s) => s.tables),
        indicatorsTable([...d.headline, ...d.indicators]),
        ...d.annexes.map((a) => a.table),
      ];
    }
  }
}

export function defaultFilenameBase(spec: ReportSpec): string {
  const kind = spec.kind;
  const id = spec.verification.reportId;
  const discriminator =
    kind === 'parcel'
      ? spec.data.parcel.npn
      : kind === 'municipality'
        ? spec.data.municipality.code
        : kind === 'change'
          ? `${spec.data.fromCutDate}_${spec.data.toCutDate}`
          : kind === 'location'
            ? spec.data.templateId
            : spec.data.title;
  return sanitizeFilename(`terracolombia_${kind}_${discriminator}_${id}`);
}

/** Construye el modelo tabular completo de un informe. */
export function toTabular(spec: ReportSpec): TabularWorkbook {
  const used = new Set<string>();
  used.add(SOURCES_SHEET_NAME.toLowerCase());

  const raw = tablesOf(spec).filter((t) => t.columns.length > 0);
  const sheets: TabularSheet[] = raw.map((table, i) => {
    const group = licenseGroupOf(table, spec.meta);
    const prefix = group === 'shareAlike' ? 'SA' : 'TC';
    const index = String(i + 1).padStart(2, '0');
    return {
      name: sanitizeSheetName(`${prefix}_${index}_${table.id}`, used),
      title: table.title,
      table,
      group,
    };
  });

  // ShareAlike primero: el orden refuerza la separación al abrir el archivo.
  sheets.sort((a, b) => (a.group === b.group ? 0 : a.group === 'shareAlike' ? -1 : 1));

  return {
    sheets,
    sources: buildSourcesTable(spec.meta, spec.verification),
    sourcesText: buildSourcesText(spec, spec.verification),
    filenameBase: defaultFilenameBase(spec),
  };
}
