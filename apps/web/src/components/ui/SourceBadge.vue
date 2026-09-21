<script setup lang="ts">
/**
 * Procedencia de un dato, en una línea: entidad · dataset · fecha de corte · licencia.
 * Es la unidad mínima de la regla 4 de CLAUDE.md (sin procedencia no se muestra la cifra).
 */
import { computed } from 'vue';
import { MESSAGES, type SourceRef } from '@terracolombia/shared';
import Tooltip from './Tooltip.vue';

const props = withDefaults(
  defineProps<{ source: SourceRef; compact?: boolean }>(),
  { compact: false },
);

/** AAAA-MM-DD → "marzo de 2025". La fecha exacta queda en el tooltip. */
const cutLabel = computed(() => {
  const cut = props.source.cutDate;
  if (!cut) return MESSAGES.common.notAvailable;
  const date = new Date(`${cut}T00:00:00`);
  if (Number.isNaN(date.getTime())) return cut;
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
});

const tooltipText = computed(
  () =>
    `${props.source.attribution}\n${MESSAGES.common.cutDate}: ${props.source.cutDate ?? MESSAGES.common.notAvailable}\n${MESSAGES.common.license}: ${props.source.license}`,
);
</script>

<template>
  <Tooltip :text="tooltipText">
    <span
      class="inline-flex max-w-full items-center gap-1.5 rounded border border-slate-200
        bg-surface-muted px-2 py-0.5 text-[11px] leading-tight text-slate-700"
      data-testid="source-badge"
    >
      <svg class="h-3 w-3 shrink-0 text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          d="M4 3.5A1.5 1.5 0 0 1 5.5 2h6.1c.4 0 .8.16 1.06.44l2.9 2.9c.28.28.44.66.44 1.06v10.1A1.5 1.5 0 0 1 14.5 18h-9A1.5 1.5 0 0 1 4 16.5v-13Z"
        />
      </svg>
      <span class="truncate">
        <strong class="font-semibold">{{ source.source }}</strong>
        <template v-if="!compact"> · {{ source.name }}</template>
        · {{ cutLabel }}
        <template v-if="!compact"> · {{ source.license }}</template>
      </span>
      <span
        v-if="source.synthetic"
        class="shrink-0 rounded bg-rose-100 px-1 font-semibold uppercase text-rose-800"
      >
        demo
      </span>
      <a
        v-if="source.url"
        :href="source.url"
        target="_blank"
        rel="noreferrer noopener"
        class="shrink-0 underline"
        :aria-label="`Abrir la fuente ${source.name} en una pestaña nueva`"
      >
        ver
      </a>
    </span>
  </Tooltip>
</template>
