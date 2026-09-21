<script setup lang="ts">
/**
 * Pestañas accesibles: patrón `tablist`/`tab`/`tabpanel` del WAI-ARIA, con navegación
 * por flechas, Inicio y Fin. El contenido lo pinta el llamador con el slot `panel`.
 */
import { computed, ref, watch } from 'vue';
import type { TabItem } from './types';

const props = withDefaults(
  defineProps<{ tabs: TabItem[]; modelValue?: string; ariaLabel?: string }>(),
  { modelValue: undefined, ariaLabel: 'Secciones' },
);

const emit = defineEmits<{ (e: 'update:modelValue', id: string): void }>();

const internal = ref(props.modelValue ?? props.tabs[0]?.id ?? '');
watch(
  () => props.modelValue,
  (value) => {
    if (value) internal.value = value;
  },
);

const activeId = computed(() => props.modelValue ?? internal.value);

function select(id: string): void {
  const tab = props.tabs.find((t) => t.id === id);
  if (!tab || tab.disabled) return;
  internal.value = id;
  emit('update:modelValue', id);
}

function onKeydown(event: KeyboardEvent): void {
  const enabled = props.tabs.filter((t) => !t.disabled);
  if (enabled.length === 0) return;
  const current = enabled.findIndex((t) => t.id === activeId.value);
  let nextIndex: number | null = null;

  if (event.key === 'ArrowRight') nextIndex = (current + 1) % enabled.length;
  else if (event.key === 'ArrowLeft') nextIndex = (current - 1 + enabled.length) % enabled.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = enabled.length - 1;

  if (nextIndex === null) return;
  event.preventDefault();
  const next = enabled[nextIndex];
  if (next) {
    select(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }
}
</script>

<template>
  <div>
    <div
      role="tablist"
      :aria-label="ariaLabel"
      class="flex gap-1 overflow-x-auto border-b border-slate-200"
      @keydown="onKeydown"
    >
      <button
        v-for="tab in tabs"
        :id="`tab-${tab.id}`"
        :key="tab.id"
        role="tab"
        type="button"
        :aria-selected="tab.id === activeId"
        :aria-controls="`panel-${tab.id}`"
        :tabindex="tab.id === activeId ? 0 : -1"
        :disabled="tab.disabled"
        class="shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium
          disabled:cursor-not-allowed disabled:text-slate-400"
        :class="
          tab.id === activeId
            ? 'border-brand-700 text-brand-800'
            : 'border-transparent text-slate-600 hover:text-slate-900'
        "
        @click="select(tab.id)"
      >
        {{ tab.label }}
        <span
          v-if="tab.badge !== undefined"
          class="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
        >
          {{ tab.badge }}
        </span>
      </button>
    </div>

    <div
      v-for="tab in tabs"
      v-show="tab.id === activeId"
      :id="`panel-${tab.id}`"
      :key="`panel-${tab.id}`"
      role="tabpanel"
      :aria-labelledby="`tab-${tab.id}`"
      tabindex="0"
      class="pt-4"
    >
      <slot :name="tab.id" :tab="tab">
        <slot name="panel" :tab="tab" />
      </slot>
    </div>
  </div>
</template>
