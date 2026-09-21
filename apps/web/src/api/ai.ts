import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AiAskResponse, AiExplainResponse, AiStatus } from './types';

/**
 * Pregunta en lenguaje natural (M11). El backend solo usa herramientas tipadas.
 *
 * Verificado: devuelve `{ answer, mode, toolCalls, evidence,
 * rejectedForUnsupportedNumbers, disclaimer }`. No hay `usedData` ni `missing`.
 * Cuando no hay modelo configurado, `mode` es `'unavailable'` y `answer` lo explica:
 * la UI debe mostrar eso, no un error.
 */
export function askAi(body: {
  question: string;
  /** Contexto de la vista actual para que el asistente no adivine el ámbito. */
  context?: { npn?: string; muniCode?: string; bbox?: [number, number, number, number] };
}): Promise<Envelope<AiAskResponse>> {
  return request<AiAskResponse>('/ai/ask', { method: 'POST', body });
}

/**
 * «Explícame esto»: recibe el sujeto ya calculado y su valor, de modo que el asistente
 * explique, no estime. Funciona sin IA: si el sujeto es un término del glosario responde
 * con la ficha plantillada.
 *
 * Verificado: el texto llega en `explanation`, no en `answer`.
 */
export function explainAi(body: {
  subject: string;
  /** Valor concreto que se está explicando, si aplica. */
  value?: unknown;
  /** Datos que la UI ya tiene en pantalla. */
  context?: Record<string, unknown>;
}): Promise<Envelope<AiExplainResponse>> {
  return request<AiExplainResponse>('/ai/explain', { method: 'POST', body });
}

/** Si el asistente con IA está disponible en este despliegue. Regla 6: decir la verdad. */
export function getAiStatus(): Promise<Envelope<AiStatus>> {
  return request<AiStatus>('/ai/status');
}
