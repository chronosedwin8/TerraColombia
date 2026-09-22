import { createHash } from 'node:crypto';
import { getLogger, isShareAlike } from '@terracolombia/shared';
import { execute, query, queryOne, recordPiiDiscard } from '@terracolombia/db';
import { ident, raw, sql } from '@terracolombia/db/sql';
import type { DatasetDefinition } from '@terracolombia/etl-config';
import type { DatasetPipeline, PipelineContext, StepResult, ValidationFinding } from './pipeline.js';
import {
  checkInvalidGeometries,
  checkSrid,
  validateCadastreSnapshot,
  validateContextSnapshot,
} from './validations.js';

const log = getLogger({ mod: 'etl:generic' });

/**
 * Ayudas que vienen de `etl/config`. Se inyectan en vez de importarse arriba para que el
 * worker pueda arrancar sus otras colas (informes, análisis, alertas) aunque la declaración
 * de datasets tenga un problema: un fallo en la configuración del ETL no debe dejar sin
 * informes a quien ya los pagó.
 */
export interface EtlConfigHelpers {
  isInspected: (mapping: DatasetDefinition['fieldMapping']) => boolean;
  isPiiColumn: (name: string) => boolean;
  /**
   * Heurística de contenido de `etl/config/pii-blocklist.ts`. Es opcional para no romper a
   * quien construya un pipeline sin ella; cuando falta, la segunda defensa de la regla 3 no
   * se ejecuta y el informe no la menciona.
   */
  detectPiiContent?: (
    value: unknown,
    columnName?: string,
  ) => { patternId: string; label: string; reason: string } | null;
}

/** Carga perezosa de `etl/config`, con un error accionable si falla. */
export async function loadEtlConfig(): Promise<
  typeof import('@terracolombia/etl-config')
