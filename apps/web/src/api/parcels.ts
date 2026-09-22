import type { Envelope, ParcelQuery } from '@terracolombia/shared';
import { request } from './client';
import type {
  ParcelContextResponse,
  ParcelDetail,
  ParcelHistoryResponse,
  ParcelQueryResponse,
} from './types';

/**
 * Ficha del predio. Verificado: la respuesta es un objeto PLANO
 * (`npn`, `municipality`, `areaGeomM2`, `buildings`, `rawAttributes`, `availableCutDates`…),
 * no `{ summary, attrs, cutDates }`.
 */
export function getParcel(npn: string, cutDate?: string): Promise<Envelope<ParcelDetail>> {
  return request<ParcelDetail>(`/parcels/${encodeURIComponent(npn)}`, {
    // Sin `geometry=true` el API omite el polígono y la ficha nunca podía centrar el mapa
    // en el predio: se quedaba en la vista de todo el país. Detectado con el recorrido
    // automatizado de la interfaz sobre un predio real.
    query: { cutDate, geometry: true },
  });
}

/**
 * Contexto alrededor del predio.
 *
 * OJO: las distancias y los solapes vienen en snake_case (`distance_m`, `overlap_pct`)
 * y se dejan tal cual (ver la nota de decisión en `types.ts`). No es el `ParcelContext`
 * de `@terracolombia/shared`, que usa camelCase y describe menos bloques.
 */
export function getParcelContext(
  npn: string,
  radiusM = 1000,
): Promise<Envelope<ParcelContextResponse>> {
  return request<ParcelContextResponse>(`/parcels/${encodeURIComponent(npn)}/context`, {
    query: { radius: radiusM },
  });
}

/**
 * Línea de tiempo del predio. Verificado: devuelve `{ npn, cuts, changes, emptyReason }`,
 * no un arreglo de entradas. `cuts` va en snake_case (`cut_date`, `area_geom_m2`…).
 */
export function getParcelHistory(npn: string): Promise<Envelope<ParcelHistoryResponse>> {
  return request<ParcelHistoryResponse>(`/parcels/${encodeURIComponent(npn)}/history`);
}

/**
 * Buscador avanzado. El cuerpo es exactamente el DSL de `ParcelQuerySchema`:
 * la vista lo construye con el constructor visual y lo valida con Zod antes de enviarlo.
 * `scope` es obligatorio (department o municipality): la API rechaza barridos nacionales.
 *
 * Verificado: la respuesta es `{ rows, nextCursor, limitApplied, cadastralValueWarning }`,
 * no un `Page<T>`. No hay total de coincidencias.
 */
export function queryParcels(
  query: ParcelQuery,
  signal?: AbortSignal,
): Promise<Envelope<ParcelQueryResponse>> {
  return request<ParcelQueryResponse>('/parcels/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}
