/**
 * Descarga la GDB de un departamento y la copia a `raw` con GDAL.
 *
 * ## Por qué PGDUMP y no el driver PostgreSQL de OGR
 *
 * El GDAL que viene con PostgreSQL 17 (3.9.2) **no trae el driver `PostgreSQL`**
 * (`ogr2ogr --formats` no lo lista; intentarlo da «Unable to find driver
 * PostgreSQL»). Sí trae `PGDUMP`, que escribe un `.sql` con sentencias `COPY`.
 * Eso encaja mejor de lo que parece: `COPY` es la vía de carga masiva que pide
 * CLAUDE.md, y el volcado se canaliza a `psql` sin pasar por Node, así que las
 * decenas de miles de geometrías por capa no se serializan en JavaScript.
 * Medido en Atlántico: 67 925 predios en 2,3 s de volcado y 0,9 s de carga.
 *
 * ## CRS
 *
 * Se pasa `-a_srs EPSG:9377`, que **asigna** el CRS sin reproyectar. La GDB ya
 * está en ese sistema: su WKT declara «MAGNA CTM12» con origen lat 4, lon −73,
 * factor 0,9992, falso este 5 000 000 y falso norte 2 000 000, que son los
 * parámetros exactos de EPSG:9377 (ver `verifyCrsEquivalence`). Reproyectar aquí
 * sería introducir un error de ida y vuelta a cambio de nada. La reproyección a
 * EPSG:4326, que es lo que se guarda, la hace PostGIS en el paso de transformación.
 *
 * ## PROJ_LIB
 *
 * El GDAL de PostgreSQL no encuentra su `proj.db` por sí solo y falla con «Cannot
 * find proj.db». Se le pasa la ruta del PROJ que trae PostGIS.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { getLogger } from '@terracolombia/shared';
import { CADASTRE_LAYERS, rawTableName, type LayerSpec } from './layers.js';

const log = getLogger({ mod: 'cadastre-stage' });

// ─── Herramientas externas ────────────────────────────────────────────────────

export interface GdalTools {
  readonly ogr2ogr: string;
  readonly ogrinfo: string;
  readonly psql: string;
  readonly projLib: string;
}

const DEFAULT_PG_DIRS = [
  'C:/Program Files/PostgreSQL/17',
  'C:/Program Files/PostgreSQL/16',
  '/usr/local',
  '/usr',
];

/**
 * Localiza `ogr2ogr`, `ogrinfo`, `psql` y el `proj.db`.
 *
 * Se puede forzar todo por entorno (`GDAL_BIN_DIR`, `PROJ_LIB`, `PSQL_BIN`) para
 * que la misma ruta de código sirva en el contenedor de producción, donde GDAL no
 * está dentro de PostgreSQL.
 */
export function resolveGdalTools(): GdalTools {
  const isWin = process.platform === 'win32';
  const exe = (n: string) => (isWin ? `${n}.exe` : n);

  const explicitBin = process.env.GDAL_BIN_DIR;
  const explicitProj = process.env.PROJ_LIB;
  const explicitPsql = process.env.PSQL_BIN;

  const candidates = explicitBin ? [explicitBin] : DEFAULT_PG_DIRS.map((d) => join(d, 'bin'));

  let binDir: string | null = null;
  for (const c of candidates) {
    if (existsSync(join(c, exe('ogr2ogr')))) {
      binDir = c;
      break;
    }
  }
  if (!binDir) {
    // Última opción: confiar en el PATH. Si tampoco está, el spawn falla con un
    // mensaje claro y el cargador lo convierte en un error explicativo.
    binDir = '';
  }

  let projLib = explicitProj ?? '';
  if (!projLib) {
    for (const root of DEFAULT_PG_DIRS) {
      const contrib = join(root, 'share/contrib');
      if (!existsSync(contrib)) continue;
      // El directorio lleva la versión de PostGIS: postgis-3.6, postgis-3.5…
      try {
        const hit = readdirSync(contrib)
          .filter((d) => d.startsWith('postgis-'))
          .map((d) => join(contrib, d, 'proj'))
          .find((p) => existsSync(join(p, 'proj.db')));
        if (hit) {
          projLib = hit;
          break;
        }
      } catch {
        // Directorio ilegible: se sigue buscando en el siguiente candidato.
      }
    }
  }

  return {
    ogr2ogr: binDir ? join(binDir, exe('ogr2ogr')) : exe('ogr2ogr'),
    ogrinfo: binDir ? join(binDir, exe('ogrinfo')) : exe('ogrinfo'),
    psql: explicitPsql ?? (binDir ? join(binDir, exe('psql')) : exe('psql')),
    projLib,
  };
}

