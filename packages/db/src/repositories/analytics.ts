import { execute, executeMaintenance, getPool, query, queryOne, queryWithTimeout } from '../pool.js';
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
  /**
   * Cuándo se calcularon los agregados de esta celda. `null` = la celda existe pero nunca
   * se agregó, así que sus ceros no son mediciones. Quien lee la celda necesita poder
   * distinguir «contamos y no hay» de «no hemos contado».
   */
  computed_at: string | null;
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
 * Con `AGGREGATE_TRACE=1` imprime cuánto tarda cada bloque del agregado. Sirve para saber
 * qué paso se lleva el tiempo cuando un municipio grande tarda minutos, sin adivinar.
 */
function tracedStep(muniCode: string, res: number) {
  const trace = process.env['AGGREGATE_TRACE'] === '1';
  return async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const out = await fn();
    if (trace) console.log(`    [${muniCode} r${res}] ${name.padEnd(12)} ${Date.now() - t0} ms`);
    return out;
  };
}

/**
 * Por encima de esta superficie, la malla se siembra solo donde hay predios. Es el tamaño a
 * partir del cual un municipio deja de ser una ciudad con su área rural y pasa a ser
 * territorio amazónico: 21 municipios suman 292.528 km², un cuarto del país.
 */
const HUGE_MUNICIPALITY_KM2 = 3000;

/**
 * Recalcula los agregados por celda de un municipio. Es el paso `aggregate` del ETL.
 * Se hace en una sola sentencia por bloque temático para que cada una pueda medirse.
 */
