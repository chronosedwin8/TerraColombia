import { formatNumber, type FactorScore } from '@terracolombia/shared';
import type { ReportImageAsset } from './types.js';

/**
 * Gráficos como SVG generado en Node: sin navegador, sin dependencias de dibujo.
 *
 * Decisiones de diseño (documentadas porque condicionan la legibilidad del informe):
 *
 * 1. **Paleta validada.** Los ocho tonos categóricos se usan siempre en el mismo orden,
 *    nunca en ciclo. Validados contra fondo blanco: banda de luminosidad, piso de croma,
 *    separación con visión de color deficiente (ΔE ≥ 8 en OKLab ×100 entre adyacentes) y
 *    piso de visión normal (ΔE ≥ 19,6). Tres de ellos quedan por debajo de 3:1 de contraste
 *    contra el papel, así que **siempre** llevan etiqueta directa visible: el color nunca es
 *    el único canal.
 * 2. **Legible en blanco y negro.** Cada serie lleva además una trama a 45° o 135°
 *    (nunca horizontal ni vertical, que se confunden con rejilla y barras) y una etiqueta
 *    directa. Si el informe se imprime en láser monocromo, la identidad se sigue leyendo.
 * 3. **Un solo eje.** Nunca dos escalas verticales en el mismo gráfico.
 * 4. **Sin relleno decorativo.** Rejilla fina de un paso sobre el papel, marcas delgadas,
 *    extremo de barra redondeado 4 px y base cuadrada sobre la línea de base.
 */

export const CHART_PALETTE = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 naranja
  '#1baf7a', // 3 aguamarina
  '#eda100', // 4 amarillo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
  '#4a3aa7', // 7 violeta
  '#e34948', // 8 rojo
] as const;

/** Estados. Reservados: nunca se usan como "serie 9". Siempre con icono y texto al lado. */
export const STATUS_COLORS = {
  ok: '#0ca30c',
  caution: '#fab219',
  serious: '#ec835a',
  blocker: '#d03b3b',
  unknown: '#898781',
} as const;

const INK = '#0b0b0b';
const INK_2 = '#52514e';
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const SURFACE = '#ffffff';

const FONT = "'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif";

export interface ChartResult {
  svg: string;
  /** `data:image/svg+xml;base64,…` listo para un `<img>`. */
  dataUri: string;
  width: number;
  height: number;
}

export interface ChartDatum {
  label: string;
  value: number | null;
  /** Índice de color forzado (0–7). Por omisión, el orden de aparición. */
  colorIndex?: number;
}

export interface ChartSeries {
  label: string;
  points: Array<{ x: string | number; y: number | null }>;
  colorIndex?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function color(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0];
}

/**
 * Trama de respaldo para impresión monocroma. Alterna 45° y 135°, con densidad creciente,
 * de modo que en escala de grises cada serie sigue siendo distinguible.
 */
function texturePattern(index: number, fill: string): string {
  const id = `tx${index}`;
  const angle = index % 2 === 0 ? 45 : 135;
  const gap = 4 + (index % 4);
  const stroke = index % 3 === 2 ? 'rgba(255,255,255,0.75)' : 'rgba(11,11,11,0.38)';
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap * 2}" height="${gap * 2}" patternTransform="rotate(${angle})">
  <rect width="${gap * 2}" height="${gap * 2}" fill="${fill}"/>
  <line x1="0" y1="0" x2="0" y2="${gap * 2}" stroke="${stroke}" stroke-width="1.6"/>
</pattern>`;
}

function defs(count: number): string {
  const patterns: string[] = [];
  for (let i = 0; i < count; i += 1) patterns.push(texturePattern(i, color(i)));
  return `<defs>${patterns.join('')}</defs>`;
}

function svgShell(width: number, height: number, title: string, body: string, count: number): ChartResult {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}" font-family="${FONT}">
<title>${escapeXml(title)}</title>
${defs(count)}
<rect width="${width}" height="${height}" fill="${SURFACE}"/>
${body}
</svg>`;
  return {
    svg,
    dataUri: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
    width,
    height,
  };
}

