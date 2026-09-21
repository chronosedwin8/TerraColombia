/**
 * M6 — Puntuación de celdas H3 y agrupación en zonas.
 *
 * `scoreCells` recibe celdas con sus valores crudos ya consultados (este paquete no toca
 * la base de datos), aplica la plantilla y devuelve celdas puntuadas **con su desglose por
 * factor**, ordenadas. `topZones` junta celdas contiguas en zonas y reporta el puntaje
 * agregado, también con desglose.
 *
 * Lo que el motor no hace: decir "abre en A". Muestra indicadores, deja fijar los pesos y
 * los umbrales, y explica por qué el orden quedó como quedó (PLAN.md §9).
 */

import type { FactorScore, NumericRange } from '@terracolombia/shared';
import { DISCLAIMERS, formatNumber } from '@terracolombia/shared';
import { cellAreaM2, cellCenter, resolutionOf, ring } from '@terracolombia/geo';
import {
  buildFactorScores,
  findIndicator,
  isIndicatorId,
  readInput,
  type IndicatorId,
  type IndicatorInputs,
} from './indicators.js';
import { combineFactors, applyWeightOverrides, type MissingPolicy } from './composite.js';
import {
  templateOverrides,
  templateSourceDatasetIds,
  templateWeights,
  type BusinessTemplate,
} from './templates.js';
import { isFiniteNumber, roundScore } from './normalize.js';

/** Celda de entrada: identificador H3 y los valores crudos de sus indicadores. */
export interface CellInput {
  h3: string;
  muniCode?: string | null;
  inputs: IndicatorInputs;
}

export interface CellExclusion {
  /** `filterId` de la plantilla o `threshold:<indicador>`. */
  id: string;
  label: string;
  reason: string;
}

export interface ScoredCell {
  h3: string;
  resolution: number | null;
  muniCode: string | null;
  center: [number, number] | null;
  /** 0–100, o `null` si no hubo datos suficientes. */
  score: number | null;
  /** Proporción del peso total que sí tuvo dato (0–1). */
  confidence: number;
  /** Desglose completo. Siempre presente, incluso en celdas descartadas. */
  factors: FactorScore[];
  excluded: boolean;
  exclusions: CellExclusion[];
  /** Indicadores sin dato en esta celda. */
  missing: string[];
  /** Posición en el orden, empezando en 1. `null` en celdas descartadas o sin puntaje. */
  rank: number | null;
}

export interface LocationIntelResult {
  templateId: string;
  templateName: string;
  /** Resolución H3 detectada en las celdas de entrada. */
  resolution: number | null;
  /** Pesos finalmente aplicados, renormalizados a 1. */
  weights: Record<string, number>;
  cells: ScoredCell[];
  evaluatedCount: number;
  excludedCount: number;
  sourceDatasetIds: string[];
  /** Explicación del orden, generada por la plantilla. */
  explanation: string;
  disclaimer: string;
  warnings: string[];
}

export interface ScoreCellsOptions {
  policy?: MissingPolicy;
  minConfidence?: number;
  /** Máximo de celdas devueltas, después de ordenar. */
  limit?: number;
}

const LOCATION_INTEL_DISCLAIMER = [
  'Este mapa ordena celdas según los pesos y los filtros que están puestos ahora: no es una recomendación de inversión ni un estudio de mercado.',
  DISCLAIMERS.notUrbanNorm,
  DISCLAIMERS.dataFreshness,
  DISCLAIMERS.coverage,
].join(' ');

function typedWeights(weights: Record<string, number>): Partial<Record<IndicatorId, number>> {
  const out: Partial<Record<IndicatorId, number>> = {};
  for (const [key, value] of Object.entries(weights)) {
    if (isIndicatorId(key)) out[key] = value;
  }
  return out;
}

function safeResolution(h3: string): number | null {
  try {
    return resolutionOf(h3);
  } catch {
    return null;
  }
}

