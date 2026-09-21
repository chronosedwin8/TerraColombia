import type { AreaAnalyze, Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AreaAnalysisResult, AreaCompareResponse, JobHandle } from './types';

/**
 * Análisis de zona.
 *
 * Verificado: el resultado son bloques con nombre propio (`parcels`, `population`,
 * `facilities`, `soils`, `hazards`, `relief`…), NO un arreglo `sections`. Cada bloque
 * puede ser `null` y `missingSections` dice cuáles faltaron (regla 6).
 *
 * Si el área supera `AREA_ANALYSIS_SYNC_LIMIT_KM2` el backend responde 202 con
 * `{ jobId, status, areaKm2, message, creditsCharged }` y el resultado se sigue por SSE.
 */
export function analyzeArea(
  body: AreaAnalyze,
  signal?: AbortSignal,
): Promise<Envelope<AreaAnalysisResult | JobHandle>> {
  return request<AreaAnalysisResult | JobHandle>('/areas/analyze', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}

/** Comparar entre 2 y 4 zonas lado a lado. Cada comparación es un análisis con `name`. */
export function compareAreas(
  body: { areas: Array<{ name?: string; scope: AreaAnalyze['scope'] }> },
  signal?: AbortSignal,
): Promise<Envelope<AreaCompareResponse>> {
  return request<AreaCompareResponse>('/areas/compare', {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