export async function rebuildCellsForMunicipality(muniCode: string, res: number): Promise<number> {
  const deptCode = muniCode.slice(0, 2);
  const paso = tracedStep(muniCode, res);

  /*
   * 1. Sembrar las celdas.
   *
   * Lo normal es cubrir el municipio entero. Pero en los municipios inmensos de la Amazonía
   * y la Orinoquía eso no es viable ni útil: Cumaribo tiene 65.188 km², que a resolución 9
   * son más de medio millón de celdas de selva sin un solo predio. La corrida nacional murió
   * ahí por tiempo de espera tras procesar 703 municipios.
   *
   * Por encima del umbral se siembra SOLO donde hay predios, usando la celda que cada predio
   * ya lleva calculada (`h3_r8`/`h3_r9`). Se pierde la malla sobre la selva deshabitada, que
   * es justo lo que no aporta nada: sin predios, esas celdas salen vacías de todas formas y
   * el mapa de calor las descarta. Los municipios normales no cambian.
   */
  const grande = await queryOne<{ enorme: boolean }>(sql`
    SELECT (area_km2 > ${HUGE_MUNICIPALITY_KM2}) AS enorme
    FROM core.municipality WHERE code = ${muniCode}
  `);

  if (grande?.enorme) {
    /*
     * Una corrida anterior pudo haber sembrado el municipio entero. Esas celdas sin un solo
     * predio no aportan nada y son las que hacen que los pasos siguientes no terminen, así
     * que se retiran antes de recalcular.
     */
    const borradas = await paso('limpiar_vacias', () => executeMaintenance(sql`
      DELETE FROM analytics.h3_cell c
      WHERE c.muni_code = ${muniCode} AND c.res = ${res}
        AND NOT EXISTS (
          SELECT 1 FROM core.parcel p
          JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
          WHERE p.dept_code = ${deptCode} AND p.muni_code = ${muniCode}
            AND (CASE WHEN ${res} = 8 THEN p.h3_r8 ELSE p.h3_r9 END) = c.h3
        )
    `));
    if (borradas > 0) {
      console.log(`    [${muniCode} r${res}] ${borradas} celdas sin predios retiradas`);
    }
  }

  const seeded = grande?.enorme
    ? await paso('seed_predios', () => executeMaintenance(sql`
        INSERT INTO analytics.h3_cell (h3, res, muni_code, dept_code)
        SELECT DISTINCT CASE WHEN ${res} = 8 THEN p.h3_r8 ELSE p.h3_r9 END, ${res}::int, ${muniCode}, ${deptCode}
        FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
        WHERE p.dept_code = ${deptCode} AND p.muni_code = ${muniCode}
          AND (CASE WHEN ${res} = 8 THEN p.h3_r8 ELSE p.h3_r9 END) IS NOT NULL
        ON CONFLICT (h3) DO UPDATE SET muni_code = EXCLUDED.muni_code, dept_code = EXCLUDED.dept_code
      `))
    : await paso('seed', () => executeMaintenance(sql`
        INSERT INTO analytics.h3_cell (h3, res, muni_code, dept_code)
        SELECT h3_polygon_to_cells(m.geom, ${res}), ${res}, m.code, m.dept_code
        FROM core.municipality m
        WHERE m.code = ${muniCode} AND m.geom IS NOT NULL
        ON CONFLICT (h3) DO UPDATE SET muni_code = EXCLUDED.muni_code, dept_code = EXCLUDED.dept_code
      `));

  if (seeded === 0) {
    await paso('seed_hull', () => executeMaintenance(sql`
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
    `));
  }

  // 2. Catastro: conteos, áreas y reparto por destino económico.
  //
  // Toda CTE de un solo uso va AS MATERIALIZED (aquí y en los pasos siguientes). Sin ello el
  // planificador puede meterla como lado interno de un bucle anidado y recalcular el agregado
  // completo por cada celda: el paso 2 pasó de 0,2 s (resolución 8) a 76 s (resolución 9)
  // en Santa Rosa del Sur por esa sola diferencia de plan. Medido con AGGREGATE_TRACE=1.
  await paso('cadastre', () => executeMaintenance(sql`
    WITH agg AS MATERIALIZED (
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
  `));

  // 3. Destino económico por celda.
  await paso('use', () => executeMaintenance(sql`
    WITH uc AS MATERIALIZED (
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
  `));

  // 4. Población: reparto por área de manzana.
  await paso('population', () => executeMaintenance(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    pop AS MATERIALIZED (
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
  `));

  // 5. Equipamientos y POIs.
  await paso('facilities', () => executeMaintenance(sql`
    WITH cells AS (
      SELECT h3, geom FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    sc AS MATERIALIZED (
      SELECT cl.h3, count(*)::int AS n, sum(s2.enrollment)::int AS enrollment
      FROM cells cl
      JOIN ctx.school s2 ON ST_Intersects(s2.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = s2.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    hf AS MATERIALIZED (
      SELECT cl.h3, count(*)::int AS n
      FROM cells cl
      JOIN ctx.health_facility h ON ST_Intersects(h.geom, cl.geom)
      JOIN meta.snapshot sn ON sn.id = h.snapshot_id AND sn.is_active
      GROUP BY cl.h3
    ),
    po AS MATERIALIZED (
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
  `));

  // 6. Restricciones y relieve.
  //
  // Se cruza contra `analytics.overlay_piece` (polígonos troceados por la migración 0016),
  // no contra las capas originales: la de inundación del IDEAM tiene polígonos de medio
  // millón de vértices y cruzar 9.000 celdas contra ellos no terminaba nunca. El solape de
  // una celda con una figura es la suma de sus solapes con las piezas de esa figura, y
  // analytics.overlap_area_m2 se ahorra la intersección cuando una contiene a la otra.
  await paso('restrictions', () => executeMaintenance(sql`
    WITH cells AS (
      SELECT h3, geom, ST_Area(ST_Transform(geom, 9377)) AS area_m2
      FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    ov AS MATERIALIZED (
      /* solape (%) de cada celda con cada figura de cada capa */
      SELECT cl.h3, op.layer, op.source_id,
             LEAST(100, round((sum(analytics.overlap_area_m2(cl.geom, cl.area_m2, op.geom, op.area_m2))
                               / NULLIF(cl.area_m2, 0) * 100)::numeric, 3)) AS pct
      FROM cells cl
      JOIN analytics.overlay_piece op
        ON op.layer IN ('protected_area', 'ethnic_territory', 'urban_perimeter')
       AND op.geom && cl.geom AND ST_Intersects(op.geom, cl.geom)
      GROUP BY cl.h3, cl.area_m2, op.layer, op.source_id
    ),
    pa AS (SELECT h3, max(pct) AS pct FROM ov WHERE layer = 'protected_area' GROUP BY h3),
    et AS (SELECT h3, max(pct) AS pct FROM ov WHERE layer = 'ethnic_territory' GROUP BY h3),
    up AS (SELECT h3, max(pct) AS pct FROM ov WHERE layer = 'urban_perimeter' GROUP BY h3),
    hz AS MATERIALIZED (
      SELECT h3, jsonb_object_agg(kind, level) AS flags FROM (
        SELECT DISTINCT ON (cl.h3, op.key) cl.h3, op.key AS kind, op.value AS level
        FROM cells cl
        JOIN analytics.overlay_piece op
          ON op.layer = 'hazard' AND op.geom && cl.geom AND ST_Intersects(op.geom, cl.geom)
        ORDER BY cl.h3, op.key, op.rank DESC NULLS LAST
      ) t GROUP BY h3
    ),
    el AS MATERIALIZED (
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
  `));

  // 6b. Suelos: reparto de clase agrológica y de vocación dentro de la celda.
  //     Se guarda el reparto completo, no solo la clase dominante: una celda mitad clase 3
  //     y mitad clase 7 no es una celda de clase 5, y la ficha debe poder decirlo.
  //     `cell-inputs.ts` toma de aquí la clave dominante para puntuar.
  await paso('soils', () => executeMaintenance(sql`
    WITH cells AS (
      SELECT h3, geom, ST_Area(ST_Transform(geom, 9377)) AS area_m2
      FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    ov AS MATERIALIZED (
      SELECT cl.h3, op.layer, op.key,
             LEAST(100, round((sum(analytics.overlap_area_m2(cl.geom, cl.area_m2, op.geom, op.area_m2))
                               / NULLIF(cl.area_m2, 0) * 100)::numeric, 2)) AS pct
      FROM cells cl
      JOIN analytics.overlay_piece op
        ON op.layer IN ('land_capability', 'land_vocation') AND op.key IS NOT NULL
       AND op.geom && cl.geom AND ST_Intersects(op.geom, cl.geom)
      GROUP BY cl.h3, cl.area_m2, op.layer, op.key
    ),
    cap AS (SELECT h3, jsonb_object_agg(key, pct) AS mix FROM ov WHERE layer = 'land_capability' GROUP BY h3),
    voc AS (SELECT h3, jsonb_object_agg(key, pct) AS mix FROM ov WHERE layer = 'land_vocation' GROUP BY h3)
    UPDATE analytics.h3_cell c SET
      capability_mix = COALESCE(cap.mix, '{}'::jsonb),
      vocation_mix = COALESCE(voc.mix, '{}'::jsonb)
    FROM cells cl
    LEFT JOIN cap ON cap.h3 = cl.h3
    LEFT JOIN voc ON voc.h3 = cl.h3
    WHERE c.h3 = cl.h3 AND c.res = ${res}
  `));

  // 7. Accesibilidad vial desde el centro de cada celda.
  //
  // Un vecino más cercano por celda (LATERAL + ORDER BY <-> + LIMIT 1), no un join de cada
  // celda contra todas las vías a 15 km con min(). Con cuatro vías de demostración daba
  // igual; con 965.695 vías y un municipio de 10.000 celdas, el join cruzaba millones de
  // pares y superaba cualquier tiempo de espera razonable. El operador <-> usa el índice
  // geográfico de la migración 0014 y devuelve la distancia exacta en metros.
  await paso('roads', () => executeMaintenance(sql`
    WITH cells AS (
      SELECT h3, ST_Centroid(geom)::geography AS pt
      FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
    ),
    /* MATERIALIZED es obligatorio: sin él, con pocas celdas el planificador mete acc
       como lado interno de un bucle anidado y recalcula las dos búsquedas de vecino más
       cercano por cada fila del UPDATE, o sea celdas² consultas. Medido: 100 s para 320
       celdas de resolución 8, frente a 3 s para las 2.240 de resolución 9 del mismo
       municipio, donde el planificador sí elegía un hash join. */
    acc AS MATERIALIZED (
      SELECT
        cl.h3,
        (SELECT ST_Distance(rd.geom::geography, cl.pt)
           FROM ctx.road rd
           JOIN meta.snapshot sn ON sn.id = rd.snapshot_id AND sn.is_active
           WHERE rd.class IN ('motorway','trunk','primary')
             AND ST_DWithin(rd.geom::geography, cl.pt, 15000)
           ORDER BY rd.geom::geography <-> cl.pt
           LIMIT 1) AS d_primary,
        (SELECT ST_Distance(rd.geom::geography, cl.pt)
           FROM ctx.road rd
           JOIN meta.snapshot sn ON sn.id = rd.snapshot_id AND sn.is_active
           WHERE rd.is_paved
             AND ST_DWithin(rd.geom::geography, cl.pt, 15000)
           ORDER BY rd.geom::geography <-> cl.pt
           LIMIT 1) AS d_paved
      FROM cells cl
    ),
    seat AS MATERIALIZED (
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
  `));

  // 8. Linaje: qué snapshots alimentaron estas celdas.
  await paso('lineage', () => executeMaintenance(sql`
    WITH snaps AS MATERIALIZED (
      SELECT jsonb_object_agg(dataset_id, id) AS m FROM meta.snapshot WHERE is_active
    )
    UPDATE analytics.h3_cell c
    SET source_snapshots = snaps.m, computed_at = now()
    FROM snaps
    WHERE c.muni_code = ${muniCode} AND c.res = ${res}
  `));

  const row = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM analytics.h3_cell WHERE muni_code = ${muniCode} AND res = ${res}
  `);
  return row?.n ?? 0;
}

/**
 * Regenera las piezas troceadas de las capas de restricción (migración 0016) si cambió el
 * conjunto de cortes activos. Hay que llamarla antes de recalcular celdas y después de
 * cargar amenazas, RUNAP, resguardos, perímetros o suelos. Devuelve qué capas rehízo.
 */
export async function refreshOverlayPieces(
  force = false,
): Promise<Array<{ layer: string; refreshed: boolean; n_pieces: number }>> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // Trocear 77 millones de vértices de amenazas tarda minutos; no es una consulta interactiva.
    await client.query('SET LOCAL statement_timeout = 3600000');
    const res = await client.query<{ layer: string; refreshed: boolean; n_pieces: string }>(
      'SELECT layer, refreshed, n_pieces FROM analytics.refresh_overlay_pieces($1)',
      [force],
    );
    await client.query('COMMIT');
    return res.rows.map((r) => ({ layer: r.layer, refreshed: r.refreshed, n_pieces: Number(r.n_pieces) }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function refreshMuniSummary(): Promise<void> {
  // CONCURRENTLY exige el índice único que crea la migración 0006.
  await execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.muni_summary`);
}

export async function getMuniSummary(muniCode: string) {
  return queryOne(sql`SELECT * FROM analytics.muni_summary WHERE muni_code = ${muniCode}`);
}

export interface MuniIndicatorRow {
  indicator: string;
  period: string;
  value: number | null;
  unit: string | null;
  national_rank: number | null;
  national_pct: number | null;
  source_snapshots: Record<string, number>;
  /** Municipios con valor en ese indicador y periodo: el «de M» del puesto. */
  n_ranked: number;
}

export async function getIndicators(muniCode: string, period?: string): Promise<MuniIndicatorRow[]> {
  return query<MuniIndicatorRow>(sql`
    SELECT mi.indicator, mi.period, mi.value, mi.unit, mi.national_rank, mi.national_pct,
           mi.source_snapshots,
           (SELECT count(*)::int FROM analytics.muni_indicator x
             WHERE x.indicator = mi.indicator AND x.period = mi.period AND x.value IS NOT NULL) AS n_ranked
    FROM analytics.muni_indicator mi
    WHERE mi.muni_code = ${muniCode} ${period ? sql`AND mi.period = ${period}` : sql``}
    ORDER BY mi.indicator, mi.period DESC
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

/**
 * Recalcula el puesto nacional de un indicador en un periodo. El puesto 1 es el MEJOR
 * municipio, así que la dirección importa: en deserción o repitencia gana el valor más
 * bajo. `national_pct` es el percentil en la misma dirección (100 = mejor que todos).
 */
export async function recomputeRanks(
  indicator: string,
  period: string,
  higherIsBetter = true,
): Promise<void> {
  await execute(sql`
    WITH ranked AS (
      SELECT muni_code,
             rank() OVER (ORDER BY value ${higherIsBetter ? sql`DESC` : sql`ASC`}) AS r,
             percent_rank() OVER (ORDER BY value ${higherIsBetter ? sql`ASC` : sql`DESC`}) * 100 AS pct
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
