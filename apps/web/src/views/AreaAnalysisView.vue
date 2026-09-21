<script setup lang="ts">
/**
 * Analizador de zona (pantalla 4 de §10.2).
 *
 * Flujo: dibujar (polígono, radio o municipio) → tablero con gráficos → comparar hasta cuatro
 * zonas lado a lado. Si el área supera el umbral síncrono, el backend devuelve un trabajo en
 * cola y el progreso llega por SSE (`useJob`), sin bloquear la interfaz.
 */
import { computed, ref, watch } from 'vue';
import type { EChartsOption } from 'echarts';
import {
  AREA_ANALYSIS_SYNC_LIMIT_KM2,
  MESSAGES,
  type AreaAnalyze,
  type AreaScope,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
} from '@terracolombia/shared';
import { useAreaStore, MAX_COMPARED_AREAS } from '@/stores/area';
import { useMapStore } from '@/stores/map';
import { useEntitlements } from '@/composables/useEntitlements';
import { useJob } from '@/composables/useJob';
import { jsonCodec, useUrlState } from '@/composables/useUrlState';
import type { AreaAnalysisResult, MetricRow } from '@/api/types';
import MapView from '@/map/MapView.vue';
import ChartCard from '@/components/ChartCard.vue';
import MetricGrid from '@/components/MetricGrid.vue';
import JobProgress from '@/components/JobProgress.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';
import CoverageNotice from '@/components/ui/CoverageNotice.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const area = useAreaStore();
const mapStore = useMapStore();
const { maxAnalysisAreaKm2 } = useEntitlements();
const job = useJob<AreaAnalysisResult>();

/** El ámbito dibujado viaja en la URL: la zona analizada se comparte con un enlace. */
const { state, shareUrl } = useUrlState({
  ambito: { default: null as AreaScope | null, codec: jsonCodec<AreaScope>() },
});

const drawnGeometry = ref<GeoJsonGeometry | null>(null);
const pendingJobKey = ref<string | null>(null);

/** Secciones del tablero. Vacío = todas, tal como define `AreaAnalyzeSchema`. */
const SECTION_OPTIONS: Array<{ id: NonNullable<AreaAnalyze['sections']>[number]; label: string }> = [
  { id: 'parcels', label: 'Predios' },
  { id: 'population', label: 'Población' },
  { id: 'education', label: 'Educación' },
  { id: 'health', label: 'Salud' },
  { id: 'commerce', label: 'Comercio' },
  { id: 'soils', label: 'Suelos' },
  { id: 'hazards', label: 'Amenazas' },
  { id: 'protected', label: 'Áreas protegidas' },
  { id: 'relief', label: 'Relieve' },
  { id: 'pot', label: 'Ordenamiento' },
  { id: 'accessibility', label: 'Accesibilidad' },
];

const selectedSections = ref<AreaAnalyze['sections']>([]);

function onDrawChange(collection: GeoJsonFeatureCollection | null): void {
  const geometry = collection?.features[0]?.geometry ?? null;
  drawnGeometry.value = geometry;
  if (geometry) state.ambito = { kind: 'polygon', geometry };
}

/** Un clic en el mapa en modo "municipio" fija el ámbito por código DIVIPOLA. */
function onFeatureClick(hit: { layer: string; id: string | number } | null): void {
  if (!hit || mapStore.drawMode !== 'municipality') return;
  if (hit.layer !== 'municipality' || typeof hit.id !== 'string') return;
  state.ambito = { kind: 'municipality', muniCode: hit.id };
}

const currentScope = computed(() => state.ambito);
const estimatedKm2 = computed(() =>
  currentScope.value ? area.scopeAreaKm2(currentScope.value) : null,
);
const willBeQueued = computed(
  () => estimatedKm2.value !== null && estimatedKm2.value > AREA_ANALYSIS_SYNC_LIMIT_KM2,
);
const exceedsPlan = computed(
  () => estimatedKm2.value !== null && estimatedKm2.value > maxAnalysisAreaKm2.value,
);

