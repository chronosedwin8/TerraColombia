import type { Envelope } from '@terracolombia/shared';
import { request, requestBlob } from './client';
import type {
  CreateReportInput,
  ExportFormat,
  ReportCreated,
  ReportDetail,
  ReportSummary,
  ReportVerification,
} from './types';

/**
 * Encolar un informe.
 *
 * Verificado: el cuerpo exige `{ kind, subject }` y acepta `level` en
 * `'resumen' | 'completo' | 'tecnico'` (en español; los valores en inglés que usaba el
 * cliente anterior los rechazaba la API con VALIDATION).
 *
 * Responde 202 con `{ id, status, ... }`: el identificador es del INFORME, no de un
 * trabajo. Para seguir el progreso se sondea `GET /reports/:id`, cuyo `status` y
 * `progress` reflejan el trabajo subyacente.
 */
export function createReport(body: CreateReportInput): Promise<Envelope<ReportCreated>> {
  return request<ReportCreated>('/reports', { method: 'POST', body });
}

/** Verificado: arreglo pelado, NO `Page<T>`. */
export function listReports(options: { status?: string; kind?: string } = {}): Promise<
  Envelope<ReportSummary[]>
> {
  return request<ReportSummary[]>('/reports', {
    query: { status: options.status, kind: options.kind },
  });
}

/** Estado y contenido del informe, con sus secciones ya renderizadas. */
export function getReport(id: string): Promise<Envelope<ReportDetail>> {
  return request<ReportDetail>(`/reports/${encodeURIComponent(id)}`, { noCache: true });
}

/**
 * Descarga el informe en el formato pedido. El nombre viene en Content-Disposition.
 * Solo funciona con `status === 'done'` y con un formato presente en `artifacts`.
 */
export function downloadReport(
  id: string,
  format: ExportFormat = 'pdf',
): Promise<{ blob: Blob; filename: string }> {
  return requestBlob(`/reports/${encodeURIComponent(id)}/download`, { query: { format } });
}

/** Punto al que apunta el QR del PDF: confirma que el informe lo emitimos nosotros. */
export function verifyReport(token: string): Promise<Envelope<ReportVerification>> {
  return request<ReportVerification>(`/reports/verify/${encodeURIComponent(token)}`);
}
