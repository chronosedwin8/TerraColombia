/**
 * Seguimiento de una operación asíncrona (análisis grandes e informes).
 *
 * Estrategia: sondeo a `GET /jobs/:id`. El flujo de eventos (`/jobs/:id/stream`) NO se usa
 * desde el navegador: `EventSource` no puede enviar cabeceras y la API autentica con
 * `Authorization: Bearer`, así que la conexión respondía 401 SIN EXCEPCIÓN y dejaba un error
 * rojo en la consola en cada trabajo. El sondeo ya hacía todo el trabajo; el stream solo
 * aportaba ruido. Queda la ruta en la API para clientes que sí pueden poner cabeceras (y para
 * el día que la sesión viaje en cookie), y `subscribeToJob` sigue en `client.ts` para
 * entonces.
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

/** Cada cuánto se pregunta por el trabajo. Es el único canal, así que no conviene alargarlo. */
const POLL_INTERVAL_MS = 2500;

export function useJob<T>(): UseJobReturn<T> {
  const jobId = ref<string | null>(null);
  const status = ref<JobStatus | null>(null);
  const progress = ref<number | null>(null);
  const progressMessage = ref<string | null>(null);
  const result = shallowRef<T | null>(null);
  const error = shallowRef<AppError | null>(null);
  const isActive = ref(false);

  let poll: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
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

    poll = setInterval(() => {
      void pollOnce(id);
    }, POLL_INTERVAL_MS);
    void pollOnce(id);
  };

  onScopeDispose(stop);

  return { jobId, status, progress, progressMessage, result, error, isActive, track, stop };
}
