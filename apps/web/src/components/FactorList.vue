<script setup lang="ts">
/**
 * Desglose por factor de un puntaje (aptitud M5, localización M6).
 *
 * PLAN.md §9 es explícito: «La respuesta siempre incluye el desglose por factor
 * (explicabilidad), nunca solo el puntaje». Este componente es ese desglose: semáforo con
 * texto, valor crudo con unidad, peso aplicado, fórmula y fuentes.
 */
import { computed } from 'vue';
import { MESSAGES, isAvailable, type FactorScore, type SourceRef } from '@terracolombia/shared';
import SemaphoreBadge from '@/components/ui/SemaphoreBadge.vue';
import HowCalculated from '@/components/ui/HowCalculated.vue';
import ExplainButton from '@/components/ui/ExplainButton.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';

const props = withDefaults(
  defineProps<{
    factors: FactorScore[];
    sources: SourceRef[];
    /** Muestra el peso con que cada factor entró al puntaje compuesto. */
    showWeights?: boolean;
  }>(),
  { showWeights: true },
);

const byDataset = computed(() => {
  const map = new Map<string, SourceRef>();
  for (const source of props.sources) map.set(source.datasetId, source);
  return map;
});

function sourcesFor(factor: FactorScore): SourceRef[] {
  return factor.sourceDatasetIds
    .map((id) => byDataset.value.get(id))
    .filter((s): s is SourceRef => Boolean(s));
}

/** `unit` viene como `Maybe<string>`: el centinela NO_DISPONIBLE no debe llegar a la pantalla. */
function unitOf(factor: FactorScore): string | null {
  return isAvailable(factor.unit) ? factor.unit : null;
}

function rawLabel(factor: FactorScore): string {
  if (factor.rawValue === null) return MESSAGES.common.notAvailable;
  if (typeof factor.rawValue === 'number') {
    const unit = unitOf(factor);
    return `${factor.rawValue.toLocaleString('es-CO', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
  }
  return factor.rawValue;
}

/** Ordena poniendo primero lo que bloquea: el usuario debe ver los rojos de entrada. */
const ordered = computed(() => {
  const rank: Record<FactorScore['flag'], number> = { blocker: 0, caution: 1, unknown: 2, ok: 3 };
  return [...props.factors].sort((a, b) => rank[a.flag] - rank[b.flag] || b.weight - a.weight);
});
</script>

<template>
  <ul class="divide-y divide-slate-200" data-testid="factor-list">
    <li v-for="factor in ordered" :key="factor.indicator" class="py-3">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-900">{{ factor.label }}</p>
          <p class="mt-0.5 text-sm text-slate-700">
            <span class="tabular-nums">{{ rawLabel(factor) }}</span>
            <span v-if="factor.score !== null" class="ml-2 text-xs text-slate-500">
              puntaje {{ factor.score }}/100
            </span>
            <span v-if="showWeights" class="ml-2 text-xs text-slate-500">
              peso {{ Math.round(factor.weight * 100) }} %
            </span>
          </p>
        </div>

        <SemaphoreBadge :status="factor.flag" size="sm" />
      </div>

      <p class="mt-1.5 text-sm leading-relaxed text-slate-700">{{ factor.explanation }}</p>

      <CollapsibleSection :title="MESSAGES.common.seeFullDetail" class="mt-2 border-0">
        <HowCalculated
          :formula="factor.formula"
          :direction="factor.direction"
          :unit="unitOf(factor)"
          :sources="sourcesFor(factor)"
        />
        <ExplainButton
          class="mt-2"
          :subject="`factor:${factor.indicator}`"
          :payload="{
            label: factor.label,
            rawValue: factor.rawValue,
            unit: unitOf(factor),
            score: factor.score,
            flag: factor.flag,
            formula: factor.formula,
          }"
        />
      </CollapsibleSection>
    </li>

    <li v-if="ordered.length === 0" class="py-3 text-sm text-slate-500">
      No hay factores calculados para este caso.
    </li>
  </ul>
</template>
