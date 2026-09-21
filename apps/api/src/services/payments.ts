import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError, getLogger } from '@terracolombia/shared';
import { loadConfig } from '../config.js';

/**
 * Interfaz de pagos que necesita la API. `packages/payments` implementa los adaptadores
 * reales (Mercado Pago como principal, más Wompi, PayU y ePayco); aquí se adapta su salida
 * a lo que consumen las rutas, y se incluye un proveedor de desarrollo que no llama a nadie.
 */
export type TransactionStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'voided'
  | 'refunded'
  | 'error';

export interface CheckoutResult {
  checkoutUrl: string;
  providerRef: string | null;
}

export interface TransactionResult {
  reference: string;
  providerTransactionId: string;
  status: TransactionStatus;
  amountCop: number;
  method: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
  event: { id: string; type: string; transactionId: string | null };
}

export interface ApiPaymentProvider {
  readonly id: string;
  createCheckout(input: {
    reference: string;
    amountCop: number;
    description: string;
    returnUrl: string;
    notificationUrl: string;
  }): Promise<CheckoutResult>;
  getTransaction(providerTransactionId: string): Promise<TransactionResult>;
  verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    body: Record<string, unknown>;
  }): Promise<WebhookVerification>;
}

/**
 * Proveedor de desarrollo. No llama a ninguna pasarela: aprueba los montos pares y rechaza
 * los impares, y firma sus propios webhooks con HMAC local. Sirve para probar el flujo de
 * punta a punta sin credenciales.
 */
class MockProvider implements ApiPaymentProvider {
  readonly id = 'mock';
  private readonly secret: string;
  private readonly transactions = new Map<string, TransactionResult>();

  constructor(secret: string) {
    this.secret = secret;
  }

  async createCheckout(input: {
    reference: string;
    amountCop: number;
    description: string;
    returnUrl: string;
  }): Promise<CheckoutResult> {
    const txId = `mock_${input.reference}`;
    const approved = input.amountCop % 2 === 0;
    this.transactions.set(txId, {
      reference: input.reference,
      providerTransactionId: txId,
      status: approved ? 'approved' : 'declined',
      amountCop: input.amountCop,
      method: 'card',
      paidAt: approved ? new Date() : null,
      raw: { mock: true, description: input.description },
    });
    const url = new URL(input.returnUrl);
    url.searchParams.set('mockTx', txId);
    url.searchParams.set('mockStatus', approved ? 'approved' : 'declined');
    return { checkoutUrl: url.toString(), providerRef: txId };
  }

  async getTransaction(providerTransactionId: string): Promise<TransactionResult> {
    const tx = this.transactions.get(providerTransactionId);
    if (!tx) {
      // Tras un reinicio el mapa está vacío: se reconstruye desde el identificador.
      const reference = providerTransactionId.replace(/^mock_/, '');
      return {
        reference,
        providerTransactionId,
        status: 'approved',
        amountCop: 0,
        method: 'card',
        paidAt: new Date(),
        raw: { mock: true, reconstructed: true },
      };
    }
    return tx;
  }

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    body: Record<string, unknown>;
  }): Promise<WebhookVerification> {
    const signature = String(input.headers['x-mock-signature'] ?? '');
    const expected = createHmac('sha256', this.secret).update(input.rawBody).digest('hex');
    const ok =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const body = input.body as { id?: string; type?: string; transactionId?: string };
    return {
      valid: ok,
      reason: ok ? undefined : 'Firma x-mock-signature inválida',
      event: {
        id: body.id ?? `mock_evt_${Date.now()}`,
        type: body.type ?? 'payment.updated',
        transactionId: body.transactionId ?? null,
      },
    };
  }

  /** Utilidad para los tests: firma un cuerpo como lo haría el proveedor. */
  sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }
}

let instance: ApiPaymentProvider | null = null;

/**
 * Devuelve el proveedor configurado. Si `PAYMENT_PROVIDER` no es `mock`, se carga el
 * adaptador de `packages/payments` y se adapta su salida. Si la carga falla, se lanza con
 * un mensaje que dice exactamente qué configurar: nunca se degrada a `mock` en silencio,
 * porque eso significaría cobrar de mentira.
 */
export function getPaymentProvider(): ApiPaymentProvider {
  if (instance) return instance;
  const config = loadConfig();
  const log = getLogger({ mod: 'payments' });

  if (config.paymentProvider === 'mock') {
    log.warn({}, 'Proveedor de pagos en modo mock: no se cobra de verdad (solo desarrollo)');
    instance = new MockProvider(config.jwtSecret);
    return instance;
  }

  instance = createRealProvider(config.paymentProvider);
  log.info({ provider: config.paymentProvider }, 'Proveedor de pagos activo');
  return instance;
}

