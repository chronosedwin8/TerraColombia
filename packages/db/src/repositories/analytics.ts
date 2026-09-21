import { execute, query, queryOne, queryWithTimeout } from '../pool.js';
import { geoJson, sql } from '../sql.js';

/**
 * Lectura y cálculo de agregados H3 e indicadores municipales.
 * El cálculo vive aquí (SQL) y no en Node porque mueve millones de filas.
 */

export interface H3CellRow {
  h3: string;
  res: number;
  muni_code: string | null;
  n_parcels: number;
  parcel_area_sum_m2: number | null;
  built_area_sum_m2: number | null;
  n_large_lots: number;
  pop: number | null;
  pop_school_age: number | null;
  households: number | null;
  n_schools: number;
  school_enrollment: number | null;
  n_health: number;
  poi_counts: Record<string, number>;
  road_access_score: number | null;
  dist_primary_road_m: number | null;
  dist_paved_road_m: number | null;
  dist_muni_seat_m: number | null;
  slope_mean_pct: number | null;
  elevation_mean_m: number | null;
  hazard_flags: Record<string, unknown>;
  protected_pct: number | null;
  ethnic_pct: number | null;
  urban_pct: number | null;
  capability_mix: Record<string, number>;
  vocation_mix: Record<string, number>;
  source_snapshots: Record<string, number>;
}

export async function getCellsInGeometry(
  geometry: unknown,
  res: number,
  limit = 5000,
): Promise<H3CellRow[]> {
  return queryWithTimeout<H3CellRow>(
    sql`
      WITH scope AS (SELECT ${geoJson(geometry)} AS g),
      wanted AS (SELECT h3_polygon_to_cells(scope.g, ${res}) AS h3 FROM scope)
      SELECT c.*
      FROM analytics.h3_cell c
      JOIN wanted w ON w.h3 = c.h3
      WHERE c.res = ${res}
      LIMIT ${limit}
    `,
    30_000,
  );
}

export async function getCell(h3: string): Promise<H3CellRow | null> {
  return queryOne<H3CellRow>(sql`SELECT * FROM analytics.h3_cell WHERE h3 = ${h3}::h3index`);
}

export async function getCellAt(lng: number, lat: number, res: number): Promise<H3CellRow | null> {
  return queryOne<H3CellRow>(sql`
    SELECT * FROM analytics.h3_cell
    WHERE h3 = h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${res})
  `);
}

/**
 * Recalcula los agregados por celda de un municipio. Es el paso `aggregate` del ETL.
 * Se hace en una sola sentencia por bloque temático para que cada una pueda medirse.
 */
