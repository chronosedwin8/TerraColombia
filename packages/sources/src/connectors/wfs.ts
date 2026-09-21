/**
 * Conector WFS (OGC Web Feature Service).
 *
 * Se usa donde la fuente publica WFS en vez de ArcGIS REST: el IGAC expone
 * `WFSServer` como extensión de sus MapServer (`supportedExtensions` lo declara),
 * y varias entidades (IDEAM, SGC, PNN) publican GeoServer.
 *
 * Paginación: WFS 2.0.0 usa `startIndex` + `count`; WFS 1.1.0 usa `maxFeatures`
 * y no tiene `startIndex`. El conector detecta la versión en `GetCapabilities`.
 * `GetCapabilities` es XML; se parsea con expresiones regulares acotadas porque
 * no hay parser XML en la biblioteca estándar de Node y el paquete debe correr
 * sin dependencias externas.
 */

import { buildUrl, type HttpClient } from './http.js';
import type { GeoJsonFeature } from '@terracolombia/shared';

export type WfsVersion = '1.0.0' | '1.1.0' | '2.0.0';

export interface WfsFeatureTypeInfo {
  /** Nombre cualificado, tal como se pasa a `typeNames`. */
  name: string;
  title: string | null;
  abstract: string | null;
  /** CRS por defecto declarado, p. ej. `urn:ogc:def:crs:EPSG::4686`. */
  defaultCrs: string | null;
  /** Otros CRS soportados. */
  otherCrs: string[];
  /** BBox WGS84 `[minLon, minLat, maxLon, maxLat]` si se declara. */
  wgs84BBox: [number, number, number, number] | null;
  keywords: string[];
}

export interface WfsCapabilities {
  version: WfsVersion;
  title: string | null;
  abstract: string | null;
  /** Nombre del proveedor (`ows:ProviderName`). */
  provider: string | null;
  /** Restricciones de acceso / licencia (`ows:AccessConstraints`, `Fees`). */
  accessConstraints: string | null;
  fees: string | null;
  /** Formatos aceptados por `GetFeature` (`outputFormat`). */
  outputFormats: string[];
  /** true si algún `outputFormat` es GeoJSON. */
  supportsGeoJson: boolean;
  /** Máximo de features por petición si el servicio lo declara. */
  countDefault: number | null;
  featureTypes: WfsFeatureTypeInfo[];
  /** Operaciones anunciadas (`GetFeature`, `DescribeFeatureType`…). */
  operations: string[];
}

// ─── Parseo de GetCapabilities ────────────────────────────────────────────────

/** Quita el prefijo de namespace de una etiqueta (`wfs:FeatureType` → `FeatureType`). */
function stripNs(tag: string): string {
  return tag.replace(/^[^:]+:/, '');
}

/** Extrae el contenido de todas las apariciones de un elemento, con o sin prefijo. */
function extractElements(xml: string, localName: string): string[] {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${localName}>`,
    'g',
  );
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(m[1] ?? '');
  return out;
}

/** Primer valor textual de un elemento hijo. */
function firstText(xml: string, localName: string): string | null {
  const values = extractElements(xml, localName);
  const first = values[0];
  if (first === undefined) return null;
  const text = decodeXmlEntities(first.replace(/<[^>]*>/g, '').trim());
  return text.length > 0 ? text : null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Atributo de la etiqueta raíz del documento.
 * Se descarta primero la declaración `<?xml version="1.0"?>`, que si no haría
 * creer que todo servicio es WFS 1.0.0.
 */
function rootAttribute(xml: string, attr: string): string | null {
  const head = xml.replace(/<\?xml[\s\S]*?\?>/, '').slice(0, 4000);
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`);
  const m = head.match(re);
  return m?.[1] ?? null;
}

/**
 * Parsea un documento `GetCapabilities` de WFS 1.x o 2.0.0.
 * Exportado aparte de la petición para poder probarlo con XML fijo.
 */