async function analyze(): Promise<void> {
  const scope = currentScope.value;
  if (!scope || exceedsPlan.value) return;

  const key = area.add(scope, `Zona ${area.areas.length + 1}`);
  if (!key) return;

  const handle = await area.analyze(key, selectedSections.value, mapStore.cutDate ?? undefined);
  if (handle) {
    pendingJobKey.value = key;
    job.track(handle.jobId);
  }
}

// Cuando el trabajo termina, el resultado se asienta en la zona que lo lanzó.
watch(job.result, (result) => {
  if (!result || !pendingJobKey.value) return;
  area.settleFromJob(pendingJobKey.value, result);
  pendingJobKey.value = null;
});

const areas = computed(() => area.areas);
const active = computed(() => area.active);

/** Geometrías de todas las zonas comparadas, para verlas juntas en el mapa. */
const overlay = computed<GeoJsonFeatureCollection | null>(() => {
  const features = areas.value
    .map((item) => item.result?.geometry ?? null)
    .filter((geometry): geometry is GeoJsonGeometry => geometry !== null)
    .map((geometry, index) => ({
      type: 'Feature' as const,
      geometry,
      properties: { label: areas.value[index]?.label ?? '' },
    }));
  if (drawnGeometry.value) {
    features.push({
      type: 'Feature' as const,
      geometry: drawnGeometry.value,
      properties: { label: 'Zona en curso' },
    });
  }
  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
});

/** Métricas comparadas: una fila por indicador y una columna por zona. */
const comparisonRows = computed(() => {
  const keys = new Map<string, { label: string; unit: string | null }>();
  for (const item of areas.value) {
    for (const section of item.result?.sections ?? []) {
      for (const metric of section.metrics) {
        if (!keys.has(metric.key)) keys.set(metric.key, { label: metric.label, unit: metric.unit });
      }
    }
  }

  return [...keys.entries()].map(([key, info]) => ({
    key,
    label: info.label,
    unit: info.unit,
    values: areas.value.map((item) => {
      const metric = item.result?.sections
        .flatMap((section) => section.metrics)
        .find((m) => m.key === key);
      return metric ?? null;
    }),
  }));
});

/** Gráfico de barras que compara un indicador entre zonas. */
function comparisonOption(row: (typeof comparisonRows.value)[number]): EChartsOption {
  return {
    xAxis: { type: 'category', data: areas.value.map((item) => item.label) },
    yAxis: { type: 'value', name: row.unit ?? '' },
    series: [
      {
        type: 'bar',
        name: row.label,
        data: row.values.map((metric) =>
          metric && typeof metric.value === 'number' ? metric.value : null,
        ),
      },
    ],
  };
}

/** Distribución de una sección como barras horizontales. */
function distributionOption(buckets: Array<{ label: string; value: number }>): EChartsOption {
  return {
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: buckets.map((bucket) => bucket.label) },
    series: [{ type: 'bar', data: buckets.map((bucket) => bucket.value) }],
  };
}

function metricsOf(result: AreaAnalysisResult | null): MetricRow[] {
  return (result?.sections ?? []).flatMap((section) => section.metrics);
}
</script>

