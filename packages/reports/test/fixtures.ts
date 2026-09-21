import { LICENSES, buildMeta, type SourceRef } from '@terracolombia/shared';
import {
  emptyTable,
  type ParcelReportData,
  type ReportSpec,
  type ReportTable,
  type ReportVerification,
} from '../src/types.js';

/**
 * Datos de prueba. **No son datos reales del IGAC**: son un predio inventado para ejercitar
 * las plantillas, y todas las fuentes van marcadas `synthetic: true`, igual que haría el
 * snapshot de demostración (ADR-006). Nunca se usan para verificar cifras, solo estructura.
 */

export const SOURCES: SourceRef[] = [
  {
    datasetId: 'igac-catastro-terreno',
    source: 'IGAC',
    name: 'Base Catastral Pública — capa R_TERRENO/U_TERRENO',
    cutDate: '2026-07-31',
    license: LICENSES.CC_BY_SA_4.id,
    attribution: 'Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0',
    url: 'https://www.datos.gov.co/',
    synthetic: true,
  },
  {
    datasetId: 'igac-catastro-construccion',
    source: 'IGAC',
    name: 'Base Catastral Pública — capa U_CONSTRUCCION',
    cutDate: '2026-07-31',
    license: LICENSES.CC_BY_SA_4.id,
    attribution: 'Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0',
    url: null,
    synthetic: true,
  },
  {
    datasetId: 'dane-mgn-manzanas',
    source: 'DANE',
    name: 'Marco Geoestadístico Nacional — manzanas censales',
    cutDate: '2024-12-31',
    license: LICENSES.GOV_CO_OPEN.id,
    attribution: 'Fuente: DANE, MGN 2024',
    url: 'https://geoportal.dane.gov.co/',
    synthetic: true,
  },
  {
    datasetId: 'osm-colombia-vias',
    source: 'OpenStreetMap',
    name: 'Extracto de Colombia — vías',
    cutDate: '2026-08-01',
    license: LICENSES.ODBL.id,
    attribution: '© Colaboradores de OpenStreetMap, ODbL 1.0',
    url: 'https://download.geofabrik.de/south-america/colombia.html',
    synthetic: true,
  },
];

export const VERIFICATION: ReportVerification = {
  reportId: 'rep_01JQZX8K4T2M3N4P5Q6R7S8T9V',
  verifyUrl: 'https://terracolombia.co/verificar/01JQZX8K4T2M3N4P5Q6R7S8T9V',
  issuedAt: '2026-09-21T14:30:00.000Z',
  checksum: 'b8f1c2d3e4a5960718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f',
  snapshotIds: {
    'igac-catastro-terreno': 'snap_igac_2026_07',
    'igac-catastro-construccion': 'snap_igac_2026_07',
    'dane-mgn-manzanas': 'snap_dane_2024_12',
    'osm-colombia-vias': 'snap_osm_2026_08',
  },
};

function table(id: string, title: string, sourceDatasetIds: string[], shareAlike: boolean): ReportTable {
  return {
    id,
    title,
    columns: [
      { key: 'concept', label: 'Concepto', width: 30 },
      { key: 'value', label: 'Valor', align: 'right', numFmt: '#,##0', width: 16 },
    ],
    rows: [
      { concept: 'Primera fila', value: 1234 },
      { concept: 'Segunda fila', value: 5678 },
    ],
    sourceDatasetIds,
    shareAlike,
  };
}

