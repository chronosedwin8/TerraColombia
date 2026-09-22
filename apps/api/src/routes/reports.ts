import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError, CREDIT_COST, MESSAGES } from '@terracolombia/shared';
import { getObjectStore } from '@terracolombia/shared/storage';
import type { CreditOperation } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { plainEnvelope } from '../lib/envelope.js';
import { loadConfig } from '../config.js';

const CreateSchema = z.object({
  kind: z.enum(['parcel', 'area', 'location_intel', 'change', 'municipality']),
  level: z.enum(['resumen', 'completo', 'tecnico']).default('completo'),
  /** Objeto del informe: npn, geometría, plantilla, municipio… Se valida por tipo. */
  subject: z.record(z.unknown()),
  title: z.string().max(200).optional(),
  projectId: z.string().uuid().optional(),
  formats: z
    .array(z.enum(['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml']))
    .min(1)
    .default(['pdf']),
});

const CREDIT_BY_LEVEL: Record<string, CreditOperation> = {
  resumen: 'report_summary',
  completo: 'report_full',
  tecnico: 'report_technical',
};

export default async function reportRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();
  const config = loadConfig();

  // ─── Verificación pública por QR ────────────────────────────────────────────
  // Sin sesión: es el punto del código QR impreso en el PDF.
  app.get(
    '/verify/:token',
    {
      schema: {
        tags: ['informes'],
        summary: 'Verificar la autenticidad de un informe',
        description:
          'Punto al que apunta el código QR del PDF. Confirma que el informe lo emitimos nosotros y ' +
          'con qué fechas de corte, sin revelar su contenido.',
      },
    },
    async (req) => {
      const { token } = z.object({ token: z.string().min(10).max(120) }).parse(req.params);
      const report = await prisma.report.findUnique({
        where: { verifyToken: token },
        select: {
          id: true,
          kind: true,
          level: true,
          title: true,
          status: true,
          completedAt: true,
          createdAt: true,
          sourceSnapshots: true,
        },
      });
      if (!report || report.status !== 'done') {
        throw AppError.notFound(
          'No encontramos un informe emitido con ese código. Verifica el código del QR.',
        );
      }
      return plainEnvelope({
        valid: true,
        reportId: report.id,
        kind: report.kind,
        level: report.level,
        title: report.title,
        issuedAt: report.completedAt ?? report.createdAt,
        // Las fechas de corte hacen verificable el contenido sin exponerlo.
        sourceSnapshots: report.sourceSnapshots,
        immutabilityNote: MESSAGES.reports.immutable,
      });
    },
  );

  app.register(async (secured) => {
    secured.addHook('preHandler', app.requireAuth);

    // ─── Listado ──────────────────────────────────────────────────────────────
    secured.get(
      '/',
      {
        schema: {
          tags: ['informes'],
          summary: 'Mis informes',
          querystring: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              kind: { type: 'string' },
              limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
            },
          },
        },
      },
      async (req) => {
        const orgId = req.auth.organizationId;
        if (!orgId) throw AppError.forbidden('Tu cuenta no tiene organización activa.');
        const { status, kind, limit } = z
          .object({
            status: z.string().max(20).optional(),
            kind: z.string().max(30).optional(),
            limit: z.coerce.number().int().min(1).max(100).default(30),
          })
          .parse(req.query);

        const reports = await prisma.report.findMany({
          where: { organizationId: orgId, status: status ?? undefined, kind: kind ?? undefined },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            kind: true,
            level: true,
            title: true,
            status: true,
            progress: true,
            errorMessage: true,
            creditsCharged: true,
            artifacts: true,
            completedAt: true,
            createdAt: true,
          },
        });
        return plainEnvelope(reports);
      },
    );

    // ─── Creación ─────────────────────────────────────────────────────────────
    secured.post(
      '/',
      {
        schema: {
          tags: ['informes'],
          summary: 'Solicitar un informe',
          description:
            'Encola la generación. El informe es inmutable: queda atado a las fechas de corte de cada ' +
            'dataset usado, y por eso se puede verificar después con su código QR.',
          body: {
            type: 'object',
            required: ['kind', 'subject'],
            properties: {
              kind: {
                type: 'string',
                enum: ['parcel', 'area', 'location_intel', 'change', 'municipality'],
              },
              level: { type: 'string', enum: ['resumen', 'completo', 'tecnico'] },
              subject: { type: 'object' },
              title: { type: 'string' },
              projectId: { type: 'string' },
              formats: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      async (req, reply) => {
        const orgId = req.auth.organizationId;
        if (!orgId || !req.auth.userId) {
          throw AppError.forbidden('Necesitas una cuenta para generar informes.');
        }
        const body = CreateSchema.parse(req.body);

        // Formatos permitidos por el plan.
        const allowed = new Set(req.auth.entitlements.exportFormats);
        const rejected = body.formats.filter((f) => !allowed.has(f));
        if (rejected.length > 0) {
          throw AppError.planRequired(
            `formatos:${rejected.join(',')}`,
            'Pro o superior',
          );
        }

        // Cuota mensual de informes.
        await app.quota.consume(req, 'reports', req.auth.entitlements.reportsPerMonth);

        // Validación del objeto según el tipo, para no encolar un informe imposible.
        validateSubject(body.kind, body.subject);

        const verifyToken = randomBytes(16).toString('base64url');
        const report = await prisma.report.create({
          data: {
            organizationId: orgId,
            userId: req.auth.userId,
            projectId: body.projectId ?? null,
            kind: body.kind,
            level: body.level,
            title: body.title ?? defaultTitle(body.kind, body.subject),
            subject: { ...body.subject, formats: body.formats } as never,
            status: 'queued',
            verifyToken,
          },
        });

        // Cobro de créditos, idempotente por informe.
        const operation = CREDIT_BY_LEVEL[body.level] ?? 'report_full';
        let creditsCharged = 0;
        try {
          const delta = await app.quota.charge(
            orgId,
            operation,
            `report:${report.id}`,
            report.id,
            req.auth.role,
          );
          creditsCharged = Math.abs(delta);
          await prisma.report.update({
            where: { id: report.id },
            data: { creditsCharged },
          });
        } catch (err) {
          // Sin créditos: el informe queda a la espera de pago en vez de perderse.
          await prisma.report.update({
            where: { id: report.id },
            data: {
              status: 'failed',
              errorMessage:
                err instanceof AppError
                  ? err.message
                  : 'No hay créditos suficientes para este informe.',
            },
          });
          throw err;
        }

        // El worker recoge los informes en estado `queued`.
        await prisma.job.create({
          data: {
            organizationId: orgId,
            userId: req.auth.userId,
            kind: 'report',
            status: 'queued',
            progressMessage: 'En cola',
            input: { reportId: report.id } as never,
          },
        });

        return reply.status(202).send(
          plainEnvelope({
            id: report.id,
            status: 'queued',
            kind: report.kind,
            level: report.level,
            title: report.title,
            creditsCharged,
            creditCost: CREDIT_COST[operation],
            verifyUrl: `${config.publicApiUrl}/api/v1/reports/verify/${verifyToken}`,
            message:
              'El informe se está generando. Consulta su estado en GET /api/v1/reports/' + report.id,
          }),
        );
      },
    );

    // ─── Consulta ─────────────────────────────────────────────────────────────
    secured.get(
      '/:id',
      { schema: { tags: ['informes'], summary: 'Estado y contenido de un informe' } },
      async (req) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const report = await prisma.report.findUnique({
          where: { id },
          include: { sections: { orderBy: { ordinal: 'asc' } } },
        });
        if (!report || report.organizationId !== req.auth.organizationId) {
          throw AppError.notFound('No encontramos ese informe.');
        }
        return plainEnvelope({
          id: report.id,
          kind: report.kind,
          level: report.level,
          title: report.title,
          status: report.status,
          progress: report.progress,
          errorMessage: report.errorMessage,
          subject: report.subject,
          sections: report.sections.map((s) => ({
            ordinal: s.ordinal,
            key: s.key,
            title: s.title,
            payload: s.payload,
            isMissing: s.isMissing,
          })),
          sourceSnapshots: report.sourceSnapshots,
          artifacts: Object.keys((report.artifacts ?? {}) as Record<string, unknown>),
          creditsCharged: report.creditsCharged,
          verifyUrl: report.verifyToken
            ? `${config.publicApiUrl}/api/v1/reports/verify/${report.verifyToken}`
            : null,
          completedAt: report.completedAt,
          createdAt: report.createdAt,
          immutabilityNote: MESSAGES.reports.immutable,
        });
      },
    );

    // ─── Descarga ─────────────────────────────────────────────────────────────
    secured.get(
      '/:id/download',
      {
        schema: {
          tags: ['informes'],
          summary: 'Descargar un informe',
          querystring: {
            type: 'object',
            properties: {
              format: {
                type: 'string',
                enum: ['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'],
                default: 'pdf',
              },
            },
          },
        },
      },
      async (req, reply) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const { format } = z
          .object({
            format: z
              .enum(['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'])
              .default('pdf'),
          })
          .parse(req.query);

        const report = await prisma.report.findUnique({ where: { id } });
        if (!report || report.organizationId !== req.auth.organizationId) {
          throw AppError.notFound('No encontramos ese informe.');
        }
        if (report.status !== 'done') {
          throw new AppError(
            'VALIDATION',
            report.status === 'failed'
              ? `El informe falló: ${report.errorMessage ?? 'sin detalle'}`
              : `El informe todavía se está generando (${report.progress} %). Inténtalo en unos segundos.`,
            { status: report.status, progress: report.progress },
          );
        }

        const artifacts = (report.artifacts ?? {}) as Record<string, string>;
        const key = artifacts[format];
        if (!key) {
          throw AppError.notFound(
            `Este informe no tiene versión en ${format}. Disponibles: ${Object.keys(artifacts).join(', ') || 'ninguna'}.`,
          );
        }

        const store = getObjectStore();
        if (store.kind === 's3') {
          const url = await store.signedUrl(key, 900);
          return reply.redirect(url);
        }

        const buf = await store.get(key);
        const types: Record<string, string> = {
          pdf: 'application/pdf',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv; charset=utf-8',
          geojson: 'application/geo+json',
          gpkg: 'application/geopackage+sqlite3',
          shp: 'application/zip',
          kml: 'application/vnd.google-earth.kml+xml',
        };
        reply.header('Content-Type', types[format] ?? 'application/octet-stream');
        reply.header(
          'Content-Disposition',
          `attachment; filename="informe-${report.id.slice(0, 8)}.${format === 'shp' ? 'zip' : format}"`,
        );
        return reply.send(buf);
      },
    );

    secured.delete(
      '/:id',
      { schema: { tags: ['informes'], summary: 'Eliminar un informe' } },
      async (req) => {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
        const report = await prisma.report.findUnique({ where: { id } });
        if (!report || report.organizationId !== req.auth.organizationId) {
          throw AppError.notFound('No encontramos ese informe.');
        }
        const store = getObjectStore();
        for (const key of Object.values((report.artifacts ?? {}) as Record<string, string>)) {
          await store.remove(key).catch(() => undefined);
        }
        await prisma.report.delete({ where: { id } });
        return plainEnvelope({ ok: true });
      },
    );
  });
}

