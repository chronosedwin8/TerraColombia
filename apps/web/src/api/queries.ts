/**
 * Claves de TanStack Query, centralizadas para poder invalidar por prefijo.
 *
 * Convención: `[recurso, ...discriminantes]`. Todo lo que cambie el resultado entra en la
 * clave (corte temporal, pesos, radio…), de modo que la caché nunca mezcla dos parametrizaciones.
 */
import type { AreaAnalyze, ChangeCompare, LocationIntel, ParcelQuery } from '@terracolombia/shared';
import type { NearbyLayer } from '@terracolombia/shared';

export const queryKeys = {
  search: (q: string, muniCode?: string) => ['search', q, muniCode ?? null] as const,

  municipality: (code: string) => ['municipality', code] as const,

  parcel: (npn: string, cutDate?: string) => ['parcel', npn, cutDate ?? 'latest'] as const,
  parcelContext: (npn: string, radiusM: number) => ['parcel', npn, 'context', radiusM] as const,
  parcelHistory: (npn: string) => ['parcel', npn, 'history'] as const,
  parcelQuery: (dsl: ParcelQuery) => ['parcels', 'query', stableHash(dsl)] as const,

  nearby: (lat: number, lng: number, radiusM: number, layers: NearbyLayer[]) =>
    ['nearby', round(lat), round(lng), radiusM, [...layers].sort().join(',')] as const,

  areaAnalysis: (body: AreaAnalyze) => ['areas', 'analyze', stableHash(body)] as const,

  suitability: (npnOrScope: string, use: string, weightsHash: string) =>
    ['suitability', npnOrScope, use, weightsHash] as const,

  intelTemplates: () => ['location-intel', 'templates'] as const,
  intelRun: (body: LocationIntel) => ['location-intel', 'run', stableHash(body)] as const,

  changes: (body: ChangeCompare) => ['changes', 'compare', stableHash(body)] as const,

  indicators: (muniCode: string) => ['indicators', muniCode] as const,

  reports: () => ['reports'] as const,
  report: (id: string) => ['reports', id] as const,

  layers: () => ['layers'] as const,
  glossary: () => ['glossary'] as const,

  me: () => ['me'] as const,

  projects: () => ['projects'] as const,
  projectItems: (projectId: string) => ['projects', projectId, 'items'] as const,
  alerts: (projectId?: string) => ['alerts', projectId ?? 'all'] as const,

  subscription: () => ['billing', 'subscription'] as const,
  payments: () => ['billing', 'payments'] as const,
  credits: () => ['billing', 'credits'] as const,
  team: () => ['billing', 'team'] as const,

  apiKeys: () => ['api-keys'] as const,
  apiUsage: (days: number) => ['api-keys', 'usage', days] as const,

  adminEtl: () => ['admin', 'etl'] as const,
  adminCoverage: (cursor?: string) => ['admin', 'coverage', cursor ?? 'first'] as const,
  adminMetrics: () => ['admin', 'metrics'] as const,

  job: (jobId: string) => ['jobs', jobId] as const,
} as const;

/** Tiempos de frescura por familia de datos, en milisegundos. */
export const staleTimes = {
  /** Catálogos y glosario: cambian con despliegues, no con el uso. */
  catalog: 60 * 60 * 1000,
  /** Fichas y contexto: los cortes son mensuales. */
  parcel: 10 * 60 * 1000,
  /** Búsquedas: el usuario teclea, no vale la pena guardar mucho. */
  search: 30 * 1000,
  /** Análisis y puntuaciones: costosos, se conservan durante la sesión de trabajo. */
  analysis: 15 * 60 * 1000,
  /** Cuenta, consumo y facturación: siempre fresco. */
  account: 0,
} as const;

/**
 * Hash estable de un objeto: ordena las claves en todos los niveles para que
 * `{a:1,b:2}` y `{b:2,a:1}` compartan entrada de caché.
 */
export function stableHash(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = sortDeep(v);
    return out;
  }
  return value;
}

/** Redondea coordenadas a ~1 m para no fragmentar la caché con micro-movimientos del mapa. */
function round(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
