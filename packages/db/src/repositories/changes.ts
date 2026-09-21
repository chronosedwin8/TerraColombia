import { execute, query, queryOne, queryWithTimeout } from '../pool.js';
import { geoJson, sql } from '../sql.js';

/**
 * Cambio territorial (M8). El diff se calcula una vez por par de cortes y se materializa en
 * `core.parcel_change`; las consultas del usuario solo leen. Calcularlo en vivo sería
 * inviable sobre millones de predios.
 */

export interface ChangeRow {
  npn: string;
  muni_code: string;
  change_type: string;
  detail: Record<string, unknown>;
  geom_iou: number | null;
  detected_at: string;
}

/**
 * Calcula y almacena las diferencias entre dos snapshots del catastro de un departamento.
 * Es el paso `diff` del ETL.
 *
 * - alta/baja: por presencia del NPN
 * - cambio de atributos: comparación campo a campo de los que importan al usuario
 * - cambio geométrico: IoU < 0,98 (umbral declarado en el plan)
 */
export async function computeParcelDiff(
  deptCode: string,
  fromSnapshotId: number,
  toSnapshotId: number,
): Promise<{ created: number; removed: number; attrsChanged: number; geometryChanged: number }> {
  await execute(sql`
    DELETE FROM core.parcel_change
    WHERE dept_code = ${deptCode} AND from_snapshot = ${fromSnapshotId} AND to_snapshot = ${toSnapshotId}
  `);

  // Altas
  const created = await execute(sql`
    INSERT INTO core.parcel_change (npn, dept_code, muni_code, from_snapshot, to_snapshot, change_type, detail, geom_diff)
    SELECT
      n.npn, n.dept_code, n.muni_code, ${fromSnapshotId}, ${toSnapshotId}, 'created',
      jsonb_build_object('areaM2', n.area_geom_m2, 'economicUse', n.economic_use, 'zone', n.zone),
      n.geom
    FROM core.parcel n
    WHERE n.dept_code = ${deptCode} AND n.snapshot_id = ${toSnapshotId}
      AND NOT EXISTS (
        SELECT 1 FROM core.parcel o
        WHERE o.dept_code = ${deptCode} AND o.snapshot_id = ${fromSnapshotId} AND o.npn = n.npn
      )
  `);

  // Bajas
  const removed = await execute(sql`
    INSERT INTO core.parcel_change (npn, dept_code, muni_code, from_snapshot, to_snapshot, change_type, detail, geom_diff)
    SELECT
      o.npn, o.dept_code, o.muni_code, ${fromSnapshotId}, ${toSnapshotId}, 'removed',
      jsonb_build_object('areaM2', o.area_geom_m2, 'economicUse', o.economic_use, 'zone', o.zone),
      o.geom
    FROM core.parcel o
    WHERE o.dept_code = ${deptCode} AND o.snapshot_id = ${fromSnapshotId}
      AND NOT EXISTS (
        SELECT 1 FROM core.parcel n
        WHERE n.dept_code = ${deptCode} AND n.snapshot_id = ${toSnapshotId} AND n.npn = o.npn
      )
  `);

  // Cambio de atributos relevantes
  const attrsChanged = await execute(sql`
    INSERT INTO core.parcel_change (npn, dept_code, muni_code, from_snapshot, to_snapshot, change_type, detail)
    SELECT
      n.npn, n.dept_code, n.muni_code, ${fromSnapshotId}, ${toSnapshotId}, 'attrs_changed',
      jsonb_strip_nulls(jsonb_build_object(
        'areaReportedM2', CASE WHEN o.area_reported_m2 IS DISTINCT FROM n.area_reported_m2
          THEN jsonb_build_object('from', o.area_reported_m2, 'to', n.area_reported_m2) END,
        'builtAreaM2', CASE WHEN o.built_area_m2 IS DISTINCT FROM n.built_area_m2
          THEN jsonb_build_object('from', o.built_area_m2, 'to', n.built_area_m2) END,
        'economicUse', CASE WHEN o.economic_use IS DISTINCT FROM n.economic_use
          THEN jsonb_build_object('from', o.economic_use, 'to', n.economic_use) END,
        'cadastralValue', CASE WHEN o.cadastral_value IS DISTINCT FROM n.cadastral_value
          THEN jsonb_build_object('from', o.cadastral_value, 'to', n.cadastral_value) END,
        'address', CASE WHEN o.address IS DISTINCT FROM n.address
          THEN jsonb_build_object('from', o.address, 'to', n.address) END
      ))
    FROM core.parcel n
    JOIN core.parcel o
      ON o.dept_code = n.dept_code AND o.npn = n.npn AND o.snapshot_id = ${fromSnapshotId}
    WHERE n.dept_code = ${deptCode} AND n.snapshot_id = ${toSnapshotId}
      AND (
        o.area_reported_m2 IS DISTINCT FROM n.area_reported_m2 OR
        o.built_area_m2 IS DISTINCT FROM n.built_area_m2 OR
        o.economic_use IS DISTINCT FROM n.economic_use OR
        o.cadastral_value IS DISTINCT FROM n.cadastral_value OR
        o.address IS DISTINCT FROM n.address
      )
  `);

  // Cambio geométrico: IoU por debajo del umbral.
  const geometryChanged = await execute(sql`
    INSERT INTO core.parcel_change (npn, dept_code, muni_code, from_snapshot, to_snapshot, change_type, detail, geom_iou, geom_diff)
    SELECT
      n.npn, n.dept_code, n.muni_code, ${fromSnapshotId}, ${toSnapshotId}, 'geometry_changed',
      jsonb_build_object('areaFromM2', o.area_geom_m2, 'areaToM2', n.area_geom_m2),
      core.geom_iou(o.geom, n.geom),
      core.clean_polygon(ST_SymDifference(o.geom, n.geom))
    FROM core.parcel n
    JOIN core.parcel o
      ON o.dept_code = n.dept_code AND o.npn = n.npn AND o.snapshot_id = ${fromSnapshotId}
    WHERE n.dept_code = ${deptCode} AND n.snapshot_id = ${toSnapshotId}
      AND n.geom IS NOT NULL AND o.geom IS NOT NULL
      AND NOT ST_Equals(o.geom, n.geom)
      AND COALESCE(core.geom_iou(o.geom, n.geom), 0) < 0.98
  `);

  // Construcciones nuevas
  await execute(sql`
    INSERT INTO core.parcel_change (npn, dept_code, muni_code, from_snapshot, to_snapshot, change_type, detail, geom_diff)
    SELECT
      b.parcel_npn, b.dept_code, b.muni_code, ${fromSnapshotId}, ${toSnapshotId}, 'building_added',
      jsonb_build_object('builtAreaM2', b.built_area_m2, 'floors', b.floors, 'use', b.use),
      b.geom
    FROM core.building b
    WHERE b.dept_code = ${deptCode} AND b.snapshot_id = ${toSnapshotId}
      AND NOT EXISTS (
        SELECT 1 FROM core.building ob
        WHERE ob.dept_code = ${deptCode} AND ob.snapshot_id = ${fromSnapshotId}
          AND ob.parcel_npn = b.parcel_npn
          AND ob.building_ref IS NOT DISTINCT FROM b.building_ref
      )
  `);

  return { created, removed, attrsChanged, geometryChanged };
}

