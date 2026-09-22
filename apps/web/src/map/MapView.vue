<script setup lang="ts">
/**
 * Mapa principal. Es el corazón del producto: "una caja de búsqueda y un mapa".
 *
 * Reúne lo que exige PLAN.md §10.3:
 *  - control de capas con leyenda y opacidad (`LayerPanel`, `Legend`);
 *  - selector de corte temporal (dentro de `LayerPanel`);
 *  - `feature-state` para hover y selección (en `useMap`);
 *  - consultas por `bbox` con retardo, que se emiten como `view-change`;
 *  - teselas de predios solo desde zoom 14 y agregados H3 por debajo, con un aviso visible
 *    para que el usuario entienda por qué cambia lo que ve;
 *  - atribución obligatoria del IGAC siempre presente, no plegable.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { GeoJSONSource, GeoJSONSourceSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { geometryBBox } from '@terracolombia/geo';
import {
  MESSAGES,
  PARCEL_MIN_ZOOM,
  type BBox,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
} from '@terracolombia/shared';
import { useMapStore } from '@/stores/map';
import { useEntitlements } from '@/composables/useEntitlements';
import type { ScoredCell } from '@/api/types';
import BaseButton from '@/components/ui/BaseButton.vue';
import { BASEMAP_ATTRIBUTION, igacAttribution } from './style';
import { useMap, type MapFeatureHit } from './useMap';
import LayerPanel from './LayerPanel.vue';
import Legend from './Legend.vue';
import DrawTools from './DrawTools.vue';
import H3HeatLayer from './H3HeatLayer.vue';
import type { DrawMode } from './types';

const props = withDefaults(
  defineProps<{
    showLayerPanel?: boolean;
    showLegend?: boolean;
    showDrawTools?: boolean;
    drawModes?: DrawMode[];
    /** Celdas puntuadas del mapa de calor (M6). */
    heatCells?: ScoredCell[];
    /** Geometrías a resaltar: predio seleccionado, zona dibujada, cambios. */
    overlay?: GeoJsonFeatureCollection | null;
    /** Encuadrar el mapa en `overlay` cuando cambia (ficha de predio). */
    fitOverlay?: boolean;
    /** Altura del contenedor. El mapa necesita altura explícita. */
    height?: string;
  }>(),
  {
    showLayerPanel: true,
    showLegend: true,
    showDrawTools: false,
    drawModes: () => ['polygon', 'circle', 'municipality'],
    heatCells: () => [],
    overlay: null,
    fitOverlay: true,
    height: '100%',
  },
);

const emit = defineEmits<{
  (e: 'view-change', view: { bbox: BBox; center: [number, number]; zoom: number }): void;
  (e: 'feature-click', hit: MapFeatureHit | null): void;
  (e: 'draw-change', geometry: GeoJsonFeatureCollection | null): void;
  (e: 'ready'): void;
  (e: 'heat-cell-click', cell: ScoredCell): void;
}>();

const mapStore = useMapStore();
const { maxAnalysisAreaKm2 } = useEntitlements();
const container = ref<HTMLElement | null>(null);
const panelOpen = ref(false);

const { map, isReady, init, syncLayers, setSelected, fitBBox, flyTo, handleKeydown } = useMap({
  container,
  debounceMs: 300,
  onViewChange: (view) => {
    mapStore.setView({ center: view.center, zoom: view.zoom, bbox: view.bbox });
    emit('view-change', view);
  },
  onFeatureClick: (hit) => {
    if (hit?.layer === 'parcel' && typeof hit.id === 'string') mapStore.selectParcel(hit.id);
    emit('feature-click', hit);
  },
  onFeatureHover: (hit) => {
    mapStore.hovered = hit
      ? { layer: hit.layer, id: hit.id, properties: hit.properties, lngLat: hit.lngLat }
      : null;
  },
});

const OVERLAY_SOURCE = 'tc-overlay';
const OVERLAY_FILL = 'tc-overlay-fill';
const OVERLAY_LINE = 'tc-overlay-line';

onMounted(() => {
  void mapStore.loadProvenance();
  init();
});

watch(isReady, (ready) => {
  if (!ready) return;
  syncLayers(mapStore.visibleLayers, mapStore.opacity, mapStore.cutDate);
  applyOverlay();
  emit('ready');
});

