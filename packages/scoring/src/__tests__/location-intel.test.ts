import { describe, expect, it } from 'vitest';
import { pointToCell, ring } from '@terracolombia/geo';
import { scoreCells, topZones, type CellInput } from '../location-intel.js';
import { BUSINESS_TEMPLATES } from '../templates.js';
import type { BusinessTemplate } from '../templates.js';
import type { IndicatorInputs } from '../indicators.js';

/** Celdas reales, contiguas, en el departamento piloto (Atlántico). */
const CENTER = pointToCell(-74.83, 10.92, 9);
const NEIGHBORHOOD = ring(CENTER, 1);

const RETAIL: BusinessTemplate = (() => {
  const t = BUSINESS_TEMPLATES.retail_barrio;
  if (!t) throw new Error('La plantilla retail_barrio debe existir');
  return t;
})();

function inputsFor(populationDensity: number, extra: IndicatorInputs = {}): IndicatorInputs {
  return {
    population_density_per_km2: populationDensity,
    commerce_poi_density_per_km2: 120,
    competitor_density_per_km2: 4,
    road_access_index: 70,
    inside_urban_perimeter: true,
    parcel_density_per_km2: 800,
    protected_area_overlap_pct: 0,
    protected_area_category: 'ninguna',
    ethnic_territory_overlap_pct: 0,
    ...extra,
  };
}

function cells(): CellInput[] {
  return NEIGHBORHOOD.map((h3, index) => ({
    h3,
    muniCode: '08001',
    // Densidad decreciente para que el orden sea comprobable.
    inputs: inputsFor(12_000 - index * 1_000),
  }));
}

