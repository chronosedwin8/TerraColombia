import { describe, expect, it } from 'vitest';
import { GLOSSARY, TARGET_USES } from '@terracolombia/shared';
import { BUSINESS_TEMPLATES, INDICATOR_LIST, evaluateSuitability } from '@terracolombia/scoring';
import {
  catalogReferenceNumbers,
  explainFactor,
  explainGlossaryTerm,
  explainIndicator,
  explainSuitability,
  explainTemplate,
  templatedAnswer,
} from '../explain.js';
import { buildNumberContext, verifyNumbers } from '../guards.js';

describe('explainIndicator', () => {
  it('explica todos los indicadores del catálogo sin IA', () => {
    for (const def of INDICATOR_LIST) {
      const explanation = explainIndicator(def.id);
      expect(explanation, def.id).not.toBeNull();
      expect(explanation?.text.length ?? 0, def.id).toBeGreaterThan(120);
      expect(explanation?.title).toBe(def.label);
    }
  });

  it('incluye la fórmula, los cortes, las fuentes y el valor concreto', () => {
    const explanation = explainIndicator('slope_mean_pct', 50);
    expect(explanation?.text).toContain('Qué mide');
    expect(explanation?.text).toContain('Cómo se convierte a puntaje');
    expect(explanation?.text).toContain('copernicus_dem_30m');
    expect(explanation?.text).toContain('En este caso');
    expect(explanation?.text).toContain('Puntaje de este factor');
  });

  it('usa el ajuste del uso cuando el indicador cambia de orientación', () => {
    const generico = explainIndicator('land_capability_class', '2');
    const solar = explainIndicator('land_capability_class', '2', 'solar_fotovoltaico');
    expect(generico?.text).not.toBe(solar?.text);
    expect(solar?.text).toContain('paneles');
  });

  it('devuelve null en un indicador inexistente en vez de inventarlo', () => {
    expect(explainIndicator('no_existe')).toBeNull();
  });

  it('advierte cuando el dato tiene una limitación declarada', () => {
    expect(explainIndicator('pot_classification')?.text).toContain('Ojo:');
    expect(explainIndicator('land_cadastral_value_per_m2')?.caveat).toContain(
      'no el precio de venta',
    );
  });
});

describe('explainGlossaryTerm', () => {
  it('explica todos los términos del glosario', () => {
    for (const entry of GLOSSARY) {
      const explanation = explainGlossaryTerm(entry.id);
      expect(explanation, entry.id).not.toBeNull();
      expect(explanation?.text).toContain(entry.plain);
    }
  });

  it('encuentra el término por su texto', () => {
    expect(explainGlossaryTerm('Avalúo catastral')?.glossaryId).toBe('avaluo_catastral');
  });

  it('devuelve null si no existe', () => {
    expect(explainGlossaryTerm('term_inventado')).toBeNull();
  });
});

describe('explainSuitability', () => {
  const result = evaluateSuitability('vivienda_unifamiliar', {
    slope_mean_pct: 60,
    hazard_landslide_level: 'baja',
    hazard_flood_level: 'muy_baja',
    pot_classification: 'suelo_urbano',
    inside_urban_perimeter: true,
    distance_paved_road_m: 100,
    protected_area_overlap_pct: 0,
    protected_area_category: 'ninguna',
    ethnic_territory_overlap_pct: 0,
    distance_school_m: 300,
    distance_health_facility_m: 800,
    road_access_index: 80,
    parcel_area_m2: 300,
    population_density_per_km2: 4000,
  });

  it('cuenta el veredicto, los bloqueos y el desglose', () => {
    const explanation = explainSuitability(result);
    expect(explanation.text).toContain('Desfavorable');
    expect(explanation.text).toContain('Restricciones fuertes');
    expect(explanation.text).toContain('Factores que más pesan');
    expect(explanation.sourceDatasetIds.length).toBeGreaterThan(0);
  });

  it('el texto plantillado no trae ninguna cifra ajena al resultado', () => {
    const explanation = explainSuitability(result);
    const context = buildNumberContext(result, catalogReferenceNumbers());
    expect(verifyNumbers(explanation.text, context).ok).toBe(true);
  });

  it('dice qué faltó cuando falta algo', () => {
    const sinDatos = evaluateSuitability('colegio', {});
    const explanation = explainSuitability(sinDatos);
    expect(explanation.text).toContain('Lo que no pudimos evaluar');
    expect(explanation.text).toContain('Sin datos suficientes');
  });
});

describe('explainFactor', () => {
  it('explica un factor con y sin dato', () => {
    const result = evaluateSuitability('vivienda_unifamiliar', { slope_mean_pct: 10 });
    const conDato = result.factors.find((f) => f.indicator === 'slope_mean_pct');
    const sinDato = result.factors.find((f) => f.indicator === 'road_access_index');
    expect(conDato).toBeDefined();
    expect(sinDato).toBeDefined();
    if (!conDato || !sinDato) return;
    expect(explainFactor(conDato).text).toContain('Puntaje:');
    expect(explainFactor(sinDato).text).toContain('no se reemplazó por cero');
  });
});

describe('explainTemplate', () => {
  it('explica cada plantilla con sus pesos y filtros', () => {
    for (const template of Object.values(BUSINESS_TEMPLATES)) {
      const explanation = explainTemplate(template);
      expect(explanation.text).toContain(template.name);
      expect(explanation.text).toContain('Qué mira y con qué peso');
      expect(explanation.text).toContain('El motor no elige por ti');
    }
  });
});

describe('templatedAnswer', () => {
  it('responde a una pregunta de glosario sin IA', () => {
    const r = templatedAnswer('¿qué es el avalúo catastral?');
    expect(r.matched).toBe(true);
    expect(r.explanation.kind).toBe('glossary');
    expect(r.explanation.text).toContain('impuesto predial');
  });

  it('responde a una pregunta sobre un indicador', () => {
    const r = templatedAnswer('¿cómo se calcula la pendiente media del terreno?');
    expect(r.matched).toBe(true);
    expect(r.explanation.kind).toBe('indicator');
  });

  it('reconoce el identificador técnico del indicador', () => {
    const r = templatedAnswer('explícame road_access_index');
    expect(r.matched).toBe(true);
    expect(r.explanation.title).toContain('accesibilidad vial');
  });

  it('cuando no entiende, dice qué sí puede hacer en vez de inventar', () => {
    const r = templatedAnswer('¿cuánto vale el dólar mañana?');
    expect(r.matched).toBe(false);
    expect(r.explanation.kind).toBe('fallback');
    expect(r.explanation.text).toContain('Puedo ayudarte');
  });
});

describe('catalogReferenceNumbers', () => {
  it('incluye los cortes que el propio producto declara', () => {
    const numbers = catalogReferenceNumbers();
    expect(numbers).toContain(45);
    expect(numbers).toContain(25);
    expect(numbers.length).toBeGreaterThan(20);
  });

  it('es estable entre llamadas', () => {
    expect(catalogReferenceNumbers()).toBe(catalogReferenceNumbers());
  });

  it('cubre los umbrales de veredicto de todos los usos', () => {
    const numbers = catalogReferenceNumbers();
    for (const use of TARGET_USES) {
      expect(numbers).toContain(70);
      expect(numbers, use).toContain(45);
    }
  });
});
