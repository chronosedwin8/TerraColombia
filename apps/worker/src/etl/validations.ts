import { query, queryOne } from '@terracolombia/db';
import { ident, sql } from '@terracolombia/db/sql';
import type { ValidationFinding } from './pipeline.js';

/**
 * Validaciones estándar del ETL (PLAN §8). Todas devuelven hallazgos en vez de lanzar, para
 * que una corrida produzca el informe completo y no se detenga en el primer problema.
 *
 * Severidad `error` bloquea la publicación. `warning` se publica pero queda registrado y
 * visible en el panel.
 */

/** Conteo contra el corte anterior: una variación mayor al umbral es sospechosa. */
export async function checkRowCountDelta(
  table: string,
  snapshotId: number,
  previousSnapshotId: number | null,
  thresholdPct = 10,
): Promise<ValidationFinding> {
  const current = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${sqlTable(table)} WHERE snapshot_id = ${snapshotId}
  `);
  const n = current?.n ?? 0;

  if (previousSnapshotId === null) {
    return {
      checkName: 'row_count_delta',
      severity: 'info',
      passed: true,
      affectedRows: n,
      message: `Primer corte de ${table}: ${n} filas. No hay corte anterior con el que comparar.`,
    };
  }

  const prev = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${sqlTable(table)} WHERE snapshot_id = ${previousSnapshotId}
  `);
  const p = prev?.n ?? 0;
  if (p === 0) {
    return {
      checkName: 'row_count_delta',
      severity: 'info',
      passed: true,
      affectedRows: n,
      message: `El corte anterior de ${table} estaba vacío; este trae ${n} filas.`,
    };
  }

  const deltaPct = ((n - p) / p) * 100;
  const exceeded = Math.abs(deltaPct) > thresholdPct;
  return {
    checkName: 'row_count_delta',
    // Un cambio grande no siempre es un error (una actualización catastral lo produce),
    // pero exige revisión antes de publicar, así que se marca como aviso, no como error.
    severity: exceeded ? 'warning' : 'info',
    passed: !exceeded,
    affectedRows: Math.abs(n - p),
    message: exceeded
      ? `${table} pasó de ${p} a ${n} filas (${deltaPct.toFixed(1)} %). Supera el umbral de ${thresholdPct} %: revisa antes de publicar.`
      : `${table}: ${n} filas (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)} % frente al corte anterior).`,
  };
}

