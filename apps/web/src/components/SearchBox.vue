<script setup lang="ts">
/**
 * Caja de búsqueda universal. Es *la* entrada al producto: dirección, código predial de 30 o
 * 20 dígitos, municipio, topónimo o `lat,lng`.
 *
 * Accesibilidad: patrón combobox de WAI-ARIA (`role="combobox"` + `listbox`), navegación con
 * flechas y Enter, y un `aria-live` que anuncia cuántos resultados hay.
 */
import { computed, ref, watch } from 'vue';
import { MESSAGES } from '@terracolombia/shared';
import { formatNpnPretty } from '@terracolombia/geo';
import { useSearchStore } from '@/stores/search';
import { useDebounceFn } from '@/composables/useDebounce';
import type { SearchResult } from '@/api/types';

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    /** Limita la búsqueda a un municipio (usado dentro de una ficha). */
    muniCode?: string;
    autofocus?: boolean;
    size?: 'md' | 'lg';
  }>(),
  {
    placeholder: 'Busca una dirección, un código predial, un municipio o un lugar',
    muniCode: undefined,
    autofocus: false,
    size: 'md',
  },
);

const emit = defineEmits<{ (e: 'select', result: SearchResult): void }>();

const store = useSearchStore();
const input = ref('');
const open = ref(false);
const activeIndex = ref(-1);

const debouncedSearch = useDebounceFn((value: string) => {
  void store.run(value, props.muniCode);
}, 300);

watch(input, (value) => {
  activeIndex.value = -1;
  open.value = value.trim().length >= 2;
  debouncedSearch.run(value);
});

const KIND_LABELS: Record<SearchResult['kind'], string> = {
  parcel: 'Predio',
  municipality: 'Municipio',
  department: 'Departamento',
  address: 'Dirección',
  place: 'Lugar',
  coordinates: 'Coordenadas',
};

const HINT_BY_GUESS: Record<'npn' | 'address' | 'coordinates' | 'text', string> = {
  npn: 'Parece un código predial. Aceptamos 30 dígitos y el formato anterior de 20.',
  address: 'Parece una dirección. Entendemos Cra/Kr/Carrera, Cl/Calle, Bis y Sur.',
  coordinates: 'Parece un par de coordenadas (latitud, longitud).',
  text: '',
};

const hint = computed(() => HINT_BY_GUESS[store.guessedKind]);

/** Los predios se muestran con el NPN agrupado: 30 dígitos seguidos no se leen. */
function labelFor(result: SearchResult): string {
  if (result.kind !== 'parcel') return result.label;
  try {
    return formatNpnPretty(result.id);
  } catch {
    return result.label;
  }
}

function choose(result: SearchResult): void {
  store.remember(result);
  input.value = result.label;
  open.value = false;
  activeIndex.value = -1;
  emit('select', result);
}

function onKeydown(event: KeyboardEvent): void {
  const results = store.results;
  if (event.key === 'Escape') {
    open.value = false;
    return;
  }
  if (results.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    open.value = true;
    activeIndex.value = (activeIndex.value + 1) % results.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + results.length) % results.length;
  } else if (event.key === 'Enter') {
    const result = activeIndex.value >= 0 ? results[activeIndex.value] : results[0];
    if (result) {
      event.preventDefault();
      choose(result);
    }
  }
}
</script>

<template>
  <div class="relative">
    <label for="tc-search" class="sr-only">Buscar en TerraColombia</label>

    <div class="relative">
      <svg
        class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>

      <input
        id="tc-search"
        v-model="input"
        type="search"
        role="combobox"
        aria-controls="tc-search-results"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-activedescendant="activeIndex >= 0 ? `tc-search-option-${activeIndex}` : undefined"
        :placeholder="placeholder"
        :autofocus="autofocus"
        class="tc-input pl-10 pr-24"
        :class="size === 'lg' ? 'py-3.5 text-base' : ''"
        autocomplete="off"
        @keydown="onKeydown"
      />

      <span
        v-if="store.isLoading"
        class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"
      >
        {{ MESSAGES.common.loading }}
      </span>
    </div>

    <p v-if="hint" class="mt-1 text-xs text-slate-500">{{ hint }}</p>

    <p class="sr-only" aria-live="polite">
      {{ store.results.length }} resultados para «{{ store.term }}».
    </p>

    <ul
      v-if="open && store.results.length > 0"
      id="tc-search-results"
      role="listbox"
      class="absolute left-0 right-0 top-full z-modal mt-1 max-h-80 overflow-y-auto rounded-md
        border border-slate-200 bg-white py-1 shadow-panel"
    >
      <li
        v-for="(result, index) in store.results"
        :id="`tc-search-option-${index}`"
        :key="`${result.kind}-${result.id}`"
        role="option"
        :aria-selected="index === activeIndex"
        class="cursor-pointer px-3 py-2 text-sm"
        :class="index === activeIndex ? 'bg-brand-50' : 'hover:bg-surface-muted'"
        @click="choose(result)"
        @mouseenter="activeIndex = index"
      >
        <p class="flex items-baseline gap-2">
          <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
            {{ KIND_LABELS[result.kind] }}
          </span>
          <span class="truncate font-medium">{{ labelFor(result) }}</span>
        </p>
        <p v-if="result.sublabel" class="mt-0.5 truncate text-xs text-slate-500">
          {{ result.sublabel }}
        </p>
      </li>
    </ul>

    <!-- Estado vacío honesto: se dice qué se buscó y qué formatos se aceptan. -->
    <div
      v-else-if="open && !store.isLoading && store.term.trim().length >= 2"
      class="absolute left-0 right-0 top-full z-modal mt-1 rounded-md border border-slate-200
        bg-white px-3 py-3 text-sm shadow-panel"
    >
      <p class="font-medium">{{ MESSAGES.errors.notFound }}</p>
      <p class="mt-0.5 text-xs text-slate-600">
        Revisa la escritura o prueba con el municipio y el barrio. Si buscas un predio por código,
        debe tener 30 dígitos (o 20 en el formato anterior).
      </p>
      <p v-if="store.error" class="mt-1 text-xs text-rose-700">{{ store.error.message }}</p>
    </div>
  </div>
</template>
