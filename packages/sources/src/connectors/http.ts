/**
 * Cliente HTTP compartido por todos los conectores.
 *
 * Diseñado para ser respetuoso con servidores públicos que no son nuestros
 * (PLAN.md §6.3): concurrencia baja, backoff exponencial con jitter, respeto de
 * `Retry-After`, caché en disco y `User-Agent` identificable.
 *
 * Sin dependencias externas: solo APIs nativas de Node 22+ (`fetch`, `node:fs`,
 * `node:crypto`). Así el crawler corre con `npx tsx` sin instalar nada.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HttpClientOptions {
  /** `User-Agent` enviado en toda petición. Por defecto `ETL_USER_AGENT`. */
  userAgent?: string;
  /** Peticiones simultáneas máximas. Por defecto 2 (regla del plan). */
  concurrency?: number;
  /** Tiempo máximo por intento, en ms. Por defecto 120 000 (IGAC es lento). */
  timeoutMs?: number;
  /** Reintentos tras el primer intento. Por defecto 4. */
  maxRetries?: number;
  /** Espera base del backoff, en ms. Por defecto 1 000. */
  baseDelayMs?: number;
  /** Techo de la espera del backoff, en ms. Por defecto 30 000. */
  maxDelayMs?: number;
  /** Pausa mínima entre peticiones al mismo host, en ms. Por defecto 250. */
  minHostIntervalMs?: number;
  /** Directorio de caché en disco. Por defecto `.cache/http`. */
  cacheDir?: string;
  /** Vida útil de la caché, en ms. Por defecto 7 días. `0` = no expira. */
  cacheTtlMs?: number;
  /** Si es true no se escribe ni se lee caché. */
  noCache?: boolean;
  /** Si es true solo se sirve desde caché; un fallo de caché es error. */
  offline?: boolean;
  /** Implementación de `fetch` a usar. Inyectable para pruebas. */
  fetchImpl?: typeof fetch;
  /** Registro de eventos; por defecto escribe en `stderr` con `LOG_LEVEL`. */
  onEvent?: (event: HttpEvent) => void;
}

export type HttpEvent =
  | { type: 'cache-hit'; url: string; ageMs: number }
  | { type: 'request'; url: string; attempt: number }
  | { type: 'response'; url: string; status: number; ms: number; bytes: number }
  | { type: 'retry'; url: string; attempt: number; delayMs: number; reason: string }
  | { type: 'error'; url: string; reason: string };

export interface HttpRequestOptions {
  method?: 'GET' | 'POST';
  /** Cabeceras adicionales. */
  headers?: Record<string, string>;
  /** Cuerpo para POST; si es objeto se envía como `application/x-www-form-urlencoded`. */
  form?: Record<string, string>;
  /** Desactiva la caché solo para esta petición. */
  noCache?: boolean;
  /** Sobrescribe el timeout para esta petición. */
  timeoutMs?: number;
  /** Sobrescribe los reintentos para esta petición. */
  maxRetries?: number;
  /** Etiqueta para el log (nombre del servicio/capa). */
  label?: string;
  /**
   * Si la respuesta JSON contiene un error de ArcGIS (`{"error":{...}}`) tratarlo
   * como fallo recuperable. Por defecto false: el conector decide.
   */
  retryOnBodyError?: boolean;
}

export interface HttpResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  /** true si salió de la caché en disco. */
  fromCache: boolean;
  /** Milisegundos que tardó (0 si vino de caché). */
  ms: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// ─── Semáforo de concurrencia ─────────────────────────────────────────────────

class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const DEFAULT_USER_AGENT =
  'TerraColombia/0.1 (+https://terracolombia.co; contacto@terracolombia.co)';

/** Estados HTTP que merecen reintento. 429 y 5xx; 504 es habitual en el IGAC. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Errores de red de `undici` que merecen reintento. */
function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { cause?: { code?: string } }).cause?.code ?? '';
  return (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR|socket hang up|fetch failed/i.test(
      `${code} ${err.message}`,
    )
  );
}

/** Backoff exponencial con jitter completo (evita sincronizar reintentos). */
export function backoffDelay(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

/** Interpreta `Retry-After`, que puede venir en segundos o como fecha HTTP. */
export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value.trim());
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Clave de caché: SHA-256 de método + URL + cuerpo. */
export function cacheKeyFor(method: string, url: string, body = ''): string {
  return createHash('sha256').update(`${method} ${url}\n${body}`).digest('hex');
}

function defaultLogger(event: HttpEvent): void {
  const level = process.env.LOG_LEVEL ?? 'info';
  const verbose = level === 'debug' || level === 'trace';
  if (event.type === 'retry' || event.type === 'error') {
    process.stderr.write(`${JSON.stringify({ http: event })}\n`);
    return;
  }
  if (verbose) process.stderr.write(`${JSON.stringify({ http: event })}\n`);
}

// ─── Cliente ──────────────────────────────────────────────────────────────────

