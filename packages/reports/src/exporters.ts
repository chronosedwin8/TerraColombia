import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  MESSAGES,
  NOT_AVAILABLE,
  SRID,
  getLogger,
  isShareAlike,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
  type ResponseMeta,
} from '@terracolombia/shared';
import {
  DELIVERY_CONTENT_TYPES,
  FORMAT_EXTENSION,
  OWN_INDICATORS_PART,
  SHARE_ALIKE_PART,
  SOURCES_SHEET_NAME,
  type ExportRequest,
  type ReportOutput,
  type ReportSpec,
  type ReportTable,
} from './types.js';
import { sanitizeFilename, toTabular, type TabularWorkbook } from './tabular.js';
import { toXlsx } from './xlsx.js';
import { createZip, type ZipEntry } from './zip.js';

/**
 * Exportadores. Reglas que se cumplen siempre (PLAN.md §2 y §11):
 *
 * - Toda exportación incluye el archivo u hoja `FUENTES_Y_LICENCIA`.
 * - Los datos con cláusula **ShareAlike** (IGAC CC BY-SA 4.0, OpenStreetMap ODbL) viajan en
 *   archivos/hojas/capas **distintas** de los indicadores propios de TerraColombia, porque la
 *   cláusula puede alcanzar a las bases derivadas que publique quien los reutilice.
 * - Los formatos geográficos binarios (GPKG, Shapefile) y KML se delegan a `ogr2ogr`: es el
 *   único camino confiable para escribirlos (ADR-005). Si falta GDAL, el error dice cómo
 *   instalarlo y qué formatos sí están disponibles sin él.
 */

const log = getLogger({ mod: 'reports/exporters' });
const exec = promisify(execFile);

// ─── CSV ──────────────────────────────────────────────────────────────────────

export interface CsvOptions {
  /**
   * Separador. Por omisión `;`, que es el separador de listas de la configuración regional
   * es-CO: un CSV con comas se abre en una sola columna en un Excel en español.
   */
  delimiter?: string;
  /** Añade BOM UTF-8 para que Excel reconozca los acentos. Por omisión, sí. */
  bom?: boolean;
  /** Fin de línea. Por omisión CRLF, que es lo que espera Excel en Windows. */
  eol?: string;
  /** Incluye el título de la tabla y sus notas como líneas de comentario iniciales. */
  includeHeaderNotes?: boolean;
}

