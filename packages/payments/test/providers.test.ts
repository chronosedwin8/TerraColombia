import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { WompiProvider, normalizeWompiStatus, wompiIntegritySignature } from '../src/providers/wompi.js';
import {
  PayuProvider,
  normalizePayuStatus,
  normalizePayuValue,
  payuCheckoutSignature,
  payuConfirmationSignature,
} from '../src/providers/payu.js';
import { EpaycoProvider, epaycoConfirmationSignature, normalizeEpaycoStatus } from '../src/providers/epayco.js';
import { MockPaymentProvider, mockStatusFor } from '../src/providers/mock.js';
import { createPaymentProvider, isPaymentProviderId, missingEnvFor } from '../src/index.js';
import { DEFAULT_PAYMENT_PROVIDER, PaymentError, type CheckoutRequest } from '../src/types.js';

const CHECKOUT: CheckoutRequest = {
  amountCop: 45_000,
  reference: 'TC-REF-0001',
  description: 'Informe Territorial de Predio',
  redirectUrl: 'https://terracolombia.co/pago/retorno',
  notificationUrl: 'https://api.terracolombia.co/webhooks/pago',
  customer: { id: 'usr_1', email: 'persona@example.com' },
};

// ─── Wompi ────────────────────────────────────────────────────────────────────

describe('Wompi (adaptador alternativo)', () => {
  const INTEGRITY_SECRET = 'test_integrity_xyz';
  const EVENTS_SECRET = 'test_events_abc';

  function wompi() {
    return new WompiProvider({
      publicKey: 'pub_test_1234',
      privateKey: 'prv_test_1234',
      integritySecret: INTEGRITY_SECRET,
      eventsSecret: EVENTS_SECRET,
      baseUrl: 'https://sandbox.wompi.co/v1',
    });
  }

  /**
   * Vectores fijos de la firma de integridad: SHA-256 de
   * referencia + montoEnCentavos + moneda [+ expiración] + secreto.
   */
  it('reproduce la firma de integridad con vectores fijos', () => {
    expect(
      wompiIntegritySignature({
        reference: '45000-abc',
        amountInCents: 4_500_000,
        currency: 'COP',
        integritySecret: INTEGRITY_SECRET,
      }),
    ).toBe('6ae8cefb8b528c77dd0c0109303d2f022ab49ef561a4f57cd14675b762571212');

    expect(
      wompiIntegritySignature({
        reference: '45000-abc',
        amountInCents: 4_500_000,
        currency: 'COP',
        integritySecret: INTEGRITY_SECRET,
        expirationTime: '2026-09-21T14:30:00.000Z',
      }),
    ).toBe('1e1998d975245f3c5f2ee799c4ec881d4505e47ce3d0c0683788e179965d13b0');
  });

  it('cobra en centavos, no en pesos', async () => {
    const session = await wompi().createCheckout(CHECKOUT);
    const url = new URL(session.checkoutUrl);
    expect(url.searchParams.get('amount-in-cents')).toBe('4500000');
    expect(url.searchParams.get('currency')).toBe('COP');
    expect(url.searchParams.get('reference')).toBe('TC-REF-0001');
    expect(url.searchParams.get('signature:integrity')).toHaveLength(64);
    expect(session.amountCop).toBe(45_000);
  });

  it('verifica el webhook con el secreto de eventos', () => {
    const payload = {
      event: 'transaction.updated',
      timestamp: 1758461400,
      data: {
        transaction: {
          id: 'txn_0001',
          reference: 'TC-REF-0001',
          status: 'APPROVED',
          amount_in_cents: 4_500_000,
          currency: 'COP',
          payment_method_type: 'PSE',
        },
      },
      signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] },
    };
    const checksum = createHash('sha256')
      .update(`txn_0001APPROVED4500000${payload.timestamp}${EVENTS_SECRET}`)
      .digest('hex');
    const body = JSON.stringify({ ...payload, signature: { ...payload.signature, checksum } });

    const result = wompi().verifyWebhook({ headers: {}, rawBody: body });
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (result.ok) {
      expect(result.event.provider).toBe('wompi');
      expect(result.event.reference).toBe('TC-REF-0001');
      expect(result.event.providerTransactionId).toBe('txn_0001');
      expect(result.event.status).toBe('approved');
      // Sin identificador de evento, la clave de idempotencia se deriva y sigue siendo estable.
      expect(result.event.id).toBe('wompi_txn_0001_1758461400_APPROVED');
    }
  });

  it('rechaza un webhook con checksum alterado', () => {
    const body = JSON.stringify({
      event: 'transaction.updated',
      timestamp: 1,
      data: { transaction: { id: 'x', status: 'APPROVED' } },
      signature: { properties: ['transaction.id'], checksum: 'a'.repeat(64) },
    });
    const result = wompi().verifyWebhook({ headers: {}, rawBody: body });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_signature');
  });

  it('rechaza un webhook que dice firmar una propiedad ausente', () => {
    const body = JSON.stringify({
      timestamp: 1,
      data: { transaction: { id: 'x' } },
      signature: { properties: ['transaction.no_existe'], checksum: 'a'.repeat(64) },
    });
    const result = wompi().verifyWebhook({ headers: {}, rawBody: body });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('malformed_signature');
  });

  it('traduce los estados de Wompi', () => {
    expect(normalizeWompiStatus('APPROVED')).toBe('approved');
    expect(normalizeWompiStatus('DECLINED')).toBe('declined');
    expect(normalizeWompiStatus('PENDING')).toBe('pending');
    expect(normalizeWompiStatus('VOIDED')).toBe('voided');
    expect(normalizeWompiStatus('LO_QUE_SEA')).toBe('error');
  });

  it('no finge tener devoluciones', async () => {
    await expect(wompi().refund({ providerTransactionId: 'txn_1' })).rejects.toThrow(/no están implementadas/);
  });

  it('exige el secreto de integridad', () => {
    expect(
      () =>
        new WompiProvider({
          publicKey: 'pub_test_1',
          privateKey: 'prv_test_1',
          integritySecret: '',
          eventsSecret: 'x',
        }),
    ).toThrow(/WOMPI_INTEGRITY_SECRET/);
  });
});

