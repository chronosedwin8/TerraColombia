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
import {
  AppError,
  JOB_STATUSES,
  MESSAGES,
  type ErrorCode,
  type Envelope,
  type JobStatus,
  type ResponseMeta,
} from '@terracolombia/shared';
import type { JobDoneEvent, JobProgressEvent } from './types';

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
/** Se invoca cuando el refresco falla definitivamente; el store de auth cierra la sesión. */
let onSessionExpired: (() => void) | null = null;

/**
 * Se pone en true cuando `/auth/refresh` responde 401: no hay cookie de sesión. A partir de
 * ahí, un 401 de cualquier otra petición NO vuelve a intentar el refresco hasta que alguien
 * inicie sesión (`setAccessToken`). Sin esta marca, un visitante anónimo disparaba un refresco
 * por cada petición protegida de cada pantalla —33 en un recorrido de 20 páginas— y acababa
 * en 429 del propio límite de peticiones.
 */
let sessionAbsent = false;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) sessionAbsent = false;
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

/** Lo que devuelve `/auth/refresh`: el usuario y el access token nuevo. */
export interface RefreshedSession {
  user: unknown;
  accessToken: string;
}

let sessionRefreshInFlight: Promise<RefreshedSession | null> | null = null;

/**
 * ÚNICA puerta al refresco de sesión. La usan tanto el arranque de la app (`auth.bootstrap`)
 * como el reintento automático ante un 401, y comparten la promesa en curso.
 *
 * El servidor rota el refresh token y revoca TODA la familia si ve reutilizar uno viejo
 * (protección contra robo de cookie). Con dos caminos distintos al refresco —el arranque por
 * un lado y el reintento de la primera petición protegida por otro— los dos disparaban a la
 * vez con la misma cookie, el segundo contaba como reutilización y el usuario aparecía
 * desconectado al cambiar de página. Lo destapó el recorrido automatizado de la interfaz.
 */
export async function refreshSession(): Promise<RefreshedSession | null> {
  if (sessionRefreshInFlight) return sessionRefreshInFlight;
  if (sessionAbsent) return null;

  sessionRefreshInFlight = (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (res.status === 401) sessionAbsent = true;
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const token = extractAccessToken(body);
      if (!token) return null;
      accessToken = token;
      const data = (body as { data?: { user?: unknown } }).data;
      return { user: data?.user ?? null, accessToken: token };
    } catch {
      return null;
    } finally {
      sessionRefreshInFlight = null;
    }
  })();

  return sessionRefreshInFlight;
}

async function refreshAccessToken(): Promise<boolean> {
  return (await refreshSession()) !== null;
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

/**
 * Desempaqueta el sobre `{ data, meta }`.
 *
 * Verificado contra la API viva; hay dos casos que el cast ciego anterior ocultaba:
 *
 * 1. Las rutas de `/auth/*` devuelven `{ data }` SIN `meta`. La comprobación anterior
 *    exigía ambas claves, así que envolvía `{data:…}` OTRA VEZ y la sesión llegaba a la
 *    UI como `envelope.data.data`. Ahora basta con que exista `data`.
 * 2. Algunos errores de dominio (COVERAGE_MISSING en `/areas/analyze`, `/changes/compare`
 *    y `/location-intel`) viajan con **HTTP 200** y cuerpo `{ error: {...} }`. Como
 *    `res.ok` es true, nunca pasaban por `parseErrorBody` y la vista recibía un objeto
 *    `{error}` casteado a `T`: pantalla vacía sin un solo fallo visible. Se detecta aquí
 *    y se lanza el `AppError` que corresponde.
 */
function normalizeEnvelope<T>(body: unknown): Envelope<T> {
  if (body && typeof body === 'object') {
    // Error de dominio servido con estado 2xx.
    if ('error' in body && !('data' in body)) {
      throw errorFromBody((body as { error: unknown }).error);
    }
    if ('data' in body) {
      const withData = body as { data: T; meta?: unknown };
      const meta = withData.meta;
      return {
        data: withData.data,
        meta: isResponseMeta(meta) ? meta : emptyMeta(),
      };
    }
  }
  // Endpoint que no envuelve (no debería ocurrir): se marca sin procedencia.
  return { data: body as T, meta: emptyMeta() };
}

/** Mínimo para considerar que el objeto es un `ResponseMeta` y no basura. */
function isResponseMeta(value: unknown): value is ResponseMeta {
  return Boolean(value) && typeof value === 'object' && 'sources' in (value as object);
}

/** Construye el `AppError` a partir del bloque `error` del cuerpo. */
function errorFromBody(err: unknown): AppError {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; details?: unknown };
    const code: ErrorCode = isErrorCode(e.code) ? e.code : 'INTERNAL';
    const message =
      typeof e.message === 'string' && e.message.length > 0 ? e.message : defaultMessageFor(code);
    const details =
      e.details && typeof e.details === 'object' ? (e.details as Record<string, unknown>) : {};
    return new AppError(code, message, details);
  }
  return new AppError('INTERNAL', MESSAGES.common.error);
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
 * — el access token no puede viajar en la URL.
 *
 * Eventos reales (verificado en `apps/api/src/routes/jobs.ts`):
 * - `progress`: `{ id, status, progress, message }`  ← el texto es `message`, no `stage`.
 * - `done`:     `{ id, status, result, errorMessage }` ← el resultado va ANIDADO en `result`.
 * - `failed`:   `{ id, status, result: null, errorMessage }` ← el texto es `errorMessage`.
 * - `error`:    `{ message }` cuando el trabajo ya no existe.
 */
