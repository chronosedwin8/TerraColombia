import { getLogger } from '@terracolombia/shared';
import {
  facilitiesIn,
  getCoverage,
  hazardOverlaps,
  parcelStatsIn,
  populationIn,
  protectedAreaOverlaps,
  reliefFor,
  soilOverlaps,
} from '@terracolombia/db';
import { approxAreaKm2, radiusToPolygon } from '@terracolombia/geo';
import { getPrisma } from '@terracolombia/db';
import type { JobContext } from '../queue.js';

const log = getLogger({ mod: 'job:area' });

export interface AreaJobPayload {
  scope: { kind: string; geometry?: unknown; center?: [number, number]; radiusM?: number; muniCode?: string };
  sections?: string[];
  cutDate?: string | null;
  areaKm2?: number;
}

/**
 * Análisis de zonas grandes en segundo plano. El usuario ve el avance por SSE; cada bloque
 * que no tiene datos se declara en `missingSections` en vez de aparecer como cero.
 */
export async function runAreaAnalysisJob(jobId: string, ctx: JobContext): Promise<unknown> {
  const prisma = getPrisma();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { skipped: true };
  if (job.status === 'done') return job.result;

  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date(), progress: 5, progressMessage: 'Preparando el área' },
  });

  const payload = job.input as unknown as AreaJobPayload;
  let geometry: unknown;
  if (payload.scope?.kind === 'polygon' && payload.scope.geometry) {
    geometry = payload.scope.geometry;
  } else if (payload.scope?.kind === 'radius' && payload.scope.center && payload.scope.radiusM) {
    geometry = radiusToPolygon(payload.scope.center, payload.scope.radiusM);
  } else {
    const message =
      'El trabajo no trae un ámbito utilizable. Se esperaba un polígono o un centro con radio.';
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
    throw new Error(message);
  }

  const areaKm2 = payload.areaKm2 ?? approxAreaKm2(geometry as never);
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['Contando predios', () => parcelStatsIn(geometry as never, payload.cutDate ?? undefined)],
    ['Estimando población', () => populationIn(geometry as never)],
    ['Contando equipamientos', () => facilitiesIn(geometry as never)],
    ['Cruzando suelos', () => soilOverlaps(geometry as never)],
    ['Cruzando amenazas', () => hazardOverlaps(geometry as never)],
    ['Cruzando áreas protegidas', () => protectedAreaOverlaps(geometry as never)],
    ['Calculando relieve', () => reliefFor(geometry as never)],
  ];

  const results: Record<string, unknown> = {};
  const keys = ['parcels', 'population', 'facilities', 'soils', 'hazards', 'protectedAreas', 'relief'];

  for (const [i, [label, run]] of steps.entries()) {
    const pct = 10 + Math.round(((i + 1) / steps.length) * 80);
    await prisma.job.update({
      where: { id: jobId },
      data: { progress: pct, progressMessage: label },
    });
    await ctx.progress(pct, label);
    try {
      results[keys[i]!] = await run();
    } catch (err) {
      // Un bloque que falla no tumba el análisis completo: se declara y se sigue.
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ step: keys[i], err: message }, 'Bloque del análisis fallido');
      results[keys[i]!] = { error: message };
    }
  }

  const coverage = payload.scope.muniCode ? await getCoverage(payload.scope.muniCode) : null;

  const missingSections: Array<{ section: string; reason: string }> = [];
  const parcels = results.parcels as { n_parcels?: number } | null;
  if ((parcels?.n_parcels ?? 0) === 0) {
    missingSections.push({
      section: 'parcels',
      reason:
        coverage?.status === 'none' && coverage.message
          ? coverage.message
          : 'No hay predios cargados dentro de esta zona en el corte activo.',
    });
  }
  const population = results.population as { n_blocks?: number } | null;
  if ((population?.n_blocks ?? 0) === 0) {
    missingSections.push({
      section: 'population',
      reason: 'No hay manzanas censales del DANE cargadas para esta zona.',
    });
  }
  if (Array.isArray(results.hazards) && results.hazards.length === 0) {
    missingSections.push({
      section: 'hazards',
      reason:
        'No hay capas de amenaza cargadas que cubran esta zona. Que no aparezcan no significa que no existan.',
    });
  }

  const result = {
    areaKm2: Number(areaKm2.toFixed(4)),
    areaHa: Number((areaKm2 * 100).toFixed(2)),
    coverage,
    ...results,
    missingSections,
    computedAt: new Date().toISOString(),
  };

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'done',
      progress: 100,
      progressMessage: 'Análisis listo',
      result: result as never,
      finishedAt: new Date(),
    },
  });
  await ctx.progress(100, 'Análisis listo');

  return result;
}
