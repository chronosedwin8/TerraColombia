/**
 * Conector Socrata (datos.gov.co).
 *
 * El portal nacional de datos abiertos de Colombia corre sobre Socrata. Dos APIs
 * nos interesan:
 *  - Catálogo: `/api/views/metadata/v1` → metadatos de los datasets (lento, ~20 s).
 *  - Datos:    `/resource/{id}.json` → filas con SoQL (`$limit`, `$offset`, `$select`, `$where`).
 *
 * Nota de Fase 0: el campo `license` del catálogo suele venir `null`; la licencia
 * real aparece en `customFields["Common Core"].License`. Hay que leer ambos.
 */

import { buildUrl, type HttpClient } from './http.js';

export const DATOS_GOV_CO = 'https://www.datos.gov.co';

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export interface SocrataCommonCore {
  'Contact Email'?: string;
  'Contact Name'?: string;
  Homepage?: string;
  Issued?: string;
  License?: string;
  'Last Update'?: string;
  Theme?: string;
  'Unique Identifier'?: string;
  'Geographic Coverage'?: string;
  Publisher?: string;
  'Public Access Level'?: string;
  Frequency?: string;
  Language?: string;
  [key: string]: string | undefined;
}

export interface SocrataMetadata {
  id: string;
  name: string;
  description?: string | null;
  attribution?: string | null;
  attributionLink?: string | null;
  category?: string | null;
  createdAt?: string;
  dataUpdatedAt?: string;
  metadataUpdatedAt?: string;
  updatedAt?: string;
  dataUri?: string;
  webUri?: string;
  domain?: string;
  license?: string | null;
  provenance?: string;
  hideFromCatalog?: boolean;
  tags?: string[];
  customFields?: { 'Common Core'?: SocrataCommonCore } & Record<string, unknown>;
}

export interface SocrataCatalogQuery {
  /** Texto libre de búsqueda. */
  q?: string;
  /** Máximo de resultados por página. El portal admite hasta 10 000. */
  limit?: number;
  offset?: number;
  /** Filtro por identificadores concretos. */
  ids?: readonly string[];
}

/** Una página del catálogo. */
export async function fetchCatalogPage(
  http: HttpClient,
  query: SocrataCatalogQuery = {},
  domain = DATOS_GOV_CO,
): Promise<SocrataMetadata[]> {
  const params: Record<string, string | number | undefined> = {
    limit: query.limit ?? 100,
    offset: query.offset ?? 0,
  };
  if (query.q !== undefined) params.q = query.q;
  if (query.ids && query.ids.length > 0) params.ids = query.ids.join(',');
  const url = buildUrl(`${domain}/api/views/metadata/v1`, params);
  // El catálogo de datos.gov.co tarda ~20 s; se le da margen amplio.
  return http.getJson<SocrataMetadata[]>(url, { label: 'socrata-catalog', timeoutMs: 180_000 });
}

/**
 * Máximo de filas por petición verificado contra `www.datos.gov.co` el 2026-09-21:
 * `limit=1000` responde 200 con 1 000 filas en ~26 s.
 */
export const CATALOG_MAX_LIMIT = 1000;

// ─── API de descubrimiento ────────────────────────────────────────────────────

/**
 * API de descubrimiento de Socrata. A diferencia de `/api/views/metadata/v1`,
 * **sí** respeta `q` y `offset`, responde en décimas de segundo y permite filtrar
 * por tipo de recurso. Verificado el 2026-09-21 contra `www.datos.gov.co`:
 * `q=establecimientos educativos&only=dataset` → 59 resultados relevantes en 0,4 s.
 */
export const SOCRATA_DISCOVERY = 'https://api.us.socrata.com/api/catalog/v1';

