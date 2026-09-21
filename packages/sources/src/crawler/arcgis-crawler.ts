/**
 * Crawler de ArcGIS REST — puntos 1 a 3 de PLAN.md §6.
 *
 *  1. Recorre recursivamente `…/rest/services?f=json`: carpetas → servicios → capas/tablas.
 *  2. Por capa guarda: nombre, id, tipo de geometría, campos (nombre, alias, tipo,
 *     longitud, dominio), CRS, `maxRecordCount`, capacidades, formatos soportados,
 *     `count` si el servicio lo permite, extensión y una muestra de 5 registros
 *     filtrando toda columna de la lista negra de PII.
 *  3. Respeta al servidor: la concurrencia, el backoff y la caché los impone
 *     `HttpClient`; aquí se añade tolerancia a fallos (un servicio caído no
 *     detiene la corrida, se anota y se sigue).
 */

import {
  crawlCatalog,
  effectivePageSize,
  getCount,
  getExtent,
  getLayerInfo,
  getServiceInfo,
  iterateFeatures,
  layerSrid,
  objectIdFieldOf,
  parseCapabilities,
  parseQueryFormats,
  QUERYABLE_SERVICE_TYPES,
  supportsQuery,
  type ArcgisExtent,
  type ArcgisField,
  type ArcgisLayerInfo,
  type ArcgisLayerRef,
  type ArcgisServiceInfo,
  type ArcgisServiceRef,
} from '../connectors/arcgis-rest.js';
import type { HttpClient } from '../connectors/http.js';
import { classifyFields, PiiLog, sanitizeSample } from './pii-filter.js';
import type {
  CatalogExtent,
  CatalogField,
  CatalogLayer,
  CatalogRisk,
  CatalogService,
  SourceId,
} from './types.js';
import { CATALOG_SCHEMA_VERSION } from './types.js';
import type { ArcgisSourceSpec } from './sources.js';

// ─── CRS ──────────────────────────────────────────────────────────────────────

/**
 * Descripción legible del CRS. Se duplica a propósito la tabla mínima en vez de
 * importar `@terracolombia/geo`, para que el crawler no arrastre `@turf/turf`
 * ni `h3-js` y pueda correr con `npx tsx` sin instalar el workspace.
 */
const SRID_LABELS: Record<number, string> = {
  4326: 'WGS 84',
  4686: 'MAGNA-SIRGAS (geográficas)',
  9377: 'MAGNA-SIRGAS / Origen-Nacional',
  3116: 'MAGNA-SIRGAS / Colombia Bogotá zone (origen antiguo)',
  3115: 'MAGNA-SIRGAS / Colombia West zone',
  3117: 'MAGNA-SIRGAS / Colombia East Central zone',
  3118: 'MAGNA-SIRGAS / Colombia East zone',
  3857: 'WGS 84 / Pseudo-Mercator',
  21818: 'Bogotá 1975 / Colombia Bogotá zone (datum anterior)',
  102100: 'Web Mercator (código Esri, equivale a 3857)',
};

export function describeSrid(wkid: number | null): string {
  if (wkid === null) return 'CRS no declarado por la fuente';
  return SRID_LABELS[wkid] ?? `EPSG:${wkid} (no catalogado)`;
}

function toCatalogExtent(extent: ArcgisExtent | undefined | null): CatalogExtent | null {
  if (!extent) return null;
  const sr = extent.spatialReference;
  return {
    xmin: extent.xmin,
    ymin: extent.ymin,
    xmax: extent.xmax,
    ymax: extent.ymax,
    wkid: sr?.latestWkid ?? sr?.wkid ?? null,
  };
}

function toCatalogField(field: ArcgisField, verdict: { pii: boolean; ruleId: string | null; reason: string | null }): CatalogField {
  const domain = field.domain ?? null;
  const coded = domain?.codedValues ?? [];
  return {
    name: field.name,
    alias: field.alias ?? null,
    type: field.type,
    length: field.length ?? null,
    nullable: field.nullable ?? null,
    domain:
      domain === null
        ? null
        : {
            type: domain.type,
            name: domain.name ?? null,
            codedValues: coded.slice(0, 50).map((c) => ({ code: c.code, name: c.name })),
            truncated: coded.length > 50,
            range: domain.range ?? null,
          },
    pii: verdict.pii,
    piiRuleId: verdict.ruleId,
    piiReason: verdict.reason,
    piiAdjacent: false,
  };
}

