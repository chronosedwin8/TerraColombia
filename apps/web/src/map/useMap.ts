/**
 * Ciclo de vida del mapa MapLibre y sincronización con el catálogo declarativo de capas.
 *
 * Decisiones técnicas (PLAN.md §10.3):
 * - `feature-state` para hover y selección: no se vuelve a pedir la tesela al resaltar.
 * - Consultas por `bbox` con retardo: mover el mapa no dispara una petición por fotograma.
 * - Predios solo desde zoom 14; por debajo se pintan los agregados H3.
 * - Navegación por teclado: el contenedor es enfocable y las flechas mueven el mapa,
 *   `+`/`-` acercan y alejan, y Enter consulta el centro (WCAG 2.1.1).
 */
import { onBeforeUnmount, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import maplibregl, {
  type LngLatBoundsLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type PointLike,
} from 'maplibre-gl';
import type { BBox, TileLayer } from '@terracolombia/shared';
import { useDebounceFn } from '@/composables/useDebounce';
import {
  FEATURE_ID_PROPERTY,
  LAYER_BY_ID,
  layerIdsFor,
  sourceIdFor,
  tileUrlTemplate,
} from './layers';
import {
  INITIAL_VIEW,
  LABEL_LAYER_ID,
  firstSymbolLayerId,
  resolveBasemapStyle,
} from './style';

export interface MapFeatureHit {
  layer: TileLayer;
  id: string | number;
  properties: Record<string, unknown>;
  lngLat: [number, number];
}

export interface UseMapOptions {
  /** Contenedor del canvas. Debe tener altura definida por CSS. */
  container: Ref<HTMLElement | null>;
  /** Se llama cuando termina un movimiento, ya con retardo aplicado. */
  onViewChange?: (view: { bbox: BBox; center: [number, number]; zoom: number }) => void;
  onFeatureClick?: (hit: MapFeatureHit | null) => void;
  onFeatureHover?: (hit: MapFeatureHit | null) => void;
  /** Milisegundos de espera antes de avisar del nuevo bbox. */
  debounceMs?: number;
}

export interface UseMapReturn {
  map: ShallowRef<MapLibreMap | null>;
  isReady: Ref<boolean>;
  init: () => void;
  destroy: () => void;
  syncLayers: (visible: TileLayer[], opacities: Record<string, number>, cutDate: string | null) => void;
  setSelected: (layer: TileLayer, id: string | number | null) => void;
  fitBBox: (bbox: BBox, padding?: number) => void;
  flyTo: (center: [number, number], zoom?: number) => void;
  currentBBox: () => BBox | null;
  handleKeydown: (event: KeyboardEvent) => void;
}

/** Paso de desplazamiento con flechas, en píxeles. */
const KEYBOARD_PAN_PX = 120;

export function useMap(options: UseMapOptions): UseMapReturn {
  const map = shallowRef<MapLibreMap | null>(null);
  const isReady = ref(false);

  /** Capas lógicas ya añadidas al estilo, con el corte con el que se añadieron. */
  const mounted = new Map<TileLayer, string | null>();
  /** Entidad resaltada por capa, para poder limpiar su `feature-state`. */
  const hoveredByLayer = new Map<TileLayer, string | number>();
  const selectedByLayer = new Map<TileLayer, string | number>();

  const notifyView = useDebounceFn(() => {
    const instance = map.value;
    if (!instance || !options.onViewChange) return;
    const bbox = currentBBox();
    if (!bbox) return;
    const center = instance.getCenter();
    options.onViewChange({ bbox, center: [center.lng, center.lat], zoom: instance.getZoom() });
  }, options.debounceMs ?? 300);

  function currentBBox(): BBox | null {
    const instance = map.value;
    if (!instance) return null;
    const bounds = instance.getBounds();
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }

  function init(): void {
    if (map.value || !options.container.value) return;

    const instance = new maplibregl.Map({
      container: options.container.value,
      style: resolveBasemapStyle(),
      center: [INITIAL_VIEW.center[0], INITIAL_VIEW.center[1]],
      zoom: INITIAL_VIEW.zoom,
      minZoom: INITIAL_VIEW.minZoom,
      maxZoom: INITIAL_VIEW.maxZoom,
      // La atribución se pinta en un bloque propio para poder incluir la del IGAC,
      // que es obligatoria y no puede quedar detrás de un botón plegable.
      attributionControl: false,
      // El teclado nativo de MapLibre se conserva; se le añaden atajos propios.
      keyboard: true,
      // Evita gestos de arrastre accidentales en móvil dentro del panel inferior.
      cooperativeGestures: false,
    });

    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    instance.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    instance.addControl(
      new maplibregl.GeolocateControl({ trackUserLocation: false, showAccuracyCircle: true }),
      'top-right',
    );

    instance.on('load', () => {
      isReady.value = true;
      notifyView.run();
    });

    instance.on('moveend', () => notifyView.run());
    instance.on('zoomend', () => notifyView.run());

    instance.on('click', (event) => {
      if (!options.onFeatureClick) return;
      options.onFeatureClick(hitFromPoint(instance, event.point, [event.lngLat.lng, event.lngLat.lat]));
    });

    instance.on('mousemove', (event) => {
      const hit = hitFromPoint(instance, event.point, [event.lngLat.lng, event.lngLat.lat]);
      applyHover(instance, hit);
      instance.getCanvas().style.cursor = hit ? 'pointer' : '';
      options.onFeatureHover?.(hit);
    });

    instance.on('mouseout', () => {
      applyHover(instance, null);
      options.onFeatureHover?.(null);
    });

    map.value = instance;
  }

  /** Busca la entidad bajo el cursor en las capas interactivas que estén montadas. */
  function hitFromPoint(
    instance: MapLibreMap,
    point: PointLike,
    lngLat: [number, number],
  ): MapFeatureHit | null {
    const candidateLayers: string[] = [];
    for (const layer of mounted.keys()) {
      const def = LAYER_BY_ID[layer];
      if (!def?.interactive) continue;
      for (const id of layerIdsFor(layer)) {
        if (instance.getLayer(id)) candidateLayers.push(id);
      }
    }
    if (candidateLayers.length === 0) return null;

    const features = instance.queryRenderedFeatures(point, { layers: candidateLayers });
    const feature = features[0];
    if (!feature) return null;

    const logical = logicalLayerOf(feature);
    if (!logical) return null;

    return {
      layer: logical,
      id: feature.id ?? '',
      properties: feature.properties ?? {},
      lngLat,
    };
  }

  /** Del id de la capa MapLibre (`tc-parcel-fill`) a la capa lógica (`parcel`). */
  function logicalLayerOf(feature: MapGeoJSONFeature): TileLayer | null {
    for (const layer of mounted.keys()) {
      if (layerIdsFor(layer).includes(feature.layer.id)) return layer;
    }
    return null;
  }

  /**
   * `setFeatureState` sobre una fuente que aún no está en el estilo lanza «The source … does
   * not exist in the map's style»: pasa al abrir una ficha con el predio ya seleccionado
   * antes de que la capa de predios se haya añadido. Se comprueba y se deja para más tarde.
   */
  function hasSource(instance: MapLibreMap, layer: TileLayer): boolean {
    return Boolean(instance.getSource(sourceIdFor(layer)));
  }

  function applyHover(instance: MapLibreMap, hit: MapFeatureHit | null): void {
    for (const [layer, id] of hoveredByLayer.entries()) {
      if (hit && hit.layer === layer && hit.id === id) continue;
      if (hasSource(instance, layer)) {
        instance.removeFeatureState({ source: sourceIdFor(layer), sourceLayer: layer, id }, 'hover');
      }
      hoveredByLayer.delete(layer);
    }
    if (!hit || hit.id === '' || !hasSource(instance, hit.layer)) return;
    instance.setFeatureState(
      { source: sourceIdFor(hit.layer), sourceLayer: hit.layer, id: hit.id },
      { hover: true },
    );
    hoveredByLayer.set(hit.layer, hit.id);
  }

  function setSelected(layer: TileLayer, id: string | number | null): void {
    const instance = map.value;
    if (!instance) return;

    const previous = selectedByLayer.get(layer);
    if (previous !== undefined) {
      if (hasSource(instance, layer)) {
        instance.removeFeatureState(
          { source: sourceIdFor(layer), sourceLayer: layer, id: previous },
          'selected',
        );
      }
      selectedByLayer.delete(layer);
    }
    if (id === null || id === '' || !hasSource(instance, layer)) return;

    instance.setFeatureState(
      { source: sourceIdFor(layer), sourceLayer: layer, id },
      { selected: true },
    );
    selectedByLayer.set(layer, id);
  }

  /** Añade, quita y reestiliza capas hasta que el estilo coincida con el estado pedido. */
  function syncLayers(
    visible: TileLayer[],
    opacities: Record<string, number>,
    cutDate: string | null,
  ): void {
    const instance = map.value;
    if (!instance || !isReady.value) return;

    // Quitar lo que ya no debe estar, o lo que cambió de corte temporal.
    for (const [layer, mountedCut] of [...mounted.entries()]) {
      if (visible.includes(layer) && mountedCut === cutDate) continue;
      removeLayer(instance, layer);
    }

    // Añadir lo que falta.
    for (const layer of visible) {
      if (mounted.has(layer)) continue;
      addLayer(instance, layer, opacities[layer], cutDate);
    }

    // Reaplicar opacidades de lo que ya estaba.
    for (const layer of mounted.keys()) {
      applyOpacity(instance, layer, opacities[layer]);
    }
  }

  function addLayer(
    instance: MapLibreMap,
    layer: TileLayer,
    opacity: number | undefined,
    cutDate: string | null,
  ): void {
    const def = LAYER_BY_ID[layer];
    if (!def) return;

    const sourceId = sourceIdFor(layer);
    if (!instance.getSource(sourceId)) {
      const idProperty = FEATURE_ID_PROPERTY[layer];
      instance.addSource(sourceId, {
        type: 'vector',
        tiles: [tileUrlTemplate(layer, cutDate)],
        // Sin el `- 2` de antes: pedir teselas dos zooms por debajo del mínimo que sirve
        // el servidor solo gastaba presupuesto de peticiones para recibir 204.
        minzoom: Math.max(0, Math.floor(def.minZoom)),
        maxzoom: Math.ceil(def.maxZoom),
        // Sin `promoteId` el `feature-state` no sobrevive al borde de tesela.
        ...(idProperty ? { promoteId: { [layer]: idProperty } } : {}),
      });
    }

    const specs = def.build({
      sourceId,
      sourceLayer: layer,
      opacity: opacity ?? def.defaultOpacity,
    });
    // Los datos propios van DEBAJO de las etiquetas del mapa base, o los nombres de barrio
    // y de vía quedan tapados por los polígonos. `LABEL_LAYER_ID` solo existe en el estilo
    // propio de Protomaps; con OpenFreeMap —que es el estilo por omisión— nunca encontraba
    // esa capa y todo se insertaba encima de todo. Se busca la primera capa de símbolos del
    // estilo que realmente esté cargado.
    const beforeId = instance.getLayer(LABEL_LAYER_ID)
      ? LABEL_LAYER_ID
      : firstSymbolLayerId(instance.getStyle().layers);
    for (const spec of specs) {
      if (!instance.getLayer(spec.id)) instance.addLayer(spec, beforeId);
    }

    mounted.set(layer, cutDate);
  }

  function removeLayer(instance: MapLibreMap, layer: TileLayer): void {
    for (const id of layerIdsFor(layer)) {
      if (instance.getLayer(id)) instance.removeLayer(id);
    }
    const sourceId = sourceIdFor(layer);
    if (instance.getSource(sourceId)) instance.removeSource(sourceId);
    mounted.delete(layer);
    hoveredByLayer.delete(layer);
    selectedByLayer.delete(layer);
  }

  /** La opacidad es la única propiedad que el usuario ajusta en vivo. */
  function applyOpacity(instance: MapLibreMap, layer: TileLayer, value: number | undefined): void {
    const def = LAYER_BY_ID[layer];
    if (!def || value === undefined) return;

    for (const spec of def.build({ sourceId: sourceIdFor(layer), sourceLayer: layer, opacity: value })) {
      if (!instance.getLayer(spec.id)) continue;
      if (spec.type === 'fill') {
        const paint = spec.paint?.['fill-opacity'];
        if (paint !== undefined) instance.setPaintProperty(spec.id, 'fill-opacity', paint);
      } else if (spec.type === 'line') {
        const paint = spec.paint?.['line-opacity'];
        if (paint !== undefined) instance.setPaintProperty(spec.id, 'line-opacity', paint);
      } else if (spec.type === 'circle') {
        const paint = spec.paint?.['circle-opacity'];
        if (paint !== undefined) instance.setPaintProperty(spec.id, 'circle-opacity', paint);
      }
    }
  }

  function fitBBox(bbox: BBox, padding = 48): void {
    const instance = map.value;
    if (!instance) return;
    const bounds: LngLatBoundsLike = [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ];
    instance.fitBounds(bounds, { padding, duration: 600 });
  }

  function flyTo(center: [number, number], zoom?: number): void {
    const instance = map.value;
    if (!instance) return;
    instance.flyTo({ center, zoom: zoom ?? Math.max(instance.getZoom(), 15), duration: 900 });
  }

  /**
   * Atajos de teclado propios sobre el contenedor enfocable. MapLibre ya mueve el mapa con
   * las flechas cuando el canvas tiene el foco; esto garantiza el mismo comportamiento
   * cuando el foco está en el contenedor y añade Enter para consultar el centro.
   */
  function handleKeydown(event: KeyboardEvent): void {
    const instance = map.value;
    if (!instance) return;

    const pan = (x: number, y: number): void => {
      event.preventDefault();
      instance.panBy([x, y], { duration: 200 });
    };

    switch (event.key) {
      case 'ArrowUp':
        pan(0, -KEYBOARD_PAN_PX);
        break;
      case 'ArrowDown':
        pan(0, KEYBOARD_PAN_PX);
        break;
      case 'ArrowLeft':
        pan(-KEYBOARD_PAN_PX, 0);
        break;
      case 'ArrowRight':
        pan(KEYBOARD_PAN_PX, 0);
        break;
      case '+':
      case '=':
        event.preventDefault();
        instance.zoomIn({ duration: 200 });
        break;
      case '-':
      case '_':
        event.preventDefault();
        instance.zoomOut({ duration: 200 });
        break;
      case 'Enter': {
        event.preventDefault();
        const center = instance.getCenter();
        const point = instance.project(center);
        options.onFeatureClick?.(hitFromPoint(instance, point, [center.lng, center.lat]));
        break;
      }
      default:
        break;
    }
  }

  function destroy(): void {
    notifyView.cancel();
    mounted.clear();
    hoveredByLayer.clear();
    selectedByLayer.clear();
    map.value?.remove();
    map.value = null;
    isReady.value = false;
  }

  onBeforeUnmount(destroy);

  return {
    map,
    isReady,
    init,
    destroy,
    syncLayers,
    setSelected,
    fitBBox,
    flyTo,
    currentBBox,
    handleKeydown,
  };
}
