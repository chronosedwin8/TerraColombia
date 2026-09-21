import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, getLogger } from '@terracolombia/shared';
import { getPrisma } from '@terracolombia/db';
import { hashIp, hashPassword } from '../plugins/auth.js';
import { plainEnvelope } from '../lib/envelope.js';

const log = getLogger({ mod: 'password-reset' });
const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Restablecimiento de contraseña.
 *
 * Dos decisiones que importan:
 *
 * 1. **La respuesta es siempre la misma**, exista o no el correo. Si dijera "ese correo no
 *    está registrado", cualquiera podría averiguar quién tiene cuenta probando correos.
 * 2. **El token en claro no se guarda ni se registra**: en la base queda su SHA-256, y el
 *    token solo viaja al usuario. Aquí no hay envío de correo todavía, así que el token
 *    queda pendiente de entrega y el sistema lo dice con claridad en el log del servidor,
 *    no en la respuesta.
 */
export default async function passwordResetRoutes(app: FastifyInstance): Promise<void> {
  const prisma = getPrisma();

  app.post(
    '/password-reset',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: {
        tags: ['cuenta'],
        summary: 'Solicitar el restablecimiento de la contraseña',
        description:
          'La respuesta es idéntica exista o no el correo, para no revelar quién tiene cuenta.',
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
      },
    },
    async (req) => {
      const { email } = z.object({ email: z.string().email().max(200) }).parse(req.body);
      const normalized = email.toLowerCase().trim();

      const user = await prisma.user.findUnique({ where: { email: normalized } });

      if (user && user.isActive) {
        const token = randomBytes(32).toString('base64url');
        await prisma.passwordReset.create({
          data: {
            userId: user.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
            ipHash: hashIp(req.ip),
          },
        });

        // El envío del correo depende de un proveedor que este despliegue no tiene. Se deja
        // constancia de que la solicitud existe, SIN el token, para no filtrarlo por el log.
        log.warn(
          { userId: user.id },
          'Solicitud de restablecimiento creada. Falta configurar el proveedor de correo saliente: ' +
            'el token no se pudo entregar.',
        );
      }

      return plainEnvelope({
        ok: true,
        message:
          'Si ese correo tiene una cuenta, le enviaremos las instrucciones para restablecer la contraseña. ' +
          'Revisa también la carpeta de no deseados.',
        // Se declara la limitación en vez de dejar creer que el correo salió.
        deliveryConfigured: false,
      });
    },
  );

  app.post(
    '/password-reset/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        tags: ['cuenta'],
        summary: 'Fijar una contraseña nueva con el token recibido',
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', minLength: 20, maxLength: 200 },
            password: { type: 'string', minLength: 10, maxLength: 200 },
          },
        },
      },
    },
    async (req) => {
      const body = z
        .object({
          token: z.string().min(20).max(200),
          password: z
            .string()
            .min(10, 'La contraseña debe tener al menos 10 caracteres')
            .max(200),
        })
        .parse(req.body);

      const tokenHash = createHash('sha256').update(body.token).digest('hex');
      const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });

      if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        throw new AppError(
          'UNAUTHORIZED',
          'Ese enlace ya no sirve: puede haber caducado o haberse usado. Pide uno nuevo.',
          {},
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: reset.userId },
          data: { passwordHash: await hashPassword(body.password) },
        });
        await tx.passwordReset.update({
          where: { id: reset.id },
          data: { usedAt: new Date() },
        });
        // Cambiar la contraseña cierra todas las sesiones abiertas: si alguien entró con la
        // anterior, deja de tener acceso en ese momento.
        await tx.refreshToken.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            userId: reset.userId,
            action: 'password_reset',
            ipHash: hashIp(req.ip),
          },
        });
      });

      return plainEnvelope({
        ok: true,
        message: 'Contraseña actualizada. Se cerraron las demás sesiones por seguridad.',
      });
    },
  );
}
