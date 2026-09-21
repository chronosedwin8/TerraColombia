/**
 * Seguimiento de una operación asíncrona (§9: análisis grandes e informes).
 *
 * Estrategia: SSE por `GET /jobs/:id/stream` como canal principal y un sondeo de respaldo
 * a `GET /jobs/:id` cada 4 s, porque un proxy intermedio puede cortar el stream sin avisar.
 */
import { onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { AppError, MESSAGES } from '@terracolombia/shared';
import { subscribeToJob } from '@/api/client';
import { getJob } from '@/api/jobs';
import type { JobStatus } from '@/api/types';

export interface UseJobReturn<T> {
  jobId: Ref<string | null>;
  status: Ref<JobStatus | null>;
  progress: Ref<number | null>;
  stage: Ref<string | null>;
  result: ShallowRef<T | null>;
  error: ShallowRef<AppError | null>;
  isActive: Ref<boolean>;
  /** Empieza a seguir un trabajo. Cancela el seguimiento anterior si había uno. */
  track: (jobId: string) => void;
  stop: () => void;
}

const POLL_INTERVAL_MS = 4000;

export function useJob<T>(): UseJobReturn<T> {
  const jobId = ref<string | null>(null);
  const status = ref<JobStatus | null>(null);
  const progress = ref<number | null>(null);
  const stage = ref<string | null>(null);
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
      stage.value = data.stage;
      if (data.status === 'completed') {
        result.value = data.result;
        finish('completed');
      } else if (data.status === 'failed') {
        error.value = new AppError('INTERNAL', data.error?.message ?? MESSAGES.common.error);
        finish('failed');
      } else if (data.status === 'cancelled') {
        finish('cancelled');
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
    stage.value = null;
    result.value = null;
    error.value = null;
    isActive.value = true;

    unsubscribe = subscribeToJob(id, {
      onProgress: (payload) => {
        status.value = 'running';
        progress.value = payload.progress;
        stage.value = payload.stage;
      },
      onDone: (payload) => {
        result.value = payload as T;
        progress.value = 100;
        finish('completed');
      },
      onError: (err) => {
        // El stream falló: el sondeo decide si el trabajo realmente falló.
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

  return { jobId, status, progress, stage, result, error, isActive, track, stop };
}
