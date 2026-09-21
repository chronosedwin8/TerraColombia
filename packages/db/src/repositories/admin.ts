import type { Coverage } from '@terracolombia/shared';
import { query, queryOne } from '../pool.js';
import { sql } from '../sql.js';

export interface MunicipalityRow {
  code: string;
  dept_code: string;
  name: string;
  dept_name: string;
  category: string | null;
  is_capital: boolean;
  area_km2: number | null;
  population: number | null;
  population_year: number | null;
  lng: number | null;
  lat: number | null;
}

export async function getMunicipality(code: string): Promise<MunicipalityRow | null> {
  return queryOne<MunicipalityRow>(sql`
    SELECT
      m.code, m.dept_code, m.name, d.name AS dept_name, m.category, m.is_capital,
      m.area_km2, m.population, m.population_year,
      ST_X(m.centroid)::double precision AS lng,
      ST_Y(m.centroid)::double precision AS lat
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    WHERE m.code = ${code}
  `);
}

export async function listMunicipalities(deptCode?: string): Promise<MunicipalityRow[]> {
  return query<MunicipalityRow>(sql`
    SELECT
      m.code, m.dept_code, m.name, d.name AS dept_name, m.category, m.is_capital,
      m.area_km2, m.population, m.population_year,
      ST_X(m.centroid)::double precision AS lng,
      ST_Y(m.centroid)::double precision AS lat
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    ${deptCode ? sql`WHERE m.dept_code = ${deptCode}` : sql``}
    ORDER BY d.name, m.name
  `);
}

export async function getMunicipalityGeoJson(code: string): Promise<unknown | null> {
  const row = await queryOne<{ geojson: string }>(sql`
    SELECT ST_AsGeoJSON(geom) AS geojson FROM core.municipality WHERE code = ${code}
  `);
  return row ? JSON.parse(row.geojson) : null;
}

export interface MunicipalityAtResult extends MunicipalityRow {
  /** `polygon` = el punto cae dentro del límite municipal del MGN.
   *  `nearest_centroid` = aún no hay límites cargados y se resolvió por proximidad al
   *  centroide DIVIPOLA. La API lo propaga como aviso para no presentarlo como certeza. */
  match: 'polygon' | 'nearest_centroid';
  distance_m: number | null;
}

/**
 * Municipio que contiene un punto. Base de la búsqueda por coordenadas.
 *
 * Si todavía no se cargaron los límites del MGN (`geom IS NULL`), se resuelve por el
 * centroide más cercano dentro de 80 km y se marca `match: 'nearest_centroid'`, para que la
 * UI pueda decir "municipio aproximado" en vez de afirmar una contención que no verificó.
 */
export async function municipalityAt(
  lng: number,
  lat: number,
): Promise<MunicipalityAtResult | null> {
  const byPolygon = await queryOne<MunicipalityRow>(sql`
    SELECT
      m.code, m.dept_code, m.name, d.name AS dept_name, m.category, m.is_capital,
      m.area_km2, m.population, m.population_year,
      ST_X(m.centroid)::double precision AS lng,
      ST_Y(m.centroid)::double precision AS lat
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    WHERE m.geom IS NOT NULL
      AND ST_Intersects(m.geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    LIMIT 1
  `);
  if (byPolygon) return { ...byPolygon, match: 'polygon', distance_m: 0 };

  const byCentroid = await queryOne<MunicipalityRow & { distance_m: number }>(sql`
    SELECT
      m.code, m.dept_code, m.name, d.name AS dept_name, m.category, m.is_capital,
      m.area_km2, m.population, m.population_year,
      ST_X(m.centroid)::double precision AS lng,
      ST_Y(m.centroid)::double precision AS lat,
      ST_Distance(m.centroid::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
    FROM core.municipality m
    JOIN core.department d ON d.code = m.dept_code
    WHERE m.centroid IS NOT NULL
      AND ST_DWithin(m.centroid::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 80000)
    ORDER BY m.centroid <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
    LIMIT 1
  `);
  if (!byCentroid) return null;
  return { ...byCentroid, match: 'nearest_centroid' };
}

