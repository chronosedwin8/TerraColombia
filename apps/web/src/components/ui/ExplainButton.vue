<script setup lang="ts">
/**
 * "Explícame esto" (M11). Pide al asistente que explique un dato **ya calculado**.
 *
 * Garantías del producto que este componente hace visibles:
 *  - se le envía el dato que hay en pantalla, no una pregunta abierta;
 *  - la respuesta llega con el descargo de `MESSAGES.ai.disclaimer`;
 *  - lo que la herramienta no encontró se lista como "no disponible", sin estimaciones.
 */
import { ref } from 'vue';
import { AppError, MESSAGES } from '@terracolombia/shared';
import { explainAi } from '@/api/ai';
import type { AiAnswer } from '@/api/types';
import BaseButton from './BaseButton.vue';
import LoadingSkeleton from './LoadingSkeleton.vue';

const props = defineProps<{
  /** Qué se explica: "avaluo_catastral", "factor:pendiente", "indicador:pob_edad_escolar"… */
  subject: string;
  /** Datos en pantalla que el asistente debe usar como única base. */
  payload: Record<string, unknown>;
  size?: 'sm' | 'md';
}>();

const open = ref(false);
const isLoading = ref(false);
const answer = ref<AiAnswer | null>(null);
const error = ref<AppError | null>(null);

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (!open.value || answer.value || isLoading.value) return;

  isLoading.value = true;
  error.value = null;
  try {
    const response = await explainAi({ subject: props.subject, payload: props.payload });
    answer.value = response.data;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <BaseButton
      variant="ghost"
      :size="size ?? 'sm'"
      :aria-label="`${MESSAGES.common.explain}: ${subject}`"
      @click="toggle"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          d="M10 2a6 6 0 0 0-3.6 10.8c.4.3.6.8.6 1.3v.4h6v-.4c0-.5.2-1 .6-1.3A6 6 0 0 0 10 2ZM7.5 16.5h5v.8a1.2 1.2 0 0 1-1.2 1.2H8.7a1.2 1.2 0 0 1-1.2-1.2v-.8Z"
        />
      </svg>
      {{ MESSAGES.common.explain }}
    </BaseButton>

    <div
      v-if="open"
      class="mt-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm"
      role="region"
      :aria-label="`Explicación de ${subject}`"
    >
      <LoadingSkeleton v-if="isLoading" :lines="3" />

      <p v-else-if="error" class="text-rose-800">{{ error.message }}</p>

      <template v-else-if="answer">
        <p class="whitespace-pre-line leading-relaxed text-slate-800">{{ answer.answer }}</p>

        <div v-if="answer.usedData.length > 0" class="mt-2">
          <p class="tc-label">Datos usados</p>
          <ul class="mt-1 space-y-0.5 text-xs text-slate-700">
            <li v-for="row in answer.usedData" :key="row.key">
              {{ row.label }}:
              <strong>{{ row.value ?? MESSAGES.common.notAvailable }}</strong>
              <span v-if="row.unit"> {{ row.unit }}</span>
            </li>
          </ul>
        </div>

        <div v-if="answer.missing.length > 0" class="mt-2">
          <p class="tc-label">No disponible</p>
          <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
            <li v-for="item in answer.missing" :key="item">{{ item }}</li>
          </ul>
        </div>

        <p class="mt-2 border-t border-brand-200 pt-2 text-xs text-slate-600">
          {{ answer.disclaimer || MESSAGES.ai.disclaimer }}
        </p>
      </template>
    </div>
  </div>
</template>
