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
  isAvailable,
  type AreaAnalyze,
  type AreaScope,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
  type Maybe,
} from '@terracolombia/shared';
import { useAreaStore, MAX_COMPARED_AREAS } from '@/stores/area';
import { useMapStore } from '@/stores/map';
import { useEntitlements } from '@/composables/useEntitlements';
import { useJob } from '@/composables/useJob';
import { jsonCodec, useUrlState } from '@/composables/useUrlState';
import type { AreaAnalysisResult } from '@/api/types';
import MapView from '@/map/MapView.vue';
import ChartCard from '@/components/ChartCard.vue';
import JobProgress from '@/components/JobProgress.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';
import CoverageNotice from '@/components/ui/CoverageNotice.vue';
import DataValue from '@/components/ui/DataValue.vue';
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
const SECTION_OPTIONS: Array<{ id: NonNullable<AreaAnalyze['sections']>[number]; label: string }> =
  [
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

/**
 * Solo se pinta la zona que el usuario está dibujando.
 * El análisis NO devuelve la geometría resuelta del ámbito (ni `bbox`, ni `id`), así que no
 * hay forma fiel de repintar zonas ya analizadas: el ámbito que se conserva es el `scope`.
 */
const overlay = computed<GeoJsonFeatureCollection | null>(() =>
  drawnGeometry.value
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: drawnGeometry.value,
            properties: { label: 'Zona en curso' },
          },
        ],
      }
    : null,
);

// ── Del resultado del API al tablero ────────────────────────────────────────────
//
// `POST /areas/analyze` NO devuelve un arreglo `sections` con métricas ya formateadas:
// devuelve bloques con nombre propio (`parcels`, `population`, `facilities`, `soils`,
// `hazards`, `relief`…), cada uno con su propia forma y cualquiera de ellos `null`.
// El tablero se arma aquí a partir de esos bloques; `missingSections` dice cuáles faltaron.

type MetricFormat = 'text' | 'number' | 'area' | 'distance' | 'currency' | 'percent';

interface AreaMetric {
  key: string;
  label: string;
  value: Maybe<number | string>;
  format: MetricFormat;
  unit?: string;
  digits?: number;
  note?: string;
}

interface AreaDistribution {
  key: string;
  label: string;
  buckets: Array<{ label: string; value: number }>;
}

/** Capa de contexto que solapa el ámbito, con su porcentaje de solape (0–100). */
interface AreaOverlapRow {
  key: string;
  label: string;
  detail: string | null;
  pct: number;
}

interface AreaSectionView {
  id: string;
  label: string;
  metrics: AreaMetric[];
  distributions: AreaDistribution[];
  overlaps: AreaOverlapRow[];
}