function safeCenter(h3: string): [number, number] | null {
  try {
    return cellCenter(h3);
  } catch {
    return null;
  }
}

function safeAreaKm2(h3: string): number | null {
  try {
    return cellAreaM2(h3) / 1_000_000;
  } catch {
    return null;
  }
}

/** Vecinas inmediatas de una celda (sin incluirla). Si el índice no es válido, ninguna. */
function safeNeighbors(h3: string): string[] {
  try {
    return ring(h3, 1).filter((c) => c !== h3);
  } catch {
    return [];
  }
}

/** Texto del umbral, para explicar por qué se descartó una celda. */
function describeRange(range: NumericRange, unit: string | null): string {
  const u = unit ? ` ${unit}` : '';
  const parts: string[] = [];
  if (range.eq !== undefined) parts.push(`igual a ${formatNumber(range.eq, 2)}${u}`);
  if (range.gte !== undefined) parts.push(`al menos ${formatNumber(range.gte, 2)}${u}`);
  if (range.gt !== undefined) parts.push(`mayor que ${formatNumber(range.gt, 2)}${u}`);
  if (range.lte !== undefined) parts.push(`como máximo ${formatNumber(range.lte, 2)}${u}`);
  if (range.lt !== undefined) parts.push(`menor que ${formatNumber(range.lt, 2)}${u}`);
  return parts.join(' y ');
}

function violatesRange(value: number, range: NumericRange): boolean {
  if (range.eq !== undefined && value !== range.eq) return true;
  if (range.gte !== undefined && value < range.gte) return true;
  if (range.gt !== undefined && value <= range.gt) return true;
  if (range.lte !== undefined && value > range.lte) return true;
  if (range.lt !== undefined && value >= range.lt) return true;
  return false;
}

/**
 * Puntúa un conjunto de celdas con una plantilla.
 *
 * @param cells      Celdas con sus valores crudos ya consultados.
 * @param template   Plantilla de negocio.
 * @param weights    Pesos del usuario (se renormalizan; se ignoran claves ajenas).
 * @param thresholds Mínimos y máximos por indicador sobre el **valor crudo**. Una celda que
 *                   incumple queda descartada, pero se devuelve con su desglose y el motivo.
 */
