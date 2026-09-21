/**
 * Cliente del asistente.
 *
 * Dos modos, y el producto funciona en los dos:
 *
 *  - **`ai`**: hay `ANTHROPIC_API_KEY`. Se usa el bucle de *tool use* de la API de Anthropic
 *    con esquemas JSON estrictos. El modelo no recibe la base de datos ni puede escribir
 *    consultas: solo llamar las herramientas de `tools.ts`.
 *  - **`deterministic`**: no hay llave. El asistente responde con las explicaciones
 *    plantilladas del glosario y del catálogo de indicadores, y **lo declara** en la
 *    respuesta. Así el producto nunca depende de tener la llave.
 *
 * En los dos modos, toda respuesta pasa por las guardas de §13: PII fuera, inyección
 * detectada, y ninguna cifra sin respaldo en los datos consultados.
 */

import type AnthropicSdk from '@anthropic-ai/sdk';
import {
  DISCLAIMERS,
  MESSAGES,
  type FactorScore,
  type SourceRef,
  type SuitabilityResult,
} from '@terracolombia/shared';
import type { BusinessTemplate, IndicatorValue } from '@terracolombia/scoring';
import {
  buildNumberContext,
  guardAnswer,
  sanitizeUserInput,
  type NumberContext,
  type RejectionReason,
} from './guards.js';
import { redactObject } from './redact.js';
import {
  EXPLAIN_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildExplainMessage,
  buildQuestionMessage,
} from './prompts.js';
import {
  catalogReferenceNumbers,
  explainFactor,
  explainGlossaryTerm,
  explainIndicator,
  explainSuitability,
  explainTemplate,
  templatedAnswer,
  type TemplatedExplanation,
} from './explain.js';
import { assertNoFreeFormQueryTools, type AssistantTool, type ToolResult } from './tools.js';

/** Modelo por omisión. Se sobrescribe con la variable de entorno `ANTHROPIC_MODEL`. */
export const DEFAULT_MODEL = 'claude-sonnet-5';
/** Respuestas del asistente: cortas a propósito, se leen dentro de una tarjeta de la interfaz. */
export const DEFAULT_MAX_TOKENS = 4096;
/** Tope de vueltas del bucle de herramientas, para que una sesión no se vuelva infinita. */
export const DEFAULT_MAX_TOOL_ITERATIONS = 6;

export type AssistantMode = 'ai' | 'deterministic';

export interface AssistantLogger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

/** Superficie mínima del SDK que usa el asistente. Permite inyectar un doble en pruebas. */
export interface AnthropicMessagesApi {
  create: (params: AnthropicSdk.MessageCreateParamsNonStreaming) => Promise<AnthropicSdk.Message>;
}
export interface AnthropicClientLike {
  messages: AnthropicMessagesApi;
}

export interface AssistantConfig {
  /** Por omisión, `process.env.ANTHROPIC_API_KEY`. Sin llave, el modo es determinista. */
  apiKey?: string | null;
  /** Por omisión, `process.env.ANTHROPIC_MODEL` y, si falta, `DEFAULT_MODEL`. */
  model?: string;
  maxTokens?: number;
  maxToolIterations?: number;
  /** Herramientas con los handlers ya inyectados por la API. */
  tools?: AssistantTool[];
  logger?: AssistantLogger;
  /** Cliente ya construido: pruebas, o un adaptador de otra infraestructura. */
  client?: AnthropicClientLike;
}

export interface AskOptions {
  /** Datos ya calculados que la API pone delante del asistente (la ficha abierta, etc.). */
  context?: unknown;
  /** Cifras adicionales admisibles en la respuesta, además de las del contexto. */
  allowedNumbers?: number[];
  requestId?: string | null;
  muniCode?: string | null;
}

export interface ToolCallRecord {
  name: string;
  /** Entrada ya limpia de datos personales: es lo que se puede registrar. */
  input: unknown;
  ok: boolean;
  message: string | null;
  sources: SourceRef[];
}

