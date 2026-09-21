<script setup lang="ts">
/**
 * Avisos efímeros. Se anuncian en una región `aria-live` para que los lean los lectores
 * de pantalla; los errores usan `assertive` porque interrumpen una acción del usuario.
 */
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();

const TONES = {
  info: 'border-slate-300 bg-white text-slate-800',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-rose-300 bg-rose-50 text-rose-900',
} as const;
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-4 left-1/2 z-toast flex w-[min(92vw,26rem)]
      -translate-x-1/2 flex-col gap-2"
    aria-live="polite"
    aria-atomic="false"
  >
    <div
      v-for="toast in ui.toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-2 text-sm shadow-panel"
      :class="TONES[toast.kind]"
      :role="toast.kind === 'error' ? 'alert' : 'status'"
    >
      <p class="flex-1">{{ toast.message }}</p>
      <button
        type="button"
        class="shrink-0 text-xs underline"
        aria-label="Cerrar aviso"
        @click="ui.dismiss(toast.id)"
      >
        Cerrar
      </button>
    </div>
  </div>
</template>
