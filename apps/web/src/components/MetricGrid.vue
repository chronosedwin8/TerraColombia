<script setup lang="ts">
/**
 * Rejilla de métricas de un tablero. Traduce las `MetricRow` que arma la vista a `DataValue`,
 * resolviendo qué fuentes respaldan cada fila: si una fila no declara datasets, `DataValue`
 * se encarga de no mostrar el número (regla 4).
 */
import { computed } from 'vue';
import type { Maybe, SourceRef } from '@terracolombia/shared';
import type { MetricRow } from '@/types/metric';
import DataValue from '@/components/ui/DataValue.vue';
import ExplainButton from '@/components/ui/ExplainButton.vue';

const props = withDefaults(
  defineProps<{
    metrics: MetricRow[];
    /** Todas las fuentes de la respuesta; se filtran por `sourceDatasetIds` de cada fila. */
    sources: SourceRef[];
    columns?: 1 | 2 | 3;
    /** Añade el botón "Explícame esto" a cada métrica. */
    explainable?: boolean;
  }>(),
  { columns: 2, explainable: false },
);

const byDataset = computed(() => {
  const map = new Map<string, SourceRef>();
  for (const source of props.sources) map.set(source.datasetId, source);
  return map;
});

function sourcesFor(metric: MetricRow): SourceRef[] {
  return metric.sourceDatasetIds
    .map((id) => byDataset.value.get(id))
    .filter((s): s is SourceRef => Boolean(s));
}

/** Heurística de formato: si trae unidad monetaria o de área, se usa el formateador adecuado. */
function formatFor(metric: MetricRow): 'text' | 'number' | 'area' | 'distance' | 'currency' | 'percent' {
  if (typeof metric.value === 'string') return 'text';
  const unit = (metric.unit ?? '').toLowerCase();
  if (unit.includes('cop') || unit.includes('peso')) return 'currency';
  if (unit === 'm²' || unit === 'm2' || unit === 'ha') return 'area';
  if (unit === 'm' || unit === 'km') return 'distance';
  if (unit === '%') return 'percent';
  return 'number';
}

/** `MetricRow.value` puede ser null; `DataValue` lo muestra como "No disponible". */
function valueOf(metric: MetricRow): Maybe<number | string> {
  return metric.value;
}

const gridClass = computed(() =>
  props.columns === 1
    ? 'grid-cols-1'
    : props.columns === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2',
);
</script>

<template>
  <div class="grid gap-x-6 gap-y-1" :class="gridClass" data-testid="metric-grid">
    <div v-for="metric in metrics" :key="metric.key">
      <DataValue
        :label="metric.label"
        :value="valueOf(metric)"
        :sources="sourcesFor(metric)"
        :format="formatFor(metric)"
        :unit="metric.unit ?? undefined"
        :hint="metric.note"
      />
      <ExplainButton
        v-if="explainable"
        :subject="`metrica:${metric.key}`"
        :payload="{ label: metric.label, value: metric.value, unit: metric.unit }"
      />
    </div>

    <p v-if="metrics.length === 0" class="text-sm text-slate-500">
      Esta sección no trajo métricas para el ámbito consultado.
    </p>
  </div>
</template>
