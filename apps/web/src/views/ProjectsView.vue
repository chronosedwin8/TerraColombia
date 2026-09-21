<script setup lang="ts">
/**
 * Mis proyectos, informes y alertas (pantalla 9 de §10.2, módulo M12).
 *
 * Un proyecto agrupa zonas y búsquedas guardadas, informes generados y alertas. Cada elemento
 * guardado conserva el estado de la URL, así que reabrirlo devuelve la vista exacta.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { AppError, MESSAGES } from '@terracolombia/shared';
import { useProjectsStore } from '@/stores/projects';
import { useEntitlements } from '@/composables/useEntitlements';
import { createReport, downloadReport, getReport, listReports } from '@/api/reports';
import { useShare } from '@/composables/useShare';
import type { Alert, ExportFormat, ReportLevel, ReportSummary } from '@/api/types';
import TabsGroup from '@/components/ui/TabsGroup.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import type { TabItem } from '@/components/ui/types';

const projects = useProjectsStore();
const { can, minPlanFor } = useEntitlements();
const { downloadBlob } = useShare();

const activeTab = ref('projects');
const newProjectName = ref('');
const reports = ref<ReportSummary[]>([]);
const isLoadingReports = ref(false);
const reportError = ref<AppError | null>(null);

/**
 * Niveles de informe. VERIFICADO: la API los valida en español
 * (`resumen | completo | tecnico`). El mapa anterior usaba las claves en inglés, así que
 * la etiqueta salía vacía en toda la lista y, peor, `POST /reports` se rechazaba con
 * VALIDATION al mandarlas de vuelta.
 */
const REPORT_LEVEL_LABELS: Record<ReportLevel, string> = {
  resumen: 'Resumen (2 páginas)',
  completo: 'Completo',
  tecnico: 'Técnico (con anexos de datos)',
};

/** Estados del worker, tal como los devuelve la API (`done`, nunca `completed`). */
const REPORT_STATUS_LABELS: Record<ReportSummary['status'], string> = {
  queued: 'En cola',
  running: 'Generando',
  done: 'Listo',
  failed: 'Falló',
  canceled: 'Cancelado',
};

/** Tipos de alerta reales del worker. No existe `area_changes`. */
const ALERT_KIND_LABELS: Record<Alert['kind'], string> = {
  new_parcels: 'Predios nuevos en la zona',
  parcel_changed: 'Cambios en un predio',
  new_buildings: 'Construcciones nuevas',
  area_change: 'Cambios en una zona',
  indicator_threshold: 'Un indicador cruza un umbral',
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

/** VERIFICADO: `GET /reports` devuelve un arreglo pelado, no `{items, nextCursor, total}`. */
async function loadReports(): Promise<void> {
  isLoadingReports.value = true;
  reportError.value = null;
  try {
    const response = await listReports();
    reports.value = response.data;
  } catch (e) {
    reportError.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  } finally {
    isLoadingReports.value = false;
  }
}

/**
 * Sondeo del progreso de los informes.
 *
 * Un informe NO expone el `jobId` del worker: `POST /reports` devuelve el id del INFORME y
 * el avance se lee en `GET /reports/:id` (o en esta misma lista, que ya trae `status` y
 * `progress`). Por eso aquí no se usa `useJob`: se refresca la lista mientras haya alguno
 * sin terminar y se para en cuanto todos llegan a un estado terminal.
 */
const POLL_INTERVAL_MS = 4000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const hasPendingReports = computed(() =>
  reports.value.some((report) => report.status === 'queued' || report.status === 'running'),
);

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function ensurePolling(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    if (!hasPendingReports.value) {
      stopPolling();
      return;
    }
    void loadReports();
  }, POLL_INTERVAL_MS);
}

onMounted(async () => {
  await projects.load();
  if (projects.selectedProjectId) await projects.loadItems(projects.selectedProjectId);
  await Promise.all([loadReports(), projects.loadAlerts()]);
  if (hasPendingReports.value) ensurePolling();
});

onUnmounted(stopPolling);

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

/**
 * Formatos descargables de un informe.
 *
 * El campo es `artifacts`, un mapa `formato → ruta del objeto generado`; sus claves son los
 * formatos ya producidos. `formats`, que leía la versión anterior, no existe: la fila de
 * botones de descarga salía siempre vacía.
 */
