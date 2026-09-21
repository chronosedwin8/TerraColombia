import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { plainEnvelope } from '../lib/envelope.js';

/**
 * Trabajos asíncronos: análisis grandes, informes y exportaciones.
 * Se consultan por sondeo (`GET /jobs/:id`) o por flujo de eventos (`GET /jobs/:id/stream`).
 */
export default async function jobRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.addHook('preHandler', app.requireAuth);

  app.get(
    '/',
    {
      schema: {
        tags: ['zonas'],
        summary: 'Mis trabajos en curso y recientes',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['queued', 'running', 'done', 'failed', 'canceled'] },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (req) => {
      const orgId = req.auth.organizationId;
      if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
      const { status, limit } = z
        .object({
          status: z.enum(['queued', 'running', 'done', 'failed', 'canceled']).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);

      const jobs = await prisma.job.findMany({
        where: { organizationId: orgId, status: status ?? undefined },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          kind: true,
          status: true,
          progress: true,
          progressMessage: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
      });
      return plainEnvelope(jobs);
    },
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['zonas'],
        summary: 'Estado y resultado de un trabajo',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job || (job.organizationId && job.organizationId !== req.auth.organizationId)) {
        throw AppError.notFound('No encontramos ese trabajo.');
      }
      return plainEnvelope({
        id: job.id,
        kind: job.kind,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progressMessage,
        errorMessage: job.errorMessage,
        attempts: job.attempts,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        // El resultado solo viaja cuando el trabajo terminó bien.
        result: job.status === 'done' ? job.result : null,
      });
    },
  );

  /**
   * Flujo de eventos del progreso (SSE). Se sondea la base cada segundo y se emite solo
   * cuando algo cambia, para no saturar al cliente.
   */
  app.get(
    '/:id/stream',
    {
      schema: {
        tags: ['zonas'],
        summary: 'Progreso de un trabajo por flujo de eventos (SSE)',
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job || (job.organizationId && job.organizationId !== req.auth.organizationId)) {
        throw AppError.notFound('No encontramos ese trabajo.');
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      let closed = false;
      let lastSignature = '';
      const send = (event: string, data: unknown) => {
        if (closed) return;
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      req.raw.on('close', () => {
        closed = true;
        clearInterval(timer);
      });

      const tick = async () => {
        if (closed) return;
        try {
          const current = await prisma.job.findUnique({ where: { id } });
          if (!current) {
            send('error', { message: 'El trabajo ya no existe.' });
            closed = true;
            clearInterval(timer);
            reply.raw.end();
            return;
          }
          const signature = `${current.status}:${current.progress}:${current.progressMessage ?? ''}`;
          if (signature !== lastSignature) {
            lastSignature = signature;
            send('progress', {
              id: current.id,
              status: current.status,
              progress: current.progress,
              message: current.progressMessage,
            });
          }
          if (current.status === 'done' || current.status === 'failed' || current.status === 'canceled') {
            send(current.status === 'done' ? 'done' : 'failed', {
              id: current.id,
              status: current.status,
              result: current.status === 'done' ? current.result : null,
              errorMessage: current.errorMessage,
            });
            closed = true;
            clearInterval(timer);
            reply.raw.end();
          }
        } catch (err) {
          req.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'Error leyendo el progreso del trabajo',
          );
        }
      };

      const timer = setInterval(() => void tick(), 1000);
      void tick();

      // Se devuelve la respuesta cruda: Fastify no debe cerrar el flujo.
      return reply;
    },
  );

  app.post(
    '/:id/cancel',
    { schema: { tags: ['zonas'], summary: 'Cancelar un trabajo en cola' } },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const job = await prisma.job.findUnique({ where: { id } });
      if (!job || job.organizationId !== req.auth.organizationId) {
        throw AppError.notFound('No encontramos ese trabajo.');
      }
      if (job.status !== 'queued') {
        throw new AppError(
          'VALIDATION',
          `Solo se pueden cancelar trabajos en cola. Este está en estado "${job.status}".`,
          {},
        );
      }
      await prisma.job.update({
        where: { id },
        data: { status: 'canceled', finishedAt: new Date(), progressMessage: 'Cancelado por el usuario' },
      });
      return plainEnvelope({ ok: true, status: 'canceled' });
    },
  );
}
