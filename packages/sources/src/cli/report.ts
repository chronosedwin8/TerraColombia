#!/usr/bin/env node
/**
 * `pnpm catalog:report` — regenera los `.md` de `data-catalog/` desde los `.json`
 * ya guardados, sin tocar la red.
 *
 * Es el comando a usar después de editar `etl/config/datasets/*.ts`: la selección
 * y la matriz módulo × dataset × campos se regeneran a partir del registro.
 */

import { loadCatalog, makePaths, writeReports } from '../crawler/catalog-writer.js';
import { loadSelection } from '../crawler/run.js';
import { hasFlag, parseArgs } from './args.js';

const USAGE = `
Uso: pnpm catalog:report -- [opciones]

  --help   Esta ayuda.

Regenera data-catalog/CATALOGO.md, SELECCION.md, RIESGOS.md y PII_DESCARTES.md
a partir de los .json ya escritos por "pnpm catalog:crawl". No hace peticiones.
`.trim();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (hasFlag(args, 'help')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const paths = makePaths();
  const catalog = await loadCatalog(paths);
  const selection = await loadSelection(paths);

  const layers = catalog.services.reduce((n, s) => n + s.layers.length + s.tables.length, 0);
  process.stdout.write(
    `Leído de ${paths.catalog}:\n` +
      `  ${catalog.services.length} servicios ArcGIS (${layers} capas/tablas)\n` +
      `  ${catalog.socrata.length} datasets de Socrata\n` +
      `  ${catalog.manual.length} descriptores manuales\n` +
      `  ${catalog.osm ? '1' : '0'} descriptor de OSM\n` +
      `  ${catalog.risks.length} riesgos, ${catalog.piiRecords.length} registros de PII\n` +
      `  ${selection.length} datasets declarados en etl/config\n\n`,
  );

  if (catalog.services.length === 0 && catalog.socrata.length === 0) {
    process.stderr.write(
      'No hay nada catalogado todavía. Ejecuta primero `pnpm catalog:crawl`.\n',
    );
    process.exitCode = 1;
    return;
  }

  const written = await writeReports(paths, catalog, selection);
  for (const path of written) process.stdout.write(`Escrito ${path}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `\nNo se pudo generar el informe: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exitCode = 1;
});