export function subscribeToJob<TResult = unknown>(
  jobId: string,
  handlers: {
    onProgress?: (payload: JobProgressEvent) => void;
    onDone?: (payload: JobDoneEvent<TResult>) => void;
    onFailed?: (payload: JobDoneEvent<TResult>) => void;
    onError?: (error: AppError) => void;
  },
): () => void {
  const url = `${buildUrl(`/jobs/${encodeURIComponent(jobId)}/stream`)}`;
  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener('progress', (event) => {
    const parsed = safeParse((event as MessageEvent<string>).data);
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as { id?: unknown; status?: unknown; progress?: unknown; message?: unknown };
    handlers.onProgress?.({
      id: typeof p.id === 'string' ? p.id : jobId,
      status: isJobStatus(p.status) ? p.status : 'running',
      progress: typeof p.progress === 'number' ? p.progress : null,
      message: typeof p.message === 'string' ? p.message : null,
    });
  });

  source.addEventListener('done', (event) => {
    handlers.onDone?.(parseJobDone<TResult>((event as MessageEvent<string>).data, jobId, 'done'));
    source.close();
  });

  source.addEventListener('failed', (event) => {
    const payload = parseJobDone<TResult>((event as MessageEvent<string>).data, jobId, 'failed');
    // `onError` queda para los fallos de TRANSPORTE. Si quien llama distingue el fallo
    // del trabajo con `onFailed`, no se le notifica dos veces la misma cosa.
    if (handlers.onFailed) {
      handlers.onFailed(payload);
    } else {
      handlers.onError?.(new AppError('INTERNAL', payload.errorMessage ?? MESSAGES.common.error));
    }
    source.close();
  });

  // El worker emite `error` cuando el trabajo desapareció de la base.
  source.addEventListener('error', (event) => {
    const data = (event as MessageEvent<string>).data;
    // `EventSource` también dispara `error` sin datos ante un corte de red: ese caso lo
    // trata `onerror`, así que aquí solo interesa el evento con nombre que manda el API.
    if (typeof data !== 'string' || data.length === 0) return;
    const parsed = safeParse(data);
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : MESSAGES.common.error;
    handlers.onError?.(new AppError('NOT_FOUND', message));
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

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}

function parseJobDone<TResult>(raw: string, fallbackId: string, fallback: JobStatus): JobDoneEvent<TResult> {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return { id: fallbackId, status: fallback, result: null, errorMessage: null };
  }
  const p = parsed as { id?: unknown; status?: unknown; result?: unknown; errorMessage?: unknown };
  return {
    id: typeof p.id === 'string' ? p.id : fallbackId,
    status: isJobStatus(p.status) ? p.status : fallback,
    result: (p.result ?? null) as TResult | null,
    errorMessage: typeof p.errorMessage === 'string' ? p.errorMessage : null,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
