<script setup lang="ts">
/**
 * Observatorio municipal (pantalla 8 de §10.2, módulo M9).
 *
 * Indicadores agregados, puesto nacional y series por periodo. Cada indicador trae su fórmula
 * y sus datasets: un ranking sin fórmula visible es una opinión disfrazada de dato.
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import type { EChartsOption } from 'echarts';
import { AppError, MESSAGES, type ResponseMeta } from '@terracolombia/shared';
import { getIndicators } from '@/api/indicators';
import { getMunicipality, listDepartments, listMunicipalities } from '@/api/municipalities';
import { emptyMeta } from '@/api/client';
import { stringCodec, useUrlState } from '@/composables/useUrlState';
import type {
  MunicipalIndicators,
  MunicipalityDetail,
  MunicipalityListItem,
} from '@/api/types';
import PlaceSelect, { type PlaceOption } from '@/components/ui/PlaceSelect.vue';
import ChartCard from '@/components/ChartCard.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CoverageNotice from '@/components/ui/CoverageNotice.vue';
import DataValue from '@/components/ui/DataValue.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ExplainButton from '@/components/ui/ExplainButton.vue';
import HowCalculated from '@/components/ui/HowCalculated.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const props = withDefaults(defineProps<{ muniCode?: string }>(), { muniCode: undefined });

const { state, shareUrl } = useUrlState({
  municipio: { default: '', codec: stringCodec },
});

/*
 * Las listas completas se traen una vez al abrir la pantalla: son 33 departamentos y 1.122
 * municipios, pesan poco y permiten buscar por nombre sin ir al servidor en cada tecla.
 *
 * Antes aquí había un campo de texto que pedía «nombre o código DIVIPOLA». Nadie se sabe el
 * código de su municipio, y escribir el nombre obligaba a acertar la tilde y la grafía
 * oficial («Santa Cruz de Mompox», no «Mompós»). Ahora se elige de una lista.
 */
const departamentos = shallowRef<PlaceOption[]>([]);
const municipios = shallowRef<MunicipalityListItem[]>([]);
const errorListas = ref<string | null>(null);
const departamentoElegido = ref('');

const indicators = ref<MunicipalIndicators | null>(null);
const indicatorsMeta = ref<ResponseMeta>(emptyMeta());
const municipality = ref<MunicipalityDetail | null>(null);
const municipalityMeta = ref<ResponseMeta>(emptyMeta());
const isLoading = ref(false);
const error = ref<AppError | null>(null);

/**
 * El código del path manda; si no viene, se usa el de la query.
 * Un parámetro opcional de ruta puede llegar como cadena vacía, así que se valida la longitud
 * en vez de confiar en `??`.
 */
const activeCode = computed<string | null>(() => {
  const fromPath = props.muniCode ?? '';
  if (fromPath.length === 5) return fromPath;
  return state.municipio.length === 5 ? state.municipio : null;
});

onMounted(async () => {
  try {
    const [deps, munis] = await Promise.all([listDepartments(), listMunicipalities()]);
    departamentos.value = deps.data.map((d) => ({ code: d.code, name: d.name, context: d.region }));
    municipios.value = munis.data;
  } catch {
    errorListas.value =
      'No pudimos cargar la lista de municipios. Puedes abrir uno por su enlace directo.';
  }
});

const opcionesDepartamento = computed<PlaceOption[]>(() => departamentos.value);

/** Al elegir departamento, el selector de municipio se acota a los suyos. */
const opcionesMunicipio = computed<PlaceOption[]>(() =>
  municipios.value
    .filter((m) => departamentoElegido.value === '' || m.deptCode === departamentoElegido.value)
    .map((m) => ({
      code: m.code,
      name: m.name,
      context: departamentoElegido.value === '' ? m.deptName : null,
    })),
);

/** El municipio elegido manda; se escribe en la URL para que la vista sea compartible. */
const municipioElegido = computed({
  get: () => activeCode.value ?? '',
  set: (code: string) => {
    state.municipio = code;
    // Elegir un municipio de otro departamento deja el selector de arriba coherente.
    if (code.length === 5) departamentoElegido.value = code.slice(0, 2);
  },
});

async function load(code: string): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const [muni, ind] = await Promise.all([getMunicipality(code), getIndicators(code)]);
    municipality.value = muni.data;
    municipalityMeta.value = muni.meta;
    indicators.value = ind.data;
    indicatorsMeta.value = ind.meta;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
    indicators.value = null;
  } finally {
    isLoading.value = false;
  }
}

watch(
  activeCode,
  (code) => {
    if (code) void load(code);
  },
  { immediate: true },
);

/** Serie temporal de un indicador. Los huecos se dejan como huecos, no se interpolan. */
function seriesOption(indicator: MunicipalIndicators['indicators'][number]): EChartsOption {
  return {
    xAxis: { type: 'category', data: indicator.series.map((point) => point.period) },
    yAxis: { type: 'value', name: indicator.unit ?? '' },
    series: [
      {
        type: 'line',
        name: indicator.label,
        // `connectNulls: false`: un periodo sin dato se ve como un corte, no como una recta.
        connectNulls: false,
        smooth: false,
        data: indicator.series.map((point) => point.value),
      },
    ],
  };
}

/*
 * La cobertura viaja en `meta`, no en `data`: ni el municipio ni los indicadores la traen
 * como campo. Leerla de `data` la dejaba siempre en null, así que el aviso de cobertura
 * parcial —el que dice que el municipio no es jurisdicción del IGAC o que no tiene predios
 * cargados— no aparecía nunca. Es justo lo que exige la regla 6.
 */
