import type { Envelope, SuitabilityRequest } from '@terracolombia/shared';
import { request } from './client';
import type { SuitabilityResponse } from './types';

/**
 * Aptitud de terreno (M5). La respuesta siempre trae el desglose por factor.
 *
 * Verificado: NO es el `SuitabilityResult` de `@terracolombia/shared`. La API devuelve
 * `use`/`useLabel` (no `targetUse`/`targetUseLabel`) y añade `target`, `areaKm2`,
 * `verdictHelp`, `rawInputs` y `legalNotes`.
 */
export function evaluateSuitability(
  body: SuitabilityRequest,
  signal?: AbortSignal,
): Promise<Envelope<SuitabilityResponse>> {
  return request<SuitabilityResponse>('/suitability', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