function csvEscape(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const raw = value === NOT_AVAILABLE ? MESSAGES.common.notAvailable : String(value);
  if (raw.includes(delimiter) || raw.includes('"') || /[\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Serializa una tabla del informe como CSV. Función pura: no toca disco ni red. */
export function toCsv(table: ReportTable, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ';';
  const eol = options.eol ?? '\r\n';
  const lines: string[] = [];

  if (options.includeHeaderNotes !== false) {
    lines.push(`# ${table.title}`);
    lines.push(`# Datasets de origen: ${table.sourceDatasetIds.join(', ') || MESSAGES.common.notAvailable}`);
    if (table.note) lines.push(`# ${table.note}`);
    if (table.hasCadastralValue) {
      lines.push('# Advertencia: avalúo catastral ≠ valor comercial (valor fiscal, no precio de venta).');
    }
    lines.push(`# Consulte ${SOURCES_SHEET_NAME}.txt para la licencia y la atribución exigida.`);
  }

  lines.push(table.columns.map((c) => csvEscape(c.label, delimiter)).join(delimiter));
  if (table.rows.length === 0) {
    lines.push(csvEscape(table.emptyMessage ?? MESSAGES.common.notAvailableLong, delimiter));
  } else {
    for (const row of table.rows) {
      lines.push(table.columns.map((c) => csvEscape(row[c.key], delimiter)).join(delimiter));
    }
  }

  const body = lines.join(eol) + eol;
  return options.bom === false ? body : `\uFEFF${body}`;
}

// ─── GeoJSON ──────────────────────────────────────────────────────────────────

export interface GeoJsonOptions {
  /** Bloque de procedencia a incrustar como miembro de nivel superior. */
  meta?: ResponseMeta | null;
  /** Indentación; 0 para una sola línea. */
  indent?: number;
  /** Solo estas propiedades por *feature* (el resto se descarta). */
  onlyProperties?: readonly string[] | null;
  /** Nombre de la capa, como miembro `name` (convención de ogr2ogr). */
  name?: string | null;
}

/**
 * Serializa una `FeatureCollection` en GeoJSON (RFC 7946, EPSG:4326 implícito).
 * El bloque de procedencia va en el miembro de extensión `terracolombia`, que los lectores
 * ignoran pero conserva la licencia junto al dato.
 */
export function toGeoJson(fc: GeoJsonFeatureCollection, options: GeoJsonOptions = {}): string {
  const features = options.onlyProperties
    ? fc.features.map((f) => pickProperties(f, options.onlyProperties as readonly string[]))
    : fc.features;

  const out: Record<string, unknown> = {
    type: 'FeatureCollection',
    ...(options.name ? { name: options.name } : {}),
    // Las geometrías se sirven siempre en EPSG:4326 (regla del proyecto).
    crs: {
      type: 'name',
      properties: { name: `urn:ogc:def:crs:EPSG::${SRID.WGS84}` },
    },
    ...(fc.bbox ? { bbox: fc.bbox } : {}),
    features,
  };

  if (options.meta) {
    out['terracolombia'] = {
      generatedAt: options.meta.generatedAt,
      cutDate: options.meta.cutDate,
      synthetic: options.meta.synthetic,
      warnings: options.meta.warnings,
      sources: options.meta.sources.map((s) => ({
        datasetId: s.datasetId,
        source: s.source,
        name: s.name,
        cutDate: s.cutDate,
        license: s.license,
        shareAlike: isShareAlike(s.license),
        attribution: s.attribution,
        url: s.url,
      })),
      note: `Consulte ${SOURCES_SHEET_NAME}.txt para la licencia completa y la atribución exigida.`,
    };
  }

  return JSON.stringify(out, null, options.indent ?? 0);
}

function pickProperties(
  f: GeoJsonFeature,
  keys: readonly string[],
): GeoJsonFeature {
  const properties: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in f.properties) properties[k] = (f.properties as Record<string, unknown>)[k];
  }
  return { ...f, properties };
}

/** Divide la colección en la capa ShareAlike y la capa de indicadores propios. */
export function splitByLicense(
  fc: GeoJsonFeatureCollection,
  ownPropertyKeys: readonly string[],
  joinKey: string,
): { shareAlike: GeoJsonFeatureCollection; own: GeoJsonFeatureCollection | null } {
  if (ownPropertyKeys.length === 0) return { shareAlike: fc, own: null };
  const ownSet = new Set(ownPropertyKeys);
  const shareAlikeKeys = new Set<string>();
  for (const f of fc.features) {
    for (const k of Object.keys(f.properties ?? {})) if (!ownSet.has(k)) shareAlikeKeys.add(k);
  }
  return {
    shareAlike: {
      type: 'FeatureCollection',
      features: fc.features.map((f) => pickProperties(f, [...shareAlikeKeys])),
      ...(fc.bbox ? { bbox: fc.bbox } : {}),
    },
    own: {
      type: 'FeatureCollection',
      features: fc.features.map((f) =>
        pickProperties(f, [joinKey, ...ownPropertyKeys].filter((v, i, a) => a.indexOf(v) === i)),
      ),
      ...(fc.bbox ? { bbox: fc.bbox } : {}),
    },
  };
}

// ─── Detección de GDAL ────────────────────────────────────────────────────────

export class GdalUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      [
        'No se encontró `ogr2ogr` (GDAL), necesario para exportar a GeoPackage, Shapefile y KML.',
        '',
        'Cómo solucionarlo:',
        '  * Windows: el bundle de PostGIS para PostgreSQL 17 ya lo trae. Define la variable',
        '    GDAL_OGR2OGR con su ruta, por ejemplo:',
        '    GDAL_OGR2OGR=C:\\Program Files\\PostgreSQL\\17\\bin\\ogr2ogr.exe',
        '  * Linux/macOS: instala GDAL (`apt install gdal-bin`, `brew install gdal`) y déjalo en el PATH.',
        '',
        'Sin GDAL siguen disponibles los formatos PDF, XLSX, CSV y GeoJSON.',
        ...(detail ? ['', `Detalle: ${detail}`] : []),
      ].join('\n'),
    );
    this.name = 'GdalUnavailableError';
  }
}

