<script setup lang="ts">
/**
 * Envoltorio de campo: etiqueta asociada, texto de ayuda y mensaje de error enlazados
 * por `aria-describedby`. El control va en el slot y recibe el `id` por scope.
 */
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{ label: string; hint?: string; error?: string; required?: boolean }>(),
  { hint: undefined, error: undefined, required: false },
);

const uid = useId();
const controlId = computed(() => `field-${uid}`);
const hintId = computed(() => `field-hint-${uid}`);
const errorId = computed(() => `field-error-${uid}`);
const describedBy = computed(() => {
  const ids = [props.hint ? hintId.value : null, props.error ? errorId.value : null].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="space-y-1">
    <label :for="controlId" class="block text-sm font-medium text-slate-800">
      {{ label }}
      <span v-if="required" class="text-rose-700" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">(obligatorio)</span>
    </label>

    <slot
      :id="controlId"
      :described-by="describedBy"
      :invalid="Boolean(error)"
    />

    <p v-if="hint" :id="hintId" class="text-xs text-slate-500">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="text-xs font-medium text-rose-700" role="alert">
      {{ error }}
    </p>
  </div>
</template>
