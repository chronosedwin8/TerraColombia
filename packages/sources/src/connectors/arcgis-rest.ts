/**
 * Conector ArcGIS REST (ArcGIS Server / ArcGIS Online).
 *
 * Cubre lo que el IGAC publica en `https://mapas.igac.gov.co/server/rest/services`:
 * recorrido recursivo del catálogo, metadatos de capa, conteos, extensión y
 * descarga paginada de features.
 *
 * Hallazgo de la Fase 0 que condiciona el diseño: varios servicios del IGAC
 * (entre ellos `Dato_Fundamental_Catastro/MapServer`) declaran
 * `advancedQueryCapabilities.supportsPagination: false`. En esos casos
 * `resultOffset`/`resultRecordCount` se ignoran silenciosamente y el servidor
 * devuelve siempre la primera página. Por eso el paginador implementa dos
 * estrategias y detecta cuál sirve:
 *   1. `resultOffset` + `resultRecordCount` (cuando hay paginación).
 *   2. Ventanas sobre el campo OID (`OBJECTID > n ORDER BY OBJECTID`), y si el
 *      servicio tampoco soporta `orderByFields`, ventanas por rango de OID.
 */

import { buildUrl, HttpError, type HttpClient, type HttpRequestOptions } from './http.js';
import type { GeoJsonFeature, GeoJsonGeometry } from '@terracolombia/shared';

// ─── Tipos del catálogo ───────────────────────────────────────────────────────

export interface ArcgisCatalogResponse {
  currentVersion?: number;
  folders?: string[];
  services?: { name: string; type: string }[];
}

export type ArcgisServiceType =
  | 'MapServer'
  | 'FeatureServer'
  | 'GPServer'
  | 'ImageServer'
  | 'GeocodeServer'
  | 'GeometryServer'
  | 'VectorTileServer'
  | 'SceneServer'
  | 'StreamServer'
  | (string & {});

export interface ArcgisServiceRef {
  /** Nombre tal como lo devuelve el catálogo, puede incluir la carpeta. */
  name: string;
  type: ArcgisServiceType;
  /** Carpeta contenedora (`''` para la raíz). */
  folder: string;
  /** URL absoluta del servicio, sin `?f=json`. */
  url: string;
}

export interface ArcgisSpatialReference {
  wkid?: number;
  latestWkid?: number;
  wkt?: string;
}

export interface ArcgisExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: ArcgisSpatialReference;
}

export interface ArcgisDomain {
  type: string;
  name?: string;
  codedValues?: { name: string; code: string | number }[];
  range?: [number, number];
}

export interface ArcgisField {
  name: string;
  type: string;
  alias?: string;
  length?: number;
  domain?: ArcgisDomain | null;
  nullable?: boolean;
  editable?: boolean;
}

export interface ArcgisLayerRef {
  id: number;
  name: string;
  type?: string;
  geometryType?: string;
  parentLayerId?: number;
  subLayerIds?: number[] | null;
}

export interface ArcgisServiceInfo {
  currentVersion?: number;
  serviceDescription?: string;
  description?: string;
  mapName?: string;
  copyrightText?: string;
  capabilities?: string;
  supportedQueryFormats?: string;
  maxRecordCount?: number;
  spatialReference?: ArcgisSpatialReference;
  fullExtent?: ArcgisExtent;
  initialExtent?: ArcgisExtent;
  units?: string;
  layers?: ArcgisLayerRef[];
  tables?: ArcgisLayerRef[];
  documentInfo?: Record<string, unknown>;
  supportedExtensions?: string;
  serviceItemId?: string;
  /** Presente en FeatureServer. */
  hasVersionedData?: boolean;
  supportsDatumTransformation?: boolean;
}

export interface ArcgisAdvancedQueryCapabilities {
  supportsPagination?: boolean;
  supportsStatistics?: boolean;
  supportsOrderBy?: boolean;
  supportsDistinct?: boolean;
  supportsReturningQueryExtent?: boolean;
  supportsSqlExpression?: boolean;
  supportsCountDistinct?: boolean;
}

