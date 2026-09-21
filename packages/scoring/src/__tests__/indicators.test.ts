import { describe, expect, it } from 'vitest';
import { TARGET_USES } from '@terracolombia/shared';
import {
  INDICATORS,
  INDICATOR_IDS,
  INDICATOR_LIST,
  buildFactorScores,
  describeIndicatorCutpoints,
  findIndicator,
  indicatorsRequiredFor,
  isIndicatorId,
  readInput,
  toFactorScore,
} from '../indicators.js';

describe('integridad del catálogo', () => {
  it('declara los mismos identificadores en la lista y en el mapa', () => {
    expect(Object.keys(INDICATORS).sort()).toEqual([...INDICATOR_IDS].sort());
    expect(INDICATOR_LIST.map((d) => d.id)).toEqual([...INDICATOR_IDS]);
  });

  it('no repite identificadores', () => {
    expect(new Set(INDICATOR_IDS).size).toBe(INDICATOR_IDS.length);
  });

  it('cubre los indicadores que exige el plan', () => {
    const exigidos = [
      'slope_mean_pct',
      'elevation_mean_m',
      'land_capability_class',
      'land_vocation',
      'land_use_conflict',
      'hazard_landslide_level',
      'hazard_seismic_level',
      'hazard_flood_level',
      'protected_area_overlap_pct',
      'ethnic_territory_overlap_pct',
      'inside_agricultural_frontier',
      'inside_urban_perimeter',
      'pot_classification',
      'distance_primary_road_m',
      'distance_secondary_road_m',
      'distance_paved_road_m',
      'distance_municipal_seat_m',
      'distance_school_m',
      'distance_health_facility_m',
      'population_density_per_km2',
      'school_age_population',
      'commerce_poi_density_per_km2',
      'parcel_density_per_km2',
      'parcel_area_m2',
      'built_area_m2',
      'road_access_index',
      'mining_title_present',
    ];
    for (const id of exigidos) {
      expect(isIndicatorId(id), `falta el indicador ${id}`).toBe(true);
    }
  });

  it('cada indicador está completamente documentado', () => {
    for (const def of INDICATOR_LIST) {
      expect(def.label.length, def.id).toBeGreaterThan(3);
      expect(def.formula.length, def.id).toBeGreaterThan(20);
      expect(def.sourceDatasetIds.length, def.id).toBeGreaterThan(0);
      expect(describeIndicatorCutpoints(def.id).length, def.id).toBeGreaterThan(10);
      expect(['number', 'category', 'boolean']).toContain(def.valueType);
      expect(['higher_is_better', 'lower_is_better', 'categorical']).toContain(def.direction);
    }
  });

  it('un dato faltante devuelve null y semáforo desconocido, nunca 0 ni ok', () => {
    for (const def of INDICATOR_LIST) {
      expect(def.normalize(null), def.id).toBeNull();
      expect(def.flagFor(null), def.id).toBe('unknown');
      expect(def.explain(null, null).length, def.id).toBeGreaterThan(10);
    }
  });

  it('los indicadores obligatorios están declarados para usos existentes', () => {
    for (const def of INDICATOR_LIST) {
      for (const use of def.requiredFor) {
        expect(TARGET_USES).toContain(use);
      }
    }
  });

  it('todo uso objetivo tiene al menos un indicador obligatorio', () => {
    for (const use of TARGET_USES) {
      expect(indicatorsRequiredFor(use).length, use).toBeGreaterThan(0);
    }
  });
});

