import type { FastifyInstance } from 'fastify';
import { GLOSSARY_BY_ID, PLANS } from '@terracolombia/shared';
import type { PlanCode } from '@terracolombia/shared';
import { getLayer, listLayers, listCutDates, listDatasets } from '@terracolombia/db';
import { plainEnvelope } from '../lib/envelope.js';

const PLAN_ORDER: PlanCode[] = ['free', 'per_report', 'pro', 'business', 'api', 'enterprise'];

function planAtLeast(userPlan: PlanCode, required: string): boolean {
  const ri = PLAN_ORDER.indexOf(required as PlanCode);
  if (ri === -1) return true;
  return PLAN_ORDER.indexOf(userPlan) >= ri;
}

export default async function layerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/layers',
    {
      schema: {
        tags: ['teselas'],
        summary: 'Catálogo de capas con leyenda y glosario',
        description:
          'Cada capa trae su leyenda, su rango de zoom, el plan mínimo para verla y los términos ' +
          'del glosario que la explican. La UI no inventa leyendas: las lee de aquí.',
      },
    },
    async (req) => {
      const [layers, datasets] = await Promise.all([listLayers(), listDatasets()]);
      const datasetById = new Map(datasets.map((d) => [d.id, d]));

      return plainEnvelope({
        layers: layers.map((l) => {
          const ds = l.dataset_id ? datasetById.get(l.dataset_id) : undefined;
          return {
            id: l.id,
            name: l.name,
            description: l.description,
            geometryType: l.geometry_type,
            minZoom: l.min_zoom,
            maxZoom: l.max_zoom,
            legend: l.legend,
            glossary: l.glossary_ids
              .map((g) => GLOSSARY_BY_ID[g])
              .filter((g): g is NonNullable<typeof g> => Boolean(g))
              .map((g) => ({ id: g.id, term: g.term, plain: g.plain })),
            minPlan: l.min_plan,
            minPlanName: PLANS[l.min_plan as PlanCode]?.name ?? l.min_plan,
            /** Si el plan del usuario no alcanza, la UI lo muestra bloqueado con motivo. */
            accessible: planAtLeast(req.auth.plan, l.min_plan),
            source: ds
              ? { datasetId: ds.id, source: ds.source, license: ds.license, attribution: ds.attribution }
              : null,
            tileUrl: `/api/v1/tiles/${l.id}/{z}/{x}/{y}.mvt`,
          };
        }),
      });
    },
  );

  app.get(
    '/layers/:id',
    { schema: { tags: ['teselas'], summary: 'Una capa del catálogo' } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const layer = await getLayer(id);
      if (!layer) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: `No existe la capa "${id}". Consulta GET /layers para ver las disponibles.`,
            details: {},
          },
        });
      }
      return plainEnvelope(layer);
    },
  );

  app.get(
    '/cuts',
    {
      schema: {
        tags: ['teselas'],
        summary: 'Fechas de corte disponibles',
        description: 'Alimenta el selector temporal del mapa.',
      },
    },
    async () => {
      const datasets = await listDatasets();
      const cuts = await listCutDates(datasets.map((d) => d.id));
      const byDataset: Record<string, string[]> = {};
      for (const c of cuts) {
        (byDataset[c.dataset_id] ??= []).push(c.cut_date);
      }
      return plainEnvelope({
        byDataset,
        all: [...new Set(cuts.map((c) => c.cut_date))].sort().reverse(),
      });
    },
  );

  app.get(
    '/datasets',
    {
      schema: {
        tags: ['teselas'],
        summary: 'Datasets cargados con su licencia y atribución',
        description:
          'Inventario de fuentes de este despliegue. Los datasets con ShareAlike (CC BY-SA, ODbL) ' +
          'van marcados: quien redistribuya un derivado debe respetar esa cláusula.',
      },
    },
    async () => {
      const datasets = await listDatasets();
      return plainEnvelope(
        datasets.map((d) => ({
          id: d.id,
          source: d.source,
          name: d.name,
          description: d.description,
          license: d.license,
          attribution: d.attribution,
          url: d.url,
          frequency: d.frequency,
          shareAlike: d.share_alike,
        })),
      );
    },
  );
}
