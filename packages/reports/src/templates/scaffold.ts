import { DISCLAIMERS, MESSAGES } from '@terracolombia/shared';
import {
  resolveAssets,
  resolveBranding,
  type ReportSection,
  type ReportSpec,
} from '../types.js';
import { html, joinHtml, raw, type RawHtml } from './html.js';
import {
  annexBlock,
  cadastralValueWarning,
  cover,
  documentShell,
  legalBlock,
  qrBlock,
  renderSectionBody,
  sectionAppliesToLevel,
  sectionBlock,
  sourcesBlock,
  tableOfContents,
  warningsBlock,
} from './partials.js';

/**
 * Armazón común de los informes de Zona, Localización, Cambio y Municipal.
 *
 * El Informe de Predio no lo usa: sus 10 secciones son fijas por §11 del plan y viven en
 * `parcel-report.ts`. Aquí el número de secciones depende del informe, pero la última
 * **siempre** es "Fuentes, fechas de corte, licencias y advertencias" con el mismo contenido
 * obligatorio: procedencia por cifra, descargos íntegros y QR de verificación.
 */

export const SOURCES_SECTION_TITLE = MESSAGES.reports.sections[9];

export interface SectionedReportOptions {
  spec: ReportSpec;
  /** Título del informe (o el canónico del tipo). */
  title: string;
  subtitle: string | null;
  /** Pares clave/valor de la portada. */
  facts: Array<[string, string]>;
  /** Secciones de contenido, sin la de fuentes: se añade automáticamente al final. */
  sections: ReportSection[];
  /** Texto del encabezado derecho de cada página. */
  runningRight: string;
  /** Advertencias de nivel informe. */
  warnings: readonly string[];
  /** true si alguna cifra del informe es un valor catastral. */
  hasCadastralValue: boolean;
  /** Descargos adicionales propios de este tipo de informe. */
  extraDisclaimers?: readonly string[];
}

export function renderSectionedReport(opts: SectionedReportOptions): string {
  const { spec } = opts;
  const branding = resolveBranding(spec.branding);
  const assets = resolveAssets(spec.assets);
  const ctx = { level: spec.level, maps: assets.maps, charts: assets.charts };

  const visible = opts.sections.filter((s) => sectionAppliesToLevel(s, spec.level));
  const footNote =
    branding.footerNote ?? (branding.whiteLabel ? branding.organizationName : 'TerraColombia');

  const contentSections = joinHtml(
    visible.map((s, i) =>
      sectionBlock({
        num: i + 1,
        title: s.title,
        body: renderSectionBody(s, ctx),
        runningLeft: opts.title,
        runningRight: opts.runningRight,
        footNote,
      }),
    ),
  );

  const sourcesSection = sectionBlock({
    num: visible.length + 1,
    title: SOURCES_SECTION_TITLE,
    body: html`${sourcesBlock(spec.meta, spec.verification)}
    ${warningsBlock(opts.warnings, 'Advertencias de este informe')}
    ${spec.meta.warnings.length > 0
      ? warningsBlock(spec.meta.warnings, 'Advertencias sobre los datos de este informe')
      : ''}
    ${opts.hasCadastralValue ? cadastralValueWarning() : ''} ${legalBlock(opts.extraDisclaimers ?? [])}
    ${qrBlock(spec.verification, assets.qrSvg)}
    <p><small>${DISCLAIMERS.noPersonalData} ${DISCLAIMERS.dataFreshness}</small></p>`,
    runningLeft: opts.title,
    runningRight: opts.runningRight,
    footNote,
  });

  const annexList = spec.level === 'tecnico' ? annexesOf(spec) : [];
  const annexes = joinHtml(
    annexList.map((a, i) => annexBlock(`A${i + 1}`, a.title, a.description, a.table)),
  );

  const toc = tableOfContents(
    visible
      .map((s, i) => ({ num: String(i + 1), title: s.title }))
      .concat([{ num: String(visible.length + 1), title: SOURCES_SECTION_TITLE }])
      .concat(annexList.map((a, i) => ({ num: `A${i + 1}`, title: a.title }))),
  );

  const body = html`${cover({
    branding,
    title: opts.title,
    subtitle: opts.subtitle,
    level: spec.level,
    facts: opts.facts,
    meta: spec.meta,
    verification: spec.verification,
    requestedBy: spec.requestedBy ?? null,
  })}
  ${toc} ${contentSections} ${sourcesSection} ${annexes}`;

  return documentShell({ title: `${opts.title} — ${opts.runningRight}`, branding, body });
}

function annexesOf(spec: ReportSpec) {
  return spec.data.annexes ?? [];
}

/** Envuelve una lista de párrafos como cuerpo de sección sin tablas. */
export function textOnly(items: readonly string[]): RawHtml {
  if (items.length === 0) return raw('');
  return joinHtml(items.map((p) => html`<p>${p}</p>`));
}