const coverage = computed(
  () => indicatorsMeta.value.coverage ?? municipalityMeta.value.coverage ?? null,
);
const sources = computed(() => indicatorsMeta.value.sources);

function sourcesFor(indicator: MunicipalIndicators['indicators'][number]) {
  return sources.value.filter((source) => (indicator.sourceDatasetIds ?? []).includes(source.datasetId));
}
</script>

<template>
  <div class="mx-auto max-w-[80rem] space-y-3 p-3">
    <SyntheticDataBanner :meta="indicatorsMeta" />

    <header class="space-y-2">
      <h1 class="text-xl font-semibold">Observatorio municipal</h1>
      <div class="max-w-xl">
        <div class="grid gap-2 sm:grid-cols-2">
          <PlaceSelect
            v-model="departamentoElegido"
            label="Departamento"
            :options="opcionesDepartamento"
            placeholder="Atlántico, Valle…"
            hint="Opcional: acota la lista de municipios"
          />
          <PlaceSelect
            v-model="municipioElegido"
            label="Municipio"
            :options="opcionesMunicipio"
            placeholder="Soledad, Cali…"
            :hint="
              departamentoElegido ? 'Municipios del departamento elegido' : 'Los 1.122 del país'
            "
          />
        </div>
        <p v-if="errorListas" class="mt-1 text-xs text-amber-800">{{ errorListas }}</p>
      </div>
    </header>

    <EmptyState
      v-if="!activeCode"
      title="Elige un municipio"
      body="Busca el municipio arriba. Te mostramos sus indicadores, su puesto frente al resto del país y cómo han cambiado por fecha de corte."
      icon="search"
    />

    <LoadingSkeleton v-else-if="isLoading" variant="card" />

    <EmptyState
      v-else-if="error"
      :title="MESSAGES.common.error"
      :body="error.message"
      icon="data"
      action-label="Reintentar"
      @action="activeCode && load(activeCode)"
    />

    <template v-else-if="indicators">
      <CoverageNotice :coverage="coverage" />

      <BaseCard
        :title="`${indicators.municipality.name} (${indicators.municipality.code})`"
        :heading-level="2"
        :subtitle="municipality ? `${municipality.deptName}` : undefined"
      >
        <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-3">
          <DataValue
            label="Población"
            :value="municipality?.population ?? null"
            format="number"
            :sources="municipalityMeta.sources"
            layout="inline"
          />
          <DataValue
            label="Área municipal"
            :value="municipality?.areaKm2 ?? null"
            format="number"
            unit="km²"
            :digits="1"
            :sources="municipalityMeta.sources"
            layout="inline"
          />
          <DataValue
            label="Último corte catastral cargado"
            :value="indicators?.summary?.last_cut_date ?? null"
            format="text"
            :sources="municipalityMeta.sources"
            layout="inline"
          />
        </dl>

        <template #footer>
          <ProvenanceFooter :meta="municipalityMeta" compact />
        </template>
      </BaseCard>

      <EmptyState
        v-if="indicators.indicators.length === 0"
        title="Todavía no tenemos indicadores de este municipio"
        body="Los indicadores se calculan cuando hay al menos dos cortes cargados. Sí puedes consultar el mapa, los equipamientos y la población."
        icon="data"
      />

      <!-- Un bloque por indicador: cifra actual, puesto nacional, serie y fórmula. -->
      <div v-else class="grid gap-3 lg:grid-cols-2">
        <BaseCard
          v-for="indicator in indicators.indicators"
          :key="indicator.key"
          :title="indicator.label"
          :heading-level="3"
        >
          <template #actions>
            <BaseBadge v-if="indicator.rank" tone="brand">
              Puesto {{ indicator.rank.position }} de {{ indicator.rank.of }}
            </BaseBadge>
          </template>

          <DataValue
            :label="`Valor más reciente${indicator.latestPeriod ? ` (${indicator.latestPeriod})` : ''}`"
            :value="indicator.latest"
            format="number"
            :unit="indicator.unit ?? undefined"
            :digits="2"
            :sources="sourcesFor(indicator)"
          />

          <ChartCard
            v-if="indicator.series.length > 1"
            class="mt-3"
            :title="`Serie de ${indicator.label}`"
            :option="seriesOption(indicator)"
            :sources="sourcesFor(indicator)"
            :unit="indicator.unit"
            height="200px"
            :table-rows="
              indicator.series.map((point) => ({
                label: point.period,
                value: point.value,
                unit: indicator.unit,
              }))
            "
          />

          <HowCalculated
            class="mt-3"
            :formula="indicator.formula"
            :unit="indicator.unit"
            :sources="sourcesFor(indicator)"
          />

          <ExplainButton
            class="mt-2"
            :subject="`indicador:${indicator.key}`"
            :payload="{
              label: indicator.label,
              latest: indicator.latest,
              unit: indicator.unit,
              rank: indicator.rank,
              formula: indicator.formula,
            }"
          />
        </BaseCard>
      </div>

      <ResultActionBar
        :share-url="shareUrl()"
        :share-title="`Observatorio de ${indicators.municipality.name}`"
        :formats="['pdf', 'xlsx', 'csv']"
        :can-compare="false"
        @save="$router.push('/proyectos')"
      />
    </template>
  </div>
</template>
