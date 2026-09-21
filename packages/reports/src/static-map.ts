/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { getLogger, type BBox, type GeoJsonFeatureCollection, type GeoJsonGeometry } from '@terracolombia/shared';
import { COLOMBIA_BBOX } from '@terracolombia/geo';
import { withPage } from './pdf.js';
import type { ReportImageAsset } from './types.js';

/**
 * Mapa estático para los informes. Dos caminos, en este orden:
 *
 * (a) **MapLibre GL en modo headless** dentro de una página de Playwright: se inyecta el
 *     bundle de `maplibre-gl` desde `node_modules`, se carga el estilo configurado, se añade
 *     el GeoJSON de resaltado y se espera el evento `idle` del mapa antes de capturar el PNG.
 *
 * (b) **Respaldo SVG propio**, sin red y sin navegador: proyecta el GeoJSON en Web Mercator,
 *     dibuja una escala gráfica y un recuadro de contexto con la extensión de Colombia, y
 *     marca visiblemente **"sin mapa base"**. Es el camino honesto cuando no hay teselas:
 *     el informe nunca finge tener cartografía de fondo que no tiene.
 *
 * El respaldo se usa si: no hay estilo configurado, falla el navegador, falla la red, o el
 * mapa no llega a `idle` dentro del tiempo límite.
 */

const log = getLogger({ mod: 'reports/static-map' });

export interface StaticMapOptions {
  width: number;
  height: number;
  /** Geometría o colección a resaltar. */
  highlight: GeoJsonGeometry | GeoJsonFeatureCollection | null;
  /** Extensión a encuadrar. Si falta, se calcula del `highlight`. */
  bbox?: BBox | null;
  /** Centro y zoom alternativos al bbox. */
  center?: [number, number] | null;
  zoom?: number | null;
  /** Margen alrededor del contenido, en píxeles. */
  paddingPx?: number;
  /** URL del estilo MapLibre. Por omisión, `MAPLIBRE_STYLE_URL`. */
  styleUrl?: string | null;
  /** Atribución que debe quedar visible junto al mapa. */
  attribution?: string | null;
  /** Título accesible de la figura. */
  alt: string;
  caption?: string | null;
  /** Dibuja el recuadro de contexto con la ubicación dentro de Colombia. */
  inset?: boolean;
  /** Milisegundos máximos de espera del evento `idle`. */
  timeoutMs?: number;
  /** Fuerza el respaldo SVG (tests, entornos sin red). */
  forceFallback?: boolean;
}

export interface StaticMapResult {
  /** `data:` URI (PNG del camino MapLibre, SVG del respaldo). */
  src: string;
  withoutBasemap: boolean;
  attribution: string;
  width: number;
  height: number;
}

const HIGHLIGHT_COLOR = '#eb6834';
const HIGHLIGHT_FILL = 'rgba(235, 104, 52, 0.28)';
const INK = '#0b0b0b';

// ─── Utilidades geométricas ───────────────────────────────────────────────────

function toFeatureCollection(
  input: GeoJsonGeometry | GeoJsonFeatureCollection | null,
): GeoJsonFeatureCollection {
  if (!input) return { type: 'FeatureCollection', features: [] };
  if ((input as GeoJsonFeatureCollection).type === 'FeatureCollection') {
    return input as GeoJsonFeatureCollection;
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: input as GeoJsonGeometry, properties: {} }],
  };
}

function* coords(geom: GeoJsonGeometry): Generator<[number, number]> {
  switch (geom.type) {
    case 'Point':
      yield [geom.coordinates[0] as number, geom.coordinates[1] as number];
      return;
    case 'MultiPoint':
    case 'LineString':
      for (const c of geom.coordinates) yield [c[0] as number, c[1] as number];
      return;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geom.coordinates) for (const c of ring) yield [c[0] as number, c[1] as number];
      return;
    case 'MultiPolygon':
      for (const poly of geom.coordinates)
        for (const ring of poly) for (const c of ring) yield [c[0] as number, c[1] as number];
      return;
    case 'GeometryCollection':
      for (const g of geom.geometries) yield* coords(g);
      return;
  }
}

