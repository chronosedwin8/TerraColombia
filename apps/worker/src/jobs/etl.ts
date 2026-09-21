import { getLogger } from '@terracolombia/shared';
import { getPrisma, rebuildSearchIndex, refreshMuniSummary } from '@terracolombia/db';
import type { JobContext } from '../queue.js';
import { formatRunReport, runPipeline } from '../etl/pipeline.js';
import type { RunOptions, StepName } from '../etl/pipeline.js';
import { buildPipeline, loadEtlConfig } from '../etl/generic-pipeline.js';

const log = getLogger({ mod: 'job:etl' });

export interface EtlJobPayload {
  datasetId: string;
  options?: {
    cutDate?: string;
    only?: string[];
    skip?: string[];
    dryRun?: boolean;
  };
}

export async function runEtlJob(payload: EtlJobPayload, ctx: JobContext): Promise<unknown> {
  const config = await loadEtlConfig();
  const dataset = config.getDataset(payload.datasetId);
  const pipeline = buildPipeline(dataset, {
    isInspected: config.isInspected,
    isPiiColumn: config.isPiiColumn,
  });

  const opts: RunOptions = {
    cutDate: payload.options?.cutDate,
    only: payload.options?.only as StepName[] | undefined,
    skip: payload.options?.skip as StepName[] | undefined,
    dryRun: payload.options?.dryRun ?? false,
  };

  const report = await runPipeline(pipeline, ctx, opts);
  log.info({ datasetId: dataset.id, published: report.published }, formatRunReport(report));

  // Si se publicó algo nuevo, se refresca lo que depende del corte activo.
  if (report.published) {
    await ctx.progress(97, 'Reconstruyendo el índice de búsqueda');
    await rebuildSearchIndex();
    await refreshMuniSummary();

    // Un corte nuevo del catastro dispara la evaluación de alertas.
    if (dataset.targetTable === 'core.parcel') {
      const prisma = getPrisma();
      await prisma.job.create({
        data: { kind: 'alerts', status: 'queued', input: { reason: 'new_cut', datasetId: dataset.id } as never },
      });
    }
  }

  return {
    datasetId: dataset.id,
    cutDate: report.cutDate,
    published: report.published,
    blockingErrors: report.blockingErrors,
    warnings: report.warnings,
    steps: report.steps,
    findings: report.findings,
  };
}