> {
  try {
    return await import('@terracolombia/etl-config');
  } catch (err) {
    throw new Error(
      'No se pudo cargar la declaración de datasets de etl/config. ' +
        'Verifica que los archivos de etl/config/datasets/ existan y compilen. ' +
        `Detalle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Construye el pipeline de un dataset declarado en `etl/config/datasets`.
 *
 * Camino de ingesta por conector:
 *  - `arcgis-rest` y `wfs`: descarga paginada a GeoJSON en memoria y carga por lotes.
 *  - `socrata`: descarga JSON paginada.
 *  - `file-download`: delega en `ogr2ogr` para formatos binarios (GDB, GPKG, SHP).
 *
 * Reglas duras que aplica en todos los casos:
 *  - Ninguna columna de la lista negra de PII entra a `raw` ni a destino. Lo descartado se
 *    registra en `meta.pii_discard_log` con el nombre de la columna, nunca su valor.
 *  - La geometría se sanea con `core.clean_polygon` y se reproyecta a EPSG:4326.
 *  - La publicación es atómica: hasta el paso `publish`, el usuario ve el corte anterior.
 */
export function buildPipeline(
  dataset: DatasetDefinition,
  helpers: EtlConfigHelpers,
): DatasetPipeline {
  return {
    datasetId: dataset.id,
    declaration: {
      id: dataset.id,
      source: dataset.source,
      name: dataset.name,
      description: dataset.justification,
      license: dataset.license,
      attribution: dataset.attribution,
      url: dataset.url,
      frequency: dataset.frequency,
      connector: dataset.connector,
      format: dataset.format,
      source_srid: dataset.crs,
      target_table: dataset.targetTable,
      share_alike: isShareAlike(dataset.license),
      notes: dataset.notes.join(' · ') || null,
    },

    async resolveCutDate() {
      // Por omisión, el corte es el día de la carga. Los datasets con publicación periódica
      // usan el primer día del periodo, que es como los publica la fuente.
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      switch (dataset.frequency) {
        case 'mensual':
          return `${year}-${month}-01`;
        case 'trimestral': {
          const q = Math.floor(now.getUTCMonth() / 3) * 3 + 1;
          return `${year}-${String(q).padStart(2, '0')}-01`;
        }
        case 'semestral':
          return `${year}-${now.getUTCMonth() < 6 ? '01' : '07'}-01`;
        case 'anual':
        case 'decenal':
          return `${year}-01-01`;
        default:
          return now.toISOString().slice(0, 10);
      }
    },

    steps: {
      async discover(ctx) {
        if (!helpers.isInspected(dataset.fieldMapping)) {
          // Regla 2: sin inspección real no se inventa un mapeo de campos.
          return {
            message:
              `El dataset ${dataset.id} no tiene mapeo de campos inspeccionado. ` +
              'Ejecuta `pnpm catalog:crawl` y completa `fieldMapping` antes de ingerirlo.',
            skipRest: true,
          };
        }
        await ctx.job.log(`Fuente: ${dataset.url}`);
        return {
          message: `Conector ${dataset.connector}, formato ${dataset.format}, CRS de origen ${dataset.crs ?? 'alfanumérico'}`,
          detail: { url: dataset.url, connector: dataset.connector },
        };
      },

      async download(ctx) {
        const { rows, method } = await fetchRows(dataset, ctx);
        ctx.state.rows = rows;
        ctx.state.method = method;
        return {
          rowsIn: rows.length,
          message: `${rows.length} registros descargados por ${method}`,
          detail: { method },
        };
      },

      async stage(ctx) {
        const rows = (ctx.state.rows ?? []) as Array<Record<string, unknown>>;
        if (rows.length === 0) {
          return { rowsOut: 0, message: 'La fuente no devolvió registros', skipRest: true };
        }

        const { cleaned, discarded, rowRuleDiscarded } = stripPii(rows, dataset, helpers);
        for (const [column, occurrences] of Object.entries(discarded)) {
          await recordPiiDiscard({
            snapshotId: ctx.snapshotId,
            datasetId: dataset.id,
            sourceLayer: dataset.targetTable,
            columnName: column,
            reason: 'blocklist_pattern',
            occurrences,
          });
        }
        // Los descartes condicionados al valor de otra columna se registran aparte, con
        // `content_heuristic`, porque no los decidió el nombre de la columna sino el dato.
        for (const [column, occurrences] of Object.entries(rowRuleDiscarded)) {
          await recordPiiDiscard({
            snapshotId: ctx.snapshotId,
            datasetId: dataset.id,
            sourceLayer: dataset.targetTable,
            columnName: column,
            reason: 'content_heuristic',
            occurrences,
          });
        }

        const rawTable = rawTableNameOf(dataset);
        await execute(sql`
          CREATE TABLE IF NOT EXISTS raw.${ident(rawTable)} (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            snapshot_id BIGINT NOT NULL,
            payload JSONB NOT NULL,
            geom geometry(Geometry, 4326)
          )
        `);
        await execute(sql`DELETE FROM raw.${ident(rawTable)} WHERE snapshot_id = ${ctx.snapshotId}`);

        // Carga por lotes: un INSERT por fila sería inviable con millones de registros.
        const BATCH = 500;
        let inserted = 0;
        for (let i = 0; i < cleaned.length; i += BATCH) {
          const batch = cleaned.slice(i, i + BATCH);
          const payloads = batch.map((r) => JSON.stringify(r.properties ?? r));
          const geoms = batch.map((r) =>
            r.geometry ? JSON.stringify(r.geometry) : null,
          );
          await execute(sql`
            INSERT INTO raw.${ident(rawTable)} (snapshot_id, payload, geom)
            SELECT ${ctx.snapshotId}, p::jsonb,
                   CASE WHEN g IS NULL THEN NULL
                        ELSE ST_SetSRID(ST_GeomFromGeoJSON(g), ${dataset.crs ?? 4326}) END
            FROM unnest(${payloads}::text[], ${geoms}::text[]) AS t(p, g)
          `);
          inserted += batch.length;
          if (i % (BATCH * 10) === 0) {
            await ctx.job.progress(
              Math.round((i / cleaned.length) * 100),
              `Cargando ${inserted} de ${cleaned.length} registros`,
            );
          }
        }

        ctx.state.rawTable = rawTable;
        ctx.state.piiDiscarded = discarded;
        ctx.state.piiRowRuleDiscarded = rowRuleDiscarded;
        const rowRuleColumns = Object.keys(rowRuleDiscarded);
        return {
          rowsIn: rows.length,
          rowsOut: inserted,
          message:
            `${inserted} filas en raw.${rawTable}; ${Object.keys(discarded).length} columnas descartadas por posible dato personal` +
            (rowRuleColumns.length > 0
              ? ` y ${rowRuleColumns.length} más solo en las filas que cumplen una regla por fila (${rowRuleColumns
                  .map((c) => `${c}: ${rowRuleDiscarded[c]}`)
                  .join(', ')})`
              : ''),
          detail: {
            rawTable,
            discardedColumns: Object.keys(discarded),
            rowRuleDiscardedColumns: rowRuleDiscarded,
          },
        };
      },

      async transform(ctx) {
        // Si `stage` no corrió en esta invocación (`--only=transform,index,publish`), la tabla
        // de entrada se deduce del id: es determinista. Permite volver a normalizar un corte
        // ya descargado sin bajarse otra vez 606 206 filas de la fuente.
        const rawTable = (ctx.state.rawTable as string | undefined) ?? (await stagedTableFor(dataset, ctx));
        if (!rawTable) return { message: 'Sin tabla de entrada: nada que transformar', skipRest: true };
        if (!helpers.isInspected(dataset.fieldMapping)) {
          return { message: 'Sin mapeo inspeccionado: no se transforma', skipRest: true };
        }
        const rowsOut = await transformInto(dataset, rawTable, ctx, helpers);

        // Las validaciones de la tabla de DESTINO tienen que correr aquí, después de
        // insertar. El paso `validate` va antes de `transform` (PLAN §8), así que si se
        // ejecutaran allí mirarían una tabla vacía y darían por bueno cualquier corte:
        // la red de PII sobre `attrs` no se habría ejecutado nunca. `publish` va después,
        // así que un error encontrado aquí sigue impidiendo la publicación.
        const findings = await validateTarget(dataset, ctx, helpers);
        const errors = findings.filter((f) => !f.passed && f.severity === 'error').length;
        return {
          rowsOut,
          findings,
          message:
            `${rowsOut} filas en ${dataset.targetTable}` +
            (errors > 0
              ? `; ${errors} validaciones de destino con severidad error: el corte NO se publicará`
              : `; ${findings.length} validaciones de destino, ninguna bloqueante`),
        };
      },

      async validate(ctx) {
        // Este paso valida lo que quedó en `raw.*` (va justo después de `stage`). Las
        // comprobaciones de la tabla de destino las hace el paso `transform`.
        const rawTable =
          (ctx.state.rawTable as string | undefined) ?? (await stagedTableFor(dataset, ctx));
        if (!rawTable) return { message: 'Sin tabla de entrada: nada que validar' };
        const findings = await validateStaged(dataset, rawTable, ctx, helpers);

        const errors = findings.filter((f) => !f.passed && f.severity === 'error').length;
        return {
          findings,
          message:
            errors > 0
              ? `${errors} validaciones con severidad error: el corte NO se publicará`
              : `${findings.length} validaciones ejecutadas sobre raw.${rawTable}, ninguna bloqueante`,
        };
      },

      async index(ctx) {
        // Índices H3 y texto normalizado, según la tabla destino.
        const count = await indexTarget(dataset, ctx);
        return { rowsOut: count, message: `${count} filas indexadas` };
      },
    },
  };
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

interface FetchedFeature {
  properties?: Record<string, unknown>;
  geometry?: unknown;
  [key: string]: unknown;
}

async function fetchRows(
  dataset: DatasetDefinition,
  ctx: PipelineContext,
): Promise<{ rows: FetchedFeature[]; method: string }> {
  const userAgent = process.env.ETL_USER_AGENT ?? 'TerraColombia/0.1';

  switch (dataset.connector) {
    case 'socrata': {
      const rows: FetchedFeature[] = [];
      // Socrata admite hasta 50 000 filas por página en JSON. Con 1 000 hacían falta 607
      // peticiones para el histórico del MEN (606 206 filas) y el bucle se cortaba en
      // 500 000 sin avisar: se perdían 106 206 filas en silencio.
      const pageSize = 5_000;
      const MAX_ROWS = 2_000_000;
      const geometry = declaredGeometryReader(dataset);
      for (let offset = 0; offset < MAX_ROWS; offset += pageSize) {
        const url = `${dataset.url}${dataset.url.includes('?') ? '&' : '?'}$limit=${pageSize}&$offset=${offset}`;
        const batch = await fetchSocrataPage(url, userAgent, dataset.id, ctx);
        if (batch.length === 0) break;
        for (const r of batch) rows.push(geometry(r));
        await ctx.job.progress(
          Math.min(95, Math.round((rows.length / 50_000) * 100)),
          `${rows.length} registros descargados`,
        );
        if (batch.length < pageSize) break;
        if (offset + pageSize >= MAX_ROWS) {
          throw new Error(
            `${dataset.id} superó el límite de ${MAX_ROWS} filas del conector de Socrata. ` +
              'Sube el límite o filtra en origen: cortar la descarga en silencio publicaría un corte incompleto.',
          );
        }
      }
      return { rows, method: 'socrata' };
    }

    case 'arcgis-rest': {
      const rows: FetchedFeature[] = [];
      const pageSize = 1000;
      for (let offset = 0; offset < 500_000; offset += pageSize) {
        const url =
          `${dataset.url}/query?where=1%3D1&outFields=*&f=geojson` +
          `&resultOffset=${offset}&resultRecordCount=${pageSize}&outSR=4326`;
        const res = await fetch(url, { headers: { 'User-Agent': userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${dataset.id}`);
        const fc = (await res.json()) as {
          features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>;
          error?: { message?: string };
        };
        if (fc.error) throw new Error(`El servicio respondió con error: ${fc.error.message}`);
        const batch = fc.features ?? [];
        if (batch.length === 0) break;
        rows.push(...batch);
        await ctx.job.progress(
          Math.min(95, Math.round((rows.length / 50_000) * 100)),
          `${rows.length} entidades descargadas`,
        );
        if (batch.length < pageSize) break;
      }
      return { rows, method: 'arcgis-rest' };
    }

    case 'wfs': {
      const rows: FetchedFeature[] = [];
      const pageSize = 1000;
      for (let start = 0; start < 500_000; start += pageSize) {
        const url =
          `${dataset.url}${dataset.url.includes('?') ? '&' : '?'}` +
          `service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json` +
          `&count=${pageSize}&startIndex=${start}&srsName=EPSG:4326`;
        const res = await fetch(url, { headers: { 'User-Agent': userAgent } });
        if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${dataset.id}`);
        const fc = (await res.json()) as { features?: FetchedFeature[] };
        const batch = fc.features ?? [];
        if (batch.length === 0) break;
        rows.push(...batch);
        if (batch.length < pageSize) break;
      }
      return { rows, method: 'wfs' };
    }

    case 'file-download':
      throw new Error(
        `El dataset ${dataset.id} viene en un archivo (${dataset.format}). Su carga requiere ogr2ogr y no pasa por ` +
          'este camino en memoria: usa `pnpm etl -- load-file <datasetId> <ruta>`, que invoca GDAL.',
      );

    default:
      throw new Error(`Conector no soportado todavía: ${dataset.connector}`);
  }
}

/**
 * Una página de Socrata, con reintentos.
 *
 * `datos.gov.co` devuelve 500 o 429 de vez en cuando bajo carga: en la descarga del histórico
 * del MEN (122 peticiones) falló en la petición 4 y tumbó la corrida entera después de 21
 * segundos. Sin reintento, cualquier dataset grande depende de que 122 peticiones seguidas
 * salgan perfectas. Se reintenta con espera creciente solo en errores transitorios; un 400 o
 * un 404 es un error de la consulta y falla en el primer intento.
 */
async function fetchSocrataPage(
  url: string,
  userAgent: string,
  datasetId: string,
  ctx: PipelineContext,
): Promise<Array<Record<string, unknown>>> {
  const MAX_ATTEMPTS = 5;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      });
      if (res.ok) return (await res.json()) as Array<Record<string, unknown>>;
      lastError = `HTTP ${res.status}`;
      // 5xx y 429 son transitorios; el resto es un problema de la consulta.
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} al descargar ${datasetId}: ${url}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP ')) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt === MAX_ATTEMPTS) break;
    const waitMs = 1000 * 2 ** (attempt - 1);
    await ctx.job.log(
      `${datasetId}: ${lastError} al pedir una página; reintento ${attempt + 1} de ${MAX_ATTEMPTS} en ${waitMs} ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(
    `${datasetId}: la fuente falló ${MAX_ATTEMPTS} veces seguidas (${lastError}) en ${url}. ` +
      'No se continúa: una descarga incompleta publicaría un corte con municipios faltantes.',
  );
}

/** Nombre determinista de la tabla de entrada de un dataset. */
function rawTableNameOf(dataset: DatasetDefinition): string {
  return `raw_${dataset.id.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
}

/**
 * Tabla de entrada de un corte ya descargado, o `null` si no hay nada cargado.
 * Permite reanudar desde `transform` sin repetir la descarga.
 */
async function stagedTableFor(
  dataset: DatasetDefinition,
  ctx: PipelineContext,
): Promise<string | null> {
  const table = rawTableNameOf(dataset);
  const exists = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'raw' AND table_name = ${table}
  `);
  if ((exists?.n ?? 0) === 0) return null;
  const rows = await queryOne<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM raw.${ident(table)} WHERE snapshot_id = ${ctx.snapshotId}
  `);
  return (rows?.n ?? 0) > 0 ? table : null;
}

// ─── Validaciones ─────────────────────────────────────────────────────────────

/**
 * Validaciones sobre la tabla de entrada `raw.*`, justo después de `stage`.
 *
 * La más importante es la red de PII: comprueba que ninguna clave que sobrevivió al filtro
 * de `stage` sea de la lista negra. Si `stripPii` tuviera un fallo, esto lo detecta y
 * bloquea la publicación (regla 3). La red sobre `attrs` de validations.ts no sirve aquí:
 * su expresión regular marca `nombre_municipio` y `nombre_establecimiento`, que son
 * topónimos y nombres de institución, no de persona.
 */
async function validateStaged(
  dataset: DatasetDefinition,
  rawTable: string,
  ctx: PipelineContext,
  helpers: EtlConfigHelpers,
): Promise<ValidationFinding[]> {
  const table = `raw.${rawTable}`;
  const findings: ValidationFinding[] = [];

  const counts = await queryOne<{ n: number; with_geom: number; outside: number }>(sql`
    SELECT count(*)::int AS n,
           count(geom)::int AS with_geom,
           count(*) FILTER (
             WHERE geom IS NOT NULL
               AND NOT ST_Intersects(geom, ST_MakeEnvelope(-81.85, -4.3, -66.8, 13.6, 4326))
           )::int AS outside
    FROM ${ident(table)}
    WHERE snapshot_id = ${ctx.snapshotId}
  `);
  const total = counts?.n ?? 0;
  const withGeom = counts?.with_geom ?? 0;
  const outside = counts?.outside ?? 0;

  findings.push({
    checkName: 'staged_row_count',
    severity: total === 0 ? 'error' : 'info',
    passed: total > 0,
    affectedRows: total,
    message:
      total === 0
        ? `${table} quedó vacía: la fuente no devolvió nada utilizable.`
        : `${total} filas en ${table}, ${withGeom} con geometría (${
            total > 0 ? ((withGeom / total) * 100).toFixed(1) : '0'
          } %).`,
  });

  // Fuera de Colombia es aviso, no error: la fuente trae coordenadas de relleno y el
  // transform las descarta. Lo que no puede pasar es publicarlas sin decirlo.
  findings.push({
    checkName: 'staged_outside_colombia',
    severity: 'warning',
    passed: outside === 0,
    affectedRows: outside,
    message:
      outside === 0
        ? `Ninguna geometría de ${table} cae fuera de Colombia.`
        : `${outside} de ${withGeom} geometrías de ${table} caen fuera de Colombia: el transform las descarta y esas filas quedan sin punto.`,
  });

  if (withGeom > 0) {
    findings.push(await checkSrid(table, ctx.snapshotId, 4326));
    findings.push(await checkInvalidGeometries(table, ctx.snapshotId));
    findings.push(await checkCoordinatePrecision(table, ctx.snapshotId, withGeom));
  }

  const keys = await query<{ key: string; n: number }>(sql`
    SELECT key, count(*)::int AS n
    FROM ${ident(table)} t, LATERAL jsonb_object_keys(t.payload) AS key
    WHERE t.snapshot_id = ${ctx.snapshotId}
    GROUP BY key
  `);
  const extra = new Set(dataset.piiBlocklist.map((c) => c.toLowerCase()));
  const leaked = keys.filter((k) => helpers.isPiiColumn(k.key) || extra.has(k.key.toLowerCase()));
  findings.push({
    checkName: 'pii_detected',
    severity: 'error',
    passed: leaked.length === 0,
    affectedRows: leaked.reduce((a, k) => a + k.n, 0),
    // Se reporta el NOMBRE de la clave, nunca su valor.
    sample: leaked.map((k) => ({ columna: k.key, ocurrencias: k.n })),
    message:
      leaked.length === 0
        ? `Ninguna de las ${keys.length} columnas de ${table} está en la lista negra de datos personales.`
        : `${leaked.length} columnas de la lista negra sobrevivieron al filtro de stage en ${table}: ` +
          `${leaked.map((k) => k.key).join(', ')}. No se publica este corte.`,
  });

  if (helpers.detectPiiContent) {
    findings.push(await checkStagedPiiContent(table, ctx.snapshotId, helpers.detectPiiContent));
  }

  return findings;
}

/**
 * Precisión de las coordenadas de un dataset de puntos, medida sobre el corte completo.
 *
 * Implementa la validación `coordinate-precision` que declara `men-sedes-educativas`: dos
 * decimales en grados son ~1,1 km sobre el terreno, así que una "distancia al colegio más
 * cercano" calculada con esos puntos no se puede presentar como exacta. Es aviso, no error:
 * el punto aproximado sirve para contar oferta en el municipio, lo que no se puede hacer es
 * prometer metros. La UI debe declarar la distancia como aproximada cuando esto salta.
 */
async function checkCoordinatePrecision(
  table: string,
  snapshotId: number,
  withGeom: number,
): Promise<ValidationFinding> {
  const THRESHOLD_PCT = 20;
  const row = await queryOne<{ low: number }>(sql`
    SELECT count(*)::int AS low
    FROM ${ident(table)}
    WHERE snapshot_id = ${snapshotId}
      AND geom IS NOT NULL
      AND ST_GeometryType(geom) = 'ST_Point'
      AND round(ST_X(geom)::numeric, 2) = ST_X(geom)::numeric
      AND round(ST_Y(geom)::numeric, 2) = ST_Y(geom)::numeric
  `);
  const low = row?.low ?? 0;
  const pct = withGeom > 0 ? (low / withGeom) * 100 : 0;
  return {
    checkName: 'coordinate_precision',
    severity: 'warning',
    passed: pct <= THRESHOLD_PCT,
    affectedRows: low,
    message:
      pct <= THRESHOLD_PCT
        ? `${low} de ${withGeom} puntos de ${table} (${pct.toFixed(1)} %) traen 2 decimales o menos: precisión aceptable.`
        : `${low} de ${withGeom} puntos de ${table} (${pct.toFixed(1)} %) traen solo 2 decimales, es decir ~1,1 km de error. ` +
          `Supera el umbral del ${THRESHOLD_PCT} %: la distancia calculada con estos puntos debe presentarse como APROXIMADA en la UI y en los informes.`,
  };
}

/**
 * Segunda defensa de la regla 3: busca datos personales por CONTENIDO en una muestra de las
 * filas ya saneadas. Es aviso, no error, porque las heurísticas tienen falsos positivos
 * (una dirección de predio puede parecer una cédula); lo que hace es dejar constancia en el
 * informe para que alguien mire antes de publicar.
 */
async function checkStagedPiiContent(
  table: string,
  snapshotId: number,
  detect: NonNullable<EtlConfigHelpers['detectPiiContent']>,
): Promise<ValidationFinding> {
  const SAMPLE = 500;
  const rows = await query<{ payload: Record<string, unknown> }>(sql`
    SELECT payload FROM ${ident(table)} WHERE snapshot_id = ${snapshotId} LIMIT ${SAMPLE}
  `);
  const hits = new Map<string, { patternId: string; n: number }>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.payload ?? {})) {
      const hit = detect(value, key);
      if (!hit) continue;
      const found = hits.get(key);
      if (found) found.n++;
      else hits.set(key, { patternId: hit.patternId, n: 1 });
    }
  }
  const sorted = [...hits.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
  return {
    checkName: 'pii_content_heuristic',
    severity: 'warning',
    passed: sorted.length === 0,
    affectedRows: sorted.reduce((a, [, v]) => a + v.n, 0),
    sample: sorted.map(([columna, v]) => ({ columna, patron: v.patternId, ocurrencias: v.n })),
    message:
      sorted.length === 0
        ? `La heurística de contenido no encontró datos personales en una muestra de ${rows.length} filas de ${table}.`
        : `La heurística de contenido marcó ${sorted.length} columnas en una muestra de ${rows.length} filas de ${table}: ` +
          `${sorted.map(([c, v]) => `${c} (${v.patternId})`).join(', ')}. Revisa si hay que añadirlas a la lista negra.`,
  };
}

/** Validaciones de la tabla de destino, después de `transform`. */
async function validateTarget(
  dataset: DatasetDefinition,
  ctx: PipelineContext,
  helpers: EtlConfigHelpers,
): Promise<ValidationFinding[]> {
  if (dataset.targetTable === 'core.parcel') {
    return validateCadastreSnapshot(ctx.snapshotId, ctx.previousSnapshotId);
  }
  if (!hasSnapshotColumn(dataset.targetTable)) {
    // Sin snapshot_id no se puede aislar el corte: se comprueba lo que sí tiene sentido,
    // que la tabla quedó poblada.
    const row = await queryOne<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ${ident(dataset.targetTable)}
    `);
    return [
      {
        checkName: 'row_count_delta',
        severity: (row?.n ?? 0) === 0 ? 'error' : 'info',
        passed: (row?.n ?? 0) > 0,
        affectedRows: row?.n ?? 0,
        message: `${dataset.targetTable} tiene ${row?.n ?? 0} filas. La tabla se actualiza en sitio: no lleva snapshot_id.`,
      },
    ];
  }
  return validateContextSnapshot(dataset.targetTable, ctx.snapshotId, ctx.previousSnapshotId, {
    attrsColumn: hasAttrsColumn(dataset.targetTable) ? 'attrs' : null,
    isPiiColumn: helpers.isPiiColumn,
  });
}

