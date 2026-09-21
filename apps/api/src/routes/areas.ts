import type { FastifyInstance } from 'fastify';
import {
  AREA_ANALYSIS_SYNC_LIMIT_KM2,
  AreaAnalyzeSchema,
  CREDIT_COST,
  DISCLAIMERS,
} from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { envelope, presentDatasets, recordUsage } from '../lib/envelope.js';
import { resolveAreaScope } from '../services/area-scope.js';
import { analyzeArea } from '../services/area-analysis.js';

export default async function areaRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/areas/analyze',
    {
      preHandler: [app.requireEntitlement('canUseAreaAnalysis')],
      schema: {
        tags: ['zonas'],
        summary: 'Tablero de análisis de una zona',
        description:
          'Recibe un polígono, un radio, un municipio o una aproximación de isócrona y devuelve ' +
          'predios, población, equipamientos, suelos, amenazas, áreas protegidas, relieve y ' +
          'accesibilidad de esa zona. Las zonas grandes se procesan en segundo plano y devuelven ' +
          'un `jobId` que se sigue por `GET /jobs/:id`.',
        body: {
          type: 'object',
          required: ['scope'],
          properties: {
            scope: { type: 'object' },
            sections: { type: 'array', items: { type: 'string' } },
            cutDate: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const started = Date.now();
      const parsed = AreaAnalyzeSchema.parse(req.body);
      const resolved = await resolveAreaScope(
        parsed.scope,
        req.auth.entitlements.maxAnalysisAreaKm2,
      );

      // Zonas grandes: a la cola. El usuario recibe el identificador y sigue el progreso.
      if (resolved.areaKm2 > AREA_ANALYSIS_SYNC_LIMIT_KM2) {
        if (!req.auth.organizationId) {
          // Sin organización no hay a quién cobrarle ni dónde guardar el trabajo.
          return reply.status(402).send({
            error: {
              code: 'QUOTA_EXCEEDED',
              message:
                `El área es de ${resolved.areaKm2.toFixed(1)} km². Por encima de ${AREA_ANALYSIS_SYNC_LIMIT_KM2} km² ` +
                'el análisis se procesa en segundo plano y para eso necesitas una cuenta. Inicia sesión o reduce el área.',
              details: { areaKm2: resolved.areaKm2 },
            },
          });
        }

        const prisma = getPrisma();
        const job = await prisma.job.create({
          data: {
            organizationId: req.auth.organizationId,
            userId: req.auth.userId,
            kind: 'area_analyze',
            status: 'queued',
            progressMessage: 'En cola',
            input: {
              scope: parsed.scope,
              sections: parsed.sections,
              cutDate: parsed.cutDate ?? null,
              areaKm2: resolved.areaKm2,
            } as never,
          },
        });

        await app.quota.charge(
          req.auth.organizationId,
          'area_analysis_large',
          `area:${job.id}`,
          job.id,
        );

        recordUsage(req, 'area_analyze_queued', started, {
          credits: CREDIT_COST.area_analysis_large,
          units: resolved.areaKm2,
        });

        return reply.status(202).send({
          data: {
            jobId: job.id,
            status: 'queued',
            areaKm2: Number(resolved.areaKm2.toFixed(3)),
            message:
              `El área de ${resolved.areaKm2.toFixed(1)} km² se procesa en segundo plano. ` +
              'Sigue el avance en /api/v1/jobs/' + job.id + ' o por el flujo de eventos /stream.',
            creditsCharged: CREDIT_COST.area_analysis_large,
          },
          meta: { sources: [], cutDate: null, synthetic: false, generatedAt: new Date().toISOString(), warnings: resolved.warnings },
        });
      }

      const result = await analyzeArea(resolved, parsed.sections, parsed.cutDate);

      const datasets = await presentDatasets([
        'cadastre',
        'admin',
        'population',
        'education',
        'health',
        'osm',
        'soils',
        'hazards',
        'protected',
        'ethnic',
        'pot',
        'relief',
      ]);

      recordUsage(req, 'area_analyze', started, {
        units: resolved.areaKm2,
        detail: { muniCode: resolved.muniCode, areaKm2: resolved.areaKm2 },
      });

      return envelope(result, datasets, {
        coverage: result.coverage,
        warnings: [...resolved.warnings, ...result.warnings, DISCLAIMERS.hazardScale],
      });
    },
  );

  // Comparación de hasta 4 zonas lado a lado (pantalla 4 del frontend).
  app.post(
    '/areas/compare',
    {
      preHandler: [app.requireEntitlement('canUseAreaAnalysis')],
      schema: {
        tags: ['zonas'],
        summary: 'Comparar hasta 4 zonas',
        body: {
          type: 'object',
          required: ['areas'],
          properties: {
            areas: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: { type: 'object' },
            },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const body = req.body as { areas: Array<{ name?: string; scope: unknown }> };
      if (!Array.isArray(body.areas) || body.areas.length < 2 || body.areas.length > 4) {
        return envelope(
          { comparisons: [] },
          [],
          { warnings: ['Envía entre 2 y 4 zonas para comparar.'] },
        );
      }

      const perAreaLimit = req.auth.entitlements.maxAnalysisAreaKm2 / body.areas.length;
      const comparisons = [];
      const allWarnings: string[] = [];

      for (const [i, area] of body.areas.entries()) {
        const parsed = AreaAnalyzeSchema.parse({ scope: area.scope, sections: [] });
        const resolved = await resolveAreaScope(parsed.scope, perAreaLimit);
        const result = await analyzeArea(resolved, [], undefined);
        comparisons.push({
          ...result,
          name: area.name ?? `Zona ${i + 1}`,
          areaKm2: Number(resolved.areaKm2.toFixed(3)),
          label: resolved.label,
        });
        allWarnings.push(...resolved.warnings, ...result.warnings);
      }

      const datasets = await presentDatasets([
        'cadastre',
        'admin',
        'population',
        'education',
        'health',
        'osm',
        'soils',
        'hazards',
        'protected',
      ]);

      recordUsage(req, 'area_compare', started, { units: body.areas.length });

      return envelope({ comparisons }, datasets, {
        warnings: [
          ...new Set(allWarnings),
          `Al comparar ${body.areas.length} zonas, el área máxima por zona de tu plan se reparte: ${perAreaLimit.toFixed(1)} km² cada una.`,
        ],
      });
    },
  );
}
