import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { ResolvePointResponse, SearchResponse } from './types';

/**
 * Buscador universal: dirección, NPN de 30 o 20 dígitos, municipio, topónimo o `lat,lng`.
 * El backend decide el tipo; el cliente no intenta adivinarlo salvo para dar pistas visuales.
 *
 * Verificado: devuelve `{ query, results, emptyReason }`, NO un arreglo de resultados.
 * Cuando `results` viene vacío, `emptyReason` explica en español qué se intentó: la UI
 * debe mostrarlo en lugar de una lista muda (regla 6, cobertura honesta).
 */
export function search(
  q: string,
  options: { limit?: number; muniCode?: string; signal?: AbortSignal } = {},
): Promise<Envelope<SearchResponse>> {
  return request<SearchResponse>('/search', {
    query: { q, limit: options.limit ?? 10, muni: options.muniCode },
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Qué hay exactamente en un punto del mapa. Lo usa el clic sobre el mapa.
 *
 * OJO: la ruta es `/resolve`, no `/search/resolve` — el plugin de búsqueda se registra
 * sin prefijo, así que este endpoint cuelga de la raíz. Verificado: `/search/resolve` da 404.
 */
export function resolvePoint(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<Envelope<ResolvePointResponse>> {
  return request<ResolvePointResponse>('/resolve', {
    query: { lat, lng },
    ...(signal ? { signal } : {}),
  });
}
