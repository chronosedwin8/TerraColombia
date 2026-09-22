#!/usr/bin/env node
/**
 * ¿Qué datos están vencidos y hay que volver a bajar?
 *
 *   pnpm --filter @terracolombia/db freshness              informe completo
 *   pnpm --filter @terracolombia/db freshness -- --vencidos  solo lo que toca refrescar
 *   pnpm --filter @terracolombia/db freshness -- --json     para encadenarlo con otra cosa
 *
 * POR QUÉ EXISTE
 *
 * Los datos del Estado cambian, cada fuente a su ritmo, y ninguna avisa. El catastro del IGAC
 * publica corte mensual; el censo del DANE es de 2018 y no va a cambiar; OpenStreetMap cambia
 * cada día. Sin una forma de mirar esto de un vistazo, la única manera de saber que un dato
 * está viejo es que alguien se dé cuenta —o que un usuario tome una decisión con un corte de
 * hace año y medio.
 *
 * El criterio NO se inventa aquí: sale de `meta.dataset.frequency`, que cada dataset declara
 * en su definición del catálogo, y de la fecha del corte activo en `meta.snapshot`. Este
 * archivo solo traduce eso a «al día», «conviene revisar» o «vencido», y dice con qué orden
 * se refresca cada uno.
 *
 * Lo que NO hace, a propósito: refrescar por su cuenta. Descargar 5 millones de predios es
 * una decisión con coste, y algunas fuentes se caen a rachas. Este informe dice qué toca; el
 * guion `infra/scripts/refresh.ps1` es el que actúa cuando se le pide.
 */
import { closePool, query } from '../pool.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';

/**
 * Cada cuántos días conviene volver a mirar la fuente, según la frecuencia que declara.
 *
 * No es lo mismo que el periodo de publicación: se revisa ANTES de que salga lo nuevo, con
 * margen. Un catastro mensual se mira a los 35 días y no a los 30, porque el IGAC no publica
 * el día 1 en punto, y avisar de «vencido» el día 30 sería ruido.
 *
 * `eventual` merece explicación: son fuentes que se actualizan cuando la entidad decide, sin
 * calendario. Un trimestre es un compromiso entre no molestar y no quedarse con un dato de
 * hace años sin enterarse.
 */
const DIAS_POR_FRECUENCIA: Record<string, number> = {
  diaria: 7, // OSM cambia a diario; bajarlo a diario no compensa, semanal sí.
  daily: 7,
  semanal: 10,
  mensual: 35,
  monthly: 35,
  trimestral: 100,
  anual: 400,
  yearly: 400,
  annual: 400,
  decenal: 3700, // El censo. Se revisa por si el DANE publica una reexpresión.
  eventual: 90,
  desconocida: 90,
};

/** Días tras los cuales se considera vencido y no solo «conviene revisar». */
function limiteVencido(dias: number): number {
  return Math.round(dias * 1.5);
}

type Estado = 'al-dia' | 'revisar' | 'vencido' | 'sin-corte';

interface Fila {
  id: string;
  source: string;
  frequency: string;
  target_table: string;
  cut_date: string | null;
  dias: number | null;
  filas: number | null;
}

function estadoDe(f: Fila): Estado {
  if (f.cut_date === null || f.dias === null) return 'sin-corte';
  const umbral = DIAS_POR_FRECUENCIA[f.frequency] ?? 90;
  if (f.dias > limiteVencido(umbral)) return 'vencido';
  if (f.dias > umbral) return 'revisar';
  return 'al-dia';
}

/**
 * Con qué orden se refresca cada dataset.
 *
 * Se deduce del identificador y de la tabla destino porque los cargadores son distintos: el
 * catastro y las amenazas tienen guion propio —bajan geodatabases y capas enormes— y el resto
 * pasa por el ETL genérico.
 */