export interface ArcgisLayerInfo {
  id: number;
  name: string;
  type?: string;
  description?: string;
  geometryType?: string;
  displayField?: string;
  objectIdField?: string;
  globalIdField?: string;
  fields?: ArcgisField[];
  extent?: ArcgisExtent;
  sourceSpatialReference?: ArcgisSpatialReference;
  capabilities?: string;
  supportedQueryFormats?: string;
  maxRecordCount?: number;
  standardMaxRecordCount?: number;
  tileMaxRecordCount?: number;
  supportsStatistics?: boolean;
  supportsAdvancedQueries?: boolean;
  advancedQueryCapabilities?: ArcgisAdvancedQueryCapabilities;
  subtypes?: unknown[];
  relationships?: unknown[];
  hasAttachments?: boolean;
  minScale?: number;
  maxScale?: number;
  copyrightText?: string;
  drawingInfo?: unknown;
  /** Solo en tablas. */
  hasGeometryProperties?: boolean;
}

export interface ArcgisEsriFeature {
  attributes?: Record<string, unknown>;
  geometry?: Record<string, unknown> | null;
}

export interface ArcgisQueryResponse {
  objectIdFieldName?: string;
  globalIdFieldName?: string;
  geometryType?: string;
  spatialReference?: ArcgisSpatialReference;
  fields?: ArcgisField[];
  features?: ArcgisEsriFeature[];
  exceededTransferLimit?: boolean;
  count?: number;
  extent?: ArcgisExtent;
  objectIds?: number[];
  error?: { code: number; message: string; details?: string[] };
}

export interface ArcgisGeoJsonResponse {
  type?: 'FeatureCollection';
  features?: GeoJsonFeature[];
  properties?: { exceededTransferLimit?: boolean };
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string; details?: string[] };
}

// ─── Utilidades de catálogo ───────────────────────────────────────────────────

/** Normaliza la URL raíz: quita `?f=json`, barra final y `/services` duplicado. */
export function normalizeRestRoot(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

/** Tipos de servicio que exponen capas consultables. */
export const QUERYABLE_SERVICE_TYPES = new Set<string>(['MapServer', 'FeatureServer']);

export interface CrawlCatalogOptions {
  /** Profundidad máxima de carpetas. 0 = solo la raíz. Por defecto 3. */
  maxDepth?: number;
  /** Si se indica, solo se recorren estas carpetas de primer nivel. */
  includeFolders?: readonly string[];
  /** Carpetas a saltar (`Utilities`, `Hosted`, `test`…). */
  excludeFolders?: readonly string[];
  /** Se llama con cada error de carpeta para registrarlo sin abortar. */
  onFolderError?: (folder: string, error: unknown) => void;
}

/**
 * Recorre recursivamente `<root>?f=json` → carpetas → servicios.
 * Devuelve la lista plana de servicios encontrados, con su carpeta y URL.
 */
export async function crawlCatalog(
  http: HttpClient,
  root: string,
  opts: CrawlCatalogOptions = {},
): Promise<{ services: ArcgisServiceRef[]; folders: string[]; currentVersion: number | null }> {
  const base = normalizeRestRoot(root);
  const maxDepth = opts.maxDepth ?? 3;
  const exclude = new Set((opts.excludeFolders ?? []).map((f) => f.toLowerCase()));
  const include = opts.includeFolders?.map((f) => f.toLowerCase());

  const services: ArcgisServiceRef[] = [];
  const foldersSeen: string[] = [];
  let currentVersion: number | null = null;

  const visit = async (folder: string, depth: number): Promise<void> => {
    const url = folder === '' ? `${base}?f=json` : `${base}/${folder}?f=json`;
    let info: ArcgisCatalogResponse;
    try {
      info = await http.getJson<ArcgisCatalogResponse>(url, { label: folder || '<root>' });
    } catch (err) {
      opts.onFolderError?.(folder, err);
      return;
    }
    if (currentVersion === null && typeof info.currentVersion === 'number') {
      currentVersion = info.currentVersion;
    }
    for (const svc of info.services ?? []) {
      // ArcGIS devuelve `name` ya prefijado con la carpeta dentro de subcarpetas.
      const shortName = svc.name.includes('/') ? svc.name.split('/').slice(-1)[0]! : svc.name;
      const path = folder === '' ? shortName : `${folder}/${shortName}`;
      services.push({
        name: shortName,
        type: svc.type,
        folder,
        url: `${base}/${path}/${svc.type}`,
      });
    }
    if (depth >= maxDepth) return;
    for (const child of info.folders ?? []) {
      const childPath = folder === '' ? child : `${folder}/${child}`;
      if (exclude.has(child.toLowerCase())) continue;
      if (depth === 0 && include && !include.includes(child.toLowerCase())) continue;
      foldersSeen.push(childPath);
      await visit(childPath, depth + 1);
    }
  };

  await visit('', 0);
  return { services, folders: foldersSeen, currentVersion };
}

/** Lee los metadatos de un servicio (`<serviceUrl>?f=json`). */
export async function getServiceInfo(
  http: HttpClient,
  serviceUrl: string,
): Promise<ArcgisServiceInfo> {
  return http.getJson<ArcgisServiceInfo>(buildUrl(serviceUrl, { f: 'json' }), {
    label: serviceUrl,
  });
}

/** Lee los metadatos de una capa o tabla (`<serviceUrl>/<id>?f=json`). */
export async function getLayerInfo(
  http: HttpClient,
  serviceUrl: string,
  layerId: number,
): Promise<ArcgisLayerInfo> {
  return http.getJson<ArcgisLayerInfo>(buildUrl(`${serviceUrl}/${layerId}`, { f: 'json' }), {
    label: `${serviceUrl}/${layerId}`,
  });
}

/** Parsea `capabilities: "Query,Map,Data"` a un conjunto en minúsculas. */
export function parseCapabilities(capabilities: string | undefined): Set<string> {
  if (!capabilities) return new Set();
  return new Set(
    capabilities
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0),
  );
}

