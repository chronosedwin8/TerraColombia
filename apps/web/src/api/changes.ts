import type { ChangeCompare, Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AvailableCutsResponse, ChangeCompareResult, JobHandle } from './types';

/**
 * Cambio territorial (M8): compara dos cortes de la base catastral.
 *
 * Verificado: devuelve `{ fromCutDate, toCutDate, areaKm2, summary[], changes[], truncated }`.
 * `summary` es un arreglo de filas por tipo de cambio (no un `counts` indexado) y no hay
 * FeatureCollections `before`/`after` para pintar el antes/después.
 */
export function compareChanges(
  body: ChangeCompare,
  signal?: AbortSignal,
): Promise<Envelope<ChangeCompareResult | JobHandle>> {
  return request<ChangeCompareResult | JobHandle>('/changes/compare', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}

/** Cortes publicados y qué pares se pueden comparar. Alimenta los dos selectores. */
export function getAvailableCuts(): Promise<Envelope<AvailableCutsResponse>> {
  return request<AvailableCutsResponse>('/changes/available-cuts');
}
