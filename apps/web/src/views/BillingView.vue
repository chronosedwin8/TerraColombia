<script setup lang="ts">
/**
 * Planes, pagos, créditos y equipo (pantalla 10 de §10.2, módulo M12).
 *
 * Dos cosas importantes de diseño:
 *  - los precios se leen de `PLANS` en `@terracolombia/shared`, que declara que son
 *    **hipótesis a validar**; la web no los duplica ni los redondea a su manera;
 *  - el frontend nunca ve datos de tarjeta: pide una URL de checkout y redirige al proveedor.
 *
 * Si se llega aquí por una guarda de plan, la query `motivo` dice qué función faltaba.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { CREDIT_COST, MESSAGES, PLANS, PLAN_CODES, formatCop, type PlanCode } from '@terracolombia/shared';
import { useBillingStore } from '@/stores/billing';
import { useAuthStore } from '@/stores/auth';
import { useEntitlements, type EntitlementFlag } from '@/composables/useEntitlements';
import TabsGroup from '@/components/ui/TabsGroup.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import type { TabItem } from '@/components/ui/types';
import type { TeamMember } from '@/api/types';

const route = useRoute();
const billing = useBillingStore();
const auth = useAuthStore();
const { labelFor } = useEntitlements();

const activeTab = ref('plans');
const inviteEmail = ref('');
const inviteRole = ref<TeamMember['role']>('member');

onMounted(() => {
  void billing.load();
});

const tabs: TabItem[] = [
  { id: 'plans', label: 'Planes' },
  { id: 'usage', label: 'Consumo y créditos' },
  { id: 'payments', label: 'Pagos' },
  { id: 'team', label: 'Equipo' },
];

/** Motivo por el que la guarda del router trajo al usuario hasta aquí. */
const blockedFeature = computed(() => {
  const motivo = route.query['motivo'];
  return typeof motivo === 'string' ? (motivo as EntitlementFlag) : null;
});

const backTo = computed(() => {
  const volver = route.query['volver'];
  return typeof volver === 'string' ? volver : null;
});

const plans = computed(() => PLAN_CODES.map((code) => PLANS[code]));

function priceLabel(code: PlanCode): string {
  const plan = PLANS[code];
  if (plan.monthlyPriceCop === null) return 'Cotización a la medida';
  if (plan.unitPriceCop !== null) return `${formatCop(plan.unitPriceCop)} por informe`;
  if (plan.monthlyPriceCop === 0) return 'Gratis';
  return `${formatCop(plan.monthlyPriceCop)} al mes`;
}

async function choose(code: PlanCode): Promise<void> {
  if (code === 'enterprise') {
    window.location.href = 'mailto:comercial@terracolombia.co?subject=Plan%20Enterprise';
    return;
  }
  const url = await billing.startCheckout(code);
  if (url) window.location.href = url;
}

async function invite(): Promise<void> {
  const email = inviteEmail.value.trim();
  if (email.length === 0) return;
  const ok = await billing.invite(email, inviteRole.value);
  if (ok) inviteEmail.value = '';
}

const CREDIT_LABELS: Record<keyof typeof CREDIT_COST, string> = {
  report_summary: 'Informe resumen',
  report_full: 'Informe completo',
  report_technical: 'Informe técnico',
  area_analysis_large: 'Análisis de zona grande',
  location_intel: 'Localización de negocio',
  bulk_export: 'Exportación masiva',
  change_compare: 'Comparación de cortes',
  ai_ask: 'Pregunta al asistente',
};

