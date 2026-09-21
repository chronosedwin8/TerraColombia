import { CREDIT_COST, type CreditOperation } from '@terracolombia/shared';

/**
 * Libro de créditos: **lógica pura**, sin acceso a base de datos.
 *
 * El saldo nunca se guarda como un número mutable: se calcula sumando los asientos, igual que
 * una contabilidad. Así una acreditación duplicada o un descuento perdido se detectan
 * releyendo el libro, y el historial es auditable.
 *
 * La persistencia (`app.credit_ledger`) la hace `apps/api`; este módulo solo decide.
 */

export const CREDIT_ENTRY_KINDS = [
  /** Recarga del periodo según el plan. */
  'plan_grant',
  /** Compra puntual de créditos. */
  'purchase',
  /** Ajuste manual del equipo de soporte. */
  'adjustment',
  /** Devolución de una operación que falló después de cobrarse. */
  'refund',
  /** Descuento por ejecutar una operación costosa. */
  'debit',
  /** Caducidad de créditos no usados al cerrar el periodo. */
  'expiry',
] as const;
export type CreditEntryKind = (typeof CREDIT_ENTRY_KINDS)[number];

export interface CreditEntry {
  id: string;
  /** Organización o usuario dueño del saldo. */
  ownerId: string;
  kind: CreditEntryKind;
  /**
   * Cantidad **con signo**: positiva acredita, negativa descuenta. Siempre un entero: los
   * créditos no se fraccionan.
   */
  amount: number;
  /** Operación que originó el asiento, cuando aplica. */
  operation?: CreditOperation | null;
  /** Referencia externa: id del informe, del pago, del análisis. */
  reference?: string | null;
  /** Momento del asiento, ISO 8601. */
  createdAt: string;
  /** Periodo de facturación al que pertenece (`AAAA-MM`), para calcular caducidades. */
  period?: string | null;
  note?: string | null;
}

export class CreditError extends Error {
  constructor(
    readonly code: 'invalid_amount' | 'insufficient' | 'unknown_operation',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CreditError';
  }
}

/** Costo en créditos de una operación. Única fuente: `CREDIT_COST` de `@terracolombia/shared`. */
export function costOf(operation: CreditOperation): number {
  const cost = CREDIT_COST[operation];
  if (cost === undefined) {
    throw new CreditError('unknown_operation', `Operación sin costo declarado: ${operation}`, {
      operation,
    });
  }
  return cost;
}

/** Lista legible de operaciones y su costo, para la interfaz y la documentación. */
export function creditPriceList(): Array<{ operation: CreditOperation; cost: number }> {
  return (Object.keys(CREDIT_COST) as CreditOperation[]).map((operation) => ({
    operation,
    cost: CREDIT_COST[operation],
  }));
}

/**
 * Saldo = suma de los asientos. Se valida que todos sean enteros: un asiento fraccionario
 * indica un error de cálculo aguas arriba y se rechaza en lugar de redondear en silencio.
 */
export function computeBalance(entries: readonly CreditEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.amount)) {
      throw new CreditError(
        'invalid_amount',
        `El asiento ${entry.id} tiene una cantidad no entera (${entry.amount}). Los créditos no se fraccionan.`,
        { entry },
      );
    }
    total += entry.amount;
  }
  return total;
}

export interface BalanceBreakdown {
  balance: number;
  granted: number;
  purchased: number;
  adjusted: number;
  refunded: number;
  debited: number;
  expired: number;
  entryCount: number;
}

/** Desglose del saldo por tipo de asiento, para el panel de consumo. */
export function computeBreakdown(entries: readonly CreditEntry[]): BalanceBreakdown {
  const sum = (kind: CreditEntryKind): number =>
    entries.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  return {
    balance: computeBalance(entries),
    granted: sum('plan_grant'),
    purchased: sum('purchase'),
    adjusted: sum('adjustment'),
    refunded: sum('refund'),
    debited: sum('debit'),
    expired: sum('expiry'),
    entryCount: entries.length,
  };
}

/** Saldo de un periodo concreto (`AAAA-MM`). */
export function computePeriodBalance(entries: readonly CreditEntry[], period: string): number {
  return computeBalance(entries.filter((e) => e.period === period));
}

export interface AffordResult {
  ok: boolean;
  balance: number;
  cost: number;
  /** Créditos que faltan; 0 si alcanza. */
  missing: number;
}

/** ¿Alcanza el saldo para una operación? No modifica nada. */
export function canAfford(balance: number, operation: CreditOperation): AffordResult {
  const cost = costOf(operation);
  const missing = Math.max(0, cost - balance);
  return { ok: missing === 0, balance, cost, missing };
}

/** Variante que acepta una cantidad arbitraria (exportaciones por filas, por ejemplo). */
export function canAffordAmount(balance: number, amount: number): AffordResult {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new CreditError('invalid_amount', `La cantidad debe ser un entero no negativo (llegó ${amount}).`);
  }
  const missing = Math.max(0, amount - balance);
  return { ok: missing === 0, balance, cost: amount, missing };
}