/** Rutas donde suele estar `ogr2ogr` cuando no está en el PATH. */
const OGR_CANDIDATES = [
  'C:\\Program Files\\PostgreSQL\\17\\bin\\ogr2ogr.exe',
  'C:\\Program Files\\PostgreSQL\\16\\bin\\ogr2ogr.exe',
  'C:\\Program Files\\GDAL\\ogr2ogr.exe',
  'C:\\OSGeo4W\\bin\\ogr2ogr.exe',
  '/usr/bin/ogr2ogr',
  '/usr/local/bin/ogr2ogr',
  '/opt/homebrew/bin/ogr2ogr',
];

let cachedOgr: string | null | undefined;

/**
 * Localiza `ogr2ogr`: primero la variable `GDAL_OGR2OGR` (ADR-005), después las rutas
 * conocidas, y por último el PATH. No hay degradación silenciosa: si no está, se lanza
 * `GdalUnavailableError` con instrucciones.
 */
export function findOgr2Ogr(): string {
  if (cachedOgr === undefined) {
    const fromEnv = process.env.GDAL_OGR2OGR?.trim();
    if (fromEnv && existsSync(fromEnv)) {
      cachedOgr = fromEnv;
    } else {
      cachedOgr = OGR_CANDIDATES.find((p) => existsSync(p)) ?? null;
      if (!cachedOgr) cachedOgr = process.platform === 'win32' ? 'ogr2ogr.exe' : 'ogr2ogr';
    }
  }
  if (!cachedOgr) throw new GdalUnavailableError();
  return cachedOgr;
}

/** Solo para pruebas: reinicia la caché del detector. */
export function resetOgrCache(): void {
  cachedOgr = undefined;
}

async function runOgr(args: string[], timeoutMs = 180_000): Promise<void> {
  const bin = findOgr2Ogr();
  const env = { ...process.env };
  // GDAL necesita sus datos auxiliares; si el binario vive junto a `gdal-data`, se los pasamos.
  if (!env['GDAL_DATA'] && /PostgreSQL/i.test(bin)) {
    const guess = bin.replace(/bin[\\/]ogr2ogr(\.exe)?$/i, 'share\\gdal');
    if (existsSync(guess)) env['GDAL_DATA'] = guess;
  }
  try {
    const { stderr } = await exec(bin, args, { timeout: timeoutMs, env, windowsHide: true });
    if (stderr && stderr.trim().length > 0) log.warn({ stderr: stderr.trim() }, 'ogr2ogr avisó');
  } catch (e) {
    const err = e as { code?: string | number; stderr?: string; message?: string };
    if (err.code === 'ENOENT') throw new GdalUnavailableError(err.message);
    throw new Error(
      `ogr2ogr falló al escribir la exportación.\nComando: ${bin} ${args.join(' ')}\n${err.stderr ?? err.message ?? ''}`,
    );
  }
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'terracolombia-export-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function safeLayerName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return clean.length > 0 ? clean : 'capa';
}

export interface SpatialInput {
  shareAlike: GeoJsonFeatureCollection;
  own: GeoJsonFeatureCollection | null;
  layerName: string;
  meta: ResponseMeta;
  sourcesTable: ReportTable;
  sourcesText: string;
}

async function writeInputs(dir: string, input: SpatialInput): Promise<{ saPath: string; ownPath: string | null; csvPath: string }> {
  const saPath = join(dir, 'sa.geojson');
  await writeFile(saPath, toGeoJson(input.shareAlike, { meta: input.meta, name: `${input.layerName}_${SHARE_ALIKE_PART}` }), 'utf8');
  let ownPath: string | null = null;
  if (input.own && input.own.features.length > 0) {
    ownPath = join(dir, 'own.geojson');
    await writeFile(ownPath, toGeoJson(input.own, { meta: input.meta, name: `${input.layerName}_${OWN_INDICATORS_PART}` }), 'utf8');
  }
  const csvPath = join(dir, `${SOURCES_SHEET_NAME}.csv`);
  await writeFile(csvPath, toCsv(input.sourcesTable, { includeHeaderNotes: false, delimiter: ',', bom: false }), 'utf8');
  return { saPath, ownPath, csvPath };
}

// ─── GeoPackage ───────────────────────────────────────────────────────────────

/**
 * GeoPackage con una capa por grupo de licencia y una tabla no espacial
 * `FUENTES_Y_LICENCIA`. Un solo archivo, así que no necesita ZIP.
 */
