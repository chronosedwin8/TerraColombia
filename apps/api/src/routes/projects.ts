import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, ParcelQuerySchema } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { approxAreaKm2 } from '@terracolombia/geo';
import { plainEnvelope } from '../lib/envelope.js';

const GeometrySchema = z.object({
  type: z.string(),
  coordinates: z.unknown(),
});

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

  app.get('/', { schema: { tags: ['cuenta'], summary: 'Mis proyectos' } }, async (req) => {
    const orgId = req.auth.organizationId;
    if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
    const projects = await prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { savedAreas: true, savedParcels: true, reports: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return plainEnvelope(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        color: p.color,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        counts: {
          areas: p._count.savedAreas,
          parcels: p._count.savedParcels,
          reports: p._count.reports,
        },
      })),
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
      return reply.status(201).send(plainEnvelope(project));
    },
  );

  app.get('/:id', { schema: { tags: ['cuenta'], summary: 'Un proyecto' } }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        savedAreas: { orderBy: { createdAt: 'desc' } },
        savedParcels: { orderBy: { createdAt: 'desc' } },
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

  // ─── Áreas guardadas ────────────────────────────────────────────────────────
  app.post(
    '/:id/areas',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Guardar un área en el proyecto',
        body: {
          type: 'object',
          required: ['name', 'geometry', 'kind'],
          properties: {
            name: { type: 'string' },
            geometry: { type: 'object' },
            kind: { type: 'string', enum: ['polygon', 'radius', 'municipality', 'isochrone'] },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await assertOwned(id, req.auth.organizationId);
      const body = z
        .object({
          name: z.string().min(1).max(160),
          geometry: GeometrySchema,
          kind: z.enum(['polygon', 'radius', 'municipality', 'isochrone']),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);

      // Se calcula el área al guardar para poder mostrarla sin recalcular.
      let areaKm2: number | null = null;
      try {
        areaKm2 = approxAreaKm2(body.geometry as never);
      } catch {
        areaKm2 = null;
      }

      const area = await prisma.savedArea.create({
        data: {
          projectId: id,
          name: body.name,
          geometry: body.geometry as never,
          kind: body.kind,
          areaKm2: areaKm2 !== null ? areaKm2.toFixed(4) : null,
          notes: body.notes ?? null,
        },
      });
      return reply.status(201).send(plainEnvelope(area));
    },
  );

  app.delete('/:id/areas/:areaId', { schema: { tags: ['cuenta'], summary: 'Quitar área guardada' } }, async (req) => {
    const { id, areaId } = z
      .object({ id: z.string().uuid(), areaId: z.string().uuid() })
      .parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    await prisma.savedArea.deleteMany({ where: { id: areaId, projectId: id } });
    return plainEnvelope({ ok: true });
  });

  // ─── Predios guardados ──────────────────────────────────────────────────────
  app.post(
    '/:id/parcels',
    {
      schema: {
        tags: ['cuenta'],
        summary: 'Guardar un predio en el proyecto',
        body: {
          type: 'object',
          required: ['npn'],
          properties: {
            npn: { type: 'string', minLength: 30, maxLength: 30 },
            label: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await assertOwned(id, req.auth.organizationId);
      const body = z
        .object({
          npn: z.string().regex(/^\d{30}$/, 'El código predial debe tener 30 dígitos'),
          label: z.string().max(200).optional(),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);

      const saved = await prisma.savedParcel.upsert({
        where: { projectId_npn: { projectId: id, npn: body.npn } },
        create: {
          projectId: id,
          npn: body.npn,
          muniCode: body.npn.slice(0, 5),
          label: body.label ?? null,
          notes: body.notes ?? null,
        },
        update: { label: body.label ?? null, notes: body.notes ?? null },
      });
      return reply.status(201).send(plainEnvelope(saved));
    },
  );

  app.delete('/:id/parcels/:npn', { schema: { tags: ['cuenta'], summary: 'Quitar predio guardado' } }, async (req) => {
    const { id, npn } = z
      .object({ id: z.string().uuid(), npn: z.string().regex(/^\d{30}$/) })
      .parse(req.params);
    await assertOwned(id, req.auth.organizationId);
    await prisma.savedParcel.deleteMany({ where: { projectId: id, npn } });
    return plainEnvelope({ ok: true });
  });

  // ─── Búsquedas guardadas ────────────────────────────────────────────────────
  app.get('/searches/saved', { schema: { tags: ['cuenta'], summary: 'Mis búsquedas guardadas' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const rows = await prisma.savedSearch.findMany({
      where: { userId: req.auth.userId },
      orderBy: { createdAt: 'desc' },
    });
    return plainEnvelope(rows);
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
      // Validación estricta: no se guarda un DSL que después falle al ejecutarse.
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
  app.get('/alerts/list', { schema: { tags: ['cuenta'], summary: 'Mis alertas' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const rows = await prisma.alert.findMany({
      where: { userId: req.auth.userId },
      include: { deliveries: { take: 5, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return plainEnvelope(rows);
  });

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
    return plainEnvelope({ ok: true, isActive: body.isActive });
  });

  app.delete('/alerts/:id', { schema: { tags: ['cuenta'], summary: 'Borrar alerta' } }, async (req) => {
    if (!req.auth.userId) throw AppError.unauthorized();
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.alert.deleteMany({ where: { id, userId: req.auth.userId } });
    return plainEnvelope({ ok: true });
  });
}