function chartTitle(title: string, subtitle: string | null, width: number): string {
  const parts = [
    `<text x="0" y="16" font-size="13" font-weight="650" fill="${INK}">${escapeXml(title)}</text>`,
  ];
  if (subtitle) {
    parts.push(
      `<text x="0" y="32" font-size="10.5" fill="${INK_2}">${escapeXml(subtitle)}</text>`,
    );
  }
  void width;
  return parts.join('');
}

/** Leyenda con marca de color + trama y texto en tinta (nunca texto coloreado). */
function legend(items: Array<{ label: string; index: number }>, x: number, y: number): string {
  if (items.length < 2) return '';
  const parts: string[] = [];
  let cx = x;
  for (const it of items) {
    parts.push(
      `<rect x="${cx}" y="${y - 8}" width="10" height="10" rx="2" fill="url(#tx${it.index})" stroke="${INK}" stroke-width="0.6"/>`,
      `<text x="${cx + 14}" y="${y}" font-size="10" fill="${INK_2}">${escapeXml(it.label)}</text>`,
    );
    cx += 14 + it.label.length * 5.6 + 16;
  }
  return parts.join('');
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * base;
}

// ─── Barras horizontales ──────────────────────────────────────────────────────

export interface BarChartOptions {
  title: string;
  subtitle?: string | null;
  data: ChartDatum[];
  /** Unidad para las etiquetas directas ("predios", "m²", "%"). */
  unit?: string | null;
  decimals?: number;
  width?: number;
  /** Cuántas barras se muestran como máximo; el resto se agrupa en "Otros". */
  maxBars?: number;
}

export function barChart(opts: BarChartOptions): ChartResult {
  const width = opts.width ?? 680;
  const maxBars = opts.maxBars ?? 8;
  const decimals = opts.decimals ?? 0;

  let data = opts.data.filter((d) => d.value !== null);
  if (data.length > maxBars) {
    const head = data.slice(0, maxBars - 1);
    const rest = data.slice(maxBars - 1);
    const sum = rest.reduce((a, d) => a + (d.value ?? 0), 0);
    data = [...head, { label: `Otros (${rest.length})`, value: sum }];
  }

  const top = opts.subtitle ? 46 : 30;
  const labelW = 170;
  const rowH = 26;
  const barH = 16;
  const plotW = width - labelW - 90;
  const height = top + data.length * rowH + 34;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value ?? 0)));

  const body: string[] = [chartTitle(opts.title, opts.subtitle ?? null, width)];

  // Rejilla vertical recesiva y ticks del eje.
  for (let t = 0; t <= 4; t += 1) {
    const x = labelW + (plotW * t) / 4;
    body.push(
      `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + data.length * rowH}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${x}" y="${top + data.length * rowH + 14}" font-size="9" fill="${INK_MUTED}" text-anchor="middle">${escapeXml(formatNumber((max * t) / 4, decimals))}</text>`,
    );
  }

  data.forEach((d, i) => {
    const idx = d.colorIndex ?? i;
    const y = top + i * rowH + (rowH - barH) / 2;
    const w = Math.max(1.5, ((d.value ?? 0) / max) * plotW);
    // Extremo redondeado 4 px, base cuadrada sobre la línea de base.
    const r = Math.min(4, w);
    const path = `M ${labelW} ${y} H ${labelW + w - r} a ${r} ${r} 0 0 1 ${r} ${r} V ${y + barH - r} a ${r} ${r} 0 0 1 ${-r} ${r} H ${labelW} Z`;
    body.push(
      `<text x="${labelW - 8}" y="${y + barH - 4}" font-size="10" fill="${INK_2}" text-anchor="end">${escapeXml(truncate(d.label, 30))}</text>`,
      `<path d="${path}" fill="url(#tx${idx % CHART_PALETTE.length})" stroke="${INK}" stroke-width="0.5"/>`,
      // Etiqueta directa obligatoria: tres tonos de la paleta no alcanzan 3:1 sobre papel.
      `<text x="${labelW + w + 8}" y="${y + barH - 4}" font-size="10" fill="${INK}" font-weight="600">${escapeXml(formatNumber(d.value ?? 0, decimals))}${opts.unit ? ` ${escapeXml(opts.unit)}` : ''}</text>`,
    );
  });

  body.push(
    `<line x1="${labelW}" y1="${top}" x2="${labelW}" y2="${top + data.length * rowH}" stroke="${AXIS}" stroke-width="1"/>`,
  );

  return svgShell(width, height, opts.title, body.join('\n'), CHART_PALETTE.length);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

