/**
 * Catálogo de los indicadores municipales del observatorio (`analytics.muni_indicator`).
 *
 * La tabla guarda filas crudas (indicador, periodo, valor). Lo que el usuario necesita ver
 * —etiqueta, unidad, cómo se calcula y si más es mejor— vive aquí, una sola vez, para que la
 * API, los informes y la interfaz cuenten lo mismo. Cada entrada nombra su fuente real: los
 * ocho de educación salen de «Estadísticas en Educación Básica por Municipio» del MEN
 * (datos.gov.co, `nudc-7mev`), y las fórmulas son las que declara el MEN, no una nuestra.
 *
 * Un indicador que no esté aquí se sirve igual, con su id como etiqueta y sin fórmula: no se
 * esconde, pero tampoco se inventa un texto.
 */
export interface MuniIndicatorDef {
  id: string;
  label: string;
  unit: string | null;
  /** Texto para «¿Cómo se calcula?», en lenguaje llano. */
  formula: string;
  /** Sentido del indicador, para ordenar rankings y colorear: true = más es mejor. */
  higherIsBetter: boolean | null;
  /** Fuente en una línea, para la ficha. */
  source: string;
}

const MEN = 'MEN, Estadísticas en Educación Básica por Municipio (datos.gov.co, nudc-7mev)';

export const MUNI_INDICATORS: readonly MuniIndicatorDef[] = [
  {
    id: 'school_age_population',
    label: 'Población de 5 a 16 años',
    unit: 'personas',
    formula:
      'Personas de 5 a 16 años en el municipio según la proyección de población que usa el MEN para el año del reporte.',
    higherIsBetter: null,
    source: MEN,
  },
  {
    id: 'education_enrollment_rate',
    label: 'Tasa de matriculación (5 a 16 años)',
    unit: '%',
    formula:
      'Estudiantes matriculados de 5 a 16 años dividido por la población de esa edad, por 100.',
    higherIsBetter: true,
    source: MEN,
  },
  {
    id: 'education_net_coverage',
    label: 'Cobertura neta',
    unit: '%',
    formula:
      'Estudiantes matriculados en el nivel que corresponde a su edad dividido por la población en edad de ese nivel, por 100. Puede superar 100 cuando la proyección de población queda corta.',
    higherIsBetter: true,
    source: MEN,
  },
  {
    id: 'education_gross_coverage',
    label: 'Cobertura bruta',
    unit: '%',
    formula:
      'Todos los matriculados de un nivel, tengan la edad que tengan, dividido por la población en edad de ese nivel, por 100.',
    higherIsBetter: true,
    source: MEN,
  },
  {
    id: 'education_dropout_rate',
    label: 'Deserción escolar',
    unit: '%',
    formula:
      'Estudiantes que abandonaron el sistema durante el año dividido por los matriculados al inicio, por 100. Menos es mejor.',
    higherIsBetter: false,
    source: MEN,
  },
  {
    id: 'education_pass_rate',
    label: 'Aprobación',
    unit: '%',
    formula: 'Estudiantes que aprobaron el año dividido por los que lo terminaron, por 100.',
    higherIsBetter: true,
    source: MEN,
  },
  {
    id: 'education_fail_rate',
    label: 'Reprobación',
    unit: '%',
    formula:
      'Estudiantes que reprobaron el año dividido por los que lo terminaron, por 100. Menos es mejor.',
    higherIsBetter: false,
    source: MEN,
  },
  {
    id: 'education_repetition_rate',
    label: 'Repitencia',
    unit: '%',
    formula:
      'Estudiantes que cursan de nuevo el mismo grado dividido por los matriculados, por 100. Menos es mejor.',
    higherIsBetter: false,
    source: MEN,
  },
];

export const MUNI_INDICATOR_BY_ID: Readonly<Record<string, MuniIndicatorDef>> = Object.fromEntries(
  MUNI_INDICATORS.map((d) => [d.id, d]),
);
