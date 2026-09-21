<script setup lang="ts">
/**
 * Sección plegable: el segundo nivel de la divulgación progresiva (PLAN.md §10.1).
 * Usa `<details>`/`<summary>` nativos, que ya traen accesibilidad de teclado y estado
 * expandido anunciado por los lectores de pantalla.
 */
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    /** Resumen de una línea visible incluso plegada. */
    hint?: string;
    open?: boolean;
    /** Marca la sección como vacía para que el usuario no la abra en vano. */
    empty?: boolean;
    emptyLabel?: string;
  }>(),
  { hint: undefined, open: false, empty: false, emptyLabel: 'Sin datos' },
);

const emit = defineEmits<{ (e: 'toggle', open: boolean): void }>();

const isOpen = ref(props.open);
watch(
  () => props.open,
  (value) => {
    isOpen.value = value;
  },
);

function onToggle(event: Event): void {
  const target = event.target as HTMLDetailsElement;
  isOpen.value = target.open;
  emit('toggle', target.open);
}
</script>

<template>
  <details
    class="group border-b border-slate-200 last:border-b-0"
    :open="isOpen"
    @toggle="onToggle"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3
        hover:bg-surface-muted"
    >
      <span class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-semibold">{{ title }}</span>
        <span v-if="hint" class="truncate text-xs text-slate-500">{{ hint }}</span>
      </span>
      <span class="flex shrink-0 items-center gap-2">
        <span v-if="empty" class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {{ emptyLabel }}
        </span>
        <svg
          class="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z"
            clip-rule="evenodd"
          />
        </svg>
      </span>
    </summary>
    <div class="px-4 pb-4 pt-1">
      <slot />
    </div>
  </details>
</template>
