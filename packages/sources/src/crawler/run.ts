/**
 * Orquestador de la corrida de Fase 0.
 *
 * Une los crawlers (ArcGIS, Socrata), los descriptores manuales y el descriptor
 * de OSM, escribe el catálogo incrementalmente y genera los informes.
 *
 * Incremental a propósito: cada servicio se escribe en cuanto se inspecciona, de
 * modo que una corrida interrumpida contra un servidor lento (el del IGAC devuelve
 * 504 con frecuencia) no pierda el trabajo hecho, y `--resume` la continúe.
 */

import { HttpClient } from '../connectors/http.js';
import { describeColombiaExtract } from '../connectors/osm.js';
import { detectGdal } from '../connectors/gdal.js';
import { crawlArcgisSource, serviceFileName } from './arcgis-crawler.js';
import { crawlSocrataSource, socrataFileName } from './socrata-crawler.js';
import {
  loadCatalog,
  makePaths,
  serviceAlreadyCatalogued,
  writeAuxJson,
  writeManualJson,
  writeOsmJson,
  writeReports,
  writeServiceJson,
  writeSocrataJson,
  writeSummaryJson,
  type CatalogPaths,
  type SelectionDataset,
} from './catalog-writer.js';
import { PiiLog } from './pii-filter.js';
import {
  ARCGIS_SOURCES,
  MANUAL_SOURCES,
  SOCRATA_SOURCES,
  type ManualSourceSpec,
} from './sources.js';
import { CATALOG_SCHEMA_VERSION, type CatalogManualDescriptor, type CatalogRisk, type CrawlRunSummary } from './types.js';

export interface CrawlRunOptions {
  /** Claves de fuente a recorrer. */
  sourceKeys: readonly string[];
  /** Profundidad máxima del recorrido de carpetas ArcGIS. */
  maxDepth?: number;
  /** Tamaño de la muestra por capa. 0 = sin muestras. */
  sampleSize?: number;
  /**
   * Pedir `returnCountOnly` y `returnExtentOnly` por capa. Desactivarlos deja una
   * pasada "solo esquema": una petición por capa en vez de tres o cuatro. Es la
   * forma de recorrer un servidor lento sin renunciar a los nombres de campo, que
   * es lo que de verdad necesita la declaración de datasets (regla 2).
   */
  fetchCounts?: boolean;
  fetchExtents?: boolean;
  concurrency?: number;
  /** Saltar lo ya catalogado. */
  resume?: boolean;
  /** No usar la caché HTTP en disco. */
  noCache?: boolean;
  /** Límite de capas por servicio. */
  maxLayersPerService?: number;
  /** Muestreo del catálogo ArcGIS: ver `ArcgisCrawlOptions`. */
  maxServicesPerFamily?: number;
  maxServicesPerFolder?: number;
  maxServices?: number;
  /** Raíz del monorepo; por defecto se deduce del propio archivo. */
  root?: string;
  onProgress?: (msg: string) => void;
}

