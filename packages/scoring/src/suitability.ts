/**
 * M5 — Aptitud de terreno.
 *
 * `evaluateSuitability(use, inputs, weightOverrides?)` cruza los indicadores de un predio
 * o de un área contra el perfil del uso objetivo y devuelve un `SuitabilityResult` del
 * contrato compartido: veredicto en español, puntaje, **desglose completo por factor**,
 * bloqueos, precauciones, datos faltantes y descargo legal.
 *
 * Nunca devuelve solo el puntaje: `factors` viene siempre lleno, con la fórmula, la fuente
 * y la explicación de cada factor. Un número sin desglose no es explicable, y en este
 * producto lo que no es explicable no se muestra.
 */

import type { FactorScore, SuitabilityResult, TargetUse } from '@terracolombia/shared';
import { DISCLAIMERS, MESSAGES } from '@terracolombia/shared';
import {
  buildFactorScores,
  findIndicator,
  isIndicatorId,
  type IndicatorId,
  type IndicatorInputs,
} from './indicators.js';
import {
  combineFactors,
  factorContributions,
  applyWeightOverrides,
  type CompositeResult,
  type FactorContribution,
  type MissingPolicy,
} from './composite.js';
import { USE_PROFILES, type BlockerRule, type UseProfile } from './use-profiles.js';

export type Verdict = SuitabilityResult['verdict'];

export interface SuitabilityOptions {
  /** Política ante datos faltantes; por omisión `renormalize`. */
  policy?: MissingPolicy;
  /** Confianza mínima para publicar puntaje; por omisión la del motor. */
  minConfidence?: number;
}

/** Resultado con el detalle interno que la API usa para armar la respuesta y el informe. */
export interface DetailedSuitability {
  result: SuitabilityResult;
  profile: UseProfile;
  composite: CompositeResult;
  contributions: FactorContribution[];
  /** Pesos finales usados, ya renormalizados a 1. */
  weights: Record<string, number>;
  /** Claves de `weights` enviadas por el usuario que se ignoraron y por qué. */
  ignoredWeightKeys: string[];
  /** Reglas de bloqueo que no se pudieron evaluar por falta de datos. */
  undeterminedBlockers: string[];
}

const NOT_A_VERDICT_NOTE =
  'Este resultado es un indicador orientativo construido con datos públicos: no es una autorización, ni una licencia, ni un concepto jurídico.';

/** Descargos que aplican según los factores que entraron en el cálculo. */
function buildDisclaimer(factors: readonly FactorScore[]): string {
  const ids = new Set(factors.map((f) => f.indicator));
  const parts: string[] = [NOT_A_VERDICT_NOTE, DISCLAIMERS.notUrbanNorm];
  const hasHazard =
    ids.has('hazard_landslide_level') ||
    ids.has('hazard_flood_level') ||
    ids.has('hazard_seismic_level');
  if (hasHazard) parts.push(DISCLAIMERS.hazardScale);
  if (ids.has('land_cadastral_value_per_m2')) parts.push(DISCLAIMERS.notAppraisal);
  parts.push(DISCLAIMERS.dataFreshness);
  return parts.join(' ');
}

/** Solo se aceptan pesos de indicadores que el perfil ya contempla. */
function toIndicatorWeights(weights: Record<string, number>): Partial<Record<IndicatorId, number>> {
  const out: Partial<Record<IndicatorId, number>> = {};
  for (const [key, value] of Object.entries(weights)) {
    if (isIndicatorId(key)) out[key] = value;
  }
  return out;
}

interface BlockerOutcome {
  messages: string[];
  undetermined: string[];
  blockedIndicators: Set<string>;
}

/**
 * Los bloqueos vienen de dos sitios, y los dos cuentan:
 *  1. las reglas del perfil, que miran varios indicadores a la vez (por ejemplo el
 *     solapamiento con un área protegida junto con su categoría de manejo);
 *  2. el semáforo del propio indicador, cuando su `flagFor` devuelve `blocker`
 *     (pendiente por encima del 45 %, amenaza alta, territorio étnico, suelo de
 *     protección del POT…).
 */
