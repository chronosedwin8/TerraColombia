/**
 * Escritura del catálogo de Fase 0 — punto 5 de PLAN.md §6.
 *
 * Salidas:
 *  - `data-catalog/<fuente>/<servicio>.json`  — evidencia cruda por servicio/dataset.
 *  - `data-catalog/CATALOGO.md`               — tabla legible por humano.
 *  - `data-catalog/SELECCION.md`              — propuesta de datasets del MVP + matriz módulo × dataset × campos.
 *  - `data-catalog/RIESGOS.md`                — riesgos de datos encontrados.
 *  - `data-catalog/PII_DESCARTES.md`          — log de columnas descartadas (regla 3).
 *  - `data-catalog/RESUMEN.json`              — resumen de la corrida, legible por máquina.
 *
 * Los `.md` se pueden regenerar desde los `.json` sin volver a tocar la red
 * (`pnpm catalog:report`), por eso todas las funciones de informe reciben datos
 * ya cargados de disco.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PiiLog } from './pii-filter.js';
import type {
  CatalogManualDescriptor,
  CatalogRisk,
  CatalogService,
  CatalogSocrataDataset,
  CrawlRunSummary,
  PiiDiscardRecord,
} from './types.js';
import { CATALOG_SCHEMA_VERSION } from './types.js';
import type { OsmExtractDescriptor } from '../connectors/osm.js';

// ─── Rutas ────────────────────────────────────────────────────────────────────

/**
 * Raíz del monorepo, deducida desde este archivo.
 * `packages/sources/src/crawler/catalog-writer.ts` → cuatro niveles arriba.
 * Se usa `fileURLToPath` y no `URL.pathname` porque en Windows el pathname trae
 * la unidad precedida de barra (`/C:/…`) y las rutas con espacios van escapadas.
 */
export function repoRoot(): string {
  return resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
}

export function catalogDir(root = repoRoot()): string {
  return join(root, 'data-catalog');
}

export interface CatalogPaths {
  root: string;
  catalog: string;
  sourceDir(source: string): string;
}

export function makePaths(root = repoRoot()): CatalogPaths {
  const catalog = catalogDir(root);
  return {
    root,
    catalog,
    sourceDir: (source: string) => join(catalog, source),
  };
}

// ─── Escritura de JSON ────────────────────────────────────────────────────────

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function writeServiceJson(
  paths: CatalogPaths,
  service: CatalogService,
  fileName: string,
): Promise<string> {
  const path = join(paths.sourceDir(service.source), fileName);
  await writeJson(path, service);
  return path;
}

export async function writeSocrataJson(
  paths: CatalogPaths,
  dataset: CatalogSocrataDataset,
  fileName: string,
): Promise<string> {
  const path = join(paths.sourceDir(dataset.source), fileName);
  await writeJson(path, dataset);
  return path;
}

export async function writeManualJson(
  paths: CatalogPaths,
  descriptor: CatalogManualDescriptor,
): Promise<string> {
  const path = join(paths.sourceDir(descriptor.source), `manual__${descriptor.id}.json`);
  await writeJson(path, descriptor);
  return path;
}

export async function writeOsmJson(
  paths: CatalogPaths,
  descriptor: OsmExtractDescriptor,
): Promise<string> {
  const path = join(paths.sourceDir('osm'), 'geofabrik-colombia.json');
  await writeJson(path, descriptor);
  return path;
}

export async function writeSummaryJson(
  paths: CatalogPaths,
  summary: CrawlRunSummary,
): Promise<string> {
  const path = join(paths.catalog, 'RESUMEN.json');
  await writeJson(path, summary);
  return path;
}

// ─── Lectura del catálogo ya escrito (para `report`) ──────────────────────────

export interface LoadedCatalog {
  services: CatalogService[];
  socrata: CatalogSocrataDataset[];
  manual: CatalogManualDescriptor[];
  osm: OsmExtractDescriptor | null;
  summary: CrawlRunSummary | null;
  risks: CatalogRisk[];
  piiRecords: PiiDiscardRecord[];
}

