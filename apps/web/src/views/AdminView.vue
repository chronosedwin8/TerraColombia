<script setup lang="ts">
/**
 * Administración (pantalla 12 de §10.2): ETL, cobertura, usuarios y métricas de negocio.
 *
 * El panel de ETL es la cara visible de la regla 2 y de la publicación atómica: muestra el
 * linaje de cada corrida, sus validaciones y si detectó PII (que la ingesta descarta).
 * La tabla de cobertura es la fuente de verdad de la regla 6.
 */
import { computed, onMounted, ref } from 'vue';
import { AppError, MESSAGES, formatCop } from '@terracolombia/shared';
import { getAdminMetrics, listCoverage, listEtlRuns, triggerEtl } from '@/api/admin';
import type { AdminMetrics, CoverageRow, EtlRun } from '@/api/types';
import TabsGroup from '@/components/ui/TabsGroup.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import SemaphoreBadge from '@/components/ui/SemaphoreBadge.vue';
import type { TabItem } from '@/components/ui/types';

const activeTab = ref('etl');
const runs = ref<EtlRun[]>([]);
const coverage = ref<CoverageRow[]>([]);
const metrics = ref<AdminMetrics | null>(null);
const isLoading = ref(false);
const error = ref<AppError | null>(null);
const coverageFilter = ref('');

const tabs: TabItem[] = [
  { id: 'etl', label: 'ETL y linaje' },
  { id: 'coverage', label: 'Cobertura' },
  { id: 'metrics', label: 'Métricas' },
];

