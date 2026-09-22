<script setup lang="ts">
/**
 * Home / Explorador (pantalla 1 de §10.2).
 *
 * «La home es el producto»: una caja de búsqueda, un mapa y tres accesos grandes. Nada más.
 * El estado del mapa (bbox, capas, corte) viaja en la URL, así que este enlace se puede
 * compartir tal cual y el destinatario ve exactamente lo mismo.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { MESSAGES, type BBox, type TileLayer } from '@terracolombia/shared';
import { useMapStore } from '@/stores/map';
import { useUiStore } from '@/stores/ui';
import {
  bboxCodec,
  listCodec,
  nullable,
  numberCodec,
  stringCodec,
  useUrlState,
} from '@/composables/useUrlState';
import { DEFAULT_VISIBLE_LAYERS, isTileLayer } from '@/map/layers';
import { getNearby } from '@/api/nearby';
import type { NearbyResponse, SearchResultItem } from '@/api/types';
import { useSearchNavigation } from '@/composables/useSearchNavigation';
import MapView from '@/map/MapView.vue';
import SearchBox from '@/components/SearchBox.vue';
import BottomSheet from '@/components/BottomSheet.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import CoverageNotice from '@/components/ui/CoverageNotice.vue';
import type { MapFeatureHit } from '@/map/useMap';
import type { ResponseMeta } from '@terracolombia/shared';
import { emptyMeta } from '@/api/client';
import { getMunicipality } from '@/api/municipalities';

const router = useRouter();
const { navigateTo, destinationOf } = useSearchNavigation();
const mapStore = useMapStore();
const ui = useUiStore();

// ─── Estado compartible en la URL ─────────────────────────────────────────────

const { state, shareUrl } = useUrlState({
  bbox: { default: null as BBox | null, codec: nullable(bboxCodec) },
  zoom: { default: 5, codec: numberCodec(2) },
  capas: { default: [...DEFAULT_VISIBLE_LAYERS] as string[], codec: listCodec },
  corte: { default: '', codec: stringCodec },
});

// La URL manda al entrar; luego el mapa la va actualizando.
//
// Los dos sentidos (URL → mapa y mapa → URL) se vigilan mutuamente, así que cada uno
// solo escribe cuando el CONTENIDO cambia. Copiar el arreglo de capas en cada pasada
// creaba una referencia nueva, el otro vigilante la veía como cambio, volvía a copiar…
// y Vue cortaba con «Maximum recursive updates exceeded in component <HomeView>».
watch(
  () => state.capas,
  (value) => {
    const wanted = value.filter(isTileLayer);
    if (wanted.join(',') !== mapStore.visibleLayers.join(',')) mapStore.setLayers(wanted);
  },
  { immediate: true },
);

watch(
  () => state.corte,
  (value) => {
    const wanted = value.length > 0 ? value : null;
    if (wanted !== mapStore.cutDate) mapStore.setCutDate(wanted);
  },
  { immediate: true },
);

watch(
  () => [mapStore.visibleLayers, mapStore.cutDate, mapStore.zoom] as const,
  () => {
    if (state.capas.join(',') !== mapStore.visibleLayers.join(',')) state.capas = [...mapStore.visibleLayers];
    const corte = mapStore.cutDate ?? '';
    if (state.corte !== corte) state.corte = corte;
    state.zoom = Math.round(mapStore.zoom * 100) / 100;
  },
  { deep: true },
);

// ─── Consulta por clic en el mapa ─────────────────────────────────────────────

const nearby = ref<NearbyResponse | null>(null);
const nearbyMeta = ref<ResponseMeta>(emptyMeta());
const isLoadingNearby = ref(false);
const clickedPoint = ref<[number, number] | null>(null);

async function onFeatureClick(hit: MapFeatureHit | null): Promise<void> {
  if (!hit) {
    nearby.value = null;
    return;
  }

  // Un clic sobre un predio abre su ficha: es el camino más corto a lo que el usuario busca.
  if (hit.layer === 'parcel' && typeof hit.id === 'string' && hit.id.length > 0) {
    void router.push({ name: 'parcel', params: { npn: hit.id } });
    return;
  }

  clickedPoint.value = hit.lngLat;
  ui.setSheetState('half');
  isLoadingNearby.value = true;
  try {
    const response = await getNearby({
      lng: hit.lngLat[0],
      lat: hit.lngLat[1],
      radiusM: 1000,
      layers: ['school', 'health_facility', 'poi', 'road', 'protected_area', 'hazard'],
    });
    nearby.value = response.data;
    nearbyMeta.value = response.meta;
  } catch {
    nearby.value = null;
  } finally {
    isLoadingNearby.value = false;
  }
}

function onViewChange(view: { bbox: BBox; center: [number, number]; zoom: number }): void {
  state.bbox = view.bbox;
  state.zoom = Math.round(view.zoom * 100) / 100;
}

/** Filas de "qué hay alrededor" listas para pintar, ya con conteos reales. */
const nearbyGroups = computed(() => {
  const byLayer = nearby.value?.byLayer ?? {};
  const LABELS: Record<string, string> = {
    school: 'Sedes educativas',
    health_facility: 'Sedes de salud',
    poi: 'Comercio y servicios',
    road: 'Vías',
    protected_area: 'Áreas protegidas',
    hazard: 'Amenazas',
  };
  return Object.entries(byLayer)
    .filter(([, items]) => items.length > 0)
    .map(([layer, items]) => ({
      layer,
      label: LABELS[layer] ?? layer,
      count: items.length,
      nearest: items[0] ?? null,
    }));
});

