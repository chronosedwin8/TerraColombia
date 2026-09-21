<script setup lang="ts">
/**
 * Mapa de calor sobre la rejilla H3 (M6 y agregados de zoom bajo).
 *
 * Las celdas llegan como índices H3 con un puntaje 0–100; aquí se convierten a polígonos
 * con `@terracolombia/geo` y se pintan como una fuente GeoJSON aparte, independiente de las
 * teselas. Así el usuario mueve un peso y el mapa se repinta sin volver a pedir teselas.
 *
 * Componente sin marcado: solo gestiona fuente y capas del mapa.
 */
import { onBeforeUnmount, watch } from 'vue';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import { cellToPolygon } from '@terracolombia/geo';
import type { GeoJsonFeature, GeoJsonFeatureCollection } from '@terracolombia/shared';
import type { ScoredCell } from '@/api/types';

const props = withDefaults(
  defineProps<{
    map: MapLibreMap | null;
    cells: ScoredCell[];
    opacity?: number;
    /** Oculta las celdas por debajo de este puntaje para despejar el mapa. */
    minScore?: number;
    visible?: boolean;
  }>(),
  { opacity: 0.75, minScore: 0, visible: true },
);

const emit = defineEmits<{ (e: 'cell-click', cell: ScoredCell): void }>();

const SOURCE_ID = 'tc-h3-heat';
const FILL_ID = 'tc-h3-heat-fill';
const LINE_ID = 'tc-h3-heat-line';

/**
 * Escala secuencial de un solo tono: legible también en escala de grises y en impresión.
 * Se declara aquí para que la leyenda y la expresión de MapLibre no se desincronicen.
 */
const RAMP: Array<{ stop: number; color: string }> = [
  { stop: 0, color: '#f7fbf9' },
  { stop: 25, color: '#c9e6db' },
  { stop: 50, color: '#7dc4ad' },
  { stop: 75, color: '#3b8f77' },
  { stop: 100, color: '#13463a' },
];

/** Dato tal como lo acepta MapLibre. Ver nota de `asMapLibreData`. */
type MapLibreGeoJsonData = Parameters<GeoJSONSource['setData']>[0];

/**
 * `GeoJsonFeatureCollection` de `@terracolombia/shared` admite `geometry: null` porque algunas
 * respuestas del API traen entidades sin geometría. Aquí nunca es null (solo se añaden celdas
 * convertidas), pero el tipo de MapLibre exige geometría obligatoria: se afirma el tipo en un
 * único punto en lugar de repartir `any` por el archivo.
 */
function asMapLibreData(collection: GeoJsonFeatureCollection): MapLibreGeoJsonData {
  return collection as unknown as MapLibreGeoJsonData;
}

function toFeatureCollection(cells: ScoredCell[]): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  for (const cell of cells) {
    // Una celda sin puntaje no es una celda de puntaje bajo: es una a la que le faltaban
    // indicadores obligatorios. No se pinta, porque colorearla afirmaría algo que no sabemos.
    if (cell.score === null || cell.score < props.minScore) continue;
    try {
      features.push({
        type: 'Feature',
        id: cell.h3,
        geometry: cellToPolygon(cell.h3),
        properties: { h3: cell.h3, score: cell.score },
      });
    } catch {
      // Un índice H3 inválido se descarta en silencio: no se inventa una celda.
    }
  }
  return { type: 'FeatureCollection', features };
}

function ensureLayers(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: asMapLibreData(toFeatureCollection(props.cells)),
      promoteId: 'h3',
    });
  }

  if (!map.getLayer(FILL_ID)) {
    map.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        // Literal a propósito: la especificación de MapLibre es una tupla y no admite spread.
        'fill-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'score'], 0],
          0,
          '#f7fbf9',
          25,
          '#c9e6db',
          50,
          '#7dc4ad',
          75,
          '#3b8f77',
          100,
          '#13463a',
        ],
        'fill-opacity': props.opacity,
      },
    });
  }

  if (!map.getLayer(LINE_ID)) {
    map.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 0.4],
      },
    });
    map.on('click', FILL_ID, onClick);
  }
}

function onClick(event: MapLayerMouseEvent): void {
  const feature = event.features?.[0];
  const h3 = feature?.properties?.['h3'];
  if (typeof h3 !== 'string') return;
  const cell = props.cells.find((c) => c.h3 === h3);
  if (cell) emit('cell-click', cell);
}

function removeLayers(map: MapLibreMap): void {
  if (map.getLayer(FILL_ID)) {
    map.off('click', FILL_ID, onClick);
    map.removeLayer(FILL_ID);
  }
  if (map.getLayer(LINE_ID)) map.removeLayer(LINE_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

function update(): void {
  const map = props.map;
  if (!map || !map.isStyleLoaded()) return;

  if (!props.visible || props.cells.length === 0) {
    removeLayers(map);
    return;
  }

  ensureLayers(map);

  // Se re-alimenta la fuente en lugar de recrear las capas: el repintado es inmediato.
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(asMapLibreData(toFeatureCollection(props.cells)));
  if (map.getLayer(FILL_ID)) map.setPaintProperty(FILL_ID, 'fill-opacity', props.opacity);
}

watch(
  () => [props.map, props.cells, props.opacity, props.minScore, props.visible],
  () => update(),
  { deep: false, immediate: true },
);

onBeforeUnmount(() => {
  if (props.map) removeLayers(props.map);
});
</script>

<template>
  <!-- El efecto ocurre sobre la instancia de MapLibre; aquí solo va la leyenda de la escala. -->
  <div v-if="visible && cells.length > 0" class="text-xs" data-testid="h3-heat-legend">
    <p class="tc-label mb-1">Oportunidad por celda (0–100)</p>
    <div class="flex items-center gap-1">
      <span
        v-for="step in RAMP"
        :key="step.stop"
        class="h-3 flex-1 border border-black/10"
        :style="{ backgroundColor: step.color }"
        aria-hidden="true"
      />
    </div>
    <div class="mt-0.5 flex justify-between text-[11px] text-slate-600">
      <span>Menor</span>
      <span>Mayor</span>
    </div>
    <p class="sr-only" aria-live="polite">
      {{ cells.length }} celdas puntuadas en el mapa de calor. La escala va de 0 (menor
      oportunidad) a 100 (mayor oportunidad).
    </p>
  </div>
</template>
