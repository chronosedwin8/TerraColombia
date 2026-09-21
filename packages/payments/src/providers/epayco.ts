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
 * Adaptador de **ePayco** — alternativa, no el camino principal (ADR-008).
 *
 * ePayco se integra normalmente con su *checkout* incrustado en JavaScript
 * (`https://checkout.epayco.co/checkout.js`), que se configura desde el navegador. Este
 * adaptador construye la configuración que el frontend necesita y verifica la confirmación.
 *
 * Variables de entorno:
 *   EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY, EPAYCO_P_CUST_ID_CLIENTE, EPAYCO_P_KEY,
 *   EPAYCO_TEST (true/false), EPAYCO_BASE_URL
 */

const DEFAULT_BASE_URL = 'https://apify.epayco.co';
const DEFAULT_CHECKOUT_URL = 'https://checkout.epayco.co/checkout.js';

/**
 * Estados de la confirmación de ePayco (`x_cod_response`):
 * 1 = aceptada, 2 = rechazada, 3 = pendiente, 4 = fallida, 6 = reversada,
 * 7 = retenida, 8 = iniciada, 9 = expirada, 10 = abandonada, 11 = cancelada.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la tabla completa y vigente de
 * `x_cod_response` y `x_cod_transaction_state`, y si ambos usan la misma numeración.
 */
export const EPAYCO_RESPONSE_MAP: Record<string, TransactionStatus> = {
  '1': 'approved',
  '2': 'declined',
  '3': 'pending',
  '4': 'error',
  '6': 'voided',
  '7': 'pending',
  '8': 'pending',
  '9': 'voided',
  '10': 'voided',
  '11': 'voided',
};

export function normalizeEpaycoStatus(code: string | number | null | undefined): TransactionStatus {
  if (code === null || code === undefined) return 'error';
  return EPAYCO_RESPONSE_MAP[String(code)] ?? 'error';
}

export const EPAYCO_METHODS: PaymentMethod[] = [
  { kind: 'card', label: 'Tarjeta de crédito o débito', providerCode: 'TC', settlementNote: 'Respuesta inmediata.' },
  { kind: 'pse', label: 'PSE', providerCode: 'PSE', settlementNote: 'El banco puede tardar en confirmar.' },
  {
    kind: 'efecty',
    label: 'Efecty y otros puntos de pago en efectivo',
    providerCode: 'EF',
    settlementNote: 'La acreditación puede tardar hasta 3 días hábiles.',
  },
  { kind: 'nequi', label: 'Nequi', providerCode: 'NQ', settlementNote: 'Requiere aprobar la notificación en la app de Nequi.' },
];

/**
 * **Firma de la confirmación de ePayco:**
 *
 *     SHA-256( p_cust_id_cliente ^ p_key ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code )
 *
 * con `^` literal como separador. El resultado llega en `x_signature`.
 *
 * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: el formato de `x_amount` en la firma
 * (ePayco suele enviarlo con dos decimales, `45000.00`, y la firma debe usar exactamente la
 * cadena recibida, no una reformateada) y si existen variantes de la firma según el medio de pago.
 */
