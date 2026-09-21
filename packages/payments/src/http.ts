import { getLogger } from '@terracolombia/shared';
import { PaymentError } from './types.js';

/**
 * Cliente HTTP mínimo para los adaptadores de pago.
 *
 * Usa el `fetch` global de Node 22+. No hay dependencias porque lo único que hace falta es
 * tiempo límite, reintentos acotados y normalización de errores. Nunca registra cabeceras de
 * autorización ni cuerpos completos: podrían llevar datos del pagador.
 */

const log = getLogger({ mod: 'payments/http' });

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Reintentos ante 429 y 5xx. Solo para peticiones idempotentes. */
  retries?: number;
  /** Nombre del proveedor, para los mensajes de error. */
  providerLabel: string;
}

export interface HttpResult<T> {
  status: number;
  data: T;
  /** Cuerpo crudo, por si hay que guardarlo para auditoría. */
  text: string;
  headers: Record<string, string>;
}

const REDACTED_HEADERS = new Set(['authorization', 'x-signature', 'cookie', 'set-cookie']);

function safeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? '[oculto]' : v;
  }
  return out;
}

export async function httpJson<T = unknown>(url: string, options: HttpOptions): Promise<HttpResult<T>> {
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxAttempts = (options.retries ?? 0) + 1;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });

      const text = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxAttempts) {
          const waitMs = Math.min(4000, 250 * 2 ** (attempt - 1));
          log.warn(
            { url, status: response.status, attempt, waitMs },
            `${options.providerLabel} respondió con error temporal; se reintenta`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      let data: T;
      try {
        data = (text.length > 0 ? JSON.parse(text) : {}) as T;
      } catch {
        throw PaymentError.provider(
          `${options.providerLabel} devolvió una respuesta que no es JSON (HTTP ${response.status}).`,
          { url, status: response.status, bodyPreview: text.slice(0, 300) },
        );
      }

      if (!response.ok) {
        throw PaymentError.provider(
          `${options.providerLabel} rechazó la petición (HTTP ${response.status}).`,
          {
            url,
            status: response.status,
            requestHeaders: safeHeaders(options.headers ?? {}),
            response: data,
          },
        );
      }

      return { status: response.status, data, text, headers };
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof PaymentError) throw e;
      lastError = e;
      const aborted = e instanceof Error && e.name === 'AbortError';
      if (attempt < maxAttempts) {
        const waitMs = Math.min(4000, 250 * 2 ** (attempt - 1));
        log.warn({ url, attempt, aborted }, `Fallo de red con ${options.providerLabel}; se reintenta`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new PaymentError(
        'network',
        aborted
          ? `${options.providerLabel} no respondió en ${timeoutMs} ms.`
          : `No se pudo contactar con ${options.providerLabel}: ${e instanceof Error ? e.message : String(e)}`,
        { url },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new PaymentError('network', `No se pudo contactar con ${options.providerLabel}.`, {
    url,
    lastError: String(lastError),
  });
}

/** Devuelve el primer valor de una cabecera, sin importar mayúsculas ni arreglos. */
export function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== target) continue;
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  }
  return null;
}

export function bodyToString(body: Buffer | string): string {
  return Buffer.isBuffer(body) ? body.toString('utf8') : body;
}
