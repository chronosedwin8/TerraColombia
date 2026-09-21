#!/usr/bin/env node
/**
 * Carga de los límites municipales y departamentales del IGAC.
 *
 * Es un cargador aparte de `seed.ts` a propósito: `pnpm db:seed` debe seguir corriendo en
 * segundos y sin depender de una descarga de ~100 MB que el servicio del IGAC sirve a
 * trompicones. Aquí lo importante es la terquedad (reintentos, lotes pequeños), no la rapidez.
 *
 * NO crea municipios ni departamentos: cruza por código DIVIPOLA contra las filas que ya
 * sembró `divipola.ts` y solo hace `UPDATE ... SET geom`. Un código que no exista en la base
 * se cuenta y se informa, nunca se inserta.
 *
 * Uso:
 *   pnpm --filter @terracolombia/db load:boundaries
 *   pnpm --filter @terracolombia/db load:boundaries -- --only=departments
 */
import type pg from 'pg';
import { closePool, execute, query, queryOne, transaction } from '../pool.js';
import { loadEnv } from '../env.js';
import { sql } from '../sql.js';
import {
  DEPARTMENT_LAYER_ID,
  DEPARTMENT_OUT_FIELDS,
  IGAC_BOUNDARIES_DATASET,
  IGAC_BOUNDARIES_SERVICE,
  MUNICIPALITY_LAYER_ID,
  MUNICIPALITY_OUT_FIELDS,
  fetchLayerBatches,
  normalizeDivipolaCode,
  type DepartmentProperties,
  type GeoJsonSurface,
  type MunicipalityProperties,
} from '../seed/admin-boundaries.js';
import {
  createSnapshot,
  publishSnapshot,
  recordValidation,
  setSnapshotStatus,
  upsertDataset,
} from '../repositories/meta.js';

