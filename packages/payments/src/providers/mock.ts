import { createHmac, timingSafeEqual } from 'node:crypto';
import { bodyToString, header } from '../http.js';
import {
  PaymentError,
  assertValidCheckout,
  isFinalStatus,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentMethod,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type Transaction,
  type TransactionStatus,
  type WebhookRequest,
  type WebhookVerification,
} from '../types.js';

/**
 * Proveedor de desarrollo **determinista**. No hace ninguna petición de red, así que sirve
 * para pruebas de punta a punta reproducibles (Fase 6: "compra real en sandbox de punta a
 * punta" se prueba primero aquí y luego contra Mercado Pago).
 *
 * Regla de decisión, elegida por ser trivial de recordar en una demo:
 * - **monto par → aprobada**
 * - **monto impar → rechazada**
 * - monto que termina en `13` → pendiente, para ejercitar el camino de PSE y Efecty
 * - monto 0 o negativo → error de validación (lo rechaza `assertValidCheckout`)
 *
 * Los webhooks se firman con HMAC-SHA256 y la cabecera `x-mock-signature`, con el mismo
 * patrón de verificación en tiempo constante que los proveedores reales.
 */

export const MOCK_METHODS: PaymentMethod[] = [
  { kind: 'card', label: 'Tarjeta (simulada)', providerCode: 'MOCK_CARD', settlementNote: 'Respuesta inmediata.' },
  { kind: 'pse', label: 'PSE (simulado)', providerCode: 'MOCK_PSE', settlementNote: 'Queda pendiente si el monto termina en 13.' },
  { kind: 'efecty', label: 'Efecty (simulado)', providerCode: 'MOCK_EFECTY', settlementNote: 'Queda pendiente si el monto termina en 13.' },
];

/** Estado que le corresponde a un monto, según la regla determinista. */
export function mockStatusFor(amountCop: number): TransactionStatus {
  if (amountCop % 100 === 13) return 'pending';
  return amountCop % 2 === 0 ? 'approved' : 'declined';
}

/** Identificador determinista de la transacción, derivado de la referencia. */
export function mockTransactionId(reference: string, amountCop: number): string {
  return `mock_${reference}_${amountCop}`;
}

export function mockSign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export interface MockConfig {
  /** Secreto con el que se firman los webhooks simulados. */
  webhookSecret: string;
  /** URL base a la que apunta el "checkout" simulado. */
  checkoutBaseUrl?: string;
}

interface MockRecord {
  reference: string;
  amountCop: number;
  status: TransactionStatus;
  createdAt: string;
  refundedAmountCop: number;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock' as const;
  readonly sandbox = true;
  private readonly store = new Map<string, MockRecord>();
  private readonly checkoutBaseUrl: string;

  constructor(private readonly config: MockConfig) {
    this.checkoutBaseUrl = config.checkoutBaseUrl ?? 'http://localhost:5173/pago-simulado';
  }

  listPaymentMethods(): PaymentMethod[] {
    return MOCK_METHODS;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    assertValidCheckout(request);
    const id = mockTransactionId(request.reference, request.amountCop);
    const record: MockRecord = {
      reference: request.reference,
      amountCop: request.amountCop,
      status: mockStatusFor(request.amountCop),
      createdAt: new Date().toISOString(),
      refundedAmountCop: 0,
    };
    // Idempotente: repetir la misma referencia no crea una transacción nueva.
    if (!this.store.has(id)) this.store.set(id, record);

    const url = new URL(this.checkoutBaseUrl);
    url.searchParams.set('reference', request.reference);
    url.searchParams.set('amount', String(request.amountCop));
    url.searchParams.set('transaction', id);
    url.searchParams.set('redirect', request.redirectUrl);

    return {
      provider: this.id,
      reference: request.reference,
      checkoutUrl: url.toString(),
      providerReference: id,
      amountCop: request.amountCop,
      currency: 'COP',
      expiresAt: null,
      sandbox: true,
      raw: this.store.get(id) ?? record,
    };
  }

  async getTransaction(providerTransactionId: string): Promise<Transaction> {
    const record = this.store.get(providerTransactionId) ?? this.inferFromId(providerTransactionId);
    if (!record) {
      throw new PaymentError(
        'not_found',
        `El proveedor simulado no tiene la transacción ${providerTransactionId}. Cree primero el checkout.`,
      );
    }
    return {
      provider: this.id,
      providerTransactionId,
      reference: record.reference,
      status: record.status,
      providerStatus: record.status.toUpperCase(),
      providerStatusDetail:
        record.status === 'declined'
          ? 'Monto impar: el proveedor simulado rechaza los montos impares.'
          : record.status === 'pending'
            ? 'Monto que termina en 13: el proveedor simulado lo deja pendiente.'
            : null,
      amountCop: record.amountCop,
      currency: 'COP',
      method: 'card',
      methodLabel: 'Tarjeta (simulada)',
      createdAt: record.createdAt,
      approvedAt: record.status === 'approved' ? record.createdAt : null,
      final: isFinalStatus(record.status),
      raw: record,
    };
  }

