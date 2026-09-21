import { createServer } from 'node:http';
import { getLogger, setLogger } from '@terracolombia/shared';
import { closePool, disconnectPrisma, getPrisma, healthCheck } from '@terracolombia/db';
import { loadEnvFile } from './env.js';
import { createQueue } from './queue.js';
import { runReportJob } from './jobs/report.js';
import { runAreaAnalysisJob } from './jobs/area-analysis.js';
import { runAlertsJob } from './jobs/alerts.js';
import { runEtlJob } from './jobs/etl.js';

loadEnvFile();

const log = getLogger({ mod: 'worker' });

/**
 * Worker de TerraColombia. Atiende las colas que indique `WORKER_QUEUES`, lo que permite
 * desplegar la misma imagen con roles distintos (por ejemplo, un proceso solo para informes,
 * que es el que necesita el navegador de Playwright).
 */
const ENABLED = new Set(
  (process.env.WORKER_QUEUES ?? 'etl,reports,analysis,alerts')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

async function main(): Promise<void> {
  const health = await healthCheck();
  if (!health.postgres) {
    console.error('No hay conexión a PostgreSQL. Revisa DATABASE_URL en .env.');
    for (const p of health.problems) console.error(`  · ${p}`);
    process.exit(1);
  }

  const queue = await createQueue();

  if (ENABLED.has('reports')) {
    queue.register('report', (payload: { reportId: string }, ctx) => runReportJob(payload, ctx));
  }
  if (ENABLED.has('analysis')) {
    queue.register('area_analyze', (payload: { jobId: string }, ctx) =>
      runAreaAnalysisJob(payload.jobId, ctx),
    );
  }
  if (ENABLED.has('alerts')) {
    queue.register('alerts', (payload: unknown, ctx) => runAlertsJob(payload, ctx));
  }
  if (ENABLED.has('etl')) {
    queue.register('etl', (payload: { datasetId: string; options?: Record<string, unknown> }, ctx) =>
      runEtlJob(payload, ctx),
    );
  }

  await queue.start();
  log.info({ queues: [...ENABLED], kind: queue.kind }, 'Worker iniciado');

  // Sondeo de la tabla `app.job`: la API crea filas ahí y el worker las recoge. Así el
  // usuario ve el estado aunque la cola sea la de memoria y se reinicie el proceso.
  const pollIntervalMs = Number(process.env.WORKER_POLL_MS ?? 5000);
  const prisma = getPrisma();
  let polling = true;

  const poll = async () => {
    if (!polling) return;
    try {
      const pending = await prisma.job.findMany({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
      for (const job of pending) {
        if (job.kind === 'report' && ENABLED.has('reports')) {
          const input = job.input as { reportId?: string };
          if (!input.reportId) continue;
          await prisma.job.update({ where: { id: job.id }, data: { status: 'running' } });
          await queue.add('report', { reportId: input.reportId }, { jobId: `report-${job.id}` });
          await prisma.job.update({
            where: { id: job.id },
            data: { status: 'done', finishedAt: new Date(), progress: 100, progressMessage: 'Encolado' },
          });
        } else if (job.kind === 'area_analyze' && ENABLED.has('analysis')) {
          await queue.add('area_analyze', { jobId: job.id }, { jobId: `area-${job.id}` });
        } else if (job.kind === 'etl' && ENABLED.has('etl')) {
          const input = job.input as { datasetId?: string; options?: Record<string, unknown> };
          if (!input.datasetId) continue;
          await queue.add(
            'etl',
            { datasetId: input.datasetId, options: input.options },
            { jobId: `etl-${job.id}` },
          );
          await prisma.job.update({ where: { id: job.id }, data: { status: 'running' } });
        }
      }
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Error sondeando trabajos pendientes',
      );
    }
  };

  const timer = setInterval(() => void poll(), pollIntervalMs);
  void poll();

  // Salud y métricas: el orquestador y Prometheus lo necesitan.
  const metricsPort = Number(process.env.WORKER_METRICS_PORT ?? 9100);
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      const h = await healthCheck();
      res.writeHead(h.postgres ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: h.postgres ? 'ok' : 'caido', queue: queue.kind, queues: [...ENABLED] }));
      return;
    }
    if (req.url === '/metrics') {
      const token = process.env.METRICS_TOKEN;
      if (token && req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end('no autorizado');
        return;
      }
      const lines = await buildMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      res.end(lines);
      return;
    }
    res.writeHead(404).end('no encontrado');
  });
  server.listen(metricsPort, () => {
    log.info({ port: metricsPort }, 'Worker: salud y métricas escuchando');
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Cerrando worker');
    polling = false;
    clearInterval(timer);
    server.close();
    await queue.close();
    await closePool();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/** Métricas en formato Prometheus, con los nombres que espera infra/prometheus. */
async function buildMetrics(): Promise<string> {
  const prisma = getPrisma();
  const lines: string[] = [];
  try {
    const byStatus = await prisma.job.groupBy({ by: ['status', 'kind'], _count: { _all: true } });
    lines.push('# HELP terracolombia_jobs_total Trabajos por estado y tipo');
    lines.push('# TYPE terracolombia_jobs_total gauge');
    for (const r of byStatus) {
      lines.push(
        `terracolombia_jobs_total{status="${r.status}",kind="${r.kind}"} ${r._count._all}`,
      );
    }

    const reports = await prisma.report.groupBy({ by: ['status'], _count: { _all: true } });
    lines.push('# HELP terracolombia_reports_total Informes por estado');
    lines.push('# TYPE terracolombia_reports_total gauge');
    for (const r of reports) {
      lines.push(`terracolombia_reports_total{status="${r.status}"} ${r._count._all}`);
    }
  } catch (err) {
    lines.push(`# error recolectando métricas: ${err instanceof Error ? err.message : String(err)}`);
  }
  return `${lines.join('\n')}\n`;
}

setLogger(getLogger({ app: 'worker' }));

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