// ─── Geometría declarada (conector de Socrata) ────────────────────────────────

/**
 * Socrata devuelve JSON plano, no GeoJSON: la geometría viene dentro de una columna.
 * Esta función construye, a partir del `fieldMapping` YA INSPECCIONADO del dataset (regla 2:
 * ningún nombre de campo se inventa aquí), un lector que saca la geometría de cada fila:
 *
 *  - Columna con destino `geom` o `raw.geom` y valor objeto GeoJSON (`the_geom` del IGAC).
 *    La columna se retira de las propiedades: es un MultiPolygon de cientos de vértices y
 *    duplicarlo en `payload` multiplicaría por diez el tamaño de `raw.*` y de `attrs`.
 *  - Par de columnas con destino `lng` y `lat` (`coordenada_x_sede`/`coordenada_y_sede` del
 *    MEN, `longitud`/`latitud` del DANE). Acepta coma decimal, que es como los publica el
 *    DANE, y descarta el par 0/0 y los valores fuera de rango: un 0/0 pone el colegio en el
 *    golfo de Guinea, que es peor que no tener punto.
 *
 * Sin esto, todo dataset de Socrata se cargaba con `geom` NULL aunque la fuente trajera
 * coordenadas (medido: `men-sedes-educativas` llevaba 53 796 filas y 0 geometrías).
 */
