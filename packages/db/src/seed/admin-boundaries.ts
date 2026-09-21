import { getLogger } from '@terracolombia/shared';

/**
 * Límites municipales y departamentales oficiales (IGAC).
 *
 * POR QUÉ ESTE SERVICIO Y NO EL DANE: el Marco Geoestadístico Nacional del DANE es la
 * fuente que el plan nombraba, pero su geoportal no publica un índice recorrible por
 * máquina (verificado en la Fase 0, `etl/config/datasets/dane.ts`): se descarga por
 * formulario. El IGAC sí expone los límites por ArcGIS REST, y son los límites de la
 * «Base de Datos Geográfica de Entidades Territoriales», que es el dato de deslinde
 * elevado a norma (Ley 1447 de 2011, Decreto 1170 de 2015). Es la fuente primaria.
 *
 * Verificado con peticiones reales el 2026-09-21 contra
 * `.../catastro/direccionesterritorialesigac/MapServer`:
 *  - capa 1 `departamento`: 33 entidades. Campos `DeCodigo`, `DeNombre`, `DeArea`, `DeNorma`.
 *  - capa 2 `municipio`:  1 122 entidades. Campos `MpCodigo`, `MpNombre`, `MpArea`,
 *    `Depto`, `DTerritorial`, `Gestor`.
 *  - `licenseInfo` del servicio: VACÍO. `accessInformation`: «Instituto Geográfico
 *    Agustín Codazzi - IGAC». No declara fecha de corte.
 *  - CRS nativo EPSG:9377; se pide `outSR=4326` y el servidor reproyecta.
 *
 * Dos avisos que NO son errores de este cargador, son la realidad de la fuente:
 *  - La capa de departamentos trae `DeCodigo = '00'` (Área en Litigio Cauca–Huila), que
 *    no es un departamento DIVIPOLA, y NO trae el código `11` (Bogotá, D.C.).
 *  - La capa de municipios trae `MpCodigo = '00000'` (la misma área en litigio) y NO trae
 *    `27493` (Belén de Bajirá), cuya pertenencia está en disputa.
 */

const log = getLogger({ mod: 'seed:admin-boundaries' });

export const IGAC_BOUNDARIES_SERVICE =
  'https://mapas.igac.gov.co/server/rest/services/catastro/direccionesterritorialesigac/MapServer';

/** Identificadores de capa verificados en el `?f=json` del MapServer. */
export const DEPARTMENT_LAYER_ID = 1;
export const MUNICIPALITY_LAYER_ID = 2;

/**
 * Declaración del dataset para `meta.dataset`.
 *
 * `license`: el servicio no declara licencia (`licenseInfo` vacío). Se registra el régimen
 * general de datos abiertos del Estado colombiano, que es lo único afirmable, y la nota deja
 * constancia literal de lo que sí declara la fuente. No se le atribuye una licencia CC que
 * el IGAC no ha puesto en este servicio.
 */
export const IGAC_BOUNDARIES_DATASET = {
  id: 'igac-limites-entidades-territoriales',
  source: 'IGAC',
  name: 'Límites de entidades territoriales — departamentos y municipios',
  description:
    'Base de Datos Geográfica de Entidades Territoriales del IGAC: límites de deslinde ' +
    'aprobados por la autoridad competente y elevados a norma (Ordenanza, Ley o Decreto), ' +
    'representados sobre cartografía del IGAC conforme a la Ley 1447 de 2011 y su Decreto ' +
    'Reglamentario 1170 de 2015.',
  license: 'datos-abiertos-co',
  attribution: 'Fuente: IGAC, Límites de entidades territoriales',
  url: IGAC_BOUNDARIES_SERVICE,
  frequency: 'eventual',
  connector: 'arcgis-rest',
  format: 'geojson',
  /** CRS nativo declarado por las capas. La descarga pide `outSR=4326`. */
  sourceSrid: 9377,
  targetTable: 'core.department.geom / core.municipality.geom',
  shareAlike: false,
  notes:
    'Verificado el 2026-09-21 con peticiones reales. El servicio NO declara licencia ' +
    '(`licenseInfo` vacío) ni fecha de corte; `accessInformation` dice literalmente ' +
    '"Instituto Geográfico Agustín Codazzi - IGAC". PENDIENTE: confirmar la licencia con el ' +
    'IGAC antes de redistribuir el dato derivado. La fecha de corte registrada es la fecha ' +
    'de consulta, no una fecha publicada por la fuente.',
} as const;

