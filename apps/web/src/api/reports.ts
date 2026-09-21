import type { Envelope } from '@terracolombia/shared';
import { request, requestBlob } from './client';
import type { CreateReportInput, ExportFormat, JobHandle, Page, ReportSummary } from './types';

/** Encolar un informe. Siempre devuelve un trabajo: la generación del PDF pasa por Playwright. */
export function createReport(body: CreateReportInput): Promise<Envelope<JobHandle>> {
  return request<JobHandle>('/reports', { method: 'POST', body });
}

export function listReports(cursor?: string): Promise<Envelope<Page<ReportSummary>>> {
  return request<Page<ReportSummary>>('/reports', { query: { cursor } });
}

export function getReport(id: string): Promise<Envelope<ReportSummary>> {
  return request<ReportSummary>(`/reports/${encodeURIComponent(id)}`, { noCache: true });
}

/** Descarga el informe en el formato pedido. El nombre viene en Content-Disposition. */
export function downloadReport(
  id: string,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(`/reports/${encodeURIComponent(id)}/download`, { query: { format } });
}
