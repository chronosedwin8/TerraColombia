import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NEARBY_LAYER_IDS, nearby } from '@terracolombia/db';
import { envelope, presentDatasets, recordUsage } from '../lib/envelope.js';

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(50).max(20_000).default(1000),
  layers: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  limitPerLayer: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function nearbyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/nearby',
    {
      schema: {
        tags: ['zonas'],
        summary: 'Qué hay cerca de un punto',
        description:
          'Colegios, prestadores de salud, comercio, vías, áreas protegidas y amenazas dentro de un radio. ' +
          `Capas disponibles: ${NEARBY_LAYER_IDS.join(', ')}.`,
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
            radius: { type: 'integer', minimum: 50, maximum: 20000, default: 1000 },
            layers: { type: 'string', description: 'Lista separada por comas; vacío = todas' },
            limitPerLayer: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const { lat, lng, radius, layers, limitPerLayer } = QuerySchema.parse(req.query);

      const unknown = layers.filter((l) => !NEARBY_LAYER_IDS.includes(l));
      const rows = await nearby(lng, lat, radius, layers, limitPerLayer);

      const datasets = await presentDatasets(['education', 'health', 'osm', 'protected', 'hazards']);
      recordUsage(req, 'nearby', started, { units: rows.length });

      const byLayer: Record<string, typeof rows> = {};
      for (const r of rows) {
        (byLayer[r.layer] ??= []).push(r);
      }

      return envelope(
        {
          point: { lng, lat },
          radiusM: radius,
          total: rows.length,
          byLayer,
          items: rows,
          availableLayers: NEARBY_LAYER_IDS,
          emptyReason:
            rows.length === 0
              ? 'No hay nada de las capas consultadas dentro de ese radio, o esas capas aún no están cargadas para esta zona.'
              : null,
        },
        datasets,
        {
          warnings: unknown.length > 0 ? [`Capas no reconocidas y omitidas: ${unknown.join(', ')}.`] : [],
        },
      );
    },
  );
}
