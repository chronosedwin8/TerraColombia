import { describe, expect, it } from 'vitest';
import {
  MIN_CONFIDENCE,
  applyWeightOverrides,
  combine,
  combineFactors,
  factorContributions,
  normalizeWeights,
} from '../composite.js';
import { buildFactorScores } from '../indicators.js';

describe('normalizeWeights', () => {
  it('renormaliza a 1', () => {
    expect(normalizeWeights({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 });
  });

  it('reparte por igual cuando todos los pesos son 0', () => {
    expect(normalizeWeights({ a: 0, b: 0 })).toEqual({ a: 0.5, b: 0.5 });
  });

  it('ignora valores no numéricos y rechaza negativos', () => {
    expect(normalizeWeights({ a: 2, b: undefined })).toEqual({ a: 1 });
    expect(() => normalizeWeights({ a: -1 })).toThrow(RangeError);
  });

  it('con mapa vacío devuelve mapa vacío', () => {
    expect(normalizeWeights({})).toEqual({});
  });
});

describe('applyWeightOverrides', () => {
  const base = { slope_mean_pct: 0.5, road_access_index: 0.5 };

  it('acepta los pesos del usuario y renormaliza', () => {
    const { weights, ignored } = applyWeightOverrides(base, { slope_mean_pct: 3 });
    expect(ignored).toEqual([]);
    expect(weights.slope_mean_pct).toBeCloseTo(3 / 3.5, 6);
    expect(weights.road_access_index).toBeCloseTo(0.5 / 3.5, 6);
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('ignora claves que la plantilla no contempla y valores inválidos', () => {
    const { weights, ignored } = applyWeightOverrides(base, {
      inventado: 1,
      slope_mean_pct: -2,
    });
    expect(ignored.sort()).toEqual(['inventado', 'slope_mean_pct']);
    expect(Object.keys(weights).sort()).toEqual(['road_access_index', 'slope_mean_pct']);
  });

  it('sin sobrescrituras devuelve los pesos base renormalizados', () => {
    const { weights } = applyWeightOverrides({ a: 2, b: 2 }, undefined);
    expect(weights).toEqual({ a: 0.5, b: 0.5 });
  });
});

describe('combine', () => {
  it('promedia ponderadamente cuando hay todos los datos', () => {
    const r = combine([
      { indicator: 'a', score: 100, weight: 1 },
      { indicator: 'b', score: 0, weight: 1 },
    ]);
    expect(r.score).toBe(50);
    expect(r.confidence).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it('un faltante no cuenta como cero: se renormaliza el peso restante', () => {
    const r = combine([
      { indicator: 'a', score: 100, weight: 1 },
      { indicator: 'b', score: null, weight: 1 },
    ]);
    // Si el faltante valiera 0, el resultado sería 50. Vale null, así que el puntaje es 100.
    expect(r.score).toBe(100);
    expect(r.confidence).toBe(0.5);
    expect(r.missing).toEqual(['b']);
    expect(r.notes.join(' ')).toContain('no cuentan como cero');
  });

  it('por debajo de la confianza mínima no publica puntaje', () => {
    const r = combine([
      { indicator: 'a', score: 100, weight: 1 },
      { indicator: 'b', score: null, weight: 1 },
      { indicator: 'c', score: null, weight: 1 },
    ]);
    expect(r.score).toBeNull();
    expect(r.confidence).toBeLessThan(MIN_CONFIDENCE);
  });

  it('la política null_result anula el puntaje ante cualquier faltante', () => {
    const r = combine(
      [
        { indicator: 'a', score: 100, weight: 9 },
        { indicator: 'b', score: null, weight: 1 },
      ],
      { policy: 'null_result' },
    );
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0.9);
    expect(r.policy).toBe('null_result');
  });

  it('sin ningún dato devuelve null y lo dice', () => {
    const r = combine([{ indicator: 'a', score: null, weight: 1 }]);
    expect(r.score).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.notes.join(' ')).toContain('Ningún indicador tuvo dato');
  });

  it('sin indicadores con peso lo reporta en vez de fingir un cálculo', () => {
    const r = combine([]);
    expect(r.score).toBeNull();
    expect(r.declaredWeight).toBe(0);
    expect(r.notes).toHaveLength(1);
  });

  it('es determinista', () => {
    const items = [
      { indicator: 'a', score: 33.3, weight: 0.3 },
      { indicator: 'b', score: 77.7, weight: 0.7 },
    ];
    expect(combine(items)).toEqual(combine(items));
  });
});

describe('combineFactors y contribuciones', () => {
  const factors = buildFactorScores(
    { slope_mean_pct: 2, road_access_index: 50 },
    { slope_mean_pct: 0.5, road_access_index: 0.5 },
  );

  it('combina directamente el desglose', () => {
    const r = combineFactors(factors);
    expect(r.score).toBe(75);
  });

  it('las contribuciones suman el puntaje', () => {
    const contributions = factorContributions(factors);
    const total = contributions.reduce((acc, c) => acc + (c.contribution ?? 0), 0);
    expect(total).toBeCloseTo(75, 1);
  });

  it('un factor sin dato no aporta contribución', () => {
    const conFalta = buildFactorScores(
      { slope_mean_pct: 2 },
      { slope_mean_pct: 0.5, road_access_index: 0.5 },
    );
    const contributions = factorContributions(conFalta);
    expect(contributions.find((c) => c.indicator === 'road_access_index')?.contribution).toBeNull();
    expect(contributions.find((c) => c.indicator === 'slope_mean_pct')?.contribution).toBe(100);
  });
});
