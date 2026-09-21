<script setup lang="ts">
/**
 * Ficha de predio (pantalla 2 de §10.2), con divulgación progresiva:
 * tarjeta resumen → secciones plegables → detalle → datos crudos + fuente.
 *
 * Las secciones son exactamente las del plan, en este orden:
 * resumen · catastro · construcciones · entorno con distancias · suelo y aptitud ·
 * amenazas y restricciones · ordenamiento · población alrededor · historial · fuentes.
 *
 * Reglas que esta vista hace cumplir:
 * - toda cifra pasa por `DataValue`, que la oculta si no tiene procedencia (regla 4);
 * - el avalúo catastral siempre lleva su advertencia (regla 5);
 * - si el municipio no es del IGAC, lo primero que se ve es `CoverageNotice` (regla 6).
 */
import type { ParcelChangeType } from '@/api/types';
import { computed, onMounted, watch } from 'vue';
import {
  DISCLAIMERS,
  MESSAGES,
  formatDistance,
  isAvailable,
  type GeoJsonFeatureCollection,
} from '@terracolombia/shared';
import { explainNpn, formatNpnPretty } from '@terracolombia/geo';
import { useParcelStore } from '@/stores/parcel';
import { useMapStore } from '@/stores/map';
import { useUrlState, intCodec, stringCodec } from '@/composables/useUrlState';
import MapView from '@/map/MapView.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import CollapsibleSection from '@/components/ui/CollapsibleSection.vue';
import CoverageNotice from '@/components/ui/CoverageNotice.vue';
import DataValue from '@/components/ui/DataValue.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ExplainButton from '@/components/ui/ExplainButton.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';
import RangeSlider from '@/components/ui/RangeSlider.vue';

const props = defineProps<{ npn: string }>();

const parcel = useParcelStore();
const mapStore = useMapStore();

const { state, shareUrl } = useUrlState({
  radio: { default: 1000, codec: intCodec },
  corte: { default: '', codec: stringCodec },
});

async function load(): Promise<void> {
  await parcel.load(props.npn, state.corte.length > 0 ? state.corte : undefined);
  mapStore.selectParcel(props.npn);
  await Promise.all([parcel.loadContext(state.radio), parcel.loadHistory()]);
}

onMounted(load);
watch(() => props.npn, load);
watch(
  () => state.radio,
  (radius) => {
    void parcel.loadContext(radius);
  },
);

/*
 * `GET /parcels/:npn` devuelve el objeto PLANO, sin envoltorio `summary`. Leerlo como
 * `detail.summary` lo dejaba en null y, como toda la ficha cuelga de un `v-else-if`, la
 * pantalla se quedaba con el mapa y una columna derecha vacía: ni un error, ni un aviso.
 * Se conserva el nombre `summary` en la vista porque la plantilla lo usa en decenas de
 * sitios; lo que cambia es de dónde sale.
 */
const summary = computed(() => parcel.detail);
const context = computed(() => parcel.context);
const sources = computed(() => parcel.detailMeta.sources);
const contextSources = computed(() => parcel.contextMeta.sources);

/** El NPN de 30 dígitos seguidos no se lee: se agrupa por tramos. */
const prettyNpn = computed(() => {
  try {
    return formatNpnPretty(props.npn);
  } catch {
    return props.npn;
  }
});

/** Explicación tramo a tramo del código predial, para el bloque de identificación. */
const npnExplanation = computed(() => {
  try {
    return explainNpn(props.npn);
  } catch {
    return null;
  }
});

/** Geometría del predio para resaltarla en el mapa. */
const overlay = computed<GeoJsonFeatureCollection | null>(() => {
  const geometry = parcel.detail?.geometry;
  if (!geometry) return null;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry, properties: { npn: props.npn } }],
  };
});

const buildings = computed(() => parcel.detail?.buildings ?? []);
const history = computed(() => parcel.history);

/** Entorno ordenado por distancia: lo más cercano primero, que es lo que interesa. */
const environmentGroups = computed(() => {
  const ctx = context.value;
  if (!ctx) return [];
  return [
    { key: 'schools', label: 'Educación', items: ctx.schools },
    { key: 'health', label: 'Salud', items: ctx.healthFacilities },
    { key: 'pois', label: 'Comercio y servicios', items: ctx.pois },
    { key: 'roads', label: 'Vías', items: ctx.roads },
  ].filter((group) => group.items.length > 0);
});

