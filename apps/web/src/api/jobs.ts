import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { Job, JobHandle, SyncOrJob } from './types';

export function getJob<T>(jobId: string): Promise<Envelope<Job<T>>> {
  return request<Job<T>>(`/jobs/${encodeURIComponent(jobId)}`, { noCache: true });
}

export function cancelJob(jobId: string): Promise<Envelope<undefined>> {
  return request<undefined>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

/**
 * Distingue una respuesta inmediata de un `{ jobId, status }`.
 * El contrato de §9 dice que las operaciones grandes devuelven el trabajo en cola,
 * y esa decisión la toma el backend según el área y el plan: el cliente debe aceptar ambas.
 */
export function asSyncOrJob<T>(data: T | JobHandle): SyncOrJob<T> {
  if (isJobHandle(data)) return { kind: 'job', job: data };
  return { kind: 'result', result: data };
}

export function isJobHandle(value: unknown): value is JobHandle {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { jobId?: unknown }).jobId === 'string' &&
    typeof (value as { status?: unknown }).status === 'string'
  );
}
