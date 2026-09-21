/**
 * Catálogo declarativo de indicadores.
 *
 * Qué es un indicador aquí: una variable territorial con (a) una fórmula legible, (b) un
 * normalizador con puntos de corte declarados como datos, (c) una explicación en español
 * para una persona no técnica, (d) un semáforo, (e) las fuentes de las que sale y (f) los
 * usos en los que es obligatorio.
 *
 * Tres reglas que no se negocian:
 *
 *  1. **Este paquete no accede a base de datos.** Recibe `IndicatorInputs`, un objeto con
 *     los valores crudos ya consultados por la API, y devuelve puntajes con desglose. Así
 *     se puede probar exhaustivamente y la API decide de dónde vienen los datos.
 *  2. **El vocabulario de categorías es el del producto, no el de la fuente.** Los valores
 *     de texto que llegan aquí (`amenaza_alta`, `vocacion_agricola`, `suelo_urbano`…) son
 *     el vocabulario normalizado que produce el ETL al mapear las leyendas reales de cada
 *     dataset. En este paquete no se inventan nombres de campos ni de capas de origen
 *     (regla 2 de CLAUDE.md); esos viven en `etl/config/datasets/*.ts` con la inspección
 *     real de la Fase 0.
 *  3. **Faltar no es puntuar 0.** Si un indicador no tiene valor, su puntaje es `null`, se
 *     reporta en `missing` y, si era obligatorio para el uso, el resultado es `sin_datos`.
 */

import type { TargetUse } from '@terracolombia/shared';
import { MESSAGES, formatArea, formatDistance, formatNumber } from '@terracolombia/shared';
import type { FactorScore } from '@terracolombia/shared';
import {
  band,
  booleanInput,
  booleanScore,
  categorical,
  categoryInput,
  describeNormalizer,
  isFiniteNumber,
  linear,
  linearInverse,
  normalizeCategoryKey,
  numericInput,
  stepped,
  type Normalizer,
  type RawValue,
} from './normalize.js';

// ─── Tipos base ───────────────────────────────────────────────────────────────

export type IndicatorValue = RawValue | null;
export type IndicatorDirection = 'higher_is_better' | 'lower_is_better' | 'categorical';
export type IndicatorFlag = 'ok' | 'caution' | 'blocker' | 'unknown';
export type IndicatorValueType = 'number' | 'category' | 'boolean';

/**
 * Identificadores de los datasets de `meta.dataset`. Son claves internas del producto,
 * no nombres de campos ni URLs de las fuentes. El ETL las registra al cargar cada corte.
 */
export const DATASET_IDS = {
  igacParcel: 'igac_base_catastral_terreno',
  igacBuilding: 'igac_base_catastral_construccion',
  igacUrbanPerimeter: 'igac_perimetro_urbano',
  igacMunicipality: 'igac_limites_municipales',
  igacLandCapability: 'igac_agrologia_capacidad_uso',
  igacLandVocation: 'igac_agrologia_vocacion_uso',
  igacLandUseConflict: 'igac_agrologia_conflicto_uso',
  dem: 'copernicus_dem_30m',
  sgcLandslide: 'sgc_amenaza_movimientos_en_masa',
  sgcSeismic: 'sgc_amenaza_sismica',
  ideamFlood: 'ideam_zonas_inundables',
  ideamSolar: 'ideam_irradiacion_solar',
  runapProtectedArea: 'pnn_runap_areas_protegidas',
  ethnicTerritory: 'ant_territorios_etnicos',
  upraAgriculturalFrontier: 'upra_frontera_agricola',
  potZone: 'pot_clasificacion_suelo',
  osmRoad: 'osm_vias',
  osmPoi: 'osm_pois',
  daneCensus: 'dane_mgn_cnpv_2018',
  menSchool: 'men_establecimientos_educativos',
  repsHealth: 'minsalud_reps_ips',
  anmMiningTitle: 'anm_titulos_mineros',
} as const;

/**
 * Datasets cuya disponibilidad, cobertura o licencia debe confirmarse antes de exponer
 * los indicadores que dependen de ellos (PLAN.md §5 y §6). Mientras no se confirmen, sus
 * indicadores llegan vacíos y el motor los reporta como faltantes, no los estima.
 */
export const DATASETS_PENDING_VERIFICATION: readonly string[] = [
  DATASET_IDS.potZone,
  DATASET_IDS.anmMiningTitle,
  DATASET_IDS.ideamSolar,
];

/** Ajuste de un indicador para un uso concreto: la orientación puede cambiar con el uso. */
export interface IndicatorOverride {
  normalize?: Normalizer<RawValue>;
  direction?: IndicatorDirection;
  formula?: string;
  explain?: (value: IndicatorValue, score: number | null) => string;
  flagFor?: (value: IndicatorValue) => IndicatorFlag;
  /** Por qué este uso mira el indicador al revés que el resto. */
  rationale?: string;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  label: string;
  /** Unidad del valor crudo; `null` en categóricos y booleanos. */
  unit: string | null;
  direction: IndicatorDirection;
  valueType: IndicatorValueType;
  /** Texto legible que se muestra en "¿Cómo se calcula?". */
  formula: string;
  normalize: Normalizer<RawValue>;
  sourceDatasetIds: readonly string[];
  explain: (value: IndicatorValue, score: number | null) => string;
  flagFor: (value: IndicatorValue) => IndicatorFlag;
  /** Usos en los que es obligatorio: si falta, el resultado es `sin_datos`. */
  requiredFor: readonly TargetUse[];
  /** Término del glosario de `@terracolombia/shared` que explica el concepto. */
  glossaryId?: string;
  /** Advertencia sobre la calidad, escala o disponibilidad del dato. */
  caveat?: string;
}

// ─── Lectura de entradas ──────────────────────────────────────────────────────

export const INDICATOR_IDS = [
  // Relieve y suelo
  'slope_mean_pct',
  'elevation_mean_m',
  'land_capability_class',
  'land_vocation',
  'land_use_conflict',
  'solar_irradiance_kwh_m2_day',
  // Amenazas y restricciones
  'hazard_landslide_level',
  'hazard_seismic_level',
  'hazard_flood_level',
  'protected_area_overlap_pct',
  'protected_area_category',
  'ethnic_territory_overlap_pct',
  'mining_title_present',
  'inside_agricultural_frontier',
  'inside_urban_perimeter',
  'pot_classification',
  // Accesibilidad
  'distance_primary_road_m',
  'distance_secondary_road_m',
  'distance_paved_road_m',
  'distance_municipal_seat_m',
  'distance_school_m',
  'distance_health_facility_m',
  'road_access_index',
  // Demografía y mercado
  'population_density_per_km2',
  'school_age_population',
  'school_seats_per_100_school_age',
  'commerce_poi_density_per_km2',
  'competitor_density_per_km2',
  'tourism_poi_density_per_km2',
  // Predial
  'parcel_density_per_km2',
  'parcel_area_m2',
  'built_area_m2',
  'large_parcels_count',
  'land_cadastral_value_per_m2',
] as const;

export type IndicatorId = (typeof INDICATOR_IDS)[number];

/**
 * Valores crudos de entrada, ya consultados por la API. Cualquier clave ausente o `null`
 * es un dato que no tenemos; el motor lo dice, no lo rellena.
 */
export type IndicatorInputs = Partial<Record<IndicatorId, IndicatorValue>>;

export function readInput(inputs: IndicatorInputs, id: IndicatorId): IndicatorValue {
  const v = inputs[id];
  return v === undefined ? null : v;
}

export function asNumber(value: IndicatorValue): number | null {
  return isFiniteNumber(value) ? value : null;
}

export function asText(value: IndicatorValue): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length === 0 ? null : t;
  }
  if (isFiniteNumber(value)) return String(value);
  return null;
}

export function asBoolean(value: IndicatorValue): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const key = normalizeCategoryKey(value);
    if (key === 'true' || key === 'si' || key === 'verdadero') return true;
    if (key === 'false' || key === 'no' || key === 'falso') return false;
  }
  return null;
}