export interface AssistantAnswer {
  answer: string;
  mode: AssistantMode;
  /** true si el texto lo escribió el modelo y pasó las guardas. */
  generated: boolean;
  /** true si se rechazó la respuesta del modelo y se publicó la plantillada. */
  rejected: boolean;
  rejectionReason: RejectionReason | null;
  /** Detalle del rechazo, para el log y el panel de calidad. */
  rejectionDetail: string[];
  toolCalls: ToolCallRecord[];
  sources: SourceRef[];
  disclaimer: string;
  warnings: string[];
  numbersChecked: number;
}

export type ExplainInput =
  | { kind: 'indicator'; indicatorId: string; value?: IndicatorValue; targetUse?: string }
  | { kind: 'glossary'; termId: string }
  | { kind: 'factor'; factor: FactorScore }
  | { kind: 'suitability'; result: SuitabilityResult }
  | { kind: 'template'; template: BusinessTemplate }
  | { kind: 'text'; title: string; text: string; sourceDatasetIds?: string[] };

export interface Assistant {
  readonly mode: AssistantMode;
  readonly model: string;
  /** Pregunta en lenguaje natural. */
  ask: (question: string, options?: AskOptions) => Promise<AssistantAnswer>;
  /** Botón "Explícame esto": la IA solo reescribe el texto determinista. */
  explain: (input: ExplainInput, options?: AskOptions) => Promise<AssistantAnswer>;
}

// ─── Carga diferida del SDK ───────────────────────────────────────────────────

type AnthropicModule = typeof import('@anthropic-ai/sdk');

let cachedModule: AnthropicModule | null = null;

/**
 * Se importa el SDK solo cuando hay llave. Así el modo determinista funciona incluso si la
 * dependencia no está instalada en ese entorno.
 */
async function loadSdk(): Promise<AnthropicModule> {
  if (!cachedModule) cachedModule = await import('@anthropic-ai/sdk');
  return cachedModule;
}

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const AI_DISCLAIMER = MESSAGES.ai.disclaimer;
const DETERMINISTIC_NOTE =
  'Respuesta generada sin asistente de IA: es el texto explicativo del propio producto, armado con el glosario y la ficha de cada indicador.';

function templatedFor(input: ExplainInput): TemplatedExplanation {
  switch (input.kind) {
    case 'indicator': {
      const explanation = explainIndicator(input.indicatorId, input.value ?? null, input.targetUse);
      return (
        explanation ?? {
          kind: 'fallback',
          title: 'Indicador no encontrado',
          text: `No tenemos un indicador con el identificador "${input.indicatorId}". ${MESSAGES.common.notAvailableLong}.`,
          sourceDatasetIds: [],
          glossaryId: null,
          caveat: null,
        }
      );
    }
    case 'glossary': {
      const explanation = explainGlossaryTerm(input.termId);
      return (
        explanation ?? {
          kind: 'fallback',
          title: 'Término no encontrado',
          text: `No tenemos una entrada de glosario para "${input.termId}". ${MESSAGES.common.notAvailableLong}.`,
          sourceDatasetIds: [],
          glossaryId: null,
          caveat: null,
        }
      );
    }
    case 'factor':
      return explainFactor(input.factor);
    case 'suitability':
      return explainSuitability(input.result);
    case 'template':
      return explainTemplate(input.template);
    case 'text':
      return {
        kind: 'fallback',
        title: input.title,
        text: input.text,
        sourceDatasetIds: input.sourceDatasetIds ?? [],
        glossaryId: null,
        caveat: null,
      };
    default: {
      const never: never = input;
      throw new Error(`Tipo de explicación no soportado: ${JSON.stringify(never)}`);
    }
  }
}

function collectSources(results: readonly ToolResult[]): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const result of results) {
    for (const source of result.sources) {
      const key = `${source.datasetId}|${source.cutDate ?? ''}`;
      if (!seen.has(key)) seen.set(key, source);
    }
  }
  return [...seen.values()];
}