export async function listChangesInArea(
  geometry: unknown,
  fromCutDate: string,
  toCutDate: string,
  changeTypes: string[],
  limit = 500,
): Promise<ChangeRow[]> {
  const typeFilter =
    changeTypes.length > 0
      ? sql`AND pc.change_type = ANY (${changeTypes})`
      : sql``;
  return queryWithTimeout<ChangeRow>(
    sql`
      WITH scope AS (SELECT ${geoJson(geometry)} AS g),
      snaps AS (
        SELECT
          (SELECT id FROM meta.snapshot WHERE cut_date = ${fromCutDate}::date
             AND dataset_id LIKE 'igac-cadastre%' ORDER BY id LIMIT 1) AS from_id,
          (SELECT id FROM meta.snapshot WHERE cut_date = ${toCutDate}::date
             AND dataset_id LIKE 'igac-cadastre%' ORDER BY id LIMIT 1) AS to_id
      )
      SELECT pc.npn, pc.muni_code, pc.change_type, pc.detail, pc.geom_iou,
             pc.detected_at::text AS detected_at
      FROM core.parcel_change pc, scope, snaps
      WHERE pc.from_snapshot = snaps.from_id AND pc.to_snapshot = snaps.to_id
        AND (pc.geom_diff IS NULL OR ST_Intersects(pc.geom_diff, scope.g))
        ${typeFilter}
      ORDER BY pc.change_type, pc.npn
      LIMIT ${limit}
    `,
    30_000,
  );
}

