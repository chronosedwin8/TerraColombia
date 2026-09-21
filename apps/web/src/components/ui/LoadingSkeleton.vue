<script setup lang="ts">
/**
 * Esqueleto de carga. Se anuncia como región ocupada para que el lector de pantalla
 * diga "Cargando…" en vez de leer un bloque vacío.
 */
import { computed } from 'vue';
import { MESSAGES } from '@terracolombia/shared';

const props = withDefaults(
  defineProps<{
    /** Número de líneas de texto simuladas. */
    lines?: number;
    /** Variante: líneas de texto, tarjeta o bloque de mapa. */
    variant?: 'text' | 'card' | 'map' | 'chart';
    height?: string;
  }>(),
  { lines: 3, variant: 'text', height: undefined },
);

/** Anchos alternados para que no parezca una rejilla perfecta. */
const widths = computed(() =>
  Array.from({ length: props.lines }, (_, index) => (index % 3 === 2 ? 'w-2/3' : index % 2 === 0 ? 'w-full' : 'w-5/6')),
);
</script>

<template>
  <div role="status" :aria-busy="true" :aria-label="MESSAGES.common.loading">
    <span class="sr-only">{{ MESSAGES.common.loading }}</span>

    <div v-if="variant === 'text'" class="space-y-2">
      <div v-for="(width, index) in widths" :key="index" class="tc-skeleton h-3" :class="width" />
    </div>

    <div v-else-if="variant === 'card'" class="tc-card space-y-3 p-4">
      <div class="tc-skeleton h-4 w-1/3" />
      <div class="tc-skeleton h-3 w-full" />
      <div class="tc-skeleton h-3 w-5/6" />
      <div class="tc-skeleton h-3 w-2/3" />
    </div>

    <div
      v-else-if="variant === 'map'"
      class="tc-skeleton w-full"
      :style="{ height: height ?? '320px' }"
    />

    <div v-else class="flex items-end gap-2" :style="{ height: height ?? '180px' }">
      <div
        v-for="(_, index) in 8"
        :key="index"
        class="tc-skeleton w-full"
        :style="{ height: `${30 + ((index * 37) % 65)}%` }"
      />
    </div>
  </div>
</template>
