import { MESSAGES, formatNumber, isAvailable } from '@terracolombia/shared';
import { REPORT_KIND_TITLE, section, type ReportSection, type ReportSpec } from '../types.js';
import { renderSectionedReport } from './scaffold.js';

/** Informe de Zona (M4): el tablero del analizador de zona, en papel. */

export const AREA_REPORT_ASSET_KEYS = {
  maps: { overview: 'zona_general', soils: 'zona_suelos', hazards: 'zona_amenazas' },
  charts: {
    landUse: 'zona_uso_suelo',
    population: 'zona_poblacion',
    parcelSizes: 'zona_tamano_predios',
  },
} as const;

export function renderAreaReport(spec: Extract<ReportSpec, { kind: 'area' }>): string {
  const d = spec.data;
  const title = spec.titleOverride ?? REPORT_KIND_TITLE.area;

  const municipalityList =
    d.municipalities.length > 0
      ? d.municipalities.map((m) => `${m.name} (${m.code})`).join(', ')
      : MESSAGES.common.notAvailable;

  const sections: ReportSection[] = [
    section({
      id: 'ambito',
      title: 'Ámbito analizado',
      paragraphs: [
        `${d.scopeLabel}. El área analizada mide ${formatNumber(d.areaKm2, 2)} km².`,
        `Municipios que intersecta: ${municipalityList}.`,
        'Los conteos se calculan sobre el snapshot activo de cada dataset. Las unidades que solo intersectan parcialmente el polígono se cuentan completas salvo que la tabla indique lo contrario.',
      ],
      indicators: d.headline,
      mapKeys: [AREA_REPORT_ASSET_KEYS.maps.overview],
      warnings: d.coverage.status === 'full' ? [] : [d.coverage.message ?? MESSAGES.coverage.partialBody],
    }),
    section({
      id: 'predios',
      title: 'Predios y usos del suelo',
      tables: [d.parcels, d.landUse],
      chartKeys: [AREA_REPORT_ASSET_KEYS.charts.landUse, AREA_REPORT_ASSET_KEYS.charts.parcelSizes],
    }),
    section({
      id: 'poblacion',
      title: 'Población',
      tables: [d.population],
      chartKeys: [AREA_REPORT_ASSET_KEYS.charts.population],
      paragraphs: [
        'La población se agrega por manzana o sección censal del Marco Geoestadístico Nacional que intersecta el ámbito. No es un conteo exacto de habitantes dentro del polígono.',
      ],
    }),
    section({
      id: 'equipamientos',
      title: 'Educación, salud y comercio',
      tables: [d.education, d.health, d.commerce],
    }),
    section({
      id: 'accesibilidad',
      title: 'Vías y accesibilidad',
      tables: [d.roads],
    }),
    section({
      id: 'suelos',
      title: 'Suelos, capacidad y vocación',
      tables: [d.soils],
      mapKeys: [AREA_REPORT_ASSET_KEYS.maps.soils],
    }),
    section({
      id: 'restricciones',
      title: 'Amenazas y restricciones',
      tables: [d.hazards, d.protectedAreas, d.ethnicTerritories],
      mapKeys: [AREA_REPORT_ASSET_KEYS.maps.hazards],
    }),
    section({
      id: 'ordenamiento',
      title: 'Ordenamiento territorial',
      tables: [d.potZones],
      paragraphs: [
        'No existe un repositorio nacional completo de POT. Donde no tenemos la cartografía integrada, la tabla lo dice y hay que consultar a Planeación municipal.',
      ],
    }),
    section({
      id: 'relieve',
      title: 'Relieve',
      tables: [d.relief],
    }),
    section({
      id: 'indicadores',
      title: 'Indicadores calculados',
      indicators: d.indicators,
      paragraphs: [
        'Cada indicador incluye su fórmula y las fuentes de las que sale. Son indicadores territoriales: no son avalúos ni conceptos jurídicos.',
      ],
    }),
    ...d.extraSections,
  ];

  const hasCadastralValue = [d.parcels, d.landUse, ...d.extraSections.flatMap((s) => s.tables)].some(
    (t) => t.hasCadastralValue === true,
  );

  return renderSectionedReport({
    spec,
    title,
    subtitle: spec.subtitle ?? d.title,
    facts: [
      ['Zona', d.title],
      ['Ámbito', d.scopeLabel],
      ['Área', `${formatNumber(d.areaKm2, 2)} km²`],
      ['Municipios', municipalityList],
      ['Fecha de corte de los datos', spec.meta.cutDate ?? MESSAGES.common.notAvailable],
      [
        'Cobertura catastral',
        d.municipalities.some((m) => m.isIgac === true)
          ? 'Total o parcial del IGAC'
          : isAvailable(d.coverage.cadastralManager)
            ? `Gestor: ${d.coverage.cadastralManager}`
            : MESSAGES.common.notAvailable,
      ],
    ],
    sections,
    runningRight: d.title,
    warnings: d.warnings,
    hasCadastralValue,
  });
}
