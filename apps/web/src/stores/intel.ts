/**
 * Localización de negocio (M6). El usuario elige una plantilla, mueve los pesos y el mapa
 * de calor se recalcula. Los pesos siempre se renormalizan para que sumen 1: así el puntaje
 * es comparable entre configuraciones y el desglose por factor tiene sentido.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError, type AreaScope, type LocationIntel, type ResponseMeta } from '@terracolombia/shared';
import { getIntelTemplates, runLocationIntel } from '@/api/intel';
import { isJobHandle } from '@/api/jobs';
import { emptyMeta } from '@/api/client';
import type { JobHandle, LocationIntelResult, LocationIntelTemplate } from '@/api/types';

export const useIntelStore = defineStore('intel', () => {
  const templates = shallowRef<LocationIntelTemplate[]>([]);
  const templatesMeta = shallowRef<ResponseMeta>(emptyMeta());
  const isLoadingTemplates = ref(false);

  const templateId = ref<string | null>(null);
  const weights = ref<Record<string, number>>({});
  const resolution = ref<7 | 8 | 9>(8);
  const scope = shallowRef<AreaScope | null>(null);

  const result = shallowRef<LocationIntelResult | null>(null);
  const meta = shallowRef<ResponseMeta>(emptyMeta());
  const isRunning = ref(false);
  const error = shallowRef<AppError | null>(null);

  const template = computed(
    () => templates.value.find((t) => t.id === templateId.value) ?? null,
  );

  /** Pesos normalizados 0–1 que suman 1. Es lo que se envía y lo que se muestra en los sliders. */
  const normalizedWeights = computed<Record<string, number>>(() => {
    const entries = Object.entries(weights.value).filter(([, w]) => Number.isFinite(w) && w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) return {};
    return Object.fromEntries(entries.map(([k, w]) => [k, w / total]));
  });

  async function loadTemplates(): Promise<void> {
    if (templates.value.length > 0) return;
    isLoadingTemplates.value = true;
    try {
      const response = await getIntelTemplates();
      templates.value = response.data;
      templatesMeta.value = response.meta;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cargar las plantillas');
    } finally {
      isLoadingTemplates.value = false;
    }
  }

  /** Selecciona plantilla y carga sus pesos por omisión (el usuario puede moverlos luego). */
  function selectTemplate(id: string): void {
    templateId.value = id;
    const found = templates.value.find((t) => t.id === id);
    if (!found) return;
    weights.value = Object.fromEntries(found.indicators.map((i) => [i.key, i.defaultWeight]));
    result.value = null;
  }

  function setWeight(key: string, value: number): void {
    weights.value = { ...weights.value, [key]: Math.min(1, Math.max(0, value)) };
  }

  function resetWeights(): void {
    if (template.value) selectTemplate(template.value.id);
  }

  async function run(): Promise<JobHandle | null> {
    if (!templateId.value || !scope.value) return null;
    isRunning.value = true;
    error.value = null;
    try {
      const body: LocationIntel = {
        templateId: templateId.value,
        scope: scope.value,
        resolution: resolution.value,
        weights: normalizedWeights.value,
        limit: 1000,
      };
      const response = await runLocationIntel(body);
      if (isJobHandle(response.data)) return response.data;
      result.value = response.data;
      meta.value = response.meta;
      return null;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos calcular el mapa de calor');
      return null;
    } finally {
      isRunning.value = false;
    }
  }

  function settleFromJob(next: LocationIntelResult, nextMeta?: ResponseMeta): void {
    result.value = next;
    if (nextMeta) meta.value = nextMeta;
    isRunning.value = false;
  }

  return {
    templates,
    templatesMeta,
    isLoadingTemplates,
    templateId,
    template,
    weights,
    normalizedWeights,
    resolution,
    scope,
    result,
    meta,
    isRunning,
    error,
    loadTemplates,
    selectTemplate,
    setWeight,
    resetWeights,
    run,
    settleFromJob,
  };
});
