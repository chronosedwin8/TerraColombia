import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { LayersResponse } from './types';

/**
 * Catálogo de capas servido por el API: leyenda, zooms, plan mínimo y glosario asociado.
 * `src/map/layers.ts` trae una definición declarativa local como respaldo mientras
 * el catálogo remoto no responda, y se fusiona con esta cuando llega.
 *
 * Verificado: la respuesta es `{ layers: [...] }`, no un arreglo.
 */
export function getLayers(): Promise<Envelope<LayersResponse>> {
  return request<LayersResponse>('/layers');
}
