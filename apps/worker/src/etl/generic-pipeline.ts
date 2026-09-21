import { createHash } from 'node:crypto';
import { getLogger, isShareAlike } from '@terracolombia/shared';
import { execute, query, recordPiiDiscard } from '@terracolombia/db';
import { ident, sql } from '@terracolombia/db/sql';
import type { DatasetDefinition } from '@terracolombia/etl-config';
import type { DatasetPipeline, PipelineContext, StepResult, ValidationFinding } from './pipeline.js';
import { validateCadastreSnapshot, validateContextSnapshot } from './validations.js';

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

        const { cleaned, discarded } = stripPii(rows, dataset, helpers);
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

        const rawTable = `raw_${dataset.id.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
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
        return {
          rowsIn: rows.length,
          rowsOut: inserted,
          message: `${inserted} filas en raw.${rawTable}; ${Object.keys(discarded).length} columnas descartadas por posible dato personal`,
          detail: { rawTable, discardedColumns: Object.keys(discarded) },
        };
      },

      async transform(ctx) {
        const rawTable = ctx.state.rawTable as string | undefined;
        if (!rawTable) return { message: 'Sin tabla de entrada: nada que transformar', skipRest: true };
        if (!helpers.isInspected(dataset.fieldMapping)) {
          return { message: 'Sin mapeo inspeccionado: no se transforma', skipRest: true };
        }
        const rowsOut = await transformInto(dataset, rawTable, ctx, helpers);
        return {
          rowsOut,
          message: `${rowsOut} filas en ${dataset.targetTable}`,
        };
      },

      async validate(ctx) {
        const findings: ValidationFinding[] =
          dataset.targetTable === 'core.parcel'
            ? await validateCadastreSnapshot(ctx.snapshotId, ctx.previousSnapshotId)
            : await validateContextSnapshot(
                dataset.targetTable,
                ctx.snapshotId,
                ctx.previousSnapshotId,
                { attrsColumn: hasAttrsColumn(dataset.targetTable) ? 'attrs' : null },
              );

        const errors = findings.filter((f) => !f.passed && f.severity === 'error').length;
        return {
          findings,
          message:
            errors > 0
              ? `${errors} validaciones con severidad error: el corte NO se publicará`
              : `${findings.length} validaciones ejecutadas, ninguna bloqueante`,
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
      const pageSize = 1000;
      for (let offset = 0; offset < 500_000; offset += pageSize) {
        const url = `${dataset.url}${dataset.url.includes('?') ? '&' : '?'}$limit=${pageSize}&$offset=${offset}`;
        const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${dataset.id}`);
        const batch = (await res.json()) as Array<Record<string, unknown>>;
        if (batch.length === 0) break;
        for (const r of batch) rows.push({ properties: r });
        await ctx.job.progress(
          Math.min(95, Math.round((rows.length / 50_000) * 100)),
          `${rows.length} registros descargados`,
        );
        if (batch.length < pageSize) break;
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

// ─── Filtro de PII ────────────────────────────────────────────────────────────

/**
 * Elimina de cada registro las columnas que la lista negra marca como posible dato personal.
 * Devuelve también el conteo por columna descartada, para el registro de `meta.pii_discard_log`.
 */
function stripPii(
  rows: FetchedFeature[],
  dataset: DatasetDefinition,
  helpers: EtlConfigHelpers,
): { cleaned: FetchedFeature[]; discarded: Record<string, number> } {
  const discarded: Record<string, number> = {};
  const extra = new Set(dataset.piiBlocklist.map((c) => c.toLowerCase()));

  const cleaned = rows.map((row) => {
    const props = (row.properties ?? row) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (helpers.isPiiColumn(key) || extra.has(key.toLowerCase())) {
        discarded[key] = (discarded[key] ?? 0) + 1;
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

  return { cleaned, discarded };
}

// ─── Transformación a las tablas de destino ───────────────────────────────────

function hasAttrsColumn(targetTable: string): boolean {
  return ![
    'core.municipality',
    'core.department',
    'ctx.population_projection',
    'ctx.elevation_cell',
  ].includes(targetTable);
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

  switch (dataset.targetTable) {
    case 'ctx.school': {
      await execute(sql`DELETE FROM ctx.school WHERE snapshot_id = ${ctx.snapshotId}`);
      return execute(sql`
        INSERT INTO ctx.school (dane_code, name, muni_code, sector, levels, location_kind,
                                enrollment, enrollment_year, attrs, geom, h3_r9, snapshot_id)
        SELECT
          ${jsonText('dane_code')},
          COALESCE(${jsonText('name')}, 'Sin nombre'),
          ${jsonText('muni_code')},
          ${jsonText('sector')},
          '{}'::text[],
          ${jsonText('location_kind')},
          ${jsonInt('enrollment')},
          ${jsonInt('enrollment_year')},
          payload,
          CASE WHEN geom IS NULL THEN NULL ELSE ST_Transform(ST_Force2D(geom), 4326) END,
          CASE WHEN geom IS NULL THEN NULL
               ELSE h3_lat_lng_to_cell(ST_Transform(ST_Force2D(geom), 4326), 9) END,
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId}
      `);
    }

    case 'ctx.health_facility': {
      await execute(sql`DELETE FROM ctx.health_facility WHERE snapshot_id = ${ctx.snapshotId}`);
      return execute(sql`
        INSERT INTO ctx.health_facility (reps_code, name, muni_code, level, nature, services,
                                         attrs, geom, h3_r9, snapshot_id)
        SELECT
          ${jsonText('reps_code')},
          COALESCE(${jsonText('name')}, 'Sin nombre'),
          ${jsonText('muni_code')},
          ${jsonText('level')},
          ${jsonText('nature')},
          '{}'::text[],
          payload,
          CASE WHEN geom IS NULL THEN NULL ELSE ST_Transform(ST_Force2D(geom), 4326) END,
          CASE WHEN geom IS NULL THEN NULL
               ELSE h3_lat_lng_to_cell(ST_Transform(ST_Force2D(geom), 4326), 9) END,
          ${ctx.snapshotId}
        FROM raw.${ident(rawTable)}
        WHERE snapshot_id = ${ctx.snapshotId}
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
          ${jsonText('muni_code')},
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
  const rows = await query<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM ${ident(dataset.targetTable)} WHERE snapshot_id = ${ctx.snapshotId}
  `);
  return rows[0]?.n ?? 0;
}

export function checksumOf(rows: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export type { StepResult };
