import { createHash, timingSafeEqual } from 'node:crypto';
import { getLogger } from '@terracolombia/shared';
import { bodyToString, httpJson } from '../http.js';
import {
  PaymentError,
  isFinalStatus,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentMethod,
  type PaymentMethodKind,
  type PaymentProvider,
  type RefundRequest,
  type RefundResult,
  type Transaction,
  type TransactionStatus,
  type WebhookRequest,
  type WebhookVerification,
} from '../types.js';

/**
 * Adaptador de **Wompi** — alternativa, no el camino principal (ADR-008: el principal es
 * Mercado Pago). Se mantiene porque la arquitectura es de puertos y adaptadores y cambiar de
 * pasarela debe ser cambiar una variable de entorno.
 *
 * Variables de entorno:
 *   WOMPI_PUBLIC_KEY        llave pública (`pub_test_…` / `pub_prod_…`)
 *   WOMPI_PRIVATE_KEY       llave privada, para consultas autenticadas
 *   WOMPI_INTEGRITY_SECRET  secreto de integridad, para firmar el checkout
 *   WOMPI_EVENTS_SECRET     secreto de eventos, para verificar los webhooks
 *   WOMPI_BASE_URL          por omisión el sandbox
 *
 * Medios soportados: tarjeta, PSE y Nequi.
 */

const log = getLogger({ mod: 'payments/wompi' });

const DEFAULT_BASE_URL = 'https://sandbox.wompi.co/v1';
const CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/** Estados de Wompi → estado normalizado. */
export const WOMPI_STATUS_MAP: Record<string, TransactionStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  VOIDED: 'voided',
  ERROR: 'error',
};

export function normalizeWompiStatus(status: string | null | undefined): TransactionStatus {
  if (!status) return 'error';
  return WOMPI_STATUS_MAP[status.toUpperCase()] ?? 'error';
}

export const WOMPI_METHODS: PaymentMethod[] = [
  { kind: 'card', label: 'Tarjeta de crédito o débito', providerCode: 'CARD', settlementNote: 'Respuesta inmediata.' },
  {
    kind: 'pse',
    label: 'PSE (débito desde cuenta bancaria)',
    providerCode: 'PSE',
    settlementNote: 'El banco puede tardar en confirmar.',
  },
  { kind: 'nequi', label: 'Nequi', providerCode: 'NEQUI', settlementNote: 'Requiere aprobar la notificación en la app de Nequi.' },
  {
    kind: 'bancolombia_transfer',
    label: 'Botón Bancolombia',
    providerCode: 'BANCOLOMBIA_TRANSFER',
    settlementNote: 'Se confirma al volver de la banca en línea.',
  },
];

/**
 * **Firma de integridad de Wompi.** Está bien documentada y es la única parte de este
 * adaptador que se considera verificada:
 *
 *     SHA-256( referencia + montoEnCentavos + moneda + secretoDeIntegridad )
 *
 * Los componentes se concatenan en ese orden, sin separadores, y el resultado va en
 * hexadecimal minúsculo. El monto es **en centavos**: Wompi cobra en la unidad mínima, así que
 * un informe de COP 45.000 se firma como `4500000`.
 */
export function wompiIntegritySignature(params: {
  reference: string;
  amountInCents: number;
  currency: string;
  integritySecret: string;
  /** Fecha de expiración ISO 8601, si el checkout la lleva. Va al final, tras la moneda. */
  expirationTime?: string | null;
}): string {
  const base = params.expirationTime
    ? `${params.reference}${params.amountInCents}${params.currency}${params.expirationTime}${params.integritySecret}`
    : `${params.reference}${params.amountInCents}${params.currency}${params.integritySecret}`;
  return createHash('sha256').update(base, 'utf8').digest('hex');
}

