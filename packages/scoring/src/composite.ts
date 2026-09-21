/**
 * Combinación ponderada de factores y cálculo de confianza.
 *
 * El problema central es qué hacer con lo que falta. Hay dos políticas posibles y ambas
 * se declaran, nunca se improvisan:
 *
 *  - `renormalize`: se reparte el peso de los factores sin dato entre los que sí lo tienen.
 *    El puntaje sale, pero baja la `confidence`. Es la política por omisión porque casi
 *    ningún territorio del país tiene las 34 capas completas.
 *  - `null_result`: si falta cualquier peso, el puntaje es `null`. Se usa cuando comparar
 *    con datos parciales sería engañoso.
 *
 * En ninguna de las dos un dato faltante se convierte en 0.
 */

import type { FactorScore } from '@terracolombia/shared';
import { roundScore } from './normalize.js';

export type MissingPolicy = 'renormalize' | 'null_result';

export const DEFAULT_MISSING_POLICY: MissingPolicy = 'renormalize';

/**
 * Confianza mínima (proporción del peso total que sí tuvo dato) para publicar un puntaje.
 * Por debajo de esto el puntaje sale `null`: con menos de la mitad del peso respaldado, un
 * número redondo sería una ilusión de precisión.
 */
export const MIN_CONFIDENCE = 0.5;

/** Decimales del puntaje compuesto que se muestra al usuario. */
export const COMPOSITE_DECIMALS = 1;

export interface WeightedScore {
  indicator: string;
  /** 0–100 ya normalizado y orientado, o `null` si no hay dato. */
  score: number | null;
  weight: number;
}

export interface CompositeResult {
  /** Puntaje 0–100, o `null` según la política y la confianza. */
  score: number | null;
  /** Proporción del peso total que sí tuvo dato (0–1). */
  confidence: number;
  /** Peso que aportó dato, ya normalizado a 1. */
  usedWeight: number;
  /** Suma de los pesos declarados, antes de renormalizar. */
  declaredWeight: number;
  /** Indicadores sin dato, en el orden en que llegaron. */
  missing: string[];
  policy: MissingPolicy;
  /** Aviso en español cuando el resultado está limitado por datos faltantes. */
  notes: string[];
}

/**
 * Renormaliza un mapa de pesos para que sume 1. Los pesos negativos se rechazan (un peso
 * negativo invertiría la dirección del indicador a escondidas; para eso existen los
 * ajustes de orientación declarados).
 */
export function normalizeWeights<K extends string>(
  weights: Readonly<Partial<Record<K, number>>>,
): Record<string, number> {
  const entries = Object.entries(weights).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]),
  );
  for (const [key, value] of entries) {
    if (value < 0) throw new RangeError(`Peso negativo no permitido en "${key}": ${value}`);
  }
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  const out: Record<string, number> = {};
  if (total <= 0) {
    // Sin pesos útiles, se reparte por igual: es explícito y determinista.
    const share = entries.length > 0 ? 1 / entries.length : 0;
    for (const [key] of entries) out[key] = share;
    return out;
  }
  for (const [key, value] of entries) out[key] = value / total;
  return out;
}

/**
 * Aplica las sobrescrituras de peso que envía el usuario sobre los pesos por omisión y
 * renormaliza. Solo se aceptan claves que ya estén en la plantilla o el perfil: el usuario
 * ajusta la importancia de los indicadores, no agrega indicadores arbitrarios.
 */
export function applyWeightOverrides<K extends string>(
  base: Readonly<Partial<Record<K, number>>>,
  overrides: Readonly<Record<string, number>> | undefined,
): { weights: Record<string, number>; ignored: string[] } {
  const merged: Record<string, number> = {};
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'number') merged[key] = value;
  }
  const ignored: string[] = [];
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (!(key in merged)) {
        ignored.push(key);
        continue;
      }
      if (!Number.isFinite(value) || value < 0) {
        ignored.push(key);
        continue;
      }
      merged[key] = value;
    }
  }
  return { weights: normalizeWeights(merged), ignored };
}

/**
 * Combina factores ponderados. `items` trae los pesos ya renormalizados o sin normalizar:
 * la función normaliza internamente, así que da lo mismo.
 */
