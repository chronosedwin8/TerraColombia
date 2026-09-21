/**
 * Perfiles de aptitud (M5): un perfil por cada uso objetivo de `TARGET_USES`.
 *
 * Cada perfil declara:
 *  - `weights`: la importancia relativa de cada indicador, con la justificación al lado.
 *    Los pesos son el punto de vista del motor, no una verdad: la interfaz permite
 *    cambiarlos y el resultado se recalcula.
 *  - `overrides`: ajustes de orientación cuando un indicador significa algo distinto para
 *    este uso (un suelo clase 1 es lo mejor para agricultura y lo peor para poner paneles
 *    solares encima).
 *  - `required`: se deriva del catálogo, no se escribe aquí, para que no haya dos verdades.
 *  - `blockers`: reglas que necesitan mirar varios indicadores a la vez. La mayoría de los
 *    bloqueos no vive aquí sino en el semáforo del propio indicador (`flagFor === 'blocker'`),
 *    y `evaluateSuitability` los recoge de las dos fuentes.
 */

import type { TargetUse } from '@terracolombia/shared';
import { TARGET_USES, formatNumber } from '@terracolombia/shared';
import {
  OVERLAP_INSIDE_PCT,
  PARCEL_AREA_SCALES,
  POT_CLASSIFICATION_SCORES_RURAL,
  LAND_VOCATION_SCORES_URBAN,
  RESTRICTIVE_PROTECTED_CATEGORIES,
  asBoolean,
  asNumber,
  asText,
  findIndicator,
  indicatorsRequiredFor,
  readInput,
  type IndicatorId,
  type IndicatorInputs,
  type IndicatorOverride,
} from './indicators.js';
import {
  booleanInput,
  booleanScore,
  categorical,
  categoryInput,
  linear,
  normalizeCategoryKey,
  numericInput,
} from './normalize.js';

/** Umbrales del veredicto. Por encima de `favorable`, favorable; por debajo de `conditioned`, desfavorable. */
export const VERDICT_THRESHOLDS = { favorable: 70, conditioned: 45 } as const;

export const TARGET_USE_LABELS: Record<TargetUse, string> = {
  vivienda_unifamiliar: 'Vivienda unifamiliar',
  vivienda_multifamiliar: 'Vivienda multifamiliar',
  bodega_logistica: 'Bodega logística',
  agricultura: 'Agricultura',
  ganaderia: 'Ganadería',
  colegio: 'Colegio',
  comercio_local: 'Comercio local',
  industria: 'Industria',
  turismo_rural: 'Turismo rural',
  solar_fotovoltaico: 'Solar fotovoltaico',
};

/** Regla de bloqueo duro: fuerza el veredicto `desfavorable` con explicación textual. */
export interface BlockerRule {
  id: string;
  label: string;
  /** Indicadores que la regla necesita; se marcan con semáforo rojo si la regla aplica. */
  indicators: readonly IndicatorId[];
  /** `true` bloquea, `false` no bloquea, `null` no hay datos para saberlo. */
  applies: (inputs: IndicatorInputs) => boolean | null;
  /** Explicación en español de por qué bloquea. */
  message: (inputs: IndicatorInputs) => string;
}

export interface UseProfile {
  use: TargetUse;
  label: string;
  /** Qué busca este uso, en una frase. Se muestra encabezando el resultado. */
  rationale: string;
  weights: Readonly<Partial<Record<IndicatorId, number>>>;
  overrides: Readonly<Partial<Record<IndicatorId, IndicatorOverride>>>;
  required: readonly IndicatorId[];
  blockers: readonly BlockerRule[];
  thresholds: { favorable: number; conditioned: number };
}

// ─── Ajustes de orientación reutilizables ─────────────────────────────────────

/** Área de predio con la escala del uso, en vez de la escala de vivienda por omisión. */
function parcelAreaOverride(
  scale: { min: number; max: number },
  rationale: string,
): IndicatorOverride {
  return {
    normalize: numericInput(linear(scale.min, scale.max)),
    formula: `Área de la geometría del predio calculada en EPSG:9377, puntuada entre ${formatNumber(
      scale.min,
    )} m² (0 puntos) y ${formatNumber(scale.max)} m² (100 puntos), que es el rango útil para este uso.`,
    rationale,
  };
}

