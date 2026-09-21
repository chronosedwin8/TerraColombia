import { describe, expect, it } from 'vitest';
import {
  CELL_AREA_KM2,
  cellAreaM2,
  cellCenter,
  cellToPolygon,
  coverGeometry,
  describeResolution,
  isValid,
  parentCell,
  pointToCell,
  resolutionOf,
  ring,
} from './h3.js';
import {
  COLOMBIA_BBOX,
  CRS_9377,
  describeSrid,
  isInsideColombia,
  MEASURE_SRID,
  SERVE_SRID,
} from './crs.js';
import {
  approxAreaKm2,
  approxAreaM2,
  bboxIntersectsColombia,
  clampBBoxToColombia,
  geometryBBox,
  isValidGeometry,
  isValidTileCoords,
  radiusToPolygon,
  tileToBBox,
} from './geometry.js';

// Punto de referencia: centro de Bogotá.
const BOGOTA: [number, number] = [-74.0721, 4.711];

describe('h3', () => {
  it('convierte un punto a celda y vuelve al centro cercano', () => {
    const cell = pointToCell(BOGOTA[0], BOGOTA[1], 9);
    expect(isValid(cell)).toBe(true);
    expect(resolutionOf(cell)).toBe(9);
    const [lng, lat] = cellCenter(cell);
    // El centro de la celda está a menos de 200 m del punto original en resolución 9.
    expect(Math.abs(lng - BOGOTA[0])).toBeLessThan(0.003);
    expect(Math.abs(lat - BOGOTA[1])).toBeLessThan(0.003);
  });

  it('la celda padre tiene la resolución pedida', () => {
    const cell = pointToCell(BOGOTA[0], BOGOTA[1], 9);
    expect(resolutionOf(parentCell(cell, 8))).toBe(8);
    expect(resolutionOf(parentCell(cell, 6))).toBe(6);
  });

  it('el polígono de la celda está cerrado y tiene 7 vértices', () => {
    const poly = cellToPolygon(pointToCell(BOGOTA[0], BOGOTA[1], 8));
    expect(poly.type).toBe('Polygon');
    if (poly.type !== 'Polygon') throw new Error('tipo inesperado');
    const outer = poly.coordinates[0]!;
    expect(outer.length).toBe(7);
    expect(outer[0]).toEqual(outer.at(-1));
  });

  it('el área de la celda coincide con la tabla de referencia', () => {
    for (const res of [7, 8, 9]) {
      const km2 = cellAreaM2(pointToCell(BOGOTA[0], BOGOTA[1], res)) / 1_000_000;
      const expected = CELL_AREA_KM2[res]!;
      // Las celdas H3 varían de tamaño con la latitud: 25 % de tolerancia.
      expect(km2).toBeGreaterThan(expected * 0.75);
      expect(km2).toBeLessThan(expected * 1.25);
    }
  });

  it('el anillo k=1 devuelve 7 celdas (la central y sus vecinas)', () => {
    expect(ring(pointToCell(BOGOTA[0], BOGOTA[1], 9), 1)).toHaveLength(7);
  });

  it('cubre un polígono con celdas de la resolución pedida', () => {
    const poly = radiusToPolygon(BOGOTA, 2000);
    const cells = coverGeometry(poly, 8);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => resolutionOf(c) === 8)).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('describeResolution usa hectáreas por debajo de 1 km²', () => {
    expect(describeResolution(9)).toContain('hectáreas');
    expect(describeResolution(6)).toContain('km²');
  });
});

