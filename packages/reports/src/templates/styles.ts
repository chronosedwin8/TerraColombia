import { safeColor, type ReportBranding } from '../types.js';

/**
 * CSS de impresión A4.
 *
 * Criterios:
 * - Tamaño A4 con márgenes generosos y pie reservado para la paginación de Playwright
 *   (`displayHeaderFooter`); además se mantienen contadores CSS para que el HTML abierto
 *   en un navegador muestre la misma numeración.
 * - `break-inside: avoid` en tarjetas, fichas de indicador, figuras y filas de tabla:
 *   ningún bloque de dato se parte entre páginas.
 * - Accesible en blanco y negro: los semáforos y las series de gráficos llevan, además del
 *   color, un texto, un icono y una trama (`--texture-*`). Ningún estado se codifica solo
 *   con color (WCAG 1.4.1).
 * - Colores de la paleta validada (ver `src/charts.ts`); el cliente solo puede cambiar
 *   `primaryColor` y `accentColor`, ya saneados a hexadecimal.
 */

export const PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 16,
  marginRightMm: 15,
  marginBottomMm: 18,
  marginLeftMm: 15,
} as const;

/** Ancho útil del contenido en píxeles CSS a 96 dpi, para dimensionar mapas y gráficos. */
export const CONTENT_WIDTH_PX = Math.round(
  ((PAGE.widthMm - PAGE.marginLeftMm - PAGE.marginRightMm) / 25.4) * 96,
);

