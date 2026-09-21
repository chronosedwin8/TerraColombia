import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getLogger } from '@terracolombia/shared';
import { bodyToString, header, httpJson } from '../http.js';
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
  type WebhookEvent,
  type WebhookRequest,
  type WebhookVerification,
} from '../types.js';

/**
 * Adaptador de **Mercado Pago** — proveedor principal (ADR-008).
 *
 * Cubre lo que necesita el producto:
 * - **Checkout Pro**: se crea una *preferencia* (`POST /checkout/preferences`) y se redirige al
 *   usuario a `init_point` (o `sandbox_init_point` en pruebas).
 * - **Consulta de pago**: `GET /v1/payments/{id}`.
 * - **Devolución**: `POST /v1/payments/{id}/refunds`.
 * - **Webhook**: verificación de la cabecera `x-signature` con HMAC-SHA256 y comparación en
 *   tiempo constante.
 *
 * Variables de entorno:
 *   MERCADOPAGO_ACCESS_TOKEN    (obligatoria) token privado; `TEST-…` indica entorno de pruebas
 *   MERCADOPAGO_PUBLIC_KEY      (opcional)    solo la usa el frontend para Checkout Bricks
 *   MERCADOPAGO_WEBHOOK_SECRET  (obligatoria para verificar webhooks)
 *   MERCADOPAGO_BASE_URL        (opcional)    por omisión https://api.mercadopago.com
 *
 * Sobre las marcas `PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL`: señalan detalles que
 * no se pueden dar por ciertos sin abrir la documentación vigente de Mercado Pago y probar en
 * el sandbox. El código funciona con los valores puestos, pero esos puntos concretos hay que
 * confirmarlos antes de cobrar dinero real. No se inventa ningún endpoint: los cuatro que se
 * usan son los de Checkout Pro y la API de pagos.
 */

const log = getLogger({ mod: 'payments/mercadopago' });

const DEFAULT_BASE_URL = 'https://api.mercadopago.com';

/**
 * Traducción de los estados de Mercado Pago al estado normalizado de `Transaction`.
 *
 * - `pending`, `in_process`, `in_mediation` → `pending`: aún no hay dinero acreditado.
 *   `in_mediation` es una disputa abierta; se trata como pendiente porque el resultado
 *   todavía puede caer a cualquiera de los dos lados.
 * - `approved`, `authorized` → `approved`. `authorized` es una preautorización (reserva de
 *   fondos sin captura); se considera aprobada porque el producto no usa captura diferida.
 *   Si algún día se usa, hay que separarla.
 * - `rejected` → `declined`.
 * - `cancelled`, `refunded`, `charged_back` → `voided`: en los tres casos el dinero no queda
 *   con nosotros. El estado normalizado no distingue devolución de contracargo a propósito:
 *   la diferencia queda en `providerStatus`, que sí se guarda.
 */
export const MERCADOPAGO_STATUS_MAP: Record<string, TransactionStatus> = {
  pending: 'pending',
  in_process: 'pending',
  in_mediation: 'pending',
  approved: 'approved',
  authorized: 'approved',
  rejected: 'declined',
  cancelled: 'voided',
  refunded: 'voided',
  charged_back: 'voided',
};

export function normalizeMercadoPagoStatus(status: string | null | undefined): TransactionStatus {
  if (!status) return 'error';
  return MERCADOPAGO_STATUS_MAP[status] ?? 'error';
}

/**
 * Medios de pago de Mercado Pago en Colombia.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: los valores exactos de
 * `payment_method_id` y `payment_type_id` de cada medio en la cuenta colombiana. Se obtienen
 * con `GET /v1/payment_methods` usando el access token de la cuenta, que es la única fuente
 * fiable porque dependen del país y de la habilitación del comercio. Los códigos de abajo son
 * los esperados, no los verificados.
 */
export const MERCADOPAGO_METHODS: PaymentMethod[] = [
  {
    kind: 'card',
    label: 'Tarjeta de crédito o débito',
    providerCode: 'credit_card',
    settlementNote: 'Respuesta inmediata.',
  },
  {
    kind: 'pse',
    label: 'PSE (débito desde cuenta bancaria)',
    providerCode: 'pse',
    settlementNote:
      'El banco puede tardar en confirmar. Mientras el pago esté pendiente, el informe no se entrega.',
  },
  {
    kind: 'efecty',
    label: 'Efecty (pago en efectivo)',
    providerCode: 'efecty',
    settlementNote:
      'Se genera un comprobante para pagar en un punto físico. La acreditación puede tardar hasta 3 días hábiles.',
  },
];