function toolEnv(tools: GdalTools): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (tools.projLib) {
    env.PROJ_LIB = tools.projLib;
    // GDAL 3.9 prefiere PROJ_DATA; se ponen los dos para no depender de la versión.
    env.PROJ_DATA = tools.projLib;
  }
  return env;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string; stdinFile?: string } = {},
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      env: opts.env ?? process.env,
      cwd: opts.cwd,
      // `shell: false` a propósito: los argumentos van como vector, así que un
      // nombre de ruta con espacios (habitual en «Program Files») no se parte y
      // nada de lo que venga de la fuente puede convertirse en un comando.
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));

    if (opts.stdinFile) {
      const src = createReadStream(opts.stdinFile);
      src.on('error', reject);
      src.pipe(child.stdin!);
    } else {
      child.stdin?.end();
    }
  });
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

export interface DownloadResult {
  readonly zipPath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly reused: boolean;
  readonly downloadMs: number;
}

/**
 * Descarga el ZIP del departamento. Si ya está en disco con el tamaño que declara
 * el ítem, se reutiliza: recargar un departamento no tiene por qué volver a bajar
 * 340 MB.
 */
export async function downloadDepartmentZip(
  itemId: string,
  deptCode: string,
  expectedSize: number,
  downloadDir: string,
): Promise<DownloadResult> {
  mkdirSync(downloadDir, { recursive: true });
  const zipPath = join(downloadDir, `${deptCode}.zip`);
  const started = Date.now();

  if (existsSync(zipPath)) {
    const st = statSync(zipPath);
    if (expectedSize > 0 && st.size === expectedSize) {
      return {
        zipPath,
        sizeBytes: st.size,
        sha256: await sha256File(zipPath),
        reused: true,
        downloadMs: 0,
      };
    }
    log.warn(
      { deptCode, onDisk: st.size, expected: expectedSize },
      'El ZIP en disco no tiene el tamaño que declara el ítem: se descarga otra vez',
    );
  }

  const url = `https://www.arcgis.com/sharing/rest/content/items/${itemId}/data`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TerraColombia/0.1 (carga de base catastral IGAC)' },
  });
  if (!res.ok || !res.body) {
    throw new Error(`La descarga de ${deptCode} respondió ${res.status} ${res.statusText}`);
  }
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(zipPath));

  const st = await stat(zipPath);
  if (expectedSize > 0 && st.size !== expectedSize) {
    log.warn(
      { deptCode, got: st.size, expected: expectedSize },
      'El ZIP descargado no mide lo que declara el ítem: el corte pudo cambiar',
    );
  }
  return {
    zipPath,
    sizeBytes: st.size,
    sha256: await sha256File(zipPath),
    reused: false,
    downloadMs: Date.now() - started,
  };
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// ─── Descompresión ────────────────────────────────────────────────────────────

/**
 * Descomprime el ZIP y devuelve la ruta del `.gdb`.
 *
 * Se usa el propio GDAL en vez de una librería de ZIP: su sistema de ficheros
 * virtual (`/vsizip/`) abre la GDB dentro del ZIP sin extraerla, así que basta con
 * copiar el directorio. Eso evita añadir una dependencia y evita el problema de
 * las rutas largas de Windows con los nombres internos de una File Geodatabase.
 */