const hasRestrictions = computed(() => {
  const ctx = context.value;
  if (!ctx) return false;
  return (
    ctx.hazards.length > 0 ||
    ctx.protectedAreas.length > 0 ||
    ctx.ethnicTerritories.length > 0
  );
});

/** Datos crudos de R1/R2: se muestran tal cual llegan, sin renombrar campos. */
/**
 * El historial llega como `{npn, cuts, changes, emptyReason}`, no como una lista. Tratarlo
 * como arreglo dejaba `history.length` en `undefined` y la sección anunciaba "undefined
 * cambios entre cortes".
 */
const changes = computed(() => parcel.history?.changes ?? []);
const cuts = computed(() => parcel.history?.cuts ?? []);
const historyHint = computed(() =>
  changes.value.length > 0
    ? `${changes.value.length} cambios en ${cuts.value.length} cortes`
    : `${cuts.value.length} cortes cargados`,
);

/** Etiquetas en español de los tipos de cambio que publica la API. */
const CHANGE_LABELS: Record<ParcelChangeType, string> = {
  created: 'El predio aparece por primera vez',
  removed: 'El predio deja de aparecer',
  attrs_changed: 'Cambian los datos alfanuméricos',
  geometry_changed: 'Cambia la geometría del terreno',
  building_added: 'Se registra una construcción nueva',
  building_removed: 'Deja de aparecer una construcción',
};

const rawEntries = computed(() => Object.entries(parcel.detail?.rawAttributes ?? {}));
</script>

