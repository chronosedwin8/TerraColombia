import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryIdempotencyStore,
  handleWebhook,
  type IdempotencyStore,
} from '../src/webhooks.js';
import { MockPaymentProvider } from '../src/providers/mock.js';
import { MercadoPagoProvider, signManifest } from '../src/providers/mercadopago.js';
import type { PaymentProvider, Transaction, WebhookEvent } from '../src/types.js';

function mockProvider() {
  return new MockPaymentProvider({ webhookSecret: 'secreto-de-desarrollo' });
}

async function signedWebhook(provider: MockPaymentProvider, eventId = 'evt_1', amountCop = 45_000) {
  const reference = 'TC-REF-0001';
  const session = await provider.createCheckout({
    amountCop,
    reference,
    description: 'Informe',
    redirectUrl: 'https://terracolombia.co/retorno',
    customer: { id: 'usr_1', email: 'p@example.com' },
  });
  return provider.buildSignedWebhook({
    eventId,
    providerTransactionId: session.providerReference,
    reference,
    status: 'approved',
  });
}

describe('idempotencia de webhooks', () => {
  it('procesa un evento una sola vez y devuelve el resultado guardado en los reintentos', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const effect = vi.fn(async (event: WebhookEvent) => `acreditado:${event.id}`);
    const request = await signedWebhook(provider);

    const first = await handleWebhook({ provider, request, store, onEvent: effect });
    expect(first.status).toBe('processed');
    if (first.status === 'processed') {
      expect(first.result).toBe('acreditado:evt_1');
      expect(first.transaction?.status).toBe('approved');
      expect(first.httpStatus).toBe(200);
    }

    // El mismo aviso reenviado tres veces: el efecto no se vuelve a ejecutar.
    for (let i = 0; i < 3; i += 1) {
      const again = await handleWebhook({ provider, request, store, onEvent: effect });
      expect(again.status).toBe('duplicate');
      if (again.status === 'duplicate') {
        expect(again.previous).toBe('acreditado:evt_1');
        expect(again.httpStatus).toBe(200);
      }
    }
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('procesa eventos distintos del mismo pago por separado', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const effect = vi.fn(async (event: WebhookEvent) => event.id);

    await handleWebhook({ provider, request: await signedWebhook(provider, 'evt_a'), store, onEvent: effect });
    await handleWebhook({ provider, request: await signedWebhook(provider, 'evt_b'), store, onEvent: effect });
    expect(effect).toHaveBeenCalledTimes(2);
    expect(store.size()).toBe(2);
  });

  it('libera la reserva si el efecto falla, para que el proveedor pueda reintentar', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const request = await signedWebhook(provider, 'evt_falla');
    let attempts = 0;
    const effect = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('la base de datos no estaba disponible');
      return 'acreditado al segundo intento';
    });

    const failed = await handleWebhook({ provider, request, store, onEvent: effect });
    expect(failed.status).toBe('failed');
    if (failed.status === 'failed') {
      expect(failed.httpStatus).toBe(500);
      expect(failed.error.message).toMatch(/base de datos/);
    }
    // La reserva quedó liberada: el evento no queda bloqueado para siempre.
    expect(store.size()).toBe(0);

    const retried = await handleWebhook({ provider, request, store, onEvent: effect });
    expect(retried.status).toBe('processed');
    if (retried.status === 'processed') expect(retried.result).toBe('acreditado al segundo intento');
    expect(effect).toHaveBeenCalledTimes(2);
  });

  it('no ejecuta nada si la firma no es válida', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const effect = vi.fn(async () => 'nunca');
    const request = await signedWebhook(provider);

    const result = await handleWebhook({
      provider,
      request: { ...request, headers: { 'x-mock-signature': 'a'.repeat(64) } },
      store,
      onEvent: effect,
    });

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.code).toBe('invalid_signature');
      expect(result.httpStatus).toBe(401);
    }
    expect(effect).not.toHaveBeenCalled();
    expect(store.size()).toBe(0);
  });

  it('un evento no soportado responde 200 para que el proveedor deje de reintentar', async () => {
    const provider = new MercadoPagoProvider({
      accessToken: 'TEST-abc',
      webhookSecret: 'secreto-de-pruebas-mp',
    });
    const store = new InMemoryIdempotencyStore<string>();
    const effect = vi.fn(async () => 'nunca');

    const ts = '1758461400';
    const requestId = 'req-1';
    const dataId = '1234567890';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = signManifest(manifest, 'secreto-de-pruebas-mp');

    const result = await handleWebhook({
      provider,
      request: {
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        rawBody: JSON.stringify({ id: 'evt-mo', type: 'merchant_order', data: { id: dataId } }),
        query: { 'data.id': dataId },
      },
      store,
      onEvent: effect,
    });

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.code).toBe('unsupported_event');
      expect(result.httpStatus).toBe(200);
    }
    expect(effect).not.toHaveBeenCalled();
  });

  it('un cuerpo malformado responde 400', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const raw = 'no-es-json';
    const { headers } = provider.buildSignedWebhook({
      eventId: 'x',
      providerTransactionId: 'y',
      reference: 'z',
      status: 'approved',
    });
    // Se firma el cuerpo malformado para que la firma pase y falle el parseo.
    const signed = provider.verifyWebhook({
      headers: { 'x-mock-signature': mockSignature(raw) },
      rawBody: raw,
    });
    expect(signed.ok).toBe(false);
    if (!signed.ok) expect(signed.code).toBe('malformed_body');

    const result = await handleWebhook({
      provider,
      request: { headers: { 'x-mock-signature': mockSignature(raw) }, rawBody: raw },
      store,
      onEvent: async () => 'nunca',
    });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.httpStatus).toBe(400);
    expect(headers['x-mock-signature']).toBeTruthy();
  });

  it('el estado se toma de la consulta, no del cuerpo del webhook', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<Transaction | null>();
    // El cuerpo miente: dice aprobado, pero el monto es impar y la consulta dirá rechazado.
    const session = await provider.createCheckout({
      amountCop: 45_001,
      reference: 'TC-REF-IMPAR',
      description: 'Informe',
      redirectUrl: 'https://terracolombia.co/retorno',
      customer: { id: 'usr_1', email: 'p@example.com' },
    });
    const request = provider.buildSignedWebhook({
      eventId: 'evt_mentiroso',
      providerTransactionId: session.providerReference,
      reference: 'TC-REF-IMPAR',
      status: 'approved',
    });

    const result = await handleWebhook({
      provider,
      request,
      store,
      onEvent: async (_event, transaction) => transaction,
    });

    expect(result.status).toBe('processed');
    if (result.status === 'processed') {
      expect(result.event.status).toBe('approved'); // lo que dijo el aviso
      expect(result.transaction?.status).toBe('declined'); // lo que dice la consulta
    }
  });

  it('con fetchTransaction:false no consulta al proveedor', async () => {
    const provider = mockProvider();
    const spy = vi.spyOn(provider, 'getTransaction');
    const store = new InMemoryIdempotencyStore<string>();
    const request = await signedWebhook(provider, 'evt_sin_consulta');

    const result = await handleWebhook({
      provider,
      request,
      store,
      fetchTransaction: false,
      onEvent: async () => 'ok',
    });

    expect(result.status).toBe('processed');
    if (result.status === 'processed') expect(result.transaction).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('dos avisos simultáneos con el mismo evento solo ejecutan el efecto una vez', async () => {
    const provider = mockProvider();
    const store = new InMemoryIdempotencyStore<string>();
    const request = await signedWebhook(provider, 'evt_carrera');
    let running = 0;
    let maxConcurrent = 0;
    const effect = vi.fn(async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 10));
      running -= 1;
      return 'ok';
    });

    const outcomes = await Promise.all([
      handleWebhook({ provider, request, store, onEvent: effect }),
      handleWebhook({ provider, request, store, onEvent: effect }),
    ]);

    expect(effect).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);
    expect(outcomes.filter((o) => o.status === 'processed')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'duplicate')).toHaveLength(1);
  });

  it('el almacén de idempotencia se puede sustituir por el de la API', async () => {
    const provider = mockProvider();
    const calls: string[] = [];
    // Doble que simula la restricción UNIQUE de Postgres.
    const store: IdempotencyStore<string> = {
      async reserve(key) {
        calls.push(`reserve:${key}`);
        return { acquired: true };
      },
      async complete(key) {
        calls.push(`complete:${key}`);
      },
      async release(key) {
        calls.push(`release:${key}`);
      },
    };
    await handleWebhook({
      provider,
      request: await signedWebhook(provider, 'evt_store'),
      store,
      onEvent: async () => 'ok',
    });
    expect(calls).toEqual(['reserve:evt_store', 'complete:evt_store']);
  });
});

describe('contrato del proveedor', () => {
  it('el proveedor simulado cumple la interfaz PaymentProvider', () => {
    const provider: PaymentProvider = mockProvider();
    expect(typeof provider.createCheckout).toBe('function');
    expect(typeof provider.getTransaction).toBe('function');
    expect(typeof provider.verifyWebhook).toBe('function');
    expect(typeof provider.refund).toBe('function');
    expect(typeof provider.listPaymentMethods).toBe('function');
  });
});

/** Replica la firma del proveedor simulado, para poder firmar un cuerpo malformado. */
function mockSignature(body: string): string {
  return createHmac('sha256', 'secreto-de-desarrollo').update(body, 'utf8').digest('hex');
}
