import { queryOne } from '../pool.js';
import { ident, raw, sql } from '../sql.js';

/**
 * Teselas vectoriales servidas con `ST_AsMVT` (ADR-003).
 *
 * Cada capa declara: tabla, columna de geometría, columnas publicadas y zoom mínimo.
 * **Las columnas publicadas son una lista cerrada**: nunca se sirve `attrs` completo ni
 * ninguna columna que pudiera arrastrar dato personal.
 */

export interface TileLayerDef {
  id: string;
  table: string;
  geomColumn: string;
  /** Columnas que viajan en la tesela. Lista cerrada. */
  columns: string[];
  /** Zoom a partir del cual se sirve. Por debajo se devuelve tesela vacía. */
  minZoom: number;
  maxZoom: number;
  /** true si la tabla lleva `snapshot_id` y hay que filtrar por el corte activo. */
  snapshotFiltered: boolean;
  /** Filtro adicional fijo, ya validado (no viene del cliente). */
  extraWhere?: string;
}

export const TILE_LAYERS: Record<string, TileLayerDef> = {
  parcel: {
    id: 'parcel',
    table: 'core.parcel',
    geomColumn: 'geom',
    columns: ['npn', 'muni_code', 'zone', 'area_geom_m2', 'built_area_m2', 'economic_use'],
    minZoom: 14,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  building: {
    id: 'building',
    table: 'core.building',
    geomColumn: 'geom',
    columns: ['parcel_npn', 'floors', 'built_area_m2', 'use'],
    minZoom: 15,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  block: {
    id: 'block',
    table: 'core.block',
    geomColumn: 'geom',
    columns: ['muni_code', 'code'],
    minZoom: 12,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  sector: {
    id: 'sector',
    table: 'core.sector',
    geomColumn: 'geom',
    columns: ['muni_code', 'code', 'name', 'zone'],
    minZoom: 10,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  municipality: {
    id: 'municipality',
    table: 'core.municipality',
    geomColumn: 'geom',
    columns: ['code', 'name', 'dept_code', 'population'],
    minZoom: 4,
    maxZoom: 22,
    snapshotFiltered: false,
  },
  department: {
    id: 'department',
    table: 'core.department',
    geomColumn: 'geom',
    columns: ['code', 'name', 'region'],
    minZoom: 0,
    maxZoom: 22,
    snapshotFiltered: false,
  },
  h3: {
    id: 'h3',
    table: 'analytics.h3_cell',
    geomColumn: 'geom',
    columns: [
      'res',
      'muni_code',
      'n_parcels',
      'pop',
      'pop_school_age',
      'n_schools',
      'n_health',
      'road_access_score',
      'slope_mean_pct',
      'protected_pct',
      'urban_pct',
    ],
    minZoom: 6,
    maxZoom: 16,
    snapshotFiltered: false,
  },
  school: {
    id: 'school',
    table: 'ctx.school',
    geomColumn: 'geom',
    columns: ['name', 'sector', 'muni_code', 'enrollment'],
    minZoom: 10,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  health_facility: {
    id: 'health_facility',
    table: 'ctx.health_facility',
    geomColumn: 'geom',
    columns: ['name', 'level', 'nature', 'muni_code'],
    minZoom: 10,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  protected_area: {
    id: 'protected_area',
    table: 'ctx.protected_area',
    geomColumn: 'geom',
    columns: ['name', 'category', 'is_restrictive'],
    minZoom: 5,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  hazard: {
    id: 'hazard',
    table: 'ctx.hazard',
    geomColumn: 'geom',
    columns: ['kind', 'level', 'level_rank', 'source'],
    minZoom: 7,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  soil_unit: {
    id: 'soil_unit',
    table: 'ctx.soil_unit',
    geomColumn: 'geom',
    columns: ['symbol', 'slope_range', 'climate'],
    minZoom: 8,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  pot_zone: {
    id: 'pot_zone',
    table: 'ctx.pot_zone',
    geomColumn: 'geom',
    columns: ['muni_code', 'classification', 'use', 'source_doc'],
    minZoom: 11,
    maxZoom: 22,
    snapshotFiltered: true,
  },
  road: {
    id: 'road',
    table: 'ctx.road',
    geomColumn: 'geom',
    columns: ['name', 'class', 'is_paved'],
    minZoom: 10,
    maxZoom: 22,
    snapshotFiltered: true,
  },
};

export function getTileLayer(id: string): TileLayerDef | null {
  return TILE_LAYERS[id] ?? null;
}

const TILE_EXTENT = 4096;
const TILE_BUFFER = 64;

/**
 * Genera una tesela MVT. Devuelve un Buffer vacío cuando no hay geometrías, que es
 * respuesta válida (204/200 con cuerpo vacío) y evita que el cliente reintente.
 */
export async function renderTile(
  layerId: string,
  z: number,
  x: number,
  y: number,
  opts: { res?: number } = {},
): Promise<Buffer> {
  const layer = getTileLayer(layerId);
  if (!layer) throw new Error(`Capa de teselas desconocida: ${layerId}`);
  if (z < layer.minZoom || z > layer.maxZoom) return Buffer.alloc(0);

  const [schemaName, tableName] = layer.table.split('.') as [string, string];
  // Se construye con `ident`, que lanza ante cualquier nombre fuera de la lista blanca.
  let colsSql = sql``;
  for (const c of layer.columns) colsSql = sql`${colsSql}, ${ident('t')}.${ident(c)}`;

  const snapshotJoin = layer.snapshotFiltered
    ? sql`JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active`
    : sql``;

  // Filtro de resolución para la capa H3: se elige la resolución según el zoom.
  const resFilter =
    layer.id === 'h3'
      ? sql`AND t.res = ${opts.res ?? h3ResForZoom(z)}`
      : sql``;

  const row = await queryOne<{ mvt: Buffer | null }>(sql`
    WITH bounds AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS geom_3857,
             ST_Transform(ST_TileEnvelope(${z}, ${x}, ${y}), 4326) AS geom_4326
    ),
    mvtgeom AS (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(t.${ident(layer.geomColumn)}, 3857),
          bounds.geom_3857,
          ${TILE_EXTENT}, ${TILE_BUFFER}, true
        ) AS geom
        ${colsSql}
      FROM ${ident(schemaName)}.${ident(tableName)} t
      ${snapshotJoin}
      CROSS JOIN bounds
      WHERE t.${ident(layer.geomColumn)} && bounds.geom_4326
        ${resFilter}
        ${layer.extraWhere ? raw(`AND ${layer.extraWhere}`) : sql``}
    )
    SELECT ST_AsMVT(mvtgeom.*, ${layer.id}, ${TILE_EXTENT}, 'geom') AS mvt
    FROM mvtgeom
    WHERE geom IS NOT NULL
  `);

  return row?.mvt ?? Buffer.alloc(0);
}

/**
 * Resolución H3 adecuada para cada zoom. A zoom bajo, hexágonos grandes; a zoom alto,
 * finos. Por encima de 14 se muestran predios, no celdas.
 */
export function h3ResForZoom(z: number): number {
  if (z <= 7) return 6;
  if (z <= 9) return 7;
  if (z <= 12) return 8;
  return 9;
}
