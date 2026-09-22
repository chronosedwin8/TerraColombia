import { AREA_ANALYSIS_HARD_LIMIT_KM2, DISCLAIMERS, getLogger } from '@terracolombia/shared';
import type { AreaScope } from '@terracolombia/shared';
import { analyzeArea, getPrisma, resolveAreaScope } from '@terracolombia/db';
import type { AreaSection } from '@terracolombia/db';
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
 * Análisis de zonas grandes en segundo plano.
 *
 * Calcula con `analyzeArea` de `packages/db`, LA MISMA función que usa la ruta síncrona.
 * Antes este archivo tenía su propia versión: llamaba a los mismos repositorios pero
 * devolvía sus filas crudas (`parcels.n_parcels`, `facilities.n_schools`) mientras la vía
 * síncrona devolvía la forma presentada (`parcels.total`, `facilities.schools`). La pantalla,
 * escrita contra la segunda, reventaba al pintar la primera («Cannot read properties of
 * undefined»), así que TODA zona de más de 5 km² —las que se encolan— terminaba el cálculo
 * y no mostraba nada. Además aquella versión ignoraba las secciones pedidas y se dejaba
 * fuera la frontera agrícola, los resguardos, el POT y el municipio.
 */
export async function runAreaAnalysisJob(jobId: string, ctx: JobContext): Promise<unknown> {
  const prisma = getPrisma();
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { skipped: true };
  if (job.status === 'done') return job.result;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'running',
      startedAt: new Date(),
      progress: 5,
      progressMessage: 'Preparando el área',
    },
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
  let resolved;
  try {
    resolved = await resolveAreaScope(
      payload.scope,
      payload.maxAnalysisAreaKm2 ?? AREA_ANALYSIS_HARD_LIMIT_KM2,
    );
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

  /*
   * El avance se escribe en la base y se emite por el canal del worker. Se descartan los
   * retrocesos porque los bloques terminan en paralelo y el orden no está garantizado.
   */
  let lastPct = 5;
  const pending: Array<Promise<unknown>> = [];
  const onProgress = (pct: number, label: string): void => {
    if (pct <= lastPct) return;
    lastPct = pct;
    pending.push(
      prisma.job
        .update({ where: { id: jobId }, data: { progress: pct, progressMessage: label } })
        .catch((err: unknown) => log.warn({ err }, 'No se pudo anotar el avance')),
    );
    pending.push(ctx.progress(pct, label).catch(() => undefined));
  };

  let analysis;
  try {
    analysis = await analyzeArea(
      resolved,
      (payload.sections ?? []) as AreaSection[],
      payload.cutDate ?? undefined,
      onProgress,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'El análisis de la zona falló.';
    log.error({ err: message, jobId }, 'Análisis de zona fallido');
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
    throw err;
  }
  await Promise.allSettled(pending);

  /*
   * Los avisos que la vía síncrona pone en `meta.warnings` del sobre tienen que viajar
   * DENTRO del resultado: el trabajo encolado no tiene sobre, y sin esto el mismo análisis
   * decía la verdad o se la callaba según su tamaño. El principal es que una isócrona es en
   * realidad un círculo calculado con una velocidad media, no un alcance por red vial.
   */
  const result = {
    ...analysis,
    warnings: [...new Set([...resolved.warnings, ...analysis.warnings, DISCLAIMERS.hazardScale])],
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