export function scoreCells(
  cells: readonly CellInput[],
  template: BusinessTemplate,
  weights?: Record<string, number>,
  thresholds?: Record<string, NumericRange>,
  options: ScoreCellsOptions = {},
): LocationIntelResult {
  const { weights: finalWeights, ignored } = applyWeightOverrides(
    templateWeights(template),
    weights,
  );
  const overrides = templateOverrides(template);
  const indicatorWeights = typedWeights(finalWeights);
  const warnings: string[] = [];

  if (ignored.length > 0) {
    warnings.push(
      `Se ignoraron pesos que la plantilla "${template.name}" no contempla o que no eran válidos: ${ignored.join(', ')}.`,
    );
  }

  const validThresholds: { id: IndicatorId; range: NumericRange }[] = [];
  for (const [key, range] of Object.entries(thresholds ?? {})) {
    if (!isIndicatorId(key)) {
      warnings.push(`Se ignoró el umbral de "${key}": no es un indicador del catálogo.`);
      continue;
    }
    validThresholds.push({ id: key, range });
  }

  const scored: ScoredCell[] = cells.map((cell) => {
    const factors = buildFactorScores(cell.inputs, indicatorWeights, overrides);
    const composite = combineFactors(factors, {
      policy: options.policy,
      minConfidence: options.minConfidence,
    });

    const exclusions: CellExclusion[] = [];

    for (const filter of template.hardFilters) {
      const verdict = filter.excludes(cell.inputs);
      if (verdict === true) {
        exclusions.push({ id: filter.id, label: filter.label, reason: filter.description });
      }
    }

    for (const { id, range } of validThresholds) {
      const def = findIndicator(id);
      const raw = readInput(cell.inputs, id);
      if (!isFiniteNumber(raw)) continue; // Sin dato numérico no se puede descartar por umbral.
      if (violatesRange(raw, range)) {
        exclusions.push({
          id: `threshold:${id}`,
          label: def?.label ?? id,
          reason: `Pediste ${describeRange(range, def?.unit ?? null)} y esta celda tiene ${formatNumber(
            raw,
            2,
          )}${def?.unit ? ` ${def.unit}` : ''}.`,
        });
      }
    }

    return {
      h3: cell.h3,
      resolution: safeResolution(cell.h3),
      muniCode: cell.muniCode ?? null,
      center: safeCenter(cell.h3),
      score: composite.score,
      confidence: composite.confidence,
      factors,
      excluded: exclusions.length > 0,
      exclusions,
      missing: composite.missing,
      rank: null,
    };
  });

  // Orden determinista: primero las evaluables por puntaje descendente; los empates y las
  // celdas sin puntaje se ordenan por identificador para que dos corridas den lo mismo.
  scored.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    const sa = a.score;
    const sb = b.score;
    if (sa === null && sb === null) return a.h3.localeCompare(b.h3);
    if (sa === null) return 1;
    if (sb === null) return -1;
    if (sb !== sa) return sb - sa;
    return a.h3.localeCompare(b.h3);
  });

  let rank = 0;
  for (const cell of scored) {
    if (!cell.excluded && cell.score !== null) {
      rank += 1;
      cell.rank = rank;
    }
  }

  const limited =
    options.limit !== undefined && options.limit > 0 ? scored.slice(0, options.limit) : scored;

  const excludedCount = scored.filter((c) => c.excluded).length;
  const resolutions = new Set(
    scored.map((c) => c.resolution).filter((r): r is number => r !== null),
  );
  if (resolutions.size > 1) {
    warnings.push(
      'Las celdas recibidas mezclan varias resoluciones H3. Los puntajes siguen siendo válidos por celda, pero comparar celdas de distinto tamaño no es justo.',
    );
  }
  const missingEverywhere = countAlwaysMissing(scored, indicatorWeights);
  for (const id of missingEverywhere) {
    const def = findIndicator(id);
    warnings.push(
      `El indicador "${def?.label ?? id}" no tiene dato en ninguna celda del área. Su peso se repartió entre los demás y la confianza baja.`,
    );
  }

  return {
    templateId: template.id,
    templateName: template.name,
    resolution: resolutions.size === 1 ? ([...resolutions][0] ?? null) : null,
    weights: finalWeights,
    cells: limited,
    evaluatedCount: scored.length - excludedCount,
    excludedCount,
    sourceDatasetIds: templateSourceDatasetIds(template),
    explanation: template.explainRanking(scored),
    disclaimer: LOCATION_INTEL_DISCLAIMER,
    warnings,
  };
}

function countAlwaysMissing(
  cells: readonly ScoredCell[],
  weights: Partial<Record<IndicatorId, number>>,
): IndicatorId[] {
  if (cells.length === 0) return [];
  const out: IndicatorId[] = [];
  for (const key of Object.keys(weights)) {
    if (!isIndicatorId(key)) continue;
    const always = cells.every((cell) =>
      cell.factors.some((f) => f.indicator === key && f.score === null),
    );
    if (always) out.push(key);
  }
  return out;
}

// ─── Zonas ────────────────────────────────────────────────────────────────────

/** Percentil por omisión que define qué celdas entran a formar zonas. */
export const DEFAULT_ZONE_PERCENTILE = 75;
/** Celdas mínimas para que un grupo contiguo se considere una zona. */
export const DEFAULT_MIN_ZONE_CELLS = 2;
/** Zonas devueltas por omisión. */
export const DEFAULT_ZONE_LIMIT = 10;

