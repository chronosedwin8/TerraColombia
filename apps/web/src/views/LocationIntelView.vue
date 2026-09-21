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
import FactorList from '@/components/FactorList.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
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

/**
 * Celda de mayor puntaje. Se busca por `rank === 1` en vez de tomar la primera del arreglo:
 * `cells` viene en el orden en que se calculó, no ordenado por puntaje.
 */
const bestCell = computed<ScoredCell | null>(
  () => cells.value.find((cell) => cell.rank === 1) ?? null,
);

/**
 * Pesos que el backend aplicó de verdad, renormalizados a 1 (`weightsApplied`).
 * Mientras no haya resultado se muestran los del formulario, también normalizados.
 */
const appliedWeights = computed<Record<string, number>>(
  () => result.value?.weightsApplied ?? intel.normalizedWeights,
);
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
            {{ item.indicators.length }} indicadores · {{ item.hardFilters.length }} filtros duros
          </p>
        </button>
      </div>

      <template v-if="intel.templatesNote" #footer>
        <p class="text-xs text-slate-600">{{ intel.templatesNote }}</p>
      </template>
    </BaseCard>

    <div v-if="template" class="grid gap-3 lg:grid-cols-[24rem_1fr]">
      <!-- ── Paso 2: pesos ──────────────────────────────────────────────────── -->
      <div class="space-y-3">
        <BaseCard :title="`2. Ajusta los pesos de ${template.name}`" :heading-level="2">
          <p class="text-xs text-slate-600">
            Lo que cuenta es la proporción entre pesos, no su suma: los normalizamos a 1 antes de
            calcular. Suma actual: <strong class="tabular-nums">{{ weightSum.toFixed(2) }}</strong>
          </p>

          <div class="mt-2 space-y-2">
            <RangeSlider
              v-for="indicator in template.indicators"
              :key="indicator.indicator"
              :model-value="intel.weights[indicator.indicator] ?? 0"
              :label="intel.labelForIndicator(indicator.indicator)"
              :min="0"
              :max="1"
              :step="0.05"
              :display-value="`${Math.round((appliedWeights[indicator.indicator] ?? 0) * 100)} % del puntaje`"
              :hint="indicator.rationale"
              @update:model-value="(value) => onWeightChange(indicator.indicator, value)"
            />
          </div>

          <!--
            Regla 6 (cobertura honesta): la plantilla solo trae identificador, peso y
            justificación. La fórmula, la unidad, la dirección y las fuentes de cada
            indicador llegan por celda al calcular, no antes: no las inventamos aquí.
          -->
          <p class="mt-2 text-xs text-slate-500">
            La fórmula, la unidad y las fuentes de cada indicador se muestran en el desglose de la
            celda, una vez calculado el mapa: la plantilla no las trae.
          </p>

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
          :progress-message="job.progressMessage.value"
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
          <!-- Cobertura honesta: el recuento se muestra siempre que haya cálculo, y el vacío
               distingue «no has calculado» de «calculé y no salió ninguna zona». -->
          <p v-if="result" class="px-4 pt-3 text-xs text-slate-500">
            {{ result.cellsEvaluated }} celdas evaluadas ·
            {{ result.cellsExcluded }} descartadas por los filtros duros de la plantilla.
          </p>

          <EmptyState
            v-if="topZones.length === 0"
            :title="result ? 'El cálculo no agrupó ninguna zona' : 'Aún no hay zonas calculadas'"
            :body="
              result
                ? (result.emptyReason ??
                  'Las zonas se forman con celdas contiguas bien puntuadas. Con tan pocas celdas con dato no hay ninguna que destacar: prueba un ámbito más grande o un tamaño de celda más fino.')
                : 'Dibuja el ámbito, ajusta los pesos y pulsa «Calcular el mapa de calor».'
            "
            icon="map"
          />

          <template v-else>
            <ul class="divide-y divide-slate-100">
              <li v-for="zone in topZones" :key="zone.id">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-muted"
                  :aria-expanded="selectedZoneId === zone.id"
                  @click="selectedZoneId = selectedZoneId === zone.id ? null : zone.id"
                >
                  <span class="min-w-0">
                    <!-- La zona no trae nombre: se identifica por su posición en el ranking. -->
                    <span class="block text-sm font-medium">Zona {{ zone.rank }}</span>
                    <span class="block truncate text-xs text-slate-500">
                      {{ zone.cellCount }} celdas
                      <template v-if="zone.areaKm2 !== null">
                        · {{ zone.areaKm2.toFixed(2) }} km²
                      </template>
                      · confianza {{ Math.round(zone.confidenceMean * 100) }} %
                    </span>
                  </span>
                  <BaseBadge tone="brand">{{ Math.round(zone.scoreMean) }}/100</BaseBadge>
                </button>

                <div
                  v-if="selectedZoneId === zone.id"
                  class="border-t border-slate-100 bg-surface-muted px-4 py-3"
                >
                  <p class="text-sm text-slate-700">{{ zone.summary }}</p>

                  <p class="mt-2 text-xs text-slate-600">
                    Puntaje de las celdas: mínimo {{ Math.round(zone.scoreMin) }}, medio
                    {{ Math.round(zone.scoreMean) }}, máximo {{ Math.round(zone.scoreMax) }} de 100.
                  </p>

                  <table v-if="zone.factors.length > 0" class="tc-table mt-3">
                    <caption class="sr-only">
                      Indicadores que explican el puntaje de la zona
                      {{
                        zone.rank
                      }}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Indicador</th>
                        <th scope="col">Puntaje medio</th>
                        <th scope="col">Peso aplicado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="factor in zone.factors" :key="factor.indicator">
                        <th scope="row" class="font-normal">{{ factor.label }}</th>
                        <td class="tabular-nums">{{ Math.round(factor.scoreMean) }}/100</td>
                        <td class="tabular-nums">{{ Math.round(factor.weight * 100) }} %</td>
                      </tr>
                    </tbody>
                  </table>

                  <!--
                  Regla 6: se dice qué no podemos mostrar y por qué, en vez de dejar una
                  tabla vacía. La zona no trae predios: el API no devuelve predios por zona.
                -->
                  <p class="mt-3 text-xs text-slate-600">
                    El listado de predios candidatos de la zona no viene en esta respuesta. Para
                    verlos, usa la
                    <RouterLink class="underline" to="/buscar">búsqueda avanzada</RouterLink>
                    acotando la consulta a este ámbito.
                  </p>
                </div>
              </li>
            </ul>
          </template>

          <template #footer>
            <ProvenanceFooter :meta="intel.meta" compact />
          </template>
        </BaseCard>

        <!-- Explicabilidad: de dónde sale el puntaje de la mejor celda. -->
        <BaseCard v-if="bestCell" title="Cómo se formó el puntaje" :heading-level="2">
          <CollapsibleSection
            :title="`Celda con mayor puntaje (${bestCell.score === null ? 'sin puntaje' : `${Math.round(bestCell.score)}/100`})`"
            open
          >
            <!-- El desglose por celda se llama `factors` y es un FactorScore completo:
                 trae etiqueta, valor crudo, fórmula, fuentes y explicación. -->
            <FactorList :factors="bestCell.factors" :sources="intel.meta.sources" />

            <p v-if="bestCell.missing.length > 0" class="mt-3 text-xs text-slate-600">
              Sin dato en esta celda: {{ bestCell.missing.join(', ') }}. El puntaje se calculó solo
              con los indicadores que sí tenían dato (confianza
              {{ Math.round(bestCell.confidence * 100) }} %).
            </p>
          </CollapsibleSection>

          <p v-if="result?.explanation" class="mt-3 text-sm leading-relaxed text-slate-700">
            {{ result.explanation }}
          </p>

          <p class="mt-3 text-xs text-slate-600">
            El puntaje no es una recomendación: es la suma ponderada de los indicadores que tú
            elegiste. Cambia los pesos y cambiará el orden de las zonas.
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
