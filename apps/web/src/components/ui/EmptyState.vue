<script setup lang="ts">
/**
 * Estado vacío honesto (PLAN.md §10.1). Nunca dice solo "sin resultados": explica por qué
 * no hay nada y, cuando existe, enumera lo que sí tenemos para esa zona.
 */
import BaseButton from './BaseButton.vue';

withDefaults(
  defineProps<{
    title: string;
    /** Explicación en lenguaje claro de por qué no hay datos. */
    body?: string;
    /** Lo que sí está disponible: "población, colegios, suelos…". */
    availableItems?: string[];
    actionLabel?: string;
    icon?: 'search' | 'map' | 'data' | 'lock';
  }>(),
  { body: undefined, availableItems: undefined, actionLabel: undefined, icon: 'data' },
);

defineEmits<{ (e: 'action'): void }>();
</script>

<template>
  <div
    class="flex flex-col items-center rounded-lg border border-dashed border-slate-300
      bg-surface-muted px-6 py-10 text-center"
    role="status"
    data-testid="empty-state"
  >
    <svg class="h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <template v-if="icon === 'search'">
        <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </template>
      <template v-else-if="icon === 'map'">
        <path
          d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Zm0 0v15m6-12v15"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </template>
      <template v-else-if="icon === 'lock'">
        <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" />
        <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="1.8" />
      </template>
      <template v-else>
        <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" stroke-width="1.8" />
        <path
          d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"
          stroke="currentColor"
          stroke-width="1.8"
        />
      </template>
    </svg>

    <h3 class="mt-3 text-base font-semibold text-slate-800">{{ title }}</h3>
    <p v-if="body" class="mt-1 max-w-prose text-sm text-slate-600">{{ body }}</p>

    <div v-if="availableItems && availableItems.length > 0" class="mt-3 text-sm text-slate-700">
      <p class="font-medium">Sí tenemos para esta zona:</p>
      <ul class="mt-1 flex flex-wrap justify-center gap-1.5">
        <li
          v-for="item in availableItems"
          :key="item"
          class="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs"
        >
          {{ item }}
        </li>
      </ul>
    </div>

    <div v-if="actionLabel || $slots.action" class="mt-4">
      <slot name="action">
        <BaseButton variant="secondary" size="sm" @click="$emit('action')">
          {{ actionLabel }}
        </BaseButton>
      </slot>
    </div>
  </div>
</template>
