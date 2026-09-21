/**
 * Detección y ejecución de `ogr2ogr` (GDAL).
 *
 * El ETL de catastro carga GDB/GPKG/SHP a PostGIS con `ogr2ogr` (PLAN.md §8), así
 * que necesitamos saber si está disponible antes de prometerlo.
 *
 * Orden de búsqueda:
 *  1. `process.env.GDAL_OGR2OGR` (ruta explícita; gana siempre).
 *  2. `ogr2ogr` en el `PATH`.
 *  3. Rutas conocidas de instalaciones en Windows: PostgreSQL (EnterpriseDB trae
 *     GDAL completo con PostGIS), OSGeo4W, QGIS y Conda.
 *  4. Rutas típicas en Linux/macOS.
 *
 * En esta máquina de desarrollo el binario vive en
 * `C:\Program Files\PostgreSQL\17\bin\ogr2ogr.exe` (GDAL 3.9.2) con `gdal-data`
 * en `C:\Program Files\PostgreSQL\17\gdal-data`. Sin `GDAL_DATA` apuntando ahí,
 * `ogr2ogr` no encuentra las tablas EPSG y falla al reproyectar a 9377.
 */

import { execFile } from 'node:child_process';
import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GdalInfo {
  available: boolean;
  /** Ruta absoluta del ejecutable, o `null` si no se encontró. */
  path: string | null;
  /** Versión reportada por `ogr2ogr --version`, p. ej. `GDAL 3.9.2, released 2024/08/13`. */
  version: string | null;
  /** Versión numérica `[mayor, menor, parche]` extraída de `version`. */
  semver: readonly [number, number, number] | null;
  /** Directorio `gdal-data` (tablas EPSG, plantillas). */
  gdalDataDir: string | null;
  /** Directorio `proj`/`proj_lib` con `proj.db`. */
  projLibDir: string | null;
  /** Cómo se encontró: útil para el informe de Fase 0. */
  discoveredVia: 'env' | 'path' | 'known-location' | null;
  /** Formatos de salida relevantes, si se pudo consultar `--formats`. */
  drivers: {
    postgresql: boolean;
    openFileGdb: boolean;
    gpkg: boolean;
    shapefile: boolean;
  } | null;
  /** Mensaje en español para el catálogo cuando no está disponible. */
  notes: string[];
}

// ─── Rutas conocidas ──────────────────────────────────────────────────────────

const WINDOWS_PROGRAM_DIRS = ['C:\\Program Files', 'C:\\Program Files (x86)'];

/** Versiones de PostgreSQL que traen GDAL con el bundle de PostGIS. */
const POSTGRES_VERSIONS = ['18', '17', '16', '15', '14', '13', '12'];

function windowsCandidates(): string[] {
  const out: string[] = [];
  for (const programs of WINDOWS_PROGRAM_DIRS) {
    for (const v of POSTGRES_VERSIONS) {
      out.push(join(programs, 'PostgreSQL', v, 'bin', 'ogr2ogr.exe'));
    }
    out.push(join(programs, 'GDAL', 'ogr2ogr.exe'));
    out.push(join(programs, 'QGIS', 'bin', 'ogr2ogr.exe'));
  }
  out.push('C:\\OSGeo4W\\bin\\ogr2ogr.exe');
  out.push('C:\\OSGeo4W64\\bin\\ogr2ogr.exe');
  // QGIS instala una carpeta por versión: se resuelve por glob en `findQgisDirs`.
  return out;
}

function posixCandidates(): string[] {
  return [
    '/usr/bin/ogr2ogr',
    '/usr/local/bin/ogr2ogr',
    '/opt/homebrew/bin/ogr2ogr',
    '/opt/local/bin/ogr2ogr',
    '/snap/bin/ogr2ogr',
  ];
}

