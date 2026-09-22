import type { FastifyInstance } from 'fastify';
import { GLOSSARY_BY_ID, PLANS } from '@terracolombia/shared';
import type { PlanCode } from '@terracolombia/shared';
import { TILE_LAYERS, getLayer, listLayers, listCutDates, listDatasets, listLayerSources } from '@terracolombia/db';
import type { LayerSourceRow } from '@terracolombia/db';
import { envelope, plainEnvelope } from '../lib/envelope.js';

const PLAN_ORDER: PlanCode[] = ['free', 'per_report', 'pro', 'business', 'api', 'enterprise'];

function planAtLeast(userPlan: PlanCode, required: string): boolean {
  const ri = PLAN_ORDER.indexOf(required as PlanCode);
  if (ri === -1) return true;
  return PLAN_ORDER.indexOf(userPlan) >= ri;
}

export interface LayerSource {
  /** Primer dataset del grupo; `datasetIds` los trae todos. */
  datasetId: string;
  datasetIds: string[];
  source: string;
  name: string;
  license: string;
  attribution: string;
  /** Corte más reciente del grupo. */
  cutDate: string | null;
  /** Corte más antiguo del grupo (difiere del reciente cuando un departamento va rezagado). */
  cutDateMin: string | null;
}

/**
 * Fuentes de una capa a partir de la tabla que sirve en teselas. Se agrupan por
 * (fuente, licencia, atribución) para que 31 cortes departamentales del IGAC sean una
 * sola línea de atribución con dos fechas, y no 31.
 */
/**
 * Construcciones, manzanas y sectores vienen en los mismos GDB que los predios: los
 * datasets del catastro declaran `core.parcel` como destino y alimentan las cuatro tablas.
 */
const TABLE_ALIAS: Record<string, string> = {
  'core.building': 'core.parcel',
  'core.block': 'core.parcel',
  'core.sector': 'core.parcel',
};

function sourcesForLayer(layerId: string, rows: LayerSourceRow[]): LayerSource[] {
  const own = TILE_LAYERS[layerId]?.table;
  if (!own) return [];
  const table = TABLE_ALIAS[own] ?? own;
  const groups = new Map<string, LayerSource>();
  for (const r of rows) {
    if (!r.target_table.split('/').some((t) => t.trim().startsWith(table))) continue;
    // La atribución lleva la fecha de corte, así que no puede formar parte de la clave:
    // se agrupa por fuente y licencia y se conserva la atribución del corte más reciente.
    const key = `${r.source}|${r.license}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        datasetId: r.dataset_id,
        datasetIds: [r.dataset_id],
        source: r.source,
        name: r.name,
        license: r.license,
        attribution: r.attribution,
        cutDate: r.cut_date,
        cutDateMin: r.cut_date,
      });
      continue;
    }
    g.datasetIds.push(r.dataset_id);
    if (r.cut_date && (!g.cutDate || r.cut_date > g.cutDate)) {
      g.cutDate = r.cut_date;
      g.attribution = r.attribution;
      g.name = r.name;
    }
    if (r.cut_date && (!g.cutDateMin || r.cut_date < g.cutDateMin)) g.cutDateMin = r.cut_date;
  }
  return [...groups.values()];
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
      const [layers, sourceRows] = await Promise.all([listLayers(), listLayerSources()]);

      const data = {
        layers: layers.map((l) => {
          const sources = sourcesForLayer(l.id, sourceRows);
          const cutDate = sources.reduce<string | null>(
            (acc, s) => (s.cutDate && (!acc || s.cutDate > acc) ? s.cutDate : acc),
            null,
          );
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
            /** Compatibilidad: la primera fuente. `sources` trae todas, con su corte. */
            source: sources[0] ?? null,
            /**
             * Procedencia real de la capa (regla 4): los datasets con corte activo que
             * alimentan su tabla, agrupados por fuente. El catastro son 31 datasets (uno
             * por departamento) y aquí aparece como una sola fuente con el corte más
             * reciente y el más antiguo.
             */
            sources,
            /** Corte más reciente entre las fuentes de la capa; null si no hay nada cargado. */
            cutDate,
            tileUrl: `/api/v1/tiles/${l.id}/{z}/{x}/{y}.mvt`,
          };
        }),
      };
      // El sobre cita todos los datasets que hoy alimentan alguna capa.
      return envelope(data, [...new Set(sourceRows.map((r) => r.dataset_id))]);
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