// ─── PayU ─────────────────────────────────────────────────────────────────────

describe('PayU (adaptador alternativo)', () => {
  const API_KEY = '4Vj8eK4rloUd272L48hsrarnUA';
  const MERCHANT_ID = '508029';

  function payu() {
    return new PayuProvider({
      merchantId: MERCHANT_ID,
      accountId: '512321',
      apiKey: API_KEY,
      apiLogin: 'pRRXKOl8ikMmt9u',
      baseUrl: 'https://sandbox.api.payulatam.com',
    });
  }

  it('reproduce la firma del checkout con un vector fijo', () => {
    expect(
      payuCheckoutSignature({
        apiKey: API_KEY,
        merchantId: MERCHANT_ID,
        referenceCode: 'TC-REF-0001',
        amount: '45000',
        currency: 'COP',
      }),
    ).toBe('a1a1f1843a11fdcef9b6c25f80532d4e');
  });

  it('reproduce la firma de la confirmación con un vector fijo', () => {
    expect(
      payuConfirmationSignature({
        apiKey: API_KEY,
        merchantId: MERCHANT_ID,
        referenceSale: 'TC-REF-0001',
        value: '45000.00',
        currency: 'COP',
        statePol: '4',
      }),
    ).toBe('b56cce2ed02ebf430a218de8b6b4582f');
  });

  it('aplica la regla de decimales de PayU', () => {
    expect(normalizePayuValue('45000.00')).toBe('45000.0');
    expect(normalizePayuValue('45000')).toBe('45000.0');
    expect(normalizePayuValue('45000.50')).toBe('45000.5');
    expect(normalizePayuValue('45000.55')).toBe('45000.55');
  });

  it('verifica una confirmación en formato formulario', () => {
    const sign = payuConfirmationSignature({
      apiKey: API_KEY,
      merchantId: MERCHANT_ID,
      referenceSale: 'TC-REF-0001',
      value: '45000.00',
      currency: 'COP',
      statePol: '4',
    });
    const body = new URLSearchParams({
      merchant_id: MERCHANT_ID,
      reference_sale: 'TC-REF-0001',
      value: '45000.00',
      currency: 'COP',
      state_pol: '4',
      transaction_id: 'payu-txn-1',
      sign,
    }).toString();

    const result = payu().verifyWebhook({ headers: {}, rawBody: body });
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (result.ok) {
      expect(result.event.status).toBe('approved');
      expect(result.event.reference).toBe('TC-REF-0001');
      expect(result.event.id).toBe('payu_payu-txn-1_4');
    }
  });

  it('traduce los códigos state_pol y los textos', () => {
    expect(normalizePayuStatus('4')).toBe('approved');
    expect(normalizePayuStatus('6')).toBe('declined');
    expect(normalizePayuStatus('7')).toBe('pending');
    expect(normalizePayuStatus('5')).toBe('voided');
    expect(normalizePayuStatus('APPROVED')).toBe('approved');
    expect(normalizePayuStatus('99')).toBe('error');
  });

  it('firma el checkout con los parámetros que espera PayU', async () => {
    const session = await payu().createCheckout(CHECKOUT);
    const url = new URL(session.checkoutUrl);
    expect(url.searchParams.get('merchantId')).toBe(MERCHANT_ID);
    expect(url.searchParams.get('amount')).toBe('45000');
    expect(url.searchParams.get('test')).toBe('1');
    expect(url.searchParams.get('signature')).toHaveLength(32);
  });

  it('no finge tener devoluciones', async () => {
    await expect(payu().refund({ providerTransactionId: 'x' })).rejects.toThrow(/no están implementadas/);
  });
});

