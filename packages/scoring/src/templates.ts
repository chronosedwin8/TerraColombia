/**
 * M6 — Plantillas de localización de negocio ("¿Dónde abro mi X?").
 *
 * Una plantilla dice **qué mirar** y **cuánto pesa cada cosa** para un tipo de negocio.
 * Los pesos son editables en vivo desde la interfaz: lo que trae el paquete es un punto de
 * partida razonado, no una verdad. Los filtros duros descartan celdas por motivos que no
 * se compensan con puntaje (un área protegida restrictiva no deja de serlo porque alrededor
 * haya mucha gente).
 *
 * El motor **no dice "abre en A"**: ordena celdas, muestra el desglose por factor y deja
 * que el usuario fije sus propios criterios (PLAN.md §9).
 */

import type { FactorScore } from '@terracolombia/shared';
import { H3_RES, formatNumber } from '@terracolombia/shared';
import {
  DISTANCE_SCALES,
  OVERLAP_INSIDE_PCT,
  RESTRICTIVE_PROTECTED_CATEGORIES,
  SLOPE_BLOCKER_PCT,
  asBoolean,
  asNumber,
  asText,
  findIndicator,
  readInput,
  type IndicatorId,
  type IndicatorInputs,
  type IndicatorOverride,
} from './indicators.js';
import { linear, normalizeCategoryKey, numericInput } from './normalize.js';

/** Resoluciones H3 admitidas por `LocationIntelSchema` de `@terracolombia/shared`. */
export type TemplateResolution = 7 | 8 | 9;

/** Vista mínima de una celda puntuada que necesita `explainRanking`. */
export interface RankedCellLike {
  h3: string;
  score: number | null;
  factors: FactorScore[];
  excluded: boolean;
}

export interface TemplateIndicatorWeight {
  indicator: IndicatorId;
  /** Peso por omisión. La interfaz lo cambia con un deslizador y todo se recalcula. */
  weight: number;
  /** Por qué este indicador y con ese peso. Se muestra junto al deslizador. */
  rationale: string;
  /** Ajuste de orientación si para este negocio el indicador significa otra cosa. */
  override?: IndicatorOverride;
}

export interface TemplateHardFilter {
  id: string;
  label: string;
  indicators: readonly IndicatorId[];
  /** Qué descarta y por qué, en español claro. */
  description: string;
  /** `true` descarta la celda, `false` la conserva, `null` no hay datos para decidir. */
  excludes: (inputs: IndicatorInputs) => boolean | null;
}

export interface BusinessTemplate {
  id: string;
  name: string;
  description: string;
  /** A quién le sirve esta plantilla. */
  audience: string;
  indicators: readonly TemplateIndicatorWeight[];
  hardFilters: readonly TemplateHardFilter[];
  /** Resolución H3 recomendada para este tipo de decisión. */
  recommendedResolution: TemplateResolution;
  /** Explica en español por qué el ranking quedó como quedó. */
  explainRanking: (cells: readonly RankedCellLike[]) => string;
}

// ─── Filtros duros reutilizables ──────────────────────────────────────────────

export const FILTER_PROTECTED_AREA: TemplateHardFilter = {
  id: 'protected_area_restrictive',
  label: 'Área protegida restrictiva',
  indicators: ['protected_area_overlap_pct', 'protected_area_category'],
  description:
    'Descarta las celdas que están dentro de un área protegida cuya categoría de manejo no admite usos ordinarios. Si no conocemos la categoría pero la celda está dentro, también se descarta.',
  excludes: (inputs) => {
    const overlap = asNumber(readInput(inputs, 'protected_area_overlap_pct'));
    if (overlap === null) return null;
    if (overlap <= OVERLAP_INSIDE_PCT) return false;
    const category = asText(readInput(inputs, 'protected_area_category'));
    if (category === null) return true;
    const key = normalizeCategoryKey(category);
    if (key === 'ninguna') return false;
    return RESTRICTIVE_PROTECTED_CATEGORIES.includes(key);
  },
};

