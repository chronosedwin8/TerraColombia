import { getLogger } from '@terracolombia/shared';
import { KEYS, getObjectStore } from '@terracolombia/shared/storage';
import { getPrisma, getSourceRefs } from '@terracolombia/db';
import type { JobContext } from '../queue.js';
import { buildReport } from '../reports/build-data.js';
import { renderReportArtifacts } from '../reports/render.js';

const log = getLogger({ mod: 'job:report' });

export interface ReportJobPayload {
  reportId: string;
}

/**
 * Genera un informe.
 *
 * El informe es **inmutable**: antes de renderizar nada se congelan las fechas de corte de
 * cada dataset usado en `app.report.source_snapshots`, y esas son las que se citan en la
 * sección de fuentes y las que valida la página del código QR.
 */
export async function runReportJob(payload: ReportJobPayload, ctx: JobContext): Promise<unknown> {
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id: payload.reportId } });
  if (!report) {
    log.warn({ reportId: payload.reportId }, 'El informe ya no existe: se omite');
    return { skipped: true };
  }
  if (report.status === 'done') return { alreadyDone: true };

  const fail = async (message: string): Promise<never> => {
    await prisma.report.update({
      where: { id: report.id },
      data: { status: 'failed', errorMessage: message, progress: 0 },
    });
    throw new Error(message);
  };

  await prisma.report.update({
    where: { id: report.id },
    data: { status: 'running', progress: 5, errorMessage: null },
  });
  await ctx.progress(5, 'Reuniendo la información');

  const subject = report.subject as Record<string, unknown>;
  const formats = Array.isArray(subject.formats) ? (subject.formats as string[]) : ['pdf'];
  const publicUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
  const level = (['resumen', 'completo', 'tecnico'] as const).includes(
    report.level as 'resumen' | 'completo' | 'tecnico',
  )
    ? (report.level as 'resumen' | 'completo' | 'tecnico')
    : 'completo';

  // Primera pasada: se arma el informe con la procedencia vacía para saber qué datasets cita.
  let built;
  try {
    built = await buildReport(
      report.kind,
      level,
      subject,
      {
        reportId: report.id,
        verifyUrl: `${publicUrl}/api/v1/reports/verify/${report.verifyToken ?? report.id}`,
        issuedAt: new Date().toISOString(),
        titleOverride: report.title,
      },
      [],
    );
  } catch (err) {
    return fail(
      `No se pudo reunir la información del informe: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await ctx.progress(30, 'Congelando las fuentes');

  // Segunda pasada: con la procedencia resuelta, para que el bloque de fuentes sea el real.
  const sources = await getSourceRefs(built.datasetIds);
  const snapshotIds: Record<string, string> = {};
  const sourceSnapshots: Record<string, unknown> = {};
  for (const s of sources) {
    sourceSnapshots[s.datasetId] = {
      cutDate: s.cutDate,
      license: s.license,
      attribution: s.attribution,
      source: s.source,
      name: s.name,
      synthetic: s.synthetic,
    };
    if (s.cutDate) snapshotIds[s.datasetId] = s.cutDate;
  }

  try {
    built = await buildReport(
      report.kind,
      level,
      subject,
      {
        reportId: report.id,
        verifyUrl: `${publicUrl}/api/v1/reports/verify/${report.verifyToken ?? report.id}`,
        issuedAt: new Date().toISOString(),
        titleOverride: report.title,
      },
      sources,
    );
  } catch (err) {
    return fail(
      `No se pudo componer el informe con su procedencia: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  built.spec.verification.snapshotIds = snapshotIds;

  // Las secciones se guardan aparte para poder consultarlas sin abrir el PDF. Una sección
  // sin datos no desaparece: queda marcada `is_missing` con su motivo.
  await prisma.reportSection.deleteMany({ where: { reportId: report.id } });
  if (built.sections.length > 0) {
    await prisma.reportSection.createMany({
      data: built.sections.map((s, i) => ({
        reportId: report.id,
        ordinal: i + 1,
        key: s.key,
        title: s.title,
        payload: s.payload as never,
        isMissing: s.isMissing,
      })),
    });
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { progress: 45, sourceSnapshots: sourceSnapshots as never },
  });
  await ctx.progress(45, 'Componiendo el documento');

  const store = getObjectStore();
  const artifacts: Record<string, string> = {};

  try {
    const rendered = await renderReportArtifacts({
      spec: built.spec,
      formats,
      geometry: built.geometry,
      onProgress: async (pct, msg) => {
        const scaled = 45 + Math.round(pct * 0.5);
        await prisma.report.update({ where: { id: report.id }, data: { progress: scaled } });
        await ctx.progress(scaled, msg);
      },
    });

    for (const artifact of rendered) {
      const key = KEYS.report(report.id, artifact.format);
      await store.put(key, artifact.buffer);
      artifacts[artifact.format] = key;
    }
  } catch (err) {
    return fail(
      `No se pudo componer el documento: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await prisma.report.update({
    where: { id: report.id },
    data: {
      status: 'done',
      progress: 100,
      artifacts: artifacts as never,
      completedAt: new Date(),
    },
  });
  await ctx.progress(100, 'Informe listo');

  log.info({ reportId: report.id, formats: Object.keys(artifacts) }, 'Informe generado');
  return { reportId: report.id, artifacts: Object.keys(artifacts) };
}