/** Parsea `supportedQueryFormats: "JSON, geoJSON, PBF"` a minúsculas. */
export function parseQueryFormats(formats: string | undefined): Set<string> {
  if (!formats) return new Set();
  return new Set(
    formats
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter((f) => f.length > 0),
  );
}

export function supportsGeoJson(layer: ArcgisLayerInfo | ArcgisServiceInfo): boolean {
  return parseQueryFormats(layer.supportedQueryFormats).has('geojson');
}

export function supportsQuery(layer: ArcgisLayerInfo | ArcgisServiceInfo): boolean {
  return parseCapabilities(layer.capabilities).has('query');
}

/** CRS declarado por la capa: `latestWkid` manda sobre `wkid`. */
export function layerSrid(layer: ArcgisLayerInfo, service?: ArcgisServiceInfo): number | null {
  const sr = layer.sourceSpatialReference ?? layer.extent?.spatialReference;
  const fromLayer = sr?.latestWkid ?? sr?.wkid;
  if (typeof fromLayer === 'number') return fromLayer;
  const svc = service?.spatialReference;
  const fromService = svc?.latestWkid ?? svc?.wkid;
  return typeof fromService === 'number' ? fromService : null;
}

/** Campo OID de la capa: el declarado, o el primer `esriFieldTypeOID`. */
export function objectIdFieldOf(layer: ArcgisLayerInfo): string | null {
  if (layer.objectIdField) return layer.objectIdField;
  const oid = (layer.fields ?? []).find((f) => f.type === 'esriFieldTypeOID');
  return oid?.name ?? null;
}

/** Tamaño de página efectivo: nunca por encima del `maxRecordCount` del servicio. */
export function effectivePageSize(layer: ArcgisLayerInfo, requested?: number): number {
  const cap = layer.maxRecordCount ?? layer.standardMaxRecordCount ?? 1000;
  return Math.max(1, Math.min(requested ?? cap, cap));
}

// ─── Consultas ────────────────────────────────────────────────────────────────

export interface ArcgisQueryParams {
  where?: string;
  objectIds?: readonly number[];
  outFields?: string;
  returnGeometry?: boolean;
  /** BBox `xmin,ymin,xmax,ymax`. */
  geometry?: string;
  geometryType?: string;
  spatialRel?: string;
  inSR?: number;
  outSR?: number;
  resultOffset?: number;
  resultRecordCount?: number;
  orderByFields?: string;
  returnCountOnly?: boolean;
  returnExtentOnly?: boolean;
  returnIdsOnly?: boolean;
  returnDistinctValues?: boolean;
  /** Simplificación del servidor: metros por píxel. */
  maxAllowableOffset?: number;
  f?: 'json' | 'geojson' | 'pjson';
}

