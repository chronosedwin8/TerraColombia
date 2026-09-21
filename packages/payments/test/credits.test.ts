import { describe, expect, it } from 'vitest';
import { CREDIT_COST } from '@terracolombia/shared';
import {
  CREDIT_ENTRY_KINDS,
  CreditError,
  applyEntries,
  availableBalance,
  canAfford,
  canAffordAmount,
  computeBalance,
  computeBreakdown,
  computePeriodBalance,
  costOf,
  creditEntry,
  creditPriceList,
  currentPeriod,
  debitEntry,
  expiryEntry,
  refundEntry,
  type CreditEntry,
} from '../src/credits.js';

const OWNER = 'org_01';
const AT = new Date('2026-09-21T14:30:00.000Z');

function entry(partial: Partial<CreditEntry> & { id: string; amount: number }): CreditEntry {
  return {
    ownerId: OWNER,
    kind: 'purchase',
    createdAt: AT.toISOString(),
    period: '2026-09',
    ...partial,
  } as CreditEntry;
}

describe('costos', () => {
  it('lee los costos de CREDIT_COST y no los duplica', () => {
    expect(costOf('report_full')).toBe(CREDIT_COST.report_full);
    expect(costOf('report_summary')).toBe(CREDIT_COST.report_summary);
    expect(costOf('report_technical')).toBe(CREDIT_COST.report_technical);
    expect(costOf('location_intel')).toBe(CREDIT_COST.location_intel);
  });

  it('la lista de precios cubre todas las operaciones declaradas', () => {
    const list = creditPriceList();
    expect(list).toHaveLength(Object.keys(CREDIT_COST).length);
    for (const { operation, cost } of list) expect(cost).toBe(CREDIT_COST[operation]);
  });

  it('una operación sin costo declarado falla en lugar de salir gratis', () => {
    // @ts-expect-error se fuerza una operación que no existe, que es el caso que se quiere cubrir
    expect(() => costOf('operacion_inventada')).toThrow(CreditError);
  });
});

describe('computeBalance', () => {
  it('suma los asientos con signo', () => {
    expect(
      computeBalance([
        entry({ id: '1', amount: 200, kind: 'plan_grant' }),
        entry({ id: '2', amount: -15, kind: 'debit' }),
        entry({ id: '3', amount: -25, kind: 'debit' }),
        entry({ id: '4', amount: 15, kind: 'refund' }),
      ]),
    ).toBe(175);
  });

  it('un libro vacío tiene saldo cero', () => {
    expect(computeBalance([])).toBe(0);
  });

  it('el saldo puede quedar negativo si así lo dice el libro', () => {
    expect(computeBalance([entry({ id: '1', amount: -5, kind: 'debit' })])).toBe(-5);
  });

  it('rechaza cantidades fraccionarias en lugar de redondear en silencio', () => {
    expect(() => computeBalance([entry({ id: '1', amount: 1.5 })])).toThrow(CreditError);
    expect(() => computeBalance([entry({ id: '1', amount: 1.5 })])).toThrow(/no se fraccionan/);
  });
});

describe('computeBreakdown', () => {
  it('desglosa por tipo de asiento y cubre todos los tipos', () => {
    const ledger: CreditEntry[] = [
      entry({ id: '1', amount: 200, kind: 'plan_grant' }),
      entry({ id: '2', amount: 50, kind: 'purchase' }),
      entry({ id: '3', amount: 10, kind: 'adjustment' }),
      entry({ id: '4', amount: 15, kind: 'refund' }),
      entry({ id: '5', amount: -40, kind: 'debit' }),
      entry({ id: '6', amount: -20, kind: 'expiry' }),
    ];
    expect(computeBreakdown(ledger)).toEqual({
      balance: 215,
      granted: 200,
      purchased: 50,
      adjusted: 10,
      refunded: 15,
      debited: -40,
      expired: -20,
      entryCount: 6,
    });
    // El desglose contempla exactamente los tipos declarados.
    expect(CREDIT_ENTRY_KINDS).toHaveLength(6);
  });
});

describe('computePeriodBalance', () => {
  it('aísla el saldo de un periodo', () => {
    const ledger: CreditEntry[] = [
      entry({ id: '1', amount: 200, kind: 'plan_grant', period: '2026-08' }),
      entry({ id: '2', amount: -50, kind: 'debit', period: '2026-08' }),
      entry({ id: '3', amount: 200, kind: 'plan_grant', period: '2026-09' }),
    ];
    expect(computePeriodBalance(ledger, '2026-08')).toBe(150);
    expect(computePeriodBalance(ledger, '2026-09')).toBe(200);
    expect(computePeriodBalance(ledger, '2026-10')).toBe(0);
  });
});