interface CacheEnvelope {
  url: string;
  status: number;
  headers: Record<string, string>;
  storedAt: number;
  /** Base64 del cuerpo: seguro para binarios y para JSON con BOM. */
  bodyB64: string;
}

export class HttpClient {
  private readonly semaphore: Semaphore;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly minHostIntervalMs: number;
  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly noCache: boolean;
  private readonly offline: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly onEvent: (e: HttpEvent) => void;
  /** Última marca de tiempo por host, para espaciar peticiones. */
  private readonly lastHostHit = new Map<string, number>();
  /** Fin de una penalización global por host tras un 429. */
  private readonly hostCooldown = new Map<string, number>();

  readonly stats = { requests: 0, cacheHits: 0, retries: 0, errors: 0, bytes: 0 };

  constructor(opts: HttpClientOptions = {}) {
    this.userAgent = opts.userAgent ?? process.env.ETL_USER_AGENT ?? DEFAULT_USER_AGENT;
    const envConcurrency = Number(process.env.ETL_CONCURRENCY);
    this.semaphore = new Semaphore(
      Math.max(1, opts.concurrency ?? (Number.isFinite(envConcurrency) ? envConcurrency : 2)),
    );
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 1_000;
    this.maxDelayMs = opts.maxDelayMs ?? 30_000;
    this.minHostIntervalMs = opts.minHostIntervalMs ?? 250;
    this.cacheDir = opts.cacheDir ?? join(process.cwd(), '.cache', 'http');
    this.cacheTtlMs = opts.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.noCache = opts.noCache ?? false;
    this.offline = opts.offline ?? false;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.onEvent = opts.onEvent ?? defaultLogger;
  }

  /** Ruta en disco de la entrada de caché. Se reparte en subdirectorios por prefijo. */
  cachePathFor(key: string): string {
    return join(this.cacheDir, key.slice(0, 2), `${key}.json`);
  }

  private async readCache(key: string): Promise<CacheEnvelope | null> {
    const path = this.cachePathFor(key);
    try {
      const st = await stat(path);
      const ageMs = Date.now() - st.mtimeMs;
      if (this.cacheTtlMs > 0 && ageMs > this.cacheTtlMs && !this.offline) return null;
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as CacheEnvelope;
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, env: CacheEnvelope): Promise<void> {
    const path = this.cachePathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Escritura atómica: temporal + rename, para no dejar JSON truncado si se corta.
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(env), 'utf8');
    const { rename } = await import('node:fs/promises');
    await rename(tmp, path);
  }

  /** Espacia peticiones al mismo host y aplica la penalización de `Retry-After`. */
  private async throttleHost(host: string): Promise<void> {
    const cooldownUntil = this.hostCooldown.get(host) ?? 0;
    const now = Date.now();
    if (cooldownUntil > now) await sleep(cooldownUntil - now);
    const last = this.lastHostHit.get(host) ?? 0;
    const wait = last + this.minHostIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastHostHit.set(host, Date.now());
  }

