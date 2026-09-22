#!/usr/bin/env node
/**
 * Indicadores educativos municipales del Ministerio de Educación.
 *
 *   pnpm --filter @terracolombia/db load:education
 *   pnpm --filter @terracolombia/db load:education -- --year=2024
 *
 * POR QUÉ ESTE DATASET Y NO OTRO
 *
 * El observatorio municipal no tenía ni un indicador cargado, y el motor de
 * puntuación pide población en edad escolar —`school_age_population`— que es
 * obligatoria para la plantilla de colegio. La vía natural sería el censo del
 * DANE, pero:
 *
 *   · La población por MANZANA no se publica, y no es un descuido: a ese detalle
 *     el dato permitiría identificar hogares, así que la confidencialidad
 *     estadística lo impide. El Marco Geoestadístico trae las 504.996 manzanas
 *     con geometría, pero sin una sola cifra de población.
 *   · Por centro poblado sí hay datos abiertos, pero son parciales (674 y 337
 *     filas frente a los miles que existen) y cruzan por NOMBRE, no por código.
 *     Emparejar «Santa Marta DTCH» con una geometría por parecido de texto es
 *     exactamente la clase de unión que asigna la población de un pueblo a otro.
 *   · Las proyecciones municipales nacionales del DANE no están publicadas como
 *     conjunto en datos.gov.co; solo hay proyecciones sueltas de municipios
 *     concretos.
 *
 * Este conjunto del MEN sí cruza por `c_digo_municipio` (DIVIPOLA de 5 dígitos),
 * cubre el país entero y trae la serie por año. Da la población en edad escolar
 * de verdad, más cobertura, deserción, aprobación y repitencia, que es material
 * del observatorio. Lo que NO da es población total: eso sigue pendiente y se
 * declara como tal (regla 6).
 */
import { MUNI_INDICATOR_BY_ID } from '@terracolombia/shared';
import { closePool, execute, query, queryOne } from '../pool.js';
import { recomputeRanks } from '../repositories/analytics.js';
import { sql } from '../sql.js';
import { loadEnv } from '../env.js';

const DATASET_ID = 'men-estadisticas-educacion-municipio';
const SOCRATA_ID = 'nudc-7mev';
const RESOURCE = `https://www.datos.gov.co/resource/${SOCRATA_ID}.json`;
const PAGE = 5000;

/**
 * Campos reales del recurso, inspeccionados el 2026-09-22 sobre la respuesta del
 * propio servicio. Ninguno está inventado (regla 2).
 */
interface MenRow {
  a_o?: string;
  c_digo_municipio?: string;
  poblaci_n_5_16?: string;
  cobertura_neta?: string;
  cobertura_bruta?: string;
  deserci_n?: string;
  aprobaci_n?: string;
  reprobaci_n?: string;
  repitencia?: string;
  tasa_matriculaci_n_5_16?: string;
}

/**
 * Del nombre del campo en la fuente al identificador de indicador del producto.
 * La unidad viaja con él porque una cifra sin unidad no se puede mostrar (regla 4).
 */
const INDICADORES: Array<{ campo: keyof MenRow; id: string; unidad: string }> = [
  { campo: 'poblaci_n_5_16', id: 'school_age_population', unidad: 'personas' },
  { campo: 'tasa_matriculaci_n_5_16', id: 'education_enrollment_rate', unidad: '%' },
  { campo: 'cobertura_neta', id: 'education_net_coverage', unidad: '%' },
  { campo: 'cobertura_bruta', id: 'education_gross_coverage', unidad: '%' },
  { campo: 'deserci_n', id: 'education_dropout_rate', unidad: '%' },
  { campo: 'aprobaci_n', id: 'education_pass_rate', unidad: '%' },
  { campo: 'reprobaci_n', id: 'education_fail_rate', unidad: '%' },
  { campo: 'repitencia', id: 'education_repetition_rate', unidad: '%' },
];

/** Número o null. La fuente usa cadena vacía y guiones para el dato que no tiene. */
function numero(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const limpio = raw.trim().replace(',', '.');
  if (limpio === '' || limpio === '-' || limpio === 'ND') return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

async function descargar(year: string | null): Promise<MenRow[]> {
  const filas: MenRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      $limit: String(PAGE),
      $offset: String(offset),
      $order: 'a_o,c_digo_municipio',
    });
    if (year) params.set('a_o', year);
    const res = await fetch(`${RESOURCE}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${SOCRATA_ID}`);
    const lote = (await res.json()) as MenRow[];
    filas.push(...lote);
    process.stdout.write(`\r  descargadas ${filas.length} filas…`);
    if (lote.length < PAGE) break;
  }
  process.stdout.write('\n');
  return filas;
}

