import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { generateApiKey, hashIp, hashPassword } from '../plugins/auth.js';
import { plainEnvelope } from '../lib/envelope.js';
import { page } from '../lib/page.js';

export default async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.addHook('preHandler', app.requireAuth);

  app.get('/', { schema: { tags: ['cuenta'], summary: 'Mis llaves de API' } }, async (req) => {
    const orgId = req.auth.organizationId;
    if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return plainEnvelope(
      // El secreto nunca vuelve a mostrarse: solo el prefijo.
      page(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        environment: k.environment,
        allowedOrigins: k.allowedOrigins,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
        isActive: !k.revokedAt && (!k.expiresAt || k.expiresAt > new Date()),
      })),
      ),
    );
  });

  app.post(
    '/',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Crear llave de API',
        description:
          'El secreto se muestra **una sola vez** en esta respuesta. Guárdalo: en la base solo queda su hash.',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            environment: { type: 'string', enum: ['sandbox', 'live'], default: 'sandbox' },
            allowedOrigins: { type: 'array', items: { type: 'string' } },
            expiresInDays: { type: 'integer', minimum: 1, maximum: 3650 },
          },
        },
      },
    },
    async (req, reply) => {
      const orgId = req.auth.organizationId;
      if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
      const body = z
        .object({
          name: z.string().min(1).max(120),
          environment: z.enum(['sandbox', 'live']).default('sandbox'),
          allowedOrigins: z.array(z.string().max(300)).max(20).default([]),
          expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
        })
        .parse(req.body);

      // El entorno `live` exige un plan que incluya API; el `sandbox` es gratis.
      if (body.environment === 'live' && !req.auth.entitlements.canUseApi) {
        throw AppError.planRequired('api_keys:live', 'API o Business');
      }

      const existing = await prisma.apiKey.count({
        where: { organizationId: orgId, revokedAt: null },
      });
      if (existing >= 20) {
        throw new AppError(
          'VALIDATION',
          'Ya tienes 20 llaves activas. Revoca alguna antes de crear otra.',
          {},
        );
      }

      const key = generateApiKey(body.environment);
      const created = await prisma.apiKey.create({
        data: {
          organizationId: orgId,
          name: body.name,
          prefix: key.prefix,
          keyHash: await hashPassword(key.secret),
          environment: body.environment,
          allowedOrigins: body.allowedOrigins,
          expiresAt: body.expiresInDays
            ? new Date(Date.now() + body.expiresInDays * 86_400_000)
            : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.auth.userId,
          action: 'api_key_created',
          targetType: 'api_key',
          targetId: created.id,
          ipHash: hashIp(req.ip),
          detail: { environment: body.environment },
        },
      });

      return reply.status(201).send(
        plainEnvelope({
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          environment: created.environment,
          /** Único momento en que se entrega el secreto completo. */
          secret: key.full,
          warning:
            'Guarda esta llave ahora: no podremos volver a mostrártela. Si la pierdes, revócala y crea otra.',
          usage: `curl -H "Authorization: Bearer ${key.full}" ${process.env.PUBLIC_API_URL ?? 'http://localhost:3001'}/geo/v1/municipalities/08758`,
        }),
      );
    },
  );

  /** Revoca una llave. Es la misma operación por dos verbos: el frontend usa POST. */
  const revoke = async (req: FastifyRequest) => {
    const orgId = req.auth.organizationId;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const updated = await prisma.apiKey.updateMany({
      where: { id, organizationId: orgId ?? '', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) throw AppError.notFound('No encontramos esa llave activa.');
    await prisma.auditLog.create({
      data: {
        userId: req.auth.userId,
        action: 'api_key_revoked',
        targetType: 'api_key',
        targetId: id,
        ipHash: hashIp(req.ip),
      },
    });
    const key = await prisma.apiKey.findUniqueOrThrow({ where: { id } });
    return plainEnvelope({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      environment: key.environment,
      allowedOrigins: key.allowedOrigins,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdAt: key.createdAt,
      isActive: false,
    });
  };

  app.post(
    '/:id/revoke',
    { schema: { tags: ['cuenta'], summary: 'Revocar llave de API' } },
    revoke,
  );
  app.delete(
    '/:id',
    { schema: { tags: ['cuenta'], summary: 'Revocar llave de API (alias)' } },
    revoke,
  );

  app.get(
    '/usage',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Consumo de la API por día',
        description:
          'Serie diaria de llamadas, errores y créditos gastados. Alimenta la gráfica de consumo.',
        querystring: {
          type: 'object',
          properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 30 } },
        },
      },
    },
    async (req) => {
      const orgId = req.auth.organizationId;
      if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
      const { days } = z
        .object({ days: z.coerce.number().int().min(1).max(90).default(30) })
        .parse(req.query);

      const since = new Date(Date.now() - days * 86_400_000);
      const events = await prisma.usageEvent.findMany({
        where: { organizationId: orgId, createdAt: { gte: since } },
        select: { createdAt: true, credits: true, statusCode: true },
      });

      // Se siembra la serie con todos los días del rango: una gráfica con huecos se lee
      // como "ese día no hubo datos", que no es lo mismo que "ese día no hubo llamadas".
      const byDate = new Map<string, { calls: number; errors: number; creditsSpent: number }>();
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        byDate.set(d, { calls: 0, errors: 0, creditsSpent: 0 });
      }
      for (const e of events) {
        const key = e.createdAt.toISOString().slice(0, 10);
        const bucket = byDate.get(key);
        if (!bucket) continue;
        bucket.calls += 1;
        if ((e.statusCode ?? 200) >= 400) bucket.errors += 1;
        bucket.creditsSpent += e.credits;
      }

      const serie = [...byDate.entries()]
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return plainEnvelope(serie);
    },
  );
}
