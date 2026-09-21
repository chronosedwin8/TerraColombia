/**
 * Cliente HTTP tipado del API interno (`/api/v1`).
 *
 * Responsabilidades:
 * - Envolver `fetch` y desempaquetar el sobre `{ data, meta }`.
 * - Traducir los errores del backend a `AppError` de `@terracolombia/shared`
 *   preservando el `ErrorCode`, para que la UI decida qué mensaje mostrar.
 * - Refrescar el access token una sola vez por fallo 401 y reintentar la petición.
 * - Caché condicional por ETag para los GET (evita transferir de nuevo fichas y catálogos).
 *
 * SUPUESTOS DEL CONTRATO:
 * - El refresh token viaja en una cookie HttpOnly emitida por `/auth/login`; el cliente
 *   solo llama `POST /auth/refresh` con `credentials: 'include'` y recibe un access token
 *   nuevo. Así el token de larga vida nunca queda accesible a JavaScript.
 * - Los errores llegan como `{ error: { code, message, details } }` (formato de `AppError.toJSON`).
 */
import { AppError, MESSAGES, type ErrorCode, type Envelope, type ResponseMeta } from '@terracolombia/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** Códigos que el backend puede devolver. Se usa para validar antes de construir el AppError. */
const KNOWN_ERROR_CODES: readonly ErrorCode[] = [
  'NOT_FOUND',
  'PARCEL_NOT_FOUND',
  'INVALID_NPN',
  'VALIDATION',
  'AREA_TOO_LARGE',
  'QUOTA_EXCEEDED',
  'INSUFFICIENT_CREDITS',
  'RATE_LIMITED',
  'TIMEOUT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PLAN_REQUIRED',
  'COVERAGE_MISSING',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL',
];

function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && (KNOWN_ERROR_CODES as readonly string[]).includes(v);
}

// ─── Estado del token ─────────────────────────────────────────────────────────

let accessToken: string | null = null;
/** Promesa de refresco en curso: varias peticiones en paralelo comparten un solo refresh. */
let refreshInFlight: Promise<boolean> | null = null;
/** Se invoca cuando el refresco falla definitivamente; el store de auth cierra la sesión. */
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

// ─── Caché por ETag ───────────────────────────────────────────────────────────

interface EtagEntry {
  etag: string;
  // Guardamos el sobre completo; `unknown` porque la caché es heterogénea.
  envelope: Envelope<unknown>;
}

const etagCache = new Map<string, EtagEntry>();

/** Limpia la caché condicional. Necesario al cambiar de sesión o de corte temporal. */
export function clearEtagCache(): void {
  etagCache.clear();
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;

/** Serializa parámetros de consulta omitiendo vacíos; los arreglos van separados por coma. */
export function toQueryString(params: Record<string, QueryValue>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      sp.set(key, value.join(','));
    } else {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

function buildUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseErrorBody(res: Response): Promise<AppError> {
  let code: ErrorCode = 'INTERNAL';
  // Tipo explícito: sin él, TypeScript infiere el literal de MESSAGES y luego rechaza
  // el mensaje que venga del servidor.
  let message: string = MESSAGES.common.error;
  let details: Record<string, unknown> = {};

  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const err = (body as { error: unknown }).error;
      if (err && typeof err === 'object') {
        const e = err as { code?: unknown; message?: unknown; details?: unknown };
        if (isErrorCode(e.code)) code = e.code;
        if (typeof e.message === 'string' && e.message.length > 0) message = e.message;
        if (e.details && typeof e.details === 'object') {
          details = e.details as Record<string, unknown>;
        }
      }
    }
  } catch {
    // Respuesta sin JSON (proxy caído, HTML de error). Se infiere por el código HTTP.
  }

  if (code === 'INTERNAL') {
    const inferred = inferCodeFromStatus(res.status);
    if (inferred) {
      code = inferred;
      if (message === MESSAGES.common.error) message = defaultMessageFor(inferred);
    }
  }

  return new AppError(code, message, { ...details, httpStatus: res.status });
}

function inferCodeFromStatus(status: number): ErrorCode | null {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 402:
      return 'QUOTA_EXCEEDED';
    case 413:
      return 'AREA_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'UPSTREAM_UNAVAILABLE';
    case 504:
      return 'TIMEOUT';
    default:
      return null;
  }
}

function defaultMessageFor(code: ErrorCode): string {
  const m = MESSAGES.errors;
  switch (code) {
    case 'NOT_FOUND':
      return m.notFound;
    case 'PARCEL_NOT_FOUND':
      return m.parcelNotFound;
    case 'INVALID_NPN':
      return m.invalidNpn;
    case 'QUOTA_EXCEEDED':
      return m.quotaExceeded;
    case 'RATE_LIMITED':
      return m.rateLimited;
    case 'TIMEOUT':
      return m.timeout;
    case 'UNAUTHORIZED':
      return m.unauthorized;
    case 'FORBIDDEN':
    case 'PLAN_REQUIRED':
      return m.forbidden;
    default:
      return MESSAGES.common.error;
  }
}

// ─── Refresco de token ────────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      const body: unknown = await res.json();
      const token = extractAccessToken(body);
      if (!token) return false;
      accessToken = token;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function extractAccessToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const data = 'data' in body ? (body as { data: unknown }).data : body;
  if (!data || typeof data !== 'object') return null;
  const token = (data as { accessToken?: unknown }).accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