// ─── Opciones ─────────────────────────────────────────────────────────────────

/**
 * Presupuesto de red por consulta de inspección.
 *
 * Los servicios del IGAC que sirven capas nacionales (R_TERRENO, U_TERRENO) no
 * responden a `returnCountOnly` en un tiempo razonable: contar millones de
 * polígonos excede el timeout. Se les da un margen corto y un solo reintento, y
 * el conteo se declara desconocido en vez de bloquear la corrida.
 */
// `retryOnBodyError: false` porque un `{"error":{"code":400,…}}` de ArcGIS en un
// conteo significa "no lo soporto", no "vuelve a intentarlo": reintentar solo
// castiga al servidor sin cambiar el resultado.
const COUNT_REQUEST = { timeoutMs: 25_000, maxRetries: 0, retryOnBodyError: false } as const;
const EXTENT_REQUEST = { timeoutMs: 25_000, maxRetries: 0, retryOnBodyError: false } as const;
const SAMPLE_REQUEST = { timeoutMs: 40_000, maxRetries: 1 } as const;

export interface ArcgisCrawlOptions {
  /** Tamaño de la muestra por capa. 0 desactiva las muestras. */
  sampleSize?: number;
  /** Pedir `returnCountOnly`. Puede ser costoso en capas nacionales. */
  fetchCounts?: boolean;
  /** Pedir `returnExtentOnly` cuando la capa no declara extensión. */
  fetchExtents?: boolean;
  /** Límite de capas por servicio. `undefined` = todas. */
  maxLayersPerService?: number;
  /**
   * Muestreo del catálogo. El servidor del IGAC publica ~1 400 servicios, la
   * mayoría estudios de un solo municipio repetidos con el mismo esquema
   * (`cartoXXXXX`, `coberturasyusodelastierras<municipio>`…). Catalogarlos todos
   * costaría días y no aportaría un campo nuevo, así que la Fase 0 toma una
   * muestra representativa: unos pocos por familia de nombre y un tope por
   * carpeta. Lo omitido queda anotado y se puede ampliar con banderas del CLI.
   */
  maxServicesPerFamily?: number;
  maxServicesPerFolder?: number;
  maxServices?: number;
  /** Se llama con cada servicio ya inspeccionado (para escribir incrementalmente). */
  onService?: (service: CatalogService) => Promise<void> | void;
  /** Devuelve true si el servicio ya está catalogado y debe saltarse (`--resume`). */
  shouldSkip?: (ref: ArcgisServiceRef) => Promise<boolean> | boolean;
  /** Progreso legible. */
  onProgress?: (msg: string) => void;
  log: PiiLog;
  risks: CatalogRisk[];
}

export interface ArcgisCrawlResult {
  services: CatalogService[];
  discovered: number;
  skipped: number;
  failed: number;
  layersCatalogued: number;
  layersWithSample: number;
  folders: string[];
  serverVersion: number | null;
  notes: string[];
}

// ─── Muestreo del catálogo ────────────────────────────────────────────────────

/**
 * Familia de un servicio: el nombre hasta el primer dígito, en minúsculas.
 * `carto25307`, `carto25308` → `carto`; `coberturasyusodelastierrasnemocon`
 * queda como está (no lleva dígitos) y forma su propia familia.
 */
export function serviceFamily(name: string): string {
  const lower = name.toLowerCase();
  const cut = lower.replace(/[0-9].*$/, '');
  return cut.length >= 4 ? cut : lower;
}

export interface ServiceSelection {
  selected: ArcgisServiceRef[];
  skipped: ArcgisServiceRef[];
  notes: string[];
}

/**
 * Elige una muestra representativa de servicios: todos los prioritarios, más
 * hasta `perFamily` de cada familia de nombre y hasta `perFolder` por carpeta,
 * con un tope global. Devuelve también lo descartado para poder documentarlo.
 */