async function load(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const [runList, coverageList, metricData] = await Promise.all([
      listEtlRuns(),
      listCoverage(),
      getAdminMetrics(),
    ]);
    runs.value = runList.data.items;
    coverage.value = coverageList.data.items;
    metrics.value = metricData.data;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

async function rerun(datasetId: string): Promise<void> {
  try {
    await triggerEtl(datasetId);
    await load();
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  }
}

/** Corridas con al menos un error de validación: lo primero que debe mirar quien opere. */
const failing = computed(() =>
  runs.value.filter(
    (run) => run.status === 'failed' || run.validations.some((v) => v.level === 'error'),
  ),
);

const filteredCoverage = computed(() => {
  const term = coverageFilter.value.trim().toLowerCase();
  if (term.length === 0) return coverage.value;
  return coverage.value.filter(
    (row) =>
      row.muniName.toLowerCase().includes(term) ||
      row.deptName.toLowerCase().includes(term) ||
      row.muniCode.includes(term),
  );
});

const coverageSummary = computed(() => {
  const total = coverage.value.length;
  const full = coverage.value.filter((row) => row.status === 'full').length;
  const partial = coverage.value.filter((row) => row.status === 'partial').length;
  const none = coverage.value.filter((row) => row.status === 'none').length;
  return { total, full, partial, none };
});

function statusFor(row: CoverageRow): 'ok' | 'caution' | 'blocker' | 'unknown' {
  if (row.status === 'full') return 'ok';
  if (row.status === 'partial') return 'caution';
  if (row.status === 'none') return 'blocker';
  return 'unknown';
}

const COVERAGE_LABELS: Record<CoverageRow['status'], string> = {
  full: 'Completa',
  partial: 'Parcial',
  none: 'Sin datos',
  unknown: 'Sin determinar',
};
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-3 p-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-xl font-semibold">Administración</h1>
      <BaseButton variant="secondary" size="sm" :loading="isLoading" @click="load">
        Actualizar
      </BaseButton>
    </div>

    <p v-if="error" class="text-sm text-rose-800" role="alert">{{ error.message }}</p>

    <TabsGroup v-model="activeTab" :tabs="tabs" aria-label="Secciones de administración">
      <!-- ── ETL ────────────────────────────────────────────────────────────── -->
      <template #etl>
        <div class="space-y-3">
          <BaseCard
            v-if="failing.length > 0"
            :title="`${failing.length} corridas con problemas`"
            :heading-level="2"
          >
            <ul class="space-y-2 text-sm">
              <li v-for="run in failing" :key="run.id">
                <p class="font-medium">{{ run.datasetName }}</p>
                <ul class="mt-0.5 list-disc pl-4 text-xs text-rose-800">
                  <li
                    v-for="(validation, index) in run.validations.filter((v) => v.level === 'error')"
                    :key="index"
                  >
                    {{ validation.message }}
                  </li>
                </ul>
              </li>
            </ul>
          </BaseCard>

          <LoadingSkeleton v-if="isLoading" variant="card" />

          <EmptyState
            v-else-if="runs.length === 0"
            title="Sin corridas registradas"
            body="Cuando se ejecute un dataset del catálogo ETL, aquí quedará su linaje: corte, filas cargadas y validaciones."
            icon="data"
          />

          <ul v-else class="space-y-2">
            <li v-for="run in runs" :key="run.id">
              <BaseCard :title="run.datasetName" :heading-level="3">
                <template #actions>
                  <div class="flex items-center gap-2">
                    <BaseBadge
                      :tone="
                        run.status === 'ok'
                          ? 'success'
                          : run.status === 'failed'
                            ? 'danger'
                            : 'info'
                      "
                      size="sm"
                    >
                      {{ run.status }}
                    </BaseBadge>
                    <BaseButton variant="secondary" size="sm" @click="rerun(run.datasetId)">
                      Reejecutar
                    </BaseButton>
                  </div>
                </template>

                <dl class="grid grid-cols-2 gap-x-6 text-xs sm:grid-cols-4">
                  <div>
                    <dt class="tc-label">Dataset</dt>
                    <dd class="font-mono">{{ run.datasetId }}</dd>
                  </div>
                  <div>
                    <dt class="tc-label">Fecha de corte</dt>
                    <dd>{{ run.cutDate ?? MESSAGES.common.notAvailable }}</dd>
                  </div>
                  <div>
                    <dt class="tc-label">Filas</dt>
                    <dd class="tabular-nums">{{ run.rowCount ?? MESSAGES.common.notAvailable }}</dd>
                  </div>
                  <div>
                    <dt class="tc-label">Duración</dt>
                    <dd>
                      {{
                        run.finishedAt
                          ? `${Math.round(
                              (new Date(run.finishedAt).getTime() -
                                new Date(run.startedAt).getTime()) /
                                1000,
                            )} s`
                          : 'en curso'
                      }}
                    </dd>
                  </div>
                </dl>

                <ul v-if="run.validations.length > 0" class="mt-2 space-y-0.5 text-xs">
                  <li
                    v-for="(validation, index) in run.validations"
                    :key="index"
                    :class="
                      validation.level === 'error'
                        ? 'text-rose-800'
                        : validation.level === 'warn'
                          ? 'text-amber-800'
                          : 'text-slate-600'
                    "
                  >
                    [{{ validation.level }}] {{ validation.message }}
                  </li>
                </ul>
              </BaseCard>
            </li>
          </ul>
        </div>
      </template>

      <!-- ── Cobertura ──────────────────────────────────────────────────────── -->
      <template #coverage>
        <div class="space-y-3">
          <BaseCard title="Resumen de cobertura catastral" :heading-level="2">
            <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt class="tc-label">Municipios listados</dt>
                <dd class="text-lg font-semibold tabular-nums">{{ coverageSummary.total }}</dd>
              </div>
              <div>
                <dt class="tc-label">Cobertura completa</dt>
                <dd class="text-lg font-semibold tabular-nums">{{ coverageSummary.full }}</dd>
              </div>
              <div>
                <dt class="tc-label">Parcial</dt>
                <dd class="text-lg font-semibold tabular-nums">{{ coverageSummary.partial }}</dd>
              </div>
              <div>
                <dt class="tc-label">Sin datos</dt>
                <dd class="text-lg font-semibold tabular-nums">{{ coverageSummary.none }}</dd>
              </div>
            </dl>
            <p class="mt-2 text-xs text-slate-600">
              Esta tabla es la que alimenta los avisos de cobertura de la interfaz pública. Si aquí
              dice «sin datos», al usuario se le explica por qué y qué sí tenemos.
            </p>
          </BaseCard>

          <BaseCard title="Municipios" :heading-level="2" :padded="false">
            <template #actions>
              <input
                v-model="coverageFilter"
                class="tc-input text-xs"
                placeholder="Filtrar por nombre o código"
                aria-label="Filtrar municipios"
              />
            </template>

            <div class="max-h-[30rem] overflow-auto">
              <table class="tc-table">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Municipio</th>
                    <th scope="col">Departamento</th>
                    <th scope="col">Gestor catastral</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Predios</th>
                    <th scope="col">Último corte</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in filteredCoverage" :key="row.muniCode">
                    <td class="font-mono text-xs">{{ row.muniCode }}</td>
                    <td>{{ row.muniName }}</td>
                    <td>{{ row.deptName }}</td>
                    <td>
                      {{ row.cadastralManager ?? MESSAGES.common.notAvailable }}
                      <span v-if="row.isIgac === true" class="text-xs text-slate-500">(IGAC)</span>
                    </td>
                    <td>
                      <SemaphoreBadge
                        :status="statusFor(row)"
                        :label="COVERAGE_LABELS[row.status]"
                        size="sm"
                      />
                    </td>
                    <td class="tabular-nums">
                      {{ row.parcelCount ?? MESSAGES.common.notAvailable }}
                    </td>
                    <td>{{ row.lastCutDate ?? MESSAGES.common.notAvailable }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </BaseCard>
        </div>
      </template>

      <!-- ── Métricas ───────────────────────────────────────────────────────── -->
      <template #metrics>
        <LoadingSkeleton v-if="isLoading" variant="card" />

        <EmptyState
          v-else-if="!metrics"
          title="Sin métricas disponibles"
          body="Las métricas de negocio se calculan a partir de los eventos de uso y de las suscripciones activas."
          icon="data"
        />

        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <BaseCard title="Usuarios" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ metrics.users }}</p>
          </BaseCard>
          <BaseCard title="Suscripciones activas" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ metrics.activeSubscriptions }}</p>
          </BaseCard>
          <BaseCard title="MRR" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ formatCop(metrics.mrrCop) }}</p>
          </BaseCard>
          <BaseCard title="Informes (30 días)" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ metrics.reportsLast30d }}</p>
          </BaseCard>
          <BaseCard title="Llamadas API (30 días)" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ metrics.apiCallsLast30d }}</p>
          </BaseCard>
          <BaseCard title="Predios indexados" :heading-level="3">
            <p class="text-2xl font-semibold tabular-nums">{{ metrics.parcelsIndexed }}</p>
            <p class="mt-1 text-xs text-slate-600">
              En {{ metrics.municipalitiesWithCadastre }} municipios con catastro cargado.
            </p>
          </BaseCard>
        </div>
      </template>
    </TabsGroup>
  </div>
</template>
