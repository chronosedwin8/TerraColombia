import area from '@turf/area';
import bbox from '@turf/bbox';
import booleanValid from '@turf/boolean-valid';
import circle from '@turf/circle';
import { COLOMBIA_BBOX } from './crs.js';
import type { BBox, GeoJsonGeometry } from '@terracolombia/shared';

/** Área en m² calculada sobre el esferoide (aproximación para validaciones de UI). */
export function approxAreaM2(geom: GeoJsonGeometry): number {
  return area({ type: 'Feature', geometry: geom as never, properties: {} });
}

export function approxAreaKm2(geom: GeoJsonGeometry): number {
  return approxAreaM2(geom) / 1_000_000;
}

export function geometryBBox(geom: GeoJsonGeometry): BBox {
  const b = bbox({ type: 'Feature', geometry: geom as never, properties: {} });
  return [b[0], b[1], b[2], b[3]];
}

export function isValidGeometry(geom: GeoJsonGeometry): boolean {
  try {
    return booleanValid({ type: 'Feature', geometry: geom as never, properties: {} } as never);
  } catch {
    return false;
  }
}

/** Círculo como polígono, con 64 vértices: la versión exacta se calcula en PostGIS. */
export function radiusToPolygon(
  center: [number, number],
  radiusM: number,
  steps = 64,
): GeoJsonGeometry {
  const f = circle(center, radiusM / 1000, { steps, units: 'kilometers' });
  return f.geometry as GeoJsonGeometry;
}

export function bboxIntersectsColombia(b: BBox): boolean {
  const [minX, minY, maxX, maxY] = b;
  const [cminX, cminY, cmaxX, cmaxY] = COLOMBIA_BBOX;
  return !(maxX < cminX || minX > cmaxX || maxY < cminY || minY > cmaxY);
}

export function clampBBoxToColombia(b: BBox): BBox {
  const [cminX, cminY, cmaxX, cmaxY] = COLOMBIA_BBOX;
  return [
    Math.max(b[0], cminX),
    Math.max(b[1], cminY),
    Math.min(b[2], cmaxX),
    Math.min(b[3], cmaxY),
  ];
}

/** Convierte z/x/y a la extensión geográfica de la tesela (esquema XYZ, Web Mercator). */
export function tileToBBox(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const lngLeft = (x / n) * 360 - 180;
  const lngRight = ((x + 1) / n) * 360 - 180;
  const latTop = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const latBottom = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [lngLeft, latBottom, lngRight, latTop];
}

export function isValidTileCoords(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || z < 0 || z > 22) return false;
  const n = 2 ** z;
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < n && y >= 0 && y < n;
}

/**
 * Reduce el número de vértices para la vista previa en la UI. Mantiene la topología
 * aproximada; los cálculos siempre usan la geometría completa en PostGIS.
 */
export function densifyTolerance(areaKm2: number): number {
  if (areaKm2 > 1000) return 0.001;
  if (areaKm2 > 100) return 0.0005;
  if (areaKm2 > 10) return 0.0001;
  return 0;
}