/** Costos en créditos como arreglo: iterar un objeto en la plantilla pierde el tipo de la clave. */
const creditRows = computed(() =>
  (Object.keys(CREDIT_COST) as Array<keyof typeof CREDIT_COST>).map((key) => ({
    key,
    label: CREDIT_LABELS[key],
    cost: CREDIT_COST[key],
  })),
);
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-3 p-3">
    <h1 class="text-xl font-semibold">Plan, pagos y equipo</h1>

    <!-- Aviso cuando el router bloqueó una vista por plan: se dice qué faltaba y cómo volver. -->
    <div
      v-if="blockedFeature"
      class="rounded-lg border border-amber-300 bg-amber-50 p-4"
      role="note"
    >
      <p class="text-sm font-semibold text-amber-950">
        «{{ labelFor(blockedFeature) }}» no está incluida en tu plan {{ auth.planName }}
      </p>
      <p class="mt-1 text-sm text-amber-900">
        Abajo puedes ver qué planes la incluyen. Si mejoras el plan, volvemos justo a donde
        estabas.
      </p>
      <BaseButton v-if="backTo" class="mt-2" variant="secondary" size="sm" :to="backTo">
        Volver a donde estaba
      </BaseButton>
    </div>

    <TabsGroup v-model="activeTab" :tabs="tabs" aria-label="Secciones de facturación">
      <!-- ── Planes ─────────────────────────────────────────────────────────── -->
      <template #plans>
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <BaseCard
            v-for="plan in plans"
            :key="plan.code"
            :title="plan.name"
            :heading-level="3"
            :subtitle="plan.audience"
          >
            <template #actions>
              <BaseBadge v-if="plan.code === billing.currentPlan" tone="brand">Tu plan</BaseBadge>
            </template>

            <p class="text-lg font-semibold">{{ priceLabel(plan.code) }}</p>

            <ul class="mt-2 space-y-1 text-sm text-slate-700">
              <li v-for="highlight in plan.highlights" :key="highlight" class="flex gap-1.5">
                <span aria-hidden="true">·</span>
                <span>{{ highlight }}</span>
              </li>
            </ul>

            <dl class="mt-3 space-y-0.5 text-xs text-slate-600">
              <div class="flex justify-between gap-2">
                <dt>Área máxima por análisis</dt>
                <dd>{{ plan.entitlements.maxAnalysisAreaKm2 }} km²</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>Informes al mes</dt>
                <dd>{{ plan.entitlements.reportsPerMonth ?? 'sin límite' }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>Usuarios</dt>
                <dd>{{ plan.entitlements.seats }}</dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>Créditos mensuales</dt>
                <dd>{{ plan.monthlyCredits }}</dd>
              </div>
            </dl>

            <BaseButton
              class="mt-3"
              block
              size="sm"
              :disabled="plan.code === billing.currentPlan"
              @click="choose(plan.code)"
            >
              {{ plan.code === 'enterprise' ? 'Hablar con ventas' : 'Elegir este plan' }}
            </BaseButton>
          </BaseCard>
        </div>

        <p class="mt-3 text-xs text-slate-500">
          Los precios son una hipótesis de lanzamiento y pueden cambiar antes de la salida
          comercial. Los pagos se procesan con un proveedor externo: TerraColombia no almacena
          datos de tarjeta.
        </p>
      </template>

      <!-- ── Consumo y créditos ─────────────────────────────────────────────── -->
      <template #usage>
        <LoadingSkeleton v-if="billing.isLoading" variant="card" />

        <div v-else class="space-y-3">
          <BaseCard title="Consumo del periodo" :heading-level="2">
            <EmptyState
              v-if="!billing.subscription || billing.subscription.usage.length === 0"
              title="Sin consumo registrado todavía"
              body="Aquí verás cuántas consultas, informes y llamadas a la API has usado frente al límite de tu plan."
              icon="data"
            />

            <ul v-else class="space-y-3">
              <li v-for="row in billing.subscription.usage" :key="row.key">
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span>{{ row.label }}</span>
                  <span class="tabular-nums">
                    {{ row.used }} / {{ row.limit ?? 'sin límite' }}
                  </span>
                </div>
                <div
                  v-if="row.limit !== null"
                  class="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  :aria-valuenow="row.used"
                  aria-valuemin="0"
                  :aria-valuemax="row.limit"
                  :aria-label="row.label"
                >
                  <div
                    class="h-full rounded-full"
                    :class="row.used / row.limit > 0.9 ? 'bg-semaphore-blocker' : 'bg-brand-600'"
                    :style="{ width: `${Math.min(100, (row.used / row.limit) * 100)}%` }"
                  />
                </div>
              </li>
            </ul>
          </BaseCard>

          <BaseCard :title="`Créditos disponibles: ${billing.credits}`" :heading-level="2">
            <p class="text-sm text-slate-700">
              Cada operación costosa descuenta créditos. Estos son los costos vigentes:
            </p>
            <ul class="mt-2 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
              <li
                v-for="row in creditRows"
                :key="row.key"
                class="flex justify-between gap-2 py-0.5"
              >
                <span>{{ row.label }}</span>
                <span class="tabular-nums">{{ row.cost }}</span>
              </li>
            </ul>
          </BaseCard>

          <BaseCard title="Movimientos de créditos" :heading-level="2" :padded="false">
            <EmptyState
              v-if="billing.ledger.length === 0"
              title="Sin movimientos"
              body="Aquí aparecerán las recargas del periodo y los descuentos por cada operación."
              icon="data"
            />
            <table v-else class="tc-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Concepto</th>
                  <th scope="col">Movimiento</th>
                  <th scope="col">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in billing.ledger" :key="entry.id">
                  <td>{{ new Date(entry.createdAt).toLocaleDateString('es-CO') }}</td>
                  <td>{{ entry.concept }}</td>
                  <td class="tabular-nums" :class="entry.delta < 0 ? 'text-rose-800' : 'text-emerald-800'">
                    {{ entry.delta > 0 ? '+' : '' }}{{ entry.delta }}
                  </td>
                  <td class="tabular-nums">{{ entry.balance }}</td>
                </tr>
              </tbody>
            </table>
          </BaseCard>
        </div>
      </template>

      <!-- ── Pagos ──────────────────────────────────────────────────────────── -->
      <template #payments>
        <BaseCard title="Historial de pagos" :heading-level="2" :padded="false">
          <EmptyState
            v-if="billing.payments.length === 0"
            title="Sin pagos registrados"
            body="Cuando compres un informe o un plan, aquí quedará el comprobante."
            icon="data"
          />
          <table v-else class="tc-table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Concepto</th>
                <th scope="col">Valor</th>
                <th scope="col">Estado</th>
                <th scope="col">Factura</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in billing.payments" :key="payment.id">
                <td>{{ new Date(payment.createdAt).toLocaleDateString('es-CO') }}</td>
                <td>{{ payment.concept }}</td>
                <td class="tabular-nums">{{ formatCop(payment.amountCop) }}</td>
                <td>
                  <BaseBadge
                    :tone="
                      payment.status === 'approved'
                        ? 'success'
                        : payment.status === 'declined'
                          ? 'danger'
                          : 'info'
                    "
                    size="sm"
                  >
                    {{ payment.status }}
                  </BaseBadge>
                </td>
                <td>
                  <a
                    v-if="payment.invoiceUrl"
                    class="tc-link"
                    :href="payment.invoiceUrl"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Ver
                  </a>
                  <span v-else>{{ MESSAGES.common.notAvailable }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </BaseCard>
      </template>

      <!-- ── Equipo ─────────────────────────────────────────────────────────── -->
      <template #team>
        <div class="space-y-3">
          <BaseCard
            :title="`Equipo (${billing.team.length} de ${billing.subscription?.seatsTotal ?? 1})`"
            :heading-level="2"
          >
            <form class="flex flex-wrap items-end gap-2" @submit.prevent="invite">
              <div class="min-w-56 flex-1">
                <BaseField label="Correo de quien invitas">
                  <template #default="{ id }">
                    <input :id="id" v-model="inviteEmail" type="email" class="tc-input" />
                  </template>
                </BaseField>
              </div>
              <div>
                <BaseField label="Rol">
                  <template #default="{ id }">
                    <select :id="id" v-model="inviteRole" class="tc-input">
                      <option value="admin">Administra</option>
                      <option value="member">Trabaja</option>
                      <option value="viewer">Solo consulta</option>
                    </select>
                  </template>
                </BaseField>
              </div>
              <BaseButton
                type="submit"
                :disabled="inviteEmail.trim().length === 0 || billing.seatsLeft === 0"
              >
                Invitar
              </BaseButton>
            </form>

            <p v-if="billing.seatsLeft === 0" class="mt-2 text-sm text-amber-800">
              No quedan cupos en tu plan. Mejora el plan para añadir más personas.
            </p>
          </BaseCard>

          <BaseCard title="Personas" :heading-level="2" :padded="false">
            <EmptyState
              v-if="billing.team.length === 0"
              title="Todavía trabajas solo"
              body="Invita a tu equipo para compartir proyectos, informes y alertas."
              icon="data"
            />
            <ul v-else class="divide-y divide-slate-100">
              <li
                v-for="member in billing.team"
                :key="member.id"
                class="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ member.name ?? member.email }}</p>
                  <p class="text-xs text-slate-500">{{ member.email }} · {{ member.role }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <BaseBadge :tone="member.status === 'active' ? 'success' : 'info'" size="sm">
                    {{ member.status === 'active' ? 'Activa' : 'Invitada' }}
                  </BaseBadge>
                  <BaseButton variant="ghost" size="sm" @click="billing.removeMember(member.id)">
                    Quitar
                  </BaseButton>
                </div>
              </li>
            </ul>
          </BaseCard>
        </div>
      </template>
    </TabsGroup>

    <p v-if="billing.error" class="text-sm text-rose-800" role="alert">{{ billing.error.message }}</p>
  </div>
</template>