const ACCESOS = [
  {
    to: '/predio',
    title: 'Consultar un predio',
    body: 'Escribe el código predial o haz clic en un predio del mapa para ver su ficha completa.',
    action: 'Buscar un predio',
    /** El acceso no lleva a una ruta con datos inventados: enfoca la caja de búsqueda. */
    focusSearch: true,
  },
  {
    to: '/zona',
    title: 'Analizar una zona',
    body: 'Dibuja un polígono o un radio y recibe un tablero con predios, población, equipamientos, suelos y riesgos.',
    action: 'Dibujar una zona',
    focusSearch: false,
  },
  {
    to: '/localizacion',
    title: '¿Dónde abro mi negocio?',
    body: 'Elige una plantilla, ajusta los pesos que te importan y mira el mapa de calor de oportunidad.',
    action: 'Elegir plantilla',
    focusSearch: false,
  },
] as const;

function goTo(access: (typeof ACCESOS)[number]): void {
  if (access.focusSearch) {
    document.getElementById('tc-search')?.focus();
    return;
  }
  void router.push(access.to);
}

/*
 * El resultado trae un `target` discriminado, no `id`/`bbox`/`centroid`: esos campos
 * llegaban `undefined`, así que elegir un predio navegaba a `/predio/undefined` y elegir un
 * municipio no hacía absolutamente nada.
 */
function onSelectResult(result: SearchResultItem): void {
  if (navigateTo(result)) return;

  const destino = destinationOf(result.target);
  if (destino.muniCode) {
    mapStore.selectedMuniCode = destino.muniCode;
    // El resultado no trae coordenadas: se piden al API y se vuela al centroide. Antes elegir
    // «Palmira» dejaba el mapa exactamente donde estaba, sin ninguna señal de haber elegido.
    void getMunicipality(destino.muniCode).then(({ data }) => {
      if (data.centroid) mapRef.value?.flyTo([data.centroid[0], data.centroid[1]], 11);
    });
  }
  if (destino.center) mapRef.value?.flyTo(destino.center, destino.zoom ?? 15);
}

/** Referencia al mapa para poder encuadrarlo desde el buscador y desde la URL. */
const mapRef = ref<InstanceType<typeof MapView> | null>(null);

onMounted(() => {
  // Si el enlace llegó con un bbox, el mapa se encuadra ahí antes de cualquier consulta.
  const initial = state.bbox;
  if (initial) requestAnimationFrame(() => mapRef.value?.fitBBox(initial));
});

