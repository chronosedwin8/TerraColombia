import type { GeoJsonGeometry } from '@terracolombia/shared';
import {
  agriculturalFrontierOverlap,
  distanceToMuniSeat,
  ethnicTerritoryOverlaps,
  facilitiesIn,
  hazardOverlaps,
  insideUrbanPerimeter,
  miningTitleOverlaps,
  parcelStatsIn,
  populationIn,
  potZoneOverlaps,
  protectedAreaOverlaps,
  reliefFor,
  roadAccess,
  soilOverlaps,
} from '@terracolombia/db';

/**
 * Recolecta los valores crudos que consume `packages/scoring`. El motor de puntuación es
 * lógica pura y no toca la base: esta capa es la que sabe de dónde sale cada número.
 *
 * Todo campo que no exista en las fuentes queda `null`. El motor lo reporta como faltante
 * en vez de tratarlo como cero (regla 4 de CLAUDE.md).
 */
export interface IndicatorInputs {
  // Relieve
  slope_mean_pct: number | null;
  slope_max_pct: number | null;
  elevation_mean_m: number | null;
  // Suelos
  land_capability_class: number | null;
  land_vocation: string | null;
  land_use_conflict: string | null;
  inside_agricultural_frontier: boolean | null;
  // Restricciones
  hazard_mass_movement: string | null;
  hazard_seismic: string | null;
  hazard_flood: string | null;
  protected_area_pct: number | null;
  protected_area_restrictive: boolean | null;
  /** Categoría de manejo del RUNAP que más solapa. El motor la puntúa por categoría. */
  protected_area_category: string | null;
  ethnic_territory_pct: number | null;
  has_mining_title: boolean | null;
  // Ordenamiento
  inside_urban_perimeter: boolean | null;
  pot_classification: string | null;
  pot_max_height_floors: number | null;
  // Accesibilidad
  dist_primary_road_m: number | null;
  dist_secondary_road_m: number | null;
  dist_paved_road_m: number | null;
  dist_muni_seat_m: number | null;
  dist_school_m: number | null;
  dist_health_m: number | null;
  /** Índice agregado 0–100 de accesibilidad vial. Es `analytics.h3_cell.road_access_score`. */
  road_access_score: number | null;
  // Entorno socioeconómico
  population_density_per_km2: number | null;
  population_total: number | null;
  population_school_age: number | null;
  poi_commerce_count: number | null;
  poi_tourism_count: number | null;
  poi_total_count: number | null;
  school_count: number | null;
  school_enrollment: number | null;
  health_facility_count: number | null;
  // Predial
  parcel_area_m2: number | null;
  parcel_built_area_m2: number | null;
  parcel_density_per_km2: number | null;
  large_lots_count: number | null;
  /** Área del ámbito analizado, en km². Necesaria para densidades. */
  area_km2: number;
}

/** Mapea el nivel textual de amenaza a la escala del motor. Devuelve el texto tal cual. */
function topHazard(
  rows: Array<{ kind: string; level: string | null; level_rank: number | null }>,
  kind: string,
): string | null {
  const matching = rows
    .filter((r) => r.kind === kind)
    .sort((a, b) => (b.level_rank ?? 0) - (a.level_rank ?? 0));
  return matching[0]?.level ?? null;
}

