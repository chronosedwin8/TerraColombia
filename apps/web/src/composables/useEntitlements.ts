/**
 * Consulta de permisos por plan. Es la misma fuente que usan el router (`requiresEntitlement`)
 * y los botones deshabilitados, para que nunca se ofrezca algo que el plan no incluye.
 */
import { computed } from 'vue';
import {
  LAYER_RULES,
  PLANS,
  planAllowsLayer,
  type Entitlements,
  type PlanCode,
  type TileLayer,
} from '@terracolombia/shared';
import { useAuthStore } from '@/stores/auth';

/** Claves booleanas de `Entitlements`: lo que se puede pedir como permiso. */
export type EntitlementFlag = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

const FLAG_LABELS: Record<EntitlementFlag, string> = {
  canExport: 'Exportar resultados',
  canUseAdvancedSearch: 'Buscador avanzado de predios',
  canUseAreaAnalysis: 'Analizador de zona',
  canUseSuitability: 'Aptitud de terreno',
  canUseLocationIntel: 'Localización de negocio',
  canUseChangeDetection: 'Cambio territorial',
  canUseApi: 'GeoAPI y llaves',
  canUseWhiteLabel: 'Marca blanca',
  canUseAlerts: 'Alertas',
  canUseBulk: 'Lotes de informes',
  watermark: 'Marca de agua',
};

export function useEntitlements() {
  const auth = useAuthStore();

  const entitlements = computed<Entitlements>(() => auth.entitlements);

  function can(flag: EntitlementFlag): boolean {
    return entitlements.value[flag] === true;
  }

  function labelFor(flag: EntitlementFlag): string {
    return FLAG_LABELS[flag];
  }

  /** Plan más barato que incluye el permiso: lo que se ofrece en el aviso de mejora. */
  function minPlanFor(flag: EntitlementFlag): string | null {
    const order = ['free', 'per_report', 'pro', 'business', 'api', 'enterprise'] as const;
    for (const code of order) {
      if (PLANS[code].entitlements[flag] === true) return PLANS[code].name;
    }
    return null;
  }

  const maxAnalysisAreaKm2 = computed(() => entitlements.value.maxAnalysisAreaKm2);
  const credits = computed(() => auth.user?.credits ?? 0);

  /** Plan actual. Sin sesión se asume el gratuito, que es lo que sirve la API a un anónimo. */
  const plan = computed<PlanCode>(() => auth.user?.plan ?? 'free');

  /**
   * ¿El plan actual alcanza para ver esta capa del mapa?
   *
   * Consulta la misma tabla que usa la ruta de teselas antes de responder 403. Antes el
   * panel decidía con un campo propio que había divergido del servidor, así que ofrecía
   * `soil_unit` y `pot_zone` como gratuitas: la casilla se dejaba marcar, la tesela venía
   * con 403 y no aparecía ni el dato ni una explicación.
   */
  function canSeeLayer(layer: TileLayer): boolean {
    return planAllowsLayer(plan.value, layer);
  }

  /** Nombre del plan que hace falta para ver la capa, para el aviso de mejora. */
  function planNameForLayer(layer: TileLayer): string {
    return PLANS[LAYER_RULES[layer].minPlan].name;
  }

  return {
    entitlements,
    can,
    labelFor,
    minPlanFor,
    maxAnalysisAreaKm2,
    credits,
    plan,
    canSeeLayer,
    planNameForLayer,
  };
}
