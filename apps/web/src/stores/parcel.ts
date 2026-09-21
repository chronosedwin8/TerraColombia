/**
 * Ficha de predio (M2). Conserva ficha, contexto e historial junto con su `meta`,
 * porque sin procedencia la UI no puede mostrar ninguna cifra (regla 4).
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError, isAvailable, type ResponseMeta } from '@terracolombia/shared';
import { getParcel, getParcelContext, getParcelHistory } from '@/api/parcels';
import { emptyMeta } from '@/api/client';
import type { ParcelContextResponse, ParcelDetail, ParcelHistoryResponse } from '@/api/types';

export const useParcelStore = defineStore('parcel', () => {
  const npn = ref<string | null>(null);
  const detail = shallowRef<ParcelDetail | null>(null);
  const detailMeta = shallowRef<ResponseMeta>(emptyMeta());
  const context = shallowRef<ParcelContextResponse | null>(null);
  const contextMeta = shallowRef<ResponseMeta>(emptyMeta());
  /**
   * `GET /parcels/:npn/history` devuelve `{npn, cuts, changes, emptyReason}`, no un arreglo.
   * Guardarlo como lista dejaba `history.length` en `undefined` y la sección anunciaba
   * "undefined cambios entre cortes".
   */
  const history = shallowRef<ParcelHistoryResponse | null>(null);
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
  // `GET /parcels/:npn` devuelve el objeto PLANO: no existe `summary`. Leerlo así dejaba
  // toda la ficha sin renderizar, porque el bloque colgaba de un `v-else-if="summary"`.
  const hasCadastralValue = computed(() =>
    detail.value ? isAvailable(detail.value.cadastralValue) : false,
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
      history.value = null;
    }
  }

  function reset(): void {
    npn.value = null;
    detail.value = null;
    context.value = null;
    history.value = null;
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