export async function rebuildCellsForMunicipality(muniCode: string, res: number): Promise<number> {
  const deptCode = muniCode.slice(0, 2);

  // 1. Sembrar las celdas que cubren el municipio.
  //    Si aún no hay límite del MGN, se usa la envolvente convexa de los predios cargados:
  //    cubre lo que realmente tenemos y evita quedarse sin agregados por falta de límites.
  const seeded = await execute(sql`
    INSERT INTO analytics.h3_cell (h3, res, muni_code, dept_code)
    SELECT h3_polygon_to_cells(m.geom, ${res}), ${res}, m.code, m.dept_code
    FROM core.municipality m
    WHERE m.code = ${muniCode} AND m.geom IS NOT NULL
    ON CONFLICT (h3) DO UPDATE SET muni_code = EXCLUDED.muni_code, dept_code = EXCLUDED.dept_code
  `);

  if (seeded === 0) {
    await execute(sql`
      WITH hull AS (
        SELECT ST_Multi(ST_ConvexHull(ST_Collect(p.geom))) AS g
        FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
        WHERE p.dept_code = ${deptCode} AND p.muni_code = ${muniCode}
      )
      INSERT INTO analytics.h3_cell (h3, res, muni_code, dept_code)
      SELECT h3_polygon_to_cells(hull.g, ${res}), ${res}, ${muniCode}, ${deptCode}
      FROM hull
      WHERE hull.g IS NOT NULL
      ON CONFLICT (h3) DO UPDATE SET muni_code = EXCLUDED.muni_code, dept_code = EXCLUDED.dept_code
    `);
  }

  // 2. Catastro: conteos, áreas y reparto por destino económico.
  await execute(sql`
    WITH agg AS (
      SELECT
        p.h3_r8 AS h3_r8, p.h3_r9 AS h3_r9,
        CASE WHEN ${res} = 8 THEN p.h3_r8 ELSE p.h3_r9 END AS cell,
        count(*)::int AS n_parcels,
        sum(p.area_geom_m2) AS area_sum,
        sum(p.built_area_m2) AS built_sum,
        count(*) FILTER (WHERE p.area_geom_m2 > 1000
                           AND COALESCE(p.built_area_m2, 0) = 0)::int AS n_large_lots,
        min(p.area_geom_m2) AS a_min,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY p.area_geom_m2) AS a_p25,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY p.area_geom_m2) AS a_med,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY p.area_geom_m2) AS a_p75,
        max(p.area_geom_m2) AS a_max
      FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE p.dept_code = ${deptCode} AND p.muni_code = ${muniCode}
      GROUP BY 1, 2, 3
    )
    UPDATE analytics.h3_cell c SET
      n_parcels = agg.n_parcels,
      parcel_area_sum_m2 = agg.area_sum,
      built_area_sum_m2 = agg.built_sum,
      n_large_lots = agg.n_large_lots,
      area_stats = jsonb_build_object(
        'min', agg.a_min, 'p25', agg.a_p25, 'median', agg.a_med,
        'p75', agg.a_p75, 'max', agg.a_max, 'sum', agg.area_sum),
      computed_at = now()
    FROM agg
    WHERE c.h3 = agg.cell AND c.res = ${res}
  `);

  // 3. Destino económico por celda.
  await execute(sql`
    WITH uc AS (
      SELECT cell, jsonb_object_agg(use_label, n) AS counts FROM (
        SELECT
          CASE WHEN ${res} = 8 THEN p.h3_r8 ELSE p.h3_r9 END AS cell,
          COALESCE(p.economic_use, 'NO_DISPONIBLE') AS use_label,
          count(*)::int AS n
        FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
        WHERE p.dept_code = ${deptCode} AND p.muni_code = ${muniCode}
        GROUP BY 1, 2
      ) t GROUP BY cell
    )
    UPDATE analytics.h3_cell c SET use_counts = uc.counts
    FROM uc WHERE c.h3 = uc.cell AND c.res = ${res}
  `);

  // 4. Población: reparto por área de manzana.
  await execute(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    pop AS (
      SELECT
        cl.h3,
        round(sum(cb.pop_total * core.overlap_pct(cb.geom, cl.geom) / 100.0))::int AS pop,
        round(sum(cb.households * core.overlap_pct(cb.geom, cl.geom) / 100.0))::int AS households,
        round(sum(cb.dwellings * core.overlap_pct(cb.geom, cl.geom) / 100.0))::int AS dwellings,
        round(sum(
          (COALESCE((cb.age_bands->>'5_9')::numeric, 0)
         + COALESCE((cb.age_bands->>'10_14')::numeric, 0)
         + COALESCE((cb.age_bands->>'15_19')::numeric, 0) * 0.4)
          * core.overlap_pct(cb.geom, cl.geom) / 100.0))::int AS school_age
      FROM cells cl
      JOIN ctx.census_block cb ON cb.geom && cl.geom AND ST_Intersects(cb.geom, cl.geom)
      JOIN meta.snapshot s ON s.id = cb.snapshot_id AND s.is_active
      GROUP BY cl.h3
    )
    UPDATE analytics.h3_cell c SET
      pop = pop.pop, households = pop.households, dwellings = pop.dwellings,
      pop_school_age = pop.school_age
    FROM pop WHERE c.h3 = pop.h3 AND c.res = ${res}
  `);

  // 5. Equipamientos y POIs.
  await execute(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    sc AS (
      SELECT cl.h3, count(*)::int AS n, sum(s2.enrollment)::int AS enrollment
      FROM cells cl
      JOIN ctx.school s2 ON ST_Intersects(s2.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = s2.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    hf AS (
      SELECT cl.h3, count(*)::int AS n
      FROM cells cl
      JOIN ctx.health_facility h ON ST_Intersects(h.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = h.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    po AS (
      SELECT h3, jsonb_object_agg(category, n) AS counts FROM (
        SELECT cl.h3, p.category, count(*)::int AS n
        FROM cells cl
        JOIN ctx.poi p ON ST_Intersects(p.geom, cl.geom)
        JOIN meta.snapshot sn ON sn.id = p.snapshot_id AND sn.is_active
        GROUP BY cl.h3, p.category
      ) t GROUP BY h3
    )
    UPDATE analytics.h3_cell c SET
      n_schools = COALESCE(sc.n, 0),
      school_enrollment = sc.enrollment,
      n_health = COALESCE(hf.n, 0),
      poi_counts = COALESCE(po.counts, '{}'::jsonb)
    FROM cells cl
    LEFT JOIN sc ON sc.h3 = cl.h3
    LEFT JOIN hf ON hf.h3 = cl.h3
    LEFT JOIN po ON po.h3 = cl.h3
    WHERE c.h3 = cl.h3 AND c.res = ${res}
  `);

  // 6. Restricciones y relieve.
  await execute(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    pa AS (
      SELECT cl.h3, max(core.overlap_pct(cl.geom, a.geom)) AS pct
      FROM cells cl
      JOIN ctx.protected_area a ON a.geom && cl.geom AND ST_Intersects(a.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = a.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    et AS (
      SELECT cl.h3, max(core.overlap_pct(cl.geom, e.geom)) AS pct
      FROM cells cl
      JOIN ctx.ethnic_territory e ON e.geom && cl.geom AND ST_Intersects(e.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = e.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    up AS (
      SELECT cl.h3, max(core.overlap_pct(cl.geom, u.geom)) AS pct
      FROM cells cl
      JOIN core.urban_perimeter u ON u.geom && cl.geom AND ST_Intersects(u.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = u.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    hz AS (
      SELECT h3, jsonb_object_agg(kind, level) AS flags FROM (
        SELECT DISTINCT ON (cl.h3, h.kind) cl.h3, h.kind, h.level
        FROM cells cl
        JOIN ctx.hazard h ON h.geom && cl.geom AND ST_Intersects(h.geom, cl.geom)
        JOIN meta.snapshot sn ON sn.id = h.snapshot_id AND sn.is_active
        ORDER BY cl.h3, h.kind, h.level_rank DESC NULLS LAST
      ) t GROUP BY h3
    ),
    el AS (
      SELECT ec.h3, ec.elevation_mean_m, ec.slope_mean_pct
      FROM ctx.elevation_cell ec
      JOIN meta.snapshot sn ON sn.id = ec.snapshot_id AND sn.is_active
      WHERE ec.res = ${res}
    )
    UPDATE analytics.h3_cell c SET
      protected_pct = pa.pct,
      ethnic_pct = et.pct,
      urban_pct = up.pct,
      hazard_flags = COALESCE(hz.flags, '{}'::jsonb),
      elevation_mean_m = el.elevation_mean_m,
      slope_mean_pct = el.slope_mean_pct
    FROM cells cl
    LEFT JOIN pa ON pa.h3 = cl.h3
    LEFT JOIN et ON et.h3 = cl.h3
    LEFT JOIN up ON up.h3 = cl.h3
    LEFT JOIN hz ON hz.h3 = cl.h3
    LEFT JOIN el ON el.h3 = cl.h3
    WHERE c.h3 = cl.h3 AND c.res = ${res}
  `);

  // 6b. Suelos: reparto de clase agrológica y de vocación dentro de la celda.
  //     Se guarda el reparto completo, no solo la clase dominante: una celda mitad clase 3
  //     y mitad clase 7 no es una celda de clase 5, y la ficha debe poder decirlo.
  //     `cell-inputs.ts` toma de aquí la clave dominante para puntuar.
  await execute(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    cap AS (
      SELECT cl.h3, jsonb_object_agg(k.class_code::text, k.pct) AS mix FROM (
        SELECT cl2.h3, lc.class_code, round(sum(core.overlap_pct(cl2.geom, lc.geom))::numeric, 2) AS pct
        FROM cells cl2
        JOIN ctx.land_capability lc ON lc.geom && cl2.geom AND ST_Intersects(lc.geom, cl2.geom)
        JOIN meta.snapshot sn ON sn.id = lc.snapshot_id AND sn.is_active
        WHERE lc.class_code IS NOT NULL
        GROUP BY cl2.h3, lc.class_code
      ) k JOIN cells cl ON cl.h3 = k.h3
      GROUP BY cl.h3
    ),
    voc AS (
      SELECT cl.h3, jsonb_object_agg(k.vocation, k.pct) AS mix FROM (
        SELECT cl2.h3, lv.vocation, round(sum(core.overlap_pct(cl2.geom, lv.geom))::numeric, 2) AS pct
        FROM cells cl2
        JOIN ctx.land_vocation lv ON lv.geom && cl2.geom AND ST_Intersects(lv.geom, cl2.geom)
        JOIN meta.snapshot sn ON sn.id = lv.snapshot_id AND sn.is_active
        WHERE lv.vocation IS NOT NULL
        GROUP BY cl2.h3, lv.vocation
      ) k JOIN cells cl ON cl.h3 = k.h3
      GROUP BY cl.h3
    )
    UPDATE analytics.h3_cell c SET
      capability_mix = COALESCE(cap.mix, '{}'::jsonb),
      vocation_mix = COALESCE(voc.mix, '{}'::jsonb)
    FROM cells cl
    LEFT JOIN cap ON cap.h3 = cl.h3
    LEFT JOIN voc ON voc.h3 = cl.h3
    WHERE c.h3 = cl.h3 AND c.res = ${res}
  `);

  // 7. Accesibilidad vial desde el centro de cada celda.
  await execute(sql`
    WITH cells AS (
      SELECT h3, ST_Centroid(geom)::geography AS pt
      FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    acc AS (
      SELECT
        cl.h3,
        min(ST_Distance(rd.geom::geography, cl.pt))
          FILTER (WHERE rd.class IN ('motorway','trunk','primary')) AS d_primary,
        min(ST_Distance(rd.geom::geography, cl.pt)) FILTER (WHERE rd.is_paved) AS d_paved
      FROM cells cl
      JOIN ctx.road rd ON ST_DWithin(rd.geom::geography, cl.pt, 15000)
      JOIN meta.snapshot sn ON sn.id = rd.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    seat AS (
      SELECT cl.h3, ST_Distance(COALESCE(m.seat_point, m.centroid)::geography, cl.pt) AS d_seat
      FROM cells cl CROSS JOIN core.municipality m WHERE m.code = ${muniCode}
    )
    UPDATE analytics.h3_cell c SET
      dist_primary_road_m = acc.d_primary,
      dist_paved_road_m = acc.d_paved,
      dist_muni_seat_m = seat.d_seat,
      /* Accesibilidad 0-100: 100 a menos de 100 m de via pavimentada, 0 a mas de 5 km.
         La formula esta declarada tambien en packages/scoring para la explicabilidad. */
      road_access_score = GREATEST(0, LEAST(100,
        100 - (COALESCE(acc.d_paved, 5000) - 100) / 49.0))
    FROM cells cl
    LEFT JOIN acc ON acc.h3 = cl.h3
    LEFT JOIN seat ON seat.h3 = cl.h3
    WHERE c.h3 = cl.h3 AND c.res = ${res}
  `);

  // 8. Linaje: qué snapshots alimentaron estas celdas.
  await execute(sql`
    WITH snaps AS (
      SELECT jsonb_object_agg(dataset_id, id) AS m FROM meta.snapshot WHERE is_active
    )
    UPDATE analytics.h3_cell c
    SET source_snapshots = snaps.m, computed_at = now()
    FROM snaps
    WHERE c.muni_code = ${muniCode} AND c.res = ${res}
  `);

  const row = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
  `);
  return row?.n ?? 0;
}

export async function refreshMuniSummary(): Promise<void> {
  // CONCURRENTLY exige el índice único que crea la migración 0006.
  await execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.muni_summary`);
}

export async function getMuniSummary(muniCode: string) {
  return queryOne(sql`SELECT * FROM analytics.muni_summary WHERE muni_code = ${muniCode}`);
}

export async function getIndicators(muniCode: string, period?: string) {
  return query(sql`
    SELECT indicator, period, value, unit, national_rank, national_pct, source_snapshots
    FROM analytics.muni_indicator
    WHERE muni_code = ${muniCode} ${period ? sql`AND period = ${period}` : sql``}
    ORDER BY indicator, period DESC
  `);
}

export async function upsertIndicator(input: {
  muniCode: string;
  indicator: string;
  period: string;
  value: number | null;
  unit: string | null;
  sourceSnapshots?: Record<string, number>;
}): Promise<void> {
  await execute(sql`
    INSERT INTO analytics.muni_indicator (muni_code, indicator, period, value, unit, source_snapshots, computed_at)
    VALUES (${input.muniCode}, ${input.indicator}, ${input.period}, ${input.value}, ${input.unit},
            ${JSON.stringify(input.sourceSnapshots ?? {})}::jsonb, now())
    ON CONFLICT (muni_code, indicator, period) DO UPDATE SET
      value = EXCLUDED.value, unit = EXCLUDED.unit,
      source_snapshots = EXCLUDED.source_snapshots, computed_at = now()
  `);
}

/** Recalcula el ranking nacional de un indicador en un periodo. */
export async function recomputeRanks(indicator: string, period: string): Promise<void> {
  await execute(sql`
    WITH ranked AS (
      SELECT muni_code,
             rank() OVER (ORDER BY value DESC NULLS LAST) AS r,
             percent_rank() OVER (ORDER BY value ASC NULLS FIRST) * 100 AS pct
      FROM analytics.muni_indicator
      WHERE indicator = ${indicator} AND period = ${period} AND value IS NOT NULL
    )
    UPDATE analytics.muni_indicator mi
    SET national_rank = ranked.r, national_pct = round(ranked.pct::numeric, 2)
    FROM ranked
    WHERE mi.muni_code = ranked.muni_code AND mi.indicator = ${indicator} AND mi.period = ${period}
  `);
}

export async function rankingFor(indicator: string, period: string, limit = 20, ascending = false) {
  return query(sql`
    SELECT mi.muni_code, m.name AS muni_name, m.dept_code, mi.value, mi.unit, mi.national_rank
    FROM analytics.muni_indicator mi
    JOIN core.municipality m ON m.code = mi.muni_code
    WHERE mi.indicator = ${indicator} AND mi.period = ${period} AND mi.value IS NOT NULL
    ORDER BY mi.value ${ascending ? sql`ASC` : sql`DESC`}
    LIMIT ${limit}
  `);
}