function comandoDe(id: string): string {
  if (id.startsWith('igac-cadastre-')) {
    return `pnpm --filter @terracolombia/db load:cadastre -- --dept=${id.slice('igac-cadastre-'.length)}`;
  }
  if (id.startsWith('sgc-') || id.startsWith('ideam-')) {
    const only = id.includes('movimientos') ? 'mass-movement' : id.includes('sismica') ? 'seismic' : 'flood';
    return `pnpm --filter @terracolombia/db load:hazards -- --only=${only}`;
  }
  if (id === 'igac-limites-entidades-territoriales') return 'pnpm db:boundaries';
  if (id.startsWith('men-estadisticas')) return 'pnpm --filter @terracolombia/db load:education';
  if (id === 'runap-areas-protegidas') return 'pnpm --filter @terracolombia/db load:hazards -- --only=protected';
  return `pnpm etl -- run ${id}`;
}

const ETIQUETA: Record<Estado, string> = {
  'al-dia': 'al día',
  revisar: 'conviene revisar',
  vencido: 'VENCIDO',
  'sin-corte': 'sin corte cargado',
};

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const soloVencidos = args.includes('--vencidos');
  const comoJson = args.includes('--json');

  const filas = await query<Fila>(sql`
    SELECT d.id, d.source, d.frequency, d.target_table,
           s.cut_date::text AS cut_date,
           (CURRENT_DATE - s.cut_date)::int AS dias,
           s.row_count AS filas
    FROM meta.dataset d
    LEFT JOIN LATERAL (
      SELECT cut_date, row_count FROM meta.snapshot s2
      WHERE s2.dataset_id = d.id AND s2.is_active
      ORDER BY cut_date DESC LIMIT 1
    ) s ON TRUE
    -- Los cortes de demostración no se refrescan: son sintéticos por definición.
    WHERE d.id NOT LIKE 'demo-%'
    ORDER BY d.source, d.id
  `);

  const conEstado = filas.map((f) => ({
    ...f,
    estado: estadoDe(f),
    umbralDias: DIAS_POR_FRECUENCIA[f.frequency] ?? 90,
    comando: comandoDe(f.id),
  }));

  const pendientes = conEstado.filter((f) => f.estado === 'vencido' || f.estado === 'sin-corte');
  const porRevisar = conEstado.filter((f) => f.estado === 'revisar');

  if (comoJson) {
    console.log(JSON.stringify({ datasets: conEstado, pendientes: pendientes.length }, null, 2));
    return;
  }

  const mostrar = soloVencidos ? [...pendientes, ...porRevisar] : conEstado;

  console.log('\nVigencia de los datos\n');
  console.log(
    'dataset'.padEnd(42) + 'frecuencia'.padEnd(12) + 'corte'.padEnd(12) + 'edad'.padStart(7) + '  estado',
  );
  console.log('─'.repeat(100));
  for (const f of mostrar) {
    const edad = f.dias === null ? '—' : `${f.dias}d`;
    console.log(
      f.id.padEnd(42) +
        f.frequency.padEnd(12) +
        (f.cut_date ?? '—').padEnd(12) +
        edad.padStart(7) +
        '  ' +
        ETIQUETA[f.estado],
    );
  }

  console.log(
    `\n${conEstado.length} fuentes · ${conEstado.filter((f) => f.estado === 'al-dia').length} al día · ` +
      `${porRevisar.length} conviene revisar · ${pendientes.length} vencidas o sin corte`,
  );

  if (pendientes.length > 0 || porRevisar.length > 0) {
    console.log('\nPara actualizar:');
    const vistos = new Set<string>();
    for (const f of [...pendientes, ...porRevisar]) {
      // El catastro son 31 órdenes casi idénticas: se resume en una.
      const cmd = f.id.startsWith('igac-cadastre-')
        ? 'pnpm --filter @terracolombia/db load:cadastre -- --all   (los 31 departamentos)'
        : f.comando;
      if (vistos.has(cmd)) continue;
      vistos.add(cmd);
      console.log(`  ${cmd}`);
    }
  }

  console.log(
    '\nEl umbral de cada fuente sale de la frecuencia que ella misma declara en el catálogo,\n' +
      'con margen: se avisa antes de que salga la versión nueva, no el día exacto.\n',
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  })
  .finally(() => closePool());