describe('canAfford', () => {
  it('alcanza cuando el saldo iguala el costo', () => {
    const cost = CREDIT_COST.report_full;
    expect(canAfford(cost, 'report_full')).toEqual({ ok: true, balance: cost, cost, missing: 0 });
  });

  it('no alcanza y dice cuánto falta', () => {
    const cost = CREDIT_COST.report_technical;
    expect(canAfford(cost - 3, 'report_technical')).toEqual({
      ok: false,
      balance: cost - 3,
      cost,
      missing: 3,
    });
  });

  it('con saldo negativo, lo que falta incluye la deuda', () => {
    const cost = CREDIT_COST.report_summary;
    expect(canAfford(-2, 'report_summary').missing).toBe(cost + 2);
  });

  it('canAffordAmount admite cantidades arbitrarias', () => {
    expect(canAffordAmount(100, 100).ok).toBe(true);
    expect(canAffordAmount(99, 100)).toEqual({ ok: false, balance: 99, cost: 100, missing: 1 });
    expect(canAffordAmount(10, 0).ok).toBe(true);
    expect(() => canAffordAmount(10, -1)).toThrow(CreditError);
    expect(() => canAffordAmount(10, 1.5)).toThrow(CreditError);
  });
});

describe('debitEntry', () => {
  it('construye un asiento negativo con la operación y el periodo', () => {
    const e = debitEntry({
      id: 'led_1',
      ownerId: OWNER,
      operation: 'report_full',
      balance: 100,
      reference: 'rep_123',
      at: AT,
    });
    expect(e.amount).toBe(-CREDIT_COST.report_full);
    expect(e.kind).toBe('debit');
    expect(e.operation).toBe('report_full');
    expect(e.reference).toBe('rep_123');
    expect(e.period).toBe('2026-09');
    expect(e.createdAt).toBe(AT.toISOString());
  });

  it('falla si el saldo no alcanza, con los detalles para el mensaje al usuario', () => {
    try {
      debitEntry({ id: 'led_1', ownerId: OWNER, operation: 'report_technical', balance: 1 });
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(CreditError);
      const error = e as CreditError;
      expect(error.code).toBe('insufficient');
      expect(error.details).toEqual({
        needed: CREDIT_COST.report_technical,
        available: 1,
        missing: CREDIT_COST.report_technical - 1,
      });
    }
  });

  it('acepta saldo exacto', () => {
    expect(
      debitEntry({
        id: 'led_1',
        ownerId: OWNER,
        operation: 'report_full',
        balance: CREDIT_COST.report_full,
      }).amount,
    ).toBe(-CREDIT_COST.report_full);
  });

  it('con allowNegative deja el saldo en rojo (planes con facturación posterior)', () => {
    const e = debitEntry({
      id: 'led_1',
      ownerId: OWNER,
      operation: 'report_full',
      balance: 0,
      allowNegative: true,
    });
    expect(e.amount).toBe(-CREDIT_COST.report_full);
  });
});

describe('creditEntry', () => {
  it('construye una acreditación positiva', () => {
    const e = creditEntry({ id: 'led_2', ownerId: OWNER, amount: 200, kind: 'plan_grant', at: AT });
    expect(e.amount).toBe(200);
    expect(e.kind).toBe('plan_grant');
    expect(e.period).toBe('2026-09');
  });

  it('el tipo por omisión es compra', () => {
    expect(creditEntry({ id: 'x', ownerId: OWNER, amount: 1 }).kind).toBe('purchase');
  });

  it('rechaza cero, negativos y fracciones', () => {
    for (const amount of [0, -1, 1.5]) {
      expect(() => creditEntry({ id: 'x', ownerId: OWNER, amount })).toThrow(CreditError);
    }
  });
});

describe('refundEntry', () => {
  it('devuelve exactamente el costo de la operación', () => {
    const e = refundEntry({ id: 'led_3', ownerId: OWNER, operation: 'report_full', reference: 'rep_1' });
    expect(e.amount).toBe(CREDIT_COST.report_full);
    expect(e.kind).toBe('refund');
    expect(e.note).toMatch(/Devolución automática/);
  });

  it('un descuento seguido de su devolución deja el saldo igual', () => {
    const start = 100;
    const debit = debitEntry({ id: 'd', ownerId: OWNER, operation: 'location_intel', balance: start });
    const refund = refundEntry({ id: 'r', ownerId: OWNER, operation: 'location_intel' });
    expect(computeBalance([entry({ id: 's', amount: start, kind: 'plan_grant' }), debit, refund])).toBe(start);
  });
});

describe('expiryEntry', () => {
  it('anula el sobrante de un periodo', () => {
    const e = expiryEntry({ id: 'led_4', ownerId: OWNER, amount: 30, period: '2026-08', at: AT });
    expect(e.amount).toBe(-30);
    expect(e.kind).toBe('expiry');
    expect(e.period).toBe('2026-08');
    expect(e.reference).toBe('2026-08');
  });

  it('rechaza cantidades no positivas', () => {
    expect(() => expiryEntry({ id: 'x', ownerId: OWNER, amount: 0, period: '2026-08' })).toThrow(CreditError);
    expect(() => expiryEntry({ id: 'x', ownerId: OWNER, amount: -1, period: '2026-08' })).toThrow(CreditError);
  });
});