function evaluateBlockers(
  rules: readonly BlockerRule[],
  inputs: IndicatorInputs,
  factors: readonly FactorScore[],
): BlockerOutcome {
  const messages: string[] = [];
  const undetermined: string[] = [];
  const blockedIndicators = new Set<string>();

  for (const rule of rules) {
    const verdict = rule.applies(inputs);
    if (verdict === null) {
      undetermined.push(
        `${rule.label}: no tenemos los datos para verificarlo, así que no lo damos por descartado.`,
      );
      continue;
    }
    if (!verdict) continue;
    messages.push(rule.message(inputs));
    for (const id of rule.indicators) blockedIndicators.add(id);
  }

  for (const factor of factors) {
    if (factor.flag !== 'blocker') continue;
    blockedIndicators.add(factor.indicator);
    messages.push(factor.explanation);
  }

  return { messages: dedupe(messages), undetermined, blockedIndicators };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function describeMissing(factor: FactorScore, required: boolean): string {
  const suffix = required ? ' — es obligatorio para este uso' : '';
  const note = findIndicator(factor.indicator)?.missingNote;
  return `${factor.label}${suffix}: ${MESSAGES.common.notAvailable}.${note ? ` ${note}` : ''}`;
}

/**
 * Evalúa la aptitud de un predio o área para un uso objetivo.
 *
 * @param use            Uso objetivo (`TARGET_USES`).
 * @param inputs         Valores crudos ya consultados por la API. Este paquete no accede
 *                       a base de datos.
 * @param weightOverrides Pesos por indicador enviados por el usuario (0–1). Se renormalizan
 *                       y se ignoran las claves que el perfil no contempla.
 */
export function evaluateSuitability(
  use: TargetUse,
  inputs: IndicatorInputs,
  weightOverrides?: Record<string, number>,
  options: SuitabilityOptions = {},
): SuitabilityResult {
  return evaluateSuitabilityDetailed(use, inputs, weightOverrides, options).result;
}

export function evaluateSuitabilityDetailed(
  use: TargetUse,
  inputs: IndicatorInputs,
  weightOverrides?: Record<string, number>,
  options: SuitabilityOptions = {},
): DetailedSuitability {
  const profile = USE_PROFILES[use];

  // 1. Pesos: los del perfil, ajustados por el usuario y renormalizados a 1.
  const { weights, ignored } = applyWeightOverrides(profile.weights, weightOverrides);

  // 2. Desglose completo. Todos los indicadores con peso aparecen, tengan dato o no.
  const factors = buildFactorScores(inputs, toIndicatorWeights(weights), profile.overrides);

  // 3. Bloqueos duros.
  const blockerOutcome = evaluateBlockers(profile.blockers, inputs, factors);
  for (const factor of factors) {
    if (blockerOutcome.blockedIndicators.has(factor.indicator)) factor.flag = 'blocker';
  }

  // 4. Combinación ponderada, ignorando lo que falta pero sin convertirlo en cero.
  const composite = combineFactors(factors, {
    policy: options.policy ?? undefined,
    minConfidence: options.minConfidence ?? undefined,
  });

  // 5. Faltantes: se listan siempre, y se distingue lo obligatorio.
  const requiredSet = new Set<string>(profile.required);
  const missingFactors = factors.filter((f) => f.score === null);
  const missingRequired = missingFactors.filter((f) => requiredSet.has(f.indicator));
  const missing = missingFactors.map((f) => describeMissing(f, requiredSet.has(f.indicator)));
  for (const id of profile.required) {
    // Un obligatorio que ni siquiera tiene peso no puede aparecer en `factors`; se reporta
    // igual para no esconderlo (situación que los tests del paquete impiden que ocurra).
    if (factors.some((f) => f.indicator === id)) continue;
    const def = findIndicator(id);
    missing.push(
      `${def?.label ?? id} — es obligatorio para este uso: ${MESSAGES.common.notAvailable}.`,
    );
  }

  const cautions = dedupe(
    factors.filter((f) => f.flag === 'caution').map((f) => f.explanation),
  ).concat(blockerOutcome.undetermined);

  // 6. Veredicto.
  const hasBlockers = blockerOutcome.messages.length > 0;
  const lacksRequired = missingRequired.length > 0 || missing.length > missingFactors.length;
  const score = lacksRequired ? null : composite.score;

  let verdict: Verdict;
  if (hasBlockers) {
    verdict = 'desfavorable';
  } else if (lacksRequired || score === null) {
    verdict = 'sin_datos';
  } else if (score >= profile.thresholds.favorable) {
    // Una precaución nunca queda escondida detrás de un puntaje alto.
    verdict = cautions.length > 0 ? 'condicionado' : 'favorable';
  } else if (score >= profile.thresholds.conditioned) {
    verdict = 'condicionado';
  } else {
    verdict = 'desfavorable';
  }

  const result: SuitabilityResult = {
    targetUse: profile.use,
    targetUseLabel: profile.label,
    score,
    verdict,
    verdictLabel: MESSAGES.suitability[verdict],
    factors,
    blockers: blockerOutcome.messages,
    cautions,
    missing,
    disclaimer: buildDisclaimer(factors),
  };

  return {
    result,
    profile,
    composite,
    contributions: factorContributions(factors),
    weights,
    ignoredWeightKeys: ignored,
    undeterminedBlockers: blockerOutcome.undetermined,
  };
}

/** Texto de ayuda del veredicto, para mostrar bajo el semáforo. */
export function verdictHelp(verdict: Verdict): string {
  switch (verdict) {
    case 'favorable':
      return MESSAGES.suitability.favorableHelp;
    case 'condicionado':
      return MESSAGES.suitability.condicionadoHelp;
    case 'desfavorable':
      return MESSAGES.suitability.desfavorableHelp;
    case 'sin_datos':
      return MESSAGES.suitability.sinDatosHelp;
    default: {
      const never: never = verdict;
      return String(never);
    }
  }
}
