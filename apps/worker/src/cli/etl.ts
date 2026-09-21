#!/usr/bin/env node
/**
 * CLI del ETL.
 *
 *   pnpm etl -- list                         Lista los datasets declarados y su estado
 *   pnpm etl -- run <datasetId> [opciones]   Ejecuta el pipeline de un dataset
 *   pnpm etl -- status [datasetId]           Últimas corridas y validaciones
 *   pnpm etl -- aggregate <muniCode> [res]   Recalcula los agregados por celda H3
 *   pnpm etl -- diff <deptCode> <from> <to>  Compara dos cortes del catastro
 *
 * Opciones de `run`:
 *   --cut-date=AAAA-MM-DD   Fuerza la fecha de corte
 *   --only=a,b              Ejecuta solo esos pasos
 *   --skip=a,b              Salta esos pasos
 *   --dry-run               Carga y valida, pero no publica
 */
import { closePool, disconnectPrisma, listSnapshots, listValidations, query } from '@terracolombia/db';
import { sql } from '@terracolombia/db/sql';
import { rebuildCellsForMunicipality, refreshMuniSummary, computeParcelDiff, upsertMuniDynamics } from '@terracolombia/db';
import { loadEnvFile } from '../env.js';
import { formatRunReport, runPipeline } from '../etl/pipeline.js';
import type { StepName } from '../etl/pipeline.js';
import { buildPipeline } from '../etl/generic-pipeline.js';
import type { JobContext } from '../queue.js';

loadEnvFile();

/** Contexto de trabajo para la terminal: el progreso se imprime en una línea. */
function terminalContext(): JobContext {
  let lastPercent = -1;
  return {
    jobId: `cli-${Date.now()}`,
    attempt: 1,
    async progress(percent, message) {
      if (percent === lastPercent && !message) return;
      lastPercent = percent;
      process.stdout.write(`\r  ${String(percent).padStart(3)} %  ${(message ?? '').padEnd(60)}`);
      if (percent >= 100) process.stdout.write('\n');
    },
    async log(message) {
      process.stdout.write(`\n  · ${message}\n`);
    },
  };
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const a of args) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

