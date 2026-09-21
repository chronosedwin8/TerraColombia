import type { Envelope, GlossaryEntry } from '@terracolombia/shared';
import { request } from './client';

/**
 * El glosario canónico vive en `@terracolombia/shared` y se usa sin red.
 * Este endpoint permite que el backend añada términos nuevos (capas recién integradas)
 * sin desplegar el frontend; `useGlossary` fusiona ambas listas dando prioridad al remoto.
 */
export function getGlossary(): Promise<Envelope<GlossaryEntry[]>> {
  return request<GlossaryEntry[]>('/glossary');
}