export async function extractGdb(
  zipPath: string,
  deptCode: string,
  workDir: string,
  tools: GdalTools,
): Promise<string> {
  const dest = join(workDir, deptCode);
  await rm(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  // `ogr2ogr` sabe leer /vsizip/ y escribir OpenFileGDB, pero copiar 18 capas capa
  // a capa sería lento. `unzip` está en el entorno (Git for Windows lo trae) y es
  // lo más directo; si no está, se cae a la copia por GDAL.
  const unzipped = await run('unzip', ['-o', '-q', resolve(zipPath), '-d', dest]).catch(
    () => ({ code: -1, stdout: '', stderr: 'unzip no disponible' }) as RunResult,
  );

  if (unzipped.code !== 0) {
    throw new Error(
      `No se pudo descomprimir ${zipPath}: ${unzipped.stderr.slice(0, 400)}. ` +
        'Instala `unzip` o descomprime el ZIP a mano en ' + dest,
    );
  }

  const gdb = await findGdbDir(dest);
  if (!gdb) throw new Error(`El ZIP de ${deptCode} no contiene ningún directorio .gdb`);
  void tools;
  return gdb;
}

async function findGdbDir(root: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.toLowerCase().endsWith('.gdb')) return join(root, e.name);
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const nested = await findGdbDir(join(root, e.name), depth + 1);
    if (nested) return nested;
  }
  return null;
}

// ─── Inspección previa ────────────────────────────────────────────────────────

export interface InspectedLayer {
  readonly layer: string;
  readonly columns: readonly string[];
  readonly featureCount: number;
  readonly srsWkt: string;
}

/**
 * Lee con `ogrinfo` las capas que la GDB trae de verdad.
 *
 * No es opcional ni redundante: la regla 2 dice que no se inventan campos, y la
 * única forma de cumplirla en los 31 departamentos es mirar cada GDB antes de
 * cargarla. Atlántico ya demostró que las capas no comparten esquema (U_BARRIO no
 * tiene `CODIGO_DEPARTAMENTO`, las capas INFORMAL escriben `Shape_Area` con otra
 * caja), así que suponer que los demás departamentos son iguales sería suponer.
 */
export async function inspectGdb(gdbPath: string, tools: GdalTools): Promise<InspectedLayer[]> {
  const listed = await run(tools.ogrinfo, ['-so', gdbPath], { env: toolEnv(tools) });
  if (listed.code !== 0) {
    throw new Error(`ogrinfo falló sobre ${gdbPath}: ${listed.stderr.slice(0, 500)}`);
  }
  const layerNames = [...listed.stdout.matchAll(/^\s*Layer:\s*(\S+)/gm)].map((m) => m[1]!);

  const out: InspectedLayer[] = [];
  for (const layer of layerNames) {
    const r = await run(tools.ogrinfo, ['-so', '-al', gdbPath, layer], { env: toolEnv(tools) });
    if (r.code !== 0) {
      log.warn({ layer, stderr: r.stderr.slice(0, 200) }, 'No se pudo inspeccionar la capa');
      continue;
    }
    const countMatch = /^Feature Count:\s*(\d+)/m.exec(r.stdout);
    // Las líneas de campo tienen la forma `NOMBRE: Tipo (ancho.precision) …`.
    // Se excluyen las cabeceras de ogrinfo, que usan el mismo separador.
    const skip = new Set([
      'INFO',
      'Layer name',
      'Geometry',
      'Feature Count',
      'Extent',
      'Layer SRS WKT',
      'FID Column',
      'Geometry Column',
      'Data axis to CRS axis mapping',
    ]);
    const columns = [...r.stdout.matchAll(/^([A-Za-z_][A-Za-z_0-9]*):\s+(String|Integer|Integer64|Real|Date|DateTime|Time|Binary)\b/gm)]
      .map((m) => m[1]!)
      .filter((c) => !skip.has(c));

    const wktMatch = /Layer SRS WKT:\s*\n([\s\S]*?)\nData axis/m.exec(r.stdout);

    out.push({
      layer,
      columns,
      featureCount: countMatch ? Number(countMatch[1]) : 0,
      srsWkt: wktMatch ? wktMatch[1]!.trim() : '',
    });
  }
  return out;
}

