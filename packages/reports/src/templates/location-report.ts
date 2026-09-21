import { MESSAGES, formatNumber } from '@terracolombia/shared';
import { describeResolution } from '@terracolombia/geo';
import {
  REPORT_KIND_TITLE,
  section,
  type ReportSection,
  type ReportSpec,
  type ReportTable,
} from '../types.js';
import { renderSectionedReport } from './scaffold.js';

/** Informe de Localización de Negocio (M6): "¿Dónde abro mi X?". */

export const LOCATION_REPORT_ASSET_KEYS = {
  maps: { heatmap: 'localizacion_mapa_calor', topCells: 'localizacion_top_celdas' },
  charts: { factors: 'localizacion_factores', weights: 'localizacion_pesos' },
} as const;

function weightsTable(spec: Extract<ReportSpec, { kind: 'location' }>): ReportTable {
  const d = spec.data;
  return {
    id: 'pesos',
    title: 'Pesos e indicadores con los que se corrió el análisis',
    columns: [
      { key: 'label', label: 'Indicador', width: 34 },
      { key: 'weight', label: 'Peso', align: 'right', numFmt: '0.0%', width: 10 },
      { key: 'direction', label: 'Dirección', width: 20 },
      { key: 'formula', label: 'Fórmula', width: 44 },
      { key: 'sources', label: 'Fuentes', width: 30 },
    ],
    rows: d.weights.map((w) => ({
      label: w.label,
      weight: `${formatNumber(w.weight * 100, 1)} %`,
      direction:
        w.direction === 'higher_is_better'
          ? 'Más es mejor'
          : w.direction === 'lower_is_better'
            ? 'Menos es mejor'
            : 'Categórico',
      formula: w.formula,
      sources: w.sourceDatasetIds.join(', ') || MESSAGES.common.notAvailable,
    })),
    emptyMessage: 'La plantilla no declaró pesos, lo que no debería ocurrir.',
    sourceDatasetIds: d.weights.flatMap((w) => w.sourceDatasetIds),
  };
}

function factorsTable(spec: Extract<ReportSpec, { kind: 'location' }>): ReportTable {
  const d = spec.data;
  return {
    id: 'factores_celda_lider',
    title: 'Desglose por factor de la celda mejor puntuada',
    columns: [
      { key: 'label', label: 'Factor', width: 34 },
      { key: 'raw', label: 'Valor', align: 'right', width: 16 },
      { key: 'score', label: 'Puntaje 0–100', align: 'right', numFmt: '#,##0', width: 14 },
      { key: 'weight', label: 'Peso', align: 'right', width: 10 },
      { key: 'why', label: 'Explicación', width: 54 },
    ],
    rows: d.leadingCellFactors.map((f) => ({
      label: f.label,
      raw: f.rawValue === null ? null : `${f.rawValue}${f.unit && f.unit !== 'NO_DISPONIBLE' ? ` ${f.unit}` : ''}`,
      score: f.score,
      weight: `${formatNumber(f.weight * 100, 0)} %`,
      why: f.explanation,
    })),
    emptyMessage: 'No hay desglose por factor para la celda líder.',
    sourceDatasetIds: d.leadingCellFactors.flatMap((f) => f.sourceDatasetIds),
  };
}

export function renderLocationReport(spec: Extract<ReportSpec, { kind: 'location' }>): string {
  const d = spec.data;
  const title = spec.titleOverride ?? REPORT_KIND_TITLE.location;

  const sections: ReportSection[] = [
    section({
      id: 'planteamiento',
      title: 'Qué se analizó',
      paragraphs: [
        `Plantilla de negocio: ${d.templateLabel}. Ámbito: ${d.scopeLabel}.`,
        `La puntuación se calcula por celda de la rejilla H3 en resolución ${d.h3Resolution} (${describeResolution(d.h3Resolution)}), de modo que todas las zonas se comparan con el mismo tamaño.`,
        'TerraColombia no elige el sitio. Combina indicadores con los pesos que usted fijó y muestra el desglose para que pueda cambiarlos y volver a correr el análisis.',
      ],
      indicators: d.headline,
      mapKeys: [LOCATION_REPORT_ASSET_KEYS.maps.heatmap],
    }),
    section({
      id: 'metodo',
      title: 'Método, pesos y umbrales',
      paragraphs: d.methodology,
      tables: [weightsTable(spec), d.thresholds],
      chartKeys: [LOCATION_REPORT_ASSET_KEYS.charts.weights],
    }),
    section({
      id: 'resultados',
      title: 'Zonas mejor puntuadas',
      tables: [d.topCells],
      mapKeys: [LOCATION_REPORT_ASSET_KEYS.maps.topCells],
    }),
    section({
      id: 'explicabilidad',
      title: 'Desglose por factor',
      tables: [factorsTable(spec)],
      chartKeys: [LOCATION_REPORT_ASSET_KEYS.charts.factors],
      paragraphs: [
        'El puntaje compuesto nunca se publica solo: cada factor muestra su valor crudo, su puntaje normalizado, su peso y su fórmula.',
      ],
    }),
    section({
      id: 'candidatos',
      title: 'Predios candidatos dentro de las zonas líderes',
      tables: [d.candidateParcels],
      paragraphs: [
        'Los predios se listan por sus características territoriales. Que un predio aparezca aquí no significa que esté en venta ni que sea apto legalmente: verifique con Planeación municipal y con un estudio de títulos.',
      ],
      levels: ['completo', 'tecnico'],
    }),
    section({
      id: 'indicadores',
      title: 'Indicadores calculados',
      indicators: d.indicators,
    }),
    ...d.extraSections,
  ];

  const hasCadastralValue = [d.candidateParcels, ...d.extraSections.flatMap((s) => s.tables)].some(
    (t) => t.hasCadastralValue === true,
  );

  return renderSectionedReport({
    spec,
    title,
    subtitle: spec.subtitle ?? d.templateLabel,
    facts: [
      ['Plantilla', d.templateLabel],
      ['Ámbito', d.scopeLabel],
      ['Resolución de la rejilla', `H3 ${d.h3Resolution} — ${describeResolution(d.h3Resolution)}`],
      ['Celdas evaluadas', formatNumber(d.topCells.rows.length)],
      ['Fecha de corte de los datos', spec.meta.cutDate ?? MESSAGES.common.notAvailable],
    ],
    sections,
    runningRight: d.templateLabel,
    warnings: d.warnings,
    hasCadastralValue,
    extraDisclaimers: [
      'Este análisis de localización es una herramienta de apoyo a la decisión construida con datos abiertos. No incorpora información de ventas, tráfico peatonal medido, competencia real ni costos de arriendo, salvo que la sección correspondiente lo diga expresamente.',
    ],
  });
}
