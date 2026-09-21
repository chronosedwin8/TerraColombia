import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, PLANS, formatNumber } from '@terracolombia/shared';
import type { PlanCode } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { plainEnvelope } from '../lib/envelope.js';
import { page } from '../lib/page.js';
import { hashIp } from '../plugins/auth.js';

/**
 * Vistas de facturación que consume el frontend: suscripción, pagos, créditos y equipo.
 *
 * Se separan de `billing.ts` (que tiene el webhook y el checkout) porque son solo lectura
 * de estado y no tocan la pasarela.
 */
export default async function billingViewRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.addHook('preHandler', app.requireAuth);

  function requireOrg(organizationId: string | null): string {
    if (!organizationId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
    return organizationId;
  }

  // ─── Suscripción y consumo ──────────────────────────────────────────────────
  app.get(
    '/subscription',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Plan vigente, asientos, créditos y consumo del periodo',
      },
    },
    async (req) => {
      const orgId = requireOrg(req.auth.organizationId);
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

      const [subscription, credits, seatsUsed, counters] = await Promise.all([
        prisma.subscription.findFirst({
          where: { organizationId: orgId, status: { in: ['active', 'trialing', 'past_due'] } },
          orderBy: { currentPeriodEnd: 'desc' },
        }),
        prisma.creditLedgerEntry.aggregate({
          where: { organizationId: orgId },
          _sum: { delta: true },
        }),
        prisma.membership.count({ where: { organizationId: orgId } }),
        prisma.quotaCounter.findMany({ where: { organizationId: orgId, period } }),
      ]);

      const ent = req.auth.entitlements;
      const used = (metric: string) => counters.find((c) => c.metric === metric)?.used ?? 0;

      // Estado normalizado a lo que espera la interfaz.
      const statusMap: Record<string, 'active' | 'past_due' | 'cancelled' | 'trialing' | 'none'> = {
        active: 'active',
        trialing: 'trialing',
        past_due: 'past_due',
        canceled: 'cancelled',
        expired: 'cancelled',
      };

      return plainEnvelope({
        plan: req.auth.plan,
        status: subscription ? (statusMap[subscription.status] ?? 'none') : 'none',
        currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
        seatsUsed,
        seatsTotal: ent.seats,
        credits: credits._sum.delta ?? 0,
        usage: [
          {
            key: 'detailed_queries',
            label: 'Consultas detalladas de predio',
            used: used('detailed_queries'),
            limit: ent.detailedQueriesPerMonth,
          },
          {
            key: 'reports',
            label: 'Informes generados',
            used: used('reports'),
            limit: ent.reportsPerMonth,
          },
          {
            key: 'tiles_per_day',
            label: 'Teselas servidas hoy',
            used: used('tiles_per_day'),
            limit: ent.tilesPerDay,
          },
        ],
      });
    },
  );

  app.get(
    '/payments',
    { schema: { tags: ['cuenta'], summary: 'Historial de pagos' } },
    async (req) => {
      const orgId = requireOrg(req.auth.organizationId);
      const payments = await prisma.payment.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const statusMap: Record<string, 'pending' | 'approved' | 'declined' | 'refunded'> = {
        pending: 'pending',
        approved: 'approved',
        declined: 'declined',
        voided: 'declined',
        error: 'declined',
        refunded: 'refunded',
      };
      return plainEnvelope(
        page(
          payments.map((p) => ({
            id: p.id,
            createdAt: p.createdAt.toISOString(),
            amountCop: p.amountCop,
            concept: conceptOf(p.purpose, p.purposeRef),
            status: statusMap[p.status] ?? 'pending',
          })),
        ),
      );
    },
  );

  app.get(
    '/credits',
    { schema: { tags: ['cuenta'], summary: 'Libro de créditos' } },
    async (req) => {
      const orgId = requireOrg(req.auth.organizationId);
      const entries = await prisma.creditLedgerEntry.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return plainEnvelope(
        page(
          entries.map((e) => ({
            id: e.id,
            createdAt: e.createdAt.toISOString(),
            delta: e.delta,
            reason: e.reason,
            operation: e.operation,
            note: e.note,
          })),
        ),
      );
    },
  );

  // ─── Equipo ─────────────────────────────────────────────────────────────────
  app.get('/team', { schema: { tags: ['cuenta'], summary: 'Miembros de la organización' } }, async (req) => {
    const orgId = requireOrg(req.auth.organizationId);
    const [members, invitations] = await Promise.all([
      prisma.membership.findMany({
        where: { organizationId: orgId },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.invitation.findMany({
        where: { organizationId: orgId, acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const items = [
      ...members.map((m) => ({
        id: m.id,
        email: m.user.email,
        name: m.user.displayName,
        role: m.role as 'owner' | 'admin' | 'member' | 'viewer',
        status: 'active' as const,
      })),
      // Las invitaciones pendientes aparecen en la misma lista, marcadas: si no, el usuario
      // no entiende por qué gastó un asiento que no ve.
      ...invitations.map((i) => ({
        id: i.id,
        email: i.email,
        name: null,
        role: i.role as 'owner' | 'admin' | 'member' | 'viewer',
        status: 'invited' as const,
      })),
    ];

    return plainEnvelope(page(items));
  });

  app.post(
    '/team',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Invitar a alguien a la organización',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'member', 'viewer'] },
          },
        },
      },
    },
    async (req, reply) => {
      const orgId = requireOrg(req.auth.organizationId);
      const body = z
        .object({
          email: z.string().email().max(200),
          role: z.enum(['admin', 'member', 'viewer']).default('member'),
        })
        .parse(req.body);
      const email = body.email.toLowerCase().trim();

      // Solo quien administra la organización puede invitar.
      if (!['owner', 'admin'].includes(await roleInOrg(req.auth.userId, orgId))) {
        throw AppError.forbidden('Solo quien administra la organización puede invitar.');
      }

      const [seatsUsed, pending] = await Promise.all([
        prisma.membership.count({ where: { organizationId: orgId } }),
        prisma.invitation.count({
          where: { organizationId: orgId, acceptedAt: null, revokedAt: null },
        }),
      ]);
      const seats = req.auth.entitlements.seats;
      if (seatsUsed + pending >= seats) {
        throw new AppError(
          'PLAN_REQUIRED',
          `Tu plan incluye ${formatNumber(seats)} ${seats === 1 ? 'asiento' : 'asientos'} y ya están ` +
            `ocupados (${seatsUsed} en uso, ${pending} invitaciones pendientes). Mejora el plan o ` +
            'libera un asiento para invitar a alguien más.',
          { seats, seatsUsed, pending },
        );
      }

      const alreadyMember = await prisma.membership.findFirst({
        where: { organizationId: orgId, user: { email } },
      });
      if (alreadyMember) {
        throw new AppError('VALIDATION', 'Esa persona ya pertenece a la organización.', {});
      }

      // El token en claro solo viajaría en el correo; en la base queda su hash.
      const token = randomBytes(24).toString('base64url');
      const invitation = await prisma.invitation.upsert({
        where: { organizationId_email: { organizationId: orgId, email } },
        create: {
          organizationId: orgId,
          email,
          role: body.role,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          invitedBy: req.auth.userId,
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
        },
        update: {
          role: body.role,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 14 * 86_400_000),
          revokedAt: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.auth.userId,
          action: 'team_invited',
          targetType: 'invitation',
          targetId: invitation.id,
          ipHash: hashIp(req.ip),
          detail: { role: body.role } as never,
        },
      });

      return reply.status(201).send(
        plainEnvelope({
          id: invitation.id,
          email: invitation.email,
          name: null,
          role: invitation.role as 'owner' | 'admin' | 'member' | 'viewer',
          status: 'invited' as const,
          // El envío del correo depende de un proveedor que este despliegue aún no tiene.
          note:
            'La invitación quedó registrada. El envío del correo requiere configurar un proveedor ' +
            'de correo saliente, que todavía no está conectado en este despliegue.',
        }),
      );
    },
  );

  app.delete(
    '/team/:id',
    { schema: { tags: ['cuenta'], summary: 'Quitar a alguien o cancelar su invitación' } },
    async (req) => {
      const orgId = requireOrg(req.auth.organizationId);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      if (!['owner', 'admin'].includes(await roleInOrg(req.auth.userId, orgId))) {
        throw AppError.forbidden('Solo quien administra la organización puede quitar miembros.');
      }

      const membership = await prisma.membership.findFirst({
        where: { id, organizationId: orgId },
      });
      if (membership) {
        if (membership.role === 'owner') {
          const owners = await prisma.membership.count({
            where: { organizationId: orgId, role: 'owner' },
          });
          if (owners <= 1) {
            throw new AppError(
              'VALIDATION',
              'No se puede quitar a la única persona propietaria: la organización quedaría sin quien la administre.',
              {},
            );
          }
        }
        await prisma.membership.delete({ where: { id } });
        return plainEnvelope({ ok: true, removed: 'member' });
      }

      const invitation = await prisma.invitation.findFirst({ where: { id, organizationId: orgId } });
      if (invitation) {
        await prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
        return plainEnvelope({ ok: true, removed: 'invitation' });
      }

      throw AppError.notFound('No encontramos ese miembro ni esa invitación.');
    },
  );

  async function roleInOrg(userId: string | null, organizationId: string): Promise<string> {
    if (!userId) return 'viewer';
    const m = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return m?.role ?? 'viewer';
  }
}

function conceptOf(purpose: string, ref: string | null): string {
  switch (purpose) {
    case 'subscription': {
      const plan = ref && ref in PLANS ? PLANS[ref as PlanCode].name : ref;
      return `Suscripción al plan ${plan ?? 'no declarado'}`;
    }
    case 'credits':
      return `Compra de créditos (${ref ?? 'paquete no declarado'})`;
    case 'report':
      return 'Informe territorial';
    default:
      return purpose;
  }
}
