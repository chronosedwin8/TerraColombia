import { createHash, timingSafeEqual } from 'node:crypto';
import { bodyToString, httpJson } from '../http.js';
import {
  PaymentError,
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
 * Adaptador de **PayU Latam** — alternativa, no el camino principal (ADR-008).
 *
 * PayU usa dos superficies distintas: el *WebCheckout* (formulario HTML firmado) y las APIs
 * de pagos y consultas (`/payments-api/4.0/service.cgi`, `/reports-api/4.0/service.cgi`) con
 * un sobre JSON que lleva `merchantId`, `apiKey` y `apiLogin`.
 *
 * Variables de entorno:
 *   PAYU_MERCHANT_ID, PAYU_ACCOUNT_ID, PAYU_API_KEY, PAYU_API_LOGIN,
 *   PAYU_BASE_URL (por omisión el sandbox), PAYU_CHECKOUT_URL
 */

const DEFAULT_BASE_URL = 'https://sandbox.api.payulatam.com';
const DEFAULT_CHECKOUT_URL = 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu/';

/**
 * Estados de PayU. Los reportes usan textos (`APPROVED`, `DECLINED`, `PENDING`, `EXPIRED`,
 * `ERROR`) y las confirmaciones usan además códigos numéricos `state_pol`
 * (4 = aprobada, 6 = rechazada, 5 = expirada, 7 = pendiente).
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la tabla completa de `state_pol` y
 * `response_code_pol` vigente, y si hay estados adicionales para anulaciones.
 */
export const PAYU_STATUS_MAP: Record<string, TransactionStatus> = {
  APPROVED: 'approved',
  DECLINED: 'declined',
  PENDING: 'pending',
  EXPIRED: 'voided',
  ERROR: 'error',
  SUBMITTED: 'pending',
};

export const PAYU_STATE_POL_MAP: Record<string, TransactionStatus> = {
  '4': 'approved',
  '5': 'voided',
  '6': 'declined',
  '7': 'pending',
};

export function normalizePayuStatus(status: string | null | undefined): TransactionStatus {
  if (!status) return 'error';
  return PAYU_STATUS_MAP[status.toUpperCase()] ?? PAYU_STATE_POL_MAP[status] ?? 'error';
}

export const PAYU_METHODS: PaymentMethod[] = [
  { kind: 'card', label: 'Tarjeta de crédito o débito', providerCode: 'CREDIT_CARD', settlementNote: 'Respuesta inmediata.' },
  { kind: 'pse', label: 'PSE', providerCode: 'PSE', settlementNote: 'El banco puede tardar en confirmar.' },
  {
    kind: 'efecty',
    label: 'Efecty y otros puntos de pago en efectivo',
    providerCode: 'EFECTY',
    settlementNote: 'La acreditación puede tardar hasta 3 días hábiles.',
  },
  {
    kind: 'bancolombia_transfer',
    label: 'Botón Bancolombia',
    providerCode: 'BANK_REFERENCED',
    settlementNote: 'Se confirma al volver de la banca en línea.',
  },
];

/**
 * **Firma del WebCheckout de PayU:**
 *
 *     MD5( apiKey ~ merchantId ~ referenceCode ~ amount ~ currency )
 *
 * con `~` literal como separador. PayU acepta también SHA-256 y SHA-512 si se declara el
 * algoritmo; aquí se usa MD5 porque es el valor por omisión del WebCheckout.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: el formato exacto de `amount` en la
 * firma (PayU exige que coincida carácter a carácter con el enviado, y para COP suele ser
 * entero sin decimales, pero en algunos ejemplos aparece con un decimal). Un desajuste aquí
 * hace que PayU rechace la transacción con "firma inválida".
 */
export function payuCheckoutSignature(params: {
  apiKey: string;
  merchantId: string;
  referenceCode: string;
  amount: string;
  currency: string;
  algorithm?: 'md5' | 'sha256' | 'sha512';
}): string {
  const base = `${params.apiKey}~${params.merchantId}~${params.referenceCode}~${params.amount}~${params.currency}`;
  return createHash(params.algorithm ?? 'md5').update(base, 'utf8').digest('hex');
}

/**
 * **Firma de la confirmación (webhook) de PayU:**
 *
 *     MD5( apiKey ~ merchantId ~ referenceSale ~ newValue ~ currency ~ statePol )
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la regla de redondeo de `newValue`.
 * PayU documenta que el valor debe usarse con **un solo decimal** si el segundo decimal es
 * cero (por ejemplo `150.00` se firma como `150.0`), y con dos decimales en caso contrario.
 * Esta implementación aplica esa regla; hay que confirmarla contra una confirmación real
 * antes de rechazar tráfico.
 */
export function payuConfirmationSignature(params: {
  apiKey: string;
  merchantId: string;
  referenceSale: string;
  value: string;
  currency: string;
  statePol: string;
  algorithm?: 'md5' | 'sha256' | 'sha512';
}): string {
  const base = `${params.apiKey}~${params.merchantId}~${params.referenceSale}~${normalizePayuValue(params.value)}~${params.currency}~${params.statePol}`;
  return createHash(params.algorithm ?? 'md5').update(base, 'utf8').digest('hex');
}

/** Aplica la regla de decimales de PayU descrita arriba. */
export function normalizePayuValue(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const twoDecimals = n.toFixed(2);
  const [whole = '0', decimals = '00'] = twoDecimals.split('.');
  // Si el segundo decimal es cero, PayU firma con un solo decimal.
  return decimals.endsWith('0') ? `${whole}.${decimals[0]}` : twoDecimals;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface PayuConfig {
  merchantId: string;
  accountId: string;
  apiKey: string;
  apiLogin: string;
  baseUrl?: string | null;
  checkoutUrl?: string | null;
  signatureAlgorithm?: 'md5' | 'sha256' | 'sha512';
}

export class PayuProvider implements PaymentProvider {
  readonly id = 'payu' as const;
  readonly sandbox: boolean;
  private readonly baseUrl: string;
  private readonly checkoutUrl: string;

  constructor(private readonly config: PayuConfig) {
    if (!config.merchantId || !config.apiKey || !config.accountId) {
      throw PaymentError.config('Faltan PAYU_MERCHANT_ID, PAYU_ACCOUNT_ID y/o PAYU_API_KEY.');
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.checkoutUrl = config.checkoutUrl ?? DEFAULT_CHECKOUT_URL;
    this.sandbox = /sandbox/i.test(this.baseUrl);
  }

  listPaymentMethods(): PaymentMethod[] {
    return PAYU_METHODS;
  }

  /**
   * El WebCheckout de PayU se invoca con un formulario POST. Como el producto necesita una URL
   * a la que redirigir, se construye la misma información como parámetros de consulta.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: si el WebCheckout acepta los mismos
   * campos por GET o exige POST. Si exige POST, la API debe devolver un formulario
   * autoenviado en lugar de una redirección, y `checkoutUrl` pasaría a ser solo la acción.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const amount = String(request.amountCop);
    const signature = payuCheckoutSignature({
      apiKey: this.config.apiKey,
      merchantId: this.config.merchantId,
      referenceCode: request.reference,
      amount,
      currency: 'COP',
      ...(this.config.signatureAlgorithm ? { algorithm: this.config.signatureAlgorithm } : {}),
    });

    const url = new URL(this.checkoutUrl);
    url.searchParams.set('merchantId', this.config.merchantId);
    url.searchParams.set('accountId', this.config.accountId);
    url.searchParams.set('description', request.description.slice(0, 255));
    url.searchParams.set('referenceCode', request.reference);
    url.searchParams.set('amount', amount);
    url.searchParams.set('tax', '0');
    url.searchParams.set('taxReturnBase', '0');
    url.searchParams.set('currency', 'COP');
    url.searchParams.set('signature', signature);
    url.searchParams.set('test', this.sandbox ? '1' : '0');
    url.searchParams.set('buyerEmail', request.customer.email);
    url.searchParams.set('responseUrl', request.redirectUrl);
    if (request.notificationUrl) url.searchParams.set('confirmationUrl', request.notificationUrl);

    return {
      provider: this.id,
      reference: request.reference,
      checkoutUrl: url.toString(),
      providerReference: request.reference,
      amountCop: request.amountCop,
      currency: 'COP',
      expiresAt: null,
      sandbox: this.sandbox,
      raw: { signature, amount },
    };
  }

  /**
   * Consulta por referencia con la API de reportes.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: el nombre del comando
   * (`ORDER_DETAIL_BY_REFERENCE_CODE` frente a `TRANSACTION_RESPONSE_DETAIL`) y la forma exacta
   * de la respuesta (`result.payload` puede ser un objeto o un arreglo según el comando).
   */
  async getTransaction(providerTransactionId: string): Promise<Transaction> {
    const { data } = await httpJson<PayuReportResponse>(
      `${this.baseUrl}/reports-api/4.0/service.cgi`,
      {
        method: 'POST',
        body: {
          test: this.sandbox,
          language: 'es',
          command: 'TRANSACTION_RESPONSE_DETAIL',
          merchant: { apiKey: this.config.apiKey, apiLogin: this.config.apiLogin },
          details: { transactionId: providerTransactionId },
        },
        providerLabel: 'PayU',
        retries: 2,
      },
    );

    const payload = Array.isArray(data.result?.payload) ? data.result?.payload[0] : data.result?.payload;
    if (!payload) {
      throw PaymentError.provider('PayU no devolvió el detalle de la transacción.', {
        providerTransactionId,
        response: data,
      });
    }

    const status = normalizePayuStatus(payload.state ?? payload.transactionResponse?.state ?? null);
    const value = payload.additionalValues?.TX_VALUE?.value ?? payload.order?.additionalValues?.TX_VALUE?.value;
    return {
      provider: this.id,
      providerTransactionId,
      reference: payload.order?.referenceCode ?? payload.referenceCode ?? null,
      status,
      providerStatus: payload.state ?? 'desconocido',
      providerStatusDetail: payload.responseCode ?? null,
      amountCop: Math.round(Number(value ?? 0)),
      currency: payload.additionalValues?.TX_VALUE?.currency ?? 'COP',
      method: 'other',
      methodLabel: payload.paymentMethod ?? null,
      createdAt: payload.creationDate ?? null,
      approvedAt: status === 'approved' ? (payload.creationDate ?? null) : null,
      final: isFinalStatus(status),
      raw: data,
    };
  }

  /**
   * Verifica la confirmación de PayU. El cuerpo llega como `application/x-www-form-urlencoded`,
   * no como JSON, así que se parsea con `URLSearchParams` sobre el cuerpo crudo.
   */
  verifyWebhook(request: WebhookRequest): WebhookVerification {
    if (!this.config.apiKey) {
      return { ok: false, code: 'missing_secret', reason: 'Falta PAYU_API_KEY para verificar la confirmación.' };
    }

    let params: URLSearchParams;
    const raw = bodyToString(request.rawBody);
    try {
      // PayU manda formulario; algunas integraciones lo reenvían como JSON.
      params = raw.trim().startsWith('{')
        ? new URLSearchParams(Object.entries(JSON.parse(raw) as Record<string, string>))
        : new URLSearchParams(raw);
    } catch {
      return { ok: false, code: 'malformed_body', reason: 'No se pudo interpretar el cuerpo de la confirmación.' };
    }

    const sign = params.get('sign');
    const referenceSale = params.get('reference_sale');
    const value = params.get('value');
    const currency = params.get('currency');
    const statePol = params.get('state_pol');
    const transactionId = params.get('transaction_id');

    if (!sign || !referenceSale || !value || !currency || !statePol) {
      return {
        ok: false,
        code: 'malformed_signature',
        reason:
          'La confirmación de PayU no trae todos los campos que entran en la firma (sign, reference_sale, value, currency, state_pol).',
      };
    }

    const expected = payuConfirmationSignature({
      apiKey: this.config.apiKey,
      merchantId: this.config.merchantId,
      referenceSale,
      value,
      currency,
      statePol,
      ...(this.config.signatureAlgorithm ? { algorithm: this.config.signatureAlgorithm } : {}),
    });

    if (!safeEqualHex(expected, sign.toLowerCase())) {
      return {
        ok: false,
        code: 'invalid_signature',
        reason:
          'La firma de la confirmación de PayU no coincide. Revise la regla de decimales de `value` y el algoritmo configurado en el panel de PayU.',
      };
    }

    return {
      ok: true,
      event: {
        // PayU no manda un identificador de evento: se usa la transacción y el estado, que es
        // lo que hace único cada aviso, para conservar la idempotencia.
        id: `payu_${transactionId ?? referenceSale}_${statePol}`,
        provider: this.id,
        type: `confirmation.state_pol_${statePol}`,
        reference: referenceSale,
        providerTransactionId: transactionId,
        status: normalizePayuStatus(statePol),
        receivedAt: new Date().toISOString(),
        raw: Object.fromEntries(params.entries()),
      },
    };
  }

  /**
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: PayU documenta los comandos
   * `SUBMIT_TRANSACTION` con `type: 'REFUND'` y `type: 'VOID'` sobre `/payments-api/4.0/service.cgi`,
   * pero la disponibilidad depende del medio de pago y del país. No se implementa a ciegas.
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    throw PaymentError.unsupported(
      'Las devoluciones de PayU no están implementadas en este adaptador: hay que confirmar el comando (REFUND o VOID) y los medios que lo admiten en Colombia antes de usarlo.',
      { providerTransactionId: request.providerTransactionId },
    );
  }
}

interface PayuPayload {
  state?: string;
  responseCode?: string;
  referenceCode?: string;
  paymentMethod?: string;
  creationDate?: string;
  transactionResponse?: { state?: string };
  additionalValues?: { TX_VALUE?: { value?: number; currency?: string } };
  order?: {
    referenceCode?: string;
    additionalValues?: { TX_VALUE?: { value?: number; currency?: string } };
  };
}

interface PayuReportResponse {
  code?: string;
  error?: string | null;
  result?: { payload?: PayuPayload | PayuPayload[] };
}

export function createPayuProvider(env: NodeJS.ProcessEnv = process.env): PayuProvider {
  return new PayuProvider({
    merchantId: env['PAYU_MERCHANT_ID'] ?? '',
    accountId: env['PAYU_ACCOUNT_ID'] ?? '',
    apiKey: env['PAYU_API_KEY'] ?? '',
    apiLogin: env['PAYU_API_LOGIN'] ?? '',
    baseUrl: env['PAYU_BASE_URL'] ?? DEFAULT_BASE_URL,
    checkoutUrl: env['PAYU_CHECKOUT_URL'] ?? DEFAULT_CHECKOUT_URL,
    signatureAlgorithm: (env['PAYU_SIGNATURE_ALGORITHM'] as 'md5' | 'sha256' | 'sha512') ?? 'md5',
  });
}
