import type { FastifyRequest } from 'fastify';
import { buildMeta, getLogger } from '@terracolombia/shared';
import type { Coverage, Envelope, ResponseMeta } from '@terracolombia/shared';
import { getSourceRefs } from '@terracolombia/db';

/**
 * Toda respuesta con cifras sale por aquí. Regla 4 de CLAUDE.md: sin procedencia no se
 * muestra. Si una ruta no declara datasets, el sobre lleva un aviso explícito en vez de
 * pasar por alto la regla en silencio.
 */
export async function envelope<T>(
  data: T,
  datasetIds: string[],
  extra: {
    coverage?: Coverage | null;
    warnings?: string[];
  } = {},
): Promise<Envelope<T>> {
  const sources = datasetIds.length > 0 ? await getSourceRefs(datasetIds) : [];
  const warnings = [...(extra.warnings ?? [])];

  if (datasetIds.length > 0 && sources.length === 0) {
    warnings.push(
      'No encontramos la declaración de procedencia de esta información. Trátala como no verificada.',
    );
    getLogger({ mod: 'envelope' }).warn({ datasetIds }, 'Datasets sin fila en meta.dataset');
  }

  if (sources.some((s) => s.synthetic)) {
    warnings.push(
      'Parte de esta información proviene de un corte de DEMOSTRACIÓN con datos sintéticos. No la uses para decidir.',
    );
  }

  const missingCut = sources.filter((s) => s.cutDate === null).map((s) => s.name);
  if (missingCut.length > 0) {
    warnings.push(
      `Sin corte publicado para: ${missingCut.join(', ')}. Los datos de esas fuentes aparecen como no disponibles.`,
    );
  }

  const meta: ResponseMeta = buildMeta(sources, {
    coverage: extra.coverage ?? null,
    warnings,
  });

  return { data, meta };
}

/** Sobre para respuestas sin cifras (catálogos, glosario, estado). */
export function plainEnvelope<T>(data: T): Envelope<T> {
  return { data, meta: buildMeta([]) };
}

/** Datasets que alimentan cada bloque de la respuesta. Centralizado para no dispersarlo. */
export const DATASET_GROUPS = {
  cadastre: ['igac-cadastre', 'demo-cadastre'],
  admin: ['dane-divipola', 'dane-mgn'],
  population: ['dane-cnpv', 'dane-mgn', 'dane-projections'],
  education: ['men-establecimientos', 'demo-facilities'],
  health: ['minsalud-reps', 'demo-facilities'],
  osm: ['osm-colombia'],
  soils: ['igac-suelos', 'igac-capacidad-uso', 'igac-vocacion', 'igac-conflictos'],
  hazards: ['sgc-movimientos-masa', 'sgc-sismica', 'ideam-inundacion'],
  protected: ['runap-areas-protegidas'],
  ethnic: ['ant-resguardos', 'mininterior-consejos'],
  pot: ['pot-municipal'],
  relief: ['copernicus-dem'],
  mining: ['anm-titulos'],
  contracts: ['secop-ii'],
} as const;

/**
 * Filtra un grupo de datasets a los que realmente existen en `meta.dataset`. Evita que la
 * respuesta cite fuentes que este despliegue no ha cargado.
 */
export async function presentDatasets(groups: Array<keyof typeof DATASET_GROUPS>): Promise<string[]> {
  const candidates = [...new Set(groups.flatMap((g) => DATASET_GROUPS[g]))];
  const refs = await getSourceRefs(candidates);
  return refs.map((r) => r.datasetId);
}

/** Registra el uso y la duración de la operación sin frenar la respuesta. */
export function recordUsage(
  req: FastifyRequest,
  operation: string,
  started: number,
  extra: { credits?: number; units?: number; detail?: Record<string, unknown> } = {},
): void {
  void req.server.quota
    .record(req, {
      operation,
      durationMs: Date.now() - started,
      credits: extra.credits,
      units: extra.units,
      detail: extra.detail,
    })
    .catch(() => undefined);
}