function textOf(message: AnthropicSdk.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

function toolUsesOf(message: AnthropicSdk.Message): AnthropicSdk.ToolUseBlock[] {
  const out: AnthropicSdk.ToolUseBlock[] = [];
  for (const block of message.content) {
    if (block.type === 'tool_use') out.push(block);
  }
  return out;
}

/** Traduce un error del SDK a un mensaje en español, sin comparar cadenas de error. */
async function describeApiError(error: unknown): Promise<string> {
  try {
    const sdk = await loadSdk();
    if (error instanceof sdk.AuthenticationError) {
      return 'La llave de la API de IA no es válida. El asistente sigue funcionando en modo determinista.';
    }
    if (error instanceof sdk.RateLimitError) {
      return 'El asistente está recibiendo demasiadas peticiones. Intenta de nuevo en unos segundos.';
    }
    if (error instanceof sdk.APIConnectionError) {
      return 'No pudimos conectarnos al servicio de IA. Te mostramos la explicación del producto.';
    }
    if (error instanceof sdk.APIError) {
      return `El servicio de IA respondió con un error (${error.status ?? 'sin código'}). Te mostramos la explicación del producto.`;
    }
  } catch {
    // Si ni el SDK carga, se cae al mensaje genérico.
  }
  return 'El asistente de IA no está disponible ahora. Te mostramos la explicación del producto.';
}

// ─── Construcción ─────────────────────────────────────────────────────────────

export function createAssistant(config: AssistantConfig = {}): Assistant {
  const tools = config.tools ?? [];
  assertNoFreeFormQueryTools(tools);

  const apiKey = config.apiKey === undefined ? readEnv('ANTHROPIC_API_KEY') : config.apiKey;
  const model = config.model ?? readEnv('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxIterations = config.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const logger = config.logger ?? {};
  const injected = config.client ?? null;
  const mode: AssistantMode =
    injected !== null || (apiKey !== null && apiKey !== undefined) ? 'ai' : 'deterministic';

  let clientPromise: Promise<AnthropicClientLike> | null = null;

  async function getClient(): Promise<AnthropicClientLike> {
    if (injected) return injected;
    if (!clientPromise) {
      clientPromise = (async () => {
        const sdk = await loadSdk();
        return new sdk.default({ apiKey: apiKey ?? undefined });
      })();
    }
    return clientPromise;
  }

  const toolByName = new Map(tools.map((t) => [t.definition.name as string, t]));

  function toolPayload(): AnthropicSdk.Tool[] {
    return tools.map((tool) => ({
      name: tool.definition.name,
      description: tool.definition.description,
      // El esquema es cerrado (`additionalProperties: false`) y `strict` pide al servicio
      // que garantice que la entrada lo cumple. Aun así, `defineTool` la valida con Zod:
      // dos barreras, porque una sola barrera acaba fallando.
      input_schema: tool.definition.inputSchema as unknown as AnthropicSdk.Tool['input_schema'],
      strict: true,
    }));
  }

  /** Bucle de *tool use*. Devuelve el texto del modelo y lo que devolvieron las herramientas. */
  async function runToolLoop(
    systemPrompt: string,
    firstUserMessage: string,
    ctx: { requestId?: string | null; muniCode?: string | null },
  ): Promise<{
    text: string;
    toolCalls: ToolCallRecord[];
    results: ToolResult[];
    warnings: string[];
  }> {
    const client = await getClient();
    const messages: AnthropicSdk.MessageParam[] = [{ role: 'user', content: firstUserMessage }];
    const toolCalls: ToolCallRecord[] = [];
    const results: ToolResult[] = [];
    const warnings: string[] = [];
    const payload = toolPayload();

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
        ...(payload.length > 0 ? { tools: payload } : {}),
      });

      if (response.stop_reason === 'refusal') {
        warnings.push(
          'El asistente declinó responder esta pregunta. Te mostramos la explicación del producto.',
        );
        return { text: '', toolCalls, results, warnings };
      }

      const uses = toolUsesOf(response);
      if (response.stop_reason !== 'tool_use' || uses.length === 0) {
        if (response.stop_reason === 'max_tokens') {
          warnings.push('La respuesta se cortó por longitud.');
        }
        return { text: textOf(response), toolCalls, results, warnings };
      }

      // Los bloques del modelo se devuelven tal cual: es lo que exige el protocolo para
      // poder responder a cada `tool_use`.
      messages.push({
        role: 'assistant',
        content: response.content as unknown as AnthropicSdk.ContentBlockParam[],
      });

      // Todos los resultados van en un solo mensaje de usuario: partirlos le enseña al
      // modelo a dejar de pedir herramientas en paralelo.
      const resultBlocks: AnthropicSdk.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const tool = toolByName.get(use.name);
        if (!tool) {
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: `La herramienta "${use.name}" no existe. Usa solo las herramientas declaradas.`,
          });
          continue;
        }
        const result = await tool.handler(use.input, {
          requestId: ctx.requestId ?? null,
          muniCode: ctx.muniCode ?? null,
        });
        results.push(result);
        toolCalls.push({
          name: use.name,
          input: redactObject(use.input),
          ok: result.ok,
          message: result.message ?? null,
          sources: result.sources,
        });
        logger.debug?.('herramienta ejecutada', {
          tool: use.name,
          ok: result.ok,
          requestId: ctx.requestId ?? null,
        });
        resultBlocks.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: !result.ok,
          content: JSON.stringify({
            ok: result.ok,
            data: result.data,
            sources: result.sources,
            message: result.message ?? null,
          }),
        });
      }
      messages.push({ role: 'user', content: resultBlocks });
    }

    warnings.push(
      `El asistente alcanzó el máximo de ${maxIterations} consultas seguidas y se detuvo. Te mostramos lo que alcanzó a averiguar.`,
    );
    return { text: '', toolCalls, results, warnings };
  }

  function deterministicAnswer(
    text: string,
    warnings: string[],
    extra: Partial<AssistantAnswer> = {},
  ): AssistantAnswer {
    return {
      answer: text,
      mode: 'deterministic',
      generated: false,
      rejected: false,
      rejectionReason: null,
      rejectionDetail: [],
      toolCalls: [],
      sources: [],
      disclaimer: DETERMINISTIC_NOTE,
      warnings,
      numbersChecked: 0,
      ...extra,
    };
  }

  async function ask(question: string, options: AskOptions = {}): Promise<AssistantAnswer> {
    const sanitized = sanitizeUserInput(question);
    const fallback = templatedAnswer(sanitized.text);
    const warnings = [...sanitized.warnings];

    if (sanitized.pii.length > 0) {
      logger.warn?.('se eliminaron datos personales de la pregunta', {
        kinds: sanitized.pii.map((f) => f.kind),
        requestId: options.requestId ?? null,
      });
    }

    if (!sanitized.safeToSend) {
      logger.warn?.('intento de inyección de instrucciones', {
        patterns: sanitized.injection.matches.map((m) => m.pattern),
        requestId: options.requestId ?? null,
      });
      return deterministicAnswer(fallback.explanation.text, warnings, {
        mode,
        rejected: true,
        rejectionReason: 'injection_in_input',
        rejectionDetail: sanitized.injection.matches.map(
          (m) => `Patrón de inyección detectado: ${m.pattern}.`,
        ),
      });
    }

    if (mode === 'deterministic') {
      return deterministicAnswer(fallback.explanation.text, warnings);
    }

    let loop: Awaited<ReturnType<typeof runToolLoop>>;
    try {
      loop = await runToolLoop(
        SYSTEM_PROMPT,
        buildQuestionMessage(sanitized.text, options.context),
        options,
      );
    } catch (error) {
      const message = await describeApiError(error);
      logger.warn?.('falló la llamada al servicio de IA', { requestId: options.requestId ?? null });
      return deterministicAnswer(fallback.explanation.text, [...warnings, message], { mode });
    }

    const context = buildAnswerContext(
      [options.context, loop.results.map((r) => ({ data: r.data, sources: r.sources }))],
      options.allowedNumbers,
    );
    const guarded = guardAnswer(loop.text, context, fallback.explanation.text);

    if (!guarded.accepted) {
      logger.warn?.('respuesta rechazada por la guarda', {
        reason: guarded.reason,
        requestId: options.requestId ?? null,
        detail: guarded.detail,
      });
    }

    return {
      answer: guarded.text,
      mode: 'ai',
      generated: guarded.accepted,
      rejected: !guarded.accepted,
      rejectionReason: guarded.reason,
      rejectionDetail: guarded.detail,
      toolCalls: loop.toolCalls,
      sources: collectSources(loop.results),
      disclaimer: guarded.accepted ? AI_DISCLAIMER : DETERMINISTIC_NOTE,
      warnings: [...warnings, ...loop.warnings],
      numbersChecked: guarded.verification.checked,
    };
  }

  async function explain(input: ExplainInput, options: AskOptions = {}): Promise<AssistantAnswer> {
    const templated = templatedFor(input);

    if (mode === 'deterministic') {
      return deterministicAnswer(templated.text, []);
    }

    let response: AnthropicSdk.Message;
    try {
      const client = await getClient();
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: EXPLAIN_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildExplainMessage(templated.text, options.context) }],
      });
    } catch (error) {
      const message = await describeApiError(error);
      return deterministicAnswer(templated.text, [message], { mode });
    }

    if (response.stop_reason === 'refusal') {
      return deterministicAnswer(
        templated.text,
        ['El asistente declinó reescribir esta explicación. Te mostramos la versión del producto.'],
        { mode },
      );
    }

    // La reescritura no puede traer cifras nuevas: el contexto son las del propio texto
    // determinista más lo que el llamador declare.
    const context = buildAnswerContext([templated.text, options.context], options.allowedNumbers);
    const guarded = guardAnswer(textOf(response), context, templated.text);

    if (!guarded.accepted) {
      logger.warn?.('reescritura rechazada por la guarda', {
        reason: guarded.reason,
        detail: guarded.detail,
      });
    }

    return {
      answer: guarded.text,
      mode: 'ai',
      generated: guarded.accepted,
      rejected: !guarded.accepted,
      rejectionReason: guarded.reason,
      rejectionDetail: guarded.detail,
      toolCalls: [],
      sources: [],
      disclaimer: guarded.accepted ? AI_DISCLAIMER : DETERMINISTIC_NOTE,
      warnings: [],
      numbersChecked: guarded.verification.checked,
    };
  }

  return { mode, model, ask, explain };
}

/**
 * Contexto numérico de una respuesta: lo que devolvieron las herramientas, lo que el
 * llamador puso delante, y las cifras que el propio producto declara en su método
 * (puntos de corte, escalas, glosario). Sin esto último, el asistente no podría decir
 * "por encima del 45 % de pendiente" sin que la guarda lo tomara por inventado.
 */
export function buildAnswerContext(
  data: unknown,
  extraAllowed: readonly number[] = [],
): NumberContext {
  return buildNumberContext(data, [...catalogReferenceNumbers(), ...extraAllowed]);
}

/** Descargo que acompaña cualquier respuesta del asistente en la interfaz y en la API. */
export const ASSISTANT_DISCLAIMERS: readonly string[] = [
  MESSAGES.ai.disclaimer,
  DISCLAIMERS.notUrbanNorm,
  DISCLAIMERS.notAppraisal,
  DISCLAIMERS.noPersonalData,
];