  /** Petición con caché, reintentos y control de concurrencia. */
  async request(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
    const method = opts.method ?? 'GET';
    const bodyStr = opts.form ? new URLSearchParams(opts.form).toString() : '';
    const key = cacheKeyFor(method, url, bodyStr);
    const useCache = !this.noCache && !opts.noCache;

    if (useCache) {
      const cached = await this.readCache(key);
      if (cached) {
        this.stats.cacheHits += 1;
        const body = Buffer.from(cached.bodyB64, 'base64');
        this.onEvent({ type: 'cache-hit', url, ageMs: Date.now() - cached.storedAt });
        return {
          url,
          status: cached.status,
          headers: cached.headers,
          body,
          fromCache: true,
          ms: 0,
        };
      }
    }

    if (this.offline) {
      throw new HttpError(`Sin caché para ${url} y el cliente está en modo offline`, url, null, false);
    }

    const host = new URL(url).host;
    const maxRetries = opts.maxRetries ?? this.maxRetries;
    const release = await this.semaphore.acquire();
    try {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        await this.throttleHost(host);
        const started = Date.now();
        this.stats.requests += 1;
        this.onEvent({ type: 'request', url, attempt });
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);
          let res: Response;
          try {
            res = await this.fetchImpl(url, {
              method,
              headers: {
                'User-Agent': this.userAgent,
                'Accept-Encoding': 'gzip, deflate, br',
                ...(method === 'POST'
                  ? { 'Content-Type': 'application/x-www-form-urlencoded' }
                  : {}),
                ...opts.headers,
              },
              ...(method === 'POST' ? { body: bodyStr } : {}),
              signal: controller.signal,
              redirect: 'follow',
            });
          } finally {
            clearTimeout(timer);
          }

          const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
          if (res.status === 429 && retryAfter !== null) {
            // Penalización global del host: nadie más golpea hasta que pase.
            this.hostCooldown.set(host, Date.now() + retryAfter);
          }

          if (!res.ok && isRetryableStatus(res.status)) {
            // Se consume el cuerpo para liberar el socket de undici.
            const snippet = (await res.text()).slice(0, 300);
            lastError = new HttpError(
              `HTTP ${res.status} en ${url}`,
              url,
              res.status,
              true,
              snippet,
            );
            if (attempt < maxRetries) {
              const delay =
                retryAfter ?? backoffDelay(attempt, this.baseDelayMs, this.maxDelayMs);
              this.stats.retries += 1;
              this.onEvent({
                type: 'retry',
                url,
                attempt,
                delayMs: delay,
                reason: `HTTP ${res.status}`,
              });
              await sleep(delay);
              continue;
            }
            throw lastError;
          }

          const buf = Buffer.from(await res.arrayBuffer());
          const ms = Date.now() - started;
          this.stats.bytes += buf.byteLength;
          this.onEvent({ type: 'response', url, status: res.status, ms, bytes: buf.byteLength });

          if (!res.ok) {
            throw new HttpError(
              `HTTP ${res.status} en ${url}`,
              url,
              res.status,
              false,
              buf.subarray(0, 300).toString('utf8'),
            );
          }

          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });

          // Errores de ArcGIS llegan con HTTP 200 y `{"error":{"code":500,…}}`.
          if (opts.retryOnBodyError && looksLikeArcgisError(buf)) {
            lastError = new HttpError(
              `El servicio devolvió un error en el cuerpo: ${buf.subarray(0, 200).toString('utf8')}`,
              url,
              200,
              true,
              buf.subarray(0, 300).toString('utf8'),
            );
            if (attempt < maxRetries) {
              const delay = backoffDelay(attempt, this.baseDelayMs, this.maxDelayMs);
              this.stats.retries += 1;
              this.onEvent({ type: 'retry', url, attempt, delayMs: delay, reason: 'body-error' });
              await sleep(delay);
              continue;
            }
            throw lastError;
          }

          if (useCache) {
            await this.writeCache(key, {
              url,
              status: res.status,
              headers,
              storedAt: Date.now(),
              bodyB64: buf.toString('base64'),
            });
          }

          return { url, status: res.status, headers, body: buf, fromCache: false, ms };
        } catch (err) {
          if (err instanceof HttpError && !err.retryable) {
            this.stats.errors += 1;
            this.onEvent({ type: 'error', url, reason: err.message });
            throw err;
          }
          lastError = err;
          if (!(err instanceof HttpError) && !isRetryableNetworkError(err)) {
            this.stats.errors += 1;
            this.onEvent({
              type: 'error',
              url,
              reason: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
          if (attempt >= maxRetries) break;
          const delay = backoffDelay(attempt, this.baseDelayMs, this.maxDelayMs);
          this.stats.retries += 1;
          this.onEvent({
            type: 'retry',
            url,
            attempt,
            delayMs: delay,
            reason: err instanceof Error ? err.message : String(err),
          });
          await sleep(delay);
        }
      }
      this.stats.errors += 1;
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      this.onEvent({ type: 'error', url, reason });
      if (lastError instanceof HttpError) throw lastError;
      throw new HttpError(
        `Se agotaron los ${maxRetries + 1} intentos contra ${url}: ${reason}`,
        url,
        null,
        true,
      );
    } finally {
      release();
    }
  }

  async getText(url: string, opts: HttpRequestOptions = {}): Promise<string> {
    const res = await this.request(url, opts);
    return res.body.toString('utf8');
  }

  async getJson<T = unknown>(url: string, opts: HttpRequestOptions = {}): Promise<T> {
    const res = await this.request(url, { retryOnBodyError: true, ...opts });
    const text = res.body.toString('utf8').replace(/^/, '');
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new HttpError(
        `Respuesta no es JSON válido (${text.slice(0, 120)}…): ${
          err instanceof Error ? err.message : String(err)
        }`,
        url,
        res.status,
        false,
        text.slice(0, 300),
      );
    }
  }

  async getBuffer(url: string, opts: HttpRequestOptions = {}): Promise<Buffer> {
    const res = await this.request(url, opts);
    return res.body;
  }

  /** `HEAD` sin caché: para tamaño y fecha de un archivo grande. */
  async head(url: string): Promise<{ status: number; headers: Record<string, string> }> {
    const release = await this.semaphore.acquire();
    try {
      await this.throttleHost(new URL(url).host);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: 'HEAD',
          headers: { 'User-Agent': this.userAgent },
          signal: controller.signal,
          redirect: 'follow',
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        return { status: res.status, headers };
      } finally {
        clearTimeout(timer);
      }
    } finally {
      release();
    }
  }
}

/** Detecta `{"error":{…}}` de ArcGIS REST sin parsear el JSON completo. */
function looksLikeArcgisError(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString('utf8');
  return /^\s*\{\s*"error"\s*:/.test(head);
}

/** Construye una URL con parámetros de consulta, omitiendo los `undefined`. */
export function buildUrl(
  base: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/** Cliente por defecto, configurado desde el entorno. */
export function createHttpClient(opts: HttpClientOptions = {}): HttpClient {
  return new HttpClient(opts);
}