export function selectServices(
  services: readonly ArcgisServiceRef[],
  prioritized: ReadonlySet<string>,
  limits: { perFamily: number; perFolder: number; total: number },
): ServiceSelection {
  const selected: ArcgisServiceRef[] = [];
  const skipped: ArcgisServiceRef[] = [];
  const notes: string[] = [];
  const perFamilyCount = new Map<string, number>();
  const perFolderCount = new Map<string, number>();
  const droppedByFolder = new Map<string, number>();
  const familiesByFolder = new Map<string, Set<string>>();

  for (const svc of services) {
    const key = `${svc.folder ? `${svc.folder}/` : ''}${svc.name}/${svc.type}`.toLowerCase();
    const folder = svc.folder || '(raíz)';
    const family = `${folder}|${serviceFamily(svc.name)}`;
    const families = familiesByFolder.get(folder) ?? new Set<string>();
    families.add(family);
    familiesByFolder.set(folder, families);

    const isPriority = prioritized.has(key);
    const famCount = perFamilyCount.get(family) ?? 0;
    const folderCount = perFolderCount.get(folder) ?? 0;
    const fits =
      isPriority ||
      (selected.length < limits.total &&
        famCount < limits.perFamily &&
        folderCount < limits.perFolder);

    if (!fits) {
      skipped.push(svc);
      droppedByFolder.set(folder, (droppedByFolder.get(folder) ?? 0) + 1);
      continue;
    }
    selected.push(svc);
    perFamilyCount.set(family, famCount + 1);
    perFolderCount.set(folder, folderCount + 1);
  }

  for (const [folder, dropped] of [...droppedByFolder.entries()].sort()) {
    const total = dropped + (perFolderCount.get(folder) ?? 0);
    notes.push(
      `Carpeta "${folder}": se inspeccionaron ${perFolderCount.get(folder) ?? 0} de ${total} servicios ` +
        `(${familiesByFolder.get(folder)?.size ?? 0} familias de nombre). Los omitidos repiten el esquema ` +
        `de su familia; para inspeccionarlos: --max-per-folder / --max-per-family / --max-services.`,
    );
  }
  return { selected, skipped, notes };
}

// ─── Crawl ────────────────────────────────────────────────────────────────────

