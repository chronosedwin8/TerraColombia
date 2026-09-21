<script setup lang="ts">
/**
 * Gráfico con procedencia. Un gráfico es una cifra dibujada, así que aquí también aplica
 * la regla 4: sin `sources` no se pinta el gráfico, se explica por qué.
 *
 * Además de la representación visual se ofrece **la tabla equivalente**: un gráfico no es
 * accesible por sí solo, y quien use lector de pantalla necesita los números.
 */
import { computed, ref } from 'vue';
import VChart from 'vue-echarts';
import type { EChartsOption } from 'echarts';
import { MESSAGES, formatNumber, type SourceRef } from '@terracolombia/shared';
import { BASE_CHART_OPTION, CHART_PALETTE, registerEcharts } from '@/charts/setup';
import BaseCard from '@/components/ui/BaseCard.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import HowCalculated from '@/components/ui/HowCalculated.vue';

registerEcharts();

const props = withDefaults(
  defineProps<{
    title: string;
    /** Opciones de ECharts sin la paleta ni la base común: se fusionan aquí. */
    option: EChartsOption | null;
    sources: SourceRef[];
    /** Filas equivalentes para la tabla accesible: [etiqueta, valor]. */
    tableRows?: Array<{ label: string; value: number | string | null; unit?: string | null }>;
    unit?: string | null;
    formula?: string;
    isLoading?: boolean;
    height?: string;
    subtitle?: string;
  }>(),
  {
    tableRows: () => [],
    unit: null,
    formula: undefined,
    isLoading: false,
    height: '260px',
    subtitle: undefined,
  },
);

const showTable = ref(false);

const merged = computed<EChartsOption | null>(() => {
  if (!props.option) return null;
  return { ...BASE_CHART_OPTION, color: [...CHART_PALETTE], ...props.option };
});
</script>

<template>
  <BaseCard :title="title" :subtitle="subtitle">
    <template #actions>
      <button
        type="button"
        class="text-xs underline text-slate-600 hover:text-slate-900"
        :aria-expanded="showTable"
        @click="showTable = !showTable"
      >
        {{ showTable ? 'Ver gráfico' : 'Ver tabla' }}
      </button>
    </template>

    <ProvenanceFooter :sources="sources">
      <LoadingSkeleton v-if="isLoading" variant="chart" :height="height" />

      <p v-else-if="!merged" class="text-sm text-slate-600">
        {{ MESSAGES.common.notAvailableLong }}
      </p>

      <template v-else>
        <!-- El gráfico se marca como decorativo: la información real está en la tabla. -->
        <div v-show="!showTable" :style="{ height }" role="img" :aria-label="title">
          <VChart :option="merged" autoresize :style="{ height: '100%', width: '100%' }" />
        </div>

        <div v-show="showTable" class="max-h-72 overflow-auto">
          <table class="tc-table">
            <caption class="sr-only">
              {{ title }}. Tabla equivalente al gráfico.
            </caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.label">
                <th scope="row" class="font-normal">{{ row.label }}</th>
                <td class="tabular-nums">
                  <template v-if="row.value === null">{{ MESSAGES.common.notAvailable }}</template>
                  <template v-else-if="typeof row.value === 'number'">
                    {{ formatNumber(row.value, 0) }}{{ row.unit ?? unit ? ` ${row.unit ?? unit}` : '' }}
                  </template>
                  <template v-else>{{ row.value }}</template>
                </td>
              </tr>
              <tr v-if="tableRows.length === 0">
                <td colspan="2" class="text-slate-500">Sin filas para mostrar.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <HowCalculated
          v-if="formula"
          class="mt-3"
          :formula="formula"
          :unit="unit"
          :sources="sources"
        />
      </template>
    </ProvenanceFooter>
  </BaseCard>
</template>
