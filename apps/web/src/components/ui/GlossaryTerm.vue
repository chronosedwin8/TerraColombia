<script setup lang="ts">
/**
 * Término técnico subrayado que abre su definición.
 *
 * Principio "todo se explica" (PLAN.md §10.1): NPN, vocación, zona homogénea, destino
 * económico y demás no aparecen nunca "a pelo". El subrayado punteado y el icono avisan
 * de que hay definición; es un `<button>` real, así que funciona con teclado.
 */
import { computed } from 'vue';
import { lookupGlossary } from '@/composables/useGlossary';
import { useUiStore } from '@/stores/ui';
import Tooltip from './Tooltip.vue';

const props = withDefaults(
  defineProps<{
    /** Id de la entrada en `GLOSSARY` de `@terracolombia/shared`. */
    id: string;
    /** Texto a mostrar; por omisión, el término del glosario. */
    label?: string;
    /** Abre el panel lateral al hacer clic, además del tooltip al pasar el cursor. */
    openable?: boolean;
  }>(),
  { label: undefined, openable: true },
);

const ui = useUiStore();
const entry = computed(() => lookupGlossary(props.id));
const text = computed(() => props.label ?? entry.value?.term ?? props.id);

function open(): void {
  if (props.openable && entry.value) ui.openGlossary(props.id);
}
</script>

<template>
  <!-- Si el término no existe en el glosario se muestra el texto sin prometer una definición. -->
  <span v-if="!entry">{{ text }}</span>

  <Tooltip v-else>
    <template #content>
      <strong class="block">{{ entry.term }}</strong>
      <span class="mt-1 block">{{ entry.plain }}</span>
      <span v-if="openable" class="mt-1 block opacity-80">Clic para ver la definición completa.</span>
    </template>

    <button
      type="button"
      class="cursor-help border-b border-dotted border-slate-500 text-left"
      :aria-label="`${text}. Ver definición`"
      data-testid="glossary-term"
      @click="open"
    >
      {{ text }}
      <svg
        class="ml-0.5 inline-block h-3 w-3 -translate-y-px text-slate-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.9-11.6a.9.9 0 1 1-1.8 0 .9.9 0 0 1 1.8 0ZM9.3 9.1h1.4v5.3H9.3V9.1Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </Tooltip>
</template>
