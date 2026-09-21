<script setup lang="ts">
/**
 * Llaves de API y consumo (pantalla 10 de §10.2, módulo M10).
 *
 * La llave en claro se muestra **una sola vez**, al crearla: el backend guarda solo su hash.
 * La interfaz lo dice antes de crearla y obliga a copiarla para cerrar el diálogo.
 */
import { computed, onMounted, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import { AppError, MESSAGES } from '@terracolombia/shared';
import { createApiKey, getApiUsage, listApiKeys, revokeApiKey } from '@/api/apiKeys';
import { useShare } from '@/composables/useShare';
import type { ApiKey, ApiKeyCreated, ApiUsagePoint } from '@/api/types';
import ChartCard from '@/components/ChartCard.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseField from '@/components/ui/BaseField.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';

const { copy, copied } = useShare();

const keys = ref<ApiKey[]>([]);
const usage = ref<ApiUsagePoint[]>([]);
const isLoading = ref(false);
const error = ref<AppError | null>(null);

const newKeyName = ref('');
const newKeyScopes = ref<string[]>(['read:parcels', 'read:context']);
const created = ref<ApiKeyCreated | null>(null);

/** Alcances disponibles. Se mantienen alineados con los grupos de la GeoAPI. */
const SCOPE_OPTIONS = [
  { value: 'read:parcels', label: 'Leer predios y fichas' },
  { value: 'read:context', label: 'Leer contexto (población, equipamientos, suelos)' },
  { value: 'read:tiles', label: 'Consumir teselas vectoriales' },
  { value: 'run:analysis', label: 'Ejecutar análisis de zona y aptitud' },
  { value: 'write:reports', label: 'Generar informes' },
] as const;

async function load(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    const [keyList, usageList] = await Promise.all([listApiKeys(), getApiUsage(30)]);
    keys.value = keyList.data.items;
    usage.value = usageList.data;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

async function create(): Promise<void> {
  const name = newKeyName.value.trim();
  if (name.length === 0 || newKeyScopes.value.length === 0) return;
  try {
    const response = await createApiKey({ name, scopes: newKeyScopes.value });
    created.value = response.data;
    keys.value = [response.data, ...keys.value];
    newKeyName.value = '';
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  }
}

async function revoke(key: ApiKey): Promise<void> {
  try {
    const response = await revokeApiKey(key.id);
    keys.value = keys.value.map((item) => (item.id === key.id ? response.data : item));
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
  }
}

/** Serie de llamadas y errores por día. Dos series, misma escala: se ve la tasa de error. */
const usageOption = computed<EChartsOption | null>(() => {
  if (usage.value.length === 0) return null;
  return {
    legend: { data: ['Llamadas', 'Errores'], bottom: 0 },
    grid: { left: 8, right: 12, top: 24, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: usage.value.map((point) => point.date) },
    yAxis: { type: 'value' },
    series: [
      { name: 'Llamadas', type: 'line', data: usage.value.map((point) => point.calls) },
      { name: 'Errores', type: 'line', data: usage.value.map((point) => point.errors) },
    ],
  };
});

const totals = computed(() => ({
  calls: usage.value.reduce((sum, point) => sum + point.calls, 0),
  errors: usage.value.reduce((sum, point) => sum + point.errors, 0),
  credits: usage.value.reduce((sum, point) => sum + point.creditsSpent, 0),
}));

const activeKeys = computed(() => keys.value.filter((key) => key.revokedAt === null));
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-3 p-3">
    <h1 class="text-xl font-semibold">Llaves de API y consumo</h1>

    <p v-if="error" class="text-sm text-rose-800" role="alert">{{ error.message }}</p>

    <BaseCard title="Crear una llave" :heading-level="2">
      <form class="space-y-3" @submit.prevent="create">
        <BaseField
          label="Nombre de la llave"
          hint="Algo que te diga para qué es: «backend de producción», «pruebas locales»."
        >
          <template #default="{ id, describedBy }">
            <input :id="id" v-model="newKeyName" class="tc-input" :aria-describedby="describedBy" />
          </template>
        </BaseField>

        <fieldset>
          <legend class="tc-label mb-1.5">Alcances</legend>
          <label
            v-for="scope in SCOPE_OPTIONS"
            :key="scope.value"
            class="flex items-start gap-2 py-0.5 text-sm"
          >
            <input
              v-model="newKeyScopes"
              type="checkbox"
              :value="scope.value"
              class="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span>
              {{ scope.label }}
              <code class="ml-1 text-xs text-slate-500">{{ scope.value }}</code>
            </span>
          </label>
        </fieldset>

        <p class="text-xs text-amber-800">
          La llave completa se muestra una única vez, al crearla. Guárdala en tu gestor de
          secretos: no la podemos volver a mostrar porque solo conservamos su hash.
        </p>

        <BaseButton type="submit" :disabled="newKeyName.trim().length === 0 || newKeyScopes.length === 0">
          Crear llave
        </BaseButton>
      </form>
    </BaseCard>

    <BaseCard :title="`Llaves activas (${activeKeys.length})`" :heading-level="2" :padded="false">
      <LoadingSkeleton v-if="isLoading" :lines="4" class="p-4" />

      <EmptyState
        v-else-if="keys.length === 0"
        title="Todavía no tienes llaves"
        body="Crea una arriba para empezar a consumir la GeoAPI. El portal de desarrolladores tiene el quickstart y los ejemplos."
        icon="lock"
        action-label="Ir al portal de desarrolladores"
        @action="$router.push('/desarrolladores')"
      />

      <ul v-else class="divide-y divide-slate-100">
        <li
          v-for="key in keys"
          :key="key.id"
          class="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ key.name }}</p>
            <p class="font-mono text-xs text-slate-500">{{ key.maskedKey }}</p>
            <p class="text-xs text-slate-500">
              Creada el {{ new Date(key.createdAt).toLocaleDateString('es-CO') }} ·
              {{
                key.lastUsedAt
                  ? `último uso el ${new Date(key.lastUsedAt).toLocaleDateString('es-CO')}`
                  : 'sin usar todavía'
              }}
            </p>
            <p class="mt-0.5 text-xs text-slate-600">{{ key.scopes.join(', ') }}</p>
          </div>

          <div class="flex items-center gap-2">
            <BaseBadge :tone="key.revokedAt ? 'danger' : 'success'" size="sm">
              {{ key.revokedAt ? 'Revocada' : 'Activa' }}
            </BaseBadge>
            <BaseButton
              v-if="!key.revokedAt"
              variant="danger"
              size="sm"
              @click="revoke(key)"
            >
              Revocar
            </BaseButton>
          </div>
        </li>
      </ul>
    </BaseCard>

    <BaseCard title="Consumo de los últimos 30 días" :heading-level="2">
      <dl class="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt class="tc-label">Llamadas</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ totals.calls }}</dd>
        </div>
        <div>
          <dt class="tc-label">Errores</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ totals.errors }}</dd>
        </div>
        <div>
          <dt class="tc-label">Créditos gastados</dt>
          <dd class="text-lg font-semibold tabular-nums">{{ totals.credits }}</dd>
        </div>
      </dl>

      <!--
        El consumo es un dato propio de la plataforma, no un dato territorial: su procedencia
        es nuestro propio registro de uso, y así se declara.
      -->
      <ChartCard
        class="mt-3"
        title="Llamadas y errores por día"
        :option="usageOption"
        height="220px"
        :sources="[
          {
            datasetId: 'tc.usage_event',
            source: 'TerraColombia',
            name: 'Registro de uso de la API',
            cutDate: null,
            license: 'Dato propio de la plataforma',
            attribution: 'TerraColombia · registro interno de consumo',
            url: null,
            synthetic: false,
          },
        ]"
        :table-rows="usage.map((point) => ({ label: point.date, value: point.calls, unit: 'llamadas' }))"
      />
    </BaseCard>

    <!-- Diálogo con la llave en claro: única oportunidad de copiarla. -->
    <BaseModal
      :open="created !== null"
      title="Copia la llave ahora"
      size="md"
      @close="created = null"
    >
      <template v-if="created">
        <p class="text-sm text-slate-700">
          Esta es la única vez que mostramos la llave completa de
          <strong>{{ created.name }}</strong>. Si la pierdes, tendrás que crear otra.
        </p>
        <input
          class="tc-input mt-3 font-mono text-xs"
          :value="created.secret"
          readonly
          aria-label="Llave de API en claro"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </template>

      <template #footer>
        <div class="flex justify-between gap-2">
          <BaseButton variant="secondary" size="sm" @click="created && copy(created.secret)">
            {{ copied ? 'Copiada' : 'Copiar al portapapeles' }}
          </BaseButton>
          <BaseButton size="sm" @click="created = null">Ya la guardé</BaseButton>
        </div>
      </template>
    </BaseModal>
  </div>
</template>