const args = process.argv.slice(2);
function flag(name: string): string | null {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const ONLY = flag('only'); // 'departments' | 'municipalities' | null
/**
 * Reanudación. El servicio del IGAC se cae a mitad de una descarga de 45 páginas con
 * facilidad; volver a empezar desde cero cuesta media hora. `--from=N` retoma en la página
 * que toque. El cruce es por código, así que repetir filas ya cargadas es inofensivo.
 */
const FROM = Number(flag('from') ?? '0');

/**
 * El servicio no publica fecha de corte (ni `editingInfo`, ni `licenseInfo`). La fecha de
 * consulta es lo único cierto que se puede afirmar, y así se declara en `stats` para que
 * la UI no la presente como fecha de publicación de la fuente (regla 4 de CLAUDE.md).
 */
const CONSULTED_ON = new Date().toISOString().slice(0, 10);

interface LoadOutcome {
  updated: number;
  /** Códigos que llegaron del servicio pero no existen en la base. */
  unknownCodes: string[];
  /** Códigos que llegaron con geometría inservible tras `core.clean_polygon`. */
  emptyGeometry: string[];
  /** Códigos que el servicio trae pero no son entidades DIVIPOLA (área en litigio). */
  skipped: string[];
  /**
   * Códigos DIVIPOLA que la fuente SÍ publica. Sirve para saber cuáles NO publica, que es
   * lo que decide qué límites hay que derivar, y lo decide igual en cada corrida.
   */
  officialCodes: string[];
}

function emptyOutcome(): LoadOutcome {
  return { updated: 0, unknownCodes: [], emptyGeometry: [], skipped: [], officialCodes: [] };
}

/**
 * Escribe una geometría en la tabla indicada.
 *
 * `core.clean_polygon` se evalúa una sola vez en un CTE porque también alimenta el área:
 * repetir la llamada en cada columna duplicaría el `ST_MakeValid` de un polígono que puede
 * tener cientos de miles de vértices.
 *
 * `area_km2` NO se toma del campo de la fuente (`MpArea`/`DeArea`): la convención del
 * proyecto es medir en EPSG:9377. El valor de la fuente se usa después solo para contrastar.
 */
async function updateGeometry(
  client: pg.PoolClient,
  table: 'core.department' | 'core.municipality',
  code: string,
  geometry: GeoJsonSurface,
  snapshotId: number,
): Promise<number> {
  // El nombre de tabla no viene de entrada externa: es una de las dos constantes de arriba.
  const builder =
    table === 'core.department'
      ? sql`
          WITH src AS (
            SELECT core.clean_polygon(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)) AS g
          )
          UPDATE core.department t
          SET geom = src.g,
              area_km2 = round((core.area_m2(src.g) / 1000000)::numeric, 4),
              geom_snapshot_id = ${snapshotId}
          FROM src
          WHERE t.code = ${code} AND src.g IS NOT NULL
        `
      : sql`
          WITH src AS (
            SELECT core.clean_polygon(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)) AS g
          )
          UPDATE core.municipality t
          SET geom = src.g,
              area_km2 = round((core.area_m2(src.g) / 1000000)::numeric, 4),
              geom_snapshot_id = ${snapshotId}
          FROM src
          WHERE t.code = ${code} AND src.g IS NOT NULL
        `;
  const q = builder.build();
  const res = await client.query(q.text, q.values);
  return res.rowCount ?? 0;
}

async function loadMunicipalities(snapshotId: number): Promise<LoadOutcome> {
  const known = new Set(
    (await query<{ code: string }>(sql`SELECT code FROM core.municipality`)).map((r) =>
      r.code.trim(),
    ),
  );
  const out = emptyOutcome();
  let seen = 0;

  for await (const batch of fetchLayerBatches<MunicipalityProperties>(
    MUNICIPALITY_LAYER_ID,
    MUNICIPALITY_OUT_FIELDS,
    'MpCodigo',
    { startOffset: Number.isFinite(FROM) && FROM > 0 ? FROM : 0 },
  )) {
    // Una transacción por lote: si el servicio falla a mitad de la descarga, lo ya escrito
    // queda consistente y basta con volver a lanzar el cargador.
    await transaction(async (client) => {
      for (const f of batch) {
        seen++;
        const code = normalizeDivipolaCode(f.properties.MpCodigo, 5);
        if (!code) {
          out.skipped.push(f.properties.MpCodigo ?? '(nulo)');
          continue;
        }
        if (!known.has(code)) {
          out.unknownCodes.push(code);
          continue;
        }
        const n = await updateGeometry(client, 'core.municipality', code, f.geometry, snapshotId);
        if (n > 0) out.updated++;
        else out.emptyGeometry.push(code);
      }
    });
    process.stdout.write(`\r  · municipios: ${out.updated}/${seen} con geometría`);
  }
  process.stdout.write('\n');
  return out;
}

async function loadDepartments(snapshotId: number): Promise<LoadOutcome> {
  const known = new Set(
    (await query<{ code: string }>(sql`SELECT code FROM core.department`)).map((r) =>
      r.code.trim(),
    ),
  );
  const out = emptyOutcome();

  for await (const batch of fetchLayerBatches<DepartmentProperties>(
    DEPARTMENT_LAYER_ID,
    DEPARTMENT_OUT_FIELDS,
    'DeCodigo',
    { pageSize: 5 },
  )) {
    await transaction(async (client) => {
      for (const f of batch) {
        const code = normalizeDivipolaCode(f.properties.DeCodigo, 2);
        if (!code) {
          out.skipped.push(f.properties.DeCodigo ?? '(nulo)');
          continue;
        }
        out.officialCodes.push(code);
        if (!known.has(code)) {
          out.unknownCodes.push(code);
          continue;
        }
        const n = await updateGeometry(client, 'core.department', code, f.geometry, snapshotId);
        if (n > 0) out.updated++;
        else out.emptyGeometry.push(code);
      }
    });
    process.stdout.write(`\r  · departamentos: ${out.updated} con geometría`);
  }
  process.stdout.write('\n');
  return out;
}

/**
 * DATO DERIVADO, NO LÍMITE OFICIAL PUBLICADO.
 *
 * La capa de departamentos del IGAC no trae el código 11 (Bogotá, D.C.). Para los códigos que
 * la fuente no publica se disuelven los municipios del departamento con `ST_Union`. El
 * resultado NO es el límite departamental que publica el IGAC: es la unión de sus municipios,
 * que puede diferir en costas, islas y zonas en litigio.
 *
 * Se marca en `meta.validation` para que quede rastro, y la fila queda igualmente con su
 * `geom_snapshot_id` apuntando a este corte, porque la geometría de origen sí es del IGAC.
 *
 * La lista a derivar se decide comparando con los códigos que la fuente SÍ trajo, no con
 * «los que tienen geom NULL». La diferencia importa: si se mirara el NULL, la segunda corrida
 * no encontraría nada que derivar y el aviso de «dato derivado» desaparecería del corte,
 * dejando el límite de Bogotá indistinguible de uno oficial.
 */
async function deriveMissingDepartments(
  snapshotId: number,
  officialCodes: readonly string[],
): Promise<string[]> {
  if (officialCodes.length === 0) return [];
  const pending = await query<{ code: string }>(sql`
    SELECT d.code
    FROM core.department d
    WHERE NOT (d.code::text = ANY(${officialCodes}::text[]))
      AND EXISTS (SELECT 1 FROM core.municipality m WHERE m.dept_code = d.code AND m.geom IS NOT NULL)
    ORDER BY d.code
  `);

  const derived: string[] = [];
  for (const { code } of pending) {
    const n = await execute(sql`
      WITH src AS (
        SELECT core.clean_polygon(ST_Union(m.geom)) AS g
        FROM core.municipality m
        WHERE m.dept_code = ${code} AND m.geom IS NOT NULL
      )
      UPDATE core.department d
      SET geom = src.g,
          area_km2 = round((core.area_m2(src.g) / 1000000)::numeric, 4),
          geom_snapshot_id = ${snapshotId}
      FROM src
      WHERE d.code = ${code} AND src.g IS NOT NULL
    `);
    if (n > 0) derived.push(code.trim());
  }
  return derived;
}

/** Contraste contra el área que declara la propia fuente y contra la extensión de Colombia. */
async function runValidations(snapshotId: number, derivedDepartments: string[]): Promise<void> {
  // Volver a correr el cargador el mismo día reutiliza el snapshot (la clave es
  // dataset + cut_date). Sin este borrado las validaciones se acumularían y el corte
  // quedaría con el diagnóstico viejo mezclado con el nuevo.
  await execute(sql`DELETE FROM meta.validation WHERE snapshot_id = ${snapshotId}`);

  const muni = await queryOne<{ total: number; with_geom: number }>(sql`
    SELECT count(*)::int AS total, count(geom)::int AS with_geom FROM core.municipality
  `);
  const dept = await queryOne<{ total: number; with_geom: number }>(sql`
    SELECT count(*)::int AS total, count(geom)::int AS with_geom FROM core.department
  `);

  const missingMuni = await query<{ code: string; name: string }>(sql`
    SELECT code, name FROM core.municipality WHERE geom IS NULL ORDER BY code
  `);
  const missingDept = await query<{ code: string; name: string }>(sql`
    SELECT code, name FROM core.department WHERE geom IS NULL ORDER BY code
  `);

  // Severidad `warning`, no `error`: un municipio sin límite no invalida el corte, pero sí
  // tiene que quedar registrado para que la UI pueda ser honesta con la cobertura (regla 6).
  await recordValidation({
    snapshotId,
    checkName: 'orphan_record',
    severity: missingMuni.length > 0 ? 'warning' : 'info',
    passed: missingMuni.length === 0,
    affectedRows: missingMuni.length,
    message:
      `${muni?.with_geom ?? 0} de ${muni?.total ?? 0} municipios quedaron con límite; ` +
      `${missingMuni.length} sin geometría en la fuente.`,
    sample: missingMuni.slice(0, 20),
  });

  await recordValidation({
    snapshotId,
    checkName: 'orphan_record',
    severity: missingDept.length > 0 ? 'warning' : 'info',
    passed: missingDept.length === 0,
    affectedRows: missingDept.length,
    message:
      `${dept?.with_geom ?? 0} de ${dept?.total ?? 0} departamentos quedaron con límite; ` +
      `${missingDept.length} sin geometría.`,
    sample: missingDept.slice(0, 20),
  });

  if (derivedDepartments.length > 0) {
    await recordValidation({
      snapshotId,
      checkName: 'derived_geometry',
      severity: 'warning',
      passed: false,
      affectedRows: derivedDepartments.length,
      message:
        'Límite departamental DERIVADO por disolución (ST_Union) de sus municipios, porque la ' +
        'capa de departamentos del IGAC no lo publica. No es el límite oficial publicado.',
      sample: derivedDepartments,
    });
  }

  // Ninguna entidad puede caer fuera de la extensión continental + insular de Colombia.
  // Si aparece una, casi siempre significa que se leyó el CRS al revés.
  const outside = await query<{ code: string; name: string }>(sql`
    SELECT code, name FROM core.municipality
    WHERE geom IS NOT NULL
      AND NOT ST_Intersects(geom, ST_MakeEnvelope(-82.0, -4.5, -66.5, 13.6, 4326))
    ORDER BY code
  `);
  await recordValidation({
    snapshotId,
    checkName: 'outside_colombia',
    severity: outside.length > 0 ? 'error' : 'info',
    passed: outside.length === 0,
    affectedRows: outside.length,
    message:
      outside.length === 0
        ? 'Todos los límites cargados caen dentro de la extensión de Colombia.'
        : 'Hay límites fuera de Colombia: revisa la reproyección antes de publicar.',
    sample: outside.slice(0, 20),
  });

  const invalid = await query<{ code: string }>(sql`
    SELECT code FROM core.municipality WHERE geom IS NOT NULL AND NOT ST_IsValid(geom) ORDER BY code
  `);
  await recordValidation({
    snapshotId,
    checkName: 'invalid_geometry',
    severity: invalid.length > 0 ? 'warning' : 'info',
    passed: invalid.length === 0,
    affectedRows: invalid.length,
    message: `${invalid.length} municipios con geometría inválida tras core.clean_polygon().`,
    sample: invalid.slice(0, 20),
  });
}

async function main(): Promise<void> {
  loadEnv();
  console.log('Cargando límites de entidades territoriales del IGAC\n');
  console.log(`  servicio: ${IGAC_BOUNDARIES_SERVICE}`);

  const d = IGAC_BOUNDARIES_DATASET;
  await upsertDataset({
    id: d.id,
    source: d.source,
    name: d.name,
    description: d.description,
    license: d.license,
    attribution: d.attribution,
    url: d.url,
    frequency: d.frequency,
    connector: d.connector,
    format: d.format,
    source_srid: d.sourceSrid,
    target_table: d.targetTable,
    share_alike: d.shareAlike,
    notes: d.notes,
  });

  const snapshot = await createSnapshot({
    datasetId: d.id,
    cutDate: CONSULTED_ON,
    isSynthetic: false, // El dato es real: no se marca como sintético.
    sourceUrl: IGAC_BOUNDARIES_SERVICE,
    stageMethod: 'arcgis-rest',
  });

  let muniOutcome = emptyOutcome();
  let deptOutcome = emptyOutcome();

  if (ONLY !== 'departments') muniOutcome = await loadMunicipalities(snapshot.id);
  if (ONLY !== 'municipalities') deptOutcome = await loadDepartments(snapshot.id);

  // Sin la lista de códigos oficiales no se puede saber qué derivar, así que con
  // `--only=municipalities` no se deriva nada: se deja el límite anterior como estaba.
  const derived =
    ONLY === 'municipalities'
      ? []
      : await deriveMissingDepartments(snapshot.id, deptOutcome.officialCodes);

  // `row_count` cuenta lo que el corte TIENE, no lo que esta corrida escribió. Con
  // `--only=` una corrida parcial dejaría un `row_count` de 32 en un corte de 1 153
  // geometrías, y eso es exactamente el tipo de cifra que luego se muestra sin contexto.
  const held = await queryOne<{ munis: number; depts: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM core.municipality WHERE geom_snapshot_id = ${snapshot.id}) AS munis,
      (SELECT count(*)::int FROM core.department  WHERE geom_snapshot_id = ${snapshot.id}) AS depts
  `);

  await setSnapshotStatus(snapshot.id, 'transformed', {
    rowCount: (held?.munis ?? 0) + (held?.depts ?? 0),
    stats: {
      fecha_de_consulta: CONSULTED_ON,
      fecha_de_corte_declarada_por_la_fuente: 'NO_DISPONIBLE',
      licencia_declarada_por_la_fuente: 'NO_DISPONIBLE',
      municipios_con_geometria: held?.munis ?? 0,
      departamentos_con_geometria: held?.depts ?? 0,
      departamentos_derivados_por_disolucion: derived,
      escritos_en_esta_corrida: {
        municipios: muniOutcome.updated,
        departamentos: deptOutcome.updated,
      },
      codigos_no_divipola_descartados: [...muniOutcome.skipped, ...deptOutcome.skipped],
      codigos_desconocidos_en_la_base: [...muniOutcome.unknownCodes, ...deptOutcome.unknownCodes],
    },
  });

  await runValidations(snapshot.id, derived);
  await publishSnapshot(snapshot.id);

  // `analytics.muni_summary` sirve `area_km2`, que acaba de cambiar en 1 100+ filas.
  await execute(sql`REFRESH MATERIALIZED VIEW analytics.muni_summary`);

  const muniFinal = await queryOne<{ total: number; with_geom: number }>(sql`
    SELECT count(*)::int AS total, count(geom)::int AS with_geom FROM core.municipality
  `);
  const deptFinal = await queryOne<{ total: number; with_geom: number }>(sql`
    SELECT count(*)::int AS total, count(geom)::int AS with_geom FROM core.department
  `);
  const missing = await query<{ code: string; name: string }>(sql`
    SELECT code, name FROM core.municipality WHERE geom IS NULL ORDER BY code
  `);

  console.log('\nResultado');
  console.log(
    `  · municipios con límite:     ${muniFinal?.with_geom ?? 0} / ${muniFinal?.total ?? 0}`,
  );
  console.log(
    `  · departamentos con límite:  ${deptFinal?.with_geom ?? 0} / ${deptFinal?.total ?? 0}`,
  );
  if (derived.length > 0) {
    console.log(
      `  · departamentos DERIVADOS por disolución de municipios (no es el límite oficial): ${derived.join(', ')}`,
    );
  }
  if (missing.length > 0) {
    // Se listan unos pocos: si el cargador corrió parcialmente (`--only=`), la lista es de
    // mil filas y tapa el resto del informe. El detalle completo queda en meta.validation.
    const shown = missing.slice(0, 25).map((m) => `${m.code.trim()} ${m.name}`);
    const rest = missing.length - shown.length;
    console.log(
      `  · municipios sin límite (${missing.length}): ${shown.join(', ')}` +
        (rest > 0 ? ` … y ${rest} más (ver meta.validation)` : ''),
    );
  }
  if (muniOutcome.skipped.length + deptOutcome.skipped.length > 0) {
    console.log(
      `  · descartados por no ser códigos DIVIPOLA: ${[...muniOutcome.skipped, ...deptOutcome.skipped].join(', ')}`,
    );
  }
  if (muniOutcome.unknownCodes.length + deptOutcome.unknownCodes.length > 0) {
    console.log(
      `  · códigos de la fuente que no existen en la base (NO se insertaron): ` +
        `${[...muniOutcome.unknownCodes, ...deptOutcome.unknownCodes].join(', ')}`,
    );
  }
  console.log(`\n  ${d.attribution}, consultado ${CONSULTED_ON}`);
  console.log('  AVISO: la fuente no declara licencia ni fecha de corte. Ver meta.dataset.notes.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
