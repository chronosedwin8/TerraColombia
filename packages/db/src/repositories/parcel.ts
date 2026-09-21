import type { ParcelQuery } from '@terracolombia/shared';
import { query, queryOne, queryWithTimeout } from '../pool.js';
import { bboxEnvelope, geoJson, ident, join, numericRange, raw, sql, values, where } from '../sql.js';
import type { SqlBuilder } from '../sql.js';

/**
 * Lista blanca de columnas filtrables. **Ningún nombre de columna llega desde el cliente**:
 * el DSL declara claves de negocio y aquí se traducen (ADR-007).
 */
const FILTER_COLUMN: Record<string, string> = {
  area_m2: 'p.area_geom_m2',
  built_area_m2: 'p.built_area_m2',
  cadastral_value: 'p.cadastral_value',
  sector: 'p.sector',
  neighborhood: 'p.neighborhood',
  block_or_vereda: 'p.block_or_vereda',
};

const SORT_COLUMN: Record<string, string> = {
  area_m2: 'p.area_geom_m2',
  built_area_m2: 'p.built_area_m2',
  cadastral_value: 'p.cadastral_value',
  npn: 'p.npn',
};

/** Tabla, columna de geometría y filtro de clase para cada capa de `near`. */
const NEAR_LAYER: Record<
  string,
  { table: string; geom: string; classColumn: string | null; needsActiveSnapshot: boolean }
> = {
  road: { table: 'ctx.road', geom: 'geom', classColumn: 'class', needsActiveSnapshot: true },
  school: { table: 'ctx.school', geom: 'geom', classColumn: 'sector', needsActiveSnapshot: true },
  health_facility: {
    table: 'ctx.health_facility',
    geom: 'geom',
    classColumn: 'level',
    needsActiveSnapshot: true,
  },
  poi: { table: 'ctx.poi', geom: 'geom', classColumn: 'category', needsActiveSnapshot: true },
  protected_area: {
    table: 'ctx.protected_area',
    geom: 'geom',
    classColumn: 'category',
    needsActiveSnapshot: true,
  },
  hazard: { table: 'ctx.hazard', geom: 'geom', classColumn: 'kind', needsActiveSnapshot: true },
  urban_perimeter: {
    table: 'core.urban_perimeter',
    geom: 'geom',
    classColumn: null,
    needsActiveSnapshot: true,
  },
};

export interface ParcelRow {
  npn: string;
  npn_old: string | null;
  muni_code: string;
  muni_name: string;
  dept_code: string;
  dept_name: string;
  zone: string;
  address: string | null;
  area_geom_m2: number | null;
  area_reported_m2: number | null;
  built_area_m2: number | null;
  economic_use: string | null;
  cadastral_value: number | null;
  valuation_year: number | null;
  is_ph: boolean;
  matrix_npn: string | null;
  attrs: Record<string, unknown>;
  lng: number | null;
  lat: number | null;
  cut_date: string | null;
  dataset_id: string | null;
  is_synthetic: boolean;
  geojson?: string | null;
}

const PARCEL_SELECT = raw(`
  p.npn, p.npn_old, p.muni_code, m.name AS muni_name, p.dept_code, d.name AS dept_name,
  p.zone, p.address, p.area_geom_m2, p.area_reported_m2, p.built_area_m2,
  p.economic_use, p.cadastral_value, p.valuation_year, p.is_ph, p.matrix_npn, p.attrs,
  ST_X(p.centroid)::double precision AS lng,
  ST_Y(p.centroid)::double precision AS lat,
  s.cut_date::text AS cut_date, s.dataset_id, s.is_synthetic
`);

const PARCEL_FROM = raw(`
  FROM core.parcel p
  JOIN meta.snapshot s ON s.id = p.snapshot_id
  JOIN core.municipality m ON m.code = p.muni_code
  JOIN core.department d ON d.code = p.dept_code
`);

/**
 * Ficha de un predio. `cutDate` nulo = snapshot activo; con fecha, el corte histórico.
 * El filtro por `dept_code` permite a PostgreSQL podar particiones.
 */
export async function getParcel(
  npn: string,
  opts: { cutDate?: string; withGeometry?: boolean } = {},
): Promise<ParcelRow | null> {
  const deptCode = npn.slice(0, 2);
  const snapshotFilter = opts.cutDate
    ? sql`s.cut_date = ${opts.cutDate}::date AND s.status IN ('published','superseded')`
    : sql`s.is_active`;
  const geomSelect = opts.withGeometry ? raw(', ST_AsGeoJSON(p.geom) AS geojson') : raw('');

  return queryOne<ParcelRow>(sql`
    SELECT ${PARCEL_SELECT}${geomSelect}
    ${PARCEL_FROM}
    WHERE p.dept_code = ${deptCode} AND p.npn = ${npn} AND ${snapshotFilter}
    ORDER BY s.cut_date DESC
    LIMIT 1
  `);
}

