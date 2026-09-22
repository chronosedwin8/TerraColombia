import type { FastifyInstance } from 'fastify';
import { ChangeCompareSchema, CREDIT_COST } from '@terracolombia/shared';
import { changeSummary, listChangesInArea, listCutDates, listDatasets } from '@terracolombia/db';
import { envelope, presentDatasets, recordUsage } from '../lib/envelope.js';
import { resolveAreaScope } from '@terracolombia/db';

const CHANGE_TYPE_LABEL: Record<string, string> = {
  created: 'Predios nuevos',
  removed: 'Predios que desaparecieron',
  attrs_changed: 'Cambios en los datos del predio',
  geometry_changed: 'Cambios en la forma o el tamaño del predio',
  building_added: 'Construcciones nuevas',
  building_removed: 'Construcciones que desaparecieron',
};

const CHANGE_TYPE_EXPLANATION: Record<string, string> = {
  created:
    'Apareció un código predial que no estaba en el corte anterior. Suele ser un desenglobe (un predio partido en varios), una urbanización nueva o una actualización catastral.',
  removed:
    'Un código predial dejó de aparecer. Suele ser un englobe (varios predios unidos en uno) o una corrección catastral.',
  attrs_changed:
    'El predio sigue existiendo pero cambió alguno de sus datos: área reportada, área construida, destino económico, avalúo catastral o dirección.',
  geometry_changed:
    'El polígono del predio cambió lo suficiente para no considerarse el mismo (menos del 98 % de coincidencia). Puede ser una corrección de linderos o una modificación real.',
  building_added:
    'Apareció una construcción que no estaba registrada en el corte anterior.',
  building_removed: 'Dejó de aparecer una construcción registrada antes.',
};

export default async function changeRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/changes/compare',
    {
      preHandler: [app.requireEntitlement('canUseChangeDetection')],
      schema: {
        tags: ['cambio'],
        summary: 'Comparar dos cortes en un área',
        description:
          'Lista los cambios catastrales entre dos fechas de corte dentro de la zona indicada: ' +
          'predios nuevos, bajas, englobes y desenglobes, cambios de geometría y construcciones nuevas. ' +
          'Cada tipo de cambio viene con una explicación en lenguaje claro.',
        body: {
          type: 'object',
          required: ['scope', 'fromCutDate', 'toCutDate'],
          properties: {
            scope: { type: 'object' },
            fromCutDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            toCutDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            changeTypes: { type: 'array', items: { type: 'string' } },
            limit: { type: 'integer' },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const parsed = ChangeCompareSchema.parse(req.body);
      const resolved = await resolveAreaScope(
        parsed.scope,
        req.auth.entitlements.maxAnalysisAreaKm2,
      );

      if (req.auth.organizationId) {
        await app.quota.charge(
          req.auth.organizationId,
          'change_compare',
          `change:${req.auth.organizationId}:${parsed.fromCutDate}:${parsed.toCutDate}:${Math.round(resolved.areaKm2 * 1000)}`,
          req.auth.role,
        );
      }

      const [changes, summary] = await Promise.all([
        listChangesInArea(
          resolved.geometry,
          parsed.fromCutDate,
          parsed.toCutDate,
          parsed.changeTypes,
          parsed.limit,
        ),
        changeSummary(resolved.geometry, parsed.fromCutDate, parsed.toCutDate),
      ]);

      const datasets = await presentDatasets(['cadastre']);
      const warnings = [...resolved.warnings];

      const totalChanges = Object.values(summary ?? {}).reduce(
        (a, b) => a + (typeof b === 'number' ? b : 0),
        0,
      );
      if (totalChanges === 0) {
        warnings.push(
          'No hay cambios registrados entre esos dos cortes en esta zona. Verifica que ambos cortes existan ' +
            '(GET /cuts) y que el proceso de comparación ya se haya ejecutado para ese par.',
        );
      }

      recordUsage(req, 'change_compare', started, {
        credits: CREDIT_COST.change_compare,
        units: changes.length,
      });

      return envelope(
        {
          fromCutDate: parsed.fromCutDate,
          toCutDate: parsed.toCutDate,
          areaKm2: Number(resolved.areaKm2.toFixed(3)),
          summary: Object.entries(summary ?? {}).map(([key, count]) => ({
            changeType: key,
            label: CHANGE_TYPE_LABEL[key] ?? key,
            explanation: CHANGE_TYPE_EXPLANATION[key] ?? null,
            count,
          })),
          changes: changes.map((c) => ({
            npn: c.npn,
            muniCode: c.muni_code,
            changeType: c.change_type,
            changeLabel: CHANGE_TYPE_LABEL[c.change_type] ?? c.change_type,
            detail: c.detail,
            geometryOverlap: c.geom_iou,
            detectedAt: c.detected_at,
          })),
          truncated: changes.length >= parsed.limit,
        },
        datasets,
        { warnings },
      );
    },
  );

  app.get(
    '/changes/available-cuts',
    {
      schema: {
        tags: ['cambio'],
        summary: 'Pares de cortes comparables',
        description: 'Cortes catastrales publicados, de más reciente a más antiguo.',
      },
    },
    async () => {
      const datasets = await listDatasets();
      const cadastreIds = datasets.filter((d) => d.target_table === 'core.parcel' || d.id.includes('cadastre')).map((d) => d.id);
      const cuts = await listCutDates(cadastreIds);
      const dates = [...new Set(cuts.map((c) => c.cut_date))].sort().reverse();
      return envelope(
        {
          cuts: dates,
          comparablePairs: dates.slice(0, -1).map((to, i) => ({ from: dates[i + 1]!, to })),
          emptyReason:
            dates.length < 2
              ? 'Necesitamos al menos dos cortes catastrales publicados para poder comparar. Por ahora solo hay ' +
                `${dates.length}.`
              : null,
        },
        cadastreIds,
      );
    },
  );
}
