import { z } from 'zod';
import { GeoJsonGeometrySchema, BBoxSchema } from './types.js';
import { MAX_PAGE_SIZE } from './constants.js';

/**
 * DSL de `/parcels/query`. Se valida aquí y se traduce a SQL parametrizado en
 * `apps/api/src/services/parcel-query.ts`. Los nombres de columna nunca vienen
 * del cliente: solo las claves de este esquema, mapeadas contra una lista blanca.
 */

const NumericRangeSchema = z
  .object({
    eq: z.number().optional(),
    gte: z.number().optional(),
    lte: z.number().optional(),
    gt: z.number().optional(),
    lt: z.number().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Rango numérico vacío' });
export type NumericRange = z.infer<typeof NumericRangeSchema>;

export const NEARBY_LAYERS = [
  'road',
  'school',
  'health_facility',
  'poi',
  'protected_area',
  'hazard',
  'urban_perimeter',
] as const;
export type NearbyLayer = (typeof NEARBY_LAYERS)[number];

export const ParcelQueryScopeSchema = z
  .object({
    department: z.string().length(2).optional(),
    municipality: z.string().length(5).optional(),
    /** Fecha de corte; por omisión el snapshot activo. */
    cutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((v) => Boolean(v.department || v.municipality), {
    message: 'Se requiere department o municipality en scope (evita barridos nacionales)',
  });

export const ParcelQueryWhereSchema = z.object({
  zone: z.enum(['urbano', 'rural']).optional(),
  area_m2: NumericRangeSchema.optional(),
  built_area_m2: NumericRangeSchema.optional(),
  economic_use: z.array(z.string().max(120)).max(30).optional(),
  cadastral_value: NumericRangeSchema.optional(),
  floors: NumericRangeSchema.optional(),
  has_building: z.boolean().optional(),
  sector: z.string().max(4).optional(),
  neighborhood: z.string().max(4).optional(),
  block_or_vereda: z.string().max(8).optional(),
  /** Búsqueda difusa sobre dirección normalizada. */
  address_like: z.string().max(200).optional(),
  homogeneous_zone: z.array(z.string().max(40)).max(30).optional(),
});
export type ParcelQueryWhere = z.infer<typeof ParcelQueryWhereSchema>;

export const NearFilterSchema = z.object({
  layer: z.enum(NEARBY_LAYERS),
  /** Subclase dependiente de la capa: `class` de vía, categoría de POI, etc. */
  class: z.array(z.string().max(60)).max(30).optional(),
  max_m: z.number().int().positive().max(20_000),
  /** Si es false, excluye los predios que cumplen (p. ej. lejos de amenazas). */
  invert: z.boolean().default(false),
});
export type NearFilter = z.infer<typeof NearFilterSchema>;

export const PARCEL_SORT_FIELDS = [
  'area_m2',
  'built_area_m2',
  'cadastral_value',
  'npn',
  'distance',
] as const;

export const ParcelQuerySchema = z.object({
  scope: ParcelQueryScopeSchema,
  where: ParcelQueryWhereSchema.default({}),
  near: z.array(NearFilterSchema).max(6).default([]),
  within: GeoJsonGeometrySchema.optional(),
  bbox: BBoxSchema.optional(),
  sort: z
    .string()
    .regex(/^(area_m2|built_area_m2|cadastral_value|npn|distance):(asc|desc)$/)
    .default('area_m2:desc'),
  limit: z.number().int().positive().max(MAX_PAGE_SIZE).default(100),
  cursor: z.string().max(200).optional(),
  /** Incluir geometría completa (más costoso) o solo centroide. */
  geometry: z.enum(['none', 'centroid', 'full']).default('centroid'),
});
export type ParcelQuery = z.infer<typeof ParcelQuerySchema>;

// ─── Análisis de zona ─────────────────────────────────────────────────────────

export const AreaScopeSchema = z.union([
  z.object({ kind: z.literal('polygon'), geometry: GeoJsonGeometrySchema }),
  z.object({
    kind: z.literal('radius'),
    center: z.tuple([z.number(), z.number()]),
    radiusM: z.number().int().positive().max(50_000),
  }),
  z.object({ kind: z.literal('municipality'), muniCode: z.string().length(5) }),
  z.object({
    kind: z.literal('isochrone'),
    center: z.tuple([z.number(), z.number()]),
    minutes: z.number().int().positive().max(60),
    mode: z.enum(['walk', 'drive']),
  }),
]);
export type AreaScope = z.infer<typeof AreaScopeSchema>;

export const AreaAnalyzeSchema = z.object({
  scope: AreaScopeSchema,
  /** Secciones del tablero a calcular; por omisión todas. */
  sections: z
    .array(
      z.enum([
        'parcels',
        'population',
        'education',
        'health',
        'commerce',
        'soils',
        'hazards',
        'protected',
        'relief',
        'pot',
        'accessibility',
      ]),
    )
    .default([]),
  cutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AreaAnalyze = z.infer<typeof AreaAnalyzeSchema>;

// ─── Aptitud ──────────────────────────────────────────────────────────────────

export const TARGET_USES = [
  'vivienda_unifamiliar',
  'vivienda_multifamiliar',
  'bodega_logistica',
  'agricultura',
  'ganaderia',
  'colegio',
  'comercio_local',
  'industria',
  'turismo_rural',
  'solar_fotovoltaico',
] as const;
export type TargetUse = (typeof TARGET_USES)[number];

export const SuitabilityRequestSchema = z.object({
  target: z.union([
    z.object({ kind: z.literal('parcel'), npn: z.string() }),
    z.object({ kind: z.literal('area'), scope: AreaScopeSchema }),
  ]),
  use: z.enum(TARGET_USES),
  /** Sobrescribe pesos por indicador (0–1). Se renormalizan. */
  weights: z.record(z.number().min(0).max(1)).optional(),
});
export type SuitabilityRequest = z.infer<typeof SuitabilityRequestSchema>;

// ─── Localización de negocio ──────────────────────────────────────────────────

export const LocationIntelSchema = z.object({
  templateId: z.string().max(60),
  scope: AreaScopeSchema,
  resolution: z.union([z.literal(7), z.literal(8), z.literal(9)]).default(8),
  weights: z.record(z.number().min(0).max(1)).optional(),
  /** Descarta celdas que incumplan un mínimo por indicador. */
  thresholds: z.record(NumericRangeSchema).optional(),
  limit: z.number().int().positive().max(5000).default(1000),
});
export type LocationIntel = z.infer<typeof LocationIntelSchema>;

// ─── Cambio territorial ───────────────────────────────────────────────────────

export const ChangeCompareSchema = z.object({
  scope: AreaScopeSchema,
  fromCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toCutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  changeTypes: z
    .array(z.enum(['created', 'removed', 'attrs_changed', 'geometry_changed', 'building_added']))
    .default([]),
  limit: z.number().int().positive().max(5000).default(500),
});
export type ChangeCompare = z.infer<typeof ChangeCompareSchema>;