export interface DiscoveryResult {
  id: string;
  name: string;
  description: string | null;
  /** `dataset`, `map`, `chart`, `href`… */
  type: string | null;
  attribution: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  categories: string[];
  domainCategory: string | null;
  /** Página pública del dataset. */
  permalink: string | null;
  /** Columnas declaradas por el catálogo, si las expone. */
  columnNames: string[];
  columnFieldNames: string[];
  columnDescriptions: string[];
}

interface RawDiscoveryItem {
  resource?: {
    id?: string;
    name?: string;
    description?: string;
    type?: string;
    attribution?: string;
    updatedAt?: string;
    createdAt?: string;
    columns_name?: string[];
    columns_field_name?: string[];
    columns_description?: string[];
  };
  classification?: { categories?: string[]; domain_category?: string };
  permalink?: string;
  link?: string;
}

export interface DiscoveryQuery {
  q: string;
  /** Dominio del portal, sin esquema: `www.datos.gov.co`. */
  domain?: string;
  limit?: number;
  offset?: number;
  /** Tipo de recurso: `dataset` deja fuera mapas, gráficas y enlaces. */
  only?: 'dataset' | 'chart' | 'map' | 'href' | 'file';
}

function toDiscoveryResult(item: RawDiscoveryItem): DiscoveryResult | null {
  const r = item.resource;
  if (!r?.id || !r.name) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description?.trim() || null,
    type: r.type ?? null,
    attribution: r.attribution ?? null,
    updatedAt: r.updatedAt ?? null,
    createdAt: r.createdAt ?? null,
    categories: item.classification?.categories ?? [],
    domainCategory: item.classification?.domain_category ?? null,
    permalink: item.permalink ?? item.link ?? null,
    columnNames: r.columns_name ?? [],
    columnFieldNames: r.columns_field_name ?? [],
    columnDescriptions: r.columns_description ?? [],
  };
}

/**
 * Busca datasets por texto en la API de descubrimiento, paginando de verdad.
 * `maxResults` corta el recorrido; el tope por petición de Socrata es 100.
 */
export async function discoverDatasets(
  http: HttpClient,
  query: DiscoveryQuery & { maxResults?: number },
): Promise<DiscoveryResult[]> {
  const domain = (query.domain ?? DATOS_GOV_CO).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const pageSize = Math.min(query.limit ?? 100, 100);
  const maxResults = query.maxResults ?? pageSize;
  const out = new Map<string, DiscoveryResult>();
  let offset = query.offset ?? 0;

  for (;;) {
    const remaining = maxResults - out.size;
    if (remaining <= 0) break;
    const url = buildUrl(SOCRATA_DISCOVERY, {
      domains: domain,
      q: query.q,
      only: query.only ?? 'dataset',
      limit: Math.min(pageSize, remaining),
      offset,
      search_context: domain,
    });
    const body = await http.getJson<{ results?: RawDiscoveryItem[]; resultSetSize?: number }>(url, {
      label: `socrata-discovery:${query.q}`,
      timeoutMs: 90_000,
    });
    const items = body.results ?? [];
    if (items.length === 0) break;
    const before = out.size;
    for (const item of items) {
      const parsed = toDiscoveryResult(item);
      if (parsed) out.set(parsed.id, parsed);
    }
    // Si una página no aporta nada nuevo, el portal está repitiendo resultados.
    if (out.size === before) break;
    if (items.length < pageSize) break;
    offset += items.length;
  }
  return [...out.values()];
}

/**
 * Metadatos completos de un dataset. `/api/views/metadata/v1/{id}` responde en
 * ~0,5 s, a diferencia de la búsqueda del mismo endpoint, que tarda ~25 s.
 */
export async function fetchDatasetMetadata(
  http: HttpClient,
  id: string,
  domain = DATOS_GOV_CO,
): Promise<SocrataMetadata> {
  return http.getJson<SocrataMetadata>(`${domain}/api/views/metadata/v1/${id}`, {
    label: `socrata-meta:${id}`,
    timeoutMs: 60_000,
  });
}

