#!/usr/bin/env node
/**
 * Carga del RUNAP (Registro Único Nacional de Áreas Protegidas) en `ctx.protected_area`.
 *
 * POR QUÉ ESTE CARGADOR EXISTE
 * ───────────────────────────
 * `etl/config/datasets/environment.ts` declaraba `runap-areas-protegidas` con
 * `connector: 'manual'`, `license: 'NO_VERIFICADO'` y `fieldMapping: NOT_INSPECTED`, con la
 * nota «TAREA PENDIENTE DE FASE 0: verificar si el RUNAP expone un servicio OGC». Sí lo
 * expone, y además publica el archivo completo.
 *
 * LO QUE SE INSPECCIONÓ DE VERDAD (2026-09-21)
 * ────────────────────────────────────────────
 * 1) `https://mapas.parquesnacionales.gov.co/arcgis/rest/services?f=json` → 200, carpetas
 *    ["deprecated","IGAC","Plantilla_Impresion","pnn","pruebas","runap","Utilities"].
 * 2) `.../services/pnn/runap/FeatureServer?f=json` → una capa, «Registro Unico Nacional AP»,
 *    `copyrightText: "Parques Nacionales Naturales de Colombia"`, y en `serviceDescription`
 *    la propia entidad publica la URL de descarga:
 *      «Esta es la capa con todas las áreas protegidas registradas en el registro único de
 *       áreas protegidas download_at: https://storage.googleapis.com/pnn_geodatabase/runap/latest.zip»
 *    Es decir: la URL del ZIP no es una suposición, la declara el servicio.
 * 3) `.../pnn/runap/FeatureServer/0/query?where=1=1&returnCountOnly=true` → 1 924 entidades.
 * 4) El ZIP responde 200 (69 905 046 bytes, `Last-Modified: Fri, 11 Sep 2026 01:44:37 GMT`) y
 *    contiene un Shapefile: runap.shp/.shx/.dbf/.prj/.cpg, `DBF_DATE_LAST_UPDATE=2026-09-11`,
 *    CRS MAGNA-SIRGAS geográficas (EPSG:4686), 1 924 polígonos.
 *
 * SE CARGA DEL SHAPEFILE, NO DEL SERVICIO: el FeatureServer tiene `maxRecordCount: 1000` y
 * las geometrías de los parques grandes (Chiribiquete, Serranía de la Macarena) son enormes;
 * el archivo trae exactamente las mismas 1 924 filas de una sola vez.
 *
 * NOMBRES DE CAMPO: el Shapefile los trunca a 10 caracteres. Se usan los del ARCHIVO (que es
 * lo que se lee) y se documenta al lado el nombre largo que declara el FeatureServer:
 *   objectid → OBJECTID            ap_id      → ap_id (Id Area protegida)
 *   condicion → condicion          ap_nombre  → ap_nombre (Nombre del area protegida)
 *   ap_categor → ap_categoria      ap_shape_i → ap_shape_id
 *   fecha_insc → fecha_inscrita    fecha_regi → fecha_registro
 *   organizaci → organizacion (Nombre Autoridad Ambiental)   nit → nit (NIT de la autoridad)
 *   area_ha_to/ma/te → area_ha_total/maritimo/terrestre_resolucion
 *   centroide_/centroid_1 → centroide_x / centroide_y
 *   area_ha__1/__2/__3   → area_ha_total/maritima/terrestre_geografica
 *   territoria → territorial       sirap → sirap        url → url
 *   wkid → wkid                    territor_1 → territorial_codigo
 *
 * REGLA 3 (cero datos personales) — comprobado, no supuesto:
 *   · `organizaci` tiene 1 527 filas «Parques Nacionales Naturales de Colombia», 62
 *     «Ministerio de Ambiente y Desarrollo Sostenible» y el resto Corporaciones Autónomas
 *     Regionales: SIEMPRE una persona jurídica pública, nunca una persona natural. Se verificó
 *     agrupando el campo completo.
 *   · `nit` es el NIT de esa autoridad ambiental (p. ej. 830016624 = PNN), no de un particular.
 *   · Las 1 465 Reservas Naturales de la Sociedad Civil son predios privados, pero el archivo
 *     NO trae propietario, documento, teléfono ni dirección: solo el nombre del área
 *     («Dinaboy», «Las Bromelias», «Villa Paz»), que es el nombre público del área protegida
 *     inscrita. Se comprobó fila a fila sobre una muestra y campo a campo sobre el esquema.
 *   · El cargador comprueba además que no aparezca ninguna columna de la lista negra; si
 *     apareciera, aborta.
 *
 * USO
 *   pnpm --filter @terracolombia/db load:protected-areas
 *   pnpm --filter @terracolombia/db load:protected-areas -- --no-publish
 *   pnpm --filter @terracolombia/db load:protected-areas -- --shp=ruta/al/runap.shp
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closePool, execute, query, queryOne, transaction } from '../pool.js';
import { loadEnv } from '../env.js';
import { sql } from '../sql.js';
import {
  clearValidations,
  createSnapshot,
  publishSnapshot,
  recordValidation,
  setSnapshotStatus,
  upsertDataset,
} from '../repositories/meta.js';
import { refreshOverlayPieces } from '../repositories/analytics.js';

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const NO_PUBLISH = args.includes('--no-publish');
const SHP_OVERRIDE = flag('shp');

// ─── Fuente verificada ────────────────────────────────────────────────────────

const RUNAP_FEATURESERVER =
  'https://mapas.parquesnacionales.gov.co/arcgis/rest/services/pnn/runap/FeatureServer/0';
/** URL declarada por el propio `serviceDescription` del FeatureServer. Verificada: 200, 69,9 MB. */
const RUNAP_ZIP_URL = 'https://storage.googleapis.com/pnn_geodatabase/runap/latest.zip';

