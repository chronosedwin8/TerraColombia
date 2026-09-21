import type { SourceRef } from '@terracolombia/shared';
import { query, queryOne, execute } from '../pool.js';
import { sql, values } from '../sql.js';

export interface DatasetRow {
  id: string;
  source: string;
  name: string;
  description: string | null;
  license: string;
  attribution: string;
  url: string | null;
  frequency: string;
  connector: string | null;
  format: string | null;
  source_srid: number | null;
  target_table: string | null;
  share_alike: boolean;
  notes: string | null;
}

export interface SnapshotRow {
  id: number;
  dataset_id: string;
  cut_date: string;
  loaded_at: string;
  row_count: number | null;
  checksum: string | null;
  status: string;
  is_active: boolean;
  is_synthetic: boolean;
  source_url: string | null;
  storage_key: string | null;
  stage_method: string | null;
  error_message: string | null;
  stats: Record<string, unknown>;
}

export async function upsertDataset(d: Omit<DatasetRow, 'description' | 'notes'> & Partial<DatasetRow>) {
  await execute(sql`
    INSERT INTO meta.dataset (
      id, source, name, description, license, attribution, url, frequency,
      connector, format, source_srid, target_table, share_alike, notes, updated_at
    ) VALUES (
      ${d.id}, ${d.source}, ${d.name}, ${d.description ?? null}, ${d.license}, ${d.attribution},
      ${d.url ?? null}, ${d.frequency}, ${d.connector ?? null}, ${d.format ?? null},
      ${d.source_srid ?? null}, ${d.target_table ?? null}, ${d.share_alike}, ${d.notes ?? null}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      source = EXCLUDED.source, name = EXCLUDED.name, description = EXCLUDED.description,
      license = EXCLUDED.license, attribution = EXCLUDED.attribution, url = EXCLUDED.url,
      frequency = EXCLUDED.frequency, connector = EXCLUDED.connector, format = EXCLUDED.format,
      source_srid = EXCLUDED.source_srid, target_table = EXCLUDED.target_table,
      share_alike = EXCLUDED.share_alike, notes = EXCLUDED.notes, updated_at = now()
  `);
}

export async function getDataset(id: string): Promise<DatasetRow | null> {
  return queryOne<DatasetRow>(sql`SELECT * FROM meta.dataset WHERE id = ${id}`);
}

export async function listDatasets(): Promise<DatasetRow[]> {
  return query<DatasetRow>(sql`SELECT * FROM meta.dataset ORDER BY source, name`);
}

export async function createSnapshot(input: {
  datasetId: string;
  cutDate: string;
  isSynthetic?: boolean;
  sourceUrl?: string | null;
  storageKey?: string | null;
  checksum?: string | null;
  stageMethod?: string | null;
}): Promise<SnapshotRow> {
  const row = await queryOne<SnapshotRow>(sql`
    INSERT INTO meta.snapshot (dataset_id, cut_date, is_synthetic, source_url, storage_key, checksum, stage_method)
    VALUES (${input.datasetId}, ${input.cutDate}::date, ${input.isSynthetic ?? false},
            ${input.sourceUrl ?? null}, ${input.storageKey ?? null}, ${input.checksum ?? null},
            ${input.stageMethod ?? null})
    ON CONFLICT (dataset_id, cut_date) DO UPDATE SET
      source_url = EXCLUDED.source_url,
      storage_key = COALESCE(EXCLUDED.storage_key, meta.snapshot.storage_key),
      checksum = COALESCE(EXCLUDED.checksum, meta.snapshot.checksum),
      stage_method = COALESCE(EXCLUDED.stage_method, meta.snapshot.stage_method)
    RETURNING *
  `);
  if (!row) throw new Error(`No se pudo crear el snapshot de ${input.datasetId}`);
  return row;
}

export async function setSnapshotStatus(
  snapshotId: number,
  status: string,
  extra: { rowCount?: number; errorMessage?: string; stats?: Record<string, unknown> } = {},
): Promise<void> {
  await execute(sql`
    UPDATE meta.snapshot SET
      status = ${status},
      row_count = COALESCE(${extra.rowCount ?? null}, row_count),
      error_message = ${extra.errorMessage ?? null},
      stats = COALESCE(${extra.stats ? JSON.stringify(extra.stats) : null}::jsonb, stats)
    WHERE id = ${snapshotId}
  `);
}

/** Publicación atómica: delega en meta.publish_snapshot, que aplica las guardas. */
export async function publishSnapshot(snapshotId: number): Promise<void> {
  await execute(sql`SELECT meta.publish_snapshot(${snapshotId})`);
}

export async function getActiveSnapshot(datasetId: string): Promise<SnapshotRow | null> {
  return queryOne<SnapshotRow>(sql`
    SELECT * FROM meta.snapshot WHERE dataset_id = ${datasetId} AND is_active LIMIT 1
  `);
}

export async function listSnapshots(datasetId: string, limit = 50): Promise<SnapshotRow[]> {
  return query<SnapshotRow>(sql`
    SELECT * FROM meta.snapshot WHERE dataset_id = ${datasetId}
    ORDER BY cut_date DESC LIMIT ${limit}
  `);
}

