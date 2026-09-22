#!/usr/bin/env node
/**
 * Enciende o apaga los cortes de demostración.
 *
 *   pnpm --filter @terracolombia/db demo              qué hay publicado ahora
 *   pnpm --filter @terracolombia/db demo -- --off     apagar (lo que va a producción)
 *   pnpm --filter @terracolombia/db demo -- --on      volver a encender
 *
 * POR QUÉ EXISTE
 *
 * Los datos sintéticos de Soledad hicieron su trabajo: permitieron construir y revisar el
 * producto entero antes de tener una sola fuente real. Pero en cuanto entran los datos de
 * verdad se vuelven un riesgo, y de dos maneras distintas:
 *
 *  · Donde YA hay reemplazo real, son ruido peligroso. Seis colegios inventados conviviendo
 *    con 71.667 reales no aportan nada, y alguien puede hacer clic justo en uno de los seis.
 *  · Donde NO hay reemplazo —suelos, población por manzana, relieve—, son peor: el motor de
 *    aptitud los puntúa como si fueran ciertos y devuelve un semáforo con pendientes,
 *    clases agrológicas y población que nadie midió. El banner avisa, pero un aviso no
 *    sustituye a no mentir: el producto está diseñado para responder «sin datos
 *    suficientes», y esa respuesta es más útil que un número inventado.
 *
 * Apagar no borra nada. Los cortes quedan en `meta.snapshot` con `is_active = false`, así
 * que se pueden volver a encender para una demostración comercial sin recargar nada.
 */
import { closePool, execute, query } from '../pool.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';

interface Fila {
  dataset_id: string;
  cut_date: string;
  is_active: boolean;
  status: string;
}

async function listar(): Promise<Fila[]> {
  return query<Fila>(sql`
    SELECT dataset_id, cut_date::text AS cut_date, is_active, status
    FROM meta.snapshot
    WHERE is_synthetic
    ORDER BY dataset_id
  `);
}

/** Cuántas filas reales y cuántas sintéticas hay de cada tema, para decidir con datos. */
async function comparativa() {
  return query<{ tema: string; reales: number; sinteticos: number }>(sql`
    SELECT 'colegios' AS tema,
           count(*) FILTER (WHERE NOT s.is_synthetic)::int AS reales,
           count(*) FILTER (WHERE s.is_synthetic)::int AS sinteticos
    FROM ctx.school t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'prestadores de salud',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM ctx.health_facility t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'predios',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM core.parcel t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'perímetros urbanos',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM core.urban_perimeter t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'unidades de suelo',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM ctx.soil_unit t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'manzanas censales',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM ctx.census_block t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    UNION ALL SELECT 'celdas de relieve',
           count(*) FILTER (WHERE NOT s.is_synthetic)::int,
           count(*) FILTER (WHERE s.is_synthetic)::int
    FROM ctx.elevation_cell t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
    ORDER BY 1
  `);
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const apagar = args.includes('--off');
  const encender = args.includes('--on');

  if (apagar && encender) {
    console.error('--on y --off no se pueden pedir a la vez.');
    process.exitCode = 1;
    return;
  }

  if (apagar) {
    const n = await execute(sql`
      UPDATE meta.snapshot SET is_active = FALSE, status = 'superseded'
      WHERE is_synthetic AND is_active
    `);
    console.log(`\n${n} corte(s) de demostración apagado(s).`);
    console.log('Los datos no se borran: quedan inactivos y se pueden volver a encender.\n');
  } else if (encender) {
    const n = await execute(sql`
      UPDATE meta.snapshot SET is_active = TRUE, status = 'published'
      WHERE is_synthetic AND NOT is_active
    `);
    console.log(`\n${n} corte(s) de demostración encendido(s).`);
    console.log('AVISO: la interfaz volverá a mostrar la banda roja de datos de demostración.\n');
  }

  const cortes = await listar();
  const activos = cortes.filter((c) => c.is_active);

  console.log('Cortes de demostración:\n');
  for (const c of cortes) {
    console.log(`  ${c.dataset_id.padEnd(30)} ${c.cut_date}  ${c.is_active ? 'ACTIVO' : 'apagado'}`);
  }
  console.log(`\n${activos.length} activo(s) de ${cortes.length}.`);

  if (!apagar && !encender) {
    console.log('\nReales frente a sintéticos, por tema:\n');
    console.log('  tema'.padEnd(26) + 'reales'.padStart(10) + 'sintéticos'.padStart(13));
    for (const x of await comparativa()) {
      console.log('  ' + x.tema.padEnd(24) + String(x.reales).padStart(10) + String(x.sinteticos).padStart(13));
    }
    console.log(
      '\nDonde los reales son cero, apagar la demostración deja el indicador sin dato: el\n' +
        'motor responderá «sin datos suficientes», que es la respuesta honesta y para la que\n' +
        'está diseñado.\n',
    );
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
