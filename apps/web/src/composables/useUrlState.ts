/**
 * Estado en la URL: **toda vista de TerraColombia debe ser compartible** (PLAN.md §10.3).
 *
 * El módulo se divide en dos capas:
 *  1. Un núcleo puro (`encodeState`, `decodeState`, codecs) sin dependencia de Vue ni del
 *     router: es lo que se prueba en `useUrlState.spec.ts`.
 *  2. `useUrlState`, que ata ese núcleo a `vue-router` con escritura diferida (`replace`)
 *     para no llenar el historial mientras el usuario arrastra un slider o el mapa.
 *
 * Reglas de diseño:
 * - Un valor igual al de por omisión **no** se escribe en la URL: los enlaces quedan cortos.
 * - Un valor inválido en la URL no rompe la vista: se cae al de por omisión y se ignora.
 */
import { onScopeDispose, reactive, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';

// ─── Codecs ───────────────────────────────────────────────────────────────────

export interface UrlCodec<T> {
  /** Devuelve `null` para omitir el parámetro de la URL. */
  encode: (value: T) => string | null;
  /** Devuelve `null` si el texto no es válido; el llamador usará el valor por omisión. */
  decode: (raw: string) => T | null;
}

export const stringCodec: UrlCodec<string> = {
  encode: (v) => (v.length > 0 ? v : null),
  decode: (raw) => (raw.length > 0 ? raw : null),
};

export function numberCodec(decimals = 5): UrlCodec<number> {
  const factor = 10 ** decimals;
  return {
    encode: (v) => (Number.isFinite(v) ? String(Math.round(v * factor) / factor) : null),
    decode: (raw) => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    },
  };
}

export const intCodec: UrlCodec<number> = {
  encode: (v) => (Number.isInteger(v) ? String(v) : null),
  decode: (raw) => {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  },
};

export const boolCodec: UrlCodec<boolean> = {
  encode: (v) => (v ? '1' : '0'),
  decode: (raw) => (raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : null),
};

/** bbox como `oeste,sur,este,norte` con 5 decimales (~1 m). */
export const bboxCodec: UrlCodec<[number, number, number, number]> = {
  encode: (v) =>
    v.every((n) => Number.isFinite(n)) ? v.map((n) => (Math.round(n * 1e5) / 1e5).toString()).join(',') : null,
  decode: (raw) => {
    const parts = raw.split(',').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [w, s, e, n] = parts as [number, number, number, number];
    return [w, s, e, n];
  },
};

/** Lista de textos separados por coma: capas activas, formatos, tipos de cambio… */
export const listCodec: UrlCodec<string[]> = {
  encode: (v) => (v.length > 0 ? v.join(',') : null),
  decode: (raw) => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return items.length > 0 ? items : null;
  },
};

/** Restringe a un conjunto cerrado de valores; cualquier otro se descarta. */
export function enumCodec<T extends string>(allowed: readonly T[]): UrlCodec<T> {
  return {
    encode: (v) => (allowed.includes(v) ? v : null),
    decode: (raw) => (allowed.includes(raw as T) ? (raw as T) : null),
  };
}

/**
 * Pesos de indicadores como `clave:valor` separados por coma, p. ej. `poblacion:0.4,vias:0.2`.
 * Más legible y más corto que JSON en base64, y sobrevive al copiar y pegar.
 */
export const weightsCodec: UrlCodec<Record<string, number>> = {
  encode: (v) => {
    const parts = Object.entries(v)
      .filter(([, n]) => Number.isFinite(n))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, n]) => `${k}:${Math.round(n * 100) / 100}`);
    return parts.length > 0 ? parts.join(',') : null;
  },
  decode: (raw) => {
    const out: Record<string, number> = {};
    for (const part of raw.split(',')) {
      const sep = part.indexOf(':');
      if (sep <= 0) continue;
      const key = part.slice(0, sep).trim();
      const n = Number(part.slice(sep + 1));
      if (key.length === 0 || !Number.isFinite(n)) continue;
      out[key] = Math.min(1, Math.max(0, n));
    }
    return Object.keys(out).length > 0 ? out : null;
  },
};

