import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, PLANS } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { loadConfig } from '../config.js';
import {
  generateRefreshToken,
  hashIp,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../plugins/auth.js';

const REFRESH_COOKIE = 'tc_refresh';

const RegisterSchema = z.object({
  email: z.string().email('Escribe un correo válido').max(200),
  password: z
    .string()
    .min(10, 'La contraseña debe tener al menos 10 caracteres')
    .max(200),
  displayName: z.string().min(2).max(120).optional(),
  organizationName: z.string().min(2).max(160).optional(),
});

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  const config = loadConfig();
  const prisma = getPrisma();

  /** Crea el par de tokens y rota la cookie de refresco. */
  async function issueSession(
    userId: string,
    organizationId: string | null,
    role: string,
    req: { headers: Record<string, unknown>; ip: string },
    reply: { setCookie: (n: string, v: string, o: Record<string, unknown>) => unknown },
    familyId?: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const accessToken = app.jwt.sign({ sub: userId, org: organizationId, role });
    const { token, hash } = generateRefreshToken();
    const family = familyId ?? crypto.randomUUID();

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hash,
        familyId: family,
        expiresAt: new Date(Date.now() + config.jwtRefreshTtl * 1000),
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
        ipHash: hashIp(req.ip),
      },
    });

    reply.setCookie(REFRESH_COOKIE, `${family}.${token}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
      path: '/api/v1/auth',
      maxAge: config.jwtRefreshTtl,
      signed: false,
    });

    return { accessToken, expiresIn: config.jwtAccessTtl };
  }

  // ─── Registro ───────────────────────────────────────────────────────────────
  app.post(
    '/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        tags: ['cuenta'],
        summary: 'Crear cuenta',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 10 },
            displayName: { type: 'string' },
            organizationName: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const body = RegisterSchema.parse(req.body);
      const email = body.email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // No se revela si el correo existe: se responde igual y se pide iniciar sesión.
        throw new AppError(
          'VALIDATION',
          'No pudimos crear la cuenta con ese correo. Si ya tienes cuenta, inicia sesión o recupera la contraseña.',
          {},
        );
      }

      const passwordHash = await hashPassword(body.password);
      const orgName = body.organizationName ?? body.displayName ?? email.split('@')[0]!;
      const slugBase = orgName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash, displayName: body.displayName ?? null, role: 'user' },
        });
        const org = await tx.organization.create({
          data: { name: orgName, slug: `${slugBase || 'cuenta'}-${user.id.slice(0, 8)}` },
        });
        await tx.membership.create({
          data: { userId: user.id, organizationId: org.id, role: 'owner' },
        });
        // Toda cuenta nueva arranca en el plan gratis, con periodo mensual.
        const now = new Date();
        const end = new Date(now);
        end.setUTCMonth(end.getUTCMonth() + 1);
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planCode: 'free',
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: end,
          },
        });
        if (PLANS.free.monthlyCredits > 0) {
          await tx.creditLedgerEntry.create({
            data: {
              organizationId: org.id,
              delta: PLANS.free.monthlyCredits,
              reason: 'grant_monthly',
              note: 'Créditos incluidos en el plan gratis',
            },
          });
        }
        await tx.auditLog.create({
          data: { userId: user.id, action: 'register', ipHash: hashIp(req.ip) },
        });
        return { user, org };
      });

      const session = await issueSession(
        result.user.id,
        result.org.id,
        'user',
        req as never,
        reply as never,
      );

      return reply.status(201).send({
        data: {
          user: { id: result.user.id, email: result.user.email, displayName: result.user.displayName },
          organization: { id: result.org.id, name: result.org.name },
          plan: 'free',
          ...session,
        },
      });
    },
  );

  // ─── Inicio de sesión ───────────────────────────────────────────────────────
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
      schema: {
        tags: ['cuenta'],
        summary: 'Iniciar sesión',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const body = LoginSchema.parse(req.body);
      const email = body.email.toLowerCase().trim();
      const user = await prisma.user.findUnique({
        where: { email },
        include: { memberships: { take: 1, orderBy: { createdAt: 'asc' } } },
      });

      // Mismo mensaje y coste aproximado tanto si el correo no existe como si falla la clave.
      const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaa$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const ok = await verifyPassword(hash, body.password);
      if (!user || !user.passwordHash || !ok || !user.isActive) {
        throw new AppError('UNAUTHORIZED', 'El correo o la contraseña no coinciden.', {});
      }

      const orgId = user.memberships[0]?.organizationId ?? null;
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await prisma.auditLog.create({
        data: { userId: user.id, action: 'login', ipHash: hashIp(req.ip) },
      });

      const session = await issueSession(user.id, orgId, user.role, req as never, reply as never);
      return {
        data: {
          user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
          organizationId: orgId,
          ...session,
        },
      };
    },
  );

  // ─── Refresco rotativo ──────────────────────────────────────────────────────
  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: 60, timeWindow: '5 minutes' } },
      schema: { tags: ['cuenta'], summary: 'Renovar el token de acceso' },
    },
    async (req, reply) => {
      const raw = req.cookies[REFRESH_COOKIE];
      if (!raw) throw AppError.unauthorized();
      const dot = raw.indexOf('.');
      if (dot === -1) throw AppError.unauthorized();
      const familyId = raw.slice(0, dot);
      const token = raw.slice(dot + 1);

      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: { include: { memberships: { take: 1 } } } },
      });

      if (!stored || stored.familyId !== familyId) throw AppError.unauthorized();

      // Reutilización de un token ya revocado: se invalida toda la familia.
      if (stored.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await prisma.auditLog.create({
          data: {
            userId: stored.userId,
            action: 'refresh_token_reuse',
            ipHash: hashIp(req.ip),
            detail: { familyId },
          },
        });
        throw new AppError(
          'UNAUTHORIZED',
          'Tu sesión se cerró por seguridad porque se reutilizó un token antiguo. Vuelve a iniciar sesión.',
          {},
        );
      }

      if (stored.expiresAt < new Date()) throw AppError.unauthorized();

      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      const orgId = stored.user.memberships[0]?.organizationId ?? null;
      const session = await issueSession(
        stored.userId,
        orgId,
        stored.user.role,
        req as never,
        reply as never,
        familyId,
      );
      return { data: session };
    },
  );

  // ─── Cierre de sesión ───────────────────────────────────────────────────────
  app.post(
    '/logout',
    { schema: { tags: ['cuenta'], summary: 'Cerrar sesión' } },
    async (req, reply) => {
      const raw = req.cookies[REFRESH_COOKIE];
      if (raw) {
        const dot = raw.indexOf('.');
        if (dot !== -1) {
          const familyId = raw.slice(0, dot);
          await prisma.refreshToken.updateMany({
            where: { familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      if (req.auth.userId) {
        await prisma.auditLog.create({
          data: { userId: req.auth.userId, action: 'logout', ipHash: hashIp(req.ip) },
        });
      }
      return { data: { ok: true } };
    },
  );

  // ─── OAuth con Google ───────────────────────────────────────────────────────
  // El intercambio del código se hace en el servidor; el cliente nunca ve el secreto.
  app.get(
    '/google',
    { schema: { tags: ['cuenta'], summary: 'Iniciar OAuth con Google' } },
    async (_req, reply) => {
      if (!config.googleClientId) {
        throw new AppError(
          'UPSTREAM_UNAVAILABLE',
          'El inicio de sesión con Google no está configurado en este despliegue.',
          {},
        );
      }
      const params = new URLSearchParams({
        client_id: config.googleClientId,
        redirect_uri: `${config.publicApiUrl}/api/v1/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
      });
      return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    },
  );

  app.get(
    '/google/callback',
    { schema: { tags: ['cuenta'], summary: 'Retorno de OAuth con Google' } },
    async (req, reply) => {
      if (!config.googleClientId || !config.googleClientSecret) {
        throw new AppError('UPSTREAM_UNAVAILABLE', 'OAuth con Google no está configurado.', {});
      }
      const { code } = z.object({ code: z.string().min(1) }).parse(req.query);

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: `${config.publicApiUrl}/api/v1/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        throw new AppError('UPSTREAM_UNAVAILABLE', 'Google rechazó el intercambio del código.', {});
      }
      const tokens = (await tokenRes.json()) as { access_token?: string };
      if (!tokens.access_token) throw AppError.unauthorized();

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = (await profileRes.json()) as {
        sub?: string;
        email?: string;
        name?: string;
        email_verified?: boolean;
      };
      if (!profile.sub || !profile.email) throw AppError.unauthorized();

      const email = profile.email.toLowerCase();
      let user = await prisma.user.findUnique({
        where: { email },
        include: { memberships: { take: 1 } },
      });

      if (!user) {
        const created = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              email,
              displayName: profile.name ?? null,
              emailVerified: profile.email_verified ?? false,
            },
          });
          const org = await tx.organization.create({
            data: { name: profile.name ?? email, slug: `cuenta-${u.id.slice(0, 8)}` },
          });
          await tx.membership.create({
            data: { userId: u.id, organizationId: org.id, role: 'owner' },
          });
          const now = new Date();
          const end = new Date(now);
          end.setUTCMonth(end.getUTCMonth() + 1);
          await tx.subscription.create({
            data: {
              organizationId: org.id,
              planCode: 'free',
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: end,
            },
          });
          await tx.oAuthAccount.create({
            data: { userId: u.id, provider: 'google', providerUserId: profile.sub! },
          });
          return u;
        });
        user = await prisma.user.findUniqueOrThrow({
          where: { id: created.id },
          include: { memberships: { take: 1 } },
        });
      } else {
        await prisma.oAuthAccount.upsert({
          where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
          create: { userId: user.id, provider: 'google', providerUserId: profile.sub },
          update: {},
        });
      }

      const orgId = user.memberships[0]?.organizationId ?? null;
      const session = await issueSession(user.id, orgId, user.role, req as never, reply as never);
      // Se devuelve al frontend con el token de acceso en el fragmento, que no viaja al servidor.
      return reply.redirect(`${config.webOrigin}/auth/callback#token=${session.accessToken}`);
    },
  );
}
