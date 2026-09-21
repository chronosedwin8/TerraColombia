/**
 * Recalcula los agregados por celda H3 de uno o varios municipios.
 *
 * Es el paso `aggregate` del ETL, expuesto como orden suelta: después de sembrar o de
 * cargar una fuente nueva, `analytics.h3_cell` queda desactualizada y la aptitud de
 * terreno responde "sin datos suficientes" aunque el contexto ya esté en la base.
 *
 * Uso:
 *   pnpm --filter @terracolombia/db aggregate 08758           (resoluciones 8 y 9)
 *   pnpm --filter @terracolombia/db aggregate 08758 --res 9
 *   pnpm --filter @terracolombia/db aggregate --loaded        (todo lo que tenga predios)
 */
import { closePool, query } from '../pool.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';
import { rebuildCellsForMunicipality, refreshMuniSummary } from '../repositories/analytics.js';

const H3_RESOLUTIONS = [8, 9] as const;

async function municipalitiesWithData(): Promise<string[]> {
  const rows = await query<{ muni_code: string }>(sql`
    SELECT DISTINCT p.muni_code
    FROM core.parcel p
    JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
    ORDER BY 1
  `);
  return rows.map((r) => r.muni_code);
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const resArg = args.indexOf('--res');
  const resolutions =
    resArg >= 0 && args[resArg + 1] ? [Number(args[resArg + 1])] : [...H3_RESOLUTIONS];

  let munis = args.filter((a) => /^\d{5}$/.test(a));
  if (args.includes('--loaded') || munis.length === 0) {
    munis = await municipalitiesWithData();
    if (munis.length === 0) {
      console.log('No hay municipios con predios cargados. Nada que agregar.');
      return;
    }
    console.log(`Municipios con datos cargados: ${munis.length}`);
  }

  for (const muni of munis) {
    for (const res of resolutions) {
      const started = Date.now();
      const n = await rebuildCellsForMunicipality(muni, res);
      console.log(`  · ${muni} res ${res}: ${n} celdas en ${Date.now() - started} ms`);
    }
  }

  await refreshMuniSummary();
  console.log('  · vista analytics.muni_summary refrescada');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