export const FILTER_ETHNIC_TERRITORY: TemplateHardFilter = {
  id: 'ethnic_territory',
  label: 'Territorio étnico',
  indicators: ['ethnic_territory_overlap_pct'],
  description:
    'Descarta las celdas dentro de resguardos indígenas o territorios colectivos de comunidades negras: allí la tierra es colectiva y cualquier proyecto exige consulta previa con la autoridad étnica.',
  excludes: (inputs) => {
    const overlap = asNumber(readInput(inputs, 'ethnic_territory_overlap_pct'));
    if (overlap === null) return null;
    return overlap > OVERLAP_INSIDE_PCT;
  },
};

export const FILTER_PROTECTION_POT: TemplateHardFilter = {
  id: 'pot_protection_soil',
  label: 'Suelo de protección en el POT',
  indicators: ['pot_classification'],
  description:
    'Descarta las celdas cuyo POT clasifica el suelo como de protección: no es urbanizable por norma.',
  excludes: (inputs) => {
    const value = asText(readInput(inputs, 'pot_classification'));
    if (value === null) return null;
    return normalizeCategoryKey(value) === 'suelo_de_proteccion';
  },
};

export const FILTER_HIGH_FLOOD: TemplateHardFilter = {
  id: 'high_flood_hazard',
  label: 'Amenaza alta de inundación',
  indicators: ['hazard_flood_level'],
  description:
    'Descarta las celdas con amenaza alta o muy alta de inundación. Es una capa de escala regional: orienta, no reemplaza el estudio hidrológico de detalle.',
  excludes: (inputs) => {
    const value = asText(readInput(inputs, 'hazard_flood_level'));
    if (value === null) return null;
    const key = normalizeCategoryKey(value);
    return key === 'alta' || key === 'muy_alta';
  },
};

export function filterMaxSlope(maxPct: number): TemplateHardFilter {
  return {
    id: `max_slope_${maxPct}`,
    label: `Pendiente mayor al ${maxPct} %`,
    indicators: ['slope_mean_pct'],
    description: `Descarta las celdas cuya pendiente media supera el ${maxPct} %: construir ahí es inviable o desproporcionadamente costoso para este negocio.`,
    excludes: (inputs) => {
      const slope = asNumber(readInput(inputs, 'slope_mean_pct'));
      if (slope === null) return null;
      return slope > maxPct;
    },
  };
}

export const FILTER_INSIDE_URBAN_PERIMETER: TemplateHardFilter = {
  id: 'inside_urban_perimeter',
  label: 'Fuera del perímetro urbano',
  indicators: ['inside_urban_perimeter'],
  description:
    'Descarta las celdas fuera del perímetro urbano: este negocio vive del flujo peatonal y de los servicios públicos urbanos.',
  excludes: (inputs) => {
    const inside = asBoolean(readInput(inputs, 'inside_urban_perimeter'));
    if (inside === null) return null;
    return !inside;
  },
};

export function filterMinLargeParcels(min: number): TemplateHardFilter {
  return {
    id: `min_large_parcels_${min}`,
    label: `Sin predios grandes disponibles`,
    indicators: ['large_parcels_count'],
    description: `Descarta las celdas sin al menos ${min} predio(s) del tamaño que exige este uso. "Grande" no quiere decir "en venta": el catastro no registra eso.`,
    excludes: (inputs) => {
      const count = asNumber(readInput(inputs, 'large_parcels_count'));
      if (count === null) return null;
      return count < min;
    },
  };
}

export function filterMinPopulationDensity(min: number): TemplateHardFilter {
  return {
    id: `min_population_density_${min}`,
    label: `Menos de ${formatNumber(min)} hab/km²`,
    indicators: ['population_density_per_km2'],
    description: `Descarta las celdas con menos de ${formatNumber(
      min,
    )} habitantes por km² según el censo 2018: por debajo de eso no hay mercado de barrio.`,
    excludes: (inputs) => {
      const density = asNumber(readInput(inputs, 'population_density_per_km2'));
      if (density === null) return null;
      return density < min;
    },
  };
}

// ─── Ajustes de orientación específicos de plantilla ──────────────────────────

/**
 * Para abrir una IPS interesa lo contrario que para comprar vivienda: cuanto más lejos
 * esté la IPS más cercana, más población desatendida hay. Se invierte la orientación y se
 * declara aquí, en vez de esconderlo en un peso negativo.
 */