function declaredGeometryReader(
  dataset: DatasetDefinition,
): (row: Record<string, unknown>) => FetchedFeature {
  const mapping = dataset.fieldMapping;
  if (typeof mapping === 'string') return (row) => ({ properties: row });

  let geomColumn: string | null = null;
  let lngColumn: string | null = null;
  let latColumn: string | null = null;
  for (const [source, map] of Object.entries(mapping)) {
    if (map.target === 'geom' || map.target === 'raw.geom') geomColumn = source;
    else if (map.target === 'lng') lngColumn = source;
    else if (map.target === 'lat') latColumn = source;
  }

  if (geomColumn) {
    const column = geomColumn;
    return (row) => {
      const value = row[column];
      if (value === null || value === undefined || typeof value !== 'object') {
        return { properties: row };
      }
      const { [column]: _dropped, ...rest } = row;
      return { properties: rest, geometry: value };
    };
  }

  if (lngColumn && latColumn) {
    const xCol = lngColumn;
    const yCol = latColumn;
    return (row) => {
      const lng = parseDecimal(row[xCol]);
      const lat = parseDecimal(row[yCol]);
      if (lng === null || lat === null) return { properties: row };
      // 0/0 es el valor de relleno de las fuentes colombianas, no un punto del país.
      if (lng === 0 && lat === 0) return { properties: row };
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return { properties: row };
      return { properties: row, geometry: { type: 'Point', coordinates: [lng, lat] } };
    };
  }

  return (row) => ({ properties: row });
}

