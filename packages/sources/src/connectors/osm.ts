/**
 * Conector OpenStreetMap: localización del extracto de Colombia en Geofabrik.
 *
 * NO descarga el `.pbf` (el extracto de Colombia pesa cientos de MB y la carga la
 * hace `osm2pgsql` en la Fase 4). Este conector solo registra el descriptor con
 * URL, fecha, tamaño y licencia, que es lo que la Fase 0 necesita.
 *
 * Fuente: https://download.geofabrik.de/south-america/colombia.html
 * Licencia de los datos: Open Database License (ODbL) 1.0 — © colaboradores de
 * OpenStreetMap. Exige atribución y, si se redistribuye una base derivada,
 * mantener la misma licencia.
 */

import { buildUrl, type HttpClient } from './http.js';

export const GEOFABRIK_BASE = 'https://download.geofabrik.de';
export const GEOFABRIK_COLOMBIA_PAGE = `${GEOFABRIK_BASE}/south-america/colombia.html`;
export const GEOFABRIK_COLOMBIA_DIR = `${GEOFABRIK_BASE}/south-america`;

export const OSM_LICENSE = 'ODbL 1.0 (Open Database License)';
export const OSM_ATTRIBUTION = '© colaboradores de OpenStreetMap, ODbL 1.0';

export interface OsmExtractFile {
  /** Nombre del archivo tal como lo publica Geofabrik. */
  name: string;
  url: string;
  /** `pbf` (para osm2pgsql), `shp` o `gpkg` (subconjunto "free"). */
  format: 'pbf' | 'shp' | 'gpkg' | 'other';
  /** Tamaño en bytes según `HEAD`, o `null` si el servidor no lo declara. */
  bytes: number | null;
  /** `Last-Modified` en ISO, o `null`. */
  lastModified: string | null;
  /** URL del `.md5` que publica Geofabrik junto al archivo. */
  md5Url: string | null;
  /** Checksum MD5 publicado, si se pudo leer. */
  md5: string | null;
  /** true si el servidor admite `Range` (descarga reanudable). */
  acceptsRanges: boolean;
}

export interface OsmExtractDescriptor {
  source: 'OSM';
  region: string;
  /** Página HTML de la que se obtuvo la información. */
  pageUrl: string;
  /** Fecha del corte declarada por Geofabrik (ISO). */
  cutDate: string | null;
  /** Texto original de la fecha, tal como aparece en la página. */
  cutDateRaw: string | null;
  license: string;
  attribution: string;
  files: OsmExtractFile[];
  /** Avisos de la inspección (p. ej. fecha no encontrada). */
  notes: string[];
  inspectedAt: string;
}

function formatOf(name: string): OsmExtractFile['format'] {
  if (name.endsWith('.osm.pbf')) return 'pbf';
  if (name.endsWith('.shp.zip')) return 'shp';
  if (name.endsWith('.gpkg.zip')) return 'gpkg';
  return 'other';
}

/**
 * Extrae de la página de Geofabrik los nombres de archivo del extracto y la fecha
 * del corte. Se separa de la petición HTTP para poder probarla con HTML fijo.
 */
export function parseGeofabrikPage(html: string, slug = 'colombia'): {
  fileNames: string[];
  cutDateRaw: string | null;
  cutDate: string | null;
} {
  // Enlaces del tipo `colombia-latest.osm.pbf`, `colombia-latest-free.shp.zip`.
  const re = new RegExp(`${slug}-latest[A-Za-z0-9._-]*`, 'g');
  const fileNames = [...new Set(html.match(re) ?? [])]
    // Descartar los `.md5`, que se derivan aparte.
    .filter((n) => !n.endsWith('.md5'))
    .sort();

  // Geofabrik imprime la fecha del corte como ISO en el texto de la página.
  const isoMatch = html.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?/);
  const cutDateRaw = isoMatch?.[0] ?? null;
  const cutDate = cutDateRaw ? (cutDateRaw.slice(0, 10) || null) : null;

  return { fileNames, cutDateRaw, cutDate };
}

