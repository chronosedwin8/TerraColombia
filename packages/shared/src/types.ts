import { z } from 'zod';
import { NOT_AVAILABLE } from './provenance.js';

// ─── Primitivos geográficos ───────────────────────────────────────────────────

export const LngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLatSchema>;

export const BBoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BBox = z.infer<typeof BBoxSchema>;

export const GeoJsonGeometrySchema: z.ZodType<GeoJsonGeometry> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('Point'), coordinates: z.array(z.number()) }),
    z.object({ type: z.literal('MultiPoint'), coordinates: z.array(z.array(z.number())) }),
    z.object({ type: z.literal('LineString'), coordinates: z.array(z.array(z.number())) }),
    z.object({
      type: z.literal('MultiLineString'),
      coordinates: z.array(z.array(z.array(z.number()))),
    }),
    z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()))) }),
    z.object({
      type: z.literal('MultiPolygon'),
      coordinates: z.array(z.array(z.array(z.array(z.number())))),
    }),
    z.object({ type: z.literal('GeometryCollection'), geometries: z.array(GeoJsonGeometrySchema) }),
  ]),
);

export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] };

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties: P;
}

export interface GeoJsonFeatureCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<P>[];
  bbox?: BBox;
}

// ─── NPN ──────────────────────────────────────────────────────────────────────

export const NpnPartsSchema = z.object({
  department: z.string().length(2),
  municipality: z.string().length(3),
  zone: z.string().length(2),
  sector: z.string().length(2),
  commune: z.string().length(2),
  neighborhood: z.string().length(2),
  blockOrVereda: z.string().length(4),
  parcel: z.string().length(4),
  condition: z.string().length(1),
  building: z.string().length(2),
  floor: z.string().length(2),
  unit: z.string().length(4),
});
export type NpnParts = z.infer<typeof NpnPartsSchema>;

// ─── Ficha de predio ──────────────────────────────────────────────────────────

const maybeNumber = z.union([z.number(), z.literal(NOT_AVAILABLE), z.null()]);
const maybeString = z.union([z.string(), z.literal(NOT_AVAILABLE), z.null()]);

export const ParcelSummarySchema = z.object({
  npn: z.string(),
  npnOld: maybeString,
  muniCode: z.string(),
  muniName: z.string(),
  deptCode: z.string(),
  deptName: z.string(),
  zone: maybeString,
  zoneLabel: maybeString,
  address: maybeString,
  areaGeomM2: maybeNumber,
  areaReportedM2: maybeNumber,
  builtAreaM2: maybeNumber,
  economicUse: maybeString,
  cadastralValue: maybeNumber,
  valuationYear: maybeNumber,
  centroid: LngLatSchema.nullable(),
});
export type ParcelSummary = z.infer<typeof ParcelSummarySchema>;

export const BuildingSchema = z.object({
  id: z.string(),
  floors: maybeNumber,
  builtAreaM2: maybeNumber,
  use: maybeString,
  attrs: z.record(z.unknown()).default({}),
});
export type Building = z.infer<typeof BuildingSchema>;

export const NearbyItemSchema = z.object({
  layer: z.string(),
  id: z.string(),
  name: maybeString,
  category: maybeString,
  distanceM: z.number(),
  centroid: LngLatSchema.nullable(),
  attrs: z.record(z.unknown()).default({}),
});
export type NearbyItem = z.infer<typeof NearbyItemSchema>;

export const ParcelContextSchema = z.object({
  radiusM: z.number(),
  population: z.object({
    total: maybeNumber,
    households: maybeNumber,
    dwellings: maybeNumber,
    schoolAge: maybeNumber,
    ageBands: z.record(z.number()).nullable(),
  }),
  schools: z.array(NearbyItemSchema),
  healthFacilities: z.array(NearbyItemSchema),
  pois: z.array(NearbyItemSchema),
  roads: z.array(NearbyItemSchema),
  soils: z.array(
    z.object({
      kind: z.string(),
      code: maybeString,
      label: maybeString,
      overlapPct: z.number(),
      attrs: z.record(z.unknown()).default({}),
    }),
  ),
  hazards: z.array(
    z.object({
      kind: z.string(),
      level: maybeString,
      source: z.string(),
      overlapPct: z.number(),
    }),
  ),
  protectedAreas: z.array(
    z.object({ name: z.string(), category: maybeString, overlapPct: z.number() }),
  ),
  ethnicTerritories: z.array(
    z.object({ name: z.string(), kind: maybeString, overlapPct: z.number() }),
  ),
  potZones: z.array(
    z.object({
      classification: maybeString,
      use: maybeString,
      sourceDoc: maybeString,
      overlapPct: z.number(),
    }),
  ),
  relief: z.object({
    elevationMeanM: maybeNumber,
    slopeMeanPct: maybeNumber,
  }),
});
export type ParcelContext = z.infer<typeof ParcelContextSchema>;

// ─── Puntuación / aptitud ─────────────────────────────────────────────────────

export const FactorScoreSchema = z.object({
  indicator: z.string(),
  label: z.string(),
  /** 0–100 ya normalizado y orientado (100 = mejor para el uso objetivo). */
  score: z.number().min(0).max(100).nullable(),
  /** Valor crudo con su unidad, tal como sale de los datos. */
  rawValue: z.union([z.number(), z.string(), z.null()]),
  unit: maybeString,
  weight: z.number(),
  /** 'higher_is_better' | 'lower_is_better' | 'categorical' */
  direction: z.enum(['higher_is_better', 'lower_is_better', 'categorical']),
  formula: z.string(),
  sourceDatasetIds: z.array(z.string()),
  /** Texto en español que explica el factor a una persona no técnica. */
  explanation: z.string(),
  /** 'ok' | 'caution' | 'blocker' | 'unknown' */
  flag: z.enum(['ok', 'caution', 'blocker', 'unknown']),
});
export type FactorScore = z.infer<typeof FactorScoreSchema>;

export const SuitabilityResultSchema = z.object({
  targetUse: z.string(),
  targetUseLabel: z.string(),
  /** Puntaje compuesto, null si faltan factores obligatorios. */
  score: z.number().min(0).max(100).nullable(),
  /** 'favorable' | 'condicionado' | 'desfavorable' | 'sin_datos' */
  verdict: z.enum(['favorable', 'condicionado', 'desfavorable', 'sin_datos']),
  verdictLabel: z.string(),
  factors: z.array(FactorScoreSchema),
  blockers: z.array(z.string()),
  cautions: z.array(z.string()),
  missing: z.array(z.string()),
  disclaimer: z.string(),
});
export type SuitabilityResult = z.infer<typeof SuitabilityResultSchema>;
