/**
 * Estado compartido del mapa: vista, capas, opacidades, corte temporal y selección.
 * Solo guarda datos serializables — la instancia de MapLibre vive en `useMap()` —, de modo
 * que todo este estado puede viajar en la URL y hacer la vista compartible.
 */
import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef } from 'vue';
import { PARCEL_MIN_ZOOM, type BBox, type GeoJsonGeometry, type TileLayer } from '@terracolombia/shared';
import { DEFAULT_VISIBLE_LAYERS, LAYER_BY_ID, LAYER_DEFINITIONS, isTileLayer } from '@/map/layers';
import { INITIAL_VIEW, isUsingDemoBasemap } from '@/map/style';

export interface HoveredFeature {
  layer: TileLayer;
  id: string | number;
  properties: Record<string, unknown>;
  lngLat: [number, number];
}

function defaultOpacities(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of LAYER_DEFINITIONS) out[def.id] = def.defaultOpacity;
  return out;
}

export const useMapStore = defineStore('map', () => {
  const center = ref<[number, number]>([INITIAL_VIEW.center[0], INITIAL_VIEW.center[1]]);
  const zoom = ref<number>(INITIAL_VIEW.zoom);
  const bbox = ref<BBox | null>(null);

  /** Corte de la base catastral. `null` = snapshot activo. */
  const cutDate = ref<string | null>(null);
  /** Cortes disponibles según el municipio en pantalla. */
  const availableCutDates = ref<string[]>([]);

  const visibleLayers = ref<TileLayer[]>([...DEFAULT_VISIBLE_LAYERS]);
  const opacity = reactive<Record<string, number>>(defaultOpacities());

  const selectedNpn = ref<string | null>(null);
  const selectedMuniCode = ref<string | null>(null);
  const hovered = shallowRef<HoveredFeature | null>(null);

  /** Geometría dibujada con terra-draw (polígono, círculo o municipio seleccionado). */
  const drawnGeometry = shallowRef<GeoJsonGeometry | null>(null);
  const drawMode = ref<'none' | 'polygon' | 'circle' | 'municipality'>('none');

  /** true cuando el mapa base es el de demostración de MapLibre y no el propio. */
  const usingDemoBasemap = ref(isUsingDemoBasemap());

  /** Por debajo del zoom 14 no hay predios: se muestran los agregados H3. */
  const showsParcels = computed(() => zoom.value >= PARCEL_MIN_ZOOM);
  const showsAggregates = computed(() => zoom.value < PARCEL_MIN_ZOOM);

  /** Capas efectivamente pintables al zoom actual (para que la leyenda no mienta). */
  const activeLayers = computed<TileLayer[]>(() =>
    visibleLayers.value.filter((id) => {
      const def = LAYER_BY_ID[id];
      if (!def) return false;
      return zoom.value >= def.minZoom && zoom.value <= def.maxZoom;
    }),
  );

  function setView(next: { center?: [number, number]; zoom?: number; bbox?: BBox }): void {
    if (next.center) center.value = next.center;
    if (typeof next.zoom === 'number') zoom.value = next.zoom;
    if (next.bbox) bbox.value = next.bbox;
  }

  function setLayers(ids: string[]): void {
    visibleLayers.value = ids.filter(isTileLayer);
  }

  function toggleLayer(id: TileLayer, force?: boolean): void {
    const isOn = visibleLayers.value.includes(id);
    const shouldBeOn = force ?? !isOn;
    if (shouldBeOn && !isOn) visibleLayers.value = [...visibleLayers.value, id];
    if (!shouldBeOn && isOn) visibleLayers.value = visibleLayers.value.filter((l) => l !== id);
  }

  function setOpacity(id: TileLayer, value: number): void {
    opacity[id] = Math.min(1, Math.max(0, value));
  }

  function opacityOf(id: TileLayer): number {
    return opacity[id] ?? LAYER_BY_ID[id]?.defaultOpacity ?? 1;
  }

  function setCutDate(value: string | null): void {
    cutDate.value = value;
  }

  function selectParcel(npn: string | null): void {
    selectedNpn.value = npn;
  }

  function setDrawnGeometry(geometry: GeoJsonGeometry | null): void {
    drawnGeometry.value = geometry;
  }

  function resetLayers(): void {
    visibleLayers.value = [...DEFAULT_VISIBLE_LAYERS];
    Object.assign(opacity, defaultOpacities());
  }

  return {
    center,
    zoom,
    bbox,
    cutDate,
    availableCutDates,
    visibleLayers,
    opacity,
    selectedNpn,
    selectedMuniCode,
    hovered,
    drawnGeometry,
    drawMode,
    usingDemoBasemap,
    showsParcels,
    showsAggregates,
    activeLayers,
    setView,
    setLayers,
    toggleLayer,
    setOpacity,
    opacityOf,
    setCutDate,
    selectParcel,
    setDrawnGeometry,
    resetLayers,
  };
});