/**
 * Localiza el extracto de Colombia y devuelve su descriptor.
 * Hace `HEAD` a cada archivo para conocer tamaño y fecha sin descargarlo, y lee
 * el `.md5` (unos pocos bytes) para poder verificar la descarga en la Fase 4.
 */
export async function describeColombiaExtract(
  http: HttpClient,
  opts: { slug?: string; region?: string; readMd5?: boolean } = {},
): Promise<OsmExtractDescriptor> {
  const slug = opts.slug ?? 'colombia';
  const region = opts.region ?? 'Colombia';
  const notes: string[] = [];

  const html = await http.getText(GEOFABRIK_COLOMBIA_PAGE, { label: 'geofabrik-colombia' });
  const { fileNames, cutDateRaw, cutDate } = parseGeofabrikPage(html, slug);
  if (fileNames.length === 0) {
    notes.push(
      'No se encontraron enlaces `*-latest*` en la página de Geofabrik: puede haber cambiado el formato del HTML.',
    );
  }
  if (cutDate === null) {
    notes.push('No se pudo leer la fecha del corte en la página; se usará `Last-Modified` del .pbf.');
  }

  const files: OsmExtractFile[] = [];
  for (const name of fileNames) {
    const url = `${GEOFABRIK_COLOMBIA_DIR}/${name}`;
    let bytes: number | null = null;
    let lastModified: string | null = null;
    let acceptsRanges = false;
    try {
      const head = await http.head(url);
      if (head.status >= 400) {
        notes.push(`HEAD ${name} devolvió HTTP ${head.status}.`);
      } else {
        const len = Number(head.headers['content-length']);
        bytes = Number.isFinite(len) ? len : null;
        const lm = head.headers['last-modified'];
        lastModified = lm ? new Date(lm).toISOString() : null;
        acceptsRanges = (head.headers['accept-ranges'] ?? '').toLowerCase().includes('bytes');
      }
    } catch (err) {
      notes.push(`No se pudo consultar ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    let md5: string | null = null;
    const md5Url = `${url}.md5`;
    if (opts.readMd5 !== false) {
      try {
        const text = await http.getText(md5Url, { label: `geofabrik-md5:${name}` });
        md5 = text.trim().split(/\s+/)[0] ?? null;
      } catch {
        // Geofabrik no publica `.md5` para todos los formatos; no es un error.
        md5 = null;
      }
    }

    files.push({
      name,
      url,
      format: formatOf(name),
      bytes,
      lastModified,
      md5Url: md5 === null ? null : md5Url,
      md5,
      acceptsRanges,
    });
  }

  const pbf = files.find((f) => f.format === 'pbf');
  return {
    source: 'OSM',
    region,
    pageUrl: GEOFABRIK_COLOMBIA_PAGE,
    cutDate: cutDate ?? (pbf?.lastModified ? pbf.lastModified.slice(0, 10) : null),
    cutDateRaw,
    license: OSM_LICENSE,
    attribution: OSM_ATTRIBUTION,
    files,
    notes,
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Consulta puntual a Overpass. No se usa en la ingesta masiva (para eso está el
 * extracto + `osm2pgsql`), sino para verificar disponibilidad de etiquetas en la
 * Fase 0 sin bajar el `.pbf`.
 * `timeout` se envía dentro de la propia consulta QL, como exige Overpass.
 */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export async function overpassCount(
  http: HttpClient,
  query: string,
  endpoint = OVERPASS_ENDPOINT,
): Promise<{ elements: unknown[]; raw: unknown }> {
  const url = buildUrl(endpoint, { data: query });
  const raw = await http.getJson<{ elements?: unknown[] }>(url, {
    label: 'overpass',
    timeoutMs: 180_000,
  });
  return { elements: raw.elements ?? [], raw };
}

/** Consulta Overpass que cuenta elementos de una etiqueta dentro de Colombia. */
export function buildOverpassTagCountQuery(tag: string, value: string, timeoutS = 120): string {
  // `area["ISO3166-1"="CO"]` selecciona el área administrativa de Colombia.
  return `[out:json][timeout:${timeoutS}];area["ISO3166-1"="CO"][admin_level=2]->.co;(node["${tag}"="${value}"](area.co);way["${tag}"="${value}"](area.co););out count;`;
}