const HEALTH_GAP_OVERRIDE: IndicatorOverride = {
  normalize: numericInput(
    linear(DISTANCE_SCALES.healthFacility.best, DISTANCE_SCALES.healthFacility.worst),
  ),
  direction: 'higher_is_better',
  formula:
    'Distancia a la IPS más cercana, puntuada al revés que en la ficha de predio: aquí estar lejos de la oferta existente es la oportunidad, porque señala población sin servicio cerca.',
  explain: (value) => {
    const n = asNumber(value);
    if (n === null) return 'No sabemos a qué distancia está la IPS más cercana.';
    if (n >= DISTANCE_SCALES.healthFacility.caution)
      return `La IPS más cercana está a ${formatNumber(
        n / 1000,
        1,
      )} km: es una zona con poca oferta de salud cerca, que es justo lo que busca esta plantilla.`;
    return `Ya hay una IPS a ${formatNumber(n)} m: la oferta de salud en esta zona está cubierta.`;
  },
  flagFor: () => 'ok',
  rationale: 'Una IPS nueva rinde donde no hay otra, no al lado de la que ya existe.',
};

// ─── Explicación del ranking ──────────────────────────────────────────────────

/** Cuántas celdas del tope se miran para explicar el ranking. */
export const TOP_CELLS_FOR_EXPLANATION = 20;
/** Proporción del total que se considera "el tope" cuando hay muchas celdas. */
export const TOP_CELLS_FRACTION = 0.1;
/** Cuántos factores se nombran en la explicación. */
export const RANKING_DRIVERS_SHOWN = 3;

export interface RankingDriver {
  indicator: string;
  label: string;
  weight: number;
  /** Promedio del factor en las celdas del tope. */
  topMean: number;
  /** Promedio del factor en todas las celdas evaluadas. */
  overallMean: number;
  /** `(topMean - overallMean) * weight`: cuánto explica este factor la diferencia. */
  influence: number;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((acc, v) => acc + v, 0);
  return total / values.length;
}

/** Qué factores separan a las mejores celdas del resto. Puro y determinista. */
export function rankingDrivers(cells: readonly RankedCellLike[]): RankingDriver[] {
  const included = cells.filter((c) => !c.excluded && c.score !== null);
  if (included.length === 0) return [];
  const topCount = Math.max(
    1,
    Math.min(TOP_CELLS_FOR_EXPLANATION, Math.ceil(included.length * TOP_CELLS_FRACTION)),
  );
  const top = included.slice(0, topCount);

  const byIndicator = new Map<string, { label: string; weight: number }>();
  for (const cell of included) {
    for (const f of cell.factors) {
      if (!byIndicator.has(f.indicator)) {
        byIndicator.set(f.indicator, { label: f.label, weight: f.weight });
      }
    }
  }

  const drivers: RankingDriver[] = [];
  for (const [indicator, meta] of byIndicator) {
    const topScores = collectScores(top, indicator);
    const allScores = collectScores(included, indicator);
    const topMean = mean(topScores);
    const overallMean = mean(allScores);
    if (topMean === null || overallMean === null) continue;
    drivers.push({
      indicator,
      label: meta.label,
      weight: meta.weight,
      topMean: Math.round(topMean * 10) / 10,
      overallMean: Math.round(overallMean * 10) / 10,
      influence: Math.round((topMean - overallMean) * meta.weight * 100) / 100,
    });
  }

  // Orden determinista: mayor influencia primero y, a igualdad, por identificador.
  drivers.sort((a, b) => b.influence - a.influence || a.indicator.localeCompare(b.indicator));
  return drivers;
}

function collectScores(cells: readonly RankedCellLike[], indicator: string): number[] {
  const out: number[] = [];
  for (const cell of cells) {
    for (const f of cell.factors) {
      if (f.indicator === indicator && f.score !== null) out.push(f.score);
    }
  }
  return out;
}

const NOT_A_RECOMMENDATION =
  'Esto no es una recomendación: es un orden según los pesos que están puestos ahora. Cámbialos y el mapa se recalcula. La decisión, y los criterios, son tuyos.';

