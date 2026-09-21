/**
 * Registro de datasets del ETL.
 *
 * Cada dataset se declara en `etl/config/datasets/*.ts` con la forma que pide
 * PLAN.md §5. Aquí se agrupan en un registro por id.
 *
 * Los datasets se declaran a partir de lo que el crawler de Fase 0 encontró de
 * verdad (`data-catalog/`). Regla 2 de CLAUDE.md: lo que no se inspeccionó lleva
 * `fieldMapping: NOT_INSPECTED`.
 */

import { CADASTRE_DATASETS } from './datasets/igac-cadastre.js';
import { IGAC_CONTEXT_DATASETS } from './datasets/igac-context.js';
import { DANE_DATASETS } from './datasets/dane.js';
import { SOCIAL_INFRASTRUCTURE_DATASETS } from './datasets/social-infrastructure.js';
import { ENVIRONMENT_DATASETS } from './datasets/environment.js';
import { OSM_DATASETS } from './datasets/osm.js';
import type { DatasetDefinition } from './types.js';
import { isInspected, sourceFieldsOf } from './types.js';

export * from './types.js';
export * from './pii-blocklist.js';

const ALL: readonly DatasetDefinition[] = [
  ...CADASTRE_DATASETS,
  ...IGAC_CONTEXT_DATASETS,
  ...DANE_DATASETS,
  ...SOCIAL_INFRASTRUCTURE_DATASETS,
  ...ENVIRONMENT_DATASETS,
  ...OSM_DATASETS,
];

// Falla temprano si dos datasets comparten id: el id va a `meta.dataset` y a la
// procedencia de cada cifra mostrada (regla 4), así que no puede repetirse.
const seen = new Set<string>();
for (const d of ALL) {
  if (seen.has(d.id)) throw new Error(`Dataset duplicado en etl/config: "${d.id}"`);
  seen.add(d.id);
}

/** Registro por id. */
export const DATASETS: Readonly<Record<string, DatasetDefinition>> = Object.fromEntries(
  ALL.map((d) => [d.id, d]),
);

export const DATASET_LIST: readonly DatasetDefinition[] = ALL;

export function getDataset(id: string): DatasetDefinition {
  const d = DATASETS[id];
  if (!d) {
    throw new Error(
      `No existe el dataset "${id}". Disponibles: ${Object.keys(DATASETS).sort().join(', ')}`,
    );
  }
  return d;
}

export function tryGetDataset(id: string): DatasetDefinition | null {
  return DATASETS[id] ?? null;
}

export function datasetsForModule(moduleId: string): DatasetDefinition[] {
  return ALL.filter((d) => (d.modules as readonly string[]).includes(moduleId));
}

export function datasetsForPhase(phase: number): DatasetDefinition[] {
  return ALL.filter((d) => d.phase === phase);
}

/** Datasets cuyos campos todavía no se han verificado contra la fuente. */
export function uninspectedDatasets(): DatasetDefinition[] {
  return ALL.filter((d) => !isInspected(d.fieldMapping));
}

/**
 * Vista aplanada que consume `packages/sources` para generar
 * `data-catalog/SELECCION.md`. Se expone desde aquí para que el generador de
 * informes no tenga que conocer la forma interna de `DatasetDefinition`.
 */
export function selectionView(): {
  id: string;
  source: string;
  name: string;
  url: string;
  connector: string;
  format: string;
  crs: number | null;
  frequency: string;
  license: string;
  attribution: string;
  targetTable: string;
  modules: readonly string[];
  justification: string;
  inspection: string;
  priority: number;
  phase: number;
  notes: readonly string[];
  sourceFields: readonly string[];
  evidence: { inspectedFrom: string | null; catalogFile: string | null; inspectedAt: string | null };
}[] {
  return ALL.map((d) => ({
    id: d.id,
    source: d.source,
    name: d.name,
    url: d.url,
    connector: d.connector,
    format: d.format,
    crs: d.crs,
    frequency: d.frequency,
    license: d.license,
    attribution: d.attribution,
    targetTable: d.targetTable,
    modules: d.modules,
    justification: d.justification,
    inspection: d.inspection,
    priority: d.priority,
    phase: d.phase,
    notes: d.notes,
    sourceFields: sourceFieldsOf(d),
    evidence: { ...d.evidence },
  }));
}
