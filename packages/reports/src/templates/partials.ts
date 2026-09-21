import {
  ALL_DISCLAIMERS,
  DISCLAIMERS,
  IGAC_ATTRIBUTION_TEMPLATE,
  MESSAGES,
  NOT_AVAILABLE,
  isShareAlike,
  type FactorScore,
  type Coverage,
  type ResponseMeta,
  type SourceRef,
  type SuitabilityResult,
} from '@terracolombia/shared';
import {
  REPORT_LEVEL_DESCRIPTION,
  REPORT_LEVEL_LABEL,
  type ReportBranding,
  type ReportImageAsset,
  type ReportIndicator,
  type ReportLevel,
  type ReportSection,
  type ReportTable,
  type ReportVerification,
} from '../types.js';
import { baseStyles, PRINT_ONLY_STYLES } from './styles.js';
import { html, joinHtml, raw, type RawHtml } from './html.js';

/**
 * Piezas reutilizables de las plantillas. Todas devuelven `RawHtml` y escapan sus entradas:
 * lo único que se inserta sin escapar es lo que este paquete genera (SVG de gráficos y QR).
 */

// ─── Utilidades de presentación ───────────────────────────────────────────────

/** Muestra un valor `Maybe`: nunca inventa, dice "no disponible" cuando no hay dato. */
export function showMaybe<T>(
  value: T | null | undefined | typeof NOT_AVAILABLE,
  formatter?: (v: T) => string,
): RawHtml {
  if (value === null || value === undefined || value === NOT_AVAILABLE) {
    return html`<span class="na">${MESSAGES.common.notAvailable}</span>`;
  }
  const formatted = formatter ? formatter(value as T) : String(value);
  return html`${formatted}`;
}

export const FLAG_META: Record<
  'ok' | 'caution' | 'blocker' | 'unknown',
  { cls: string; icon: string; label: string }
> = {
  ok: { cls: 'light--ok', icon: '✔', label: 'Sin restricción relevante' },
  caution: { cls: 'light--caution', icon: '⚠', label: 'Requiere atención' },
  blocker: { cls: 'light--blocker', icon: '✖', label: 'Restricción fuerte' },
  unknown: { cls: 'light--unknown', icon: '?', label: 'Sin datos suficientes' },
};

const VERDICT_TO_FLAG: Record<SuitabilityResult['verdict'], keyof typeof FLAG_META> = {
  favorable: 'ok',
  condicionado: 'caution',
  desfavorable: 'blocker',
  sin_datos: 'unknown',
};

const VERDICT_HELP: Record<SuitabilityResult['verdict'], string> = {
  favorable: MESSAGES.suitability.favorableHelp,
  condicionado: MESSAGES.suitability.condicionadoHelp,
  desfavorable: MESSAGES.suitability.desfavorableHelp,
  sin_datos: MESSAGES.suitability.sinDatosHelp,
};

/** Semáforo: círculo con trama + icono + texto. Nunca solo color (PLAN.md §10.1). */
export function trafficLight(flag: keyof typeof FLAG_META, label?: string): RawHtml {
  const meta = FLAG_META[flag];
  return html`<span class="light ${raw(meta.cls)}"
    ><span class="light__dot" aria-hidden="true"></span
    ><span class="light__icon" aria-hidden="true">${meta.icon}</span
    ><span>${label ?? meta.label}</span></span
  >`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return MESSAGES.common.notAvailable;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return MESSAGES.common.notAvailable;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(d);
}

// ─── Estructura del documento ─────────────────────────────────────────────────

export interface DocumentShellOptions {
  title: string;
  branding: ReportBranding;
  /** Contenido completo del cuerpo, ya renderizado. */
  body: RawHtml;
  /** SVG extra a inyectar (definiciones de tramas de los gráficos, por ejemplo). */
  head?: RawHtml | null;
}

export function documentShell({ title, branding, body, head }: DocumentShellOptions): string {
  return `<!doctype html>
${html`<html lang="es-CO">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="generator" content="TerraColombia reports" />
    <style>
      ${raw(baseStyles(branding))}
    </style>
    <style>
      ${raw(PRINT_ONLY_STYLES)}
    </style>
    ${head ?? ''}
  </head>
  <body>
    ${branding.watermarkText
      ? html`<div class="watermark" aria-hidden="true"><span>${branding.watermarkText}</span></div>`
      : ''}
    ${body}
  </body>
</html>`}`;
}

