/**
 * Puertos de pago y facturación. Arquitectura de puertos y adaptadores (PLAN.md §3 y §12):
 * la aplicación solo conoce estas interfaces, nunca una pasarela concreta.
 *
 * Proveedor principal: **Mercado Pago** (ADR-008). Wompi, PayU y ePayco son adaptadores
 * alternativos de la misma interfaz, y `mock` es el proveedor determinista de desarrollo.
 */

export const PAYMENT_PROVIDER_IDS = ['mercadopago', 'wompi', 'payu', 'epayco', 'mock'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

/** Proveedor por defecto si `PAYMENT_PROVIDER` no está definido (ADR-008). */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProviderId = 'mercadopago';

/**
 * Estado normalizado. Es el único estado que ve la aplicación; cada adaptador traduce el
 * suyo. Se conserva además el estado crudo del proveedor en `providerStatus` para auditoría.
 *
 * - `pending`  : iniciada, sin resolver (incluye pendientes de acreditación como PSE y Efecty).
 * - `approved` : dinero aprobado o autorizado.
 * - `declined` : rechazada por el emisor o por la pasarela.
 * - `voided`   : anulada, reversada, devuelta o con contracargo. El dinero no queda con nosotros.
 * - `error`    : fallo técnico; el estado real es desconocido y hay que reconsultar.
 */
export const TRANSACTION_STATUSES = ['pending', 'approved', 'declined', 'voided', 'error'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** true si el estado ya no va a cambiar por sí solo. */
export function isFinalStatus(status: TransactionStatus): boolean {
  return status === 'approved' || status === 'declined' || status === 'voided';
}

export const PAYMENT_METHOD_KINDS = [
  'card',
  'pse',
  'nequi',
  'efecty',
  'bancolombia_transfer',
  'cash',
  'other',
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export interface PaymentMethod {
  kind: PaymentMethodKind;
  /** Etiqueta en español para la interfaz. */
  label: string;
  /** Identificador del medio en el proveedor (`pse`, `efecty`, `CARD`…). */
  providerCode: string;
  /** Texto honesto sobre el tiempo de acreditación, para no prometer inmediatez. */
  settlementNote: string;
}

/**
 * Datos del cliente que se envían a la pasarela. **Solo lo indispensable.**
 *
 * - `email` es obligatorio porque todas las pasarelas envían el comprobante por correo.
 * - `fullName` es opcional y solo se manda si el medio de pago lo exige.
 * - `documentType`/`documentNumber` solo se rellenan para PSE, que legalmente los exige;
 *   no se almacenan en nuestra base, se pasan y se descartan.
 *
 * No se envía teléfono, dirección ni fecha de nacimiento: no hacen falta para cobrar.
 */
export interface CustomerRef {
  /** Identificador interno del usuario (`app.user.id`). Nunca su documento. */
  id: string;
  email: string;
  fullName?: string | null;
  /** `CC` | `CE` | `NIT` | `PP`. Solo para PSE. */
  documentType?: string | null;
  /** Solo para PSE. No se persiste. */
  documentNumber?: string | null;
}

export interface CheckoutRequest {
  /**
   * Monto en pesos colombianos **sin centavos**. El peso colombiano no se fracciona en la
   * práctica, y cada adaptador convierte a la unidad que su pasarela espera (Wompi cobra en
   * centavos, Mercado Pago en unidades).
   */
  amountCop: number;
  /**
   * Referencia única generada por la aplicación (`app.payment.reference`). Sirve de clave de
   * idempotencia frente a la pasarela: reintentar con la misma referencia no debe cobrar dos veces.
   */
  reference: string;
  /** Descripción que ve el usuario en el comprobante. */
  description: string;
  /** URL a la que la pasarela devuelve al usuario al terminar. */
  redirectUrl: string;
  /** URL de webhook, si el proveedor la acepta por transacción. */
  notificationUrl?: string | null;
  customer: CustomerRef;
  /** Medios ofrecidos. Vacío u omitido = todos los que el proveedor soporte en Colombia. */
  allowedMethods?: PaymentMethodKind[];
  /** Validez del enlace de pago, en minutos. */
  expiresInMinutes?: number;
  /**
   * Metadatos propios que la pasarela devuelve en el webhook. Solo identificadores internos:
   * nunca datos personales ni información del predio.
   */
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  provider: PaymentProviderId;
  /** Nuestra referencia, tal como se envió. */
  reference: string;
  /** URL a la que se redirige al usuario. */
  checkoutUrl: string;
  /** Identificador del recurso creado en el proveedor (preferencia, link, orden). */
  providerReference: string;
  amountCop: number;
  currency: 'COP';
  expiresAt: string | null;
  sandbox: boolean;
  /** Respuesta cruda del proveedor, para guardar en `app.payment.provider_payload`. */
  raw: unknown;
}

export interface Transaction {
  provider: PaymentProviderId;
  /** Identificador de la transacción en el proveedor. */
  providerTransactionId: string;
  /** Nuestra referencia. `null` si el proveedor no la devuelve. */
  reference: string | null;
  status: TransactionStatus;
  /** Estado tal como lo devolvió el proveedor, sin normalizar. */
  providerStatus: string;
  /** Detalle del estado (motivo del rechazo, por ejemplo). */
  providerStatusDetail: string | null;
  amountCop: number;
  currency: string;
  method: PaymentMethodKind;
  methodLabel: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  /** true si el estado ya es final. */
  final: boolean;
  raw: unknown;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  /**
   * Cuerpo **crudo**, tal como llegó. Nunca el JSON ya parseado y vuelto a serializar: las
   * firmas se calculan sobre los bytes exactos y cualquier reserialización las rompe.
   */
  rawBody: Buffer | string;
  /** Parámetros de consulta de la URL del webhook; algunos proveedores firman con ellos. */
  query?: Record<string, string | undefined>;
}

export interface WebhookEvent {
  /**
   * Identificador del evento **en el proveedor**. Es la clave de idempotencia: el mismo
   * evento reenviado se procesa una sola vez (`webhooks.ts`).
   */
  id: string;
  provider: PaymentProviderId;
  /** Tipo de evento del proveedor (`payment`, `transaction.updated`…). */
  type: string;
  /** Nuestra referencia, si el evento la trae. */
  reference: string | null;
  /** Identificador de la transacción, para reconsultarla con `getTransaction`. */
  providerTransactionId: string | null;
  /**
   * Estado que anuncia el evento, si lo trae. **Nunca se confía solo en esto**: el flujo
   * correcto es consultar `getTransaction` con el identificador y creerle a la consulta.
   */
  status: TransactionStatus | null;
  receivedAt: string;
  raw: unknown;
}

export type WebhookVerification =
  | { ok: true; event: WebhookEvent }
  | { ok: false; reason: string; code: WebhookRejectionCode };

export const WEBHOOK_REJECTION_CODES = [
  'missing_signature',
  'malformed_signature',
  'missing_secret',
  'invalid_signature',
  'malformed_body',
  'stale_timestamp',
  'unsupported_event',
] as const;
export type WebhookRejectionCode = (typeof WEBHOOK_REJECTION_CODES)[number];

export interface RefundRequest {
  providerTransactionId: string;
  /** Monto a devolver en COP sin centavos. Omitido = devolución total. */
  amountCop?: number | null;
  /** Motivo interno, para el registro de auditoría. */
  reason?: string;
  /** Clave de idempotencia de la devolución. */
  idempotencyKey?: string;
}

export interface RefundResult {
  ok: boolean;
  provider: PaymentProviderId;
  providerRefundId: string | null;
  providerTransactionId: string;
  amountCop: number | null;
  status: TransactionStatus;
  providerStatus: string;
  raw: unknown;
}

/** Puerto de pagos. Todos los adaptadores lo implementan igual. */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** true si apunta al entorno de pruebas del proveedor. */
  readonly sandbox: boolean;

  /** Crea la sesión de pago y devuelve la URL a la que se manda al usuario. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;

  /** Consulta el estado real de una transacción. Es la única fuente de verdad. */
  getTransaction(providerTransactionId: string): Promise<Transaction>;

  /**
   * Verifica la firma del webhook y normaliza el evento. **Síncrona y pura**: no hace
   * peticiones, para que se pueda ejecutar antes de aceptar el cuerpo.
   */
  verifyWebhook(request: WebhookRequest): WebhookVerification;

  /** Devolución total o parcial. */
  refund(request: RefundRequest): Promise<RefundResult>;

  /** Medios de pago que el adaptador ofrece en Colombia. */
  listPaymentMethods(): PaymentMethod[];
}

// ─── Facturación electrónica ──────────────────────────────────────────────────

export interface InvoiceLine {
  description: string;
  quantity: number;
  /** Precio unitario en COP sin centavos, sin IVA. */
  unitPriceCop: number;
  /** Porcentaje de IVA (0 o 19 en Colombia). */
  vatPercent: number;
}

export interface InvoiceRequest {
  /** Nuestra referencia de pago, para conciliar. */
  reference: string;
  /** Identificador de la transacción del proveedor de pagos. */
  providerTransactionId: string | null;
  lines: InvoiceLine[];
  customer: {
    /** `CC` | `NIT` | `CE` | `PP`. */
    documentType: string;
    documentNumber: string;
    name: string;
    email: string;
    /** Régimen y responsabilidades fiscales los pide la DIAN; los declara el cliente. */
    fiscalResponsibilities?: string[];
  };
  issuedAt: string;
}

export interface InvoiceResult {
  ok: boolean;
  /** Número de la factura en el proveedor. */
  invoiceId: string | null;
  /** CUFE: código único de facturación electrónica que asigna la DIAN. */
  cufe: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  /** `issued` | `pending` | `rejected` | `not_implemented`. */
  status: 'issued' | 'pending' | 'rejected' | 'not_implemented';
  message: string;
  raw: unknown;
}

/**
 * Puerto de facturación electrónica. Colombia exige factura electrónica validada por la DIAN
 * a través de un proveedor tecnológico autorizado; TerraColombia **no** implementa ese
 * protocolo, lo delega. Este puerto existe para que la elección de proveedor no toque el
 * resto del código.
 */
export interface InvoiceProvider {
  readonly id: string;
  readonly implemented: boolean;
  issue(request: InvoiceRequest): Promise<InvoiceResult>;
  /** Nota crédito (anulación). */
  void(invoiceId: string, reason: string): Promise<InvoiceResult>;
}

// ─── Errores ──────────────────────────────────────────────────────────────────

export const PAYMENT_ERROR_CODES = [
  'config',
  'network',
  'provider',
  'validation',
  'not_found',
  'unsupported',
] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'PaymentError';
  }

  static config(message: string, details: Record<string, unknown> = {}): PaymentError {
    return new PaymentError('config', message, details);
  }
  static provider(message: string, details: Record<string, unknown> = {}): PaymentError {
    return new PaymentError('provider', message, details);
  }
  static validation(message: string, details: Record<string, unknown> = {}): PaymentError {
    return new PaymentError('validation', message, details);
  }
  static unsupported(message: string, details: Record<string, unknown> = {}): PaymentError {
    return new PaymentError('unsupported', message, details);
  }
}

