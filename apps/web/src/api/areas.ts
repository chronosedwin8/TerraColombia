import type { AreaAnalyze, Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AreaAnalysisResult, JobHandle } from './types';

/**
 * Análisis de zona. Si el área supera `AREA_ANALYSIS_SYNC_LIMIT_KM2` el backend
 * responde `{ jobId, status }` y el resultado se sigue por SSE.
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
