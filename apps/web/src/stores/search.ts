/**
 * Buscador universal. Mantiene el término, los resultados y el historial reciente.
 * La consulta se dispara con retardo (300 ms) para no castigar al backend por cada tecla.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError } from '@terracolombia/shared';
import { isNpnCandidate, looksLikeAddress, normalizeNpnInput } from '@terracolombia/geo';
import { search as searchApi } from '@/api/search';
import type { ResponseMeta } from '@terracolombia/shared';
import type { SearchResultItem } from '@/api/types';
import { emptyMeta } from '@/api/client';

const MAX_RECENT = 8;

export const useSearchStore = defineStore('search', () => {
  const term = ref('');
  const results = shallowRef<SearchResultItem[]>([]);
  /**
   * Por qué la búsqueda no devolvió nada, en palabras. La API siempre lo explica —un código
   * postal, un DIVIPOLA inexistente, una dirección en un municipio sin predios cargados— y
   * mostrarlo es mejor que una lista vacía y muda (regla 6 de CLAUDE.md).
   */
  const emptyReason = ref<string | null>(null);
  const meta = shallowRef<ResponseMeta>(emptyMeta());
  const isLoading = ref(false);
  const error = shallowRef<AppError | null>(null);
  const recent = ref<Array<{ label: string; term: string }>>([]);

  let controller: AbortController | null = null;

  /** Pista para la UI: muestra un icono distinto según lo que parece el término. */
  const guessedKind = computed<'npn' | 'address' | 'coordinates' | 'text'>(() => {
    const raw = term.value.trim();
    if (raw.length === 0) return 'text';
    if (isNpnCandidate(normalizeNpnInput(raw))) return 'npn';
    if (/^-?\d{1,2}[.,]\d+\s*,\s*-?\d{1,3}[.,]\d+$/.test(raw)) return 'coordinates';
    if (looksLikeAddress(raw)) return 'address';
    return 'text';
  });

  async function run(query: string, muniCode?: string): Promise<void> {
    const trimmed = query.trim();
    term.value = query;
    if (trimmed.length < 2) {
      results.value = [];
      error.value = null;
      return;
    }

    controller?.abort();
    controller = new AbortController();
    isLoading.value = true;
    error.value = null;

    try {
      const response = await searchApi(trimmed, {
        ...(muniCode ? { muniCode } : {}),
        signal: controller.signal,
      });
      // `GET /search` devuelve `{query, results, emptyReason}`, no un array. Asignar el
      // sobre entero dejaba `results.length` en `undefined`, así que la comparación con 0
      // era falsa y el buscador mostraba siempre el estado vacío.
      results.value = response.data.results;
      emptyReason.value = response.data.emptyReason;
      meta.value = response.meta;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos buscar');
      results.value = [];
      emptyReason.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  function remember(result: SearchResultItem): void {
    const entry = { label: result.label, term: result.label };
    recent.value = [entry, ...recent.value.filter((r) => r.term !== entry.term)].slice(0, MAX_RECENT);
  }

  function clear(): void {
    controller?.abort();
    term.value = '';
    results.value = [];
    error.value = null;
  }

  return {
    term,
    results,
    emptyReason,
    meta,
    isLoading,
    error,
    recent,
    guessedKind,
    run,
    remember,
    clear,
  };
});