export async function toGpkg(input: SpatialInput): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const { saPath, ownPath, csvPath } = await writeInputs(dir, input);
    const out = join(dir, 'export.gpkg');
    const saLayer = safeLayerName(`${input.layerName}_${SHARE_ALIKE_PART}`);

    await runOgr([
      '-f', 'GPKG', out, saPath,
      '-nln', saLayer,
      '-nlt', 'PROMOTE_TO_MULTI',
      '-a_srs', `EPSG:${SRID.WGS84}`,
      '-lco', 'GEOMETRY_NAME=geom',
      '-lco', 'SPATIAL_INDEX=YES',
    ]);

    if (ownPath) {
      await runOgr([
        '-f', 'GPKG', '-update', '-append', out, ownPath,
        '-nln', safeLayerName(`${input.layerName}_${OWN_INDICATORS_PART}`),
        '-nlt', 'PROMOTE_TO_MULTI',
        '-a_srs', `EPSG:${SRID.WGS84}`,
        '-lco', 'GEOMETRY_NAME=geom',
      ]);
    }

    // Tabla no espacial con la procedencia: obligatoria en toda exportación.
    await runOgr(['-f', 'GPKG', '-update', '-append', out, csvPath, '-nln', SOURCES_SHEET_NAME]);

    return readFile(out);
  });
}

// ─── Shapefile ────────────────────────────────────────────────────────────────

/**
 * Shapefile. Formato de varios archivos, así que siempre viaja en ZIP, con
 * `FUENTES_Y_LICENCIA.txt` dentro. Los nombres de campo se truncan a 10 caracteres: es una
 * limitación del formato, no del producto, y se advierte en el propio ZIP.
 */
export async function toShapefile(input: SpatialInput): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const { saPath, ownPath } = await writeInputs(dir, input);
    const outDir = join(dir, 'shp');
    const saLayer = safeLayerName(`${input.layerName}_${SHARE_ALIKE_PART}`);

    await runOgr([
      '-f', 'ESRI Shapefile', outDir, saPath,
      '-nln', saLayer,
      '-nlt', 'PROMOTE_TO_MULTI',
      '-a_srs', `EPSG:${SRID.WGS84}`,
      '-lco', 'ENCODING=UTF-8',
    ]);

    if (ownPath) {
      await runOgr([
        '-f', 'ESRI Shapefile', outDir, ownPath,
        '-nln', safeLayerName(`${input.layerName}_${OWN_INDICATORS_PART}`),
        '-nlt', 'PROMOTE_TO_MULTI',
        '-a_srs', `EPSG:${SRID.WGS84}`,
        '-lco', 'ENCODING=UTF-8',
        '-update',
      ]);
    }

    const files = await readdir(outDir);
    const entries: ZipEntry[] = [];
    for (const name of files) {
      entries.push({ name, content: await readFile(join(outDir, name)) });
    }
    entries.push({
      name: `${SOURCES_SHEET_NAME}.txt`,
      content: `${input.sourcesText}\n\nNOTA SOBRE EL FORMATO SHAPEFILE\n${'-'.repeat(72)}\nEl formato Shapefile trunca los nombres de campo a 10 caracteres y no admite valores\nnulos en todos los tipos. Para un intercambio sin pérdidas use GeoPackage o GeoJSON.\n`,
    });
    entries.push({ name: `${SOURCES_SHEET_NAME}.csv`, content: toCsv(input.sourcesTable) });
    return createZip(entries);
  });
}

// ─── KML ──────────────────────────────────────────────────────────────────────

/** KML (uno por grupo de licencia) empaquetado con `FUENTES_Y_LICENCIA.txt`. */
export async function toKml(input: SpatialInput): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const { saPath, ownPath } = await writeInputs(dir, input);
    const entries: ZipEntry[] = [];

    const saOut = join(dir, `${safeLayerName(`${input.layerName}_${SHARE_ALIKE_PART}`)}.kml`);
    await runOgr(['-f', 'KML', saOut, saPath, '-a_srs', `EPSG:${SRID.WGS84}`]);
    entries.push({ name: `${safeLayerName(`${input.layerName}_${SHARE_ALIKE_PART}`)}.kml`, content: await readFile(saOut) });

    if (ownPath) {
      const ownOut = join(dir, `${safeLayerName(`${input.layerName}_${OWN_INDICATORS_PART}`)}.kml`);
      await runOgr(['-f', 'KML', ownOut, ownPath, '-a_srs', `EPSG:${SRID.WGS84}`]);
      entries.push({
        name: `${safeLayerName(`${input.layerName}_${OWN_INDICATORS_PART}`)}.kml`,
        content: await readFile(ownOut),
      });
    }

    entries.push({ name: `${SOURCES_SHEET_NAME}.txt`, content: input.sourcesText });
    return createZip(entries);
  });
}