export function combine(
  items: readonly WeightedScore[],
  options: { policy?: MissingPolicy; minConfidence?: number } = {},
): CompositeResult {
  const policy = options.policy ?? DEFAULT_MISSING_POLICY;
  const minConfidence = options.minConfidence ?? MIN_CONFIDENCE;

  let declaredWeight = 0;
  let availableWeight = 0;
  let weightedSum = 0;
  const missing: string[] = [];

  for (const item of items) {
    const weight = Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0;
    declaredWeight += weight;
    if (item.score === null || !Number.isFinite(item.score)) {
      if (weight > 0) missing.push(item.indicator);
      continue;
    }
    availableWeight += weight;
    weightedSum += item.score * weight;
  }

  const confidence = declaredWeight > 0 ? availableWeight / declaredWeight : 0;
  const notes: string[] = [];

  if (declaredWeight === 0) {
    return {
      score: null,
      confidence: 0,
      usedWeight: 0,
      declaredWeight: 0,
      missing,
      policy,
      notes: ['No hay indicadores con peso para combinar.'],
    };
  }

  if (missing.length > 0) {
    notes.push(
      `Faltan ${missing.length} de ${items.length} indicadores. Los que faltan no cuentan como cero: se excluyen del cálculo y se listan aparte.`,
    );
  }

  if (policy === 'null_result' && missing.length > 0) {
    notes.push('Política declarada: sin todos los indicadores no se publica puntaje.');
    return {
      score: null,
      confidence: roundConfidence(confidence),
      usedWeight: availableWeight / declaredWeight,
      declaredWeight,
      missing,
      policy,
      notes,
    };
  }

  if (availableWeight === 0) {
    notes.push('Ningún indicador tuvo dato en esta zona.');
    return {
      score: null,
      confidence: 0,
      usedWeight: 0,
      declaredWeight,
      missing,
      policy,
      notes,
    };
  }

  if (confidence < minConfidence) {
    notes.push(
      `Solo el ${Math.round(confidence * 100)} % del peso tuvo dato, por debajo del mínimo del ${Math.round(
        minConfidence * 100,
      )} % que exigimos para publicar un puntaje.`,
    );
    return {
      score: null,
      confidence: roundConfidence(confidence),
      usedWeight: availableWeight / declaredWeight,
      declaredWeight,
      missing,
      policy,
      notes,
    };
  }

  return {
    score: roundScore(weightedSum / availableWeight, COMPOSITE_DECIMALS),
    confidence: roundConfidence(confidence),
    usedWeight: availableWeight / declaredWeight,
    declaredWeight,
    missing,
    policy,
    notes,
  };
}

/** Atajo: combina directamente un desglose de factores. */
export function combineFactors(
  factors: readonly FactorScore[],
  options: { policy?: MissingPolicy; minConfidence?: number } = {},
): CompositeResult {
  return combine(
    factors.map((f) => ({ indicator: f.indicator, score: f.score, weight: f.weight })),
    options,
  );
}

export function roundConfidence(confidence: number): number {
  return Math.round(confidence * 1000) / 1000;
}

/**
 * Aporte de cada factor al puntaje final, en puntos. Sirve para responder "¿qué está
 * empujando este resultado?" sin que el usuario tenga que multiplicar a mano.
 */
export interface FactorContribution {
  indicator: string;
  label: string;
  score: number | null;
  weight: number;
  /** `score * weight / pesoConDato`: cuántos puntos del total aporta este factor. */
  contribution: number | null;
}

export function factorContributions(factors: readonly FactorScore[]): FactorContribution[] {
  let availableWeight = 0;
  for (const f of factors) {
    if (f.score !== null && Number.isFinite(f.score) && f.weight > 0) availableWeight += f.weight;
  }
  return factors.map((f) => ({
    indicator: f.indicator,
    label: f.label,
    score: f.score,
    weight: f.weight,
    contribution:
      f.score === null || availableWeight === 0
        ? null
        : roundScore((f.score * f.weight) / availableWeight, COMPOSITE_DECIMALS),
  }));
}
