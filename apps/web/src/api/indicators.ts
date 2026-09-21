import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { MunicipalIndicators } from './types';

/** Observatorio municipal (M9). */
export function getIndicators(muniCode: string): Promise<Envelope<MunicipalIndicators>> {
  return request<MunicipalIndicators>(`/indicators/${encodeURIComponent(muniCode)}`);
}