/** Clasificación del POT orientada a usos rurales. */
const POT_RURAL_OVERRIDE: IndicatorOverride = {
  normalize: categoryInput(categorical(POT_CLASSIFICATION_SCORES_RURAL)),
  formula:
    'Clasificación del suelo del POT, puntuada al revés que para los usos urbanos: para producir, el suelo rural es el que corresponde y el urbano es el que estorba.',
  rationale: 'Para un uso agropecuario, estar en suelo urbano es una desventaja, no una ventaja.',
};

/** Clasificación del POT orientada a bodega e industria, que van a suburbano o industrial. */
const POT_LOGISTICS_SCORES: Readonly<Record<string, number>> = {
  suelo_suburbano: 100,
  suelo_urbano: 85,
  suelo_de_expansion_urbana: 70,
  centro_poblado_rural: 40,
  suelo_rural: 35,
  suelo_de_proteccion: 0,
};
const POT_LOGISTICS_OVERRIDE: IndicatorOverride = {
  normalize: categoryInput(categorical(POT_LOGISTICS_SCORES)),
  formula:
    'Clasificación del suelo del POT puntuada para uso logístico e industrial: el suelo suburbano sobre los corredores viales es el que mejor acoge bodegas; el rural sin norma específica, el que menos.',
  rationale:
    'Las bodegas y la industria se ubican en corredores suburbanos, no en el centro urbano.',
};

/** Perímetro urbano invertido: para un uso agropecuario, estar dentro es un conflicto. */
const URBAN_PERIMETER_INVERTED: IndicatorOverride = {
  normalize: booleanInput(booleanScore(20, 100)),
  formula:
    'Se puntúa al revés que en los usos urbanos: estar dentro del perímetro urbano juega en contra de un uso agropecuario, porque el suelo urbano se destina a otra cosa y vale más.',
  explain: (value) => {
    const b = asBoolean(value);
    if (b === null) return 'No sabemos si este terreno está dentro del perímetro urbano.';
    return b
      ? 'Está dentro del perímetro urbano. Para producir, eso juega en contra: el suelo urbano está destinado a otros usos y su costo es mayor.'
      : 'Está fuera del perímetro urbano, que es donde corresponde una actividad agropecuaria.';
  },
  flagFor: (value) => {
    const b = asBoolean(value);
    if (b === null) return 'unknown';
    return b ? 'caution' : 'ok';
  },
  rationale: 'Un cultivo dentro del perímetro urbano compite con el desarrollo urbano.',
};

/** Vocación de uso orientada a ocupación urbana o industrial del suelo. */
const VOCATION_URBAN_OVERRIDE: IndicatorOverride = {
  normalize: categoryInput(categorical(LAND_VOCATION_SCORES_URBAN)),
  formula:
    'Vocación de uso del suelo puntuada desde la perspectiva de ocuparlo con obra: ocupar suelo de vocación agrícola de primera con una bodega resta, porque es un recurso escaso y no renovable.',
  rationale: 'Sellar suelo agrícola de primera con concreto es una pérdida difícil de revertir.',
};

/**
 * Capacidad de uso invertida para solar fotovoltaico: poner paneles sobre suelo clase 1
 * desplaza producción de alimentos, mientras que un suelo clase 6 o 7 —poco apto para
 * cultivar— es el sitio ideal. La clase 8 no llega a 100 porque suele coincidir con
 * ecosistemas de conservación.
 */
const LAND_CAPABILITY_SCORES_SOLAR: Readonly<Record<string, number>> = {
  '1': 20,
  '2': 25,
  '3': 35,
  '4': 55,
  '5': 75,
  '6': 90,
  '7': 100,
  '8': 60,
};
const LAND_CAPABILITY_SOLAR_OVERRIDE: IndicatorOverride = {
  normalize: categoryInput(categorical(LAND_CAPABILITY_SCORES_SOLAR)),
  direction: 'categorical',
  formula:
    'Clase agrológica puntuada al revés que en agricultura: un parque solar sobre suelo clase 1 o 2 desplaza producción de alimentos; sobre suelo clase 6 o 7, que casi no sirve para cultivar, aprovecha lo que de otro modo rinde poco.',
  explain: (value) => {
    const c = asText(value);
    if (c === null) return 'No tenemos la clase agrológica de este suelo.';
    const n = Number(c);
    if (Number.isFinite(n) && n <= 3)
      return `El suelo es clase ${c}, de los mejores para cultivar. Ocuparlo con paneles desplaza producción de alimentos; es viable, pero hay mejores sitios.`;
    if (Number.isFinite(n) && n >= 6)
      return `El suelo es clase ${c}: rinde poco en agricultura, así que un parque solar aprovecha un terreno que de otro modo produce poco.`;
    return `El suelo es clase ${c}: capacidad intermedia, sin una ventaja ni una desventaja clara para este uso.`;
  },
  flagFor: () => 'ok',
  rationale: 'La competencia por suelo entre energía y alimentos es real y se declara aquí.',
};

