/**
 * Proyectos, elementos guardados y alertas (M12). "Guardar" de la barra fija de resultados
 * escribe aquí: se guarda el `urlState` completo de la vista para poder reabrirla idéntica.
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError } from '@terracolombia/shared';
import * as projectsApi from '@/api/projects';
import type { Alert, Project, SavedItem } from '@/api/types';

export const useProjectsStore = defineStore('projects', () => {
  const projects = shallowRef<Project[]>([]);
  const items = shallowRef<SavedItem[]>([]);
  const alerts = shallowRef<Alert[]>([]);
  const selectedProjectId = ref<string | null>(null);
  const isLoading = ref(false);
  const error = shallowRef<AppError | null>(null);

  const selected = computed(
    () => projects.value.find((p) => p.id === selectedProjectId.value) ?? null,
  );

  async function load(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await projectsApi.listProjects();
      projects.value = response.data.items;
      if (!selectedProjectId.value) selectedProjectId.value = projects.value[0]?.id ?? null;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cargar tus proyectos');
    } finally {
      isLoading.value = false;
    }
  }

  async function loadItems(projectId: string): Promise<void> {
    selectedProjectId.value = projectId;
    try {
      const response = await projectsApi.listSavedItems(projectId);
      items.value = response.data.items;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cargar los elementos');
    }
  }

  async function create(name: string, description?: string): Promise<Project | null> {
    try {
      const response = await projectsApi.createProject(
        description ? { name, description } : { name },
      );
      projects.value = [response.data, ...projects.value];
      selectedProjectId.value = response.data.id;
      return response.data;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos crear el proyecto');
      return null;
    }
  }

  /** Guarda el estado de la vista actual. `urlState` lo produce `useUrlState().shareUrl()`. */
  async function save(payload: {
    projectId?: string;
    kind: SavedItem['kind'];
    name: string;
    urlState: string;
  }): Promise<SavedItem | null> {
    const projectId = payload.projectId ?? selectedProjectId.value;
    if (!projectId) {
      error.value = new AppError('VALIDATION', 'Elige o crea un proyecto antes de guardar');
      return null;
    }
    try {
      const response = await projectsApi.saveItem(projectId, {
        kind: payload.kind,
        name: payload.name,
        urlState: payload.urlState,
      });
      items.value = [response.data, ...items.value];
      return response.data;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos guardar');
      return null;
    }
  }

  /**
   * Alertas del usuario.
   *
   * VERIFICADO: `GET /projects/alerts` no admite filtro por proyecto —las alertas cuelgan
   * del USUARIO, no del proyecto—, así que no se le pasa `selectedProjectId`. Antes se le
   * enviaba y la API lo ignoraba en silencio: la lista parecía filtrada y no lo estaba.
   */
  async function loadAlerts(): Promise<void> {
    try {
      const response = await projectsApi.listAlerts();
      alerts.value = response.data.items;
    } catch {
      alerts.value = [];
    }
  }

  async function toggleAlert(id: string, active: boolean): Promise<void> {
    try {
      const response = await projectsApi.setAlertActive(id, active);
      alerts.value = alerts.value.map((a) => (a.id === id ? response.data : a));
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cambiar la alerta');
    }
  }

  return {
    projects,
    items,
    alerts,
    selectedProjectId,
    selected,
    isLoading,
    error,
    load,
    loadItems,
    create,
    save,
    loadAlerts,
    toggleAlert,
  };
});