// ─── Ayudas para semáforos y explicaciones ────────────────────────────────────

const MISSING_DEFAULT = `${MESSAGES.common.notAvailableLong}. No lo estimamos: preferimos decir que falta.`;

/** Envuelve una explicación para que el caso "sin dato" tenga siempre texto propio. */
function explainer(
  fn: (value: RawValue, score: number | null) => string,
  missingText: string = MISSING_DEFAULT,
): (value: IndicatorValue, score: number | null) => string {
  return (value, score) => (value === null ? missingText : fn(value, score));
}

/** Semáforo por umbrales numéricos cuando más alto es peor. */
function flagAbove(opts: { cautionAbove?: number; blockerAbove?: number }) {
  return (value: IndicatorValue): IndicatorFlag => {
    const n = asNumber(value);
    if (n === null) return 'unknown';
    if (opts.blockerAbove !== undefined && n > opts.blockerAbove) return 'blocker';
    if (opts.cautionAbove !== undefined && n > opts.cautionAbove) return 'caution';
    return 'ok';
  };
}

/** Semáforo por umbrales numéricos cuando más bajo es peor. */
function flagBelow(opts: { cautionBelow?: number; blockerBelow?: number }) {
  return (value: IndicatorValue): IndicatorFlag => {
    const n = asNumber(value);
    if (n === null) return 'unknown';
    if (opts.blockerBelow !== undefined && n < opts.blockerBelow) return 'blocker';
    if (opts.cautionBelow !== undefined && n < opts.cautionBelow) return 'caution';
    return 'ok';
  };
}

/** Semáforo por banda: fuera de la banda blanda es precaución; fuera de la dura, bloqueo. */
function flagBand(opts: {
  cautionOutside: { min: number; max: number };
  blockerOutside?: { min: number; max: number };
}) {
  return (value: IndicatorValue): IndicatorFlag => {
    const n = asNumber(value);
    if (n === null) return 'unknown';
    if (opts.blockerOutside && (n < opts.blockerOutside.min || n > opts.blockerOutside.max)) {
      return 'blocker';
    }
    if (n < opts.cautionOutside.min || n > opts.cautionOutside.max) return 'caution';
    return 'ok';
  };
}

function flagByCategory(
  map: Readonly<Record<string, IndicatorFlag>>,
  fallback: IndicatorFlag = 'unknown',
) {
  const canonical = new Map<string, IndicatorFlag>(
    Object.entries(map).map(([k, v]) => [normalizeCategoryKey(k), v]),
  );
  return (value: IndicatorValue): IndicatorFlag => {
    const text = asText(value);
    if (text === null) return 'unknown';
    return canonical.get(normalizeCategoryKey(text)) ?? fallback;
  };
}

/**
 * Indicador sin umbral de alarma: con dato es `ok`, sin dato es `unknown`. Se usa en los
 * indicadores de oportunidad (densidad de población, comercio, área…), donde un valor bajo
 * resta puntaje pero no es una restricción.
 */
function flagNeutral() {
  return (value: IndicatorValue): IndicatorFlag => (value === null ? 'unknown' : 'ok');
}

function flagByBoolean(whenTrue: IndicatorFlag, whenFalse: IndicatorFlag) {
  return (value: IndicatorValue): IndicatorFlag => {
    const b = asBoolean(value);
    if (b === null) return 'unknown';
    return b ? whenTrue : whenFalse;
  };
}

// ─── Puntos de corte declarados ───────────────────────────────────────────────
//
// Todos los cortes viven aquí, con nombre y justificación. Ningún número suelto dentro
// de la lógica.

/** Pendiente en %. Cortes de la práctica de urbanismo y del glosario del producto. */
export const SLOPE_BREAKPOINTS = [
  { upTo: 3, score: 100, label: 'Plano: no encarece la obra' },
  { upTo: 7, score: 92, label: 'Ligeramente inclinado' },
  { upTo: 12, score: 78, label: 'Inclinado: movimientos de tierra menores' },
  { upTo: 25, score: 55, label: 'Fuerte: encarece cimentación y vías internas' },
  { upTo: 45, score: 25, label: 'Muy fuerte: obra costosa y riesgo de erosión' },
] as const;
/** Por encima de este valor hay restricción ambiental habitual y bloqueo del motor. */
export const SLOPE_BLOCKER_PCT = 45;
export const SLOPE_CAUTION_PCT = 25;

/** Altitud habitable típica en Colombia; por encima de 3.000 m empieza el páramo. */
export const PARAMO_ELEVATION_M = 3000;
export const ELEVATION_BAND = {
  hardMin: -10,
  idealMin: 0,
  idealMax: 2600,
  hardMax: 3600,
} as const;

/** Clase agrológica 1–8 (1 la mejor para cultivos, 8 solo conservación). */
export const LAND_CAPABILITY_SCORES: Readonly<Record<string, number>> = {
  '1': 100,
  '2': 92,
  '3': 80,
  '4': 65,
  '5': 45,
  '6': 35,
  '7': 20,
  '8': 5,
};

/** Vocación de uso, orientada a usos agropecuarios (más vocación agrícola, más puntaje). */
export const LAND_VOCATION_SCORES_AGRO: Readonly<Record<string, number>> = {
  agricola: 100,
  agroforestal: 80,
  ganadera: 70,
  forestal_produccion: 55,
  forestal_protectora: 20,
  conservacion: 5,
  zonas_urbanas: 10,
  cuerpo_de_agua: 0,
};

/** La misma vocación, orientada a usos urbanos: ocupar suelo agrícola de primera resta. */
export const LAND_VOCATION_SCORES_URBAN: Readonly<Record<string, number>> = {
  agricola: 35,
  agroforestal: 55,
  ganadera: 65,
  forestal_produccion: 55,
  forestal_protectora: 15,
  conservacion: 5,
  zonas_urbanas: 100,
  cuerpo_de_agua: 0,
};

/** Conflicto de uso (IGAC/UPRA): el uso adecuado es el mejor escenario. */
export const LAND_USE_CONFLICT_SCORES: Readonly<Record<string, number>> = {
  uso_adecuado: 100,
  subutilizacion_ligera: 80,
  subutilizacion_moderada: 70,
  subutilizacion_severa: 55,
  sobreutilizacion_ligera: 55,
  sobreutilizacion_moderada: 35,
  sobreutilizacion_severa: 10,
  sin_conflicto_definido: 60,
};

/**
 * Niveles de amenaza. Vocabulario normalizado del producto: el ETL mapea la leyenda real
 * de cada servicio (SGC, IDEAM) a estas cinco clases.
 */
export const HAZARD_LEVEL_VOCABULARY = ['muy_baja', 'baja', 'media', 'alta', 'muy_alta'] as const;
export type HazardLevel = (typeof HAZARD_LEVEL_VOCABULARY)[number];

export const HAZARD_LEVEL_SCORES: Readonly<Record<string, number>> = {
  muy_baja: 100,
  baja: 85,
  media: 55,
  alta: 20,
  muy_alta: 5,
};

export const HAZARD_LEVEL_FLAGS: Readonly<Record<string, IndicatorFlag>> = {
  muy_baja: 'ok',
  baja: 'ok',
  media: 'caution',
  alta: 'blocker',
  muy_alta: 'blocker',
};

/** Niveles que el motor trata como bloqueo duro. */
export const BLOCKING_HAZARD_LEVELS: readonly HazardLevel[] = ['alta', 'muy_alta'];

/**
 * Categorías de área protegida del SINAP con régimen restrictivo: dentro de ellas el uso
 * productivo o constructivo ordinario no procede, así que bloquean. Las demás categorías
 * (distritos de manejo integrado, áreas de recreación, reservas de la sociedad civil)
 * admiten usos regulados, así que son precaución y no bloqueo.
 */