<template>
  <div class="mx-auto flex max-w-[110rem] flex-col gap-3 p-3 lg:flex-row">
    <!-- Mapa con el predio resaltado. -->
    <div class="h-72 shrink-0 lg:sticky lg:top-3 lg:h-[calc(100dvh-5rem)] lg:w-1/2">
      <MapView height="100%" :overlay="overlay" show-legend />
    </div>

    <div class="min-w-0 flex-1 space-y-3">
      <SyntheticDataBanner :meta="parcel.detailMeta" />
      <CoverageNotice :coverage="parcel.coverage" />

      <LoadingSkeleton v-if="parcel.isLoading" variant="card" />

      <EmptyState
        v-else-if="parcel.error"
        :title="MESSAGES.errors.notFound"
        :body="parcel.error.message"
        icon="search"
        action-label="Volver al mapa"
        @action="$router.push('/')"
      />

      <template v-else-if="summary">
        <!-- ── 1. Resumen ───────────────────────────────────────────────────── -->
        <BaseCard :title="`${summary.municipality.name}, ${summary.municipality.deptName}`" :heading-level="2">
          <template #actions>
            <BaseBadge v-if="isAvailable(summary.zoneLabel)" tone="brand">
              {{ summary.zoneLabel }}
            </BaseBadge>
          </template>

          <p class="font-mono text-sm text-slate-700">
            <GlossaryTerm id="npn" label="Código predial" />: {{ prettyNpn }}
          </p>

          <dl class="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <DataValue
              label="Dirección"
              :value="summary.address"
              :sources="sources"
              layout="inline"
            />
            <DataValue
              label="Área del terreno (geometría)"
              :value="summary.areaGeomM2"
              format="area"
              :sources="sources"
              layout="inline"
              hint="Calculada sobre la geometría en MAGNA-SIRGAS / Origen-Nacional."
            />
            <DataValue
              label="Área reportada por el catastro"
              :value="summary.areaReportedM2"
              format="area"
              :sources="sources"
              layout="inline"
            />
            <DataValue
              label="Área construida"
              :value="summary.builtAreaM2"
              format="area"
              :sources="sources"
              layout="inline"
            />
            <DataValue
              label="Destino económico"
              :value="summary.economicUse"
              :sources="sources"
              layout="inline"
              glossary-id="destino_economico"
              @glossary="(id) => $router.push({ path: '/glosario', hash: `#${id}` })"
            />
            <DataValue
              label="Avalúo catastral"
              :value="summary.cadastralValue"
              format="currency"
              :sources="sources"
              layout="inline"
              warn-cadastral-value
              :hint="
                isAvailable(summary.valuationYear)
                  ? `Vigencia ${summary.valuationYear}`
                  : undefined
              "
            />
          </dl>

          <ExplainButton
            class="mt-3"
            subject="resumen_predio"
            :payload="{ ...summary, npn: props.npn }"
          />

          <template #footer>
            <ProvenanceFooter :meta="parcel.detailMeta" compact />
          </template>
        </BaseCard>

        <!-- ── Secciones plegables ──────────────────────────────────────────── -->
        <BaseCard :padded="false" title="Detalle del predio" :heading-level="2">
          <!-- 2. Identificación catastral -->
          <CollapsibleSection
            :title="MESSAGES.parcel.identification"
            hint="Qué dice cada tramo del código predial"
            open
          >
            <p v-if="npnExplanation" class="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {{ npnExplanation }}
            </p>
            <dl class="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <DataValue
                label="Código anterior (20 dígitos)"
                :value="summary.npnOld"
                :sources="sources"
                layout="inline"
              />
              <DataValue
                label="Municipio (DIVIPOLA)"
                :value="summary.municipality.code"
                :sources="sources"
                layout="inline"
                glossary-id="divipola"
              />
            </dl>

            <div v-if="parcel.detail && parcel.detail.homogeneousZones.length > 0" class="mt-3">
              <p class="tc-label">
                <GlossaryTerm id="zona_homogenea_fisica" label="Zonas homogéneas" />
              </p>
              <ul class="mt-1 space-y-1 text-sm">
                <li v-for="zone in parcel.detail.homogeneousZones" :key="`${zone.kind}-${zone.code}`">
                  {{ zone.kind === 'fisica' ? 'Física' : 'Geoeconómica' }}:
                  {{ zone.label ?? zone.code ?? MESSAGES.common.notAvailable }}
                </li>
              </ul>
            </div>
          </CollapsibleSection>

          <!-- 3. Construcciones -->
          <CollapsibleSection
            :title="MESSAGES.parcel.buildings"
            :hint="`${buildings.length} registradas`"
            :empty="buildings.length === 0"
            :empty-label="MESSAGES.parcel.noBuildings"
          >
            <div v-if="buildings.length > 0" class="overflow-x-auto">
              <table class="tc-table">
                <thead>
                  <tr>
                    <th scope="col">Pisos</th>
                    <th scope="col">Área construida</th>
                    <th scope="col">Uso</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="building in buildings" :key="building.id">
                    <td>
                      <DataValue
                        label="Pisos"
                        :value="building.floors"
                        format="number"
                        :sources="sources"
                      />
                    </td>
                    <td>
                      <DataValue
                        label="Área"
                        :value="building.builtAreaM2"
                        format="area"
                        :sources="sources"
                      />
                    </td>
                    <td>
                      <DataValue label="Uso" :value="building.use" :sources="sources" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-slate-600">{{ MESSAGES.parcel.noBuildings }}</p>
          </CollapsibleSection>

          <!-- 4. Entorno con distancias -->
          <CollapsibleSection
            :title="MESSAGES.parcel.environment"
            :hint="`Radio de ${Math.round(state.radio)} m`"
            :empty="environmentGroups.length === 0"
          >
            <RangeSlider
              :model-value="state.radio"
              label="Radio de búsqueda"
              :min="250"
              :max="5000"
              :step="250"
              :display-value="formatDistance(state.radio)"
              hint="Afecta a equipamientos, vías y población de alrededor."
              @update:model-value="(value) => (state.radio = value)"
            />

            <LoadingSkeleton v-if="parcel.isLoadingContext" :lines="4" class="mt-3" />

            <ProvenanceFooter v-else :meta="parcel.contextMeta" compact>
              <ul class="space-y-3">
                <li v-for="group in environmentGroups" :key="group.key">
                  <p class="tc-label">{{ group.label }} ({{ group.items.length }})</p>
                  <ul class="mt-1 divide-y divide-slate-100 text-sm">
                    <li
                      v-for="item in group.items.slice(0, 8)"
                      :key="`${group.key}-${item.id}`"
                      class="flex items-baseline justify-between gap-3 py-1"
                    >
                      <span class="min-w-0 truncate">
                        {{ isAvailable(item.name) ? item.name : 'Sin nombre en la fuente' }}
                        <span v-if="isAvailable(item.category)" class="text-xs text-slate-500">
                          · {{ item.category }}
                        </span>
                      </span>
                      <span class="shrink-0 tabular-nums text-slate-700">
                        {{ formatDistance(item.distance_m) }}
                      </span>
                    </li>
                  </ul>
                  <p v-if="group.items.length > 8" class="mt-1 text-xs text-slate-500">
                    Y {{ group.items.length - 8 }} más dentro del radio.
                  </p>
                </li>
              </ul>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 5. Suelo y aptitud -->
          <CollapsibleSection
            :title="MESSAGES.parcel.soil"
            :empty="(context?.soils.length ?? 0) === 0"
          >
            <ProvenanceFooter :meta="parcel.contextMeta" compact>
              <ul v-if="context && context.soils.length > 0" class="space-y-2 text-sm">
                <li v-for="soil in context.soils" :key="`${soil.kind}-${soil.code}`">
                  <p class="font-medium">
                    <GlossaryTerm
                      :id="soil.kind === 'capacidad' ? 'capacidad_uso' : 'vocacion_uso'"
                      :label="soil.label ?? soil.kind"
                    />
                  </p>
                  <p class="text-xs text-slate-600">
                    Cubre el {{ Math.round(soil.overlap_pct) }} % del predio ·
                    {{ soil.code ?? MESSAGES.common.notAvailable }}
                  </p>
                </li>
              </ul>
              <div class="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <DataValue
                  label="Altitud media"
                  :value="context?.relief?.elevationMeanM ?? null"
                  format="number"
                  unit="m s. n. m."
                  :sources="contextSources"
                  layout="inline"
                />
                <DataValue
                  label="Pendiente media"
                  :value="context?.relief?.slopeMeanPct ?? null"
                  format="percent"
                  :digits="1"
                  :sources="contextSources"
                  layout="inline"
                  glossary-id="pendiente"
                />
              </div>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 6. Amenazas y restricciones -->
          <CollapsibleSection :title="MESSAGES.parcel.hazards" :empty="!hasRestrictions">
            <ProvenanceFooter :meta="parcel.contextMeta" compact>
              <template v-if="context">
                <div v-if="context.hazards.length > 0">
                  <p class="tc-label">
                    <GlossaryTerm id="amenaza" label="Amenazas" />
                  </p>
                  <ul class="mt-1 space-y-1 text-sm">
                    <li v-for="hazard in context.hazards" :key="`${hazard.kind}-${hazard.source}`">
                      {{ hazard.kind }}:
                      {{ isAvailable(hazard.level) ? hazard.level : MESSAGES.common.notAvailable }}
                      ({{ Math.round(hazard.overlap_pct) }} % del predio, fuente
                      {{ hazard.source }})
                    </li>
                  </ul>
                </div>

                <div v-if="context.protectedAreas.length > 0" class="mt-3">
                  <p class="tc-label">
                    <GlossaryTerm id="area_protegida" label="Áreas protegidas" />
                  </p>
                  <ul class="mt-1 space-y-1 text-sm">
                    <li v-for="area in context.protectedAreas" :key="area.name">
                      {{ area.name }} ({{ Math.round(area.overlap_pct) }} %)
                    </li>
                  </ul>
                </div>

                <div v-if="context.ethnicTerritories.length > 0" class="mt-3">
                  <p class="tc-label">
                    <GlossaryTerm id="territorio_etnico" label="Territorios étnicos" />
                  </p>
                  <ul class="mt-1 space-y-1 text-sm">
                    <li v-for="territory in context.ethnicTerritories" :key="territory.name">
                      {{ territory.name }} ({{ Math.round(territory.overlap_pct) }} %)
                    </li>
                  </ul>
                </div>
              </template>

              <p class="mt-3 text-xs text-slate-600">{{ DISCLAIMERS.hazardScale }}</p>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 7. Ordenamiento territorial -->
          <CollapsibleSection
            :title="MESSAGES.parcel.planning"
            :empty="(context?.potZones.length ?? 0) === 0"
            empty-label="Sin POT integrado"
          >
            <ProvenanceFooter :meta="parcel.contextMeta" compact>
              <ul v-if="context && context.potZones.length > 0" class="space-y-2 text-sm">
                <li v-for="(zone, index) in context.potZones" :key="index">
                  <p class="font-medium">
                    {{ zone.classification ?? MESSAGES.common.notAvailable }}
                  </p>
                  <p class="text-xs text-slate-600">
                    Uso: {{ zone.use ?? MESSAGES.common.notAvailable }} ·
                    {{ Math.round(zone.overlap_pct) }} % del predio ·
                    {{ zone.sourceDoc ?? 'documento no declarado' }}
                  </p>
                </li>
              </ul>
              <EmptyState
                v-else
                title="No tenemos el POT de este municipio"
                body="No existe un repositorio nacional completo de Planes de Ordenamiento. Consulta la Secretaría de Planeación del municipio para los usos permitidos."
                icon="data"
              />
              <p class="mt-3 text-xs text-slate-600">{{ DISCLAIMERS.notUrbanNorm }}</p>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 8. Población alrededor -->
          <CollapsibleSection :title="MESSAGES.parcel.population">
            <ProvenanceFooter :meta="parcel.contextMeta" compact>
              <dl class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <DataValue
                  label="Personas"
                  :value="context?.population?.total ?? null"
                  format="number"
                  :sources="contextSources"
                  layout="inline"
                />
                <DataValue
                  label="Hogares"
                  :value="context?.population?.households ?? null"
                  format="number"
                  :sources="contextSources"
                  layout="inline"
                />
                <DataValue
                  label="Viviendas"
                  :value="context?.population?.dwellings ?? null"
                  format="number"
                  :sources="contextSources"
                  layout="inline"
                />
              </dl>
              <p class="mt-2 text-xs text-slate-500">
                Estimada sobre las unidades del
                <GlossaryTerm id="mgn" label="Marco Geoestadístico Nacional" /> que caen dentro del
                radio elegido.
              </p>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 9. Historial de cambios -->
          <CollapsibleSection
            :title="MESSAGES.parcel.history"
            :hint="historyHint"
            :empty="changes.length === 0"
            empty-label="Sin cambios registrados"
          >
            <ProvenanceFooter :meta="parcel.historyMeta" compact>
              <ol v-if="changes.length > 0" class="space-y-2 text-sm">
                <li
                  v-for="(entry, index) in changes"
                  :key="index"
                  class="border-l-2 border-slate-200 pl-3"
                >
                  <p class="font-medium">{{ CHANGE_LABELS[entry.changeType] }}</p>
                  <p class="text-xs text-slate-600">
                    Entre el corte {{ entry.fromCutDate }} y el {{ entry.toCutDate }}
                  </p>
                </li>
              </ol>
              <!--
                La API dice POR QUÉ no hay nada que comparar (por ejemplo, un solo corte
                cargado). Repetir "no cambió" cuando en realidad no hay con qué comparar
                sería afirmar algo que no sabemos.
              -->
              <p v-else class="text-sm text-slate-600">
                {{ history?.emptyReason ?? 'Este predio no cambió entre los cortes que tenemos cargados.' }}
              </p>
            </ProvenanceFooter>
          </CollapsibleSection>

          <!-- 10. Datos crudos + fuentes -->
          <CollapsibleSection
            :title="`${MESSAGES.common.rawData} y fuentes`"
            hint="Los campos tal como llegan de los Registros 1 y 2"
            :empty="rawEntries.length === 0"
          >
            <div v-if="rawEntries.length > 0" class="max-h-80 overflow-auto">
              <table class="tc-table">
                <thead>
                  <tr>
                    <th scope="col">Campo de la fuente</th>
                    <th scope="col">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="[key, value] in rawEntries" :key="key">
                    <th scope="row" class="font-mono text-xs font-normal">{{ key }}</th>
                    <td class="font-mono text-xs">
                      {{ value === null || value === '' ? MESSAGES.common.notAvailable : String(value) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ProvenanceFooter class="mt-3" :meta="parcel.detailMeta" />

            <ul class="mt-3 space-y-1.5 text-xs text-slate-600">
              <li>{{ DISCLAIMERS.notCertificate }}</li>
              <li>{{ DISCLAIMERS.notAppraisal }}</li>
              <li>{{ DISCLAIMERS.notTitleStudy }}</li>
              <li>{{ DISCLAIMERS.noPersonalData }}</li>
              <li>{{ DISCLAIMERS.dataFreshness }}</li>
            </ul>
          </CollapsibleSection>
        </BaseCard>

        <ResultActionBar
          :share-url="shareUrl()"
          :share-title="`Predio ${prettyNpn}`"
          :formats="['pdf', 'xlsx', 'geojson', 'kml']"
          @save="$router.push('/proyectos')"
          @compare="$router.push('/cambios')"
          @export="(format) => $router.push({ path: '/proyectos', query: { informe: props.npn, formato: format } })"
        />
      </template>
    </div>
  </div>
</template>
