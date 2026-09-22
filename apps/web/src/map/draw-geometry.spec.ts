import { describe, expect, it } from 'vitest';
import type { GeoJsonGeometry } from '@terracolombia/shared';
import { distinctVertices, isUsableScopeGeometry, pickDrawnGeometry } from './draw-geometry';

/** Polígono real de 0,63 km² en Bogotá, tal como lo dibujó el navegador en la prueba. */
const REAL: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-74.084059792, 4.632857384],
      [-74.084059792, 4.626571125],
      [-74.075940209, 4.626571125],
      [-74.075940209, 4.632857384],
      [-74.084059792, 4.632857384],
    ],
  ],
};

/** Lo que terra-draw deja tras el doble clic: cuatro vértices en el mismo punto. */
const DEGENERADO: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-75.119306372, 3.898149881],
      [-75.119306372, 3.898149881],
      [-75.119306372, 3.898149881],
      [-75.119306372, 3.898149881],
    ],
  ],
};

describe('distinctVertices', () => {
  it('no cuenta dos veces el vértice de cierre', () => {
    expect(distinctVertices(REAL)).toBe(4);
  });

  it('una figura degenerada tiene un solo vértice distinto', () => {
    expect(distinctVertices(DEGENERADO)).toBe(1);
  });
});

describe('isUsableScopeGeometry', () => {
  it('acepta un polígono con superficie y rechaza el degenerado', () => {
    expect(isUsableScopeGeometry(REAL)).toBe(true);
    expect(isUsableScopeGeometry(DEGENERADO)).toBe(false);
    expect(isUsableScopeGeometry(undefined)).toBe(false);
  });

  it('rechaza una figura de dos puntos: un segmento no encierra nada', () => {
    expect(
      isUsableScopeGeometry({
        type: 'Polygon',
        coordinates: [
          [
            [-74, 4],
            [-74.1, 4],
            [-74, 4],
          ],
        ],
      }),
    ).toBe(false);
  });
});

describe('pickDrawnGeometry', () => {
  it('ignora la figura vacía que el doble clic deja al final', () => {
    // Este es el caso que se enviaba a analizar con área 0,00 km².
    const snapshot = [
      { id: 'a', geometry: REAL },
      { id: 'b', geometry: DEGENERADO },
    ];
    expect(pickDrawnGeometry(snapshot)).toEqual(REAL);
    expect(pickDrawnGeometry(snapshot, 'a')).toEqual(REAL);
  });

  it('prefiere la figura que terra-draw declara terminada', () => {
    const otra: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-75, 5],
          [-75, 5.1],
          [-74.9, 5.1],
          [-75, 5],
        ],
      ],
    };
    const snapshot = [
      { id: 'a', geometry: REAL },
      { id: 'b', geometry: otra },
    ];
    expect(pickDrawnGeometry(snapshot, 'a')).toEqual(REAL);
  });

  it('cae en la última utilizable si la terminada no encierra superficie', () => {
    const snapshot = [
      { id: 'a', geometry: REAL },
      { id: 'b', geometry: DEGENERADO },
    ];
    expect(pickDrawnGeometry(snapshot, 'b')).toEqual(REAL);
  });

  it('devuelve null mientras no haya ninguna figura con superficie', () => {
    expect(pickDrawnGeometry([{ id: 'b', geometry: DEGENERADO }])).toBeNull();
    expect(pickDrawnGeometry([])).toBeNull();
  });
});