// Capas, opacidades y corte: cualquier cambio se refleja en el estilo del mapa.
watch(
  () => [mapStore.visibleLayers, mapStore.opacity, mapStore.cutDate] as const,
  () => syncLayers(mapStore.visibleLayers, mapStore.opacity, mapStore.cutDate),
  { deep: true },
);

// Selección: se marca con `feature-state`, sin volver a pedir teselas.
watch(
  () => mapStore.selectedNpn,
  (npn) => setSelected('parcel', npn),
);

watch(() => props.overlay, applyOverlay, { deep: false });

/** Pinta geometrías auxiliares (predio elegido, zona dibujada) sobre las capas de datos. */
function applyOverlay(): void {
  const instance = map.value;
  if (!instance || !isReady.value) return;

  const data = props.overlay;
  if (!data || data.features.length === 0) {
    if (instance.getLayer(OVERLAY_FILL)) instance.removeLayer(OVERLAY_FILL);
    if (instance.getLayer(OVERLAY_LINE)) instance.removeLayer(OVERLAY_LINE);
    if (instance.getSource(OVERLAY_SOURCE)) instance.removeSource(OVERLAY_SOURCE);
    return;
  }

  // `GeoJsonFeatureCollection` de shared admite `geometry: null` (hay entidades sin geometría
  // en el API); MapLibre la exige presente. Se afirma el tipo en un solo punto.
  const payload = data as unknown as GeoJSONSourceSpecification['data'];

  if (!instance.getSource(OVERLAY_SOURCE)) {
    instance.addSource(OVERLAY_SOURCE, { type: 'geojson', data: payload });
    instance.addLayer({
      id: OVERLAY_FILL,
      type: 'fill',
      source: OVERLAY_SOURCE,
      paint: { 'fill-color': '#b45309', 'fill-opacity': 0.18 },
    });
    instance.addLayer({
      id: OVERLAY_LINE,
      type: 'line',
      source: OVERLAY_SOURCE,
      paint: { 'line-color': '#b45309', 'line-width': 2.5 },
    });
  } else {
    const source = instance.getSource(OVERLAY_SOURCE) as GeoJSONSource | undefined;
    if (source && payload !== undefined) source.setData(payload);
  }

  fitToOverlay(instance, data);
}

/**
 * Encuadra el mapa en la geometría auxiliar. La ficha pintaba el predio pero dejaba la
 * vista en todo el país: un polígono de 470 m² a escala nacional es invisible, y el usuario
 * veía «el mapa no muestra mi predio». Se encuadra una vez por geometría, no en cada
 * repintado, para no pelear con quien esté navegando.
 */
let lastFittedOverlay: GeoJsonFeatureCollection | null = null;
function fitToOverlay(instance: MapLibreMap, data: GeoJsonFeatureCollection): void {
  if (!props.fitOverlay || data === lastFittedOverlay) return;
  lastFittedOverlay = data;
  let box: BBox | null = null;
  for (const f of data.features) {
    if (!f.geometry) continue;
    const b = geometryBBox(f.geometry);
    box = box
      ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]
      : b;
  }
  if (!box) return;
  instance.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 48, maxZoom: 17, duration: 600 });
}

/** Envuelve la geometría dibujada en una FeatureCollection tipada antes de emitirla. */
function emitDrawChange(geometry: GeoJsonGeometry | null): void {
  if (!geometry) {
    emit('draw-change', null);
    return;
  }
  const collection: GeoJsonFeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry, properties: {} }],
  };
  emit('draw-change', collection);
}

const cutLabel = computed(() => mapStore.cutDate ?? 'corte más reciente');

/** Aviso del cambio predios ⇄ agregados: explica el salto en lo que se ve. */
const zoomNotice = computed(() => {
  if (!mapStore.visibleLayers.includes('parcel')) return null;
  if (mapStore.zoom >= PARCEL_MIN_ZOOM) return null;
  return `A este nivel mostramos agregados por celda. Acerca hasta el zoom ${PARCEL_MIN_ZOOM} para ver predios uno por uno.`;
});

defineExpose({ fitBBox, flyTo, map });
</script>

