/**
 * Consulta de permisos por plan. Es la misma fuente que usan el router (`requiresEntitlement`)
 * y los botones deshabilitados, para que nunca se ofrezca algo que el plan no incluye.
 */
import { computed } from 'vue';
import { PLANS, type Entitlements } from '@terracolombia/shared';
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

  return { entitlements, can, labelFor, minPlanFor, maxAnalysisAreaKm2, credits };
}
