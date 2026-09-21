<script setup lang="ts">
/**
 * Control de capas: encender/apagar, ajustar opacidad y elegir la fecha de corte.
 *
 * Lo que no hace, a propósito: no oculta las capas que el plan no incluye. Las muestra
 * deshabilitadas y dice qué plan las trae, porque esconderlas deja al usuario sin saber
 * que existen.
 */
import { computed } from 'vue';
import type { TileLayer } from '@terracolombia/shared';
import { useEntitlements } from '@/composables/useEntitlements';
import { useMapStore } from '@/stores/map';
import { LAYER_GROUPS, layersByGroup, type LayerDefinition } from './layers';
import Legend from './Legend.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';

withDefaults(defineProps<{ showCutSelector?: boolean }>(), { showCutSelector: true });

const mapStore = useMapStore();
const { can, minPlanFor } = useEntitlements();

const groups = computed(() =>
  layersByGroup().filter((g) => g.layers.length > 0),
);

function isLocked(def: LayerDefinition): boolean {
  return def.requiresEntitlement !== null && !can(def.requiresEntitlement);
}

function lockHint(def: LayerDefinition): string {
  if (!def.requiresEntitlement) return '';
  return `Disponible desde el plan ${minPlanFor(def.requiresEntitlement) ?? 'Pro'}`;
}

function isOn(id: TileLayer): boolean {
  return mapStore.visibleLayers.includes(id);
}

function onToggle(def: LayerDefinition, event: Event): void {
  if (isLocked(def)) return;
  const checked = (event.target as HTMLInputElement).checked;
  mapStore.toggleLayer(def.id, checked);
}
</script>

<template>
  <div class="flex max-h-full flex-col gap-4 overflow-y-auto p-4" data-testid="layer-panel">
    <header class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">Capas del mapa</h2>
      <BaseButton variant="ghost" size="sm" @click="mapStore.resetLayers()">
        Restablecer
      </BaseButton>
    </header>

    <!-- Selector de corte temporal: toda cifra dice a qué fecha corresponde. -->
    <div v-if="showCutSelector" class="rounded-md border border-slate-200 bg-surface-muted p-3">
      <label for="cut-date" class="block text-xs font-medium text-slate-700">
        <GlossaryTerm id="snapshot" label="Fecha de corte" />
      </label>
      <select
        id="cut-date"
        class="tc-input mt-1"
        :value="mapStore.cutDate ?? ''"
        @change="mapStore.setCutDate(($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">Corte más reciente</option>
        <option v-for="date in mapStore.availableCutDates" :key="date" :value="date">
          {{ date }}
        </option>
      </select>
      <p v-if="mapStore.availableCutDates.length === 0" class="mt-1 text-[11px] text-slate-500">
        Los cortes disponibles aparecen al elegir un municipio.
      </p>
    </div>

    <section v-for="group in groups" :key="group.group">
      <h3 class="tc-label mb-1.5">{{ LAYER_GROUPS[group.group] }}</h3>

      <ul class="space-y-3">
        <li v-for="def in group.layers" :key="def.id">
          <div class="flex items-start gap-2">
            <input
              :id="`layer-${def.id}`"
              type="checkbox"
              class="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
              :checked="isOn(def.id)"
              :disabled="isLocked(def)"
              :aria-describedby="`layer-desc-${def.id}`"
              @change="onToggle(def, $event)"
            />
            <div class="min-w-0 flex-1">
              <label
                :for="`layer-${def.id}`"
                class="block text-sm font-medium"
                :class="isLocked(def) ? 'text-slate-400' : 'text-slate-800'"
              >
                {{ def.label }}
              </label>
              <p :id="`layer-desc-${def.id}`" class="text-xs leading-snug text-slate-500">
                {{ def.description }}
              </p>
              <p v-if="isLocked(def)" class="mt-0.5 text-xs font-medium text-amber-800">
                {{ lockHint(def) }}
              </p>

              <RangeSlider
                v-if="isOn(def.id) && !isLocked(def)"
                :model-value="mapStore.opacityOf(def.id)"
                :label="`Opacidad de ${def.label}`"
                :min="0.05"
                :max="1"
                :step="0.05"
                :display-value="`${Math.round(mapStore.opacityOf(def.id) * 100)} %`"
                @update:model-value="mapStore.setOpacity(def.id, $event)"
              />
            </div>
          </div>
        </li>
      </ul>
    </section>

    <div class="border-t border-slate-200 pt-3">
      <Legend :layers="mapStore.visibleLayers" :zoom="mapStore.zoom" />
    </div>
  </div>
</template>
