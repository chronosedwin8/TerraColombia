/**
 * Normalización declarativa: convierte un valor crudo en un puntaje 0–100.
 *
 * Reglas del motor (PLAN.md §9):
 *  1. Los puntos de corte son **datos**, no números escritos dentro de un `if`. Cada
 *     normalizador guarda su declaración en `.spec`, y de ahí salen la tabla de
 *     `docs/MOTOR_PUNTUACION.md` y el texto de "¿Cómo se calcula?" en la interfaz.
 *  2. Un valor faltante devuelve `null`, **nunca 0**. Cero es "malísimo"; `null` es
 *     "no sabemos". Confundirlos es inventar datos (regla 2 de CLAUDE.md).
 *  3. Todo es puro: misma entrada, mismo resultado, sin relojes ni azar ni base de datos.
 */

/** Tipos de valor crudo que el motor sabe puntuar. */
export type RawValue = number | string | boolean;

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Decimales con los que se redondea todo puntaje normalizado (determinismo y legibilidad). */
export const SCORE_DECIMALS = 2;

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function clampScore(score: number): number {
  if (score < SCORE_MIN) return SCORE_MIN;
  if (score > SCORE_MAX) return SCORE_MAX;
  return score;
}

export function roundScore(score: number, decimals = SCORE_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(score * factor) / factor;
}

/** Acota a 0–100 y redondea. Punto único de salida de todos los normalizadores. */
export function finishScore(score: number): number {
  if (!Number.isFinite(score)) return SCORE_MIN;
  return roundScore(clampScore(score));
}

// ─── Declaración de cada normalizador ─────────────────────────────────────────

export interface SteppedBreakpoint {
  /** El tramo aplica cuando el valor es menor o igual a `upTo`. */
  readonly upTo: number;
  readonly score: number;
  /** Texto del tramo para la tabla de "¿Cómo se calcula?". */
  readonly label?: string;
}

export type NormalizerSpec =
  | { readonly kind: 'linear'; readonly min: number; readonly max: number }
  | { readonly kind: 'linear_inverse'; readonly min: number; readonly max: number }
  | {
      readonly kind: 'stepped';
      readonly breakpoints: readonly SteppedBreakpoint[];
      readonly above: number | null;
    }
  | {
      readonly kind: 'categorical';
      readonly map: Readonly<Record<string, number>>;
      readonly fallback: number | null;
    }
  | { readonly kind: 'percentile'; readonly size: number; readonly invert: boolean }
  | {
      readonly kind: 'boolean';
      readonly trueScore: number | null;
      readonly falseScore: number | null;
    }
  | {
      readonly kind: 'band';
      readonly hardMin: number;
      readonly idealMin: number;
      readonly idealMax: number;
      readonly hardMax: number;
    };

/** Función de normalización con su declaración adjunta. */
export interface Normalizer<V extends RawValue> {
  (value: V | null | undefined): number | null;
  readonly spec: NormalizerSpec;
}

function withSpec<V extends RawValue>(
  fn: (value: V | null | undefined) => number | null,
  spec: NormalizerSpec,
): Normalizer<V> {
  return Object.assign(fn, { spec }) as Normalizer<V>;
}

/** Error de construcción: una declaración incoherente es un bug, no un dato faltante. */
export class NormalizerDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizerDeclarationError';
  }
}

// ─── Normalizadores numéricos ─────────────────────────────────────────────────

/**
 * Más es mejor: `min` puntúa 0, `max` puntúa 100, entre ambos interpola linealmente.
 * Fuera del rango se acota (no se extrapola).
 */
export function linear(min: number, max: number): Normalizer<number> {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    throw new NormalizerDeclarationError('linear(min,max) exige números finitos');
  }
  if (min === max) {
    throw new NormalizerDeclarationError('linear(min,max) exige min distinto de max');
  }
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return withSpec<number>(
    (value) => {
      if (!isFiniteNumber(value)) return null;
      return finishScore(((value - lo) / (hi - lo)) * SCORE_MAX);
    },
    { kind: 'linear', min: lo, max: hi },
  );
}

/**
 * Menos es mejor: `min` puntúa 100, `max` puntúa 0. Es el caso de las distancias
 * (a una vía, a un colegio) y de la pendiente.
 */
export function linearInverse(min: number, max: number): Normalizer<number> {
  const forward = linear(min, max);
  const spec = forward.spec;
  if (spec.kind !== 'linear') {
    throw new NormalizerDeclarationError('linearInverse esperaba una declaración lineal');
  }
  return withSpec<number>(
    (value) => {
      const s = forward(value);
      return s === null ? null : finishScore(SCORE_MAX - s);
    },
    { kind: 'linear_inverse', min: spec.min, max: spec.max },
  );
}

/**
 * Escalones declarados: el primer tramo cuyo `upTo` no se supera define el puntaje.
 * `above` es el puntaje por encima del último tramo (por omisión 0).
 */