/**
 * Recorre el catálogo y deduplica por `id`.
 *
 * ⚠ Hallazgo de la Fase 0: `/api/views/metadata/v1` **ignora `offset`**. Se
 * comprobó con 34 peticiones consecutivas (offset 0 a 3 300, `limit=100`): las
 * 34 devolvieron exactamente los mismos 100 identificadores. Por eso aquí se
 * pide una sola página grande y se corta en cuanto una página no aporta nada
 * nuevo, en vez de pasear un offset que el servidor descarta.
 */
export async function searchCatalog(
  http: HttpClient,
  query: SocrataCatalogQuery & { maxResults?: number; onNotice?: (n: string) => void } = {},
  domain = DATOS_GOV_CO,
): Promise<SocrataMetadata[]> {
  const maxResults = Math.min(query.maxResults ?? query.limit ?? 100, CATALOG_MAX_LIMIT * 4);
  const pageSize = Math.min(query.limit ?? maxResults, CATALOG_MAX_LIMIT);
  const out = new Map<string, SocrataMetadata>();
  let offset = query.offset ?? 0;
  let barrenPages = 0;

  for (;;) {
    const remaining = maxResults - out.size;
    if (remaining <= 0) break;
    const page = await fetchCatalogPage(
      http,
      { ...query, limit: Math.min(pageSize, remaining), offset },
      domain,
    );
    if (page.length === 0) break;

    const before = out.size;
    for (const item of page) out.set(item.id, item);
    if (out.size === before) {
      barrenPages += 1;
      query.onNotice?.(
        `El catálogo devolvió ${page.length} filas ya vistas en offset=${offset}: el portal ignora \`offset\` en /api/views/metadata/v1. Se detiene la paginación.`,
      );
      if (barrenPages >= 1) break;
    }
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return [...out.values()].slice(0, maxResults);
}

/** Licencia efectiva: el campo propio o el de Common Core. */
export function licenseOf(meta: SocrataMetadata): string | null {
  const cc = meta.customFields?.['Common Core'];
  return meta.license ?? cc?.License ?? null;
}

/** Publicador efectivo: Common Core o la atribución. */
export function publisherOf(meta: SocrataMetadata): string | null {
  const cc = meta.customFields?.['Common Core'];
  return cc?.Publisher ?? meta.attribution ?? null;
}

/** Fecha de corte usable: última actualización de datos. */
export function cutDateOf(meta: SocrataMetadata): string | null {
  const cc = meta.customFields?.['Common Core'];
  const raw = meta.dataUpdatedAt ?? cc?.['Last Update'] ?? meta.updatedAt ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** true si el publicador o la descripción apuntan a la entidad buscada. */
export function matchesPublisher(meta: SocrataMetadata, needles: readonly string[]): boolean {
  const haystack = [
    publisherOf(meta) ?? '',
    meta.attribution ?? '',
    meta.customFields?.['Common Core']?.['Contact Name'] ?? '',
    meta.customFields?.['Common Core']?.['Contact Email'] ?? '',
    meta.name,
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return needles.some((n) =>
    haystack.includes(
      n
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    ),
  );
}

// ─── Datos ────────────────────────────────────────────────────────────────────

export interface SocrataResourceQuery {
  /** Columnas a traer (`$select`). */
  select?: string;
  /** Filtro SoQL (`$where`). */
  where?: string;
  /** Orden (`$order`). Necesario para que `$offset` sea estable. */
  order?: string;
  /** Filas por página (`$limit`). Por defecto 1 000; Socrata admite hasta 50 000. */
  limit?: number;
  offset?: number;
  /** Token de aplicación opcional; sin él hay límite de tasa más estricto. */
  appToken?: string;
}

function resourceUrl(
  domain: string,
  datasetId: string,
  query: SocrataResourceQuery,
  offset: number,
  limit: number,
): string {
  const params: Record<string, string | number | undefined> = {
    $limit: limit,
    $offset: offset,
  };
  if (query.select !== undefined) params.$select = query.select;
  if (query.where !== undefined) params.$where = query.where;
  if (query.order !== undefined) params.$order = query.order;
  return buildUrl(`${domain}/resource/${datasetId}.json`, params);
}

/** Una página de filas. */
export async function fetchResourcePage(
  http: HttpClient,
  datasetId: string,
  query: SocrataResourceQuery = {},
  domain = DATOS_GOV_CO,
): Promise<Record<string, unknown>[]> {
  const limit = query.limit ?? 1_000;
  const url = resourceUrl(domain, datasetId, query, query.offset ?? 0, limit);
  const headers: Record<string, string> = {};
  const token = query.appToken ?? process.env.SOCRATA_APP_TOKEN;
  if (token) headers['X-App-Token'] = token;
  return http.getJson<Record<string, unknown>[]>(url, {
    label: `socrata:${datasetId}`,
    headers,
    timeoutMs: 180_000,
  });
}

/**
 * Generador asíncrono que emite filas en lotes con `$limit`/`$offset`.
 * Sin `$order` Socrata no garantiza un orden estable entre páginas, así que si no
 * se indica se avisa una vez.
 */
export async function* iterateResource(
  http: HttpClient,
  datasetId: string,
  query: SocrataResourceQuery & { maxRows?: number; onNotice?: (n: string) => void } = {},
  domain = DATOS_GOV_CO,
): AsyncGenerator<{ rows: Record<string, unknown>[]; batchIndex: number; cumulative: number }> {
  const pageSize = query.limit ?? 1_000;
  if (query.order === undefined) {
    query.onNotice?.(
      'Sin $order, Socrata no garantiza orden estable entre páginas: puede haber filas repetidas u omitidas.',
    );
  }
  let offset = query.offset ?? 0;
  let batchIndex = 0;
  let cumulative = 0;
  for (;;) {
    const remaining = query.maxRows === undefined ? pageSize : query.maxRows - cumulative;
    if (remaining <= 0) return;
    const take = Math.min(pageSize, remaining);
    const rows = await fetchResourcePage(
      http,
      datasetId,
      { ...query, limit: take, offset },
      domain,
    );
    if (rows.length === 0) return;
    cumulative += rows.length;
    yield { rows, batchIndex, cumulative };
    batchIndex += 1;
    offset += rows.length;
    if (rows.length < take) return;
  }
}

/** Conteo exacto vía SoQL (`$select=count(*)`). `null` si el dataset no lo permite. */
export async function countResource(
  http: HttpClient,
  datasetId: string,
  where?: string,
  domain = DATOS_GOV_CO,
): Promise<number | null> {
  try {
    const rows = await fetchResourcePage(
      http,
      datasetId,
      { select: 'count(*) as n', ...(where !== undefined ? { where } : {}), limit: 1 },
      domain,
    );
    const first = rows[0];
    if (!first) return null;
    const raw = first.n ?? Object.values(first)[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Columnas de un dataset, deducidas de una muestra de filas.
 * Socrata expone el esquema formal en `/api/views/{id}.json`, pero ese endpoint
 * es mucho más lento y a veces está restringido; una muestra basta para el catálogo.
 */
export async function inferColumns(
  http: HttpClient,
  datasetId: string,
  sampleSize = 5,
  domain = DATOS_GOV_CO,
): Promise<{ rows: Record<string, unknown>[]; columns: { name: string; jsType: string }[] }> {
  const rows = await fetchResourcePage(http, datasetId, { limit: sampleSize }, domain);
  const types = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const set = types.get(k) ?? new Set<string>();
      set.add(v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
      types.set(k, set);
    }
  }
  return {
    rows,
    columns: [...types.entries()].map(([name, set]) => ({
      name,
      jsType: [...set].filter((t) => t !== 'null').join('|') || 'null',
    })),
  };
}