/** Lee todos los `.json` del catálogo y los clasifica por forma. */
export async function loadCatalog(paths: CatalogPaths): Promise<LoadedCatalog> {
  const out: LoadedCatalog = {
    services: [],
    socrata: [],
    manual: [],
    osm: null,
    summary: null,
    risks: [],
    piiRecords: [],
  };

  let sourceDirs: string[];
  try {
    const entries = await readdir(paths.catalog, { withFileTypes: true });
    sourceDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return out;
  }

  for (const dir of sourceDirs) {
    const full = join(paths.catalog, dir);
    const files = await readdir(full).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(join(full, file), 'utf8'));
      } catch {
        continue;
      }
      if (typeof parsed !== 'object' || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;
      if (obj.connector === 'arcgis-rest' && Array.isArray(obj.layers)) {
        out.services.push(obj as unknown as CatalogService);
      } else if (obj.connector === 'socrata') {
        out.socrata.push(obj as unknown as CatalogSocrataDataset);
      } else if (obj.source === 'OSM' && Array.isArray(obj.files)) {
        out.osm = obj as unknown as OsmExtractDescriptor;
      } else if (typeof obj.pending !== 'undefined') {
        out.manual.push(obj as unknown as CatalogManualDescriptor);
      }
    }
  }

  // Ficheros auxiliares de la raíz.
  try {
    out.summary = JSON.parse(
      await readFile(join(paths.catalog, 'RESUMEN.json'), 'utf8'),
    ) as CrawlRunSummary;
  } catch {
    out.summary = null;
  }
  try {
    out.risks = JSON.parse(await readFile(join(paths.catalog, 'riesgos.json'), 'utf8')) as CatalogRisk[];
  } catch {
    out.risks = [];
  }
  try {
    out.piiRecords = JSON.parse(
      await readFile(join(paths.catalog, 'pii-descartes.json'), 'utf8'),
    ) as PiiDiscardRecord[];
  } catch {
    out.piiRecords = [];
  }

  out.services.sort((a, b) => a.url.localeCompare(b.url));
  out.socrata.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** true si el servicio ya está catalogado (para `--resume`). */
export async function serviceAlreadyCatalogued(
  paths: CatalogPaths,
  source: string,
  fileName: string,
): Promise<boolean> {
  try {
    const raw = await readFile(join(paths.sourceDir(source), fileName), 'utf8');
    const parsed = JSON.parse(raw) as { error?: string | null };
    // Un servicio guardado con error se vuelve a intentar.
    return parsed.error === null || parsed.error === undefined;
  } catch {
    return false;
  }
}

// ─── Utilidades de Markdown ───────────────────────────────────────────────────