/**
 * Envuelve un codec para admitir `null` como "ausente". Es lo que necesitan los parámetros
 * opcionales: un bbox sin definir, un municipio sin elegir, un corte temporal sin fijar.
 */
export function nullable<T>(codec: UrlCodec<T>): UrlCodec<T | null> {
  return {
    encode: (value) => (value === null ? null : codec.encode(value)),
    decode: (raw) => codec.decode(raw),
  };
}

/**
 * Objetos complejos (el DSL de filtros, una geometría dibujada) en JSON codificado
 * en base64url: no rompe la URL y no obliga a inventar una gramática nueva.
 */
export function jsonCodec<T>(): UrlCodec<T | null> {
  return {
    encode: (v) => {
      if (v === null || v === undefined) return null;
      try {
        return toBase64Url(JSON.stringify(v));
      } catch {
        return null;
      }
    },
    decode: (raw) => {
      try {
        return JSON.parse(fromBase64Url(raw)) as T;
      } catch {
        return null;
      }
    },
  };
}

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ─── Definición de parámetros ─────────────────────────────────────────────────

export interface UrlParam<T> {
  /** Valor por omisión. Si el estado coincide, el parámetro no aparece en la URL. */
  default: T;
  codec: UrlCodec<T>;
  /** Nombre del parámetro en la URL; por omisión, la clave del objeto de definiciones. */
  key?: string;
}

// El comodín es deliberado: un mapa de definiciones mezcla parámetros de tipos distintos
// y `unknown` impediría asignar `UrlParam<number>` a la posición.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyUrlParam = UrlParam<any>;
export type UrlParamDefs = Record<string, AnyUrlParam>;

export type UrlState<D extends UrlParamDefs> = {
  -readonly [K in keyof D]: D[K]['default'];
};

function paramName<D extends UrlParamDefs>(defs: D, key: keyof D & string): string {
  return defs[key]?.key ?? key;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

// ─── Núcleo puro ──────────────────────────────────────────────────────────────

/** Estado → parámetros de URL. Omite todo lo que sea igual al valor por omisión. */
export function encodeState<D extends UrlParamDefs>(
  defs: D,
  state: UrlState<D>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(defs) as Array<keyof D & string>) {
    const def = defs[key];
    if (!def) continue;
    const value = state[key];
    if (sameValue(value, def.default)) continue;
    const encoded = def.codec.encode(value);
    if (encoded === null) continue;
    out[paramName(defs, key)] = encoded;
  }
  return out;
}

/**
 * Parámetros de URL → estado completo. Los que falten o no sean válidos toman
 * el valor por omisión: una URL manipulada nunca deja la vista en un estado imposible.
 */
export function decodeState<D extends UrlParamDefs>(
  defs: D,
  query: Record<string, string | string[] | null | undefined>,
): UrlState<D> {
  const out = {} as UrlState<D>;
  for (const key of Object.keys(defs) as Array<keyof D & string>) {
    const def = defs[key];
    if (!def) continue;
    const raw = query[paramName(defs, key)];
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (typeof first !== 'string' || first.length === 0) {
      out[key] = def.default;
      continue;
    }
    const decoded = def.codec.decode(first);
    out[key] = decoded === null ? def.default : decoded;
  }
  return out;
}

/** Estado → query string lista para compartir (sin `?` cuando queda vacía). */
export function serializeUrlState<D extends UrlParamDefs>(defs: D, state: UrlState<D>): string {
  const params = new URLSearchParams();
  const encoded = encodeState(defs, state);
  for (const key of Object.keys(encoded).sort()) {
    const value = encoded[key];
    if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

/** Query string (con o sin `?`) → estado. Inverso de `serializeUrlState`. */
export function parseUrlState<D extends UrlParamDefs>(defs: D, search: string): UrlState<D> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const query: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (!(key in query)) query[key] = value;
  }
  return decodeState(defs, query);
}

