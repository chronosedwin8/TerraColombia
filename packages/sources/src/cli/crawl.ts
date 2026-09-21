#!/usr/bin/env node
/**
 * `pnpm catalog:crawl` — recorre las fuentes y puebla `data-catalog/`.
 *
 * Banderas:
 *   --source <claves>      Fuentes a recorrer, separadas por coma. `all` por defecto.
 *                          Disponibles: igac-arcgis, igac-socrata, dane-socrata,
 *                          men-socrata, minsalud-socrata, secop-socrata, osm, manual.
 *   --max-depth <n>        Profundidad máxima de carpetas ArcGIS (por defecto, la del spec).
 *   --no-samples           No traer muestras de registros (más rápido, menos útil).
 *   --sample-size <n>      Tamaño de la muestra por capa (por defecto 5, como pide §6.2).
 *   --concurrency <n>      Peticiones simultáneas (por defecto 2; no subir sin motivo).
 *   --resume               Saltar los servicios ya catalogados sin error.
 *   --no-cache             Ignorar la caché HTTP en disco.
 *   --max-layers <n>       Límite de capas por servicio (para pruebas rápidas).
 *   --max-per-family <n>   Servicios por familia de nombre (por defecto 3).
 *   --max-per-folder <n>   Servicios por carpeta (por defecto 25).
 *   --max-services <n>     Tope global de servicios ArcGIS (por defecto 200).
 *   --help
 */

import { runCrawl } from '../crawler/run.js';
import { resolveSourceKeys } from '../crawler/sources.js';
import { flagBool, flagNumber, flagString, hasFlag, parseArgs } from './args.js';

const USAGE = `
Uso: pnpm catalog:crawl -- [opciones]

  --source <claves>     Fuentes separadas por coma, o "all" (por defecto).
  --max-depth <n>       Profundidad máxima de carpetas ArcGIS.
  --no-samples          No traer muestras de registros.
  --sample-size <n>     Filas por muestra (por defecto 5).
  --concurrency <n>     Peticiones simultáneas (por defecto 2).
  --resume              Continuar una corrida anterior.
  --no-cache            Ignorar la caché HTTP en disco.
  --max-layers <n>      Límite de capas por servicio.
  --max-per-family <n>  Servicios por familia de nombre (por defecto 3).
  --max-per-folder <n>  Servicios por carpeta (por defecto 25).
  --max-services <n>    Tope global de servicios ArcGIS (por defecto 200).
  --help                Esta ayuda.
`.trim();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (hasFlag(args, 'help')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const sourceKeys = resolveSourceKeys(flagString(args, 'source'));
  const withSamples = flagBool(args, 'samples', true);
  const sampleSize = withSamples ? (flagNumber(args, 'sample-size') ?? 5) : 0;

  process.stdout.write(
    `Fase 0 — recorriendo: ${sourceKeys.join(', ')}\n` +
      `Muestras: ${withSamples ? `${sampleSize} filas por capa` : 'desactivadas'}\n\n`,
  );

  const started = Date.now();
  const summary = await runCrawl({
    sourceKeys,
    sampleSize,
    ...(flagNumber(args, 'max-depth') !== undefined ? { maxDepth: flagNumber(args, 'max-depth') } : {}),
    concurrency: flagNumber(args, 'concurrency') ?? 2,
    resume: flagBool(args, 'resume', false),
    noCache: !flagBool(args, 'cache', true),
    ...(flagNumber(args, 'max-layers') !== undefined
      ? { maxLayersPerService: flagNumber(args, 'max-layers') }
      : {}),
    ...(flagNumber(args, 'max-per-family') !== undefined
      ? { maxServicesPerFamily: flagNumber(args, 'max-per-family') }
      : {}),
    ...(flagNumber(args, 'max-per-folder') !== undefined
      ? { maxServicesPerFolder: flagNumber(args, 'max-per-folder') }
      : {}),
    ...(flagNumber(args, 'max-services') !== undefined
      ? { maxServices: flagNumber(args, 'max-services') }
      : {}),
    onProgress: (msg) => process.stdout.write(`${msg}\n`),
  });

  const c = summary.counts;
  process.stdout.write(
    [
      '',
      '─'.repeat(72),
      `Corrida terminada en ${((Date.now() - started) / 1000).toFixed(1)} s`,
      `  Servicios ArcGIS descubiertos : ${c.servicesDiscovered}`,
      `  Servicios inspeccionados      : ${c.servicesInspected} (fallidos: ${c.servicesFailed})`,
      `  Capas y tablas catalogadas    : ${c.layersCatalogued} (con muestra: ${c.layersWithSample})`,
      `  Datasets de datos.gov.co      : ${c.socrataDatasets}`,
      `  Descriptores manuales         : ${c.manualDescriptors}`,
      `  Columnas PII descartadas      : ${c.piiColumnsDropped}`,
      `  Valores PII redactados        : ${c.piiValuesRedacted}`,
      `  HTTP: ${summary.http.requests} peticiones, ${summary.http.cacheHits} de caché, ` +
        `${summary.http.retries} reintentos, ${summary.http.errors} errores, ` +
        `${(summary.http.bytes / 1024 / 1024).toFixed(1)} MB`,
      '',
      'Escrito en data-catalog/: CATALOGO.md, SELECCION.md, RIESGOS.md, PII_DESCARTES.md, RESUMEN.json',
      '',
    ].join('\n'),
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`\nLa corrida falló: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
