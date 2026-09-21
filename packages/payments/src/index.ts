import { getLogger } from '@terracolombia/shared';
import {
  DEFAULT_PAYMENT_PROVIDER,
  PAYMENT_PROVIDER_IDS,
  PaymentError,
  type PaymentProvider,
  type PaymentProviderId,
} from './types.js';
import { createMercadoPagoProvider } from './providers/mercadopago.js';
import { createWompiProvider } from './providers/wompi.js';
import { createPayuProvider } from './providers/payu.js';
import { createEpaycoProvider } from './providers/epayco.js';
import { createMockProvider } from './providers/mock.js';

export * from './types.js';
export * from './credits.js';
export * from './webhooks.js';
export * from './invoice.js';
export * from './http.js';
export * from './providers/mercadopago.js';
export * from './providers/wompi.js';
export * from './providers/payu.js';
export * from './providers/epayco.js';
export * from './providers/mock.js';

const log = getLogger({ mod: 'payments' });

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return (PAYMENT_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Elige el adaptador según `PAYMENT_PROVIDER`.
 *
 * Por omisión, **Mercado Pago** (ADR-008). `mock` sigue existiendo para desarrollo y para las
 * pruebas de punta a punta, y es el único que no necesita credenciales.
 *
 * Si la variable trae un valor desconocido, se falla en el arranque en lugar de caer en
 * silencio a otro proveedor: cobrar con la pasarela equivocada es peor que no arrancar.
 */
export function createPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const configured = (env['PAYMENT_PROVIDER'] ?? DEFAULT_PAYMENT_PROVIDER).trim().toLowerCase();

  if (!isPaymentProviderId(configured)) {
    throw PaymentError.config(
      `PAYMENT_PROVIDER="${configured}" no corresponde a ningún adaptador. Valores admitidos: ${PAYMENT_PROVIDER_IDS.join(', ')}.`,
      { configured },
    );
  }

  const provider = build(configured, env);
  log.info(
    { provider: provider.id, sandbox: provider.sandbox },
    provider.sandbox
      ? 'Pasarela de pagos en modo de pruebas'
      : 'Pasarela de pagos en modo de producción',
  );
  return provider;
}

function build(id: PaymentProviderId, env: NodeJS.ProcessEnv): PaymentProvider {
  switch (id) {
    case 'mercadopago':
      return createMercadoPagoProvider(env);
    case 'wompi':
      return createWompiProvider(env);
    case 'payu':
      return createPayuProvider(env);
    case 'epayco':
      return createEpaycoProvider(env);
    case 'mock':
      return createMockProvider(env);
  }
}

/**
 * Variables de entorno que necesita cada adaptador. La API las usa para avisar en el arranque
 * de lo que falta, antes de que un usuario intente pagar.
 */
export const REQUIRED_ENV: Record<PaymentProviderId, string[]> = {
  mercadopago: ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET'],
  wompi: ['WOMPI_PUBLIC_KEY', 'WOMPI_PRIVATE_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'],
  payu: ['PAYU_MERCHANT_ID', 'PAYU_ACCOUNT_ID', 'PAYU_API_KEY', 'PAYU_API_LOGIN'],
  epayco: ['EPAYCO_PUBLIC_KEY', 'EPAYCO_PRIVATE_KEY', 'EPAYCO_P_CUST_ID_CLIENTE', 'EPAYCO_P_KEY'],
  mock: [],
};

/** Devuelve las variables que faltan para el proveedor configurado. */
export function missingEnvFor(
  id: PaymentProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_ENV[id].filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
}
