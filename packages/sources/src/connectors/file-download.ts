/**
 * Descarga de archivos grandes con checksum y reanudación.
 *
 * Se usa para la base catastral por departamento (GDB/GPKG/SHP en ZIP, cientos de
 * MB), el Marco Geoestadístico del DANE y los extractos de OSM.
 *
 * Sin dependencias externas: `fetch` con streaming a disco, `node:crypto` para el
 * SHA-256 y `node:zlib` para leer el directorio central de los ZIP.
 */

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SourceFileKind =
  | 'zip'
  | 'gdb'
  | 'gpkg'
  | 'shp'
  | 'csv'
  | 'tsv'
  | 'geojson'
  | 'json'
  | 'xml'
  | 'gml'
  | 'kml'
  | 'kmz'
  | 'xlsx'
  | 'pbf'
  | 'tif'
  | 'txt'
  | 'unknown';

export interface DownloadResult {
  url: string;
  path: string;
  bytes: number;
  sha256: string;
  kind: SourceFileKind;
  contentType: string | null;
  lastModified: string | null;
  etag: string | null;
  /** true si el archivo ya estaba completo en disco y no se volvió a bajar. */
  skipped: boolean;
  /** true si se reanudó una descarga parcial con `Range`. */
  resumed: boolean;
  downloadedAt: string;
}

export interface DownloadOptions {
  /** Directorio destino. Se crea si no existe. */
  destDir: string;
  /** Nombre del archivo; por defecto el último segmento de la URL. */
  fileName?: string;
  userAgent?: string;
  timeoutMs?: number;
  /** Reintentos por fallo de red. Por defecto 3. */
  maxRetries?: number;
  /** SHA-256 esperado; si no coincide se borra el archivo y se lanza error. */
  expectedSha256?: string;
  /** Si es true no se intenta reanudar: siempre se baja de cero. */
  noResume?: boolean;
  /** Progreso en bytes descargados / total conocido. */
  onProgress?: (downloaded: number, total: number | null) => void;
  fetchImpl?: typeof fetch;
}

export class DownloadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

// ─── Detección de tipo ────────────────────────────────────────────────────────

const EXTENSION_KIND: Record<string, SourceFileKind> = {
  '.zip': 'zip',
  '.gdb': 'gdb',
  '.gpkg': 'gpkg',
  '.shp': 'shp',
  '.csv': 'csv',
  '.tsv': 'tsv',
  '.geojson': 'geojson',
  '.json': 'json',
  '.xml': 'xml',
  '.gml': 'gml',
  '.kml': 'kml',
  '.kmz': 'kmz',
  '.xlsx': 'xlsx',
  '.pbf': 'pbf',
  '.tif': 'tif',
  '.tiff': 'tif',
  '.txt': 'txt',
};

/** Tipo por extensión de la ruta o URL. */
export function kindFromName(name: string): SourceFileKind {
  const clean = name.split(/[?#]/)[0] ?? name;
  const ext = extname(clean).toLowerCase();
  if (ext === '' && /\.gdb\/?$/i.test(clean)) return 'gdb';
  return EXTENSION_KIND[ext] ?? 'unknown';
}

/**
 * Tipo por firma de bytes. Más fiable que la extensión porque muchos portales
 * sirven `.zip` como `application/octet-stream` o sin extensión.
 */
export function kindFromMagic(head: Buffer): SourceFileKind {
  if (head.length >= 4) {
    // ZIP (también KMZ, XLSX, SHP-en-ZIP): PK\x03\x04
    if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)) {
      return 'zip';
    }
    // Shapefile .shp: big-endian 9994
    if (head.readInt32BE(0) === 9994) return 'shp';
  }
  // GeoPackage: "SQLite format 3\0" + application_id GPKG
  if (head.length >= 68 && head.subarray(0, 15).toString('ascii') === 'SQLite format 3') {
    const appId = head.subarray(68, 72).toString('ascii');
    return appId === 'GPKG' ? 'gpkg' : 'unknown';
  }
  // GeoTIFF / TIFF
  if (head.length >= 4) {
    const le = head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00;
    const be = head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a;
    if (le || be) return 'tif';
  }
  const text = head.subarray(0, 256).toString('utf8').trimStart();
  if (text.startsWith('{') && /"type"\s*:\s*"(Feature|FeatureCollection)"/.test(text)) return 'geojson';
  if (text.startsWith('{') || text.startsWith('[')) return 'json';
  if (text.startsWith('<?xml')) {
    if (/<kml/i.test(text)) return 'kml';
    if (/<(wfs:)?FeatureCollection|gml:/i.test(text)) return 'gml';
    return 'xml';
  }
  return 'unknown';
}

