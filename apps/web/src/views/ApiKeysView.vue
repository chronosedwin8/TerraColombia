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
/**
 * Entorno de la llave. VERIFICADO: es lo único, junto al nombre, que la creación admite
 * de esta pantalla. `live` exige un plan con API; si no, la API responde PLAN_REQUIRED.
 */
const newKeyEnvironment = ref<'sandbox' | 'live'>('sandbox');
const created = ref<ApiKeyCreated | null>(null);

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

/**
 * Crear una llave.
 *
 * Dos cosas que la versión anterior hacía mal:
 *  - mandaba `scopes` en el cuerpo, que la API no acepta;
 *  - metía la respuesta 201 en la lista como si fuera un `ApiKey`, pero `ApiKeyCreated` no
 *    trae `createdAt`, `lastUsedAt`, `revokedAt` ni `isActive`: la fila recién creada salía
 *    con «Invalid Date» y sin estado. Por eso se recarga la lista desde la API.
 */
async function create(): Promise<void> {
  const name = newKeyName.value.trim();
  if (name.length === 0) return;
  try {
    const response = await createApiKey({ name, environment: newKeyEnvironment.value });
    created.value = response.data;
    newKeyName.value = '';
    await load();
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

        <BaseField
          label="Entorno"
          hint="En pruebas puedes llamar a la API sin consumir créditos del plan."
        >
          <template #default="{ id, describedBy }">
            <select
              :id="id"
              v-model="newKeyEnvironment"
              class="tc-input"
              :aria-describedby="describedBy"
            >
              <option value="sandbox">Pruebas (sandbox)</option>
              <option value="live">Producción (live)</option>
            </select>
          </template>
        </BaseField>

        <!--
          Antes aquí había un selector de alcances. Se retiró porque la API no lo acepta al
          crear la llave: el cuerpo se ignoraba y las llaves quedaban con `scopes: []`, de
          modo que el usuario creía estar limitando permisos que en realidad no se limitaban.
        -->
        <p class="text-xs text-slate-600">
          Todas las llaves comparten los permisos de tu plan: no se restringen por alcance
          todavía. Para limitar el acceso, crea una llave por sistema y revoca la que ya no uses.
        </p>

        <p class="text-xs text-amber-800">
          La llave completa se muestra una única vez, al crearla. Guárdala en tu gestor de
          secretos: no la podemos volver a mostrar porque solo conservamos su hash.
        </p>

        <BaseButton type="submit" :disabled="newKeyName.trim().length === 0">
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
            <!-- Lo público de la llave es su `prefix`; el secreto solo existió al crearla. -->
            <p class="font-mono text-xs text-slate-500">{{ key.prefix }}…</p>
            <p class="text-xs text-slate-500">
              Creada el {{ new Date(key.createdAt).toLocaleDateString('es-CO') }} ·
              {{
                key.lastUsedAt
                  ? `último uso el ${new Date(key.lastUsedAt).toLocaleDateString('es-CO')}`
                  : 'sin usar todavía'
              }}
            </p>
            <p v-if="key.allowedOrigins.length > 0" class="mt-0.5 text-xs text-slate-600">
              Orígenes permitidos: {{ key.allowedOrigins.join(', ') }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <BaseBadge tone="info" size="sm">
              {{ key.environment === 'live' ? 'Producción' : 'Pruebas' }}
            </BaseBadge>
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

        <p class="mt-2 text-xs text-amber-800">{{ created.warning }}</p>

        <!-- La API devuelve un `curl` listo para pegar: se muestra en vez de reescribirlo. -->
        <p class="tc-label mt-3">Primera llamada</p>
        <pre class="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{{
          created.usage
        }}</pre>
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