// ─── ePayco ───────────────────────────────────────────────────────────────────

describe('ePayco (adaptador alternativo)', () => {
  function epayco() {
    return new EpaycoProvider({
      publicKey: 'pub_test',
      privateKey: 'prv_test',
      custIdCliente: '123456',
      pKey: 'p_key_secreto',
      test: true,
    });
  }

  it('reproduce la firma de la confirmación con un vector fijo', () => {
    expect(
      epaycoConfirmationSignature({
        custIdCliente: '123456',
        pKey: 'p_key_secreto',
        refPayco: '98765432',
        transactionId: 'TC-REF-0001',
        amount: '45000.00',
        currencyCode: 'COP',
      }),
    ).toBe('d49d636a3825b80c06689212279425aced3fb5a3155036a5ba2422e7c2c670a2');
  });

  it('verifica una confirmación válida', () => {
    const fields = {
      x_ref_payco: '98765432',
      x_transaction_id: 'TC-REF-0001',
      x_amount: '45000.00',
      x_currency_code: 'COP',
      x_cod_response: '1',
      x_id_invoice: 'TC-REF-0001',
    };
    const x_signature = epaycoConfirmationSignature({
      custIdCliente: '123456',
      pKey: 'p_key_secreto',
      refPayco: fields.x_ref_payco,
      transactionId: fields.x_transaction_id,
      amount: fields.x_amount,
      currencyCode: fields.x_currency_code,
    });
    const result = epayco().verifyWebhook({
      headers: {},
      rawBody: JSON.stringify({ ...fields, x_signature }),
    });
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    if (result.ok) {
      expect(result.event.status).toBe('approved');
      expect(result.event.id).toBe('epayco_98765432_1');
    }
  });

  it('traduce los códigos de respuesta', () => {
    expect(normalizeEpaycoStatus('1')).toBe('approved');
    expect(normalizeEpaycoStatus('2')).toBe('declined');
    expect(normalizeEpaycoStatus('3')).toBe('pending');
    expect(normalizeEpaycoStatus('6')).toBe('voided');
    expect(normalizeEpaycoStatus('99')).toBe('error');
    expect(normalizeEpaycoStatus(null)).toBe('error');
  });

  it('rechaza una firma alterada', () => {
    const result = epayco().verifyWebhook({
      headers: {},
      rawBody: JSON.stringify({
        x_ref_payco: '1',
        x_transaction_id: '2',
        x_amount: '3',
        x_currency_code: 'COP',
        x_signature: 'f'.repeat(64),
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_signature');
  });
});

// ─── Proveedor simulado ───────────────────────────────────────────────────────

describe('proveedor simulado', () => {
  function mock() {
    return new MockPaymentProvider({ webhookSecret: 'secreto-de-desarrollo' });
  }

  it('aprueba montos pares y rechaza impares', () => {
    expect(mockStatusFor(45_000)).toBe('approved');
    expect(mockStatusFor(45_001)).toBe('declined');
    expect(mockStatusFor(2)).toBe('approved');
    expect(mockStatusFor(3)).toBe('declined');
  });

  it('deja pendiente el monto que termina en 13', () => {
    expect(mockStatusFor(45_013)).toBe('pending');
    expect(mockStatusFor(1_013)).toBe('pending');
  });

  it('es determinista y estable entre llamadas', async () => {
    const p = mock();
    const a = await p.createCheckout(CHECKOUT);
    const b = await p.createCheckout(CHECKOUT);
    expect(a.providerReference).toBe(b.providerReference);
    expect(a.providerReference).toBe('mock_TC-REF-0001_45000');
    const tx = await p.getTransaction(a.providerReference);
    expect(tx.status).toBe('approved');
    expect(tx.amountCop).toBe(45_000);
    expect(tx.final).toBe(true);
  });

  it('explica por qué rechazó un monto impar', async () => {
    const p = mock();
    const session = await p.createCheckout({ ...CHECKOUT, amountCop: 45_001 });
    const tx = await p.getTransaction(session.providerReference);
    expect(tx.status).toBe('declined');
    expect(tx.providerStatusDetail).toMatch(/impares/);
  });

  it('firma y verifica su propio webhook con vector fijo', () => {
    const p = mock();
    const body = JSON.stringify({
      id: 'evt_1',
      type: 'transaction.updated',
      data: { transaction_id: 'mock_TC-REF-0001_45000', reference: 'TC-REF-0001', status: 'approved' },
    });
    const expected = createHmac('sha256', 'secreto-de-desarrollo').update(body).digest('hex');
    expect(expected).toBe('29a704379dfb4d2ee5258d76e49d724b3682064a4ac28f60db186b1f7eab1cce');

    const result = p.verifyWebhook({ headers: { 'x-mock-signature': expected }, rawBody: body });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe('evt_1');
      expect(result.event.status).toBe('approved');
    }
  });

  it('buildSignedWebhook produce un evento que el propio proveedor acepta', () => {
    const p = mock();
    const { headers, rawBody } = p.buildSignedWebhook({
      eventId: 'evt_9',
      providerTransactionId: 'mock_TC-REF-0009_2',
      reference: 'TC-REF-0009',
      status: 'approved',
    });
    const result = p.verifyWebhook({ headers, rawBody });
    expect(result.ok).toBe(true);
  });

  it('rechaza una firma que no cuadra', () => {
    const result = mock().verifyWebhook({
      headers: { 'x-mock-signature': 'a'.repeat(64) },
      rawBody: '{"id":"x"}',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_signature');
  });

  it('solo devuelve transacciones aprobadas y no más de su monto', async () => {
    const p = mock();
    const ok = await p.createCheckout(CHECKOUT);
    await expect(p.refund({ providerTransactionId: ok.providerReference, amountCop: 50_000 })).rejects.toThrow(
      /supera el saldo/,
    );
    const refund = await p.refund({ providerTransactionId: ok.providerReference, amountCop: 20_000 });
    expect(refund.ok).toBe(true);
    expect(refund.amountCop).toBe(20_000);

    const declined = await p.createCheckout({ ...CHECKOUT, reference: 'TC-REF-0003', amountCop: 45_001 });
    await expect(p.refund({ providerTransactionId: declined.providerReference })).rejects.toThrow(
      /aprobadas/,
    );
  });

  it('valida el checkout con las mismas reglas que los demás', async () => {
    await expect(mock().createCheckout({ ...CHECKOUT, amountCop: 0 })).rejects.toThrow(PaymentError);
  });
});

// ─── Selección de proveedor ───────────────────────────────────────────────────

describe('createPaymentProvider', () => {
  it('usa Mercado Pago por omisión (ADR-008)', () => {
    expect(DEFAULT_PAYMENT_PROVIDER).toBe('mercadopago');
    const provider = createPaymentProvider({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-abc' } as NodeJS.ProcessEnv);
    expect(provider.id).toBe('mercadopago');
    expect(provider.sandbox).toBe(true);
  });

  it('respeta PAYMENT_PROVIDER cuando está definido', () => {
    expect(createPaymentProvider({ PAYMENT_PROVIDER: 'mock' } as NodeJS.ProcessEnv).id).toBe('mock');
    expect(
      createPaymentProvider({
        PAYMENT_PROVIDER: 'wompi',
        WOMPI_PUBLIC_KEY: 'pub_test_1',
        WOMPI_PRIVATE_KEY: 'prv_test_1',
        WOMPI_INTEGRITY_SECRET: 's',
        WOMPI_EVENTS_SECRET: 'e',
      } as NodeJS.ProcessEnv).id,
    ).toBe('wompi');
  });

  it('falla en el arranque si PAYMENT_PROVIDER no existe, en lugar de cobrar con otra pasarela', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'stripe' } as NodeJS.ProcessEnv)).toThrow(
      /no corresponde a ningún adaptador/,
    );
  });

  it('falla si falta la credencial del proveedor elegido', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'mercadopago' } as NodeJS.ProcessEnv)).toThrow(
      /MERCADOPAGO_ACCESS_TOKEN/,
    );
  });

  it('missingEnvFor dice exactamente qué falta', () => {
    expect(missingEnvFor('mercadopago', {} as NodeJS.ProcessEnv)).toEqual([
      'MERCADOPAGO_ACCESS_TOKEN',
      'MERCADOPAGO_WEBHOOK_SECRET',
    ]);
    expect(
      missingEnvFor('mercadopago', {
        MERCADOPAGO_ACCESS_TOKEN: 'TEST-abc',
        MERCADOPAGO_WEBHOOK_SECRET: '  ',
      } as NodeJS.ProcessEnv),
    ).toEqual(['MERCADOPAGO_WEBHOOK_SECRET']);
    expect(missingEnvFor('mock', {} as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('isPaymentProviderId reconoce los cinco adaptadores', () => {
    for (const id of ['mercadopago', 'wompi', 'payu', 'epayco', 'mock']) {
      expect(isPaymentProviderId(id)).toBe(true);
    }
    expect(isPaymentProviderId('paypal')).toBe(false);
  });
});