// ─── Líneas ───────────────────────────────────────────────────────────────────

export interface LineChartOptions {
  title: string;
  subtitle?: string | null;
  series: ChartSeries[];
  /** Etiquetas del eje X, en orden. */
  categories: Array<string | number>;
  unit?: string | null;
  decimals?: number;
  width?: number;
  height?: number;
}

export function lineChart(opts: LineChartOptions): ChartResult {
  const width = opts.width ?? 680;
  const height = opts.height ?? 300;
  const top = opts.subtitle ? 50 : 36;
  const left = 56;
  const right = 90;
  const bottom = opts.series.length > 1 ? 46 : 30;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const values = opts.series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(1, ...values));
  const n = Math.max(1, opts.categories.length - 1);
  const decimals = opts.decimals ?? 0;

  const xAt = (i: number) => left + (plotW * i) / n;
  const yAt = (v: number) => top + plotH - (v / max) * plotH;

  const body: string[] = [chartTitle(opts.title, opts.subtitle ?? null, width)];

  for (let t = 0; t <= 4; t += 1) {
    const y = top + plotH - (plotH * t) / 4;
    body.push(
      `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${left - 8}" y="${y + 3}" font-size="9" fill="${INK_MUTED}" text-anchor="end">${escapeXml(formatNumber((max * t) / 4, decimals))}</text>`,
    );
  }

  opts.categories.forEach((c, i) => {
    if (opts.categories.length > 10 && i % 2 === 1) return;
    body.push(
      `<text x="${xAt(i)}" y="${top + plotH + 14}" font-size="9" fill="${INK_MUTED}" text-anchor="middle">${escapeXml(String(c))}</text>`,
    );
  });

  opts.series.forEach((s, si) => {
    const idx = s.colorIndex ?? si;
    const c = color(idx);
    // Trazo discontinuo distinto por serie: segundo canal de identidad en monocromo.
    const dash = si === 0 ? '' : ` stroke-dasharray="${4 + si * 2} ${2 + si}"`;
    const pts = s.points
      .map((p, i) => (p.y === null ? null : `${xAt(i)},${yAt(p.y)}`))
      .filter((v): v is string => v !== null);
    if (pts.length === 0) return;
    body.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
    );
    const last = s.points.at(-1);
    const lastIdx = s.points.length - 1;
    if (last && last.y !== null) {
      body.push(
        `<circle cx="${xAt(lastIdx)}" cy="${yAt(last.y)}" r="4.5" fill="${c}" stroke="${SURFACE}" stroke-width="2"/>`,
        `<text x="${xAt(lastIdx) + 10}" y="${yAt(last.y) + 3.5}" font-size="10" font-weight="600" fill="${INK}">${escapeXml(formatNumber(last.y, decimals))}${opts.unit ? ` ${escapeXml(opts.unit)}` : ''}</text>`,
      );
    }
  });

  body.push(
    `<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="${AXIS}" stroke-width="1"/>`,
    legend(
      opts.series.map((s, i) => ({ label: s.label, index: s.colorIndex ?? i })),
      left,
      height - 12,
    ),
  );

  return svgShell(width, height, opts.title, body.join('\n'), CHART_PALETTE.length);
}

// ─── Dona ─────────────────────────────────────────────────────────────────────

export interface DonutChartOptions {
  title: string;
  subtitle?: string | null;
  data: ChartDatum[];
  /** Texto grande en el centro (total). */
  centerLabel?: string | null;
  centerCaption?: string | null;
  width?: number;
  maxSlices?: number;
}