/** Un departamento por su código DIVIPOLA de dos dígitos. */
export async function getDepartmentByCode(code: string) {
  return queryOne<{
    code: string;
    name: string;
    region: string | null;
    area_km2: number | null;
    n_municipalities: number;
  }>(sql`
    SELECT d.code, d.name, d.region, d.area_km2,
           (SELECT count(*)::int FROM core.municipality m WHERE m.dept_code = d.code)
             AS n_municipalities
    FROM core.department d
    WHERE d.code = ${code}
  `);
}

export async function listDepartments() {
  return query<{ code: string; name: string; region: string | null; area_km2: number | null }>(sql`
    SELECT code, name, region, area_km2 FROM core.department ORDER BY name
  `);
}

// ─── Cobertura honesta (regla 6 de CLAUDE.md) ─────────────────────────────────

interface CoverageRow {
  muni_code: string;
  manager_name: string;
  is_igac: boolean | null;
  coverage_status: string;
  last_cut_date: string | null;
  available_layers: string[];
  manager_url: string | null;
  n_parcels: number;
}

/**
 * Devuelve el bloque de cobertura para un municipio, con un mensaje ya redactado.
 * Si no hay catastro, el mensaje dice qué SÍ hay, nunca deja un vacío sin explicar.
 */
export async function getCoverage(muniCode: string): Promise<Coverage> {
  const row = await queryOne<CoverageRow>(sql`SELECT * FROM core.coverage_for(${muniCode})`);

  if (!row) {
    return {
      muniCode,
      cadastralManager: null,
      isIgac: null,
      status: 'unknown',
      availableLayers: [],
      message:
        'No tenemos registrado este municipio en la división político-administrativa. Verifica el código DIVIPOLA.',
    };
  }

  const status = (
    row.n_parcels > 0 ? (row.coverage_status === 'unknown' ? 'partial' : row.coverage_status) : 'none'
  ) as Coverage['status'];

  let message: string | null = null;
  if (status === 'none') {
    const layers = row.available_layers.length > 0 ? row.available_layers.join(', ') : 'ninguna por ahora';
    message =
      `Este municipio lo gestiona ${row.manager_name}. Todavía no tenemos sus predios ` +
      `porque ese gestor no publica el catastro como dato abierto o aún no lo hemos integrado. ` +
      `Sí tenemos para esta zona: ${layers}.`;
    if (row.manager_url) message += ` Puedes consultar directamente en ${row.manager_url}.`;
  } else if (status === 'partial') {
    message =
      'Tenemos parte de la información catastral de este municipio. Lo que falta aparece marcado como no disponible.';
  }

  return {
    muniCode: row.muni_code,
    cadastralManager: row.manager_name,
    isIgac: row.is_igac,
    status,
    availableLayers: row.available_layers,
    message,
  };
}

export async function listCadastralManagers() {
  return query(sql`
    SELECT cm.muni_code, m.name AS muni_name, m.dept_code, cm.manager_name, cm.is_igac,
           cm.coverage_status, cm.last_cut_date::text AS last_cut_date, cm.manager_url
    FROM core.cadastral_manager cm
    JOIN core.municipality m ON m.code = cm.muni_code
    ORDER BY cm.is_igac, m.name
  `);
}

/** Resumen nacional de cobertura, para el panel de administración y la UI de honestidad. */
export async function coverageSummary() {
  return queryOne<{
    total_municipalities: number;
    igac_municipalities: number;
    with_parcels: number;
    other_managers: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM core.municipality)::int AS total_municipalities,
      (SELECT count(*) FROM core.cadastral_manager WHERE is_igac)::int AS igac_municipalities,
      (SELECT count(DISTINCT p.muni_code)
         FROM core.parcel p
         JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active)::int AS with_parcels,
      (SELECT count(*) FROM core.cadastral_manager WHERE NOT is_igac)::int AS other_managers
  `);
}
