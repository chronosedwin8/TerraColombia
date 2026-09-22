import pg from 'pg';
import { getLogger } from '@terracolombia/shared';
import type { SqlBuilder, SqlQuery } from './sql.js';

const { Pool, types } = pg;

/**
 * `pg` devuelve NUMERIC como string para no perder precisión. En este dominio los
 * NUMERIC son áreas, distancias y porcentajes que caben de sobra en un double, y la API
 * los serializa a JSON: los convertimos a number aquí para no ensuciar cada consulta.
 * Excepción: `cadastral_value` y montos en COP se leen con `::text` explícito donde importa.
 */
const OID_NUMERIC = 1700;
const OID_INT8 = 20;
types.setTypeParser(OID_NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(OID_INT8, (v) => (v === null ? null : Number(v)));
/*
 * DATE se devuelve como texto 'AAAA-MM-DD', no como Date de JavaScript. node-pg convierte
 * un DATE en un Date a medianoche LOCAL, que al serializarse a JSON sale como
 * '2026-08-31T05:00:00.000Z' (Colombia es UTC-5): el observatorio mostraba eso tal cual
 * como «último corte catastral», y en un servidor con otra zona horaria el día cambia.
 * Una fecha de corte es un día, no un instante.
 */
const OID_DATE = 1082;
types.setTypeParser(OID_DATE, (v) => v);

let pool: pg.Pool | null = null;

export interface DbConfig {
  connectionString: string;
  max?: number;
  statementTimeoutMs?: number;
  applicationName?: string;
}

export function createPool(config: DbConfig): pg.Pool {
  const p = new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
    application_name: config.applicationName ?? 'terracolombia',
    statement_timeout: config.statementTimeoutMs ?? 30_000,
    idle_in_transaction_session_timeout: 60_000,
  });
  p.on('error', (err) => {
    getLogger({ mod: 'db' }).error({ err: err.message }, 'Error en cliente inactivo del pool');
  });
  return p;
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está definida. Copia .env.example a .env y ajusta la cadena de conexión.',
    );
  }
  pool = createPool({ connectionString });
  return pool;
}

