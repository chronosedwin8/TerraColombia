import {
  cellToBoundary,
  cellToLatLng,
  cellToParent,
  getResolution,
  gridDisk,
  isValidCell,
  latLngToCell,
  cellArea,
  polygonToCells,
  UNITS,
} from 'h3-js';
import { H3_RES } from '@terracolombia/shared';
import type { GeoJsonGeometry } from '@terracolombia/shared';

export type H3Index = string;
export type H3Resolution = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export function pointToCell(lng: number, lat: number, res: number = H3_RES.FINE): H3Index {
  return latLngToCell(lat, lng, res);
}

export function cellCenter(h3: H3Index): [number, number] {
  const [lat, lng] = cellToLatLng(h3);
  return [lng, lat];
}

/** Polígono GeoJSON de la celda, en orden lng,lat y cerrado. */
export function cellToPolygon(h3: H3Index): GeoJsonGeometry {
  const boundary = cellToBoundary(h3, true); // true => [lng, lat]
  const ring = boundary.map(([lng, lat]) => [lng, lat]);
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function cellAreaM2(h3: H3Index): number {
  return cellArea(h3, UNITS.m2);
}

export function parentCell(h3: H3Index, res: number): H3Index {
  return cellToParent(h3, res);
}

export function resolutionOf(h3: H3Index): number {
  return getResolution(h3);
}

export function isValid(h3: string): boolean {
  return isValidCell(h3);
}

export function ring(h3: H3Index, k: number): H3Index[] {
  return gridDisk(h3, k);
}

/**
 * Celdas que cubren un polígono o multipolígono GeoJSON. Devuelve un arreglo sin duplicados.
 * `polygonToCells` de h3-js espera coordenadas [lat, lng] cuando `isGeoJson` es false;
 * pasamos `true` para trabajar con el orden GeoJSON [lng, lat].
 */
export function coverGeometry(geom: GeoJsonGeometry, res: number = H3_RES.COARSE): H3Index[] {
  const out = new Set<H3Index>();
  const add = (rings: number[][][]) => {
    for (const c of polygonToCells(rings as number[][][], res, true)) out.add(c);
  };
  if (geom.type === 'Polygon') add(geom.coordinates);
  else if (geom.type === 'MultiPolygon') for (const poly of geom.coordinates) add(poly);
  else if (geom.type === 'GeometryCollection')
    for (const g of geom.geometries) for (const c of coverGeometry(g, res)) out.add(c);
  else if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates as [number, number];
    out.add(latLngToCell(lat, lng, res));
  }
  return [...out];
}

/** Área aproximada de una celda por resolución, en km². Para mensajes de UI. */
export const CELL_AREA_KM2: Record<number, number> = {
  5: 252.9,
  6: 36.13,
  7: 5.161,
  8: 0.7373,
  9: 0.1053,
  10: 0.01504,
};

export function describeResolution(res: number): string {
  const km2 = CELL_AREA_KM2[res];
  if (!km2) return `Resolución H3 ${res}`;
  if (km2 >= 1) return `Hexágonos de unos ${km2.toFixed(0)} km² (resolución ${res})`;
  return `Hexágonos de unas ${(km2 * 100).toFixed(0)} hectáreas (resolución ${res})`;
}