export function defaultExplainRanking(
  template: Pick<BusinessTemplate, 'name'>,
): (cells: readonly RankedCellLike[]) => string {
  return (cells) => {
    const included = cells.filter((c) => !c.excluded && c.score !== null);
    const excluded = cells.length - included.length;
    if (included.length === 0) {
      return `Ninguna celda del área quedó evaluable para la plantilla "${template.name}": o las descartaron los filtros duros, o faltan los datos necesarios. ${NOT_A_RECOMMENDATION}`;
    }
    const drivers = rankingDrivers(cells).slice(0, RANKING_DRIVERS_SHOWN);
    const positivos = drivers.filter((d) => d.influence > 0);
    const nombres =
      positivos.length > 0
        ? positivos.map(
            (d) =>
              `${d.label.toLowerCase()} (${formatNumber(d.topMean)} frente a ${formatNumber(d.overallMean)} de promedio)`,
          )
        : [];
    const parteFactores =
      nombres.length > 0
        ? `Las mejores celdas se separan del resto sobre todo por ${listToText(nombres)}.`
        : 'Las mejores celdas no se separan del resto por ningún factor en particular: los puntajes están muy parejos.';
    const parteExcluidas =
      excluded > 0
        ? ` Se descartaron ${formatNumber(excluded)} celdas por los filtros duros de la plantilla o por falta de datos obligatorios.`
        : '';
    return `Se evaluaron ${formatNumber(included.length)} celdas con la plantilla "${
      template.name
    }". ${parteFactores}${parteExcluidas} ${NOT_A_RECOMMENDATION}`;
  };
}

function listToText(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const head = items.slice(0, -1).join(', ');
  const tail = items.at(-1) ?? '';
  return `${head} y ${tail}`;
}

// ─── Catálogo de plantillas ───────────────────────────────────────────────────

function template(t: Omit<BusinessTemplate, 'explainRanking'>): BusinessTemplate {
  return { ...t, explainRanking: defaultExplainRanking(t) };
}