<template>
  <div class="relative isolate overflow-hidden rounded-lg bg-surface-sunken" :style="{ height }">
    <!--
      Contenedor enfocable con rol de aplicación: permite recorrer el mapa con el teclado
      (flechas, +/-, Enter) tal como pide WCAG 2.1.1.
    -->
    <div
      ref="container"
      class="tc-map-canvas"
      role="application"
      tabindex="0"
      :aria-label="`Mapa de Colombia. Capas activas: ${mapStore.activeLayers.length}. Datos del ${cutLabel}. Usa las flechas para desplazarte, más y menos para acercar, Enter para consultar el centro.`"
      @keydown="handleKeydown"
    />

    <!-- Aviso de mapa base de demostración: honestidad sobre lo que se está viendo. -->
    <p
      v-if="mapStore.usingDemoBasemap"
      class="absolute left-2 top-2 z-overlay rounded bg-amber-100/95 px-2 py-1 text-[11px]
        font-medium text-amber-900 shadow"
      role="note"
    >
      Mapa base de demostración de MapLibre: sin detalle de Colombia. Configura
      <code>VITE_BASEMAP_STYLE_URL</code> para usar el propio.
    </p>

    <p
      v-if="zoomNotice"
      class="absolute left-1/2 top-2 z-overlay w-[min(92%,30rem)] -translate-x-1/2 rounded
        bg-white/95 px-3 py-1.5 text-center text-xs text-slate-700 shadow"
      role="status"
    >
      {{ zoomNotice }}
    </p>

    <!-- Herramientas de dibujo del analizador de zona. -->
    <div v-if="showDrawTools" class="absolute left-2 top-12 z-overlay w-64 max-w-[80vw]">
      <DrawTools
        :map="map"
        :modes="drawModes"
        :max-area-km2="maxAnalysisAreaKm2"
        @change="emitDrawChange"
        @mode="(mode) => (mapStore.drawMode = mode)"
      />
    </div>

    <!-- Panel de capas: cajón lateral en escritorio, hoja completa en móvil. -->
    <div class="absolute right-2 top-2 z-overlay flex flex-col items-end gap-2">
      <BaseButton
        v-if="showLayerPanel"
        variant="secondary"
        size="sm"
        :aria-expanded="panelOpen"
        aria-controls="tc-layer-panel"
        @click="panelOpen = !panelOpen"
      >
        {{ panelOpen ? 'Ocultar capas' : 'Capas' }}
      </BaseButton>

      <div
        v-if="showLayerPanel && panelOpen"
        id="tc-layer-panel"
        class="tc-card max-h-[70vh] w-80 max-w-[88vw] overflow-hidden"
      >
        <LayerPanel />
      </div>
    </div>

    <!-- Leyenda siempre visible: el mapa nunca es un conjunto de colores sin explicar. -->
    <div
      v-if="showLegend && !panelOpen"
      class="absolute bottom-10 right-2 z-overlay max-h-[45vh] w-64 max-w-[80vw] overflow-y-auto
        rounded-md border border-slate-200 bg-white/95 p-3 shadow-panel"
    >
      <Legend :layers="mapStore.visibleLayers" :zoom="mapStore.zoom" compact />
    </div>

    <!--
      Una sola instancia del mapa de calor: dos crearían capas con el mismo id en el estilo.
      El componente no dibuja marcado propio salvo su leyenda de escala.
    -->
    <div
      v-if="heatCells.length > 0"
      class="absolute bottom-10 left-2 z-overlay w-56 max-w-[70vw] rounded-md border
        border-slate-200 bg-white/95 p-2 shadow-panel"
    >
      <H3HeatLayer :map="map" :cells="heatCells" @cell-click="emit('heat-cell-click', $event)" />
    </div>

    <!-- Atribución obligatoria (CLAUDE.md). No es plegable ni se oculta con el tema. -->
    <!--
      `v-html` con una constante del propio código (`BASEMAP_ATTRIBUTION`), nunca con datos de
      la API: la atribución del mapa base necesita el enlace a la licencia de OpenStreetMap.
    -->
    <p class="tc-map-attribution">
      {{ igacAttribution(mapStore.attributionCutDate) }} ·
      <!-- eslint-disable-next-line vue/no-v-html -- constante del código, nunca dato de la API -->
      <span v-html="BASEMAP_ATTRIBUTION" />
    </p>

    <div
      v-if="!isReady"
      class="absolute inset-0 z-overlay grid place-items-center bg-surface-sunken/80 text-sm text-slate-600"
      role="status"
    >
      {{ MESSAGES.common.loading }}
    </div>
  </div>
</template>
