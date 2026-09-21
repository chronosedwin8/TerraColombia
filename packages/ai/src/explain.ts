/**
 * Explicaciones deterministas y plantilladas.
 *
 * Este módulo es la red de seguridad del asistente y, a la vez, su fuente de verdad:
 *  - funciona **sin IA** (sin `ANTHROPIC_API_KEY` el producto sigue explicando todo);
 *  - es lo que se publica cuando la guarda rechaza una respuesta generada;
 *  - es el texto base que la IA solo puede reescribir, nunca ampliar con cifras nuevas.
 *
 * Todo sale del catálogo de `@terracolombia/scoring` y del glosario de
 * `@terracolombia/shared`: aquí no se escribe conocimiento nuevo sobre el territorio.
 */

import {
  GLOSSARY,
  GLOSSARY_BY_ID,
  MESSAGES,
  TARGET_USES,
  formatNumber,
  type FactorScore,
  type GlossaryEntry,
  type SuitabilityResult,
  type TargetUse,
} from '@terracolombia/shared';
import {
  INDICATOR_LIST,
  USE_PROFILES,
  describeIndicatorCutpoints,
  findIndicator,
  normalizeCategoryKey,
  type BusinessTemplate,
  type IndicatorDefinition,
  type IndicatorValue,
} from '@terracolombia/scoring';
import { extractNumbers } from './guards.js';

export interface TemplatedExplanation {
  /** De dónde salió la explicación: útil para el log y para la interfaz. */
  kind: 'indicator' | 'glossary' | 'factor' | 'suitability' | 'template' | 'fallback';
  title: string;
  text: string;
  sourceDatasetIds: string[];
  glossaryId: string | null;
  caveat: string | null;
}

function isTargetUse(value: string): value is TargetUse {
  return (TARGET_USES as readonly string[]).includes(value);
}

/** Explicación completa de un indicador, con o sin un valor concreto. */
export function explainIndicator(
  indicatorId: string,
  value: IndicatorValue = null,
  targetUse?: string,
): TemplatedExplanation | null {
  const def = findIndicator(indicatorId);
  if (!def) return null;

  const override =
    targetUse !== undefined && isTargetUse(targetUse)
      ? USE_PROFILES[targetUse].overrides[def.id]
      : undefined;

  const formula = override?.formula ?? def.formula;
  const cutpoints = describeIndicatorCutpoints(def.id, override);
  const direction = describeDirection(override?.direction ?? def.direction);
  const explain = override?.explain ?? def.explain;
  const normalize = override?.normalize ?? def.normalize;
  const score = value === null ? null : normalize(value);

  const parts: string[] = [];
  parts.push(`**${def.label}**${def.unit ? ` (${def.unit})` : ''}.`);
  parts.push(`Qué mide: ${formula}`);
  parts.push(`Dirección: ${direction}`);
  parts.push(`Cómo se convierte a puntaje de 0 a 100: ${cutpoints}`);
  if (value !== null) {
    parts.push(`En este caso: ${explain(value, score)}`);
    parts.push(
      score === null
        ? `Puntaje: ${MESSAGES.common.notAvailable}.`
        : `Puntaje de este factor: ${formatNumber(score, 1)} de 100.`,
    );
  }
  if (override?.rationale) parts.push(`Para este uso: ${override.rationale}`);
  if (def.caveat) parts.push(`Ojo: ${def.caveat}`);
  parts.push(
    `Datos que usa: ${def.sourceDatasetIds.join(', ')}. Cada uno se muestra con su fecha de corte y su licencia.`,
  );
  if (def.glossaryId && GLOSSARY_BY_ID[def.glossaryId]) {
    parts.push(`Término relacionado en el glosario: ${GLOSSARY_BY_ID[def.glossaryId]?.term}.`);
  }

  return {
    kind: 'indicator',
    title: def.label,
    text: parts.join('\n\n'),
    sourceDatasetIds: [...def.sourceDatasetIds],
    glossaryId: def.glossaryId ?? null,
    caveat: def.caveat ?? null,
  };
}

function describeDirection(direction: IndicatorDefinition['direction']): string {
  switch (direction) {
    case 'higher_is_better':
      return 'más alto es mejor para el uso que estás evaluando.';
    case 'lower_is_better':
      return 'más bajo es mejor para el uso que estás evaluando.';
    case 'categorical':
      return 'no hay un "más es mejor": cada categoría o rango tiene su propio puntaje.';
    default: {
      const never: never = direction;
      return String(never);
    }
  }
}

