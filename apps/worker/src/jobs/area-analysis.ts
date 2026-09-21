import { AREA_ANALYSIS_HARD_LIMIT_KM2, getLogger } from '@terracolombia/shared';
import type { AreaScope } from '@terracolombia/shared';
import {
  facilitiesIn,
  getCoverage,
  hazardOverlaps,
  parcelStatsIn,
  populationIn,
  protectedAreaOverlaps,
  reliefFor,
  resolveAreaScope,
  soilOverlaps,
} from '@terracolombia/db';
import { approxAreaKm2 } from '@terracolombia/geo';
import { getPrisma } from '@terracolombia/db';
import type { JobContext } from '../queue.js';

const log = getLogger({ mod: 'job:area' });

export interface AreaJobPayload {
  /** El ámbito tal como lo validó el DSL en la API. Aquí se resuelve con el mismo código. */
  scope: AreaScope;
  sections?: string[];
  cutDate?: string | null;
  areaKm2?: number;
  /** Límite de área del plan con el que se encoló, para aplicar el mismo tope. */
  maxAnalysisAreaKm2?: number;
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

  /*
   * El ámbito se resuelve con el MISMO código que la vía síncrona (`resolveAreaScope`, en
   * `packages/db`). Antes el worker traía su propia versión reducida que solo entendía
   * `polygon` y `radius`, así que una petición con `kind: 'municipality'` se aceptaba con
   * 202 y el trabajo moría diciendo que el ámbito no era utilizable: analizar un municipio
   * completo funcionaba cuando el área era pequeña y fallaba cuando era grande, que es
   * justo cuando hay que encolarlo.
   */
  let geometry: unknown;
  let scopeWarnings: string[] = [];
  let scopeMuniCode: string | null = null;
  try {
    const resolved = await resolveAreaScope(
      payload.scope,
      payload.maxAnalysisAreaKm2 ?? AREA_ANALYSIS_HARD_LIMIT_KM2,
    );
    geometry = resolved.geometry;
    scopeWarnings = resolved.warnings;
    scopeMuniCode = resolved.muniCode;
  } catch (err) {
    // El mensaje de `AppError` ya está en español y explica qué falta (por ejemplo, que no
    // tenemos el límite del municipio). Se propaga tal cual en vez de uno genérico.
    const message = err instanceof Error ? err.message : 'No pudimos resolver el área analizada.';
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
    throw err;
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

  // El municipio lo deduce el resolutor incluso para un polígono o un radio, así que el
  // bloque de cobertura aparece también en esos ámbitos; antes solo salía si la petición
  // traía el código explícito.
  const coverage = scopeMuniCode ? await getCoverage(scopeMuniCode) : null;

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
    /*
     * Los avisos de cómo se resolvió el ámbito tienen que llegar al usuario: el principal es
     * que una isócrona es en realidad un círculo calculado con una velocidad media, no un
     * alcance por red vial. La vía síncrona ya los devolvía y la encolada los perdía, así que
     * el mismo análisis decía la verdad o se la callaba según su tamaño.
     */
    warnings: scopeWarnings,
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