/** Carpetas `C:\Program Files\QGIS 3.x\bin` y análogas. */
async function findQgisDirs(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const out: string[] = [];
  for (const programs of WINDOWS_PROGRAM_DIRS) {
    let names: string[];
    try {
      names = await readdir(programs);
    } catch {
      continue;
    }
    for (const name of names) {
      if (/^QGIS/i.test(name)) out.push(join(programs, name, 'bin', 'ogr2ogr.exe'));
      if (/^OSGeo4W/i.test(name)) out.push(join(programs, name, 'bin', 'ogr2ogr.exe'));
    }
  }
  return out;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    const st = await stat(path);
    if (!st.isFile()) return false;
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Busca `ogr2ogr` en el `PATH` sin invocar `which`/`where`. */
async function findInPath(): Promise<string | null> {
  const pathEnv = process.env.PATH ?? '';
  const exts =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())
      : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (dir.trim() === '') continue;
    for (const ext of exts) {
      const candidate = join(dir, `ogr2ogr${ext}`);
      if (await isExecutable(candidate)) return resolve(candidate);
    }
  }
  return null;
}

// ─── Datos auxiliares de GDAL/PROJ ────────────────────────────────────────────

/**
 * Localiza `gdal-data` (tablas EPSG de GDAL) a partir del directorio del binario.
 * En el bundle de PostgreSQL está en `<prefix>/gdal-data`; en OSGeo4W en
 * `<prefix>/share/gdal`.
 */
async function findGdalData(binPath: string): Promise<string | null> {
  if (process.env.GDAL_DATA && (await dirExists(process.env.GDAL_DATA))) return process.env.GDAL_DATA;
  const bin = dirname(binPath);
  const prefix = dirname(bin);
  const candidates = [
    join(prefix, 'gdal-data'),
    join(prefix, 'share', 'gdal'),
    join(prefix, 'share', 'gdal-data'),
    join(bin, 'gdal-data'),
    join(prefix, 'Library', 'share', 'gdal'),
  ];
  for (const c of candidates) if (await dirExists(c)) return c;
  return null;
}