describe('applyEntries', () => {
  it('añade asientos nuevos y deja el libro anterior intacto', () => {
    const ledger: CreditEntry[] = [entry({ id: '1', amount: 100, kind: 'plan_grant' })];
    const result = applyEntries(ledger, [entry({ id: '2', amount: -15, kind: 'debit' })]);
    expect(result.balance).toBe(85);
    expect(result.ledger).toHaveLength(2);
    expect(ledger).toHaveLength(1); // no muta la entrada
  });

  it('ignora asientos repetidos: reprocesar un webhook no acredita dos veces', () => {
    const ledger: CreditEntry[] = [entry({ id: '1', amount: 100, kind: 'plan_grant' })];
    const duplicated = entry({ id: 'pago_abc', amount: 500, kind: 'purchase' });
    const once = applyEntries(ledger, [duplicated]);
    const twice = applyEntries(once.ledger, [duplicated, duplicated]);
    expect(once.balance).toBe(600);
    expect(twice.balance).toBe(600);
    expect(twice.ledger).toHaveLength(2);
  });
});

describe('availableBalance', () => {
  it('descuenta los créditos reservados por operaciones en curso', () => {
    const ledger: CreditEntry[] = [entry({ id: '1', amount: 100, kind: 'plan_grant' })];
    expect(availableBalance(ledger)).toBe(100);
    expect(availableBalance(ledger, 25)).toBe(75);
  });

  it('rechaza reservas inválidas', () => {
    expect(() => availableBalance([], -1)).toThrow(CreditError);
    expect(() => availableBalance([], 1.5)).toThrow(CreditError);
  });
});

describe('currentPeriod', () => {
  it('usa la zona horaria de Bogotá (UTC−5)', () => {
    // 2026-10-01T02:00Z sigue siendo 30 de septiembre en Bogotá.
    expect(currentPeriod(new Date('2026-10-01T02:00:00.000Z'))).toBe('2026-09');
    expect(currentPeriod(new Date('2026-10-01T06:00:00.000Z'))).toBe('2026-10');
    expect(currentPeriod(new Date('2026-01-01T04:59:00.000Z'))).toBe('2025-12');
  });

  it('rellena el mes a dos dígitos', () => {
    expect(currentPeriod(new Date('2026-03-15T12:00:00.000Z'))).toBe('2026-03');
  });
});

describe('recorrido completo del libro', () => {
  it('un mes de uso del plan Pro cuadra asiento a asiento', () => {
    let ledger: CreditEntry[] = [];

    // Recarga del plan.
    ledger = applyEntries(ledger, [
      creditEntry({ id: 'grant_2026_09', ownerId: OWNER, amount: 200, kind: 'plan_grant', at: AT }),
    ]).ledger;
    expect(computeBalance(ledger)).toBe(200);

    // Tres informes completos y un análisis de localización.
    const operations = ['report_full', 'report_full', 'report_full', 'location_intel'] as const;
    for (const [i, operation] of operations.entries()) {
      const balance = computeBalance(ledger);
      expect(canAfford(balance, operation).ok).toBe(true);
      ledger = applyEntries(ledger, [
        debitEntry({ id: `debit_${i}`, ownerId: OWNER, operation, balance, at: AT }),
      ]).ledger;
    }
    const spent = CREDIT_COST.report_full * 3 + CREDIT_COST.location_intel;
    expect(computeBalance(ledger)).toBe(200 - spent);

    // Un informe técnico que falla y se devuelve.
    const before = computeBalance(ledger);
    ledger = applyEntries(ledger, [
      debitEntry({ id: 'debit_fallido', ownerId: OWNER, operation: 'report_technical', balance: before, at: AT }),
      refundEntry({ id: 'refund_fallido', ownerId: OWNER, operation: 'report_technical', at: AT }),
    ]).ledger;
    expect(computeBalance(ledger)).toBe(before);

    // Cierre del periodo: caduca el sobrante.
    const leftover = computeBalance(ledger);
    ledger = applyEntries(ledger, [
      expiryEntry({ id: 'expiry_2026_09', ownerId: OWNER, amount: leftover, period: '2026-09', at: AT }),
    ]).ledger;
    expect(computeBalance(ledger)).toBe(0);

    // Y sin saldo, la siguiente operación se niega con el faltante exacto.
    const denied = canAfford(0, 'report_full');
    expect(denied.ok).toBe(false);
    expect(denied.missing).toBe(CREDIT_COST.report_full);
  });
});