export interface DebitInput {
  id: string;
  ownerId: string;
  operation: CreditOperation;
  balance: number;
  reference?: string | null;
  period?: string | null;
  note?: string | null;
  at?: Date;
  /**
   * Permite dejar el saldo en negativo (planes Enterprise con facturación posterior).
   * Por omisión, no.
   */
  allowNegative?: boolean;
}

/**
 * Construye el asiento de descuento. Lanza `CreditError('insufficient')` si no alcanza, para
 * que quien llame lo traduzca a `AppError.insufficientCredits` y el usuario vea un mensaje en
 * español con los créditos que faltan.
 */
export function debitEntry(input: DebitInput): CreditEntry {
  const cost = costOf(input.operation);
  if (!input.allowNegative && input.balance < cost) {
    throw new CreditError(
      'insufficient',
      `No hay créditos suficientes para ${input.operation}: se necesitan ${cost} y hay ${input.balance}.`,
      { needed: cost, available: input.balance, missing: cost - input.balance },
    );
  }
  return {
    id: input.id,
    ownerId: input.ownerId,
    kind: 'debit',
    amount: -cost,
    operation: input.operation,
    reference: input.reference ?? null,
    createdAt: (input.at ?? new Date()).toISOString(),
    period: input.period ?? currentPeriod(input.at),
    note: input.note ?? null,
  };
}

export interface CreditInput {
  id: string;
  ownerId: string;
  amount: number;
  kind?: Extract<CreditEntryKind, 'plan_grant' | 'purchase' | 'adjustment' | 'refund'>;
  reference?: string | null;
  operation?: CreditOperation | null;
  period?: string | null;
  note?: string | null;
  at?: Date;
}

/** Construye un asiento de acreditación. */
export function creditEntry(input: CreditInput): CreditEntry {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new CreditError(
      'invalid_amount',
      `Una acreditación debe ser un entero positivo (llegó ${input.amount}).`,
      { amount: input.amount },
    );
  }
  return {
    id: input.id,
    ownerId: input.ownerId,
    kind: input.kind ?? 'purchase',
    amount: input.amount,
    operation: input.operation ?? null,
    reference: input.reference ?? null,
    createdAt: (input.at ?? new Date()).toISOString(),
    period: input.period ?? currentPeriod(input.at),
    note: input.note ?? null,
  };
}

/**
 * Asiento de devolución de una operación que se cobró y después falló (un PDF que no se pudo
 * generar, por ejemplo). Devuelve exactamente lo que costó la operación.
 */
export function refundEntry(input: {
  id: string;
  ownerId: string;
  operation: CreditOperation;
  reference?: string | null;
  note?: string | null;
  at?: Date;
}): CreditEntry {
  return creditEntry({
    id: input.id,
    ownerId: input.ownerId,
    amount: costOf(input.operation),
    kind: 'refund',
    operation: input.operation,
    reference: input.reference ?? null,
    note: input.note ?? `Devolución automática por fallo en ${input.operation}`,
    ...(input.at ? { at: input.at } : {}),
  });
}

/** Asiento de caducidad: pone a cero el saldo sobrante de un periodo que se cierra. */
export function expiryEntry(input: {
  id: string;
  ownerId: string;
  amount: number;
  period: string;
  at?: Date;
  note?: string | null;
}): CreditEntry {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new CreditError(
      'invalid_amount',
      `La caducidad debe ser un entero positivo (llegó ${input.amount}).`,
    );
  }
  return {
    id: input.id,
    ownerId: input.ownerId,
    kind: 'expiry',
    amount: -input.amount,
    operation: null,
    reference: input.period,
    createdAt: (input.at ?? new Date()).toISOString(),
    period: input.period,
    note: input.note ?? `Créditos no usados del periodo ${input.period}`,
  };
}

/** Periodo de facturación (`AAAA-MM`) en la zona horaria de Bogotá. */
export function currentPeriod(at: Date = new Date()): string {
  // America/Bogota es UTC−5 sin horario de verano, así que el desplazamiento es constante.
  const bogota = new Date(at.getTime() - 5 * 60 * 60 * 1000);
  return `${bogota.getUTCFullYear()}-${String(bogota.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Aplica una secuencia de asientos sobre un libro y devuelve el nuevo libro y el saldo.
 * Función pura: no muta la entrada.
 */
export function applyEntries(
  ledger: readonly CreditEntry[],
  newEntries: readonly CreditEntry[],
): { ledger: CreditEntry[]; balance: number } {
  const seen = new Set(ledger.map((e) => e.id));
  const merged = [...ledger];
  for (const entry of newEntries) {
    // Idempotencia por id de asiento: reprocesar un webhook no acredita dos veces.
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return { ledger: merged, balance: computeBalance(merged) };
}

/**
 * Créditos que quedan reservados por operaciones en curso. Se descuentan del saldo disponible
 * para que dos peticiones simultáneas no gasten el mismo crédito.
 */
export function availableBalance(entries: readonly CreditEntry[], reserved: number = 0): number {
  if (!Number.isInteger(reserved) || reserved < 0) {
    throw new CreditError('invalid_amount', `Los créditos reservados deben ser un entero no negativo (llegó ${reserved}).`);
  }
  return computeBalance(entries) - reserved;
}