/** Explicación de un término del glosario. */
export function explainGlossaryTerm(termId: string): TemplatedExplanation | null {
  const entry = GLOSSARY_BY_ID[termId] ?? findGlossaryByText(termId);
  if (!entry) return null;
  const parts = [`**${entry.term}**.`, entry.plain];
  if (entry.detail) parts.push(entry.detail);
  if (entry.source) parts.push(`Fuente del concepto: ${entry.source}.`);
  return {
    kind: 'glossary',
    title: entry.term,
    text: parts.join('\n\n'),
    sourceDatasetIds: [],
    glossaryId: entry.id,
    caveat: null,
  };
}

function findGlossaryByText(text: string): GlossaryEntry | undefined {
  const key = normalizeCategoryKey(text);
  if (key.length === 0) return undefined;
  return GLOSSARY.find((entry) => {
    const term = normalizeCategoryKey(entry.term);
    return term === key || normalizeCategoryKey(entry.id) === key || term.includes(key);
  });
}

/** Explicación de un factor ya calculado, tal como sale del motor. */
export function explainFactor(factor: FactorScore): TemplatedExplanation {
  const parts: string[] = [];
  parts.push(`**${factor.label}**: ${factor.explanation}`);
  parts.push(
    factor.score === null
      ? `Puntaje: ${MESSAGES.common.notAvailable}. Este factor no entró en el cálculo y no se reemplazó por cero.`
      : `Puntaje: ${formatNumber(factor.score, 1)} de 100, con un peso de ${formatNumber(
          factor.weight * 100,
          1,
        )} % en el resultado.`,
  );
  parts.push(`Cómo se calcula: ${factor.formula}`);
  parts.push(`${MESSAGES.common.sources}: ${factor.sourceDatasetIds.join(', ')}.`);
  return {
    kind: 'factor',
    title: factor.label,
    text: parts.join('\n\n'),
    sourceDatasetIds: [...factor.sourceDatasetIds],
    glossaryId: null,
    caveat: null,
  };
}

/** Explicación completa de un resultado de aptitud, con su desglose. */
export function explainSuitability(result: SuitabilityResult): TemplatedExplanation {
  const parts: string[] = [];
  parts.push(
    `**${result.targetUseLabel}: ${result.verdictLabel}**${
      result.score === null ? '' : ` (${formatNumber(result.score, 1)} de 100)`
    }.`,
  );

  if (result.blockers.length > 0) {
    parts.push('Restricciones fuertes que encontramos:');
    parts.push(result.blockers.map((b) => `- ${b}`).join('\n'));
  }
  if (result.cautions.length > 0) {
    parts.push('Puntos a revisar:');
    parts.push(result.cautions.map((c) => `- ${c}`).join('\n'));
  }

  const conDato = result.factors.filter((f) => f.score !== null);
  if (conDato.length > 0) {
    const ordenados = [...conDato].sort(
      (a, b) => (b.score ?? 0) * b.weight - (a.score ?? 0) * a.weight,
    );
    parts.push('Factores que más pesan en este resultado:');
    parts.push(
      ordenados
        .slice(0, 5)
        .map(
          (f) =>
            `- ${f.label}: ${formatNumber(f.score ?? 0, 1)} de 100 (peso ${formatNumber(
              f.weight * 100,
              1,
            )} %). ${f.explanation}`,
        )
        .join('\n'),
    );
  }

  if (result.missing.length > 0) {
    parts.push('Lo que no pudimos evaluar por falta de datos:');
    parts.push(result.missing.map((m) => `- ${m}`).join('\n'));
  }

  parts.push(result.disclaimer);

  const datasets = new Set<string>();
  for (const factor of result.factors) {
    for (const id of factor.sourceDatasetIds) datasets.add(id);
  }

  return {
    kind: 'suitability',
    title: `Aptitud para ${result.targetUseLabel.toLowerCase()}`,
    text: parts.join('\n\n'),
    sourceDatasetIds: [...datasets].sort(),
    glossaryId: null,
    caveat: null,
  };
}

/** Explicación de una plantilla de localización de negocio y de sus pesos. */
export function explainTemplate(template: BusinessTemplate): TemplatedExplanation {
  const parts: string[] = [`**${template.name}**. ${template.description}`];
  parts.push(`Para quién es: ${template.audience}`);
  parts.push('Qué mira y con qué peso:');
  parts.push(
    template.indicators
      .map((i) => {
        const def = findIndicator(i.indicator);
        return `- ${def?.label ?? i.indicator} — ${formatNumber(i.weight * 100, 1)} %: ${i.rationale}`;
      })
      .join('\n'),
  );
  if (template.hardFilters.length > 0) {
    parts.push('Qué descarta de entrada:');
    parts.push(template.hardFilters.map((f) => `- ${f.label}: ${f.description}`).join('\n'));
  }
  parts.push(
    'Los pesos son editables: si para tu negocio importa otra cosa, cámbialos y el mapa se recalcula. El motor no elige por ti.',
  );
  return {
    kind: 'template',
    title: template.name,
    text: parts.join('\n\n'),
    sourceDatasetIds: [],
    glossaryId: null,
    caveat: null,
  };
}

