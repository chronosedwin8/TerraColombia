#!/usr/bin/env node
/**
 * Crea o promueve una cuenta de administrador.
 *
 *   pnpm --filter @terracolombia/api admin:create -- --email=alguien@dominio.co
 *
 * La contraseña NUNCA se pasa por argumento (quedaría en el historial del shell ni en la
 * lista de procesos): se lee de la variable de entorno `ADMIN_PASSWORD`, o se pide por
 * teclado sin eco si no está definida.
 *
 * Lo que hace:
 *  - crea el usuario con `role = 'admin'` y la contraseña cifrada con argon2id, o promueve
 *    el que ya exista con ese correo;
 *  - le crea (o reutiliza) una organización con plan Enterprise, que es el que tiene todos
 *    los permisos del producto;
 *  - le asigna créditos para que pueda generar informes y análisis sin comprar;
 *  - registra la acción en `app.audit_log`.
 */
import { createInterface } from 'node:readline';
import { PLANS } from '@terracolombia/shared';
import { closePool, disconnectPrisma, getPrisma } from '@terracolombia/db';
import { loadEnvFile } from '../lib/env.js';
import { hashPassword } from '../plugins/auth.js';

loadEnvFile();

const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_CREDITS = 100_000;

function parseArgs(): { email: string | null; credits: number; orgName: string | null } {
  let email: string | null = null;
  let credits = DEFAULT_CREDITS;
  let orgName: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--email=')) email = arg.slice(8).trim().toLowerCase();
    else if (arg.startsWith('--credits=')) credits = Number(arg.slice(10));
    else if (arg.startsWith('--org=')) orgName = arg.slice(6).trim();
  }
  return { email, credits, orgName };
}

/** Lee la contraseña por teclado sin mostrarla. */
async function promptPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
    process.stdout.write('Contraseña (no se mostrará): ');
    if (stdin.isTTY) {
      // Se silencia el eco mientras se escribe.
      const onData = (char: Buffer) => {
        const s = char.toString();
        if (s === '\n' || s === '\r' || s === '\u0004') {
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
        }
      };
      stdin.on('data', onData);
      // @ts-expect-error `output` es privado en los tipos, pero es la vía documentada.
      rl._writeToOutput = () => undefined;
    }
    rl.question('', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const { email, credits, orgName } = parseArgs();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(
      'Falta un correo válido.\n' +
        '  pnpm --filter @terracolombia/api admin:create -- --email=alguien@dominio.co\n' +
        'La contraseña se toma de la variable ADMIN_PASSWORD o se pide por teclado.',
    );
    process.exitCode = 1;
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? (await promptPassword());
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exitCode = 1;
    return;
  }

  const prisma = getPrisma();
  const passwordHash = await hashPassword(password);
  const enterprise = PLANS.enterprise;

  // El plan Enterprise debe existir en `app.plan` antes de suscribir a nadie.
  await prisma.plan.upsert({
    where: { code: enterprise.code },
    create: {
      code: enterprise.code,
      name: enterprise.name,
      monthlyPriceCop: enterprise.monthlyPriceCop,
      unitPriceCop: enterprise.unitPriceCop,
      monthlyCredits: enterprise.monthlyCredits,
      entitlements: enterprise.entitlements as never,
      isPublic: false,
      sortOrder: 60,
    },
    update: { entitlements: enterprise.entitlements as never },
  });

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      include: { memberships: { include: { organization: true } } },
    });

    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash, role: 'admin', isActive: true, emailVerified: true },
        })
      : await tx.user.create({
          data: {
            email,
            passwordHash,
            role: 'admin',
            isActive: true,
            emailVerified: true,
            displayName: orgName ?? email.split('@')[0]!,
          },
        });

    // Organización: se reutiliza la que ya tenga, o se crea una nueva.
    let organizationId = existing?.memberships[0]?.organizationId ?? null;
    if (!organizationId) {
      const slugBase = (orgName ?? email.split('@')[0]!)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const org = await tx.organization.create({
        data: {
          name: orgName ?? `Administración ${email}`,
          slug: `${slugBase || 'admin'}-${user.id.slice(0, 8)}`,
        },
      });
      organizationId = org.id;
      await tx.membership.create({
        data: { userId: user.id, organizationId, role: 'owner' },
      });
    } else {
      await tx.membership.updateMany({
        where: { userId: user.id, organizationId },
        data: { role: 'owner' },
      });
    }

    // Suscripción Enterprise con un periodo largo: es una cuenta de operación, no de venta.
    const now = new Date();
    const end = new Date(now);
    end.setUTCFullYear(end.getUTCFullYear() + 10);

    const sub = await tx.subscription.findFirst({
      where: { organizationId, status: { in: ['active', 'trialing'] } },
    });
    if (sub) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          planCode: enterprise.code,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });
    } else {
      await tx.subscription.create({
        data: {
          organizationId,
          planCode: enterprise.code,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: end,
        },
      });
    }

    // Créditos, con clave de idempotencia: repetir el comando no los duplica.
    if (credits > 0) {
      await tx.creditLedgerEntry.upsert({
        where: { idempotencyKey: `admin-grant:${user.id}` },
        create: {
          organizationId,
          delta: credits,
          reason: 'adjustment',
          idempotencyKey: `admin-grant:${user.id}`,
          note: 'Créditos de la cuenta de administración',
        },
        update: {},
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'user_role_changed',
        targetType: 'user',
        targetId: user.id,
        // Nunca se registra la contraseña, ni su longitud.
        detail: { role: 'admin', plan: enterprise.code, promoted: Boolean(existing) } as never,
      },
    });

    return { user, organizationId, wasExisting: Boolean(existing) };
  });

  const balance = await prisma.creditLedgerEntry.aggregate({
    where: { organizationId: result.organizationId! },
    _sum: { delta: true },
  });

  console.log('');
  console.log(result.wasExisting ? 'Cuenta promovida a administrador.' : 'Cuenta de administrador creada.');
  console.log(`  Correo        : ${result.user.email}`);
  console.log(`  Rol           : ${result.user.role}`);
  console.log(`  Organización  : ${result.organizationId}`);
  console.log(`  Plan          : ${enterprise.name}`);
  console.log(`  Créditos      : ${balance._sum.delta ?? 0}`);
  console.log('');
  console.log('Puede entrar en la web con ese correo y su contraseña, y usar /api/v1/admin/*.');
  console.log('');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
    await closePool();
  });