/** Escapa `|` y saltos de línea para que no rompan una celda de tabla. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const s = String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  return s.length === 0 ? '—' : s;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function table(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n');
  return rows.length === 0 ? `${head}\n${sep}\n| ${headers.map(() => '—').join(' | ')} |` : `${head}\n${sep}\n${body}`;
}

function header(title: string, subtitle: string): string {
  return [
    `# ${title}`,
    '',
    `> ${subtitle}`,
    `> Generado el ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC por \`pnpm catalog:report\`.`,
    `> Esquema de catálogo v${CATALOG_SCHEMA_VERSION}.`,
    '',
  ].join('\n');
}

// ─── CATALOGO.md ──────────────────────────────────────────────────────────────

export function renderCatalogMarkdown(cat: LoadedCatalog): string {
  const parts: string[] = [];
  parts.push(
    header(
      'Catálogo de fuentes — Fase 0',
      'Inventario de lo que cada fuente expone realmente. Todo lo de aquí sale de una inspección hecha por el crawler; lo no verificado va marcado.',
    ),
  );

  const okServices = cat.services.filter((s) => s.error === null);
  const failedServices = cat.services.filter((s) => s.error !== null);
  const allLayers = okServices.flatMap((s) =>
    [...s.layers, ...s.tables].map((l) => ({ service: s, layer: l })),
  );

  parts.push('## Resumen');
  parts.push('');
  parts.push(
    table(
      ['Concepto', 'Valor'],
      [
        ['Servicios ArcGIS inspeccionados', okServices.length],
        ['Servicios ArcGIS fallidos', failedServices.length],
        ['Capas y tablas catalogadas', allLayers.length],
        ['Capas con muestra de registros', allLayers.filter((x) => x.layer.sampleReturned > 0).length],
        ['Datasets de datos.gov.co catalogados', cat.socrata.length],
        ['Datasets de datos.gov.co con columnas inspeccionadas', cat.socrata.filter((d) => d.columns.length > 0).length],
        ['Descriptores manuales', cat.manual.length],
        ['Extracto OSM', cat.osm ? `${cat.osm.files.length} archivos, corte ${cat.osm.cutDate ?? 'desconocido'}` : 'no inspeccionado'],
      ],
    ),
  );
  parts.push('');

  // ─ ArcGIS: servicios ─
  parts.push('## IGAC — ArcGIS REST');
  parts.push('');
  parts.push(
    'Raíz: `https://mapas.igac.gov.co/server/rest/services`. Un servicio por fila; las capas se detallan más abajo.',
  );
  parts.push('');
  parts.push(
    table(
      ['Carpeta', 'Servicio', 'Tipo', 'Capas', 'Tablas', 'CRS', 'maxRecordCount', 'Capacidades', 'Extensiones'],
      okServices.map((s) => [
        s.folder || '(raíz)',
        `[${s.name}](${s.url})`,
        s.serviceType,
        s.layers.length,
        s.tables.length,
        s.spatialReferenceWkid ?? '—',
        s.maxRecordCount ?? '—',
        s.capabilities.join(', '),
        s.supportedExtensions.join(', ') || '—',
      ]),
    ),
  );
  parts.push('');

  if (failedServices.length > 0) {
    parts.push('### Servicios que no respondieron');
    parts.push('');
    parts.push(
      table(
        ['Carpeta', 'Servicio', 'Error'],
        failedServices.map((s) => [s.folder || '(raíz)', s.name, truncate(s.error ?? '', 160)]),
      ),
    );
    parts.push('');
  }

  // ─ ArcGIS: capas ─
  parts.push('### Capas y tablas');
  parts.push('');
  parts.push(
    table(
      [
        'Servicio',
        'Id',
        'Capa',
        'Geometría',
        'CRS',
        'Campos',
        'Registros',
        'maxRecordCount',
        'Paginación',
        'Formatos',
        'Muestra',
      ],
      allLayers.map(({ service, layer }) => [
        `${service.folder || '(raíz)'}/${service.name}`,
        layer.id,
        `[${layer.name}](${layer.url})`,
        (layer.geometryType ?? 'tabla').replace('esriGeometry', ''),
        layer.latestWkid ?? layer.wkid ?? '—',
        layer.fields.length,
        layer.count ?? '—',
        layer.maxRecordCount ?? '—',
        layer.supportsPagination === null ? '—' : layer.supportsPagination ? 'sí' : 'NO',
        layer.supportedQueryFormats.join(', ') || '—',
        layer.sampleReturned > 0 ? `${layer.sampleReturned} filas` : '—',
      ]),
    ),
  );
  parts.push('');

  // ─ Campos por capa, solo las que tienen muestra o campos ─
  parts.push('### Campos por capa');
  parts.push('');
  for (const { service, layer } of allLayers) {
    if (layer.fields.length === 0) continue;
    parts.push(`#### \`${service.folder || '(raíz)'}/${service.name}\` → ${layer.name} (id ${layer.id})`);
    parts.push('');
    if (layer.description) parts.push(`${layer.description}`, '');
    parts.push(
      table(
        ['Campo', 'Alias', 'Tipo', 'Long.', 'Dominio', 'PII'],
        layer.fields.map((f) => [
          `\`${f.name}\``,
          f.alias === f.name ? '—' : f.alias,
          f.type.replace('esriFieldType', ''),
          f.length ?? '—',
          f.domain === null
            ? '—'
            : `${f.domain.type}${f.domain.codedValues.length > 0 ? `: ${truncate(f.domain.codedValues.map((c) => `${c.code}=${c.name}`).join('; '), 120)}` : ''}`,
          f.pii ? `**descartado** (${f.piiRuleId})` : '—',
        ]),
      ),
    );
    if (layer.notes.length > 0) {
      parts.push('');
      for (const n of layer.notes) parts.push(`- ${n}`);
    }
    if (layer.sample.length > 0) {
      parts.push('');
      parts.push('<details><summary>Muestra (sin columnas de PII)</summary>');
      parts.push('');
      parts.push('```json');
      parts.push(JSON.stringify(layer.sample, null, 2));
      parts.push('```');
      parts.push('');
      parts.push('</details>');
    }
    parts.push('');
  }

  // ─ Socrata ─
  parts.push('## datos.gov.co (Socrata)');
  parts.push('');
  const bySource = new Map<string, CatalogSocrataDataset[]>();
  for (const d of cat.socrata) {
    const list = bySource.get(d.source) ?? [];
    list.push(d);
    bySource.set(d.source, list);
  }
  for (const [source, datasets] of [...bySource.entries()].sort()) {
    parts.push(`### ${source}`);
    parts.push('');
    parts.push(
      table(
        ['Id', 'Nombre', 'Publicador', 'Actualizado', 'Filas', 'Columnas', 'Licencia'],
        datasets
          .slice()
          .sort((a, b) => (b.dataUpdatedAt ?? '').localeCompare(a.dataUpdatedAt ?? ''))
          .map((d) => [
            `[${d.id}](${d.webUri ?? `https://www.datos.gov.co/d/${d.id}`})`,
            truncate(d.name, 70),
            truncate(d.publisher ?? '—', 45),
            d.cutDate ?? '—',
            d.rowCount ?? '—',
            d.columns.length > 0 ? d.columns.length : '—',
            truncate(d.license ?? 'NO DECLARADA', 45),
          ]),
      ),
    );
    parts.push('');
    for (const d of datasets.filter((x) => x.columns.length > 0)) {
      parts.push(`<details><summary><code>${d.id}</code> — ${truncate(d.name, 80)}: columnas</summary>`);
      parts.push('');
      parts.push(
        table(
          ['Columna', 'Tipo observado', 'PII'],
          d.columns.map((c) => [`\`${c.name}\``, c.jsType, c.pii ? `**descartada**` : '—']),
        ),
      );
      parts.push('');
      parts.push('</details>');
      parts.push('');
    }
  }

  // ─ Manuales ─
  if (cat.manual.length > 0) {
    parts.push('## Fuentes sin catálogo legible por máquina');
    parts.push('');
    parts.push(
      table(
        ['Id', 'Nombre', 'URL', 'HTTP', 'Formato', 'Licencia', 'Frecuencia'],
        cat.manual.map((m) => [
          m.id,
          truncate(m.name, 60),
          `[enlace](${m.url})`,
          m.httpStatus ?? '—',
          m.format,
          truncate(m.license, 45),
          m.frequency,
        ]),
      ),
    );
    parts.push('');
    for (const m of cat.manual) {
      if (m.pending.length === 0) continue;
      parts.push(`**${m.name} — pendiente de verificar:**`);
      parts.push('');
      for (const p of m.pending) parts.push(`- ${p}`);
      parts.push('');
    }
  }

  // ─ OSM ─
  if (cat.osm) {
    parts.push('## OpenStreetMap — extracto de Colombia (Geofabrik)');
    parts.push('');
    parts.push(`Corte: **${cat.osm.cutDate ?? 'desconocido'}** · Licencia: **${cat.osm.license}**`);
    parts.push('');
    parts.push(
      table(
        ['Archivo', 'Formato', 'Tamaño', 'Última modificación', 'Reanudable', 'MD5'],
        cat.osm.files.map((f) => [
          `[${f.name}](${f.url})`,
          f.format,
          f.bytes === null ? '—' : `${(f.bytes / 1024 / 1024).toFixed(1)} MB`,
          f.lastModified?.slice(0, 10) ?? '—',
          f.acceptsRanges ? 'sí' : 'no',
          f.md5 ? `\`${f.md5.slice(0, 12)}…\`` : '—',
        ]),
      ),
    );
    parts.push('');
    parts.push('> El `.pbf` no se descarga en la Fase 0: solo se registra el descriptor.');
    parts.push('');
  }

  return `${parts.join('\n')}\n`;
}

// ─── RIESGOS.md ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export function renderRisksMarkdown(risks: readonly CatalogRisk[]): string {
  const parts: string[] = [];
  parts.push(
    header(
      'Riesgos de datos — Fase 0',
      'Lo que puede romper el producto o impedir una promesa comercial. Sale de la inspección real, no de suposiciones.',
    ),
  );

  const sorted = [...risks].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );

  for (const severity of ['alta', 'media', 'baja'] as const) {
    const group = sorted.filter((r) => r.severity === severity);
    if (group.length === 0) continue;
    parts.push(`## Severidad ${severity} (${group.length})`);
    parts.push('');
    for (const r of group) {
      parts.push(`### ${r.title}`);
      parts.push('');
      parts.push(
        table(
          ['Campo', 'Valor'],
          [
            ['Id', `\`${r.id}\``],
            ['Fuente', r.source],
            ['Afecta a', r.target || '(transversal)'],
            ['Módulos', r.modules.join(', ') || '—'],
          ],
        ),
      );
      parts.push('');
      parts.push(`**Qué pasa.** ${r.detail}`);
      parts.push('');
      parts.push(`**Qué hacemos.** ${r.mitigation}`);
      parts.push('');
    }
  }

  if (sorted.length === 0) {
    parts.push('No se registraron riesgos en esta corrida. (Eso es sospechoso: revisa que el crawler haya corrido de verdad.)');
    parts.push('');
  }

  return `${parts.join('\n')}\n`;
}

// ─── PII_DESCARTES.md ─────────────────────────────────────────────────────────

export function renderPiiMarkdown(records: readonly PiiDiscardRecord[]): string {
  const parts: string[] = [];
  parts.push(
    header(
      'Descartes de datos personales — Fase 0',
      'Regla 3 de CLAUDE.md: toda columna con datos personales se descarta en la ingesta y queda registrada aquí. No existe ni existirá la ruta predio → persona.',
    ),
  );

  const dropped = records.filter((r) => r.action === 'dropped');
  const redacted = records.filter((r) => r.action === 'redacted');

  parts.push('## Resumen');
  parts.push('');
  parts.push(
    table(
      ['Concepto', 'Valor'],
      [
        ['Columnas descartadas por nombre', dropped.length],
        ['Valores redactados por heurística de contenido', redacted.length],
        ['Columnas distintas afectadas', new Set(records.map((r) => r.column.toLowerCase())).size],
        ['Capas/datasets afectados', new Set(records.map((r) => `${r.container}|${r.layer}`)).size],
      ],
    ),
  );
  parts.push('');

  if (records.length === 0) {
    parts.push(
      'Ninguna de las capas inspeccionadas en esta corrida expone columnas de la lista negra. Eso **no** significa que las fuentes no tengan PII: la base catastral descargable (Registros 1 y 2) todavía no se ha inspeccionado, y el filtro se aplicará igualmente en la Fase 2.',
    );
    parts.push('');
    return `${parts.join('\n')}\n`;
  }

  parts.push('## Columnas descartadas por nombre');
  parts.push('');
  const byColumn = new Map<string, PiiDiscardRecord[]>();
  for (const r of dropped) {
    const key = `${r.column}|${r.ruleId}`;
    const list = byColumn.get(key) ?? [];
    list.push(r);
    byColumn.set(key, list);
  }
  parts.push(
    table(
      ['Columna', 'Regla', 'Motivo', 'Apariciones', 'Dónde'],
      [...byColumn.values()]
        .sort((a, b) => b.length - a.length)
        .map((group) => {
          const first = group[0]!;
          return [
            `\`${first.column}\``,
            first.ruleId,
            first.reason,
            group.length,
            truncate(
              [...new Set(group.map((g) => `${g.container}→${g.layer}`))].join('; '),
              140,
            ),
          ];
        }),
    ),
  );
  parts.push('');

  if (redacted.length > 0) {
    parts.push('## Valores redactados por contenido');
    parts.push('');
    parts.push(
      'Columnas cuyo nombre no está en la lista negra pero cuyo contenido coincidió con un patrón de dato personal. El valor de la muestra se sustituyó por `[REDACTADO:<patrón>]`; la columna queda bajo revisión antes de ingerirse.',
    );
    parts.push('');
    parts.push(
      table(
        ['Columna', 'Patrón', 'Motivo', 'Fuente', 'Contenedor', 'Capa'],
        redacted.map((r) => [
          `\`${r.column}\``,
          r.ruleId,
          r.reason,
          r.source,
          truncate(r.container, 60),
          r.layer,
        ]),
      ),
    );
    parts.push('');
  }

  return `${parts.join('\n')}\n`;
}

// ─── SELECCION.md ─────────────────────────────────────────────────────────────

/**
 * Forma mínima que la selección necesita de `etl/config`. Se declara aquí para
 * que este módulo no dependa en tiempo de compilación del registro de datasets.
 */
