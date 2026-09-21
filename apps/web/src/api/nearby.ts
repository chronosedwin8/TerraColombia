import type { Envelope, NearbyLayer } from '@terracolombia/shared';
import { request } from './client';
import type { NearbyResponse } from './types';

/**
 * Equipamientos y contexto alrededor de un punto. Usado por el mapa al hacer clic.
 *
 * Verificado: devuelve `{ point, radiusM, total, byLayer, items, availableLayers, emptyReason }`.
 * El centro se llama `point` (no `center`) y cada elemento trae `distance_m` en snake_case
 * más `lng`/`lat` sueltos (no un `centroid`).
 */
export function getNearby(params: {
  lat: number;
  lng: number;
  radiusM: number;
  layers: NearbyLayer[];
  limitPerLayer?: number;
  signal?: AbortSignal;
}): Promise<Envelope<NearbyResponse>> {
  return request<NearbyResponse>('/nearby', {
    query: {
      lat: params.lat,
      lng: params.lng,
      radius: params.radiusM,
      layers: params.layers,
      limitPerLayer: params.limitPerLayer,
    },
    ...(params.signal ? { signal: params.signal } : {}),
  });
}
