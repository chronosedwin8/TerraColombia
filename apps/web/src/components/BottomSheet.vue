<script setup lang="ts">
/**
 * Panel inferior deslizable sobre el mapa. Es el patrón *mobile-first* que exige PLAN.md §10.1:
 * en móvil el mapa ocupa la pantalla y los resultados suben desde abajo en tres alturas.
 *
 * En escritorio (`>= 768 px`) el mismo contenido se sirve como columna lateral, de modo que la
 * vista no tiene que escribir dos veces su contenido.
 *
 * Accesibilidad: el asa es un botón real con `aria-expanded`; se puede cambiar de altura con
 * teclado (flechas arriba/abajo) y cerrar con Escape. El gesto de arrastre es un extra, no la
 * única forma de operarlo.
 */
import { computed, ref } from 'vue';
import { useUiStore, type SheetState } from '@/stores/ui';

const props = withDefaults(
  defineProps<{
    title: string;
    /** Permite ocultarlo del todo (por ejemplo, mientras se dibuja en el mapa). */
    closable?: boolean;
  }>(),
  { closable: true },
);

const ui = useUiStore();

const HEIGHTS: Record<SheetState, string> = {
  hidden: '0px',
  peek: '5.5rem',
  half: '48vh',
  full: '88vh',
};

const ORDER: SheetState[] = ['peek', 'half', 'full'];

const height = computed(() => HEIGHTS[ui.sheetState]);
const isOpen = computed(() => ui.sheetState !== 'hidden' && ui.sheetState !== 'peek');

/** Posición del dedo al empezar el arrastre, para decidir si sube o baja. */
const dragStartY = ref<number | null>(null);

function onPointerDown(event: PointerEvent): void {
  dragStartY.value = event.clientY;
}

function onPointerUp(event: PointerEvent): void {
  const start = dragStartY.value;
  dragStartY.value = null;
  if (start === null) return;

  const delta = start - event.clientY;
  // Menos de 24 px se considera un toque, no un arrastre.
  if (Math.abs(delta) < 24) {
    ui.cycleSheet();
    return;
  }
  shift(delta > 0 ? 1 : -1);
}

function shift(direction: 1 | -1): void {
  const index = ORDER.indexOf(ui.sheetState);
  if (index === -1) {
    ui.setSheetState(direction > 0 ? 'half' : 'peek');
    return;
  }
  const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, index + direction))];
  if (next) ui.setSheetState(next);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    shift(1);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    shift(-1);
  } else if (event.key === 'Escape' && props.closable) {
    ui.setSheetState('peek');
  }
}
</script>

<template>
  <!-- Escritorio: columna lateral. No hay asa ni gestos; el contenido se lee de corrido. -->
  <aside
    v-if="!ui.isMobile"
    class="tc-card flex h-full min-h-0 flex-col overflow-hidden"
    :aria-label="title"
  >
    <header class="border-b border-slate-200 px-4 py-3">
      <h2 class="text-sm font-semibold">{{ title }}</h2>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <slot />
    </div>
    <div v-if="$slots.footer" class="border-t border-slate-200">
      <slot name="footer" />
    </div>
  </aside>

  <!-- Móvil: hoja inferior en tres alturas. -->
  <aside
    v-else
    class="fixed inset-x-0 bottom-0 z-sheet flex flex-col rounded-t-2xl border-t border-slate-200
      bg-white shadow-sheet transition-[height] duration-200"
    :style="{ height, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }"
    :aria-label="title"
    data-testid="bottom-sheet"
  >
    <button
      type="button"
      class="flex w-full shrink-0 flex-col items-center gap-1 px-4 py-2"
      :aria-expanded="isOpen"
      aria-controls="tc-sheet-content"
      :aria-label="`${title}. ${isOpen ? 'Contraer' : 'Expandir'} el panel. Usa las flechas arriba y abajo para cambiar la altura.`"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @keydown="onKeydown"
    >
      <span class="h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
      <span class="w-full truncate text-left text-sm font-semibold">{{ title }}</span>
    </button>

    <div id="tc-sheet-content" class="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
      <slot />
    </div>

    <div v-if="$slots.footer" class="shrink-0 border-t border-slate-200">
      <slot name="footer" />
    </div>
  </aside>
</template>