export function parseCapabilities(xml: string): WfsCapabilities {
  const versionRaw = rootAttribute(xml, 'version') ?? '2.0.0';
  const version: WfsVersion =
    versionRaw.startsWith('2.') ? '2.0.0' : versionRaw.startsWith('1.1') ? '1.1.0' : '1.0.0';

  // Identificación del servicio: `ows:ServiceIdentification` (2.0) o `Service` (1.x).
  const identBlocks = [
    ...extractElements(xml, 'ServiceIdentification'),
    ...extractElements(xml, 'Service'),
  ];
  const ident = identBlocks[0] ?? '';
  const providerBlock = extractElements(xml, 'ServiceProvider')[0] ?? '';

  // Formatos de salida: atributos de `Parameter name="outputFormat"` u `ows:Value`.
  const outputFormats = new Set<string>();
  for (const block of extractElements(xml, 'Parameter')) {
    for (const v of extractElements(block, 'Value')) {
      const t = v.replace(/<[^>]*>/g, '').trim();
      if (t.length > 0) outputFormats.add(t);
    }
  }
  for (const m of xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?Format>([^<]+)</g)) {
    const t = (m[1] ?? '').trim();
    if (t.length > 0) outputFormats.add(t);
  }
  // WFS 1.0/1.1 anuncian los formatos como etiquetas vacías dentro de ResultFormat.
  for (const block of extractElements(xml, 'ResultFormat')) {
    for (const m of block.matchAll(/<(?:[A-Za-z0-9_.-]+:)?([A-Za-z0-9_.-]+)\s*\/?>/g)) {
      const t = stripNs(m[1] ?? '');
      if (t.length > 0) outputFormats.add(t);
    }
  }

  const operations = new Set<string>();
  for (const m of xml.matchAll(/<(?:[A-Za-z0-9_.-]+:)?Operation\s+name="([^"]+)"/g)) {
    operations.add(m[1] ?? '');
  }
  for (const name of ['GetCapabilities', 'DescribeFeatureType', 'GetFeature', 'Transaction']) {
    if (new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}[\\s>]`).test(xml)) operations.add(name);
  }

  let countDefault: number | null = null;
  const countMatch = xml.match(
    /name="CountDefault"[\s\S]{0,200}?<(?:[A-Za-z0-9_.-]+:)?DefaultValue>(\d+)</,
  );
  if (countMatch?.[1]) countDefault = Number(countMatch[1]);

  const featureTypes: WfsFeatureTypeInfo[] = [];
  for (const block of extractElements(xml, 'FeatureType')) {
    const name = firstText(block, 'Name');
    if (name === null) continue;
    const defaultCrs = firstText(block, 'DefaultCRS') ?? firstText(block, 'DefaultSRS') ?? firstText(block, 'SRS');
    const otherCrs = [
      ...extractElements(block, 'OtherCRS'),
      ...extractElements(block, 'OtherSRS'),
    ]
      .map((v) => v.replace(/<[^>]*>/g, '').trim())
      .filter((v) => v.length > 0);

    let wgs84BBox: [number, number, number, number] | null = null;
    const bboxBlock = extractElements(block, 'WGS84BoundingBox')[0];
    if (bboxBlock) {
      const lower = firstText(bboxBlock, 'LowerCorner');
      const upper = firstText(bboxBlock, 'UpperCorner');
      const l = lower?.split(/\s+/).map(Number);
      const u = upper?.split(/\s+/).map(Number);
      if (l && u && l.length >= 2 && u.length >= 2) {
        wgs84BBox = [l[0]!, l[1]!, u[0]!, u[1]!];
      }
    } else {
      // WFS 1.x: `<LatLongBoundingBox minx=… miny=… maxx=… maxy=…/>`
      const m = block.match(
        /<(?:[A-Za-z0-9_.-]+:)?LatLongBoundingBox\s+minx="([^"]+)"\s+miny="([^"]+)"\s+maxx="([^"]+)"\s+maxy="([^"]+)"/,
      );
      if (m) wgs84BBox = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    }

    const keywords = extractElements(block, 'Keyword')
      .map((k) => decodeXmlEntities(k.replace(/<[^>]*>/g, '').trim()))
      .filter((k) => k.length > 0);

    featureTypes.push({
      name,
      title: firstText(block, 'Title'),
      abstract: firstText(block, 'Abstract'),
      defaultCrs,
      otherCrs,
      wgs84BBox,
      keywords,
    });
  }

  const formats = [...outputFormats];
  return {
    version,
    title: firstText(ident, 'Title'),
    abstract: firstText(ident, 'Abstract'),
    provider: firstText(providerBlock, 'ProviderName'),
    accessConstraints: firstText(ident, 'AccessConstraints'),
    fees: firstText(ident, 'Fees'),
    outputFormats: formats,
    supportsGeoJson: formats.some((f) => /geojson|application\/json/i.test(f)),
    countDefault,
    featureTypes,
    operations: [...operations],
  };
}

// ─── Peticiones ───────────────────────────────────────────────────────────────

/** Normaliza la URL base quitando parámetros WFS ya presentes. */
export function normalizeWfsUrl(url: string): string {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) {
    if (/^(service|version|request|typenames?|outputformat|startindex|count|maxfeatures)$/i.test(key)) {
      u.searchParams.delete(key);
    }
  }
  return u.toString().replace(/\?$/, '');
}

export async function getCapabilities(
  http: HttpClient,
  baseUrl: string,
  version: WfsVersion = '2.0.0',
): Promise<WfsCapabilities> {
  const url = buildUrl(normalizeWfsUrl(baseUrl), {
    service: 'WFS',
    version,
    request: 'GetCapabilities',
  });
  const xml = await http.getText(url, { label: `wfs-capabilities:${baseUrl}` });
  return parseCapabilities(xml);
}

export interface GetFeatureOptions {
  version?: WfsVersion;
  /** Formato solicitado. Por defecto `application/json`. */
  outputFormat?: string;
  /** Filas por petición. */
  count?: number;
  startIndex?: number;
  /** CRS de salida (`srsName`). */
  srsName?: string;
  /** Filtro CQL si el servidor lo soporta (GeoServer: `cql_filter`). */
  cqlFilter?: string;
  /** BBox `minx,miny,maxx,maxy[,crs]`. */
  bbox?: string;
  /** Propiedades a traer (`propertyName`). */
  propertyName?: string;
  /** Orden; necesario para que `startIndex` sea estable. */
  sortBy?: string;
}

function getFeatureUrl(baseUrl: string, typeName: string, opts: GetFeatureOptions): string {
  const version = opts.version ?? '2.0.0';
  const params: Record<string, string | number | undefined> = {
    service: 'WFS',
    version,
    request: 'GetFeature',
    outputFormat: opts.outputFormat ?? 'application/json',
  };
  // El nombre del parámetro cambió entre versiones.
  if (version === '2.0.0') params.typeNames = typeName;
  else params.typeName = typeName;

  if (opts.count !== undefined) {
    if (version === '2.0.0') params.count = opts.count;
    else params.maxFeatures = opts.count;
  }
  if (opts.startIndex !== undefined && version === '2.0.0') params.startIndex = opts.startIndex;
  if (opts.srsName !== undefined) params.srsName = opts.srsName;
  if (opts.cqlFilter !== undefined) params.cql_filter = opts.cqlFilter;
  if (opts.bbox !== undefined) params.bbox = opts.bbox;
  if (opts.propertyName !== undefined) params.propertyName = opts.propertyName;
  if (opts.sortBy !== undefined) params.sortBy = opts.sortBy;
  return buildUrl(normalizeWfsUrl(baseUrl), params);
}

export interface WfsFeatureCollection {
  type?: string;
  features?: GeoJsonFeature[];
  totalFeatures?: number | string;
  numberMatched?: number;
  numberReturned?: number;
  crs?: { type?: string; properties?: { name?: string } };
}

/** Una página de `GetFeature` en GeoJSON. */
export async function getFeature(
  http: HttpClient,
  baseUrl: string,
  typeName: string,
  opts: GetFeatureOptions = {},
): Promise<WfsFeatureCollection> {
  const url = getFeatureUrl(baseUrl, typeName, opts);
  return http.getJson<WfsFeatureCollection>(url, { label: `wfs:${typeName}` });
}

/**
 * Generador asíncrono que pagina `GetFeature` con `startIndex`/`count`.
 * En WFS 1.x no hay `startIndex`: se emite una sola página y se avisa.
 */
export async function* iterateFeatures(
  http: HttpClient,
  baseUrl: string,
  typeName: string,
  opts: GetFeatureOptions & { maxFeatures?: number; onNotice?: (n: string) => void } = {},
): AsyncGenerator<{ features: GeoJsonFeature[]; batchIndex: number; cumulative: number }> {
  const version = opts.version ?? '2.0.0';
  const pageSize = opts.count ?? 1_000;
  if (version !== '2.0.0') {
    opts.onNotice?.(
      `WFS ${version} no soporta startIndex: solo se puede traer la primera página de ${pageSize} features.`,
    );
  }
  let startIndex = opts.startIndex ?? 0;
  let batchIndex = 0;
  let cumulative = 0;
  for (;;) {
    const remaining = opts.maxFeatures === undefined ? pageSize : opts.maxFeatures - cumulative;
    if (remaining <= 0) return;
    const take = Math.min(pageSize, remaining);
    const fc = await getFeature(http, baseUrl, typeName, { ...opts, count: take, startIndex });
    const features = fc.features ?? [];
    if (features.length === 0) return;
    cumulative += features.length;
    yield { features, batchIndex, cumulative };
    batchIndex += 1;
    if (version !== '2.0.0') return;
    startIndex += features.length;
    if (features.length < take) return;
  }
}

/** `DescribeFeatureType` en XML crudo: sirve para el diccionario de campos. */
export async function describeFeatureType(
  http: HttpClient,
  baseUrl: string,
  typeName: string,
  version: WfsVersion = '2.0.0',
): Promise<string> {
  const params: Record<string, string | undefined> = {
    service: 'WFS',
    version,
    request: 'DescribeFeatureType',
  };
  if (version === '2.0.0') params.typeNames = typeName;
  else params.typeName = typeName;
  return http.getText(buildUrl(normalizeWfsUrl(baseUrl), params), {
    label: `wfs-describe:${typeName}`,
  });
}

/** Campos declarados por `DescribeFeatureType` (XSD). */
export function parseFeatureTypeFields(
  xsd: string,
): { name: string; type: string; nillable: boolean }[] {
  const out: { name: string; type: string; nillable: boolean }[] = [];
  for (const m of xsd.matchAll(/<(?:[A-Za-z0-9_.-]+:)?element\s+([^>]*?)\/?>/g)) {
    const attrs = m[1] ?? '';
    const name = attrs.match(/\bname\s*=\s*"([^"]+)"/)?.[1];
    const type = attrs.match(/\btype\s*=\s*"([^"]+)"/)?.[1];
    if (!name || !type) continue;
    out.push({ name, type, nillable: /\bnillable\s*=\s*"true"/.test(attrs) });
  }
  return out;
}