export function baseStyles(branding: ReportBranding): string {
  const primary = safeColor(branding.primaryColor, '#184f95');
  const accent = safeColor(branding.accentColor, '#eb6834');
  return `
:root {
  --primary: ${primary};
  --accent: ${accent};

  /* Tinta y superficies */
  --surface: #ffffff;
  --surface-alt: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --ink-muted: #898781;
  --rule: #c3c2b7;
  --rule-hair: #e1e0d9;

  /* Estados (nunca solos: siempre con texto e icono) */
  --ok: #0ca30c;
  --caution: #fab219;
  --serious: #ec835a;
  --blocker: #d03b3b;
  --unknown: #898781;

  --font-sans: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  --fs-body: 9.6pt;
  --fs-small: 8.2pt;
  --fs-micro: 7.2pt;
}

/* Los márgenes reales del PDF los fija Playwright (ver src/pdf.ts) para que el
   encabezado y el pie con paginación queden dentro de ellos. Este @page mantiene el
   mismo tamaño y márgenes cuando el HTML se imprime directamente desde un navegador. */
@page {
  size: A4;
  margin: ${PAGE.marginTopMm}mm ${PAGE.marginRightMm}mm ${PAGE.marginBottomMm}mm ${PAGE.marginLeftMm}mm;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: 1.45;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Contador de páginas para la vista HTML. En el PDF la numeración autoritativa
   la inyecta Playwright con displayHeaderFooter. */
body { counter-reset: page 1 section 0 figure 0 table 0; }

p { margin: 0 0 .45em; orphans: 3; widows: 3; }
a { color: var(--primary); text-decoration: none; word-break: break-all; }
small { font-size: var(--fs-small); color: var(--ink-2); }
strong { font-weight: 650; }
ul, ol { margin: .2em 0 .5em; padding-left: 1.1em; }
li { margin-bottom: .15em; }

/* ── Portada ───────────────────────────────────────────────────────────────── */

/* La portada ocupa el alto útil de la primera página (A4 menos los márgenes del PDF).
   No se usa sangrado completo: el encabezado y el pie de Playwright viven en el margen. */
.cover {
  position: relative;
  min-height: calc(${PAGE.heightMm}mm - ${PAGE.marginTopMm}mm - ${PAGE.marginBottomMm}mm - 2mm);
  padding-top: 12mm;
  break-after: page;
  page-break-after: always;
  display: flex;
  flex-direction: column;
}
.cover__brandbar {
  height: 5mm;
  background: var(--primary);
  position: absolute;
  top: 0; left: 0; right: 0;
}
.cover__logo { max-height: 18mm; max-width: 70mm; margin-bottom: 8mm; }
.cover__org {
  font-size: 11pt;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--primary);
  font-weight: 650;
  margin-bottom: 12mm;
}
.cover__title { font-size: 26pt; line-height: 1.12; font-weight: 700; margin: 0 0 3mm; }
.cover__subtitle { font-size: 13pt; color: var(--ink-2); margin: 0 0 10mm; font-weight: 400; }
.cover__facts { margin-top: auto; border-top: 2px solid var(--rule); padding-top: 4mm; }
.cover__facts dl { display: grid; grid-template-columns: 42mm 1fr; gap: 1.6mm 4mm; margin: 0; }
.cover__facts dt { color: var(--ink-2); font-size: var(--fs-small); }
.cover__facts dd { margin: 0; font-size: var(--fs-small); font-weight: 600; }
.cover__legal { margin-top: 6mm; font-size: var(--fs-micro); color: var(--ink-2); }

/* Banda de datos sintéticos: obligatoria si el informe toca un snapshot de demostración. */
.demo-band {
  background: var(--blocker);
  color: #ffffff;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
  text-align: center;
  padding: 2.4mm 3mm;
  margin: 0 0 8mm;
  font-size: 11pt;
  border: 2px solid #8f1f1f;
}
.demo-band small {
  display: block;
  color: #ffffff;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  font-size: var(--fs-micro);
  margin-top: 1mm;
}
.demo-band--inline { margin: 0 0 4mm; padding: 1.6mm 2.4mm; font-size: 9pt; }

/* Marca de agua del plan gratuito. */
.watermark {
  position: fixed;
  inset: 0;
  z-index: 999;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.watermark span {
  transform: rotate(-32deg);
  font-size: 42pt;
  font-weight: 800;
  letter-spacing: .1em;
  color: rgba(11, 11, 11, .07);
  border: 4px solid rgba(11, 11, 11, .07);
  padding: 4mm 8mm;
  white-space: nowrap;
}

/* ── Índice ────────────────────────────────────────────────────────────────── */

.toc { break-after: page; page-break-after: always; }
.toc__list { list-style: none; margin: 0; padding: 0; }
.toc__item {
  display: flex;
  align-items: baseline;
  gap: 2mm;
  padding: 1.3mm 0;
  border-bottom: 1px solid var(--rule-hair);
  break-inside: avoid;
}
.toc__num { min-width: 7mm; font-weight: 650; color: var(--primary); font-variant-numeric: tabular-nums; }
.toc__title { flex: 0 1 auto; }
.toc__leader { flex: 1 1 auto; border-bottom: 1px dotted var(--rule); height: .7em; }
.toc__note { color: var(--ink-muted); font-size: var(--fs-small); }

/* ── Encabezado y pie (vista HTML) ─────────────────────────────────────────── */

.running-head {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  border-bottom: 1px solid var(--rule-hair);
  padding-bottom: 1.5mm;
  margin-bottom: 4mm;
  font-size: var(--fs-micro);
  color: var(--ink-2);
}
.running-foot {
  border-top: 1px solid var(--rule-hair);
  padding-top: 1.5mm;
  margin-top: 6mm;
  font-size: var(--fs-micro);
  color: var(--ink-2);
  display: flex;
  justify-content: space-between;
  gap: 4mm;
}
.running-foot__page::after {
  counter-increment: page;
  content: "Página " counter(page);
}

/* ── Secciones ─────────────────────────────────────────────────────────────── */

.section { break-before: page; page-break-before: always; }
.section--flow { break-before: auto; page-break-before: auto; margin-top: 6mm; }
.section__head {
  display: flex;
  align-items: baseline;
  gap: 3mm;
  border-bottom: 2px solid var(--primary);
  padding-bottom: 1.5mm;
  margin: 0 0 3.5mm;
  break-after: avoid;
  page-break-after: avoid;
}
.section__num {
  font-size: 18pt;
  font-weight: 750;
  color: var(--primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.section__title { font-size: 13.5pt; font-weight: 650; margin: 0; }
.subsection {
  font-size: 10.5pt;
  font-weight: 650;
  margin: 4mm 0 1.6mm;
  color: var(--primary);
  break-after: avoid;
  page-break-after: avoid;
}

/* ── Tarjetas y rejillas ───────────────────────────────────────────────────── */

.card {
  border: 1px solid var(--rule-hair);
  border-left: 3px solid var(--primary);
  background: var(--surface-alt);
  padding: 2.6mm 3mm;
  margin: 0 0 3mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.grid { display: grid; gap: 2.5mm; }
.grid--2 { grid-template-columns: 1fr 1fr; }
.grid--3 { grid-template-columns: 1fr 1fr 1fr; }

.kv { display: grid; grid-template-columns: 52mm 1fr; gap: 1.2mm 3mm; margin: 0; }
.kv dt { color: var(--ink-2); font-size: var(--fs-small); }
.kv dd { margin: 0; font-weight: 600; }
.kv--wide { grid-template-columns: 70mm 1fr; }

.na { color: var(--ink-muted); font-style: italic; font-weight: 400; }

/* ── Tablas ────────────────────────────────────────────────────────────────── */

.table-wrap { margin: 0 0 3.5mm; break-inside: avoid; page-break-inside: avoid; }
.table-wrap--long { break-inside: auto; page-break-inside: auto; }
.table-title {
  font-size: var(--fs-small);
  font-weight: 650;
  margin: 0 0 1.2mm;
  break-after: avoid;
  page-break-after: avoid;
}
.table-title::before {
  counter-increment: table;
  content: "Tabla " counter(table) ". ";
  color: var(--primary);
}
table.data {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}
table.data thead { display: table-header-group; }
table.data tfoot { display: table-footer-group; }
table.data th {
  text-align: left;
  background: var(--surface-alt);
  border-bottom: 1.5px solid var(--rule);
  padding: 1.5mm 2mm;
  font-weight: 650;
  font-size: var(--fs-micro);
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--ink-2);
}
table.data td { padding: 1.3mm 2mm; border-bottom: 1px solid var(--rule-hair); vertical-align: top; }
table.data tr { break-inside: avoid; page-break-inside: avoid; }
table.data tbody tr:nth-child(even) td { background: #fbfbfa; }
table.data .num { text-align: right; }
table.data .ctr { text-align: center; }
.table-note { font-size: var(--fs-micro); color: var(--ink-2); margin: 1mm 0 0; }
.table-empty {
  font-size: var(--fs-small);
  color: var(--ink-2);
  border: 1px dashed var(--rule);
  padding: 2mm 2.5mm;
  background: var(--surface-alt);
}

/* ── Ficha de indicador ────────────────────────────────────────────────────── */

.indicator {
  border: 1px solid var(--rule-hair);
  padding: 2.4mm 2.8mm;
  break-inside: avoid;
  page-break-inside: avoid;
  background: var(--surface);
}
.indicator__label { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); }
.indicator__value { font-size: 15pt; font-weight: 700; line-height: 1.1; margin: .6mm 0; }
.indicator__unit { font-size: 9pt; font-weight: 500; color: var(--ink-2); margin-left: 1mm; }
.indicator__formula {
  font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
  font-size: var(--fs-micro);
  background: var(--surface-alt);
  border-left: 2px solid var(--rule);
  padding: 1mm 1.6mm;
  margin: 1mm 0;
  white-space: pre-wrap;
  word-break: break-word;
}
.indicator__explain { font-size: var(--fs-micro); color: var(--ink-2); margin: .8mm 0 0; }
.indicator__src { font-size: var(--fs-micro); color: var(--ink-muted); margin-top: .8mm; }

/* ── Semáforo (color + icono + texto; legible en blanco y negro) ───────────── */

.light { display: inline-flex; align-items: center; gap: 1.6mm; font-weight: 650; }
.light__dot {
  width: 4.2mm; height: 4.2mm;
  border-radius: 50%;
  border: 1.2px solid var(--ink);
  display: inline-block;
  flex: none;
}
.light__icon { font-weight: 800; font-size: 9pt; line-height: 1; }
.light--ok .light__dot { background: var(--ok); }
.light--caution .light__dot {
  background: var(--caution);
  background-image: repeating-linear-gradient(45deg, rgba(11,11,11,.42) 0 1px, transparent 1px 3px);
}
.light--blocker .light__dot {
  background: var(--blocker);
  background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.75) 0 1px, transparent 1px 2.4px);
}
.light--unknown .light__dot {
  background: var(--surface);
  background-image: repeating-linear-gradient(90deg, var(--unknown) 0 1px, transparent 1px 3px);
}

.verdict {
  border: 2px solid var(--ink);
  padding: 3mm 3.4mm;
  margin: 0 0 3mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.verdict__head { display: flex; align-items: center; justify-content: space-between; gap: 3mm; }
.verdict__use { font-size: 11pt; font-weight: 700; }
.verdict__score { font-size: 17pt; font-weight: 750; font-variant-numeric: tabular-nums; }
.verdict__help { font-size: var(--fs-small); color: var(--ink-2); margin: 1.4mm 0 0; }
.verdict__factors { margin: 2.4mm 0 0; border-top: 1px solid var(--rule-hair); }
.factor {
  display: grid;
  /* La primera columna guarda el semáforo (punto + icono): necesita ancho para los dos. */
  grid-template-columns: 11mm 1fr 20mm 14mm;
  gap: 2mm;
  align-items: baseline;
  padding: 1.4mm 0;
  border-bottom: 1px solid var(--rule-hair);
  break-inside: avoid;
  page-break-inside: avoid;
}
.factor__name { font-weight: 600; font-size: var(--fs-small); }
.factor__why { grid-column: 2 / -1; font-size: var(--fs-micro); color: var(--ink-2); margin-top: .4mm; }
.factor__raw { font-size: var(--fs-small); text-align: right; font-variant-numeric: tabular-nums; }
.factor__score { font-size: var(--fs-small); text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }

/* ── Figuras: mapas y gráficos ─────────────────────────────────────────────── */

figure.fig { margin: 0 0 3.5mm; break-inside: avoid; page-break-inside: avoid; }
figure.fig img, figure.fig svg { width: 100%; height: auto; display: block; border: 1px solid var(--rule-hair); }
figure.fig figcaption { font-size: var(--fs-micro); color: var(--ink-2); margin-top: 1.1mm; }
figure.fig figcaption::before {
  counter-increment: figure;
  content: "Figura " counter(figure) ". ";
  color: var(--primary);
}
.fig__attr { font-size: var(--fs-micro); color: var(--ink-muted); margin-top: .5mm; display: block; }
.fig__nobasemap {
  display: inline-block;
  border: 1.2px solid var(--ink);
  background: var(--caution);
  background-image: repeating-linear-gradient(45deg, rgba(11,11,11,.3) 0 1px, transparent 1px 3px);
  padding: .4mm 1.4mm;
  font-size: var(--fs-micro);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-top: .8mm;
}

/* ── Bloques de fuentes y legal ────────────────────────────────────────────── */

.sources { break-inside: auto; }
.sources table.data td { font-size: var(--fs-micro); }
.sources__attr {
  border: 1.5px solid var(--primary);
  padding: 2mm 2.4mm;
  margin: 0 0 3mm;
  font-size: var(--fs-small);
  font-weight: 600;
  break-inside: avoid;
}
.legal { margin-top: 4mm; }
.legal ol { padding-left: 4.4mm; }
.legal li {
  font-size: var(--fs-small);
  margin-bottom: 1.6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.warn {
  border: 1.5px solid var(--ink);
  border-left-width: 4px;
  background: var(--surface-alt);
  padding: 2mm 2.6mm;
  margin: 0 0 3mm;
  font-size: var(--fs-small);
  break-inside: avoid;
  page-break-inside: avoid;
}
.warn__title { font-weight: 700; display: block; margin-bottom: .6mm; }
.warn--cadastral { border-left-color: var(--caution); }
.warn--coverage { border-left-color: var(--serious); }

/* ── QR de verificación ───────────────────────────────────────────────────── */

.qr {
  display: grid;
  grid-template-columns: 30mm 1fr;
  gap: 4mm;
  align-items: center;
  border: 1px solid var(--rule);
  padding: 3mm;
  margin: 4mm 0 0;
  break-inside: avoid;
  page-break-inside: avoid;
}
.qr__code svg { width: 30mm; height: 30mm; display: block; }
.qr__text { font-size: var(--fs-micro); color: var(--ink-2); }
.qr__url { font-family: Consolas, "Courier New", monospace; font-size: var(--fs-micro); word-break: break-all; }

/* ── Anexos ───────────────────────────────────────────────────────────────── */

.annex { break-before: page; page-break-before: always; }
.annex__desc { font-size: var(--fs-small); color: var(--ink-2); margin-bottom: 2mm; }
.annex table.data { font-size: var(--fs-micro); }
`.trim();
}

/**
 * Hoja de estilos específica del modo impresión de Playwright: oculta el encabezado y pie
 * de la vista HTML porque los inyecta el propio PDF, y evita cualquier animación.
 */
export const PRINT_ONLY_STYLES = `
@media print {
  .running-head, .running-foot { display: none; }
  * { animation: none !important; transition: none !important; }
}
`.trim();
