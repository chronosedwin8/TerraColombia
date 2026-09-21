import { getLogger } from '@terracolombia/shared';
import {
  createSnapshot,
  finishRun,
  getActiveSnapshot,
  publishSnapshot,
  recordValidation,
  setSnapshotStatus,
  startRun,
  upsertDataset,
} from '@terracolombia/db';
import type { JobContext } from '../queue.js';

/**
 * Pipeline de un dataset (PLAN §8), idempotente y reanudable:
 *
 *   discover → download → stage → validate → transform → index → aggregate → tiles → publish → diff
 *
 * Cada paso se registra en `meta.etl_run` con su duración y sus filas de entrada y salida,
 * así que el panel de administración siempre puede decir en qué quedó una corrida.
 *
 * Reglas duras:
 *  - La publicación es atómica: hasta `publish`, el usuario sigue viendo el corte anterior.
 *  - Una validación con severidad `error` bloquea la publicación.
 *  - Ninguna columna de la lista negra de PII entra a la base.
 */

const log = getLogger({ mod: 'etl' });

export type StepName =
  | 'discover'
  | 'download'
  | 'stage'
  | 'validate'
  | 'transform'
  | 'index'
  | 'aggregate'
  | 'tiles'
  | 'publish'
  | 'diff';

export const STEP_ORDER: StepName[] = [
  'discover',
  'download',
  'stage',
  'validate',
  'transform',
  'index',
  'aggregate',
  'tiles',
  'publish',
  'diff',
];

const STEP_LABEL: Record<StepName, string> = {
  discover: 'Consultando la fuente',
  download: 'Descargando',
  stage: 'Cargando a tablas de entrada',
  validate: 'Validando',
  transform: 'Normalizando',
  index: 'Indexando',
  aggregate: 'Calculando agregados',
  tiles: 'Invalidando teselas',
  publish: 'Publicando el corte',
  diff: 'Comparando con el corte anterior',
};

export interface PipelineContext {
  datasetId: string;
  cutDate: string;
  snapshotId: number;
  /** Snapshot activo anterior, si existe. Se usa en `diff`. */
  previousSnapshotId: number | null;
  /** Estado que los pasos se pasan entre sí (rutas de archivos, conteos…). */
  state: Record<string, unknown>;
  job: JobContext;
  isSynthetic: boolean;
}

export interface ValidationFinding {
  checkName: string;
  severity: 'info' | 'warning' | 'error';
  passed: boolean;
  affectedRows?: number;
  message: string;
  sample?: unknown[];
}

export interface StepResult {
  rowsIn?: number;
  rowsOut?: number;
  message?: string;
  detail?: Record<string, unknown>;
  /** Solo el paso `validate` las produce. */
  findings?: ValidationFinding[];
  /** Si es true, los pasos siguientes se omiten sin marcar error. */
  skipRest?: boolean;
}

export type Step = (ctx: PipelineContext) => Promise<StepResult>;

export interface DatasetPipeline {
  datasetId: string;
  /** Declaración que se escribe en `meta.dataset` antes de correr. */
  declaration: Parameters<typeof upsertDataset>[0];
  /** Resuelve la fecha de corte a cargar. */
  resolveCutDate(): Promise<string>;
  steps: Partial<Record<StepName, Step>>;
  /** Si es true, el snapshot se marca como de demostración. */
  synthetic?: boolean;
}

export interface RunOptions {
  /** Fuerza una fecha de corte concreta. */
  cutDate?: string;
  /** Corre solo estos pasos. */
  only?: StepName[];
  /** Salta estos pasos. */
  skip?: StepName[];
  /** No publica, aunque todo salga bien. Útil para inspeccionar antes de exponer. */
  dryRun?: boolean;
}

export interface RunReport {
  datasetId: string;
  cutDate: string;
  snapshotId: number;
  published: boolean;
  steps: Array<{
    step: StepName;
    status: 'ok' | 'failed' | 'skipped';
    durationMs: number;
    rowsIn: number | null;
    rowsOut: number | null;
    message: string | null;
  }>;
  findings: ValidationFinding[];
  blockingErrors: number;
  warnings: number;
}