const DATASET_ID = 'runap-areas-protegidas';

/**
 * Fecha de corte. NO es la fecha de consulta: el propio archivo la declara en
 * `DBF_DATE_LAST_UPDATE=2026-09-11`, que coincide con el `Last-Modified` del ZIP.
 */
const CUT_DATE = '2026-09-11';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOWNLOAD_DIR = join(REPO_ROOT, 'data', 'downloads', 'runap');
const ZIP_PATH = join(DOWNLOAD_DIR, 'runap_latest.zip');
const JSONL_PATH = join(DOWNLOAD_DIR, 'runap_4326.geojsonl');

// ─── Herramientas GDAL ────────────────────────────────────────────────────────

/**
 * `ogr2ogr` viene con PostgreSQL en Windows y necesita `PROJ_LIB` apuntando al `proj.db` de
 * PostGIS o falla con «Cannot find proj.db». Se puede sobreescribir con `OGR2OGR_BIN` y
 * `PROJ_LIB` en el entorno si la instalación está en otro sitio.
 */
const OGR2OGR_BIN = process.env.OGR2OGR_BIN ?? 'C:\\Program Files\\PostgreSQL\\17\\bin\\ogr2ogr.exe';
const PROJ_LIB_DEFAULT = 'C:\\Program Files\\PostgreSQL\\17\\share\\contrib\\postgis-3.6\\proj';

function runOgr2ogr(argv: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(OGR2OGR_BIN, [...argv], {
      env: { ...process.env, PROJ_LIB: process.env.PROJ_LIB ?? PROJ_LIB_DEFAULT },
      // `shell: false` a propósito: los argumentos llevan rutas /vsizip/ que un shell
      // (sobre todo el de Git Bash) reescribe y rompe.
      shell: false,
    });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`ogr2ogr salió con código ${code}: ${stderr.trim()}`));
    });
  });
}

async function downloadZipIfNeeded(): Promise<void> {
  if (existsSync(ZIP_PATH) && statSync(ZIP_PATH).size > 1_000_000) {
    console.log(`  · ZIP ya presente: ${ZIP_PATH} (${statSync(ZIP_PATH).size} bytes)`);
    return;
  }
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`  · descargando ${RUNAP_ZIP_URL}`);
  const res = await fetch(RUNAP_ZIP_URL, {
    headers: { 'User-Agent': process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1' },
  });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el ZIP del RUNAP: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(ZIP_PATH));
  console.log(`  · descargado (${statSync(ZIP_PATH).size} bytes)`);
}

// ─── Clasificación de la categoría ────────────────────────────────────────────