/**
 * Número con coma o punto decimal, como los publica datos.gov.co. `null` si no es número.
 *
 * La DIVIPOLA del DANE usa coma decimal ("-75,523505"), y una fila la trae con separadores de
 * millar espurios metidos en la parte decimal: la cabecera de Medellín viene como
 * "-75,581,775" / "6,246,631", que es "-75.581775" / "6.246631". Se toma la PRIMERA coma como
 * separador decimal y se descartan las siguientes. No es adivinar un dato: es deshacer un
 * formateo de miles sobre dígitos que ya estaban ahí. Quien decide si el resultado es válido
 * es el control de extensión de Colombia, que se aplica después.
 */
function parseDecimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const first = trimmed.indexOf(',');
  const s =
    first === -1
      ? trimmed
      : `${trimmed.slice(0, first)}.${trimmed.slice(first + 1).replace(/,/g, '')}`;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ─── Filtro de PII ────────────────────────────────────────────────────────────

/**
 * Elimina de cada registro las columnas que la lista negra marca como posible dato personal.
 * Devuelve también el conteo por columna descartada, para el registro de `meta.pii_discard_log`.
 */
function stripPii(
  rows: FetchedFeature[],
  dataset: DatasetDefinition,
  helpers: EtlConfigHelpers,
): {
  cleaned: FetchedFeature[];
  discarded: Record<string, number>;
  rowRuleDiscarded: Record<string, number>;
} {
  const discarded: Record<string, number> = {};
  const rowRuleDiscarded: Record<string, number> = {};
  const extra = new Set(dataset.piiBlocklist.map((c) => c.toLowerCase()));

  // Reglas por fila: el descarte depende del VALOR de otra columna (p. ej. el REPS, donde
  // `nombreprestador` es el nombre de una persona solo si es profesional independiente).
  const rowRules = (dataset.piiRowRules ?? []).map((rule) => ({
    whenColumn: rule.whenColumn,
    values: rule.whenValueIn ? new Set(rule.whenValueIn) : null,
    // La expresión regular viene de la declaración del dataset, no del cliente.
    pattern: rule.whenValueMatches ? new RegExp(rule.whenValueMatches) : null,
    redact: rule.redactColumns,
    reason: rule.reason,
  }));

  const cleaned = rows.map((row) => {
    const props = (row.properties ?? row) as Record<string, unknown>;

    // Se calcula primero qué columnas quita la regla por fila, para que ni siquiera se
    // copien al objeto que va a `raw.*`.
    let redact: Set<string> | null = null;
    for (const rule of rowRules) {
      const decider = props[rule.whenColumn];
      if (typeof decider !== 'string') continue;
      const matches =
        (rule.values?.has(decider) ?? false) || (rule.pattern?.test(decider) ?? false);
      if (!matches) continue;
      redact ??= new Set<string>();
      for (const c of rule.redact) redact.add(c);
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (helpers.isPiiColumn(key) || extra.has(key.toLowerCase())) {
        discarded[key] = (discarded[key] ?? 0) + 1;
        continue;
      }
      if (redact?.has(key)) {
        rowRuleDiscarded[key] = (rowRuleDiscarded[key] ?? 0) + 1;
        continue;
      }
      out[key] = value;
    }
    return { properties: out, geometry: row.geometry };
  });

  if (Object.keys(discarded).length > 0) {
    log.warn(
      { datasetId: dataset.id, columnas: Object.keys(discarded) },
      'Columnas descartadas por posible dato personal',
    );
  }
  if (Object.keys(rowRuleDiscarded).length > 0) {
    log.warn(
      { datasetId: dataset.id, columnas: rowRuleDiscarded },
      'Columnas descartadas en filas concretas por una regla por fila de PII',
    );
  }

  return { cleaned, discarded, rowRuleDiscarded };
}