// ─── Validación de entrada ────────────────────────────────────────────────────

/**
 * Comprobaciones que valen para cualquier pasarela. Se hacen aquí y no en cada adaptador
 * para que un adaptador nuevo no pueda olvidarlas.
 */
export function assertValidCheckout(request: CheckoutRequest): void {
  if (!Number.isInteger(request.amountCop) || request.amountCop <= 0) {
    throw PaymentError.validation(
      `El monto debe ser un entero de pesos colombianos mayor que cero (llegó ${request.amountCop}). El peso no usa centavos.`,
      { amountCop: request.amountCop },
    );
  }
  if (!/^[A-Za-z0-9._:-]{6,64}$/.test(request.reference)) {
    throw PaymentError.validation(
      'La referencia debe tener entre 6 y 64 caracteres alfanuméricos, punto, dos puntos, guion o guion bajo.',
      { reference: request.reference },
    );
  }
  if (!/^\S+@\S+\.\S+$/.test(request.customer.email)) {
    throw PaymentError.validation('El correo del cliente no tiene un formato válido.');
  }
  for (const [key, url] of [
    ['redirectUrl', request.redirectUrl],
    ['notificationUrl', request.notificationUrl],
  ] as const) {
    if (!url) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw PaymentError.validation(`${key} no es una URL válida: ${url}`);
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      throw PaymentError.validation(
        `${key} debe usar https (solo se permite http en localhost para desarrollo).`,
        { url },
      );
    }
  }
  if (request.allowedMethods?.includes('pse')) {
    if (!request.customer.documentType || !request.customer.documentNumber) {
      throw PaymentError.validation(
        'PSE exige tipo y número de documento del pagador. Se envían a la pasarela y no se almacenan.',
      );
    }
  }
}