export function bboxOf(fc: GeoJsonFeatureCollection): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of fc.features) {
    if (!f.geometry) continue;
    for (const [x, y] of coords(f.geometry)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

/** Proyección Web Mercator normalizada a [0,1]. */
function mercator(lng: number, lat: number): [number, number] {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lng + 180) / 360;
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return [x, y];
}

function padBBox(b: BBox, ratio: number): BBox {
  const dx = Math.max((b[2] - b[0]) * ratio, 0.0008);
  const dy = Math.max((b[3] - b[1]) * ratio, 0.0008);
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

// ─── Camino (a): MapLibre en headless ─────────────────────────────────────────

const require_ = createRequire(import.meta.url);

async function maplibreSources(): Promise<{ js: string; css: string } | null> {
  try {
    const jsPath = require_.resolve('maplibre-gl/dist/maplibre-gl.js');
    const cssPath = require_.resolve('maplibre-gl/dist/maplibre-gl.css');
    const [js, css] = await Promise.all([
      readFile(jsPath, 'utf8'),
      readFile(cssPath, 'utf8').catch(() => ''),
    ]);
    return { js, css };
  } catch (e) {
    log.warn({ err: e }, 'No se pudo cargar maplibre-gl desde node_modules');
    return null;
  }
}

function maplibrePageHtml(css: string, width: number, height: number): string {
  return `<!doctype html><html lang="es-CO"><head><meta charset="utf-8">
<style>${css}
html,body{margin:0;padding:0;background:#fff}
#map{width:${width}px;height:${height}px}
.maplibregl-ctrl-attrib,.maplibregl-ctrl-logo{display:none!important}
</style></head><body><div id="map"></div></body></html>`;
}

/**
 * Script que corre dentro de la página. Devuelve `true` cuando el mapa emitió `idle`
 * (todas las teselas y capas cargadas) o `false` si se agotó el tiempo.
 */
const MAP_SCRIPT = `
(async ({ styleUrl, geojson, bbox, center, zoom, padding, timeoutMs }) => {
  const maplibregl = window.maplibregl;
  const map = new maplibregl.Map({
    container: 'map',
    style: styleUrl,
    center: center || [-74.1, 4.6],
    zoom: zoom || 12,
    attributionControl: false,
    interactive: false,
    fadeDuration: 0,
    preserveDrawingBuffer: true,
  });

  const loaded = await new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    map.on('load', () => done(true));
    map.on('error', (e) => { window.__mapError = String((e && e.error && e.error.message) || e); done(false); });
    setTimeout(() => done(false), timeoutMs);
  });
  if (!loaded) return false;

  if (geojson && geojson.features && geojson.features.length > 0) {
    map.addSource('highlight', { type: 'geojson', data: geojson });
    map.addLayer({ id: 'highlight-fill', type: 'fill', source: 'highlight',
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: { 'fill-color': '${HIGHLIGHT_COLOR}', 'fill-opacity': 0.28 } });
    map.addLayer({ id: 'highlight-line', type: 'line', source: 'highlight',
      paint: { 'line-color': '${HIGHLIGHT_COLOR}', 'line-width': 2.4 } });
    map.addLayer({ id: 'highlight-point', type: 'circle', source: 'highlight',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 6, 'circle-color': '${HIGHLIGHT_COLOR}',
               'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  }

  if (bbox) {
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: padding, duration: 0, maxZoom: 18 });
  }

  await new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(undefined); } };
    if (map.isStyleLoaded() && map.areTilesLoaded && map.areTilesLoaded()) { map.once('idle', done); }
    else { map.once('idle', done); }
    setTimeout(done, timeoutMs);
  });
  return true;
})
`;

async function renderWithMapLibre(opts: StaticMapOptions, bbox: BBox | null): Promise<StaticMapResult | null> {
  const styleUrl = opts.styleUrl ?? process.env.MAPLIBRE_STYLE_URL ?? '';
  if (!styleUrl) {
    log.info({}, 'MAPLIBRE_STYLE_URL sin definir: el informe usará el mapa de respaldo sin mapa base');
    return null;
  }
  const sources = await maplibreSources();
  if (!sources) return null;

  const timeoutMs = opts.timeoutMs ?? 20_000;
  try {
    return await withPage(
      async (page: any) => {
        await page.setContent(maplibrePageHtml(sources.css, opts.width, opts.height), {
          waitUntil: 'load',
        });
        await page.addScriptTag({ content: sources.js });
        const ok = (await page.evaluate(`(${MAP_SCRIPT})(${JSON.stringify({
          styleUrl,
          geojson: toFeatureCollection(opts.highlight),
          bbox,
          center: opts.center ?? null,
          zoom: opts.zoom ?? null,
          padding: opts.paddingPx ?? 28,
          timeoutMs,
        })})`)) as boolean;
        if (!ok) {
          const err = await page.evaluate('window.__mapError || null');
          log.warn({ err }, 'MapLibre no pudo cargar el estilo o las teselas; se usa el respaldo');
          return null;
        }
        const element = await page.$('#map');
        if (!element) return null;
        const png = (await element.screenshot({ type: 'png' })) as Buffer;
        return {
          src: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
          withoutBasemap: false,
          attribution:
            opts.attribution ??
            'Mapa base © OpenStreetMap (ODbL) · Resaltado: TerraColombia sobre datos del IGAC (CC BY-SA 4.0)',
          width: opts.width,
          height: opts.height,
        } satisfies StaticMapResult;
      },
      { width: opts.width, height: opts.height, timeoutMs },
    );
  } catch (e) {
    log.warn({ err: e }, 'Falló el render de MapLibre; se usa el mapa de respaldo');
    return null;
  }
}

// ─── Camino (b): respaldo SVG sin red ─────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;',
  );
}