// ─── Reglas de bloqueo ────────────────────────────────────────────────────────

/**
 * Área protegida de categoría restrictiva. Si la categoría admite usos regulados
 * (distritos de manejo integrado, áreas de recreación, reservas de la sociedad civil) no
 * bloquea: queda como precaución. Si no conocemos la categoría pero el solapamiento es
 * alto, bloqueamos: ante la duda en un área protegida, la respuesta prudente es parar.
 */
const PROTECTED_AREA_BLOCKER: BlockerRule = {
  id: 'protected_area_restrictive',
  label: 'Área protegida de categoría restrictiva',
  indicators: ['protected_area_overlap_pct', 'protected_area_category'],
  applies: (inputs) => {
    const overlap = asNumber(readInput(inputs, 'protected_area_overlap_pct'));
    if (overlap === null) return null;
    if (overlap <= OVERLAP_INSIDE_PCT) return false;
    const category = asText(readInput(inputs, 'protected_area_category'));
    if (category === null) return true;
    const key = normalizeCategoryKey(category);
    if (key === 'ninguna') return false;
    return RESTRICTIVE_PROTECTED_CATEGORIES.includes(key);
  },
  message: (inputs) => {
    const overlap = asNumber(readInput(inputs, 'protected_area_overlap_pct'));
    const category = asText(readInput(inputs, 'protected_area_category'));
    const pct = overlap === null ? '' : ` (${formatNumber(overlap, 1)} % del área)`;
    if (category === null) {
      return `El terreno está dentro de un área protegida del RUNAP${pct} y no sabemos su categoría de manejo. Mientras no se confirme, lo tratamos como restricción fuerte: consulta a la autoridad ambiental.`;
    }
    return `El terreno está dentro de un área protegida de categoría "${category.replace(
      /_/g,
      ' ',
    )}"${pct}, que tiene régimen restrictivo. Los usos productivos o constructivos ordinarios no proceden allí. Consulta a la autoridad ambiental competente.`;
  },
};

/** Fuera de la frontera agrícola nacional no hay actividad agropecuaria habilitada. */
const AGRICULTURAL_FRONTIER_BLOCKER: BlockerRule = {
  id: 'outside_agricultural_frontier',
  label: 'Fuera de la frontera agrícola nacional',
  indicators: ['inside_agricultural_frontier'],
  applies: (inputs) => {
    const inside = asBoolean(readInput(inputs, 'inside_agricultural_frontier'));
    if (inside === null) return null;
    return !inside;
  },
  message: () =>
    'El terreno está fuera de la frontera agrícola nacional delimitada por la UPRA. Fuera de ella el país no habilita la actividad agropecuaria, normalmente porque es bosque natural, páramo o área de protección. Es una restricción de política de tierras, no una opinión del motor.',
};

const URBAN_BLOCKERS: readonly BlockerRule[] = [PROTECTED_AREA_BLOCKER];
const AGRO_BLOCKERS: readonly BlockerRule[] = [
  PROTECTED_AREA_BLOCKER,
  AGRICULTURAL_FRONTIER_BLOCKER,
];

// ─── Perfiles ─────────────────────────────────────────────────────────────────

function profile(
  use: TargetUse,
  rationale: string,
  weights: Readonly<Partial<Record<IndicatorId, number>>>,
  blockers: readonly BlockerRule[],
  overrides: Readonly<Partial<Record<IndicatorId, IndicatorOverride>>> = {},
): UseProfile {
  return {
    use,
    label: TARGET_USE_LABELS[use],
    rationale,
    weights,
    overrides,
    required: indicatorsRequiredFor(use),
    blockers,
    thresholds: { ...VERDICT_THRESHOLDS },
  };
}