/**
 * Dominio REAL de `ap_categor`, medido con `GROUP BY` sobre las 1 924 filas del archivo el
 * 2026-09-21 (entre paréntesis, el número de filas):
 *
 *   Reserva Natural de la Sociedad Civil (1 465)  Distritos Regionales de Manejo Integrado (136)
 *   Reservas Forestales Protectoras Regionales (101)  Parques Naturales Regionales (62)
 *   Reservas Forestales Protectoras Nacionales (57)   Parque Nacional Natural (44)
 *   Distritos de Conservación de Suelos (24)         Áreas de Recreación (12)
 *   Santuario de Fauna y Flora (10)                  Distritos Nacionales de Manejo Integrado (5)
 *   Santuario de Flora (3)                           Reserva Natural (3)
 *   Área Natural Única (1)                           Vía Parque (1)
 *
 * `is_restrictive` distingue las categorías cuyo régimen legal EXCLUYE el uso productivo y la
 * vivienda (áreas de conservación estricta del SINAP) de las que admiten usos sostenibles
 * reglamentados. La clasificación sale del régimen de usos del Decreto 1076 de 2015 (que
 * compila el Decreto 2372 de 2010), no de una apreciación nuestra.
 *
 * AVISO QUE DEBE VIAJAR CON EL DATO: `is_restrictive = false` NO significa «se puede construir».
 * Toda área protegida tiene restricciones y requiere concepto de la autoridad ambiental; lo que
 * la bandera dice es si la categoría, por sí misma, excluye el uso.
 */
const NON_STRICT_CATEGORIES: ReadonlySet<string> = new Set([
  'distritos regionales de manejo integrado',
  'distritos nacionales de manejo integrado',
  'distritos de conservacion de suelos',
  'areas de recreacion',
  'reserva natural de la sociedad civil',
]);

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isRestrictive(category: string | null): boolean {
  // Sin categoría se asume restrictiva: el error de omitir una restricción es mucho más caro
  // que el de avisar de una que luego resulte menos estricta.
  if (!category) return true;
  return !NON_STRICT_CATEGORIES.has(fold(category));
}

// ─── Lista negra de PII ───────────────────────────────────────────────────────

/**
 * Columnas que, si aparecieran en el archivo, obligarían a abortar la carga (regla 3). No
 * aparecen hoy; la comprobación existe para que un cambio en la fuente no se cuele en silencio.
 */
const PII_COLUMNS = [
  'propietario',
  'nombre_propietario',
  'titular',
  'documento',
  'cedula',
  'cc',
  'telefono',
  'celular',
  'correo',
  'email',
  'direccion',
  'direccion_residencia',
];

// ─── Campos reales del Shapefile ──────────────────────────────────────────────

interface RunapProperties {
  objectid: number | null;
  ap_id: number | null;
  condicion: string | null;
  ap_nombre: string | null;
  ap_categor: string | null;
  ap_shape_i: number | null;
  fecha_insc: string | null;
  fecha_regi: string | null;
  organizaci: string | null;
  nit: string | null;
  area_ha_to: number | null;
  area_ha_ma: number | null;
  area_ha_te: number | null;
  area_ha__1: number | null;
  area_ha__2: number | null;
  area_ha__3: number | null;
  territoria: string | null;
  sirap: string | null;
  url: string | null;
  territor_1: string | null;
}

const OUT_FIELDS: readonly (keyof RunapProperties)[] = [
  'objectid',
  'ap_id',
  'condicion',
  'ap_nombre',
  'ap_categor',
  'ap_shape_i',
  'fecha_insc',
  'fecha_regi',
  'organizaci',
  'nit',
  'area_ha_to',
  'area_ha_ma',
  'area_ha_te',
  'area_ha__1',
  'area_ha__2',
  'area_ha__3',
  'territoria',
  'sirap',
  'url',
  'territor_1',
];

/**
 * `centroide_x` / `centroide_y` NO se traen: son el centroide que calculó la fuente y
 * `ctx.protected_area` no tiene columna para él; el producto mide siempre sobre la geometría.
 * `wkid` tampoco: trae valores como "0", "3115", "3116" que describen el CRS de captura
 * original de cada polígono, no el del archivo (que es 4686 para todos).
 */