function toBuckets(record: Record<string, number>): Array<{ label: string; value: number }> {
  return Object.entries(record)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** «0_4» → «0 a 4 años», «60_mas» → «60 años y más». Solo da formato a la clave del API. */
function ageBandLabel(band: string): string {
  const [from, to] = band.split('_');
  if (to === 'mas') return `${from} años y más`;
  return `${from} a ${to} años`;
}

function sectionsOf(result: AreaAnalysisResult): AreaSectionView[] {
  const sections: AreaSectionView[] = [];

  if (result.parcels) {
    const p = result.parcels;
    sections.push({
      id: 'parcels',
      label: 'Predios',
      metrics: [
        { key: 'parcels_total', label: 'Predios en la zona', value: p.total, format: 'number' },
        { key: 'parcels_urban', label: 'Urbanos', value: p.urban, format: 'number' },
        { key: 'parcels_rural', label: 'Rurales', value: p.rural, format: 'number' },
        { key: 'parcels_area_sum', label: 'Área sumada', value: p.areaSumM2, format: 'area' },
        {
          key: 'parcels_area_median',
          label: 'Área mediana del predio',
          value: p.areaMedianM2,
          format: 'area',
        },
        {
          key: 'parcels_built_area_sum',
          label: 'Área construida sumada',
          value: p.builtAreaSumM2,
          format: 'area',
        },
        {
          key: 'parcels_with_building',
          label: 'Con construcción',
          value: p.withBuilding,
          format: 'number',
        },
        {
          key: 'parcels_without_building',
          label: 'Sin construcción',
          value: p.withoutBuilding,
          format: 'number',
        },
        {
          key: 'parcels_per_km2',
          label: 'Predios por km²',
          value: p.parcelsPerKm2,
          format: 'number',
          digits: 1,
        },
      ],
      distributions:
        Object.keys(p.byEconomicUse).length > 0
          ? [
              {
                key: 'by_economic_use',
                label: 'Predios por destino económico',
                buckets: toBuckets(p.byEconomicUse),
              },
            ]
          : [],
      overlaps: [],
    });
  }

  if (result.population) {
    const pop = result.population;
    sections.push({
      id: 'population',
      label: 'Población',
      metrics: [
        { key: 'population_total', label: 'Personas', value: pop.total, format: 'number' },
        { key: 'population_households', label: 'Hogares', value: pop.households, format: 'number' },
        {
          key: 'population_dwellings',
          label: 'Viviendas',
          value: pop.dwellings,
          format: 'number',
        },
        {
          key: 'population_density',
          label: 'Densidad',
          value: pop.densityPerKm2,
          format: 'number',
          unit: 'hab/km²',
        },
        {
          key: 'population_blocks',
          label: 'Manzanas censales usadas',
          value: pop.blocksUsed,
          format: 'number',
          note: pop.method,
        },
      ],
      distributions:
        pop.ageBands && Object.keys(pop.ageBands).length > 0
          ? [
              {
                key: 'age_bands',
                label: 'Población por grupo de edad',
                buckets: Object.entries(pop.ageBands).map(([band, value]) => ({
                  label: ageBandLabel(band),
                  value,
                })),
              },
            ]
          : [],
      overlaps: [],
    });
  }

  if (result.facilities) {
    const f = result.facilities;
    sections.push({
      id: 'facilities',
      label: 'Equipamientos',
      metrics: [
        {
          key: 'facilities_schools',
          label: 'Sedes educativas',
          value: f.schools,
          format: 'number',
        },
        {
          key: 'facilities_enrollment',
          label: 'Matrícula registrada',
          value: f.schoolEnrollment,
          format: 'number',
        },
        {
          key: 'facilities_health',
          label: 'Prestadores de salud',
          value: f.healthFacilities,
          format: 'number',
        },
      ],
      distributions:
        Object.keys(f.poisByCategory).length > 0
          ? [
              {
                key: 'pois_by_category',
                label: 'Puntos de interés por categoría',
                buckets: toBuckets(f.poisByCategory),
              },
            ]
          : [],
      overlaps: [],
    });
  }

  if (result.relief) {
    const r = result.relief;
    sections.push({
      id: 'relief',
      label: 'Relieve',
      metrics: [
        {
          key: 'relief_elevation',
          label: 'Elevación media',
          value: r.elevationMeanM,
          format: 'number',
          unit: 'm s. n. m.',
        },
        {
          key: 'relief_slope_mean',
          label: 'Pendiente media',
          value: r.slopeMeanPct,
          format: 'percent',
          digits: 1,
        },
        {
          key: 'relief_slope_max',
          label: 'Pendiente máxima',
          value: r.slopeMaxPct,
          format: 'percent',
          digits: 1,
        },
      ],
      distributions: [],
      overlaps: [],
    });
  }

  if (result.soils.length > 0) {
    sections.push({
      id: 'soils',
      label: 'Suelos',
      metrics: [],
      distributions: [],
      overlaps: result.soils.map((soil, index) => ({
        key: `soil-${index}`,
        label: soil.label ?? soil.code ?? soil.kind,
        detail: soil.kind,
        pct: soil.overlap_pct,
      })),
    });
  }

  if (result.hazards.length > 0) {
    sections.push({
      id: 'hazards',
      label: 'Amenazas',
      metrics: [],
      distributions: [],
      overlaps: result.hazards.map((hazard, index) => ({
        key: `hazard-${index}`,
        label: `${hazard.kind}${isAvailable(hazard.level) ? ` · ${hazard.level}` : ''}`,
        // La escala del estudio importa: sin ella no se debe sobreinterpretar la clase.
        detail: `${hazard.source}${isAvailable(hazard.scale) ? ` · escala ${hazard.scale}` : ''}`,
        pct: hazard.overlap_pct,
      })),
    });
  }

  if (result.protectedAreas.length > 0) {
    sections.push({
      id: 'protected',
      label: 'Áreas protegidas',
      metrics: [],
      distributions: [],
      overlaps: result.protectedAreas.map((protectedArea, index) => ({
        key: `protected-${index}`,
        label: protectedArea.name,
        detail: isAvailable(protectedArea.category) ? protectedArea.category : null,
        pct: protectedArea.overlap_pct,
      })),
    });
  }

  if (result.ethnicTerritories.length > 0) {
    sections.push({
      id: 'ethnic',
      label: 'Territorios étnicos',
      metrics: [],
      distributions: [],
      overlaps: result.ethnicTerritories.map((territory, index) => ({
        key: `ethnic-${index}`,
        label: territory.name,
        detail: isAvailable(territory.kind) ? territory.kind : null,
        pct: territory.overlap_pct,
      })),
    });
  }

  if (result.potZones.length > 0) {
    sections.push({
      id: 'pot',
      label: 'Ordenamiento territorial (POT)',
      metrics: [],
      distributions: [],
      overlaps: result.potZones.map((zone, index) => ({
        key: `pot-${index}`,
        label: isAvailable(zone.classification)
          ? zone.classification
          : isAvailable(zone.use)
            ? zone.use
            : 'Zona sin clasificar',
        detail: isAvailable(zone.sourceDoc) ? zone.sourceDoc : null,
        pct: zone.overlap_pct,
      })),
    });
  }

  if (result.agriculturalFrontier.length > 0) {
    sections.push({
      id: 'agricultural-frontier',
      label: 'Frontera agrícola',
      metrics: [],
      distributions: [],
      overlaps: result.agriculturalFrontier.map((row, index) => ({
        key: `frontier-${index}`,
        label: row.category,
        detail: null,
        pct: row.overlap_pct,
      })),
    });
  }

  return sections;
}

const activeSections = computed<AreaSectionView[]>(() =>
  active.value?.result ? sectionsOf(active.value.result) : [],
);

/** Métricas comparadas: una fila por indicador y una columna por zona. */
const comparisonRows = computed(() => {
  const keys = new Map<string, { label: string; unit: string | null }>();
  const byArea = areas.value.map((item) =>
    item.result ? sectionsOf(item.result).flatMap((section) => section.metrics) : [],
  );

  for (const metrics of byArea) {
    for (const metric of metrics) {
      if (!keys.has(metric.key))
        keys.set(metric.key, { label: metric.label, unit: metric.unit ?? null });
    }
  }

  return [...keys.entries()].map(([key, info]) => ({
    key,
    label: info.label,
    unit: info.unit,
    values: byArea.map((metrics) => metrics.find((m) => m.key === key) ?? null),
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
        // `NO_DISPONIBLE` no se dibuja como 0: se deja el hueco (regla 2).
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

/** Etiquetas de las secciones del tablero, para nombrar en español las que faltaron. */
const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  SECTION_OPTIONS.map((option) => [option.id, option.label]),
);

/**
 * DESAJUSTE PENDIENTE (verificado en vivo contra `POST /areas/analyze`):
 * `missingSections` NO es un arreglo de cadenas, sino de `{ section, reason }`. `api/types.ts`
 * lo declara `string[]`, así que TypeScript no avisa y una interpolación directa imprimiría
 * «[object Object]» en pantalla. Hasta que el tipo se corrija, esto acepta las dos formas sin
 * castear la respuesta: se lee lo que la API manda de verdad, no lo que el tipo promete.
 */
function missingSectionText(entry: unknown): string {
  if (typeof entry === 'string') return SECTION_LABELS[entry] ?? entry;
  if (entry !== null && typeof entry === 'object') {
    const row = entry as { section?: unknown; reason?: unknown };
    const section = typeof row.section === 'string' ? row.section : null;
    const reason = typeof row.reason === 'string' ? row.reason : null;
    const label = section ? (SECTION_LABELS[section] ?? section) : null;
    if (label && reason) return `${label}: ${reason}`;
    if (reason) return reason;
    if (label) return label;
  }
  return MESSAGES.common.notAvailable;
}

/** Valor para la tabla comparada: el centinela se muestra como «No disponible». */
function comparedValue(metric: AreaMetric | null): string {
  if (!metric || !isAvailable(metric.value)) return MESSAGES.common.notAvailable;
  return String(metric.value);
}

const activeMetricCount = computed(() =>
  activeSections.value.reduce(
    (total, section) => total + section.metrics.length + section.overlaps.length,
    0,
  ),
);
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
            <legend class="tc-label mb-1.5">Secciones del tablero (ninguna marcada = todas)</legend>
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
            Supera {{ AREA_ANALYSIS_SYNC_LIMIT_KM2 }} km², así que se procesa en segundo plano y te
            mostramos el avance.
          </p>

          <p v-if="exceedsPlan" class="mt-1 text-sm font-medium text-rose-800" role="alert">
            Esta zona supera el límite de tu plan ({{ maxAnalysisAreaKm2 }} km²). Dibuja un área más
            pequeña o mejora tu plan.
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
          :progress-message="job.progressMessage.value"
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
                  {{
                    item.result ? `${item.result.areaKm2.toFixed(2)} km²` : MESSAGES.common.loading
                  }}
                </span>
              </button>
              <BaseBadge v-if="item.error" tone="danger" size="sm">Falló</BaseBadge>
              <BaseButton variant="ghost" size="sm" @click="area.remove(item.key)"
                >
Quitar
</BaseButton
              >
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
          :subtitle="`${active.result.label} · ${active.result.areaHa.toFixed(1)} ha`"
          :heading-level="2"
          :padded="false"
        >
          <EmptyState
            v-if="activeSections.length === 0"
            title="No hay datos para esta zona"
            body="Ninguna de las secciones pedidas trajo datos. Revisa el aviso de cobertura: puede que el municipio no sea jurisdicción del IGAC o que aún no tengamos sus capas cargadas."
            icon="data"
          />

          <CollapsibleSection
            v-for="section in activeSections"
            :key="section.id"
            :title="section.label"
            :hint="
              section.overlaps.length > 0
                ? `${section.overlaps.length} coincidencias`
                : `${section.metrics.length} indicadores`
            "
            open
          >
            <div v-if="section.metrics.length > 0" class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <DataValue
                v-for="metric in section.metrics"
                :key="metric.key"
                :label="metric.label"
                :value="metric.value"
                :sources="active.meta.sources"
                :format="metric.format"
                :unit="metric.unit"
                :digits="metric.digits ?? 0"
                :hint="metric.note"
              />
            </div>

            <!-- Capas que solapan el ámbito: el porcentaje es del área de la zona. -->
            <table v-if="section.overlaps.length > 0" class="tc-table">
              <caption class="sr-only">
                {{
                  section.label
                }}
                que solapan la zona analizada
              </caption>
              <thead>
                <tr>
                  <th scope="col">Capa</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Solape de la zona</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in section.overlaps" :key="row.key">
                  <th scope="row" class="font-normal">{{ row.label }}</th>
                  <td class="text-xs text-slate-600">
                    {{ row.detail ?? MESSAGES.common.notAvailable }}
                  </td>
                  <td class="tabular-nums">{{ row.pct.toFixed(1) }} %</td>
                </tr>
              </tbody>
            </table>

            <div v-if="section.distributions.length > 0" class="mt-4 grid gap-3 md:grid-cols-2">
              <ChartCard
                v-for="distribution in section.distributions"
                :key="distribution.key"
                :title="distribution.label"
                :option="distributionOption(distribution.buckets)"
                :sources="active.meta.sources"
                :table-rows="
                  distribution.buckets.map((bucket) => ({
                    label: bucket.label,
                    value: bucket.value,
                  }))
                "
              />
            </div>
          </CollapsibleSection>

          <template #footer>
            <ProvenanceFooter :meta="active.meta" compact />
          </template>
        </BaseCard>

        <!-- Regla 6: lo que no se pudo calcular se dice, no se oculta. -->
        <BaseCard
          v-if="active.result.missingSections.length > 0 || active.result.warnings.length > 0"
          title="Qué no pudimos calcular"
          :heading-level="2"
        >
          <div v-if="active.result.missingSections.length > 0">
            <p class="tc-label">Secciones sin datos</p>
            <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
              <li v-for="(missing, index) in active.result.missingSections" :key="index">
                {{ missingSectionText(missing) }}
              </li>
            </ul>
          </div>

          <ul
            v-if="active.result.warnings.length > 0"
            class="mt-3 list-disc space-y-0.5 pl-4 text-sm text-amber-800"
          >
            <li v-for="(warning, index) in active.result.warnings" :key="index">{{ warning }}</li>
          </ul>
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
                {{ comparedValue(metric) }}
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
              value: metric && typeof metric.value === 'number' ? metric.value : null,
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
        {{ activeMetricCount }} indicadores calculados
      </span>
    </ResultActionBar>
  </div>
</template>