// ─── Integración con vue-router ───────────────────────────────────────────────

export interface UseUrlStateOptions {
  /** Milisegundos antes de escribir en la URL. Evita un `replace` por cada píxel arrastrado. */
  debounceMs?: number;
  /** `replace` (por omisión) no añade entradas al historial; `push` sí. */
  mode?: 'replace' | 'push';
}

export interface UseUrlStateReturn<D extends UrlParamDefs> {
  /** Estado reactivo. Escribir aquí actualiza la URL; cambiar la URL actualiza esto. */
  state: UrlState<D>;
  /** Devuelve todos los parámetros a su valor por omisión. */
  reset: () => void;
  /** URL absoluta compartible del estado actual. */
  shareUrl: () => string;
  /** Aplica un estado parcial de golpe (una sola escritura en la URL). */
  patch: (partial: Partial<UrlState<D>>) => void;
}

/**
 * Sincroniza un estado reactivo con la query de la ruta actual.
 *
 * Los parámetros que no pertenecen a `defs` se conservan intactos: varias vistas pueden
 * compartir la URL (p. ej. el mapa aporta `bbox` y `capas` y la ficha aporta `npn`).
 */
export function useUrlState<D extends UrlParamDefs>(
  defs: D,
  options: UseUrlStateOptions = {},
): UseUrlStateReturn<D> {
  const route = useRoute();
  const router = useRouter();
  const debounceMs = options.debounceMs ?? 250;
  const mode = options.mode ?? 'replace';

  const state = reactive(decodeState(defs, flattenQuery(route.query))) as UrlState<D>;

  /** Evita el ciclo URL → estado → URL. */
  let writingToUrl = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    const ownKeys = new Set(
      (Object.keys(defs) as Array<keyof D & string>).map((k) => paramName(defs, k)),
    );
    const preserved: LocationQuery = {};
    for (const [key, value] of Object.entries(route.query)) {
      if (!ownKeys.has(key)) preserved[key] = value;
    }
    const nextQuery: LocationQuery = { ...preserved, ...encodeState(defs, state) };

    if (sameValue(normalize(nextQuery), normalize(route.query))) return;

    writingToUrl = true;
    const nav = mode === 'push' ? router.push({ query: nextQuery }) : router.replace({ query: nextQuery });
    void nav.catch(() => undefined).finally(() => {
      writingToUrl = false;
    });
  };

  watch(
    () => state,
    () => {
      if (writingToUrl) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    },
    { deep: true },
  );

  watch(
    () => route.query,
    (query) => {
      if (writingToUrl) return;
      const next = decodeState(defs, flattenQuery(query));
      for (const key of Object.keys(defs) as Array<keyof D & string>) {
        if (!sameValue(state[key], next[key])) state[key] = next[key];
      }
    },
  );

  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
  });

  return {
    state,
    reset: () => {
      for (const key of Object.keys(defs) as Array<keyof D & string>) {
        const def = defs[key];
        if (def) state[key] = def.default;
      }
    },
    shareUrl: () => {
      const path = route.path;
      const qs = serializeUrlState(defs, state);
      const origin = typeof window === 'undefined' ? '' : window.location.origin;
      return `${origin}${path}${qs}`;
    },
    patch: (partial) => {
      for (const [key, value] of Object.entries(partial) as Array<[keyof D & string, unknown]>) {
        if (value !== undefined) state[key] = value as UrlState<D>[keyof D & string];
      }
    },
  };
}

function flattenQuery(query: LocationQuery): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      const first = value[0];
      out[key] = first === null ? undefined : first;
    } else {
      out[key] = value === null ? undefined : value;
    }
  }
  return out;
}

function normalize(query: LocationQuery): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    out[key] = Array.isArray(value) ? value.filter((v) => v !== null).join(',') : String(value);
  }
  return out;
}