/**
 * Resuelve un código predial del formato anterior (20 dígitos) buscándolo en `npn_old`.
 *
 * No hay conversión aritmética posible del código de 20 al de 30 (el tramo del terreno ya
 * ocupa 21 dígitos), así que la única forma honesta es buscar el valor que la propia fuente
 * publicó en esa columna. Si la fuente no lo trae, no hay resultado y el producto lo dice.
 */
export async function findParcelByLegacyNpn(npnOld: string): Promise<ParcelRow[]> {
  const digits = npnOld.replace(/\D/g, '');
  if (digits.length !== 20) return [];
  return query<ParcelRow>(sql`
    SELECT ${PARCEL_SELECT}
    ${PARCEL_FROM}
    WHERE p.npn_old = ${digits} AND s.is_active
    ORDER BY p.npn
    LIMIT 25
  `);
}

/** Predio en un punto. Lo que ocurre al hacer clic en el mapa. */
export async function parcelAt(lng: number, lat: number): Promise<ParcelRow | null> {
  return queryOne<ParcelRow>(sql`
    SELECT ${PARCEL_SELECT}
    ${PARCEL_FROM}
    WHERE s.is_active
      AND ST_Intersects(p.geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    ORDER BY p.area_geom_m2 ASC NULLS LAST
    LIMIT 1
  `);
}

export async function getParcelGeoJson(npn: string, cutDate?: string): Promise<unknown | null> {
  const row = await queryOne<{ geojson: string | null }>(sql`
    SELECT ST_AsGeoJSON(p.geom) AS geojson
    FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id
    WHERE p.dept_code = ${npn.slice(0, 2)} AND p.npn = ${npn}
      AND ${cutDate ? sql`s.cut_date = ${cutDate}::date` : sql`s.is_active`}
    LIMIT 1
  `);
  return row?.geojson ? JSON.parse(row.geojson) : null;
}

export interface BuildingRow {
  id: number;
  building_ref: string | null;
  floors: number | null;
  built_area_m2: number | null;
  use: string | null;
  built_year: number | null;
  attrs: Record<string, unknown>;
}

export async function getParcelBuildings(npn: string, cutDate?: string): Promise<BuildingRow[]> {
  return query<BuildingRow>(sql`
    SELECT b.id, b.building_ref, b.floors, b.built_area_m2, b.use, b.built_year, b.attrs
    FROM core.building b
    JOIN meta.snapshot s ON s.id = b.snapshot_id
    WHERE b.dept_code = ${npn.slice(0, 2)} AND b.parcel_npn = ${npn}
      AND ${cutDate ? sql`s.cut_date = ${cutDate}::date` : sql`s.is_active`}
    ORDER BY b.building_ref NULLS LAST, b.id
  `);
}

/** Unidades de propiedad horizontal dentro de un predio matriz. */
export async function getParcelUnits(matrixNpn: string, limit = 200): Promise<ParcelRow[]> {
  return query<ParcelRow>(sql`
    SELECT ${PARCEL_SELECT}
    ${PARCEL_FROM}
    WHERE p.dept_code = ${matrixNpn.slice(0, 2)}
      AND p.matrix_npn = ${matrixNpn} AND p.is_ph AND s.is_active
    ORDER BY p.npn
    LIMIT ${limit}
  `);
}

/** Zonas homogéneas que cubren el predio. */
export async function getParcelHomogeneousZones(npn: string) {
  return query(sql`
    SELECT hz.kind, hz.code, hz.unit_value, hz.value_year, hz.attrs,
           core.overlap_pct(p.geom, hz.geom) AS overlap_pct
    FROM core.parcel p
    JOIN meta.snapshot ps ON ps.id = p.snapshot_id AND ps.is_active
    JOIN core.homogeneous_zone hz ON ST_Intersects(p.geom, hz.geom)
    JOIN meta.snapshot hs ON hs.id = hz.snapshot_id AND hs.is_active
    WHERE p.dept_code = ${npn.slice(0, 2)} AND p.npn = ${npn}
    ORDER BY hz.kind, overlap_pct DESC
  `);
}

// ─── Consulta avanzada (DSL) ──────────────────────────────────────────────────

export interface ParcelQueryResult {
  rows: ParcelRow[];
  total: number | null;
  nextCursor: string | null;
}

/**
 * Traduce el DSL validado a SQL parametrizado. El `scope` es obligatorio en el esquema Zod
 * (departamento o municipio), así que nunca se barre el país entero.
 */