function queryUrl(layerUrl: string, params: ArcgisQueryParams): string {
  const flat: Record<string, string | number | boolean | undefined> = {
    where: params.where ?? '1=1',
    outFields: params.outFields ?? '*',
    returnGeometry: params.returnGeometry ?? true,
    f: params.f ?? 'json',
  };
  if (params.objectIds && params.objectIds.length > 0) flat.objectIds = params.objectIds.join(',');
  if (params.geometry !== undefined) {
    flat.geometry = params.geometry;
    flat.geometryType = params.geometryType ?? 'esriGeometryEnvelope';
    flat.spatialRel = params.spatialRel ?? 'esriSpatialRelIntersects';
  }
  if (params.inSR !== undefined) flat.inSR = params.inSR;
  if (params.outSR !== undefined) flat.outSR = params.outSR;
  if (params.resultOffset !== undefined) flat.resultOffset = params.resultOffset;
  if (params.resultRecordCount !== undefined) flat.resultRecordCount = params.resultRecordCount;
  if (params.orderByFields !== undefined) flat.orderByFields = params.orderByFields;
  if (params.returnCountOnly) flat.returnCountOnly = true;
  if (params.returnExtentOnly) flat.returnExtentOnly = true;
  if (params.returnIdsOnly) flat.returnIdsOnly = true;
  if (params.returnDistinctValues) flat.returnDistinctValues = true;
  if (params.maxAllowableOffset !== undefined) flat.maxAllowableOffset = params.maxAllowableOffset;
  return buildUrl(`${layerUrl}/query`, flat);
}

export class ArcgisServiceError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly url: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ArcgisServiceError';
  }
}

function assertNoError(res: ArcgisQueryResponse | ArcgisGeoJsonResponse, url: string): void {
  if ('error' in res && res.error) {
    throw new ArcgisServiceError(res.error.message, res.error.code, url, res.error.details ?? []);
  }
}

/**
 * Consulta cruda contra `<layer>/query`.
 * `reqOpts` permite acortar el timeout y los reintentos: en capas nacionales del
 * IGAC un `returnCountOnly` puede tardar más de dos minutos y no merece esperar.
 */
export async function query(
  http: HttpClient,
  layerUrl: string,
  params: ArcgisQueryParams = {},
  reqOpts: HttpRequestOptions = {},
): Promise<ArcgisQueryResponse> {
  const url = queryUrl(layerUrl, params);
  // `retryOnBodyError: false`: un `{"error":...}` de ArcGIS es una respuesta
  // determinista ("no soporto esto"), no un fallo transitorio. Se convierte en
  // `ArcgisServiceError` para que quien llama decida, sin reintentos inutiles.
  const res = await http.getJson<ArcgisQueryResponse>(url, {
    label: layerUrl,
    retryOnBodyError: false,
    ...reqOpts,
  });
  assertNoError(res, url);
  return res;
}

/**
 * `returnCountOnly=true`. Devuelve `null` si el servicio no lo soporta o falla,
 * porque varios servicios del IGAC tienen `supportsStatistics: false` y algunos
 * responden error 400 a esta consulta.
 */
export async function getCount(
  http: HttpClient,
  layerUrl: string,
  where = '1=1',
  reqOpts: HttpRequestOptions = {},
): Promise<number | null> {
  try {
    const res = await query(
      http,
      layerUrl,
      { where, returnCountOnly: true, returnGeometry: false },
      reqOpts,
    );
    return typeof res.count === 'number' ? res.count : null;
  } catch {
    return null;
  }
}

/** `returnExtentOnly=true`. Devuelve `null` si el servicio no lo soporta. */
export async function getExtent(
  http: HttpClient,
  layerUrl: string,
  where = '1=1',
  reqOpts: HttpRequestOptions = {},
): Promise<ArcgisExtent | null> {
  try {
    const res = await query(
      http,
      layerUrl,
      { where, returnExtentOnly: true, returnCountOnly: false, returnGeometry: false },
      reqOpts,
    );
    return res.extent ?? null;
  } catch {
    return null;
  }
}

