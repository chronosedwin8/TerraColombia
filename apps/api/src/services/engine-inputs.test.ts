import { describe, expect, it } from 'vitest';
import { INDICATOR_IDS } from '@terracolombia/scoring';
import { toEngineInputs } from './engine-inputs.js';
import type { IndicatorInputs as ApiInputs } from './indicator-inputs.js';

/**
 * Guarda del contrato entre el recolector de la API y el motor de puntuación.
 *
 * El fallo que motiva estas pruebas no rompía la compilación ni ninguna prueba unitaria: un
 * `as unknown as` convertía el objeto de la API en el del motor, el motor no encontraba sus
 * claves y devolvía "sin datos suficientes" con los datos delante. Lo que se comprueba aquí
 * es que la correspondencia sea total y que los valores lleguen de verdad.
 */

/** Entradas con todos los campos poblados, para ver cuáles se pierden por el camino. */
const FULL: ApiInputs = {
  slope_mean_pct: 8.9,
  slope_max_pct: 12,
  elevation_mean_m: 36,
  land_capability_class: 3,
  land_vocation: 'agricola',
  land_use_conflict: 'uso_adecuado',
  inside_agricultural_frontier: true,
  hazard_mass_movement: 'Alta',
  hazard_seismic: 'Media',
  hazard_flood: 'Media',
  protected_area_pct: 12.5,
  protected_area_restrictive: true,
  protected_area_category: 'reserva_forestal_protectora',
  ethnic_territory_pct: 0,
  has_mining_title: false,
  inside_urban_perimeter: true,
  pot_classification: 'urbano',
  pot_max_height_floors: 5,
  dist_primary_road_m: 350.9,
  dist_secondary_road_m: 120,
  dist_paved_road_m: 51.8,
  dist_muni_seat_m: 1346.3,
  dist_school_m: 220,
  dist_health_m: 800,
  road_access_score: 100,
  population_density_per_km2: 7200,
  population_total: 759,
  population_school_age: 159,
  poi_commerce_count: 24,
  poi_tourism_count: 3,
  poi_total_count: 40,
  school_count: 1,
  school_enrollment: 936,
  health_facility_count: 0,
  parcel_area_m2: 1252.9,
  parcel_built_area_m2: 514,
  parcel_density_per_km2: 438,
  large_lots_count: 2,
  area_km2: 0.105,
};

/**
 * Indicadores que el motor define y la API todavía no puede alimentar. Cada uno lleva el
 * motivo: la lista es una deuda declarada, no un descuido, y la prueba obliga a que siga
 * siendo cierta. Si una fuente entra, el valor deja de ser null y hay que sacarlo de aquí.
 */
const DECLARED_MISSING: Record<string, string> = {
  solar_irradiance_kwh_m2_day: 'Falta ingerir el atlas de radiación solar del IDEAM.',
  competitor_density_per_km2: 'Depende de la categoría del negocio, que la sabe la plantilla.',
  land_cadastral_value_per_m2:
    'El avalúo catastral no se expone como valor por m² (regla 5 del plan).',
};

describe('correspondencia con el motor de puntuación', () => {
  const mapped = toEngineInputs(FULL);

  it('cubre todos los indicadores que declara el motor', () => {
    const faltan = INDICATOR_IDS.filter((id) => !(id in mapped));
    expect(
      faltan,
      `El motor declara indicadores que el adaptador no menciona: ${faltan.join(', ')}. ` +
        'Decide de dónde sale cada uno o añádelo a DECLARED_MISSING con su motivo.',
    ).toEqual([]);
  });

  it('no inventa indicadores que el motor no conoce', () => {
    const sobran = Object.keys(mapped).filter(
      (k) => !(INDICATOR_IDS as readonly string[]).includes(k),
    );
    expect(sobran, `Claves que el motor ignoraría: ${sobran.join(', ')}`).toEqual([]);
  });

  it('solo deja en null los indicadores cuya ausencia está justificada', () => {
    const nulos = INDICATOR_IDS.filter(
      (id) => mapped[id] === null || mapped[id] === undefined,
    ).filter((id) => !(id in DECLARED_MISSING));
    expect(
      nulos,
      `Con todas las entradas pobladas, estos indicadores llegan vacíos al motor: ${nulos.join(', ')}. ` +
        'Eso es el fallo de nombres que hace que el veredicto salga "sin datos".',
    ).toEqual([]);
  });

  it('traduce los nombres que difieren entre las dos capas', () => {
    expect(mapped.hazard_landslide_level).toBe('Alta');
    expect(mapped.hazard_flood_level).toBe('Media');
    expect(mapped.protected_area_overlap_pct).toBe(12.5);
    expect(mapped.ethnic_territory_overlap_pct).toBe(0);
    expect(mapped.distance_school_m).toBe(220);
    expect(mapped.distance_municipal_seat_m).toBe(1346.3);
    expect(mapped.mining_title_present).toBe(false);
    expect(mapped.built_area_m2).toBe(514);
    expect(mapped.large_parcels_count).toBe(2);
    expect(mapped.road_access_index).toBe(100);
  });

  it('distingue el cero del dato ausente', () => {
    // Un 0 real tiene que sobrevivir: "no hay solapamiento" no es "no lo sabemos".
    expect(mapped.ethnic_territory_overlap_pct).toBe(0);
    const sinDatos = toEngineInputs({ ...FULL, ethnic_territory_pct: null, has_mining_title: null });
    expect(sinDatos.ethnic_territory_overlap_pct).toBeNull();
    expect(sinDatos.mining_title_present).toBeNull();
  });

  it('calcula las densidades con el área del ámbito', () => {
    expect(mapped.commerce_poi_density_per_km2).toBeCloseTo(24 / 0.105, 1);
    expect(mapped.tourism_poi_density_per_km2).toBeCloseTo(3 / 0.105, 1);
  });

  it('no divide por cero cuando el ámbito no tiene área', () => {
    const sinArea = toEngineInputs({ ...FULL, area_km2: 0 });
    expect(sinArea.commerce_poi_density_per_km2).toBeNull();
    expect(sinArea.tourism_poi_density_per_km2).toBeNull();
  });

  it('calcula los cupos escolares por cada 100 niños', () => {
    expect(mapped.school_seats_per_100_school_age).toBeCloseTo((936 / 159) * 100, 1);
    const sinNinos = toEngineInputs({ ...FULL, population_school_age: 0 });
    expect(sinNinos.school_seats_per_100_school_age).toBeNull();
  });
});