export async function collectIndicatorInputs(
  geometry: GeoJsonGeometry,
  areaKm2: number,
  muniCode: string | null,
  center: [number, number],
): Promise<IndicatorInputs> {
  const [
    relief,
    soils,
    hazards,
    protectedAreas,
    ethnic,
    mining,
    frontier,
    pot,
    urban,
    access,
    distSeat,
    population,
    facilities,
    parcels,
  ] = await Promise.all([
    reliefFor(geometry),
    soilOverlaps(geometry),
    hazardOverlaps(geometry),
    protectedAreaOverlaps(geometry),
    ethnicTerritoryOverlaps(geometry),
    miningTitleOverlaps(geometry),
    agriculturalFrontierOverlap(geometry),
    potZoneOverlaps(geometry, muniCode ?? undefined),
    muniCode ? insideUrbanPerimeter(geometry, muniCode) : Promise.resolve(null),
    roadAccess(center[0], center[1]),
    muniCode ? distanceToMuniSeat(center[0], center[1], muniCode) : Promise.resolve(null),
    populationIn(geometry),
    facilitiesIn(geometry),
    parcelStatsIn(geometry),
  ]);

  // Clase agrológica dominante: la de mayor solape.
  const capability = soils
    .filter((s) => s.kind === 'land_capability')
    .sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  const capabilityClass =
    capability && typeof (capability.attrs as { classCode?: unknown }).classCode === 'number'
      ? ((capability.attrs as { classCode: number }).classCode)
      : null;

  const vocation = soils
    .filter((s) => s.kind === 'land_vocation')
    .sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  const conflict = soils
    .filter((s) => s.kind === 'land_use_conflict')
    .sort((a, b) => b.overlap_pct - a.overlap_pct)[0];

  const topProtected = protectedAreas.sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  const topEthnic = ethnic.sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  const topPot = pot.sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  const frontierInside = insideAgriculturalFrontier(frontier);

  const poiCounts = (facilities?.poi_counts ?? {}) as Record<string, number>;
  const commerce =
    (poiCounts.comercio ?? 0) + (poiCounts.alimentacion ?? 0) + (poiCounts.servicios ?? 0);
  const poiTotal = Object.values(poiCounts).reduce((a, b) => a + b, 0);

  return {
    slope_mean_pct: relief?.slope_mean_pct ?? null,
    slope_max_pct: relief?.slope_max_pct ?? null,
    elevation_mean_m: relief?.elevation_mean_m ?? null,

    land_capability_class: capabilityClass,
    land_vocation: vocation?.code ?? null,
    land_use_conflict: conflict?.code ?? null,
    inside_agricultural_frontier: frontierInside,

    hazard_mass_movement: topHazard(hazards, 'mass_movement'),
    hazard_seismic: topHazard(hazards, 'seismic'),
    hazard_flood: topHazard(hazards, 'flood'),
    protected_area_pct: topProtected?.overlap_pct ?? (protectedAreas.length === 0 ? 0 : null),
    protected_area_restrictive: topProtected ? topProtected.is_restrictive : null,
    // Sin ninguna área protegida encima, la categoría es "ninguna": es un dato, no un hueco.
    protected_area_category:
      topProtected?.category ?? (protectedAreas.length === 0 ? 'ninguna' : null),
    ethnic_territory_pct: topEthnic?.overlap_pct ?? (ethnic.length === 0 ? 0 : null),
    has_mining_title: mining.length > 0,

    inside_urban_perimeter: urban,
    pot_classification: topPot?.classification ?? null,
    pot_max_height_floors: topPot?.max_height_floors ?? null,

    dist_primary_road_m: access?.dist_primary_m ?? null,
    dist_secondary_road_m: access?.dist_secondary_m ?? null,
    dist_paved_road_m: access?.dist_paved_m ?? null,
    dist_muni_seat_m: distSeat,
    // La distancia a colegio e IPS se deja en null cuando no hay ninguno en el radio de
    // búsqueda: un "muy lejos" inventado sería peor que declarar el hueco.
    dist_school_m: null,
    dist_health_m: null,
    road_access_score: roadAccessScore(access?.dist_paved_m ?? null),

    population_density_per_km2:
      population?.pop_total != null && areaKm2 > 0
        ? Number((population.pop_total / areaKm2).toFixed(1))
        : null,
    population_total: population?.pop_total ?? null,
    population_school_age: schoolAgeFrom(population?.age_bands ?? null),

    poi_commerce_count: facilities ? commerce : null,
    poi_tourism_count: facilities ? (poiCounts.turismo ?? 0) + (poiCounts.alojamiento ?? 0) : null,
    poi_total_count: facilities ? poiTotal : null,
    school_count: facilities?.n_schools ?? null,
    school_enrollment: facilities?.school_enrollment ?? null,
    health_facility_count: facilities?.n_health ?? null,

    parcel_area_m2: parcels?.area_sum_m2 ?? null,
    parcel_built_area_m2: parcels?.built_area_sum_m2 ?? null,
    parcel_density_per_km2:
      parcels?.n_parcels != null && areaKm2 > 0
        ? Number((parcels.n_parcels / areaKm2).toFixed(1))
        : null,
    large_lots_count: parcels
      ? parcels.n_parcels - parcels.n_with_building
      : null,

    area_km2: areaKm2,
  };
}

/**
 * ¿Está dentro de la frontera agrícola nacional?
 *
 * La capa de la UPRA no marca solo lo que está dentro: cubre todo el país repartido en
 * categorías, y dos de las tres son de **exclusión** ("Bosques naturales y áreas no
 * agropecuarias" y "Exclusiones legales"). Mirar solo si hay un polígono encima daría
 * "dentro de la frontera" precisamente para el suelo que la UPRA excluye de ella, que es lo
 * contrario de lo que dice el dato. Por eso se exige que la categoría dominante sea la de
 * inclusión.
 */
function insideAgriculturalFrontier(
  rows: Array<{ category: string | null; overlap_pct: number }>,
): boolean | null {
  const dominant = [...rows].sort((a, b) => b.overlap_pct - a.overlap_pct)[0];
  if (!dominant || dominant.overlap_pct <= 50) return rows.length > 0 ? false : null;
  if (dominant.category === null) return null;
  const key = dominant.category
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  // La UPRA rotula la categoría de inclusión como "Frontera agrícola nacional".
  return key.includes('frontera agricola');
}

/**
 * Índice 0–100 de accesibilidad vial a partir de la distancia a la vía pavimentada más
 * cercana: 100 a 100 m o menos, 0 a partir de 5 km.
 *
 * Es la misma fórmula que aplica el paso `aggregate` sobre `analytics.h3_cell`
 * (`packages/db/src/repositories/analytics.ts`). Está en dos sitios porque el análisis de
 * un predio no pasa por la malla H3; si se cambia una, hay que cambiar la otra.
 */
function roadAccessScore(distPavedM: number | null): number | null {
  if (distPavedM === null) return null;
  return Math.round(Math.max(0, Math.min(100, 100 - (distPavedM - 100) / 49)));
}

/** Población en edad escolar (5 a 16 años) a partir de las bandas del censo. */
function schoolAgeFrom(bands: Record<string, number> | null): number | null {
  if (!bands) return null;
  const b5 = bands['5_9'] ?? 0;
  const b10 = bands['10_14'] ?? 0;
  const b15 = bands['15_19'] ?? 0;
  const total = b5 + b10 + b15 * 0.4; // solo 15–16 de la banda 15–19
  return total > 0 ? Math.round(total) : null;
}

/** Inputs para un predio concreto: añade sus propias medidas a las del entorno. */
export async function collectParcelInputs(
  geometry: GeoJsonGeometry,
  parcelAreaM2: number | null,
  parcelBuiltAreaM2: number | null,
  muniCode: string | null,
  center: [number, number],
  areaKm2: number,
): Promise<IndicatorInputs> {
  const base = await collectIndicatorInputs(geometry, areaKm2, muniCode, center);
  return {
    ...base,
    // Para un predio, el área relevante es la del propio predio, no la suma de la zona.
    parcel_area_m2: parcelAreaM2,
    parcel_built_area_m2: parcelBuiltAreaM2,
  };
}
