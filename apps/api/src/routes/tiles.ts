import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@terracolombia/shared';
import { getLayer, getTileLayer, h3ResForZoom, renderTile } from '@terracolombia/db';
import { isValidTileCoords } from '@terracolombia/geo';
import { cacheKey } from '../plugins/cache.js';
import { loadConfig } from '../config.js';

const ParamsSchema = z.object({
  layer: z.string().min(1).max(40),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

/** TTL de caché por capa: lo que cambia poco se cachea más. */
const TILE_TTL_SECONDS: Record<string, number> = {
  department: 86_400,
  municipality: 86_400,
  parcel: 3_600,
  building: 3_600,
  block: 21_600,
  sector: 21_600,
  h3: 1_800,
  school: 21_600,
  health_facility: 21_600,
  road: 43_200,
  protected_area: 86_400,
  hazard: 86_400,
  soil_unit: 86_400,
  pot_zone: 43_200,
};

export default async function tileRoutes(app: FastifyInstance): Promise<void> {
  const config = loadConfig();

  app.get(
    '/tiles/:layer/:z/:x/:y.mvt',
    {
      schema: {
        tags: ['teselas'],
        summary: 'Tesela vectorial (Mapbox Vector Tile)',
        description:
          'Teselas generadas desde PostGIS con ST_AsMVT y cacheadas. Los predios solo se sirven a ' +
          'partir del zoom 14; por debajo se usa la capa `h3` de agregados. Las columnas publicadas ' +
          'son una lista cerrada: ninguna tesela expone campos que pudieran contener datos personales.',
        params: {
          type: 'object',
          required: ['layer', 'z', 'x', 'y'],
          properties: {
            layer: { type: 'string' },
            z: { type: 'integer' },
            x: { type: 'integer' },
            y: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const { layer, z, x, y } = ParamsSchema.parse(req.params);

      const def = getTileLayer(layer);
      if (!def) {
        throw AppError.notFound(
          `No existe la capa de teselas "${layer}". Consulta GET /layers para ver las disponibles.`,
        );
      }
      if (!isValidTileCoords(z, x, y)) {
        throw new AppError('VALIDATION', `Coordenadas de tesela inválidas para el zoom ${z}.`, {
          z,
          x,
          y,
        });
      }

      // Control de plan: la capa puede exigir un plan superior.
      const meta = await getLayer(layer);
      if (meta && meta.min_plan !== 'free') {
        const needed = meta.min_plan;
        const order = ['free', 'per_report', 'pro', 'business', 'api', 'enterprise'];
        if (order.indexOf(req.auth.plan) < order.indexOf(needed)) {
          throw AppError.planRequired(`tiles:${layer}`, needed);
        }
      }

      // Cuota de teselas por día: freno anti-scraping.
      await app.quota.consume(req, 'tiles_per_day', req.auth.entitlements.tilesPerDay);

      const res = layer === 'h3' ? h3ResForZoom(z) : undefined;
      const key = cacheKey('tile', layer, z, x, y, res);

      const cached = await app.cache.get(key);
      if (cached) {
        reply.header('X-Cache', 'HIT');
        return sendTile(reply, cached, layer);
      }

      // Si hay Martin configurado, se delega manteniendo el control de acceso de arriba.
      if (config.martinUrl) {
        const upstream = `${config.martinUrl.replace(/\/$/, '')}/${layer}/${z}/${x}/${y}`;
        const res2 = await fetch(upstream);
        if (!res2.ok) {
          throw new AppError('UPSTREAM_UNAVAILABLE', 'El servidor de teselas no respondió.', {
            status: res2.status,
          });
        }
        const buf = Buffer.from(await res2.arrayBuffer());
        await app.cache.set(key, buf, TILE_TTL_SECONDS[layer] ?? 1800);
        reply.header('X-Cache', 'MISS');
        reply.header('X-Tile-Source', 'martin');
        return sendTile(reply, buf, layer);
      }

      const buf = await renderTile(layer, z, x, y, res !== undefined ? { res } : {});
      await app.cache.set(key, buf, TILE_TTL_SECONDS[layer] ?? 1800);
      reply.header('X-Cache', 'MISS');
      reply.header('X-Tile-Source', 'postgis');
      return sendTile(reply, buf, layer);
    },
  );

  // TileJSON para que MapLibre configure la fuente sin que el frontend repita constantes.
  app.get(
    '/tiles/:layer.json',
    { schema: { tags: ['teselas'], summary: 'TileJSON de una capa' } },
    async (req, reply) => {
      const { layer } = z.object({ layer: z.string().min(1).max(40) }).parse(req.params);
      const def = getTileLayer(layer);
      if (!def) throw AppError.notFound(`No existe la capa de teselas "${layer}".`);
      const meta = await getLayer(layer);
      reply.header('Cache-Control', 'public, max-age=3600');
      return {
        tilejson: '3.0.0',
        name: meta?.name ?? layer,
        description: meta?.description ?? '',
        scheme: 'xyz',
        tiles: [`${config.publicApiUrl}/api/v1/tiles/${layer}/{z}/{x}/{y}.mvt`],
        minzoom: def.minZoom,
        maxzoom: def.maxZoom,
        bounds: [-81.85, -4.3, -66.8, 13.6],
        center: [-74.07, 4.65, 11],
        attribution:
          'Fuente: IGAC (CC BY-SA 4.0), DANE, MEN, MinSalud, OpenStreetMap (ODbL). Ver /api/v1/datasets.',
        vector_layers: [
          {
            id: layer,
            fields: Object.fromEntries(def.columns.map((c) => [c, 'Ver /api/v1/layers'])),
            minzoom: def.minZoom,
            maxzoom: def.maxZoom,
          },
        ],
      };
    },
  );
}

function sendTile(reply: FastifyReply, buf: Buffer, layer: string): FastifyReply {
  reply.header('Content-Type', 'application/vnd.mapbox-vector-tile');
  reply.header('X-Tile-Layer', layer);
  reply.header(
    'X-TerraColombia-Attribution',
    'Fuente: IGAC, Base Catastral, CC BY-SA 4.0 · DANE · OpenStreetMap (ODbL)',
  );
  if (buf.length === 0) {
    // 204 es la respuesta correcta para una tesela vacía: el cliente no reintenta.
    reply.status(204);
    return reply.send();
  }
  return reply.send(buf);
}
