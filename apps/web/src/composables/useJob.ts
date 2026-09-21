/**
 * Seguimiento de una operación asíncrona (análisis grandes e informes).
 *
 * Estrategia: SSE por `GET /jobs/:id/stream` como canal principal y un sondeo de respaldo
 * a `GET /jobs/:id` cada 4 s, porque un proxy intermedio puede cortar el stream sin avisar.
 *
 * VERIFICADO CONTRA LA API VIVA (`apps/api/src/routes/jobs.ts`). La versión anterior no
 * terminaba NUNCA un trabajo en la UI por tres motivos, todos corregidos aquí:
 *  1. Esperaba los estados `completed`/`cancelled`; la API usa `done`/`canceled`.
 *  2. Leía `data.stage` y `data.error.message`; los campos son `progressMessage` y
 *     `errorMessage` (plano).
 *  3. Guardaba el sobre entero del evento SSE `done` como si fuera el resultado; el
 *     resultado viene ANIDADO en `payload.result`.
 */
import { onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { AppError, MESSAGES, type JobStatus } from '@terracolombia/shared';
import { subscribeToJob } from '@/api/client';
import { getJob } from '@/api/jobs';

export interface UseJobReturn<T> {
  jobId: Ref<string | null>;
  status: Ref<JobStatus | null>;
  progress: Ref<number | null>;
  /** Etapa legible en español que reporta el worker (`progressMessage` en el API). */
  progressMessage: Ref<string | null>;
  result: ShallowRef<T | null>;
  error: ShallowRef<AppError | null>;
  isActive: Ref<boolean>;
  /** Empieza a seguir un trabajo. Cancela el seguimiento anterior si había uno. */
  track: (jobId: string) => void;
  stop: () => void;
}

const POLL_INTERVAL_MS = 4000;

/** Estados terminales del worker: en ellos se deja de sondear y de escuchar el stream. */
function isTerminal(status: JobStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'canceled';
}

export function useJob<T>(): UseJobReturn<T> {
  const jobId = ref<string | null>(null);
  const status = ref<JobStatus | null>(null);
  const progress = ref<number | null>(null);
  const progressMessage = ref<string | null>(null);
  const result = shallowRef<T | null>(null);
  const error = shallowRef<AppError | null>(null);
  const isActive = ref(false);

  let unsubscribe: (() => void) | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    if (poll) clearInterval(poll);
    poll = null;
    isActive.value = false;
  };

  const finish = (nextStatus: JobStatus): void => {
    status.value = nextStatus;
    stop();
  };

  const pollOnce = async (id: string): Promise<void> => {
    try {
      const { data } = await getJob<T>(id);
      status.value = data.status;
      progress.value = data.progress;
      progressMessage.value = data.progressMessage;

      if (data.status === 'done') {
        // `result` solo viaja cuando el trabajo terminó bien; si el worker no dejó
        // resultado se conserva el que ya hubiera llegado por SSE.
        if (data.result !== null) result.value = data.result;
        finish('done');
      } else if (data.status === 'failed') {
        error.value = new AppError('INTERNAL', data.errorMessage ?? MESSAGES.common.error);
        finish('failed');
      } else if (data.status === 'canceled') {
        finish('canceled');
      }
    } catch (e) {
      // Un fallo de sondeo no cancela el trabajo: solo se reporta si es del dominio.
      if (e instanceof AppError && e.code !== 'UPSTREAM_UNAVAILABLE') {
        error.value = e;
        finish('failed');
      }
    }
  };

  const track = (id: string): void => {
    stop();
    jobId.value = id;
    status.value = 'queued';
    progress.value = null;
    progressMessage.value = null;
    result.value = null;
    error.value = null;
    isActive.value = true;

    unsubscribe = subscribeToJob<T>(id, {
      onProgress: (payload) => {
        // El evento trae su propio estado: puede seguir en cola aunque ya emita progreso.
        status.value = payload.status;
        progress.value = payload.progress;
        progressMessage.value = payload.message;
      },
      onDone: (payload) => {
        // El resultado va ANIDADO: `payload` es el sobre `{id, status, result, errorMessage}`.
        result.value = payload.result;
        progress.value = 100;
        finish(isTerminal(payload.status) ? payload.status : 'done');
      },
      onFailed: (payload) => {
        error.value = new AppError('INTERNAL', payload.errorMessage ?? MESSAGES.common.error);
        finish(isTerminal(payload.status) ? payload.status : 'failed');
      },
      onError: (err) => {
        // El stream falló (red o trabajo inexistente): el sondeo decide si el trabajo
        // realmente falló. No se marca `failed` aquí para no mentir ante un corte de red.
        error.value = err;
        void pollOnce(id);
      },
    });

    poll = setInterval(() => {
      void pollOnce(id);
    }, POLL_INTERVAL_MS);
    void pollOnce(id);
  };

  onScopeDispose(stop);

  return { jobId, status, progress, progressMessage, result, error, isActive, track, stop };
}
