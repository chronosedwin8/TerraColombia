import type { FastifyInstance } from 'fastify';
import { healthCheck } from '@terracolombia/db';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['admin'],
        summary: 'Estado del servicio y de sus dependencias',
        response: {
          200: {
            description: 'El servicio y sus dependencias responden',
            type: 'object',
            properties: {
              status: { type: 'string' },
              database: { type: 'object', additionalProperties: true },
              cache: { type: 'string' },
              version: { type: 'string' },
            },
          },
          503: {
            description: 'Sin base de datos: el servicio no puede atender peticiones',
            type: 'object',
            properties: {
              status: { type: 'string' },
              database: { type: 'object', additionalProperties: true },
              cache: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const db = await healthCheck();
      const status = db.postgres ? (db.ok ? 'ok' : 'degradado') : 'caido';
      // Sin base no se puede servir nada: 503 para que el orquestador saque la instancia.
      reply.code(db.postgres ? 200 : 503);
      return reply.send({
        status,
        database: {
          postgres: db.postgres,
          postgis: db.postgis,
          h3: db.h3,
          srid9377: db.srid9377,
          problems: db.problems,
        },
        cache: app.cache.kind,
        version: '0.1.0',
      });
    },
  );

  // Sonda de vida para orquestadores: responde sin tocar la base.
  app.get('/health/live', async () => ({ status: 'ok' }));
}
