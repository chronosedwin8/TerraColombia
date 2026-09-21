<script setup lang="ts">
/**
 * Leyenda del mapa. Solo lista las capas que de verdad se están pintando al zoom actual:
 * una leyenda que promete algo que no se ve es tan mala como un mapa vacío sin explicación.
 */
import { computed } from 'vue';
import type { TileLayer } from '@terracolombia/shared';
import { LAYER_BY_ID, type LayerDefinition } from './layers';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';

const props = withDefaults(
  defineProps<{
    /** Capas activas y visibles al zoom actual. */
    layers: TileLayer[];
    zoom: number;
    compact?: boolean;
  }>(),
  { compact: false },
);

const definitions = computed<LayerDefinition[]>(() =>
  props.layers.map((id) => LAYER_BY_ID[id]).filter((d): d is LayerDefinition => Boolean(d)),
);

/** Capas encendidas pero fuera de su rango de zoom: se explica por qué no se ven. */
const outOfZoom = computed(() =>
  definitions.value.filter((d) => props.zoom < d.minZoom || props.zoom > d.maxZoom),
);

const visible = computed(() =>
  definitions.value.filter((d) => props.zoom >= d.minZoom && props.zoom <= d.maxZoom),
);
</script>

<template>
  <div class="text-xs" data-testid="map-legend">
    <p class="tc-label mb-1.5">Leyenda</p>

    <ul v-if="visible.length > 0" class="space-y-2">
      <li v-for="def in visible" :key="def.id">
        <p class="flex items-center gap-1.5 font-medium text-slate-800">
          <GlossaryTerm v-if="def.glossaryId" :id="def.glossaryId" :label="def.label" />
          <span v-else>{{ def.label }}</span>
          <span v-if="def.unit" class="font-normal text-slate-500">({{ def.unit }})</span>
        </p>
        <ul class="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
          <li v-for="item in def.legend" :key="item.label" class="flex items-center gap-1.5">
            <span
              class="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/20"
              :style="{ backgroundColor: item.color }"
              aria-hidden="true"
            />
            <span class="text-slate-700">{{ item.label }}</span>
          </li>
        </ul>
        <p v-if="!compact" class="mt-0.5 text-[11px] text-slate-500">
          {{ def.sourceLabel }} · {{ def.license }}
        </p>
      </li>
    </ul>

    <p v-else class="text-slate-500">No hay capas visibles en este nivel de acercamiento.</p>

    <p
      v-if="outOfZoom.length > 0"
      class="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
    >
      Acerca más el mapa para ver:
      {{ outOfZoom.map((d) => d.label).join(', ') }}.
    </p>
  </div>
</template>
