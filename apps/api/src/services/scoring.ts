import { AppError, getLogger } from '@terracolombia/shared';
import type { IndicatorInputs as ApiIndicatorInputs } from './indicator-inputs.js';
import { toEngineInputs } from './engine-inputs.js';
import type {
  BusinessTemplate,
  IndicatorDefinition,
  LocationIntelResult,
  ScoredCell,
  UseProfile,
  Zone,
} from '@terracolombia/scoring';
// `SuitabilityResult`, `TargetUse` y `NumericRange` son contratos compartidos: los declara
// `packages/shared` y el motor los consume, así que se importan de su origen.
import type { NumericRange, SuitabilityResult, TargetUse } from '@terracolombia/shared';

/**
 * Adaptador sobre `packages/scoring`. El motor es lógica pura y no toca la base: esta capa
 * lo carga de forma diferida y traduce entre sus tipos y lo que devuelve la API.
 *
 * Si el paquete no está disponible, las rutas de inteligencia devuelven un error explícito
 * en vez de un puntaje improvisado: un semáforo sin motor sería peor que no dar semáforo.
 */

type ScoringModule = typeof import('@terracolombia/scoring');

let cached: ScoringModule | null = null;
let loadError: string | null = null;

async function loadScoring(): Promise<ScoringModule> {
  if (cached) return cached;
  if (loadError) throw new AppError('UPSTREAM_UNAVAILABLE', loadError, {});
  try {
    cached = await import('@terracolombia/scoring');
    return cached;
  } catch (err) {
    loadError =
      'El motor de puntuación no está disponible en este despliegue. ' +
      'Instala las dependencias del monorepo (pnpm install) para habilitar aptitud y localización de negocio. ' +
      `Detalle: ${err instanceof Error ? err.message : String(err)}`;
    getLogger({ mod: 'scoring' }).error({ err: loadError }, 'No se pudo cargar @terracolombia/scoring');
    throw new AppError('UPSTREAM_UNAVAILABLE', loadError, {});
  }
}

export async function evaluateSuitability(
  use: TargetUse,
  inputs: ApiIndicatorInputs,
  weights?: Record<string, number>,
): Promise<SuitabilityResult> {
  const mod = await loadScoring();
  return mod.evaluateSuitability(use, toEngineInputs(inputs), weights);
}

/** Perfiles de uso con sus pesos y factores, para `GET /suitability/uses`. */
export async function listUseProfiles(): Promise<Record<string, UseProfile>> {
  const mod = await loadScoring();
  return mod.USE_PROFILES;
}

/** Plantillas de localización de negocio, para `GET /location-intel/templates`. */
export async function listTemplates(): Promise<readonly BusinessTemplate[]> {
  const mod = await loadScoring();
  return mod.TEMPLATE_LIST;
}

export async function getTemplate(id: string): Promise<BusinessTemplate | null> {
  const mod = await loadScoring();
  return mod.getTemplate(id) ?? null;
}

export interface CellWithInputs {
  h3: string;
  muniCode?: string | null;
  inputs: ApiIndicatorInputs;
}

/**
 * Puntúa celdas H3 con una plantilla. Devuelve el resultado completo del motor, que incluye
 * el desglose por factor de cada celda, los pesos aplicados y la explicación del orden: la
 * API nunca entrega solo el puntaje.
 */
export async function scoreCells(
  cells: CellWithInputs[],
  templateId: string,
  weights?: Record<string, number>,
  thresholds?: Record<string, NumericRange>,
  limit?: number,
): Promise<LocationIntelResult> {
  const mod = await loadScoring();
  const template = mod.getTemplate(templateId);
  if (!template) {
    throw new AppError(
      'NOT_FOUND',
      `No existe la plantilla "${templateId}". Consulta GET /location-intel/templates para ver las disponibles.`,
      { available: mod.TEMPLATE_IDS },
    );
  }
  return mod.scoreCells(
    cells.map((c) => ({
      h3: c.h3,
      muniCode: c.muniCode ?? null,
      inputs: toEngineInputs(c.inputs),
    })),
    template,
    weights,
    thresholds,
    limit !== undefined ? { limit } : {},
  );
}

/** Agrupa las celdas con mejor puntaje en zonas contiguas. */
export async function topZones(
  cells: readonly ScoredCell[],
  limit: number,
): Promise<Zone[]> {
  const mod = await loadScoring();
  return mod.topZones(cells, { limit });
}

export async function listIndicators(): Promise<readonly IndicatorDefinition[]> {
  const mod = await loadScoring();
  return mod.INDICATOR_LIST;
}

/** Ficha de un indicador: su fórmula, unidad, dirección y fuentes. Alimenta "Explícame esto". */
export async function explainIndicator(id: string): Promise<IndicatorDefinition | null> {
  const mod = await loadScoring();
  const found = mod.INDICATOR_LIST.find((i) => i.id === id);
  return found ?? null;
}

/** Etiquetas en español de los usos objetivo, tomadas del propio motor. */
export async function useLabels(): Promise<Record<string, string>> {
  const mod = await loadScoring();
  return mod.TARGET_USE_LABELS;
}