export async function runCrawl(opts: CrawlRunOptions): Promise<CrawlRunSummary> {
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const progress = opts.onProgress ?? ((m: string) => process.stdout.write(`${m}\n`));
  const paths = makePaths(opts.root);
  const piiLog = new PiiLog();
  const risks: CatalogRisk[] = [];
  const notes: string[] = [];

  const http = new HttpClient({
    concurrency: opts.concurrency ?? 2,
    timeoutMs: 120_000,
    maxRetries: 4,
    noCache: opts.noCache ?? false,
    cacheDir: `${paths.root}/.cache/http`,
  });

  const counts = {
    servicesDiscovered: 0,
    servicesInspected: 0,
    servicesFailed: 0,
    layersCatalogued: 0,
    layersWithSample: 0,
    socrataDatasets: 0,
    manualDescriptors: 0,
    piiColumnsDropped: 0,
    piiValuesRedacted: 0,
  };

  // ─ GDAL ─
  const gdal = await detectGdal();
  progress(
    gdal.available
      ? `GDAL detectado: ${gdal.version} en ${gdal.path} (vía ${gdal.discoveredVia}).`
      : 'GDAL NO disponible: la carga masiva a PostGIS queda pendiente.',
  );
  for (const note of gdal.notes) notes.push(`GDAL: ${note}`);
  if (!gdal.available) {
    risks.push({
      id: 'gdal-missing',
      severity: 'alta',
      source: 'general',
      target: 'etl',
      title: 'ogr2ogr no está disponible en el entorno',
      detail: gdal.notes.join(' '),
      mitigation: 'Instalar GDAL y fijar `GDAL_OGR2OGR` en `.env` antes de la Fase 2.',
      modules: ['M2'],
    });
  } else if (gdal.drivers && !gdal.drivers.postgresql) {
    risks.push({
      id: 'gdal-no-pg-driver',
      severity: 'alta',
      source: 'general',
      target: gdal.path ?? 'ogr2ogr',
      title: 'El ogr2ogr disponible no trae el driver PostgreSQL',
      detail:
        'Sin el driver PostgreSQL, `ogr2ogr -f PostgreSQL` no puede escribir directo a PostGIS y la carga catastral necesita un paso intermedio.',
      mitigation:
        'Usar el bundle de OSGeo4W/QGIS, o cargar a GeoPackage y de ahí a PostGIS con `ogr2ogr` + `psql`.',
      modules: ['M2'],
    });
  }

  // ─ ArcGIS ─
  for (const spec of ARCGIS_SOURCES) {
    if (!opts.sourceKeys.includes(spec.key)) continue;
    const effective = opts.maxDepth === undefined ? spec : { ...spec, maxDepth: opts.maxDepth };
    const result = await crawlArcgisSource(http, effective, {
      sampleSize: opts.sampleSize ?? 5,
      fetchCounts: opts.fetchCounts ?? true,
      fetchExtents: opts.fetchExtents ?? true,
      ...(opts.maxLayersPerService !== undefined
        ? { maxLayersPerService: opts.maxLayersPerService }
        : {}),
      ...(opts.maxServicesPerFamily !== undefined
        ? { maxServicesPerFamily: opts.maxServicesPerFamily }
        : {}),
      ...(opts.maxServicesPerFolder !== undefined
        ? { maxServicesPerFolder: opts.maxServicesPerFolder }
        : {}),
      ...(opts.maxServices !== undefined ? { maxServices: opts.maxServices } : {}),
      log: piiLog,
      risks,
      onProgress: progress,
      onService: async (service) => {
        await writeServiceJson(
          paths,
          service,
          serviceFileName({
            folder: service.folder,
            name: service.name,
            type: service.serviceType,
          }),
        );
      },
      shouldSkip: opts.resume
        ? (ref) =>
            serviceAlreadyCatalogued(
              paths,
              spec.source,
              serviceFileName({ folder: ref.folder, name: ref.name, type: ref.type }),
            )
        : undefined,
    });
    counts.servicesDiscovered += result.discovered;
    counts.servicesInspected += result.services.filter((s) => s.error === null).length;
    counts.servicesFailed += result.failed;
    counts.layersCatalogued += result.layersCatalogued;
    counts.layersWithSample += result.layersWithSample;
    notes.push(...result.notes.map((n) => `${spec.key}: ${n}`));
    progress(
      `[${spec.key}] Terminado: ${result.services.length} servicios inspeccionados, ${result.failed} fallidos, ${result.layersCatalogued} capas.`,
    );
  }

  // ─ Socrata ─
  for (const spec of SOCRATA_SOURCES) {
    if (!opts.sourceKeys.includes(spec.key)) continue;
    const result = await crawlSocrataSource(http, spec, {
      sampleSize: opts.sampleSize ?? 5,
      fetchCounts: opts.fetchCounts ?? true,
      log: piiLog,
      risks,
      onProgress: progress,
    });
    for (const dataset of result.datasets) {
      await writeSocrataJson(paths, dataset, socrataFileName(dataset.id));
    }
    counts.socrataDatasets += result.datasets.length;
    notes.push(...result.notes.map((n) => `${spec.key}: ${n}`));
    progress(
      `[${spec.key}] Terminado: ${result.datasets.length} datasets catalogados, ${result.inspected} inspeccionados a fondo, ${result.failed} fallidos.`,
    );
  }

  // ─ OSM ─
  if (opts.sourceKeys.includes('osm')) {
    progress('[osm] Localizando el extracto de Colombia en Geofabrik…');
    try {
      const descriptor = await describeColombiaExtract(http);
      await writeOsmJson(paths, descriptor);
      progress(
        `[osm] Extracto ${descriptor.cutDate ?? 'sin fecha'}: ${descriptor.files.length} archivos.`,
      );
      for (const n of descriptor.notes) notes.push(`osm: ${n}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      notes.push(`osm: no se pudo describir el extracto: ${reason}`);
      risks.push({
        id: 'osm-geofabrik-unreachable',
        severity: 'media',
        source: 'osm',
        target: 'https://download.geofabrik.de/south-america/colombia.html',
        title: 'No se pudo leer el índice de Geofabrik',
        detail: reason,
        mitigation: 'Reintentar; como alternativa, usar los extractos de BBBike o generar el recorte desde planet.osm.',
        modules: ['M4', 'M6'],
      });
    }
  }

  // ─ Descriptores manuales ─
  if (opts.sourceKeys.includes('manual')) {
    for (const spec of MANUAL_SOURCES) {
      progress(`[manual] Verificando ${spec.id} → ${spec.url}`);
      const descriptor = await verifyManualSource(http, spec);
      await writeManualJson(paths, descriptor);
      counts.manualDescriptors += 1;
      if (descriptor.httpStatus === null || descriptor.httpStatus >= 400) {
        risks.push({
          id: `manual-unreachable-${spec.id}`,
          severity: 'media',
          source: spec.source,
          target: spec.url,
          title: `URL de entrada no verificable: ${spec.name}`,
          detail: `La URL respondió ${descriptor.httpStatus ?? 'error de red'}.`,
          mitigation: 'Verificar a mano en el navegador y actualizar el descriptor.',
          modules: ['M1'],
        });
      }
      for (const p of spec.pending) {
        risks.push({
          id: `manual-pending-${spec.id}-${p.slice(0, 24).replace(/\W+/g, '-').toLowerCase()}`,
          severity: 'media',
          source: spec.source,
          target: spec.url,
          title: `Pendiente de verificar en ${spec.name}`,
          detail: p,
          mitigation: 'Resolver antes de declarar el dataset en `etl/config/datasets`.',
          modules: ['M1'],
        });
      }
    }
  }

  counts.piiColumnsDropped = piiLog.droppedCount;
  counts.piiValuesRedacted = piiLog.redactedCount;

  // ─ Informes ─
  await writeAuxJson(paths, risks, piiLog);
  // `loadCatalog` relee los riesgos y los descartes de PII ya fusionados con las
  // corridas anteriores, así que no se sobrescriben con los de esta sola corrida.
  const catalog = await loadCatalog(paths);
  const selection = await loadSelection(paths);
  await writeReports(paths, catalog, selection);

  const summary: CrawlRunSummary = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    sources: [...opts.sourceKeys],
    counts,
    http: { ...http.stats },
    gdal: { available: gdal.available, path: gdal.path, version: gdal.version },
    notes,
  };
  await writeSummaryJson(paths, summary);
  return summary;
}

/** Comprueba que la URL de una fuente manual responda y arma su descriptor. */
async function verifyManualSource(
  http: HttpClient,
  spec: ManualSourceSpec,
): Promise<CatalogManualDescriptor> {
  let status: number | null = null;
  const notes = [...spec.notes];
  try {
    const head = await http.head(spec.url);
    status = head.status;
    // Varios portales gubernamentales rechazan HEAD; se reintenta con GET.
    if (status >= 400) {
      const res = await http.request(spec.url, { label: `manual:${spec.id}` });
      status = res.status;
    }
  } catch (err) {
    notes.push(
      `Verificación automática fallida: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source: spec.source,
    connector: spec.connector,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    url: spec.url,
    httpStatus: status,
    format: spec.format,
    license: spec.license,
    attribution: spec.attribution,
    frequency: spec.frequency,
    pending: spec.pending,
    notes,
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Carga el registro de datasets de `etl/config` para generar `SELECCION.md`.
 * Se importa dinámicamente y con tolerancia a fallo: el crawler debe poder correr
 * antes de que existan los datasets (que se declaran con lo que el crawler halle).
 */
export async function loadSelection(paths: CatalogPaths): Promise<SelectionDataset[]> {
  try {
    const mod = (await import(`${pathToFileUrlPrefix(paths.root)}etl/config/index.js`)) as {
      DATASETS?: Record<string, unknown>;
      selectionView?: () => SelectionDataset[];
    };
    if (typeof mod.selectionView === 'function') return mod.selectionView();
    return [];
  } catch {
    return [];
  }
}

/** `C:\ruta` → `file:///C:/ruta/`, para que `import()` funcione en Windows. */
function pathToFileUrlPrefix(root: string): string {
  const normalized = root.replace(/\\/g, '/');
  const withSlash = normalized.endsWith('/') ? normalized : `${normalized}/`;
  return withSlash.startsWith('/') ? `file://${withSlash}` : `file:///${withSlash}`;
}

export { pathToFileUrlPrefix };
