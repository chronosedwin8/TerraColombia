import type { Envelope } from '@terracolombia/shared';
import { request } from './client';
import type {
  CreditLedgerEntry,
  CreditsCheckout,
  OkResponse,
  Page,
  PaymentRecord,
  SubscriptionCheckout,
  SubscriptionInfo,
  TeamInvitation,
  TeamMember,
} from './types';

export function getSubscription(): Promise<Envelope<SubscriptionInfo>> {
  return request<SubscriptionInfo>('/billing/subscription', { noCache: true });
}

/**
 * Inicia la compra de un plan. Devuelve la URL del proveedor de pagos (Wompi primero);
 * el frontend solo redirige: nunca maneja datos de tarjeta.
 *
 * OJO: la ruta es `/billing/checkout/subscription` y el campo es `planCode`, no `plan`.
 * `/billing/checkout` a secas NO existe (verificado: 404). Solo admite los planes con
 * precio de lista; `enterprise` se cotiza caso por caso y la API lo rechaza con VALIDATION.
 */
export function startSubscriptionCheckout(body: {
  planCode: 'pro' | 'business' | 'api';
  returnUrl?: string;
}): Promise<Envelope<SubscriptionCheckout>> {
  return request<SubscriptionCheckout>('/billing/checkout/subscription', {
    method: 'POST',
    body,
  });
}

/** Compra de un paquete de créditos. Ruta y cuerpo propios, distintos del plan. */
export function startCreditsCheckout(body: {
  packId: 'pack_100' | 'pack_500' | 'pack_2000';
  returnUrl?: string;
}): Promise<Envelope<CreditsCheckout>> {
  return request<CreditsCheckout>('/billing/checkout/credits', { method: 'POST', body });
}

/** Estado de un pago, para la pantalla de retorno del proveedor. */
export function getPaymentStatus(reference: string): Promise<Envelope<PaymentRecord>> {
  return request<PaymentRecord>(`/billing/payments/${encodeURIComponent(reference)}`, {
    noCache: true,
  });
}

/** Verificado: `{ id, createdAt, amountCop, concept, status }`. Sin `provider` ni `invoiceUrl`. */
export function listPayments(): Promise<Envelope<Page<PaymentRecord>>> {
  return request<Page<PaymentRecord>>('/billing/payments');
}

/**
 * Libro de créditos. Verificado: cada asiento es
 * `{ id, createdAt, delta, reason, operation, note }`. No hay `balance` acumulado.
 */
export function getCreditLedger(): Promise<Envelope<Page<CreditLedgerEntry>>> {
  return request<Page<CreditLedgerEntry>>('/billing/credits');
}

/** Miembros e invitaciones pendientes en la misma lista, distinguidos por `status`. */
export function listTeam(): Promise<Envelope<Page<TeamMember>>> {
  return request<Page<TeamMember>>('/billing/team');
}

/** Invitar. Verificado: el rol no puede ser `owner`; responde 201 con una `note`. */
export function inviteMember(body: {
  email: string;
  role?: 'admin' | 'member' | 'viewer';
}): Promise<Envelope<TeamInvitation>> {
  return request<TeamInvitation>('/billing/team', { method: 'POST', body });
}

/** Quita a un miembro o cancela su invitación. Verificado: responde `{ ok, removed }`. */
export function removeMember(id: string): Promise<Envelope<OkResponse>> {
  return request<OkResponse>(`/billing/team/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