/** Lista de OID de la capa (`returnIdsOnly=true`), o `null` si no se soporta. */
export async function getObjectIds(
  http: HttpClient,
  layerUrl: string,
  where = '1=1',
  reqOpts: HttpRequestOptions = {},
): Promise<number[] | null> {
  try {
    const res = await query(
      http,
      layerUrl,
      { where, returnIdsOnly: true, returnGeometry: false },
      reqOpts,
    );
    return Array.isArray(res.objectIds) ? res.objectIds : null;
  } catch {
    return null;
  }
}

// ─── Conversión Esri → GeoJSON ────────────────────────────────────────────────

/**
 * Convierte una geometría Esri JSON a GeoJSON.
 *
 * Diferencias relevantes:
 *  - Esri usa `rings` para polígonos sin distinguir exterior/agujero por
 *    posición, sino por orientación (exterior en sentido horario).
 *  - Esri usa `paths` para líneas y `x`/`y` o `points` para puntos.
 *  - Los anillos Esri pueden traer valores Z/M que GeoJSON ignora aquí.
 */
export function esriGeometryToGeoJson(geom: Record<string, unknown> | null | undefined): GeoJsonGeometry | null {
  if (!geom) return null;

  if (typeof geom.x === 'number' && typeof geom.y === 'number') {
    if (!Number.isFinite(geom.x) || !Number.isFinite(geom.y)) return null;
    return { type: 'Point', coordinates: [geom.x, geom.y] };
  }

  if (Array.isArray(geom.points)) {
    const pts = (geom.points as unknown[])
      .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
      .map((p) => [p[0]!, p[1]!]);
    return pts.length === 1 ? { type: 'Point', coordinates: pts[0]! } : { type: 'MultiPoint', coordinates: pts };
  }

  if (Array.isArray(geom.paths)) {
    const paths = (geom.paths as unknown[])
      .filter((p): p is unknown[] => Array.isArray(p))
      .map((path) =>
        path
          .filter((pt): pt is number[] => Array.isArray(pt) && pt.length >= 2)
          .map((pt) => [pt[0]!, pt[1]!]),
      )
      .filter((p) => p.length >= 2);
    if (paths.length === 0) return null;
    return paths.length === 1
      ? { type: 'LineString', coordinates: paths[0]! }
      : { type: 'MultiLineString', coordinates: paths };
  }

  if (Array.isArray(geom.rings)) {
    const rings = (geom.rings as unknown[])
      .filter((r): r is unknown[] => Array.isArray(r))
      .map((ring) =>
        ring
          .filter((pt): pt is number[] => Array.isArray(pt) && pt.length >= 2)
          .map((pt) => [pt[0]!, pt[1]!]),
      )
      .filter((r) => r.length >= 4);
    if (rings.length === 0) return null;
    return { type: 'MultiPolygon', coordinates: ringsToMultiPolygon(rings) };
  }

  // Envelope (extensión) → polígono.
  if (
    typeof geom.xmin === 'number' &&
    typeof geom.ymin === 'number' &&
    typeof geom.xmax === 'number' &&
    typeof geom.ymax === 'number'
  ) {
    const { xmin, ymin, xmax, ymax } = geom as {
      xmin: number;
      ymin: number;
      xmax: number;
      ymax: number;
    };
    return {
      type: 'Polygon',
      coordinates: [
        [
          [xmin, ymin],
          [xmax, ymin],
          [xmax, ymax],
          [xmin, ymax],
          [xmin, ymin],
        ],
      ],
    };
  }

  return null;
}

/** Área con signo de un anillo (formula del área de Gauss). Horario < 0 en GeoJSON. */
function signedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j]!;
    const b = ring[i]!;
    sum += (b[0]! - a[0]!) * (b[1]! + a[1]!);
  }
  return sum / 2;
}

/**
 * Agrupa anillos Esri en polígonos GeoJSON. En Esri el anillo exterior va en
 * sentido horario (área con signo positivo con esta fórmula) y los agujeros en
 * antihorario; cada agujero pertenece al último exterior visto.
 */
