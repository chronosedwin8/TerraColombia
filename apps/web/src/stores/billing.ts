/**
 * Planes, pagos, créditos y equipo (M12). El frontend **nunca** toca datos de tarjeta:
 * pide una URL de checkout al backend y redirige al proveedor (Wompi primero).
 */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { AppError, PLANS, type PlanCode } from '@terracolombia/shared';
import * as billingApi from '@/api/billing';
import type { CreditLedgerEntry, PaymentRecord, SubscriptionInfo, TeamMember } from '@/api/types';

export const useBillingStore = defineStore('billing', () => {
  const subscription = shallowRef<SubscriptionInfo | null>(null);
  const payments = shallowRef<PaymentRecord[]>([]);
  const ledger = shallowRef<CreditLedgerEntry[]>([]);
  const team = shallowRef<TeamMember[]>([]);
  const isLoading = ref(false);
  const error = shallowRef<AppError | null>(null);

  const currentPlan = computed<PlanCode>(() => subscription.value?.plan ?? 'free');
  const planDefinition = computed(() => PLANS[currentPlan.value]);
  const credits = computed(() => subscription.value?.credits ?? 0);
  const seatsLeft = computed(() =>
    subscription.value ? Math.max(0, subscription.value.seatsTotal - subscription.value.seatsUsed) : 0,
  );

  async function load(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const [sub, pay, credit, members] = await Promise.all([
        billingApi.getSubscription(),
        billingApi.listPayments(),
        billingApi.getCreditLedger(),
        billingApi.listTeam(),
      ]);
      subscription.value = sub.data;
      payments.value = pay.data.items;
      ledger.value = credit.data.items;
      team.value = members.data.items;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos cargar tu plan');
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Planes que se pueden comprar por autoservicio.
   *
   * VERIFICADO: `POST /billing/checkout/subscription` solo acepta `pro | business | api`.
   * `free` es el plan por omisión, `per_report` se cobra al generar cada informe y
   * `enterprise` se cotiza caso por caso: ninguno pasa por este checkout.
   */
  const PURCHASABLE_PLANS = ['pro', 'business', 'api'] as const;
  type PurchasablePlan = (typeof PURCHASABLE_PLANS)[number];

  function isPurchasable(plan: PlanCode): plan is PurchasablePlan {
    return (PURCHASABLE_PLANS as readonly PlanCode[]).includes(plan);
  }

  /**
   * Devuelve la URL a la que redirigir. La navegación la hace la vista.
   *
   * OJO: la ruta es `/billing/checkout/subscription` y el campo es `planCode`. El
   * `/billing/checkout` genérico que llamaba la versión anterior no existe (404), así que
   * ningún botón «Elegir este plan» llegaba nunca al proveedor de pagos.
   */
  async function startSubscriptionCheckout(plan: PlanCode): Promise<string | null> {
    if (!isPurchasable(plan)) {
      error.value = new AppError('VALIDATION', 'Este plan no se contrata en línea');
      return null;
    }
    try {
      const response = await billingApi.startSubscriptionCheckout({
        planCode: plan,
        returnUrl: `${window.location.origin}/cuenta/plan`,
      });
      return response.data.checkoutUrl;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos iniciar el pago');
      return null;
    }
  }

  /**
   * Invitar a alguien al equipo.
   *
   * El rol invitable NO es `TeamMember['role']`: la API rechaza `owner` (solo hay un
   * propietario y es quien creó la organización), así que el tipo lo excluye.
   */
  async function invite(email: string, role: 'admin' | 'member' | 'viewer'): Promise<boolean> {
    try {
      const response = await billingApi.inviteMember({ email, role });
      team.value = [...team.value, response.data];
      return true;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos enviar la invitación');
      return false;
    }
  }

  async function removeMember(id: string): Promise<void> {
    try {
      await billingApi.removeMember(id);
      team.value = team.value.filter((m) => m.id !== id);
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos quitar a esta persona');
    }
  }

  return {
    subscription,
    payments,
    ledger,
    team,
    isLoading,
    error,
    currentPlan,
    planDefinition,
    credits,
    seatsLeft,
    load,
    isPurchasable,
    startSubscriptionCheckout,
    invite,
    removeMember,
  };
});
