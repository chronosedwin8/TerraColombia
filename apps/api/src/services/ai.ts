import { getLogger, GLOSSARY, MESSAGES } from '@terracolombia/shared';
import { loadConfig } from '../config.js';

/**
 * Adaptador sobre `packages/ai`. Guardas de §13 del plan:
 *  - el asistente solo llama herramientas tipadas, nunca genera SQL;
 *  - toda cifra de la respuesta debe estar respaldada por los datos que se le pasaron;
 *  - sin llave configurada, se degrada a explicaciones deterministas y lo declara.
 */

export type ToolHandler = (input: unknown) => Promise<unknown>;

export interface AssistantResult {
  answer: string;
  mode: 'llm' | 'template' | 'unavailable';
  toolCalls: Array<{ name: string; input: unknown }>;
  evidence: Record<string, unknown>;
  rejected: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let aiModule: any = null;
let aiModuleFailed = false;

async function loadAi(): Promise<any | null> {
  if (aiModule) return aiModule;
  if (aiModuleFailed) return null;
  try {
    aiModule = await import('@terracolombia/ai');
    return aiModule;
  } catch (err) {
    aiModuleFailed = true;
    getLogger({ mod: 'ai' }).warn(
      { err: err instanceof Error ? err.message : String(err) },
      'No se pudo cargar @terracolombia/ai: el asistente usará explicaciones plantilladas',
    );
    return null;
  }
}

export async function isAssistantEnabled(): Promise<boolean> {
  const config = loadConfig();
  if (!config.anthropicApiKey) return false;
  const mod = await loadAi();
  return Boolean(mod && typeof mod.ask === 'function');
}

export async function askAssistant(
  question: string,
  context: Record<string, unknown>,
  tools: Record<string, ToolHandler>,
): Promise<AssistantResult> {
  const mod = await loadAi();
  const config = loadConfig();

  if (!mod || !config.anthropicApiKey || typeof mod.ask !== 'function') {
    // Sin IA no se improvisa una respuesta: se dice qué sí se puede hacer.
    return {
      answer:
        'La pregunta en lenguaje natural no está disponible en este despliegue porque no hay un modelo ' +
        'configurado. Puedes usar el buscador (dirección, municipio, código predial o coordenadas), ' +
        'la búsqueda avanzada de predios y el botón "Explícame esto" de cada dato, que funcionan sin IA.',
      mode: 'unavailable',
      toolCalls: [],
      evidence: {},
      rejected: false,
    };
  }

  const result = await mod.ask({
    question,
    context,
    tools,
    model: config.anthropicModel,
    apiKey: config.anthropicApiKey,
  });

  return {
    answer: String(result?.answer ?? MESSAGES.ai.noData),
    mode: result?.mode === 'template' ? 'template' : 'llm',
    toolCalls: Array.isArray(result?.toolCalls) ? result.toolCalls : [],
    evidence: (result?.evidence ?? {}) as Record<string, unknown>,
    rejected: Boolean(result?.rejected),
  };
}

export async function explainWithAssistant(
  subject: string,
  value: unknown,
  context: Record<string, unknown>,
): Promise<AssistantResult> {
  const mod = await loadAi();
  const config = loadConfig();

  // Camino determinista: siempre disponible, y es el que se usa si no hay llave.
  const template = templateExplanation(subject, value, context);

  if (!mod || !config.anthropicApiKey || typeof mod.explain !== 'function') {
    return { answer: template, mode: 'template', toolCalls: [], evidence: { context }, rejected: false };
  }

  try {
    const result = await mod.explain({
      subject,
      value,
      context,
      fallback: template,
      model: config.anthropicModel,
      apiKey: config.anthropicApiKey,
    });
    return {
      answer: String(result?.answer ?? template),
      mode: result?.mode === 'template' ? 'template' : 'llm',
      toolCalls: [],
      evidence: (result?.evidence ?? { context }) as Record<string, unknown>,
      rejected: Boolean(result?.rejected),
    };
  } catch (err) {
    getLogger({ mod: 'ai' }).warn(
      { err: err instanceof Error ? err.message : String(err) },
      'El modelo falló: se devuelve la explicación plantillada',
    );
    return { answer: template, mode: 'template', toolCalls: [], evidence: { context }, rejected: false };
  }
}

/**
 * Explicación determinista. Se construye con el glosario, la ficha del indicador cuando
 * viene en el contexto, y el valor concreto. Nunca añade cifras que no se le hayan pasado.
 */
function templateExplanation(
  subject: string,
  value: unknown,
  context: Record<string, unknown>,
): string {
  const indicator = context.indicator as
    | { label?: string; unit?: string; formula?: string; direction?: string; explanation?: string }
    | undefined;

  if (indicator) {
    const parts: string[] = [];
    parts.push(`${indicator.label ?? subject}.`);
    if (value !== undefined && value !== null) {
      parts.push(`El valor en esta zona es ${String(value)}${indicator.unit ? ` ${indicator.unit}` : ''}.`);
    }
    if (indicator.formula) parts.push(`Cómo se calcula: ${indicator.formula}`);
    if (indicator.direction === 'higher_is_better') {
      parts.push('En este indicador, más alto es mejor para el uso que elegiste.');
    } else if (indicator.direction === 'lower_is_better') {
      parts.push('En este indicador, más bajo es mejor para el uso que elegiste.');
    }
    if (indicator.explanation) parts.push(indicator.explanation);
    return parts.join(' ');
  }

  const term = GLOSSARY.find(
    (g) => g.id === subject || g.term.toLowerCase() === subject.toLowerCase(),
  );
  if (term) {
    const extra = term.detail ? `\n\n${term.detail}` : '';
    const src = term.source ? `\n\nFuente del concepto: ${term.source}.` : '';
    const val =
      value !== undefined && value !== null ? `\n\nEl valor que estás viendo es ${String(value)}.` : '';
    return `${term.plain}${val}${extra}${src}`;
  }

  return (
    `No tenemos una explicación preparada para "${subject}". ` +
    'Si es un término técnico, revisa el glosario en /api/v1/glossary; si es un indicador, ' +
    'su definición y su fórmula están en la respuesta del análisis, en el campo `factors`.'
  );
}
