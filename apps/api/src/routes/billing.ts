import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, CREDIT_COST, PLANS } from '@terracolombia/shared';
import type { PlanCode } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { hashIp } from '../plugins/auth.js';
import { plainEnvelope } from '../lib/envelope.js';
import { getPaymentProvider } from '../services/payments.js';
import { loadConfig } from '../config.js';

/** Paquetes de créditos a la venta. El precio por crédito baja con el volumen. */
const CREDIT_PACKS = [
  { id: 'pack_100', credits: 100, priceCop: 60_000 },
  { id: 'pack_500', credits: 500, priceCop: 250_000 },
  { id: 'pack_2000', credits: 2000, priceCop: 850_000 },
] as const;

export default async function billingRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();
  const config = loadConfig();

  // ─── Webhook: sin sesión, se autentica por firma ────────────────────────────
  app.post(
    '/webhook',
    {
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
      schema: {
        tags: ['cuenta'],
        summary: 'Webhook de la pasarela de pagos',
        description:
          'Verifica la firma del proveedor y procesa el evento de forma idempotente: un mismo ' +
          'evento nunca se aplica dos veces.',
      },
    },
    async (req, reply) => {
      const provider = getPaymentProvider();
      const rawBody = JSON.stringify(req.body ?? {});

      const verified = await provider.verifyWebhook({
        headers: req.headers as Record<string, string | string[] | undefined>,
        rawBody,
        body: req.body as Record<string, unknown>,
      });

      if (!verified.valid) {
        req.log.warn({ provider: provider.id, reason: verified.reason }, 'Webhook con firma inválida');
        // 401 y no 400: la firma es el mecanismo de autenticación de este endpoint.
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Firma del webhook inválida.', details: {} },
        });
      }

      const event = verified.event;

      // Idempotencia por (proveedor, id de evento).
      const existing = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: provider.id, eventId: event.id } },
      });
      if (existing?.processedAt) {
        return { data: { ok: true, alreadyProcessed: true } };
      }

      const record = await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: provider.id, eventId: event.id } },
        create: {
          provider: provider.id,
          eventId: event.id,
          eventType: event.type,
          signatureOk: true,
          payload: (req.body ?? {}) as never,
        },
        update: { signatureOk: true },
      });

      // Se consulta la transacción al proveedor: no se confía en el cuerpo del webhook.
      if (event.transactionId) {
        const tx = await provider.getTransaction(event.transactionId);
        const payment = await prisma.payment.findFirst({
          where: { reference: tx.reference },
        });

        if (payment) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: tx.status,
              providerTxId: tx.providerTransactionId,
              method: tx.method ?? null,
              paidAt: tx.status === 'approved' ? (tx.paidAt ?? new Date()) : null,
              providerPayload: tx.raw as never,
            },
          });

          if (tx.status === 'approved') {
            await applyApprovedPayment(payment.id);
          }
        } else {
          req.log.warn({ reference: tx.reference }, 'Webhook de una referencia que no conocemos');
        }
      }

      await prisma.webhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date() },
      });

      return { data: { ok: true } };
    },
  );

  /**
   * Efectos de un pago aprobado. Es idempotente: cada efecto lleva su propia clave.
   */
  async function applyApprovedPayment(paymentId: string): Promise<void> {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    if (payment.purpose === 'credits') {
      const pack = CREDIT_PACKS.find((p) => p.id === payment.purposeRef);
      if (!pack) return;
      await prisma.creditLedgerEntry.upsert({
        where: { idempotencyKey: `payment:${payment.id}` },
        create: {
          organizationId: payment.organizationId,
          delta: pack.credits,
          reason: 'purchase',
          refId: payment.id,
          idempotencyKey: `payment:${payment.id}`,
          note: `Compra del paquete ${pack.id}`,
        },
        update: {},
      });
      return;
    }

    if (payment.purpose === 'subscription') {
      const planCode = (payment.purposeRef ?? 'pro') as PlanCode;
      const plan = PLANS[planCode];
      if (!plan) return;
      const now = new Date();
      const end = new Date(now);
      end.setUTCMonth(end.getUTCMonth() + 1);

      const existing = await prisma.subscription.findFirst({
        where: { organizationId: payment.organizationId, status: { in: ['active', 'trialing'] } },
      });

      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            planCode,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: end,
            cancelAtPeriodEnd: false,
            canceledAt: null,
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            organizationId: payment.organizationId,
            planCode,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: end,
          },
        });
      }

      if (plan.monthlyCredits > 0) {
        await prisma.creditLedgerEntry.upsert({
          where: { idempotencyKey: `grant:${payment.id}` },
          create: {
            organizationId: payment.organizationId,
            delta: plan.monthlyCredits,
            reason: 'grant_monthly',
            refId: payment.id,
            idempotencyKey: `grant:${payment.id}`,
            note: `Créditos del plan ${plan.name}`,
          },
          update: {},
        });
      }
      return;
    }

    if (payment.purpose === 'report') {
      // El informe queda habilitado para generarse: el worker lo recoge.
      if (payment.purposeRef) {
        await prisma.report
          .update({
            where: { id: payment.purposeRef },
            data: { status: 'queued', progress: 0 },
          })
          .catch(() => undefined);
      }
    }
  }

  // ─── Rutas con sesión ───────────────────────────────────────────────────────
  app.register(async (secured) => {
    secured.addHook('preHandler', app.requireAuth);

    secured.get(
      '/summary',
      { schema: { tags: ['cuenta'], summary: 'Plan, créditos, pagos y facturas' } },
      async (req) => {
        const orgId = req.auth.organizationId;
        if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');

        const [subscription, credits, payments, invoices, ledger] = await Promise.all([
          prisma.subscription.findFirst({
            where: { organizationId: orgId, status: { in: ['active', 'trialing', 'past_due'] } },
            orderBy: { currentPeriodEnd: 'desc' },
          }),
          app.quota.balance(orgId),
          prisma.payment.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              reference: true,
              amountCop: true,
              status: true,
              method: true,
              purpose: true,
              paidAt: true,
              createdAt: true,
            },
          }),
          prisma.invoice.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
          prisma.creditLedgerEntry.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { delta: true, reason: true, operation: true, note: true, createdAt: true },
          }),
        ]);

        return plainEnvelope({
          plan: {
            code: req.auth.plan,
            name: PLANS[req.auth.plan].name,
            monthlyPriceCop: PLANS[req.auth.plan].monthlyPriceCop,
          },
          subscription,
          credits,
          creditCosts: CREDIT_COST,
          creditPacks: CREDIT_PACKS,
          payments,
          invoices,
          ledger,
          provider: config.paymentProvider,
        });
      },
    );

    // ─── Compra de suscripción ────────────────────────────────────────────────
    secured.post(
      '/checkout/subscription',
      {
        schema: {
          tags: ['cuenta'],
          summary: 'Iniciar la compra de un plan',
          body: {
            type: 'object',
            required: ['planCode'],
            properties: {
              planCode: { type: 'string', enum: ['pro', 'business', 'api'] },
              returnUrl: { type: 'string' },
            },
          },
        },
      },
      async (req) => {
        const orgId = req.auth.organizationId;
        if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
        const body = z
          .object({
            planCode: z.enum(['pro', 'business', 'api']),
            returnUrl: z.string().url().optional(),
          })
          .parse(req.body);

        const plan = PLANS[body.planCode];
        if (plan.monthlyPriceCop === null) {
          throw new AppError(
            'VALIDATION',
            'Ese plan se cotiza caso por caso. Escríbenos y te preparamos una propuesta.',
            { planCode: body.planCode },
          );
        }

        const reference = `sub-${orgId.slice(0, 8)}-${Date.now()}`;
        const payment = await prisma.payment.create({
          data: {
            organizationId: orgId,
            provider: config.paymentProvider,
            reference,
            amountCop: plan.monthlyPriceCop,
            purpose: 'subscription',
            purposeRef: body.planCode,
          },
        });

        const provider = getPaymentProvider();
        const checkout = await provider.createCheckout({
          reference,
          amountCop: plan.monthlyPriceCop,
          description: `TerraColombia — Plan ${plan.name} (1 mes)`,
          returnUrl: body.returnUrl ?? `${config.webOrigin}/cuenta/pago?ref=${reference}`,
          notificationUrl: `${config.publicApiUrl}/api/v1/billing/webhook`,
        });

        return plainEnvelope({
          paymentId: payment.id,
          reference,
          amountCop: plan.monthlyPriceCop,
          checkoutUrl: checkout.checkoutUrl,
          providerRef: checkout.providerRef,
          provider: provider.id,
        });
      },
    );

    // ─── Compra de créditos ───────────────────────────────────────────────────
    secured.post(
      '/checkout/credits',
      {
        schema: {
          tags: ['cuenta'],
          summary: 'Comprar un paquete de créditos',
          body: {
            type: 'object',
            required: ['packId'],
            properties: {
              packId: { type: 'string', enum: ['pack_100', 'pack_500', 'pack_2000'] },
              returnUrl: { type: 'string' },
            },
          },
        },
      },
      async (req) => {
        const orgId = req.auth.organizationId;
        if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
        const body = z
          .object({
            packId: z.enum(['pack_100', 'pack_500', 'pack_2000']),
            returnUrl: z.string().url().optional(),
          })
          .parse(req.body);

        const pack = CREDIT_PACKS.find((p) => p.id === body.packId)!;
        const reference = `cred-${orgId.slice(0, 8)}-${Date.now()}`;
        const payment = await prisma.payment.create({
          data: {
            organizationId: orgId,
            provider: config.paymentProvider,
            reference,
            amountCop: pack.priceCop,
            purpose: 'credits',
            purposeRef: pack.id,
          },
        });

        const provider = getPaymentProvider();
        const checkout = await provider.createCheckout({
          reference,
          amountCop: pack.priceCop,
          description: `TerraColombia — ${pack.credits} créditos`,
          returnUrl: body.returnUrl ?? `${config.webOrigin}/cuenta/pago?ref=${reference}`,
          notificationUrl: `${config.publicApiUrl}/api/v1/billing/webhook`,
        });

        return plainEnvelope({
          paymentId: payment.id,
          reference,
          credits: pack.credits,
          amountCop: pack.priceCop,
          checkoutUrl: checkout.checkoutUrl,
          provider: provider.id,
        });
      },
    );

    // ─── Estado de un pago (para la pantalla de retorno) ──────────────────────
    secured.get(
      '/payments/:reference',
      { schema: { tags: ['cuenta'], summary: 'Estado de un pago' } },
      async (req) => {
        const { reference } = z.object({ reference: z.string().max(120) }).parse(req.params);
        const payment = await prisma.payment.findUnique({ where: { reference } });
        if (!payment || payment.organizationId !== req.auth.organizationId) {
          throw AppError.notFound('No encontramos ese pago.');
        }

        // Si sigue pendiente, se consulta al proveedor: el webhook puede haberse perdido.
        if (payment.status === 'pending' && payment.providerTxId) {
          const provider = getPaymentProvider();
          try {
            const tx = await provider.getTransaction(payment.providerTxId);
            if (tx.status !== 'pending') {
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: tx.status,
                  paidAt: tx.status === 'approved' ? (tx.paidAt ?? new Date()) : null,
                  method: tx.method ?? null,
                },
              });
              if (tx.status === 'approved') await applyApprovedPayment(payment.id);
            }
          } catch (err) {
            req.log.warn(
              { err: err instanceof Error ? err.message : String(err) },
              'No se pudo consultar la transacción al proveedor',
            );
          }
        }

        const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
        return plainEnvelope({
          reference: fresh.reference,
          status: fresh.status,
          amountCop: fresh.amountCop,
          method: fresh.method,
          purpose: fresh.purpose,
          paidAt: fresh.paidAt,
          statusLabel:
            fresh.status === 'approved'
              ? 'Pago aprobado'
              : fresh.status === 'pending'
                ? 'Pago en proceso'
                : fresh.status === 'declined'
                  ? 'Pago rechazado'
                  : fresh.status === 'refunded'
                    ? 'Pago devuelto'
                    : 'Pago con error',
        });
      },
    );

    // ─── Cancelar suscripción ─────────────────────────────────────────────────
    secured.post(
      '/cancel',
      {
        schema: {
          tags: ['cuenta'],
          summary: 'Cancelar la suscripción al final del periodo',
        },
      },
      async (req) => {
        const orgId = req.auth.organizationId;
        if (!orgId) throw AppError.forbidden();
        const sub = await prisma.subscription.findFirst({
          where: { organizationId: orgId, status: 'active' },
          orderBy: { currentPeriodEnd: 'desc' },
        });
        if (!sub) throw AppError.notFound('No tienes una suscripción activa.');
        if (sub.planCode === 'free') {
          throw new AppError('VALIDATION', 'El plan gratis no se cancela.', {});
        }

        await prisma.subscription.update({
          where: { id: sub.id },
          data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
        });
        await prisma.auditLog.create({
          data: {
            userId: req.auth.userId,
            action: 'plan_change',
            targetType: 'subscription',
            targetId: sub.id,
            ipHash: hashIp(req.ip),
            detail: { action: 'cancel_at_period_end' } as never,
          },
        });

        return plainEnvelope({
          ok: true,
          message: `Tu plan sigue activo hasta el ${sub.currentPeriodEnd.toISOString().slice(0, 10)}. Después pasarás al plan gratis.`,
          activeUntil: sub.currentPeriodEnd,
        });
      },
    );
  });
}
