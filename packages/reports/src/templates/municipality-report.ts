import { MESSAGES, formatNumber, isAvailable } from '@terracolombia/shared';
import { REPORT_KIND_TITLE, section, type ReportSection, type ReportSpec } from '../types.js';
import { renderSectionedReport } from './scaffold.js';

/** Informe Municipal (M9): la ficha del observatorio, en papel. */

export const MUNICIPALITY_REPORT_ASSET_KEYS = {
  maps: { overview: 'municipio_general', h3: 'municipio_rejilla' },
  charts: {
    population: 'municipio_poblacion',
    cadastralSeries: 'municipio_serie_catastral',
    landUse: 'municipio_uso_suelo',
  },
} as const;

export function renderMunicipalityReport(
  spec: Extract<ReportSpec, { kind: 'municipality' }>,
): string {
  const d = spec.data;
  const m = d.municipality;
  const title = spec.titleOverride ?? REPORT_KIND_TITLE.municipality;

  const coverageParagraph = isAvailable(m.cadastralManager)
    ? `El gestor catastral de ${m.name} es ${m.cadastralManager}${m.isIgac === true ? ', que es el IGAC' : ', que no es el IGAC'}.`
    : `No tenemos registrado el gestor catastral de ${m.name}.`;

  const sections: ReportSection[] = [
    section({
      id: 'ficha',
      title: 'Ficha del municipio',
      paragraphs: [
        `${m.name} pertenece al departamento de ${m.deptName}. Código DIVIPOLA: ${m.code}.`,
        coverageParagraph,
        d.coverage.status === 'full'
          ? 'Tenemos la base catastral abierta de este municipio integrada.'
          : (d.coverage.message ?? MESSAGES.coverage.partialBody),
      ],
      indicators: d.headline,
      mapKeys: [MUNICIPALITY_REPORT_ASSET_KEYS.maps.overview],
      warnings: d.coverage.status === 'none' ? [MESSAGES.coverage.noneTitle] : [],
    }),
    section({
      id: 'poblacion',
      title: 'Población',
      tables: [d.population],
      chartKeys: [MUNICIPALITY_REPORT_ASSET_KEYS.charts.population],
    }),
    section({
      id: 'dinamica',
      title: 'Dinámica predial',
      tables: [d.cadastralDynamics, d.landUse],
      chartKeys: [
        MUNICIPALITY_REPORT_ASSET_KEYS.charts.cadastralSeries,
        MUNICIPALITY_REPORT_ASSET_KEYS.charts.landUse,
      ],
      paragraphs: [
        'La dinámica predial cuenta altas, bajas y cambios entre cortes publicados por el gestor catastral. Es un indicador de actividad administrativa, no una medida directa del mercado inmobiliario.',
      ],
    }),
    section({
      id: 'equipamientos',
      title: 'Educación y salud',
      tables: [d.education, d.health],
    }),
    section({
      id: 'series',
      title: 'Series de tiempo',
      tables: d.timeSeries,
      levels: ['completo', 'tecnico'],
    }),
    section({
      id: 'rankings',
      title: 'Comparación con municipios pares',
      tables: [d.rankings],
      paragraphs: [
        'Las comparaciones se hacen entre municipios con datos del mismo periodo. Un municipio sin datos no aparece en el ranking: su ausencia no significa un valor bajo.',
      ],
    }),
    section({
      id: 'indicadores',
      title: 'Indicadores calculados',
      indicators: d.indicators,
      mapKeys: [MUNICIPALITY_REPORT_ASSET_KEYS.maps.h3],
    }),
    ...d.extraSections,
  ];

  const hasCadastralValue = [
    d.cadastralDynamics,
    d.landUse,
    ...d.timeSeries,
    ...d.extraSections.flatMap((s) => s.tables),
  ].some((t) => t.hasCadastralValue === true);

  return renderSectionedReport({
    spec,
    title,
    subtitle: spec.subtitle ?? `${m.name}, ${m.deptName}`,
    facts: [
      ['Municipio', `${m.name} (${m.code})`],
      ['Departamento', `${m.deptName} (${m.deptCode})`],
      [
        'Gestor catastral',
        isAvailable(m.cadastralManager) ? m.cadastralManager : MESSAGES.common.notAvailable,
      ],
      [
        'Población',
        isAvailable(m.populationTotal) ? formatNumber(m.populationTotal) : MESSAGES.common.notAvailable,
      ],
      [
        'Área',
        isAvailable(m.areaKm2) ? `${formatNumber(m.areaKm2, 1)} km²` : MESSAGES.common.notAvailable,
      ],
      ['Fecha de corte de los datos', spec.meta.cutDate ?? MESSAGES.common.notAvailable],
    ],
    sections,
    runningRight: `${m.name} (${m.code})`,
    warnings: d.warnings,
    hasCadastralValue,
  });
}
