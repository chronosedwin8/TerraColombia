<script setup lang="ts">
/**
 * Localización de negocio — «¿Dónde abro mi X?» (pantalla 6 de §10.2, módulo M6).
 *
 * Flujo del plan: elegir plantilla → mover los pesos y ver el mapa de calor recalcularse →
 * top zonas → predios candidatos dentro de cada zona.
 *
 * Lo que este producto **no** hace: decir «abre aquí». Muestra indicadores, deja que el
 * usuario fije sus criterios y explica el aporte de cada factor al puntaje.
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  MESSAGES,
  formatArea,
  type AreaScope,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
} from '@terracolombia/shared';
import { useIntelStore } from '@/stores/intel';
import { useJob } from '@/composables/useJob';
import { useDebounceFn } from '@/composables/useDebounce';
import {
  intCodec,
  jsonCodec,
  stringCodec,
  useUrlState,
  weightsCodec,
} from '@/composables/useUrlState';
import type { LocationIntelResult, ScoredCell } from '@/api/types';
import MapView from '@/map/MapView.vue';
import JobProgress from '@/components/JobProgress.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
import HowCalculated from '@/components/ui/HowCalculated.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const intel = useIntelStore();
const job = useJob<LocationIntelResult>();

/** Plantilla, pesos, resolución y ámbito: todo en la URL, todo compartible. */
const { state, shareUrl } = useUrlState(
  {
    plantilla: { default: '', codec: stringCodec },
    pesos: { default: {} as Record<string, number>, codec: weightsCodec },
    res: { default: 8, codec: intCodec },
    ambito: { default: null as AreaScope | null, codec: jsonCodec<AreaScope>() },
  },
  { debounceMs: 400 },
);

const drawnGeometry = ref<GeoJsonGeometry | null>(null);
const selectedZoneId = ref<string | null>(null);

onMounted(async () => {
  await intel.loadTemplates();
  if (state.plantilla.length > 0) {
    intel.selectTemplate(state.plantilla);
    // Los pesos de la URL mandan sobre los de la plantilla.
    if (Object.keys(state.pesos).length > 0) intel.weights = { ...state.pesos };
  }
  if (state.ambito) intel.scope = state.ambito;
  intel.resolution = state.res === 7 || state.res === 9 ? state.res : 8;
});

function chooseTemplate(id: string): void {
  intel.selectTemplate(id);
  state.plantilla = id;
  state.pesos = { ...intel.weights };
  selectedZoneId.value = null;
}

/** Recalcular con retardo: el usuario arrastra el slider, no hace clic una vez. */
const recalculate = useDebounceFn(() => {
  void run();
}, 500);

function onWeightChange(key: string, value: number): void {
  intel.setWeight(key, value);
  state.pesos = { ...intel.weights };
  if (intel.result) recalculate.run();
}

function onDrawChange(collection: GeoJsonFeatureCollection | null): void {
  const geometry = collection?.features[0]?.geometry ?? null;
  drawnGeometry.value = geometry;
  const scope: AreaScope | null = geometry ? { kind: 'polygon', geometry } : null;
  intel.scope = scope;
  state.ambito = scope;
}

async function run(): Promise<void> {
  const handle = await intel.run();
  if (handle) job.track(handle.jobId);
}

watch(job.result, (result) => {
  if (result) intel.settleFromJob(result);
});

watch(
  () => intel.resolution,
  (value) => {
    state.res = value;
  },
);

const template = computed(() => intel.template);
const result = computed(() => intel.result);
const cells = computed<ScoredCell[]>(() => result.value?.cells ?? []);
const topZones = computed(() => result.value?.topZones ?? []);
const selectedZone = computed(
  () => topZones.value.find((zone) => zone.id === selectedZoneId.value) ?? null,
);

/** Suma de pesos antes de normalizar: ayuda a entender que lo que importa es la proporción. */
const weightSum = computed(() =>
  Object.values(intel.weights).reduce((sum, value) => sum + value, 0),
);

const overlay = computed<GeoJsonFeatureCollection | null>(() =>
  drawnGeometry.value
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: drawnGeometry.value, properties: {} }],
      }
    : null,
);

/** Aporte de cada indicador al puntaje de una celda, para el desglose explicable. */
function breakdownOf(cell: ScoredCell): Array<{ label: string; raw: number | null; weighted: number | null }> {
  const indicators = result.value?.indicators ?? [];
  return cell.breakdown.map((item) => ({
    label: indicators.find((indicator) => indicator.key === item.key)?.label ?? item.key,
    raw: item.raw,
    weighted: item.weighted,
  }));
}