export function parcelData(overrides: Partial<ParcelReportData> = {}): ParcelReportData {
  const base: ParcelReportData = {
    parcel: {
      npn: '080010102000000010001000000000',
      npnOld: '08001010200000001000',
      muniCode: '08001',
      muniName: 'Barranquilla',
      deptCode: '08',
      deptName: 'Atlántico',
      zone: '01',
      zoneLabel: 'Urbano',
      address: 'CL 72 # 41-20',
      areaGeomM2: 812.5,
      areaReportedM2: 800,
      builtAreaM2: 340,
      economicUse: 'Habitacional',
      cadastralValue: 285_000_000,
      valuationYear: 2026,
      centroid: [-74.7964, 10.9878],
    },
    parcelGeometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-74.7968, 10.9875],
          [-74.796, 10.9875],
          [-74.796, 10.9881],
          [-74.7968, 10.9881],
          [-74.7968, 10.9875],
        ],
      ],
    },
    parcelBBox: [-74.7968, 10.9875, -74.796, 10.9881],
    buildings: [
      { id: 'C-1', floors: 2, builtAreaM2: 240, use: 'Residencial', attrs: {} },
      { id: 'C-2', floors: 1, builtAreaM2: 100, use: 'Depósito', attrs: {} },
    ],
    context: {
      radiusM: 800,
      population: {
        total: 6420,
        households: 1830,
        dwellings: 1910,
        schoolAge: 1210,
        ageBands: { '0-4': 420, '5-17': 1210, '18-59': 3890, '60+': 900 },
      },
      schools: [
        {
          layer: 'school',
          id: 's1',
          name: 'Colegio de prueba <script>',
          category: 'Oficial',
          distanceM: 240,
          centroid: [-74.795, 10.988],
          attrs: {},
        },
      ],
      healthFacilities: [
        {
          layer: 'health_facility',
          id: 'h1',
          name: 'IPS de prueba',
          category: 'Nivel 1',
          distanceM: 610,
          centroid: [-74.798, 10.989],
          attrs: {},
        },
      ],
      pois: [
        {
          layer: 'poi',
          id: 'p1',
          name: 'Supermercado',
          category: 'comercio',
          distanceM: 120,
          centroid: [-74.7965, 10.9882],
          attrs: {},
        },
      ],
      roads: [
        {
          layer: 'road',
          id: 'r1',
          name: 'Calle 72',
          category: 'secondary',
          distanceM: 35,
          centroid: [-74.7966, 10.9879],
          attrs: {},
        },
      ],
      soils: [
        {
          kind: 'capacidad_uso',
          code: '3s',
          label: 'Clase 3 con limitaciones por salinidad',
          overlapPct: 100,
          attrs: {},
        },
      ],
      hazards: [
        { kind: 'inundacion', level: 'media', source: 'IDEAM', overlapPct: 22.4 },
      ],
      protectedAreas: [],
      ethnicTerritories: [],
      potZones: [
        {
          classification: 'Suelo urbano',
          use: 'Residencial mixto',
          sourceDoc: 'Decreto 0212 de 2014',
          overlapPct: 100,
        },
      ],
      relief: { elevationMeanM: 12, slopeMeanPct: 2.1 },
    },
    municipality: {
      code: '08001',
      name: 'Barranquilla',
      deptCode: '08',
      deptName: 'Atlántico',
      cadastralManager: 'Alcaldía de Barranquilla (gestor catastral habilitado)',
      isIgac: false,
      populationTotal: 1_312_000,
      areaKm2: 154,
      centroid: [-74.8, 10.98],
    },
    coverage: {
      muniCode: '08001',
      cadastralManager: 'Alcaldía de Barranquilla',
      isIgac: false,
      status: 'partial',
      availableLayers: ['población', 'colegios', 'suelos', 'vías'],
      message: null,
    },
    hydrography: emptyTable(
      'hidrografia',
      'Hidrografía cercana',
      'No tenemos la capa de hidrografía integrada para este municipio.',
      ['igac-carto-hidrografia'],
    ),
    suitability: [
      {
        targetUse: 'vivienda_unifamiliar',
        targetUseLabel: 'Vivienda unifamiliar',
        score: 72,
        verdict: 'condicionado',
        verdictLabel: 'Favorable con condiciones',
        factors: [
          {
            indicator: 'pendiente',
            label: 'Pendiente del terreno',
            score: 95,
            rawValue: 2.1,
            unit: '%',
            weight: 0.25,
            direction: 'lower_is_better',
            formula: '100 − min(100, pendiente_media_pct × 2)',
            sourceDatasetIds: ['copernicus-dem-30'],
            explanation: 'El terreno es casi plano, así que construir no exige movimientos de tierra.',
            flag: 'ok',
          },
          {
            indicator: 'amenaza_inundacion',
            label: 'Amenaza de inundación',
            score: 35,
            rawValue: 'media',
            unit: null,
            weight: 0.35,
            direction: 'categorical',
            formula: 'mapa de nivel de amenaza a puntaje: baja=100, media=35, alta=0',
            sourceDatasetIds: ['ideam-inundaciones'],
            explanation:
              'El 22 % del predio queda en zona de amenaza media de inundación según la capa nacional.',
            flag: 'caution',
          },
        ],
        blockers: [],
        cautions: ['Amenaza media de inundación en parte del predio'],
        missing: ['Estudio de detalle de amenaza a escala municipal'],
        disclaimer:
          'Este semáforo es un indicador territorial, no un concepto técnico ni un avalúo. No reemplaza los estudios exigidos para licencias.',
      },
    ],
    history: [
      {
        cutDate: '2026-07-31',
        changeType: 'attrs_changed',
        changeLabel: 'Cambio de atributos',
        detail: 'El área construida pasó de 300 m² a 340 m².',
      },
    ],
    planningNote: 'Suelo urbano según el POT vigente (Decreto 0212 de 2014).',
    miningTitles: emptyTable(
      'titulos_mineros',
      'Títulos mineros',
      'No tenemos la capa de títulos mineros integrada.',
      ['anm-titulos-mineros'],
    ),
    indicators: [
      {
        id: 'accesibilidad_vial',
        label: 'Accesibilidad vial',
        value: '88',
        rawValue: 88,
        unit: 'puntos',
        formula: '100 − min(100, distancia_a_via_primaria_m / 10)',
        explanation: 'Mide qué tan cerca está el predio de la malla vial principal.',
        sourceDatasetIds: ['osm-colombia-vias'],
        flag: 'ok',
        own: true,
      },
    ],
    annexes: [
      {
        id: 'anexo_r1',
        title: 'Anexo A1 — Registro 1 del catastro, tal como llega',
        description:
          'Campos del registro alfanumérico sin transformar, con los nombres originales de la fuente.',
        table: table('anexo_r1', 'Registro 1 del catastro', ['igac-catastro-terreno'], true),
      },
    ],
    warnings: ['El área medida difiere del área declarada en más de 1 %.'],
  };
  return { ...base, ...overrides };
}

