import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, CREDIT_COST } from '@terracolombia/shared';
import type { CreditOperation } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';

/**
 * Cuotas, créditos y registro de uso.
 *
 * - Las cuotas por periodo se cuentan en `app.quota_counter` para no recorrer `usage_event`
 *   en cada petición.
 * - Los créditos viven en `app.credit_ledger` como libro de asientos: el saldo es la suma,
 *   nunca se sobreescribe, y cada cobro lleva clave de idempotencia.
 */

declare module 'fastify' {
  interface FastifyInstance {
    quota: {
      /** Consume una unidad de cuota; lanza QUOTA_EXCEEDED si se pasó del plan. */
      consume(req: FastifyRequest, metric: string, limit: number | null, amount?: number): Promise<void>;
      /** Saldo de créditos de la organización. */
      balance(organizationId: string): Promise<number>;
      /** Cobra créditos de forma idempotente. */
      charge(
        organizationId: string,
        operation: CreditOperation,
        idempotencyKey: string,
        refId?: string,
      ): Promise<number>;
      /** Registra el uso para analítica y facturación. */
      record(req: FastifyRequest, input: {
        operation: string;
        credits?: number;
        units?: number;
        durationMs?: number;
        statusCode?: number;
        detail?: Record<string, unknown>;
      }): Promise<void>;
    };
  }
}

function currentPeriod(metric: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  // Las cuotas de teselas son diarias; el resto, mensuales.
  if (metric.endsWith('_per_day')) {
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return `${y}-${m}`;
}

export default fp(
  async (app: FastifyInstance) => {
    const quota: FastifyInstance['quota'] = {
      async consume(req, metric, limit, amount = 1) {
        // Sin límite declarado o sin organización (anónimo): no se cuenta.
        if (limit === null) return;
        const orgId = req.auth.organizationId;
        if (!orgId) {
          // Un usuario anónimo tiene el límite del plan gratis, contado en memoria por IP.
          // No se persiste: el rate-limit de Fastify ya protege el servicio.
          return;
        }
        const prisma = getPrisma();
        const period = currentPeriod(metric);
        const row = await prisma.quotaCounter.upsert({
          where: { organizationId_period_metric: { organizationId: orgId, period, metric } },
          create: { organizationId: orgId, period, metric, used: amount },
          update: { used: { increment: amount } },
        });
        if (row.used > limit) {
          throw AppError.quotaExceeded(metric);
        }
      },

      async balance(organizationId) {
        const prisma = getPrisma();
        const agg = await prisma.creditLedgerEntry.aggregate({
          where: { organizationId },
          _sum: { delta: true },
        });
        return agg._sum.delta ?? 0;
      },

      async charge(organizationId, operation, idempotencyKey, refId) {
        const prisma = getPrisma();
        const cost = CREDIT_COST[operation];

        // Idempotencia: si ya se cobró con esta clave, no se vuelve a cobrar.
        const existing = await prisma.creditLedgerEntry.findUnique({ where: { idempotencyKey } });
        if (existing) return existing.delta;

        const available = await quota.balance(organizationId);
        if (available < cost) throw AppError.insufficientCredits(cost, available);

        await prisma.creditLedgerEntry.create({
          data: {
            organizationId,
            delta: -cost,
            reason: `debit_${operation}`,
            operation,
            refId: refId ?? null,
            idempotencyKey,
          },
        });
        return -cost;
      },

      async record(req, input) {
        const prisma = getPrisma();
        try {
          await prisma.usageEvent.create({
            data: {
              organizationId: req.auth.organizationId,
              userId: req.auth.userId,
              apiKeyId: req.auth.apiKeyId,
              operation: input.operation,
              channel: req.auth.channel === 'api_key' ? 'api' : 'web',
              credits: input.credits ?? 0,
              units: input.units ?? null,
              durationMs: input.durationMs ?? null,
              statusCode: input.statusCode ?? null,
              // El detalle no lleva datos personales: solo códigos y métricas.
              detail: (input.detail ?? {}) as never,
            },
          });
        } catch (err) {
          // El registro de uso nunca debe tumbar una petición del usuario.
          req.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'No se pudo registrar el evento de uso',
          );
        }
      },
    };

    app.decorate('quota', quota);
  },
  { name: 'quota', dependencies: ['auth'] },
);
