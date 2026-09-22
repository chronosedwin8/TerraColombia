import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import {
  AppError,
  PLANS,
  entitlementsFor,
  entitlementsForPlatformAdmin,
} from '@terracolombia/shared';
import type { Entitlements, PlanCode } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { loadConfig } from '../config.js';

/**
 * Autenticación y autorización.
 *
 * Dos caminos que llegan al mismo `request.auth`:
 *  - sesión web: JWT de acceso corto en cabecera `Authorization`, refresco rotativo en cookie;
 *  - GeoAPI pública: `Authorization: Bearer tc_live_...` verificada contra el hash de la llave.
 */

export interface AuthContext {
  userId: string | null;
  organizationId: string | null;
  plan: PlanCode;
  entitlements: Entitlements;
  role: 'user' | 'admin' | 'support';
  /** `session` (web) | `api_key` (GeoAPI) | `anonymous` */
  channel: 'session' | 'api_key' | 'anonymous';
  apiKeyId: string | null;
  environment: 'sandbox' | 'live' | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyInstance {
    /** Exige sesión o llave válida. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Exige una función del plan; lanza PLAN_REQUIRED si no la tiene. */
    requireEntitlement: (
      key: keyof Entitlements,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const ANONYMOUS: AuthContext = {
  userId: null,
  organizationId: null,
  plan: 'free',
  entitlements: entitlementsFor('free'),
  role: 'user',
  channel: 'anonymous',
  apiKeyId: null,
  environment: null,
};

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB, recomendación OWASP para argon2id
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Token de refresco: se guarda solo su SHA-256. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Llave de API: prefijo visible + secreto que solo se muestra al crearla. */
export function generateApiKey(environment: 'sandbox' | 'live'): {
  full: string;
  prefix: string;
  secret: string;
} {
  const prefix = `tc_${environment === 'live' ? 'live' : 'test'}_${randomBytes(6).toString('hex')}`;
  const secret = randomBytes(24).toString('base64url');
  return { full: `${prefix}.${secret}`, prefix, secret };
}

/** Hash de IP para el registro: se audita sin guardar el dato personal. */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const salt = loadConfig().jwtSecret.slice(0, 16);
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 32);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function resolvePlan(organizationId: string | null): Promise<{
  plan: PlanCode;
  entitlements: Entitlements;
}> {
  if (!organizationId) return { plan: 'free', entitlements: entitlementsFor('free') };
  const prisma = getPrisma();
  const sub = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: ['active', 'trialing'] } },
    orderBy: { currentPeriodEnd: 'desc' },
    include: { plan: true },
  });
  if (!sub) return { plan: 'free', entitlements: entitlementsFor('free') };
  const code = (sub.planCode as PlanCode) in PLANS ? (sub.planCode as PlanCode) : 'free';
  // La columna `entitlements` permite ajustar un plan para un cliente sin desplegar;
  // si está vacía se usa la definición del código.
  const stored = sub.plan.entitlements as Partial<Entitlements> | null;
  const base = entitlementsFor(code);
  return {
    plan: code,
    entitlements: stored && Object.keys(stored).length > 0 ? { ...base, ...stored } : base,
  };
}

export default fp(
  async (app: FastifyInstance) => {
    const config = loadConfig();

    // Se declara la propiedad en el prototipo de la petición; el valor real lo pone el hook.
    app.decorateRequest('auth', undefined as unknown as AuthContext);

    app.addHook('onRequest', async (req) => {
      req.auth = { ...ANONYMOUS };
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) return;
      const token = header.slice(7).trim();

      // Llave de API: `tc_live_xxxx.secreto`
      if (token.startsWith('tc_')) {
        const dot = token.indexOf('.');
        if (dot === -1) return;
        const prefix = token.slice(0, dot);
        const secret = token.slice(dot + 1);
        const prisma = getPrisma();
        const key = await prisma.apiKey.findUnique({ where: { prefix } });
        if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return;
        const ok = await verifyPassword(key.keyHash, secret);
        if (!ok) return;
        const { plan, entitlements } = await resolvePlan(key.organizationId);
        req.auth = {
          userId: null,
          organizationId: key.organizationId,
          plan,
          entitlements,
          role: 'user',
          channel: 'api_key',
          apiKeyId: key.id,
          environment: key.environment === 'live' ? 'live' : 'sandbox',
        };
        // `last_used_at` se actualiza sin esperar: no debe frenar la petición.
        void prisma.apiKey
          .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        return;
      }

      // JWT de sesión
      try {
        const payload = app.jwt.verify<{
          sub: string;
          org: string | null;
          role: AuthContext['role'];
        }>(token);
        const { plan, entitlements } = await resolvePlan(payload.org ?? null);
        const role = payload.role ?? 'user';
        req.auth = {
          userId: payload.sub,
          organizationId: payload.org ?? null,
          plan,
          /*
           * Quien opera la plataforma no tiene plan que comprar: sus permisos no salen de la
           * suscripción. Sin esto, revisar el propio producto chocaba con «tu plan no incluye
           * esta función» y con los topes de área del plan contratado.
           */
          entitlements: role === 'admin' ? entitlementsForPlatformAdmin() : entitlements,
          role,
          channel: 'session',
          apiKeyId: null,
          environment: null,
        };
      } catch {
        // Token inválido o caducado: la petición sigue como anónima y los guardas deciden.
      }
    });

    app.decorate('requireAuth', async (req: FastifyRequest) => {
      if (req.auth.channel === 'anonymous') throw AppError.unauthorized();
    });

    app.decorate(
      'requireEntitlement',
      (key: keyof Entitlements) => async (req: FastifyRequest) => {
        const value = req.auth.entitlements[key];
        if (value === false || value === 0) {
          const minPlan =
            Object.values(PLANS).find((p) => {
              const v = p.entitlements[key];
              return v === true || (typeof v === 'number' && v > 0);
            })?.name ?? 'un plan superior';
          throw AppError.planRequired(String(key), minPlan);
        }
      },
    );

    app.decorate('requireAdmin', async (req: FastifyRequest) => {
      if (req.auth.channel === 'anonymous') throw AppError.unauthorized();
      if (req.auth.role !== 'admin') {
        // No es un asunto de plan: ningún plan da acceso a la operación interna. Decir
        // "tu plan no lo incluye" mandaría al usuario a pagar por algo que no se vende.
        throw new AppError(
          'FORBIDDEN',
          'Esta sección es de operación interna de TerraColombia y tu cuenta no tiene ese rol.',
          { requires: 'rol de administrador de plataforma' },
        );
      }
    });

    void config;
  },
  { name: 'auth', dependencies: ['jwt'] },
);

export { constantTimeEqual };
