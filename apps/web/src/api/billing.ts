import type { Envelope, PlanCode } from '@terracolombia/shared';
import { request } from './client';
import type { CreditLedgerEntry, Page, PaymentRecord, SubscriptionInfo, TeamMember } from './types';

export function getSubscription(): Promise<Envelope<SubscriptionInfo>> {
  return request<SubscriptionInfo>('/billing/subscription', { noCache: true });
}

/**
 * Inicia el cambio de plan. Devuelve la URL del proveedor de pagos (Wompi primero);
 * el frontend solo redirige: nunca maneja datos de tarjeta.
 */
export function startCheckout(body: {
  plan: PlanCode;
  /** Para pago por informe: id del informe a pagar. */
  reportId?: string;
  returnUrl: string;
}): Promise<Envelope<{ checkoutUrl: string; reference: string }>> {
  return request<{ checkoutUrl: string; reference: string }>('/billing/checkout', {
    method: 'POST',
    body,
  });
}

export function listPayments(): Promise<Envelope<Page<PaymentRecord>>> {
  return request<Page<PaymentRecord>>('/billing/payments');
}

export function getCreditLedger(): Promise<Envelope<Page<CreditLedgerEntry>>> {
  return request<Page<CreditLedgerEntry>>('/billing/credits');
}

export function listTeam(): Promise<Envelope<Page<TeamMember>>> {
  return request<Page<TeamMember>>('/billing/team');
}

export function inviteMember(body: {
  email: string;
  role: TeamMember['role'];
}): Promise<Envelope<TeamMember>> {
  return request<TeamMember>('/billing/team', { method: 'POST', body });
}

export function removeMember(id: string): Promise<Envelope<undefined>> {
  return request<undefined>(`/billing/team/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
