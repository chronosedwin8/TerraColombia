<script setup lang="ts">
/**
 * Cambio territorial (pantalla 7 de §10.2, módulo M8).
 *
 * Dos cortes de la base catastral y la lista de cambios: predios nuevos, bajas, cambios de
 * atributos y de geometría, y construcciones añadidas o retiradas.
 *
 * NO hay deslizador antes/después. `POST /changes/compare` devuelve el resumen por tipo y la
 * lista de cambios por NPN, pero **no** las geometrías de cada corte: pintar un antes/después
 * exigiría inventar los polígonos. Se dice en pantalla en vez de simularlo (regla 6).
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  AppError,
  MESSAGES,
  type AreaScope,
  type ChangeCompare,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
  type ResponseMeta,
} from '@terracolombia/shared';
import { compareChanges, getAvailableCuts } from '@/api/changes';
import { emptyMeta } from '@/api/client';
import { useJob } from '@/composables/useJob';
import { jsonCodec, listCodec, stringCodec, useUrlState } from '@/composables/useUrlState';
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
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const job = useJob<ChangeCompareResult>();

type BadgeTone = 'success' | 'danger' | 'info' | 'warning' | 'brand';

/**
 * Los seis tipos que detecta el backend (`ParcelChangeType`); faltaba `building_removed`.
 * Las redacciones son las mismas que devuelve la API en `label`/`changeLabel`, para que el
 * filtro y el resumen no se contradigan; cuando la respuesta trae su etiqueta, manda la suya.
 */
const CHANGE_LABELS: Record<ParcelChangeType, string> = {
  created: 'Predios nuevos',
  removed: 'Predios que desaparecieron',
  attrs_changed: 'Cambios en los datos del predio',
  geometry_changed: 'Cambios en la forma o el tamaño del predio',
  building_added: 'Construcciones nuevas',
  building_removed: 'Construcciones que desaparecieron',
};

const CHANGE_TONES: Record<ParcelChangeType, BadgeTone> = {
  created: 'success',
  removed: 'danger',
  attrs_changed: 'info',
  geometry_changed: 'warning',
  building_added: 'brand',
  building_removed: 'warning',
};

const ALL_TYPES: ParcelChangeType[] = [
  'created',
  'removed',
  'attrs_changed',
  'geometry_changed',
  'building_added',
  'building_removed',
];

/*
 * Los seis tipos se pueden pedir al servidor. El DSL solo aceptaba cinco —`building_removed`
 * quedaba fuera aunque la base lo guarda y la API lo etiqueta—, así que ese filtro existía
 * en la tabla pero no en la consulta. Ahora la lista sale de `PARCEL_CHANGE_TYPES`, que es la
 * misma que valida el DSL.
 */
function isKnownType(type: string): type is ParcelChangeType {
  return (ALL_TYPES as string[]).includes(type);
}

/**
 * El `changeType` de cada fila llega como texto libre: si el backend añadiera un tipo nuevo,
 * se pinta en tono neutro en vez de romper la tabla.
 */
function toneFor(type: string): BadgeTone {
  return isKnownType(type) ? CHANGE_TONES[type] : 'info';
}

const { state, shareUrl } = useUrlState({
  desde: { default: '', codec: stringCodec },
  hasta: { default: '', codec: stringCodec },
  tipos: { default: [] as string[], codec: listCodec },
  ambito: { default: null as AreaScope | null, codec: jsonCodec<AreaScope>() },
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
      changeTypes: state.tipos.filter(isKnownType),
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
 * El mapa solo pinta el ámbito dibujado. La comparación no devuelve geometrías por corte,
 * así que no hay nada fiel que superponer: cualquier "antes/después" sería inventado.
 */
const overlay = computed<GeoJsonFeatureCollection | null>(() =>
  drawnGeometry.value
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: drawnGeometry.value, properties: {} }],
      }
    : null,
);

