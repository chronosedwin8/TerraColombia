<script setup lang="ts">
/**
 * Deslizador accesible con valor visible. Se usa para los pesos de las plantillas de
 * localización de negocio y para radios y opacidades. El `<input type="range">` nativo ya
 * responde a flechas, Inicio, Fin y RePág/AvPág: no se reimplementa.
 */
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    /** Texto del valor actual; por omisión, el número crudo. */
    displayValue?: string;
    unit?: string;
    disabled?: boolean;
    hint?: string;
  }>(),
  {
    min: 0,
    max: 1,
    step: 0.05,
    displayValue: undefined,
    unit: undefined,
    disabled: false,
    hint: undefined,
  },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

const uid = useId();
const inputId = computed(() => `range-${uid}`);
const hintId = computed(() => `range-hint-${uid}`);

const shownValue = computed(
  () => props.displayValue ?? `${props.modelValue}${props.unit ? ` ${props.unit}` : ''}`,
);

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', Number(target.value));
}
</script>

<template>
  <div class="py-1.5">
    <div class="flex items-baseline justify-between gap-3">
      <label :for="inputId" class="text-sm font-medium text-slate-800">{{ label }}</label>
      <output :for="inputId" class="text-sm font-semibold tabular-nums text-brand-800">
        {{ shownValue }}
      </output>
    </div>

    <input
      :id="inputId"
      type="range"
      class="mt-1 w-full accent-brand-600"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :aria-describedby="hint ? hintId : undefined"
      :aria-valuetext="shownValue"
      @input="onInput"
    />

    <p v-if="hint" :id="hintId" class="mt-0.5 text-xs text-slate-500">{{ hint }}</p>
  </div>
</template>
