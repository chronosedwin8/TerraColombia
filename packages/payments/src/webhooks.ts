import { getLogger } from '@terracolombia/shared';
import type {
  PaymentProvider,
  PaymentProviderId,
  Transaction,
  WebhookEvent,
  WebhookRejectionCode,
  WebhookRequest,
} from './types.js';

/**
 * Manejo **idempotente** de webhooks de pago.
 *
 * Por qué importa: todas las pasarelas reintentan las notificaciones hasta recibir un 2xx, y
 * algunas las duplican sin fallo previo. Si el manejador acredita créditos o marca un informe
 * como pagado en cada aviso, un reintento regala producto.
 *
 * Contrato:
 * 1. Se verifica la firma **antes** de cualquier otra cosa. Sin firma válida no se procesa nada.
 * 2. La clave de idempotencia es el **identificador del evento en el proveedor**. Se reserva de
 *    forma atómica en el `IdempotencyStore` (la API lo implementa contra Postgres con una
 *    restricción de unicidad); si ya estaba, se devuelve el resultado guardado y no se vuelve
 *    a ejecutar el efecto.
 * 3. El estado no se toma del cuerpo del webhook, se **consulta** con `getTransaction`. El
 *    cuerpo dice "mira esta transacción", no "esta transacción está aprobada".
 * 4. Un fallo del efecto libera la reserva, para que el reintento del proveedor vuelva a intentarlo.
 */

const log = getLogger({ mod: 'payments/webhooks' });

export interface IdempotencyRecord<T = unknown> {
  key: string;
  provider: PaymentProviderId;
  /** `reserved` mientras se procesa, `done` cuando terminó bien. */
  state: 'reserved' | 'done';
  result: T | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Almacén de idempotencia. La implementación de producción vive en `apps/api` sobre Postgres
 * (tabla `app.webhook_event` con `UNIQUE (provider, event_id)`), de modo que la atomicidad la
 * garantiza la base y no este paquete.
 */
export interface IdempotencyStore<T = unknown> {
  /**
   * Intenta reservar la clave. Devuelve `{ acquired: true }` si es la primera vez, o
   * `{ acquired: false, record }` si ya existía. Debe ser **atómico**.
   */
  reserve(key: string, provider: PaymentProviderId): Promise<
    { acquired: true } | { acquired: false; record: IdempotencyRecord<T> }
  >;
  /** Marca la clave como completada y guarda el resultado. */
  complete(key: string, provider: PaymentProviderId, result: T): Promise<void>;
  /** Libera la reserva cuando el efecto falló, para que el reintento del proveedor la repita. */
  release(key: string, provider: PaymentProviderId): Promise<void>;
}

/** Implementación en memoria. Solo para desarrollo y tests: no sobrevive a un reinicio. */
export class InMemoryIdempotencyStore<T = unknown> implements IdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();

  private id(key: string, provider: PaymentProviderId): string {
    return `${provider}:${key}`;
  }

  async reserve(
    key: string,
    provider: PaymentProviderId,
  ): Promise<{ acquired: true } | { acquired: false; record: IdempotencyRecord<T> }> {
    const id = this.id(key, provider);
    const existing = this.records.get(id);
    if (existing) return { acquired: false, record: existing };
    this.records.set(id, {
      key,
      provider,
      state: 'reserved',
      result: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    return { acquired: true };
  }

  async complete(key: string, provider: PaymentProviderId, result: T): Promise<void> {
    const id = this.id(key, provider);
    const existing = this.records.get(id);
    this.records.set(id, {
      key,
      provider,
      state: 'done',
      result,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }

  async release(key: string, provider: PaymentProviderId): Promise<void> {
    this.records.delete(this.id(key, provider));
  }

  /** Solo para tests. */
  size(): number {
    return this.records.size;
  }
}

export type WebhookOutcome<T> =
  /** Firma inválida o evento no soportado: no se ejecutó nada. */
  | { status: 'rejected'; code: WebhookRejectionCode; reason: string; httpStatus: number }
  /** Ya se había procesado este evento; se devuelve el resultado anterior. */
  | { status: 'duplicate'; event: WebhookEvent; previous: T | null; httpStatus: 200 }
  /** Procesado ahora. */
  | { status: 'processed'; event: WebhookEvent; transaction: Transaction | null; result: T; httpStatus: 200 }
  /** El efecto falló; la reserva quedó liberada para el reintento del proveedor. */
  | { status: 'failed'; event: WebhookEvent; error: Error; httpStatus: 500 };

export interface HandleWebhookOptions<T> {
  provider: PaymentProvider;
  request: WebhookRequest;
  store: IdempotencyStore<T>;
  /**
   * Efecto de negocio: acreditar créditos, marcar el informe como pagado, activar la
   * suscripción. Se ejecuta **una sola vez** por evento.
   */
  onEvent: (event: WebhookEvent, transaction: Transaction | null) => Promise<T>;
  /**
   * false para no consultar la transacción (útil en eventos que no la llevan). Por omisión se
   * consulta, porque el cuerpo del webhook no es fuente de verdad.
   */
  fetchTransaction?: boolean;
}

/**
 * Verifica, deduplica y procesa un webhook.
 *
 * Nota sobre los códigos HTTP: una firma inválida devuelve **401**, un evento no soportado
 * devuelve **200** (aceptado y descartado: si se devuelve error, el proveedor reintenta para
 * siempre un evento que nunca vamos a procesar), y un fallo del efecto devuelve **500** para
 * que el proveedor reintente.
 */
export async function handleWebhook<T>(options: HandleWebhookOptions<T>): Promise<WebhookOutcome<T>> {
  const { provider, request, store, onEvent } = options;

  const verification = provider.verifyWebhook(request);
  if (!verification.ok) {
    const httpStatus =
      verification.code === 'unsupported_event'
        ? 200
        : verification.code === 'malformed_body'
          ? 400
          : 401;
    log.warn(
      { provider: provider.id, code: verification.code },
      'Webhook rechazado antes de procesarlo',
    );
    return { status: 'rejected', code: verification.code, reason: verification.reason, httpStatus };
  }

  const { event } = verification;

  const reservation = await store.reserve(event.id, provider.id);
  if (!reservation.acquired) {
    log.info(
      { provider: provider.id, eventId: event.id, state: reservation.record.state },
      'Webhook duplicado: no se vuelve a procesar',
    );
    return {
      status: 'duplicate',
      event,
      previous: reservation.record.result,
      httpStatus: 200,
    };
  }

  try {
    let transaction: Transaction | null = null;
    if (options.fetchTransaction !== false && event.providerTransactionId) {
      // Fuente de verdad: la consulta, no el cuerpo del aviso.
      transaction = await provider.getTransaction(event.providerTransactionId);
    }
    const result = await onEvent(event, transaction);
    await store.complete(event.id, provider.id, result);
    return { status: 'processed', event, transaction, result, httpStatus: 200 };
  } catch (e) {
    // La reserva se libera para que el reintento del proveedor pueda completarlo.
    await store.release(event.id, provider.id).catch((releaseError) => {
      log.error(
        { provider: provider.id, eventId: event.id, err: releaseError },
        'No se pudo liberar la reserva de idempotencia; el evento quedará bloqueado',
      );
    });
    const error = e instanceof Error ? e : new Error(String(e));
    log.error({ provider: provider.id, eventId: event.id, err: error }, 'Falló el procesamiento del webhook');
    return { status: 'failed', event, error, httpStatus: 500 };
  }
}