export const RESTRICTIVE_PROTECTED_CATEGORIES: readonly string[] = [
  'parque_nacional_natural',
  'santuario_de_fauna_y_flora',
  'santuario_de_flora',
  'santuario_de_fauna',
  'area_natural_unica',
  'via_parque',
  'reserva_natural_de_la_nacion',
  'parque_natural_regional',
  'reserva_forestal_protectora',
  'distrito_de_conservacion_de_suelos',
];

export const PROTECTED_AREA_CATEGORY_SCORES: Readonly<Record<string, number>> = {
  ninguna: 100,
  distrito_de_manejo_integrado: 45,
  area_de_recreacion: 45,
  reserva_natural_de_la_sociedad_civil: 50,
  distrito_regional_de_manejo_integrado: 45,
  distrito_de_conservacion_de_suelos: 15,
  reserva_forestal_protectora: 10,
  parque_natural_regional: 5,
  via_parque: 5,
  area_natural_unica: 5,
  santuario_de_fauna: 5,
  santuario_de_flora: 5,
  santuario_de_fauna_y_flora: 5,
  reserva_natural_de_la_nacion: 5,
  parque_nacional_natural: 0,
};

/** Porcentaje de solapamiento a partir del cual se considera que el predio "está dentro". */
export const OVERLAP_INSIDE_PCT = 10;
export const OVERLAP_TOUCHING_PCT = 1;

/** Clasificación del suelo del POT, orientada a desarrollo urbano. */
export const POT_CLASSIFICATION_SCORES_URBAN: Readonly<Record<string, number>> = {
  suelo_urbano: 100,
  suelo_de_expansion_urbana: 80,
  suelo_suburbano: 65,
  centro_poblado_rural: 55,
  suelo_rural: 25,
  suelo_de_proteccion: 0,
};

/** La misma clasificación, orientada a usos agropecuarios. */
export const POT_CLASSIFICATION_SCORES_RURAL: Readonly<Record<string, number>> = {
  suelo_rural: 100,
  suelo_suburbano: 60,
  centro_poblado_rural: 45,
  suelo_de_expansion_urbana: 30,
  suelo_urbano: 10,
  suelo_de_proteccion: 5,
};

export const POT_CLASSIFICATION_FLAGS: Readonly<Record<string, IndicatorFlag>> = {
  suelo_urbano: 'ok',
  suelo_de_expansion_urbana: 'caution',
  suelo_suburbano: 'caution',
  centro_poblado_rural: 'ok',
  suelo_rural: 'ok',
  suelo_de_proteccion: 'blocker',
};

/** Distancias en metros. 0 m puntúa 100 y el tope puntúa 0. */
export const DISTANCE_SCALES = {
  primaryRoad: { best: 0, worst: 10_000, caution: 5_000 },
  secondaryRoad: { best: 0, worst: 5_000, caution: 2_500 },
  pavedRoad: { best: 0, worst: 3_000, caution: 1_500 },
  municipalSeat: { best: 0, worst: 30_000, caution: 15_000 },
  school: { best: 0, worst: 3_000, caution: 1_500 },
  healthFacility: { best: 0, worst: 10_000, caution: 5_000 },
} as const;

/** Densidades de referencia por km². Topes altos pero realistas en cabeceras colombianas. */
export const DENSITY_SCALES = {
  population: { min: 0, max: 15_000 },
  commercePoi: { min: 0, max: 400 },
  competitors: { min: 0, max: 40 },
  tourismPoi: { min: 0, max: 60 },
  parcels: { min: 0, max: 2_000 },
} as const;

/** Población en edad escolar (5–16 años) por celda o zona analizada. */
export const SCHOOL_AGE_SCALE = { min: 0, max: 1_500 } as const;

/** Oferta educativa existente: cupos oficiales por cada 100 niños en edad escolar. */
export const SCHOOL_SUPPLY_SCALE = { saturated: 110, empty: 0 } as const;

/** Irradiación solar diaria media (kWh/m²/día). Rango típico colombiano. */
export const SOLAR_IRRADIANCE_SCALE = { min: 3.2, max: 6.2 } as const;

/** Áreas de predio en m² para los distintos usos. */
export const PARCEL_AREA_SCALES = {
  /** Vivienda unifamiliar: por debajo de 72 m² (lote VIS típico) se complica. */
  housing: { min: 72, max: 600 },
  /** Bodega logística / industria: se necesita terreno grande. */
  logistics: { min: 1_000, max: 20_000 },
  /** Colegio: la norma de equipamientos educativos pide lotes amplios. */
  school: { min: 2_500, max: 20_000 },
  /** Agropecuario: se compara contra un tope de 50 ha. */
  agriculture: { min: 5_000, max: 500_000 },
} as const;

export const BUILT_AREA_SCALE = { min: 0, max: 1_000 } as const;
export const LARGE_PARCELS_SCALE = { min: 0, max: 15 } as const;
/**
 * Avalúo catastral por m² como aproximación *relativa* del costo del suelo. Va siempre
 * con la advertencia de que el avalúo catastral no es valor comercial (regla 5 de
 * CLAUDE.md). Menos es mejor cuando lo que se busca es suelo barato.
 */
export const CADASTRAL_VALUE_PER_M2_SCALE = { cheap: 20_000, expensive: 3_000_000 } as const;

// ─── Catálogo ─────────────────────────────────────────────────────────────────

const ALL_CONSTRUCTION_USES: readonly TargetUse[] = [
  'vivienda_unifamiliar',
  'vivienda_multifamiliar',
  'bodega_logistica',
  'colegio',
  'comercio_local',
  'industria',
  'turismo_rural',
  'solar_fotovoltaico',
];

const ALL_USES: readonly TargetUse[] = [...ALL_CONSTRUCTION_USES, 'agricultura', 'ganaderia'];