export function donutChart(opts: DonutChartOptions): ChartResult {
  const width = opts.width ?? 680;
  const maxSlices = opts.maxSlices ?? 6;
  let data = opts.data.filter((d) => (d.value ?? 0) > 0);
  if (data.length > maxSlices) {
    const head = data.slice(0, maxSlices - 1);
    const rest = data.slice(maxSlices - 1);
    data = [...head, { label: `Otros (${rest.length})`, value: rest.reduce((a, d) => a + (d.value ?? 0), 0) }];
  }
  const total = data.reduce((a, d) => a + (d.value ?? 0), 0);
  const top = opts.subtitle ? 50 : 36;
  const size = 190;
  const height = top + size + 24;
  const cx = size / 2 + 14;
  const cy = top + size / 2;
  const rOuter = size / 2 - 6;
  const rInner = rOuter * 0.58;

  const body: string[] = [chartTitle(opts.title, opts.subtitle ?? null, width)];

  if (total <= 0) {
    body.push(
      `<text x="0" y="${top + 30}" font-size="11" fill="${INK_MUTED}">No hay valores positivos para graficar.</text>`,
    );
    return svgShell(width, top + 50, opts.title, body.join('\n'), CHART_PALETTE.length);
  }

  let angle = -Math.PI / 2;
  data.forEach((d, i) => {
    const idx = d.colorIndex ?? i;
    const frac = (d.value ?? 0) / total;
    // Hueco de 2 px en color de superficie entre porciones: separa sin dibujar bordes de dato.
    const gap = 0.012;
    const a0 = angle + gap / 2;
    const a1 = angle + frac * Math.PI * 2 - gap / 2;
    angle += frac * Math.PI * 2;
    if (a1 <= a0) return;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    const path = `M ${p(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p(rOuter, a1)} L ${p(rInner, a1)} A ${rInner} ${rInner} 0 ${large} 0 ${p(rInner, a0)} Z`;
    body.push(
      `<path d="${path}" fill="url(#tx${idx % CHART_PALETTE.length})" stroke="${SURFACE}" stroke-width="2"/>`,
    );
  });

  if (opts.centerLabel) {
    body.push(
      `<text x="${cx}" y="${cy + 2}" font-size="19" font-weight="700" fill="${INK}" text-anchor="middle">${escapeXml(opts.centerLabel)}</text>`,
    );
    if (opts.centerCaption) {
      body.push(
        `<text x="${cx}" y="${cy + 18}" font-size="9.5" fill="${INK_2}" text-anchor="middle">${escapeXml(opts.centerCaption)}</text>`,
      );
    }
  }

  // Leyenda vertical con valor y porcentaje: identidad por marca + texto, nunca por color solo.
  const lx = size + 44;
  data.forEach((d, i) => {
    const idx = d.colorIndex ?? i;
    const ly = top + 16 + i * 22;
    const pct = ((d.value ?? 0) / total) * 100;
    body.push(
      `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="url(#tx${idx % CHART_PALETTE.length})" stroke="${INK}" stroke-width="0.6"/>`,
      `<text x="${lx + 17}" y="${ly}" font-size="10.5" fill="${INK}">${escapeXml(truncate(d.label, 40))}</text>`,
      `<text x="${width - 6}" y="${ly}" font-size="10.5" font-weight="600" fill="${INK}" text-anchor="end">${escapeXml(formatNumber(d.value ?? 0))} · ${escapeXml(formatNumber(pct, 1))} %</text>`,
    );
  });

  return svgShell(width, Math.max(height, top + 16 + data.length * 22 + 16), opts.title, body.join('\n'), CHART_PALETTE.length);
}

// ─── Barra de factores del semáforo ───────────────────────────────────────────

export interface FactorChartOptions {
  title?: string;
  subtitle?: string | null;
  factors: readonly FactorScore[];
  width?: number;
}

/**
 * Desglose por factor del semáforo: puntaje 0–100 por factor, con el color del estado
 * (`ok` / `caution` / `blocker` / `unknown`), un icono y el texto del estado. El color nunca
 * carga solo el significado. El ancho de cada barra es el puntaje; el peso va como texto.
 */
