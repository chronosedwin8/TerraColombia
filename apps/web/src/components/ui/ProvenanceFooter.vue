<script setup lang="ts">
/**
 * Pie de procedencia de un bloque de datos.
 *
 * **Regla 4 de CLAUDE.md**: sin procedencia no se muestra la cifra. Por eso este componente
 * expone dos comportamientos y ningún punto medio:
 *  - con `sources`: lista fuente, dataset, fecha de corte y licencia, y añade la atribución
 *    obligatoria del IGAC cuando alguna fuente es catastral;
 *  - sin `sources`: **no** pinta un pie vacío; pinta un aviso de que el dato no puede mostrarse.
 *    El contenido del slot por defecto queda oculto en ese caso.
 */
import { computed } from 'vue';
import { MESSAGES, type ResponseMeta, type SourceRef } from '@terracolombia/shared';
import SourceBadge from './SourceBadge.vue';

const props = withDefaults(
  defineProps<{
    /** Fuentes del bloque. Normalmente `meta.sources`. */
    sources?: SourceRef[];
    /** Alternativa: pasar la `meta` completa de la respuesta. */
    meta?: ResponseMeta;
    /** Avisos de la respuesta (`meta.warnings`). */
    warnings?: string[];
    compact?: boolean;
  }>(),
  { sources: undefined, meta: undefined, warnings: undefined, compact: false },
);

const allSources = computed<SourceRef[]>(() => props.sources ?? props.meta?.sources ?? []);
const hasProvenance = computed(() => allSources.value.length > 0);
const allWarnings = computed<string[]>(() => props.warnings ?? props.meta?.warnings ?? []);

/** Atribución textual obligatoria cuando hay datos catastrales del IGAC. */
const igacLine = computed(() => {
  const igac = allSources.value.find(
    (s) => s.source.toUpperCase() === 'IGAC' && s.license.toUpperCase().includes('BY-SA'),
  );
  if (!igac) return null;
  return igac.attribution;
});
</script>

<template>
  <!-- Con procedencia: se muestra el contenido y su pie de fuentes. -->
  <div v-if="hasProvenance" data-testid="provenance-footer">
    <slot />

    <footer
      class="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-snug text-slate-600"
      data-testid="provenance-sources"
    >
      <p class="tc-label mb-1">
        {{ allSources.length === 1 ? MESSAGES.common.source : MESSAGES.common.sources }}
      </p>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="source in allSources" :key="source.datasetId">
          <SourceBadge :source="source" :compact="compact" />
        </li>
      </ul>

      <p v-if="igacLine" class="mt-1.5 font-medium" data-testid="igac-attribution">
        {{ igacLine }}
      </p>

      <ul v-if="allWarnings.length > 0" class="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-800">
        <li v-for="(warning, index) in allWarnings" :key="index">{{ warning }}</li>
      </ul>
    </footer>
  </div>

  <!-- Sin procedencia: el dato no se muestra. Se explica por qué, sin inventar nada. -->
  <div
    v-else
    class="rounded-md border border-dashed border-slate-300 bg-surface-muted p-3 text-sm text-slate-600"
    data-testid="provenance-missing"
    role="note"
  >
    <p class="font-medium text-slate-800">{{ MESSAGES.common.notAvailable }}</p>
    <p class="mt-0.5 text-xs">
      No mostramos cifras sin declarar su fuente, su fecha de corte y su licencia. Esta respuesta
      llegó sin esa información, así que preferimos no mostrar un número.
    </p>
  </div>
</template>