export const BUSINESS_TEMPLATES: Record<string, BusinessTemplate> = {
  /**
   * Plantilla exigida por el plan (PLAN.md §1.3, M6): población en edad escolar, oferta
   * existente del MEN como competencia, predios grandes disponibles y accesibilidad.
   */
  colegio: template({
    id: 'colegio',
    name: 'Colegio',
    description:
      'Busca zonas con muchos niños en edad escolar, poca oferta educativa ya instalada, predios grandes donde quepa la sede y acceso seguro para llegar todos los días.',
    audience: 'Colegios privados, cajas de compensación, secretarías de educación y fundaciones.',
    recommendedResolution: H3_RES.COARSE,
    indicators: [
      {
        indicator: 'school_age_population',
        weight: 0.28,
        rationale: 'Es la demanda: sin niños en la zona no hay colegio que sostener.',
      },
      {
        indicator: 'school_seats_per_100_school_age',
        weight: 0.22,
        rationale:
          'La oferta existente reportada al MEN es la competencia directa. Menos cupos por niño, más demanda sin atender.',
      },
      {
        indicator: 'large_parcels_count',
        weight: 0.18,
        rationale:
          'Un colegio necesita lote: sin predios grandes en la zona, la mejor demanda del mundo no sirve.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.14,
        rationale: 'Los estudiantes tienen que llegar todos los días, y muchos caminando.',
      },
      {
        indicator: 'population_density_per_km2',
        weight: 0.08,
        rationale: 'Densidad alta significa más familias a distancia caminable.',
      },
      {
        indicator: 'distance_paved_road_m',
        weight: 0.06,
        rationale: 'Vía pavimentada cerca permite ruta escolar y acceso en invierno.',
      },
      {
        indicator: 'hazard_flood_level',
        weight: 0.04,
        rationale: 'Una sede educativa inundable pierde clases y pone en riesgo a los niños.',
      },
    ],
    hardFilters: [
      FILTER_PROTECTED_AREA,
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTION_POT,
      filterMaxSlope(25),
      filterMinLargeParcels(1),
    ],
  }),

  retail_barrio: template({
    id: 'retail_barrio',
    name: 'Tienda de barrio',
    description:
      'Busca esquinas de barrio con mucha gente viviendo cerca, actividad comercial alrededor y poca competencia inmediata.',
    audience: 'Comerciantes independientes y cadenas de tiendas de proximidad.',
    recommendedResolution: H3_RES.FINE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.3,
        rationale: 'Una tienda de barrio vive de los vecinos a menos de cinco minutos a pie.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.2,
        rationale: 'Donde ya hay comercio hay flujo de gente y costumbre de comprar ahí.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.15,
        rationale:
          'Demasiadas tiendas iguales reparten la misma clientela. Si crees que la aglomeración te conviene, bájale el peso.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.15,
        rationale: 'Accesibilidad para el abastecimiento y para el cliente que pasa.',
      },
      {
        indicator: 'inside_urban_perimeter',
        weight: 0.1,
        rationale: 'Servicios públicos y norma urbana que permite el uso comercial.',
      },
      {
        indicator: 'parcel_density_per_km2',
        weight: 0.1,
        rationale: 'Muchos predios pequeños es tejido urbano consolidado: hay locales.',
      },
    ],
    hardFilters: [FILTER_INSIDE_URBAN_PERIMETER, FILTER_ETHNIC_TERRITORY, FILTER_PROTECTED_AREA],
  }),

  supermercado: template({
    id: 'supermercado',
    name: 'Supermercado',
    description:
      'Busca zonas con población suficiente para sostener una superficie mediana, con acceso vehicular, local grande disponible y suelo no demasiado caro.',
    audience: 'Cadenas de supermercados y superetes en expansión.',
    recommendedResolution: H3_RES.COARSE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.26,
        rationale: 'El área de influencia de un supermercado se mide en hogares cercanos.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.18,
        rationale:
          'Hace falta acceso vehicular para el cliente y para el camión de abastecimiento.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.16,
        rationale: 'La competencia de formato similar reparte el mismo gasto de los hogares.',
      },
      {
        indicator: 'large_parcels_count',
        weight: 0.14,
        rationale: 'Una superficie con bodega y parqueadero necesita lote grande.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.1,
        rationale: 'Un entorno comercial activo señala centralidad de barrio.',
      },
      {
        indicator: 'distance_paved_road_m',
        weight: 0.08,
        rationale: 'La logística de abastecimiento exige vía pavimentada.',
      },
      {
        indicator: 'land_cadastral_value_per_m2',
        weight: 0.08,
        rationale:
          'Referencia relativa del costo del suelo entre zonas. Es avalúo catastral, no precio de venta.',
      },
    ],
    hardFilters: [
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTED_AREA,
      FILTER_PROTECTION_POT,
      FILTER_HIGH_FLOOD,
      filterMinLargeParcels(1),
    ],
  }),

  farmacia: template({
    id: 'farmacia',
    name: 'Farmacia / droguería',
    description:
      'Busca zonas pobladas, con comercio alrededor y cerca de prestadores de salud, donde todavía no haya muchas droguerías.',
    audience: 'Cadenas de droguerías y farmacéuticos independientes.',
    recommendedResolution: H3_RES.FINE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.28,
        rationale: 'La droguería es compra de proximidad y de urgencia.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.2,
        rationale: 'El flujo comercial del entorno arrastra ventas.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.2,
        rationale: 'Muchas droguerías en la misma cuadra es el escenario típico de canibalización.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.12,
        rationale: 'Visibilidad y acceso desde la malla vial del barrio.',
      },
      {
        indicator: 'distance_health_facility_m',
        weight: 0.12,
        rationale:
          'Estar cerca de una IPS trae recetas: aquí la cercanía suma, a diferencia de la plantilla de clínicas.',
      },
      {
        indicator: 'inside_urban_perimeter',
        weight: 0.08,
        rationale: 'Norma urbana y servicios públicos.',
      },
    ],
    hardFilters: [FILTER_INSIDE_URBAN_PERIMETER, FILTER_ETHNIC_TERRITORY, FILTER_PROTECTED_AREA],
  }),

  clinica_ips: template({
    id: 'clinica_ips',
    name: 'Clínica o IPS',
    description:
      'Busca población desatendida: zonas con gente y sin prestadores de salud cerca, con lote disponible y acceso para ambulancias.',
    audience: 'Prestadores de servicios de salud, EPS y secretarías de salud.',
    recommendedResolution: H3_RES.COARSE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.24,
        rationale: 'La población de referencia es la base del cálculo de demanda en salud.',
      },
      {
        indicator: 'distance_health_facility_m',
        weight: 0.2,
        rationale:
          'Aquí se invierte la orientación: lejos de la IPS existente hay población sin servicio cerca.',
        override: HEALTH_GAP_OVERRIDE,
      },
      {
        indicator: 'road_access_index',
        weight: 0.16,
        rationale: 'Tiempo de llegada de pacientes y de ambulancias.',
      },
      {
        indicator: 'large_parcels_count',
        weight: 0.12,
        rationale: 'Una sede con urgencias y parqueadero necesita lote.',
      },
      {
        indicator: 'distance_paved_road_m',
        weight: 0.1,
        rationale: 'Acceso confiable todo el año.',
      },
      {
        indicator: 'parcel_density_per_km2',
        weight: 0.08,
        rationale: 'Tejido urbano consolidado alrededor de la sede.',
      },
      {
        indicator: 'hazard_flood_level',
        weight: 0.06,
        rationale:
          'Un servicio de salud tiene que seguir funcionando precisamente en la emergencia.',
      },
      {
        indicator: 'land_cadastral_value_per_m2',
        weight: 0.04,
        rationale:
          'Referencia relativa del costo del suelo. Es avalúo catastral, no precio de venta.',
      },
    ],
    hardFilters: [
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTED_AREA,
      FILTER_PROTECTION_POT,
      FILTER_HIGH_FLOOD,
      filterMaxSlope(25),
    ],
  }),

  bodega_logistica: template({
    id: 'bodega_logistica',
    name: 'Bodega logística',
    description:
      'Busca terreno grande y plano sobre corredores viales primarios, con suelo relativamente barato y sin riesgo de inundación.',
    audience: 'Operadores logísticos, distribuidores y desarrolladores industriales.',
    // Resolución gruesa: una decisión logística se toma a escala de corredor, no de cuadra.
    recommendedResolution: 7,
    indicators: [
      {
        indicator: 'distance_primary_road_m',
        weight: 0.28,
        rationale: 'La conexión con la troncal define el costo de cada viaje durante 20 años.',
      },
      {
        indicator: 'large_parcels_count',
        weight: 0.2,
        rationale: 'Sin lotes grandes disponibles no hay proyecto posible.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.16,
        rationale: 'Malla vial capaz de soportar tractomulas.',
      },
      {
        indicator: 'slope_mean_pct',
        weight: 0.12,
        rationale: 'Una bodega necesita plataforma plana; nivelar cuesta mucho.',
      },
      {
        indicator: 'land_cadastral_value_per_m2',
        weight: 0.1,
        rationale:
          'El suelo es el insumo principal de un proyecto logístico. Referencia catastral, no precio de venta.',
      },
      {
        indicator: 'distance_municipal_seat_m',
        weight: 0.08,
        rationale: 'Cerca de la cabecera hay mano de obra y servicios.',
      },
      {
        indicator: 'hazard_flood_level',
        weight: 0.06,
        rationale: 'Una bodega inundada es inventario perdido.',
      },
    ],
    hardFilters: [
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTED_AREA,
      FILTER_PROTECTION_POT,
      FILTER_HIGH_FLOOD,
      filterMaxSlope(15),
      filterMinLargeParcels(1),
    ],
  }),

  restaurante: template({
    id: 'restaurante',
    name: 'Restaurante',
    description:
      'Busca zonas con gente, vida comercial y flujo de visitantes, midiendo también cuántos restaurantes hay ya en la misma cuadra.',
    audience: 'Restauranteros independientes y cadenas de comida.',
    recommendedResolution: H3_RES.FINE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.24,
        rationale: 'Residentes cercanos son la clientela de todos los días.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.24,
        rationale: 'El entorno comercial genera el flujo de almuerzo y de fin de semana.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.14,
        rationale:
          'En restaurantes la aglomeración a veces ayuda (zonas gastronómicas). Ajusta este peso según tu apuesta.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.12,
        rationale: 'Acceso, visibilidad y posibilidad de domicilios.',
      },
      {
        indicator: 'tourism_poi_density_per_km2',
        weight: 0.12,
        rationale: 'Los atractivos turísticos traen comensales que no viven en el barrio.',
      },
      {
        indicator: 'inside_urban_perimeter',
        weight: 0.08,
        rationale: 'Norma urbana y servicios públicos.',
      },
      {
        indicator: 'parcel_density_per_km2',
        weight: 0.06,
        rationale: 'Tejido consolidado con locales comerciales disponibles.',
      },
    ],
    hardFilters: [FILTER_ETHNIC_TERRITORY, FILTER_PROTECTED_AREA],
  }),

  gimnasio: template({
    id: 'gimnasio',
    name: 'Gimnasio',
    description:
      'Busca barrios densos con poder de arrastre comercial y sin gimnasios saturando la zona.',
    audience: 'Cadenas de gimnasios y entrenadores que abren sede propia.',
    recommendedResolution: H3_RES.FINE,
    indicators: [
      {
        indicator: 'population_density_per_km2',
        weight: 0.3,
        rationale: 'La afiliación a un gimnasio se decide por cercanía a la casa o al trabajo.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.22,
        rationale: 'Un gimnasio cada dos cuadras reparte la misma base de afiliados.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.16,
        rationale: 'Las zonas comerciales concentran el paso diario.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.14,
        rationale: 'Llegar rápido es lo que sostiene la asistencia.',
      },
      {
        indicator: 'inside_urban_perimeter',
        weight: 0.1,
        rationale: 'Norma urbana y servicios públicos.',
      },
      {
        indicator: 'land_cadastral_value_per_m2',
        weight: 0.08,
        rationale:
          'Un gimnasio ocupa muchos metros cuadrados: el costo del suelo pesa. Referencia catastral, no precio de venta.',
      },
    ],
    hardFilters: [FILTER_INSIDE_URBAN_PERIMETER, FILTER_ETHNIC_TERRITORY, FILTER_PROTECTED_AREA],
  }),

  vivienda_vis: template({
    id: 'vivienda_vis',
    name: 'Proyecto de vivienda VIS',
    description:
      'Busca suelo disponible y asequible, seguro, con equipamientos de educación y salud alcanzables, para un proyecto de vivienda de interés social.',
    audience: 'Constructoras, cajas de compensación y entidades de vivienda.',
    recommendedResolution: H3_RES.COARSE,
    indicators: [
      {
        indicator: 'large_parcels_count',
        weight: 0.22,
        rationale: 'Un proyecto VIS necesita globos de terreno, no lotes sueltos.',
      },
      {
        indicator: 'land_cadastral_value_per_m2',
        weight: 0.2,
        rationale:
          'El precio tope de la VIS hace que el costo del suelo sea determinante. Es avalúo catastral, sirve para comparar zonas, no como precio de venta.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.14,
        rationale: 'Conexión con la ciudad: sin ella la vivienda se desocupa.',
      },
      {
        indicator: 'distance_school_m',
        weight: 0.1,
        rationale: 'Los equipamientos educativos son condición de calidad de vida del proyecto.',
      },
      {
        indicator: 'slope_mean_pct',
        weight: 0.1,
        rationale: 'La pendiente encarece la urbanización y el proyecto VIS no tiene margen.',
      },
      {
        indicator: 'hazard_flood_level',
        weight: 0.08,
        rationale: 'La vivienda social no puede quedar en zona inundable.',
      },
      {
        indicator: 'pot_classification',
        weight: 0.08,
        rationale: 'Sin suelo urbano o de expansión no hay licencia.',
      },
      {
        indicator: 'distance_health_facility_m',
        weight: 0.08,
        rationale: 'Acceso a servicios de salud para las familias del proyecto.',
      },
    ],
    hardFilters: [
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTED_AREA,
      FILTER_PROTECTION_POT,
      FILTER_HIGH_FLOOD,
      filterMaxSlope(25),
      filterMinLargeParcels(1),
    ],
  }),

  hotel: template({
    id: 'hotel',
    name: 'Hotel',
    description:
      'Busca zonas con atractivos turísticos alrededor, buen acceso y una oferta hotelera que no esté saturada.',
    audience: 'Cadenas hoteleras, hoteles boutique y alojamientos rurales.',
    recommendedResolution: H3_RES.COARSE,
    indicators: [
      {
        indicator: 'tourism_poi_density_per_km2',
        weight: 0.26,
        rationale: 'El huésped viaja por lo que hay alrededor, no por la habitación.',
      },
      {
        indicator: 'road_access_index',
        weight: 0.14,
        rationale: 'Llegar tiene que ser fácil y seguro.',
      },
      {
        indicator: 'distance_paved_road_m',
        weight: 0.12,
        rationale: 'El último tramo destapado espanta reservas.',
      },
      {
        indicator: 'distance_municipal_seat_m',
        weight: 0.12,
        rationale: 'Cerca de la cabecera hay servicios, personal y conectividad.',
      },
      {
        indicator: 'competitor_density_per_km2',
        weight: 0.12,
        rationale: 'Una oferta hotelera saturada baja la ocupación y la tarifa.',
      },
      {
        indicator: 'commerce_poi_density_per_km2',
        weight: 0.1,
        rationale: 'Restaurantes y comercio alrededor completan la experiencia.',
      },
      {
        indicator: 'protected_area_overlap_pct',
        weight: 0.08,
        rationale:
          'Estar dentro de un área protegida restringe la construcción; tenerla al lado, en cambio, es el atractivo.',
      },
      {
        indicator: 'elevation_mean_m',
        weight: 0.06,
        rationale: 'El clima, que depende de la altura, define la temporada y el tipo de huésped.',
      },
    ],
    hardFilters: [
      FILTER_ETHNIC_TERRITORY,
      FILTER_PROTECTED_AREA,
      FILTER_PROTECTION_POT,
      filterMaxSlope(35),
    ],
  }),
};

