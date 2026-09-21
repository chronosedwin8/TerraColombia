import type { ReportSpec } from '../types.js';
import { renderParcelReport } from './parcel-report.js';
import { renderAreaReport } from './area-report.js';
import { renderLocationReport } from './location-report.js';
import { renderChangeReport } from './change-report.js';
import { renderMunicipalityReport } from './municipality-report.js';

export * from './html.js';
export * from './styles.js';
export * from './partials.js';
export * from './scaffold.js';
export { renderParcelReport, PARCEL_REPORT_ASSET_KEYS } from './parcel-report.js';
export { renderAreaReport, AREA_REPORT_ASSET_KEYS } from './area-report.js';
export { renderLocationReport, LOCATION_REPORT_ASSET_KEYS } from './location-report.js';
export { renderChangeReport, CHANGE_REPORT_ASSET_KEYS } from './change-report.js';
export { renderMunicipalityReport, MUNICIPALITY_REPORT_ASSET_KEYS } from './municipality-report.js';

/** Despacha la plantilla HTML del informe según su tipo. No toca red ni disco. */
export function renderReportHtml(spec: ReportSpec): string {
  switch (spec.kind) {
    case 'parcel':
      return renderParcelReport(spec);
    case 'area':
      return renderAreaReport(spec);
    case 'location':
      return renderLocationReport(spec);
    case 'change':
      return renderChangeReport(spec);
    case 'municipality':
      return renderMunicipalityReport(spec);
  }
}