// ─── Carga ────────────────────────────────────────────────────────────────────

interface LoadReport {
  read: number;
  written: number;
  emptyGeometry: number;
  missingName: number;
  restrictive: number;
  byCategory: Record<string, number>;
  unknownCategories: Record<string, number>;
}

const BATCH = 25;

async function insertBatch(
  rows: readonly { props: RunapProperties; geometry: unknown }[],
  snapshotId: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  let written = 0;
  await transaction(async (client) => {
    for (const { props, geometry } of rows) {
      const category = props.ap_categor?.trim() || null;
      const q = sql`
        WITH src AS (
          SELECT core.clean_polygon(
            ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)
          ) AS g
        )
        INSERT INTO ctx.protected_area
          (runap_id, name, category, is_restrictive, authority, declared_year, attrs, geom, snapshot_id)
        SELECT
          ${props.ap_id === null ? null : String(props.ap_id)},
          ${props.ap_nombre?.trim() || 'NO_DISPONIBLE'},
          ${category},
          ${isRestrictive(category)},
          ${props.organizaci?.trim() || null},
          -- declared_year queda NULL a propósito: la fuente no publica el año de declaratoria.
          ${null},
          ${JSON.stringify({
            // Fechas REALES del RUNAP. No son el año del acto de declaratoria.
            fecha_inscrita_runap: props.fecha_insc ?? null,
            fecha_registro_runap: props.fecha_regi ?? null,
            condicion: props.condicion ?? null,
            nit_autoridad_ambiental: props.nit ?? null,
            // Áreas que declara la resolución de creación…
            area_ha_total_resolucion: props.area_ha_to ?? null,
            area_ha_maritimo_resolucion: props.area_ha_ma ?? null,
            area_ha_terrestre_resolucion: props.area_ha_te ?? null,
            // …y las que resultan de la geometría publicada. Suelen no coincidir.
            area_ha_total_geografica: props.area_ha__1 ?? null,
            area_ha_maritima_geografica: props.area_ha__2 ?? null,
            area_ha_terrestre_geografica: props.area_ha__3 ?? null,
            territorial: props.territoria ?? null,
            territorial_codigo: props.territor_1 ?? null,
            sirap: props.sirap ?? null,
            ficha_runap_url: props.url ?? null,
            ap_shape_id: props.ap_shape_i ?? null,
            objectid_origen: props.objectid ?? null,
            advertencia:
              'La presencia de un área protegida implica restricciones de uso del suelo y ' +
              'requiere concepto de la autoridad ambiental competente. Este dato es un ' +
              'indicador de contexto, no un concepto jurídico.',
          })}::jsonb,
          src.g,
          ${snapshotId}
        FROM src
        WHERE src.g IS NOT NULL
      `.build();
      const res = await client.query(q.text, q.values);
      written += res.rowCount ?? 0;
    }
  });
  return written;
}

async function loadFromJsonl(path: string, snapshotId: number): Promise<LoadReport> {
  const report: LoadReport = {
    read: 0,
    written: 0,
    emptyGeometry: 0,
    missingName: 0,
    restrictive: 0,
    byCategory: {},
    unknownCategories: {},
  };
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let batch: { props: RunapProperties; geometry: unknown }[] = [];
  let piiFound: string[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const feature = JSON.parse(trimmed) as {
      properties: Record<string, unknown> | null;
      geometry: unknown;
    };
    report.read++;

    const raw = feature.properties ?? {};
    if (report.read === 1) {
      piiFound = Object.keys(raw).filter((k) => PII_COLUMNS.includes(fold(k).replace(/\s+/g, '_')));
    }
    const props = Object.fromEntries(
      OUT_FIELDS.map((f) => [f, (raw[f] ?? null) as never]),
    ) as unknown as RunapProperties;

    if (!feature.geometry) {
      report.emptyGeometry++;
      continue;
    }
    if (!props.ap_nombre?.trim()) report.missingName++;
    const category = props.ap_categor?.trim() || null;
    const catKey = category ?? 'NO_DISPONIBLE';
    report.byCategory[catKey] = (report.byCategory[catKey] ?? 0) + 1;
    if (category && !NON_STRICT_CATEGORIES.has(fold(category)) && !KNOWN_STRICT.has(fold(category))) {
      report.unknownCategories[category] = (report.unknownCategories[category] ?? 0) + 1;
    }
    if (isRestrictive(category)) report.restrictive++;

    batch.push({ props, geometry: feature.geometry });
    if (batch.length >= BATCH) {
      const n = await insertBatch(batch, snapshotId);
      report.written += n;
      report.emptyGeometry += batch.length - n;
      batch = [];
      process.stdout.write(`\r  · cargadas ${report.written} áreas protegidas   `);
    }
  }
  if (batch.length > 0) {
    const n = await insertBatch(batch, snapshotId);
    report.written += n;
    report.emptyGeometry += batch.length - n;
  }
  process.stdout.write('\n');

  if (piiFound.length > 0) {
    throw new Error(
      `El archivo del RUNAP trae columnas de la lista negra de PII (${piiFound.join(', ')}). ` +
        'Se aborta la carga (regla 3 de CLAUDE.md).',
    );
  }
  return report;
}