export function ringsToMultiPolygon(rings: number[][][]): number[][][][] {
  const polygons: number[][][][] = [];
  let current: number[][][] | null = null;
  for (const ring of rings) {
    const closed = closeRing(ring);
    if (signedArea(closed) > 0) {
      // Exterior (horario en Esri).
      current = [reverseRing(closed)]; // GeoJSON quiere exterior antihorario
      polygons.push(current);
    } else if (current) {
      current.push(reverseRing(closed));
    } else {
      // Anillo antihorario sin exterior previo: se toma como exterior.
      current = [closed];
      polygons.push(current);
    }
  }
  return polygons;
}

function closeRing(ring: number[][]): number[][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0]!, first[1]!]];
}

function reverseRing(ring: number[][]): number[][] {
  return [...ring].reverse();
}

/** Convierte una respuesta Esri JSON completa a features GeoJSON. */
export function esriResponseToGeoJson(res: ArcgisQueryResponse): GeoJsonFeature[] {
  const oidField = res.objectIdFieldName;
  return (res.features ?? []).map((f) => {
    const properties = { ...(f.attributes ?? {}) };
    const idValue = oidField ? properties[oidField] : undefined;
    const feature: GeoJsonFeature = {
      type: 'Feature',
      geometry: esriGeometryToGeoJson(f.geometry ?? null),
      properties,
    };
    if (typeof idValue === 'number' || typeof idValue === 'string') feature.id = idValue;
    return feature;
  });
}

// ─── Paginación ───────────────────────────────────────────────────────────────

export type PaginationStrategy = 'result-offset' | 'oid-window' | 'single-page';

export interface FeatureBatch {
  features: GeoJsonFeature[];
  /** Índice del lote, empezando en 0. */
  batchIndex: number;
  /** Total acumulado de features emitidos hasta aquí (inclusive). */
  cumulative: number;
  strategy: PaginationStrategy;
  /** Formato realmente usado por el servidor. */
  format: 'geojson' | 'json';
  /** true si el servidor avisó que recortó la página. */
  exceededTransferLimit: boolean;
}

export interface IterateFeaturesOptions {
  /** Metadatos de la capa; si no se pasan se leen del servicio. */
  layerInfo?: ArcgisLayerInfo;
  /** Filtro SQL. Por defecto `1=1`. */
  where?: string;
  /** Campos a traer. Por defecto `*`. */
  outFields?: string;
  /** Traer geometría. Por defecto true. */
  returnGeometry?: boolean;
  /** SRID de salida. Por defecto el de la capa. */
  outSR?: number;
  /** Tamaño de página solicitado; se recorta a `maxRecordCount`. */
  pageSize?: number;
  /** Máximo de features a emitir en total. `undefined` = todos. */
  maxFeatures?: number;
  /** Fuerza una estrategia en vez de detectarla. */
  strategy?: PaginationStrategy;
  /** Fuerza el formato; por defecto geojson con reintento a json. */
  format?: 'geojson' | 'json';
  /** Se llama con cada aviso (estrategia elegida, formato degradado…). */
  onNotice?: (notice: string) => void;
  /** Timeout/reintentos por página. Útil para no esperar 2 min por capa lenta. */
  requestOptions?: HttpRequestOptions;
}

/**
 * Generador asíncrono que emite features en lotes.
 *
 * Detecta la estrategia de paginación cuando no se fuerza:
 *  - `supportsPagination === true` → `result-offset`.
 *  - hay campo OID y `supportsOrderBy` → `oid-window`.
 *  - en otro caso → `single-page` (una sola página, y se avisa).
 */