// ─── Portada ──────────────────────────────────────────────────────────────────

export interface CoverOptions {
  branding: ReportBranding;
  title: string;
  subtitle: string | null;
  level: ReportLevel;
  /** Pares clave/valor de la portada: municipio, código predial, fechas de corte… */
  facts: Array<[string, string]>;
  meta: ResponseMeta;
  verification: ReportVerification;
  requestedBy?: string | null;
}

export function cover(opts: CoverOptions): RawHtml {
  const { branding, meta } = opts;
  return html`<section class="cover">
    <div class="cover__brandbar" aria-hidden="true"></div>
    ${meta.synthetic ? demoBand() : ''}
    ${branding.logoDataUri
      ? html`<img class="cover__logo" src="${branding.logoDataUri}" alt="${branding.organizationName}" />`
      : ''}
    <div class="cover__org">${branding.organizationName}</div>
    <h1 class="cover__title">${opts.title}</h1>
    ${opts.subtitle ? html`<p class="cover__subtitle">${opts.subtitle}</p>` : ''}
    <div class="cover__facts">
      <dl>
        ${joinHtml(
          opts.facts.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`),
        )}
        <dt>Nivel del informe</dt>
        <dd>${REPORT_LEVEL_LABEL[opts.level]} — ${REPORT_LEVEL_DESCRIPTION[opts.level]}</dd>
        <dt>Fecha de emisión</dt>
        <dd>${fmtDateTime(opts.verification.issuedAt)}</dd>
        <dt>Identificador del informe</dt>
        <dd>${opts.verification.reportId}</dd>
        ${opts.requestedBy ? html`<dt>Solicitado por</dt><dd>${opts.requestedBy}</dd>` : ''}
      </dl>
      <p class="cover__legal">
        ${MESSAGES.reports.immutable} ${DISCLAIMERS.notCertificate}
        ${branding.whiteLabel
          ? ''
          : html`<br />Generado por TerraColombia — motor de inteligencia territorial de Colombia.`}
      </p>
    </div>
  </section>`;
}

/** Banda obligatoria cuando el informe toca un snapshot sintético (ADR-006). */
export function demoBand(inline = false): RawHtml {
  return html`<div class="demo-band ${inline ? raw('demo-band--inline') : ''}" role="alert">
    DATOS DE DEMOSTRACIÓN
    <small
      >Este informe se generó con un snapshot sintético de demostración. Las cifras no provienen de
      la fuente oficial y no deben usarse para decidir nada.</small
    >
  </div>`;
}

// ─── Índice ───────────────────────────────────────────────────────────────────

export interface TocEntry {
  num: string;
  title: string;
  note?: string | null;
}

export function tableOfContents(entries: TocEntry[], title = 'Contenido'): RawHtml {
  return html`<section class="toc">
    ${runningHead('', '')}
    <div class="section__head">
      <h2 class="section__title">${title}</h2>
    </div>
    <ol class="toc__list">
      ${joinHtml(
        entries.map(
          (e) => html`<li class="toc__item">
            <span class="toc__num">${e.num}</span>
            <span class="toc__title">${e.title}</span>
            <span class="toc__leader" aria-hidden="true"></span>
            ${e.note ? html`<span class="toc__note">${e.note}</span>` : ''}
          </li>`,
        ),
      )}
    </ol>
  </section>`;
}

// ─── Encabezado y pie ─────────────────────────────────────────────────────────

export function runningHead(left: string, right: string): RawHtml {
  return html`<div class="running-head"><span>${left}</span><span>${right}</span></div>`;
}

export function runningFoot(left: string): RawHtml {
  return html`<div class="running-foot">
    <span>${left}</span><span class="running-foot__page"></span>
  </div>`;
}

/**
 * Plantillas de encabezado y pie para `page.pdf({ displayHeaderFooter: true })`.
 * Playwright sustituye `.pageNumber` y `.totalPages`; el resto es HTML propio.
 * Se escapa el texto porque viene de la marca del cliente.
 */
export function pdfHeaderTemplate(left: string, right: string): string {
  return `<div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7pt;color:#52514e;
    padding:0 15mm;display:flex;justify-content:space-between;gap:6mm;">
    <span>${html`${left}`}</span><span>${html`${right}`}</span></div>`;
}

export function pdfFooterTemplate(note: string): string {
  return `<div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7pt;color:#52514e;
    padding:0 15mm;display:flex;justify-content:space-between;gap:6mm;">
    <span>${html`${note}`}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
}