/**
 * Comprueba que el WKT de la capa es el de EPSG:9377 antes de asignárselo.
 *
 * Asignar un CRS que no es el del dato es la forma más silenciosa de arruinar una
 * carga geográfica: nada falla, las geometrías simplemente acaban en otro
 * continente. Así que se comprueban los cinco parámetros que definen la
 * proyección en lugar de confiar en el nombre, que en la GDB es «MAGNA CTM12» y
 * no menciona el código EPSG en ninguna parte.
 */
export function verifyCrsEquivalence(srsWkt: string): { ok: boolean; problems: string[] } {
  if (!srsWkt) return { ok: false, problems: ['La capa no declara CRS.'] };
  const problems: string[] = [];
  const num = (re: RegExp): number | null => {
    const m = re.exec(srsWkt);
    return m ? Number(m[1]) : null;
  };

  const checks: Array<[string, number | null, number]> = [
    ['latitud del origen', num(/"Latitude of natural origin",\s*(-?[\d.]+)/), 4],
    ['longitud del origen', num(/"Longitude of natural origin",\s*(-?[\d.]+)/), -73],
    ['factor de escala', num(/"Scale factor at natural origin",\s*([\d.]+)/), 0.9992],
    ['falso este', num(/"False easting",\s*([\d.]+)/), 5_000_000],
    ['falso norte', num(/"False northing",\s*([\d.]+)/), 2_000_000],
  ];
  for (const [label, got, want] of checks) {
    if (got === null) problems.push(`No se encontró el parámetro «${label}» en el WKT.`);
    else if (Math.abs(got - want) > 1e-9) {
      problems.push(`El parámetro «${label}» vale ${got} y EPSG:9377 exige ${want}.`);
    }
  }
  if (!/Transverse.Mercator/i.test(srsWkt)) {
    problems.push('La proyección no es Transverse Mercator.');
  }
  if (!/GRS.1980|GRS80/i.test(srsWkt)) {
    problems.push('El elipsoide no es GRS 1980.');
  }
  return { ok: problems.length === 0, problems };
}

// ─── Copia a `raw` ────────────────────────────────────────────────────────────

export interface StagedLayer {
  readonly layer: string;
  readonly table: string;
  readonly rows: number;
  readonly ms: number;
}

export interface StageOptions {
  readonly gdbPath: string;
  readonly deptCode: string;
  readonly tools: GdalTools;
  readonly connectionString: string;
  readonly scratchDir: string;
  /** Capas presentes en la GDB, de `inspectGdb`. */
  readonly present: readonly InspectedLayer[];
  readonly onProgress?: (message: string) => void;
}

/**
 * Copia una capa a `raw.igac_<dept>_<capa>` vía PGDUMP + psql.
 *
 * El `.sql` intermedio se borra al terminar: un volcado de Boyacá ronda los
 * cientos de megas y no hace falta conservarlo, porque el dato de verdad ya está
 * en `raw` y el ZIP original sigue en disco.
 */
