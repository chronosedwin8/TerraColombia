/**
 * Crawler de portales Socrata — punto 4 de PLAN.md §6.
 *
 * Hallazgos de la Fase 0 que determinan el diseño:
 *  - `/api/views/metadata/v1` **ignora `q` y `offset`**: devuelve siempre los
 *    mismos registros sea cual sea la búsqueda y la página. No sirve para
 *    descubrir (comprobado con 34 peticiones consecutivas y con 6 consultas
 *    distintas que devolvieron el mismo conjunto).
 *  - La API de descubrimiento (`api.us.socrata.com/api/catalog/v1`) **sí**
 *    respeta `q`, `offset` y `only=dataset`, y responde en décimas de segundo.
 *  - `/api/views/metadata/v1/{id}` (un id concreto) responde bien y rápido, y es
 *    el que trae la licencia real en `customFields["Common Core"].License`.
 *
 * Por eso el flujo es: descubrir por texto → pedir metadatos id a id → inspeccionar
 * columnas y muestra de los primeros, aplicando la lista negra de PII.
 */

import {
  countResource,
  cutDateOf,
  discoverDatasets,
  fetchDatasetMetadata,
  inferColumns,
  licenseOf,
  matchesPublisher,
  publisherOf,
  type DiscoveryResult,
  type SocrataMetadata,
} from '../connectors/socrata.js';
import type { HttpClient } from '../connectors/http.js';
import { classifyPiiColumn, PiiLog, sanitizeSample } from './pii-filter.js';
import { CATALOG_SCHEMA_VERSION, type CatalogRisk, type CatalogSocrataDataset } from './types.js';
import type { SocrataSourceSpec } from './sources.js';

export interface SocrataCrawlOptions {
  /** Filas de muestra por dataset. 0 desactiva las muestras. */
  sampleSize?: number;
  /** Pedir `count(*)`. Puede ser lento en datasets de millones de filas. */
  fetchCounts?: boolean;
  onProgress?: (msg: string) => void;
  /** Devuelve true si el dataset ya está catalogado (`--resume`). */
  shouldSkip?: (id: string) => Promise<boolean> | boolean;
  log: PiiLog;
  risks: CatalogRisk[];
}

export interface SocrataCrawlResult {
  datasets: CatalogSocrataDataset[];
  /** Datasets hallados por la búsqueda, antes de filtrar por publicador. */
  discovered: number;
  inspected: number;
  failed: number;
  notes: string[];
}

/** Metadatos → ficha del catálogo, sin inspección de filas. */
function toCatalogEntry(
  spec: SocrataSourceSpec,
  meta: SocrataMetadata,
  discovery: DiscoveryResult | undefined,
): CatalogSocrataDataset {
  const cc = meta.customFields?.['Common Core'];
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: spec.source,
    connector: 'socrata',
    id: meta.id,
    name: meta.name,
    description: meta.description?.trim() || discovery?.description || null,
    publisher: publisherOf(meta) ?? discovery?.attribution ?? null,
    category: meta.category ?? discovery?.domainCategory ?? null,
    theme: cc?.Theme ?? null,
    tags: meta.tags ?? [],
    license: licenseOf(meta),
    attribution: meta.attribution ?? discovery?.attribution ?? null,
    dataUri: meta.dataUri ?? `${spec.domain}/resource/${meta.id}`,
    webUri: meta.webUri ?? discovery?.permalink ?? null,
    homepage: cc?.Homepage ?? null,
    createdAt: meta.createdAt ?? null,
    dataUpdatedAt: meta.dataUpdatedAt ?? null,
    cutDate: cutDateOf(meta),
    geographicCoverage: cc?.['Geographic Coverage'] ?? null,
    rowCount: null,
    columns: [],
    sample: [],
    piiDroppedColumns: [],
    piiRedactedColumns: [],
    notes: [],
    error: null,
    inspectedAt: new Date().toISOString(),
  };
}

