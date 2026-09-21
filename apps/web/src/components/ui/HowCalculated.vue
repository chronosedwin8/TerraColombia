<script setup lang="ts">
/**
 * "¿Cómo se calcula?" — la explicabilidad exigida en PLAN.md §9: fórmula, dirección
 * (más es mejor o peor), unidad y datasets que alimentan el indicador. Sin esto, un puntaje
 * es una caja negra y el producto no lo muestra.
 */
import { computed } from 'vue';
import { MESSAGES, type SourceRef } from '@terracolombia/shared';
import SourceBadge from './SourceBadge.vue';
import GlossaryTerm from './GlossaryTerm.vue';

const props = withDefaults(
  defineProps<{
    /** Fórmula legible, tal como la declara `packages/scoring`. */
    formula: string;
    /** 'higher_is_better' | 'lower_is_better' | 'categorical' */
    direction?: 'higher_is_better' | 'lower_is_better' | 'categorical';
    unit?: string | null;
    /** Explicación en lenguaje claro de por qué este indicador importa. */
    rationale?: string;
    sources?: SourceRef[];
    glossaryId?: string | null;
  }>(),
  {
    direction: undefined,
    unit: null,
    rationale: undefined,
    sources: () => [],
    glossaryId: null,
  },
);

const DIRECTION_LABEL = {
  higher_is_better: 'Cuanto más alto, mejor para este uso.',
  lower_is_better: 'Cuanto más bajo, mejor para este uso.',
  categorical: 'Es una categoría, no una escala: no se ordena de mejor a peor.',
} as const;

const directionLabel = computed(() =>
  props.direction ? DIRECTION_LABEL[props.direction] : null,
);
</script>

<template>
  <details class="rounded-md border border-slate-200 bg-surface-muted text-sm">
    <summary class="cursor-pointer list-none px-3 py-2 font-medium text-slate-700 hover:bg-slate-100">
      {{ MESSAGES.common.howCalculated }}
    </summary>

    <div class="space-y-2 border-t border-slate-200 px-3 py-2.5">
      <div>
        <p class="tc-label">Fórmula</p>
        <code class="mt-0.5 block whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-xs">{{ formula }}</code>
      </div>

      <p v-if="unit" class="text-xs text-slate-700">
        <span class="tc-label">Unidad:</span> {{ unit }}
      </p>

      <p v-if="directionLabel" class="text-xs text-slate-700">{{ directionLabel }}</p>

      <p v-if="rationale" class="text-xs leading-relaxed text-slate-700">{{ rationale }}</p>

      <p v-if="glossaryId" class="text-xs">
        <GlossaryTerm :id="glossaryId" />
      </p>

      <div v-if="sources.length > 0">
        <p class="tc-label">{{ MESSAGES.common.sources }}</p>
        <ul class="mt-1 flex flex-wrap gap-1.5">
          <li v-for="source in sources" :key="source.datasetId">
            <SourceBadge :source="source" compact />
          </li>
        </ul>
      </div>
    </div>
  </details>
</template>
