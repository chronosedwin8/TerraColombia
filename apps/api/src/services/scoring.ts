import { AppError, DISCLAIMERS, getLogger } from '@terracolombia/shared';
import type { FactorScore, SuitabilityResult, TargetUse } from '@terracolombia/shared';
import type { IndicatorInputs } from './indicator-inputs.js';

/**
 * Adaptador sobre `packages/scoring`. El motor es lógica pura; aquí solo se carga y se
 * adapta su salida al contrato de la API.
 *
 * Si el paquete no está disponible, las rutas de inteligencia devuelven un error explícito
 * en vez de un puntaje improvisado: un semáforo sin motor sería peor que no dar semáforo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
let scoringModule: any = null;
let loadError: string | null = null;

async function loadScoring(): Promise<any> {
  if (scoringModule) return scoringModule;
  if (loadError) {
    throw new AppError('UPSTREAM_UNAVAILABLE', loadError, {});
  }
  try {
    scoringModule = await import('@terracolombia/scoring');
    return scoringModule;
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
  inputs: IndicatorInputs,
  weights?: Record<string, number>,
): Promise<SuitabilityResult> {
  const mod = await loadScoring();
  if (typeof mod.evaluateSuitability !== 'function') {
    throw new AppError(
      'UPSTREAM_UNAVAILABLE',
      '@terracolombia/scoring no expone evaluateSuitability.',
      {},
    );
  }
  const result = mod.evaluateSuitability(use, inputs, weights);
  return normalizeSuitability(use, result);
}

export async function listUseProfiles(): Promise<Record<string, unknown>> {
  const mod = await loadScoring();
  return (mod.USE_PROFILES ?? mod.useProfiles ?? {}) as Record<string, unknown>;
}

export async function listTemplates(): Promise<unknown[]> {
  const mod = await loadScoring();
  const templates = mod.TEMPLATES ?? mod.templates ?? mod.LOCATION_TEMPLATES;
  if (!templates) return [];
  return Array.isArray(templates) ? templates : Object.values(templates);
}

export async function getTemplate(id: string): Promise<any | null> {
  const templates = await listTemplates();
  return (
    (templates as Array<{ id?: string }>).find((t) => t.id === id) ?? null
  );
}

export interface ScoredCell {
  h3: string;
  score: number | null;
  confidence: number;
  factors: FactorScore[];
}

export async function scoreCells(
  cells: Array<Record<string, unknown>>,
  templateId: string,
  weights?: Record<string, number>,
  thresholds?: Record<string, unknown>,
): Promise<ScoredCell[]> {
  const mod = await loadScoring();
  const template = await getTemplate(templateId);
  if (!template) {
    throw new AppError(
      'NOT_FOUND',
      `No existe la plantilla "${templateId}". Consulta GET /location-intel/templates.`,
      {},
    );
  }
  if (typeof mod.scoreCells !== 'function') {
    throw new AppError('UPSTREAM_UNAVAILABLE', '@terracolombia/scoring no expone scoreCells.', {});
  }
  const scored = mod.scoreCells(cells, template, weights, thresholds);
  return (scored as Array<Record<string, unknown>>).map((c) => ({
    h3: String(c.h3 ?? ''),
    score: typeof c.score === 'number' ? c.score : null,
    confidence: typeof c.confidence === 'number' ? c.confidence : 0,
    factors: Array.isArray(c.factors) ? (c.factors as FactorScore[]) : [],
  }));
}

export async function topZones(scored: ScoredCell[], limit: number): Promise<unknown[]> {
  const mod = await loadScoring();
  if (typeof mod.topZones === 'function') {
    return mod.topZones(scored, limit) as unknown[];
  }
  // Respaldo: las mejores celdas sueltas, sin agrupar en zonas contiguas.
  return scored
    .filter((c) => c.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map((c) => ({ cells: [c.h3], score: c.score, confidence: c.confidence, grouped: false }));
}

export async function listIndicators(): Promise<unknown[]> {
  const mod = await loadScoring();
  const indicators = mod.INDICATORS ?? mod.indicators;
  if (!indicators) return [];
  return Array.isArray(indicators) ? indicators : Object.values(indicators);
}

export async function explainIndicator(id: string): Promise<unknown | null> {
  const indicators = (await listIndicators()) as Array<{ id?: string }>;
  return indicators.find((i) => i.id === id) ?? null;
}

/** Garantiza la forma del resultado aunque el motor devuelva campos de más o de menos. */
function normalizeSuitability(use: string, raw: unknown): SuitabilityResult {
  const r = (raw ?? {}) as Partial<SuitabilityResult> & Record<string, unknown>;
  const verdict = (
    ['favorable', 'condicionado', 'desfavorable', 'sin_datos'].includes(String(r.verdict))
      ? r.verdict
      : 'sin_datos'
  ) as SuitabilityResult['verdict'];

  const VERDICT_LABEL: Record<SuitabilityResult['verdict'], string> = {
    favorable: 'Favorable',
    condicionado: 'Favorable con condiciones',
    desfavorable: 'Desfavorable',
    sin_datos: 'Sin datos suficientes',
  };

  return {
    targetUse: String(r.targetUse ?? use),
    targetUseLabel: String(r.targetUseLabel ?? use),
    score: typeof r.score === 'number' ? r.score : null,
    verdict,
    verdictLabel: String(r.verdictLabel ?? VERDICT_LABEL[verdict]),
    factors: Array.isArray(r.factors) ? r.factors : [],
    blockers: Array.isArray(r.blockers) ? r.blockers : [],
    cautions: Array.isArray(r.cautions) ? r.cautions : [],
    missing: Array.isArray(r.missing) ? r.missing : [],
    disclaimer: String(
      r.disclaimer ?? `${DISCLAIMERS.notUrbanNorm} ${DISCLAIMERS.hazardScale}`,
    ),
  };
}
