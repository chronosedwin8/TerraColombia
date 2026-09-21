<script setup lang="ts">
/**
 * Diálogo modal sobre `<dialog>` nativo: trae foco atrapado, cierre con Escape y
 * fondo inerte sin código propio. Se cierra también al hacer clic fuera del panel.
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{ open: boolean; title: string; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
);

const emit = defineEmits<{ (e: 'close'): void }>();

const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    const element = dialog.value;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    if (!isOpen && element.open) element.close();
  },
);

function onCancel(event: Event): void {
  event.preventDefault();
  emit('close');
}

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close');
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close();
});

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' } as const;
</script>

<template>
  <dialog
    ref="dialog"
    class="w-[92vw] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50"
    :class="SIZES[size]"
    :aria-label="title"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <button
        type="button"
        class="rounded p-1 text-slate-500 hover:bg-slate-100"
        aria-label="Cerrar"
        @click="emit('close')"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="m5.3 5.3 9.4 9.4m0-9.4-9.4 9.4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>

    <div class="max-h-[70vh] overflow-y-auto px-4 py-4">
      <slot />
    </div>

    <div v-if="$slots.footer" class="border-t border-slate-200 bg-surface-muted px-4 py-3">
      <slot name="footer" />
    </div>
  </dialog>
</template>