export function factorBarChart(opts: FactorChartOptions): ChartResult {
  const width = opts.width ?? 680;
  const title = opts.title ?? 'Desglose por factor';
  const factors = opts.factors;
  const top = opts.subtitle ? 50 : 34;

  // El nombre del factor y su estado van en dos líneas de la columna izquierda, y el puntaje
  // en una columna fija a la derecha del gráfico. Así la etiqueta directa nunca se solapa con
  // el texto de estado, por larga que sea la barra.
  const labelW = 210;
  const scoreW = 62;
  const rowH = 32;
  const barH = 13;
  const plotW = width - labelW - scoreW - 8;
  const height = top + Math.max(1, factors.length) * rowH + 30;

  const body: string[] = [chartTitle(title, opts.subtitle ?? null, width)];

  if (factors.length === 0) {
    body.push(
      `<text x="0" y="${top + 20}" font-size="11" fill="${INK_MUTED}">Este análisis no trae factores: faltan datos obligatorios para la zona.</text>`,
    );
    return svgShell(width, top + 40, title, body.join('\n'), 4);
  }

  for (let t = 0; t <= 4; t += 1) {
    const x = labelW + (plotW * t) / 4;
    body.push(
      `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + factors.length * rowH}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${x}" y="${top + factors.length * rowH + 14}" font-size="9" fill="${INK_MUTED}" text-anchor="middle">${t * 25}</text>`,
    );
  }

  const ICON: Record<FactorScore['flag'], string> = {
    ok: '✔',
    caution: '⚠',
    blocker: '✖',
    unknown: '?',
  };
  const STATE_LABEL: Record<FactorScore['flag'], string> = {
    ok: 'sin restricción',
    caution: 'revisar',
    blocker: 'restricción fuerte',
    unknown: 'sin datos',
  };
  const HATCH: Record<FactorScore['flag'], number> = { ok: 0, caution: 1, blocker: 2, unknown: 3 };

  factors.forEach((f, i) => {
    const rowTop = top + i * rowH;
    const y = rowTop + (rowH - barH) / 2 - 3;
    const score = f.score ?? 0;
    const w = Math.max(1.5, (score / 100) * plotW);
    const r = Math.min(4, w);
    const path = `M ${labelW} ${y} H ${labelW + w - r} a ${r} ${r} 0 0 1 ${r} ${r} V ${y + barH - r} a ${r} ${r} 0 0 1 ${-r} ${r} H ${labelW} Z`;
    const fill = f.score === null ? STATUS_COLORS.unknown : STATUS_COLORS[f.flag];
    const hatchAngle = HATCH[f.flag] % 2 === 0 ? 45 : 135;
    const patternId = `fx${i}`;

    body.push(
      `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(${hatchAngle})">
        <rect width="8" height="8" fill="${fill}"/>
        <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(11,11,11,0.34)" stroke-width="${1 + HATCH[f.flag] * 0.4}"/>
      </pattern></defs>`,
      // Columna izquierda: nombre del factor y, debajo, estado y peso.
      `<text x="0" y="${rowTop + 12}" font-size="10" fill="${INK}">${escapeXml(truncate(f.label, 32))}</text>`,
      `<text x="0" y="${rowTop + 24}" font-size="8.5" fill="${INK_2}">${escapeXml(ICON[f.flag])} ${escapeXml(STATE_LABEL[f.flag])} · peso ${escapeXml(formatNumber(f.weight * 100))} %</text>`,
      // Barra.
      `<path d="${path}" fill="url(#${patternId})" stroke="${INK}" stroke-width="0.5"/>`,
      // Columna derecha fija: etiqueta directa del puntaje.
      `<text x="${labelW + plotW + 8}" y="${rowTop + 18}" font-size="10" font-weight="600" fill="${INK}">${f.score === null ? 'sin datos' : `${escapeXml(formatNumber(f.score))}/100`}</text>`,
    );
  });

  body.push(
    `<line x1="${labelW}" y1="${top}" x2="${labelW}" y2="${top + factors.length * rowH}" stroke="${AXIS}" stroke-width="1"/>`,
  );

  return svgShell(width, height, title, body.join('\n'), 4);
}

// ─── Conversión a recurso de informe ──────────────────────────────────────────

export function toImageAsset(
  chart: ChartResult,
  opts: { alt: string; caption?: string | null; attribution?: string | null },
): ReportImageAsset {
  return {
    src: chart.dataUri,
    alt: opts.alt,
    caption: opts.caption ?? null,
    attribution: opts.attribution ?? null,
    widthPx: chart.width,
    heightPx: chart.height,
  };
}
