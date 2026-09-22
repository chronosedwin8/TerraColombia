import { query, queryOne } from '../pool.js';
import { geoJson, sql } from '../sql.js';

/**
 * Consultas de contexto: qué hay alrededor de un punto, un predio o una zona.
 * Todas devuelven distancias en metros calculadas sobre `geography`, que es exacto para
 * distancias cortas y no exige reproyectar toda la capa.
 */

export interface NearbyRow {
  layer: string;
  id: string;
  name: string | null;
  category: string | null;
  distance_m: number;
  lng: number | null;
  lat: number | null;
  attrs: Record<string, unknown>;
}

/** Capas consultables por `/nearby`, con su proyección a la forma común. */
const NEARBY_SOURCES: Record<
  string,
  { sql: (lng: number, lat: number, radiusM: number, limit: number) => ReturnType<typeof sql> }
> = {
  school: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'school' AS layer, sc.id::text AS id, sc.name, sc.sector AS category,
             ST_Distance(sc.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             ST_X(sc.geom)::double precision AS lng, ST_Y(sc.geom)::double precision AS lat,
             jsonb_build_object('levels', sc.levels, 'enrollment', sc.enrollment,
                                'enrollmentYear', sc.enrollment_year, 'daneCode', sc.dane_code,
                                'locationKind', sc.location_kind) AS attrs
      FROM ctx.school sc
      JOIN meta.snapshot s ON s.id = sc.snapshot_id AND s.is_active
      WHERE sc.geom IS NOT NULL
        AND ST_DWithin(sc.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
  health_facility: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'health_facility' AS layer, hf.id::text AS id, hf.name, hf.level AS category,
             ST_Distance(hf.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             ST_X(hf.geom)::double precision AS lng, ST_Y(hf.geom)::double precision AS lat,
             jsonb_build_object('services', hf.services, 'nature', hf.nature, 'beds', hf.beds,
                                'repsCode', hf.reps_code) AS attrs
      FROM ctx.health_facility hf
      JOIN meta.snapshot s ON s.id = hf.snapshot_id AND s.is_active
      WHERE hf.geom IS NOT NULL
        AND ST_DWithin(hf.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
  poi: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'poi' AS layer, p.id::text AS id, p.name, p.category,
             ST_Distance(p.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             ST_X(p.geom)::double precision AS lng, ST_Y(p.geom)::double precision AS lat,
             jsonb_build_object('subcategory', p.subcategory) AS attrs
      FROM ctx.poi p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
  road: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'road' AS layer, rd.id::text AS id, rd.name, rd.class AS category,
             ST_Distance(rd.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             NULL::double precision AS lng, NULL::double precision AS lat,
             jsonb_build_object('surface', rd.surface, 'isPaved', rd.is_paved,
                                'lanes', rd.lanes, 'maxspeedKmh', rd.maxspeed_kmh) AS attrs
      FROM ctx.road rd
      JOIN meta.snapshot s ON s.id = rd.snapshot_id AND s.is_active
      WHERE ST_DWithin(rd.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
  protected_area: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'protected_area' AS layer, pa.id::text AS id, pa.name, pa.category,
             ST_Distance(pa.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             NULL::double precision AS lng, NULL::double precision AS lat,
             jsonb_build_object('isRestrictive', pa.is_restrictive, 'authority', pa.authority) AS attrs
      FROM ctx.protected_area pa
      JOIN meta.snapshot s ON s.id = pa.snapshot_id AND s.is_active
      WHERE ST_DWithin(pa.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
  hazard: {
    sql: (lng, lat, r, limit) => sql`
      SELECT 'hazard' AS layer, hz.id::text AS id, hz.kind AS name, hz.level AS category,
             ST_Distance(hz.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography) AS distance_m,
             NULL::double precision AS lng, NULL::double precision AS lat,
             jsonb_build_object('source', hz.source, 'scale', hz.scale, 'levelRank', hz.level_rank) AS attrs
      FROM ctx.hazard hz
      JOIN meta.snapshot s ON s.id = hz.snapshot_id AND s.is_active
      WHERE ST_DWithin(hz.geom::geography, ST_SetSRID(ST_MakePoint(${lng},${lat}),4326)::geography, ${r})
      ORDER BY distance_m LIMIT ${limit}`,
  },
};

export const NEARBY_LAYER_IDS = Object.keys(NEARBY_SOURCES);

export async function nearby(
  lng: number,
  lat: number,
  radiusM: number,
  layers: string[],
  limitPerLayer = 20,
): Promise<NearbyRow[]> {
  const wanted = layers.length > 0 ? layers.filter((l) => l in NEARBY_SOURCES) : NEARBY_LAYER_IDS;
  const out: NearbyRow[] = [];
  for (const layer of wanted) {
    const source = NEARBY_SOURCES[layer];
    if (!source) continue;
    const rows = await query<NearbyRow>(source.sql(lng, lat, radiusM, limitPerLayer));
    out.push(...rows);
  }
  return out.sort((a, b) => a.distance_m - b.distance_m);
}

// ─── Solapamientos sobre una geometría ────────────────────────────────────────

export interface OverlapRow {
  kind: string;
  code: string | null;
  label: string | null;
  overlap_pct: number;
  attrs: Record<string, unknown>;
}

/** Suelos: unidad cartográfica, capacidad de uso, vocación y conflicto. */
export async function soilOverlaps(geometry: unknown): Promise<OverlapRow[]> {
  return query<OverlapRow>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT 'soil_unit' AS kind, su.symbol AS code, su.description AS label,
           core.overlap_pct(scope.g, su.geom) AS overlap_pct,
           jsonb_build_object('slopeRange', su.slope_range, 'climate', su.climate) AS attrs
    FROM ctx.soil_unit su
    JOIN meta.snapshot s ON s.id = su.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE su.geom && scope.g AND ST_Intersects(su.geom, scope.g)

    UNION ALL
    SELECT 'land_capability', lc.subclass, lc.description,
           core.overlap_pct(scope.g, lc.geom),
           jsonb_build_object('classCode', lc.class_code)
    FROM ctx.land_capability lc
    JOIN meta.snapshot s ON s.id = lc.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE lc.geom && scope.g AND ST_Intersects(lc.geom, scope.g)

    UNION ALL
    SELECT 'land_vocation', lv.vocation, lv.description,
           core.overlap_pct(scope.g, lv.geom),
           jsonb_build_object('useClass', lv.use_class)
    FROM ctx.land_vocation lv
    JOIN meta.snapshot s ON s.id = lv.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE lv.geom && scope.g AND ST_Intersects(lv.geom, scope.g)

    UNION ALL
    SELECT 'land_use_conflict', luc.conflict_kind, luc.description,
           core.overlap_pct(scope.g, luc.geom),
           jsonb_build_object('severity', luc.severity)
    FROM ctx.land_use_conflict luc
    JOIN meta.snapshot s ON s.id = luc.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE luc.geom && scope.g AND ST_Intersects(luc.geom, scope.g)

    ORDER BY 4 DESC
  `);
}

export async function hazardOverlaps(geometry: unknown) {
  return query<{
    kind: string;
    level: string | null;
    level_rank: number | null;
    source: string;
    scale: string | null;
    overlap_pct: number;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT hz.kind, hz.level, hz.level_rank, hz.source, hz.scale,
           core.overlap_pct(scope.g, hz.geom) AS overlap_pct
    FROM ctx.hazard hz
    JOIN meta.snapshot s ON s.id = hz.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE hz.geom && scope.g AND ST_Intersects(hz.geom, scope.g)
    ORDER BY hz.level_rank DESC NULLS LAST, overlap_pct DESC
  `);
}

export async function protectedAreaOverlaps(geometry: unknown) {
  return query<{
    name: string;
    category: string | null;
    is_restrictive: boolean;
    authority: string | null;
    overlap_pct: number;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT pa.name, pa.category, pa.is_restrictive, pa.authority,
           core.overlap_pct(scope.g, pa.geom) AS overlap_pct
    FROM ctx.protected_area pa
    JOIN meta.snapshot s ON s.id = pa.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE pa.geom && scope.g AND ST_Intersects(pa.geom, scope.g)
    ORDER BY overlap_pct DESC
  `);
}

export async function ethnicTerritoryOverlaps(geometry: unknown) {
  return query<{ name: string; kind: string; people: string | null; overlap_pct: number }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT et.name, et.kind, et.people, core.overlap_pct(scope.g, et.geom) AS overlap_pct
    FROM ctx.ethnic_territory et
    JOIN meta.snapshot s ON s.id = et.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE et.geom && scope.g AND ST_Intersects(et.geom, scope.g)
    ORDER BY overlap_pct DESC
  `);
}

export async function potZoneOverlaps(geometry: unknown, muniCode?: string) {
  return query<{
    classification: string | null;
    use: string | null;
    source_doc: string | null;
    max_height_floors: number | null;
    overlap_pct: number;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT pz.classification, pz.use, pz.source_doc, pz.max_height_floors,
           core.overlap_pct(scope.g, pz.geom) AS overlap_pct
    FROM ctx.pot_zone pz
    JOIN meta.snapshot s ON s.id = pz.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE pz.geom && scope.g AND ST_Intersects(pz.geom, scope.g)
      ${muniCode ? sql`AND pz.muni_code = ${muniCode}` : sql``}
    ORDER BY overlap_pct DESC
  `);
}

export async function miningTitleOverlaps(geometry: unknown) {
  return query<{
    title_code: string | null;
    stage: string | null;
    mineral: string | null;
    holder_legal_entity: string | null;
    overlap_pct: number;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT mt.title_code, mt.stage, mt.mineral, mt.holder_legal_entity,
           core.overlap_pct(scope.g, mt.geom) AS overlap_pct
    FROM ctx.mining_title mt
    JOIN meta.snapshot s ON s.id = mt.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE mt.geom && scope.g AND ST_Intersects(mt.geom, scope.g)
    ORDER BY overlap_pct DESC
  `);
}

export async function agriculturalFrontierOverlap(geometry: unknown) {
  return query<{ category: string | null; overlap_pct: number }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT af.category, core.overlap_pct(scope.g, af.geom) AS overlap_pct
    FROM ctx.agricultural_frontier af
    JOIN meta.snapshot s ON s.id = af.snapshot_id AND s.is_active
    CROSS JOIN scope
    WHERE af.geom && scope.g AND ST_Intersects(af.geom, scope.g)
    ORDER BY overlap_pct DESC
  `);
}

/** true/false/null: dentro del perímetro urbano, fuera, o sin dato para el municipio. */
export async function insideUrbanPerimeter(
  geometry: unknown,
  muniCode: string,
): Promise<boolean | null> {
  const row = await queryOne<{ has_data: boolean; overlap: number | null }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g),
    up AS (
      SELECT ST_Union(u.geom) AS g
      FROM core.urban_perimeter u
      JOIN meta.snapshot s ON s.id = u.snapshot_id AND s.is_active
      WHERE u.muni_code = ${muniCode}
    )
    SELECT (up.g IS NOT NULL) AS has_data,
           CASE WHEN up.g IS NULL THEN NULL ELSE core.overlap_pct(scope.g, up.g) END AS overlap
    FROM scope CROSS JOIN up
  `);
  if (!row || !row.has_data) return null;
  return (row.overlap ?? 0) > 50;
}

// ─── Población ────────────────────────────────────────────────────────────────

/**
 * Población dentro de una geometría, prorrateada por el área de cada manzana que cae dentro.
 * Es una aproximación: el CNPV publica agregados por manzana, no puntos. Se declara como tal
 * en la UI ("estimación por reparto de área").
 */
export async function populationIn(geometry: unknown) {
  return queryOne<{
    pop_total: number | null;
    households: number | null;
    dwellings: number | null;
    n_blocks: number;
    age_bands: Record<string, number> | null;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g),
    hit AS (
      SELECT cb.*, core.overlap_pct(cb.geom, scope.g) / 100.0 AS frac
      FROM ctx.census_block cb
      JOIN meta.snapshot s ON s.id = cb.snapshot_id AND s.is_active
      CROSS JOIN scope
      WHERE cb.geom && scope.g AND ST_Intersects(cb.geom, scope.g)
    )
    SELECT
      round(sum(pop_total * frac))::int AS pop_total,
      round(sum(households * frac))::int AS households,
      round(sum(dwellings * frac))::int AS dwellings,
      count(*)::int AS n_blocks,
      (
        SELECT jsonb_object_agg(k, v)
        FROM (
          SELECT k, round(sum((val)::numeric * frac))::int AS v
          FROM hit, LATERAL jsonb_each_text(hit.age_bands) AS kv(k, val)
          WHERE val ~ '^[0-9]+$'
          GROUP BY k
        ) t
      ) AS age_bands
    FROM hit
  `);
}

// ─── Relieve ──────────────────────────────────────────────────────────────────

export async function reliefFor(geometry: unknown) {
  return queryOne<{ elevation_mean_m: number | null; slope_mean_pct: number | null; slope_max_pct: number | null }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g),
    cells AS (
      SELECT ec.*
      FROM ctx.elevation_cell ec
      JOIN meta.snapshot s ON s.id = ec.snapshot_id AND s.is_active
      CROSS JOIN scope
      WHERE ec.h3 = ANY (SELECT h3_polygon_to_cells(scope.g, ec.res))
    )
    SELECT avg(elevation_mean_m) AS elevation_mean_m,
           avg(slope_mean_pct) AS slope_mean_pct,
           max(slope_max_pct) AS slope_max_pct
    FROM cells
  `);
}

// ─── Contexto de equipamientos dentro de una zona ─────────────────────────────

export async function facilitiesIn(geometry: unknown) {
  return queryOne<{
    n_schools: number;
    school_enrollment: number | null;
    n_health: number;
    /**
     * Prestadores de salud registrados en los municipios que toca el ámbito pero SIN
     * coordenadas, así que no se pueden contar por intersección.
     *
     * Existe porque el registro oficial del REPS no publica coordenadas: de 76.824 sedes
     * cargadas, solo 3 traen geometría. Contar por intersección devolvía 0 en zonas con
     * decenas de prestadores, y mostrar «0 prestadores de salud» ahí no es un hueco de
     * datos: es una afirmación falsa. Con este número, quien consume puede decir la verdad
     * —«hay N registrados en el municipio, pero la fuente no dice dónde están»— en vez de
     * inventar un cero (reglas 4 y 6).
     */
    n_health_unlocated: number;
    poi_counts: Record<string, number>;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g)
    SELECT
      (SELECT count(*)::int FROM ctx.school sc
        JOIN meta.snapshot s ON s.id = sc.snapshot_id AND s.is_active
        CROSS JOIN scope WHERE sc.geom && scope.g AND ST_Intersects(sc.geom, scope.g)) AS n_schools,
      (SELECT sum(sc.enrollment)::int FROM ctx.school sc
        JOIN meta.snapshot s ON s.id = sc.snapshot_id AND s.is_active
        CROSS JOIN scope WHERE sc.geom && scope.g AND ST_Intersects(sc.geom, scope.g)) AS school_enrollment,
      (SELECT count(*)::int FROM ctx.health_facility hf
        JOIN meta.snapshot s ON s.id = hf.snapshot_id AND s.is_active
        CROSS JOIN scope WHERE hf.geom && scope.g AND ST_Intersects(hf.geom, scope.g)) AS n_health,
      (SELECT count(*)::int FROM ctx.health_facility hf
        JOIN meta.snapshot s ON s.id = hf.snapshot_id AND s.is_active
        WHERE hf.geom IS NULL
          AND hf.muni_code IN (
            SELECT m.code FROM core.municipality m CROSS JOIN scope
            WHERE m.geom IS NOT NULL AND m.geom && scope.g AND ST_Intersects(m.geom, scope.g)
          )) AS n_health_unlocated,
      COALESCE((
        SELECT jsonb_object_agg(category, n) FROM (
          SELECT p.category, count(*)::int AS n
          FROM ctx.poi p
          JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
          CROSS JOIN scope
          WHERE p.geom && scope.g AND ST_Intersects(p.geom, scope.g)
          GROUP BY p.category
        ) t
      ), '{}'::jsonb) AS poi_counts
  `);
}

/** Accesibilidad: distancia a la vía más cercana de cada clase relevante. */
/**
 * Distancia en metros al colegio y al prestador de salud más cercanos.
 *
 * Existe porque estos dos valores estaban clavados a `null` en el recolector de
 * indicadores, con un comentario que explicaba la política para cuando no hay nada cerca
 * —no inventar un «muy lejos»— pero sin código que llegara a mirar. Con los datos de
 * demostración daba igual; con 71.673 sedes educativas y 76.824 prestadores cargados, deja
 * sin dato un indicador que el motor exige para la plantilla de colegio.
 *
 * `maxSearchM` acota la búsqueda: más allá de ese radio se devuelve `null`, que es la
 * respuesta honesta —«no hay ninguno cerca»— y además evita recorrer el país entero cuando
 * el punto cae en una zona sin equipamientos. El filtro usa `ST_DWithin` sobre
 * `geom::geography`, que es lo que indexa la migración 0014.
 */
export async function nearestFacilities(lng: number, lat: number, maxSearchM = 20_000) {
  return queryOne<{ dist_school_m: number | null; dist_health_m: number | null }>(sql`
    WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS g)
    SELECT
      (SELECT min(ST_Distance(sc.geom::geography, pt.g))
         FROM ctx.school sc
         JOIN meta.snapshot s ON s.id = sc.snapshot_id AND s.is_active
         WHERE sc.geom IS NOT NULL
           AND ST_DWithin(sc.geom::geography, pt.g, ${maxSearchM})) AS dist_school_m,
      (SELECT min(ST_Distance(hf.geom::geography, pt.g))
         FROM ctx.health_facility hf
         JOIN meta.snapshot s ON s.id = hf.snapshot_id AND s.is_active
         WHERE hf.geom IS NOT NULL
           AND ST_DWithin(hf.geom::geography, pt.g, ${maxSearchM})) AS dist_health_m
    FROM pt
  `);
}

export async function roadAccess(lng: number, lat: number, maxSearchM = 10_000) {
  return queryOne<{
    dist_primary_m: number | null;
    dist_secondary_m: number | null;
    dist_paved_m: number | null;
    dist_any_m: number | null;
  }>(sql`
    WITH pt AS (SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS g),
    near AS (
      SELECT rd.class, rd.is_paved, ST_Distance(rd.geom::geography, pt.g) AS d
      FROM ctx.road rd
      JOIN meta.snapshot s ON s.id = rd.snapshot_id AND s.is_active
      CROSS JOIN pt
      WHERE ST_DWithin(rd.geom::geography, pt.g, ${maxSearchM})
    )
    SELECT
      min(d) FILTER (WHERE class IN ('motorway','trunk','primary')) AS dist_primary_m,
      min(d) FILTER (WHERE class IN ('secondary','tertiary')) AS dist_secondary_m,
      min(d) FILTER (WHERE is_paved) AS dist_paved_m,
      min(d) AS dist_any_m
    FROM near
  `);
}

/** Distancia a la cabecera municipal. */
export async function distanceToMuniSeat(lng: number, lat: number, muniCode: string) {
  const row = await queryOne<{ d: number | null }>(sql`
    SELECT ST_Distance(
      COALESCE(m.seat_point, m.centroid)::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    ) AS d
    FROM core.municipality m WHERE m.code = ${muniCode}
  `);
  return row?.d ?? null;
}
