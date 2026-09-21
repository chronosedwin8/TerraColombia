import { getLogger } from '@terracolombia/shared';
import type { InvoiceProvider, InvoiceRequest, InvoiceResult } from './types.js';

/**
 * Facturación electrónica: **puerto declarado, proveedor pendiente**.
 *
 * Situación real: en Colombia la factura electrónica de venta debe generarse en el formato
 * UBL 2.1 de la DIAN, firmarse digitalmente y validarse ante la DIAN antes de entregarse al
 * adquiriente. Eso exige un certificado de firma digital y, en la práctica, un proveedor
 * tecnológico autorizado. TerraColombia **no** implementa ese protocolo: lo delega.
 *
 * Mientras no haya proveedor elegido, `NoopInvoiceProvider` deja constancia explícita de que
 * la factura no se emitió, en lugar de fingir que sí. La API debe:
 *
 *  1. registrar el pago igual (`app.payment`),
 *  2. entregar el producto (el informe ya está pagado),
 *  3. guardar el `InvoiceResult` con `status: 'not_implemented'` para que quede la deuda
 *     administrativa visible en el panel,
 *  4. y no prometer al usuario una factura que no va a llegar.
 *
 * Esto está en la lista de pendientes de `docs/LEGAL.md`.
 */

const log = getLogger({ mod: 'payments/invoice' });

export const INVOICE_PENDING_MESSAGE =
  'La facturación electrónica ante la DIAN todavía no está integrada. El pago quedó registrado y el producto se entrega, pero la factura electrónica debe emitirse por fuera del sistema hasta que se contrate un proveedor tecnológico autorizado.';

export class NoopInvoiceProvider implements InvoiceProvider {
  readonly id = 'noop';
  readonly implemented = false;

  async issue(request: InvoiceRequest): Promise<InvoiceResult> {
    // Se registra sin datos personales del adquiriente más allá de lo que ya está en el pago.
    log.warn(
      {
        reference: request.reference,
        providerTransactionId: request.providerTransactionId,
        lineCount: request.lines.length,
        totalCop: invoiceTotalCop(request),
      },
      'Factura electrónica no emitida: no hay proveedor de facturación configurado',
    );
    return {
      ok: false,
      invoiceId: null,
      cufe: null,
      pdfUrl: null,
      xmlUrl: null,
      status: 'not_implemented',
      message: INVOICE_PENDING_MESSAGE,
      raw: { request: { reference: request.reference, issuedAt: request.issuedAt } },
    };
  }

  async void(invoiceId: string, reason: string): Promise<InvoiceResult> {
    log.warn({ invoiceId, reason }, 'Nota crédito no emitida: no hay proveedor de facturación configurado');
    return {
      ok: false,
      invoiceId,
      cufe: null,
      pdfUrl: null,
      xmlUrl: null,
      status: 'not_implemented',
      message: INVOICE_PENDING_MESSAGE,
      raw: { invoiceId, reason },
    };
  }
}

/** Total de la factura en COP, IVA incluido. Útil para el registro y para el panel. */
export function invoiceTotalCop(request: InvoiceRequest): number {
  return request.lines.reduce((total, line) => {
    const net = line.unitPriceCop * line.quantity;
    return total + Math.round(net * (1 + line.vatPercent / 100));
  }, 0);
}

/** Subtotal sin IVA. */
export function invoiceSubtotalCop(request: InvoiceRequest): number {
  return request.lines.reduce((total, line) => total + line.unitPriceCop * line.quantity, 0);
}

/** IVA total. */
export function invoiceVatCop(request: InvoiceRequest): number {
  return invoiceTotalCop(request) - invoiceSubtotalCop(request);
}

export function createInvoiceProvider(env: NodeJS.ProcessEnv = process.env): InvoiceProvider {
  const configured = env['INVOICE_PROVIDER'] ?? 'noop';
  if (configured !== 'noop') {
    // No se inventa un adaptador: si alguien configura un proveedor que no existe, se dice.
    log.error(
      { configured },
      'INVOICE_PROVIDER apunta a un proveedor sin adaptador implementado; se usa NoopInvoiceProvider',
    );
  }
  return new NoopInvoiceProvider();
}
