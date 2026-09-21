import { describe, expect, it } from 'vitest';
import type { FactorScore } from '@terracolombia/shared';
import { CHART_PALETTE, barChart, donutChart, factorBarChart, lineChart, toImageAsset } from '../src/charts.js';
import { bboxOf, renderFallbackSvg, renderStaticMap } from '../src/static-map.js';

const FACTORS: FactorScore[] = [
  {
    indicator: 'pendiente',
    label: 'Pendiente del terreno',
    score: 95,
    rawValue: 2.1,
    unit: '%',
    weight: 0.25,
    direction: 'lower_is_better',
    formula: '100 − min(100, pendiente × 2)',
    sourceDatasetIds: ['copernicus-dem-30'],
    explanation: 'Terreno casi plano.',
    flag: 'ok',
  },
  {
    indicator: 'amenaza',
    label: 'Amenaza de inundación',
    score: null,
    rawValue: null,
    unit: null,
    weight: 0.35,
    direction: 'categorical',
    formula: 'mapa categórico',
    sourceDatasetIds: ['ideam-inundaciones'],
    explanation: 'Sin datos para esta zona.',
    flag: 'unknown',
  },
];

describe('gráficos SVG', () => {
  it('la paleta categórica tiene ocho tonos fijos y no se cicla', () => {
    expect(CHART_PALETTE).toHaveLength(8);
    expect(new Set(CHART_PALETTE).size).toBe(8);
  });

  it('las barras llevan etiqueta directa con el valor y una trama por serie', () => {
    const c = barChart({
      title: 'Predios por destino económico',
      data: [
        { label: 'Habitacional', value: 1240 },
        { label: 'Comercial', value: 310 },
      ],
      unit: 'predios',
    });
    expect(c.svg).toContain('<svg');
    // Etiqueta directa: los tres tonos que no alcanzan 3:1 nunca van sin texto.
    expect(c.svg).toContain('1.240');
    expect(c.svg).toContain('310');
    expect(c.svg).toContain('url(#tx0)');
    expect(c.svg).toContain('<pattern');
    expect(c.dataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('agrupa las categorías sobrantes en "Otros" en lugar de inventar colores', () => {
    const c = barChart({
      title: 'Muchas categorías',
      data: Array.from({ length: 14 }, (_, i) => ({ label: `cat ${i}`, value: 14 - i })),
      maxBars: 5,
    });
    expect(c.svg).toContain('Otros (10)');
  });

  it('escapa el texto que entra a los gráficos', () => {
    const c = barChart({ title: '<script>x</script>', data: [{ label: '"a" & <b>', value: 1 }] });
    expect(c.svg).not.toContain('<script>');
    expect(c.svg).toContain('&lt;script&gt;');
    expect(c.svg).toContain('&amp;');
  });

  it('las líneas usan trazo discontinuo distinto por serie y leyenda con dos series', () => {
    const c = lineChart({
      title: 'Predios por corte',
      categories: ['2026-05', '2026-06', '2026-07'],
      series: [
        { label: 'Urbano', points: [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 15 }] },
        { label: 'Rural', points: [{ x: 0, y: 4 }, { x: 1, y: null }, { x: 2, y: 6 }] },
      ],
    });
    expect(c.svg).toContain('stroke-dasharray');
    expect(c.svg).toContain('Urbano');
    expect(c.svg).toContain('Rural');
  });

  it('una sola serie de líneas no dibuja caja de leyenda', () => {
    const c = lineChart({
      title: 'Una serie',
      categories: ['a', 'b'],
      series: [{ label: 'Solo', points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }],
    });
    // La leyenda solo aparece desde dos series; el título ya dice qué se grafica.
    expect((c.svg.match(/rx="2" fill="url\(#tx/g) ?? []).length).toBe(0);
  });

  it('la dona muestra valor y porcentaje por porción', () => {
    const c = donutChart({
      title: 'Cobertura',
      data: [
        { label: 'Con catastro', value: 80 },
        { label: 'Sin catastro', value: 20 },
      ],
      centerLabel: '100',
      centerCaption: 'municipios',
    });
    expect(c.svg).toContain('80');
    expect(c.svg).toContain('80,0 %');
    expect(c.svg).toContain('20,0 %');
  });

  it('la dona dice que no hay nada que graficar en lugar de dibujar un círculo vacío', () => {
    const c = donutChart({ title: 'Vacío', data: [{ label: 'a', value: 0 }] });
    expect(c.svg).toContain('No hay valores positivos');
  });

  it('la barra de factores usa colores de estado con trama, icono y texto', () => {
    const c = factorBarChart({ factors: FACTORS });
    expect(c.svg).toContain('Pendiente del terreno');
    expect(c.svg).toContain('95/100');
    expect(c.svg).toContain('sin datos'); // el factor sin puntaje lo dice, no lo estima
    expect(c.svg).toContain('sin restricción');
    expect(c.svg).toContain('peso 25 %');
    expect(c.svg).toContain('<pattern');
  });

  it('la barra de factores explica el caso sin factores', () => {
    const c = factorBarChart({ factors: [] });
    expect(c.svg).toContain('faltan datos obligatorios');
  });

  it('toImageAsset conserva el texto alternativo', () => {
    const asset = toImageAsset(factorBarChart({ factors: FACTORS }), { alt: 'Factores' });
    expect(asset.alt).toBe('Factores');
    expect(asset.src.startsWith('data:image/svg+xml')).toBe(true);
  });
});

describe('mapa estático de respaldo', () => {
  const polygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-74.7968, 10.9875],
        [-74.796, 10.9875],
        [-74.796, 10.9881],
        [-74.7968, 10.9881],
        [-74.7968, 10.9875],
      ],
    ],
  };

  it('calcula la extensión de la geometría', () => {
    expect(bboxOf({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: polygon, properties: {} }] })).toEqual([
      -74.7968, 10.9875, -74.796, 10.9881,
    ]);
  });

  it('dice visiblemente "SIN MAPA BASE" y dibuja escala y recuadro de contexto', () => {
    const svg = renderFallbackSvg(
      { width: 600, height: 400, highlight: polygon, alt: 'Predio de prueba', inset: true },
      null,
    );
    expect(svg).toContain('SIN MAPA BASE');
    expect(svg).toContain('Colombia (referencial)');
    expect(svg).toContain('sin cartografía de fondo');
    expect(svg).toContain('<path');
  });

  it('el respaldo funciona sin geometría y no se rompe', () => {
    const svg = renderFallbackSvg({ width: 400, height: 300, highlight: null, alt: 'Sin geometría' }, null);
    expect(svg).toContain('SIN MAPA BASE');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('renderStaticMap con forceFallback no toca la red ni el navegador', async () => {
    const result = await renderStaticMap({
      width: 500,
      height: 320,
      highlight: polygon,
      alt: 'Predio',
      forceFallback: true,
    });
    expect(result.withoutBasemap).toBe(true);
    expect(result.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(result.attribution).toContain('Sin mapa base');
  });

  it('escapa el texto alternativo dentro del SVG', () => {
    const svg = renderFallbackSvg(
      { width: 300, height: 200, highlight: null, alt: '<script>alert(1)</script>' },
      null,
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
