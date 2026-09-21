import { MESSAGES } from '@terracolombia/shared';
import { REPORT_KIND_TITLE, section, type ReportSection, type ReportSpec } from '../types.js';
import { renderSectionedReport } from './scaffold.js';

/** Informe de Cambio Territorial (M8): comparación entre dos cortes de la base catastral. */

export const CHANGE_REPORT_ASSET_KEYS = {
  maps: { before: 'cambio_antes', after: 'cambio_despues', diff: 'cambio_diferencias' },
  charts: { byType: 'cambio_por_tipo', timeline: 'cambio_linea_tiempo' },
} as const;

const DEFAULT_METHODOLOGY = [
  'La comparación se hace por Número Predial Nacional entre los dos cortes: un NPN que aparece es un alta, uno que desaparece es una baja, y uno presente en ambos se compara atributo a atributo.',
  'El cambio geométrico se detecta comparando las geometrías del mismo NPN: se marca cambio cuando el índice de superposición (intersección sobre unión) baja de 0,98.',
  'Una baja no equivale a una demolición ni a una venta: puede ser un englobe, un desenglobe, una corrección cartográfica o un ajuste administrativo del gestor catastral. Este informe describe el dato, no su causa.',
];

export function renderChangeReport(spec: Extract<ReportSpec, { kind: 'change' }>): string {
  const d = spec.data;
  const title = spec.titleOverride ?? REPORT_KIND_TITLE.change;
  const periodLabel = `${d.fromCutDate} → ${d.toCutDate}`;

  const sections: ReportSection[] = [
    section({
      id: 'resumen',
      title: 'Qué cambió entre los dos cortes',
      paragraphs: [
        `${d.scopeLabel}. Corte inicial: ${d.fromCutDate}. Corte final: ${d.toCutDate}.`,
        'Los cambios se detectan comparando snapshots completos de la base catastral. Todo lo que aparece aquí es verificable volviendo a los dos cortes citados en la sección de fuentes.',
      ],
      indicators: d.headline,
      tables: [d.byType],
      mapKeys: [CHANGE_REPORT_ASSET_KEYS.maps.diff],
      chartKeys: [CHANGE_REPORT_ASSET_KEYS.charts.byType],
    }),
    section({
      id: 'metodo',
      title: 'Cómo se detectaron los cambios',
      paragraphs: d.methodology.length > 0 ? d.methodology : DEFAULT_METHODOLOGY,
      chartKeys: [CHANGE_REPORT_ASSET_KEYS.charts.timeline],
    }),
    section({
      id: 'altas',
      title: 'Predios nuevos',
      tables: [d.createdParcels],
      levels: ['completo', 'tecnico'],
    }),
    section({
      id: 'bajas',
      title: 'Predios que dejaron de aparecer',
      tables: [d.removedParcels],
      levels: ['completo', 'tecnico'],
      paragraphs: [
        'Una baja puede corresponder a un englobe, un desenglobe o una corrección de la fuente. No asuma demolición ni cambio de propietario.',
      ],
    }),
    section({
      id: 'geometria',
      title: 'Cambios de geometría',
      tables: [d.geometryChanges],
      levels: ['completo', 'tecnico'],
    }),
    section({
      id: 'atributos',
      title: 'Cambios de atributos',
      tables: [d.attributeChanges],
      levels: ['completo', 'tecnico'],
    }),
    section({
      id: 'construcciones',
      title: 'Construcciones nuevas',
      tables: [d.newBuildings],
    }),
    section({
      id: 'indicadores',
      title: 'Indicadores de dinámica predial',
      indicators: d.indicators,
    }),
    ...d.extraSections,
  ];

  const hasCadastralValue = [
    d.createdParcels,
    d.removedParcels,
    d.attributeChanges,
    ...d.extraSections.flatMap((s) => s.tables),
  ].some((t) => t.hasCadastralValue === true);

  return renderSectionedReport({
    spec,
    title,
    subtitle: spec.subtitle ?? `${d.scopeLabel} · ${periodLabel}`,
    facts: [
      ['Ámbito', d.scopeLabel],
      ['Corte inicial', d.fromCutDate],
      ['Corte final', d.toCutDate],
      ['Fecha de corte de los datos', spec.meta.cutDate ?? MESSAGES.common.notAvailable],
    ],
    sections,
    runningRight: periodLabel,
    warnings: d.warnings,
    hasCadastralValue,
    extraDisclaimers: [
      'Un cambio entre cortes refleja lo que publicó el gestor catastral, no necesariamente un hecho ocurrido en terreno en esa fecha. Los procesos de actualización catastral se publican con rezago.',
    ],
  });
}