// ─── Transformación a las tablas de destino ───────────────────────────────────

function hasAttrsColumn(targetTable: string): boolean {
  return ![
    'core.municipality',
    'core.department',
    // core.cadastral_manager y core.populated_place son tablas de atributos fijos: no
    // tienen columna `attrs`, así que la red de PII sobre `attrs` no se puede ejecutar
    // en ellas (el payload íntegro se queda en raw.*, y allí sí se revisa).
    'core.cadastral_manager',
    'core.populated_place',
    'ctx.population_projection',
    'ctx.elevation_cell',
  ].includes(targetTable);
}

/**
 * Tablas de destino que NO llevan `snapshot_id`: se actualizan en sitio para no perder las
 * referencias de lo que ya está cargado. Las validaciones estándar filtran por snapshot y
 * por tanto no se les pueden aplicar tal cual.
 */
function hasSnapshotColumn(targetTable: string): boolean {
  return !['core.cadastral_manager'].includes(targetTable);
}

/** Envolvente de Colombia que usa todo el proyecto (la misma que `checkGeometriesInsideColombia`). */
const COLOMBIA_ENVELOPE = 'ST_MakeEnvelope(-81.85, -4.3, -66.8, 13.6, 4326)';

/**
 * Devuelve la geometría en 2D si cae dentro de Colombia, y NULL si no.
 *
 * Los datasets de equipamientos traen coordenadas de relleno y coordenadas mal capturadas
 * (el MEN publica 5 527 sedes con 0/0 y otras con dos decimales). Un punto fuera del país no
 * es un dato, es un error: se descarta aquí en vez de publicarlo y dejar que el usuario vea
 * un colegio en medio del Atlántico.
 *
 * `geomExpr` solo puede ser una referencia a columna escrita en este archivo; se valida
 * antes de componerla porque `raw()` no parametriza (CLAUDE.md, ADR-007).
 */
function insideColombiaOrNull(geomExpr: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(geomExpr)) {
    throw new Error(`Referencia de geometría inválida: ${geomExpr}`);
  }
  return raw(
    `CASE WHEN ${geomExpr} IS NOT NULL AND ST_Intersects(${geomExpr}, ${COLOMBIA_ENVELOPE})` +
      ` THEN ST_Force2D(${geomExpr}) ELSE NULL END`,
  );
}

/**
 * Pasa de `raw.*` a la tabla de destino aplicando el mapeo de campos declarado. Cada tabla
 * de destino tiene su propia proyección porque sus columnas son distintas; lo genérico es
 * el resto del pipeline.
 */