export function epaycoConfirmationSignature(params: {
  custIdCliente: string;
  pKey: string;
  refPayco: string;
  transactionId: string;
  amount: string;
  currencyCode: string;
}): string {
  const base = [
    params.custIdCliente,
    params.pKey,
    params.refPayco,
    params.transactionId,
    params.amount,
    params.currencyCode,
  ].join('^');
  return createHash('sha256').update(base, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface EpaycoConfig {
  publicKey: string;
  privateKey: string;
  custIdCliente: string;
  pKey: string;
  test: boolean;
  baseUrl?: string | null;
  checkoutUrl?: string | null;
}

export class EpaycoProvider implements PaymentProvider {
  readonly id = 'epayco' as const;
  readonly sandbox: boolean;
  private readonly baseUrl: string;
  private readonly checkoutUrl: string;

  constructor(private readonly config: EpaycoConfig) {
    if (!config.publicKey || !config.custIdCliente || !config.pKey) {
      throw PaymentError.config(
        'Faltan EPAYCO_PUBLIC_KEY, EPAYCO_P_CUST_ID_CLIENTE y/o EPAYCO_P_KEY.',
      );
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.checkoutUrl = config.checkoutUrl ?? DEFAULT_CHECKOUT_URL;
    this.sandbox = config.test;
  }

  listPaymentMethods(): PaymentMethod[] {
    return EPAYCO_METHODS;
  }

  /**
   * ePayco no expone un enlace de pago sin sesión de navegador: el checkout se abre con su
   * script. Este método devuelve la configuración que el frontend pasa a `ePayco.checkout.open`,
   * serializada en la URL del propio frontend.
   *
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: si ePayco ofrece hoy un endpoint de
   * "link de pago" del lado del servidor que permita devolver una URL directa. Si existe, este
   * adaptador debería usarlo en lugar de delegar en el navegador. No se inventa aquí.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const checkoutConfig = {
      key: this.config.publicKey,
      test: this.config.test,
      external: 'false',
      name: request.description.slice(0, 60),
      description: request.description.slice(0, 250),
      invoice: request.reference,
      currency: 'cop',
      amount: String(request.amountCop),
      tax: '0',
      tax_base: '0',
      country: 'co',
      lang: 'es',
      email_billing: request.customer.email,
      response: request.redirectUrl,
      ...(request.notificationUrl ? { confirmation: request.notificationUrl } : {}),
      ...(request.metadata ?? {}),
    };

    // La URL de retorno del producto lleva la configuración; el frontend la lee y abre el
    // checkout de ePayco. Es un salto más que en Mercado Pago, y es una razón para que ePayco
    // no sea el proveedor principal.
    const url = new URL(request.redirectUrl);
    url.searchParams.set('epayco', Buffer.from(JSON.stringify(checkoutConfig), 'utf8').toString('base64url'));

    return {
      provider: this.id,
      reference: request.reference,
      checkoutUrl: url.toString(),
      providerReference: request.reference,
      amountCop: request.amountCop,
      currency: 'COP',
      expiresAt: null,
      sandbox: this.sandbox,
      raw: { checkoutConfig, checkoutScript: this.checkoutUrl },
    };
  }

  /**
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: la ruta de consulta por referencia.
   * ePayco documenta `GET /transaction/response/{ref_payco}` en `secure.epayco.io` y también
   * una API con token en `apify.epayco.co`. Se usa la primera, que es la que aparece en sus
   * ejemplos de confirmación, y se marca como no confirmada.
   */
  async getTransaction(providerTransactionId: string): Promise<Transaction> {
    const { data } = await httpJson<EpaycoTransactionResponse>(
      `${this.baseUrl}/transaction/response/${encodeURIComponent(providerTransactionId)}`,
      { providerLabel: 'ePayco', retries: 2 },
    );
    const d = data.data;
    if (!d) {
      throw PaymentError.provider('ePayco no devolvió la transacción solicitada.', {
        providerTransactionId,
        response: data,
      });
    }
    const status = normalizeEpaycoStatus(d.x_cod_response ?? d.x_cod_transaction_state);
    return {
      provider: this.id,
      providerTransactionId: String(d.x_ref_payco ?? providerTransactionId),
      reference: d.x_id_invoice ?? null,
      status,
      providerStatus: String(d.x_transaction_state ?? d.x_response ?? 'desconocido'),
      providerStatusDetail: d.x_response_reason_text ?? null,
      amountCop: Math.round(Number(d.x_amount ?? 0)),
      currency: (d.x_currency_code ?? 'COP').toUpperCase(),
      method: 'other',
      methodLabel: d.x_franchise ?? null,
      createdAt: d.x_transaction_date ?? null,
      approvedAt: status === 'approved' ? (d.x_transaction_date ?? null) : null,
      final: isFinalStatus(status),
      raw: data,
    };
  }

  verifyWebhook(request: WebhookRequest): WebhookVerification {
    if (!this.config.pKey || !this.config.custIdCliente) {
      return {
        ok: false,
        code: 'missing_secret',
        reason: 'Faltan EPAYCO_P_KEY y/o EPAYCO_P_CUST_ID_CLIENTE para verificar la confirmación.',
      };
    }

    const raw = bodyToString(request.rawBody);
    let fields: Record<string, string>;
    try {
      fields = raw.trim().startsWith('{')
        ? (JSON.parse(raw) as Record<string, string>)
        : Object.fromEntries(new URLSearchParams(raw).entries());
    } catch {
      return { ok: false, code: 'malformed_body', reason: 'No se pudo interpretar el cuerpo de la confirmación.' };
    }

    const signature = fields['x_signature'];
    const refPayco = fields['x_ref_payco'];
    const transactionId = fields['x_transaction_id'];
    const amount = fields['x_amount'];
    const currency = fields['x_currency_code'];

    if (!signature || !refPayco || !transactionId || !amount || !currency) {
      return {
        ok: false,
        code: 'malformed_signature',
        reason:
          'La confirmación de ePayco no trae todos los campos que entran en la firma (x_signature, x_ref_payco, x_transaction_id, x_amount, x_currency_code).',
      };
    }

    const expected = epaycoConfirmationSignature({
      custIdCliente: this.config.custIdCliente,
      pKey: this.config.pKey,
      refPayco,
      transactionId,
      // Se usa la cadena tal como llegó: reformatearla rompe la firma.
      amount,
      currencyCode: currency,
    });

    if (!safeEqualHex(expected, signature.toLowerCase())) {
      return {
        ok: false,
        code: 'invalid_signature',
        reason:
          'La firma x_signature de ePayco no coincide. Compruebe p_cust_id_cliente y p_key, y que x_amount no se haya reformateado.',
      };
    }

    const code = fields['x_cod_response'] ?? fields['x_cod_transaction_state'] ?? null;
    return {
      ok: true,
      event: {
        // ePayco no manda identificador de evento: la referencia de pago más el estado hacen
        // único cada aviso y conservan la idempotencia.
        id: `epayco_${refPayco}_${code ?? 'sin-estado'}`,
        provider: this.id,
        type: `confirmation.${code ?? 'desconocido'}`,
        reference: fields['x_id_invoice'] ?? null,
        providerTransactionId: refPayco,
        status: normalizeEpaycoStatus(code),
        receivedAt: new Date().toISOString(),
        raw: fields,
      },
    };
  }

  /**
   * PENDIENTE DE VERIFICAR CONTRA DOCUMENTACIÓN OFICIAL: ePayco documenta anulaciones y
   * devoluciones con autenticación por token (`POST /payment/reverse`), pero el nombre del
   * endpoint y los campos varían entre versiones de su API. No se implementa a ciegas.
   */
  async refund(request: RefundRequest): Promise<RefundResult> {
    throw PaymentError.unsupported(
      'Las devoluciones de ePayco no están implementadas en este adaptador: hay que confirmar el endpoint y el esquema de autenticación vigentes antes de usarlo.',
      { providerTransactionId: request.providerTransactionId },
    );
  }
}

interface EpaycoTransactionResponse {
  success?: boolean;
  data?: {
    x_ref_payco?: string | number;
    x_id_invoice?: string;
    x_cod_response?: string | number;
    x_cod_transaction_state?: string | number;
    x_transaction_state?: string;
    x_response?: string;
    x_response_reason_text?: string;
    x_amount?: string | number;
    x_currency_code?: string;
    x_franchise?: string;
    x_transaction_date?: string;
  };
}

export function createEpaycoProvider(env: NodeJS.ProcessEnv = process.env): EpaycoProvider {
  return new EpaycoProvider({
    publicKey: env['EPAYCO_PUBLIC_KEY'] ?? '',
    privateKey: env['EPAYCO_PRIVATE_KEY'] ?? '',
    custIdCliente: env['EPAYCO_P_CUST_ID_CLIENTE'] ?? '',
    pKey: env['EPAYCO_P_KEY'] ?? '',
    test: env['EPAYCO_TEST'] !== 'false',
    baseUrl: env['EPAYCO_BASE_URL'] ?? DEFAULT_BASE_URL,
    checkoutUrl: env['EPAYCO_CHECKOUT_URL'] ?? DEFAULT_CHECKOUT_URL,
  });
}
