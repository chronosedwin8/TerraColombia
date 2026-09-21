import { describe, expect, it } from 'vitest';
import {
  MERCADOPAGO_STATUS_MAP,
  MercadoPagoProvider,
  buildSignatureManifest,
  normalizeMercadoPagoStatus,
  parseXSignature,
  safeEqualHex,
  signManifest,
} from '../src/providers/mercadopago.js';
import { PaymentError, assertValidCheckout, type CheckoutRequest } from '../src/types.js';

/**
 * Vectores fijos de la firma `x-signature` de Mercado Pago.
 *
 * Se calcularon con el algoritmo documentado —HMAC-SHA256 sobre el manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`— y se congelan aquí para que cualquier
 * cambio en la construcción del manifiesto o en la clave rompa la prueba. Son vectores de
 * regresión del algoritmo, no capturas de tráfico real de Mercado Pago.
 */
const WEBHOOK_SECRET = 'secreto-de-pruebas-mp';

const SIGNATURE_VECTORS = [
  {
    name: 'identificador numérico, con x-request-id',
    dataId: '1234567890',
    requestId: 'b4f8c2e1-3d5a-4e6f-8a9b-0c1d2e3f4a5b',
    ts: '1758461400',
    manifest: 'id:1234567890;request-id:b4f8c2e1-3d5a-4e6f-8a9b-0c1d2e3f4a5b;ts:1758461400;',
    v1: 'c3340062c41b28b03b2b92eae98a12ae201bbe89db1899ec56f870fb6d6c37fc',
  },
  {
    name: 'identificador alfanumérico: se normaliza a minúsculas',
    dataId: 'abc-DEF-123',
    requestId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    ts: '1700000000',
    manifest: 'id:abc-def-123;request-id:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee;ts:1700000000;',
    v1: '41bf45850a4b8975f65c9cdef70aee2db3dad3de1f34352eda91115c27c113c0',
  },
  {
    name: 'sin x-request-id: se omite el segmento completo',
    dataId: '987654321',
    requestId: null,
    ts: '1758461400',
    manifest: 'id:987654321;ts:1758461400;',
    v1: '2256d7c5d4388c6960129eae01ff837780600972ed92b3bbf68e69b88c733384',
  },
  {
    name: 'sin data.id: se omite el segmento completo',
    dataId: null,
    requestId: 'only-request-id',
    ts: '1758461400',
    manifest: 'request-id:only-request-id;ts:1758461400;',
    v1: '0a2402a2addf1c47cc377c141b30ebaa870e788c6d53ab56674e2236c95a4fef',
  },
] as const;

function provider(overrides: Partial<{ webhookSecret: string | null }> = {}) {
  return new MercadoPagoProvider({
    accessToken: 'TEST-1234567890-abcdef',
    webhookSecret: overrides.webhookSecret === undefined ? WEBHOOK_SECRET : overrides.webhookSecret,
  });
}

