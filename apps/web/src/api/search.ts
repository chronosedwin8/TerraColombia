import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { SearchResult } from './types';

/**
 * Buscador universal: dirección, NPN de 30 o 20 dígitos, municipio, topónimo o `lat,lng`.
 * El backend decide el tipo; el cliente no intenta adivinarlo salvo para dar pistas visuales.
 */
export function search(
  q: string,
  options: { limit?: number; muniCode?: string; signal?: AbortSignal } = {},
): Promise<Envelope<SearchResult[]>> {
  return request<SearchResult[]>('/search', {
    query: { q, limit: options.limit ?? 10, muni: options.muniCode },
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
