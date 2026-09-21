import { describe, expect, it } from 'vitest';
import {
  band,
  booleanInput,
  booleanScore,
  categorical,
  categoryInput,
  describeNormalizer,
  finishScore,
  linear,
  linearInverse,
  NormalizerDeclarationError,
  normalizeCategoryKey,
  numericInput,
  percentile,
  stepped,
} from '../normalize.js';

describe('linear', () => {
  it('interpola entre el mínimo y el máximo', () => {
    const n = linear(0, 100);
    expect(n(0)).toBe(0);
    expect(n(50)).toBe(50);
    expect(n(100)).toBe(100);
  });

  it('acota en los extremos en vez de extrapolar', () => {
    const n = linear(0, 10);
    expect(n(-5)).toBe(0);
    expect(n(20)).toBe(100);
  });

  it('devuelve null con valores faltantes, nunca 0', () => {
    const n = linear(0, 10);
    expect(n(null)).toBeNull();
    expect(n(undefined)).toBeNull();
    expect(n(Number.NaN)).toBeNull();
    // Y el 0 real sí puntúa 0: son cosas distintas.
    expect(n(0)).toBe(0);
  });

  it('rechaza declaraciones incoherentes', () => {
    expect(() => linear(5, 5)).toThrow(NormalizerDeclarationError);
  });
});

describe('linearInverse', () => {
  it('puntúa 100 en el mínimo y 0 en el máximo', () => {
    const n = linearInverse(0, 1000);
    expect(n(0)).toBe(100);
    expect(n(500)).toBe(50);
    expect(n(1000)).toBe(0);
    expect(n(5000)).toBe(0);
  });

  it('declara su tipo para la documentación', () => {
    expect(linearInverse(0, 10).spec).toEqual({ kind: 'linear_inverse', min: 0, max: 10 });
  });
});

describe('stepped', () => {
  const n = stepped([
    { upTo: 3, score: 100 },
    { upTo: 7, score: 90 },
    { upTo: 25, score: 50 },
  ]);

  it('aplica el primer tramo que no se supera', () => {
    expect(n(0)).toBe(100);
    expect(n(3)).toBe(100);
    expect(n(3.1)).toBe(90);
    expect(n(7)).toBe(90);
    expect(n(25)).toBe(50);
  });

  it('usa el puntaje declarado por encima del último tramo', () => {
    expect(n(26)).toBe(0);
    const conNull = stepped([{ upTo: 1, score: 100 }], { above: null });
    expect(conNull(2)).toBeNull();
  });

  it('exige tramos ascendentes', () => {
    expect(() =>
      stepped([
        { upTo: 10, score: 100 },
        { upTo: 5, score: 50 },
      ]),
    ).toThrow(NormalizerDeclarationError);
  });

  it('devuelve null sin dato', () => {
    expect(n(null)).toBeNull();
  });
});

describe('categorical', () => {
  const n = categorical({ muy_baja: 100, alta: 20 });

  it('ignora tildes, mayúsculas y separadores', () => {
    expect(n('muy_baja')).toBe(100);
    expect(n('Muy Baja')).toBe(100);
    expect(n('MUY-BAJA')).toBe(100);
    expect(n('Alta')).toBe(20);
  });

  it('devuelve null en categorías desconocidas por omisión', () => {
    expect(n('lo_que_sea')).toBeNull();
    expect(n('')).toBeNull();
    expect(n(null)).toBeNull();
  });

  it('admite un puntaje declarado para lo desconocido', () => {
    const conFallback = categorical({ a: 100 }, { fallback: 30 });
    expect(conFallback('b')).toBe(30);
  });
});

describe('percentile', () => {
  it('usa el rango medio para que los empates no dependan del orden', () => {
    const n = percentile([1, 2, 3, 4]);
    expect(n(3)).toBe(62.5);
    expect(n(1)).toBe(12.5);
  });

  it('sin distribución de referencia no hay percentil', () => {
    expect(percentile([])(5)).toBeNull();
  });

  it('se puede invertir', () => {
    const n = percentile([1, 2, 3, 4], { invert: true });
    expect(n(3)).toBe(37.5);
  });
});

describe('booleanScore', () => {
  const n = booleanScore(100, 40);

  it('puntúa según el valor declarado', () => {
    expect(n(true)).toBe(100);
    expect(n(false)).toBe(40);
  });

  it('sin dato devuelve null', () => {
    expect(n(null)).toBeNull();
    expect(n(undefined)).toBeNull();
  });

  it('admite null como puntaje declarado', () => {
    expect(booleanScore(null, 0)(true)).toBeNull();
  });
});

describe('band', () => {
  const n = band({ hardMin: 0, idealMin: 100, idealMax: 200, hardMax: 300 });

  it('puntúa 100 dentro de la banda ideal', () => {
    expect(n(100)).toBe(100);
    expect(n(150)).toBe(100);
    expect(n(200)).toBe(100);
  });

  it('baja linealmente hacia los extremos duros', () => {
    expect(n(50)).toBe(50);
    expect(n(250)).toBe(50);
    expect(n(0)).toBe(0);
    expect(n(300)).toBe(0);
    expect(n(500)).toBe(0);
  });

  it('exige una declaración ordenada', () => {
    expect(() => band({ hardMin: 10, idealMin: 5, idealMax: 20, hardMax: 30 })).toThrow(
      NormalizerDeclarationError,
    );
  });
});

describe('adaptadores de tipo', () => {
  it('un valor con el tipo equivocado es dato faltante, no un cero', () => {
    const n = numericInput(linear(0, 10));
    expect(n('cinco')).toBeNull();
    expect(n(true)).toBeNull();
    expect(n(5)).toBe(50);
  });

  it('categoryInput acepta números como texto', () => {
    const n = categoryInput(categorical({ '4': 65 }));
    expect(n(4)).toBe(65);
    expect(n('4')).toBe(65);
  });

  it('booleanInput acepta sí/no normalizados por el ETL', () => {
    const n = booleanInput(booleanScore(100, 0));
    expect(n('si')).toBe(100);
    expect(n('NO')).toBe(0);
    expect(n('quizá')).toBeNull();
  });
});

describe('normalizeCategoryKey', () => {
  it('normaliza a minúsculas sin tildes con guión bajo', () => {
    expect(normalizeCategoryKey('  Sobreutilización Severa ')).toBe('sobreutilizacion_severa');
    expect(normalizeCategoryKey('Parque Nacional Natural')).toBe('parque_nacional_natural');
  });
});

describe('finishScore', () => {
  it('acota y redondea a dos decimales', () => {
    expect(finishScore(33.33333)).toBe(33.33);
    expect(finishScore(-1)).toBe(0);
    expect(finishScore(101)).toBe(100);
  });
});

describe('describeNormalizer', () => {
  it('describe en español cada tipo de normalizador', () => {
    const specs = [
      linear(0, 1).spec,
      linearInverse(0, 1).spec,
      stepped([{ upTo: 1, score: 100 }]).spec,
      categorical({ a: 1 }).spec,
      percentile([1, 2]).spec,
      booleanScore(1, 0).spec,
      band({ hardMin: 0, idealMin: 1, idealMax: 2, hardMax: 3 }).spec,
    ];
    for (const spec of specs) {
      const text = describeNormalizer(spec);
      expect(text.length).toBeGreaterThan(10);
    }
  });
});
