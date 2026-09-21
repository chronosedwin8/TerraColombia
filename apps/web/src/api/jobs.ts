import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { Job, JobCancelled, JobHandle, JobSummary, SyncOrJob } from './types';

/**
 * Estado y resultado de un trabajo.
 *
 * Verificado: el identificador es `id` (no `jobId`), la etapa es `progressMessage`
 * (no `stage`) y el fallo es `errorMessage` plano (no `error.message`).
 * `result` solo viaja cuando `status === 'done'`.
 */
export function getJob<T>(jobId: string): Promise<Envelope<Job<T>>> {
  return request<Job<T>>(`/jobs/${encodeURIComponent(jobId)}`, { noCache: true });
}

/** Mis trabajos en curso y recientes. Arreglo pelado. */
export function listJobs(options: { status?: Job['status']; limit?: number } = {}): Promise<
  Envelope<JobSummary[]>
> {
  return request<JobSummary[]>('/jobs', {
    noCache: true,
    query: { status: options.status, limit: options.limit },
  });
}

/**
 * Cancela un trabajo EN COLA. La API rechaza con VALIDATION si ya está corriendo.
 * Verificado: responde `{ ok: true, status: 'canceled' }`, no 204.
 */
export function cancelJob(jobId: string): Promise<Envelope<JobCancelled>> {
  return request<JobCancelled>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

/**
 * Distingue una respuesta inmediata de un `{ jobId, status }`.
 * Las operaciones grandes vuelven encoladas y esa decisión la toma el backend según el
 * área y el plan: el cliente debe aceptar ambas.
 */
export function asSyncOrJob<T>(data: T | JobHandle): SyncOrJob<T> {
  if (isJobHandle(data)) return { kind: 'job', job: data };
  return { kind: 'result', result: data };
}

/**
 * OJO con la asimetría del API: el 202 de `/areas/analyze` llama al identificador `jobId`,
 * pero `GET /jobs/:id` lo devuelve como `id`. Aquí solo se reconoce la forma del 202.
 */
export function isJobHandle(value: unknown): value is JobHandle {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { jobId?: unknown }).jobId === 'string' &&
    typeof (value as { status?: unknown }).status === 'string'
  );
}
