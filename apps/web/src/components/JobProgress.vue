<script setup lang="ts">
/**
 * Progreso de una operación en cola (análisis grandes, informes).
 *
 * Muestra la etapa en español que reporta el worker, no un porcentaje pelado: «Calculando
 * población» le dice algo al usuario, «47 %» no.
 */
import { MESSAGES } from '@terracolombia/shared';
import type { JobStatus } from '@/api/types';
import BaseButton from '@/components/ui/BaseButton.vue';

withDefaults(
  defineProps<{
    status: JobStatus | null;
    progress: number | null;
    stage: string | null;
    errorMessage?: string | null;
    cancellable?: boolean;
  }>(),
  { errorMessage: null, cancellable: true },
);

defineEmits<{ (e: 'cancel'): void }>();

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'En cola',
  running: 'Procesando',
  completed: 'Listo',
  failed: 'Falló',
  cancelled: 'Cancelado',
};
</script>

<template>
  <div
    v-if="status && status !== 'completed'"
    class="rounded-md border border-slate-200 bg-surface-muted p-3"
    role="status"
    :aria-busy="status === 'queued' || status === 'running'"
    data-testid="job-progress"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium text-slate-800">
        {{ STATUS_LABELS[status] }}
        <span v-if="stage" class="font-normal text-slate-600">· {{ stage }}</span>
      </p>
      <BaseButton
        v-if="cancellable && (status === 'queued' || status === 'running')"
        variant="ghost"
        size="sm"
        @click="$emit('cancel')"
      >
        Cancelar
      </BaseButton>
    </div>

    <div
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

    <p v-else class="mt-2 text-xs text-slate-500">
      Puedes seguir navegando: te avisamos cuando termine.
    </p>
  </div>
</template>
