<script setup lang="ts">
/**
 * Mis proyectos, informes y alertas (pantalla 9 de §10.2, módulo M12).
 *
 * Un proyecto agrupa zonas y búsquedas guardadas, informes generados y alertas. Cada elemento
 * guardado conserva el estado de la URL, así que reabrirlo devuelve la vista exacta.
 */
import { computed, onMounted, ref } from 'vue';
import { AppError, MESSAGES, type ResponseMeta } from '@terracolombia/shared';
import { useProjectsStore } from '@/stores/projects';
import { useEntitlements } from '@/composables/useEntitlements';
import { createReport, downloadReport, listReports } from '@/api/reports';
import { emptyMeta } from '@/api/client';
import { useJob } from '@/composables/useJob';
import { useShare } from '@/composables/useShare';
import type { ExportFormat, ReportLevel, ReportSummary } from '@/api/types';
import TabsGroup from '@/components/ui/TabsGroup.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import JobProgress from '@/components/JobProgress.vue';
import type { TabItem } from '@/components/ui/types';

const projects = useProjectsStore();
const { can, minPlanFor } = useEntitlements();
const { downloadBlob } = useShare();
const job = useJob<{ reportId: string }>();

const activeTab = ref('projects');
const newProjectName = ref('');
const reports = ref<ReportSummary[]>([]);
const reportsMeta = ref<ResponseMeta>(emptyMeta());
const isLoadingReports = ref(false);
const reportError = ref<AppError | null>(null);

const REPORT_LEVEL_LABELS: Record<ReportLevel, string> = {
  summary: 'Resumen (2 páginas)',
  full: 'Completo',
  technical: 'Técnico (con anexos de datos)',
};

const tabs = computed<TabItem[]>(() => [
  { id: 'projects', label: 'Proyectos', badge: projects.projects.length },
  { id: 'items', label: 'Guardados', badge: projects.items.length },
  { id: 'reports', label: 'Informes', badge: reports.value.length },
  {
    id: 'alerts',
    label: 'Alertas',
    badge: projects.alerts.length,
    disabled: !can('canUseAlerts'),
  },
]);

async function loadReports(): Promise<void> {
  isLoadingReports.value = true;
  reportError.value = null;
  try {
    const response = await listReports();
    reports.value = response.data.items;
    reportsMeta.value = response.meta;
  } catch (e) {
    reportError.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  } finally {
    isLoadingReports.value = false;
  }
}

onMounted(async () => {
  await projects.load();
  if (projects.selectedProjectId) await projects.loadItems(projects.selectedProjectId);
  await Promise.all([loadReports(), projects.loadAlerts()]);
});

async function create(): Promise<void> {
  const name = newProjectName.value.trim();
  if (name.length === 0) return;
  const project = await projects.create(name);
  if (project) {
    newProjectName.value = '';
    await projects.loadItems(project.id);
  }
}

async function download(report: ReportSummary, format: ExportFormat): Promise<void> {
  try {
    const { blob, filename } = await downloadReport(report.id, format);
    downloadBlob(blob, filename);
  } catch (e) {
    reportError.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  }
}

