import { describe, expect, it } from 'vitest';
import { SuitabilityResultSchema, TARGET_USES } from '@terracolombia/shared';
import { evaluateSuitability, evaluateSuitabilityDetailed, verdictHelp } from '../suitability.js';
import { USE_PROFILES, USE_PROFILE_LIST, auditProfile } from '../use-profiles.js';
import type { IndicatorInputs } from '../indicators.js';

/** Predio urbano completo y sin restricciones: el caso favorable de referencia. */
const LOTE_URBANO_BUENO: IndicatorInputs = {
  slope_mean_pct: 2,
  hazard_landslide_level: 'baja',
  hazard_flood_level: 'muy_baja',
  pot_classification: 'suelo_urbano',
  inside_urban_perimeter: true,
  distance_paved_road_m: 100,
  protected_area_overlap_pct: 0,
  ethnic_territory_overlap_pct: 0,
  distance_school_m: 300,
  distance_health_facility_m: 800,
  road_access_index: 80,
  parcel_area_m2: 300,
  population_density_per_km2: 4000,
  protected_area_category: 'ninguna',
};

describe('perfiles de uso', () => {
  it('hay un perfil por cada uso objetivo', () => {
    expect(USE_PROFILE_LIST).toHaveLength(TARGET_USES.length);
    for (const use of TARGET_USES) {
      expect(USE_PROFILES[use].use).toBe(use);
      expect(USE_PROFILES[use].label.length).toBeGreaterThan(3);
      expect(USE_PROFILES[use].rationale.length).toBeGreaterThan(20);
    }
  });

  it('todo perfil es coherente: los obligatorios tienen peso y los pesos existen', () => {
    for (const profile of USE_PROFILE_LIST) {
      expect(auditProfile(profile)).toEqual([]);
    }
  });

  it('los pesos por omisión de cada perfil suman 1', () => {
    for (const profile of USE_PROFILE_LIST) {
      const total = Object.values(profile.weights).reduce((acc, w) => acc + (w ?? 0), 0);
      expect(total, profile.use).toBeCloseTo(1, 6);
    }
  });
});

