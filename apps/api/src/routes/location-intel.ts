import type { FastifyInstance } from 'fastify';
import { CREDIT_COST, LocationIntelSchema } from '@terracolombia/shared';
import { getCellsInGeometry, getCoverage, queryParcels } from '@terracolombia/db';
import { cellToPolygon } from '@terracolombia/geo';
import { envelope, plainEnvelope, presentDatasets, recordUsage } from '../lib/envelope.js';
import { resolveAreaScope } from '@terracolombia/db';
import { listTemplates, scoreCells, topZones } from '../services/scoring.js';
import { cellRowToInputs } from '../services/cell-inputs.js';

export default async function locationIntelRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/location-intel/templates',
    {
      schema: {
        tags: ['inteligencia'],
        summary: 'Plantillas de localización de negocio',
        description:
          'Cada plantilla trae los indicadores que combina, sus pesos por defecto, sus filtros ' +
          'duros y la resolución H3 recomendada. Los pesos son editables: el usuario fija sus ' +
          'criterios y el mapa de calor se recalcula.',
      },
    },
    async () => {
      const templates = await listTemplates();
      return plainEnvelope({
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          audience: t.audience,
          recommendedResolution: t.recommendedResolution,
          indicators: t.indicators,
          hardFilters: t.hardFilters.map((f) => ({
            id: f.id,
            label: f.label,
            description: f.description,
            indicators: f.indicators,
          })),
        })),
        note:
          'Las plantillas son un punto de partida, no una recomendación cerrada. Ajusta los pesos a ' +
          'tu negocio y revisa siempre el desglose por factor de cada zona.',
      });
    },
  );

  app.post(
    '/location-intel',
    {
      preHandler: [app.requireEntitlement('canUseLocationIntel')],
      schema: {
        tags: ['inteligencia'],
        summary: 'Mapa de oportunidad por celdas hexagonales',
        description:
          'Puntúa las celdas H3 del ámbito según la plantilla y los pesos indicados, y devuelve las ' +
          'mejores zonas con su desglose por factor. Cada celda incluye su geometría para pintar el ' +
          'mapa de calor, y las celdas descartadas dicen qué filtro las excluyó.',
        body: {
          type: 'object',
          required: ['templateId', 'scope'],
          properties: {
            templateId: { type: 'string' },
            scope: { type: 'object' },
            resolution: { type: 'integer', enum: [7, 8, 9] },
            weights: { type: 'object', additionalProperties: { type: 'number' } },
            thresholds: { type: 'object' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const parsed = LocationIntelSchema.parse(req.body);
      const resolved = await resolveAreaScope(
        parsed.scope,
        req.auth.entitlements.maxAnalysisAreaKm2,
      );

      if (req.auth.organizationId) {
        await app.quota.charge(
          req.auth.organizationId,
          'location_intel',
          `intel:${req.auth.organizationId}:${parsed.templateId}:${Math.round(resolved.areaKm2 * 1000)}:${parsed.resolution}`,
        );
      }

      const cellRows = await getCellsInGeometry(resolved.geometry, parsed.resolution, parsed.limit);
      const warnings = [...resolved.warnings];

      if (cellRows.length === 0) {
        warnings.push(
          'No hay celdas de análisis calculadas para esta zona. Los agregados por celda se generan en el ' +
            'paso de agregación del ETL, después de cargar catastro y contexto del municipio ' +
            '(`pnpm etl -- aggregate <muniCode>`).',
        );
        const datasets = await presentDatasets(['cadastre', 'admin']);
        return envelope(
          {
            templateId: parsed.templateId,
            resolution: parsed.resolution,
            areaKm2: Number(resolved.areaKm2.toFixed(3)),
            cellsEvaluated: 0,
            cellsExcluded: 0,
            cells: [],
            topZones: [],
            weightsApplied: null,
            explanation: null,
            emptyReason:
              'No hay celdas de análisis para esta zona todavía. Hay que calcular los agregados por celda.',
          },
          datasets,
          { coverage: resolved.muniCode ? await getCoverage(resolved.muniCode) : null, warnings },
        );
      }

      const result = await scoreCells(
        cellRows.map((row) => ({
          h3: row.h3,
          muniCode: row.muni_code,
          inputs: cellRowToInputs(row, parsed.resolution),
        })),
        parsed.templateId,
        parsed.weights,
        parsed.thresholds,
        parsed.limit,
      );

      const zones = await topZones(result.cells, 10);
      const coverage = resolved.muniCode ? await getCoverage(resolved.muniCode) : null;
      const datasets = await presentDatasets([
        'cadastre',
        'population',
        'education',
        'health',
        'osm',
        'relief',
        'hazards',
        'protected',
        'admin',
      ]);

      recordUsage(req, 'location_intel', started, {
        credits: CREDIT_COST.location_intel,
        units: result.evaluatedCount,
        detail: { templateId: parsed.templateId, resolution: parsed.resolution },
      });

      return envelope(
        {
          templateId: result.templateId,
          templateName: result.templateName,
          resolution: result.resolution ?? parsed.resolution,
          areaKm2: Number(resolved.areaKm2.toFixed(3)),
          cellsEvaluated: result.evaluatedCount,
          cellsExcluded: result.excludedCount,
          /** Celdas con su geometría, listas para pintar el mapa de calor. */
          cells: result.cells.map((c) => ({
            h3: c.h3,
            score: c.score,
            confidence: c.confidence,
            rank: c.rank,
            center: c.center,
            geometry: cellToPolygon(c.h3),
            excluded: c.excluded,
            /** Qué filtro descartó la celda, si se descartó. */
            exclusions: c.exclusions,
            missing: c.missing,
            /** Desglose completo por factor: el motor nunca entrega solo el puntaje. */
            factors: c.factors,
          })),
          topZones: zones,
          weightsApplied: result.weights,
          explanation: result.explanation,
          disclaimer: result.disclaimer,
          note:
            'El puntaje compara celdas entre sí dentro del ámbito consultado. No es una recomendación: ' +
            'revisa el desglose por factor y ajusta los pesos a tu caso.',
        },
        [...new Set([...datasets, ...result.sourceDatasetIds])],
        { coverage, warnings: [...warnings, ...result.warnings] },
      );
    },
  );

  // Predios candidatos dentro de una celda o zona: el paso siguiente natural del flujo.
  app.post(
    '/location-intel/candidates',
    {
      preHandler: [app.requireEntitlement('canUseLocationIntel')],
      schema: {
        tags: ['inteligencia'],
        summary: 'Predios candidatos dentro de una zona puntuada',
        description:
          'Dada una celda o un conjunto de celdas, lista los predios que cumplen los requisitos de ' +
          'área y uso para el negocio elegido.',
        body: {
          type: 'object',
          required: ['h3', 'municipality'],
          properties: {
            h3: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
            municipality: { type: 'string', minLength: 5, maxLength: 5 },
            minAreaM2: { type: 'number' },
            maxAreaM2: { type: 'number' },
            economicUse: { type: 'array', items: { type: 'string' } },
            withoutBuilding: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const body = req.body as {
        h3: string[];
        municipality: string;
        minAreaM2?: number;
        maxAreaM2?: number;
        economicUse?: string[];
        withoutBuilding?: boolean;
        limit?: number;
      };

      // Las celdas se convierten a un multipolígono y se consulta con el DSL normal.
      const polygons = body.h3.map((h) => cellToPolygon(h));
      const multi = {
        type: 'MultiPolygon' as const,
        coordinates: polygons.map((p) =>
          p.type === 'Polygon' ? (p.coordinates as number[][][]) : [],
        ),
      };

      const result = await queryParcels(
        {
          scope: { municipality: body.municipality },
          where: {
            ...(body.minAreaM2 !== undefined || body.maxAreaM2 !== undefined
              ? {
                  area_m2: {
                    ...(body.minAreaM2 !== undefined ? { gte: body.minAreaM2 } : {}),
                    ...(body.maxAreaM2 !== undefined ? { lte: body.maxAreaM2 } : {}),
                  },
                }
              : {}),
            ...(body.economicUse && body.economicUse.length > 0
              ? { economic_use: body.economicUse }
              : {}),
            ...(body.withoutBuilding !== undefined ? { has_building: !body.withoutBuilding } : {}),
          },
          near: [],
          within: multi,
          sort: 'area_m2:desc',
          limit: Math.min(body.limit ?? 100, req.auth.entitlements.maxQueryLimit),
          geometry: 'centroid',
        },
        { timeoutMs: 15_000 },
      );

      const coverage = await getCoverage(body.municipality);
      const datasets = await presentDatasets(['cadastre', 'admin']);

      recordUsage(req, 'location_intel_candidates', started, { units: result.rows.length });

      return envelope(
        {
          cells: body.h3,
          candidates: result.rows.map((r) => ({
            npn: r.npn,
            address: r.address,
            areaGeomM2: r.area_geom_m2,
            builtAreaM2: r.built_area_m2,
            economicUse: r.economic_use,
            centroid: r.lng !== null && r.lat !== null ? [r.lng, r.lat] : null,
          })),
          nextCursor: result.nextCursor,
          emptyReason:
            result.rows.length === 0
              ? 'No hay predios que cumplan esos requisitos dentro de las celdas seleccionadas. ' +
                'Prueba con un área mínima menor o amplía la selección de celdas.'
              : null,
        },
        datasets,
        { coverage },
      );
    },
  );
}