export function stepped(
  breakpoints: readonly SteppedBreakpoint[],
  options: { above?: number | null } = {},
): Normalizer<number> {
  if (breakpoints.length === 0) {
    throw new NormalizerDeclarationError('stepped() exige al menos un tramo');
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const bp of breakpoints) {
    if (!isFiniteNumber(bp.upTo)) {
      throw new NormalizerDeclarationError('stepped(): cada tramo exige un `upTo` finito');
    }
    if (bp.upTo <= previous) {
      throw new NormalizerDeclarationError(
        `stepped(): los tramos deben ir en orden ascendente (${bp.upTo} tras ${previous})`,
      );
    }
    previous = bp.upTo;
  }
  const above = options.above === undefined ? SCORE_MIN : options.above;
  return withSpec<number>(
    (value) => {
      if (!isFiniteNumber(value)) return null;
      for (const bp of breakpoints) {
        if (value <= bp.upTo) return finishScore(bp.score);
      }
      return above === null ? null : finishScore(above);
    },
    { kind: 'stepped', breakpoints, above },
  );
}

/**
 * Banda óptima: 100 dentro de `[idealMin, idealMax]`, baja linealmente hasta 0 en
 * `hardMin` y `hardMax`, y 0 fuera. Sirve para variables sin dirección monótona,
 * como la altitud (ni muy baja ni muy alta para ciertos cultivos o para vivienda).
 */
export function band(opts: {
  hardMin: number;
  idealMin: number;
  idealMax: number;
  hardMax: number;
}): Normalizer<number> {
  const { hardMin, idealMin, idealMax, hardMax } = opts;
  if (![hardMin, idealMin, idealMax, hardMax].every(isFiniteNumber)) {
    throw new NormalizerDeclarationError('band() exige cuatro números finitos');
  }
  if (!(hardMin <= idealMin && idealMin <= idealMax && idealMax <= hardMax)) {
    throw new NormalizerDeclarationError('band() exige hardMin ≤ idealMin ≤ idealMax ≤ hardMax');
  }
  return withSpec<number>(
    (value) => {
      if (!isFiniteNumber(value)) return null;
      if (value >= idealMin && value <= idealMax) return SCORE_MAX;
      if (value < idealMin) {
        if (value <= hardMin) return SCORE_MIN;
        return finishScore(((value - hardMin) / (idealMin - hardMin)) * SCORE_MAX);
      }
      if (value >= hardMax) return SCORE_MIN;
      return finishScore(((hardMax - value) / (hardMax - idealMax)) * SCORE_MAX);
    },
    { kind: 'band', hardMin, idealMin, idealMax, hardMax },
  );
}

/**
 * Posición del valor dentro de una distribución de referencia (0–100).
 * Usa el rango medio (*midrank*) para que los empates no dependan del orden de llegada.
 * Con distribución vacía devuelve `null`: sin referencia no hay percentil.
 */
export function percentile(
  distribution: readonly number[],
  options: { invert?: boolean } = {},
): Normalizer<number> {
  const invert = options.invert ?? false;
  const sample = distribution
    .filter(isFiniteNumber)
    .slice()
    .sort((a, b) => a - b);
  return withSpec<number>(
    (value) => {
      if (!isFiniteNumber(value)) return null;
      if (sample.length === 0) return null;
      let below = 0;
      let equal = 0;
      for (const s of sample) {
        if (s < value) below += 1;
        else if (s === value) equal += 1;
      }
      const midrank = below + equal / 2;
      const pct = (midrank / sample.length) * SCORE_MAX;
      return finishScore(invert ? SCORE_MAX - pct : pct);
    },
    { kind: 'percentile', size: sample.length, invert },
  );
}

// ─── Normalizador categórico ──────────────────────────────────────────────────

/**
 * Normaliza una clave de categoría: sin tildes, en minúsculas y con `_` entre palabras.
 * Así `"Amenaza Alta"`, `"amenaza alta"` y `"AMENAZA_ALTA"` son la misma clave.
 *
 * Importante: el vocabulario de categorías que recibe este paquete es el **vocabulario
 * normalizado del producto**, producido por el ETL al mapear las leyendas reales de cada
 * fuente. Aquí no se inventan valores de campos de origen (regla 2 de CLAUDE.md).
 */
export function normalizeCategoryKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Mapa categoría → puntaje. `fallback` es el puntaje de una categoría no listada;
 * por omisión `null` ("no sabemos puntuarla"), nunca 0.
 */
export function categorical(
  map: Readonly<Record<string, number>>,
  options: { fallback?: number | null } = {},
): Normalizer<string> {
  const fallback = options.fallback === undefined ? null : options.fallback;
  const canonical = new Map<string, number>();
  for (const [key, score] of Object.entries(map)) {
    if (!isFiniteNumber(score)) {
      throw new NormalizerDeclarationError(`categorical(): puntaje no numérico en "${key}"`);
    }
    canonical.set(normalizeCategoryKey(key), score);
  }
  return withSpec<string>(
    (value) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (trimmed.length === 0) return null;
      const hit = canonical.get(normalizeCategoryKey(trimmed));
      if (hit === undefined) return fallback === null ? null : finishScore(fallback);
      return finishScore(hit);
    },
    { kind: 'categorical', map, fallback },
  );
}