// ─── Petición base ────────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Cuerpo JSON. Se serializa automáticamente. */
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Desactiva la caché condicional por ETag para este GET. */
  noCache?: boolean;
  /** No intentar refrescar el token ante un 401 (se usa en los propios endpoints de auth). */
  skipAuthRetry?: boolean;
  headers?: Record<string, string>;
}

/**
 * Ejecuta una petición y devuelve el sobre completo `{ data, meta }`.
 * La UI necesita `meta` para pintar procedencia, cobertura y el banner de demostración:
 * por eso el cliente nunca la descarta.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const method = options.method ?? 'GET';
  const url = buildUrl(path) + toQueryString(options.query ?? {});
  const useEtag = method === 'GET' && !options.noCache;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const cached = useEtag ? etagCache.get(url) : undefined;
    if (cached) headers['If-None-Match'] = cached.etag;

    const init: RequestInit = {
      method,
      headers,
      credentials: 'include',
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    if (options.signal) init.signal = options.signal;

    return fetch(url, init);
  };

  let res = await doFetch();

  if (res.status === 401 && !options.skipAuthRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      accessToken = null;
      onSessionExpired?.();
      throw AppError.unauthorized();
    }
  }

  if (res.status === 304 && useEtag) {
    const cached = etagCache.get(url);
    if (cached) return cached.envelope as Envelope<T>;
    // Sin copia local: se repite sin cabecera condicional.
    return request<T>(path, { ...options, noCache: true });
  }

  if (!res.ok) throw await parseErrorBody(res);

  if (res.status === 204) {
    return { data: undefined as T, meta: emptyMeta() };
  }

  const body: unknown = await res.json();
  const envelope = normalizeEnvelope<T>(body);

  if (useEtag) {
    const etag = res.headers.get('ETag');
    if (etag) etagCache.set(url, { etag, envelope: envelope as Envelope<unknown> });
  }

  return envelope;
}

/**
 * Meta vacía para respuestas sin cifras (204, mutaciones). No habilita mostrar datos:
 * `sources` vacío hace que `ProvenanceFooter` y `DataValue` oculten cualquier valor.
 */
export function emptyMeta(): ResponseMeta {
  return {
    sources: [],
    cutDate: null,
    coverage: null,
    synthetic: false,
    generatedAt: new Date().toISOString(),
    warnings: [],
  };
}

function normalizeEnvelope<T>(body: unknown): Envelope<T> {
  if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
    return body as Envelope<T>;
  }
  // Endpoint que no envuelve (no debería ocurrir): se marca sin procedencia.
  return { data: body as T, meta: emptyMeta() };
}

/** Atajo cuando solo interesa `data`. Úsalo solo para datos sin cifras que citar. */
export async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await request<T>(path, options);
  return data;
}

// ─── Descargas ────────────────────────────────────────────────────────────────

/** Descarga un archivo binario (informes, exportaciones) y devuelve el Blob y el nombre. */
export async function requestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const url = buildUrl(path) + toQueryString(options.query ?? {});
  const headers: Record<string, string> = { ...options.headers };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const init: RequestInit = { method: options.method ?? 'GET', headers, credentials: 'include' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options.signal) init.signal = options.signal;

  let res = await fetch(url, init);
  if (res.status === 401 && !options.skipAuthRetry && (await refreshAccessToken())) {
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    res = await fetch(url, init);
  }
  if (!res.ok) throw await parseErrorBody(res);

  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get('Content-Disposition')) ?? 'terracolombia',
  };
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain?.[1] ?? null;
}

// ─── SSE de trabajos ──────────────────────────────────────────────────────────

/**
 * Suscribe a `GET /jobs/:id/stream`. Devuelve una función para cerrar la conexión.
 * `EventSource` no acepta cabeceras, así que el backend autentica por cookie de sesión
 * (supuesto del contrato) — el access token no puede viajar en la URL.
 */
export function subscribeToJob(
  jobId: string,
  handlers: {
    onProgress?: (payload: { progress: number | null; stage: string | null }) => void;
    onDone?: (payload: unknown) => void;
    onError?: (error: AppError) => void;
  },
): () => void {
  const url = `${buildUrl(`/jobs/${encodeURIComponent(jobId)}/stream`)}`;
  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener('progress', (event) => {
    const parsed = safeParse((event as MessageEvent<string>).data);
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as { progress?: unknown; stage?: unknown };
    handlers.onProgress?.({
      progress: typeof p.progress === 'number' ? p.progress : null,
      stage: typeof p.stage === 'string' ? p.stage : null,
    });
  });

  source.addEventListener('done', (event) => {
    handlers.onDone?.(safeParse((event as MessageEvent<string>).data));
    source.close();
  });

  source.addEventListener('failed', (event) => {
    const parsed = safeParse((event as MessageEvent<string>).data);
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : MESSAGES.common.error;
    handlers.onError?.(new AppError('INTERNAL', message));
    source.close();
  });

  source.onerror = () => {
    // El navegador reintenta solo; si la conexión ya está cerrada, se avisa.
    if (source.readyState === EventSource.CLOSED) {
      handlers.onError?.(new AppError('UPSTREAM_UNAVAILABLE', MESSAGES.common.error));
    }
  };

  return () => source.close();
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
