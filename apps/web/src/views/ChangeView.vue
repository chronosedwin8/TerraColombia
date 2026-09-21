<script setup lang="ts">
/**
 * Cambio territorial (pantalla 7 de §10.2, módulo M8).
 *
 * Dos cortes de la base catastral, un deslizador antes/después y la lista de cambios:
 * predios nuevos, bajas, englobes y desenglobes, cambios de geometría y construcciones nuevas.
 *
 * El deslizador no mezcla datos: muestra la geometría del corte A o la del corte B según la
 * posición, con la fecha siempre visible para que nadie confunda un corte con otro.
 */
import { computed, ref, watch } from 'vue';
import {
  AppError,
  MESSAGES,
  formatArea,
  type AreaScope,
  type ChangeCompare,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
  type ResponseMeta,
} from '@terracolombia/shared';
import { compareChanges } from '@/api/changes';
import { emptyMeta } from '@/api/client';
import { useJob } from '@/composables/useJob';
import { intCodec, jsonCodec, listCodec, stringCodec, useUrlState } from '@/composables/useUrlState';
import { useMapStore } from '@/stores/map';
import type { ChangeCompareResult, ParcelChangeType } from '@/api/types';
import MapView from '@/map/MapView.vue';
import JobProgress from '@/components/JobProgress.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const mapStore = useMapStore();
const job = useJob<ChangeCompareResult>();

const CHANGE_LABELS: Record<ParcelChangeType, string> = {
  created: 'Predios nuevos',
  removed: 'Predios dados de baja',
  attrs_changed: 'Cambios de atributos',
  geometry_changed: 'Cambios de geometría',
  building_added: 'Construcciones nuevas',
};

const CHANGE_TONES: Record<ParcelChangeType, 'success' | 'danger' | 'info' | 'warning' | 'brand'> = {
  created: 'success',
  removed: 'danger',
  attrs_changed: 'info',
  geometry_changed: 'warning',
  building_added: 'brand',
};

const ALL_TYPES: ParcelChangeType[] = [
  'created',
  'removed',
  'attrs_changed',
  'geometry_changed',
  'building_added',
];

const { state, shareUrl } = useUrlState({
  desde: { default: '', codec: stringCodec },
  hasta: { default: '', codec: stringCodec },
  tipos: { default: [] as string[], codec: listCodec },
  ambito: { default: null as AreaScope | null, codec: jsonCodec<AreaScope>() },
  /** Posición del deslizador antes/después, 0–100. No afecta a los datos. */
  corte: { default: 50, codec: intCodec },
});

const drawnGeometry = ref<GeoJsonGeometry | null>(null);
const result = ref<ChangeCompareResult | null>(null);
const meta = ref<ResponseMeta>(emptyMeta());
const isLoading = ref(false);
const error = ref<AppError | null>(null);
const activeType = ref<ParcelChangeType | 'all'>('all');

function onDrawChange(collection: GeoJsonFeatureCollection | null): void {
  const geometry = collection?.features[0]?.geometry ?? null;
  drawnGeometry.value = geometry;
  state.ambito = geometry ? { kind: 'polygon', geometry } : null;
}

const canCompare = computed(
  () =>
    state.ambito !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(state.desde) &&
    /^\d{4}-\d{2}-\d{2}$/.test(state.hasta) &&
    state.desde < state.hasta,
);

async function compare(): Promise<void> {
  if (!canCompare.value || !state.ambito) return;
  isLoading.value = true;
  error.value = null;
  try {
    const body: ChangeCompare = {
      scope: state.ambito,
      fromCutDate: state.desde,
      toCutDate: state.hasta,
      changeTypes: state.tipos.filter((type): type is ParcelChangeType =>
        (ALL_TYPES as string[]).includes(type),
      ),
      limit: 500,
    };
    const response = await compareChanges(body);
    if ('jobId' in response.data && 'status' in response.data) {
      job.track(response.data.jobId);
    } else {
      result.value = response.data;
      meta.value = response.meta;
    }
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
    result.value = null;
  } finally {
    isLoading.value = false;
  }
}