// ─── Orquestación ─────────────────────────────────────────────────────────────

/** Deriva la capa geográfica del informe cuando el llamador no la pasa. */
export function featuresFromSpec(spec: ReportSpec): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  if (spec.kind === 'parcel' && spec.data.parcelGeometry) {
    features.push({
      type: 'Feature',
      id: spec.data.parcel.npn,
      geometry: spec.data.parcelGeometry,
      properties: {
        npn: spec.data.parcel.npn,
        muni_code: spec.data.parcel.muniCode,
        muni_name: spec.data.municipality.name,
        zone: spec.data.parcel.zone,
        economic_use: spec.data.parcel.economicUse,
        area_geom_m2: spec.data.parcel.areaGeomM2,
        area_reported_m2: spec.data.parcel.areaReportedM2,
        built_area_m2: spec.data.parcel.builtAreaM2,
      },
    });
  } else if (spec.kind !== 'parcel' && spec.data.geometry) {
    features.push({
      type: 'Feature',
      geometry: spec.data.geometry,
      properties: { report_id: spec.verification.reportId, kind: spec.kind },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Empaqueta las tablas del informe como CSV separados por licencia, dentro de un ZIP. */
export function csvBundle(model: TabularWorkbook): Buffer {
  const entries: ZipEntry[] = [];
  for (const sheet of model.sheets) {
    const part = sheet.group === 'shareAlike' ? SHARE_ALIKE_PART : OWN_INDICATORS_PART;
    entries.push({ name: `${part}/${sanitizeFilename(sheet.name)}.csv`, content: toCsv(sheet.table) });
  }
  entries.push({ name: `${SOURCES_SHEET_NAME}.csv`, content: toCsv(model.sources) });
  entries.push({ name: `${SOURCES_SHEET_NAME}.txt`, content: model.sourcesText });
  return createZip(entries);
}

/**
 * Genera la descarga de una exportación en el formato pedido.
 *
 * Siempre devuelve el `FUENTES_Y_LICENCIA` correspondiente al formato: hoja en XLSX, tabla no
 * espacial en GPKG, y archivo `.txt` + `.csv` en los formatos que viajan en ZIP.
 */
export async function renderExport(request: ExportRequest): Promise<ReportOutput> {
  const { spec, format } = request;
  const model = toTabular(spec);
  const base = sanitizeFilename(request.filenameBase ?? model.filenameBase);
  const filename = `${base}.${FORMAT_EXTENSION[format]}`;
  const contentType = DELIVERY_CONTENT_TYPES[format];

  if (format === 'xlsx') {
    return { buffer: await toXlsx(spec, model), contentType, filename };
  }

  if (format === 'csv') {
    return { buffer: csvBundle(model), contentType, filename };
  }

  const fc = request.features ?? featuresFromSpec(spec);
  const joinKey = request.joinPropertyKey ?? 'npn';
  const { shareAlike, own } = splitByLicense(fc, request.ownPropertyKeys ?? [], joinKey);
  const layerName = safeLayerName(request.layerName ?? `${spec.kind}_${spec.verification.reportId}`);
  const input: SpatialInput = {
    shareAlike,
    own,
    layerName,
    meta: spec.meta,
    sourcesTable: model.sources,
    sourcesText: model.sourcesText,
  };

  switch (format) {
    case 'geojson': {
      const entries: ZipEntry[] = [
        {
          name: `${SHARE_ALIKE_PART}/${base}.geojson`,
          content: toGeoJson(shareAlike, { meta: spec.meta, indent: 2, name: layerName }),
        },
        { name: `${SOURCES_SHEET_NAME}.txt`, content: model.sourcesText },
        { name: `${SOURCES_SHEET_NAME}.csv`, content: toCsv(model.sources) },
      ];
      if (own && own.features.length > 0) {
        entries.splice(1, 0, {
          name: `${OWN_INDICATORS_PART}/${base}_indicadores.geojson`,
          content: toGeoJson(own, { meta: spec.meta, indent: 2, name: `${layerName}_indicadores` }),
        });
      }
      return { buffer: createZip(entries), contentType, filename };
    }
    case 'gpkg':
      return { buffer: await toGpkg(input), contentType, filename };
    case 'shp':
      return { buffer: await toShapefile(input), contentType, filename };
    case 'kml':
      return { buffer: await toKml(input), contentType, filename };
  }
}