describe('evaluateSuitability', () => {
  it('cumple el contrato compartido', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', LOTE_URBANO_BUENO);
    expect(() => SuitabilityResultSchema.parse(result)).not.toThrow();
  });

  it('un lote urbano sin restricciones sale favorable', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', LOTE_URBANO_BUENO);
    expect(result.verdict).toBe('favorable');
    expect(result.verdictLabel).toBe('Favorable');
    expect(result.score).not.toBeNull();
    expect(result.score ?? 0).toBeGreaterThan(70);
    expect(result.blockers).toEqual([]);
    expect(result.cautions).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('SIEMPRE devuelve el desglose por factor, nunca solo el puntaje', () => {
    for (const use of TARGET_USES) {
      const conDatos = evaluateSuitability(use, LOTE_URBANO_BUENO);
      const sinDatos = evaluateSuitability(use, {});
      expect(conDatos.factors.length, use).toBeGreaterThan(0);
      expect(sinDatos.factors.length, use).toBeGreaterThan(0);
      for (const factor of sinDatos.factors) {
        expect(factor.score).toBeNull();
        expect(factor.flag).toBe('unknown');
        expect(factor.explanation.length).toBeGreaterThan(10);
        expect(factor.formula.length).toBeGreaterThan(20);
      }
    }
  });

  it('sin datos no inventa puntaje: veredicto sin_datos y puntaje null', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {});
    expect(result.verdict).toBe('sin_datos');
    expect(result.score).toBeNull();
    expect(result.missing.length).toBe(result.factors.length);
    expect(result.verdictLabel).toBe('Sin datos suficientes');
  });

  it('si falta un indicador obligatorio no hay puntaje, aunque el resto esté completo', () => {
    const inputs: IndicatorInputs = { ...LOTE_URBANO_BUENO };
    delete inputs.hazard_flood_level;
    const result = evaluateSuitability('vivienda_unifamiliar', inputs);
    expect(result.verdict).toBe('sin_datos');
    expect(result.score).toBeNull();
    expect(result.missing.join(' ')).toContain('obligatorio');
    // El desglose sigue completo: el usuario ve qué sí sabemos.
    expect(result.factors).toHaveLength(13);
  });

  it('los faltantes no se convierten en ceros', () => {
    const conTodo = evaluateSuitability('comercio_local', {
      population_density_per_km2: 10_000,
      commerce_poi_density_per_km2: 300,
      road_access_index: 90,
      pot_classification: 'suelo_urbano',
      inside_urban_perimeter: true,
      competitor_density_per_km2: 2,
      distance_paved_road_m: 50,
      hazard_flood_level: 'baja',
      parcel_area_m2: 200,
      hazard_landslide_level: 'baja',
      protected_area_overlap_pct: 0,
      ethnic_territory_overlap_pct: 0,
      protected_area_category: 'ninguna',
      slope_mean_pct: 3,
    });
    const sinComercio = evaluateSuitability('comercio_local', {
      population_density_per_km2: 10_000,
      road_access_index: 90,
      pot_classification: 'suelo_urbano',
      inside_urban_perimeter: true,
      competitor_density_per_km2: 2,
      distance_paved_road_m: 50,
      hazard_flood_level: 'baja',
      parcel_area_m2: 200,
      hazard_landslide_level: 'baja',
      protected_area_overlap_pct: 0,
      ethnic_territory_overlap_pct: 0,
      protected_area_category: 'ninguna',
      slope_mean_pct: 3,
    });
    // El factor de comercio puntuaba por debajo del promedio de la celda. Al faltar, el
    // puntaje se recalcula sobre los demás y **sube**. Si el faltante valiera 0, bajaría:
    // esta comparación es justamente la que distingue "no sabemos" de "está en cero".
    expect(sinComercio.score).not.toBeNull();
    expect(sinComercio.missing).toHaveLength(1);
    expect(sinComercio.score ?? 0).toBeGreaterThan(conTodo.score ?? 0);
  });

  it('es determinista', () => {
    const a = evaluateSuitability('vivienda_unifamiliar', LOTE_URBANO_BUENO);
    const b = evaluateSuitability('vivienda_unifamiliar', LOTE_URBANO_BUENO);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('incluye descargo legal desde @terracolombia/shared', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', LOTE_URBANO_BUENO);
    expect(result.disclaimer).toContain('no es un concepto de norma urbanística');
    expect(result.disclaimer).toContain('escala regional o nacional');
  });
});

describe('bloqueantes duros', () => {
  it('una pendiente por encima del 45 % fuerza desfavorable', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      slope_mean_pct: 60,
    });
    expect(result.verdict).toBe('desfavorable');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers.join(' ')).toContain('restricción fuerte');
    expect(result.factors.find((f) => f.indicator === 'slope_mean_pct')?.flag).toBe('blocker');
  });

  it('una amenaza alta fuerza desfavorable', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      hazard_landslide_level: 'muy_alta',
    });
    expect(result.verdict).toBe('desfavorable');
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('el territorio étnico fuerza desfavorable', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      ethnic_territory_overlap_pct: 100,
    });
    expect(result.verdict).toBe('desfavorable');
    expect(result.blockers.join(' ')).toContain('consulta previa');
  });

  it('un área protegida restrictiva bloquea y una de manejo regulado solo advierte', () => {
    const restrictiva = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      protected_area_overlap_pct: 80,
      protected_area_category: 'parque_nacional_natural',
    });
    expect(restrictiva.verdict).toBe('desfavorable');
    expect(restrictiva.blockers.join(' ')).toContain('régimen restrictivo');

    const regulada = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      protected_area_overlap_pct: 60,
      protected_area_category: 'distrito_de_manejo_integrado',
    });
    expect(regulada.verdict).toBe('condicionado');
    expect(regulada.blockers).toEqual([]);
    expect(regulada.cautions.length).toBeGreaterThan(0);
  });

  it('sin la categoría del área protegida no se da por descartada la restricción', () => {
    const inputs: IndicatorInputs = {
      ...LOTE_URBANO_BUENO,
      protected_area_overlap_pct: 80,
    };
    delete inputs.protected_area_category;
    const result = evaluateSuitability('vivienda_unifamiliar', inputs);
    expect(result.verdict).toBe('desfavorable');
    expect(result.blockers.join(' ')).toContain('no sabemos su categoría');
  });

  it('el suelo de protección del POT bloquea', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      pot_classification: 'suelo_de_proteccion',
    });
    expect(result.verdict).toBe('desfavorable');
  });

  it('estar fuera de la frontera agrícola bloquea los usos agropecuarios', () => {
    const result = evaluateSuitability('agricultura', {
      land_capability_class: '2',
      land_vocation: 'agricola',
      inside_agricultural_frontier: false,
      slope_mean_pct: 5,
      land_use_conflict: 'uso_adecuado',
      parcel_area_m2: 50_000,
      protected_area_overlap_pct: 0,
      protected_area_category: 'ninguna',
      ethnic_territory_overlap_pct: 0,
      distance_secondary_road_m: 500,
      elevation_mean_m: 1200,
      distance_municipal_seat_m: 5000,
      pot_classification: 'suelo_rural',
      inside_urban_perimeter: false,
    });
    expect(result.verdict).toBe('desfavorable');
    expect(result.blockers.join(' ')).toContain('frontera agrícola');
  });

  it('un bloqueo manda incluso si el puntaje es alto', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      hazard_flood_level: 'alta',
    });
    expect(result.verdict).toBe('desfavorable');
    expect(result.score ?? 0).toBeGreaterThan(50);
  });
});

