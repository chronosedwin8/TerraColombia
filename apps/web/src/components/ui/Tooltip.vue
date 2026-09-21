<script setup lang="ts">
/**
 * Tooltip accesible.
 *
 * - Se abre con hover **y** con foco de teclado (WCAG 1.4.13).
 * - Se cierra con Escape sin mover el foco.
 * - El contenido se anuncia con `aria-describedby`, no con `title`, que los lectores
 *   de pantalla móviles ignoran.
 */
import { computed, ref, useId } from 'vue';

withDefaults(
  defineProps<{
    /** Texto del tooltip. Para contenido rico, usa el slot `content`. */
    text?: string;
    placement?: 'top' | 'bottom';
  }>(),
  { text: undefined, placement: 'top' },
);

const open = ref(false);
const uid = useId();
const tooltipId = computed(() => `tooltip-${uid}`);

function show(): void {
  open.value = true;
}
function hide(): void {
  open.value = false;
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    hide();
  }
}
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @keydown="onKeydown"
  >
    <span :aria-describedby="open ? tooltipId : undefined">
      <slot />
    </span>

    <span
      v-if="open"
      :id="tooltipId"
      role="tooltip"
      class="absolute left-1/2 z-modal w-64 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2
        text-xs leading-snug text-white shadow-lg"
      :class="placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'"
    >
      <slot name="content">{{ text }}</slot>
    </span>
  </span>
</template>