  /** Permite consultar una transacción que se creó en otro proceso (tests de la API). */
  private inferFromId(providerTransactionId: string): MockRecord | null {
    const match = /^mock_(.+)_(\d+)$/.exec(providerTransactionId);
    if (!match) return null;
    const reference = match[1] as string;
    const amountCop = Number(match[2]);
    return {
      reference,
      amountCop,
      status: mockStatusFor(amountCop),
      createdAt: new Date(0).toISOString(),
      refundedAmountCop: 0,
    };
  }

  /** Construye un webhook simulado ya firmado, para las pruebas de punta a punta. */
  buildSignedWebhook(params: {
    eventId: string;
    providerTransactionId: string;
    reference: string;
    status: TransactionStatus;
  }): { headers: Record<string, string>; rawBody: string } {
    const body = JSON.stringify({
      id: params.eventId,
      type: 'transaction.updated',
      data: {
        transaction_id: params.providerTransactionId,
        reference: params.reference,
        status: params.status,
      },
    });
    return {
      headers: {
        'content-type': 'application/json',
        'x-mock-signature': mockSign(body, this.config.webhookSecret),
      },
      rawBody: body,
    };
  }

  verifyWebhook(request: WebhookRequest): WebhookVerification {
    if (!this.config.webhookSecret) {
      return { ok: false, code: 'missing_secret', reason: 'El proveedor simulado necesita un secreto de webhook.' };
    }
    const signature = header(request.headers, 'x-mock-signature');
    if (!signature) {
      return { ok: false, code: 'missing_signature', reason: 'Falta la cabecera x-mock-signature.' };
    }
    const raw = bodyToString(request.rawBody);
    const expected = mockSign(raw, this.config.webhookSecret);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature.toLowerCase(), 'hex');
    if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, code: 'invalid_signature', reason: 'La firma simulada no coincide.' };
    }

    let payload: MockWebhookBody;
    try {
      payload = JSON.parse(raw) as MockWebhookBody;
    } catch {
      return { ok: false, code: 'malformed_body', reason: 'El cuerpo no es JSON válido.' };
    }
    if (!payload.id) {
      return { ok: false, code: 'unsupported_event', reason: 'El evento simulado no trae identificador.' };
    }

    return {
      ok: true,
      event: {
        id: String(payload.id),
        provider: this.id,
        type: payload.type ?? 'transaction.updated',
        reference: payload.data?.reference ?? null,
        providerTransactionId: payload.data?.transaction_id ?? null,
        status: payload.data?.status ?? null,
        receivedAt: new Date().toISOString(),
        raw: payload,
      },
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const record = this.store.get(request.providerTransactionId) ?? this.inferFromId(request.providerTransactionId);
    if (!record) {
      throw new PaymentError('not_found', `No existe la transacción ${request.providerTransactionId}.`);
    }
    if (record.status !== 'approved') {
      throw PaymentError.validation(
        `Solo se devuelven transacciones aprobadas; esta está en estado ${record.status}.`,
      );
    }
    const amount = request.amountCop ?? record.amountCop;
    if (amount + record.refundedAmountCop > record.amountCop) {
      throw PaymentError.validation(
        `La devolución de ${amount} supera el saldo devolvible (${record.amountCop - record.refundedAmountCop}).`,
      );
    }
    record.refundedAmountCop += amount;
    if (record.refundedAmountCop >= record.amountCop) record.status = 'voided';
    this.store.set(request.providerTransactionId, record);

    return {
      ok: true,
      provider: this.id,
      providerRefundId: `mockref_${request.providerTransactionId}_${record.refundedAmountCop}`,
      providerTransactionId: request.providerTransactionId,
      amountCop: amount,
      status: 'voided',
      providerStatus: 'REFUNDED',
      raw: record,
    };
  }

  /** Solo para pruebas: vacía el almacén en memoria. */
  reset(): void {
    this.store.clear();
  }
}

interface MockWebhookBody {
  id?: string;
  type?: string;
  data?: { transaction_id?: string; reference?: string; status?: TransactionStatus };
}

export function createMockProvider(env: NodeJS.ProcessEnv = process.env): MockPaymentProvider {
  return new MockPaymentProvider({
    webhookSecret: env['MOCK_WEBHOOK_SECRET'] ?? 'secreto-de-desarrollo',
    ...(env['MOCK_CHECKOUT_URL'] ? { checkoutBaseUrl: env['MOCK_CHECKOUT_URL'] } : {}),
  });
}
