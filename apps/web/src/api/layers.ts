import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { LayerCatalogEntry } from './types';

/**
 * Catálogo de capas servido por el API: leyenda, unidades, zooms y glosario asociado.
 * `src/map/layers.ts` trae una definición declarativa local como respaldo mientras
 * el catálogo remoto no responda, y se fusiona con esta cuando llega.
 */
export function getLayers(): Promise<Envelope<LayerCatalogEntry[]>> {
  return request<LayerCatalogEntry[]>('/layers');
}