export function setPaymentProvider(p: ApiPaymentProvider): void {
  instance = p;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function createRealProvider(providerId: string): ApiPaymentProvider {
  // La carga es diferida y perezosa: `packages/payments` solo se necesita si se cobra.
  let underlying: any = null;

  const ensure = async (): Promise<any> => {
    if (underlying) return underlying;
    let mod: any;
    try {
      mod = await import('@terracolombia/payments');
    } catch (err) {
      throw new AppError(
        'UPSTREAM_UNAVAILABLE',
        'El módulo de pagos no está disponible en este despliegue. ' +
          'Instala las dependencias del monorepo o pon PAYMENT_PROVIDER=mock para desarrollo.',
        { cause: err instanceof Error ? err.message : String(err) },
      );
    }
    if (typeof mod.createPaymentProvider !== 'function') {
      throw new AppError(
        'UPSTREAM_UNAVAILABLE',
        '@terracolombia/payments no expone createPaymentProvider.',
        {},
      );
    }
    underlying = mod.createPaymentProvider({ ...process.env, PAYMENT_PROVIDER: providerId });
    if (!underlying) {
      throw new AppError(
        'UPSTREAM_UNAVAILABLE',
        `No hay adaptador de pagos para "${providerId}". Revisa PAYMENT_PROVIDER y las credenciales.`,
        {},
      );
    }
    return underlying;
  };

  const normalizeStatus = (raw: unknown): TransactionStatus => {
    const s = String(raw ?? '').toLowerCase();
    if (['approved', 'accredited', 'paid', 'success'].includes(s)) return 'approved';
    if (['pending', 'in_process', 'in_mediation', 'authorized', 'created'].includes(s)) {
      return 'pending';
    }
    if (['declined', 'rejected', 'failed'].includes(s)) return 'declined';
    if (['voided', 'cancelled', 'canceled'].includes(s)) return 'voided';
    if (['refunded', 'charged_back'].includes(s)) return 'refunded';
    return 'error';
  };

  return {
    id: providerId,

    async createCheckout(input) {
      const p = await ensure();
      const res = await p.createCheckout({
        reference: input.reference,
        amountCop: input.amountCop,
        amount: input.amountCop,
        currency: 'COP',
        description: input.description,
        returnUrl: input.returnUrl,
        redirectUrl: input.returnUrl,
        notificationUrl: input.notificationUrl,
      });
      const url =
        res?.checkoutUrl ?? res?.url ?? res?.initPoint ?? res?.init_point ?? res?.sandboxInitPoint;
      if (typeof url !== 'string') {
        throw new AppError(
          'UPSTREAM_UNAVAILABLE',
          'El proveedor de pagos no devolvió una URL de pago.',
          { providerId },
        );
      }
      return { checkoutUrl: url, providerRef: res?.providerRef ?? res?.id ?? null };
    },

    async getTransaction(providerTransactionId) {
      const p = await ensure();
      const tx = await p.getTransaction(providerTransactionId);
      return {
        reference: String(tx?.reference ?? tx?.external_reference ?? ''),
        providerTransactionId: String(tx?.id ?? providerTransactionId),
        status: normalizeStatus(tx?.status),
        amountCop: Number(tx?.amountCop ?? tx?.transaction_amount ?? 0),
        method: tx?.method ?? tx?.payment_method_id ?? null,
        paidAt: tx?.paidAt ? new Date(tx.paidAt) : (tx?.date_approved ? new Date(tx.date_approved) : null),
        raw: (tx?.raw ?? tx ?? {}) as Record<string, unknown>,
      };
    },

    async verifyWebhook(input) {
      const p = await ensure();
      const res = await p.verifyWebhook(input);
      // Los adaptadores pueden devolver `{ valid, event }` o lanzar ante firma inválida.
      const valid = res?.valid ?? res?.ok ?? false;
      const event = res?.event ?? {};
      return {
        valid: Boolean(valid),
        reason: res?.reason,
        event: {
          id: String(event.id ?? event.eventId ?? `evt_${Date.now()}`),
          type: String(event.type ?? event.eventType ?? 'unknown'),
          transactionId:
            event.transactionId ??
            event.dataId ??
            (input.body as { data?: { id?: string } })?.data?.id ??
            null,
        },
      };
    },
  };
}

export { MockProvider };