// ─── Normalizador booleano ────────────────────────────────────────────────────

/** Puntaje para `true` y para `false`. Cualquiera de los dos puede declararse `null`. */
export function booleanScore(
  trueScore: number | null,
  falseScore: number | null,
): Normalizer<boolean> {
  return withSpec<boolean>(
    (value) => {
      if (typeof value !== 'boolean') return null;
      const picked = value ? trueScore : falseScore;
      return picked === null ? null : finishScore(picked);
    },
    { kind: 'boolean', trueScore, falseScore },
  );
}

export { booleanScore as boolean };

// ─── Adaptadores de tipo ──────────────────────────────────────────────────────
//
// Los indicadores guardan un `Normalizer<RawValue>` homogéneo para que el catálogo sea
// un solo mapa recorrible. Estos adaptadores comprueban el tipo del valor crudo y
// devuelven `null` si no corresponde (un valor con el tipo equivocado es un dato que no
// tenemos, no un cero).

export function numericInput(inner: Normalizer<number>): Normalizer<RawValue> {
  return withSpec<RawValue>((value) => {
    if (isFiniteNumber(value)) return inner(value);
    return null;
  }, inner.spec);
}

/** Acepta texto y también números o booleanos, que convierte a su representación textual. */
export function categoryInput(inner: Normalizer<string>): Normalizer<RawValue> {
  return withSpec<RawValue>((value) => {
    if (typeof value === 'string') return inner(value);
    if (isFiniteNumber(value)) return inner(String(value));
    if (typeof value === 'boolean') return inner(String(value));
    return null;
  }, inner.spec);
}

/** Acepta booleanos y los textos `"true"`/`"false"`/`"si"`/`"no"` ya normalizados por el ETL. */
export function booleanInput(inner: Normalizer<boolean>): Normalizer<RawValue> {
  return withSpec<RawValue>((value) => {
    if (typeof value === 'boolean') return inner(value);
    if (typeof value === 'string') {
      const key = normalizeCategoryKey(value);
      if (key === 'true' || key === 'si' || key === 'verdadero') return inner(true);
      if (key === 'false' || key === 'no' || key === 'falso') return inner(false);
    }
    return null;
  }, inner.spec);
}

// ─── Descripción legible de los puntos de corte ───────────────────────────────

/**
 * Texto en español de los puntos de corte. Alimenta "¿Cómo se calcula?" en la interfaz
 * y la tabla de `docs/MOTOR_PUNTUACION.md`. Un solo lugar: si cambia un corte, cambia
 * el texto sin tocar nada más.
 */
export function describeNormalizer(spec: NormalizerSpec): string {
  switch (spec.kind) {
    case 'linear':
      return `Lineal: ${spec.min} puntúa 0 y ${spec.max} puntúa 100; los valores intermedios se interpolan y los extremos se acotan.`;
    case 'linear_inverse':
      return `Lineal inversa: ${spec.min} puntúa 100 y ${spec.max} puntúa 0; los valores intermedios se interpolan y los extremos se acotan.`;
    case 'stepped': {
      const tramos = spec.breakpoints
        .map((bp) => `hasta ${bp.upTo} → ${bp.score}${bp.label ? ` (${bp.label})` : ''}`)
        .join('; ');
      const arriba =
        spec.above === null
          ? 'por encima del último tramo se considera sin dato'
          : `por encima del último tramo → ${spec.above}`;
      return `Escalones: ${tramos}; ${arriba}.`;
    }
    case 'categorical': {
      const pares = Object.entries(spec.map)
        .map(([k, v]) => `${k} → ${v}`)
        .join('; ');
      const resto =
        spec.fallback === null
          ? 'cualquier otra categoría se reporta como sin dato'
          : `cualquier otra categoría → ${spec.fallback}`;
      return `Categorías: ${pares}; ${resto}.`;
    }
    case 'percentile':
      return `Percentil dentro de una distribución de referencia de ${spec.size} valores${
        spec.invert ? ', invertido (estar abajo puntúa más)' : ''
      }.`;
    case 'boolean': {
      const sí = spec.trueScore === null ? 'sin dato' : String(spec.trueScore);
      const no = spec.falseScore === null ? 'sin dato' : String(spec.falseScore);
      return `Booleano: sí → ${sí}; no → ${no}.`;
    }
    case 'band':
      return `Banda óptima: 100 entre ${spec.idealMin} y ${spec.idealMax}; baja linealmente hasta 0 en ${spec.hardMin} y en ${spec.hardMax}; fuera de ese rango, 0.`;
    default: {
      // Exhaustividad comprobada en tiempo de compilación.
      const never: never = spec;
      return String(never);
    }
  }
}