<template>
  <div class="mx-auto max-w-[110rem] space-y-3 p-3">
    <SyntheticDataBanner :meta="active?.meta ?? null" />

    <header class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-xl font-semibold">Analizar una zona</h1>
      <p class="text-sm text-slate-600">
        Hasta {{ MAX_COMPARED_AREAS }} zonas comparadas · límite de tu plan
        {{ maxAnalysisAreaKm2 }} km²
      </p>
    </header>

    <div class="grid gap-3 lg:grid-cols-[1fr_24rem]">
      <div class="h-[26rem] lg:h-[calc(100dvh-12rem)]">
        <MapView
          height="100%"
          show-draw-tools
          :overlay="overlay"
          @draw-change="onDrawChange"
          @feature-click="onFeatureClick"
        />
      </div>

      <div class="space-y-3">
        <BaseCard title="Qué calcular" :heading-level="2">
          <fieldset>
            <legend class="tc-label mb-1.5">
              Secciones del tablero (ninguna marcada = todas)
            </legend>
            <div class="grid grid-cols-2 gap-1.5">
              <label
                v-for="option in SECTION_OPTIONS"
                :key="option.id"
                class="flex items-center gap-2 text-sm"
              >
                <input
                  v-model="selectedSections"
                  type="checkbox"
                  :value="option.id"
                  class="h-4 w-4 accent-brand-600"
                />
                {{ option.label }}
              </label>
            </div>
          </fieldset>

          <p v-if="estimatedKm2 !== null" class="mt-3 text-sm">
            Área estimada:
            <strong class="tabular-nums">{{ estimatedKm2.toFixed(2) }} km²</strong>
          </p>

          <p v-if="willBeQueued && !exceedsPlan" class="mt-1 text-xs text-slate-600">
            Supera {{ AREA_ANALYSIS_SYNC_LIMIT_KM2 }} km², así que se procesa en segundo plano y
            te mostramos el avance.
          </p>

          <p v-if="exceedsPlan" class="mt-1 text-sm font-medium text-rose-800" role="alert">
            Esta zona supera el límite de tu plan ({{ maxAnalysisAreaKm2 }} km²). Dibuja un área
            más pequeña o mejora tu plan.
          </p>

          <BaseButton
            class="mt-3"
            :disabled="!currentScope || exceedsPlan || !area.canAddMore"
            @click="analyze"
          >
            {{ areas.length === 0 ? 'Analizar esta zona' : 'Añadir zona a la comparación' }}
          </BaseButton>

          <p v-if="!area.canAddMore" class="mt-1 text-xs text-slate-500">
            Ya tienes {{ MAX_COMPARED_AREAS }} zonas. Quita alguna para añadir otra.
          </p>
        </BaseCard>

        <JobProgress
          :status="job.status.value"
          :progress="job.progress.value"
          :stage="job.stage.value"
          :error-message="job.error.value?.message ?? null"
          @cancel="job.stop()"
        />

        <BaseCard v-if="areas.length > 0" title="Zonas" :heading-level="2" :padded="false">
          <ul class="divide-y divide-slate-100">
            <li
              v-for="item in areas"
              :key="item.key"
              class="flex items-center justify-between gap-2 px-4 py-2"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left text-sm"
                :class="item.key === area.activeKey ? 'font-semibold' : ''"
                @click="area.activeKey = item.key"
              >
                <span class="block truncate">{{ item.label }}</span>
                <span class="block text-xs text-slate-500">
                  {{ item.result ? `${item.result.areaKm2.toFixed(2)} km²` : MESSAGES.common.loading }}
                </span>
              </button>
              <BaseBadge v-if="item.error" tone="danger" size="sm">Falló</BaseBadge>
              <BaseButton variant="ghost" size="sm" @click="area.remove(item.key)">Quitar</BaseButton>
            </li>
          </ul>
        </BaseCard>
      </div>
    </div>

    <!-- ── Tablero de la zona activa ────────────────────────────────────────── -->
    <EmptyState
      v-if="areas.length === 0"
      title="Dibuja una zona para empezar"
      body="Usa las herramientas del mapa: traza un polígono, fija un radio desde un punto o elige un municipio completo. Después marca qué secciones quieres calcular."
      icon="map"
    />

    <template v-else-if="active">
      <CoverageNotice :coverage="active.result?.coverage ?? null" />

      <LoadingSkeleton v-if="active.isLoading" variant="card" />

      <EmptyState
        v-else-if="active.error"
        :title="MESSAGES.common.error"
        :body="active.error.message"
        icon="data"
      />

      <template v-else-if="active.result">
        <BaseCard
          :title="`${active.label} · ${active.result.areaKm2.toFixed(2)} km²`"
          :heading-level="2"
          :padded="false"
        >
          <CollapsibleSection
            v-for="section in active.result.sections"
            :key="section.id"
            :title="section.label"
            :hint="`${section.metrics.length} indicadores`"
            :empty="section.metrics.length === 0 && section.distributions.length === 0"
            open
          >
            <MetricGrid
              :metrics="section.metrics"
              :sources="active.meta.sources"
              :columns="2"
              explainable
            />

            <div
              v-if="section.distributions.length > 0"
              class="mt-4 grid gap-3 md:grid-cols-2"
            >
              <ChartCard
                v-for="distribution in section.distributions"
                :key="distribution.key"
                :title="distribution.label"
                :option="distributionOption(distribution.buckets)"
                :sources="active.meta.sources"
                :unit="distribution.unit"
                :table-rows="
                  distribution.buckets.map((bucket) => ({
                    label: bucket.label,
                    value: bucket.value,
                    unit: distribution.unit,
                  }))
                "
              />
            </div>

            <ul
              v-if="section.warnings.length > 0"
              class="mt-3 list-disc space-y-0.5 pl-4 text-xs text-amber-800"
            >
              <li v-for="(warning, index) in section.warnings" :key="index">{{ warning }}</li>
            </ul>
          </CollapsibleSection>

          <template #footer>
            <ProvenanceFooter :meta="active.meta" compact />
          </template>
        </BaseCard>
      </template>
    </template>

    <!-- ── Comparación lado a lado ──────────────────────────────────────────── -->
    <BaseCard
      v-if="area.isComparing"
      :title="`Comparación de ${areas.length} zonas`"
      :heading-level="2"
      :padded="false"
    >
      <div class="overflow-x-auto">
        <table class="tc-table">
          <caption class="sr-only">
            Indicadores comparados entre las zonas seleccionadas.
          </caption>
          <thead>
            <tr>
              <th scope="col">Indicador</th>
              <th v-for="item in areas" :key="item.key" scope="col">{{ item.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparisonRows" :key="row.key">
              <th scope="row" class="font-normal">
                {{ row.label }}
                <span v-if="row.unit" class="text-xs text-slate-500">({{ row.unit }})</span>
              </th>
              <td v-for="(metric, index) in row.values" :key="index" class="tabular-nums">
                <!-- Sin datasets de respaldo no se muestra la cifra (regla 4). -->
                <template v-if="!metric || metric.sourceDatasetIds.length === 0">
                  {{ MESSAGES.common.notAvailable }}
                </template>
                <template v-else-if="metric.value === null">
                  {{ MESSAGES.common.notAvailable }}
                </template>
                <template v-else>{{ metric.value }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid gap-3 p-4 md:grid-cols-2">
        <ChartCard
          v-for="row in comparisonRows.slice(0, 6)"
          :key="`chart-${row.key}`"
          :title="row.label"
          :option="comparisonOption(row)"
          :sources="active?.meta.sources ?? []"
          :unit="row.unit"
          :table-rows="
            row.values.map((metric, index) => ({
              label: areas[index]?.label ?? `Zona ${index + 1}`,
              value: metric?.value ?? null,
              unit: row.unit,
            }))
          "
        />
      </div>
    </BaseCard>

    <ResultActionBar
      v-if="active?.result"
      :share-url="shareUrl()"
      share-title="Análisis de zona en TerraColombia"
      :formats="['pdf', 'xlsx', 'geojson', 'gpkg', 'kml']"
      @save="$router.push('/proyectos')"
      @compare="area.activeKey = areas[0]?.key ?? null"
    >
      <span class="ml-auto text-xs text-slate-500">
        {{ metricsOf(active.result).length }} indicadores calculados
      </span>
    </ResultActionBar>
  </div>
</template>
