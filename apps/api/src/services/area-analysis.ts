import { NOT_AVAILABLE } from '@terracolombia/shared';
import type { Coverage } from '@terracolombia/shared';
import {
  agriculturalFrontierOverlap,
  ethnicTerritoryOverlaps,
  facilitiesIn,
  getCoverage,
  hazardOverlaps,
  parcelStatsIn,
  populationIn,
  potZoneOverlaps,
  protectedAreaOverlaps,
  reliefFor,
  soilOverlaps,
} from '@terracolombia/db';
import type { ResolvedScope } from './area-scope.js';

export type AreaSection =
  | 'parcels'
  | 'population'
  | 'education'
  | 'health'
  | 'commerce'
  | 'soils'
  | 'hazards'
  | 'protected'
  | 'relief'
  | 'pot'
  | 'accessibility';

export interface AreaAnalysisResult {
  label: string;
  areaKm2: number;
  areaHa: number;
  muniCode: string | null;
  coverage: Coverage | null;
  parcels: unknown;
  population: unknown;
  facilities: unknown;
  soils: unknown;
  hazards: unknown;
  protectedAreas: unknown;
  ethnicTerritories: unknown;
  potZones: unknown;
  agriculturalFrontier: unknown;
  relief: unknown;
  /** Secciones que no se pudieron llenar por falta de datos, declaradas explícitamente. */
  missingSections: Array<{ section: AreaSection; reason: string }>;
  warnings: string[];
}

const ALL_SECTIONS: AreaSection[] = [
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
];

/**
 * Tablero de una zona. Cada bloque se calcula solo si se pidió, y cuando no hay datos se
 * anota en `missingSections` con el motivo: nunca se devuelve un cero que parezca un dato.
 */
