import type { Envelope, GlossaryEntry } from '@terracolombia/shared';
import { request } from './client';
import type { GlossaryResponse } from './types';

/**
 * El glosario canónico vive en `@terracolombia/shared` y se usa sin red.
 * Este endpoint permite que el backend añada términos nuevos (capas recién integradas)
 * sin desplegar el frontend; `useGlossary` fusiona ambas listas dando prioridad al remoto.
 *
 * Verificado: la respuesta es `{ terms: [...] }`, no un arreglo.
 */
export function getGlossary(): Promise<Envelope<GlossaryResponse>> {
  return request<GlossaryResponse>('/glossary');
}

/** Un término suelto. 404 cuando el id no existe. */
export function getGlossaryTerm(id: string): Promise<Envelope<GlossaryEntry>> {
  return request<GlossaryEntry>(`/glossary/${encodeURIComponent(id)}`);
}