/** `payment_type_id` de Mercado Pago → nuestro `PaymentMethodKind`. */
function methodKindOf(paymentMethodId: string | null, paymentTypeId: string | null): PaymentMethodKind {
  // PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la lista completa de `payment_type_id`
  // (`credit_card`, `debit_card`, `ticket`, `bank_transfer`, `atm`, `account_money`…) y cuáles
  // aplican a Colombia.
  if (paymentMethodId === 'pse') return 'pse';
  if (paymentMethodId === 'efecty') return 'efecty';
  if (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card') return 'card';
  if (paymentTypeId === 'bank_transfer') return 'pse';
  if (paymentTypeId === 'ticket' || paymentTypeId === 'atm') return 'efecty';
  return 'other';
}

// ─── Firma del webhook ────────────────────────────────────────────────────────

export interface ParsedSignature {
  ts: string;
  v1: string;
}

/**
 * Descompone la cabecera `x-signature`, con el formato `ts=<epoch>,v1=<hex>`.
 * El orden de las partes no está garantizado, así que se parsea por clave.
 */
export function parseXSignature(value: string): ParsedSignature | null {
  const parts = value.split(',');
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim();
    if (key === 'ts') ts = val;
    else if (key === 'v1') v1 = val;
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

/**
 * Manifiesto que Mercado Pago firma:
 *
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * `data.id` se toma del parámetro de consulta `data.id` de la URL del webhook (y, si no está,
 * del cuerpo). Mercado Pago indica que si el identificador es alfanumérico debe pasarse en
 * minúsculas.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: si alguna de las tres partes falta
 * (por ejemplo, un evento sin `x-request-id`), el manifiesto omite ese segmento completo
 * —incluida su etiqueta— en lugar de dejarlo vacío. Aquí se implementa la omisión completa,
 * que es lo que describen los ejemplos de Mercado Pago, pero conviene confirmarlo con un
 * evento real del sandbox antes de rechazar tráfico legítimo en producción.
 */
export function buildSignatureManifest(parts: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  const segments: string[] = [];
  if (parts.dataId) segments.push(`id:${parts.dataId};`);
  if (parts.requestId) segments.push(`request-id:${parts.requestId};`);
  segments.push(`ts:${parts.ts};`);
  return segments.join('');
}

export function signManifest(manifest: string, secret: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Comparación en tiempo constante de dos firmas hexadecimales. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  // Un hexadecimal inválido produce un buffer más corto: se rechaza sin comparar.
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── Adaptador ────────────────────────────────────────────────────────────────

export interface MercadoPagoConfig {
  accessToken: string;
  publicKey?: string | null;
  webhookSecret?: string | null;
  baseUrl?: string | null;
  /**
   * Tolerancia del sello de tiempo del webhook, en segundos. 0 la desactiva.
   * Protege contra reenvío de eventos antiguos capturados.
   */
  webhookToleranceSeconds?: number;
  /** Fuerza el modo sandbox; por omisión se deduce del prefijo `TEST-` del token. */
  sandbox?: boolean;
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly id = 'mercadopago' as const;
  readonly sandbox: boolean;
  private readonly baseUrl: string;

  constructor(private readonly config: MercadoPagoConfig) {
    if (!config.accessToken) {
      throw PaymentError.config(
        'Falta MERCADOPAGO_ACCESS_TOKEN. Es el token privado de la aplicación en Mercado Pago (el que empieza por APP_USR- en producción y por TEST- en pruebas).',
      );
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // Los tokens de prueba de Mercado Pago llevan el prefijo `TEST-`.
    this.sandbox = config.sandbox ?? config.accessToken.startsWith('TEST-');
  }

  private authHeaders(idempotencyKey?: string): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.accessToken}`,
      // Mercado Pago acepta X-Idempotency-Key en los POST para no duplicar recursos.
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    };
  }

  listPaymentMethods(): PaymentMethod[] {
    return MERCADOPAGO_METHODS;
  }

  /**
   * Crea una preferencia de Checkout Pro.
   *
   * `unit_price` va en unidades de peso, no en centavos. PENDIENTE DE VERIFICAR CONTRA
   * DOCUMENTACIÓN OFICIAL: si la cuenta colombiana acepta decimales en `unit_price`. El
   * producto siempre manda enteros, así que la duda no afecta al cobro.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const expiresAt =
      request.expiresInMinutes && request.expiresInMinutes > 0
        ? new Date(Date.now() + request.expiresInMinutes * 60_000)
        : null;

    const body: Record<string, unknown> = {
      items: [
        {
          id: request.reference,
          title: request.description.slice(0, 256),
          description: request.description.slice(0, 600),
          quantity: 1,
          unit_price: request.amountCop,
          currency_id: 'COP',
        },
      ],
      // Solo el correo (y el nombre si lo hay): nada más hace falta para cobrar.
      payer: {
        email: request.customer.email,
        ...(request.customer.fullName ? { name: request.customer.fullName } : {}),
      },
      external_reference: request.reference,
      statement_descriptor: 'TERRACOLOMBIA',
      back_urls: {
        success: request.redirectUrl,
        failure: request.redirectUrl,
        pending: request.redirectUrl,
      },
      // PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: `auto_return: 'approved'` exige
      // que `back_urls.success` sea https y accesible. Si la preferencia se rechaza con
      // `invalid auto_return`, quitar este campo y redirigir desde la página de retorno.
      auto_return: 'approved',
      ...(request.notificationUrl ? { notification_url: request.notificationUrl } : {}),
      ...(expiresAt
        ? { expires: true, expiration_date_to: expiresAt.toISOString() }
        : { expires: false }),
      ...(request.metadata ? { metadata: request.metadata } : {}),
      ...buildPaymentMethodRestrictions(request.allowedMethods),
    };

    const { data } = await httpJson<MercadoPagoPreferenceResponse>(
      `${this.baseUrl}/checkout/preferences`,
      {
        method: 'POST',
        headers: this.authHeaders(request.reference),
        body,
        providerLabel: 'Mercado Pago',
        timeoutMs: 20_000,
      },
    );

    const checkoutUrl = this.sandbox
      ? (data.sandbox_init_point ?? data.init_point)
      : (data.init_point ?? data.sandbox_init_point);

    if (!data.id || !checkoutUrl) {
      throw PaymentError.provider(
        'Mercado Pago creó la preferencia pero no devolvió `id` o `init_point`, así que no hay a dónde redirigir al usuario.',
        { response: data },
      );
    }

    return {
      provider: this.id,
      reference: request.reference,
      checkoutUrl,
      providerReference: String(data.id),
      amountCop: request.amountCop,
      currency: 'COP',
      expiresAt: data.expiration_date_to ?? expiresAt?.toISOString() ?? null,
      sandbox: this.sandbox,
      raw: data,
    };
  }

  async getTransaction(providerTransactionId: string): Promise<Transaction> {
    if (!/^\d+$/.test(providerTransactionId)) {
      throw PaymentError.validation(
        `El identificador de pago de Mercado Pago es numérico; llegó "${providerTransactionId}".`,
      );
    }
    const { data } = await httpJson<MercadoPagoPaymentResponse>(
      `${this.baseUrl}/v1/payments/${providerTransactionId}`,
      {
        headers: this.authHeaders(),
        providerLabel: 'Mercado Pago',
        retries: 2,
      },
    );
    return this.toTransaction(data);
  }

  private toTransaction(data: MercadoPagoPaymentResponse): Transaction {
    const status = normalizeMercadoPagoStatus(data.status);
    const method = methodKindOf(data.payment_method_id ?? null, data.payment_type_id ?? null);
    const amount = data.transaction_amount ?? 0;
    return {
      provider: this.id,
      providerTransactionId: String(data.id ?? ''),
      reference: data.external_reference ?? null,
      status,
      providerStatus: data.status ?? 'desconocido',
      providerStatusDetail: data.status_detail ?? null,
      // El peso no usa centavos, pero la API devuelve un número: se redondea al entero.
      amountCop: Math.round(amount),
      currency: data.currency_id ?? 'COP',
      method,
      methodLabel:
        MERCADOPAGO_METHODS.find((m) => m.kind === method)?.label ??
        data.payment_method_id ??
        null,
      createdAt: data.date_created ?? null,
      approvedAt: data.date_approved ?? null,
      final: isFinalStatus(status),
      raw: data,
    };
  }

  /**
   * Verifica la firma `x-signature` del webhook.
   *
   * El flujo correcto en la API es: verificar la firma, responder 200 de inmediato, y **luego**
   * consultar `getTransaction` con el identificador del evento. El cuerpo del webhook no es la
   * fuente de verdad del estado.
   */
  verifyWebhook(request: WebhookRequest): WebhookVerification {
    const secret = this.config.webhookSecret;
    if (!secret) {
      return {
        ok: false,
        code: 'missing_secret',
        reason:
          'Falta MERCADOPAGO_WEBHOOK_SECRET. Es la clave secreta que Mercado Pago muestra al configurar las notificaciones en el panel del desarrollador. Sin ella no se puede verificar ningún webhook y hay que rechazarlos todos.',
      };
    }

    const signatureHeader = header(request.headers, 'x-signature');
    if (!signatureHeader) {
      return { ok: false, code: 'missing_signature', reason: 'El webhook no trae la cabecera x-signature.' };
    }
    const parsed = parseXSignature(signatureHeader);
    if (!parsed) {
      return {
        ok: false,
        code: 'malformed_signature',
        reason: `La cabecera x-signature no tiene el formato "ts=…,v1=…": ${signatureHeader.slice(0, 80)}`,
      };
    }

    let payload: MercadoPagoWebhookBody;
    try {
      payload = JSON.parse(bodyToString(request.rawBody)) as MercadoPagoWebhookBody;
    } catch {
      return { ok: false, code: 'malformed_body', reason: 'El cuerpo del webhook no es JSON válido.' };
    }

    const requestId = header(request.headers, 'x-request-id');
    // `data.id` viaja en la URL (`?data.id=…`); el cuerpo es el respaldo.
    const rawDataId = request.query?.['data.id'] ?? payload.data?.id ?? null;
    const dataId = rawDataId === null || rawDataId === undefined ? null : normalizeDataId(String(rawDataId));

    const manifest = buildSignatureManifest({ dataId, requestId, ts: parsed.ts });
    const expected = signManifest(manifest, secret);

    if (!safeEqualHex(expected, parsed.v1)) {
      log.warn(
        { manifestLength: manifest.length, hasDataId: dataId !== null, hasRequestId: requestId !== null },
        'Firma de webhook de Mercado Pago inválida',
      );
      return {
        ok: false,
        code: 'invalid_signature',
        reason:
          'La firma v1 del webhook no coincide con el manifiesto calculado. Revise que la clave secreta sea la del mismo entorno (pruebas o producción) y que el cuerpo llegue sin reserializar.',
      };
    }

    const tolerance = this.config.webhookToleranceSeconds ?? 0;
    if (tolerance > 0) {
      const tsNumber = Number(parsed.ts);
      // PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: si `ts` viene en segundos o en
      // milisegundos. Se acepta cualquiera de los dos y se normaliza por magnitud.
      const tsMs = Number.isFinite(tsNumber) ? (tsNumber > 1e12 ? tsNumber : tsNumber * 1000) : NaN;
      if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > tolerance * 1000) {
        return {
          ok: false,
          code: 'stale_timestamp',
          reason: `El sello de tiempo del webhook está fuera de la tolerancia de ${tolerance} s.`,
        };
      }
    }

    const event = this.toEvent(payload, { dataId, requestId, ts: parsed.ts });
    if (!event) {
      return {
        ok: false,
        code: 'unsupported_event',
        reason: `Tipo de notificación no manejado: ${payload.type ?? payload.topic ?? 'desconocido'}.`,
      };
    }
    return { ok: true, event };
  }

  /**
   * Normaliza el cuerpo del webhook.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: Mercado Pago tiene dos formatos de
   * notificación. El moderno (Webhooks) manda `{ id, type, action, data: { id } }`; el antiguo
   * (IPN) manda `{ topic, resource }`. Aquí se aceptan los dos y se marca cuál llegó, pero la
   * lista exacta de valores de `type`/`action`/`topic` y qué recursos traen `external_reference`
   * hay que confirmarla en el panel de notificaciones de la cuenta.
   */
  private toEvent(
    payload: MercadoPagoWebhookBody,
    ctx: { dataId: string | null; requestId: string | null; ts: string },
  ): WebhookEvent | null {
    const type = payload.type ?? payload.topic ?? null;
    if (!type) return null;
    // Solo interesan las notificaciones de pago; las de orden comercial se ignoran porque el
    // producto cobra pago a pago.
    const isPayment = type === 'payment' || type === 'payments';
    if (!isPayment) return null;

    // El identificador del evento es la clave de idempotencia. Mercado Pago manda `id` del
    // evento; si faltara, se construye uno estable con el pago y el sello de tiempo para no
    // perder la propiedad de idempotencia.
    const eventId =
      payload.id !== undefined && payload.id !== null
        ? String(payload.id)
        : `mp_${ctx.dataId ?? 'sin-id'}_${ctx.ts}`;

    return {
      id: eventId,
      provider: this.id,
      type: payload.action ? `${type}.${payload.action}` : type,
      // El webhook de Mercado Pago no trae `external_reference`: hay que consultar el pago.
      reference: null,
      providerTransactionId: ctx.dataId,
      status: null,
      receivedAt: new Date().toISOString(),
      raw: payload,
    };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const body =
      request.amountCop === null || request.amountCop === undefined
        ? {}
        : { amount: request.amountCop };

    // PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la forma exacta de la respuesta de
    // devolución (`id`, `status`, `amount`) y si una devolución parcial en COP admite decimales.
    const { data } = await httpJson<MercadoPagoRefundResponse>(
      `${this.baseUrl}/v1/payments/${request.providerTransactionId}/refunds`,
      {
        method: 'POST',
        headers: this.authHeaders(request.idempotencyKey ?? randomUUID()),
        body,
        providerLabel: 'Mercado Pago',
        timeoutMs: 25_000,
      },
    );

    const providerStatus = data.status ?? 'approved';
    return {
      ok: providerStatus !== 'rejected' && providerStatus !== 'cancelled',
      provider: this.id,
      providerRefundId: data.id === undefined || data.id === null ? null : String(data.id),
      providerTransactionId: request.providerTransactionId,
      amountCop: data.amount === undefined || data.amount === null ? null : Math.round(data.amount),
      status: providerStatus === 'rejected' ? 'error' : 'voided',
      providerStatus,
      raw: data,
    };
  }
}

/**
 * Mercado Pago no tiene una lista blanca de medios: se excluyen los que no se ofrecen.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: los identificadores de
 * `excluded_payment_types` (`credit_card`, `debit_card`, `ticket`, `bank_transfer`,
 * `atm`, `account_money`) disponibles en Colombia. Se obtienen con `GET /v1/payment_methods`.
 */
function buildPaymentMethodRestrictions(
  allowed: PaymentMethodKind[] | undefined,
): Record<string, unknown> {
  if (!allowed || allowed.length === 0) {
    // Sin restricción: se ofrecen todos los medios habilitados en la cuenta.
    return { payment_methods: { installments: 1 } };
  }
  const allowedTypes = new Set<string>();
  if (allowed.includes('card')) {
    allowedTypes.add('credit_card');
    allowedTypes.add('debit_card');
  }
  if (allowed.includes('pse')) allowedTypes.add('bank_transfer');
  if (allowed.includes('efecty') || allowed.includes('cash')) allowedTypes.add('ticket');

  const ALL_TYPES = ['credit_card', 'debit_card', 'bank_transfer', 'ticket', 'atm', 'account_money'];
  const excluded = ALL_TYPES.filter((t) => !allowedTypes.has(t)).map((id) => ({ id }));

  return {
    payment_methods: {
      excluded_payment_types: excluded,
      installments: 1,
    },
  };
}

/** Mercado Pago pide el identificador en minúsculas cuando es alfanumérico. */
function normalizeDataId(value: string): string {
  return /^\d+$/.test(value) ? value : value.toLowerCase();
}

// ─── Formas de respuesta (parciales: solo lo que se usa) ──────────────────────

interface MercadoPagoPreferenceResponse {
  id?: string | number;
  init_point?: string;
  sandbox_init_point?: string;
  expiration_date_to?: string | null;
  external_reference?: string;
}

interface MercadoPagoPaymentResponse {
  id?: string | number;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string | null;
  payment_method_id?: string;
  payment_type_id?: string;
  date_created?: string;
  date_approved?: string | null;
}

interface MercadoPagoRefundResponse {
  id?: string | number;
  status?: string;
  amount?: number;
}

interface MercadoPagoWebhookBody {
  id?: string | number;
  /** Formato moderno. */
  type?: string;
  action?: string;
  data?: { id?: string | number };
  /** Formato antiguo (IPN). */
  topic?: string;
  resource?: string;
  live_mode?: boolean;
  date_created?: string;
}

export function createMercadoPagoProvider(env: NodeJS.ProcessEnv = process.env): MercadoPagoProvider {
  return new MercadoPagoProvider({
    accessToken: env['MERCADOPAGO_ACCESS_TOKEN'] ?? '',
    publicKey: env['MERCADOPAGO_PUBLIC_KEY'] ?? null,
    webhookSecret: env['MERCADOPAGO_WEBHOOK_SECRET'] ?? null,
    baseUrl: env['MERCADOPAGO_BASE_URL'] ?? DEFAULT_BASE_URL,
    webhookToleranceSeconds: env['MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS']
      ? Number(env['MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS'])
      : 0,
  });
}
