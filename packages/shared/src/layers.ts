import type { PlanCode } from './plans.js';
import type { TileLayer } from './constants.js';

/**
 * Rangos de zoom y plan mínimo de cada capa de teselas.
 *
 * Por qué vive aquí y no en cada extremo: el servidor decide a qué zooms sirve una capa y qué
 * plan exige, y el cliente decide a qué zooms la ofrece y cuándo pinta el candado. Estuvieron
 * duplicados y divergieron, con dos consecuencias que el usuario ve y que nada delata:
 *
 * - `soil_unit` y `pot_zone` exigen plan Pro en el servidor, pero el cliente las ofrecía como
 *   gratuitas: la casilla se dejaba marcar, la tesela respondía 403 y no aparecía nada ni
 *   ningún mensaje. Es justo lo que prohíbe la regla 6 (cobertura honesta).
 * - El cliente anunciaba capas en zooms donde el servidor no sirve nada (`hazard` desde el 5
 *   cuando el servidor empieza en el 7), así que la leyenda las listaba como activas sobre un
 *   mapa vacío.
 *
 * Los dos lados importan esta tabla, de modo que ya no pueden discrepar. Lo que NO está aquí
 * es el contenido editorial —nombre, descripción, leyenda, glosario—, que es de la semilla, ni
 * el estilo de pintado, que es del cliente.
 */
export interface LayerServingRules {
  /** Zoom mínimo al que la capa tiene sentido y el servidor la sirve. */
  minZoom: number;
  maxZoom: number;
  /** Plan mínimo que da acceso a la capa. */
  minPlan: PlanCode;
}

export const LAYER_RULES: Readonly<Record<TileLayer, LayerServingRules>> = {
  department: { minZoom: 0, maxZoom: 22, minPlan: 'free' },
  municipality: { minZoom: 4, maxZoom: 22, minPlan: 'free' },
  parcel: { minZoom: 14, maxZoom: 22, minPlan: 'free' },
  building: { minZoom: 15, maxZoom: 22, minPlan: 'free' },
  block: { minZoom: 12, maxZoom: 22, minPlan: 'free' },
  sector: { minZoom: 10, maxZoom: 22, minPlan: 'free' },
  // La malla H3 se agrega en resoluciones 8 y 9; por encima del 16 el hexágono es más grande
  // que la pantalla y el predio individual ya está disponible.
  h3: { minZoom: 6, maxZoom: 16, minPlan: 'free' },
  school: { minZoom: 10, maxZoom: 22, minPlan: 'free' },
  health_facility: { minZoom: 10, maxZoom: 22, minPlan: 'free' },
  road: { minZoom: 10, maxZoom: 22, minPlan: 'free' },
  protected_area: { minZoom: 5, maxZoom: 22, minPlan: 'free' },
  hazard: { minZoom: 7, maxZoom: 22, minPlan: 'free' },
  soil_unit: { minZoom: 8, maxZoom: 22, minPlan: 'pro' },
  pot_zone: { minZoom: 11, maxZoom: 22, minPlan: 'pro' },
};

/** Orden de los planes, de menor a mayor alcance. Sirve para comparar con el plan mínimo. */
const PLAN_ORDER: readonly PlanCode[] = [
  'free',
  'per_report',
  'pro',
  'business',
  'api',
  'enterprise',
];

/**
 * ¿El plan alcanza para ver la capa? Es la misma comparación que hace la ruta de teselas
 * antes de responder 403, para que el candado de la interfaz no prometa lo que el servidor
 * va a negar.
 */
export function planAllowsLayer(plan: PlanCode, layer: TileLayer): boolean {
  const needed = LAYER_RULES[layer].minPlan;
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(needed);
}
