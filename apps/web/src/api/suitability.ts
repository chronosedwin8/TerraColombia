import type { Envelope, SuitabilityRequest, SuitabilityResult } from '@terracolombia/shared';
import { request } from './client';

/** Aptitud de terreno (M5). La respuesta siempre trae el desglose por factor. */
export function evaluateSuitability(
  body: SuitabilityRequest,
  signal?: AbortSignal,
): Promise<Envelope<SuitabilityResult>> {
  return request<SuitabilityResult>('/suitability', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