export function parcelSpec(overrides: Partial<ReportSpec> = {}): Extract<ReportSpec, { kind: 'parcel' }> {
  return {
    kind: 'parcel',
    level: 'completo',
    data: parcelData(),
    verification: VERIFICATION,
    meta: buildMeta(SOURCES, { warnings: ['El snapshot del POT municipal tiene más de 12 meses.'] }),
    ...overrides,
  } as Extract<ReportSpec, { kind: 'parcel' }>;
}

export function municipalitySpec(): Extract<ReportSpec, { kind: 'municipality' }> {
  return {
    kind: 'municipality',
    level: 'completo',
    verification: VERIFICATION,
    meta: buildMeta(SOURCES),
    data: {
      municipality: parcelData().municipality,
      coverage: parcelData().coverage,
      geometry: null,
      bbox: null,
      headline: parcelData().indicators,
      timeSeries: [table('serie_predios', 'Predios por corte', ['igac-catastro-terreno'], true)],
      rankings: table('ranking', 'Posición frente a municipios pares', ['dane-mgn-manzanas'], false),
      cadastralDynamics: table('dinamica', 'Dinámica predial', ['igac-catastro-terreno'], true),
      landUse: table('uso_suelo', 'Usos del suelo', ['igac-catastro-terreno'], true),
      population: table('poblacion', 'Población', ['dane-mgn-manzanas'], false),
      education: table('educacion', 'Educación', ['men-establecimientos-educativos'], false),
      health: table('salud', 'Salud', ['minsalud-reps'], false),
      indicators: parcelData().indicators,
      extraSections: [],
      annexes: [],
      warnings: [],
    },
  };
}
