import type { H3CellRow } from '@terracolombia/db';
import { CELL_AREA_KM2 } from '@terracolombia/geo';
import type { IndicatorInputs } from './indicator-inputs.js';

/**
 * Traduce una fila de `analytics.h3_cell` a los valores crudos que consume el motor de
 * puntuación.
 *
 * Los agregados por celda ya están calculados en la base (paso `aggregate` del ETL), así que
 * aquí no se consulta nada: solo se renombra y se derivan densidades.
 *
 * Regla que no se rompe: lo que la celda no tiene queda en `null`, nunca en 0. El motor
 * reporta el faltante y baja la confianza; un 0 se leería como "hay cero comercios aquí",
 * que es una afirmación distinta de "no lo sabemos".
 */
export function cellRowToInputs(row: H3CellRow, resolution: number): IndicatorInputs {
  const areaKm2 = CELL_AREA_KM2[resolution] ?? CELL_AREA_KM2[8]!;
  const poi = (row.poi_counts ?? {}) as Record<string, number>;
  const hazards = (row.hazard_flags ?? {}) as Record<string, string | null>;
  const capability = (row.capability_mix ?? {}) as Record<string, number>;
  const vocation = (row.vocation_mix ?? {}) as Record<string, number>;

  const commerce =
    poi.comercio === undefined && poi.alimentacion === undefined && poi.servicios === undefined
      ? null
      : (poi.comercio ?? 0) + (poi.alimentacion ?? 0) + (poi.servicios ?? 0);
  const poiTotal = Object.keys(poi).length > 0 ? Object.values(poi).reduce((a, b) => a + b, 0) : null;

  /** Clase agrológica dominante: la de mayor fracción dentro de la celda. */
  const dominantCapability = dominantKey(capability);

  return {
    slope_mean_pct: row.slope_mean_pct,
    slope_max_pct: null,
    elevation_mean_m: row.elevation_mean_m,

    land_capability_class: dominantCapability !== null ? Number(dominantCapability) : null,
    land_vocation: dominantKey(vocation),
    land_use_conflict: null,
    inside_agricultural_frontier: null,

    hazard_mass_movement: hazards.mass_movement ?? null,
    hazard_seismic: hazards.seismic ?? null,
    hazard_flood: hazards.flood ?? null,
    protected_area_pct: row.protected_pct,
    protected_area_restrictive: row.protected_pct !== null ? row.protected_pct > 0 : null,
    ethnic_territory_pct: row.ethnic_pct,
    has_mining_title: null,

    // Una celda se considera dentro del perímetro urbano si más de la mitad de su área lo está.
    inside_urban_perimeter: row.urban_pct !== null ? row.urban_pct > 50 : null,
    pot_classification: null,
    pot_max_height_floors: null,

    dist_primary_road_m: row.dist_primary_road_m,
    dist_secondary_road_m: null,
    dist_paved_road_m: row.dist_paved_road_m,
    dist_muni_seat_m: row.dist_muni_seat_m,
    dist_school_m: null,
    dist_health_m: null,

    population_density_per_km2: row.pop !== null ? Number((row.pop / areaKm2).toFixed(1)) : null,
    population_total: row.pop,
    population_school_age: row.pop_school_age,

    poi_commerce_count: commerce,
    poi_total_count: poiTotal,
    school_count: row.n_schools,
    school_enrollment: row.school_enrollment,
    health_facility_count: row.n_health,

    parcel_area_m2: row.parcel_area_sum_m2,
    parcel_built_area_m2: row.built_area_sum_m2,
    parcel_density_per_km2:
      row.n_parcels !== null ? Number((row.n_parcels / areaKm2).toFixed(1)) : null,
    large_lots_count: row.n_large_lots,

    area_km2: areaKm2,
  };
}

/** Clave con el valor más alto de un reparto, o null si el reparto está vacío. */
function dominantKey(mix: Record<string, number>): string | null {
  let best: string | null = null;
  let bestValue = -Infinity;
  for (const [k, v] of Object.entries(mix)) {
    if (typeof v === 'number' && v > bestValue) {
      best = k;
      bestValue = v;
    }
  }
  return best;
}