/** La lista de cambios se llama `changes`, no `items`. */
const changes = computed(() => {
  const all = result.value?.changes ?? [];
  return activeType.value === 'all'
    ? all
    : all.filter((item) => item.changeType === activeType.value);
});

/**
 * El resumen es un arreglo de filas por tipo, con su propia etiqueta y explicación.
 * Verificado en vivo: incluye los cinco tipos aunque su conteo sea 0.
 */
const summaryRows = computed(() => result.value?.summary ?? []);
const totalChanges = computed(() =>
  summaryRows.value.reduce((total, row) => total + row.count, 0),
);
/*
 * Los cortes que EXISTEN, no una fecha cualquiera.
 *
 * Antes eran dos campos de texto libre con un `datalist` que nunca se llenaba (nadie escribía
 * `mapStore.availableCutDates`), así que el usuario tenía que adivinar una fecha con formato
 * AAAA-MM-DD y acertar además un corte cargado. Un calendario tampoco sirve: solo se puede
 * comparar contra los cortes que tenemos publicados —hoy dos—, y ofrecer los 365 días del año
 * es ofrecer 363 respuestas vacías. Se eligen de una lista y no hay forma de equivocarse.
 */
const cutDates = ref<string[]>([]);
const comparablePairs = ref<Array<{ from: string; to: string }>>([]);
const cutsReason = ref<string | null>(null);

/** «2026-08-31» → «31 de agosto de 2026», que es como se lee una fecha en español. */
function cutLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Cortes que pueden ir como «anterior», dado el reciente elegido, y viceversa. */
const opcionesDesde = computed(() => cutDates.value.filter((c) => !state.hasta || c < state.hasta));
const opcionesHasta = computed(() => cutDates.value.filter((c) => !state.desde || c > state.desde));

const puedeCompararse = computed(() => comparablePairs.value.length > 0);

onMounted(async () => {
  try {
    const { data } = await getAvailableCuts();
    // De más antiguo a más reciente: así se leen los desplegables.
    cutDates.value = [...data.cuts].sort();
    comparablePairs.value = data.comparablePairs;
    cutsReason.value = data.emptyReason;
    // Con un solo par posible no tiene sentido hacer elegir: se deja puesto.
    const ultimo = data.comparablePairs.at(-1);
    if (ultimo && !state.desde && !state.hasta) {
      state.desde = ultimo.from;
      state.hasta = ultimo.to;
    }
  } catch {
    cutsReason.value = 'No pudimos consultar qué cortes hay cargados. Vuelve a intentarlo.';
  }
});

