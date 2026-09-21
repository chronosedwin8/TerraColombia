import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, ParcelQuerySchema } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { plainEnvelope } from '../lib/envelope.js';
import { page } from '../lib/page.js';

const SAVED_ITEM_KINDS = ['area', 'search', 'parcel', 'intel'] as const;

export default async function projectRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  /** Verifica que el proyecto pertenezca a la organización del solicitante. */
  async function assertOwned(projectId: string, organizationId: string | null) {
    if (!organizationId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== organizationId) {
      throw AppError.notFound('No encontramos ese proyecto en tu organización.');
    }
    return project;
  }

  app.addHook('preHandler', app.requireAuth);

  // ─── Proyectos ──────────────────────────────────────────────────────────────
  app.get('/', { schema: { tags: ['cuenta'], summary: 'Mis proyectos' } }, async (req) => {
    const orgId = req.auth.organizationId;
    if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
    const projects = await prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { savedItems: true, reports: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Las alertas no cuelgan del proyecto sino del usuario, así que se cuentan aparte.
    const alertCount = req.auth.userId
      ? await prisma.alert.count({ where: { userId: req.auth.userId } })
      : 0;

    return plainEnvelope(
      page(
        projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          color: p.color,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          counts: {
            savedAreas: p._count.savedItems,
            savedSearches: p._count.savedItems,
            reports: p._count.reports,
            alerts: alertCount,
          },
        })),
      ),
    );
  });

  app.post(
    '/',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Crear proyecto',
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 160 },
            description: { type: 'string', maxLength: 2000 },
            color: { type: 'string', maxLength: 20 },
          },
        },
      },
    },
    async (req, reply) => {
      const orgId = req.auth.organizationId;
      if (!orgId || !req.auth.userId) throw AppError.forbidden();
      const body = z
        .object({
          name: z.string().min(1).max(160),
          description: z.string().max(2000).optional(),
          color: z.string().max(20).optional(),
        })
        .parse(req.body);
      const project = await prisma.project.create({
        data: {
          organizationId: orgId,
          userId: req.auth.userId,
          name: body.name,
          description: body.description ?? null,
          color: body.color ?? null,
        },
      });
      return reply.status(201).send(
        plainEnvelope({
          id: project.id,
          name: project.name,
          description: project.description,
          color: project.color,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          counts: { savedAreas: 0, savedSearches: 0, reports: 0, alerts: 0 },
        }),
      );
    },
  );

  app.get('/:id', { schema: { tags: ['cuenta'], summary: 'Un proyecto' } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        savedItems: { orderBy: { createdAt: 'desc' } },
        reports: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, kind: true, title: true, status: true, createdAt: true },
        },
      },
    });
    return plainEnvelope(project);
  });

  app.patch('/:id', { schema: { tags: ['cuenta'], summary: 'Actualizar proyecto' } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    const body = z
      .object({
        name: z.string().min(1).max(160).optional(),
        description: z.string().max(2000).nullable().optional(),
        color: z.string().max(20).nullable().optional(),
      })
      .parse(req.body);
    const project = await prisma.project.update({ where: { id }, data: body });
    return plainEnvelope(project);
  });

  app.delete('/:id', { schema: { tags: ['cuenta'], summary: 'Eliminar proyecto' } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    await prisma.project.delete({ where: { id } });
    return plainEnvelope({ ok: true });
  });

  // ─── Vistas guardadas ───────────────────────────────────────────────────────
  // Se guarda el ESTADO de la pantalla, no el resultado: al reabrirla se recalcula contra
  // el corte vigente. Guardar el resultado mostraría cifras viejas sin fecha de corte.

  app.get(
    '/:id/items',
    { schema: { tags: ['cuenta'], summary: 'Vistas guardadas del proyecto' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await assertOwned(id, req.auth.organizationId);
      const items = await prisma.savedItem.findMany({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
      });
      return plainEnvelope(page(items));
    },
  );

  app.post(
    '/:id/items',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Guardar una vista en el proyecto',
        description:
          'Guarda el estado serializado de la pantalla (`urlState`), de modo que al reabrirla se ' +
          'restaure exactamente y se recalcule contra el corte vigente.',
        body: {
          type: 'object',
          required: ['kind', 'name', 'urlState'],
          properties: {
            kind: { type: 'string', enum: [...SAVED_ITEM_KINDS] },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            urlState: { type: 'string', maxLength: 4000 },
            notes: { type: 'string', maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await assertOwned(id, req.auth.organizationId);
      const body = z
        .object({
          kind: z.enum(SAVED_ITEM_KINDS),
          name: z.string().min(1).max(160),
          urlState: z.string().max(4000),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);

      const item = await prisma.savedItem.create({
        data: {
          projectId: id,
          kind: body.kind,
          name: body.name,
          urlState: body.urlState,
          notes: body.notes ?? null,
        },
      });
      return reply.status(201).send(plainEnvelope(item));
    },
  );

  app.delete(
    '/:id/items/:itemId',
    { schema: { tags: ['cuenta'], summary: 'Quitar una vista guardada' } },
    async (req) => {
      const { id, itemId } = z
        .object({ id: z.string().uuid(), itemId: z.string().uuid() })
        .parse(req.params);
      await assertOwned(id, req.auth.organizationId);
      await prisma.savedItem.deleteMany({ where: { id: itemId, projectId: id } });
      return plainEnvelope({ ok: true });
    },
  );

  // ─── Búsquedas guardadas (DSL ejecutable) ───────────────────────────────────
  app.get('/searches/saved', { schema: { tags: ['cuenta'], summary: 'Mis búsquedas guardadas' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const rows = await prisma.savedSearch.findMany({
      where: { userId: req.auth.userId },
      orderBy: { createdAt: 'desc' },
    });
    return plainEnvelope(page(rows));
  });

  app.post(
    '/searches/saved',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Guardar una búsqueda',
        description: 'El DSL se valida antes de guardarse, así que una búsqueda guardada siempre es ejecutable.',
      },
    },
    async (req, reply) => {
      if (!req.auth.userId) throw AppError.unauthorized();
      const body = z
        .object({ name: z.string().min(1).max(160), query: z.unknown() })
        .parse(req.body);
      const query = ParcelQuerySchema.parse(body.query);
      const row = await prisma.savedSearch.create({
        data: { userId: req.auth.userId, name: body.name, query: query as never },
      });
      return reply.status(201).send(plainEnvelope(row));
    },
  );

  app.delete('/searches/saved/:id', { schema: { tags: ['cuenta'], summary: 'Borrar búsqueda guardada' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.savedSearch.deleteMany({ where: { id, userId: req.auth.userId } });
    return plainEnvelope({ ok: true });
  });

  // ─── Alertas ────────────────────────────────────────────────────────────────
  app.get(
    '/alerts',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Mis alertas',
        querystring: { type: 'object', properties: { projectId: { type: 'string' } } },
      },
    },
    async (req) => {
      if (!req.auth.userId) throw AppError.unauthorized();
      const rows = await prisma.alert.findMany({
        where: { userId: req.auth.userId },
        include: { deliveries: { take: 5, orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      return plainEnvelope(page(rows));
    },
  );

  app.post(
    '/alerts',
    {
      preHandler: [app.requireEntitlement('canUseAlerts')],
      schema: {
        tags: ['cuenta'],
        summary: 'Crear alerta',
        description:
          'Vigila una zona, un municipio o un predio y avisa cuando aparece un corte nuevo con cambios.',
      },
    },
    async (req, reply) => {
      if (!req.auth.userId) throw AppError.unauthorized();
      const body = z
        .object({
          name: z.string().min(1).max(160),
          kind: z.enum([
            'new_parcels',
            'parcel_changed',
            'new_buildings',
            'area_change',
            'indicator_threshold',
          ]),
          scope: z.record(z.unknown()),
          condition: z.record(z.unknown()).default({}),
          frequency: z.enum(['daily', 'weekly', 'monthly', 'on_new_cut']).default('on_new_cut'),
          channels: z.array(z.enum(['email', 'webhook'])).default(['email']),
        })
        .parse(req.body);

      const alert = await prisma.alert.create({
        data: {
          userId: req.auth.userId,
          name: body.name,
          kind: body.kind,
          scope: body.scope as never,
          condition: body.condition as never,
          frequency: body.frequency,
          channels: body.channels,
        },
      });
      return reply.status(201).send(plainEnvelope(alert));
    },
  );

  app.patch('/alerts/:id', { schema: { tags: ['cuenta'], summary: 'Activar o desactivar alerta' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const updated = await prisma.alert.updateMany({
      where: { id, userId: req.auth.userId },
      data: { isActive: body.isActive },
    });
    if (updated.count === 0) throw AppError.notFound('No encontramos esa alerta.');
    const alert = await prisma.alert.findUniqueOrThrow({ where: { id } });
    return plainEnvelope(alert);
  });

  app.delete('/alerts/:id', { schema: { tags: ['cuenta'], summary: 'Borrar alerta' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.alert.deleteMany({ where: { id, userId: req.auth.userId } });
    return plainEnvelope({ ok: true });
  });
}