/** Recorre un servidor ArcGIS completo y devuelve el catálogo de sus servicios. */
export async function crawlArcgisSource(
  http: HttpClient,
  spec: ArcgisSourceSpec,
  opts: ArcgisCrawlOptions,
): Promise<ArcgisCrawlResult> {
  const progress = opts.onProgress ?? (() => undefined);
  const notes: string[] = [];

  progress(`[${spec.key}] Recorriendo el catálogo de ${spec.root}…`);
  const catalog = await crawlCatalog(http, spec.root, {
    maxDepth: spec.maxDepth,
    includeFolders: spec.includeFolders ?? undefined,
    excludeFolders: spec.excludeFolders,
    onFolderError: (folder, err) => {
      const reason = err instanceof Error ? err.message : String(err);
      notes.push(`No se pudo leer la carpeta "${folder || '<raíz>'}": ${reason}`);
      opts.risks.push({
        id: `arcgis-folder-${spec.key}-${folder || 'root'}`,
        severity: 'media',
        source: spec.source,
        target: `${spec.root}/${folder}`,
        title: `Carpeta inaccesible en el catálogo ArcGIS: ${folder || '<raíz>'}`,
        detail: reason,
        mitigation:
          'Reintentar en otra corrida; si persiste, catalogar los servicios de esa carpeta a mano desde el visor del IGAC.',
        modules: ['M1'],
      });
    },
  });

  // Los servicios prioritarios se ponen al frente para que, si la corrida se
  // interrumpe, lo importante ya esté catalogado.
  const prioritized = new Set(spec.prioritizedServices.map((s) => s.toLowerCase()));
  const queryable = catalog.services.filter((s) => QUERYABLE_SERVICE_TYPES.has(s.type));
  queryable.sort((a, b) => {
    const pa = prioritized.has(`${a.folder ? `${a.folder}/` : ''}${a.name}/${a.type}`.toLowerCase()) ? 0 : 1;
    const pb = prioritized.has(`${b.folder ? `${b.folder}/` : ''}${b.name}/${b.type}`.toLowerCase()) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.url.localeCompare(b.url);
  });

  const selection = selectServices(queryable, prioritized, {
    perFamily: opts.maxServicesPerFamily ?? 3,
    perFolder: opts.maxServicesPerFolder ?? 25,
    total: opts.maxServices ?? 200,
  });
  notes.push(...selection.notes);
  if (selection.skipped.length > 0) {
    opts.risks.push({
      id: `arcgis-catalog-sampled-${spec.key}`,
      severity: 'baja',
      source: spec.source,
      target: spec.root,
      title: `El catálogo ArcGIS se inspeccionó por muestreo (${selection.selected.length} de ${queryable.length} servicios)`,
      detail:
        `El servidor publica ${queryable.length} servicios consultables, en su mayoría estudios de un solo ` +
        `municipio que repiten el esquema de su familia de nombre. Se inspeccionaron ${selection.selected.length}. ` +
        `Quedaron sin inspeccionar ${selection.skipped.length}.`,
      mitigation:
        'Suficiente para decidir el MVP. Antes de prometer cobertura temática nacional, ampliar el muestreo con --max-per-folder/--max-per-family.',
      modules: ['M1', 'M5'],
    });
  }

  const skippedTypes = catalog.services.length - queryable.length;
  if (skippedTypes > 0) {
    notes.push(
      `${skippedTypes} servicios no son MapServer/FeatureServer (GPServer, ImageServer, VectorTileServer…) y no se inspeccionan por capas.`,
    );
  }
  progress(
    `[${spec.key}] ${catalog.services.length} servicios descubiertos (${queryable.length} consultables) en ${catalog.folders.length} carpetas.`,
  );

  const services: CatalogService[] = [];
  let failed = 0;
  let skipped = 0;
  let layersCatalogued = 0;
  let layersWithSample = 0;

  for (const [index, ref] of selection.selected.entries()) {
    if (opts.shouldSkip && (await opts.shouldSkip(ref))) {
      skipped += 1;
      continue;
    }
    progress(
      `[${spec.key}] (${index + 1}/${selection.selected.length}) ${ref.folder || '<raíz>'}/${ref.name}`,
    );
    const service = await crawlService(http, spec.source, ref, opts);
    services.push(service);
    if (service.error !== null) {
      failed += 1;
      opts.risks.push({
        id: `arcgis-service-${ref.folder}-${ref.name}`,
        severity: 'media',
        source: spec.source,
        target: service.url,
        title: `Servicio ArcGIS no inspeccionable: ${ref.folder || '<raíz>'}/${ref.name}`,
        detail: service.error,
        mitigation: 'Reintentar; si persiste, descartar como fuente en vivo y buscar la descarga equivalente.',
        modules: ['M1'],
      });
    }
    layersCatalogued += service.layers.length + service.tables.length;
    layersWithSample += [...service.layers, ...service.tables].filter((l) => l.sampleReturned > 0).length;
    await opts.onService?.(service);
  }

  return {
    services,
    discovered: catalog.services.length,
    skipped,
    failed,
    layersCatalogued,
    layersWithSample,
    folders: catalog.folders,
    serverVersion: catalog.currentVersion,
    notes,
  };
}