/**
 * Categorías de conservación estricta observadas el 2026-09-21. Se listan para poder AVISAR
 * cuando la fuente traiga una categoría nueva, en vez de clasificarla en silencio.
 */
const KNOWN_STRICT: ReadonlySet<string> = new Set([
  'parque nacional natural',
  'parques naturales regionales',
  'reservas forestales protectoras nacionales',
  'reservas forestales protectoras regionales',
  'santuario de fauna y flora',
  'santuario de fauna',
  'santuario de flora',
  'reserva natural',
  'area natural unica',
  'via parque',
]);

// ─── Validaciones ─────────────────────────────────────────────────────────────

async function runValidations(snapshotId: number, report: LoadReport): Promise<void> {
  await clearValidations(snapshotId);

  const expected = 1924; // Conteo del propio servicio y del Shapefile el 2026-09-21.
  await recordValidation({
    snapshotId,
    checkName: 'row_count_delta',
    severity: report.read === expected ? 'info' : 'warning',
    passed: report.read === expected,
    affectedRows: Math.abs(report.read - expected),
    message:
      `El archivo trajo ${report.read} áreas protegidas (se esperaban ${expected}, ` +
      `las que declaraba el servicio y el Shapefile el 2026-09-21) y se cargaron ${report.written}.`,
  });

  const unknown = Object.entries(report.unknownCategories);
  await recordValidation({
    snapshotId,
    checkName: 'category_domain',
    severity: unknown.length > 0 ? 'warning' : 'info',
    passed: unknown.length === 0,
    affectedRows: unknown.reduce((a, [, n]) => a + n, 0),
    message:
      unknown.length === 0
        ? 'Todas las categorías de manejo están en el dominio observado del RUNAP.'
        : 'Hay categorías de manejo nuevas: se cargaron como restrictivas por precaución y hay que clasificarlas.',
    sample: unknown.map(([c, n]) => ({ categoria: c, filas: n })),
  });

  await recordValidation({
    snapshotId,
    checkName: 'invalid_geometry',
    severity: report.emptyGeometry > 0 ? 'warning' : 'info',
    passed: report.emptyGeometry === 0,
    affectedRows: report.emptyGeometry,
    message: `${report.emptyGeometry} polígonos no sobrevivieron a core.clean_polygon y no se cargaron.`,
  });

  // `declared_year` queda NULL: la fuente NO publica el año del acto de declaratoria.
  await recordValidation({
    snapshotId,
    checkName: 'orphan_record',
    severity: 'info',
    passed: true,
    affectedRows: report.written,
    message:
      'ctx.protected_area.declared_year queda NULL (NO_DISPONIBLE): el RUNAP publica ' +
      '`fecha_inscrita` y `fecha_registro` en el RUNAP, que NO son el año del acto ' +
      'administrativo de declaratoria. Ambas fechas quedan en attrs. No se inventa el año.',
  });

  const coverage = await queryOne<{ munis: number; total: number; area_km2: number }>(sql`
    SELECT
      (SELECT count(DISTINCT m.code)::int
         FROM core.municipality m
         JOIN ctx.protected_area p ON p.snapshot_id = ${snapshotId} AND ST_Intersects(m.geom, p.geom)
        WHERE m.geom IS NOT NULL) AS munis,
      (SELECT count(*)::int FROM core.municipality) AS total,
      (SELECT round((core.area_m2(ST_Union(p.geom)) / 1000000)::numeric, 1)
         FROM ctx.protected_area p WHERE p.snapshot_id = ${snapshotId}) AS area_km2
  `);
  await recordValidation({
    snapshotId,
    checkName: 'coverage_partial',
    severity: 'info',
    passed: true,
    affectedRows: coverage?.munis ?? 0,
    message:
      `El RUNAP toca ${coverage?.munis ?? 0} de ${coverage?.total ?? 0} municipios; ` +
      `${coverage?.area_km2 ?? 0} km² de áreas protegidas (medidos en EPSG:9377, con solapes disueltos). ` +
      'Es un registro nacional completo: un municipio sin área protegida no es un hueco de datos.',
    sample: Object.entries(report.byCategory).map(([c, n]) => ({ categoria: c, filas: n })),
  });

  const outside = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ctx.protected_area
    WHERE snapshot_id = ${snapshotId}
      AND NOT ST_Intersects(geom, ST_MakeEnvelope(-85.0, -4.5, -66.5, 16.0, 4326))
  `);
  await recordValidation({
    snapshotId,
    checkName: 'outside_colombia',
    severity: (outside?.n ?? 0) > 0 ? 'error' : 'info',
    passed: (outside?.n ?? 0) === 0,
    affectedRows: outside?.n ?? 0,
    message:
      (outside?.n ?? 0) === 0
        ? 'Todas las áreas caen dentro de la extensión de Colombia (incluida el área marina y Malpelo).'
        : 'Hay áreas fuera de la extensión de Colombia: revisa la reproyección.',
  });
}

// ─── Principal ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();
  console.log('Cargando el RUNAP (Parques Nacionales) en ctx.protected_area');
  console.log(`  servicio inspeccionado: ${RUNAP_FEATURESERVER}`);
  console.log(`  archivo:                ${RUNAP_ZIP_URL}\n`);

  let source: string;
  if (SHP_OVERRIDE) {
    source = SHP_OVERRIDE;
    if (!existsSync(source)) throw new Error(`No existe el Shapefile indicado: ${source}`);
  } else {
    await downloadZipIfNeeded();
    // `/vsizip/` lee el Shapefile dentro del ZIP sin descomprimirlo.
    source = `/vsizip/${ZIP_PATH.replace(/\\/g, '/')}/runap.shp`;
  }

  console.log('  · convirtiendo a GeoJSON (una entidad por línea) en EPSG:4326');
  await runOgr2ogr([
    '-f',
    'GeoJSONSeq',
    '-t_srs',
    'EPSG:4326',
    '-lco',
    'RS=NO',
    '-select',
    OUT_FIELDS.join(','),
    '-overwrite',
    JSONL_PATH,
    source,
  ]);
  console.log(`  · escrito ${JSONL_PATH} (${statSync(JSONL_PATH).size} bytes)`);

  await upsertDataset({
    id: DATASET_ID,
    source: 'PNN — RUNAP',
    name: 'Registro Único Nacional de Áreas Protegidas (RUNAP)',
    description:
      'Todas las áreas protegidas inscritas en el Registro Único Nacional de Áreas Protegidas, ' +
      'con categoría de manejo, autoridad ambiental, fechas de inscripción y registro, áreas de ' +
      'resolución y áreas geográficas. 14 categorías de manejo del SINAP.',
    license:
      'NO_DECLARADA por la fuente: el FeatureServer solo trae `copyrightText: "Parques ' +
      'Nacionales Naturales de Colombia"` y el ZIP no incluye archivo de licencia. Se registra ' +
      'el régimen general de datos abiertos del Estado colombiano (Ley 1712 de 2014). ' +
      'PENDIENTE confirmar con Parques Nacionales antes de redistribuir el dato derivado.',
    attribution:
      'Fuente: Parques Nacionales Naturales de Colombia, Registro Único Nacional de Áreas ' +
      `Protegidas (RUNAP), corte ${CUT_DATE}`,
    url: RUNAP_FEATURESERVER,
    frequency: 'eventual',
    connector: 'file-download',
    format: 'shp',
    source_srid: 4686,
    target_table: 'ctx.protected_area',
    share_alike: false,
    notes:
      'Verificado el 2026-09-21. La URL del ZIP la declara el propio `serviceDescription` del ' +
      'FeatureServer. La fecha de corte sale de `DBF_DATE_LAST_UPDATE` del Shapefile y coincide ' +
      'con el `Last-Modified` del ZIP. Los nombres de campo están truncados a 10 caracteres ' +
      'porque la fuente es un Shapefile. `declared_year` queda NO_DISPONIBLE: la fuente no ' +
      'publica el año del acto de declaratoria. Sin PII: `organizacion` es siempre una autoridad ' +
      'ambiental (persona jurídica pública) y `nit` es el NIT de esa autoridad.',
  });

  const snapshot = await createSnapshot({
    datasetId: DATASET_ID,
    cutDate: CUT_DATE,
    isSynthetic: false,
    sourceUrl: RUNAP_ZIP_URL,
    stageMethod: 'ogr2ogr',
  });

  const removed = await execute(
    sql`DELETE FROM ctx.protected_area WHERE snapshot_id = ${snapshot.id}`,
  );
  if (removed > 0) console.log(`  · se vaciaron ${removed} filas de una corrida anterior del mismo corte`);

  await setSnapshotStatus(snapshot.id, 'staged');
  const report = await loadFromJsonl(JSONL_PATH, snapshot.id);
  await runValidations(snapshot.id, report);

  await setSnapshotStatus(snapshot.id, 'transformed', {
    rowCount: report.written,
    stats: {
      fecha_de_corte_declarada_por_la_fuente: CUT_DATE,
      origen_fecha_de_corte: 'DBF_DATE_LAST_UPDATE del Shapefile y Last-Modified del ZIP',
      licencia_declarada_por_la_fuente: 'NO_DECLARADA (solo copyrightText)',
      entidades_leidas: report.read,
      areas_cargadas: report.written,
      sin_geometria_utilizable: report.emptyGeometry,
      sin_nombre: report.missingName,
      categorias_restrictivas: report.restrictive,
      categorias_no_restrictivas: report.written - report.restrictive,
      por_categoria: report.byCategory,
      categorias_nuevas_sin_clasificar: report.unknownCategories,
      declared_year: 'NO_DISPONIBLE — la fuente no publica el año del acto de declaratoria',
      advertencia:
        'is_restrictive = false NO significa que se pueda construir: toda área protegida tiene ' +
        'restricciones de uso y requiere concepto de la autoridad ambiental.',
    },
  });

  if (NO_PUBLISH) {
    console.log(`\n  corte ${snapshot.id} dejado en 'transformed' (--no-publish).`);
    return;
  }
  await publishSnapshot(snapshot.id);
  // El agregado por celda cruza estas figuras troceadas (migración 0016); con el corte
  // nuevo activo, las piezas viejas ya no valen.
  for (const l of await refreshOverlayPieces()) {
    if (l.refreshed) console.log(`Piezas de ${l.layer} regeneradas: ${l.n_pieces}`);
  }
  console.log(`\n  publicado corte ${snapshot.id}: ${report.written} áreas protegidas.`);

  // Retira la demostración: no pueden convivir dos capas activas del mismo tema.
  const retired = await execute(sql`
    UPDATE meta.snapshot SET is_active = FALSE, status = 'superseded'
    WHERE dataset_id = 'demo-protected' AND is_active AND is_synthetic
  `);
  console.log(
    retired > 0
      ? '  corte sintético `demo-protected` despublicado.'
      : '  no había corte sintético `demo-protected` activo que despublicar.',
  );

  const summary = await query<{ category: string; n: number; restrictive: number }>(sql`
    SELECT p.category, count(*)::int AS n, count(*) FILTER (WHERE p.is_restrictive)::int AS restrictive
    FROM ctx.protected_area p
    JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
    GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log('\nctx.protected_area activo:');
  for (const r of summary) {
    console.log(`  ${(r.category ?? 'NO_DISPONIBLE').padEnd(48)} ${String(r.n).padStart(5)}  (restrictivas: ${r.restrictive})`);
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('\nLa carga del RUNAP falló:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