/** Comparación en tiempo constante de dos hexadecimales del mismo largo. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface WompiConfig {
  publicKey: string;
  privateKey: string;
  integritySecret: string;
  eventsSecret: string;
  baseUrl?: string | null;
  checkoutUrl?: string | null;
}

export class WompiProvider implements PaymentProvider {
  readonly id = 'wompi' as const;
  readonly sandbox: boolean;
  private readonly baseUrl: string;
  private readonly checkoutUrl: string;

  constructor(private readonly config: WompiConfig) {
    if (!config.publicKey || !config.privateKey) {
      throw PaymentError.config('Faltan WOMPI_PUBLIC_KEY y/o WOMPI_PRIVATE_KEY.');
    }
    if (!config.integritySecret) {
      throw PaymentError.config(
        'Falta WOMPI_INTEGRITY_SECRET: sin el secreto de integridad el checkout de Wompi rechaza la transacción.',
      );
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.checkoutUrl = config.checkoutUrl ?? CHECKOUT_URL;
    this.sandbox = /sandbox|uat/i.test(this.baseUrl) || config.publicKey.startsWith('pub_test_');
  }

  listPaymentMethods(): PaymentMethod[] {
    return WOMPI_METHODS;
  }

  /**
   * Construye el enlace del *Web Checkout* con la firma de integridad.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: el nombre exacto de los parámetros de
   * consulta del Web Checkout (`public-key`, `currency`, `amount-in-cents`, `reference`,
   * `signature:integrity`, `redirect-url`, `expiration-time`) y si existe un endpoint de
   * "payment link" que deba usarse en su lugar. El esquema de la firma sí está verificado.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const amountInCents = request.amountCop * 100;
    const expiresAt =
      request.expiresInMinutes && request.expiresInMinutes > 0
        ? new Date(Date.now() + request.expiresInMinutes * 60_000).toISOString()
        : null;

    const signature = wompiIntegritySignature({
      reference: request.reference,
      amountInCents,
      currency: 'COP',
      integritySecret: this.config.integritySecret,
      expirationTime: expiresAt,
    });

    const url = new URL(this.checkoutUrl);
    url.searchParams.set('public-key', this.config.publicKey);
    url.searchParams.set('currency', 'COP');
    url.searchParams.set('amount-in-cents', String(amountInCents));
    url.searchParams.set('reference', request.reference);
    url.searchParams.set('signature:integrity', signature);
    url.searchParams.set('redirect-url', request.redirectUrl);
    url.searchParams.set('customer-data:email', request.customer.email);
    if (request.customer.fullName) {
      url.searchParams.set('customer-data:full-name', request.customer.fullName);
    }
    if (expiresAt) url.searchParams.set('expiration-time', expiresAt);

    return {
      provider: this.id,
      reference: request.reference,
      checkoutUrl: url.toString(),
      // El Web Checkout no crea un recurso previo: la referencia es nuestra propia referencia.
      providerReference: request.reference,
      amountCop: request.amountCop,
      currency: 'COP',
      expiresAt,
      sandbox: this.sandbox,
      raw: { signature, amountInCents },
    };
  }

  async getTransaction(providerTransactionId: string): Promise<Transaction> {
    const { data } = await httpJson<{ data?: WompiTransaction }>(
      `${this.baseUrl}/transactions/${encodeURIComponent(providerTransactionId)}`,
      {
        headers: { Authorization: `Bearer ${this.config.privateKey}` },
        providerLabel: 'Wompi',
        retries: 2,
      },
    );
    const tx = data.data;
    if (!tx) {
      throw PaymentError.provider('Wompi no devolvió la transacción solicitada.', {
        providerTransactionId,
      });
    }
    return toWompiTransaction(tx);
  }

  /**
   * Verifica el webhook con el **secreto de eventos**.
   *
   * Wompi firma así: se toman los valores de las propiedades listadas en
   * `signature.properties` (rutas con punto dentro de `data`), se concatenan en ese orden, se
   * añade el `timestamp` y después el secreto de eventos, y se aplica SHA-256. La comparación
   * se hace con `timingSafeEqual`.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: si el `timestamp` que entra en la
   * concatenación es el del cuerpo (`timestamp`) o el de la cabecera, y si la firma llega en el
   * cuerpo (`signature.checksum`) o también en una cabecera. Aquí se usa el cuerpo, que es lo
   * que describen los ejemplos de Wompi.
   */
  verifyWebhook(request: WebhookRequest): WebhookVerification {
    if (!this.config.eventsSecret) {
      return {
        ok: false,
        code: 'missing_secret',
        reason: 'Falta WOMPI_EVENTS_SECRET; sin él no se puede verificar ningún webhook de Wompi.',
      };
    }

    let payload: WompiEventBody;
    try {
      payload = JSON.parse(bodyToString(request.rawBody)) as WompiEventBody;
    } catch {
      return { ok: false, code: 'malformed_body', reason: 'El cuerpo del webhook no es JSON válido.' };
    }

    const checksum = payload.signature?.checksum;
    const properties = payload.signature?.properties;
    if (!checksum || !Array.isArray(properties) || properties.length === 0) {
      return {
        ok: false,
        code: 'malformed_signature',
        reason: 'El webhook de Wompi no trae `signature.checksum` y `signature.properties`.',
      };
    }

    const values: string[] = [];
    for (const path of properties) {
      // Las rutas de `signature.properties` son relativas a `data`, p. ej. `transaction.status`.
      const value = readPath(payload.data, path);
      if (value === undefined || value === null) {
        return {
          ok: false,
          code: 'malformed_signature',
          reason: `La propiedad "${path}" que Wompi dice haber firmado no está en el cuerpo del evento.`,
        };
      }
      values.push(String(value));
    }

    const concatenated = `${values.join('')}${payload.timestamp ?? ''}${this.config.eventsSecret}`;
    const expected = createHash('sha256').update(concatenated, 'utf8').digest('hex');

    if (!safeEqualHex(expected, checksum.toLowerCase())) {
      log.warn({ properties }, 'Firma de webhook de Wompi inválida');
      return {
        ok: false,
        code: 'invalid_signature',
        reason: 'El checksum del webhook de Wompi no coincide con el calculado con el secreto de eventos.',
      };
    }

    const tx = payload.data?.transaction;
    const eventId =
      payload.id ??
      // Wompi no siempre manda un identificador de evento; la combinación transacción +
      // timestamp + estado es única y conserva la idempotencia.
      `wompi_${tx?.id ?? 'sin-id'}_${payload.timestamp ?? ''}_${tx?.status ?? ''}`;

    return {
      ok: true,
      event: {
        id: String(eventId),
        provider: this.id,
        type: payload.event ?? 'transaction.updated',
        reference: tx?.reference ?? null,
        providerTransactionId: tx?.id ?? null,
        status: tx?.status ? normalizeWompiStatus(tx.status) : null,
        receivedAt: new Date().toISOString(),
        raw: payload,
      },
    };
  }

  /**
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: Wompi gestiona las anulaciones y
   * devoluciones por su panel y, según el medio de pago, no expone un endpoint público de
   * devolución. Hasta confirmarlo, este adaptador no finge tener uno.
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    throw PaymentError.unsupported(
      'Las devoluciones de Wompi no están implementadas en este adaptador: hay que confirmar con Wompi qué endpoint aplica a cada medio de pago (tarjeta, PSE, Nequi) antes de usarlo. Por ahora se gestionan desde el panel de Wompi y se registran a mano en el libro de créditos.',
      { providerTransactionId: request.providerTransactionId },
    );
  }
}

function toWompiTransaction(tx: WompiTransaction): Transaction {
  const status = normalizeWompiStatus(tx.status);
  const method = wompiMethodKind(tx.payment_method_type);
  return {
    provider: 'wompi',
    providerTransactionId: tx.id ?? '',
    reference: tx.reference ?? null,
    status,
    providerStatus: tx.status ?? 'desconocido',
    providerStatusDetail: tx.status_message ?? null,
    // Wompi devuelve centavos; el producto trabaja en pesos enteros.
    amountCop: Math.round((tx.amount_in_cents ?? 0) / 100),
    currency: tx.currency ?? 'COP',
    method,
    methodLabel: WOMPI_METHODS.find((m) => m.kind === method)?.label ?? tx.payment_method_type ?? null,
    createdAt: tx.created_at ?? null,
    approvedAt: tx.finalized_at ?? null,
    final: isFinalStatus(status),
    raw: tx,
  };
}

function wompiMethodKind(type: string | null | undefined): PaymentMethodKind {
  switch ((type ?? '').toUpperCase()) {
    case 'CARD':
      return 'card';
    case 'PSE':
      return 'pse';
    case 'NEQUI':
      return 'nequi';
    case 'BANCOLOMBIA_TRANSFER':
    case 'BANCOLOMBIA_COLLECT':
      return 'bancolombia_transfer';
    default:
      return 'other';
  }
}

function readPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

interface WompiTransaction {
  id?: string;
  reference?: string;
  status?: string;
  status_message?: string | null;
  amount_in_cents?: number;
  currency?: string;
  payment_method_type?: string;
  created_at?: string;
  finalized_at?: string | null;
}

interface WompiEventBody {
  id?: string;
  event?: string;
  timestamp?: number | string;
  sent_at?: string;
  data?: { transaction?: WompiTransaction };
  signature?: { checksum?: string; properties?: string[] };
}

export function createWompiProvider(env: NodeJS.ProcessEnv = process.env): WompiProvider {
  return new WompiProvider({
    publicKey: env['WOMPI_PUBLIC_KEY'] ?? '',
    privateKey: env['WOMPI_PRIVATE_KEY'] ?? '',
    integritySecret: env['WOMPI_INTEGRITY_SECRET'] ?? '',
    eventsSecret: env['WOMPI_EVENTS_SECRET'] ?? '',
    baseUrl: env['WOMPI_BASE_URL'] ?? DEFAULT_BASE_URL,
  });
}
