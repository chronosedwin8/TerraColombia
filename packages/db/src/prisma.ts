import { PrismaClient } from '@prisma/client';

/**
 * Prisma solo gestiona el esquema `app` (regla 8 de CLAUDE.md). Todo lo geográfico va por
 * `pool.ts` con SQL crudo.
 */
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log:
        process.env.NODE_ENV === 'production'
          ? ['warn', 'error']
          : ['warn', 'error'],
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
