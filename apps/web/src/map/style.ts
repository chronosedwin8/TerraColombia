/**
 * Estilo del mapa base.
 *
 * REGLA DURA (PLAN.md §3): **prohibido usar teselas de Google**. Además de lo que dice el
 * plan, los Términos de Google Maps Platform prohíben mostrar contenido de Google sobre un
 * mapa que no sea de Google, así que tampoco sirve para geocodificar sobre este mapa.
 *
 * Resolución del estilo, en este orden:
 *  1. `VITE_BASEMAP_STYLE_URL` apunta a un `style.json` propio → se usa tal cual.
 *  2. `VITE_BASEMAP_TILES_URL` apunta a nuestras teselas vectoriales → se construye el estilo
 *     mínimo `buildProtomapsStyle()` definido aquí abajo, con el esquema de capas de Protomaps.
 *  3. Por omisión, OpenFreeMap: teselas vectoriales de OpenStreetMap, gratuitas, sin clave y
 *     sin registro, con detalle real de Colombia. Es el camino que funciona sin montar
 *     infraestructura propia.
 *
 * Para producción conviene servir teselas propias (Protomaps/PMTiles) y no depender de un
 * tercero para el mapa base; el paso 1 o el 2 lo permiten cambiando una variable de entorno.
 */
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Mapa base por omisión: OpenFreeMap, teselas vectoriales de OpenStreetMap servidas sin
 * clave ni registro. Cumple la regla del plan (OSM, no Google) y tiene detalle de Colombia.
 */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Estilo de demostración de MapLibre. **No tiene detalle de Colombia**: solo dibuja los
 * contornos de países. Se conserva porque sirve de último recurso si OpenFreeMap no
 * responde, y cuando se usa, la interfaz lo dice en pantalla.
 */
export const MAPLIBRE_DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/** Atribución mínima obligatoria del mapa base. */
export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/** Atribución obligatoria de la capa catastral (CLAUDE.md, atribución obligatoria). */
export function igacAttribution(cutDate: string | null): string {
  const cut = cutDate ? cutDate.slice(0, 7) : 'sin corte declarado';
  return `Fuente: IGAC, Base Catastral, corte ${cut}, CC BY-SA 4.0`;
}

const OWN_STYLE_URL = (import.meta.env.VITE_BASEMAP_STYLE_URL ?? '').trim();
const OWN_TILES_URL = (import.meta.env.VITE_BASEMAP_TILES_URL ?? '').trim();

/** Vista inicial: Colombia continental completa. */
export const INITIAL_VIEW = {
  center: [-74.08, 4.63] as [number, number],
  zoom: 5,
  minZoom: 3.5,
  maxZoom: 19,
} as const;

/** Paleta sobria del mapa base: el color fuerte se reserva para los datos, no para el fondo. */
const PALETTE = {
  background: '#f3f1ec',
  earth: '#f6f4ef',
  water: '#c5d8e4',
  landuseGreen: '#e3ead9',
  buildings: '#e4ded2',
  roadMinor: '#ffffff',
  roadMajor: '#f7e7b9',
  roadCasing: '#ded8cc',
  boundary: '#a8a49b',
  label: '#55514a',
  labelHalo: '#ffffff',
} as const;

/**
 * Estilo mínimo y legible sobre el esquema de capas de Protomaps v3
 * (`earth`, `water`, `landuse`, `roads`, `buildings`, `boundaries`, `places`).
 * Se mantiene corto a propósito: el detalle cartográfico se afina en el servidor de estilos.
 */
export function buildProtomapsStyle(tilesUrl: string): StyleSpecification {
  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': PALETTE.background },
    },
    {
      id: 'earth',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'earth',
      paint: { 'fill-color': PALETTE.earth },
    },
    {
      id: 'landuse',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landuse',
      minzoom: 6,
      paint: { 'fill-color': PALETTE.landuseGreen, 'fill-opacity': 0.75 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'water',
      paint: { 'fill-color': PALETTE.water },
    },
    {
      id: 'buildings',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'buildings',
      minzoom: 14,
      paint: { 'fill-color': PALETTE.buildings, 'fill-opacity': 0.9 },
    },
    {
      id: 'roads-casing',
      type: 'line',
      source: 'basemap',
      'source-layer': 'roads',
      minzoom: 7,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': PALETTE.roadCasing,
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.4, 12, 3.2, 16, 9],
      },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'basemap',
      'source-layer': 'roads',
      minzoom: 7,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'kind'],
          'highway',
          PALETTE.roadMajor,
          'major_road',
          PALETTE.roadMajor,
          PALETTE.roadMinor,
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 2, 16, 7],
      },
    },
    {
      id: 'boundaries',
      type: 'line',
      source: 'basemap',
      'source-layer': 'boundaries',
      paint: {
        'line-color': PALETTE.boundary,
        'line-width': 0.8,
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'place-labels',
      type: 'symbol',
      source: 'basemap',
      'source-layer': 'places',
      minzoom: 4,
      layout: {
        'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 10, 14, 15, 17],
        'text-font': ['Noto Sans Regular'],
        'text-max-width': 8,
      },
      paint: {
        'text-color': PALETTE.label,
        'text-halo-color': PALETTE.labelHalo,
        'text-halo-width': 1.4,
      },
    },
  ];

  return {
    version: 8,
    name: 'TerraColombia base',
    // Glifos y sprites propios: si la infraestructura no los sirve todavía, el servidor de
    // estilos debe responder estas rutas. Nunca se apuntan a servicios de terceros de pago.
    glyphs: '/fonts/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'vector',
        tiles: [tilesUrl],
        minzoom: 0,
        maxzoom: 15,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers,
  };
}

/**
 * Estilo a entregar a MapLibre: un estilo propio, uno construido sobre nuestras teselas,
 * o el de OpenFreeMap por omisión.
 */
export function resolveBasemapStyle(): string | StyleSpecification {
  if (OWN_STYLE_URL.length > 0) return OWN_STYLE_URL;
  if (OWN_TILES_URL.length > 0) return buildProtomapsStyle(OWN_TILES_URL);
  return OPENFREEMAP_STYLE_URL;
}

/**
 * true solo cuando el mapa base no tiene detalle de Colombia (el estilo de demostración de
 * MapLibre). Con OpenFreeMap el mapa es correcto, así que no hay nada que advertir.
 */
export function isUsingDemoBasemap(): boolean {
  return resolveBasemapStyle() === MAPLIBRE_DEMO_STYLE_URL;
}

/**
 * true cuando el mapa base lo sirve un tercero gratuito y no infraestructura propia.
 * No es un error, pero conviene saberlo antes de depender de ello en producción.
 */
export function isUsingThirdPartyBasemap(): boolean {
  return OWN_STYLE_URL.length === 0 && OWN_TILES_URL.length === 0;
}

/**
 * Id de la primera capa de símbolos del estilo base. Los datos propios se insertan **debajo**
 * de las etiquetas para que los nombres de lugares sigan legibles sobre los polígonos.
 */
export const LABEL_LAYER_ID = 'place-labels';

export function firstSymbolLayerId(layers: readonly LayerSpecification[]): string | undefined {
  return layers.find((l) => l.type === 'symbol')?.id;
}
