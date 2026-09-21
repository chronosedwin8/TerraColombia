import { z } from 'zod';

/**
 * Procedencia de un dato. Regla 4 de CLAUDE.md: sin procedencia no se muestra.
 * Cada respuesta de API que contenga cifras debe adjuntar al menos una.
 */
export const SourceRefSchema = z.object({
  /** Identificador del dataset en `meta.dataset`. */
  datasetId: z.string(),
  /** Entidad responsable del dato: IGAC, DANE, MEN, MinSalud, OSM, SGC… */
  source: z.string(),
  /** Nombre legible del dataset. */
  name: z.string(),
  /** Fecha de corte del snapshot usado (AAAA-MM-DD). */
  cutDate: z.string().nullable(),
  license: z.string(),
  attribution: z.string(),
  url: z.string().nullable(),
  /** true si el snapshot es de demostración y no de la fuente real. */
  synthetic: z.boolean().default(false),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const CoverageSchema = z.object({
  muniCode: z.string().nullable(),
  /** Gestor catastral responsable del municipio. */
  cadastralManager: z.string().nullable(),
  isIgac: z.boolean().nullable(),
  /** `full` | `partial` | `none` | `unknown` */
  status: z.enum(['full', 'partial', 'none', 'unknown']),
  /** Qué sí hay disponible cuando no hay catastro. Texto para mostrar al usuario. */
  availableLayers: z.array(z.string()).default([]),
  message: z.string().nullable(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const ResponseMetaSchema = z.object({
  sources: z.array(SourceRefSchema),
  cutDate: z.string().nullable(),
  coverage: CoverageSchema.nullable().optional(),
  /** true si cualquier fuente involucrada es sintética (demostración). */
  synthetic: z.boolean().default(false),
  generatedAt: z.string(),
  warnings: z.array(z.string()).default([]),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
}

export const NOT_AVAILABLE = 'NO_DISPONIBLE' as const;

/** Valor que el producto no tiene. Nunca se rellena con estimaciones. */
export type Maybe<T> = T | typeof NOT_AVAILABLE | null;

export function isAvailable<T>(v: Maybe<T>): v is T {
  return v !== null && v !== NOT_AVAILABLE;
}

export function buildMeta(
  sources: SourceRef[],
  extra: Partial<Omit<ResponseMeta, 'sources'>> = {},
): ResponseMeta {
  const cutDates = sources.map((s) => s.cutDate).filter((d): d is string => Boolean(d));
  return {
    sources,
    cutDate: cutDates.length > 0 ? cutDates.sort().at(-1)! : null,
    coverage: extra.coverage ?? null,
    synthetic: extra.synthetic ?? sources.some((s) => s.synthetic),
    generatedAt: new Date().toISOString(),
    warnings: extra.warnings ?? [],
  };
}

export const IGAC_ATTRIBUTION_TEMPLATE = (cut: string) =>
  `Fuente: IGAC, Base Catastral, corte ${cut}, CC BY-SA 4.0`;
