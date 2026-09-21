<script setup lang="ts">
/**
 * Progreso de una operación en cola (análisis grandes, informes).
 *
 * Muestra la etapa en español que reporta el worker, no un porcentaje pelado: «Calculando
 * población» le dice algo al usuario, «47 %» no.
 *
 * VERIFICADO: los estados del API son `queued | running | done | failed | canceled`
 * (`JOB_STATUSES` de shared). Antes este componente esperaba `completed`/`cancelled`,
 * que no existen: el mapa de etiquetas quedaba sin entrada para el estado real y el
 * panel nunca se ocultaba al terminar. La etapa llega en `progressMessage`, no en `stage`.
 */
import { MESSAGES, type JobStatus } from '@terracolombia/shared';
import BaseButton from '@/components/ui/BaseButton.vue';

withDefaults(
  defineProps<{
    status: JobStatus | null;
    progress: number | null;
    /** Etapa legible que reporta el worker (`progressMessage` del API). */
    progressMessage?: string | null;
    /** Texto del fallo (`errorMessage` del API). */
    errorMessage?: string | null;
    cancellable?: boolean;
  }>(),
  { progressMessage: null, errorMessage: null, cancellable: true },
);

defineEmits<{ (e: 'cancel'): void }>();

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'En cola',
  running: 'Procesando',
  done: 'Listo',
  failed: 'Falló',
  canceled: 'Cancelado',
};
</script>

<template>
  <!-- Al terminar bien el panel desaparece: el resultado ya se ve en la pantalla. -->
  <div
    v-if="status && status !== 'done'"
    class="rounded-md border border-slate-200 bg-surface-muted p-3"
    role="status"
    :aria-busy="status === 'queued' || status === 'running'"
    data-testid="job-progress"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium text-slate-800">
        {{ STATUS_LABELS[status] }}
        <span v-if="progressMessage" class="font-normal text-slate-600">
          · {{ progressMessage }}
        </span>
      </p>
      <!-- La API solo deja cancelar trabajos EN COLA: en `running` responde VALIDATION. -->
      <BaseButton
        v-if="cancellable && status === 'queued'"
        variant="ghost"
        size="sm"
        @click="$emit('cancel')"
      >
        Cancelar
      </BaseButton>
    </div>

    <div
      v-if="status === 'queued' || status === 'running'"
      class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      :aria-valuenow="progress ?? undefined"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="progress === null ? MESSAGES.common.loading : `${progress} por ciento`"
    >
      <div
        class="h-full rounded-full bg-brand-600 transition-[width] duration-300"
        :class="progress === null ? 'animate-pulse' : ''"
        :style="{ width: progress === null ? '35%' : `${progress}%` }"
      />
    </div>

    <p v-if="status === 'failed'" class="mt-2 text-sm text-rose-800">
      {{ errorMessage ?? MESSAGES.common.error }}
    </p>

    <p v-else-if="status === 'canceled'" class="mt-2 text-xs text-slate-500">
      Cancelaste esta operación. Puedes volver a lanzarla cuando quieras.
    </p>

    <p v-else class="mt-2 text-xs text-slate-500">
      Puedes seguir navegando: te avisamos cuando termine.
    </p>
  </div>
</template>
