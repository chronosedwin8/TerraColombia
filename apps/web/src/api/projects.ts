import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type { Alert, Page, Project, SavedItem } from './types';

export function listProjects(): Promise<Envelope<Page<Project>>> {
  return request<Page<Project>>('/projects');
}

export function createProject(body: {
  name: string;
  description?: string;
}): Promise<Envelope<Project>> {
  return request<Project>('/projects', { method: 'POST', body });
}

export function deleteProject(id: string): Promise<Envelope<undefined>> {
  return request<undefined>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listSavedItems(projectId: string): Promise<Envelope<Page<SavedItem>>> {
  return request<Page<SavedItem>>(`/projects/${encodeURIComponent(projectId)}/items`);
}

/**
 * Guarda el estado de una vista. `urlState` es la query serializada por `useUrlState`,
 * así que reabrir un elemento guardado restaura la pantalla exacta.
 */
export function saveItem(
  projectId: string,
  body: { kind: SavedItem['kind']; name: string; urlState: string },
): Promise<Envelope<SavedItem>> {
  return request<SavedItem>(`/projects/${encodeURIComponent(projectId)}/items`, {
    method: 'POST',
    body,
  });
}

export function listAlerts(projectId?: string): Promise<Envelope<Page<Alert>>> {
  return request<Page<Alert>>('/projects/alerts', { query: { projectId } });
}

export function setAlertActive(id: string, active: boolean): Promise<Envelope<Alert>> {
  return request<Alert>(`/projects/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { active },
  });
}
