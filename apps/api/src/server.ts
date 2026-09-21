import { loadEnvFile } from './lib/env.js';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { closePool, disconnectPrisma, healthCheck } from '@terracolombia/db';

loadEnvFile();

async function main(): Promise<void> {
  const config = loadConfig();

  // Comprobación temprana: mejor no levantar que servir errores.
  const health = await healthCheck();
  if (!health.postgres) {
    console.error('No hay conexión a PostgreSQL. Revisa DATABASE_URL en .env.');
    for (const p of health.problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  for (const p of health.problems) console.warn(`aviso: ${p}`);

  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Cerrando');
    try {
      await app.close();
      await closePool();
      await disconnectPrisma();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'Promesa rechazada sin manejar');
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { port: config.port, docs: `${config.publicApiUrl}/docs` },
    'TerraColombia API escuchando',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