async function main(): Promise<void> {
  // `pnpm etl -- list` no siempre se come el `--`: según la versión de pnpm y el sistema,
  // llega como primer argumento y la orden se leería como "--", que no existe. Se descarta
  // aquí para que la forma documentada funcione en todas partes.
  const argv = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'));
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const positional = rest.filter((a) => !a.startsWith('--'));

  const config = await import('@terracolombia/etl-config').catch(() => null);
  if (!config) {
    console.error(
      'No se pudo cargar etl/config. Verifica que los datasets estén declarados en etl/config/datasets/.',
    );
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'list': {
      const datasets = config.DATASET_LIST;
      console.log('\nId                              Fuente     Fase  Prio  Inspección     Destino');
      console.log('──────────────────────────────  ─────────  ────  ────  ─────────────  ─────────────────────');
      for (const d of datasets) {
        console.log(
          `${d.id.padEnd(30)}  ${d.source.padEnd(9)}  ${String(d.phase).padStart(4)}  ` +
            `${String(d.priority).padStart(4)}  ${String(d.inspection).padEnd(13)}  ${d.targetTable}`,
        );
      }
      const pending = config.uninspectedDatasets();
      console.log(`\n${datasets.length} datasets declarados, ${pending.length} sin mapeo inspeccionado.`);
      if (pending.length > 0) {
        console.log('Sin inspeccionar (no se pueden ingerir todavía):');
        for (const d of pending) console.log(`  · ${d.id}`);
      }
      console.log('');
      return;
    }

    case 'run': {
      const datasetId = positional[0];
      if (!datasetId) {
        console.error('Falta el identificador del dataset. Usa `pnpm etl -- list` para verlos.');
        process.exitCode = 1;
        return;
      }
      const dataset = config.tryGetDataset(datasetId);
      if (!dataset) {
        console.error(`No existe el dataset "${datasetId}". Usa \`pnpm etl -- list\`.`);
        process.exitCode = 1;
        return;
      }

      console.log(`\nEjecutando ${dataset.id} (${dataset.source} · ${dataset.name})`);
      console.log(`Destino: ${dataset.targetTable}\n`);

      const pipeline = buildPipeline(dataset, {
        isInspected: config.isInspected,
        isPiiColumn: config.isPiiColumn,
      });
      const report = await runPipeline(pipeline, terminalContext(), {
        cutDate: typeof flags['cut-date'] === 'string' ? flags['cut-date'] : undefined,
        only: typeof flags.only === 'string' ? (flags.only.split(',') as StepName[]) : undefined,
        skip: typeof flags.skip === 'string' ? (flags.skip.split(',') as StepName[]) : undefined,
        dryRun: flags['dry-run'] === true,
      });

      console.log(formatRunReport(report));
      if (report.blockingErrors > 0) process.exitCode = 1;
      return;
    }

    case 'status': {
      const datasetId = positional[0];
      if (datasetId) {
        const snapshots = await listSnapshots(datasetId, 20);
        console.log(`\nCortes de ${datasetId}:`);
        console.log('Corte        Estado        Activo  Sintético  Filas      Cargado');
        console.log('───────────  ────────────  ──────  ─────────  ─────────  ───────────────────');
        for (const s of snapshots) {
          console.log(
            `${String(s.cut_date).padEnd(11)}  ${s.status.padEnd(12)}  ` +
              `${(s.is_active ? 'sí' : 'no').padEnd(6)}  ${(s.is_synthetic ? 'sí' : 'no').padEnd(9)}  ` +
              `${String(s.row_count ?? '-').padStart(9)}  ${String(s.loaded_at).slice(0, 19)}`,
          );
        }
        const active = snapshots.find((s) => s.is_active);
        if (active) {
          const validations = await listValidations(active.id);
          console.log(`\nValidaciones del corte activo (${active.cut_date}):`);
          for (const v of validations as Array<Record<string, unknown>>) {
            const mark = v.passed ? 'ok   ' : v.severity === 'error' ? 'ERROR' : 'aviso';
            console.log(`  ${mark}  ${v.check_name}: ${v.message}`);
          }
        }
        console.log('');
        return;
      }

      const rows = await query(sql`
        SELECT d.id, d.source, s.cut_date::text AS cut_date, s.status, s.is_active, s.row_count
        FROM meta.dataset d
        LEFT JOIN LATERAL (
          SELECT * FROM meta.snapshot s2 WHERE s2.dataset_id = d.id ORDER BY s2.cut_date DESC LIMIT 1
        ) s ON TRUE
        ORDER BY d.source, d.id
      `);
      console.log('\nId                              Fuente     Último corte  Estado        Filas');
      console.log('──────────────────────────────  ─────────  ────────────  ────────────  ─────────');
      for (const r of rows as Array<Record<string, unknown>>) {
        console.log(
          `${String(r.id).padEnd(30)}  ${String(r.source).padEnd(9)}  ` +
            `${String(r.cut_date ?? '-').padEnd(12)}  ${String(r.status ?? 'sin cortes').padEnd(12)}  ` +
            `${String(r.row_count ?? '-').padStart(9)}`,
        );
      }
      console.log('');
      return;
    }

    case 'aggregate': {
      // Sin resolución explícita se recalculan las dos que usa el producto: la 8 alimenta la
      // vista de conjunto y la 9 el detalle. Recalcular solo una deja la otra desfasada, que
      // es difícil de notar porque nada falla: los mapas simplemente muestran datos viejos.
      const resolutions = positional[1] ? [Number(positional[1])] : [8, 9];
      let munis: string[];

      if (flags.loaded) {
        munis = (
          await query<{ muni_code: string }>(sql`
            SELECT DISTINCT p.muni_code
            FROM core.parcel p
            JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
            ORDER BY 1
          `)
        ).map((r) => r.muni_code);
        if (munis.length === 0) {
          console.log('No hay municipios con predios cargados. Nada que recalcular.');
          return;
        }
        console.log(`Municipios con datos cargados: ${munis.length}`);
      } else {
        const muniCode = positional[0];
        if (!muniCode || !/^\d{5}$/.test(muniCode)) {
          console.error(
            'Uso: pnpm etl -- aggregate <muniCode de 5 dígitos> [resolución H3]\n' +
              '     pnpm etl -- aggregate --loaded    (todo lo que tenga predios cargados)',
          );
          process.exitCode = 1;
          return;
        }
        munis = [muniCode];
      }

      for (const muni of munis) {
        for (const res of resolutions) {
          const started = Date.now();
          const cells = await rebuildCellsForMunicipality(muni, res);
          console.log(`  · ${muni} res ${res}: ${cells} celdas en ${Date.now() - started} ms`);
        }
      }
      await refreshMuniSummary();
      console.log('Vista municipal refrescada.');
      return;
    }

    case 'diff': {
      const [deptCode, fromCut, toCut] = positional;
      if (!deptCode || !fromCut || !toCut) {
        console.error('Uso: pnpm etl -- diff <deptCode> <corteAnterior> <corteNuevo>');
        process.exitCode = 1;
        return;
      }
      const snapshots = await query<{ id: number; cut_date: string }>(sql`
        SELECT id, cut_date::text AS cut_date FROM meta.snapshot
        WHERE cut_date IN (${fromCut}::date, ${toCut}::date)
          AND status IN ('published', 'superseded')
        ORDER BY cut_date
      `);
      const from = snapshots.find((s) => s.cut_date === fromCut);
      const to = snapshots.find((s) => s.cut_date === toCut);
      if (!from || !to) {
        console.error(
          `No encontramos ambos cortes publicados. Disponibles: ${snapshots.map((s) => s.cut_date).join(', ') || 'ninguno'}`,
        );
        process.exitCode = 1;
        return;
      }
      console.log(`Comparando ${fromCut} → ${toCut} en el departamento ${deptCode}…`);
      const result = await computeParcelDiff(deptCode, from.id, to.id);
      console.log(
        `  Altas: ${result.created} · Bajas: ${result.removed} · ` +
          `Cambios de atributos: ${result.attrsChanged} · Cambios de geometría: ${result.geometryChanged}`,
      );

      const munis = await query<{ muni_code: string }>(sql`
        SELECT DISTINCT muni_code FROM core.parcel_change
        WHERE dept_code = ${deptCode} AND from_snapshot = ${from.id} AND to_snapshot = ${to.id}
      `);
      for (const m of munis) {
        const counts = await query<{ change_type: string; n: number }>(sql`
          SELECT change_type, count(*)::int AS n FROM core.parcel_change
          WHERE muni_code = ${m.muni_code} AND from_snapshot = ${from.id} AND to_snapshot = ${to.id}
          GROUP BY change_type
        `);
        const byType = Object.fromEntries(counts.map((c) => [c.change_type, c.n]));
        await upsertMuniDynamics({
          muniCode: m.muni_code,
          fromCutDate: fromCut,
          toCutDate: toCut,
          created: byType.created ?? 0,
          removed: byType.removed ?? 0,
          geomChanged: byType.geometry_changed ?? 0,
          attrsChanged: byType.attrs_changed ?? 0,
          buildingsAdded: byType.building_added ?? 0,
        });
      }
      console.log(`  Dinámica predial actualizada en ${munis.length} municipio(s).`);
      return;
    }

    default:
      console.log(
        [
          '',
          'CLI del ETL de TerraColombia',
          '',
          '  pnpm etl -- list                          Datasets declarados y su estado de inspección',
          '  pnpm etl -- run <datasetId> [opciones]    Ejecuta el pipeline completo de un dataset',
          '  pnpm etl -- status [datasetId]            Cortes, estado y validaciones',
          '  pnpm etl -- aggregate <muniCode> [res]    Recalcula los agregados por celda H3',
          '  pnpm etl -- aggregate --loaded            …en todo municipio con predios cargados',
          '  pnpm etl -- diff <dept> <from> <to>       Compara dos cortes del catastro',
          '',
          'Opciones de run:',
          '  --cut-date=AAAA-MM-DD   Fuerza la fecha de corte',
          '  --only=paso1,paso2      Ejecuta solo esos pasos',
          '  --skip=paso1,paso2      Salta esos pasos',
          '  --dry-run               Carga y valida, pero no publica',
          '',
        ].join('\n'),
      );
      if (command) process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
    await disconnectPrisma();
  });