export const INDICATORS: Record<IndicatorId, IndicatorDefinition> = {
  // ── Relieve y suelo ────────────────────────────────────────────────────────
  slope_mean_pct: {
    id: 'slope_mean_pct',
    label: 'Pendiente media del terreno',
    unit: '%',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Promedio de la pendiente de las celdas del modelo digital de elevación (Copernicus 30 m) que caen dentro del predio o de la celda H3, en porcentaje.',
    normalize: numericInput(stepped(SLOPE_BREAKPOINTS)),
    sourceDatasetIds: [DATASET_IDS.dem],
    glossaryId: 'pendiente',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n <= 3)
        return `El terreno es prácticamente plano (${formatNumber(n, 1)} %): construir ahí no tiene sobrecosto por topografía.`;
      if (n <= SLOPE_CAUTION_PCT)
        return `La pendiente media es de ${formatNumber(n, 1)} %. Es manejable, pero cuanto más inclinado, más cuesta la cimentación y las vías internas.`;
      if (n <= SLOPE_BLOCKER_PCT)
        return `La pendiente media es de ${formatNumber(n, 1)} %, bastante fuerte. Encarece mucho la obra y aumenta el riesgo de erosión; conviene un estudio geotécnico antes de decidir.`;
      return `La pendiente media es de ${formatNumber(n, 1)} %, por encima del ${SLOPE_BLOCKER_PCT} % que suele tener restricción ambiental y constructiva. Para este uso lo tratamos como una restricción fuerte.`;
    }, 'No tenemos la pendiente de este terreno porque no hay cobertura del modelo de elevación en esta zona. No la estimamos.'),
    flagFor: flagAbove({ cautionAbove: SLOPE_CAUTION_PCT, blockerAbove: SLOPE_BLOCKER_PCT }),
    requiredFor: ALL_CONSTRUCTION_USES,
  },

  elevation_mean_m: {
    id: 'elevation_mean_m',
    label: 'Altitud media',
    unit: 'm s. n. m.',
    direction: 'categorical',
    valueType: 'number',
    formula:
      'Promedio de altitud sobre el nivel del mar del modelo digital de elevación dentro del predio o de la celda. Se puntúa por banda: no hay un "más es mejor".',
    normalize: numericInput(band(ELEVATION_BAND)),
    sourceDatasetIds: [DATASET_IDS.dem],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n >= PARAMO_ELEVATION_M)
        return `Está a ${formatNumber(n)} m sobre el nivel del mar, en altura de páramo. Los páramos tienen protección legal y allí muchas actividades están prohibidas o restringidas.`;
      if (n <= ELEVATION_BAND.idealMax)
        return `Está a ${formatNumber(n)} m sobre el nivel del mar, dentro del rango donde vive y produce la mayor parte del país.`;
      return `Está a ${formatNumber(n)} m sobre el nivel del mar. A esa altura el clima limita cultivos y encarece la logística.`;
    }),
    flagFor: flagBand({
      cautionOutside: { min: ELEVATION_BAND.idealMin, max: ELEVATION_BAND.idealMax },
      blockerOutside: { min: ELEVATION_BAND.hardMin, max: ELEVATION_BAND.hardMax },
    }),
    requiredFor: [],
  },

  land_capability_class: {
    id: 'land_capability_class',
    label: 'Clase agrológica (capacidad de uso)',
    unit: 'clase 1–8',
    direction: 'lower_is_better',
    valueType: 'category',
    formula:
      'Clase de capacidad de uso del estudio de suelos del IGAC que cubre la mayor parte del predio (1 la mejor para cultivos, 8 solo conservación). El ETL entrega la clase sin subclase.',
    normalize: categoryInput(categorical(LAND_CAPABILITY_SCORES)),
    sourceDatasetIds: [DATASET_IDS.igacLandCapability],
    glossaryId: 'capacidad_uso',
    explain: explainer((value) => {
      const c = asText(value);
      if (c === null) return MISSING_DEFAULT;
      const n = Number(c);
      if (Number.isFinite(n) && n <= 3)
        return `El suelo es clase ${c}: de los mejores del país para cultivar, con pocas limitaciones.`;
      if (Number.isFinite(n) && n <= 4)
        return `El suelo es clase ${c}: se puede cultivar, con limitaciones que exigen manejo (riego, drenaje o control de erosión).`;
      if (Number.isFinite(n) && n <= 7)
        return `El suelo es clase ${c}: rinde más en pastos o bosque que en cultivos limpios.`;
      return `El suelo es clase ${c}: prácticamente no admite uso productivo, se destina a conservación.`;
    }),
    flagFor: flagByCategory({
      '1': 'ok',
      '2': 'ok',
      '3': 'ok',
      '4': 'ok',
      '5': 'caution',
      '6': 'caution',
      '7': 'caution',
      '8': 'blocker',
    }),
    requiredFor: ['agricultura', 'ganaderia'],
  },

  land_vocation: {
    id: 'land_vocation',
    label: 'Vocación de uso del suelo',
    unit: null,
    direction: 'categorical',
    valueType: 'category',
    formula:
      'Vocación de uso predominante según el estudio agrológico del IGAC. La orientación por omisión favorece los usos agropecuarios; los perfiles urbanos la invierten con un ajuste declarado.',
    normalize: categoryInput(categorical(LAND_VOCATION_SCORES_AGRO)),
    sourceDatasetIds: [DATASET_IDS.igacLandVocation],
    glossaryId: 'vocacion_uso',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      return `Por sus características naturales, este suelo tiene vocación ${v.replace(/_/g, ' ')}. La vocación describe para qué sirve mejor el suelo; lo que se puede hacer legalmente lo define el POT del municipio.`;
    }),
    flagFor: flagByCategory(
      {
        agricola: 'ok',
        agroforestal: 'ok',
        ganadera: 'ok',
        forestal_produccion: 'ok',
        forestal_protectora: 'caution',
        conservacion: 'blocker',
        zonas_urbanas: 'ok',
        cuerpo_de_agua: 'blocker',
      },
      'caution',
    ),
    requiredFor: ['agricultura', 'ganaderia'],
  },

  land_use_conflict: {
    id: 'land_use_conflict',
    label: 'Conflicto de uso del suelo',
    unit: null,
    direction: 'categorical',
    valueType: 'category',
    formula:
      'Comparación entre el uso actual del suelo y su vocación, según el estudio de conflictos de uso (IGAC/UPRA). Sobreutilizar desgasta el suelo; subutilizar deja capacidad sin aprovechar.',
    normalize: categoryInput(categorical(LAND_USE_CONFLICT_SCORES)),
    sourceDatasetIds: [DATASET_IDS.igacLandUseConflict],
    glossaryId: 'conflicto_uso',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      const key = normalizeCategoryKey(v);
      if (key === 'uso_adecuado')
        return 'Hoy el terreno se usa para lo que el suelo aguanta: no hay conflicto de uso.';
      if (key.startsWith('sobreutilizacion'))
        return `El terreno está sobreutilizado (${v.replace(/_/g, ' ')}): se le exige más de lo que puede dar, con riesgo de erosión y pérdida de fertilidad.`;
      if (key.startsWith('subutilizacion'))
        return `El terreno está subutilizado (${v.replace(/_/g, ' ')}): podría dar más de lo que da hoy.`;
      return `Conflicto de uso reportado: ${v.replace(/_/g, ' ')}.`;
    }),
    flagFor: flagByCategory(
      {
        uso_adecuado: 'ok',
        subutilizacion_ligera: 'ok',
        subutilizacion_moderada: 'ok',
        subutilizacion_severa: 'caution',
        sobreutilizacion_ligera: 'caution',
        sobreutilizacion_moderada: 'caution',
        sobreutilizacion_severa: 'caution',
        sin_conflicto_definido: 'ok',
      },
      'caution',
    ),
    requiredFor: [],
  },

  solar_irradiance_kwh_m2_day: {
    id: 'solar_irradiance_kwh_m2_day',
    label: 'Irradiación solar media diaria',
    unit: 'kWh/m²/día',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Promedio anual de irradiación solar global horizontal en el punto o la celda, según el atlas climatológico del IDEAM.',
    normalize: numericInput(linear(SOLAR_IRRADIANCE_SCALE.min, SOLAR_IRRADIANCE_SCALE.max)),
    sourceDatasetIds: [DATASET_IDS.ideamSolar],
    caveat:
      'La disponibilidad y la licencia de la capa de irradiación del IDEAM se confirman en la Fase 0. Mientras no esté cargada, el indicador llega vacío y se reporta como faltante.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n >= 5)
        return `Recibe ${formatNumber(n, 1)} kWh/m² al día en promedio: es un recurso solar bueno para Colombia.`;
      if (n >= 4)
        return `Recibe ${formatNumber(n, 1)} kWh/m² al día en promedio: recurso solar medio.`;
      return `Recibe ${formatNumber(n, 1)} kWh/m² al día en promedio: recurso solar bajo para el país, la generación por panel rinde menos.`;
    }),
    flagFor: flagBelow({ cautionBelow: 4 }),
    requiredFor: [],
  },

  // ── Amenazas y restricciones ───────────────────────────────────────────────
  hazard_landslide_level: {
    id: 'hazard_landslide_level',
    label: 'Amenaza por movimientos en masa',
    unit: null,
    direction: 'lower_is_better',
    valueType: 'category',
    formula:
      'Nivel de amenaza por movimientos en masa que cubre la mayor parte del predio o de la celda, según el Servicio Geológico Colombiano, normalizado a cinco clases.',
    normalize: categoryInput(categorical(HAZARD_LEVEL_SCORES)),
    sourceDatasetIds: [DATASET_IDS.sgcLandslide],
    glossaryId: 'amenaza',
    caveat:
      'Escala nacional o regional: orienta decisiones preliminares y no sustituye el estudio de detalle que exige una licencia de construcción.',
    explain: explainer((value, score) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      const level = normalizeCategoryKey(v);
      const base = `La amenaza por deslizamientos y movimientos en masa está clasificada como ${v.replace(/_/g, ' ')}`;
      if (BLOCKING_HAZARD_LEVELS.includes(level as HazardLevel))
        return `${base}. Para el motor es una restricción fuerte: antes de cualquier decisión se necesita un estudio geotécnico de detalle.`;
      if (level === 'media')
        return `${base}. Conviene un estudio de detalle y obras de estabilización o drenaje (puntaje ${formatNumber(score ?? 0)}/100).`;
      return `${base}: no encontramos una restricción relevante por este factor.`;
    }),
    flagFor: flagByCategory(HAZARD_LEVEL_FLAGS, 'caution'),
    requiredFor: ALL_CONSTRUCTION_USES,
  },

  hazard_seismic_level: {
    id: 'hazard_seismic_level',
    label: 'Amenaza sísmica',
    unit: null,
    direction: 'lower_is_better',
    valueType: 'category',
    formula:
      'Nivel de amenaza sísmica de la zona según el Servicio Geológico Colombiano, normalizado a cinco clases.',
    normalize: categoryInput(categorical(HAZARD_LEVEL_SCORES)),
    sourceDatasetIds: [DATASET_IDS.sgcSeismic],
    glossaryId: 'amenaza',
    caveat:
      'La amenaza sísmica es regional: casi no distingue entre predios vecinos. No impide construir; determina las exigencias estructurales de la NSR-10.',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      return `La zona tiene amenaza sísmica ${v.replace(/_/g, ' ')}. Esto no impide construir: define qué tan exigente es el diseño estructural que pide la norma (NSR-10). Es un dato regional, igual para todo el municipio o buena parte de él.`;
    }),
    // A diferencia de los otros peligros, la amenaza sísmica alta no bloquea: se
    // resuelve con diseño estructural, así que como máximo es precaución.
    flagFor: flagByCategory(
      { muy_baja: 'ok', baja: 'ok', media: 'ok', alta: 'caution', muy_alta: 'caution' },
      'caution',
    ),
    requiredFor: [],
  },

  hazard_flood_level: {
    id: 'hazard_flood_level',
    label: 'Amenaza de inundación',
    unit: null,
    direction: 'lower_is_better',
    valueType: 'category',
    formula:
      'Nivel de amenaza por inundación que cubre la mayor parte del predio o de la celda, según las capas del IDEAM, normalizado a cinco clases.',
    normalize: categoryInput(categorical(HAZARD_LEVEL_SCORES)),
    sourceDatasetIds: [DATASET_IDS.ideamFlood],
    glossaryId: 'amenaza',
    caveat:
      'Escala nacional o regional: orienta decisiones preliminares y no sustituye el estudio hidrológico de detalle.',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      const level = normalizeCategoryKey(v);
      if (BLOCKING_HAZARD_LEVELS.includes(level as HazardLevel))
        return `La amenaza de inundación está clasificada como ${v.replace(/_/g, ' ')}. Para el motor es una restricción fuerte: revisa la ronda hídrica y el estudio hidrológico del municipio antes de seguir.`;
      return `La amenaza de inundación está clasificada como ${v.replace(/_/g, ' ')}.`;
    }),
    flagFor: flagByCategory(HAZARD_LEVEL_FLAGS, 'caution'),
    requiredFor: ALL_CONSTRUCTION_USES,
  },

  protected_area_overlap_pct: {
    id: 'protected_area_overlap_pct',
    label: 'Solapamiento con área protegida',
    unit: '%',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Porcentaje del área del predio o de la celda que cae dentro de un área protegida inscrita en el RUNAP, calculado en EPSG:9377.',
    normalize: numericInput(
      stepped([
        { upTo: OVERLAP_TOUCHING_PCT, score: 100, label: 'Sin solapamiento relevante' },
        { upTo: OVERLAP_INSIDE_PCT, score: 60, label: 'Toca el borde del área protegida' },
        { upTo: 50, score: 25, label: 'Parte del predio está dentro' },
        { upTo: 100, score: 0, label: 'Está dentro del área protegida' },
      ]),
    ),
    sourceDatasetIds: [DATASET_IDS.runapProtectedArea],
    glossaryId: 'area_protegida',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n <= OVERLAP_TOUCHING_PCT) return 'No se cruza con ninguna área protegida del RUNAP.';
      if (n <= OVERLAP_INSIDE_PCT)
        return `Toca el borde de un área protegida (${formatNumber(n, 1)} % del área). Verifica los linderos exactos con la autoridad ambiental.`;
      return `El ${formatNumber(n, 1)} % del área está dentro de un área protegida del RUNAP. Allí los usos están restringidos por norma ambiental.`;
    }),
    // Solo precaución: si el solapamiento bloquea o no lo decide la categoría de manejo,
    // y eso lo evalúa la regla `protected_area_restrictive` del perfil de uso, que mira
    // los dos indicadores a la vez.
    flagFor: flagAbove({ cautionAbove: OVERLAP_TOUCHING_PCT }),
    requiredFor: ALL_USES,
  },

  protected_area_category: {
    id: 'protected_area_category',
    label: 'Categoría del área protegida',
    unit: null,
    direction: 'categorical',
    valueType: 'category',
    formula:
      'Categoría de manejo del área protegida con mayor solapamiento (`ninguna` si no hay). Determina si el régimen es restrictivo o admite usos regulados.',
    normalize: categoryInput(categorical(PROTECTED_AREA_CATEGORY_SCORES, { fallback: 30 })),
    sourceDatasetIds: [DATASET_IDS.runapProtectedArea],
    glossaryId: 'area_protegida',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      if (normalizeCategoryKey(v) === 'ninguna')
        return 'No hay ninguna área protegida sobre este terreno.';
      const restrictive = RESTRICTIVE_PROTECTED_CATEGORIES.includes(normalizeCategoryKey(v));
      return restrictive
        ? `Está en un área de categoría "${v.replace(/_/g, ' ')}", que tiene régimen restrictivo: el uso productivo o constructivo ordinario no procede. Consulta a la autoridad ambiental.`
        : `Está en un área de categoría "${v.replace(/_/g, ' ')}", que admite usos regulados. Hay que consultar el plan de manejo del área con la autoridad ambiental.`;
    }),
    flagFor: (value) => {
      const v = asText(value);
      if (v === null) return 'unknown';
      const key = normalizeCategoryKey(v);
      if (key === 'ninguna') return 'ok';
      return RESTRICTIVE_PROTECTED_CATEGORIES.includes(key) ? 'blocker' : 'caution';
    },
    requiredFor: [],
  },

  ethnic_territory_overlap_pct: {
    id: 'ethnic_territory_overlap_pct',
    label: 'Solapamiento con territorio étnico',
    unit: '%',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Porcentaje del área del predio o de la celda que cae dentro de un resguardo indígena o de un territorio colectivo de comunidades negras, calculado en EPSG:9377.',
    normalize: numericInput(
      stepped([
        { upTo: OVERLAP_TOUCHING_PCT, score: 100, label: 'Sin solapamiento relevante' },
        { upTo: OVERLAP_INSIDE_PCT, score: 40, label: 'Toca el borde del territorio' },
        { upTo: 100, score: 0, label: 'Está dentro del territorio colectivo' },
      ]),
    ),
    sourceDatasetIds: [DATASET_IDS.ethnicTerritory],
    glossaryId: 'territorio_etnico',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n <= OVERLAP_TOUCHING_PCT)
        return 'No se cruza con resguardos indígenas ni con territorios colectivos de comunidades negras.';
      return `El ${formatNumber(n, 1)} % del área está en territorio colectivo (resguardo indígena o consejo comunitario). Allí la tierra es de propiedad colectiva, no se compra ni se vende como un predio ordinario, y cualquier proyecto requiere consulta previa con la autoridad étnica.`;
    }),
    flagFor: flagAbove({ cautionAbove: OVERLAP_TOUCHING_PCT, blockerAbove: OVERLAP_INSIDE_PCT }),
    requiredFor: ALL_USES,
  },

  mining_title_present: {
    id: 'mining_title_present',
    label: 'Título minero vigente sobre el terreno',
    unit: null,
    direction: 'lower_is_better',
    valueType: 'boolean',
    formula:
      'Verdadero si alguna parte del predio o de la celda está cubierta por un título minero vigente del catastro minero de la ANM.',
    normalize: booleanInput(booleanScore(30, 100)),
    sourceDatasetIds: [DATASET_IDS.anmMiningTitle],
    caveat:
      'La apertura y vigencia del catastro minero se verifica en la Fase 0. Si el dato no está cargado, el indicador llega vacío.',
    explain: explainer((value) => {
      const b = asBoolean(value);
      if (b === null) return MISSING_DEFAULT;
      return b
        ? 'Hay un título minero vigente sobre este terreno. El subsuelo es de la Nación y el titular minero tiene derechos sobre él, lo que puede limitar lo que se haga en superficie. Verifica el expediente en la Agencia Nacional de Minería.'
        : 'No encontramos títulos mineros vigentes sobre este terreno en los datos que tenemos.';
    }),
    flagFor: flagByBoolean('caution', 'ok'),
    requiredFor: [],
  },

  inside_agricultural_frontier: {
    id: 'inside_agricultural_frontier',
    label: 'Dentro de la frontera agrícola nacional',
    unit: null,
    direction: 'categorical',
    valueType: 'boolean',
    formula:
      'Verdadero si el centroide del predio o de la celda cae dentro de la frontera agrícola nacional delimitada por la UPRA.',
    normalize: booleanInput(booleanScore(100, 20)),
    sourceDatasetIds: [DATASET_IDS.upraAgriculturalFrontier],
    glossaryId: 'frontera_agricola',
    explain: explainer((value) => {
      const b = asBoolean(value);
      if (b === null) return MISSING_DEFAULT;
      return b
        ? 'Está dentro de la frontera agrícola nacional: es zona donde el país considera viable la actividad agropecuaria.'
        : 'Está fuera de la frontera agrícola nacional. Fuera de ella la actividad agropecuaria no está habilitada por la política de tierras, normalmente porque es bosque, páramo o área de protección.';
    }),
    flagFor: flagByBoolean('ok', 'caution'),
    requiredFor: ['agricultura', 'ganaderia'],
  },

  inside_urban_perimeter: {
    id: 'inside_urban_perimeter',
    label: 'Dentro del perímetro urbano',
    unit: null,
    direction: 'categorical',
    valueType: 'boolean',
    formula:
      'Verdadero si el centroide del predio o de la celda cae dentro del perímetro urbano del municipio. La orientación por omisión favorece los usos urbanos; los perfiles agropecuarios la invierten con un ajuste declarado.',
    normalize: booleanInput(booleanScore(100, 40)),
    sourceDatasetIds: [DATASET_IDS.igacUrbanPerimeter],
    explain: explainer((value) => {
      const b = asBoolean(value);
      if (b === null) return MISSING_DEFAULT;
      return b
        ? 'Está dentro del perímetro urbano: hay redes de servicios públicos y el POT define usos urbanos.'
        : 'Está fuera del perímetro urbano. Conectar servicios públicos puede ser costoso o no estar permitido, y los usos los define la norma rural del POT.';
    }),
    flagFor: flagByBoolean('ok', 'caution'),
    requiredFor: [],
  },

  pot_classification: {
    id: 'pot_classification',
    label: 'Clasificación del suelo en el POT',
    unit: null,
    direction: 'categorical',
    valueType: 'category',
    formula:
      'Clasificación del suelo asignada por el Plan de Ordenamiento Territorial del municipio en el polígono que cubre el predio. La orientación por omisión favorece el desarrollo urbano; los perfiles agropecuarios la invierten.',
    normalize: categoryInput(categorical(POT_CLASSIFICATION_SCORES_URBAN)),
    sourceDatasetIds: [DATASET_IDS.potZone],
    glossaryId: 'pot',
    caveat:
      'No existe un repositorio nacional completo de POT. Para muchos municipios este dato no está disponible y hay que consultar a la Secretaría de Planeación municipal.',
    explain: explainer((value) => {
      const v = asText(value);
      if (v === null) return MISSING_DEFAULT;
      const key = normalizeCategoryKey(v);
      if (key === 'suelo_de_proteccion')
        return 'El POT clasifica este suelo como de protección: no es urbanizable. Es una restricción de norma, no una opinión del motor.';
      return `El POT clasifica este suelo como ${v.replace(/_/g, ' ')}. La clasificación dice qué tipo de norma aplica; los usos y aprovechamientos concretos (alturas, índices, usos permitidos) hay que consultarlos en la ficha normativa del municipio.`;
    }, 'No tenemos el POT de este municipio: no existe un repositorio nacional completo. Consulta la Secretaría de Planeación municipal. No inventamos la clasificación.'),
    flagFor: flagByCategory(POT_CLASSIFICATION_FLAGS, 'caution'),
    requiredFor: [],
  },

  // ── Accesibilidad ──────────────────────────────────────────────────────────
  distance_primary_road_m: {
    id: 'distance_primary_road_m',
    label: 'Distancia a vía primaria',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, del centroide del predio o de la celda a la vía primaria o troncal más cercana de OpenStreetMap.',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.primaryRoad.best, DISTANCE_SCALES.primaryRoad.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.osmRoad],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `La vía primaria más cercana está a ${formatDistance(n)}. Es la conexión con el resto de la región: pesa mucho en logística y en el valor del suelo.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.primaryRoad.caution }),
    requiredFor: ['bodega_logistica', 'industria'],
  },

  distance_secondary_road_m: {
    id: 'distance_secondary_road_m',
    label: 'Distancia a vía secundaria',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, del centroide del predio o de la celda a la vía secundaria más cercana de OpenStreetMap.',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.secondaryRoad.best, DISTANCE_SCALES.secondaryRoad.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.osmRoad],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `La vía secundaria más cercana está a ${formatDistance(n)}: es la que conecta con el casco urbano y las veredas vecinas.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.secondaryRoad.caution }),
    requiredFor: [],
  },

  distance_paved_road_m: {
    id: 'distance_paved_road_m',
    label: 'Distancia a vía pavimentada',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, a la vía con superficie pavimentada más cercana de OpenStreetMap.',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.pavedRoad.best, DISTANCE_SCALES.pavedRoad.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.osmRoad],
    caveat:
      'El atributo de superficie en OpenStreetMap no está completo en todo el país: donde no esté declarado, el dato llega vacío.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n <= DISTANCE_SCALES.pavedRoad.caution)
        return `Hay vía pavimentada a ${formatDistance(n)}: se llega en carro todo el año.`;
      return `La vía pavimentada más cercana está a ${formatDistance(n)}. El último tramo es destapado, lo que en invierno puede complicar el acceso.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.pavedRoad.caution }),
    requiredFor: [],
  },

  distance_municipal_seat_m: {
    id: 'distance_municipal_seat_m',
    label: 'Distancia a la cabecera municipal',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, del centroide del predio o de la celda al centro poblado de la cabecera del municipio.',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.municipalSeat.best, DISTANCE_SCALES.municipalSeat.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.igacMunicipality],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `La cabecera municipal está a ${formatDistance(n)} en línea recta. Ahí están los trámites, el comercio y la mayoría de los servicios; el recorrido real por carretera siempre es mayor.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.municipalSeat.caution }),
    requiredFor: [],
  },

  distance_school_m: {
    id: 'distance_school_m',
    label: 'Distancia al colegio más cercano',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, a la sede educativa más cercana del directorio del Ministerio de Educación.',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.school.best, DISTANCE_SCALES.school.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.menSchool],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n <= DISTANCE_SCALES.school.caution)
        return `Hay una sede educativa a ${formatDistance(n)}: distancia caminable para la mayoría de las familias.`;
      return `La sede educativa más cercana está a ${formatDistance(n)}: implica transporte escolar.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.school.caution }),
    requiredFor: [],
  },

  distance_health_facility_m: {
    id: 'distance_health_facility_m',
    label: 'Distancia a la IPS más cercana',
    unit: 'm',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Distancia en línea recta, medida en EPSG:9377, a la sede de IPS más cercana del Registro Especial de Prestadores de Servicios de Salud (REPS).',
    normalize: numericInput(
      linearInverse(DISTANCE_SCALES.healthFacility.best, DISTANCE_SCALES.healthFacility.worst),
    ),
    sourceDatasetIds: [DATASET_IDS.repsHealth],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `La IPS más cercana está a ${formatDistance(n)}. Esta medida no distingue el nivel de complejidad del prestador: una IPS puede ser un puesto de salud o un hospital.`;
    }),
    flagFor: flagAbove({ cautionAbove: DISTANCE_SCALES.healthFacility.caution }),
    requiredFor: [],
  },

  road_access_index: {
    id: 'road_access_index',
    label: 'Índice de accesibilidad vial',
    unit: 'puntos 0–100',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Índice agregado 0–100 calculado en el ETL por celda H3 a partir de la densidad de vías, su jerarquía y la conectividad con la malla principal (`analytics.h3_cell.road_access_score`). Ya viene en escala 0–100, así que aquí se usa tal cual.',
    normalize: numericInput(linear(0, 100)),
    sourceDatasetIds: [DATASET_IDS.osmRoad],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n >= 70)
        return `La accesibilidad vial es buena (${formatNumber(n)}/100): hay malla vial suficiente y bien conectada.`;
      if (n >= 40)
        return `La accesibilidad vial es media (${formatNumber(n)}/100): se llega, pero con recorridos largos o vías de menor jerarquía.`;
      return `La accesibilidad vial es baja (${formatNumber(n)}/100): poca malla vial alrededor.`;
    }),
    flagFor: flagBelow({ cautionBelow: 40 }),
    requiredFor: [],
  },

  // ── Demografía y mercado ───────────────────────────────────────────────────
  population_density_per_km2: {
    id: 'population_density_per_km2',
    label: 'Densidad de población',
    unit: 'hab/km²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Población del censo 2018 (DANE) asignada a la celda o al área analizada, dividida por su superficie en km². La asignación reparte la población de la manzana o sección censal por área.',
    normalize: numericInput(linear(DENSITY_SCALES.population.min, DENSITY_SCALES.population.max)),
    sourceDatasetIds: [DATASET_IDS.daneCensus],
    glossaryId: 'mgn',
    caveat:
      'El censo es de 2018. Para zonas de crecimiento reciente la cifra subestima la población actual.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n < 100)
        return `Viven unas ${formatNumber(n)} personas por km²: es una zona rural o muy poco poblada.`;
      if (n < 3000)
        return `Viven unas ${formatNumber(n)} personas por km²: densidad de barrio de baja a media.`;
      return `Viven unas ${formatNumber(n)} personas por km²: es una zona densamente poblada, con mucho mercado potencial a pie.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  school_age_population: {
    id: 'school_age_population',
    label: 'Población en edad escolar',
    unit: 'personas',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Personas entre 5 y 16 años dentro del área analizada, a partir de los grupos de edad del censo 2018 del DANE.',
    normalize: numericInput(linear(SCHOOL_AGE_SCALE.min, SCHOOL_AGE_SCALE.max)),
    sourceDatasetIds: [DATASET_IDS.daneCensus],
    caveat: 'Cifra del censo 2018 repartida por área; es una aproximación, no una matrícula real.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `En esta zona viven unos ${formatNumber(n)} niños y adolescentes entre 5 y 16 años, según el censo de 2018. Es la demanda potencial de un colegio.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  school_seats_per_100_school_age: {
    id: 'school_seats_per_100_school_age',
    label: 'Oferta educativa existente',
    unit: 'cupos por 100 niños en edad escolar',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Matrícula reportada al Ministerio de Educación por las sedes educativas del área, dividida por la población de 5 a 16 años de la misma área, por 100. Para abrir un colegio, menos oferta existente es mejor: mide competencia.',
    normalize: numericInput(
      linearInverse(SCHOOL_SUPPLY_SCALE.empty, SCHOOL_SUPPLY_SCALE.saturated),
    ),
    sourceDatasetIds: [DATASET_IDS.menSchool, DATASET_IDS.daneCensus],
    caveat:
      'Los estudiantes no siempre estudian donde viven, así que este indicador mide presión de oferta en la zona, no cobertura individual.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n >= SCHOOL_SUPPLY_SCALE.saturated)
        return `Hay ${formatNumber(n)} cupos por cada 100 niños en edad escolar: la oferta existente ya cubre la demanda de la zona y un colegio nuevo competiría de frente.`;
      if (n >= 60)
        return `Hay ${formatNumber(n)} cupos por cada 100 niños en edad escolar: la oferta cubre buena parte de la demanda.`;
      return `Hay ${formatNumber(n)} cupos por cada 100 niños en edad escolar: queda demanda sin atender en la zona.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  commerce_poi_density_per_km2: {
    id: 'commerce_poi_density_per_km2',
    label: 'Densidad de comercio',
    unit: 'establecimientos/km²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Puntos de interés de categoría comercial de OpenStreetMap dentro del área, divididos por su superficie en km².',
    normalize: numericInput(linear(DENSITY_SCALES.commercePoi.min, DENSITY_SCALES.commercePoi.max)),
    sourceDatasetIds: [DATASET_IDS.osmPoi],
    caveat:
      'OpenStreetMap es colaborativo: está muy completo en ciudades grandes y menos en municipios pequeños. Una densidad baja puede significar poco comercio o poco mapeo.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n < 20)
        return `Hay unos ${formatNumber(n)} establecimientos comerciales por km²: poco comercio alrededor, o poco mapeado en OpenStreetMap.`;
      return `Hay unos ${formatNumber(n)} establecimientos comerciales por km²: indica actividad económica y flujo de gente.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  competitor_density_per_km2: {
    id: 'competitor_density_per_km2',
    label: 'Densidad de competidores del mismo tipo',
    unit: 'establecimientos/km²',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Puntos de interés de OpenStreetMap de la misma categoría que el negocio de la plantilla (farmacias, gimnasios, restaurantes…) dentro del área, divididos por su superficie en km².',
    normalize: numericInput(
      linearInverse(DENSITY_SCALES.competitors.min, DENSITY_SCALES.competitors.max),
    ),
    sourceDatasetIds: [DATASET_IDS.osmPoi],
    caveat:
      'Más competidores no siempre es peor: hay negocios que se benefician de agruparse. El peso de este indicador es editable justamente por eso.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n === 0)
        return 'No encontramos competidores del mismo tipo en esta zona según OpenStreetMap.';
      return `Hay unos ${formatNumber(n, 1)} negocios del mismo tipo por km². Ojo: en algunos giros la aglomeración atrae clientes, así que puedes bajarle el peso a este indicador.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  tourism_poi_density_per_km2: {
    id: 'tourism_poi_density_per_km2',
    label: 'Densidad de atractivos turísticos',
    unit: 'puntos/km²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Puntos de interés turísticos y recreativos de OpenStreetMap (miradores, atracciones, senderos, alojamientos) dentro del área, divididos por su superficie en km².',
    normalize: numericInput(linear(DENSITY_SCALES.tourismPoi.min, DENSITY_SCALES.tourismPoi.max)),
    sourceDatasetIds: [DATASET_IDS.osmPoi],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n === 0) return 'No hay atractivos turísticos mapeados en esta zona en OpenStreetMap.';
      return `Hay unos ${formatNumber(n, 1)} atractivos turísticos por km² alrededor.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  // ── Predial ────────────────────────────────────────────────────────────────
  parcel_density_per_km2: {
    id: 'parcel_density_per_km2',
    label: 'Densidad de predios',
    unit: 'predios/km²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Número de predios de la base catastral con centroide dentro del área, dividido por su superficie en km².',
    normalize: numericInput(linear(DENSITY_SCALES.parcels.min, DENSITY_SCALES.parcels.max)),
    sourceDatasetIds: [DATASET_IDS.igacParcel],
    caveat:
      'Depende de la cobertura catastral: en municipios de otro gestor catastral este dato no existe y se reporta como no disponible.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n < 50)
        return `Hay unos ${formatNumber(n)} predios por km²: predios grandes, patrón rural.`;
      return `Hay unos ${formatNumber(n)} predios por km²: tejido urbano consolidado o en consolidación.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  parcel_area_m2: {
    id: 'parcel_area_m2',
    label: 'Área del predio',
    unit: 'm²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Área de la geometría del predio calculada en EPSG:9377. Puede diferir del área reportada en los registros catastrales; la ficha muestra ambas. La escala por omisión es la de vivienda; los perfiles de bodega, colegio y agro usan su propia escala.',
    normalize: numericInput(linear(PARCEL_AREA_SCALES.housing.min, PARCEL_AREA_SCALES.housing.max)),
    sourceDatasetIds: [DATASET_IDS.igacParcel],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `El predio mide ${formatArea(n)} según su geometría catastral. Si el registro catastral reporta otra área, la ficha muestra las dos: la diferencia es normal y viene de cómo se levantó cada dato.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  built_area_m2: {
    id: 'built_area_m2',
    label: 'Área construida',
    unit: 'm²',
    direction: 'higher_is_better',
    valueType: 'number',
    formula: 'Suma del área construida de las construcciones que el catastro asocia al predio.',
    normalize: numericInput(linear(BUILT_AREA_SCALE.min, BUILT_AREA_SCALE.max)),
    sourceDatasetIds: [DATASET_IDS.igacBuilding],
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n === 0)
        return 'El catastro no registra construcciones en este predio: para el catastro es un lote.';
      return `El catastro registra ${formatArea(n)} construidos.`;
    }, 'El catastro no reporta área construida para este predio. Puede ser un lote o puede ser una construcción no registrada; no lo damos por hecho.'),
    flagFor: flagNeutral(),
    requiredFor: [],
  },

  large_parcels_count: {
    id: 'large_parcels_count',
    label: 'Predios grandes disponibles',
    unit: 'predios',
    direction: 'higher_is_better',
    valueType: 'number',
    formula:
      'Número de predios dentro del área cuya área de geometría supera el mínimo que pide la plantilla (por ejemplo 2.500 m² para un colegio) y cuyo destino económico catastral es lote o similar.',
    normalize: numericInput(linear(LARGE_PARCELS_SCALE.min, LARGE_PARCELS_SCALE.max)),
    sourceDatasetIds: [DATASET_IDS.igacParcel],
    caveat:
      '"Disponible" aquí significa "grande y con destino de lote en el catastro", no que esté en venta. El catastro no dice si un predio está en venta.',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      if (n === 0)
        return 'No hay predios del tamaño requerido en esta zona, así que habría que englobar varios o buscar en otra parte.';
      return `Hay ${formatNumber(n)} predios del tamaño requerido en la zona. Que sean grandes no quiere decir que estén en venta: el catastro no registra eso.`;
    }),
    flagFor: flagBelow({ cautionBelow: 1 }),
    requiredFor: [],
  },

  land_cadastral_value_per_m2: {
    id: 'land_cadastral_value_per_m2',
    label: 'Avalúo catastral por m² de terreno',
    unit: 'COP/m²',
    direction: 'lower_is_better',
    valueType: 'number',
    formula:
      'Mediana del avalúo catastral dividido por el área de terreno de los predios del área. Se usa solo como referencia relativa del costo del suelo entre zonas.',
    normalize: numericInput(
      linearInverse(CADASTRAL_VALUE_PER_M2_SCALE.cheap, CADASTRAL_VALUE_PER_M2_SCALE.expensive),
    ),
    sourceDatasetIds: [DATASET_IDS.igacParcel],
    glossaryId: 'avaluo_catastral',
    caveat:
      'El avalúo catastral es un valor fiscal, no el precio de venta. Sirve para comparar zonas entre sí, nunca como avalúo comercial (regla 5 de CLAUDE.md).',
    explain: explainer((value) => {
      const n = asNumber(value);
      if (n === null) return MISSING_DEFAULT;
      return `El avalúo catastral de la zona está alrededor de ${formatNumber(n)} pesos por m² de terreno. Cuidado: el avalúo catastral es un valor fiscal para calcular el impuesto predial, no el precio de venta. Lo usamos solo para comparar zonas entre sí.`;
    }),
    flagFor: flagNeutral(),
    requiredFor: [],
  },
};