describe('precauciones', () => {
  it('una precaución baja un favorable a condicionado', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', {
      ...LOTE_URBANO_BUENO,
      slope_mean_pct: 30,
    });
    expect(result.verdict).toBe('condicionado');
    expect(result.cautions.length).toBeGreaterThan(0);
  });

  it('una regla de bloqueo que no se puede evaluar queda como precaución', () => {
    const inputs: IndicatorInputs = { ...LOTE_URBANO_BUENO };
    delete inputs.protected_area_overlap_pct;
    const detail = evaluateSuitabilityDetailed('vivienda_unifamiliar', inputs);
    expect(detail.undeterminedBlockers.length).toBeGreaterThan(0);
    expect(detail.result.cautions.join(' ')).toContain('no lo damos por descartado');
  });
});

describe('pesos editables', () => {
  it('renormaliza los pesos del usuario y los refleja en el desglose', () => {
    const detail = evaluateSuitabilityDetailed('vivienda_unifamiliar', LOTE_URBANO_BUENO, {
      slope_mean_pct: 1,
    });
    const total = detail.result.factors.reduce((acc, f) => acc + f.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    const slope = detail.result.factors.find((f) => f.indicator === 'slope_mean_pct');
    expect(slope?.weight).toBeGreaterThan(0.4);
  });

  it('ignora pesos de indicadores que el perfil no contempla', () => {
    const detail = evaluateSuitabilityDetailed('vivienda_unifamiliar', LOTE_URBANO_BUENO, {
      solar_irradiance_kwh_m2_day: 1,
      inventado: 1,
    });
    expect(detail.ignoredWeightKeys.sort()).toEqual(['inventado', 'solar_irradiance_kwh_m2_day']);
    expect(detail.result.factors.some((f) => f.indicator === 'solar_irradiance_kwh_m2_day')).toBe(
      false,
    );
  });

  it('subir el peso de un factor malo baja el puntaje', () => {
    const inputs: IndicatorInputs = { ...LOTE_URBANO_BUENO, parcel_area_m2: 80 };
    const base = evaluateSuitability('vivienda_unifamiliar', inputs);
    const conPeso = evaluateSuitability('vivienda_unifamiliar', inputs, { parcel_area_m2: 1 });
    expect(conPeso.score ?? 100).toBeLessThan(base.score ?? 0);
  });
});

describe('verdictHelp', () => {
  it('tiene texto para los cuatro veredictos', () => {
    for (const verdict of ['favorable', 'condicionado', 'desfavorable', 'sin_datos'] as const) {
      expect(verdictHelp(verdict).length).toBeGreaterThan(20);
    }
  });
});
