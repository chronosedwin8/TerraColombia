import type { Envelope, ParcelContext, ParcelQuery } from '@terracolombia/shared';
import { request } from './client';
import type { Page, ParcelDetail, ParcelHistoryEntry, ParcelQueryRow } from './types';

export function getParcel(npn: string, cutDate?: string): Promise<Envelope<ParcelDetail>> {
  return request<ParcelDetail>(`/parcels/${encodeURIComponent(npn)}`, {
    query: { cutDate },
  });
}

export function getParcelContext(
  npn: string,
  radiusM = 1000,
): Promise<Envelope<ParcelContext>> {
  return request<ParcelContext>(`/parcels/${encodeURIComponent(npn)}/context`, {
    query: { radius: radiusM },
  });
}

export function getParcelHistory(npn: string): Promise<Envelope<ParcelHistoryEntry[]>> {
  return request<ParcelHistoryEntry[]>(`/parcels/${encodeURIComponent(npn)}/history`);
}

/**
 * Buscador avanzado. El cuerpo es exactamente el DSL de `ParcelQuerySchema`:
 * la vista lo construye con el constructor visual y lo valida con Zod antes de enviarlo.
 */
export function queryParcels(
  query: ParcelQuery,
  signal?: AbortSignal,
): Promise<Envelope<Page<ParcelQueryRow>>> {
  return request<Page<ParcelQueryRow>>('/parcels/query', {
    method: 'POST',
    body: query,
    ...(signal ? { signal } : {}),
  });
}
