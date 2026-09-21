import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AdminMetrics, CoverageRow, EtlRun, Page } from './types';

export function listEtlRuns(): Promise<Envelope<Page<EtlRun>>> {
  return request<Page<EtlRun>>('/admin/etl/runs', { noCache: true });
}

export function triggerEtl(datasetId: string): Promise<Envelope<{ jobId: string }>> {
  return request<{ jobId: string }>('/admin/etl/run', { method: 'POST', body: { datasetId } });
}

export function listCoverage(cursor?: string): Promise<Envelope<Page<CoverageRow>>> {
  return request<Page<CoverageRow>>('/admin/coverage', { query: { cursor } });
}

export function getAdminMetrics(): Promise<Envelope<AdminMetrics>> {
  return request<AdminMetrics>('/admin/metrics', { noCache: true });
}