export interface SelectionDataset {
  id: string;
  source: string;
  name: string;
  url: string;
  connector: string;
  format: string;
  crs: number | null;
  frequency: string;
  license: string;
  attribution: string;
  targetTable: string;
  modules: readonly string[];
  justification: string;
  inspection: string;
  priority: number;
  phase: number;
  notes: readonly string[];
  sourceFields: readonly string[];
  evidence: { inspectedFrom: string | null; catalogFile: string | null; inspectedAt: string | null };
}

const MODULE_LABELS: Record<string, string> = {
  M1: 'M1 Explorador',
  M2: 'M2 Ficha de predio',
  M3: 'M3 Buscador avanzado',
  M4: 'M4 Analizador de zona',
  M5: 'M5 Aptitud de terreno',
  M6: 'M6 Localización de negocio',
  M7: 'M7 Due diligence',
  M8: 'M8 Cambio territorial',
  M9: 'M9 Observatorio',
  M10: 'M10 GeoAPI',
  M11: 'M11 Asistente',
  M12: 'M12 Cuenta y negocio',
};

export function renderSelectionMarkdown(datasets: readonly SelectionDataset[]): string {
  const parts: string[] = [];
  parts.push(
    header(
      'Selección de datasets para el MVP — Fase 0',
      'Propuesta de los datasets que entran al MVP (Fases 0–6), con justificación y matriz módulo × dataset × campos. Requiere aprobación antes de pasar a la Fase 1.',
    ),
  );

  if (datasets.length === 0) {
    parts.push(
      '> `etl/config/datasets` está vacío: no hay selección que mostrar. Ejecuta `pnpm catalog:crawl` y declara los datasets.',
    );
    parts.push('');
    return `${parts.join('\n')}\n`;
  }

  const inspected = datasets.filter((d) => d.inspection === 'inspeccionado');
  const notInspected = datasets.filter((d) => d.inspection !== 'inspeccionado');
  // PLAN.md §6.5 pide proponer entre 15 y 25 datasets para el MVP. El MVP son las
  // fases 0–6 (§14), así que el corte es prioridad 1–2; el resto queda declarado
  // para fases posteriores sin inflar el compromiso del MVP.
  const mvp = datasets.filter((d) => d.priority <= 2);
  const later = datasets.filter((d) => d.priority > 2);

  parts.push('## Resumen');
  parts.push('');
  parts.push(
    table(
      ['Concepto', 'Valor'],
      [
        ['**Datasets del MVP (prioridad 1–2)**', `**${mvp.length}**`],
        ['Declarados para fases posteriores (prioridad 3)', later.length],
        ['Total declarado', datasets.length],
        ['Con campos inspeccionados (mapeo real)', inspected.length],
        ['Sin inspeccionar (`fieldMapping: NO_INSPECCIONADO`)', notInspected.length],
        ['Prioridad 1 (imprescindibles)', datasets.filter((d) => d.priority === 1).length],
        ['Fuentes distintas', new Set(datasets.map((d) => d.source)).size],
      ],
    ),
  );
  parts.push('');
  parts.push(
    `> **La propuesta del MVP son los ${mvp.length} datasets de prioridad 1 y 2** (PLAN.md §6.5 pide entre 15 y 25). Los ${later.length} de prioridad 3 quedan declarados, con su evidencia, para las fases posteriores: están aquí para no perder el trabajo de descubrimiento, no como compromiso del MVP.`,
  );
  parts.push('');
  parts.push(
    '> Regla 2 de CLAUDE.md: los datasets marcados `NO_INSPECCIONADO` **no tienen mapeo de campos declarado**. Sus campos se definirán cuando se inspeccione el archivo real; hasta entonces ninguna consulta del producto puede depender de ellos.',
  );
  parts.push('');

  // ─ Tabla principal ─
  parts.push('## Datasets propuestos');
  parts.push('');
  parts.push(
    table(
      ['#', 'Id', 'Fuente', 'Nombre', 'Conector', 'Formato', 'CRS', 'Frecuencia', 'Tabla destino', 'Módulos', 'Fase', 'Prio', 'Inspección'],
      datasets
        .slice()
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
        .map((d, i) => [
          i + 1,
          `\`${d.id}\``,
          d.source,
          truncate(d.name, 55),
          d.connector,
          d.format,
          d.crs ?? '—',
          d.frequency,
          `\`${d.targetTable}\``,
          d.modules.join(' '),
          d.phase,
          d.priority,
          d.inspection === 'inspeccionado' ? '✔ campos reales' : d.inspection === 'url-verificada' ? '~ URL verificada' : '✗ sin inspeccionar',
        ]),
    ),
  );
  parts.push('');

  // ─ Justificación ─
  parts.push('## Justificación por dataset');
  parts.push('');
  for (const d of [...datasets].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    parts.push(`### \`${d.id}\` — ${d.name}`);
    parts.push('');
    parts.push(d.justification);
    parts.push('');
    parts.push(
      table(
        ['Campo', 'Valor'],
        [
          ['URL', `<${d.url}>`],
          ['Licencia', d.license],
          ['Atribución', d.attribution],
          ['Tabla destino', `\`${d.targetTable}\``],
          ['Evidencia', d.evidence.catalogFile ? `\`${d.evidence.catalogFile}\`` : 'sin evidencia en el catálogo'],
          ['Inspeccionado desde', d.evidence.inspectedFrom ?? '—'],
          ['Campos de origen declarados', d.sourceFields.length > 0 ? d.sourceFields.map((f) => `\`${f}\``).join(', ') : '**NO_INSPECCIONADO**'],
        ],
      ),
    );
    if (d.notes.length > 0) {
      parts.push('');
      for (const n of d.notes) parts.push(`- ${n}`);
    }
    parts.push('');
  }

  // ─ Matriz módulo × dataset × campos ─
  parts.push('## Matriz módulo × dataset × campos');
  parts.push('');
  parts.push(
    'Qué campos concretos necesita cada módulo de cada dataset. Los campos son los nombres reales devueltos por la fuente; `NO_INSPECCIONADO` marca lo que falta verificar.',
  );
  parts.push('');
  for (const moduleId of Object.keys(MODULE_LABELS)) {
    const used = datasets.filter((d) => d.modules.includes(moduleId));
    if (used.length === 0) continue;
    parts.push(`### ${MODULE_LABELS[moduleId]}`);
    parts.push('');
    parts.push(
      table(
        ['Dataset', 'Tabla destino', 'Campos de origen'],
        used.map((d) => [
          `\`${d.id}\``,
          `\`${d.targetTable}\``,
          d.sourceFields.length > 0
            ? truncate(d.sourceFields.map((f) => `\`${f}\``).join(', '), 300)
            : '**NO_INSPECCIONADO**',
        ]),
      ),
    );
    parts.push('');
  }

  // ─ Matriz compacta ─
  parts.push('### Cobertura compacta');
  parts.push('');
  const moduleIds = Object.keys(MODULE_LABELS);
  parts.push(
    table(
      ['Dataset', ...moduleIds],
      datasets
        .slice()
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
        .map((d) => [`\`${d.id}\``, ...moduleIds.map((m) => (d.modules.includes(m) ? '●' : ''))]),
    ),
  );
  parts.push('');

  return `${parts.join('\n')}\n`;
}