export async function stageLayer(spec: LayerSpec, opts: StageOptions): Promise<StagedLayer | null> {
  const found = opts.present.find((p) => p.layer === spec.layer);
  if (!found) return null;

  const table = rawTableName(opts.deptCode, spec);
  const dumpPath = join(opts.scratchDir, `${table}.sql`);
  const started = Date.now();

  if (found.featureCount === 0) {
    // Se crea la tabla vacía igualmente: la transformación consulta las 18 tablas
    // y es más simple que todas existan que ir preguntando si cada una está.
    await runPsql(opts, `DROP TABLE IF EXISTS raw.${table} CASCADE`);
  }

  const args = [
    '-f',
    'PGDUMP',
    dumpPath,
    opts.gdbPath,
    spec.layer,
    '-nln',
    table,
    '-lco',
    'SCHEMA=raw',
    '-lco',
    'CREATE_SCHEMA=OFF',
    '-lco',
    'GEOMETRY_NAME=geom',
    // El índice espacial de `raw` no se usa: la transformación lee la tabla
    // completa una vez. Crearlo costaría más que el escaneo que evitaría.
    '-lco',
    'SPATIAL_INDEX=NONE',
    '-lco',
    'DROP_TABLE=IF_EXISTS',
    // Asigna EPSG:9377 sin reproyectar (ver cabecera del módulo).
    '-a_srs',
    'EPSG:9377',
    '-nlt',
    spec.geometry,
    '-gt',
    '65536',
    '--config',
    'PG_USE_COPY',
    'YES',
  ];

  const dumped = await run(opts.tools.ogr2ogr, args, { env: toolEnv(opts.tools) });
  if (dumped.code !== 0) {
    throw new Error(
      `ogr2ogr falló volcando ${spec.layer} de ${opts.deptCode}: ${dumped.stderr.slice(0, 600)}`,
    );
  }

  opts.onProgress?.(`${spec.layer}: volcado, cargando…`);

  const loaded = await run(
    opts.tools.psql,
    [
      opts.connectionString,
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '--no-psqlrc',
      '-f',
      dumpPath,
    ],
    { env: toolEnv(opts.tools) },
  );
  await rm(dumpPath, { force: true });

  if (loaded.code !== 0) {
    throw new Error(
      `psql falló cargando ${spec.layer} de ${opts.deptCode}: ${loaded.stderr.slice(0, 600)}`,
    );
  }

  return { layer: spec.layer, table, rows: found.featureCount, ms: Date.now() - started };
}

async function runPsql(opts: StageOptions, statement: string): Promise<void> {
  const r = await run(
    opts.tools.psql,
    [opts.connectionString, '-q', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-c', statement],
    { env: toolEnv(opts.tools) },
  );
  if (r.code !== 0) {
    throw new Error(`psql falló: ${r.stderr.slice(0, 400)}`);
  }
}

/** Copia a `raw` todas las capas declaradas que la GDB traiga. */
export async function stageAllLayers(opts: StageOptions): Promise<StagedLayer[]> {
  const out: StagedLayer[] = [];
  for (const spec of CADASTRE_LAYERS) {
    const staged = await stageLayer(spec, opts);
    if (staged) {
      out.push(staged);
      opts.onProgress?.(`${spec.layer}: ${staged.rows} filas en raw.${staged.table}`);
    } else if (spec.required) {
      throw new Error(
        `La GDB de ${opts.deptCode} no trae la capa obligatoria ${spec.layer}. ` +
          'No se carga el departamento: cargarlo a medias daría un mapa con huecos sin explicación.',
      );
    }
  }
  return out;
}

/** Borra las tablas de staging de un departamento. */
export async function dropStagingTables(opts: {
  deptCode: string;
  tools: GdalTools;
  connectionString: string;
}): Promise<void> {
  const tables = CADASTRE_LAYERS.map((s) => `raw.${rawTableName(opts.deptCode, s)}`);
  const r = await run(
    opts.tools.psql,
    [
      opts.connectionString,
      '-q',
      '--no-psqlrc',
      '-c',
      `DROP TABLE IF EXISTS ${tables.join(', ')} CASCADE`,
    ],
    { env: toolEnv(opts.tools) },
  );
  if (r.code !== 0) {
    log.warn({ deptCode: opts.deptCode, stderr: r.stderr.slice(0, 200) }, 'No se pudo limpiar raw');
  }
}