/** Inspecciona un servicio y todas sus capas y tablas. */
export async function crawlService(
  http: HttpClient,
  source: SourceId,
  ref: ArcgisServiceRef,
  opts: ArcgisCrawlOptions,
): Promise<CatalogService> {
  const started = Date.now();
  const notes: string[] = [];
  const base: CatalogService = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    source,
    connector: 'arcgis-rest',
    name: ref.name,
    folder: ref.folder,
    serviceType: ref.type,
    url: ref.url,
    description: null,
    copyrightText: null,
    currentVersion: null,
    capabilities: [],
    supportedQueryFormats: [],
    maxRecordCount: null,
    supportedExtensions: [],
    spatialReferenceWkid: null,
    fullExtent: null,
    layers: [],
    tables: [],
    inspectedAt: new Date().toISOString(),
    durationMs: 0,
    notes,
    error: null,
  };

  let info: ArcgisServiceInfo;
  try {
    info = await getServiceInfo(http, ref.url);
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    base.durationMs = Date.now() - started;
    return base;
  }

  base.description = info.serviceDescription?.trim() || info.description?.trim() || null;
  base.copyrightText = info.copyrightText?.trim() || null;
  base.currentVersion = info.currentVersion ?? null;
  base.capabilities = [...parseCapabilities(info.capabilities)];
  base.supportedQueryFormats = [...parseQueryFormats(info.supportedQueryFormats)];
  base.maxRecordCount = info.maxRecordCount ?? null;
  base.supportedExtensions = (info.supportedExtensions ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  base.spatialReferenceWkid =
    info.spatialReference?.latestWkid ?? info.spatialReference?.wkid ?? null;
  base.fullExtent = toCatalogExtent(info.fullExtent);

  if (!supportsQuery(info)) {
    notes.push(
      'El servicio no declara la capacidad `Query`: no se pueden traer registros, solo el mapa renderizado.',
    );
  }

  const layerRefs = info.layers ?? [];
  const tableRefs = info.tables ?? [];
  const limit = opts.maxLayersPerService;

  const layerSlice = limit === undefined ? layerRefs : layerRefs.slice(0, limit);
  const tableSlice = limit === undefined ? tableRefs : tableRefs.slice(0, limit);
  if (limit !== undefined && layerRefs.length > limit) {
    notes.push(`Se inspeccionaron ${limit} de ${layerRefs.length} capas (--max-layers).`);
  }

  for (const layerRef of layerSlice) {
    base.layers.push(await crawlLayer(http, source, ref, info, layerRef, opts));
  }
  for (const tableRef of tableSlice) {
    base.tables.push(await crawlLayer(http, source, ref, info, tableRef, opts));
  }

  base.durationMs = Date.now() - started;
  return base;
}