async function transformInto(
  dataset: DatasetDefinition,
  rawTable: string,
  ctx: PipelineContext,
  helpers: EtlConfigHelpers,
): Promise<number> {
  const mapping = dataset.fieldMapping;
  if (!helpers.isInspected(mapping)) return 0;

  // El mapeo declara destino → origen. Se construye la expresión JSONB de cada columna.
  const src = (target: string): string | null => {
    for (const [sourceField, map] of Object.entries(mapping)) {
      const m = map as { target?: string };
      if (m.target === target) return sourceField;
      if (typeof map === 'string' && map === target) return sourceField;
    }
    return null;
  };

  const jsonText = (target: string) => {
    const field = src(target);
    return field ? sql`payload->>${field}` : sql`NULL`;
  };
  // Disponible para las transformaciones que necesiten un NUMERIC (área, avalúo). Las tablas
  // de destino implementadas hasta ahora solo usan texto y entero; se conserva porque las
  // siguientes (core.parcel, ctx.soil_unit) sí lo necesitan.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const jsonNum = (target: string) => {
    const field = src(target);
    return field
      ? sql`NULLIF(regexp_replace(COALESCE(payload->>${field}, ''), '[^0-9.\\-]', '', 'g'), '')::numeric`
      : sql`NULL`;
  };
  const jsonInt = (target: string) => {
    const field = src(target);
    return field
      ? sql`NULLIF(regexp_replace(COALESCE(payload->>${field}, ''), '[^0-9\\-]', '', 'g'), '')::int`
      : sql`NULL`;
  };
  /**
   * Código DIVIPOLA de municipio, rellenado a 5 dígitos.
   *
   * Varias fuentes colombianas publican el código como número y pierden el cero inicial de
   * los departamentos 05 (Antioquia) y 08 (Atlántico): el MEN manda "5001" en vez de "05001"
   * en 2 837 de los 17 871 establecimientos del último año, 148 municipios. Sin rellenar, esos
   * municipios no cruzan con core.municipality y Antioquia aparece con cero colegios, que es
   * un agujero silencioso justo en el segundo departamento del país.
   *
   * Solo se rellena si el valor mide menos de 5 caracteres: `lpad` a 5 truncaría por la
   * izquierda cualquier valor más largo y convertiría un código raro en un código válido de
   * otro municipio, que es peor que no cruzar.
   */
  const jsonMuniCode = (target: string) => {
    const field = src(target);
    if (!field) return sql`NULL`;
    return sql`CASE
      WHEN NULLIF(trim(COALESCE(payload->>${field}, '')), '') IS NULL THEN NULL
      WHEN length(trim(payload->>${field})) < 5 THEN lpad(trim(payload->>${field}), 5, '0')
      ELSE trim(payload->>${field})
    END`;
  };

  switch (dataset.targetTable) {
    case 'ctx.school': {
      await execute(sql`DELETE FROM ctx.school WHERE snapshot_id = ${ctx.snapshotId}`);
      // Los dos datasets del MEN son series históricas: `men-establecimientos-educativos`
      // trae 11 años en la misma tabla. Publicar todo contaría cada colegio once veces, y
      // el año 2023 de la fuente está roto (416 716 filas para 3 043 establecimientos).
      // Se publica solo el año máximo del corte y, dentro de él, una fila por código DANE
      // (desempate por matrícula descendente). Los años anteriores se quedan en `raw` para
      // series, que es lo que declara la validación `latest-year-only`.
      return execute(sql`
        WITH staged AS (
          SELECT r.payload,
                 r.geom,
                 ${jsonText('dane_code')} AS dane_code,
                 ${jsonInt('year')} AS year_val,
                 ${jsonInt('enrollment')} AS enrollment
          FROM raw.${ident(rawTable)} r
          WHERE r.snapshot_id = ${ctx.snapshotId}
        ),
        latest AS (SELECT max(s.year_val) AS year_val FROM staged s),
        picked AS (
          SELECT DISTINCT ON (COALESCE(s.dane_code, md5(s.payload::text))) s.*
          FROM staged s
          WHERE s.year_val IS NULL OR s.year_val = (SELECT l.year_val FROM latest l)
          ORDER BY COALESCE(s.dane_code, md5(s.payload::text)), s.enrollment DESC NULLS LAST
        )
        INSERT INTO ctx.school (dane_code, name, muni_code, sector, levels, location_kind,
                                enrollment, enrollment_year, attrs, geom, h3_r9, snapshot_id)
        SELECT
          p.dane_code,
          COALESCE(${jsonText('name')}, 'Sin nombre'),
          ${jsonMuniCode('muni_code')},
          -- OFICIAL / NO_OFICIAL / "NO OFICIAL" → oficial / no_oficial
          NULLIF(replace(lower(COALESCE(${jsonText('sector')}, '')), ' ', '_'), ''),
          '{}'::text[],
          -- URBANA / RURAL → urbana / rural
          NULLIF(lower(COALESCE(${jsonText('location_kind')}, '')), ''),
          p.enrollment,
          p.year_val,
          p.payload,
          ${insideColombiaOrNull('p.geom')},
          CASE WHEN ${insideColombiaOrNull('p.geom')} IS NULL THEN NULL
               ELSE h3_lat_lng_to_cell(${insideColombiaOrNull('p.geom')}, 9) END,
          ${ctx.snapshotId}
        FROM picked p
      `);
    }

    case 'ctx.health_facility': {
      await execute(sql`DELETE FROM ctx.health_facility WHERE snapshot_id = ${ctx.snapshotId}`);
      // `name` puede venir NULL porque la regla de PII por fila quitó `nombresede` en las
      // sedes de profesionales independientes (el nombre de la sede ES el de la persona).
      // En ese caso se publica la clase de prestador, que es la información útil sin
      // identificar a nadie: la sede cuenta como oferta de salud pero no lleva nombre.
      return execute(sql`
        INSERT INTO ctx.health_facility (reps_code, name, muni_code, level, nature, services,
                                         attrs, geom, h3_r9, snapshot_id)
        SELECT
          ${jsonText('reps_code')},
          COALESCE(
            NULLIF(${jsonText('name')}, ''),
            CASE WHEN NULLIF(${jsonText('level')}, '') IS NOT NULL
                 THEN ${jsonText('level')} || ' (nombre no publicado)'
                 ELSE 'Sin nombre' END
          ),
          ${jsonMuniCode('muni_code')},
          ${jsonText('level')},
          -- Privada / Pública / Mixta → privado / publico / mixto
          CASE public.tc_fold(${jsonText('nature')})
            WHEN 'PRIVADA' THEN 'privado'
            WHEN 'PUBLICA' THEN 'publico'
            WHEN 'MIXTA' THEN 'mixto'
            ELSE NULL END,
          '{}'::text[],
          payload,
          ${insideColombiaOrNull('geom')},
          CASE WHEN ${insideColombiaOrNull('geom')} IS NULL THEN NULL
               ELSE h3_lat_lng_to_cell(${insideColombiaOrNull('geom')}, 9) END,
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId}
      `);
    }

    case 'core.populated_place': {
      await execute(sql`DELETE FROM core.populated_place WHERE snapshot_id = ${ctx.snapshotId}`);
      // `geom` es NOT NULL y `muni_code` tiene clave ajena a core.municipality: las filas
      // sin coordenada convertible, con el punto fuera de Colombia o con un código DIVIPOLA
      // que no cruza NO se pueden cargar. Se descartan aquí y la validación las cuenta.
      return execute(sql`
        INSERT INTO core.populated_place (muni_code, name, kind, geom, snapshot_id)
        SELECT
          ${jsonMuniCode('muni_code')},
          ${jsonText('name')},
          CASE public.tc_fold(${jsonText('kind')})
            WHEN 'CM' THEN 'cabecera'
            WHEN 'CP' THEN 'centro_poblado'
            ELSE 'centro_poblado' END,
          ST_Force2D(r.geom),
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)} r
        JOIN core.municipality m ON m.code = ${jsonMuniCode('muni_code')}
        WHERE r.snapshot_id = ${ctx.snapshotId}
          AND ${insideColombiaOrNull('r.geom')} IS NOT NULL
          AND NULLIF(${jsonText('name')}, '') IS NOT NULL
      `);
    }

    case 'core.cadastral_manager': {
      // Tabla de atributos por municipio: NO tiene snapshot_id ni geometría, y su clave
      // primaria es muni_code. Se actualiza en sitio, nunca se borra, porque la carga del
      // catastro es la dueña de `coverage_status`, `source_id`, `last_cut_date` y
      // `available_layers`: pisarlos aquí borraría la cobertura ya medida.
      return execute(sql`
        WITH staged AS (
          SELECT ${jsonMuniCode('muni_code')} AS muni_code,
                 NULLIF(${jsonText('manager_name')}, '') AS manager_name,
                 NULLIF(${jsonText('notes')}, '') AS notes
          FROM raw.${ident(rawTable)} r
          WHERE r.snapshot_id = ${ctx.snapshotId}
        ),
        picked AS (
          SELECT DISTINCT ON (s.muni_code) s.*
          FROM staged s
          WHERE s.muni_code IS NOT NULL AND s.manager_name IS NOT NULL
          ORDER BY s.muni_code
        )
        INSERT INTO core.cadastral_manager (muni_code, manager_name, is_igac, coverage_status,
                                            notes, updated_at)
        SELECT p.muni_code,
               p.manager_name,
               public.tc_fold(p.manager_name) = 'IGAC',
               'unknown',
               p.notes,
               now()
        FROM picked p
        JOIN core.municipality m ON m.code = p.muni_code
        ON CONFLICT (muni_code) DO UPDATE SET
          manager_name = EXCLUDED.manager_name,
          is_igac      = EXCLUDED.is_igac,
          notes        = EXCLUDED.notes,
          -- La semilla puso el portal del IGAC como valor por omisión en todos los
          -- municipios. Ahora que se sabe el gestor real, un municipio que NO es del IGAC no
          -- puede seguir remitiendo al portal del IGAC: sería mentirle al usuario justo en el
          -- mensaje de cobertura (regla 6). Se borra; la fuente no publica el portal del
          -- gestor, así que queda NO_DISPONIBLE. Los portales propios ya cargados
          -- (Bogotá, Cali, Medellín, Barranquilla) se conservan.
          manager_url  = CASE
                           WHEN EXCLUDED.is_igac THEN core.cadastral_manager.manager_url
                           WHEN core.cadastral_manager.manager_url LIKE '%igac.gov.co%' THEN NULL
                           ELSE core.cadastral_manager.manager_url
                         END,
          updated_at   = now()
      `);
    }

    case 'core.municipality': {
      // La división administrativa se actualiza en sitio: no se borra, para no perder
      // las referencias de los predios ya cargados.
      return execute(sql`
        UPDATE core.municipality m SET
          geom = core.clean_polygon(r.geom),
          centroid = COALESCE(m.centroid, ST_PointOnSurface(core.clean_polygon(r.geom))),
          area_km2 = round((core.area_m2(core.clean_polygon(r.geom)) / 1000000.0)::numeric, 4),
          snapshot_id = ${ctx.snapshotId}
        FROM raw.${ident(rawTable)} r
        WHERE r.snapshot_id = ${ctx.snapshotId}
          AND r.geom IS NOT NULL
          AND m.code = ${jsonText('code')}
      `);
    }

    case 'ctx.census_block': {
      await execute(sql`DELETE FROM ctx.census_block WHERE snapshot_id = ${ctx.snapshotId}`);
      return execute(sql`
        INSERT INTO ctx.census_block (code, muni_code, kind, pop_total, households, dwellings,
                                      age_bands, attrs, geom, centroid, h3_r9, snapshot_id)
        SELECT
          COALESCE(${jsonText('code')}, md5(payload::text)),
          ${jsonMuniCode('muni_code')},
          COALESCE(${jsonText('kind')}, 'urbano'),
          ${jsonInt('pop_total')},
          ${jsonInt('households')},
          ${jsonInt('dwellings')},
          '{}'::jsonb,
          payload,
          core.clean_polygon(geom),
          ST_PointOnSurface(core.clean_polygon(geom)),
          h3_lat_lng_to_cell(ST_PointOnSurface(core.clean_polygon(geom)), 9),
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId} AND geom IS NOT NULL
        ON CONFLICT (code, snapshot_id) DO NOTHING
      `);
    }

    case 'ctx.protected_area': {
      await execute(sql`DELETE FROM ctx.protected_area WHERE snapshot_id = ${ctx.snapshotId}`);
      return execute(sql`
        INSERT INTO ctx.protected_area (runap_id, name, category, is_restrictive, authority,
                                        attrs, geom, snapshot_id)
        SELECT
          ${jsonText('runap_id')},
          COALESCE(${jsonText('name')}, 'Área protegida sin nombre'),
          ${jsonText('category')},
          TRUE,
          ${jsonText('authority')},
          payload,
          core.clean_polygon(geom),
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId} AND geom IS NOT NULL
      `);
    }

    case 'ctx.hazard': {
      await execute(sql`DELETE FROM ctx.hazard WHERE snapshot_id = ${ctx.snapshotId}`);
      return execute(sql`
        INSERT INTO ctx.hazard (kind, level, level_rank, source, scale, attrs, geom, snapshot_id)
        SELECT
          COALESCE(${jsonText('kind')}, 'mass_movement'),
          ${jsonText('level')},
          CASE public.tc_fold(${jsonText('level')})
            WHEN 'MUY ALTA' THEN 5 WHEN 'ALTA' THEN 4 WHEN 'MEDIA' THEN 3
            WHEN 'BAJA' THEN 2 WHEN 'MUY BAJA' THEN 1 ELSE NULL END,
          ${dataset.source},
          ${jsonText('scale')},
          payload,
          core.clean_polygon(geom),
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId} AND geom IS NOT NULL
      `);
    }

    default:
      throw new Error(
        `Todavía no hay transformación declarada para la tabla destino "${dataset.targetTable}". ` +
          'Añádela en apps/worker/src/etl/generic-pipeline.ts (función transformInto).',
      );
  }
}