const bestCell = computed(() => cells.value[0] ?? null);
</script>

<template>
  <div class="mx-auto max-w-[110rem] space-y-3 p-3">
    <SyntheticDataBanner :meta="intel.meta" />

    <header>
      <h1 class="text-xl font-semibold">¿Dónde abro mi negocio?</h1>
      <p class="mt-0.5 text-sm text-slate-600">
        Elige una plantilla, ajusta lo que te importa y mira cómo cambia el mapa. Trabajamos sobre
        <GlossaryTerm id="h3" label="celdas del mismo tamaño" /> para que las comparaciones sean
        justas.
      </p>
    </header>

    <!-- ── Paso 1: plantilla ────────────────────────────────────────────────── -->
    <BaseCard title="1. Elige una plantilla" :heading-level="2">
      <LoadingSkeleton v-if="intel.isLoadingTemplates" :lines="3" />

      <EmptyState
        v-else-if="intel.templates.length === 0"
        title="No pudimos cargar las plantillas"
        body="Las plantillas las publica el motor de puntuación. Reintenta en un momento."
        icon="data"
        action-label="Reintentar"
        @action="intel.loadTemplates()"
      />

      <div v-else class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="item in intel.templates"
          :key="item.id"
          type="button"
          class="rounded-md border p-3 text-left"
          :class="
            item.id === intel.templateId
              ? 'border-brand-600 bg-brand-50'
              : 'border-slate-200 hover:bg-surface-muted'
          "
          :aria-pressed="item.id === intel.templateId"
          @click="chooseTemplate(item.id)"
        >
          <p class="text-sm font-semibold">{{ item.name }}</p>
          <p class="text-xs text-slate-600">{{ item.audience }}</p>
          <p class="mt-1 text-xs leading-snug text-slate-700">{{ item.description }}</p>
          <p class="mt-1 text-[11px] text-slate-500">
            {{ item.indicators.length }} indicadores
          </p>
        </button>
      </div>
    </BaseCard>

    <div v-if="template" class="grid gap-3 lg:grid-cols-[24rem_1fr]">
      <!-- ── Paso 2: pesos ──────────────────────────────────────────────────── -->
      <div class="space-y-3">
        <BaseCard :title="`2. Ajusta los pesos de ${template.name}`" :heading-level="2">
          <p class="text-xs text-slate-600">
            Lo que cuenta es la proporción entre pesos, no su suma: los normalizamos a 1 antes de
            calcular. Suma actual: <strong class="tabular-nums">{{ weightSum.toFixed(2) }}</strong>
          </p>

          <div class="mt-2 space-y-1">
            <div v-for="indicator in template.indicators" :key="indicator.key">
              <RangeSlider
                :model-value="intel.weights[indicator.key] ?? 0"
                :label="indicator.label"
                :min="0"
                :max="1"
                :step="0.05"
                :display-value="`${Math.round((intel.normalizedWeights[indicator.key] ?? 0) * 100)} % del puntaje`"
                @update:model-value="(value) => onWeightChange(indicator.key, value)"
              />
              <HowCalculated
                class="mb-2"
                :formula="indicator.formula"
                :direction="indicator.direction"
                :unit="indicator.unit"
                :glossary-id="indicator.glossaryId"
                :sources="intel.meta.sources"
              />
            </div>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <BaseButton variant="ghost" size="sm" @click="intel.resetWeights()">
              Volver a los pesos por omisión
            </BaseButton>
          </div>
        </BaseCard>

        <BaseCard title="3. Define el ámbito" :heading-level="2">
          <p class="text-sm text-slate-700">
            Dibuja en el mapa la región donde buscas, o elige un municipio con las herramientas de
            dibujo.
          </p>

          <label class="mt-3 block text-sm font-medium text-slate-800" for="intel-res">
            Tamaño de celda
          </label>
          <select id="intel-res" v-model.number="intel.resolution" class="tc-input mt-1">
            <option :value="7">Grande (~5 km², visión regional)</option>
            <option :value="8">Media (~0,7 km², recomendada)</option>
            <option :value="9">Fina (~0,1 km², nivel de barrio)</option>
          </select>

          <BaseButton
            class="mt-3"
            :disabled="!intel.scope"
            :loading="intel.isRunning"
            block
            @click="run"
          >
            Calcular el mapa de calor
          </BaseButton>

          <p v-if="!intel.scope" class="mt-1 text-xs text-amber-800">
            Dibuja primero la zona de búsqueda en el mapa.
          </p>

          <p v-if="intel.error" class="mt-2 text-sm text-rose-800" role="alert">
            {{ intel.error.message }}
          </p>
        </BaseCard>

        <JobProgress
          :status="job.status.value"
          :progress="job.progress.value"
          :stage="job.stage.value"
          :error-message="job.error.value?.message ?? null"
          @cancel="job.stop()"
        />
      </div>

      <!-- ── Mapa de calor + top zonas ──────────────────────────────────────── -->
      <div class="space-y-3">
        <div class="h-[26rem]">
          <MapView
            height="100%"
            show-draw-tools
            :draw-modes="['polygon', 'municipality']"
            :heat-cells="cells"
            :overlay="overlay"
            @draw-change="onDrawChange"
          />
        </div>

        <BaseCard
          :title="`4. Zonas con mayor oportunidad (${topZones.length})`"
          :heading-level="2"
          :padded="false"
        >
          <EmptyState
            v-if="topZones.length === 0"
            title="Aún no hay zonas calculadas"
            body="Dibuja el ámbito, ajusta los pesos y pulsa «Calcular el mapa de calor»."
            icon="map"
          />

          <ul v-else class="divide-y divide-slate-100">
            <li v-for="zone in topZones" :key="zone.id">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-muted"
                :aria-expanded="selectedZoneId === zone.id"
                @click="selectedZoneId = selectedZoneId === zone.id ? null : zone.id"
              >
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium">{{ zone.label }}</span>
                  <span class="block text-xs text-slate-500">
                    {{ zone.cellCount }} celdas ·
                    {{ zone.candidateParcels.length }} predios candidatos
                  </span>
                </span>
                <BaseBadge tone="brand">{{ Math.round(zone.score) }}/100</BaseBadge>
              </button>

              <!-- Paso 5: predios candidatos dentro de la zona. -->
              <div v-if="selectedZoneId === zone.id" class="border-t border-slate-100 bg-surface-muted px-4 py-3">
                <p v-if="zone.candidateParcels.length === 0" class="text-sm text-slate-600">
                  Esta zona no tiene predios candidatos. Puede que el municipio no tenga catastro
                  abierto: revisa el aviso de cobertura.
                </p>

                <table v-else class="tc-table">
                  <caption class="sr-only">Predios candidatos en {{ zone.label }}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Código predial</th>
                      <th scope="col">Área</th>
                      <th scope="col">Destino</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="parcelRow in zone.candidateParcels.slice(0, 20)"
                      :key="parcelRow.npn"
                      class="cursor-pointer hover:bg-white"
                      @click="$router.push({ name: 'parcel', params: { npn: parcelRow.npn } })"
                    >
                      <th scope="row" class="font-mono text-xs font-normal">{{ parcelRow.npn }}</th>
                      <td class="tabular-nums">
                        {{
                          parcelRow.areaM2 === null
                            ? MESSAGES.common.notAvailable
                            : formatArea(parcelRow.areaM2)
                        }}
                      </td>
                      <td>{{ parcelRow.economicUse ?? MESSAGES.common.notAvailable }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </li>
          </ul>

          <template #footer>
            <ProvenanceFooter :meta="intel.meta" compact />
          </template>
        </BaseCard>

        <!-- Explicabilidad: de dónde sale el puntaje de la mejor celda. -->
        <BaseCard v-if="bestCell" title="Cómo se formó el puntaje" :heading-level="2">
          <CollapsibleSection
            :title="`Celda con mayor puntaje (${Math.round(bestCell.score)}/100)`"
            open
          >
            <table class="tc-table">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Aporte al puntaje</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in breakdownOf(bestCell)" :key="row.label">
                  <th scope="row" class="font-normal">{{ row.label }}</th>
                  <td class="tabular-nums">
                    {{ row.raw === null ? MESSAGES.common.notAvailable : row.raw.toFixed(2) }}
                  </td>
                  <td class="tabular-nums">
                    {{ row.weighted === null ? MESSAGES.common.notAvailable : row.weighted.toFixed(1) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </CollapsibleSection>

          <p class="mt-3 text-xs text-slate-600">
            El puntaje no es una recomendación: es la suma de los indicadores que tú ponderaste.
            Cambia los pesos y cambiará el orden de las zonas.
          </p>
        </BaseCard>

        <ResultActionBar
          v-if="result"
          :share-url="shareUrl()"
          share-title="Localización de negocio en TerraColombia"
          :formats="['pdf', 'xlsx', 'csv', 'geojson']"
          @save="$router.push('/proyectos')"
        />
      </div>
    </div>
  </div>
</template>
