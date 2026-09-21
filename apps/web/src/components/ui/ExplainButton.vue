<script setup lang="ts">
/**
 * "Explícame esto" (M11). Pide al asistente que explique un dato **ya calculado**.
 *
 * Garantías del producto que este componente hace visibles:
 *  - se le envía el dato que hay en pantalla, no una pregunta abierta;
 *  - la respuesta llega con el descargo de `MESSAGES.ai.disclaimer`;
 *  - lo que la herramienta no encontró se lista como "no disponible", sin estimaciones.
 */
import { computed, ref } from 'vue';
import { AppError, MESSAGES } from '@terracolombia/shared';
import { explainAi } from '@/api/ai';
import type { AiExplainResponse } from '@/api/types';
import BaseButton from './BaseButton.vue';
import LoadingSkeleton from './LoadingSkeleton.vue';

const props = defineProps<{
  /** Qué se explica: "avaluo_catastral", "factor:pendiente", "indicador:pob_edad_escolar"… */
  subject: string;
  /**
   * Datos en pantalla que el asistente debe usar como única base. El campo de la API se
   * llama `context`, no `payload`: enviarlo con el nombre viejo hacía que el asistente
   * explicara el concepto en abstracto, sin la cifra que el usuario tenía delante.
   */
  payload: Record<string, unknown>;
  size?: 'sm' | 'md';
}>();

const open = ref(false);
const isLoading = ref(false);
const answer = ref<AiExplainResponse | null>(null);
const error = ref<AppError | null>(null);

/** La evidencia llega como mapa; se aplana para listarla sin inventar etiquetas. */
const evidenceRows = computed(() =>
  Object.entries(answer.value?.evidence ?? {}).map(([key, value]) => ({
    key,
    value: value === null || value === undefined ? MESSAGES.common.notAvailable : String(value),
  })),
);

const MODE_NOTE: Record<AiExplainResponse['mode'], string> = {
  llm: '',
  template: 'Respuesta generada con una plantilla fija, sin modelo de lenguaje.',
  glossary: 'Definición tomada del glosario del producto.',
  unavailable: 'Este despliegue no tiene asistente con IA configurado.',
};

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (!open.value || answer.value || isLoading.value) return;

  isLoading.value = true;
  error.value = null;
  try {
    const response = await explainAi({ subject: props.subject, context: props.payload });
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
        <p class="whitespace-pre-line leading-relaxed text-slate-800">{{ answer.explanation }}</p>

        <!--
          `/ai/explain` devuelve la evidencia en `evidence`, un mapa suelto: no existen
          `usedData` ni `missing`, que es lo que esta ficha leía y por eso salía vacía.
        -->
        <div v-if="evidenceRows.length > 0" class="mt-2">
          <p class="tc-label">Datos usados</p>
          <ul class="mt-1 space-y-0.5 text-xs text-slate-700">
            <li v-for="row in evidenceRows" :key="row.key">
              {{ row.key }}: <strong>{{ row.value }}</strong>
            </li>
          </ul>
        </div>

        <!-- Sin modelo configurado la respuesta es plantillada; decirlo es la regla 6. -->
        <p v-if="answer.mode !== 'llm'" class="mt-2 text-xs text-slate-500">
          {{ MODE_NOTE[answer.mode] }}
        </p>

        <p class="mt-2 border-t border-brand-200 pt-2 text-xs text-slate-600">
          {{ answer.disclaimer || MESSAGES.ai.disclaimer }}
        </p>
      </template>
    </div>
  </div>
</template>