function downloadableFormats(report: ReportSummary): ExportFormat[] {
  return Object.keys(report.artifacts) as ExportFormat[];
}

/**
 * Reintento de un informe fallido.
 *
 * El `subject` original NO viaja en la fila de la lista: hay que pedirlo con
 * `GET /reports/:id`. La versión anterior inventaba `{kind:'saved_analysis', analysisId}`,
 * que la API rechazaba. Después de encolar no se sigue un `jobId` —`POST /reports` no
 * devuelve ninguno—: se recarga la lista y el sondeo se encarga del resto.
 */
async function regenerate(report: ReportSummary): Promise<void> {
  try {
    const detail = await getReport(report.id);
    await createReport({
      kind: detail.data.kind,
      level: detail.data.level,
      title: detail.data.title,
      subject: detail.data.subject,
    });
    await loadReports();
    ensurePolling();
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
                  <!-- El estado terminal bueno es `done`; `completed` no existe en la API. -->
                  <BaseBadge
                    :tone="
                      report.status === 'done'
                        ? 'success'
                        : report.status === 'failed'
                          ? 'danger'
                          : 'info'
                    "
                  >
                    {{ REPORT_STATUS_LABELS[report.status] }}
                  </BaseBadge>
                </template>

                <p class="text-xs text-slate-600">
                  {{ REPORT_LEVEL_LABELS[report.level] }} · creado el
                  {{ new Date(report.createdAt).toLocaleDateString('es-CO') }} ·
                  {{ report.creditsCharged }} créditos
                </p>

                <!-- Mientras se genera, se muestra el avance que la propia fila ya trae. -->
                <div
                  v-if="report.status === 'queued' || report.status === 'running'"
                  class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  :aria-valuenow="report.progress"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-label="`Progreso de ${report.title}`"
                >
                  <div
                    class="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                    :style="{ width: `${report.progress}%` }"
                  />
                </div>

                <div v-else-if="report.status === 'done'" class="mt-2 flex flex-wrap gap-1.5">
                  <BaseButton
                    v-for="format in downloadableFormats(report)"
                    :key="format"
                    variant="secondary"
                    size="sm"
                    @click="download(report, format)"
                  >
                    Descargar {{ format.toUpperCase() }}
                  </BaseButton>
                </div>

                <template v-else-if="report.status === 'failed'">
                  <p v-if="report.errorMessage" class="mt-2 text-sm text-rose-800">
                    {{ report.errorMessage }}
                  </p>
                  <BaseButton class="mt-2" variant="secondary" size="sm" @click="regenerate(report)">
                    Generar de nuevo
                  </BaseButton>
                </template>
              </BaseCard>
            </li>
          </ul>

          <!--
            Regla 4: la procedencia se muestra donde la hay. `GET /reports` no devuelve las
            fuentes de cada informe (ni en la fila ni en `meta.sources`, que llega vacío):
            los snapshots congelados viven DENTRO del informe, en su capítulo de fuentes y
            en el QR de verificación. Aquí se dice eso en lugar de pintar un pie de fuentes
            vacío en cada tarjeta.
          -->
          <p class="text-xs text-slate-500">
            {{ MESSAGES.reports.immutable }} El listado no repite las fuentes: cada informe
            lleva dentro sus fechas de corte, licencias y atribuciones, y el QR de su última
            página permite verificar que lo emitimos nosotros.
          </p>
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
              <!--
                Antes aquí se mostraba «N coincidencias» leyendo `alert.matchCount`, que no
                existe: salía siempre vacío. La API tampoco trae un total acumulado (solo los
                últimos 5 envíos), así que en su lugar se dice cuándo saltó por última vez,
                que sí es un dato exacto.
              -->
              <p class="text-xs text-slate-500">
                {{ ALERT_KIND_LABELS[alert.kind] }} ·
                {{
                  alert.lastCheckedAt
                    ? `revisada el ${new Date(alert.lastCheckedAt).toLocaleDateString('es-CO')}`
                    : 'sin revisar aún'
                }}
                ·
                {{
                  alert.lastTriggeredAt
                    ? `saltó el ${new Date(alert.lastTriggeredAt).toLocaleDateString('es-CO')}`
                    : 'todavía no ha saltado'
                }}
              </p>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-600"
                :checked="alert.isActive"
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