async function indexTarget(dataset: DatasetDefinition, ctx: PipelineContext): Promise<number> {
  // El índice unificado de búsqueda se reconstruye una sola vez al final de la corrida,
  // no por dataset: aquí solo se actualizan los H3 que falten.
  if (dataset.targetTable === 'ctx.school') {
    return execute(sql`
      UPDATE ctx.school SET h3_r9 = h3_lat_lng_to_cell(geom, 9)
      WHERE snapshot_id = ${ctx.snapshotId} AND geom IS NOT NULL AND h3_r9 IS NULL
    `);
  }
  if (dataset.targetTable === 'ctx.health_facility') {
    return execute(sql`
      UPDATE ctx.health_facility SET h3_r9 = h3_lat_lng_to_cell(geom, 9)
      WHERE snapshot_id = ${ctx.snapshotId} AND geom IS NOT NULL AND h3_r9 IS NULL
    `);
  }
  if (!hasSnapshotColumn(dataset.targetTable)) {
    // Tablas que se actualizan en sitio (core.cadastral_manager): no se pueden contar por
    // corte. Sus índices los crea la migración, así que aquí no hay nada que reconstruir.
    const rows = await query<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ${ident(dataset.targetTable)}
    `);
    return rows[0]?.n ?? 0;
  }
  const rows = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${ident(dataset.targetTable)} WHERE snapshot_id = ${ctx.snapshotId}
  `);
  return rows[0]?.n ?? 0;
}

export function checksumOf(rows: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export type { StepResult };