describe('semáforos', () => {
  it('la pendiente pasa de ok a precaución y a bloqueo en los cortes declarados', () => {
    const slope = INDICATORS.slope_mean_pct;
    expect(slope.flagFor(2)).toBe('ok');
    expect(slope.flagFor(25)).toBe('ok');
    expect(slope.flagFor(30)).toBe('caution');
    expect(slope.flagFor(46)).toBe('blocker');
  });

  it('la amenaza alta bloquea y la sísmica alta solo advierte', () => {
    expect(INDICATORS.hazard_landslide_level.flagFor('alta')).toBe('blocker');
    expect(INDICATORS.hazard_flood_level.flagFor('muy_alta')).toBe('blocker');
    expect(INDICATORS.hazard_seismic_level.flagFor('alta')).toBe('caution');
  });

  it('el territorio étnico bloquea cuando el predio está dentro', () => {
    expect(INDICATORS.ethnic_territory_overlap_pct.flagFor(0)).toBe('ok');
    expect(INDICATORS.ethnic_territory_overlap_pct.flagFor(5)).toBe('caution');
    expect(INDICATORS.ethnic_territory_overlap_pct.flagFor(80)).toBe('blocker');
  });

  it('el área protegida solo advierte: quien bloquea es la regla que mira la categoría', () => {
    expect(INDICATORS.protected_area_overlap_pct.flagFor(80)).toBe('caution');
    expect(INDICATORS.protected_area_category.flagFor('parque_nacional_natural')).toBe('blocker');
    expect(INDICATORS.protected_area_category.flagFor('distrito_de_manejo_integrado')).toBe(
      'caution',
    );
    expect(INDICATORS.protected_area_category.flagFor('ninguna')).toBe('ok');
  });

  it('el suelo de protección del POT bloquea', () => {
    expect(INDICATORS.pot_classification.flagFor('suelo_de_proteccion')).toBe('blocker');
    expect(INDICATORS.pot_classification.flagFor('suelo_urbano')).toBe('ok');
  });
});

describe('toFactorScore', () => {
  it('nunca entrega un puntaje sin fórmula, fuente, explicación y semáforo', () => {
    const factor = toFactorScore('slope_mean_pct', 10, 0.2);
    expect(factor.indicator).toBe('slope_mean_pct');
    expect(factor.score).toBe(78);
    expect(factor.rawValue).toBe(10);
    expect(factor.unit).toBe('%');
    expect(factor.weight).toBe(0.2);
    expect(factor.direction).toBe('lower_is_better');
    expect(factor.formula.length).toBeGreaterThan(20);
    expect(factor.sourceDatasetIds.length).toBeGreaterThan(0);
    expect(factor.explanation.length).toBeGreaterThan(20);
    expect(factor.flag).toBe('ok');
  });

  it('distingue el cero real del dato faltante', () => {
    const cero = toFactorScore('slope_mean_pct', 0, 1);
    const falta = toFactorScore('slope_mean_pct', null, 1);
    expect(cero.score).toBe(100);
    expect(cero.flag).toBe('ok');
    expect(falta.score).toBeNull();
    expect(falta.flag).toBe('unknown');
    expect(falta.rawValue).toBeNull();
  });

  it('convierte booleanos en texto legible para el desglose', () => {
    expect(toFactorScore('mining_title_present', true, 1).rawValue).toBe('true');
  });

  it('respeta el ajuste de orientación declarado', () => {
    const base = toFactorScore('land_capability_class', '1', 1);
    const invertido = toFactorScore('land_capability_class', '1', 1, {
      normalize: INDICATORS.land_capability_class.normalize,
      formula: 'otra fórmula declarada',
    });
    expect(base.score).toBe(100);
    expect(invertido.formula).toBe('otra fórmula declarada');
  });
});

describe('buildFactorScores', () => {
  it('devuelve un factor por cada peso declarado, con dato o sin él', () => {
    const factors = buildFactorScores(
      { slope_mean_pct: 5 },
      { slope_mean_pct: 0.5, hazard_flood_level: 0.5 },
    );
    expect(factors).toHaveLength(2);
    expect(factors[0]?.indicator).toBe('slope_mean_pct');
    expect(factors[0]?.score).toBe(92);
    expect(factors[1]?.indicator).toBe('hazard_flood_level');
    expect(factors[1]?.score).toBeNull();
  });

  it('respeta el orden del catálogo para que la salida sea determinista', () => {
    const a = buildFactorScores({}, { road_access_index: 1, slope_mean_pct: 1 });
    const b = buildFactorScores({}, { slope_mean_pct: 1, road_access_index: 1 });
    expect(a.map((f) => f.indicator)).toEqual(b.map((f) => f.indicator));
    expect(a.map((f) => f.indicator)).toEqual(['slope_mean_pct', 'road_access_index']);
  });
});

describe('utilidades de lectura', () => {
  it('readInput trata undefined como faltante', () => {
    expect(readInput({}, 'slope_mean_pct')).toBeNull();
    expect(readInput({ slope_mean_pct: 0 }, 'slope_mean_pct')).toBe(0);
  });

  it('findIndicator no revienta con identificadores desconocidos', () => {
    expect(findIndicator('no_existe')).toBeUndefined();
    expect(isIndicatorId('no_existe')).toBe(false);
  });
});