export function setPool(p: pg.Pool): void {
  pool = p;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function toQuery(q: SqlBuilder | SqlQuery | string, params?: unknown[]): SqlQuery {
  if (typeof q === 'string') return { text: q, values: params ?? [] };
  if ('build' in q && typeof (q as SqlBuilder).build === 'function') {
    return (q as SqlBuilder).build();
  }
  return q as SqlQuery;
}

/** Ejecuta y devuelve las filas. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  q: SqlBuilder | SqlQuery | string,
  params?: unknown[],
): Promise<T[]> {
  const { text, values } = toQuery(q, params);
  const started = Date.now();
  try {
    const res = await getPool().query<T>(text, values);
    const ms = Date.now() - started;
    if (ms > 1000) {
      getLogger({ mod: 'db' }).warn({ ms, text: text.slice(0, 300) }, 'Consulta lenta');
    }
    return res.rows;
  } catch (err) {
    getLogger({ mod: 'db' }).error(
      { err: err instanceof Error ? err.message : String(err), text: text.slice(0, 500) },
      'Error de consulta',
    );
    throw err;
  }
}

/** Ejecuta y devuelve la primera fila o null. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  q: SqlBuilder | SqlQuery | string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(q, params);
  return rows[0] ?? null;
}

/** Ejecuta y devuelve el número de filas afectadas. */
export async function execute(q: SqlBuilder | SqlQuery | string, params?: unknown[]): Promise<number> {
  const { text, values } = toQuery(q, params);
  const res = await getPool().query(text, values);
  return res.rowCount ?? 0;
}

/** Transacción con reintento automático ante fallos de serialización. */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  opts: { isolation?: 'read committed' | 'repeatable read' | 'serializable'; retries?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query(
        opts.isolation ? `BEGIN ISOLATION LEVEL ${opts.isolation.toUpperCase()}` : 'BEGIN',
      );
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (err as { code?: string }).code;
      // 40001 serialization_failure, 40P01 deadlock_detected
      if ((code === '40001' || code === '40P01') && attempt < retries) {
        getLogger({ mod: 'db' }).warn({ attempt, code }, 'Reintentando transacción');
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
  throw new Error('Transacción agotó los reintentos');
}

/**
 * Ejecuta con un `statement_timeout` distinto al del pool, solo para esa consulta.
 * Se usa para separar consultas interactivas (8 s) de análisis (30 s) y exportes (120 s).
 *
 * `SET LOCAL` solo tiene efecto dentro de una transacción, así que la consulta se envuelve
 * en una. Fuera de ella, PostgreSQL ignora el ajuste con un aviso y el límite no se aplicaría.
 */
export async function queryWithTimeout<T extends pg.QueryResultRow = pg.QueryResultRow>(
  q: SqlBuilder | SqlQuery | string,
  timeoutMs: number,
  params?: unknown[],
): Promise<T[]> {
  const { text, values } = toQuery(q, params);
  const client = await getPool().connect();
  // El valor no se interpola desde entrada externa: se fuerza a entero acotado.
  const ms = Math.min(600_000, Math.max(100, Math.floor(timeoutMs)));
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    const res = await client.query<T>(text, values);
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((err as { code?: string }).code === '57014') {
      getLogger({ mod: 'db' }).warn(
        { ms, text: text.slice(0, 200) },
        'Consulta cancelada por statement_timeout',
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Escritura de mantenimiento con su propio `statement_timeout`.
 *
 * El pool fija 30 s para que una consulta interactiva descuidada no bloquee la base. Pero
 * recalcular los agregados por celda de un municipio de 100.000 predios no es una consulta
 * interactiva: es un trabajo por lotes, y con el tope de 30 s moría a mitad de camino en
 * cuanto entraron los datos reales. Igual que `queryWithTimeout` para lecturas, pero en una
 * transacción de escritura.
 */
export async function executeMaintenance(
  q: SqlBuilder | SqlQuery | string,
  timeoutMs = 600_000,
  params?: unknown[],
): Promise<number> {
  const { text, values } = toQuery(q, params);
  const client = await getPool().connect();
  const ms = Math.min(3_600_000, Math.max(1_000, Math.floor(timeoutMs)));
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${ms}`);
    const res = await client.query(text, values);
    await client.query('COMMIT');
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Comprobación de salud: conexión, PostGIS, h3 y EPSG:9377. */
export async function healthCheck(): Promise<{
  ok: boolean;
  postgres: string | null;
  postgis: string | null;
  h3: boolean;
  srid9377: boolean;
  problems: string[];
}> {
  const problems: string[] = [];
  let postgres: string | null = null;
  let postgis: string | null = null;
  let h3 = false;
  let srid9377 = false;

  try {
    const r = await queryOne<{ version: string }>('SELECT version() AS version');
    postgres = r?.version ?? null;
  } catch (e) {
    problems.push(`No hay conexión a PostgreSQL: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, postgres, postgis, h3, srid9377, problems };
  }

  try {
    const r = await queryOne<{ v: string }>('SELECT postgis_lib_version() AS v');
    postgis = r?.v ?? null;
  } catch {
    problems.push('La extensión postgis no está instalada en esta base.');
  }

  try {
    await queryOne("SELECT h3_lat_lng_to_cell(POINT(-74.1, 4.65), 9) AS c");
    h3 = true;
  } catch {
    problems.push('La extensión h3 no está instalada: los agregados por celda no funcionarán.');
  }

  try {
    const r = await queryOne<{ n: number }>(
      'SELECT count(*)::int AS n FROM spatial_ref_sys WHERE srid = 9377',
    );
    srid9377 = (r?.n ?? 0) > 0;
    if (!srid9377) {
      problems.push('Falta EPSG:9377 en spatial_ref_sys: aplica la migración 0001.');
    }
  } catch {
    problems.push('No se pudo verificar EPSG:9377.');
  }

  return { ok: problems.length === 0, postgres, postgis, h3, srid9377, problems };
}
