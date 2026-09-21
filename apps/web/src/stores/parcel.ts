/**
 * Ficha de predio (M2). Conserva ficha, contexto e historial junto con su `meta`,
 * porque sin procedencia la UI no puede mostrar ninguna cifra (regla 4).
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError, isAvailable, type ParcelContext, type ResponseMeta } from '@terracolombia/shared';
import { getParcel, getParcelContext, getParcelHistory } from '@/api/parcels';
import { emptyMeta } from '@/api/client';
import type { ParcelDetail, ParcelHistoryEntry } from '@/api/types';

export const useParcelStore = defineStore('parcel', () => {
  const npn = ref<string | null>(null);
  const detail = shallowRef<ParcelDetail | null>(null);
  const detailMeta = shallowRef<ResponseMeta>(emptyMeta());
  const context = shallowRef<ParcelContext | null>(null);
  const contextMeta = shallowRef<ResponseMeta>(emptyMeta());
  const history = shallowRef<ParcelHistoryEntry[]>([]);
  const historyMeta = shallowRef<ResponseMeta>(emptyMeta());

  const contextRadiusM = ref(1000);
  const isLoading = ref(false);
  const isLoadingContext = ref(false);
  const error = shallowRef<AppError | null>(null);

  /** Cobertura del municipio: decide si se muestra `CoverageNotice` en lugar de la ficha. */
  const coverage = computed(() => detailMeta.value.coverage ?? null);
  const isSynthetic = computed(
    () => detailMeta.value.synthetic || contextMeta.value.synthetic || historyMeta.value.synthetic,
  );
  /** Solo se advierte del avalúo cuando realmente hay una cifra que advertir. */
  const hasCadastralValue = computed(() =>
    detail.value ? isAvailable(detail.value.summary.cadastralValue) : false,
  );

  async function load(nextNpn: string, cutDate?: string): Promise<void> {
    npn.value = nextNpn;
    isLoading.value = true;
    error.value = null;
    try {
      const response = await getParcel(nextNpn, cutDate);
      detail.value = response.data;
      detailMeta.value = response.meta;
    } catch (e) {
      detail.value = null;
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cargar la ficha');
    } finally {
      isLoading.value = false;
    }
  }

  async function loadContext(radiusM = contextRadiusM.value): Promise<void> {
    if (!npn.value) return;
    contextRadiusM.value = radiusM;
    isLoadingContext.value = true;
    try {
      const response = await getParcelContext(npn.value, radiusM);
      context.value = response.data;
      contextMeta.value = response.meta;
    } catch (e) {
      context.value = null;
      // El contexto es complementario: su fallo no borra la ficha.
      if (e instanceof AppError && e.code !== 'NOT_FOUND') error.value = e;
    } finally {
      isLoadingContext.value = false;
    }
  }

  async function loadHistory(): Promise<void> {
    if (!npn.value) return;
    try {
      const response = await getParcelHistory(npn.value);
      history.value = response.data;
      historyMeta.value = response.meta;
    } catch {
      history.value = [];
    }
  }

  function reset(): void {
    npn.value = null;
    detail.value = null;
    context.value = null;
    history.value = [];
    detailMeta.value = emptyMeta();
    contextMeta.value = emptyMeta();
    historyMeta.value = emptyMeta();
    error.value = null;
  }

  return {
    npn,
    detail,
    detailMeta,
    context,
    contextMeta,
    history,
    historyMeta,
    contextRadiusM,
    isLoading,
    isLoadingContext,
    error,
    coverage,
    isSynthetic,
    hasCadastralValue,
    load,
    loadContext,
    loadHistory,
    reset,
  };
});
