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
import type {
  AdminMetrics,
  CoverageDepartmentRow,
  CoverageSummary,
  EtlRun,
} from '@/api/types';
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
/**
 * VERIFICADO: `GET /admin/coverage` devuelve filas de DEPARTAMENTO
 * (`{code, name, municipalities, igac, with_parcels}`), no de municipio. La versión
 * anterior de esta vista leía `muniCode`, `cadastralManager`, `status`, `parcelCount` y
 * `lastCutDate`, que no existen: la tabla salía con todas las celdas vacías y el filtro
 * reventaba con TypeError al tocar `row.muniName`.
 */
const coverage = ref<CoverageDepartmentRow[]>([]);
/** El resumen nacional lo calcula el backend; no se recuenta aquí sobre la página cargada. */
const coverageSummary = ref<CoverageSummary | null>(null);
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
    // `items` y `byDepartment` son el mismo arreglo; se usa `byDepartment` por ser explícito.
    coverage.value = coverageList.data.byDepartment;
    coverageSummary.value = coverageList.data.summary;
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
    (row) => row.name.toLowerCase().includes(term) || row.code.includes(term),
  );
});

/**
 * Semáforo del departamento.
 *
 * La API no manda un `status` por departamento, así que NO se inventa uno: se deriva de
 * los dos conteos que sí manda —municipios del departamento y municipios con predios
 * cargados—. Es una lectura de esas cifras, no una estimación de cobertura.
 */
function statusFor(row: CoverageDepartmentRow): 'ok' | 'caution' | 'blocker' {
  if (row.with_parcels === 0) return 'blocker';
  if (row.with_parcels >= row.municipalities) return 'ok';
  return 'caution';
}

function coverageLabel(row: CoverageDepartmentRow): string {
  if (row.with_parcels === 0) return 'Sin predios cargados';
  if (row.with_parcels >= row.municipalities) return 'Todos los municipios';
  return `${row.with_parcels} de ${row.municipalities}`;
}
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
            <dl v-if="coverageSummary" class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt class="tc-label">Municipios del país</dt>
                <dd class="text-lg font-semibold tabular-nums">
                  {{ coverageSummary.total_municipalities }}
                </dd>
              </div>
              <div>
                <dt class="tc-label">Jurisdicción del IGAC</dt>
                <dd class="text-lg font-semibold tabular-nums">
                  {{ coverageSummary.igac_municipalities }}
                </dd>
              </div>
              <div>
                <dt class="tc-label">Con otro gestor catastral</dt>
                <dd class="text-lg font-semibold tabular-nums">
                  {{ coverageSummary.other_managers }}
                </dd>
              </div>
              <div>
                <dt class="tc-label">Con predios cargados</dt>
                <dd class="text-lg font-semibold tabular-nums">
                  {{ coverageSummary.with_parcels }}
                </dd>
              </div>
            </dl>

            <EmptyState
              v-else
              title="Sin resumen de cobertura"
              body="El endpoint de cobertura no devolvió el bloque de resumen. Revisa que las migraciones de división administrativa estén aplicadas."
              icon="data"
            />

            <p class="mt-2 text-xs text-slate-600">
              Estas cifras alimentan los avisos de cobertura de la interfaz pública. Si un
              municipio no tiene predios cargados, al usuario se le explica por qué y qué sí
              tenemos, en lugar de mostrarle un mapa vacío.
            </p>
          </BaseCard>

          <BaseCard title="Departamentos" :heading-level="2" :padded="false">
            <template #actions>
              <input
                v-model="coverageFilter"
                class="tc-input text-xs"
                placeholder="Filtrar por nombre o código"
                aria-label="Filtrar departamentos"
              />
            </template>

            <div class="max-h-[30rem] overflow-auto">
              <table class="tc-table">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Departamento</th>
                    <th scope="col">Municipios</th>
                    <th scope="col">Jurisdicción IGAC</th>
                    <th scope="col">Con predios cargados</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in filteredCoverage" :key="row.code">
                    <td class="font-mono text-xs">{{ row.code }}</td>
                    <td>{{ row.name }}</td>
                    <td class="tabular-nums">{{ row.municipalities }}</td>
                    <td class="tabular-nums">
                      {{ row.igac }}
                      <span v-if="row.igac < row.municipalities" class="text-xs text-slate-500">
                        ({{ row.municipalities - row.igac }} con gestor propio)
                      </span>
                    </td>
                    <td>
                      <SemaphoreBadge
                        :status="statusFor(row)"
                        :label="coverageLabel(row)"
                        size="sm"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!--
              Regla 6: se dice qué NO hay aquí. El endpoint agrega por departamento, así que
              el gestor catastral, el conteo de predios y la fecha de corte de cada municipio
              —que esta tabla mostraba antes en columnas siempre vacías— no están disponibles.
            -->
            <p class="border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
              <code>GET /admin/coverage</code> agrega por departamento. El gestor catastral, el
              número de predios y la última fecha de corte de cada municipio no vienen en esta
              respuesta: se consultan en la ficha municipal
              (<code>GET /municipalities/:code</code>).
            </p>
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
