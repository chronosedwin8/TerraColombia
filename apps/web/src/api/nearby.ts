import type { Envelope } from '@terracolombia/shared';
import type { NearbyLayer } from '@terracolombia/shared';
import { request } from './client';
import type { NearbyResponse } from './types';

/** Equipamientos y contexto alrededor de un punto. Usado por el mapa al hacer clic. */
export function getNearby(params: {
  lat: number;
  lng: number;
  radiusM: number;
  layers: NearbyLayer[];
  signal?: AbortSignal;
}): Promise<Envelope<NearbyResponse>> {
  return request<NearbyResponse>('/nearby', {
    query: {
      lat: params.lat,
      lng: params.lng,
      radius: params.radiusM,
      layers: params.layers,
    },
    ...(params.signal ? { signal: params.signal } : {}),
  });
}
