import type { Envelope, LocationIntel } from '@terracolombia/shared';
import { request } from './client';
import type { JobHandle, LocationIntelResult, LocationIntelTemplate } from './types';

export function getIntelTemplates(): Promise<Envelope<LocationIntelTemplate[]>> {
  return request<LocationIntelTemplate[]>('/location-intel/templates');
}

/**
 * Localización de negocio (M6). Recalcular con pesos distintos es una petición nueva:
 * TanStack Query la cachea por `[templateId, scope, weights, resolution]`.
 */
export function runLocationIntel(
  body: LocationIntel,
  signal?: AbortSignal,
): Promise<Envelope<LocationIntelResult | JobHandle>> {
  return request<LocationIntelResult | JobHandle>('/location-intel', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
