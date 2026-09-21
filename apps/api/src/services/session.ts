import { PLANS, entitlementsFor } from '@terracolombia/shared';
import type { Entitlements, PlanCode } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';

/**
 * Ficha de sesión que consume el frontend.
 *
 * Es un solo sitio porque `login`, `register`, `refresh` y `switch-organization` deben
 * devolver exactamente lo mismo: si uno de ellos omite el plan o los permisos, la interfaz
 * cae al plan gratis y le dice al usuario que no puede hacer lo que sí ha pagado.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string | null;
  organizationName: string | null;
  /** Rol dentro de la organización. */
  role: 'owner' | 'admin' | 'member' | 'viewer';
  plan: PlanCode;
  entitlements: Entitlements;
  credits: number;
  /** true si el usuario administra la plataforma (`app.user.role = 'admin'`). */
  isPlatformAdmin: boolean;
}

export async function buildSessionUser(
  userId: string,
  organizationId: string | null,
): Promise<SessionUser> {
  const prisma = getPrisma();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: {
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // Si no se indicó organización, se usa la primera a la que pertenece.
  const membership =
    user.memberships.find((m) => m.organizationId === organizationId) ?? user.memberships[0] ?? null;
  const orgId = membership?.organizationId ?? null;

  let plan: PlanCode = 'free';
  let entitlements = entitlementsFor('free');
  let credits = 0;

  if (orgId) {
    const [subscription, balance] = await Promise.all([
      prisma.subscription.findFirst({
        where: { organizationId: orgId, status: { in: ['active', 'trialing'] } },
        orderBy: { currentPeriodEnd: 'desc' },
        include: { plan: true },
      }),
      prisma.creditLedgerEntry.aggregate({
        where: { organizationId: orgId },
        _sum: { delta: true },
      }),
    ]);

    credits = balance._sum.delta ?? 0;

    if (subscription) {
      const code = (subscription.planCode as PlanCode) in PLANS
        ? (subscription.planCode as PlanCode)
        : 'free';
      plan = code;
      // La columna `entitlements` permite ajustar un plan para un cliente concreto sin
      // desplegar; si está vacía, manda la definición del código.
      const stored = subscription.plan.entitlements as Partial<Entitlements> | null;
      const base = entitlementsFor(code);
      entitlements =
        stored && Object.keys(stored).length > 0 ? { ...base, ...stored } : base;
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.displayName,
    organizationId: orgId,
    organizationName: membership?.organization.name ?? null,
    role: (membership?.role as SessionUser['role']) ?? 'viewer',
    plan,
    entitlements,
    credits,
    // `app.user.role` es el rol de plataforma; `membership.role` es el de la organización.
    isPlatformAdmin: user.role === 'admin',
  };
}
