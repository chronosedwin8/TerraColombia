import type { FastifyInstance } from 'fastify';
import { AppError, PLANS } from '@terracolombia/shared';
import type { PlanCode } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { buildSessionUser } from '../services/session.js';
import { plainEnvelope } from '../lib/envelope.js';

export default async function meRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.get(
    '/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['cuenta'],
        summary: 'Cuenta actual, plan, créditos y cuotas consumidas',
      },
    },
    async (req) => {
      if (!req.auth.userId) throw AppError.unauthorized();

      // La ficha va en el primer nivel y es la misma que devuelven login y refresh: el
      // frontend lee `data.plan` y `data.entitlements` sin importar por dónde llegó.
      const sessionUser = await buildSessionUser(req.auth.userId, req.auth.organizationId);

      const user = await prisma.user.findUnique({
        where: { id: req.auth.userId },
        include: { memberships: { include: { organization: true } } },
      });
      if (!user) throw AppError.unauthorized();

      const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
      const counters = sessionUser.organizationId
        ? await prisma.quotaCounter.findMany({
            where: { organizationId: sessionUser.organizationId, period },
          })
        : [];

      const plan = PLANS[sessionUser.plan];

      return plainEnvelope({
        ...sessionUser,
        emailVerified: user.emailVerified,
        locale: user.locale,
        organizations: user.memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          role: m.role,
          isCurrent: m.organizationId === sessionUser.organizationId,
        })),
        planDetail: {
          code: plan.code,
          name: plan.name,
          highlights: plan.highlights,
          monthlyPriceCop: plan.monthlyPriceCop,
        },
        usage: {
          period,
          counters: counters.map((c) => ({ metric: c.metric, used: c.used })),
          limits: {
            detailedQueriesPerMonth: sessionUser.entitlements.detailedQueriesPerMonth,
            reportsPerMonth: sessionUser.entitlements.reportsPerMonth,
            tilesPerDay: sessionUser.entitlements.tilesPerDay,
          },
        },
      });
    },
  );

  app.patch(
    '/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['cuenta'],
        summary: 'Actualizar datos de la cuenta',
        body: {
          type: 'object',
          properties: {
            displayName: { type: 'string', minLength: 2, maxLength: 120 },
            locale: { type: 'string', maxLength: 10 },
          },
        },
      },
    },
    async (req) => {
      if (!req.auth.userId) throw AppError.unauthorized();
      const body = req.body as { displayName?: string; locale?: string };
      const user = await prisma.user.update({
        where: { id: req.auth.userId },
        data: {
          displayName: body.displayName ?? undefined,
          locale: body.locale ?? undefined,
        },
      });
      return plainEnvelope({ id: user.id, displayName: user.displayName, locale: user.locale });
    },
  );

  app.get(
    '/plans',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Planes disponibles',
        description:
          'Los precios son la hipótesis vigente del producto y pueden cambiar. El plan Enterprise ' +
          'se cotiza caso por caso.',
      },
    },
    async () =>
      plainEnvelope({
        plans: Object.values(PLANS).map((p) => ({
          code: p.code,
          name: p.name,
          audience: p.audience,
          monthlyPriceCop: p.monthlyPriceCop,
          unitPriceCop: p.unitPriceCop,
          monthlyCredits: p.monthlyCredits,
          highlights: p.highlights,
          entitlements: p.entitlements,
          requiresQuote: p.monthlyPriceCop === null,
        })),
        currency: 'COP',
        note: 'Precios en pesos colombianos, sin impuestos. Son una hipótesis a validar.',
      }),
  );

  app.post(
    '/me/switch-organization',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['cuenta'],
        summary: 'Cambiar de organización activa',
        body: {
          type: 'object',
          required: ['organizationId'],
          properties: { organizationId: { type: 'string' } },
        },
      },
    },
    async (req) => {
      if (!req.auth.userId) throw AppError.unauthorized();
      const { organizationId } = req.body as { organizationId: string };
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId: req.auth.userId, organizationId } },
      });
      if (!membership) {
        throw AppError.forbidden('No perteneces a esa organización.');
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
      const accessToken = app.jwt.sign({
        sub: user.id,
        org: organizationId,
        role: user.role,
      });
      // Se devuelve la ficha de la organización nueva: el plan y los permisos cambian con ella.
      const sessionUser = await buildSessionUser(user.id, organizationId);
      return plainEnvelope({ accessToken, user: sessionUser });
    },
  );

  // Panel de equipo: miembros de la organización actual.
  app.get(
    '/team',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['cuenta'], summary: 'Miembros de la organización' },
    },
    async (req) => {
      const orgId = req.auth.organizationId;
      if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
      const members = await prisma.membership.findMany({
        where: { organizationId: orgId },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      });
      const seats = req.auth.entitlements.seats;
      return plainEnvelope({
        members: members.map((m) => ({
          userId: m.userId,
          email: m.user.email,
          displayName: m.user.displayName,
          role: m.role,
          joinedAt: m.createdAt,
        })),
        seats,
        seatsUsed: members.length,
        seatsAvailable: Math.max(0, seats - members.length),
        planName: PLANS[req.auth.plan as PlanCode].name,
      });
    },
  );
}