// ─── Tipos de la respuesta ────────────────────────────────────────────────────

/** Superficie GeoJSON tal como la devuelve ArcGIS con `f=geojson`. */
export interface GeoJsonSurface {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

interface GeoJsonFeature<P> {
  type: 'Feature';
  properties: P | null;
  geometry: GeoJsonSurface | null;
}

interface GeoJsonResponse<P> {
  type?: string;
  features?: Array<GeoJsonFeature<P>>;
  exceededTransferLimit?: boolean;
  /** ArcGIS responde el error en formato Esri aunque se pida `f=geojson`. */
  error?: { code: number; message: string };
}

/** Campos reales de la capa 1 (`departamento`). No se inventa ninguno. */
export interface DepartmentProperties {
  DeCodigo: string | null;
  DeNombre: string | null;
  DeArea: number | null;
  DeNorma: string | null;
}

/** Campos reales de la capa 2 (`municipio`). No se inventa ninguno. */
export interface MunicipalityProperties {
  MpCodigo: string | null;
  MpNombre: string | null;
  MpArea: number | null;
  Depto: string | null;
}

export interface BoundaryFeature<P> {
  properties: P;
  geometry: GeoJsonSurface;
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

export interface FetchOptions {
  /** Entidades por petición. Bajo a propósito: ver el comentario de `PAGE_SIZE`. */
  pageSize?: number;
  timeoutMs?: number;
  attempts?: number;
  baseUrl?: string;
  /** Desplazamiento inicial, para reanudar una descarga interrumpida sin repetirla entera. */
  startOffset?: number;
}

/**
 * 25 entidades por página. Medido contra el servicio: 25 municipios con geometría completa
 * pesan ~3 MB y tardan ~12 s; con páginas mayores el servidor devuelve 503 casi siempre.
 */
const PAGE_SIZE = 25;

/**
 * 7 decimales ≈ 1 cm. La cartografía de deslinde no tiene esa exactitud ni de lejos, así que
 * no se pierde información real, y el volumen de descarga baja a la mitad frente a los 14
 * decimales que el servicio devuelve por omisión.
 */
const GEOMETRY_PRECISION = 7;

const WGS84 = 4326;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadPage<P>(url: string, signal: AbortSignal): Promise<GeoJsonResponse<P>> {
  const res = await fetch(url, {
    signal,
    headers: {
      'User-Agent': process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Un bloqueo del WAF llega con 200 y cuerpo HTML: no es JSON y hay que reintentar.
  const body = JSON.parse(text) as GeoJsonResponse<P>;
  if (body.error) throw new Error(`ArcGIS ${body.error.code}: ${body.error.message}`);
  return body;
}

/**
 * Tope de tiempo duro por intento.
 *
 * No basta con `AbortController`: en una corrida real contra este servicio la petición se
 * quedó colgada indefinidamente y el `abort` no llegó a desbloquearla, así que el cargador
 * se paró en seco sin error ni reintento. Con `Promise.race` el intento falla igual aunque
 * la petición nunca se resuelva, y el reintento sigue su curso.
 */
async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Tiempo agotado (${timeoutMs} ms) en ${label}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * El servicio del IGAC devuelve 502/503 con frecuencia bajo carga, y un WAF intercala páginas
 * HTML ante ciertas cláusulas `where`. Ambos casos se tratan igual: reintentar con espera
 * creciente. Por eso el `where` se mantiene en `1=1` y el recorte se hace del lado del cliente.
 */
async function fetchPage<P>(
  layerId: number,
  outFields: readonly string[],
  orderByField: string,
  offset: number,
  opts: Required<Pick<FetchOptions, 'pageSize' | 'timeoutMs' | 'attempts' | 'baseUrl'>>,
): Promise<GeoJsonResponse<P>> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: outFields.join(','),
    returnGeometry: 'true',
    outSR: String(WGS84),
    geometryPrecision: String(GEOMETRY_PRECISION),
    orderByFields: orderByField,
    resultOffset: String(offset),
    resultRecordCount: String(opts.pageSize),
    f: 'geojson',
  });
  const url = `${opts.baseUrl}/${layerId}/query?${params.toString()}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    const started = Date.now();
    try {
      const body = await withDeadline(
        (signal) => downloadPage<P>(url, signal),
        opts.timeoutMs,
        `capa ${layerId}, offset ${offset}`,
      );
      log.info({ layerId, offset, ms: Date.now() - started }, 'Página descargada');
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < opts.attempts) {
        const waitMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
        log.warn(
          {
            layerId,
            offset,
            attempt,
            ms: Date.now() - started,
            err: err instanceof Error ? err.message : String(err),
            waitMs,
          },
          'Reintentando página del servicio del IGAC',
        );
        await sleep(waitMs);
      }
    }
  }
  throw new Error(
    `No se pudo descargar la capa ${layerId} (offset ${offset}) tras ${opts.attempts} intentos: ` +
      (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}

/**
 * Recorre una capa página a página y va entregando los lotes.
 *
 * Es un generador y no un array porque las 1 122 geometrías municipales completas pesan más
 * de 100 MB: se escriben en base de datos lote a lote y se descartan, en vez de tenerlas todas
 * vivas en memoria.
 */
export async function* fetchLayerBatches<P>(
  layerId: number,
  outFields: readonly string[],
  orderByField: string,
  opts: FetchOptions = {},
): AsyncGenerator<Array<BoundaryFeature<P>>> {
  const settings = {
    pageSize: opts.pageSize ?? PAGE_SIZE,
    // Una página sana tarda entre 2 y 20 s. Pasado el minuto, reintentar sale más barato que esperar.
    timeoutMs: opts.timeoutMs ?? 60_000,
    attempts: opts.attempts ?? 8,
    baseUrl: opts.baseUrl ?? IGAC_BOUNDARIES_SERVICE,
  };

  let offset = opts.startOffset ?? 0;
  // Cota dura: el servicio declara 1 122 municipios. Si paginara mal, el bucle no se eterniza.
  for (let page = 0; page < 500; page++) {
    const body = await fetchPage<P>(layerId, outFields, orderByField, offset, settings);
    const features = body.features ?? [];
    if (features.length === 0) return;

    const batch: Array<BoundaryFeature<P>> = [];
    for (const f of features) {
      if (!f.properties || !f.geometry) continue;
      batch.push({ properties: f.properties, geometry: f.geometry });
    }
    yield batch;

    if (features.length < settings.pageSize) return;
    offset += features.length;
  }
  throw new Error(`La paginación de la capa ${layerId} no terminó: revisa el servicio`);
}

export const DEPARTMENT_OUT_FIELDS = ['DeCodigo', 'DeNombre', 'DeArea', 'DeNorma'] as const;
export const MUNICIPALITY_OUT_FIELDS = ['MpCodigo', 'MpNombre', 'MpArea', 'Depto'] as const;

/** Normaliza el código a la longitud DIVIPOLA. Devuelve null si no es un código utilizable. */
export function normalizeDivipolaCode(raw: string | null, length: 2 | 5): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed) || trimmed.length > length) return null;
  const padded = trimmed.padStart(length, '0');
  // '00' y '00000' identifican el área en litigio Cauca–Huila, que no es entidad DIVIPOLA.
  if (/^0+$/.test(padded)) return null;
  return padded;
}