/** Cortes disponibles para el selector temporal de la UI. */
export async function listCutDates(datasetIds: string[]): Promise<Array<{ cut_date: string; dataset_id: string }>> {
  if (datasetIds.length === 0) return [];
  return query<{ cut_date: string; dataset_id: string }>(sql`
    SELECT DISTINCT cut_date::text AS cut_date, dataset_id
    FROM meta.snapshot
    WHERE dataset_id IN (${values(datasetIds)}) AND status = 'published'
    ORDER BY cut_date DESC
  `);
}

/**
 * Procedencia lista para el bloque `meta.sources[]` de la API.
 * Regla 4 de CLAUDE.md: si un dataset no tiene snapshot activo, se devuelve igual con
 * `cutDate: null` para que la UI pueda decir "no disponible" en vez de callar.
 */
export async function getSourceRefs(datasetIds: string[]): Promise<SourceRef[]> {
  if (datasetIds.length === 0) return [];
  const rows = await query<{
    dataset_id: string;
    source: string;
    name: string;
    license: string;
    attribution: string;
    url: string | null;
    cut_date: string | null;
    is_synthetic: boolean | null;
  }>(sql`
    SELECT
      d.id AS dataset_id, d.source, d.name, d.license, d.attribution, d.url,
      s.cut_date::text AS cut_date, s.is_synthetic
    FROM meta.dataset d
    LEFT JOIN meta.snapshot s ON s.dataset_id = d.id AND s.is_active
    WHERE d.id IN (${values(datasetIds)})
    ORDER BY d.source, d.name
  `);
  return rows.map((r) => ({
    datasetId: r.dataset_id,
    source: r.source,
    name: r.name,
    cutDate: r.cut_date,
    license: r.license,
    attribution: r.attribution,
    url: r.url,
    synthetic: r.is_synthetic ?? false,
  }));
}

// ─── Linaje y validaciones ────────────────────────────────────────────────────

export async function startRun(datasetId: string, step: string, snapshotId?: number): Promise<number> {
  const row = await queryOne<{ id: number }>(sql`
    INSERT INTO meta.etl_run (dataset_id, snapshot_id, step) VALUES (${datasetId}, ${snapshotId ?? null}, ${step})
    RETURNING id
  `);
  return row!.id;
}

export async function finishRun(
  runId: number,
  status: 'ok' | 'failed' | 'skipped',
  extra: { rowsIn?: number; rowsOut?: number; message?: string; detail?: Record<string, unknown> } = {},
): Promise<void> {
  await execute(sql`
    UPDATE meta.etl_run SET
      status = ${status},
      finished_at = now(),
      duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000,
      rows_in = ${extra.rowsIn ?? null},
      rows_out = ${extra.rowsOut ?? null},
      message = ${extra.message ?? null},
      detail = ${JSON.stringify(extra.detail ?? {})}::jsonb
    WHERE id = ${runId}
  `);
}

export async function recordValidation(input: {
  snapshotId: number;
  checkName: string;
  severity: 'info' | 'warning' | 'error';
  passed: boolean;
  affectedRows?: number;
  message: string;
  sample?: unknown[];
}): Promise<void> {
  await execute(sql`
    INSERT INTO meta.validation (snapshot_id, check_name, severity, passed, affected_rows, message, sample)
    VALUES (${input.snapshotId}, ${input.checkName}, ${input.severity}, ${input.passed},
            ${input.affectedRows ?? 0}, ${input.message}, ${JSON.stringify(input.sample ?? [])}::jsonb)
  `);
}

export async function listValidations(snapshotId: number) {
  return query(sql`
    SELECT check_name, severity, passed, affected_rows, message, sample, created_at
    FROM meta.validation WHERE snapshot_id = ${snapshotId}
    ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, check_name
  `);
}

/** Registra que se descartó una columna por posible dato personal. Nunca guarda el valor. */
export async function recordPiiDiscard(input: {
  snapshotId: number | null;
  datasetId: string;
  sourceLayer: string | null;
  columnName: string;
  reason: 'blocklist_exact' | 'blocklist_pattern' | 'content_heuristic';
  occurrences: number;
}): Promise<void> {
  await execute(sql`
    INSERT INTO meta.pii_discard_log (snapshot_id, dataset_id, source_layer, column_name, reason, occurrences)
    VALUES (${input.snapshotId}, ${input.datasetId}, ${input.sourceLayer}, ${input.columnName},
            ${input.reason}, ${input.occurrences})
  `);
}

// ─── Catálogo de capas ────────────────────────────────────────────────────────

export interface LayerRow {
  id: string;
  dataset_id: string | null;
  name: string;
  description: string;
  geometry_type: string;
  min_zoom: number;
  max_zoom: number;
  legend: Array<{ value: string; label: string; color: string }>;
  glossary_ids: string[];
  min_plan: string;
  sort_order: number;
  is_enabled: boolean;
}

export async function listLayers(): Promise<LayerRow[]> {
  return query<LayerRow>(sql`
    SELECT * FROM meta.layer WHERE is_enabled ORDER BY sort_order, name
  `);
}

export async function getLayer(id: string): Promise<LayerRow | null> {
  return queryOne<LayerRow>(sql`SELECT * FROM meta.layer WHERE id = ${id} AND is_enabled`);
}
