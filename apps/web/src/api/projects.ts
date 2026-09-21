import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { Alert, OkResponse, Page, Project, SavedItem } from './types';

export function listProjects(): Promise<Envelope<Page<Project>>> {
  return request<Page<Project>>('/projects');
}

export function createProject(body: {
  name: string;
  description?: string;
  color?: string;
}): Promise<Envelope<Project>> {
  return request<Project>('/projects', { method: 'POST', body });
}

/** Verificado: responde `{ ok: true }`, no 204. */
export function deleteProject(id: string): Promise<Envelope<OkResponse>> {
  return request<OkResponse>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listSavedItems(projectId: string): Promise<Envelope<Page<SavedItem>>> {
  return request<Page<SavedItem>>(`/projects/${encodeURIComponent(projectId)}/items`);
}

/**
 * Guarda el estado de una vista. `urlState` es la query serializada por `useUrlState`,
 * así que reabrir un elemento guardado restaura la pantalla exacta y la recalcula
 * contra el corte vigente (no se guardan cifras viejas sin fecha de corte).
 */
export function saveItem(
  projectId: string,
  body: { kind: SavedItem['kind']; name: string; urlState: string; notes?: string },
): Promise<Envelope<SavedItem>> {
  return request<SavedItem>(`/projects/${encodeURIComponent(projectId)}/items`, {
    method: 'POST',
    body,
  });
}

export function deleteSavedItem(projectId: string, itemId: string): Promise<Envelope<OkResponse>> {
  return request<OkResponse>(
    `/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}

/**
 * Alertas del usuario.
 *
 * OJO: las alertas cuelgan del USUARIO, no del proyecto. La API ignora cualquier filtro
 * por proyecto y devuelve todas las del usuario; el campo de estado es `isActive`.
 */
export function listAlerts(): Promise<Envelope<Page<Alert>>> {
  return request<Page<Alert>>('/projects/alerts');
}

export function createAlert(body: {
  name: string;
  kind: Alert['kind'];
  scope: Record<string, unknown>;
  condition?: Record<string, unknown>;
  frequency?: Alert['frequency'];
  channels?: Alert['channels'];
}): Promise<Envelope<Alert>> {
  return request<Alert>('/projects/alerts', { method: 'POST', body });
}

/** Verificado: el cuerpo es `{ isActive }`, no `{ active }`. */
export function setAlertActive(id: string, isActive: boolean): Promise<Envelope<Alert>> {
  return request<Alert>(`/projects/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { isActive },
  });
}

export function deleteAlert(id: string): Promise<Envelope<OkResponse>> {
  return request<OkResponse>(`/projects/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