export interface ZoneFactor {
  indicator: string;
  label: string;
  weight: number;
  unit: string | null;
  formula: string;
  sourceDatasetIds: string[];
  /** Promedio del puntaje del factor entre las celdas de la zona; `null` si ninguna tuvo dato. */
  meanScore: number | null;
  /** Celdas de la zona que sí tuvieron dato para este factor. */
  cellsWithData: number;
}

export interface Zone {
  id: string;
  rank: number;
  cells: string[];
  cellCount: number;
  areaKm2: number | null;
  center: [number, number] | null;
  scoreMean: number;
  scoreMax: number;
  scoreMin: number;
  confidenceMean: number;
  /** Desglose por factor de la zona: nunca se entrega un puntaje agregado solo. */
  factors: ZoneFactor[];
  summary: string;
}

export interface TopZonesOptions {
  /** Puntaje mínimo para entrar a una zona. Si se omite, se usa el percentil. */
  minScore?: number | null;
  /** Percentil de corte cuando no se fija `minScore` (0–100). */
  percentile?: number;
  minCells?: number;
  limit?: number;
}

/** Percentil de una muestra ya ordenada de menor a mayor, por interpolación lineal. */
function percentileOf(sortedAscending: readonly number[], percentile: number): number | null {
  if (sortedAscending.length === 0) return null;
  const p = Math.min(100, Math.max(0, percentile)) / 100;
  const position = p * (sortedAscending.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sortedAscending[lower];
  const high = sortedAscending[upper];
  if (low === undefined || high === undefined) return null;
  if (lower === upper) return low;
  return low + (high - low) * (position - lower);
}

/**
 * Agrupa celdas contiguas de puntaje alto en zonas. La contigüidad se calcula con la
 * vecindad hexagonal de H3; si un identificador no es válido, la celda queda como zona de
 * una sola celda en vez de romper el cálculo.
 */
export function topZones(cells: readonly ScoredCell[], options: TopZonesOptions = {}): Zone[] {
  const candidates = cells.filter(
    (c) => !c.excluded && c.score !== null && isFiniteNumber(c.score),
  );
  if (candidates.length === 0) return [];

  const scores = candidates
    .map((c) => c.score)
    .filter(isFiniteNumber)
    .slice()
    .sort((a, b) => a - b);

  const cutoff =
    options.minScore === undefined || options.minScore === null
      ? (percentileOf(scores, options.percentile ?? DEFAULT_ZONE_PERCENTILE) ?? 0)
      : options.minScore;

  const selected = candidates.filter((c) => (c.score ?? 0) >= cutoff);
  if (selected.length === 0) return [];

  const byId = new Map<string, ScoredCell>(selected.map((c) => [c.h3, c]));
  // Orden estable de recorrido: puntaje descendente y luego identificador.
  const order = selected
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.h3.localeCompare(b.h3));

  const visited = new Set<string>();
  const groups: ScoredCell[][] = [];

  for (const start of order) {
    if (visited.has(start.h3)) continue;
    const group: ScoredCell[] = [];
    const queue: string[] = [start.h3];
    visited.add(start.h3);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const cell = byId.get(current);
      if (!cell) continue;
      group.push(cell);
      for (const neighbor of safeNeighbors(current)) {
        if (visited.has(neighbor) || !byId.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    groups.push(group);
  }

  const minCells = options.minCells ?? DEFAULT_MIN_ZONE_CELLS;
  const zones = groups
    .filter((g) => g.length >= minCells)
    .map((g) => buildZone(g))
    .sort((a, b) => {
      if (b.scoreMean !== a.scoreMean) return b.scoreMean - a.scoreMean;
      return (a.cells[0] ?? '').localeCompare(b.cells[0] ?? '');
    });

  const limit = options.limit ?? DEFAULT_ZONE_LIMIT;
  return zones.slice(0, limit).map((zone, index) => ({
    ...zone,
    id: `zona-${index + 1}`,
    rank: index + 1,
    summary: zoneSummary(zone, index + 1),
  }));
}

function buildZone(group: readonly ScoredCell[]): Zone {
  const cellIds = group.map((c) => c.h3).sort((a, b) => a.localeCompare(b));
  const scores = group.map((c) => c.score).filter(isFiniteNumber);
  // `topZones` solo agrupa celdas con puntaje, así que `scores` nunca está vacío; el
  // guardado evita un NaN silencioso si alguien llama a esta función desde otro sitio.
  const scoreMean = scores.length === 0 ? 0 : scores.reduce((acc, v) => acc + v, 0) / scores.length;
  const confidenceMean =
    group.reduce((acc, c) => acc + c.confidence, 0) / (group.length === 0 ? 1 : group.length);

  let areaKm2: number | null = 0;
  for (const id of cellIds) {
    const area = safeAreaKm2(id);
    if (area === null) {
      areaKm2 = null;
      break;
    }
    areaKm2 += area;
  }

  const centers = cellIds
    .map((id) => safeCenter(id))
    .filter((c): c is [number, number] => c !== null);
  const center: [number, number] | null =
    centers.length === 0
      ? null
      : [
          roundCoord(centers.reduce((acc, c) => acc + c[0], 0) / centers.length),
          roundCoord(centers.reduce((acc, c) => acc + c[1], 0) / centers.length),
        ];

  return {
    id: 'zona',
    rank: 0,
    cells: cellIds,
    cellCount: cellIds.length,
    areaKm2: areaKm2 === null ? null : roundScore(areaKm2, 3),
    center,
    scoreMean: roundScore(scoreMean, 1),
    scoreMax: scores.length === 0 ? 0 : roundScore(Math.max(...scores), 1),
    scoreMin: scores.length === 0 ? 0 : roundScore(Math.min(...scores), 1),
    confidenceMean: Math.round(confidenceMean * 1000) / 1000,
    factors: zoneFactors(group),
    summary: '',
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Promedio de cada factor dentro de la zona, conservando fórmula y fuentes. */
function zoneFactors(group: readonly ScoredCell[]): ZoneFactor[] {
  const accumulator = new Map<string, { factor: FactorScore; sum: number; count: number }>();
  for (const cell of group) {
    for (const factor of cell.factors) {
      const entry = accumulator.get(factor.indicator) ?? {
        factor,
        sum: 0,
        count: 0,
      };
      if (factor.score !== null) {
        entry.sum += factor.score;
        entry.count += 1;
      }
      accumulator.set(factor.indicator, entry);
    }
  }
  return [...accumulator.values()].map(({ factor, sum, count }) => ({
    indicator: factor.indicator,
    label: factor.label,
    weight: factor.weight,
    unit: factor.unit,
    formula: factor.formula,
    sourceDatasetIds: factor.sourceDatasetIds,
    meanScore: count === 0 ? null : roundScore(sum / count, 1),
    cellsWithData: count,
  }));
}

function zoneSummary(zone: Zone, rank: number): string {
  const area =
    zone.areaKm2 === null ? 'superficie no calculable' : `${formatNumber(zone.areaKm2, 2)} km²`;
  const best = zone.factors
    .filter((f) => f.meanScore !== null)
    .sort((a, b) => (b.meanScore ?? 0) * b.weight - (a.meanScore ?? 0) * a.weight)
    .slice(0, 2)
    .map((f) => f.label.toLowerCase());
  const drivers = best.length > 0 ? ` Lo que más la empuja: ${best.join(' y ')}.` : '';
  const confidence = Math.round(zone.confidenceMean * 100);
  return `Zona ${rank}: ${formatNumber(zone.cellCount)} celdas contiguas (${area}), puntaje promedio ${formatNumber(
    zone.scoreMean,
    1,
  )} de 100 y confianza del ${confidence} % (parte del peso que sí tuvo datos).${drivers}`;
}