describe('scoreCells', () => {
  it('puntúa, ordena y entrega el desglose de cada celda', () => {
    const result = scoreCells(cells(), RETAIL);
    expect(result.templateId).toBe('retail_barrio');
    expect(result.cells).toHaveLength(NEIGHBORHOOD.length);
    expect(result.excludedCount).toBe(0);
    expect(result.evaluatedCount).toBe(NEIGHBORHOOD.length);

    for (const cell of result.cells) {
      expect(cell.factors.length).toBe(RETAIL.indicators.length);
      expect(cell.score).not.toBeNull();
      expect(cell.resolution).toBe(9);
      expect(cell.center).not.toBeNull();
      for (const factor of cell.factors) {
        expect(factor.formula.length).toBeGreaterThan(20);
        expect(factor.sourceDatasetIds.length).toBeGreaterThan(0);
        expect(factor.explanation.length).toBeGreaterThan(10);
      }
    }

    const scores = result.cells.map((c) => c.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(result.cells[0]?.rank).toBe(1);
  });

  it('incluye la explicación del orden y el descargo', () => {
    const result = scoreCells(cells(), RETAIL);
    expect(result.explanation).toContain(RETAIL.name);
    expect(result.explanation).toContain('La decisión, y los criterios, son tuyos.');
    expect(result.disclaimer).toContain('no es una recomendación de inversión');
    expect(result.sourceDatasetIds.length).toBeGreaterThan(0);
  });

  it('los pesos del usuario cambian el orden y se reportan renormalizados', () => {
    const base = scoreCells(cells(), RETAIL);
    const conPeso = scoreCells(cells(), RETAIL, { competitor_density_per_km2: 5 });
    const total = Object.values(conPeso.weights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(conPeso.weights.competitor_density_per_km2 ?? 0).toBeGreaterThan(
      base.weights.competitor_density_per_km2 ?? 1,
    );
  });

  it('avisa de los pesos que no corresponden a la plantilla', () => {
    const result = scoreCells(cells(), RETAIL, { inventado: 1 });
    expect(result.warnings.join(' ')).toContain('inventado');
  });

  it('un filtro duro descarta la celda pero conserva su desglose y el motivo', () => {
    const input = cells();
    const first = input[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.inputs = inputsFor(12_000, { ethnic_territory_overlap_pct: 95 });
    const result = scoreCells(input, RETAIL);
    const descartada = result.cells.find((c) => c.h3 === first.h3);
    expect(descartada?.excluded).toBe(true);
    expect(descartada?.exclusions[0]?.id).toBe('ethnic_territory');
    expect(descartada?.factors.length).toBe(RETAIL.indicators.length);
    expect(descartada?.rank).toBeNull();
    expect(result.excludedCount).toBe(1);
    // Las descartadas van al final del orden.
    expect(result.cells.at(-1)?.h3).toBe(first.h3);
  });

  it('un umbral del usuario descarta por valor crudo y lo explica', () => {
    const result = scoreCells(cells(), RETAIL, undefined, {
      population_density_per_km2: { gte: 11_000 },
    });
    expect(result.excludedCount).toBeGreaterThan(0);
    const descartada = result.cells.find((c) => c.excluded);
    expect(descartada?.exclusions[0]?.id).toBe('threshold:population_density_per_km2');
    expect(descartada?.exclusions[0]?.reason).toContain('al menos');
  });

  it('avisa de umbrales sobre indicadores que no existen', () => {
    const result = scoreCells(cells(), RETAIL, undefined, { inventado: { gte: 1 } });
    expect(result.warnings.join(' ')).toContain('no es un indicador del catálogo');
  });

  it('sin datos no hay puntaje inventado, pero sí desglose', () => {
    const vacias: CellInput[] = NEIGHBORHOOD.map((h3) => ({ h3, inputs: {} }));
    const result = scoreCells(vacias, RETAIL);
    for (const cell of result.cells) {
      expect(cell.score).toBeNull();
      expect(cell.confidence).toBe(0);
      expect(cell.factors.length).toBe(RETAIL.indicators.length);
      expect(cell.rank).toBeNull();
    }
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('respeta el límite después de ordenar', () => {
    const result = scoreCells(cells(), RETAIL, undefined, undefined, { limit: 3 });
    expect(result.cells).toHaveLength(3);
    expect(result.evaluatedCount).toBe(NEIGHBORHOOD.length);
  });

  it('es determinista', () => {
    expect(JSON.stringify(scoreCells(cells(), RETAIL))).toBe(
      JSON.stringify(scoreCells(cells(), RETAIL)),
    );
  });
});

describe('topZones', () => {
  it('agrupa celdas contiguas en una zona con su desglose', () => {
    const result = scoreCells(cells(), RETAIL);
    const zones = topZones(result.cells, { minScore: 0, minCells: 2 });
    expect(zones).toHaveLength(1);
    const zone = zones[0];
    expect(zone).toBeDefined();
    if (!zone) return;
    expect(zone.id).toBe('zona-1');
    expect(zone.rank).toBe(1);
    expect(zone.cellCount).toBe(NEIGHBORHOOD.length);
    expect(zone.areaKm2 ?? 0).toBeGreaterThan(0);
    expect(zone.center).not.toBeNull();
    expect(zone.scoreMax).toBeGreaterThanOrEqual(zone.scoreMean);
    expect(zone.scoreMean).toBeGreaterThanOrEqual(zone.scoreMin);
    expect(zone.factors.length).toBe(RETAIL.indicators.length);
    expect(zone.factors.every((f) => f.cellsWithData === NEIGHBORHOOD.length)).toBe(true);
    expect(zone.summary).toContain('celdas contiguas');
    expect(zone.summary).toContain('confianza');
  });

  it('separa grupos que no se tocan', () => {
    const lejano = pointToCell(-75.5, 6.25, 9); // Medellín: no es vecina de Atlántico.
    const input: CellInput[] = [
      ...NEIGHBORHOOD.map((h3) => ({ h3, inputs: inputsFor(12_000) })),
      ...ring(lejano, 1).map((h3) => ({ h3, inputs: inputsFor(11_000) })),
    ];
    const result = scoreCells(input, RETAIL);
    const zones = topZones(result.cells, { minScore: 0, minCells: 2 });
    expect(zones).toHaveLength(2);
    expect(zones[0]?.scoreMean ?? 0).toBeGreaterThanOrEqual(zones[1]?.scoreMean ?? 0);
  });

  it('por omisión se queda con el tramo alto de los puntajes', () => {
    const result = scoreCells(cells(), RETAIL);
    const zones = topZones(result.cells, { minCells: 1 });
    const total = zones.reduce((acc, z) => acc + z.cellCount, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(NEIGHBORHOOD.length);
  });

  it('descarta las celdas excluidas y las que no tienen puntaje', () => {
    const vacias: CellInput[] = NEIGHBORHOOD.map((h3) => ({ h3, inputs: {} }));
    const result = scoreCells(vacias, RETAIL);
    expect(topZones(result.cells)).toEqual([]);
  });

  it('exige un mínimo de celdas para hablar de zona', () => {
    const result = scoreCells(cells(), RETAIL);
    const unaSola = topZones(result.cells, { minScore: 0, minCells: 99 });
    expect(unaSola).toEqual([]);
  });

  it('es determinista', () => {
    const result = scoreCells(cells(), RETAIL);
    expect(topZones(result.cells, { minScore: 0 })).toEqual(
      topZones(result.cells, { minScore: 0 }),
    );
  });
});
