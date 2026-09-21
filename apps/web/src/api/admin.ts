import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AdminCoverageResponse, AdminMetrics, EtlRun, Page } from './types';

export function listEtlRuns(options: { datasetId?: string; limit?: number } = {}): Promise<
  Envelope<Page<EtlRun>>
> {
  return request<Page<EtlRun>>('/admin/etl/runs', {
    noCache: true,
    query: { datasetId: options.datasetId, limit: options.limit },
  });
}

/** Encola el pipeline completo del dataset. El avance se sigue por `GET /jobs/:id`. */
export function triggerEtl(
  datasetId: string,
  options: { cutDate?: string; dryRun?: boolean } = {},
): Promise<Envelope<{ jobId: string }>> {
  return request<{ jobId: string }>('/admin/etl/run', {
    method: 'POST',
    body: { datasetId, cutDate: options.cutDate, dryRun: options.dryRun },
  });
}

/**
 * Estado de cobertura catastral.
 *
 * Verificado: devuelve `{ items, nextCursor, total, summary, byDepartment }` y los `items`
 * son filas de DEPARTAMENTO (`{ code, name, municipalities, igac, with_parcels }`), no de
 * municipio. `items` y `byDepartment` son el mismo arreglo.
 */
export function listCoverage(): Promise<Envelope<AdminCoverageResponse>> {
  return request<AdminCoverageResponse>('/admin/coverage');
}

export function getAdminMetrics(): Promise<Envelope<AdminMetrics>> {
  return request<AdminMetrics>('/admin/metrics', { noCache: true });
}