watch(job.result, (value) => {
  if (value) result.value = value;
});

/**
 * Qué geometría se pinta: por debajo del 50 % el corte A ("antes"), por encima el corte B
 * ("después"). Nunca se superponen para no dar la impresión de un dato intermedio inventado.
 */
const showsAfter = computed(() => state.corte >= 50);

const overlay = computed<GeoJsonFeatureCollection | null>(() => {
  if (result.value) {
    const side = showsAfter.value ? result.value.after : result.value.before;
    if (side) return side;
  }
  if (drawnGeometry.value) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: drawnGeometry.value, properties: {} }],
    };
  }
  return null;
});

const items = computed(() => {
  const all = result.value?.items ?? [];
  return activeType.value === 'all' ? all : all.filter((item) => item.changeType === activeType.value);
});

const counts = computed(() => result.value?.counts ?? null);
const cutDates = computed(() => mapStore.availableCutDates);
</script>

<template>
  <div class="mx-auto max-w-[110rem] space-y-3 p-3">
    <SyntheticDataBanner :meta="meta" />

    <header>
      <h1 class="text-xl font-semibold">Cambio territorial</h1>
      <p class="mt-0.5 text-sm text-slate-600">
        Compara dos <GlossaryTerm id="snapshot" label="fechas de corte" /> de la base catastral y
        mira qué cambió: predios nuevos, <GlossaryTerm id="englobe" />, cambios de geometría y
        construcciones nuevas.
      </p>
    </header>

    <div class="grid gap-3 lg:grid-cols-[22rem_1fr]">
      <div class="space-y-3">
        <BaseCard title="Qué comparar" :heading-level="2">
          <div class="space-y-3">
            <BaseField label="Corte anterior" hint="Formato AAAA-MM-DD">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="state.desde"
                  class="tc-input"
                  list="cortes-disponibles"
                  placeholder="2025-01-01"
                  :aria-describedby="describedBy"
                />
              </template>
            </BaseField>

            <BaseField label="Corte más reciente">
              <template #default="{ id }">
                <input
                  :id="id"
                  v-model="state.hasta"
                  class="tc-input"
                  list="cortes-disponibles"
                  placeholder="2025-07-01"
                />
              </template>
            </BaseField>

            <datalist id="cortes-disponibles">
              <option v-for="date in cutDates" :key="date" :value="date" />
            </datalist>

            <fieldset>
              <legend class="tc-label mb-1.5">Tipos de cambio (ninguno = todos)</legend>
              <label
                v-for="type in ALL_TYPES"
                :key="type"
                class="flex items-center gap-2 py-0.5 text-sm"
              >
                <input
                  v-model="state.tipos"
                  type="checkbox"
                  :value="type"
                  class="h-4 w-4 accent-brand-600"
                />
                {{ CHANGE_LABELS[type] }}
              </label>
            </fieldset>

            <p class="text-xs text-slate-600">
              Dibuja en el mapa el área a comparar. Comparar un país completo no es viable: el
              backend lo rechazaría.
            </p>

            <BaseButton :disabled="!canCompare" :loading="isLoading" block @click="compare">
              Comparar cortes
            </BaseButton>

            <p v-if="!canCompare" class="text-xs text-amber-800">
              Necesitamos un área dibujada y dos fechas válidas, con la primera anterior a la
              segunda.
            </p>

            <p v-if="error" class="text-sm text-rose-800" role="alert">{{ error.message }}</p>
          </div>
        </BaseCard>

        <JobProgress
          :status="job.status.value"
          :progress="job.progress.value"
          :stage="job.stage.value"
          :error-message="job.error.value?.message ?? null"
          @cancel="job.stop()"
        />

        <BaseCard v-if="counts" title="Resumen de cambios" :heading-level="2">
          <ul class="space-y-1.5">
            <li
              v-for="type in ALL_TYPES"
              :key="type"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <span>{{ CHANGE_LABELS[type] }}</span>
              <BaseBadge :tone="CHANGE_TONES[type]">{{ counts[type] ?? 0 }}</BaseBadge>
            </li>
          </ul>
          <template #footer>
            <ProvenanceFooter :meta="meta" compact />
          </template>
        </BaseCard>
      </div>

      <div class="space-y-3">
        <div class="h-[26rem]">
          <MapView
            height="100%"
            show-draw-tools
            :draw-modes="['polygon', 'municipality']"
            :overlay="overlay"
            @draw-change="onDrawChange"
          />
        </div>

        <!-- Deslizador antes/después: la fecha mostrada es siempre explícita. -->
        <BaseCard v-if="result" title="Antes y después" :heading-level="2">
          <RangeSlider
            :model-value="state.corte"
            label="Mover para pasar de un corte al otro"
            :min="0"
            :max="100"
            :step="1"
            :display-value="
              showsAfter ? `Después · ${result.toCutDate}` : `Antes · ${result.fromCutDate}`
            "
            hint="Cada posición muestra un corte completo. No mezclamos datos de dos fechas."
            @update:model-value="(value) => (state.corte = value)"
          />

          <div class="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>{{ result.fromCutDate }}</span>
            <span>{{ result.toCutDate }}</span>
          </div>
        </BaseCard>

        <BaseCard :title="`Cambios detectados (${items.length})`" :heading-level="2" :padded="false">
          <template #actions>
            <select
              v-model="activeType"
              class="tc-input text-xs"
              aria-label="Filtrar por tipo de cambio"
            >
              <option value="all">Todos los tipos</option>
              <option v-for="type in ALL_TYPES" :key="type" :value="type">
                {{ CHANGE_LABELS[type] }}
              </option>
            </select>
          </template>

          <LoadingSkeleton v-if="isLoading" :lines="6" class="p-4" />

          <EmptyState
            v-else-if="!result"
            title="Todavía no has comparado nada"
            body="Elige dos cortes, dibuja el área y pulsa «Comparar cortes»."
            icon="data"
          />

          <EmptyState
            v-else-if="items.length === 0"
            title="No hubo cambios de este tipo"
            body="En el área y las fechas elegidas no encontramos cambios. Prueba con un periodo más largo o con otro tipo de cambio."
            icon="data"
          />

          <div v-else class="max-h-[26rem] overflow-auto">
            <table class="tc-table">
              <caption class="sr-only">
                Cambios entre {{ result.fromCutDate }} y {{ result.toCutDate }}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Código predial</th>
                  <th scope="col">Cambio</th>
                  <th scope="col">Área antes</th>
                  <th scope="col">Área después</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in items"
                  :key="`${item.npn}-${item.changeType}`"
                  class="cursor-pointer hover:bg-surface-muted"
                  @click="$router.push({ name: 'parcel', params: { npn: item.npn } })"
                >
                  <th scope="row" class="whitespace-nowrap font-mono text-xs font-normal">
                    {{ item.npn }}
                  </th>
                  <td>
                    <BaseBadge :tone="CHANGE_TONES[item.changeType]" size="sm">
                      {{ CHANGE_LABELS[item.changeType] }}
                    </BaseBadge>
                    <p class="mt-0.5 text-xs text-slate-600">{{ item.label }}</p>
                  </td>
                  <td class="tabular-nums">
                    {{
                      item.areaBeforeM2 === null
                        ? MESSAGES.common.notAvailable
                        : formatArea(item.areaBeforeM2)
                    }}
                  </td>
                  <td class="tabular-nums">
                    {{
                      item.areaAfterM2 === null
                        ? MESSAGES.common.notAvailable
                        : formatArea(item.areaAfterM2)
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <template #footer>
            <ProvenanceFooter :meta="meta" compact />
          </template>
        </BaseCard>

        <ResultActionBar
          v-if="result"
          :share-url="shareUrl()"
          share-title="Cambio territorial en TerraColombia"
          :formats="['pdf', 'xlsx', 'csv', 'geojson']"
          :can-compare="false"
          @save="$router.push('/proyectos')"
        />
      </div>
    </div>
  </div>
</template>