export async function queryParcels(
  q: ParcelQuery,
  opts: { timeoutMs?: number; maxRows?: number } = {},
): Promise<ParcelQueryResult> {
  const conditions: SqlBuilder[] = [];

  // Alcance
  if (q.scope.municipality) {
    conditions.push(sql`p.dept_code = ${q.scope.municipality.slice(0, 2)}`);
    conditions.push(sql`p.muni_code = ${q.scope.municipality}`);
  } else if (q.scope.department) {
    conditions.push(sql`p.dept_code = ${q.scope.department}`);
  }

  conditions.push(
    q.scope.cutDate
      ? sql`s.cut_date = ${q.scope.cutDate}::date`
      : sql`s.is_active`,
  );

  // Filtros alfanuméricos
  const w = q.where;
  if (w.zone) conditions.push(sql`p.zone = ${w.zone === 'urbano' ? '01' : '02'}`);
  for (const [key, col] of Object.entries(FILTER_COLUMN)) {
    const range = (w as Record<string, unknown>)[key];
    if (range && typeof range === 'object' && !Array.isArray(range)) {
      conditions.push(...numericRange(raw(col), range as Record<string, number>));
    }
  }
  if (w.sector) conditions.push(sql`p.sector = ${w.sector}`);
  if (w.neighborhood) conditions.push(sql`p.neighborhood = ${w.neighborhood}`);
  if (w.block_or_vereda) conditions.push(sql`p.block_or_vereda = ${w.block_or_vereda}`);
  if (w.economic_use && w.economic_use.length > 0) {
    conditions.push(sql`p.economic_use_fold IN (${values(w.economic_use.map((u) => u.toUpperCase()))})`);
  }
  if (w.address_like) {
    conditions.push(sql`p.address_fold % public.tc_fold(${w.address_like})`);
  }
  if (w.has_building !== undefined) {
    conditions.push(
      w.has_building
        ? sql`p.built_area_m2 IS NOT NULL AND p.built_area_m2 > 0`
        : sql`(p.built_area_m2 IS NULL OR p.built_area_m2 = 0)`,
    );
  }
  if (w.floors) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM core.building b
      WHERE b.dept_code = p.dept_code AND b.parcel_npn = p.npn AND b.snapshot_id = p.snapshot_id
        AND ${join(numericRange(raw('b.floors'), w.floors), ' AND ')}
    )`);
  }
  if (w.homogeneous_zone && w.homogeneous_zone.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM core.homogeneous_zone hz
      JOIN meta.snapshot hs ON hs.id = hz.snapshot_id AND hs.is_active
      WHERE hz.code IN (${values(w.homogeneous_zone)}) AND ST_Intersects(p.geom, hz.geom)
    )`);
  }

  // Filtros espaciales
  if (q.within) conditions.push(sql`ST_Intersects(p.geom, ${geoJson(q.within)})`);
  if (q.bbox) conditions.push(sql`p.geom && ${bboxEnvelope(q.bbox)}`);

  // Proximidad a otras capas
  for (const near of q.near) {
    const layer = NEAR_LAYER[near.layer];
    if (!layer) continue;
    const [schema, table] = layer.table.split('.') as [string, string];
    const classCondition =
      near.class && near.class.length > 0 && layer.classColumn
        ? sql` AND n.${ident(layer.classColumn)} IN (${values(near.class)})`
        : sql``;
    const snapshotJoin = layer.needsActiveSnapshot
      ? sql`JOIN meta.snapshot ns ON ns.id = n.snapshot_id AND ns.is_active`
      : sql``;
    const exists = sql`EXISTS (
      SELECT 1 FROM ${ident(schema)}.${ident(table)} n
      ${snapshotJoin}
      WHERE ST_DWithin(n.${ident(layer.geom)}::geography, p.centroid::geography, ${near.max_m})
      ${classCondition}
    )`;
    conditions.push(near.invert ? sql`NOT ${exists}` : exists);
  }

  // Orden: el esquema Zod ya limita a campos conocidos, pero se vuelve a validar aquí.
  const [sortField = 'area_m2', sortDir = 'desc'] = q.sort.split(':');
  const sortColumn = SORT_COLUMN[sortField] ?? SORT_COLUMN.area_m2!;
  const direction = sortDir === 'asc' ? 'ASC' : 'DESC';

  // Paginación por cursor: (valor de orden, npn) codificados en base64url.
  if (q.cursor) {
    const decoded = decodeCursor(q.cursor);
    if (decoded) {
      const cmp = direction === 'ASC' ? '>' : '<';
      conditions.push(sql`(
        (${raw(sortColumn)} ${raw(cmp)} ${decoded.value})
        OR (${raw(sortColumn)} IS NOT DISTINCT FROM ${decoded.value} AND p.npn ${raw(cmp)} ${decoded.npn})
      )`);
    }
  }

  const limit = Math.min(q.limit, opts.maxRows ?? q.limit);
  const geomSelect =
    q.geometry === 'full' ? raw(', ST_AsGeoJSON(p.geom) AS geojson') : raw('');

  const statement = sql`
    SELECT ${PARCEL_SELECT}${geomSelect}
    ${PARCEL_FROM}
    ${where(conditions)}
    ORDER BY ${raw(sortColumn)} ${raw(direction)} NULLS LAST, p.npn ${raw(direction)}
    LIMIT ${limit + 1}
  `;

  const rows = await queryWithTimeout<ParcelRow>(statement, opts.timeoutMs ?? 8000);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    const last = rows[limit - 1];
    rows.length = limit;
    if (last) {
      nextCursor = encodeCursor({
        value: (last as unknown as Record<string, number | null>)[
          sortColumn.replace('p.', '')
        ] ?? null,
        npn: last.npn,
      });
    }
  }

  return { rows, total: null, nextCursor };
}