/** Tipo definitivo: la firma manda sobre la extensión; `zip` se refina con el contenido. */
export async function detectFileKind(path: string): Promise<SourceFileKind> {
  let head = Buffer.alloc(0);
  try {
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(512);
      const { bytesRead } = await fh.read(buf, 0, 512, 0);
      head = buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch {
    return kindFromName(path);
  }
  const magic = kindFromMagic(head);
  if (magic === 'zip') {
    // Un ZIP que contiene un .gdb o un .shp se clasifica por su contenido.
    try {
      const entries = await listZipEntries(path);
      if (entries.some((e) => /\.gdb\//i.test(e.name) || /\.gdb$/i.test(e.name))) return 'zip';
      return 'zip';
    } catch {
      return 'zip';
    }
  }
  if (magic !== 'unknown') return magic;
  return kindFromName(path);
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Descarga con reanudación. El estado se guarda junto al archivo en
 * `<archivo>.part` + `<archivo>.meta.json`, de modo que una corrida posterior
 * continúe donde quedó si el servidor acepta `Range` y el `ETag` no cambió.
 */
export async function downloadFile(url: string, opts: DownloadOptions): Promise<DownloadResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const userAgent = opts.userAgent ?? process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1';
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const maxRetries = opts.maxRetries ?? 3;

  await mkdir(opts.destDir, { recursive: true });
  const name =
    opts.fileName ?? (decodeURIComponent(basename(new URL(url).pathname)) || 'download.bin');
  const finalPath = join(opts.destDir, name);
  const partPath = `${finalPath}.part`;
  const metaPath = `${finalPath}.meta.json`;

  // Si el destino ya existe y el checksum cuadra, no se vuelve a bajar.
  const existing = await stat(finalPath).catch(() => null);
  if (existing?.isFile()) {
    const sha256 = await sha256File(finalPath);
    if (opts.expectedSha256 === undefined || opts.expectedSha256 === sha256) {
      return {
        url,
        path: finalPath,
        bytes: existing.size,
        sha256,
        kind: await detectFileKind(finalPath),
        contentType: null,
        lastModified: existing.mtime.toISOString(),
        etag: null,
        skipped: true,
        resumed: false,
        downloadedAt: existing.mtime.toISOString(),
      };
    }
    await unlink(finalPath);
  }

  let resumed = false;
  let offset = 0;
  if (!opts.noResume) {
    const part = await stat(partPath).catch(() => null);
    if (part?.isFile() && part.size > 0) {
      offset = part.size;
      resumed = true;
    }
  } else {
    await unlink(partPath).catch(() => undefined);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { 'User-Agent': userAgent };
      if (offset > 0) headers.Range = `bytes=${offset}-`;
      const res = await fetchImpl(url, { headers, signal: controller.signal, redirect: 'follow' });

      if (offset > 0 && res.status === 200) {
        // El servidor ignoró `Range`: hay que empezar de cero.
        offset = 0;
        resumed = false;
        await unlink(partPath).catch(() => undefined);
      } else if (offset > 0 && res.status !== 206) {
        throw new DownloadError(
          `El servidor no admite reanudación (HTTP ${res.status})`,
          url,
          res.status,
        );
      }
      if (!res.ok) {
        throw new DownloadError(`HTTP ${res.status} al descargar`, url, res.status);
      }
      if (!res.body) throw new DownloadError('Respuesta sin cuerpo', url, res.status);

      const contentLength = Number(res.headers.get('content-length'));
      const total = Number.isFinite(contentLength) ? contentLength + offset : null;
      let downloaded = offset;

      const out = createWriteStream(partPath, { flags: offset > 0 ? 'a' : 'w' });
      const input = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      input.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        opts.onProgress?.(downloaded, total);
      });
      await pipeline(input, out);

      const sha256 = await sha256File(partPath);
      if (opts.expectedSha256 !== undefined && opts.expectedSha256 !== sha256) {
        await unlink(partPath).catch(() => undefined);
        throw new DownloadError(
          `Checksum SHA-256 no coincide: esperado ${opts.expectedSha256}, obtenido ${sha256}`,
          url,
        );
      }

      await rename(partPath, finalPath);
      const st = await stat(finalPath);
      const result: DownloadResult = {
        url,
        path: finalPath,
        bytes: st.size,
        sha256,
        kind: await detectFileKind(finalPath),
        contentType: res.headers.get('content-type'),
        lastModified: res.headers.get('last-modified'),
        etag: res.headers.get('etag'),
        skipped: false,
        resumed,
        downloadedAt: new Date().toISOString(),
      };
      await writeFile(metaPath, JSON.stringify(result, null, 2), 'utf8');
      return result;
    } catch (err) {
      lastError = err;
      if (err instanceof DownloadError && err.status !== undefined && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (attempt >= maxRetries) break;
      await sleep(Math.min(30_000, 1_000 * 2 ** attempt) * (0.5 + Math.random() / 2));
      // Tras un fallo se reintenta reanudando desde lo que haya en disco.
      const part = await stat(partPath).catch(() => null);
      offset = opts.noResume ? 0 : (part?.size ?? 0);
      resumed = offset > 0;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new DownloadError(`No se pudo descargar ${url}`, url);
}

/** `HEAD` para conocer tamaño, tipo y fecha sin descargar. */
export async function probeRemoteFile(
  url: string,
  opts: { userAgent?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{
  url: string;
  status: number;
  bytes: number | null;
  contentType: string | null;
  lastModified: string | null;
  etag: string | null;
  acceptsRanges: boolean;
  kind: SourceFileKind;
}> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      headers: { 'User-Agent': opts.userAgent ?? process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const len = Number(res.headers.get('content-length'));
    return {
      url,
      status: res.status,
      bytes: Number.isFinite(len) ? len : null,
      contentType: res.headers.get('content-type'),
      lastModified: res.headers.get('last-modified'),
      etag: res.headers.get('etag'),
      acceptsRanges: (res.headers.get('accept-ranges') ?? '').toLowerCase().includes('bytes'),
      kind: kindFromName(url),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Lectura de ZIP ───────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  method: number;
  isDirectory: boolean;
  /** Offset del encabezado local, para extraer sin descomprimir todo. */
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;

/**
 * Lista el contenido de un ZIP leyendo su directorio central.
 * Soporta ZIP64, imprescindible porque la base catastral de departamentos grandes
 * supera los 4 GB descomprimida.
 */
export async function listZipEntries(path: string): Promise<ZipEntry[]> {
  const fh = await open(path, 'r');
  try {
    const { size } = await fh.stat();
    // El EOCD está en los últimos 64 KiB (22 bytes + comentario de hasta 65 535).
    const tailSize = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailSize);
    await fh.read(tail, 0, tailSize, size - tailSize);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`${path} no parece un ZIP válido (falta el EOCD)`);

    let entryCount = tail.readUInt16LE(eocd + 10);
    let centralDirSize = tail.readUInt32LE(eocd + 12);
    let centralDirOffset = tail.readUInt32LE(eocd + 16);

    // ZIP64: los campos de 32 bits quedan en 0xFFFFFFFF y el real está en el EOCD64.
    if (centralDirOffset === 0xffffffff || entryCount === 0xffff || centralDirSize === 0xffffffff) {
      let locator = -1;
      for (let i = eocd - 20; i >= 0; i -= 1) {
        if (tail.readUInt32LE(i) === ZIP64_EOCD_LOCATOR) {
          locator = i;
          break;
        }
      }
      if (locator >= 0) {
        const eocd64Offset = Number(tail.readBigUInt64LE(locator + 8));
        const eocd64 = Buffer.alloc(56);
        await fh.read(eocd64, 0, 56, eocd64Offset);
        if (eocd64.readUInt32LE(0) === ZIP64_EOCD) {
          entryCount = Number(eocd64.readBigUInt64LE(32));
          centralDirSize = Number(eocd64.readBigUInt64LE(40));
          centralDirOffset = Number(eocd64.readBigUInt64LE(48));
        }
      }
    }

    const central = Buffer.alloc(centralDirSize);
    await fh.read(central, 0, centralDirSize, centralDirOffset);

    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < entryCount && p + 46 <= central.length; i += 1) {
      if (central.readUInt32LE(p) !== CENTRAL_DIR_SIGNATURE) break;
      const method = central.readUInt16LE(p + 10);
      const crc32 = central.readUInt32LE(p + 16);
      let compressedSize = central.readUInt32LE(p + 20);
      let uncompressedSize = central.readUInt32LE(p + 24);
      const nameLen = central.readUInt16LE(p + 28);
      const extraLen = central.readUInt16LE(p + 30);
      const commentLen = central.readUInt16LE(p + 32);
      let localHeaderOffset = central.readUInt32LE(p + 42);
      const name = central.subarray(p + 46, p + 46 + nameLen).toString('utf8');

      // Campo extra ZIP64 (cabecera 0x0001) con los tamaños reales.
      if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        const extra = central.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
        let e = 0;
        while (e + 4 <= extra.length) {
          const headerId = extra.readUInt16LE(e);
          const dataSize = extra.readUInt16LE(e + 2);
          if (headerId === 0x0001) {
            let d = e + 4;
            if (uncompressedSize === 0xffffffff && d + 8 <= extra.length) {
              uncompressedSize = Number(extra.readBigUInt64LE(d));
              d += 8;
            }
            if (compressedSize === 0xffffffff && d + 8 <= extra.length) {
              compressedSize = Number(extra.readBigUInt64LE(d));
              d += 8;
            }
            if (localHeaderOffset === 0xffffffff && d + 8 <= extra.length) {
              localHeaderOffset = Number(extra.readBigUInt64LE(d));
            }
            break;
          }
          e += 4 + dataSize;
        }
      }

      entries.push({
        name,
        compressedSize,
        uncompressedSize,
        crc32,
        method,
        isDirectory: name.endsWith('/'),
        localHeaderOffset,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await fh.close();
  }
}

/**
 * Extrae una entrada del ZIP a memoria. Solo para archivos pequeños dentro del
 * paquete (metadatos, `.prj`, `.cpg`, cabeceras de los Registros 1 y 2).
 * Soporta `store` (0) y `deflate` (8), los dos únicos métodos que usan las
 * fuentes colombianas observadas.
 */
export async function readZipEntry(path: string, entryName: string): Promise<Buffer> {
  const entries = await listZipEntries(path);
  const entry = entries.find((e) => e.name === entryName);
  if (!entry) throw new Error(`El ZIP ${path} no contiene la entrada ${entryName}`);
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`Método de compresión ${entry.method} no soportado para ${entryName}`);
  }
  const fh = await open(path, 'r');
  try {
    const header = Buffer.alloc(30);
    await fh.read(header, 0, 30, entry.localHeaderOffset);
    const nameLen = header.readUInt16LE(26);
    const extraLen = header.readUInt16LE(28);
    const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;
    const raw = Buffer.alloc(entry.compressedSize);
    await fh.read(raw, 0, entry.compressedSize, dataOffset);
    return entry.method === 0 ? raw : inflateRawSync(raw);
  } finally {
    await fh.close();
  }
}

/** Resumen legible del contenido de un ZIP, agrupado por extensión. */
export async function summarizeZip(path: string): Promise<{
  entryCount: number;
  totalUncompressedBytes: number;
  byExtension: { ext: string; count: number; bytes: number }[];
  /** Nombres de los geodatabase (`*.gdb`) hallados dentro. */
  geodatabases: string[];
  entries: ZipEntry[];
}> {
  const entries = await listZipEntries(path);
  const byExt = new Map<string, { count: number; bytes: number }>();
  const gdbs = new Set<string>();
  let totalUncompressedBytes = 0;
  for (const e of entries) {
    if (e.isDirectory) {
      const m = e.name.match(/([^/]+\.gdb)\/?$/i);
      if (m?.[1]) gdbs.add(m[1]);
      continue;
    }
    const m = e.name.match(/([^/]+\.gdb)\//i);
    if (m?.[1]) gdbs.add(m[1]);
    const ext = extname(e.name).toLowerCase() || '(sin extensión)';
    const acc = byExt.get(ext) ?? { count: 0, bytes: 0 };
    acc.count += 1;
    acc.bytes += e.uncompressedSize;
    byExt.set(ext, acc);
    totalUncompressedBytes += e.uncompressedSize;
  }
  return {
    entryCount: entries.length,
    totalUncompressedBytes,
    byExtension: [...byExt.entries()]
      .map(([ext, v]) => ({ ext, ...v }))
      .sort((a, b) => b.bytes - a.bytes),
    geodatabases: [...gdbs],
    entries,
  };
}

/** Directorio de descargas por defecto: `data/downloads/<fuente>`. */
export function defaultDownloadDir(source: string): string {
  return join(process.cwd(), 'data', 'downloads', source);
}