describe('crs', () => {
  it('EPSG:9377 lleva los parámetros del registro EPSG', () => {
    expect(CRS_9377.srid).toBe(9377);
    expect(CRS_9377.proj4).toContain('+lat_0=4');
    expect(CRS_9377.proj4).toContain('+lon_0=-73');
    expect(CRS_9377.proj4).toContain('+k=0.9992');
    expect(CRS_9377.proj4).toContain('+x_0=5000000');
    expect(CRS_9377.proj4).toContain('+y_0=2000000');
    expect(CRS_9377.srtext).toContain('MAGNA-SIRGAS / Origen-Nacional');
  });

  it('las medidas van en 9377 y lo servido en 4326', () => {
    expect(MEASURE_SRID).toBe(9377);
    expect(SERVE_SRID).toBe(4326);
  });

  it('isInsideColombia acepta Bogotá y San Andrés, y rechaza Lima', () => {
    expect(isInsideColombia(BOGOTA[0], BOGOTA[1])).toBe(true);
    expect(isInsideColombia(-81.7, 12.58)).toBe(true); // San Andrés
    expect(isInsideColombia(-81.7, 12.58, false)).toBe(false); // fuera del continente
    expect(isInsideColombia(-77.04, -12.04)).toBe(false); // Lima
  });

  it('describeSrid nombra los CRS que aparecen en fuentes colombianas', () => {
    expect(describeSrid(4686)).toContain('MAGNA-SIRGAS');
    expect(describeSrid(3116)).toContain('Bogota');
    expect(describeSrid(null)).toContain('no declarado');
    expect(describeSrid(31370)).toContain('no catalogado');
  });
});

describe('geometry', () => {
  it('el área de un círculo de 1 km de radio ronda π km²', () => {
    const poly = radiusToPolygon(BOGOTA, 1000, 128);
    const km2 = approxAreaKm2(poly);
    expect(km2).toBeGreaterThan(3.0);
    expect(km2).toBeLessThan(3.3);
  });

  it('approxAreaM2 y approxAreaKm2 son coherentes', () => {
    const poly = radiusToPolygon(BOGOTA, 500);
    expect(approxAreaM2(poly) / 1_000_000).toBeCloseTo(approxAreaKm2(poly), 6);
  });

  it('calcula la envolvente de una geometría', () => {
    const poly = radiusToPolygon(BOGOTA, 1000);
    const [minX, minY, maxX, maxY] = geometryBBox(poly);
    expect(minX).toBeLessThan(BOGOTA[0]);
    expect(maxX).toBeGreaterThan(BOGOTA[0]);
    expect(minY).toBeLessThan(BOGOTA[1]);
    expect(maxY).toBeGreaterThan(BOGOTA[1]);
  });

  it('valida geometrías correctas', () => {
    expect(isValidGeometry(radiusToPolygon(BOGOTA, 500))).toBe(true);
  });

  it('bboxIntersectsColombia distingue dentro de fuera', () => {
    expect(bboxIntersectsColombia([-75, 4, -74, 5])).toBe(true);
    expect(bboxIntersectsColombia([10, 40, 11, 41])).toBe(false);
  });

  it('clampBBoxToColombia recorta a la extensión del país', () => {
    const clamped = clampBBoxToColombia([-200, -50, 200, 50]);
    expect(clamped).toEqual(COLOMBIA_BBOX);
  });

  it('tileToBBox de z=0 cubre el mundo en longitud', () => {
    const [minX, , maxX] = tileToBBox(0, 0, 0);
    expect(minX).toBeCloseTo(-180, 6);
    expect(maxX).toBeCloseTo(180, 6);
  });

  it('la tesela que contiene Bogotá la contiene de verdad', () => {
    const z = 12;
    const x = Math.floor(((BOGOTA[0] + 180) / 360) * 2 ** z);
    const latRad = (BOGOTA[1] * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    const [minX, minY, maxX, maxY] = tileToBBox(z, x, y);
    expect(BOGOTA[0]).toBeGreaterThanOrEqual(minX);
    expect(BOGOTA[0]).toBeLessThanOrEqual(maxX);
    expect(BOGOTA[1]).toBeGreaterThanOrEqual(minY);
    expect(BOGOTA[1]).toBeLessThanOrEqual(maxY);
  });

  it('isValidTileCoords rechaza coordenadas fuera del rango del zoom', () => {
    expect(isValidTileCoords(0, 0, 0)).toBe(true);
    expect(isValidTileCoords(1, 1, 1)).toBe(true);
    expect(isValidTileCoords(1, 2, 0)).toBe(false);
    expect(isValidTileCoords(-1, 0, 0)).toBe(false);
    expect(isValidTileCoords(23, 0, 0)).toBe(false);
    expect(isValidTileCoords(2, 1.5, 0)).toBe(false);
  });
});