/** Distancia aproximada en metros de un grado de longitud a esa latitud. */
function metersPerDegreeLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export function renderFallbackSvg(opts: StaticMapOptions, bboxIn: BBox | null): string {
  const { width, height } = opts;
  const fc = toFeatureCollection(opts.highlight);
  const bbox = bboxIn ?? bboxOf(fc) ?? COLOMBIA_BBOX;
  const padded = padBBox(bbox, 0.25);

  // Encaje isométrico en Web Mercator para que no se deforme.
  const [x0, y1] = mercator(padded[0], padded[1]);
  const [x1, y0] = mercator(padded[2], padded[3]);
  const spanX = Math.max(x1 - x0, 1e-9);
  const spanY = Math.max(y1 - y0, 1e-9);
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = (lng: number, lat: number): [number, number] => {
    const [mx, my] = mercator(lng, lat);
    return [offsetX + (mx - x0) * scale, offsetY + (my - y0) * scale];
  };

  const paths: string[] = [];
  const points: string[] = [];
  const ringPath = (ring: number[][]): string =>
    ring
      .map((c, i) => {
        const [px, py] = project(c[0] as number, c[1] as number);
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(' ');

  const draw = (geom: GeoJsonGeometry): void => {
    switch (geom.type) {
      case 'Polygon':
        paths.push(`<path d="${geom.coordinates.map(ringPath).join(' ')}Z" fill="${HIGHLIGHT_FILL}" stroke="${HIGHLIGHT_COLOR}" stroke-width="2" fill-rule="evenodd"/>`);
        break;
      case 'MultiPolygon':
        for (const poly of geom.coordinates) {
          paths.push(`<path d="${poly.map(ringPath).join(' ')}Z" fill="${HIGHLIGHT_FILL}" stroke="${HIGHLIGHT_COLOR}" stroke-width="2" fill-rule="evenodd"/>`);
        }
        break;
      case 'LineString':
        paths.push(`<path d="${ringPath(geom.coordinates)}" fill="none" stroke="${HIGHLIGHT_COLOR}" stroke-width="2.4"/>`);
        break;
      case 'MultiLineString':
        for (const line of geom.coordinates) {
          paths.push(`<path d="${ringPath(line)}" fill="none" stroke="${HIGHLIGHT_COLOR}" stroke-width="2.4"/>`);
        }
        break;
      case 'Point': {
        const [px, py] = project(geom.coordinates[0] as number, geom.coordinates[1] as number);
        points.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${HIGHLIGHT_COLOR}" stroke="#ffffff" stroke-width="2"/>`);
        break;
      }
      case 'MultiPoint':
        for (const c of geom.coordinates) {
          const [px, py] = project(c[0] as number, c[1] as number);
          points.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${HIGHLIGHT_COLOR}" stroke="#ffffff" stroke-width="2"/>`);
        }
        break;
      case 'GeometryCollection':
        for (const g of geom.geometries) draw(g);
        break;
    }
  };
  for (const f of fc.features) if (f.geometry) draw(f.geometry);

  // Escala gráfica: se calcula sobre la latitud central, así que es válida para el encuadre.
  const centerLat = (padded[1] + padded[3]) / 2;
  const metersPerPx = ((padded[2] - padded[0]) * metersPerDegreeLng(centerLat)) / (spanX * scale);
  const targetPx = Math.min(140, width * 0.28);
  const rawMeters = metersPerPx * targetPx;
  const niceMeters = niceDistance(rawMeters);
  const barPx = niceMeters / metersPerPx;
  const barLabel = niceMeters >= 1000 ? `${(niceMeters / 1000).toFixed(niceMeters % 1000 === 0 ? 0 : 1)} km` : `${Math.round(niceMeters)} m`;

  // Recuadro de contexto: extensión de Colombia y la posición aproximada del área.
  const inset: string[] = [];
  if (opts.inset !== false) {
    const iw = 82;
    const ih = 96;
    const ix = width - iw - 10;
    const iy = 10;
    const cLng = (bbox[0] + bbox[2]) / 2;
    const cLat = (bbox[1] + bbox[3]) / 2;
    const fx = (cLng - COLOMBIA_BBOX[0]) / (COLOMBIA_BBOX[2] - COLOMBIA_BBOX[0]);
    const fy = 1 - (cLat - COLOMBIA_BBOX[1]) / (COLOMBIA_BBOX[3] - COLOMBIA_BBOX[1]);
    const mx = ix + Math.max(0, Math.min(1, fx)) * iw;
    const my = iy + Math.max(0, Math.min(1, fy)) * ih;
    inset.push(
      `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`,
      `<rect x="${ix + 4}" y="${iy + 4}" width="${iw - 8}" height="${ih - 8}" fill="#f0efec" stroke="#c3c2b7" stroke-width="1" stroke-dasharray="3 2"/>`,
      `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4" fill="${HIGHLIGHT_COLOR}" stroke="#ffffff" stroke-width="1.5"/>`,
      `<text x="${ix + iw / 2}" y="${iy + ih - 6}" font-size="7" fill="#52514e" text-anchor="middle">Colombia (referencial)</text>`,
    );
  }

  const label = escapeXml(opts.alt);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}" font-family="'Segoe UI', system-ui, sans-serif">
<title>${label}</title>
<rect width="${width}" height="${height}" fill="#f9f9f7"/>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#c3c2b7" stroke-width="1"/>
${paths.join('\n')}
${points.join('\n')}
${inset.join('\n')}
<g>
  <rect x="10" y="${height - 32}" width="${(barPx + 16).toFixed(0)}" height="22" fill="rgba(255,255,255,0.88)" stroke="#c3c2b7" stroke-width="1"/>
  <line x1="18" y1="${height - 16}" x2="${(18 + barPx).toFixed(1)}" y2="${height - 16}" stroke="${INK}" stroke-width="2"/>
  <line x1="18" y1="${height - 20}" x2="18" y2="${height - 12}" stroke="${INK}" stroke-width="2"/>
  <line x1="${(18 + barPx).toFixed(1)}" y1="${height - 20}" x2="${(18 + barPx).toFixed(1)}" y2="${height - 12}" stroke="${INK}" stroke-width="2"/>
  <text x="18" y="${height - 22}" font-size="9" fill="${INK}">${barLabel}</text>
</g>
<g>
  <rect x="10" y="10" width="112" height="19" fill="#fab219" stroke="${INK}" stroke-width="1.2"/>
  <text x="66" y="23.5" font-size="10" font-weight="700" fill="${INK}" text-anchor="middle">SIN MAPA BASE</text>
</g>
<text x="10" y="${height - 40}" font-size="8" fill="#52514e">Geometría en EPSG:4326 · proyección Web Mercator · sin cartografía de fondo</text>
</svg>`;
}

function niceDistance(meters: number): number {
  const candidates = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000];
  for (const c of candidates) if (meters <= c) return c;
  return 200_000;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function renderStaticMap(opts: StaticMapOptions): Promise<StaticMapResult> {
  const fc = toFeatureCollection(opts.highlight);
  const bbox = opts.bbox ?? bboxOf(fc);

  if (!opts.forceFallback) {
    const viaMapLibre = await renderWithMapLibre(opts, bbox ? padBBox(bbox, 0.18) : null);
    if (viaMapLibre) return viaMapLibre;
  }

  const svg = renderFallbackSvg(opts, bbox);
  return {
    src: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
    withoutBasemap: true,
    attribution:
      opts.attribution ??
      'Sin mapa base: solo se dibuja la geometría consultada. Fuente de la geometría: IGAC, Base Catastral, CC BY-SA 4.0.',
    width: opts.width,
    height: opts.height,
  };
}

export function toMapAsset(result: StaticMapResult, opts: { alt: string; caption?: string | null }): ReportImageAsset {
  return {
    src: result.src,
    alt: opts.alt,
    caption: opts.caption ?? null,
    attribution: result.attribution,
    withoutBasemap: result.withoutBasemap,
    widthPx: result.width,
    heightPx: result.height,
  };
}