export async function analyzeArea(
  scope: ResolvedScope,
  sections: AreaSection[],
  cutDate?: string,
): Promise<AreaAnalysisResult> {
  const wanted = new Set(sections.length > 0 ? sections : ALL_SECTIONS);
  const missing: AreaAnalysisResult['missingSections'] = [];
  const warnings: string[] = [];
  const geom = scope.geometry;

  const [
    parcelStats,
    population,
    facilities,
    soils,
    hazards,
    protectedAreas,
    ethnic,
    pot,
    frontier,
    relief,
  ] = await Promise.all([
    wanted.has('parcels') ? parcelStatsIn(geom, cutDate) : Promise.resolve(null),
    wanted.has('population') ? populationIn(geom) : Promise.resolve(null),
    wanted.has('education') || wanted.has('health') || wanted.has('commerce')
      ? facilitiesIn(geom)
      : Promise.resolve(null),
    wanted.has('soils') ? soilOverlaps(geom) : Promise.resolve([]),
    wanted.has('hazards') ? hazardOverlaps(geom) : Promise.resolve([]),
    wanted.has('protected') ? protectedAreaOverlaps(geom) : Promise.resolve([]),
    wanted.has('protected') ? ethnicTerritoryOverlaps(geom) : Promise.resolve([]),
    wanted.has('pot')
      ? potZoneOverlaps(geom, scope.muniCode ?? undefined)
      : Promise.resolve([]),
    wanted.has('soils') ? agriculturalFrontierOverlap(geom) : Promise.resolve([]),
    wanted.has('relief') ? reliefFor(geom) : Promise.resolve(null),
  ]);

  const coverage = scope.muniCode ? await getCoverage(scope.muniCode) : null;

  if (wanted.has('parcels') && (parcelStats?.n_parcels ?? 0) === 0) {
    missing.push({
      section: 'parcels',
      reason:
        coverage?.status === 'none'
          ? (coverage.message ??
            'No tenemos predios de este municipio porque su catastro lo gestiona otra entidad.')
          : 'No hay predios cargados dentro de esta zona en el corte activo.',
    });
  }
  if (wanted.has('population') && (population?.n_blocks ?? 0) === 0) {
    missing.push({
      section: 'population',
      reason:
        'No hay manzanas censales del DANE cargadas para esta zona, así que no podemos estimar la población.',
    });
  }
  if (wanted.has('soils') && soils.length === 0) {
    missing.push({
      section: 'soils',
      reason: 'No hay estudio de suelos cargado que cubra esta zona.',
    });
  }
  if (wanted.has('hazards') && hazards.length === 0) {
    missing.push({
      section: 'hazards',
      reason:
        'No hay capas de amenaza cargadas que cubran esta zona. Esto no significa que no haya amenaza: significa que no tenemos el dato.',
    });
  }
  if (wanted.has('pot') && pot.length === 0) {
    missing.push({
      section: 'pot',
      reason:
        'No tenemos la zonificación del POT de este municipio. No existe un repositorio nacional completo; consulta la Secretaría de Planeación municipal.',
    });
  }
  if (wanted.has('relief') && !relief?.slope_mean_pct) {
    missing.push({
      section: 'relief',
      reason: 'No hay modelo digital de elevación cargado para esta zona.',
    });
  }

  if (missing.length > 0) {
    warnings.push(
      `Faltan datos para ${missing.length} de las ${wanted.size} secciones pedidas. Cada una dice por qué.`,
    );
  }

  return {
    label: scope.label,
    areaKm2: Number(scope.areaKm2.toFixed(4)),
    areaHa: Number((scope.areaKm2 * 100).toFixed(2)),
    muniCode: scope.muniCode,
    coverage,
    parcels: parcelStats
      ? {
          total: parcelStats.n_parcels,
          urban: parcelStats.n_urban,
          rural: parcelStats.n_rural,
          areaSumM2: parcelStats.area_sum_m2 ?? NOT_AVAILABLE,
          areaMedianM2: parcelStats.area_median_m2 ?? NOT_AVAILABLE,
          builtAreaSumM2: parcelStats.built_area_sum_m2 ?? NOT_AVAILABLE,
          withBuilding: parcelStats.n_with_building,
          withoutBuilding: parcelStats.n_parcels - parcelStats.n_with_building,
          byEconomicUse: parcelStats.use_counts,
          /** Densidad predial: útil para comparar zonas de tamaño distinto. */
          parcelsPerKm2:
            scope.areaKm2 > 0 ? Number((parcelStats.n_parcels / scope.areaKm2).toFixed(1)) : null,
        }
      : null,
    population: population
      ? {
          total: population.pop_total ?? NOT_AVAILABLE,
          households: population.households ?? NOT_AVAILABLE,
          dwellings: population.dwellings ?? NOT_AVAILABLE,
          ageBands: population.age_bands,
          blocksUsed: population.n_blocks,
          densityPerKm2:
            population.pop_total !== null && scope.areaKm2 > 0
              ? Number((population.pop_total / scope.areaKm2).toFixed(1))
              : NOT_AVAILABLE,
          method:
            'Estimación por reparto de área: la población de cada manzana censal se suma en proporción a la fracción que cae dentro de la zona.',
        }
      : null,
    facilities: facilities
      ? {
          schools: facilities.n_schools,
          schoolEnrollment: facilities.school_enrollment ?? NOT_AVAILABLE,
          healthFacilities: facilities.n_health,
          poisByCategory: facilities.poi_counts,
        }
      : null,
    soils,
    hazards,
    protectedAreas,
    ethnicTerritories: ethnic,
    potZones: pot,
    agriculturalFrontier: frontier,
    relief: relief
      ? {
          elevationMeanM: relief.elevation_mean_m ?? NOT_AVAILABLE,
          slopeMeanPct: relief.slope_mean_pct ?? NOT_AVAILABLE,
          slopeMaxPct: relief.slope_max_pct ?? NOT_AVAILABLE,
        }
      : null,
    missingSections: missing,
    warnings,
  };
}