// ─── Secciones ────────────────────────────────────────────────────────────────

export interface SectionOptions {
  num: string | number;
  title: string;
  body: RawHtml;
  /** false para que la sección continúe en la misma página. */
  newPage?: boolean;
  runningLeft?: string;
  runningRight?: string;
  footNote?: string;
}

export function sectionBlock(opts: SectionOptions): RawHtml {
  const cls = opts.newPage === false ? 'section section--flow' : 'section';
  return html`<section class="${raw(cls)}">
    ${opts.newPage === false ? '' : runningHead(opts.runningLeft ?? '', opts.runningRight ?? '')}
    <div class="section__head">
      <span class="section__num">${opts.num}</span>
      <h2 class="section__title">${opts.title}</h2>
    </div>
    ${opts.body} ${opts.newPage === false ? '' : runningFoot(opts.footNote ?? '')}
  </section>`;
}

export function subsection(title: string): RawHtml {
  return html`<h3 class="subsection">${title}</h3>`;
}

export function paragraphs(items: readonly string[]): RawHtml {
  return joinHtml(items.map((p) => html`<p>${p}</p>`));
}

export function kvList(pairs: Array<[string, RawHtml | string]>, wide = false): RawHtml {
  return html`<dl class="kv ${wide ? raw('kv--wide') : ''}">
    ${joinHtml(pairs.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`))}
  </dl>`;
}

// ─── Tablas ───────────────────────────────────────────────────────────────────

function cellClass(align: string | undefined): string {
  if (align === 'right') return 'num';
  if (align === 'center') return 'ctr';
  return '';
}

export function dataTable(table: ReportTable, opts: { showTitle?: boolean } = {}): RawHtml {
  const showTitle = opts.showTitle !== false;
  if (table.rows.length === 0 || table.columns.length === 0) {
    return html`<div class="table-wrap">
      ${showTitle ? html`<p class="table-title">${table.title}</p>` : ''}
      <p class="table-empty">
        ${table.emptyMessage ?? MESSAGES.common.notAvailableLong}
      </p>
      ${table.note ? html`<p class="table-note">${table.note}</p>` : ''}
    </div>`;
  }
  const longTable = table.rows.length > 18;
  return html`<div class="table-wrap ${longTable ? raw('table-wrap--long') : ''}">
    ${showTitle ? html`<p class="table-title">${table.title}</p>` : ''}
    <table class="data">
      <thead>
        <tr>
          ${joinHtml(
            table.columns.map(
              (c) => html`<th class="${raw(cellClass(c.align))}" scope="col">${c.label}</th>`,
            ),
          )}
        </tr>
      </thead>
      <tbody>
        ${joinHtml(
          table.rows.map(
            (row) => html`<tr>
              ${joinHtml(
                table.columns.map((c) => {
                  const v = row[c.key];
                  return html`<td class="${raw(cellClass(c.align))}">
                    ${v === null || v === undefined || v === NOT_AVAILABLE
                      ? html`<span class="na">${MESSAGES.common.notAvailable}</span>`
                      : html`${v}`}
                  </td>`;
                }),
              )}
            </tr>`,
          ),
        )}
      </tbody>
    </table>
    ${table.note ? html`<p class="table-note">${table.note}</p>` : ''}
    ${table.hasCadastralValue ? cadastralValueWarning() : ''}
  </div>`;
}

// ─── Ficha de indicador ───────────────────────────────────────────────────────

export function indicatorCard(ind: ReportIndicator): RawHtml {
  return html`<div class="indicator">
    <div class="indicator__label">${ind.label}</div>
    <div class="indicator__value">
      ${ind.value}${ind.unit ? html`<span class="indicator__unit">${ind.unit}</span>` : ''}
    </div>
    ${ind.flag ? trafficLight(ind.flag) : ''}
    <div class="indicator__formula">${MESSAGES.common.howCalculated} ${ind.formula}</div>
    <p class="indicator__explain">${ind.explanation}</p>
    <p class="indicator__src">
      ${MESSAGES.common.sources}:
      ${ind.sourceDatasetIds.length > 0
        ? ind.sourceDatasetIds.join(', ')
        : html`<span class="na">sin procedencia declarada — no se publica</span>`}${ind.own
        ? ' · indicador propio de TerraColombia'
        : ''}
    </p>
  </div>`;
}

export function indicatorGrid(indicators: readonly ReportIndicator[], columns = 2): RawHtml {
  if (indicators.length === 0) return raw('');
  const cls = columns >= 3 ? 'grid grid--3' : 'grid grid--2';
  return html`<div class="${raw(cls)}">${joinHtml(indicators.map(indicatorCard))}</div>`;
}

// ─── Semáforo explicado ───────────────────────────────────────────────────────

export function factorRow(f: FactorScore): RawHtml {
  const meta = FLAG_META[f.flag];
  return html`<div class="factor">
    <span class="light ${raw(meta.cls)}"
      ><span class="light__dot" aria-hidden="true"></span
      ><span class="light__icon" aria-hidden="true">${meta.icon}</span></span
    >
    <span class="factor__name">${f.label}</span>
    <span class="factor__raw"
      >${f.rawValue === null
        ? html`<span class="na">${MESSAGES.common.notAvailable}</span>`
        : html`${f.rawValue}${f.unit && f.unit !== NOT_AVAILABLE ? html` ${f.unit}` : ''}`}</span
    >
    <span class="factor__score"
      >${f.score === null ? html`<span class="na">—</span>` : html`${f.score} / 100`}</span
    >
    <span class="factor__why">
      ${f.explanation} <em>${MESSAGES.common.howCalculated} ${f.formula}</em> · peso
      ${(f.weight * 100).toFixed(0)} % · ${MESSAGES.common.sources}:
      ${f.sourceDatasetIds.join(', ') || MESSAGES.common.notAvailable}
    </span>
  </div>`;
}

export function verdictBlock(result: SuitabilityResult): RawHtml {
  const flag = VERDICT_TO_FLAG[result.verdict];
  return html`<div class="verdict">
    <div class="verdict__head">
      <span class="verdict__use">${result.targetUseLabel}</span>
      ${trafficLight(flag, result.verdictLabel)}
      <span class="verdict__score"
        >${result.score === null ? html`<span class="na">sin puntaje</span>` : html`${result.score}/100`}</span
      >
    </div>
    <p class="verdict__help">${VERDICT_HELP[result.verdict]}</p>
    ${result.blockers.length > 0
      ? html`<p class="verdict__help"><strong>Restricciones fuertes:</strong> ${result.blockers.join('; ')}</p>`
      : ''}
    ${result.cautions.length > 0
      ? html`<p class="verdict__help"><strong>Puntos a revisar:</strong> ${result.cautions.join('; ')}</p>`
      : ''}
    ${result.missing.length > 0
      ? html`<p class="verdict__help">
          <strong>Datos que faltan para esta zona:</strong> ${result.missing.join('; ')}. No los
          estimamos.
        </p>`
      : ''}
    <div class="verdict__factors">${joinHtml(result.factors.map(factorRow))}</div>
    <p class="verdict__help"><small>${result.disclaimer}</small></p>
  </div>`;
}

// ─── Figuras ──────────────────────────────────────────────────────────────────

/**
 * Mapa estático: consume un PNG (o SVG de respaldo) ya generado.
 *
 * Si el recurso no existe y no se da un `fallbackText`, no se imprime nada: los mapas
 * secundarios son opcionales y un aviso en cada sección sería ruido. Donde el mapa sí es
 * esencial (la localización del predio), la plantilla pasa un texto y el hueco se explica.
 */
export function staticMapFigure(asset: ReportImageAsset | undefined, fallbackText?: string): RawHtml {
  if (!asset) {
    if (!fallbackText) return raw('');
    return html`<p class="table-empty">${fallbackText}</p>`;
  }
  return html`<figure class="fig">
    <img
      src="${asset.src}"
      alt="${asset.alt}"
      ${asset.widthPx ? raw(`width="${asset.widthPx}"`) : ''}
      ${asset.heightPx ? raw(`height="${asset.heightPx}"`) : ''}
    />
    <figcaption>
      ${asset.caption ?? asset.alt}
      ${asset.attribution ? html`<span class="fig__attr">${asset.attribution}</span>` : ''}
      ${asset.withoutBasemap
        ? html`<span class="fig__nobasemap">sin mapa base</span>`
        : ''}
    </figcaption>
  </figure>`;
}

/** Gráfico: consume un PNG o SVG ya generado en Node. */
export function chartFigure(asset: ReportImageAsset | undefined): RawHtml {
  if (!asset) return raw('');
  return html`<figure class="fig">
    <img src="${asset.src}" alt="${asset.alt}" />
    <figcaption>
      ${asset.caption ?? asset.alt}
      ${asset.attribution ? html`<span class="fig__attr">${asset.attribution}</span>` : ''}
    </figcaption>
  </figure>`;
}

// ─── Advertencias ─────────────────────────────────────────────────────────────

/**
 * Advertencia obligatoria junto a cualquier cifra económica catastral
 * (regla 5 de `CLAUDE.md`). El texto literal "avalúo catastral ≠ valor comercial"
 * debe aparecer; los tests lo verifican.
 */
export function cadastralValueWarning(): RawHtml {
  return html`<div class="warn warn--cadastral">
    <span class="warn__title">Advertencia: avalúo catastral ≠ valor comercial</span>
    ${DISCLAIMERS.notAppraisal} ${MESSAGES.parcel.cadastralValueWarning}
  </div>`;
}

export function coverageWarning(coverage: Coverage | null | undefined): RawHtml {
  if (!coverage) return raw('');
  if (coverage.status === 'full') return raw('');
  const manager = coverage.cadastralManager ?? 'otro gestor catastral';
  const layers =
    coverage.availableLayers.length > 0
      ? coverage.availableLayers.join(', ')
      : 'ninguna capa adicional';
  const title =
    coverage.status === 'partial' ? MESSAGES.coverage.partialTitle : MESSAGES.coverage.noneTitle;
  const body =
    coverage.message ??
    (coverage.status === 'partial'
      ? MESSAGES.coverage.partialBody
      : `Este municipio lo gestiona ${manager}, que no publica su catastro como dato abierto o todavía no lo hemos integrado. Sí tenemos para esta zona: ${layers}.`);
  return html`<div class="warn warn--coverage">
    <span class="warn__title">${title}</span>${body} ${DISCLAIMERS.coverage}
  </div>`;
}

export function warningsBlock(warnings: readonly string[], title = 'Advertencias de esta consulta'): RawHtml {
  if (warnings.length === 0) return raw('');
  return html`<div class="warn">
    <span class="warn__title">${title}</span>
    <ul>
      ${joinHtml(warnings.map((w) => html`<li>${w}</li>`))}
    </ul>
  </div>`;
}

// ─── Bloque de fuentes ────────────────────────────────────────────────────────

/**
 * Tabla de procedencia. Regla 4 de `CLAUDE.md`: fuente, dataset, fecha de corte y licencia
 * de cada cifra. Se imprime íntegra en la sección 10 de todos los informes.
 */
export function sourcesBlock(meta: ResponseMeta, verification: ReportVerification): RawHtml {
  const igacCut = meta.sources.find((s) => /igac/i.test(s.source))?.cutDate;
  const shareAlike = meta.sources.filter((s) => isShareAlike(s.license));
  return html`<div class="sources">
    ${igacCut ? html`<p class="sources__attr">${IGAC_ATTRIBUTION_TEMPLATE(igacCut.slice(0, 7))}</p>` : ''}
    ${meta.sources.length === 0
      ? html`<p class="table-empty">
          Este informe no declara fuentes, lo que no debería ocurrir: sin procedencia no se publica
          ninguna cifra. Reporte el identificador ${verification.reportId}.
        </p>`
      : html`<table class="data">
          <thead>
            <tr>
              <th scope="col">${MESSAGES.common.source}</th>
              <th scope="col">Dataset</th>
              <th scope="col">${MESSAGES.common.cutDate}</th>
              <th scope="col">${MESSAGES.common.license}</th>
              <th scope="col">Atribución exigida</th>
              <th scope="col">Snapshot</th>
            </tr>
          </thead>
          <tbody>
            ${joinHtml(
              meta.sources.map(
                (s) => html`<tr>
                  <td>${s.source}${s.synthetic ? ' (demostración)' : ''}</td>
                  <td>${s.name}<br /><small>${s.datasetId}</small>${s.url ? html`<br /><small>${s.url}</small>` : ''}</td>
                  <td>${s.cutDate ?? MESSAGES.common.notAvailable}</td>
                  <td>${s.license}${isShareAlike(s.license) ? ' · ShareAlike' : ''}</td>
                  <td>${s.attribution}</td>
                  <td>${verification.snapshotIds[s.datasetId] ?? MESSAGES.common.notAvailable}</td>
                </tr>`,
              ),
            )}
          </tbody>
        </table>`}
    ${shareAlike.length > 0
      ? html`<p class="table-note">
          Los datasets marcados <strong>ShareAlike</strong> (${shareAlike
            .map((s) => s.source)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ')}) obligan a mantener la misma licencia al redistribuirlos o al publicar bases
          derivadas de ellos. En las exportaciones de TerraColombia esos datos viajan en archivos u
          hojas separadas de los indicadores propios, precisamente para que quien los reutilice pueda
          distinguirlos.
        </p>`
      : ''}
  </div>`;
}

/** Textos legales obligatorios, íntegros (PLAN.md §2 y §11). */
export function legalBlock(extra: readonly string[] = []): RawHtml {
  return html`<div class="legal">
    ${subsection('Advertencias legales')}
    <ol>
      ${joinHtml(ALL_DISCLAIMERS.map((d) => html`<li>${d}</li>`))}
      ${joinHtml(extra.map((d) => html`<li>${d}</li>`))}
    </ol>
  </div>`;
}

// ─── QR de verificación ───────────────────────────────────────────────────────

export function qrBlock(verification: ReportVerification, qrSvg: string | null): RawHtml {
  return html`<div class="qr">
    <div class="qr__code">
      ${qrSvg
        ? raw(qrSvg)
        : html`<p class="table-empty">No se pudo generar el código QR de verificación.</p>`}
    </div>
    <div class="qr__text">
      <strong>${MESSAGES.reports.verifyQr}</strong><br />
      <span class="qr__url">${verification.verifyUrl}</span><br />
      Identificador: ${verification.reportId}<br />
      ${verification.checksum
        ? html`Huella del contenido (SHA-256): <span class="qr__url">${verification.checksum}</span><br />`
        : ''}
      ${MESSAGES.reports.immutable}
    </div>
  </div>`;
}

// ─── Sección genérica ─────────────────────────────────────────────────────────

export interface RenderSectionContext {
  level: ReportLevel;
  maps: Record<string, ReportImageAsset | undefined>;
  charts: Record<string, ReportImageAsset | undefined>;
}

export function renderSectionBody(sec: ReportSection, ctx: RenderSectionContext): RawHtml {
  const showTables = ctx.level !== 'resumen';
  return html`${paragraphs(sec.paragraphs)} ${warningsBlock(sec.warnings)}
  ${indicatorGrid(sec.indicators)}
  ${joinHtml(sec.mapKeys.map((k) => staticMapFigure(ctx.maps[k])))}
  ${joinHtml(sec.chartKeys.map((k) => chartFigure(ctx.charts[k])))}
  ${showTables ? joinHtml(sec.tables.map((t) => dataTable(t))) : ''}`;
}

export function sectionAppliesToLevel(sec: ReportSection, level: ReportLevel): boolean {
  return !sec.levels || sec.levels.includes(level);
}

// ─── Anexos ───────────────────────────────────────────────────────────────────

export function annexBlock(
  num: string,
  title: string,
  description: string,
  table: ReportTable,
): RawHtml {
  return html`<section class="section annex">
    <div class="section__head">
      <span class="section__num">${num}</span>
      <h2 class="section__title">${title}</h2>
    </div>
    <p class="annex__desc">${description}</p>
    ${dataTable(table, { showTitle: false })}
  </section>`;
}

/** Lista de fuentes en una línea, para notas al pie de tabla. */
export function sourceLine(sources: readonly SourceRef[], datasetIds: readonly string[]): string {
  if (datasetIds.length === 0) return 'Sin procedencia declarada.';
  const parts = datasetIds.map((id) => {
    const s = sources.find((x) => x.datasetId === id);
    if (!s) return `${id} (fuente no declarada)`;
    return `${s.source} · ${s.name} · corte ${s.cutDate ?? MESSAGES.common.notAvailable} · ${s.license}`;
  });
  return `${MESSAGES.common.sources}: ${parts.join(' | ')}`;
}