export async function changeSummary(
  geometry: unknown,
  fromCutDate: string,
  toCutDate: string,
) {
  return queryOne<{
    created: number;
    removed: number;
    attrs_changed: number;
    geometry_changed: number;
    building_added: number;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g),
    snaps AS (
      SELECT
        (SELECT id FROM meta.snapshot WHERE cut_date = ${fromCutDate}::date
           AND dataset_id LIKE 'igac-cadastre%' ORDER BY id LIMIT 1) AS from_id,
        (SELECT id FROM meta.snapshot WHERE cut_date = ${toCutDate}::date
           AND dataset_id LIKE 'igac-cadastre%' ORDER BY id LIMIT 1) AS to_id
    )
    SELECT
      count(*) FILTER (WHERE change_type = 'created')::int AS created,
      count(*) FILTER (WHERE change_type = 'removed')::int AS removed,
      count(*) FILTER (WHERE change_type = 'attrs_changed')::int AS attrs_changed,
      count(*) FILTER (WHERE change_type = 'geometry_changed')::int AS geometry_changed,
      count(*) FILTER (WHERE change_type = 'building_added')::int AS building_added
    FROM core.parcel_change pc, scope, snaps
    WHERE pc.from_snapshot = snaps.from_id AND pc.to_snapshot = snaps.to_id
      AND (pc.geom_diff IS NULL OR ST_Intersects(pc.geom_diff, scope.g))
  `);
}

/** Historial de un predio: todos los cambios registrados entre cortes. */
export async function parcelHistory(npn: string) {
  return query(sql`
    SELECT
      pc.change_type, pc.detail, pc.geom_iou, pc.detected_at::text AS detected_at,
      fs.cut_date::text AS from_cut_date, ts.cut_date::text AS to_cut_date
    FROM core.parcel_change pc
    LEFT JOIN meta.snapshot fs ON fs.id = pc.from_snapshot
    JOIN meta.snapshot ts ON ts.id = pc.to_snapshot
    WHERE pc.npn = ${npn} AND pc.dept_code = ${npn.slice(0, 2)}
    ORDER BY ts.cut_date DESC, pc.change_type
  `);
}

/** Cortes en los que existe el predio, para el selector temporal de la ficha. */
export async function parcelCutDates(npn: string) {
  return query<{ cut_date: string; area_geom_m2: number | null; built_area_m2: number | null }>(sql`
    SELECT s.cut_date::text AS cut_date, p.area_geom_m2, p.built_area_m2
    FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id
    WHERE p.dept_code = ${npn.slice(0, 2)} AND p.npn = ${npn}
      AND s.status IN ('published', 'superseded')
    ORDER BY s.cut_date DESC
  `);
}

export async function upsertMuniDynamics(input: {
  muniCode: string;
  fromCutDate: string;
  toCutDate: string;
  created: number;
  removed: number;
  geomChanged: number;
  attrsChanged: number;
  buildingsAdded: number;
}): Promise<void> {
  await execute(sql`
    INSERT INTO analytics.muni_parcel_dynamics
      (muni_code, from_cut_date, to_cut_date, parcels_created, parcels_removed,
       parcels_geom_changed, parcels_attrs_changed, buildings_added)
    VALUES (${input.muniCode}, ${input.fromCutDate}::date, ${input.toCutDate}::date,
            ${input.created}, ${input.removed}, ${input.geomChanged}, ${input.attrsChanged},
            ${input.buildingsAdded})
    ON CONFLICT (muni_code, from_cut_date, to_cut_date) DO UPDATE SET
      parcels_created = EXCLUDED.parcels_created,
      parcels_removed = EXCLUDED.parcels_removed,
      parcels_geom_changed = EXCLUDED.parcels_geom_changed,
      parcels_attrs_changed = EXCLUDED.parcels_attrs_changed,
      buildings_added = EXCLUDED.buildings_added,
      computed_at = now()
  `);
}