function webhookRequest(vector: (typeof SIGNATURE_VECTORS)[number], signature?: string) {
  const body = JSON.stringify({
    id: 'evt-mp-0001',
    type: 'payment',
    action: 'payment.updated',
    data: { id: vector.dataId },
    live_mode: false,
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-signature': signature ?? `ts=${vector.ts},v1=${vector.v1}`,
  };
  if (vector.requestId) headers['x-request-id'] = vector.requestId;
  return {
    headers,
    rawBody: body,
    query: vector.dataId ? { 'data.id': vector.dataId } : {},
  };
}

describe('firma del webhook de Mercado Pago', () => {
  it.each(SIGNATURE_VECTORS)('construye el manifiesto correcto: $name', (vector) => {
    expect(
      buildSignatureManifest({ dataId: normalizeForManifest(vector.dataId), requestId: vector.requestId, ts: vector.ts }),
    ).toBe(vector.manifest);
  });

  it.each(SIGNATURE_VECTORS)('reproduce la firma v1 del vector fijo: $name', (vector) => {
    expect(signManifest(vector.manifest, WEBHOOK_SECRET)).toBe(vector.v1);
  });

  it.each(SIGNATURE_VECTORS)('acepta el webhook firmado: $name', (vector) => {
    const result = provider().verifyWebhook(webhookRequest(vector));
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (result.ok) {
      expect(result.event.provider).toBe('mercadopago');
      expect(result.event.id).toBe('evt-mp-0001');
      expect(result.event.type).toBe('payment.payment.updated');
      // El webhook no dice el estado: hay que consultar el pago.
      expect(result.event.status).toBeNull();
      expect(result.event.reference).toBeNull();
    }
  });

  it('rechaza una firma alterada en un solo carácter', () => {
    const vector = SIGNATURE_VECTORS[0];
    const tampered = `${vector.v1.slice(0, -1)}${vector.v1.endsWith('c') ? 'd' : 'c'}`;
    const result = provider().verifyWebhook(webhookRequest(vector, `ts=${vector.ts},v1=${tampered}`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_signature');
  });

  it('rechaza un cuerpo cuyo data.id no coincide con el firmado', () => {
    const vector = SIGNATURE_VECTORS[0];
    const request = webhookRequest(vector);
    const result = provider().verifyWebhook({ ...request, query: { 'data.id': '9999999999' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_signature');
  });

  it('rechaza si falta la cabecera x-signature', () => {
    const vector = SIGNATURE_VECTORS[0];
    const request = webhookRequest(vector);
    delete request.headers['x-signature'];
    const result = provider().verifyWebhook(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('missing_signature');
  });

  it('rechaza una cabecera x-signature con formato inesperado', () => {
    const vector = SIGNATURE_VECTORS[0];
    const result = provider().verifyWebhook(webhookRequest(vector, 'firma-suelta-sin-partes'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('malformed_signature');
  });

  it('rechaza todos los webhooks si no hay secreto configurado', () => {
    const vector = SIGNATURE_VECTORS[0];
    const result = provider({ webhookSecret: null }).verifyWebhook(webhookRequest(vector));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('missing_secret');
      expect(result.reason).toContain('MERCADOPAGO_WEBHOOK_SECRET');
    }
  });

  it('rechaza un cuerpo que no es JSON', () => {
    const vector = SIGNATURE_VECTORS[0];
    const result = provider().verifyWebhook({ ...webhookRequest(vector), rawBody: 'no-json' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('malformed_body');
  });

  it('ignora las notificaciones que no son de pago', () => {
    const vector = SIGNATURE_VECTORS[0];
    const request = webhookRequest(vector);
    // La firma se calcula sobre la URL y las cabeceras, no sobre el cuerpo: sigue siendo válida.
    request.rawBody = JSON.stringify({ id: 'evt-mo-1', type: 'merchant_order', data: { id: vector.dataId } });
    const result = provider().verifyWebhook(request);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsupported_event');
  });

  it('acepta el formato antiguo de notificación (IPN por topic)', () => {
    const vector = SIGNATURE_VECTORS[0];
    const request = webhookRequest(vector);
    request.rawBody = JSON.stringify({ topic: 'payment', resource: '1234567890' });
    const result = provider().verifyWebhook(request);
    expect(result.ok).toBe(true);
    // Sin `id` de evento, se deriva una clave estable para conservar la idempotencia.
    if (result.ok) expect(result.event.id).toBe(`mp_${vector.dataId}_${vector.ts}`);
  });

  it('rechaza sellos de tiempo viejos cuando se configura tolerancia', () => {
    const p = new MercadoPagoProvider({
      accessToken: 'TEST-x',
      webhookSecret: WEBHOOK_SECRET,
      webhookToleranceSeconds: 300,
    });
    const vector = SIGNATURE_VECTORS[0]; // ts de 2025-09-21, muy anterior a cualquier ejecución
    const result = p.verifyWebhook(webhookRequest(vector));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('stale_timestamp');
  });

  it('parseXSignature acepta las partes en cualquier orden y con espacios', () => {
    expect(parseXSignature('v1=abc, ts=123')).toEqual({ ts: '123', v1: 'abc' });
    expect(parseXSignature('ts=123,v1=abc')).toEqual({ ts: '123', v1: 'abc' });
    expect(parseXSignature('ts=123')).toBeNull();
    expect(parseXSignature('cualquier cosa')).toBeNull();
  });

  it('safeEqualHex no compara longitudes distintas ni hexadecimales inválidos', () => {
    expect(safeEqualHex('aabb', 'aabb')).toBe(true);
    expect(safeEqualHex('aabb', 'aabc')).toBe(false);
    expect(safeEqualHex('aabb', 'aa')).toBe(false);
    expect(safeEqualHex('zzzz', 'zzzz')).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
  });
});

describe('estados de Mercado Pago', () => {
  it('traduce todos los estados documentados', () => {
    expect(normalizeMercadoPagoStatus('pending')).toBe('pending');
    expect(normalizeMercadoPagoStatus('in_process')).toBe('pending');
    expect(normalizeMercadoPagoStatus('in_mediation')).toBe('pending');
    expect(normalizeMercadoPagoStatus('approved')).toBe('approved');
    expect(normalizeMercadoPagoStatus('authorized')).toBe('approved');
    expect(normalizeMercadoPagoStatus('rejected')).toBe('declined');
    expect(normalizeMercadoPagoStatus('cancelled')).toBe('voided');
    expect(normalizeMercadoPagoStatus('refunded')).toBe('voided');
    expect(normalizeMercadoPagoStatus('charged_back')).toBe('voided');
  });

  it('un estado desconocido nunca se interpreta como aprobado', () => {
    expect(normalizeMercadoPagoStatus('algo_nuevo')).toBe('error');
    expect(normalizeMercadoPagoStatus(null)).toBe('error');
    expect(normalizeMercadoPagoStatus(undefined)).toBe('error');
    expect(Object.values(MERCADOPAGO_STATUS_MAP)).not.toContain(undefined);
  });

  it('cubre los nueve estados que enumera Mercado Pago', () => {
    expect(Object.keys(MERCADOPAGO_STATUS_MAP).sort()).toEqual(
      [
        'approved',
        'authorized',
        'cancelled',
        'charged_back',
        'in_mediation',
        'in_process',
        'pending',
        'refunded',
        'rejected',
      ].sort(),
    );
  });
});

describe('configuración del adaptador', () => {
  it('exige el token de acceso', () => {
    expect(() => new MercadoPagoProvider({ accessToken: '' })).toThrow(PaymentError);
    expect(() => new MercadoPagoProvider({ accessToken: '' })).toThrow(/MERCADOPAGO_ACCESS_TOKEN/);
  });

  it('deduce el modo de pruebas del prefijo TEST- del token', () => {
    expect(new MercadoPagoProvider({ accessToken: 'TEST-abc' }).sandbox).toBe(true);
    expect(new MercadoPagoProvider({ accessToken: 'APP_USR-abc' }).sandbox).toBe(false);
    expect(new MercadoPagoProvider({ accessToken: 'APP_USR-abc', sandbox: true }).sandbox).toBe(true);
  });

  it('rechaza un identificador de pago que no sea numérico', async () => {
    await expect(provider().getTransaction('no-numerico')).rejects.toThrow(/numérico/);
  });

  it('ofrece tarjeta, PSE y Efecty', () => {
    expect(provider().listPaymentMethods().map((m) => m.kind)).toEqual(['card', 'pse', 'efecty']);
  });

  it('advierte de la demora de los medios que no son inmediatos', () => {
    const methods = provider().listPaymentMethods();
    expect(methods.find((m) => m.kind === 'efecty')?.settlementNote).toMatch(/días hábiles/);
    expect(methods.find((m) => m.kind === 'pse')?.settlementNote).toMatch(/pendiente/);
  });
});

describe('validación común del checkout', () => {
  const base: CheckoutRequest = {
    amountCop: 45_000,
    reference: 'TC-REF-0001',
    description: 'Informe Territorial de Predio',
    redirectUrl: 'https://terracolombia.co/pago/retorno',
    customer: { id: 'usr_1', email: 'persona@example.com' },
  };

  it('acepta una solicitud válida', () => {
    expect(() => assertValidCheckout(base)).not.toThrow();
  });

  it('rechaza montos con centavos, cero o negativos', () => {
    expect(() => assertValidCheckout({ ...base, amountCop: 45_000.5 })).toThrow(/centavos/);
    expect(() => assertValidCheckout({ ...base, amountCop: 0 })).toThrow(/mayor que cero/);
    expect(() => assertValidCheckout({ ...base, amountCop: -1 })).toThrow(/mayor que cero/);
  });

  it('rechaza referencias fuera de formato', () => {
    expect(() => assertValidCheckout({ ...base, reference: 'corta' })).toThrow(/referencia/i);
    expect(() => assertValidCheckout({ ...base, reference: 'con espacios aqui' })).toThrow(/referencia/i);
  });

  it('exige https salvo en localhost', () => {
    expect(() => assertValidCheckout({ ...base, redirectUrl: 'http://terracolombia.co/x' })).toThrow(/https/);
    expect(() => assertValidCheckout({ ...base, redirectUrl: 'http://localhost:5173/x' })).not.toThrow();
  });

  it('exige documento solo cuando se ofrece PSE', () => {
    expect(() => assertValidCheckout({ ...base, allowedMethods: ['pse'] })).toThrow(/documento/);
    expect(() =>
      assertValidCheckout({
        ...base,
        allowedMethods: ['pse'],
        customer: { ...base.customer, documentType: 'CC', documentNumber: '1000000000' },
      }),
    ).not.toThrow();
    expect(() => assertValidCheckout({ ...base, allowedMethods: ['card'] })).not.toThrow();
  });

  it('rechaza correos mal formados', () => {
    expect(() =>
      assertValidCheckout({ ...base, customer: { ...base.customer, email: 'sin-arroba' } }),
    ).toThrow(/correo/);
  });
});

/** Repite la normalización que hace el adaptador antes de construir el manifiesto. */
function normalizeForManifest(dataId: string | null): string | null {
  if (dataId === null) return null;
  return /^\d+$/.test(dataId) ? dataId : dataId.toLowerCase();
}