/** Inspecciona una capa o tabla: metadatos, campos, conteo, extensión y muestra. */
export async function crawlLayer(
  http: HttpClient,
  source: SourceId,
  serviceRef: ArcgisServiceRef,
  serviceInfo: ArcgisServiceInfo,
  layerRef: ArcgisLayerRef,
  opts: ArcgisCrawlOptions,
): Promise<CatalogLayer> {
  const layerUrl = `${serviceRef.url}/${layerRef.id}`;
  const notes: string[] = [];
  const container = `${serviceRef.folder ? `${serviceRef.folder}/` : ''}${serviceRef.name}/${serviceRef.type}`;

  const layer: CatalogLayer = {
    id: layerRef.id,
    name: layerRef.name,
    type: layerRef.type ?? null,
    description: null,
    geometryType: layerRef.geometryType ?? null,
    url: layerUrl,
    wkid: null,
    latestWkid: null,
    crsLabel: describeSrid(null),
    maxRecordCount: null,
    capabilities: [],
    supportedQueryFormats: [],
    supportsPagination: null,
    supportsStatistics: null,
    supportsOrderBy: null,
    objectIdField: null,
    displayField: null,
    count: null,
    extent: null,
    fields: [],
    sample: [],
    sampleRequested: opts.sampleSize ?? 5,
    sampleReturned: 0,
    piiDroppedColumns: [],
    piiRedactedColumns: [],
    notes,
    error: null,
  };

  let info: ArcgisLayerInfo;
  try {
    info = await getLayerInfo(http, serviceRef.url, layerRef.id);
  } catch (err) {
    layer.error = err instanceof Error ? err.message : String(err);
    return layer;
  }

  layer.name = info.name ?? layerRef.name;
  layer.type = info.type ?? layer.type;
  layer.description = info.description?.trim() || null;
  layer.geometryType = info.geometryType ?? layer.geometryType;
  layer.displayField = info.displayField ?? null;
  layer.objectIdField = objectIdFieldOf(info);
  layer.maxRecordCount = info.maxRecordCount ?? info.standardMaxRecordCount ?? null;
  layer.capabilities = [...parseCapabilities(info.capabilities ?? serviceInfo.capabilities)];
  layer.supportedQueryFormats = [
    ...parseQueryFormats(info.supportedQueryFormats ?? serviceInfo.supportedQueryFormats),
  ];

  const sr = info.sourceSpatialReference ?? info.extent?.spatialReference;
  layer.wkid = sr?.wkid ?? null;
  layer.latestWkid = sr?.latestWkid ?? null;
  const effectiveWkid = layerSrid(info, serviceInfo);
  layer.crsLabel = describeSrid(effectiveWkid);

  const adv = info.advancedQueryCapabilities ?? {};
  layer.supportsPagination = adv.supportsPagination ?? null;
  layer.supportsStatistics = adv.supportsStatistics ?? info.supportsStatistics ?? null;
  layer.supportsOrderBy = adv.supportsOrderBy ?? null;
  layer.extent = toCatalogExtent(info.extent);

  if (layer.supportsPagination === false) {
    notes.push(
      'La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.',
    );
  }
  if (layer.supportsStatistics === false) {
    notes.push('La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.');
  }

  // Campos + clasificación de PII.
  const rawFields = info.fields ?? [];
  layer.fields = classifyFields(
    rawFields,
    { source, container, layer: layer.name },
    opts.log,
    (field, verdict) => toCatalogField(field, verdict),
  );

  const canQuery = layer.capabilities.includes('query');
  if (!canQuery) {
    notes.push('La capa no admite `Query`: no hay conteo ni muestra.');
    return layer;
  }

  // Conteo.
  if (opts.fetchCounts !== false) {
    layer.count = await getCount(http, layerUrl, '1=1', COUNT_REQUEST);
    if (layer.count === null) {
      notes.push('El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.');
    }
  }

  // Extensión (solo si la capa no la declaró).
  if (layer.extent === null && opts.fetchExtents !== false) {
    const extent = await getExtent(http, layerUrl, '1=1', EXTENT_REQUEST);
    layer.extent = toCatalogExtent(extent);
    if (layer.extent === null) {
      notes.push('El servicio no respondió a `returnExtentOnly`.');
    }
  }

  // Muestra.
  const sampleSize = opts.sampleSize ?? 5;
  layer.sampleRequested = sampleSize;
  if (sampleSize <= 0) return layer;

  try {
    const pageSize = Math.min(sampleSize, effectivePageSize(info, sampleSize));
    const rows: Record<string, unknown>[] = [];
    for await (const batch of iterateFeatures(http, layerUrl, {
      layerInfo: info,
      pageSize,
      maxFeatures: sampleSize,
      // Sin geometría: la muestra del catálogo documenta atributos, no formas,
      // y pedir polígonos catastrales completos castiga al servidor.
      returnGeometry: false,
      // Se deja que `iterateFeatures` elija la estrategia: en las capas del IGAC
      // (sin paginación) acaba usando un rango acotado de OID, que es la consulta
      // más barata posible para el servidor y devuelve exactamente la muestra.
      requestOptions: SAMPLE_REQUEST,
      onNotice: (n) => notes.push(n),
    })) {
      for (const f of batch.features) rows.push({ ...(f.properties ?? {}) });
      if (rows.length >= sampleSize) break;
    }
    const sanitized = sanitizeSample(
      rows.slice(0, sampleSize),
      { source, container, layer: layer.name },
      opts.log,
    );
    layer.sample = sanitized.rows;
    layer.sampleReturned = sanitized.rows.length;
    layer.piiDroppedColumns = sanitized.droppedColumns;
    layer.piiRedactedColumns = sanitized.redactedColumns;
    if (sanitized.droppedColumns.length > 0) {
      notes.push(
        `Se descartaron ${sanitized.droppedColumns.length} columnas por la lista negra de PII: ${sanitized.droppedColumns.join(', ')}.`,
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    notes.push(`No se pudo traer la muestra: ${reason}`);
  }

  return layer;
}

/** Nombre de archivo seguro para `data-catalog/<fuente>/<servicio>.json`. */
export function serviceFileName(ref: { folder: string; name: string; type: string }): string {
  const parts = [ref.folder, ref.name, ref.type].filter((p) => p.length > 0);
  return `${parts.join('__').replace(/[^A-Za-z0-9_.-]+/g, '-')}.json`;
}
