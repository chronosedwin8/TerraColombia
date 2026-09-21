import {
  CONTENT_TYPES,
  REPORT_KIND_TITLE,
  resolveAssets,
  resolveBranding,
  type ReportAssets,
  type ReportOutput,
  type ReportSpec,
} from './types.js';
import { renderReportHtml } from './templates/index.js';
import { CONTENT_WIDTH_PX } from './templates/styles.js';
import { PARCEL_REPORT_ASSET_KEYS } from './templates/parcel-report.js';
import { renderPdf } from './pdf.js';
import { qrSvg } from './qr.js';
import { factorBarChart, toImageAsset } from './charts.js';
import { renderStaticMap, toMapAsset } from './static-map.js';
import { sanitizeFilename, toTabular } from './tabular.js';

export * from './types.js';
export * from './qr.js';
export * from './charts.js';
export * from './static-map.js';
export * from './pdf.js';
export * from './xlsx.js';
export * from './exporters.js';
export * from './tabular.js';
export * from './zip.js';
export {
  renderReportHtml,
  renderParcelReport,
  renderAreaReport,
  renderLocationReport,
  renderChangeReport,
  renderMunicipalityReport,
  PARCEL_REPORT_ASSET_KEYS,
  AREA_REPORT_ASSET_KEYS,
  LOCATION_REPORT_ASSET_KEYS,
  CHANGE_REPORT_ASSET_KEYS,
  MUNICIPALITY_REPORT_ASSET_KEYS,
  CONTENT_WIDTH_PX,
  html,
  raw,
  escapeHtml,
  joinHtml,
} from './templates/index.js';

export interface PrepareAssetsOptions {
  /** Ancho de los mapas y gráficos en píxeles. Por omisión, el ancho útil de la página A4. */
  widthPx?: number;
  /** Alto del mapa de localización. */
  mapHeightPx?: number;
  /** Fuerza el mapa de respaldo sin mapa base (entornos sin red, tests). */
  forceFallbackMap?: boolean;
}

/**
 * Completa los recursos que el informe necesita y que se pueden derivar del propio `spec`:
 * el QR de verificación (obligatorio), el mapa de localización del predio y el gráfico de
 * factores del semáforo. Los recursos que ya vengan en `spec.assets` no se tocan.
 */
export async function prepareReportAssets(
  spec: ReportSpec,
  options: PrepareAssetsOptions = {},
): Promise<ReportAssets> {
  const assets = resolveAssets(spec.assets);
  const width = options.widthPx ?? CONTENT_WIDTH_PX;

  if (!assets.qrSvg && spec.verification.verifyUrl) {
    assets.qrSvg = qrSvg(spec.verification.verifyUrl, { quietZone: 4 });
  }

  if (spec.kind === 'parcel') {
    const locationKey = PARCEL_REPORT_ASSET_KEYS.maps.location;
    if (!assets.maps[locationKey] && spec.data.parcelGeometry) {
      const map = await renderStaticMap({
        width,
        height: options.mapHeightPx ?? Math.round(width * 0.62),
        highlight: spec.data.parcelGeometry,
        bbox: spec.data.parcelBBox ?? null,
        alt: `Localización del predio ${spec.data.parcel.npn} en ${spec.data.municipality.name}`,
        inset: true,
        ...(options.forceFallbackMap ? { forceFallback: true } : {}),
      });
      assets.maps[locationKey] = toMapAsset(map, {
        alt: `Localización del predio ${spec.data.parcel.npn} en ${spec.data.municipality.name}`,
        caption: `Predio ${spec.data.parcel.npn} resaltado. ${spec.data.municipality.name}, ${spec.data.municipality.deptName}.`,
      });
    }

    const factorsKey = PARCEL_REPORT_ASSET_KEYS.charts.factors;
    const firstSuitability = spec.data.suitability[0];
    if (!assets.charts[factorsKey] && firstSuitability) {
      const chart = factorBarChart({
        title: `Factores del semáforo: ${firstSuitability.targetUseLabel}`,
        subtitle: 'Puntaje 0–100 por factor, con su peso y su estado. El color nunca va solo.',
        factors: firstSuitability.factors,
        width,
      });
      assets.charts[factorsKey] = toImageAsset(chart, {
        alt: `Desglose por factor de la aptitud para ${firstSuitability.targetUseLabel}`,
        caption: `Desglose por factor de la aptitud para ${firstSuitability.targetUseLabel}. Cada barra muestra el puntaje normalizado; el texto de la derecha indica el estado y el peso.`,
      });
    }
  }

  return assets;
}

export interface RenderReportOptions extends PrepareAssetsOptions {
  /** false para no derivar recursos y usar solo los de `spec.assets`. */
  prepareAssets?: boolean;
  /** Milisegundos máximos de render del PDF. */
  timeoutMs?: number;
}

/**
 * Genera el informe en PDF.
 *
 * `renderReport` no consulta la base ni la red: todo lo que necesita viaja en `spec`, así que
 * el mismo `spec` produce siempre el mismo informe (los informes son inmutables, PLAN.md §11).
 * La única excepción es el mapa base, que se descarga si `MAPLIBRE_STYLE_URL` está definido;
 * si no hay red, el mapa cae al respaldo SVG y el informe lo dice con la etiqueta
 * "sin mapa base".
 */
export async function renderReport(
  spec: ReportSpec,
  options: RenderReportOptions = {},
): Promise<ReportOutput> {
  const assets =
    options.prepareAssets === false
      ? resolveAssets(spec.assets)
      : await prepareReportAssets(spec, options);

  const effective: ReportSpec = { ...spec, assets } as ReportSpec;
  const branding = resolveBranding(spec.branding);
  const title = spec.titleOverride ?? REPORT_KIND_TITLE[spec.kind];
  const documentHtml = renderReportHtml(effective);

  const buffer = await renderPdf(documentHtml, {
    headerLeft: title,
    headerRight: subjectOf(spec),
    footerNote: [
      branding.footerNote ?? (branding.whiteLabel ? branding.organizationName : 'TerraColombia'),
      `Informe ${spec.verification.reportId}`,
      spec.meta.synthetic ? 'DATOS DE DEMOSTRACIÓN' : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });

  return {
    buffer,
    contentType: CONTENT_TYPES.pdf,
    filename: `${sanitizeFilename(toTabular(spec).filenameBase)}.pdf`,
  };
}

/** Texto identificador del sujeto del informe, para el encabezado de cada página. */
export function subjectOf(spec: ReportSpec): string {
  switch (spec.kind) {
    case 'parcel':
      return spec.data.parcel.npn;
    case 'area':
      return spec.data.title;
    case 'location':
      return spec.data.templateLabel;
    case 'change':
      return `${spec.data.fromCutDate} → ${spec.data.toCutDate}`;
    case 'municipality':
      return `${spec.data.municipality.name} (${spec.data.municipality.code})`;
  }
}

/** Devuelve el HTML del informe sin pasar por el navegador (útil para pruebas y para la web). */
export async function renderReportHtmlWithAssets(
  spec: ReportSpec,
  options: PrepareAssetsOptions = {},
): Promise<string> {
  const assets = await prepareReportAssets(spec, options);
  return renderReportHtml({ ...spec, assets } as ReportSpec);
}
