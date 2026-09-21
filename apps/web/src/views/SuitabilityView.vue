<script setup lang="ts">
/**
 * Aptitud de terreno (pantalla 5 de §10.2, módulo M5).
 *
 * Asistente de tres pasos: **qué** quieres hacer → **dónde** → resultado. El resultado no es
 * un número solo: es un semáforo con texto, la lista de lo que bloquea, lo que condiciona y
 * lo que falta, y el desglose por factor con fórmula y fuentes (`FactorList`).
 *
 * El producto no decide por el usuario: dice qué encontró y con qué datos.
 */
import { computed, ref } from 'vue';
import {
  AppError,
  DISCLAIMERS,
  MESSAGES,
  TARGET_USES,
  type AreaScope,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
  type ResponseMeta,
  type SuitabilityRequest,
  type SuitabilityResult,
  type TargetUse,
} from '@terracolombia/shared';
import { isNpnCandidate, normalizeNpnInput } from '@terracolombia/geo';
import { evaluateSuitability } from '@/api/suitability';
import { emptyMeta } from '@/api/client';
import { enumCodec, jsonCodec, stringCodec, useUrlState } from '@/composables/useUrlState';
import MapView from '@/map/MapView.vue';
import Wizard from '@/components/Wizard.vue';
import FactorList from '@/components/FactorList.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SemaphoreBadge from '@/components/ui/SemaphoreBadge.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';
import type { WizardStep } from '@/components/types';

/** Nombres en español de los usos objetivo del DSL. */
const USE_LABELS: Record<TargetUse, string> = {
  vivienda_unifamiliar: 'Vivienda unifamiliar',
  vivienda_multifamiliar: 'Vivienda multifamiliar',
  bodega_logistica: 'Bodega o centro logístico',
  agricultura: 'Agricultura',
  ganaderia: 'Ganadería',
  colegio: 'Colegio o sede educativa',
  comercio_local: 'Comercio local',
  industria: 'Industria',
  turismo_rural: 'Turismo rural',
  solar_fotovoltaico: 'Planta solar fotovoltaica',
};

const { state, shareUrl } = useUrlState({
  uso: { default: 'vivienda_unifamiliar' as TargetUse, codec: enumCodec(TARGET_USES) },
  npn: { default: '', codec: stringCodec },
  ambito: { default: null as AreaScope | null, codec: jsonCodec<AreaScope>() },
});

const stepIndex = ref(0);
const result = ref<SuitabilityResult | null>(null);
const meta = ref<ResponseMeta>(emptyMeta());
const isLoading = ref(false);
const error = ref<AppError | null>(null);
const drawnGeometry = ref<GeoJsonGeometry | null>(null);

/** Objetivo del análisis: un predio concreto o una zona dibujada. */
const target = computed<SuitabilityRequest['target'] | null>(() => {
  const npn = normalizeNpnInput(state.npn);
  if (npn.length > 0 && isNpnCandidate(npn)) return { kind: 'parcel', npn };
  if (state.ambito) return { kind: 'area', scope: state.ambito };
  return null;
});

const steps = computed<WizardStep[]>(() => [
  {
    id: 'use',
    title: 'Qué quieres hacer',
    description:
      'La aptitud no es absoluta: depende del uso. Un terreno favorable para ganadería puede ser desfavorable para una bodega.',
    canContinue: true,
  },
  {
    id: 'where',
    title: 'Dónde',
    description:
      'Escribe el código predial o dibuja la zona en el mapa. Si tienes el predio, la respuesta es más precisa.',
    canContinue: target.value !== null,
    blockedReason: 'Indica un código predial válido de 30 o 20 dígitos, o dibuja una zona.',
  },
  {
    id: 'result',
    title: 'Resultado explicado',
    description: 'Semáforo por factor, con la fórmula y la fuente de cada uno.',
    canContinue: true,
  },
]);

function onDrawChange(collection: GeoJsonFeatureCollection | null): void {
  const geometry = collection?.features[0]?.geometry ?? null;
  drawnGeometry.value = geometry;
  state.ambito = geometry ? { kind: 'polygon', geometry } : null;
}

async function evaluate(): Promise<void> {
  const currentTarget = target.value;
  if (!currentTarget) return;

  isLoading.value = true;
  error.value = null;
  try {
    const response = await evaluateSuitability({ target: currentTarget, use: state.uso });
    result.value = response.data;
    meta.value = response.meta;
    stepIndex.value = 2;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
    result.value = null;
  } finally {
    isLoading.value = false;
  }
}

/** Texto de ayuda del veredicto, tomado de MESSAGES para no duplicar redacciones. */
const verdictHelp = computed(() => {
  switch (result.value?.verdict) {
    case 'favorable':
      return MESSAGES.suitability.favorableHelp;
    case 'condicionado':
      return MESSAGES.suitability.condicionadoHelp;
    case 'desfavorable':
      return MESSAGES.suitability.desfavorableHelp;
    case 'sin_datos':
      return MESSAGES.suitability.sinDatosHelp;
    default:
      return null;
  }
});