export const USE_PROFILES: Record<TargetUse, UseProfile> = {
  /**
   * Vivienda unifamiliar: una familia que va a construir su casa. Pesa primero que el
   * terreno sea seguro y construible (pendiente y amenazas suman 38 %), después que la
   * norma lo permita (POT y perímetro urbano, 18 %), y por último el entorno de servicios.
   */
  vivienda_unifamiliar: profile(
    'vivienda_unifamiliar',
    'Un lote seguro, con norma que permita construir vivienda y servicios cerca.',
    {
      slope_mean_pct: 0.14,
      hazard_landslide_level: 0.12,
      hazard_flood_level: 0.12,
      pot_classification: 0.1,
      inside_urban_perimeter: 0.08,
      distance_paved_road_m: 0.07,
      protected_area_overlap_pct: 0.06,
      ethnic_territory_overlap_pct: 0.06,
      distance_school_m: 0.06,
      distance_health_facility_m: 0.05,
      road_access_index: 0.05,
      parcel_area_m2: 0.05,
      population_density_per_km2: 0.04,
    },
    URBAN_BLOCKERS,
  ),

  /**
   * Vivienda multifamiliar: un proyecto de varios pisos. Igual que la unifamiliar en
   * seguridad, pero con más peso en norma (un edificio depende de la clasificación y del
   * índice de construcción) y en tamaño de lote, y le importa el mercado alrededor.
   */
  vivienda_multifamiliar: profile(
    'vivienda_multifamiliar',
    'Un lote urbano de buen tamaño, con norma que admita edificación en altura y demanda alrededor.',
    {
      slope_mean_pct: 0.12,
      hazard_landslide_level: 0.11,
      hazard_flood_level: 0.11,
      pot_classification: 0.12,
      inside_urban_perimeter: 0.1,
      parcel_area_m2: 0.08,
      road_access_index: 0.07,
      population_density_per_km2: 0.06,
      protected_area_overlap_pct: 0.05,
      ethnic_territory_overlap_pct: 0.05,
      distance_paved_road_m: 0.05,
      commerce_poi_density_per_km2: 0.05,
      distance_health_facility_m: 0.03,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        { min: 300, max: 3000 },
        'Un proyecto multifamiliar necesita lote grande: por debajo de 300 m² no sale.',
      ),
    },
  ),

  /**
   * Bodega logística: lo que manda es la conexión con la vía primaria y el tamaño del lote
   * (35 % entre los dos). La pendiente importa porque una bodega necesita plataforma plana.
   */
  bodega_logistica: profile(
    'bodega_logistica',
    'Lote grande y plano, pegado a la vía primaria, en suelo que admita uso logístico.',
    {
      distance_primary_road_m: 0.2,
      parcel_area_m2: 0.15,
      slope_mean_pct: 0.12,
      road_access_index: 0.11,
      pot_classification: 0.1,
      hazard_flood_level: 0.09,
      hazard_landslide_level: 0.06,
      distance_paved_road_m: 0.05,
      protected_area_overlap_pct: 0.04,
      land_vocation: 0.04,
      ethnic_territory_overlap_pct: 0.02,
      land_cadastral_value_per_m2: 0.02,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.logistics,
        'Una bodega con patio de maniobras no cabe en menos de 1.000 m².',
      ),
      pot_classification: POT_LOGISTICS_OVERRIDE,
      land_vocation: VOCATION_URBAN_OVERRIDE,
    },
  ),

  /**
   * Agricultura: el suelo es el activo. Capacidad de uso, vocación y frontera agrícola
   * pesan 45 % entre los tres; el resto es pendiente (mecanización), conflicto de uso y
   * salida de la cosecha al mercado.
   */
  agricultura: profile(
    'agricultura',
    'Suelo de buena capacidad, dentro de la frontera agrícola, con pendiente que permita trabajarlo y salida al mercado.',
    {
      land_capability_class: 0.2,
      land_vocation: 0.13,
      inside_agricultural_frontier: 0.12,
      slope_mean_pct: 0.1,
      land_use_conflict: 0.08,
      parcel_area_m2: 0.08,
      protected_area_overlap_pct: 0.06,
      ethnic_territory_overlap_pct: 0.05,
      distance_secondary_road_m: 0.05,
      elevation_mean_m: 0.04,
      distance_municipal_seat_m: 0.03,
      pot_classification: 0.03,
      inside_urban_perimeter: 0.03,
    },
    AGRO_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.agriculture,
        'Por debajo de media hectárea la agricultura comercial no tiene escala.',
      ),
      pot_classification: POT_RURAL_OVERRIDE,
      inside_urban_perimeter: URBAN_PERIMETER_INVERTED,
    },
  ),

  /**
   * Ganadería: aguanta suelos y pendientes que la agricultura no, así que la vocación pesa
   * más que la clase agrológica y el conflicto de uso sube (la ganadería extensiva es la
   * principal causa de sobreutilización del suelo en Colombia).
   */
  ganaderia: profile(
    'ganaderia',
    'Terreno con vocación ganadera, dentro de la frontera agrícola y sin conflicto de uso.',
    {
      land_vocation: 0.18,
      land_capability_class: 0.15,
      inside_agricultural_frontier: 0.12,
      slope_mean_pct: 0.1,
      land_use_conflict: 0.1,
      parcel_area_m2: 0.08,
      protected_area_overlap_pct: 0.06,
      ethnic_territory_overlap_pct: 0.05,
      distance_secondary_road_m: 0.05,
      distance_municipal_seat_m: 0.04,
      elevation_mean_m: 0.03,
      pot_classification: 0.02,
      inside_urban_perimeter: 0.02,
    },
    AGRO_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.agriculture,
        'La ganadería necesita área: por debajo de media hectárea no hay carga animal posible.',
      ),
      pot_classification: POT_RURAL_OVERRIDE,
      inside_urban_perimeter: URBAN_PERIMETER_INVERTED,
    },
  ),

  /**
   * Colegio: la demanda manda. Población en edad escolar y oferta existente pesan 33 %
   * entre las dos; después el lote (un colegio necesita área) y la accesibilidad, porque
   * los niños tienen que llegar.
   */
  colegio: profile(
    'colegio',
    'Donde hay niños sin cupo, con lote suficiente y acceso seguro.',
    {
      school_age_population: 0.18,
      school_seats_per_100_school_age: 0.15,
      parcel_area_m2: 0.12,
      road_access_index: 0.1,
      slope_mean_pct: 0.08,
      distance_paved_road_m: 0.07,
      pot_classification: 0.07,
      hazard_flood_level: 0.06,
      hazard_landslide_level: 0.06,
      population_density_per_km2: 0.05,
      protected_area_overlap_pct: 0.03,
      ethnic_territory_overlap_pct: 0.03,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.school,
        'Un colegio con patio, aulas y zona de acceso necesita al menos 2.500 m².',
      ),
    },
  ),

  /**
   * Comercio local: gente cerca y flujo. Densidad de población y de comercio pesan 33 %;
   * las amenazas pesan poco porque un local se arrienda, no se construye de cero, pero no
   * desaparecen: siguen siendo indicadores obligatorios del uso.
   */
  comercio_local: profile(
    'comercio_local',
    'Donde vive y circula gente, con comercio alrededor y buen acceso.',
    {
      population_density_per_km2: 0.18,
      commerce_poi_density_per_km2: 0.15,
      road_access_index: 0.12,
      pot_classification: 0.1,
      inside_urban_perimeter: 0.1,
      competitor_density_per_km2: 0.08,
      distance_paved_road_m: 0.08,
      slope_mean_pct: 0.05,
      hazard_flood_level: 0.05,
      parcel_area_m2: 0.04,
      hazard_landslide_level: 0.03,
      protected_area_overlap_pct: 0.01,
      ethnic_territory_overlap_pct: 0.01,
    },
    URBAN_BLOCKERS,
  ),

  /**
   * Industria: como la bodega, pero con más peso en norma y en amenazas, porque una planta
   * es una inversión fija de largo plazo y su licencia ambiental depende del entorno.
   */
  industria: profile(
    'industria',
    'Lote grande sobre vía primaria, en suelo con norma industrial y sin amenazas relevantes.',
    {
      distance_primary_road_m: 0.18,
      parcel_area_m2: 0.14,
      slope_mean_pct: 0.12,
      pot_classification: 0.12,
      road_access_index: 0.1,
      hazard_flood_level: 0.08,
      hazard_landslide_level: 0.07,
      protected_area_overlap_pct: 0.06,
      ethnic_territory_overlap_pct: 0.04,
      land_vocation: 0.04,
      distance_municipal_seat_m: 0.03,
      land_cadastral_value_per_m2: 0.02,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.logistics,
        'Una planta industrial necesita lote grande y área de maniobra.',
      ),
      pot_classification: POT_LOGISTICS_OVERRIDE,
      land_vocation: VOCATION_URBAN_OVERRIDE,
    },
  ),

  /**
   * Turismo rural: el atractivo es el paisaje, así que la cercanía a áreas protegidas suma
   * como vecino y resta solo si el predio está dentro. Pesa mucho poder llegar: un hotel
   * rural al que no se llega en invierno no funciona.
   */
  turismo_rural: profile(
    'turismo_rural',
    'Paisaje y atractivos alrededor, con acceso confiable todo el año.',
    {
      tourism_poi_density_per_km2: 0.18,
      protected_area_overlap_pct: 0.1,
      distance_secondary_road_m: 0.1,
      distance_paved_road_m: 0.08,
      road_access_index: 0.08,
      distance_municipal_seat_m: 0.08,
      elevation_mean_m: 0.08,
      slope_mean_pct: 0.08,
      hazard_landslide_level: 0.07,
      hazard_flood_level: 0.06,
      parcel_area_m2: 0.05,
      ethnic_territory_overlap_pct: 0.04,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        { min: 500, max: 50_000 },
        'Un alojamiento rural necesita terreno, pero no tanto como una finca productiva.',
      ),
    },
  ),

  /**
   * Solar fotovoltaico: recurso solar y pendiente pesan 40 % entre los dos. La clase
   * agrológica entra invertida a propósito: preferimos paneles sobre suelo que no sirve
   * para cultivar.
   */
  solar_fotovoltaico: profile(
    'solar_fotovoltaico',
    'Terreno plano y amplio, con buen recurso solar, que no compita con suelo agrícola de primera.',
    {
      solar_irradiance_kwh_m2_day: 0.22,
      slope_mean_pct: 0.18,
      parcel_area_m2: 0.12,
      distance_primary_road_m: 0.1,
      land_capability_class: 0.1,
      protected_area_overlap_pct: 0.08,
      hazard_flood_level: 0.06,
      hazard_landslide_level: 0.05,
      ethnic_territory_overlap_pct: 0.05,
      road_access_index: 0.04,
    },
    URBAN_BLOCKERS,
    {
      parcel_area_m2: parcelAreaOverride(
        PARCEL_AREA_SCALES.logistics,
        'Un parque solar necesita superficie continua: por debajo de 1.000 m² no tiene sentido.',
      ),
      land_capability_class: LAND_CAPABILITY_SOLAR_OVERRIDE,
    },
  ),
};

