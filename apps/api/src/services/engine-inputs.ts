import type { IndicatorInputs as EngineInputs } from '@terracolombia/scoring';
import type { IndicatorInputs as ApiInputs } from './indicator-inputs.js';

/**
 * Traduce los valores que recolecta la API a las claves que lee el motor de puntuación.
 *
 * Por qué existe: los dos lados nombran lo mismo de forma distinta. La API dice
 * `hazard_flood`, `protected_area_pct` o `dist_school_m`; el motor lee `hazard_flood_level`,
 * `protected_area_overlap_pct` y `distance_school_m`. Antes esto se resolvía con un
 * `as unknown as`, que compila siempre y hace que el motor no encuentre ninguna de esas
 * claves: 18 de los 35 indicadores llegaban como `null` y el veredicto salía "sin datos"
 * aunque el dato estuviera en la base. El `as` tapaba justo el error que lo habría delatado.
 *
 * La correspondencia se escribe entera y a mano, y `engine-inputs.test.ts` comprueba que
 * cubra todos los `INDICATOR_IDS` del motor. Si el motor añade un indicador, la prueba falla
 * hasta que se decida aquí de dónde sale o se declare por qué todavía no se tiene.
 */
export function toEngineInputs(input: ApiInputs): EngineInputs {
  const area = input.area_km2 > 0 ? input.area_km2 : null;
  const density = (count: number | null): number | null =>
    count !== null && area !== null ? Number((count / area).toFixed(2)) : null;

  return {
    // ─── Relieve y suelo ─────────────────────────────────────────────────────
    slope_mean_pct: input.slope_mean_pct,
    elevation_mean_m: input.elevation_mean_m,
    land_capability_class: input.land_capability_class,
    land_vocation: input.land_vocation,
    land_use_conflict: input.land_use_conflict,
    // Irradiación solar: la API todavía no ingiere el atlas del IDEAM, así que va en null
    // y el motor la reporta como faltante. Sin ella, `solar_fotovoltaico` sale "sin datos",
    // que es la respuesta correcta mientras no tengamos la capa.
    solar_irradiance_kwh_m2_day: null,

    // ─── Amenazas y restricciones ────────────────────────────────────────────
    // El motor normaliza el texto del nivel ("Media", "Muy alta") contra su propia escala.
    hazard_landslide_level: input.hazard_mass_movement,
    hazard_seismic_level: input.hazard_seismic,
    hazard_flood_level: input.hazard_flood,
    protected_area_overlap_pct: input.protected_area_pct,
    protected_area_category: input.protected_area_category,
    ethnic_territory_overlap_pct: input.ethnic_territory_pct,
    mining_title_present: input.has_mining_title,
    inside_agricultural_frontier: input.inside_agricultural_frontier,
    inside_urban_perimeter: input.inside_urban_perimeter,
    pot_classification: input.pot_classification,

    // ─── Accesibilidad ───────────────────────────────────────────────────────
    distance_primary_road_m: input.dist_primary_road_m,
    distance_secondary_road_m: input.dist_secondary_road_m,
    distance_paved_road_m: input.dist_paved_road_m,
    distance_municipal_seat_m: input.dist_muni_seat_m,
    distance_school_m: input.dist_school_m,
    distance_health_facility_m: input.dist_health_m,
    road_access_index: input.road_access_score,

    // ─── Demografía y mercado ────────────────────────────────────────────────
    population_density_per_km2: input.population_density_per_km2,
    school_age_population: input.population_school_age,
    school_seats_per_100_school_age: seatsPer100(
      input.school_enrollment,
      input.population_school_age,
    ),
    commerce_poi_density_per_km2: density(input.poi_commerce_count),
    // La densidad de competidores depende de la categoría del negocio que se consulta, y eso
    // lo sabe la plantilla, no el recolector. Hasta que `location-intel` pase la categoría,
    // el motor lo declara faltante en vez de usar el comercio total como sustituto.
    competitor_density_per_km2: null,
    tourism_poi_density_per_km2: density(input.poi_tourism_count),

    // ─── Predial ─────────────────────────────────────────────────────────────
    parcel_density_per_km2: input.parcel_density_per_km2,
    parcel_area_m2: input.parcel_area_m2,
    built_area_m2: input.parcel_built_area_m2,
    large_parcels_count: input.large_lots_count,
    // El avalúo catastral por m² no se expone: el plan lo prohíbe como proxy de valor de
    // mercado (regla 5) y las capas REST del IGAC no traen el dato alfanumérico.
    land_cadastral_value_per_m2: null,
  };
}

/**
 * Cupos escolares por cada 100 niños en edad escolar. Sin matrícula o sin población no hay
 * razón que calcular; con población cero tampoco, porque dividir daría infinito.
 */
function seatsPer100(enrollment: number | null, schoolAge: number | null): number | null {
  if (enrollment === null || schoolAge === null || schoolAge <= 0) return null;
  return Number(((enrollment / schoolAge) * 100).toFixed(1));
}