async function main(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const yearArg = args.find((a) => a.startsWith('--year='));
  const year = yearArg ? yearArg.slice('--year='.length) : null;

  console.log('Indicadores educativos municipales · MEN\n');
  const filas = await descargar(year);

  // Solo los municipios que existen en DIVIPOLA: la fuente trae también filas
  // agregadas por entidad territorial certificada, que no son municipios.
  const validos = new Set(
    (await query<{ code: string }>(sql`SELECT code FROM core.municipality`)).map((r) => r.code),
  );

  await execute(sql`
    INSERT INTO meta.dataset (id, source, name, description, license, attribution, frequency,
                              connector, format, source_srid, target_table, share_alike, url, updated_at)
    VALUES (${DATASET_ID}, 'MEN',
            'Estadísticas en educación preescolar, básica y media por municipio',
            'Población en edad escolar (5 a 16 años) y tasas de cobertura, deserción, aprobación, reprobación y repitencia, por municipio y año.',
            'datos-abiertos-co',
            'Fuente: Ministerio de Educación Nacional, Estadísticas en Educación por municipio',
            'anual', 'socrata', 'json', NULL, 'analytics.muni_indicator', FALSE,
            ${`https://www.datos.gov.co/d/${SOCRATA_ID}`}, now())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
  `);

  const periodos = [...new Set(filas.map((f) => f.a_o).filter((a): a is string => Boolean(a)))];
  const corte = periodos.sort().at(-1) ?? String(new Date().getFullYear());

  const snap = await queryOne<{ id: number }>(sql`
    INSERT INTO meta.snapshot (dataset_id, cut_date, is_synthetic, status, stage_method, row_count)
    VALUES (${DATASET_ID}, ${`${corte}-12-31`}::date, FALSE, 'transformed', 'socrata', ${filas.length})
    ON CONFLICT (dataset_id, cut_date) DO UPDATE SET status = 'transformed', row_count = EXCLUDED.row_count
    RETURNING id
  `);
  const snapshotId = snap!.id;

  await execute(sql`
    DELETE FROM analytics.muni_indicator
    WHERE jsonb_exists(source_snapshots, ${DATASET_ID})
  `);

  let insertados = 0;
  let descartadas = 0;
  for (const fila of filas) {
    const muni = fila.c_digo_municipio?.padStart(5, '0');
    const periodo = fila.a_o;
    if (!muni || !periodo || !validos.has(muni)) {
      descartadas += 1;
      continue;
    }
    for (const ind of INDICADORES) {
      const valor = numero(fila[ind.campo]);
      // Un indicador sin valor no se guarda como 0: se omite, y el producto dirá
      // que no hay dato en vez de afirmar que vale cero (regla 4).
      if (valor === null) continue;
      await execute(sql`
        INSERT INTO analytics.muni_indicator
          (muni_code, indicator, period, value, unit, source_snapshots, computed_at)
        VALUES (${muni}, ${ind.id}, ${periodo}, ${valor}, ${ind.unidad},
                jsonb_build_object(${DATASET_ID}::text, ${snapshotId}::int), now())
        ON CONFLICT (muni_code, indicator, period) DO UPDATE
          SET value = EXCLUDED.value, unit = EXCLUDED.unit,
              source_snapshots = EXCLUDED.source_snapshots, computed_at = now()
      `);
      insertados += 1;
    }
  }

  await execute(sql`SELECT meta.publish_snapshot(${snapshotId})`);

  // Puesto nacional por indicador y periodo, con la dirección del catálogo: en deserción,
  // reprobación y repitencia gana el valor más bajo. Sin este paso el observatorio no podía
  // decir «puesto N de M» (124.867 filas cargadas y ninguna con puesto).
  const pares = await query<{ indicator: string; period: string }>(sql`
    SELECT DISTINCT indicator, period FROM analytics.muni_indicator
    WHERE jsonb_exists(source_snapshots, ${DATASET_ID})
  `);
  for (const par of pares) {
    const def = MUNI_INDICATOR_BY_ID[par.indicator];
    if (def?.higherIsBetter === null || def?.higherIsBetter === undefined) continue;
    await recomputeRanks(par.indicator, par.period, def.higherIsBetter);
  }
  console.log(`puestos nacionales recalculados en ${pares.length} pares indicador/periodo`);

  const resumen = await query<{ indicator: string; n: number; municipios: number }>(sql`
    SELECT indicator, count(*)::int AS n, count(DISTINCT muni_code)::int AS municipios
    FROM analytics.muni_indicator
    WHERE jsonb_exists(source_snapshots, ${DATASET_ID})
    GROUP BY indicator ORDER BY indicator
  `);

  console.log(`\n${insertados} valores cargados · ${descartadas} filas descartadas por no ser municipio DIVIPOLA`);
  console.log(`corte publicado: ${corte}\n`);
  console.log('indicador'.padEnd(32), 'valores'.padStart(9), 'municipios'.padStart(11));
  for (const r of resumen) {
    console.log(r.indicator.padEnd(32), String(r.n).padStart(9), String(r.municipios).padStart(11));
  }
  console.log(`\nde ${validos.size} municipios del país.`);
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