export async function* iterateFeatures(
  http: HttpClient,
  layerUrl: string,
  opts: IterateFeaturesOptions = {},
): AsyncGenerator<FeatureBatch, void, undefined> {
  const info =
    opts.layerInfo ?? (await http.getJson<ArcgisLayerInfo>(buildUrl(layerUrl, { f: 'json' })));
  const reqOpts = opts.requestOptions ?? {};
  const pageSize = effectivePageSize(info, opts.pageSize);
  const oidField = objectIdFieldOf(info);
  const adv = info.advancedQueryCapabilities ?? {};
  const notice = opts.onNotice ?? (() => undefined);

  let strategy: PaginationStrategy;
  if (opts.strategy) {
    strategy = opts.strategy;
  } else if (adv.supportsPagination === true) {
    strategy = 'result-offset';
  } else if (oidField !== null) {
    strategy = 'oid-window';
    notice(
      `La capa declara supportsPagination=false; se pagina por ventanas de ${oidField}. ` +
        (adv.supportsOrderBy === false
          ? 'Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.'
          : ''),
    );
  } else {
    strategy = 'single-page';
    notice(
      'La capa no soporta paginación ni expone campo OID: solo se puede traer la primera página.',
    );
  }

  const baseParams: ArcgisQueryParams = {
    where: opts.where ?? '1=1',
    outFields: opts.outFields ?? '*',
    returnGeometry: opts.returnGeometry ?? true,
  };
  if (opts.outSR !== undefined) baseParams.outSR = opts.outSR;

  const wantsGeoJson = (opts.format ?? 'geojson') === 'geojson';
  const preferGeoJsonInitially = wantsGeoJson && supportsGeoJson(info);
  if (wantsGeoJson && !preferGeoJsonInitially) {
    notice('La capa no declara geoJSON en supportedQueryFormats; se usa f=json y se convierte.');
  }
  let preferGeoJson = preferGeoJsonInitially;

  /**
   * Hallazgo de la Fase 0: cuando la capa declara `supportsPagination: false`, el
   * servidor del IGAC responde `400 Pagination is not supported.` al simple hecho
   * de recibir `resultRecordCount`, incluso sin `resultOffset`. Por eso en ese caso
   * no se envía NINGÚN parámetro de paginación y el tamaño de página se consigue
   * acotando el OID en el `where`.
   */
  const paginationParamsAllowed = adv.supportsPagination !== false;
  if (!paginationParamsAllowed && strategy === 'oid-window') {
    notice(
      'No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." ' +
        `El tamaño de página se acota con un rango de ${oidField}.`,
    );
  }

  let batchIndex = 0;
  let cumulative = 0;
  let offset = 0;
  /** Cursor del barrido por OID: se ha pedido todo lo que es <= a este valor. */
  let oidCursor = -1;
  /** Ventanas seguidas sin resultados: el OID puede tener huecos. */
  let emptyWindows = 0;
  const MAX_EMPTY_WINDOWS = 3;
  const seenOids = new Set<number>();

  for (;;) {
    const remaining = opts.maxFeatures === undefined ? pageSize : opts.maxFeatures - cumulative;
    if (remaining <= 0) return;
    const take = Math.min(pageSize, remaining);

    const params: ArcgisQueryParams = { ...baseParams };
    if (paginationParamsAllowed) params.resultRecordCount = take;
    if (strategy === 'result-offset') {
      params.resultOffset = offset;
      if (oidField && adv.supportsOrderBy !== false) params.orderByFields = oidField;
    } else if (strategy === 'oid-window') {
      // Ventana acotada sobre el OID: `(cursor, cursor + take]`. Al ser un rango
      // cerrado no hace falta `resultRecordCount` ni `orderByFields`, y el
      // servidor puede resolverla por índice.
      const upper = oidCursor + take;
      params.where = `(${baseParams.where ?? '1=1'}) AND ${oidField} > ${oidCursor} AND ${oidField} <= ${upper}`;
      if (adv.supportsOrderBy !== false && paginationParamsAllowed) {
        params.orderByFields = oidField;
      }
    }

    const fetched = await fetchPage(
      http,
      layerUrl,
      params,
      preferGeoJson,
      (msg) => {
        notice(msg);
        preferGeoJson = false;
      },
      reqOpts,
    );

    if (fetched.features.length === 0) {
      if (strategy !== 'oid-window') return;
      // Un rango de OID vacío puede ser un hueco (registros borrados), no el final.
      oidCursor += take;
      emptyWindows += 1;
      if (emptyWindows >= MAX_EMPTY_WINDOWS) {
        notice(
          `Se detiene el barrido tras ${MAX_EMPTY_WINDOWS} ventanas de ${oidField} vacías seguidas.`,
        );
        return;
      }
      continue;
    }
    emptyWindows = 0;

    // Protección contra servicios que ignoran la paginación y repiten la página.
    let features = fetched.features;
    if (strategy === 'oid-window' && oidField) {
      features = features.filter((f) => {
        const oid = f.properties?.[oidField];
        if (typeof oid !== 'number') return true;
        if (seenOids.has(oid)) return false;
        seenOids.add(oid);
        return true;
      });
      const oids = fetched.features
        .map((f) => f.properties?.[oidField])
        .filter((v): v is number => typeof v === 'number');
      // El cursor avanza por el rango pedido, no por el máximo devuelto: así el
      // barrido es determinista aunque el servicio ignore el orden.
      oidCursor = Math.max(oidCursor + take, ...(oids.length > 0 ? oids : [oidCursor]));
      if (features.length === 0) {
        notice('El servicio devolvió únicamente OID ya vistos: se detiene la paginación.');
        return;
      }
    }

    // Cuando no se pueden enviar parámetros de paginación el servidor devuelve
    // hasta su `maxRecordCount`, así que el recorte a `maxFeatures` se hace aquí.
    if (opts.maxFeatures !== undefined && cumulative + features.length > opts.maxFeatures) {
      features = features.slice(0, opts.maxFeatures - cumulative);
    }

    cumulative += features.length;
    yield {
      features,
      batchIndex,
      cumulative,
      strategy,
      format: fetched.format,
      exceededTransferLimit: fetched.exceededTransferLimit,
    };
    batchIndex += 1;

    if (strategy === 'single-page') return;
    if (strategy === 'result-offset') {
      offset += fetched.features.length;
      // Si el servidor no avisa y devolvió menos de lo pedido, se acabó.
      if (fetched.features.length < take && !fetched.exceededTransferLimit) return;
    }
    // En `oid-window` una página corta NO significa el final: el rango puede tener
    // huecos. El corte lo decide `MAX_EMPTY_WINDOWS` o `maxFeatures`.
  }
}