export const TEMPLATE_IDS = Object.keys(BUSINESS_TEMPLATES);
export const TEMPLATE_LIST: readonly BusinessTemplate[] = TEMPLATE_IDS.map((id) => {
  const t = BUSINESS_TEMPLATES[id];
  if (!t) throw new Error(`Plantilla inconsistente: ${id}`);
  return t;
});

export function getTemplate(id: string): BusinessTemplate | undefined {
  return BUSINESS_TEMPLATES[id];
}

/** Pesos por omisión de una plantilla, listos para `applyWeightOverrides`. */
export function templateWeights(t: BusinessTemplate): Partial<Record<IndicatorId, number>> {
  const out: Partial<Record<IndicatorId, number>> = {};
  for (const entry of t.indicators) out[entry.indicator] = entry.weight;
  return out;
}

export function templateOverrides(
  t: BusinessTemplate,
): Partial<Record<IndicatorId, IndicatorOverride>> {
  const out: Partial<Record<IndicatorId, IndicatorOverride>> = {};
  for (const entry of t.indicators) {
    if (entry.override) out[entry.indicator] = entry.override;
  }
  return out;
}

/** Datasets que necesita la plantilla: alimenta el bloque `meta.sources[]` de la API. */
export function templateSourceDatasetIds(t: BusinessTemplate): string[] {
  const ids = new Set<string>();
  for (const entry of t.indicators) {
    const def = findIndicator(entry.indicator);
    if (!def) continue;
    for (const dataset of def.sourceDatasetIds) ids.add(dataset);
  }
  for (const filter of t.hardFilters) {
    for (const indicator of filter.indicators) {
      const def = findIndicator(indicator);
      if (!def) continue;
      for (const dataset of def.sourceDatasetIds) ids.add(dataset);
    }
  }
  return [...ids].sort();
}

/** Comprueba la coherencia de una plantilla. Se ejecuta en los tests. */
export function auditTemplate(t: BusinessTemplate): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of t.indicators) {
    if (!findIndicator(entry.indicator)) {
      problems.push(`${t.id}: "${entry.indicator}" no existe en el catálogo de indicadores.`);
    }
    if (seen.has(entry.indicator)) {
      problems.push(`${t.id}: el indicador "${entry.indicator}" está repetido.`);
    }
    seen.add(entry.indicator);
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      problems.push(`${t.id}: peso inválido en "${entry.indicator}".`);
    }
    if (entry.rationale.trim().length === 0) {
      problems.push(`${t.id}: falta la justificación de "${entry.indicator}".`);
    }
  }
  if (t.indicators.length === 0) problems.push(`${t.id}: no tiene indicadores.`);
  if (![7, 8, 9].includes(t.recommendedResolution)) {
    problems.push(`${t.id}: resolución H3 fuera de las admitidas (7, 8 o 9).`);
  }
  return problems;
}

/** Bloqueo por pendiente usado en los filtros: se reexporta para la documentación. */
export const TEMPLATE_SLOPE_HARD_LIMIT_PCT = SLOPE_BLOCKER_PCT;