/** Reintento de un informe fallido: se encola de nuevo con los mismos parámetros. */
async function regenerate(report: ReportSummary): Promise<void> {
  try {
    const response = await createReport({
      kind: report.kind,
      level: report.level,
      title: report.title,
      subject: { kind: 'saved_analysis', analysisId: report.id },
      formats: report.formats.length > 0 ? report.formats : ['pdf'],
    });
    job.track(response.data.jobId);
  } catch (e) {
    reportError.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-3 p-3">
    <h1 class="text-xl font-semibold">Mis proyectos</h1>

    <TabsGroup v-model="activeTab" :tabs="tabs" aria-label="Secciones de mis proyectos">
      <!-- ── Proyectos ──────────────────────────────────────────────────────── -->
      <template #projects>
        <div class="space-y-3">
          <BaseCard title="Crear un proyecto" :heading-level="2">
            <form class="flex flex-wrap items-end gap-2" @submit.prevent="create">
              <div class="min-w-56 flex-1">
                <BaseField label="Nombre del proyecto">
                  <template #default="{ id }">
                    <input :id="id" v-model="newProjectName" class="tc-input" />
                  </template>
                </BaseField>
              </div>
              <BaseButton type="submit" :disabled="newProjectName.trim().length === 0">
                Crear
              </BaseButton>
            </form>
          </BaseCard>

          <LoadingSkeleton v-if="projects.isLoading" variant="card" />

          <EmptyState
            v-else-if="projects.projects.length === 0"
            title="Todavía no tienes proyectos"
            body="Un proyecto agrupa las zonas y búsquedas que guardas, los informes que generas y las alertas que vigilan cambios."
            icon="data"
          />

          <ul v-else class="space-y-2">
            <li v-for="project in projects.projects" :key="project.id">
              <BaseCard :title="project.name" :heading-level="3">
                <template #actions>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    @click="projects.loadItems(project.id)"
                  >
                    Ver contenido
                  </BaseButton>
                </template>
                <p v-if="project.description" class="text-sm text-slate-700">
                  {{ project.description }}
                </p>
                <p class="mt-1 text-xs text-slate-500">
                  {{ project.counts.savedAreas }} zonas ·
                  {{ project.counts.savedSearches }} búsquedas ·
                  {{ project.counts.reports }} informes ·
                  {{ project.counts.alerts }} alertas
                </p>
              </BaseCard>
            </li>
          </ul>
        </div>
      </template>

      <!-- ── Elementos guardados ────────────────────────────────────────────── -->
      <template #items>
        <EmptyState
          v-if="projects.items.length === 0"
          title="Nada guardado en este proyecto"
          body="Usa el botón «Guardar» de la barra de resultados en cualquier vista. Se guarda el estado completo, así que al reabrirlo verás exactamente lo mismo."
          icon="data"
        />

        <ul v-else class="divide-y divide-slate-200">
          <li
            v-for="item in projects.items"
            :key="item.id"
            class="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ item.name }}</p>
              <p class="text-xs text-slate-500">
                {{ item.kind }} · guardado el
                {{ new Date(item.createdAt).toLocaleDateString('es-CO') }}
              </p>
            </div>
            <BaseButton variant="secondary" size="sm" :href="item.urlState">Abrir</BaseButton>
          </li>
        </ul>
      </template>

      <!-- ── Informes ───────────────────────────────────────────────────────── -->
      <template #reports>
        <div class="space-y-3">
          <JobProgress
            :status="job.status.value"
            :progress="job.progress.value"
            :stage="job.stage.value"
            :error-message="job.error.value?.message ?? null"
            @cancel="job.stop()"
          />

          <p v-if="reportError" class="text-sm text-rose-800" role="alert">
            {{ reportError.message }}
          </p>

          <LoadingSkeleton v-if="isLoadingReports" variant="card" />

          <EmptyState
            v-else-if="reports.length === 0"
            title="Todavía no has generado informes"
            body="Desde la ficha de un predio o el tablero de una zona, usa «Exportar» y elige PDF. El informe queda atado a las fechas de corte de ese momento y es verificable por QR."
            icon="data"
          />

          <ul v-else class="space-y-2">
            <li v-for="report in reports" :key="report.id">
              <BaseCard :title="report.title" :heading-level="3">
                <template #actions>
                  <BaseBadge
                    :tone="
                      report.status === 'completed'
                        ? 'success'
                        : report.status === 'failed'
                          ? 'danger'
                          : 'info'
                    "
                  >
                    {{ report.status }}
                  </BaseBadge>
                </template>

                <p class="text-xs text-slate-600">
                  {{ REPORT_LEVEL_LABELS[report.level] }} · creado el
                  {{ new Date(report.createdAt).toLocaleDateString('es-CO') }}
                </p>

                <div v-if="report.status === 'completed'" class="mt-2 flex flex-wrap gap-1.5">
                  <BaseButton
                    v-for="format in report.formats"
                    :key="format"
                    variant="secondary"
                    size="sm"
                    @click="download(report, format)"
                  >
                    Descargar {{ format.toUpperCase() }}
                  </BaseButton>
                </div>

                <BaseButton
                  v-else-if="report.status === 'failed'"
                  class="mt-2"
                  variant="secondary"
                  size="sm"
                  @click="regenerate(report)"
                >
                  Generar de nuevo
                </BaseButton>

                <template #footer>
                  <!-- Los informes son inmutables: llevan los snapshots con los que se hicieron. -->
                  <ProvenanceFooter :sources="report.sources" compact />
                </template>
              </BaseCard>
            </li>
          </ul>

          <p class="text-xs text-slate-500">{{ MESSAGES.reports.immutable }}</p>
        </div>
      </template>

      <!-- ── Alertas ────────────────────────────────────────────────────────── -->
      <template #alerts>
        <EmptyState
          v-if="!can('canUseAlerts')"
          title="Las alertas están en planes superiores"
          :body="`Vigilan una zona o una búsqueda y te avisan cuando cambia. Disponibles desde el plan ${minPlanFor('canUseAlerts') ?? 'Business'}.`"
          icon="lock"
          action-label="Ver planes"
          @action="$router.push('/cuenta/plan')"
        />

        <EmptyState
          v-else-if="projects.alerts.length === 0"
          title="No tienes alertas activas"
          body="Crea una desde una zona guardada: te avisamos cuando aparezcan predios nuevos, englobes o construcciones nuevas."
          icon="data"
        />

        <ul v-else class="divide-y divide-slate-200">
          <li
            v-for="alert in projects.alerts"
            :key="alert.id"
            class="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ alert.name }}</p>
              <p class="text-xs text-slate-500">
                {{ alert.kind === 'area_changes' ? 'Cambios en una zona' : 'Nuevos predios que cumplen un filtro' }}
                ·
                {{
                  alert.lastCheckedAt
                    ? `revisada el ${new Date(alert.lastCheckedAt).toLocaleDateString('es-CO')}`
                    : 'sin revisar aún'
                }}
                · {{ alert.matchCount }} coincidencias
              </p>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-600"
                :checked="alert.active"
                @change="
                  projects.toggleAlert(alert.id, ($event.target as HTMLInputElement).checked)
                "
              />
              Activa
            </label>
          </li>
        </ul>
      </template>
    </TabsGroup>
  </div>
</template>