export const USE_PROFILE_LIST: readonly UseProfile[] = TARGET_USES.map((u) => USE_PROFILES[u]);

export function getUseProfile(use: TargetUse): UseProfile {
  return USE_PROFILES[use];
}

/**
 * Comprueba que todo indicador obligatorio del uso tenga peso en el perfil. Si no lo
 * tuviera, el motor pediría un dato que nunca mira: es un error de declaración.
 * Se ejecuta en los tests, no en tiempo de ejecución.
 */
export function auditProfile(p: UseProfile): string[] {
  const problems: string[] = [];
  for (const id of p.required) {
    if (p.weights[id] === undefined) {
      problems.push(`${p.use}: el indicador obligatorio "${id}" no tiene peso en el perfil.`);
    }
  }
  for (const id of Object.keys(p.overrides)) {
    if (p.weights[id as IndicatorId] === undefined) {
      problems.push(`${p.use}: hay un ajuste para "${id}" pero el indicador no tiene peso.`);
    }
  }
  for (const [id, weight] of Object.entries(p.weights)) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
      problems.push(`${p.use}: peso inválido en "${id}".`);
    }
    if (findIndicator(id) === undefined) {
      problems.push(`${p.use}: "${id}" no existe en el catálogo de indicadores.`);
    }
  }
  return problems;
}