async function fetchPage(
  http: HttpClient,
  layerUrl: string,
  params: ArcgisQueryParams,
  preferGeoJson: boolean,
  onDegrade: (msg: string) => void,
  reqOpts: HttpRequestOptions = {},
): Promise<{ features: GeoJsonFeature[]; format: 'geojson' | 'json'; exceededTransferLimit: boolean }> {
  if (preferGeoJson) {
    const url = queryUrl(layerUrl, { ...params, f: 'geojson' });
    try {
      const res = await http.getJson<ArcgisGeoJsonResponse>(url, {
        label: layerUrl,
        retryOnBodyError: false,
        ...reqOpts,
      });
      if (res.error) throw new ArcgisServiceError(res.error.message, res.error.code, url);
      return {
        features: res.features ?? [],
        format: 'geojson',
        exceededTransferLimit:
          res.exceededTransferLimit === true || res.properties?.exceededTransferLimit === true,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Solo se degrada el formato cuando el servidor RECHAZA la petición
      // (error de ArcGIS o 4xx). Un timeout o un 5xx no dicen nada del formato:
      // reintentarlo en json solo duplicaría la espera.
      const rejected =
        err instanceof ArcgisServiceError ||
        (err instanceof HttpError && err.status !== null && err.status >= 400 && err.status < 500);
      if (!rejected) throw err;
      onDegrade(`f=geojson falló (${reason}); se reintenta con f=json y conversión esri→GeoJSON.`);
    }
  }
  const res = await query(http, layerUrl, { ...params, f: 'json' }, reqOpts);
  return {
    features: esriResponseToGeoJson(res),
    format: 'json',
    exceededTransferLimit: res.exceededTransferLimit === true,
  };
}

/** Descarga una capa completa a un `FeatureCollection`. Solo para capas pequeñas. */
export async function downloadLayerGeoJson(
  http: HttpClient,
  layerUrl: string,
  opts: IterateFeaturesOptions = {},
): Promise<{ features: GeoJsonFeature[]; strategy: PaginationStrategy; notices: string[] }> {
  const notices: string[] = [];
  const features: GeoJsonFeature[] = [];
  let strategy: PaginationStrategy = 'single-page';
  for await (const batch of iterateFeatures(http, layerUrl, {
    ...opts,
    onNotice: (n) => {
      notices.push(n);
      opts.onNotice?.(n);
    },
  })) {
    features.push(...batch.features);
    strategy = batch.strategy;
  }
  return { features, strategy, notices };
}