/** Catálogo en el orden declarado. */
export const INDICATOR_LIST: readonly IndicatorDefinition[] = INDICATOR_IDS.map(
  (id) => INDICATORS[id],
);

const BY_ID = new Map<string, IndicatorDefinition>(INDICATOR_LIST.map((d) => [d.id, d]));

export function getIndicator(id: IndicatorId): IndicatorDefinition {
  return INDICATORS[id];
}

/** Búsqueda tolerante para identificadores que llegan de fuera (API, asistente). */
export function findIndicator(id: string): IndicatorDefinition | undefined {
  return BY_ID.get(id);
}

export function isIndicatorId(id: string): id is IndicatorId {
  return BY_ID.has(id);
}

/** Indicadores obligatorios para un uso: si falta alguno, el resultado es `sin_datos`. */
export function indicatorsRequiredFor(use: TargetUse): readonly IndicatorId[] {
  return INDICATOR_LIST.filter((d) => d.requiredFor.includes(use)).map((d) => d.id);
}

/** Texto de los puntos de corte de un indicador, para "¿Cómo se calcula?" y para los docs. */
export function describeIndicatorCutpoints(id: IndicatorId, override?: IndicatorOverride): string {
  const normalize = override?.normalize ?? INDICATORS[id].normalize;
  return describeNormalizer(normalize.spec);
}