// ─── Escritura de informes ────────────────────────────────────────────────────

export async function writeReports(
  paths: CatalogPaths,
  cat: LoadedCatalog,
  selection: readonly SelectionDataset[],
): Promise<string[]> {
  await mkdir(paths.catalog, { recursive: true });
  const written: string[] = [];

  const files: [string, string][] = [
    ['CATALOGO.md', renderCatalogMarkdown(cat)],
    ['SELECCION.md', renderSelectionMarkdown(selection)],
    ['RIESGOS.md', renderRisksMarkdown(cat.risks)],
    ['PII_DESCARTES.md', renderPiiMarkdown(cat.piiRecords)],
  ];
  for (const [name, content] of files) {
    const path = join(paths.catalog, name);
    await writeFile(path, content, 'utf8');
    written.push(path);
  }
  return written;
}

/**
 * Vuelca los riesgos y el log de PII en JSON, para que `report` pueda releerlos.
 *
 * Fusiona con lo que ya hubiera en disco: una corrida parcial (`--source men-socrata`)
 * no debe borrar los riesgos que encontró otra corrida sobre el IGAC. Los riesgos
 * se deduplican por `id` (la corrida nueva gana) y los descartes de PII por la
 * combinación fuente+contenedor+capa+columna+acción.
 */
export async function writeAuxJson(
  paths: CatalogPaths,
  risks: readonly CatalogRisk[],
  piiLog: PiiLog,
): Promise<void> {
  const previousRisks = await readJsonArray<CatalogRisk>(join(paths.catalog, 'riesgos.json'));
  const mergedRisks = new Map<string, CatalogRisk>();
  for (const r of previousRisks) mergedRisks.set(r.id, r);
  for (const r of risks) mergedRisks.set(r.id, r);

  const previousPii = await readJsonArray<PiiDiscardRecord>(
    join(paths.catalog, 'pii-descartes.json'),
  );
  const mergedPii = new Map<string, PiiDiscardRecord>();
  const keyOf = (r: PiiDiscardRecord): string =>
    `${r.source}|${r.container}|${r.layer}|${r.column}|${r.action}`;
  for (const r of previousPii) mergedPii.set(keyOf(r), r);
  for (const r of piiLog.all) mergedPii.set(keyOf(r), r);

  await writeJson(join(paths.catalog, 'riesgos.json'), [...mergedRisks.values()]);
  await writeJson(join(paths.catalog, 'pii-descartes.json'), [...mergedPii.values()]);
}

async function readJsonArray<T>(path: string): Promise<T[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
