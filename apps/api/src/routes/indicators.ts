import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, MUNI_INDICATOR_BY_ID } from '@terracolombia/shared';
import {
  getCoverage,
  getIndicators,
  getMunicipality,
  getMuniSummary,
  rankingFor,
} from '@terracolombia/db';
import type { MuniIndicatorRow } from '@terracolombia/db';
import { envelope, presentDatasets } from '../lib/envelope.js';

/**
 * De filas crudas (indicador, periodo, valor) a lo que muestra el observatorio: una tarjeta
 * por indicador con su etiqueta, el valor más reciente, el puesto nacional y la serie
 * completa. Antes la ruta devolvía las filas tal cual y la interfaz, que esperaba esta
 * forma, fallaba al pintar cada uno de los 112 indicadores del municipio.
 */
function presentIndicators(rows: MuniIndicatorRow[]) {
  const byId = new Map<string, MuniIndicatorRow[]>();
  for (const r of rows) (byId.get(r.indicator) ?? byId.set(r.indicator, []).get(r.indicator)!).push(r);

  return [...byId.entries()].map(([key, series]) => {
    // Las filas llegan con el periodo más reciente primero.
    const latest = series[0]!;
    const def = MUNI_INDICATOR_BY_ID[key];
    const datasetIds = new Set<string>();
    for (const r of series) for (const id of Object.keys(r.source_snapshots ?? {})) datasetIds.add(id);
    return {
      key,
      label: def?.label ?? key,
      unit: def?.unit ?? latest.unit,
      latest: latest.value,
      latestPeriod: latest.period,
      rank:
        latest.national_rank !== null && latest.n_ranked > 0
          ? { position: latest.national_rank, of: latest.n_ranked }
          : null,
      nationalPct: latest.national_pct,
      series: [...series]
        .reverse()
        .map((r) => ({ period: r.period, value: r.value })),
      formula: def?.formula ?? 'Cómo se calcula: no documentado para este indicador.',
      higherIsBetter: def?.higherIsBetter ?? null,
      source: def?.source ?? null,
      sourceDatasetIds: [...datasetIds],
    };
  });
}

export default async function indicatorRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/indicators/:muniCode',
    {
      schema: {
        tags: ['municipios'],
        summary: 'Indicadores del observatorio municipal',
        params: {
          type: 'object',
          required: ['muniCode'],
          properties: { muniCode: { type: 'string', minLength: 5, maxLength: 5 } },
        },
        querystring: {
          type: 'object',
          properties: { period: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const { muniCode } = z.object({ muniCode: z.string().length(5) }).parse(req.params);
      const { period } = z.object({ period: z.string().max(7).optional() }).parse(req.query);

      const muni = await getMunicipality(muniCode);
      if (!muni) throw AppError.notFound(`No tenemos el municipio ${muniCode}.`);

      const [indicators, summary, coverage] = await Promise.all([
        getIndicators(muniCode, period),
        getMuniSummary(muniCode),
        getCoverage(muniCode),
      ]);

      const datasets = await presentDatasets(
        ['admin', 'cadastre', 'population', 'education', 'health'],
        { muniCode },
      );
      // Los indicadores citan su propio dataset en `source_snapshots`; si no entra en el
      // sobre, la interfaz no encuentra la procedencia y muestra «No disponible» junto a un
      // valor que sí existe (regla 4 aplicada al revés).
      for (const row of indicators) {
        for (const id of Object.keys(row.source_snapshots ?? {})) {
          if (!datasets.includes(id)) datasets.push(id);
        }
      }

      return envelope(
        {
          municipality: { code: muni.code, name: muni.name, deptName: muni.dept_name },
          summary,
          indicators: presentIndicators(indicators),
          emptyReason:
            indicators.length === 0
              ? 'Todavía no hemos calculado indicadores para este municipio. Se generan en el paso de agregación del ETL, ' +
                'después de cargar catastro y contexto.'
              : null,
        },
        datasets,
        { coverage },
      );
    },
  );

  app.get(
    '/indicators/:indicator/ranking',
    {
      schema: {
        tags: ['municipios'],
        summary: 'Ranking nacional de un indicador',
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            order: { type: 'string', enum: ['desc', 'asc'], default: 'desc' },
          },
        },
      },
    },
    async (req) => {
      const { indicator } = z.object({ indicator: z.string().max(80) }).parse(req.params);
      const { period, limit, order } = z
        .object({
          period: z.string().max(7).default(String(new Date().getUTCFullYear())),
          limit: z.coerce.number().int().min(1).max(100).default(20),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .parse(req.query);

      const rows = await rankingFor(indicator, period, limit, order === 'asc');
      const datasets = await presentDatasets(['admin', 'cadastre', 'population']);

      return envelope(
        {
          indicator,
          period,
          order,
          rows,
          emptyReason:
            rows.length === 0
              ? `No hay valores calculados del indicador "${indicator}" para el periodo ${period}.`
              : null,
        },
        datasets,
      );
    },
  );
}