const overlay = computed<GeoJsonFeatureCollection | null>(() =>
  drawnGeometry.value
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: drawnGeometry.value, properties: {} }],
      }
    : null,
);
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-3 p-3">
    <SyntheticDataBanner :meta="meta" />

    <h1 class="text-xl font-semibold">Aptitud de terreno</h1>

    <Wizard
      v-model="stepIndex"
      :steps="steps"
      finish-label="Evaluar aptitud"
      :busy="isLoading"
      @finish="evaluate"
    >
      <!-- Paso 1: uso objetivo -->
      <template #use>
        <fieldset>
          <legend class="sr-only">Uso objetivo</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="use in TARGET_USES"
              :key="use"
              class="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
              :class="
                state.uso === use
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-200 hover:bg-surface-muted'
              "
            >
              <input
                v-model="state.uso"
                type="radio"
                :value="use"
                class="mt-0.5 h-4 w-4 accent-brand-600"
                name="target-use"
              />
              <span>{{ USE_LABELS[use] }}</span>
            </label>
          </div>
        </fieldset>
      </template>

      <!-- Paso 2: ubicación -->
      <template #where>
        <div class="space-y-3">
          <BaseField
            label="Código predial (NPN)"
            hint="30 dígitos, o 20 en el formato anterior. Déjalo vacío si vas a dibujar una zona."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                v-model="state.npn"
                class="tc-input font-mono"
                inputmode="numeric"
                :aria-describedby="describedBy"
              />
            </template>
          </BaseField>

          <p class="text-sm text-slate-600">O dibuja la zona en el mapa:</p>

          <div class="h-80">
            <MapView
              height="100%"
              show-draw-tools
              :draw-modes="['polygon', 'circle']"
              :overlay="overlay"
              :show-legend="false"
              @draw-change="onDrawChange"
            />
          </div>
        </div>
      </template>

      <!-- Paso 3: resultado -->
      <template #result>
        <LoadingSkeleton v-if="isLoading" variant="card" />

        <EmptyState
          v-else-if="error"
          :title="MESSAGES.common.error"
          :body="error.message"
          icon="data"
          action-label="Reintentar"
          @action="evaluate"
        />

        <EmptyState
          v-else-if="!result"
          title="Todavía no has evaluado nada"
          body="Vuelve al paso anterior y pulsa «Evaluar aptitud»."
          icon="data"
        />

        <template v-else>
          <BaseCard :title="`Aptitud para ${result.targetUseLabel}`" :heading-level="3">
            <div class="flex flex-wrap items-center gap-3">
              <SemaphoreBadge
                :status="result.verdict"
                :label="result.verdictLabel"
                size="lg"
              />
              <p v-if="result.score !== null" class="text-sm text-slate-700">
                Puntaje compuesto:
                <strong class="tabular-nums">{{ result.score }}/100</strong>
              </p>
            </div>

            <p v-if="verdictHelp" class="mt-2 text-sm leading-relaxed text-slate-700">
              {{ verdictHelp }}
            </p>

            <!-- Bloqueos, condiciones y vacíos: las tres listas honestas. -->
            <div class="mt-4 grid gap-3 md:grid-cols-3">
              <div v-if="result.blockers.length > 0">
                <p class="tc-label">Restricciones fuertes</p>
                <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm text-rose-900">
                  <li v-for="(item, index) in result.blockers" :key="index">{{ item }}</li>
                </ul>
              </div>

              <div v-if="result.cautions.length > 0">
                <p class="tc-label">Condiciones a revisar</p>
                <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm text-amber-900">
                  <li v-for="(item, index) in result.cautions" :key="index">{{ item }}</li>
                </ul>
              </div>

              <div v-if="result.missing.length > 0">
                <p class="tc-label">Datos que faltan</p>
                <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
                  <li v-for="(item, index) in result.missing" :key="index">{{ item }}</li>
                </ul>
              </div>
            </div>

            <template #footer>
              <ProvenanceFooter :meta="meta" compact />
            </template>
          </BaseCard>

          <BaseCard class="mt-3" title="Desglose por factor" :heading-level="3" :padded="false">
            <div class="px-4">
              <FactorList :factors="result.factors" :sources="meta.sources" />
            </div>
          </BaseCard>

          <div class="mt-3 space-y-1 text-xs text-slate-600">
            <p>{{ result.disclaimer }}</p>
            <p>{{ DISCLAIMERS.notUrbanNorm }}</p>
            <p>{{ DISCLAIMERS.hazardScale }}</p>
          </div>
        </template>
      </template>
    </Wizard>

    <ResultActionBar
      v-if="result"
      :share-url="shareUrl()"
      :share-title="`Aptitud para ${result.targetUseLabel}`"
      :formats="['pdf', 'xlsx']"
      :can-compare="false"
      @save="$router.push('/proyectos')"
    />
  </div>
</template>
