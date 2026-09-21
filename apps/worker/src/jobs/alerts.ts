import { getLogger } from '@terracolombia/shared';
import {
  changeSummary,
  getPrisma,
  listChangesInArea,
  listCutDates,
  listDatasets,
  parcelHistory,
  query,
} from '@terracolombia/db';
import { sql } from '@terracolombia/db/sql';
import { radiusToPolygon } from '@terracolombia/geo';
import type { JobContext } from '../queue.js';

const log = getLogger({ mod: 'job:alerts' });

/**
 * Evalúa las alertas activas. Se dispara cuando se publica un corte nuevo del catastro y,
 * además, en el cron diario para las alertas de frecuencia fija.
 *
 * Una alerta solo genera entrega si hay algo que contar: no se manda correo para decir
 * "no pasó nada".
 */
export async function runAlertsJob(_payload: unknown, ctx: JobContext): Promise<unknown> {
  const prisma = getPrisma();
  const alerts = await prisma.alert.findMany({ where: { isActive: true } });
  if (alerts.length === 0) return { evaluated: 0, triggered: 0 };

  const datasets = await listDatasets();
  const cadastreIds = datasets
    .filter((d) => d.target_table === 'core.parcel' || d.id.includes('cadastre'))
    .map((d) => d.id);
  const cuts = await listCutDates(cadastreIds);
  const dates = [...new Set(cuts.map((c) => c.cut_date))].sort().reverse();

  if (dates.length < 2) {
    log.info({ cuts: dates.length }, 'Menos de dos cortes: no hay nada que comparar todavía');
    return { evaluated: alerts.length, triggered: 0, reason: 'Se necesitan dos cortes para comparar' };
  }

  const toCut = dates[0]!;
  const fromCut = dates[1]!;
  let triggered = 0;

  for (const [i, alert] of alerts.entries()) {
    await ctx.progress(
      Math.round(((i + 1) / alerts.length) * 100),
      `Revisando alerta "${alert.name}"`,
    );

    try {
      const scope = alert.scope as {
        muniCode?: string;
        npn?: string;
        geometry?: unknown;
        center?: [number, number];
        radiusM?: number;
      };

      let payload: Record<string, unknown> | null = null;

      if (alert.kind === 'parcel_changed' && scope.npn) {
        const history = await parcelHistory(scope.npn);
        const recent = (history as Array<Record<string, unknown>>).filter(
          (h) => String(h.to_cut_date ?? '') === toCut,
        );
        if (recent.length > 0) {
          payload = {
            npn: scope.npn,
            cutDate: toCut,
            changes: recent,
            summary: `El predio ${scope.npn} registra ${recent.length} cambio(s) en el corte ${toCut}.`,
          };
        }
      } else {
        // Alertas de área: municipio, polígono o radio.
        let geometry: unknown | null = null;
        if (scope.geometry) {
          geometry = scope.geometry;
        } else if (scope.center && scope.radiusM) {
          geometry = radiusToPolygon(scope.center, scope.radiusM);
        } else if (scope.muniCode) {
          const rows = await query<{ geojson: string | null }>(sql`
            SELECT ST_AsGeoJSON(geom) AS geojson FROM core.municipality WHERE code = ${scope.muniCode}
          `);
          geometry = rows[0]?.geojson ? JSON.parse(rows[0].geojson) : null;
        }

        if (!geometry) {
          log.warn({ alertId: alert.id }, 'La alerta no tiene un ámbito resoluble: se omite');
        } else {
          const summary = await changeSummary(geometry, fromCut, toCut);
          const relevant = relevantCount(alert.kind, summary);
          if (relevant > 0) {
            const changes = await listChangesInArea(
              geometry,
              fromCut,
              toCut,
              changeTypesFor(alert.kind),
              50,
            );
            payload = {
              fromCutDate: fromCut,
              toCutDate: toCut,
              summary,
              changes,
              headline: headlineFor(alert.kind, relevant, toCut),
            };
          }
        }
      }

      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastCheckedAt: new Date() },
      });

      if (payload) {
        triggered++;
        for (const channel of alert.channels) {
          await prisma.alertDelivery.create({
            data: { alertId: alert.id, channel, payload: payload as never, status: 'pending' },
          });
        }
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastTriggeredAt: new Date() },
        });
      }
    } catch (err) {
      log.error(
        { alertId: alert.id, err: err instanceof Error ? err.message : String(err) },
        'Error evaluando una alerta',
      );
    }
  }

  log.info({ evaluated: alerts.length, triggered }, 'Alertas evaluadas');
  return { evaluated: alerts.length, triggered, fromCut, toCut };
}

function changeTypesFor(kind: string): string[] {
  switch (kind) {
    case 'new_parcels':
      return ['created'];
    case 'new_buildings':
      return ['building_added'];
    case 'area_change':
      return ['created', 'removed', 'geometry_changed', 'building_added'];
    default:
      return [];
  }
}

function relevantCount(
  kind: string,
  summary: {
    created: number;
    removed: number;
    attrs_changed: number;
    geometry_changed: number;
    building_added: number;
  } | null,
): number {
  if (!summary) return 0;
  switch (kind) {
    case 'new_parcels':
      return summary.created;
    case 'new_buildings':
      return summary.building_added;
    case 'area_change':
      return (
        summary.created + summary.removed + summary.geometry_changed + summary.building_added
      );
    default:
      return 0;
  }
}

function headlineFor(kind: string, count: number, cutDate: string): string {
  switch (kind) {
    case 'new_parcels':
      return `${count} predio(s) nuevo(s) en tu zona vigilada, corte ${cutDate}.`;
    case 'new_buildings':
      return `${count} construcción(es) nueva(s) en tu zona vigilada, corte ${cutDate}.`;
    case 'area_change':
      return `${count} cambio(s) catastral(es) en tu zona vigilada, corte ${cutDate}.`;
    default:
      return `${count} cambio(s) detectado(s) en el corte ${cutDate}.`;
  }
}
