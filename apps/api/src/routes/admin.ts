import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '@terracolombia/shared';
import {
  coverageSummary,
  getPrisma,
  listDatasets,
  listSnapshots,
  listValidations,
  publishSnapshot,
  query,
  rebuildSearchIndex,
  refreshMuniSummary,
} from '@terracolombia/db';
import { sql } from '@terracolombia/db/sql';
import { hashIp } from '../plugins/auth.js';
import { plainEnvelope } from '../lib/envelope.js';

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.addHook('preHandler', app.requireAdmin);

  // ─── Estado del ETL y linaje ────────────────────────────────────────────────
  app.get(
    '/etl/status',
    {
      schema: {
        tags: ['admin'],
        summary: 'Estado de cada dataset y su último corte',
      },
    },
    async () => {
      const datasets = await listDatasets();
      const rows = await query<{
        dataset_id: string;
        cut_date: string | null;
        status: string;
        is_active: boolean;
        is_synthetic: boolean;
        row_count: number | null;
        loaded_at: string | null;
        stage_method: string | null;
        error_message: string | null;
        errors: number;
        warnings: number;
      }>(sql`
        SELECT
          d.id AS dataset_id,
          s.cut_date::text AS cut_date,
          COALESCE(s.status, 'sin_cortes') AS status,
          COALESCE(s.is_active, FALSE) AS is_active,
          COALESCE(s.is_synthetic, FALSE) AS is_synthetic,
          s.row_count,
          s.loaded_at::text AS loaded_at,
          s.stage_method,
          s.error_message,
          COALESCE((SELECT count(*)::int FROM meta.validation v
                    WHERE v.snapshot_id = s.id AND v.severity = 'error' AND NOT v.passed), 0) AS errors,
          COALESCE((SELECT count(*)::int FROM meta.validation v
                    WHERE v.snapshot_id = s.id AND v.severity = 'warning' AND NOT v.passed), 0) AS warnings
        FROM meta.dataset d
        LEFT JOIN LATERAL (
          SELECT * FROM meta.snapshot s2 WHERE s2.dataset_id = d.id
          ORDER BY s2.cut_date DESC LIMIT 1
        ) s ON TRUE
        ORDER BY d.source, d.name
      `);

      const byId = new Map(rows.map((r) => [r.dataset_id, r]));
      return plainEnvelope({
        datasets: datasets.map((d) => ({
          id: d.id,
          source: d.source,
          name: d.name,
          frequency: d.frequency,
          license: d.license,
          shareAlike: d.share_alike,
          targetTable: d.target_table,
          latest: byId.get(d.id) ?? null,
        })),
      });
    },
  );

  app.get(
    '/etl/runs',
    {
      schema: {
        tags: ['admin'],
        summary: 'Últimas corridas del ETL',
        querystring: {
          type: 'object',
          properties: {
            datasetId: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const { datasetId, limit } = z
        .object({
          datasetId: z.string().max(80).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);
      const rows = await query(sql`
        SELECT r.id, r.dataset_id, r.snapshot_id, r.step, r.status,
               r.started_at::text AS started_at, r.finished_at::text AS finished_at,
               r.duration_ms, r.rows_in, r.rows_out, r.message
        FROM meta.etl_run r
        ${datasetId ? sql`WHERE r.dataset_id = ${datasetId}` : sql``}
        ORDER BY r.started_at DESC
        LIMIT ${limit}
      `);
      return plainEnvelope(rows);
    },
  );

  app.get(
    '/etl/snapshots/:datasetId',
    { schema: { tags: ['admin'], summary: 'Cortes de un dataset' } },
    async (req) => {
      const { datasetId } = z.object({ datasetId: z.string().max(80) }).parse(req.params);
      const snapshots = await listSnapshots(datasetId, 100);
      return plainEnvelope(snapshots);
    },
  );

  app.get(
    '/etl/validations/:snapshotId',
    { schema: { tags: ['admin'], summary: 'Validaciones de un corte' } },
    async (req) => {
      const { snapshotId } = z.object({ snapshotId: z.coerce.number().int() }).parse(req.params);
      return plainEnvelope(await listValidations(snapshotId));
    },
  );

  app.post(
    '/etl/snapshots/:snapshotId/publish',
    {
      schema: {
        tags: ['admin'],
        summary: 'Publicar un corte',
        description:
          'Publicación atómica: desactiva el corte anterior y activa este. Se rechaza si el corte ' +
          'tiene validaciones con severidad error, o si es sintético y ya existe un corte real.',
      },
    },
    async (req) => {
      const { snapshotId } = z.object({ snapshotId: z.coerce.number().int() }).parse(req.params);
      try {
        await publishSnapshot(snapshotId);
      } catch (err) {
        throw new AppError(
          'VALIDATION',
          err instanceof Error ? err.message : 'No se pudo publicar el corte.',
          { snapshotId },
        );
      }
      await prisma.auditLog.create({
        data: {
          userId: req.auth.userId,
          action: 'snapshot_published',
          targetType: 'snapshot',
          targetId: String(snapshotId),
          ipHash: hashIp(req.ip),
        },
      });
      return plainEnvelope({ ok: true, snapshotId, published: true });
    },
  );

  // ─── Registro de PII descartada ─────────────────────────────────────────────
  app.get(
    '/pii-log',
    {
      schema: {
        tags: ['admin'],
        summary: 'Columnas descartadas por posible dato personal',
        description:
          'Registro de la regla 3: qué columnas se descartaron en la ingesta y por qué. Nunca guarda ' +
          'el valor descartado, solo el nombre de la columna.',
      },
    },
    async () => {
      const rows = await query(sql`
        SELECT dataset_id, source_layer, column_name, reason, sum(occurrences)::bigint AS occurrences,
               max(created_at)::text AS last_seen
        FROM meta.pii_discard_log
        GROUP BY dataset_id, source_layer, column_name, reason
        ORDER BY occurrences DESC, dataset_id
        LIMIT 500
      `);
      return plainEnvelope({
        discards: rows,
        note:
          'Cada fila significa que esa columna de la fuente NO entró a la base. El valor nunca se almacena.',
      });
    },
  );

  // ─── Cobertura ──────────────────────────────────────────────────────────────
  app.get(
    '/coverage',
    { schema: { tags: ['admin'], summary: 'Cobertura catastral nacional' } },
    async () => {
      const [summary, byDept] = await Promise.all([
        coverageSummary(),
        query(sql`
          SELECT d.code, d.name,
                 count(DISTINCT m.code)::int AS municipalities,
                 count(DISTINCT cm.muni_code) FILTER (WHERE cm.is_igac)::int AS igac,
                 count(DISTINCT p.muni_code)::int AS with_parcels
          FROM core.department d
          LEFT JOIN core.municipality m ON m.dept_code = d.code
          LEFT JOIN core.cadastral_manager cm ON cm.muni_code = m.code
          LEFT JOIN (
            SELECT DISTINCT pa.muni_code, pa.dept_code
            FROM core.parcel pa
            JOIN meta.snapshot s ON s.id = pa.snapshot_id AND s.is_active
          ) p ON p.dept_code = d.code AND p.muni_code = m.code
          GROUP BY d.code, d.name
          ORDER BY d.name
        `),
      ]);
      return plainEnvelope({ summary, byDepartment: byDept });
    },
  );

  app.patch(
    '/coverage/:muniCode',
    {
      schema: {
        tags: ['admin'],
        summary: 'Corregir el gestor catastral de un municipio',
        description:
          'La asignación inicial marca al IGAC como gestor por omisión. Este endpoint permite ' +
          'corregirla contra la habilitación vigente de gestores catastrales.',
      },
    },
    async (req) => {
      const { muniCode } = z.object({ muniCode: z.string().length(5) }).parse(req.params);
      const body = z
        .object({
          managerName: z.string().min(2).max(200),
          isIgac: z.boolean(),
          coverageStatus: z.enum(['full', 'partial', 'none', 'unknown']),
          managerUrl: z.string().url().nullable().optional(),
          notes: z.string().max(2000).nullable().optional(),
        })
        .parse(req.body);

      const updated = await query(sql`
        UPDATE core.cadastral_manager SET
          manager_name = ${body.managerName},
          is_igac = ${body.isIgac},
          coverage_status = ${body.coverageStatus},
          manager_url = ${body.managerUrl ?? null},
          notes = ${body.notes ?? null},
          updated_at = now()
        WHERE muni_code = ${muniCode}
        RETURNING muni_code
      `);
      if (updated.length === 0) throw AppError.notFound(`No tenemos el municipio ${muniCode}.`);

      await prisma.auditLog.create({
        data: {
          userId: req.auth.userId,
          action: 'coverage_updated',
          targetType: 'municipality',
          targetId: muniCode,
          ipHash: hashIp(req.ip),
          detail: body as never,
        },
      });
      return plainEnvelope({ ok: true, muniCode });
    },
  );

  // ─── Mantenimiento ──────────────────────────────────────────────────────────
  app.post(
    '/maintenance/rebuild-search',
    { schema: { tags: ['admin'], summary: 'Reconstruir el índice de búsqueda' } },
    async () => {
      const count = await rebuildSearchIndex();
      return plainEnvelope({ ok: true, entries: count });
    },
  );

  app.post(
    '/maintenance/refresh-summaries',
    { schema: { tags: ['admin'], summary: 'Refrescar vistas materializadas' } },
    async () => {
      await refreshMuniSummary();
      return plainEnvelope({ ok: true });
    },
  );

  app.post(
    '/maintenance/clear-tile-cache',
    { schema: { tags: ['admin'], summary: 'Invalidar la caché de teselas' } },
    async (req) => {
      const { layer } = z.object({ layer: z.string().max(40).optional() }).parse(req.query);
      await app.cache.del(layer ? `tile:${layer}` : 'tile:');
      return plainEnvelope({ ok: true, cleared: layer ?? 'todas las capas' });
    },
  );

  // ─── Métricas de negocio ────────────────────────────────────────────────────
  app.get(
    '/metrics',
    {
      schema: {
        tags: ['admin'],
        summary: 'Métricas de producto y negocio',
        description: 'Activación, conversión a pago, informes por usuario, ingresos y bajas.',
      },
    },
    async () => {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

      const [users, orgs, paidSubs, reportsMonth, activeUsers30d, payments, canceled] =
        await Promise.all([
          prisma.user.count(),
          prisma.organization.count(),
          prisma.subscription.count({
            where: { status: 'active', planCode: { notIn: ['free'] } },
          }),
          prisma.report.count({ where: { createdAt: { gte: monthStart }, status: 'done' } }),
          prisma.usageEvent.findMany({
            where: { createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
            distinct: ['userId'],
            select: { userId: true },
          }),
          prisma.payment.aggregate({
            where: { status: 'approved', paidAt: { gte: monthStart } },
            _sum: { amountCop: true },
            _count: { _all: true },
          }),
          prisma.subscription.count({
            where: { status: 'canceled', canceledAt: { gte: thirtyDaysAgo } },
          }),
        ]);

      const mrr = await prisma.$queryRaw<Array<{ mrr: bigint | null }>>`
        SELECT sum(p.monthly_price_cop)::bigint AS mrr
        FROM app.subscription s
        JOIN app.plan p ON p.code = s.plan_code
        WHERE s.status IN ('active', 'trialing') AND p.monthly_price_cop IS NOT NULL
      `;

      return plainEnvelope({
        users,
        organizations: orgs,
        paidSubscriptions: paidSubs,
        conversionToPaidPct: orgs > 0 ? Number(((paidSubs / orgs) * 100).toFixed(2)) : 0,
        activeUsers30d: activeUsers30d.length,
        activationPct: users > 0 ? Number(((activeUsers30d.length / users) * 100).toFixed(2)) : 0,
        reportsThisMonth: reportsMonth,
        reportsPerActiveUser:
          activeUsers30d.length > 0
            ? Number((reportsMonth / activeUsers30d.length).toFixed(2))
            : 0,
        revenueThisMonthCop: payments._sum.amountCop ?? 0,
        paymentsThisMonth: payments._count._all,
        mrrCop: Number(mrr[0]?.mrr ?? 0),
        churn30d: canceled,
        note: 'Cifras del despliegue actual. No incluyen impuestos ni comisiones de la pasarela.',
      });
    },
  );

  // ─── Usuarios ───────────────────────────────────────────────────────────────
  app.get(
    '/users',
    {
      schema: {
        tags: ['admin'],
        summary: 'Usuarios',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const { q, limit } = z
        .object({
          q: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        })
        .parse(req.query);
      const users = await prisma.user.findMany({
        where: q ? { email: { contains: q.toLowerCase() } } : undefined,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          memberships: { select: { organizationId: true, role: true } },
        },
      });
      return plainEnvelope(users);
    },
  );

  app.get(
    '/audit',
    {
      schema: {
        tags: ['admin'],
        summary: 'Registro de auditoría',
        description: 'Las direcciones IP se guardan como hash: el registro no lleva datos personales.',
      },
    },
    async (req) => {
      const { limit } = z
        .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
        .parse(req.query);
      const rows = await prisma.auditLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          action: true,
          targetType: true,
          targetId: true,
          detail: true,
          createdAt: true,
        },
      });
      return plainEnvelope(rows);
    },
  );
}