// ─── Construcción del desglose por factor ─────────────────────────────────────

/**
 * Convierte un indicador y su valor crudo en el `FactorScore` del contrato compartido.
 * Toda salida del motor pasa por aquí: por eso ninguna respuesta puede traer un puntaje
 * sin su explicación, su fórmula, su fuente y su semáforo.
 */
export function toFactorScore(
  id: IndicatorId,
  value: IndicatorValue,
  weight: number,
  override?: IndicatorOverride,
): FactorScore {
  const def = INDICATORS[id];
  const normalize = override?.normalize ?? def.normalize;
  const explain = override?.explain ?? def.explain;
  const flagFor = override?.flagFor ?? def.flagFor;
  const score = value === null ? null : normalize(value);
  const rawValue: FactorScore['rawValue'] =
    value === null ? null : typeof value === 'boolean' ? String(value) : value;
  return {
    indicator: def.id,
    label: def.label,
    score,
    rawValue,
    unit: def.unit,
    weight,
    direction: override?.direction ?? def.direction,
    formula: override?.formula ?? def.formula,
    sourceDatasetIds: [...def.sourceDatasetIds],
    explanation: explain(value, score),
    flag: value === null ? 'unknown' : flagFor(value),
  };
}

/** Desglose de todos los indicadores de un conjunto de pesos, en el orden del catálogo. */
export function buildFactorScores(
  inputs: IndicatorInputs,
  weights: Readonly<Partial<Record<IndicatorId, number>>>,
  overrides: Readonly<Partial<Record<IndicatorId, IndicatorOverride>>> = {},
): FactorScore[] {
  const out: FactorScore[] = [];
  for (const id of INDICATOR_IDS) {
    const weight = weights[id];
    if (weight === undefined) continue;
    out.push(toFactorScore(id, readInput(inputs, id), weight, overrides[id]));
  }
  return out;
}
