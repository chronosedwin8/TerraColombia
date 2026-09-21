import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getLogger } from '@terracolombia/shared';
import { getPool } from './pool.js';

const log = getLogger({ mod: 'migrator' });

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(HERE, '..', 'migrations');

export interface MigrationFile {
  version: string;
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
  duration_ms: number;
}

const HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS public.schema_migration (
  version     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms BIGINT NOT NULL DEFAULT 0
)`;

/** Lee `migrations/NNNN_nombre.sql` en orden de versión. */
export async function loadMigrations(dir: string = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files = entries.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const out: MigrationFile[] = [];
  for (const f of files) {
    const path = join(dir, f);
    const sql = await readFile(path, 'utf8');
    const version = f.slice(0, 4);
    out.push({
      version,
      name: f.slice(5, -4),
      path,
      sql,
      checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
    });
  }
  return out;
}

export async function getApplied(client: pg.PoolClient | pg.Pool): Promise<AppliedMigration[]> {
  await client.query(HISTORY_TABLE);
  const res = await client.query<AppliedMigration>(
    'SELECT version, name, checksum, applied_at, duration_ms FROM public.schema_migration ORDER BY version',
  );
  return res.rows;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
  drifted: Array<{ version: string; name: string }>;
}

/**
 * Aplica las migraciones pendientes. Cada archivo corre en su propia transacción, así que
 * una falla no deja media migración aplicada.
 *
 * Si el checksum de una migración ya aplicada cambió, se reporta como *drift* y se aborta:
 * editar una migración publicada rompe la reproducibilidad. Lo correcto es añadir una nueva.
 */
export async function migrateUp(dir: string = MIGRATIONS_DIR): Promise<MigrateResult> {
  const pool = getPool();
  const migrations = await loadMigrations(dir);
  const applied = await getApplied(pool);
  const appliedByVersion = new Map(applied.map((a) => [a.version, a]));

  const drifted = migrations
    .filter((m) => {
      const a = appliedByVersion.get(m.version);
      return a && a.checksum !== m.checksum;
    })
    .map((m) => ({ version: m.version, name: m.name }));

  if (drifted.length > 0) {
    const list = drifted.map((d) => `${d.version}_${d.name}`).join(', ');
    throw new Error(
      `Migraciones ya aplicadas cambiaron en disco: ${list}. ` +
        'No se pueden editar migraciones publicadas: crea una migración nueva que corrija el esquema.',
    );
  }

  const result: MigrateResult = { applied: [], skipped: [], drifted: [] };

  for (const m of migrations) {
    if (appliedByVersion.has(m.version)) {
      result.skipped.push(`${m.version}_${m.name}`);
      continue;
    }
    const client = await pool.connect();
    const started = Date.now();
    try {
      await client.query('BEGIN');
      log.info({ version: m.version, name: m.name }, 'Aplicando migración');
      await client.query(m.sql);
      const ms = Date.now() - started;
      await client.query(
        'INSERT INTO public.schema_migration (version, name, checksum, duration_ms) VALUES ($1, $2, $3, $4)',
        [m.version, m.name, m.checksum, ms],
      );
      await client.query('COMMIT');
      log.info({ version: m.version, ms }, 'Migración aplicada');
      result.applied.push(`${m.version}_${m.name}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(
        `Falló la migración ${m.version}_${m.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      client.release();
    }
  }

  return result;
}

export interface MigrationStatus {
  version: string;
  name: string;
  state: 'applied' | 'pending' | 'drifted';
  appliedAt: Date | null;
}

export async function migrationStatus(dir: string = MIGRATIONS_DIR): Promise<MigrationStatus[]> {
  const migrations = await loadMigrations(dir);
  const applied = await getApplied(getPool());
  const byVersion = new Map(applied.map((a) => [a.version, a]));
  return migrations.map((m) => {
    const a = byVersion.get(m.version);
    return {
      version: m.version,
      name: m.name,
      state: !a ? 'pending' : a.checksum !== m.checksum ? 'drifted' : 'applied',
      appliedAt: a?.applied_at ?? null,
    };
  });
}

/**
 * Borra los esquemas gestionados por SQL y el historial. **Destructivo**: solo desarrollo.
 * No toca `public` para no perder PostGIS ni `spatial_ref_sys`.
 */
export async function resetSchemas(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('reset está deshabilitado en producción');
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const schema of ['analytics', 'ctx', 'core', 'raw', 'meta', 'app']) {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await client.query('DROP TABLE IF EXISTS public.schema_migration');
    await client.query('DROP FUNCTION IF EXISTS public.tc_fold(text)');
    await client.query('COMMIT');
    log.warn({}, 'Esquemas eliminados: hay que volver a migrar y sembrar');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
