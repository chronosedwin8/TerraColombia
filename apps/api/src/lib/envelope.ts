import type { FastifyRequest } from 'fastify';
import { buildMeta, getLogger } from '@terracolombia/shared';
import type { Coverage, Envelope, ResponseMeta } from '@terracolombia/shared';
import { cadastreDatasetIdsFor, getSourceRefs } from '@terracolombia/db';

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

/**
 * Datasets que alimentan cada bloque de la respuesta. Centralizado para no dispersarlo.
 *
 * El grupo `cadastre` es el único que NO se resuelve por esta lista: el catastro
 * real se declara por departamento (`igac-cadastre-08`, `igac-cadastre-25`…) porque
 * `meta.snapshot` solo admite un corte activo por dataset. Lo resuelve
 * `cadastreDatasetIdsFor`, que mira qué cortes tienen predios en el ámbito que se
 * está consultando. La lista se deja aquí solo como respaldo para un despliegue que
 * todavía no tenga nada cargado.
 */
export const DATASET_GROUPS = {
  cadastre: ['demo-cadastre'],
  admin: ['dane-divipola', 'dane-mgn'],
  population: ['dane-cnpv', 'dane-mgn', 'dane-projections'],
  education: ['men-establecimientos', 'demo-facilities'],
  health: ['minsalud-reps', 'demo-facilities'],
  /* Los dos datasets reales de OSM del catálogo (`etl/config/datasets/osm.ts`). Van juntos
     porque ODbL 1.0 exige la atribución en cualquier respuesta que use uno de los dos. */
  osm: ['osm-vias-colombia', 'osm-poi-colombia'],
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
 * Ámbito territorial de la respuesta, cuando la ruta lo conoce.
 *
 * Sirve para que la procedencia cite el corte del municipio que se consultó y no
 * todos los cortes cargados del país. Sin ámbito la respuesta sigue siendo
 * correcta, solo menos precisa.
 */
export interface DatasetScope {
  muniCode?: string | null;
  deptCode?: string | null;
}

/**
 * Filtra un grupo de datasets a los que realmente existen en `meta.dataset`. Evita que la
 * respuesta cite fuentes que este despliegue no ha cargado.
 *
 * El grupo `cadastre` se resuelve aparte, contra los cortes que tienen predios en
 * el ámbito: es lo que evita que la ficha de un predio real de Baranoa salga
 * citando el corte de demostración de Soledad y marcada como dato sintético.
 */
export async function presentDatasets(
  groups: Array<keyof typeof DATASET_GROUPS>,
  scope: DatasetScope = {},
): Promise<string[]> {
  const wantsCadastre = groups.includes('cadastre');
  const others = groups.filter((g) => g !== 'cadastre');
  const candidates = [...new Set(others.flatMap((g) => DATASET_GROUPS[g]))];

  const [refs, cadastreIds] = await Promise.all([
    candidates.length > 0 ? getSourceRefs(candidates) : Promise.resolve([]),
    wantsCadastre
      ? cadastreDatasetIdsFor(scope)
      : Promise.resolve<string[]>([]),
  ]);

  // Si el ámbito no tiene ningún predio (municipio sin catastro), no se cita
  // ninguna fuente catastral: el bloque `coverage` de la respuesta es el que tiene
  // que explicar por qué no hay datos (regla 6), no una fuente citada en vano.
  return [...new Set([...refs.map((r) => r.datasetId), ...cadastreIds])];
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
