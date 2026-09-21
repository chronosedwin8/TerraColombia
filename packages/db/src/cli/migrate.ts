#!/usr/bin/env node
/**
 * CLI de migraciones.
 *   tsx src/cli/migrate.ts up|status|reset
 */
import { closePool, healthCheck } from '../pool.js';
import { migrateUp, migrationStatus, resetSchemas } from '../migrator.js';
import { loadEnv } from '../env.js';

const CMD = process.argv[2] ?? 'up';

async function main(): Promise<void> {
  loadEnv();

  if (CMD === 'status') {
    const rows = await migrationStatus();
    console.log('\nVersión  Estado     Nombre');
    console.log('───────  ─────────  ────────────────────────────────────');
    for (const r of rows) {
      const state =
        r.state === 'applied' ? 'aplicada ' : r.state === 'pending' ? 'pendiente' : 'DIVERGE  ';
      console.log(`${r.version}     ${state}  ${r.name}`);
    }
    const pending = rows.filter((r) => r.state === 'pending').length;
    console.log(`\n${rows.length} migraciones, ${pending} pendientes.\n`);
    return;
  }

  if (CMD === 'reset') {
    if (process.env.ALLOW_DB_RESET !== 'true') {
      console.error(
        'reset es destructivo. Vuelve a ejecutarlo con ALLOW_DB_RESET=true si es lo que quieres.',
      );
      process.exitCode = 1;
      return;
    }
    await resetSchemas();
    console.log('Esquemas eliminados. Ejecuta `pnpm db:migrate` para recrearlos.');
    return;
  }

  if (CMD !== 'up') {
    console.error(`Comando no reconocido: ${CMD}. Usa up, status o reset.`);
    process.exitCode = 1;
    return;
  }

  const health = await healthCheck();
  if (!health.postgres) {
    console.error('No hay conexión a PostgreSQL. Revisa DATABASE_URL.');
    for (const p of health.problems) console.error(`  · ${p}`);
    process.exitCode = 1;
    return;
  }

  const result = await migrateUp();
  if (result.applied.length === 0) {
    console.log('Sin migraciones pendientes.');
  } else {
    console.log(`Aplicadas ${result.applied.length} migraciones:`);
    for (const a of result.applied) console.log(`  · ${a}`);
  }

  const after = await healthCheck();
  console.log('\nEstado de la base:');
  console.log(`  PostgreSQL : ${after.postgres?.split(',')[0] ?? 'NO_DISPONIBLE'}`);
  console.log(`  PostGIS    : ${after.postgis ?? 'NO_DISPONIBLE'}`);
  console.log(`  h3         : ${after.h3 ? 'sí' : 'NO_DISPONIBLE'}`);
  console.log(`  EPSG:9377  : ${after.srid9377 ? 'sí' : 'falta'}`);
  for (const p of after.problems) console.log(`  aviso: ${p}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