/** Solape de geometrías (IoU) en porcentaje, cuando el cambio es geométrico. */
function overlapPct(overlap: number | null): string | null {
  return overlap === null ? null : `${Math.round(overlap * 100)} %`;
}
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
            <BaseField label="Corte anterior" hint="Solo los cortes que tenemos cargados">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  v-model="state.desde"
                  class="tc-input"
                  :disabled="!puedeCompararse"
                  :aria-describedby="describedBy"
                >
                  <option value="">Elige un corte…</option>
                  <option v-for="date in opcionesDesde" :key="date" :value="date">
                    {{ cutLabel(date) }}
                  </option>
                </select>
              </template>
            </BaseField>

            <BaseField label="Corte más reciente">
              <template #default="{ id }">
                <select
                  :id="id"
                  v-model="state.hasta"
                  class="tc-input"
                  :disabled="!puedeCompararse"
                >
                  <option value="">Elige un corte…</option>
                  <option v-for="date in opcionesHasta" :key="date" :value="date">
                    {{ cutLabel(date) }}
                  </option>
                </select>
              </template>
            </BaseField>

            <p v-if="!puedeCompararse" class="text-xs text-amber-800" role="note">
              {{
                cutsReason ??
                `Todavía no hay dos cortes catastrales que comparar: tenemos ${cutDates.length === 1 ? 'uno solo' : 'ninguno'}. El comparador se activa cuando el IGAC publique el siguiente y lo carguemos.`
              }}
            </p>

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
          :progress-message="job.progressMessage.value"
          :error-message="job.error.value?.message ?? null"
          @cancel="job.stop()"
        />

        <BaseCard v-if="result" title="Resumen de cambios" :heading-level="2">
          <p class="text-xs text-slate-600">
            {{ result.fromCutDate }} → {{ result.toCutDate }} · {{ result.areaKm2.toFixed(2) }} km²
            comparados
          </p>

          <!-- Un total de 0 se dice con palabras: una lista de ceros no se explica sola. -->
          <p v-if="summaryRows.length > 0 && totalChanges === 0" class="mt-2 text-sm text-slate-700">
            Entre esos dos cortes no encontramos ningún cambio en el área comparada. Comprueba que
            los dos cortes existan y que la comparación ya se haya procesado para ese par.
          </p>

          <ul v-if="summaryRows.length > 0" class="mt-2 space-y-1.5">
            <li v-for="row in summaryRows" :key="row.changeType">
              <div class="flex items-center justify-between gap-2 text-sm">
                <span>{{ row.label }}</span>
                <BaseBadge :tone="toneFor(row.changeType)">{{ row.count }}</BaseBadge>
              </div>
              <p v-if="row.explanation" class="text-xs leading-snug text-slate-600">
                {{ row.explanation }}
              </p>
            </li>
          </ul>

          <p v-else class="mt-2 text-sm text-slate-600">
            La comparación no devolvió resumen por tipo para esta zona.
          </p>

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

        <!--
          Regla 6: se explica qué no se puede pintar y por qué, en lugar de dejar un mapa
          que parezca mostrar el antes/después sin serlo.
        -->
        <p
          v-if="result"
          class="rounded-md border border-slate-200 bg-surface-muted p-3 text-xs text-slate-700"
        >
          El mapa muestra el área comparada, no un antes/después: la comparación devuelve los
          cambios por código predial, sin las geometrías de cada corte. Para ver cómo quedó un
          predio en cada fecha, abre su ficha y consulta su línea de tiempo.
        </p>

        <BaseCard
          :title="`Cambios detectados (${changes.length})`"
          :heading-level="2"
          :padded="false"
        >
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
            v-else-if="changes.length === 0"
            title="No hubo cambios de este tipo"
            body="En el área y las fechas elegidas no encontramos cambios. Prueba con un periodo más largo o con otro tipo de cambio."
            icon="data"
          />

          <template v-else>
            <p v-if="result.truncated" class="px-4 pt-3 text-xs text-amber-800" role="status">
              La lista llegó al límite de la consulta: hay más cambios de los que se muestran.
              Reduce el área o filtra por un tipo para verlos todos.
            </p>

            <div class="max-h-[26rem] overflow-auto">
              <table class="tc-table">
                <caption class="sr-only">
                  Cambios entre
                  {{
                    result.fromCutDate
                  }}
                  y
                  {{
                    result.toCutDate
                  }}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Código predial</th>
                    <th scope="col">Cambio</th>
                    <th scope="col">Continuidad de la geometría</th>
                    <th scope="col">Detectado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in changes"
                    :key="`${item.npn}-${item.changeType}`"
                    class="cursor-pointer hover:bg-surface-muted"
                    @click="$router.push({ name: 'parcel', params: { npn: item.npn } })"
                  >
                    <th scope="row" class="whitespace-nowrap font-mono text-xs font-normal">
                      {{ item.npn }}
                    </th>
                    <td>
                      <!-- La etiqueta en español la redacta el backend (`changeLabel`). -->
                      <BaseBadge :tone="toneFor(item.changeType)" size="sm">
                        {{ item.changeLabel }}
                      </BaseBadge>
                    </td>
                    <td class="tabular-nums">
                      <!-- Las áreas por corte no vienen en esta respuesta; el solape sí. -->
                      {{ overlapPct(item.geometryOverlap) ?? MESSAGES.common.notAvailable }}
                    </td>
                    <td class="whitespace-nowrap text-xs text-slate-600">
                      {{ item.detectedAt.slice(0, 10) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

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