export async function runPipeline(
  pipeline: DatasetPipeline,
  job: JobContext,
  opts: RunOptions = {},
): Promise<RunReport> {
  await upsertDataset(pipeline.declaration);

  const cutDate = opts.cutDate ?? (await pipeline.resolveCutDate());
  const previous = await getActiveSnapshot(pipeline.datasetId);
  const snapshot = await createSnapshot({
    datasetId: pipeline.datasetId,
    cutDate,
    isSynthetic: pipeline.synthetic ?? false,
  });

  const ctx: PipelineContext = {
    datasetId: pipeline.datasetId,
    cutDate,
    snapshotId: snapshot.id,
    previousSnapshotId: previous && previous.id !== snapshot.id ? previous.id : null,
    state: {},
    job,
    isSynthetic: pipeline.synthetic ?? false,
  };

  const report: RunReport = {
    datasetId: pipeline.datasetId,
    cutDate,
    snapshotId: snapshot.id,
    published: false,
    steps: [],
    findings: [],
    blockingErrors: 0,
    warnings: 0,
  };

  const wanted = opts.only ?? STEP_ORDER;
  const skipped = new Set(opts.skip ?? []);
  let aborted = false;

  for (const [index, step] of STEP_ORDER.entries()) {
    if (!wanted.includes(step) || skipped.has(step)) continue;
    const impl = pipeline.steps[step];

    // `publish` siempre se ejecuta aunque el dataset no lo declare: es del pipeline, no del dataset.
    if (!impl && step !== 'publish') {
      report.steps.push({
        step,
        status: 'skipped',
        durationMs: 0,
        rowsIn: null,
        rowsOut: null,
        message: 'Este dataset no declara el paso',
      });
      continue;
    }

    if (aborted) {
      report.steps.push({
        step,
        status: 'skipped',
        durationMs: 0,
        rowsIn: null,
        rowsOut: null,
        message: 'Omitido por un fallo anterior',
      });
      continue;
    }

    const percent = Math.round(((index + 1) / STEP_ORDER.length) * 100);
    await job.progress(percent, STEP_LABEL[step]);

    const runId = await startRun(pipeline.datasetId, step, snapshot.id);
    const started = Date.now();

    try {
      let result: StepResult;

      if (step === 'publish') {
        result = await publishStep(ctx, report, opts.dryRun ?? false);
      } else {
        result = await impl!(ctx);
      }

      // Las validaciones se persisten para que el panel las muestre.
      if (result.findings) {
        for (const f of result.findings) {
          await recordValidation({
            snapshotId: snapshot.id,
            checkName: f.checkName,
            severity: f.severity,
            passed: f.passed,
            affectedRows: f.affectedRows,
            message: f.message,
            sample: f.sample,
          });
          report.findings.push(f);
          if (!f.passed && f.severity === 'error') report.blockingErrors++;
          if (!f.passed && f.severity === 'warning') report.warnings++;
        }
      }

      const durationMs = Date.now() - started;
      await finishRun(runId, 'ok', {
        rowsIn: result.rowsIn,
        rowsOut: result.rowsOut,
        message: result.message,
        detail: result.detail,
      });
      report.steps.push({
        step,
        status: 'ok',
        durationMs,
        rowsIn: result.rowsIn ?? null,
        rowsOut: result.rowsOut ?? null,
        message: result.message ?? null,
      });

      if (step === 'publish' && !opts.dryRun && report.blockingErrors === 0) {
        report.published = true;
      }

      if (result.skipRest) {
        aborted = true;
        log.info({ datasetId: pipeline.datasetId, step }, 'El paso pidió detener el resto');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - started;
      await finishRun(runId, 'failed', { message });
      await setSnapshotStatus(snapshot.id, 'failed', { errorMessage: message });
      report.steps.push({ step, status: 'failed', durationMs, rowsIn: null, rowsOut: null, message });
      log.error({ datasetId: pipeline.datasetId, step, err: message }, 'Paso del ETL fallido');
      aborted = true;
    }
  }

  if (!aborted && !report.published) {
    await setSnapshotStatus(snapshot.id, report.blockingErrors > 0 ? 'failed' : 'transformed');
  }

  return report;
}

/**
 * Publicación atómica. Delega en `meta.publish_snapshot`, que rechaza cortes con
 * validaciones de error y snapshots sintéticos que taparían datos reales.
 */
async function publishStep(
  ctx: PipelineContext,
  report: RunReport,
  dryRun: boolean,
): Promise<StepResult> {
  if (report.blockingErrors > 0) {
    return {
      message: `No se publica: hay ${report.blockingErrors} validaciones con severidad error. El usuario sigue viendo el corte anterior.`,
      detail: { blockingErrors: report.blockingErrors },
      skipRest: true,
    };
  }
  if (dryRun) {
    return { message: 'Corrida de prueba: el corte quedó cargado pero no publicado.' };
  }
  await publishSnapshot(ctx.snapshotId);
  return {
    message: `Corte ${ctx.cutDate} publicado como activo`,
    detail: { snapshotId: ctx.snapshotId, previousSnapshotId: ctx.previousSnapshotId },
  };
}

/** Formatea un informe de corrida para leerlo en la terminal. */
export function formatRunReport(report: RunReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Dataset : ${report.datasetId}`);
  lines.push(`Corte   : ${report.cutDate} (snapshot ${report.snapshotId})`);
  lines.push(`Estado  : ${report.published ? 'publicado' : 'NO publicado'}`);
  lines.push('');
  lines.push('Paso         Estado    Dur.(ms)  Entrada   Salida   Detalle');
  lines.push('───────────  ────────  ────────  ────────  ───────  ────────────────────────────');
  for (const s of report.steps) {
    lines.push(
      `${s.step.padEnd(11)}  ${s.status.padEnd(8)}  ${String(s.durationMs).padStart(8)}  ` +
        `${String(s.rowsIn ?? '-').padStart(8)}  ${String(s.rowsOut ?? '-').padStart(7)}  ${s.message ?? ''}`,
    );
  }
  if (report.findings.length > 0) {
    lines.push('');
    lines.push('Validaciones:');
    for (const f of report.findings) {
      const mark = f.passed ? 'ok   ' : f.severity === 'error' ? 'ERROR' : 'aviso';
      lines.push(`  ${mark}  ${f.checkName}: ${f.message}${f.affectedRows ? ` (${f.affectedRows} filas)` : ''}`);
    }
  }
  lines.push('');
  lines.push(
    `${report.blockingErrors} errores bloqueantes, ${report.warnings} avisos.`,
  );
  return lines.join('\n');
}