// ─── Respuesta plantillada a una pregunta libre ────────────────────────────────

const CAPABILITIES = [
  'explicar qué significa un dato de la ficha de un predio',
  'explicar cómo se calcula cada indicador y de dónde salen sus datos',
  'definir los términos técnicos del glosario (NPN, avalúo catastral, vocación de uso, POT, amenaza…)',
  'contar qué información tenemos para un municipio y quién es su gestor catastral',
];

export const FALLBACK_ANSWER = [
  'Puedo ayudarte con lo que salga de los datos que ya tenemos cargados. En concreto puedo:',
  CAPABILITIES.map((c) => `- ${c}`).join('\n'),
  'Si me preguntas algo que no está en nuestras fuentes, te lo voy a decir en vez de estimarlo. Y si el dato existe pero para otro municipio, también te lo digo.',
].join('\n\n');

export interface TemplatedAnswer {
  explanation: TemplatedExplanation;
  /** true si la pregunta coincidió con un indicador o un término del glosario. */
  matched: boolean;
}

/**
 * Respuesta determinista a una pregunta libre: busca el indicador o el término del glosario
 * que la pregunta menciona y devuelve su explicación. Si no encuentra nada, dice qué sí
 * puede hacer. Nunca inventa: es el modo sin IA del producto.
 */
export function templatedAnswer(question: string): TemplatedAnswer {
  const normalized = normalizeCategoryKey(question);

  for (const def of INDICATOR_LIST) {
    if (normalized.includes(normalizeCategoryKey(def.id))) {
      const explanation = explainIndicator(def.id);
      if (explanation) return { explanation, matched: true };
    }
  }
  for (const def of INDICATOR_LIST) {
    const label = normalizeCategoryKey(def.label);
    if (label.length >= 6 && normalized.includes(label)) {
      const explanation = explainIndicator(def.id);
      if (explanation) return { explanation, matched: true };
    }
  }
  for (const entry of GLOSSARY) {
    const term = normalizeCategoryKey(entry.term);
    const id = normalizeCategoryKey(entry.id);
    if (
      (term.length >= 4 && normalized.includes(term)) ||
      (id.length >= 4 && normalized.includes(id))
    ) {
      const explanation = explainGlossaryTerm(entry.id);
      if (explanation) return { explanation, matched: true };
    }
  }

  return {
    matched: false,
    explanation: {
      kind: 'fallback',
      title: 'Qué puedo responder',
      text: FALLBACK_ANSWER,
      sourceDatasetIds: [],
      glossaryId: null,
      caveat: null,
    },
  };
}

// ─── Cifras de referencia del propio producto ─────────────────────────────────

let referenceNumbersCache: number[] | null = null;

/**
 * Cifras que el producto declara en sus propios textos: puntos de corte de los indicadores,
 * fórmulas, glosario y escalas. La guarda las admite porque no son datos del territorio sino
 * la definición del método; si no se admitieran, el asistente no podría decir "por encima
 * del 45 % de pendiente" sin que la guarda lo tomara por inventado.
 */
export function catalogReferenceNumbers(): number[] {
  if (referenceNumbersCache) return referenceNumbersCache;
  const texts: string[] = [];
  for (const def of INDICATOR_LIST) {
    texts.push(def.formula, def.label, describeIndicatorCutpoints(def.id));
    if (def.caveat) texts.push(def.caveat);
    if (def.unit) texts.push(def.unit);
  }
  for (const use of TARGET_USES) {
    const profile = USE_PROFILES[use];
    for (const override of Object.values(profile.overrides)) {
      if (override?.formula) texts.push(override.formula);
      if (override?.rationale) texts.push(override.rationale);
    }
    for (const weight of Object.values(profile.weights)) {
      if (typeof weight === 'number') {
        texts.push(String(weight), String(Math.round(weight * 100)));
      }
    }
    texts.push(String(profile.thresholds.favorable), String(profile.thresholds.conditioned));
  }
  for (const entry of GLOSSARY) {
    texts.push(entry.term, entry.plain);
    if (entry.detail) texts.push(entry.detail);
    if (entry.source) texts.push(entry.source);
  }
  const numbers = new Set<number>();
  for (const text of texts) {
    for (const n of extractNumbers(text)) numbers.add(n.value);
  }
  referenceNumbersCache = [...numbers].sort((a, b) => a - b);
  return referenceNumbersCache;
}
