import { getLogger } from '@terracolombia/shared';
import type { ReportFormat, ReportSpec } from '@terracolombia/reports';
import { renderExport, renderReport } from '@terracolombia/reports';

const log = getLogger({ mod: 'reports:render' });

export interface RenderedArtifact {
  format: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface RenderInput {
  spec: ReportSpec;
  formats: string[];
  geometry: unknown | null;
  onProgress: (percent: number, message: string) => Promise<void>;
}

const SPATIAL_FORMATS = new Set(['geojson', 'gpkg', 'shp', 'kml']);

/**
 * Renderiza cada formato pedido. Un formato que falle no tumba los demás: se registra y se
 * sigue, porque es mejor entregar el PDF sin el GeoPackage que no entregar nada.
 */
export async function renderReportArtifacts(input: RenderInput): Promise<RenderedArtifact[]> {
  const out: RenderedArtifact[] = [];
  const failures: string[] = [];
  const total = input.formats.length;

  for (const [i, format] of input.formats.entries()) {
    const pct = Math.round((i / Math.max(1, total)) * 100);
    await input.onProgress(pct, `Generando ${format.toUpperCase()}`);

    try {
      if (format === 'pdf') {
        const result = await renderReport(input.spec);
        out.push({ format, buffer: result.buffer, contentType: result.contentType, filename: result.filename });
        continue;
      }

      const features =
        SPATIAL_FORMATS.has(format) && input.geometry
          ? {
              type: 'FeatureCollection' as const,
              features: [
                {
                  type: 'Feature' as const,
                  geometry: input.geometry as never,
                  properties: { informe: input.spec.verification.reportId },
                },
              ],
            }
          : null;

      const result = await renderExport({
        spec: input.spec,
        format: format as Exclude<ReportFormat, 'pdf'>,
        features,
      });
      out.push({ format, buffer: result.buffer, contentType: result.contentType, filename: result.filename });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${format}: ${message}`);
      log.error({ format, err: message }, 'No se pudo generar un formato del informe');
    }
  }

  if (out.length === 0) {
    throw new Error(
      `No se pudo generar ningún formato del informe. Detalle: ${failures.join(' · ')}`,
    );
  }
  if (failures.length > 0) {
    log.warn({ failures }, 'El informe se generó con formatos faltantes');
  }

  await input.onProgress(100, 'Formatos generados');
  return out;
}