/** Recorre una fuente Socrata: descubre, filtra por publicador e inspecciona. */
export async function crawlSocrataSource(
  http: HttpClient,
  spec: SocrataSourceSpec,
  opts: SocrataCrawlOptions,
): Promise<SocrataCrawlResult> {
  const progress = opts.onProgress ?? (() => undefined);
  const notes: string[] = [];
  const found = new Map<string, DiscoveryResult>();

  // ─ 1. Descubrimiento ─
  for (const q of spec.queries) {
    try {
      const results = await discoverDatasets(http, {
        q,
        domain: spec.domain,
        limit: 100,
        maxResults: spec.maxResults,
        only: 'dataset',
      });
      for (const item of results) found.set(item.id, item);
      progress(`[${spec.key}] "${q}": ${results.length} datasets (acumulado ${found.size}).`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      notes.push(`La consulta "${q}" falló: ${reason}`);
      opts.risks.push({
        id: `socrata-query-${spec.key}-${q.replace(/\W+/g, '-').toLowerCase()}`,
        severity: 'baja',
        source: spec.source,
        target: `${spec.domain} q=${q}`,
        title: `Consulta al catálogo de datos.gov.co fallida: "${q}"`,
        detail: reason,
        mitigation: 'Reintentar en otra corrida; el portal responde con latencia variable.',
        modules: ['M1'],
      });
    }
  }

  // ─ 2. Filtro por publicador ─
  const all = [...found.values()];
  const matching = all.filter((d) =>
    matchesPublisher(
      { id: d.id, name: d.name, attribution: d.attribution, description: d.description } as SocrataMetadata,
      spec.publishers,
    ),
  );
  if (matching.length === 0 && all.length > 0) {
    notes.push(
      `Ninguno de los ${all.length} datasets hallados declara como publicador ${spec.publishers.join(' / ')}: se catalogan los ${Math.min(all.length, spec.inspectTop * 2)} más relevantes de la búsqueda y se marca el publicador como no confirmado.`,
    );
  }
  // Cuando el filtro no encuentra nada se conserva la relevancia de la búsqueda,
  // que en datos.gov.co suele ser mejor que el campo `attribution` (a menudo lo
  // llena la entidad que espejó el dataset, no la que lo produjo).
  const selected = (matching.length > 0 ? matching : all).slice(0, spec.maxResults);

  progress(
    `[${spec.key}] ${all.length} datasets hallados, ${matching.length} del publicador, ${selected.length} a catalogar.`,
  );

  // ─ 3. Metadatos + inspección ─
  const datasets: CatalogSocrataDataset[] = [];
  let inspected = 0;
  let failed = 0;

  for (const [index, discovery] of selected.entries()) {
    if (opts.shouldSkip && (await opts.shouldSkip(discovery.id))) continue;

    let meta: SocrataMetadata;
    try {
      meta = await fetchDatasetMetadata(http, discovery.id, spec.domain);
    } catch (err) {
      // Sin metadatos igual se cataloga lo que dio el descubrimiento: es mejor
      // dejar constancia del dataset que perderlo.
      meta = {
        id: discovery.id,
        name: discovery.name,
        description: discovery.description,
        attribution: discovery.attribution,
        dataUpdatedAt: discovery.updatedAt ?? undefined,
        createdAt: discovery.createdAt ?? undefined,
      } as SocrataMetadata;
      notes.push(
        `No se pudieron leer los metadatos de ${discovery.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const entry = toCatalogEntry(spec, meta, discovery);
    if (matching.length === 0) {
      entry.notes.push('Publicador NO confirmado: se seleccionó por relevancia de búsqueda.');
    }
    if (entry.license === null) {
      entry.notes.push(
        'El dataset no declara licencia ni en `license` ni en Common Core: no se puede publicar dato derivado sin aclararlo.',
      );
    }
    // El catálogo de descubrimiento ya trae los nombres de columna: se aprovechan
    // aunque la muestra falle, porque son evidencia real de la estructura.
    if (discovery.columnFieldNames.length > 0) {
      entry.columns = discovery.columnFieldNames.map((fieldName, i) => {
        const verdict = classifyPiiColumn(fieldName);
        return {
          name: fieldName,
          jsType: discovery.columnNames[i] ?? 'desconocido',
          pii: verdict.pii,
          piiReason: verdict.pii ? verdict.reason : null,
        };
      });
      const piiCols = entry.columns.filter((c) => c.pii).map((c) => c.name);
      if (piiCols.length > 0) {
        entry.piiDroppedColumns = piiCols;
        for (const column of piiCols) {
          const verdict = classifyPiiColumn(column);
          opts.log.add({
            source: spec.source,
            container: `${spec.domain}/resource/${discovery.id}`,
            layer: discovery.name,
            column,
            detectedBy: 'column-name',
            ruleId: verdict.pii ? verdict.ruleId : 'unknown',
            reason: verdict.pii ? verdict.reason : '',
            action: 'dropped',
          });
        }
        opts.risks.push({
          id: `socrata-pii-${discovery.id}`,
          severity: 'alta',
          source: spec.source,
          target: entry.webUri ?? `${spec.domain}/d/${discovery.id}`,
          title: `Dataset con columnas de datos personales: ${discovery.name}`,
          detail: `Columnas descartadas por la lista negra: ${piiCols.join(', ')}.`,
          mitigation:
            'Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.',
          modules: ['M2', 'M4', 'M7'],
        });
      }
    }

    const shouldInspect = index < spec.inspectTop && (opts.sampleSize ?? 5) > 0;
    if (shouldInspect) {
      progress(`[${spec.key}] Inspeccionando ${discovery.id} — ${discovery.name.slice(0, 70)}`);
      try {
        const { rows } = await inferColumns(http, discovery.id, opts.sampleSize ?? 5, spec.domain);
        const sanitized = sanitizeSample(
          rows,
          {
            source: spec.source,
            container: `${spec.domain}/resource/${discovery.id}`,
            layer: discovery.name,
          },
          opts.log,
        );
        entry.sample = sanitized.rows;
        entry.piiDroppedColumns = [
          ...new Set([...entry.piiDroppedColumns, ...sanitized.droppedColumns]),
        ].sort();
        entry.piiRedactedColumns = sanitized.redactedColumns;
        if (opts.fetchCounts !== false) {
          entry.rowCount = await countResource(http, discovery.id, undefined, spec.domain);
          if (entry.rowCount === null) {
            entry.notes.push('`$select=count(*)` no funcionó: el número de filas queda desconocido.');
          }
        }
        inspected += 1;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        entry.error = reason;
        entry.notes.push(`No se pudo traer la muestra: ${reason}`);
        failed += 1;
      }
    } else {
      entry.notes.push(
        'Catalogado con metadatos y columnas del catálogo: la muestra de filas se limita a los primeros datasets de cada fuente (`inspectTop`).',
      );
    }

    datasets.push(entry);
  }

  return { datasets, discovered: all.length, inspected, failed, notes };
}

/** Nombre de archivo para `data-catalog/<fuente>/socrata__<id>.json`. */
export function socrataFileName(id: string): string {
  return `socrata__${id.replace(/[^A-Za-z0-9_.-]+/g, '-')}.json`;
}