/** Geometrías inválidas. Bloquea: una geometría inválida rompe todo cálculo espacial. */
export async function checkInvalidGeometries(
  table: string,
  snapshotId: number,
  geomColumn = 'geom',
): Promise<ValidationFinding> {
  const rows = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM ${sqlTable(table)}
    WHERE snapshot_id = ${snapshotId}
      AND ${sqlColumn(geomColumn)} IS NOT NULL
      AND NOT ST_IsValid(${sqlColumn(geomColumn)})
  `);
  const n = rows[0]?.n ?? 0;
  return {
    checkName: 'invalid_geometry',
    severity: 'error',
    passed: n === 0,
    affectedRows: n,
    message:
      n === 0
        ? `Todas las geometrías de ${table} son válidas.`
        : `${n} geometrías inválidas en ${table}. La ingesta debe pasarlas por core.clean_polygon().`,
  };
}

/** Geometrías fuera de Colombia: casi siempre indican un CRS mal declarado. */
export async function checkGeometriesInsideColombia(
  table: string,
  snapshotId: number,
  geomColumn = 'geom',
): Promise<ValidationFinding> {
  const rows = await query<{ n: number; sample: string[] }>(sql`
    SELECT count(*)::int AS n,
           COALESCE(array_agg(ST_AsText(ST_Centroid(${sqlColumn(geomColumn)}))) FILTER (WHERE TRUE), '{}') AS sample
    FROM (
      SELECT ${sqlColumn(geomColumn)}
      FROM ${sqlTable(table)}
      WHERE snapshot_id = ${snapshotId}
        AND ${sqlColumn(geomColumn)} IS NOT NULL
        AND NOT ST_Intersects(
          ${sqlColumn(geomColumn)},
          ST_MakeEnvelope(-81.85, -4.3, -66.8, 13.6, 4326)
        )
      LIMIT 5
    ) t
  `);
  const n = rows[0]?.n ?? 0;
  return {
    checkName: 'outside_colombia',
    severity: 'error',
    passed: n === 0,
    affectedRows: n,
    sample: rows[0]?.sample ?? [],
    message:
      n === 0
        ? `Todas las geometrías de ${table} caen dentro de Colombia.`
        : `Hay geometrías de ${table} fuera de Colombia. Revisa el CRS de origen: la fuente puede venir en EPSG:3116 o 21818 y no en 4326.`,
  };
}

/** NPN mal formados en core.parcel. Bloquea: el NPN es la llave del producto. */
export async function checkBadNpn(snapshotId: number): Promise<ValidationFinding> {
  const rows = await query<{ n: number; sample: string[] }>(sql`
    SELECT count(*)::int AS n, COALESCE(array_agg(npn), '{}') AS sample
    FROM (
      SELECT npn FROM core.parcel
      WHERE snapshot_id = ${snapshotId} AND NOT core.npn_is_valid(npn)
      LIMIT 10
    ) t
  `);
  const n = rows[0]?.n ?? 0;
  return {
    checkName: 'bad_npn',
    severity: 'error',
    passed: n === 0,
    affectedRows: n,
    sample: rows[0]?.sample ?? [],
    message:
      n === 0
        ? 'Todos los códigos prediales tienen estructura válida.'
        : `${n} códigos prediales con estructura inválida (30 dígitos, zona 01 o 02, departamento y municipio distintos de cero).`,
  };
}

/** Duplicados de NPN dentro del mismo corte. */
export async function checkDuplicateNpn(snapshotId: number): Promise<ValidationFinding> {
  const rows = await query<{ n: number; sample: string[] }>(sql`
    SELECT count(*)::int AS n, COALESCE(array_agg(npn), '{}') AS sample
    FROM (
      SELECT npn FROM core.parcel
      WHERE snapshot_id = ${snapshotId}
      GROUP BY npn HAVING count(*) > 1
      LIMIT 10
    ) t
  `);
  const n = rows[0]?.n ?? 0;
  return {
    checkName: 'duplicate',
    severity: 'error',
    passed: n === 0,
    affectedRows: n,
    sample: rows[0]?.sample ?? [],
    message:
      n === 0
        ? 'No hay códigos prediales duplicados en el corte.'
        : `${n} códigos prediales aparecen más de una vez en el mismo corte.`,
  };
}

/** Predios con área cero o nula: se publican, pero quedan señalados. */
export async function checkZeroAreas(snapshotId: number): Promise<ValidationFinding> {
  const rows = await query<{ n: number; total: number }>(sql`
    SELECT
      count(*) FILTER (WHERE area_geom_m2 IS NULL OR area_geom_m2 <= 0)::int AS n,
      count(*)::int AS total
    FROM core.parcel WHERE snapshot_id = ${snapshotId}
  `);
  const n = rows[0]?.n ?? 0;
  const total = rows[0]?.total ?? 0;
  const pct = total > 0 ? (n / total) * 100 : 0;
  return {
    checkName: 'zero_area',
    severity: pct > 5 ? 'error' : 'warning',
    passed: n === 0,
    affectedRows: n,
    message:
      n === 0
        ? 'Todos los predios tienen área positiva.'
        : `${n} de ${total} predios (${pct.toFixed(1)} %) sin área o con área cero. La ficha los mostrará como "no disponible".`,
  };
}

/** Geometría sin registro y registro sin geometría (huérfanos). */
export async function checkOrphans(snapshotId: number): Promise<ValidationFinding[]> {
  const noGeom = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM core.parcel
    WHERE snapshot_id = ${snapshotId} AND geom IS NULL
  `);
  const orphanBuildings = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM core.building b
    WHERE b.snapshot_id = ${snapshotId}
      AND NOT EXISTS (
        SELECT 1 FROM core.parcel p
        WHERE p.snapshot_id = b.snapshot_id AND p.dept_code = b.dept_code AND p.npn = b.parcel_npn
      )
  `);

  return [
    {
      checkName: 'orphan_record',
      severity: 'warning',
      passed: (noGeom?.n ?? 0) === 0,
      affectedRows: noGeom?.n ?? 0,
      message:
        (noGeom?.n ?? 0) === 0
          ? 'Todos los registros prediales tienen geometría.'
          : `${noGeom?.n} predios sin geometría. Aparecerán en las búsquedas por código pero no en el mapa.`,
    },
    {
      checkName: 'orphan_geometry',
      severity: 'warning',
      passed: (orphanBuildings?.n ?? 0) === 0,
      affectedRows: orphanBuildings?.n ?? 0,
      message:
        (orphanBuildings?.n ?? 0) === 0
          ? 'Todas las construcciones apuntan a un predio existente.'
          : `${orphanBuildings?.n} construcciones apuntan a un código predial que no está en el corte.`,
    },
  ];
}

/**
 * Detección de PII que se haya colado. Es una red de seguridad sobre la lista negra:
 * inspecciona las claves de `attrs` en busca de nombres sospechosos.
 * Bloquea la publicación: la regla 3 no admite excepciones.
 */
export async function checkPiiLeak(
  table: string,
  snapshotId: number,
  attrsColumn = 'attrs',
  /**
   * Clasificador autorizado de `etl/config/pii-blocklist.ts`. Cuando se pasa, decide él:
   * la expresión regular de abajo no conoce la lista de permitidos y marca `nombre_municipio`,
   * `nombre_establecimiento` o `nombre_sede`, que son topónimos y nombres de institución.
   * Con esos falsos positivos ningún dataset de contexto podía publicarse.
   */
  isPii?: (name: string) => boolean,
): Promise<ValidationFinding> {
  const rows = isPii
    ? (
        await query<{ key: string; n: number }>(sql`
          SELECT key, count(*)::int AS n
          FROM ${sqlTable(table)} t, LATERAL jsonb_object_keys(t.${sqlColumn(attrsColumn)}) AS key
          WHERE t.snapshot_id = ${snapshotId}
          GROUP BY key
          ORDER BY n DESC
        `)
      )
        .filter((r) => isPii(r.key))
        .slice(0, 20)
    : await query<{ key: string; n: number }>(sql`
        SELECT key, count(*)::int AS n
        FROM ${sqlTable(table)} t, LATERAL jsonb_object_keys(t.${sqlColumn(attrsColumn)}) AS key
        WHERE t.snapshot_id = ${snapshotId}
          AND public.tc_fold(key) ~ '(PROPIETARIO|TITULAR|NOMBRE|APELLIDO|CEDULA|DOCUMENTO|IDENTIFIC|TELEFONO|CELULAR|CORREO|EMAIL|MAIL|DIRECCION_CORRESPOND|RAZON_SOCIAL|NIT)'
        GROUP BY key
        ORDER BY n DESC
        LIMIT 20
      `);

  return {
    checkName: 'pii_detected',
    severity: 'error',
    passed: rows.length === 0,
    affectedRows: rows.reduce((a, r) => a + r.n, 0),
    // Se reporta el NOMBRE de la clave, nunca su valor.
    sample: rows.map((r) => ({ columna: r.key, ocurrencias: r.n })),
    message:
      rows.length === 0
        ? 'No se detectaron columnas con posible dato personal.'
        : `Se detectaron ${rows.length} claves con posible dato personal en ${table}.${attrsColumn}: ` +
          `${rows.map((r) => r.key).join(', ')}. Añádelas a etl/config/pii-blocklist.ts y vuelve a cargar. ` +
          'No se publica este corte.',
  };
}

/** CRS declarado distinto del esperado. */
export async function checkSrid(
  table: string,
  snapshotId: number,
  expectedSrid = 4326,
  geomColumn = 'geom',
): Promise<ValidationFinding> {
  const rows = await query<{ srid: number; n: number }>(sql`
    SELECT ST_SRID(${sqlColumn(geomColumn)}) AS srid, count(*)::int AS n
    FROM ${sqlTable(table)}
    WHERE snapshot_id = ${snapshotId} AND ${sqlColumn(geomColumn)} IS NOT NULL
    GROUP BY 1
  `);
  const wrong = rows.filter((r) => r.srid !== expectedSrid);
  return {
    checkName: 'srid_mismatch',
    severity: 'error',
    passed: wrong.length === 0,
    affectedRows: wrong.reduce((a, r) => a + r.n, 0),
    sample: wrong,
    message:
      wrong.length === 0
        ? `Todas las geometrías están en EPSG:${expectedSrid}.`
        : `Hay geometrías en un CRS distinto de EPSG:${expectedSrid}: ${wrong.map((w) => `EPSG:${w.srid} (${w.n})`).join(', ')}.`,
  };
}

/** Conjunto estándar de validaciones para un corte del catastro. */
export async function validateCadastreSnapshot(
  snapshotId: number,
  previousSnapshotId: number | null,
): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  findings.push(await checkRowCountDelta('core.parcel', snapshotId, previousSnapshotId));
  findings.push(await checkSrid('core.parcel', snapshotId));
  findings.push(await checkInvalidGeometries('core.parcel', snapshotId));
  findings.push(await checkGeometriesInsideColombia('core.parcel', snapshotId));
  findings.push(await checkBadNpn(snapshotId));
  findings.push(await checkDuplicateNpn(snapshotId));
  findings.push(await checkZeroAreas(snapshotId));
  findings.push(...(await checkOrphans(snapshotId)));
  findings.push(await checkPiiLeak('core.parcel', snapshotId));
  return findings;
}

/** Conjunto estándar para una capa de contexto con geometría. */
export async function validateContextSnapshot(
  table: string,
  snapshotId: number,
  previousSnapshotId: number | null,
  opts: {
    geomColumn?: string;
    attrsColumn?: string | null;
    /** Clasificador de `etl/config/pii-blocklist.ts`. Ver `checkPiiLeak`. */
    isPiiColumn?: (name: string) => boolean;
  } = {},
): Promise<ValidationFinding[]> {
  const geomColumn = opts.geomColumn ?? 'geom';
  const findings: ValidationFinding[] = [];
  findings.push(await checkRowCountDelta(table, snapshotId, previousSnapshotId));
  findings.push(await checkSrid(table, snapshotId, 4326, geomColumn));
  findings.push(await checkInvalidGeometries(table, snapshotId, geomColumn));
  findings.push(await checkGeometriesInsideColombia(table, snapshotId, geomColumn));
  if (opts.attrsColumn !== null) {
    findings.push(
      await checkPiiLeak(table, snapshotId, opts.attrsColumn ?? 'attrs', opts.isPiiColumn),
    );
  }
  return findings;
}

// ─── Ayudas ───────────────────────────────────────────────────────────────────
// Los nombres de tabla y columna vienen del código del pipeline, nunca del cliente,
// pero se validan igual antes de interpolarlos.

function sqlTable(qualified: string) {
  const parts = qualified.split('.');
  if (parts.length !== 2) throw new Error(`Nombre de tabla inválido: ${qualified}`);
  // `ident` valida el nombre y lo cita; lanza ante cualquier cosa que no sea un identificador.
  return ident(qualified);
}

function sqlColumn(name: string) {
  return ident(name);
}
