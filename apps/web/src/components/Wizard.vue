<script setup lang="ts">
/**
 * Asistente paso a paso. PLAN.md §10.1 lo exige para M5 (aptitud), M6 (localización de
 * negocio) y M7 (informe): son flujos con decisiones encadenadas y una sola pantalla larga
 * abruma a quien no es técnico.
 *
 * El componente no sabe nada del dominio: recibe los pasos, decide qué se puede avanzar
 * (`canContinue`) y deja el contenido al slot con el id del paso.
 */
import { computed, ref, watch } from 'vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import type { WizardStep } from './types';

const props = withDefaults(
  defineProps<{
    steps: WizardStep[];
    /** Índice controlado desde fuera; si se omite, el asistente lo gestiona solo. */
    modelValue?: number;
    /** Etiqueta del botón del último paso. */
    finishLabel?: string;
    busy?: boolean;
  }>(),
  { modelValue: undefined, finishLabel: 'Ver resultado', busy: false },
);

const emit = defineEmits<{
  (e: 'update:modelValue', index: number): void;
  (e: 'finish'): void;
}>();

const internal = ref(props.modelValue ?? 0);
watch(
  () => props.modelValue,
  (value) => {
    if (typeof value === 'number') internal.value = value;
  },
);

const index = computed(() => props.modelValue ?? internal.value);
const current = computed(() => props.steps[index.value] ?? null);
const isFirst = computed(() => index.value === 0);
const isLast = computed(() => index.value === props.steps.length - 1);
const canContinue = computed(() => current.value?.canContinue !== false);

function goTo(next: number): void {
  const clamped = Math.min(props.steps.length - 1, Math.max(0, next));
  internal.value = clamped;
  emit('update:modelValue', clamped);
}

function onNext(): void {
  if (!canContinue.value) return;
  if (isLast.value) {
    emit('finish');
    return;
  }
  goTo(index.value + 1);
}
</script>

<template>
  <div class="tc-card overflow-hidden" data-testid="wizard">
    <!-- Barra de progreso: siempre se sabe cuántos pasos faltan. -->
    <ol
      class="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-200 bg-surface-muted px-4 py-3"
      :aria-label="`Paso ${index + 1} de ${steps.length}`"
    >
      <li
        v-for="(step, stepIndex) in steps"
        :key="step.id"
        class="flex items-center gap-1.5 text-xs"
        :aria-current="stepIndex === index ? 'step' : undefined"
      >
        <span
          class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          :class="
            stepIndex < index
              ? 'bg-brand-700 text-white'
              : stepIndex === index
                ? 'bg-brand-100 text-brand-900 ring-2 ring-brand-600'
                : 'bg-slate-200 text-slate-600'
          "
        >
          <template v-if="stepIndex < index">✓</template>
          <template v-else>{{ stepIndex + 1 }}</template>
        </span>
        <button
          type="button"
          class="text-left"
          :class="stepIndex === index ? 'font-semibold text-slate-900' : 'text-slate-600'"
          :disabled="stepIndex > index"
          @click="goTo(stepIndex)"
        >
          {{ step.title }}
        </button>
      </li>
    </ol>

    <div v-if="current" class="p-4">
      <h2 class="text-base font-semibold">{{ current.title }}</h2>
      <p v-if="current.description" class="mt-1 text-sm text-slate-600">
        {{ current.description }}
      </p>

      <div class="mt-4">
        <slot :name="current.id" :step="current" :index="index">
          <slot name="step" :step="current" :index="index" />
        </slot>
      </div>

      <p v-if="current.blockedReason && !canContinue" class="mt-3 text-sm text-amber-800">
        {{ current.blockedReason }}
      </p>
    </div>

    <footer class="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
      <BaseButton variant="ghost" size="sm" :disabled="isFirst" @click="goTo(index - 1)">
        Atrás
      </BaseButton>

      <p class="text-xs text-slate-500">Paso {{ index + 1 }} de {{ steps.length }}</p>

      <BaseButton :disabled="!canContinue" :loading="busy" @click="onNext">
        {{ isLast ? finishLabel : 'Continuar' }}
      </BaseButton>
    </footer>
  </div>
</template>
