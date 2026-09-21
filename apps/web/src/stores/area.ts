/**
 * Analizador de zona (M4). Permite hasta **cuatro** zonas comparadas lado a lado (§10.2.4).
 * Si el backend responde con un trabajo en cola, el seguimiento por SSE lo hace la vista
 * con `useJob`; aquí solo se guarda el resultado final y su procedencia.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  AREA_ANALYSIS_HARD_LIMIT_KM2,
  AppError,
  type AreaAnalyze,
  type AreaScope,
  type ResponseMeta,
} from '@terracolombia/shared';
import { approxAreaKm2, radiusToPolygon } from '@terracolombia/geo';
import { analyzeArea } from '@/api/areas';
import { isJobHandle } from '@/api/jobs';
import { emptyMeta } from '@/api/client';
import type { AreaAnalysisResult, JobHandle } from '@/api/types';

export const MAX_COMPARED_AREAS = 4;

export interface ComparedArea {
  /** Identificador local estable, independiente del backend. */
  key: string;
  label: string;
  scope: AreaScope;
  result: AreaAnalysisResult | null;
  meta: ResponseMeta;
  isLoading: boolean;
  error: AppError | null;
  jobId: string | null;
}

let seq = 0;

export const useAreaStore = defineStore('area', () => {
  const areas = ref<ComparedArea[]>([]);
  const activeKey = ref<string | null>(null);

  const active = computed(() => areas.value.find((a) => a.key === activeKey.value) ?? null);
  const canAddMore = computed(() => areas.value.length < MAX_COMPARED_AREAS);
  const isComparing = computed(() => areas.value.length > 1);

  /** Área aproximada del ámbito, para avisar antes de enviar algo desproporcionado. */
  function scopeAreaKm2(scope: AreaScope): number | null {
    if (scope.kind === 'polygon') return approxAreaKm2(scope.geometry);
    if (scope.kind === 'radius') {
      return approxAreaKm2(radiusToPolygon(scope.center, scope.radiusM));
    }
    // Municipio e isócrona: el tamaño lo conoce el backend.
    return null;
  }

  function add(scope: AreaScope, label?: string): string | null {
    if (!canAddMore.value) return null;
    seq += 1;
    const key = `zona-${seq}`;
    areas.value = [
      ...areas.value,
      {
        key,
        label: label ?? `Zona ${areas.value.length + 1}`,
        scope,
        result: null,
        meta: emptyMeta(),
        isLoading: false,
        error: null,
        jobId: null,
      },
    ];
    activeKey.value = key;
    return key;
  }

  function remove(key: string): void {
    areas.value = areas.value.filter((a) => a.key !== key);
    if (activeKey.value === key) activeKey.value = areas.value[0]?.key ?? null;
  }

  function clear(): void {
    areas.value = [];
    activeKey.value = null;
  }

  function patch(key: string, changes: Partial<ComparedArea>): void {
    areas.value = areas.value.map((a) => (a.key === key ? { ...a, ...changes } : a));
  }

  /**
   * Lanza el análisis. Devuelve el `JobHandle` cuando el backend lo encoló,
   * para que la vista abra el seguimiento por SSE.
   */
  async function analyze(
    key: string,
    sections: AreaAnalyze['sections'] = [],
    cutDate?: string,
  ): Promise<JobHandle | null> {
    const area = areas.value.find((a) => a.key === key);
    if (!area) return null;

    const km2 = scopeAreaKm2(area.scope);
    if (km2 !== null && km2 > AREA_ANALYSIS_HARD_LIMIT_KM2) {
      patch(key, { error: AppError.areaTooLarge(km2, AREA_ANALYSIS_HARD_LIMIT_KM2) });
      return null;
    }

    patch(key, { isLoading: true, error: null, jobId: null });
    try {
      const body: AreaAnalyze = {
        scope: area.scope,
        sections,
        ...(cutDate ? { cutDate } : {}),
      };
      const response = await analyzeArea(body);
      if (isJobHandle(response.data)) {
        patch(key, { jobId: response.data.jobId, isLoading: true });
        return response.data;
      }
      patch(key, { result: response.data, meta: response.meta, isLoading: false });
      return null;
    } catch (e) {
      patch(key, {
        isLoading: false,
        error: e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos analizar la zona'),
      });
      return null;
    }
  }

  /** Recibe el resultado que llegó por el stream del trabajo. */
  function settleFromJob(key: string, result: AreaAnalysisResult, meta?: ResponseMeta): void {
    patch(key, { result, isLoading: false, jobId: null, ...(meta ? { meta } : {}) });
  }

  return {
    areas,
    activeKey,
    active,
    canAddMore,
    isComparing,
    scopeAreaKm2,
    add,
    remove,
    clear,
    patch,
    analyze,
    settleFromJob,
  };
});
