import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@terracolombia/shared';
import { getObjectStore } from '@terracolombia/shared/storage';
import { getPrisma } from '@terracolombia/db';

/**
 * Servidor de archivos para el almacén local (ADR-004). En producción con S3 este endpoint
 * no se usa: `signedUrl` devuelve una URL firmada del propio S3.
 *
 * Solo sirve claves que el usuario tenga derecho a ver: se comprueba contra `app.report`
 * y `app.job`, nunca se entrega una ruta arbitraria del disco.
 */
const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  geojson: 'application/geo+json',
  json: 'application/json',
  gpkg: 'application/geopackage+sqlite3',
  kml: 'application/vnd.google-earth.kml+xml',
  zip: 'application/zip',
  txt: 'text/plain; charset=utf-8',
};

export default async function fileRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.get(
    '/files/:key',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['informes'],
        summary: 'Descargar un archivo del almacén local',
        description:
          'Solo disponible cuando el despliegue usa almacenamiento en disco. Con S3, las descargas ' +
          'van por URL firmada.',
      },
    },
    async (req, reply) => {
      const { key } = z.object({ key: z.string().min(1).max(500) }).parse(req.params);
      const decoded = decodeURIComponent(key);

      // Autorización: la clave debe estar entre los artefactos de un informe o de un
      // trabajo terminado de la organización. `artifacts` es { formato: clave }.
      const allKeys = new Set<string>();
      const reports = await prisma.report.findMany({
        where: { organizationId: req.auth.organizationId ?? '' },
        select: { artifacts: true },
      });
      for (const r of reports) {
        if (r.artifacts && typeof r.artifacts === 'object') {
          for (const v of Object.values(r.artifacts as Record<string, unknown>)) {
            if (typeof v === 'string') allKeys.add(v);
          }
        }
      }
      const jobs = await prisma.job.findMany({
        where: { organizationId: req.auth.organizationId ?? '', status: 'done' },
        select: { result: true },
      });
      for (const j of jobs) {
        const result = j.result as { storageKey?: unknown; keys?: unknown } | null;
        if (result && typeof result.storageKey === 'string') allKeys.add(result.storageKey);
        if (result && Array.isArray(result.keys)) {
          for (const k of result.keys) if (typeof k === 'string') allKeys.add(k);
        }
      }

      if (!allKeys.has(decoded)) {
        throw AppError.notFound('No encontramos ese archivo entre tus descargas.');
      }

      const store = getObjectStore();
      if (!(await store.exists(decoded))) {
        throw AppError.notFound(
          'El archivo ya no está disponible. Vuelve a generar el informe o la exportación.',
        );
      }

      const ext = decoded.split('.').pop()?.toLowerCase() ?? '';
      const buf = await store.get(decoded);
      reply.header('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${decoded.split('/').pop() ?? 'archivo'}"`,
      );
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.send(buf);
    },
  );
}