/** Valida el objeto del informe según su tipo, con mensajes accionables. */
function validateSubject(kind: string, subject: Record<string, unknown>): void {
  if (kind === 'parcel') {
    const npn = String(subject.npn ?? '').replace(/\D/g, '');
    if (npn.length !== 30 && npn.length !== 20) {
      throw new AppError(
        'VALIDATION',
        'Para un informe de predio hace falta `subject.npn` con el código predial de 30 dígitos (o 20 en el formato anterior).',
        {},
      );
    }
    return;
  }
  if (kind === 'municipality') {
    const code = String(subject.muniCode ?? '');
    if (!/^\d{5}$/.test(code)) {
      throw new AppError(
        'VALIDATION',
        'Para un informe municipal hace falta `subject.muniCode` con el código DIVIPOLA de 5 dígitos.',
        {},
      );
    }
    return;
  }
  if (kind === 'area' || kind === 'location_intel' || kind === 'change') {
    if (!subject.scope || typeof subject.scope !== 'object') {
      throw new AppError(
        'VALIDATION',
        'Hace falta `subject.scope` con el ámbito del informe (polígono, radio, municipio o isócrona).',
        {},
      );
    }
    if (kind === 'change' && (!subject.fromCutDate || !subject.toCutDate)) {
      throw new AppError(
        'VALIDATION',
        'Para un informe de cambio hacen falta `subject.fromCutDate` y `subject.toCutDate`.',
        {},
      );
    }
    if (kind === 'location_intel' && !subject.templateId) {
      throw new AppError(
        'VALIDATION',
        'Para un informe de localización hace falta `subject.templateId`.',
        {},
      );
    }
  }
}

function defaultTitle(kind: string, subject: Record<string, unknown>): string {
  switch (kind) {
    case 'parcel':
      return `Informe Territorial de Predio ${String(subject.npn ?? '').slice(0, 30)}`;
    case 'area':
      return 'Informe de Zona';
    case 'location_intel':
      return `Informe de Localización de Negocio — ${String(subject.templateId ?? '')}`;
    case 'change':
      return `Informe de Cambio Territorial ${String(subject.fromCutDate ?? '')} → ${String(subject.toCutDate ?? '')}`;
    case 'municipality':
      return `Informe Municipal ${String(subject.muniCode ?? '')}`;
    default:
      return 'Informe TerraColombia';
  }
}