const activeLayerCount = computed(() => mapStore.activeLayers.length);
const visibleLayerNames = computed<TileLayer[]>(() => mapStore.visibleLayers);
</script>

<template>
  <div class="flex h-[calc(100dvh-3.25rem)] flex-col">
    <!-- Caja de búsqueda: primer elemento interactivo de la página. -->
    <div class="border-b border-slate-200 bg-white px-3 py-3">
      <div class="mx-auto max-w-3xl">
        <h1 class="sr-only">TerraColombia: pregúntale al territorio</h1>
        <SearchBox size="lg" autofocus @select="onSelectResult" />
      </div>
    </div>

    <div class="relative flex min-h-0 flex-1 gap-3 p-0 md:p-3">
      <!-- Mapa: ocupa todo en móvil, dos tercios en escritorio. -->
      <div class="min-h-0 flex-1">
        <MapView
          ref="mapRef"
          height="100%"
          show-layer-panel
          show-legend
          @view-change="onViewChange"
          @feature-click="onFeatureClick"
        />
      </div>

      <!--
        Panel único. `BottomSheet` decide por sí mismo si se pinta como columna lateral
        (escritorio) o como hoja inferior deslizable sobre el mapa (móvil), así que el
        contenido se escribe una sola vez.
      -->
      <!-- `contents` en móvil: la hoja se posiciona fija y el mapa no pierde ancho. -->
      <div class="contents md:block md:w-96 md:shrink-0">
        <BottomSheet title="Qué hay aquí">
          <div class="space-y-3 p-3">
            <!-- Tres accesos grandes: es lo primero que ve quien no sabe qué hacer. -->
            <BaseCard v-for="access in ACCESOS" :key="access.title" :title="access.title">
              <p class="text-sm text-slate-700">{{ access.body }}</p>
              <BaseButton class="mt-2" size="sm" block @click="goTo(access)">
                {{ access.action }}
              </BaseButton>
            </BaseCard>

            <CoverageNotice :coverage="nearbyMeta.coverage ?? null" />

            <BaseCard
              v-if="clickedPoint"
              title="Alrededor del punto elegido"
              subtitle="Radio de 1 km"
            >
              <ProvenanceFooter :meta="nearbyMeta">
                <p v-if="isLoadingNearby" class="text-sm text-slate-600">
                  {{ MESSAGES.common.loading }}
                </p>
                <ul v-else-if="nearbyGroups.length > 0" class="divide-y divide-slate-100 text-sm">
                  <li v-for="group in nearbyGroups" :key="group.layer" class="py-1.5">
                    <p class="font-medium">{{ group.label }}: {{ group.count }}</p>
                    <p v-if="group.nearest" class="text-xs text-slate-600">
                      Más cercano: {{ group.nearest.name ?? 'sin nombre' }} a
                      {{ Math.round(group.nearest.distance_m) }} m
                    </p>
                  </li>
                </ul>
                <EmptyState
                  v-else
                  title="No encontramos equipamientos en un kilómetro"
                  body="Puede ser una zona rural o una zona sin datos cargados todavía. Prueba a mover el punto o a ampliar el radio desde el analizador de zona."
                  icon="map"
                />
              </ProvenanceFooter>
            </BaseCard>

            <BaseCard title="Este enlace es compartible">
              <p class="text-sm text-slate-700">
                La vista del mapa, las capas encendidas ({{ activeLayerCount }} activas de
                {{ visibleLayerNames.length }} elegidas) y la fecha de corte van en la dirección
                web. Copia el enlace y la otra persona verá exactamente esto.
              </p>
              <input
                class="tc-input mt-2 font-mono text-xs"
                :value="shareUrl()"
                readonly
                aria-label="Enlace compartible de esta vista"
                @focus="($event.target as HTMLInputElement).select()"
              />
            </BaseCard>
          </div>
        </BottomSheet>
      </div>
    </div>
  </div>
</template>
