<script setup lang="ts">
/**
 * Herramientas de dibujo sobre el mapa, con `terra-draw`.
 *
 * Tres modos, los tres que pide el analizador de zona (PLAN.md §10.2.4):
 *  - **Polígono**: el usuario traza el área a mano.
 *  - **Círculo/radio**: un centro y un radio, lo más común para "a 500 m de aquí".
 *  - **Municipio**: no dibuja; toma el municipio bajo el clic como ámbito.
 *
 * `terra-draw` se carga con `import()` dinámico: pesa y solo hace falta en las vistas de
 * análisis, no en la home.
 */
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { GeoJsonGeometry } from '@terracolombia/shared';
import { approxAreaKm2 } from '@terracolombia/geo';
import BaseButton from '@/components/ui/BaseButton.vue';
import type { DrawMode } from './types';

const props = withDefaults(
  defineProps<{
    map: MapLibreMap | null;
    /** Límite del plan, en km². Se avisa si el dibujo lo supera. */
    maxAreaKm2?: number | null;
    modes?: DrawMode[];
  }>(),
  { maxAreaKm2: null, modes: () => ['polygon', 'circle', 'municipality'] },
);

const emit = defineEmits<{
  (e: 'change', geometry: GeoJsonGeometry | null): void;
  (e: 'mode', mode: DrawMode): void;
}>();

const mode = ref<DrawMode>('none');
const areaKm2 = ref<number | null>(null);
const isTooLarge = ref(false);
const loadError = ref<string | null>(null);

// La instancia no se hace reactiva: es un objeto grande con estado interno propio.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- terra-draw no exporta un tipo estable para la instancia
const draw = shallowRef<any>(null);

const MODE_LABELS: Record<DrawMode, string> = {
  none: 'Ninguno',
  polygon: 'Dibujar polígono',
  circle: 'Radio desde un punto',
  municipality: 'Todo un municipio',
};

const MODE_HINTS: Record<DrawMode, string> = {
  none: '',
  polygon: 'Haz clic en cada vértice y doble clic para cerrar el área.',
  circle: 'Haz clic en el centro y arrastra para fijar el radio.',
  municipality: 'Haz clic sobre el municipio que quieres analizar.',
};

async function ensureDraw(): Promise<void> {
  // Se captura la instancia antes del `await`: el estrechamiento de tipo no sobrevive al await.
  const map = props.map;
  if (draw.value || !map) return;
  try {
    // El adaptador de MapLibre solo necesita la instancia del mapa.
    const [terraDraw, adapterModule] = await Promise.all([
      import('terra-draw'),
      import('terra-draw-maplibre-gl-adapter'),
    ]);

    const instance = new terraDraw.TerraDraw({
      adapter: new adapterModule.TerraDrawMapLibreGLAdapter({ map }),
      modes: [new terraDraw.TerraDrawPolygonMode(), new terraDraw.TerraDrawCircleMode()],
    });

    instance.start();
    instance.on('finish', () => {
      publishSnapshot(instance);
    });
    instance.on('change', () => {
      publishSnapshot(instance);
    });

    draw.value = instance;
  } catch {
    loadError.value =
      'No pudimos cargar las herramientas de dibujo. Recarga la página o usa la opción "Todo un municipio".';
  }
}

/** Toma la última figura dibujada y la publica como geometría GeoJSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el snapshot de terra-draw es un arreglo de Feature sin tipo exportado
function publishSnapshot(instance: any): void {
  const features: Array<{ geometry?: GeoJsonGeometry }> = instance.getSnapshot() ?? [];
  const last = features.at(-1);
  const geometry = last?.geometry ?? null;

  if (!geometry) {
    areaKm2.value = null;
    isTooLarge.value = false;
    emit('change', null);
    return;
  }

  const km2 = approxAreaKm2(geometry);
  areaKm2.value = km2;
  isTooLarge.value = props.maxAreaKm2 !== null && km2 > props.maxAreaKm2;
  emit('change', geometry);
}

async function setMode(next: DrawMode): Promise<void> {
  mode.value = next;
  emit('mode', next);

  if (next === 'none' || next === 'municipality') {
    draw.value?.setMode('static');
    return;
  }

  await ensureDraw();
  draw.value?.setMode(next);
}

function clearDrawing(): void {
  draw.value?.clear();
  areaKm2.value = null;
  isTooLarge.value = false;
  emit('change', null);
}

watch(
  () => props.map,
  (instance) => {
    // Si el mapa se recrea, la instancia anterior queda huérfana.
    if (!instance && draw.value) {
      draw.value.stop();
      draw.value = null;
    }
  },
);

onBeforeUnmount(() => {
  try {
    draw.value?.stop();
  } catch {
    // La instancia ya podía estar detenida si el mapa se destruyó primero.
  }
  draw.value = null;
});
</script>

<template>
  <div class="rounded-md border border-slate-200 bg-white p-3 shadow-panel" data-testid="draw-tools">
    <p class="tc-label mb-2">Definir la zona</p>

    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Herramientas de dibujo">
      <BaseButton
        v-for="option in modes"
        :key="option"
        :variant="mode === option ? 'primary' : 'secondary'"
        size="sm"
        :aria-pressed="mode === option"
        @click="setMode(option)"
      >
        {{ MODE_LABELS[option] }}
      </BaseButton>

      <BaseButton variant="ghost" size="sm" @click="clearDrawing">Borrar</BaseButton>
    </div>

    <p v-if="mode !== 'none'" class="mt-2 text-xs text-slate-600">{{ MODE_HINTS[mode] }}</p>

    <p v-if="loadError" class="mt-2 text-xs font-medium text-rose-700" role="alert">
      {{ loadError }}
    </p>

    <p v-if="areaKm2 !== null" class="mt-2 text-xs" :class="isTooLarge ? 'text-rose-700' : 'text-slate-700'">
      Área dibujada: <strong>{{ areaKm2.toFixed(2) }} km²</strong>
      <template v-if="isTooLarge && maxAreaKm2 !== null">
        — supera el límite de tu plan ({{ maxAreaKm2 }} km²). Dibuja un área más pequeña o mejora
        tu plan.
      </template>
    </p>
  </div>
</template>
