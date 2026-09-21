<script setup lang="ts">
/**
 * Cobertura honesta (regla 6 de CLAUDE.md). Cuando el municipio no es jurisdicción del IGAC
 * o no tiene datos cargados, la interfaz lo dice con todas las letras y enumera lo que sí hay:
 * nunca un mapa vacío sin explicación.
 *
 * Los textos salen de `MESSAGES.coverage`, con `{manager}` y `{layers}` interpolados.
 */
import { computed } from 'vue';
import { DISCLAIMERS, MESSAGES, interpolate, type Coverage } from '@terracolombia/shared';
import GlossaryTerm from './GlossaryTerm.vue';

const props = defineProps<{ coverage: Coverage | null }>();

const status = computed(() => props.coverage?.status ?? 'unknown');
/** Solo se interrumpe al usuario cuando hay algo que advertir. */
const shouldShow = computed(() => status.value === 'none' || status.value === 'partial' || status.value === 'unknown');

const managerName = computed(
  () => props.coverage?.cadastralManager ?? 'otro gestor catastral',
);

const layersLabel = computed(() => {
  const layers = props.coverage?.availableLayers ?? [];
  if (layers.length === 0) return 'capas de contexto';
  if (layers.length === 1) return layers[0] ?? 'capas de contexto';
  return `${layers.slice(0, -1).join(', ')} y ${layers[layers.length - 1]}`;
});

const title = computed(() => {
  if (status.value === 'none') return MESSAGES.coverage.noneTitle;
  if (status.value === 'partial') return MESSAGES.coverage.partialTitle;
  return 'No sabemos aún qué cobertura tiene este municipio';
});

const body = computed(() => {
  if (status.value === 'none') {
    // El mensaje canónico ya explica qué sí hay: se interpola, no se reescribe.
    return interpolate(MESSAGES.coverage.noneBody, {
      manager: managerName.value,
      layers: layersLabel.value,
    });
  }
  if (status.value === 'partial') return MESSAGES.coverage.partialBody;
  return 'Todavía no tenemos registrado quién es el gestor catastral de este municipio. Mostramos únicamente lo que podemos respaldar con una fuente.';
});

const tone = computed(() =>
  status.value === 'none'
    ? 'border-amber-300 bg-amber-50 text-amber-950'
    : 'border-sky-300 bg-sky-50 text-sky-950',
);
</script>

<template>
  <aside
    v-if="shouldShow"
    class="rounded-lg border p-4"
    :class="tone"
    role="note"
    data-testid="coverage-notice"
  >
    <h3 class="text-sm font-semibold">{{ title }}</h3>
    <p class="mt-1 text-sm leading-relaxed">{{ body }}</p>

    <p v-if="coverage?.message" class="mt-1.5 text-sm">{{ coverage.message }}</p>

    <ul
      v-if="coverage && coverage.availableLayers.length > 0"
      class="mt-2 flex flex-wrap gap-1.5"
    >
      <li
        v-for="layer in coverage.availableLayers"
        :key="layer"
        class="rounded-full border border-black/20 bg-white/70 px-2.5 py-0.5 text-xs"
      >
        {{ layer }}
      </li>
    </ul>

    <p class="mt-2 text-xs opacity-90">
      <GlossaryTerm id="gestor_catastral" label="¿Qué es un gestor catastral?" />
    </p>

    <p class="mt-1 text-xs opacity-80">{{ DISCLAIMERS.coverage }}</p>
  </aside>
</template>