/**
 * Conteo aproximado del alcance de una consulta del DSL. Aplica solo los filtros baratos
 * (alcance, corte y geometría de contención): los filtros de proximidad son demasiado caros
 * para contarlos en línea, así que la UI muestra el conteo como "hasta N predios en el área".
 */
export async function countParcels(q: ParcelQuery, timeoutMs = 8000): Promise<number> {
  const conditions: SqlBuilder[] = [];
  if (q.scope.municipality) {
    conditions.push(sql`p.dept_code = ${q.scope.municipality.slice(0, 2)}`);
    conditions.push(sql`p.muni_code = ${q.scope.municipality}`);
  } else if (q.scope.department) {
    conditions.push(sql`p.dept_code = ${q.scope.department}`);
  }
  conditions.push(q.scope.cutDate ? sql`s.cut_date = ${q.scope.cutDate}::date` : sql`s.is_active`);
  if (q.within) conditions.push(sql`ST_Intersects(p.geom, ${geoJson(q.within)})`);
  const row = await queryWithTimeout<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM core.parcel p
        JOIN meta.snapshot s ON s.id = p.snapshot_id
        ${where(conditions)}`,
    timeoutMs,
  );
  return row[0]?.n ?? 0;
}

interface Cursor {
  value: number | string | null;
  npn: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof parsed.npn !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Predios cercanos a un punto o dentro de un radio ─────────────────────────

export async function parcelsNear(
  lng: number,
  lat: number,
  radiusM: number,
  limit = 200,
): Promise<Array<ParcelRow & { distance_m: number }>> {
  return query<ParcelRow & { distance_m: number }>(sql`
    SELECT ${PARCEL_SELECT},
      ST_Distance(p.centroid::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
    ${PARCEL_FROM}
    WHERE s.is_active
      AND ST_DWithin(p.centroid::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})
    ORDER BY distance_m
    LIMIT ${limit}
  `);
}

/** Estadísticas de predios dentro de una geometría. Alimenta el analizador de zona. */
export async function parcelStatsIn(geometry: unknown, cutDate?: string) {
  return queryOne<{
    n_parcels: number;
    n_urban: number;
    n_rural: number;
    area_sum_m2: number | null;
    area_median_m2: number | null;
    built_area_sum_m2: number | null;
    n_with_building: number;
    use_counts: Record<string, number>;
  }>(sql`
    WITH scope AS (SELECT ${geoJson(geometry)} AS g),
    sel AS (
      SELECT p.*
      FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id
      CROSS JOIN scope
      WHERE ${cutDate ? sql`s.cut_date = ${cutDate}::date` : sql`s.is_active`}
        AND p.geom && scope.g AND ST_Intersects(p.geom, scope.g)
    )
    SELECT
      count(*)::int AS n_parcels,
      count(*) FILTER (WHERE zone = '01')::int AS n_urban,
      count(*) FILTER (WHERE zone = '02')::int AS n_rural,
      sum(area_geom_m2) AS area_sum_m2,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY area_geom_m2) AS area_median_m2,
      sum(built_area_m2) AS built_area_sum_m2,
      count(*) FILTER (WHERE built_area_m2 > 0)::int AS n_with_building,
      COALESCE(
        (SELECT jsonb_object_agg(COALESCE(economic_use, 'NO_DISPONIBLE'), n)
         FROM (SELECT economic_use, count(*)::int AS n FROM sel GROUP BY economic_use
               ORDER BY n DESC LIMIT 20) t),
        '{}'::jsonb
      ) AS use_counts
    FROM sel
  `);
}
