import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { AiAnswer } from './types';

/** Pregunta en lenguaje natural (M11). El backend solo usa herramientas tipadas. */
export function askAi(body: {
  question: string;
  /** Contexto de la vista actual para que el asistente no adivine el ámbito. */
  context?: { npn?: string; muniCode?: string; bbox?: [number, number, number, number] };
}): Promise<Envelope<AiAnswer>> {
  return request<AiAnswer>('/ai/ask', { method: 'POST', body });
}

/**
 * "Explícame esto": recibe el identificador del dato ya calculado y su valor,
 * de modo que el asistente explique, no estime.
 */
export function explainAi(body: {
  subject: string;
  /** Datos que la UI ya tiene en pantalla. */
  payload: Record<string, unknown>;
}): Promise<Envelope<AiAnswer>> {
  return request<AiAnswer>('/ai/explain', { method: 'POST', body });
}
