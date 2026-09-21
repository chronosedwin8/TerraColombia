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

  /** Devuelve la URL a la que redirigir. La navegación la hace la vista. */
  async function startCheckout(plan: PlanCode, reportId?: string): Promise<string | null> {
    try {
      const response = await billingApi.startCheckout({
        plan,
        ...(reportId ? { reportId } : {}),
        returnUrl: `${window.location.origin}/cuenta/plan`,
      });
      return response.data.checkoutUrl;
    } catch (e) {
      error.value = e instanceof AppError ? e : new AppError('INTERNAL', 'No pudimos iniciar el pago');
      return null;
    }
  }

  async function invite(email: string, role: TeamMember['role']): Promise<boolean> {
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
    startCheckout,
    invite,
    removeMember,
  };
});
