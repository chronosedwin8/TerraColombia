import type { ChangeCompare, Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { ChangeCompareResult, JobHandle } from './types';

/** Cambio territorial (M8): compara dos cortes de la base catastral. */
export function compareChanges(
  body: ChangeCompare,
  signal?: AbortSignal,
): Promise<Envelope<ChangeCompareResult | JobHandle>> {
  return request<ChangeCompareResult | JobHandle>('/changes/compare', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