/** Localiza el directorio con `proj.db`. Sin él PROJ no reproyecta a EPSG:9377. */
async function findProjLib(binPath: string): Promise<string | null> {
  for (const envVar of ['PROJ_DATA', 'PROJ_LIB']) {
    const v = process.env[envVar];
    if (v && (await fileExists(join(v, 'proj.db')))) return v;
  }
  const bin = dirname(binPath);
  const prefix = dirname(bin);
  // El bundle de PostgreSQL guarda proj.db en `share/contrib/postgis-<versión>/proj`,
  // así que la versión se descubre listando el directorio en vez de fijarla.
  const contribDirs: string[] = [];
  try {
    for (const name of await readdir(join(prefix, 'share', 'contrib'))) {
      contribDirs.push(join(prefix, 'share', 'contrib', name, 'proj'));
    }
  } catch {
    // Sin `share/contrib`: no es una instalación de PostgreSQL.
  }
  const candidates = [
    ...contribDirs,
    join(prefix, 'share', 'proj'),
    join(prefix, 'proj'),
    join(prefix, 'proj-data'),
    join(prefix, 'proj_lib'),
    join(bin, 'proj'),
    join(prefix, 'Library', 'share', 'proj'),
  ];
  for (const c of candidates) if (await fileExists(join(c, 'proj.db'))) return c;
  // Último recurso: `proj.db` junto al binario o en `gdal-data`.
  if (await fileExists(join(bin, 'proj.db'))) return bin;
  return null;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Extrae `[3, 9, 2]` de `GDAL 3.9.2, released 2024/08/13`. */
export function parseGdalVersion(output: string): readonly [number, number, number] | null {
  const m = output.match(/GDAL\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// ─── Detección ────────────────────────────────────────────────────────────────

let cached: GdalInfo | null = null;

/**
 * Detecta `ogr2ogr`. El resultado se memoriza; `force` lo vuelve a calcular.
 */
export async function detectGdal(force = false): Promise<GdalInfo> {
  if (cached && !force) return cached;
  const notes: string[] = [];

  let path: string | null = null;
  let via: GdalInfo['discoveredVia'] = null;

  const fromEnv = process.env.GDAL_OGR2OGR?.trim();
  if (fromEnv && fromEnv.length > 0) {
    if (await isExecutable(fromEnv)) {
      path = resolve(fromEnv);
      via = 'env';
    } else {
      notes.push(
        `GDAL_OGR2OGR apunta a "${fromEnv}" pero ahí no hay un ejecutable; se ignora y se busca en el PATH.`,
      );
    }
  }

  if (path === null) {
    const inPath = await findInPath();
    if (inPath) {
      path = inPath;
      via = 'path';
    }
  }

  if (path === null) {
    const candidates = [
      ...(process.platform === 'win32' ? windowsCandidates() : posixCandidates()),
      ...(await findQgisDirs()),
    ];
    for (const c of candidates) {
      if (await isExecutable(c)) {
        path = resolve(c);
        via = 'known-location';
        notes.push(
          `ogr2ogr no está en el PATH; se encontró en ${path}. Conviene fijar GDAL_OGR2OGR en .env.`,
        );
        break;
      }
    }
  }

  if (path === null) {
    cached = {
      available: false,
      path: null,
      version: null,
      semver: null,
      gdalDataDir: null,
      projLibDir: null,
      discoveredVia: null,
      drivers: null,
      notes: [
        ...notes,
        'No se encontró ogr2ogr. La carga masiva de GDB/GPKG a PostGIS queda bloqueada hasta instalar GDAL (OSGeo4W, QGIS o el bundle de PostgreSQL) y fijar GDAL_OGR2OGR.',
      ],
    };
    return cached;
  }

  const gdalDataDir = await findGdalData(path);
  const projLibDir = await findProjLib(path);
  if (gdalDataDir === null) {
    notes.push(
      'No se localizó gdal-data: ogr2ogr puede fallar al resolver códigos EPSG. Fijar GDAL_DATA manualmente.',
    );
  }
  if (projLibDir === null) {
    notes.push(
      'No se localizó proj.db: la reproyección a EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional) puede fallar. Fijar PROJ_DATA/PROJ_LIB manualmente.',
    );
  }

  let version: string | null = null;
  let semver: readonly [number, number, number] | null = null;
  try {
    const { stdout } = await execFileAsync(path, ['--version'], {
      env: gdalEnv(gdalDataDir, projLibDir),
      timeout: 30_000,
      windowsHide: true,
    });
    version = stdout.trim();
    semver = parseGdalVersion(version);
  } catch (err) {
    notes.push(
      `ogr2ogr existe en ${path} pero no respondió a --version: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  let drivers: GdalInfo['drivers'] = null;
  try {
    const { stdout } = await execFileAsync(path, ['--formats'], {
      env: gdalEnv(gdalDataDir, projLibDir),
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    drivers = {
      postgresql: /(^|\s)PostgreSQL\b/m.test(stdout),
      openFileGdb: /OpenFileGDB/i.test(stdout),
      gpkg: /(^|\s)GPKG\b/m.test(stdout),
      shapefile: /ESRI Shapefile/i.test(stdout),
    };
    if (drivers.postgresql === false) {
      notes.push(
        'El ogr2ogr encontrado no trae el driver PostgreSQL: no puede escribir directo a PostGIS. Se necesitará un paso intermedio (GPKG → psql \\copy) o otro GDAL.',
      );
    }
    if (drivers.openFileGdb === false) {
      notes.push(
        'Falta el driver OpenFileGDB: no se podrán leer las geodatabase .gdb del IGAC directamente.',
      );
    }
  } catch {
    notes.push('No se pudo consultar `ogr2ogr --formats`; los drivers disponibles quedan sin verificar.');
  }

  cached = {
    available: version !== null,
    path,
    version,
    semver,
    gdalDataDir,
    projLibDir,
    discoveredVia: via,
    drivers,
    notes,
  };
  return cached;
}

/** Entorno con `GDAL_DATA` y `PROJ_*` fijados; se hereda el resto. */
function gdalEnv(gdalDataDir: string | null, projLibDir: string | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (gdalDataDir) env.GDAL_DATA = gdalDataDir;
  if (projLibDir) {
    // PROJ 6+ usa PROJ_DATA; PROJ_LIB sigue funcionando y GDAL 3.9 acepta ambos.
    env.PROJ_DATA = projLibDir;
    env.PROJ_LIB = projLibDir;
  }
  return env;
}

export interface RunOgr2OgrResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Línea de comando efectiva, sin credenciales (se enmascara `PG:`). */
  command: string;
  ms: number;
}

export interface RunOgr2OgrOptions {
  /** Directorio de trabajo del proceso. */
  cwd?: string;
  /** Milisegundos antes de matar el proceso. Por defecto 2 h (cargas grandes). */
  timeoutMs?: number;
  /** Variables de entorno extra (p. ej. `PGPASSWORD`). */
  env?: Record<string, string>;
  /** Si es false, un código de salida distinto de 0 no lanza excepción. */
  throwOnError?: boolean;
  /** Información de GDAL ya detectada, para no repetir la búsqueda. */
  gdal?: GdalInfo;
}

/**
 * Ejecuta `ogr2ogr` con `GDAL_DATA` y `PROJ_DATA`/`PROJ_LIB` correctos.
 * Los argumentos se pasan como arreglo: nunca se construye una cadena de shell,
 * así que no hay inyección posible por nombres de archivo con espacios o comillas.
 */
export async function runOgr2Ogr(
  args: readonly string[],
  opts: RunOgr2OgrOptions = {},
): Promise<RunOgr2OgrResult> {
  const gdal = opts.gdal ?? (await detectGdal());
  if (!gdal.available || gdal.path === null) {
    throw new Error(
      `No se puede ejecutar ogr2ogr: ${gdal.notes.join(' ') || 'no está disponible en este equipo.'}`,
    );
  }
  const env = { ...gdalEnv(gdal.gdalDataDir, gdal.projLibDir), ...opts.env };
  const command = `ogr2ogr ${args.map(maskArg).join(' ')}`;
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(gdal.path, [...args], {
      cwd: opts.cwd,
      env,
      timeout: opts.timeoutMs ?? 2 * 60 * 60 * 1000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, exitCode: 0, stdout, stderr, command, ms: Date.now() - started };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    const result: RunOgr2OgrResult = {
      ok: false,
      exitCode: typeof e.code === 'number' ? e.code : null,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
      command,
      ms: Date.now() - started,
    };
    if (opts.throwOnError !== false) {
      throw new Error(`ogr2ogr falló (${result.exitCode}): ${result.stderr.slice(0, 2000)}`);
    }
    return result;
  }
}

/** Oculta la contraseña de una cadena de conexión `PG:` antes de registrarla. */
function maskArg(arg: string): string {
  if (/^PG:/i.test(arg)) return arg.replace(/password=\S+/i, 'password=***');
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

/**
 * `ogrinfo` equivalente: lista las capas de un origen (GDB, GPKG, ZIP con SHP).
 * Se implementa sobre `ogr2ogr` no: se usa el binario hermano `ogrinfo` si existe
 * junto a `ogr2ogr`; si no, se devuelve `null` y el ETL usa otra vía.
 */
export async function ogrInfo(
  source: string,
  args: readonly string[] = ['-so', '-al'],
): Promise<{ ok: boolean; stdout: string; stderr: string } | null> {
  const gdal = await detectGdal();
  if (!gdal.available || gdal.path === null) return null;
  const ogrinfoPath = gdal.path.replace(/ogr2ogr(\.exe)?$/i, (m) =>
    m.toLowerCase().endsWith('.exe') ? 'ogrinfo.exe' : 'ogrinfo',
  );
  if (!(await isExecutable(ogrinfoPath))) return null;
  try {
    const { stdout, stderr } = await execFileAsync(ogrinfoPath, [...args, source], {
      env: gdalEnv(gdal.gdalDataDir, gdal.projLibDir),
      timeout: 10 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? '' };
  }
}
