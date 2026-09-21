import { query } from '../pool.js';
import { sql } from '../sql.js';

export interface SearchHit {
  kind: string;
  ref: string;
  label: string;
  context: string | null;
  muni_code: string | null;
  dept_code: string | null;
  similarity: number;
  lng: number | null;
  lat: number | null;
}

/**
 * Búsqueda de topónimos, municipios, barrios y veredas sobre el índice unificado.
 * El umbral de similitud se fija por sesión para que un error de tecleo no deje sin resultados.
 */
export async function searchText(
  q: string,
  opts: { limit?: number; muniCode?: string; threshold?: number } = {},
): Promise<SearchHit[]> {
  const threshold = opts.threshold ?? 0.25;
  // `set_limit` fija el umbral del operador % de pg_trgm para esta sesión.
  await query(sql`SELECT set_limit(${threshold}::real)`);
  return query<SearchHit>(sql`
    SELECT * FROM analytics.search_text(${q}, ${opts.limit ?? 10}, ${opts.muniCode ?? null})
  `);
}

export interface AddressHit {
  npn: string | null;
  label: string;
  muni_code: string;
  muni_name: string;
  similarity: number;
  lng: number;
  lat: number;
  source: 'address_point' | 'parcel';
  /** true si el predio viene de un corte de demostración con datos sintéticos. */
  is_synthetic: boolean;
}

/**
 * Búsqueda de direcciones. Va contra dos orígenes: los puntos de nomenclatura del catastro
 * y la dirección normalizada del propio predio. Se busca por separado del índice unificado
 * porque el volumen es de otro orden de magnitud.
 *
 * `wayNumber` es clave para la calidad del resultado. La similitud por trigramas se deja
 * engañar por las palabras que comparten todas las direcciones ("CARRERA", "#", "-"), así
 * que "CARRERA 7A # 18-75" se parece mucho a "CARRERA 18 # 23-75" aunque sean calles
 * distintas. Cuando se puede leer el número de la vía, se exige que coincida: es mejor no
 * devolver nada que mandar al usuario a otra calle.
 */
export async function searchAddress(
  normalized: string,
  opts: {
    muniCode?: string;
    limit?: number;
    threshold?: number;
    /** Número de la vía principal ya extraído por `parseAddress` (por ejemplo "7A"). */
    wayNumber?: string | null;
  } = {},
): Promise<AddressHit[]> {
  const threshold = opts.threshold ?? 0.3;
  await query(sql`SELECT set_limit(${threshold}::real)`);
  const muniFilter = opts.muniCode ? sql`AND ap.muni_code = ${opts.muniCode}` : sql``;
  const muniFilterParcel = opts.muniCode ? sql`AND p.muni_code = ${opts.muniCode}` : sql``;

  // El número va entre delimitadores de palabra para que "7" no case con "17" ni con "70".
  const wayPattern = opts.wayNumber ? `(^|[^0-9A-Z])${opts.wayNumber}([^0-9A-Z]|$)` : null;
  const wayFilter = wayPattern ? sql`AND ap.label_fold ~ ${wayPattern}` : sql``;
  const wayFilterParcel = wayPattern ? sql`AND p.address_fold ~ ${wayPattern}` : sql``;
  const limit = opts.limit ?? 10;

  return query<AddressHit>(sql`
    (
      SELECT
        ap.parcel_npn AS npn, ap.label, ap.muni_code, m.name AS muni_name,
        similarity(ap.label_fold, public.tc_fold(${normalized})) AS similarity,
        ST_X(ap.geom)::double precision AS lng,
        ST_Y(ap.geom)::double precision AS lat,
        'address_point'::text AS source,
        s.is_synthetic
      FROM core.address_point ap
      JOIN meta.snapshot s ON s.id = ap.snapshot_id AND s.is_active
      JOIN core.municipality m ON m.code = ap.muni_code
      WHERE ap.label_fold % public.tc_fold(${normalized}) ${muniFilter} ${wayFilter}
      ORDER BY similarity DESC
      LIMIT ${limit}
    )
    UNION ALL
    (
      SELECT
        p.npn, p.address AS label, p.muni_code, m.name AS muni_name,
        similarity(p.address_fold, public.tc_fold(${normalized})) AS similarity,
        ST_X(p.centroid)::double precision AS lng,
        ST_Y(p.centroid)::double precision AS lat,
        'parcel'::text AS source,
        s.is_synthetic
      FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      JOIN core.municipality m ON m.code = p.muni_code
      WHERE p.address_fold IS NOT NULL
        AND p.address_fold % public.tc_fold(${normalized}) ${muniFilterParcel} ${wayFilterParcel}
      ORDER BY similarity DESC
      LIMIT ${limit}
    )
    ORDER BY similarity DESC
    LIMIT ${limit}
  `);
}

export async function rebuildSearchIndex(): Promise<number> {
  const rows = await query<{ rebuild_search_index: number }>(
    sql`SELECT analytics.rebuild_search_index()`,
  );
  return rows[0]?.rebuild_search_index ?? 0;
}
