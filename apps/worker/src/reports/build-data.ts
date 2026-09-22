import {
  DISCLAIMERS,
  MESSAGES,
  NOT_AVAILABLE,
  ZONE_LABEL,
  buildMeta,
  formatArea,
  formatCop,
  formatDistance,
  formatNumber,
} from '@terracolombia/shared';
import type { Coverage, SourceRef } from '@terracolombia/shared';
import {
  agriculturalFrontierOverlap,
  distanceToMuniSeat,
  ethnicTerritoryOverlaps,
  facilitiesIn,
  findParcelByLegacyNpn,
  getCoverage,
  getMunicipality,
  getMuniSummary,
  getParcel,
  getParcelBuildings,
  getParcelGeoJson,
  getParcelHomogeneousZones,
  hazardOverlaps,
  insideUrbanPerimeter,
  miningTitleOverlaps,
  nearby,
  parcelHistory,
  parcelStatsIn,
  populationIn,
  potZoneOverlaps,
  protectedAreaOverlaps,
  reliefFor,
  roadAccess,
  soilOverlaps,
  cadastreDatasetIdsFor,
} from '@terracolombia/db';
import { approxAreaKm2, explainNpn, geometryBBox, radiusToPolygon } from '@terracolombia/geo';
import type {
  MunicipalityBrief,
  ParcelReportData,
  ReportIndicator,
  ReportSpec,
  ReportTable,
} from '@terracolombia/reports';

/**
 * Traduce lo que hay en la base al `ReportSpec` que consume `@terracolombia/reports`.
 *
 * Dos reglas que se aplican en cada tabla:
 *  - `sourceDatasetIds` siempre lleno: sin procedencia no se imprime la cifra.
 *  - `emptyMessage` siempre presente: una tabla vacía dice por qué está vacía, no se calla.
 */

export interface BuiltReport {
  spec: ReportSpec;
  /** Datasets citados, para congelar los cortes en `app.report.source_snapshots`. */
  datasetIds: string[];
  /** Secciones que se guardan en `app.report_section` para consultar sin abrir el PDF. */
  sections: Array<{ key: string; title: string; payload: Record<string, unknown>; isMissing: boolean }>;
  synthetic: boolean;
  geometry: unknown | null;
}

/**
 * Respaldo cuando el ámbito no tiene ningún corte catastral cargado.
 *
 * Los identificadores reales del catastro son por departamento
 * (`igac-cadastre-08`, `igac-cadastre-25`, …) y se resuelven en cada informe con
 * `cadastreDatasetIdsFor`, contra los cortes que de verdad tienen predios en el
 * ámbito. Una lista fija aquí haría que el informe de un predio real de Baranoa
 * citara el corte de demostración de Soledad, que es lo que pasaba antes.
 */
const CADASTRE_DATASETS_FALLBACK = ['demo-cadastre'];

/** Cortes catastrales que respaldan este ámbito, con respaldo si no hay ninguno. */
async function cadastreDatasetsFor(scope: {
  muniCode?: string | null;
  deptCode?: string | null;
}): Promise<string[]> {
  const ids = await cadastreDatasetIdsFor(scope);
  return ids.length > 0 ? ids : CADASTRE_DATASETS_FALLBACK;
}
const ADMIN_DATASETS = ['dane-divipola', 'dane-mgn'];

function table(
  id: string,
  title: string,
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' | 'center'; numFmt?: string; width?: number }>,
  rows: Array<Record<string, unknown>>,
  opts: {
    sourceDatasetIds: string[];
    emptyMessage: string;
    note?: string | null;
    shareAlike?: boolean;
    hasCadastralValue?: boolean;
  },
): ReportTable {
  return {
    id,
    title,
    columns,
    rows: rows as never,
    note: opts.note ?? null,
    sourceDatasetIds: opts.sourceDatasetIds,
    emptyMessage: opts.emptyMessage,
    shareAlike: opts.shareAlike ?? false,
    hasCadastralValue: opts.hasCadastralValue ?? false,
  };
}

function indicator(
  id: string,
  label: string,
  rawValue: number | string | null,
  unit: string | null,
  formula: string,
  explanation: string,
  sourceDatasetIds: string[],
  opts: { flag?: ReportIndicator['flag']; own?: boolean; format?: 'number' | 'area' | 'distance' | 'currency' } = {},
): ReportIndicator {
  let value: string;
  if (rawValue === null) {
    value = MESSAGES.common.notAvailable;
  } else if (typeof rawValue === 'string') {
    value = rawValue;
  } else {
    switch (opts.format) {
      case 'area':
        value = formatArea(rawValue);
        break;
      case 'distance':
        value = formatDistance(rawValue);
        break;
      case 'currency':
        value = formatCop(rawValue);
        break;
      default:
        value = `${formatNumber(rawValue, Number.isInteger(rawValue) ? 0 : 1)}${unit ? ` ${unit}` : ''}`;
    }
  }
  return {
    id,
    label,
    value,
    rawValue,
    unit,
    formula,
    explanation,
    sourceDatasetIds,
    flag: opts.flag ?? (rawValue === null ? 'unknown' : 'ok'),
    own: opts.own ?? false,
  };
}

export async function buildReport(
  kind: string,
  level: 'resumen' | 'completo' | 'tecnico',
  subject: Record<string, unknown>,
  verification: {
    reportId: string;
    verifyUrl: string;
    issuedAt: string;
    titleOverride?: string | null;
    requestedBy?: string | null;
  },
  sources: SourceRef[],
): Promise<BuiltReport> {
  switch (kind) {
    case 'parcel':
      return buildParcelReport(level, subject, verification, sources);
    case 'municipality':
      return buildMunicipalityReport(level, subject, verification, sources);
    case 'area':
      return buildAreaReport(level, subject, verification, sources);
    default:
      throw new Error(
        `Todavía no está implementado el informe de tipo "${kind}". Disponibles: parcel, area, municipality.`,
      );
  }
}

// ─── Informe Territorial de Predio (M7) ───────────────────────────────────────

async function buildParcelReport(
  level: 'resumen' | 'completo' | 'tecnico',
  subject: Record<string, unknown>,
  verification: Parameters<typeof buildReport>[3],
  sources: SourceRef[],
): Promise<BuiltReport> {
  const raw = String(subject.npn ?? '').replace(/\D/g, '');
  if (raw.length === 20) {
    // El código anterior no se convierte (no es prefijo del de 30): se resuelve por npn_old.
    const matches = await findParcelByLegacyNpn(raw);
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `El código predial anterior ${raw} no aparece en el campo que publica la fuente. ` +
            'Pide el informe con el código de 30 dígitos.'
          : `El código anterior ${raw} corresponde a ${matches.length} predios del formato nuevo. ` +
            'Indica cuál con su código de 30 dígitos.',
      );
    }
    subject = { ...subject, npn: matches[0]!.npn };
  }
  const npn = raw.length === 20 ? String(subject.npn) : raw;
  const parcel = await getParcel(npn);
  if (!parcel) {
    throw new Error(
      `No hay un predio con el código ${npn} en los cortes cargados. No se puede emitir el informe.`,
    );
  }

  const CADASTRE_DATASETS = await cadastreDatasetsFor({ muniCode: parcel.muni_code });

  const geometry = (await getParcelGeoJson(npn)) as never;
  const center: [number, number] | null =
    parcel.lng !== null && parcel.lat !== null ? [parcel.lng, parcel.lat] : null;
  const muniCode = parcel.muni_code;
  const radiusM = 1500;
  const envelope = center ? radiusToPolygon(center, radiusM) : null;

  const [
    buildings,
    homogeneousZones,
    soils,
    hazards,
    protectedAreas,
    ethnic,
    pot,
    mining,
    frontier,
    relief,
    urban,
    access,
    distSeat,
    population,
    facilities,
    near,
    history,
    coverage,
    muni,
  ] = await Promise.all([
    getParcelBuildings(npn),
    getParcelHomogeneousZones(npn),
    geometry ? soilOverlaps(geometry) : [],
    geometry ? hazardOverlaps(geometry) : [],
    geometry ? protectedAreaOverlaps(geometry) : [],
    geometry ? ethnicTerritoryOverlaps(geometry) : [],
    geometry ? potZoneOverlaps(geometry, muniCode) : [],
    geometry ? miningTitleOverlaps(geometry) : [],
    geometry ? agriculturalFrontierOverlap(geometry) : [],
    geometry ? reliefFor(geometry) : null,
    geometry ? insideUrbanPerimeter(geometry, muniCode) : null,
    center ? roadAccess(center[0], center[1]) : null,
    center ? distanceToMuniSeat(center[0], center[1], muniCode) : null,
    envelope ? populationIn(envelope as never) : null,
    envelope ? facilitiesIn(envelope as never) : null,
    center ? nearby(center[0], center[1], radiusM, [], 10) : [],
    parcelHistory(npn),
    getCoverage(muniCode),
    getMunicipality(muniCode),
  ]);

  const municipality: MunicipalityBrief = {
    code: muniCode,
    name: parcel.muni_name,
    deptCode: parcel.dept_code,
    deptName: parcel.dept_name,
    cadastralManager: coverage.cadastralManager ?? NOT_AVAILABLE,
    isIgac: coverage.isIgac,
    populationTotal: muni?.population ?? NOT_AVAILABLE,
    areaKm2: muni?.area_km2 ?? NOT_AVAILABLE,
    centroid: muni?.lng != null && muni.lat != null ? [muni.lng, muni.lat] : null,
  };

  const warnings: string[] = [];
  if (parcel.is_synthetic) {
    warnings.push(
      'Este informe se basa en un corte de DEMOSTRACIÓN con datos sintéticos. No corresponde a ningún predio real y no sirve para decidir.',
    );
  }
  if (!geometry) {
    warnings.push(
      'El predio no tiene geometría en el corte cargado: el mapa y todos los cruces espaciales no están disponibles.',
    );
  }
  if (parcel.area_geom_m2 !== null && parcel.area_reported_m2 !== null && parcel.area_reported_m2 > 0) {
    const diffPct = ((parcel.area_geom_m2 - parcel.area_reported_m2) / parcel.area_reported_m2) * 100;
    if (Math.abs(diffPct) > 10) {
      warnings.push(
        `El área del polígono (${formatArea(parcel.area_geom_m2)}) y la que reporta el registro catastral ` +
          `(${formatArea(parcel.area_reported_m2)}) difieren en ${diffPct.toFixed(1)} %. Ninguna sustituye un levantamiento topográfico.`,
      );
    }
  }
  if (pot.length === 0) {
    warnings.push(
      'No tenemos la zonificación del POT de este municipio. Los usos permitidos los define la Secretaría de Planeación municipal.',
    );
  }
  if (hazards.length === 0) {
    warnings.push(
      'No hay capas de amenaza cargadas que cubran este predio. Que no aparezcan no significa que no existan.',
    );
  }

  const indicators: ReportIndicator[] = [
    indicator(
      'area_geom',
      'Área del polígono',
      parcel.area_geom_m2,
      'm²',
      'Área de la geometría calculada en EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional).',
      'Es el área que resulta de medir el polígono del predio tal como lo publica el catastro.',
      CADASTRE_DATASETS,
      { format: 'area' },
    ),
    indicator(
      'area_reported',
      'Área registrada en el catastro',
      parcel.area_reported_m2,
      'm²',
      'Valor que reporta el registro alfanumérico del catastro.',
      'Puede diferir del área del polígono. Ninguna de las dos sustituye un levantamiento topográfico.',
      CADASTRE_DATASETS,
      { format: 'area' },
    ),
    indicator(
      'built_area',
      'Área construida',
      parcel.built_area_m2,
      'm²',
      'Suma del área construida que reporta el catastro para el predio.',
      'Es lo que el catastro tiene registrado como construido. Puede estar desactualizado frente a lo que hay en campo.',
      CADASTRE_DATASETS,
      { format: 'area' },
    ),
    indicator(
      'cadastral_value',
      'Avalúo catastral',
      parcel.cadastral_value,
      'COP',
      'Avalúo catastral vigente según el último corte publicado.',
      DISCLAIMERS.notAppraisal,
      CADASTRE_DATASETS,
      { format: 'currency', flag: 'caution' },
    ),
    indicator(
      'slope',
      'Pendiente media del terreno',
      relief?.slope_mean_pct ?? null,
      '%',
      'Media de la pendiente de las celdas del modelo digital de elevación que cubren el predio.',
      'Una pendiente del 10 % sube 10 metros por cada 100 de recorrido horizontal. Por encima de 25 % construir encarece; por encima de 45 % suele haber restricción ambiental.',
      ['copernicus-dem'],
      {
        own: true,
        flag:
          relief?.slope_mean_pct == null
            ? 'unknown'
            : relief.slope_mean_pct > 45
              ? 'blocker'
              : relief.slope_mean_pct > 25
                ? 'caution'
                : 'ok',
      },
    ),
    indicator(
      'dist_paved',
      'Distancia a vía pavimentada',
      access?.dist_paved_m ?? null,
      'm',
      'Distancia en línea recta del centro del predio a la vía pavimentada más cercana de OpenStreetMap.',
      'Es distancia en línea recta, no de recorrido: el acceso real puede ser mayor.',
      ['osm-vias-colombia'],
      { own: true, format: 'distance' },
    ),
    indicator(
      'dist_seat',
      'Distancia a la cabecera municipal',
      distSeat,
      'm',
      'Distancia en línea recta del predio al punto de la cabecera municipal.',
      'Orienta sobre qué tan alejado está el predio del casco urbano principal.',
      ADMIN_DATASETS,
      { own: true, format: 'distance' },
    ),
    indicator(
      'population_1500',
      `Población en ${formatDistance(radiusM)} a la redonda`,
      population?.pop_total ?? null,
      'personas',
      'Suma de la población de cada manzana censal del DANE en proporción al área que cae dentro del radio.',
      'Es una estimación por reparto de área, porque el censo publica agregados por manzana y no puntos.',
      ['dane-cnpv', 'dane-mgn'],
      { own: true },
    ),
  ];

  const buildingsTable = table(
    'construcciones',
    'Construcciones registradas',
    [
      { key: 'ref', label: 'Identificador', align: 'left', width: 16 },
      { key: 'floors', label: 'Pisos', align: 'right', numFmt: '#,##0', width: 10 },
      { key: 'builtAreaM2', label: 'Área construida (m²)', align: 'right', numFmt: '#,##0.00', width: 20 },
      { key: 'use', label: 'Uso', align: 'left', width: 24 },
      { key: 'builtYear', label: 'Año', align: 'right', numFmt: '#,##0', width: 10 },
    ],
    buildings.map((b) => ({
      ref: b.building_ref ?? NOT_AVAILABLE,
      floors: b.floors ?? NOT_AVAILABLE,
      builtAreaM2: b.built_area_m2 ?? NOT_AVAILABLE,
      use: b.use ?? NOT_AVAILABLE,
      builtYear: b.built_year ?? NOT_AVAILABLE,
    })),
    {
      sourceDatasetIds: CADASTRE_DATASETS,
      emptyMessage: MESSAGES.parcel.noBuildings,
      shareAlike: true,
    },
  );

  const hydrography = table(
    'hidrografia',
    'Hidrografía y relieve cercanos',
    [
      { key: 'elemento', label: 'Elemento', align: 'left', width: 30 },
      { key: 'valor', label: 'Valor', align: 'right', width: 20 },
    ],
    reliefRows(relief),
    {
      sourceDatasetIds: ['copernicus-dem'],
      emptyMessage:
        'No hay modelo digital de elevación cargado para esta zona, así que no podemos reportar altitud ni pendiente. La hidrografía se integrará con la cartografía básica del IGAC.',
    },
  );

  const miningTable = table(
    'titulos_mineros',
    'Títulos mineros que se solapan con el predio',
    [
      { key: 'title_code', label: 'Título', align: 'left', width: 16 },
      { key: 'stage', label: 'Etapa', align: 'left', width: 20 },
      { key: 'mineral', label: 'Mineral', align: 'left', width: 20 },
      { key: 'overlap_pct', label: 'Solape (%)', align: 'right', numFmt: '#,##0.0', width: 12 },
    ],
    mining.map((m) => ({
      title_code: m.title_code ?? NOT_AVAILABLE,
      stage: m.stage ?? NOT_AVAILABLE,
      mineral: m.mineral ?? NOT_AVAILABLE,
      overlap_pct: m.overlap_pct,
    })),
    {
      sourceDatasetIds: ['anm-titulos'],
      emptyMessage:
        'No encontramos títulos mineros que se solapen con este predio en los datos cargados. Si el dataset de la ANM no está integrado en este despliegue, la ausencia no es concluyente.',
    },
  );

  const annexes =
    level === 'tecnico'
      ? [
          {
            id: 'anexo_catastral',
            title: 'Anexo: registro catastral tal como llega',
            description:
              'Campos abiertos de los Registros 1 y 2 del catastro, ya filtrados por la lista negra de datos personales. Se incluyen sin interpretar.',
            table: table(
              'anexo_catastral_tabla',
              'Campos del registro catastral',
              [
                { key: 'campo', label: 'Campo', align: 'left', width: 30 },
                { key: 'valor', label: 'Valor', align: 'left', width: 40 },
              ],
              Object.entries(parcel.attrs ?? {}).map(([campo, valor]) => ({
                campo,
                valor: valor === null || valor === undefined ? NOT_AVAILABLE : String(valor),
              })),
              {
                sourceDatasetIds: CADASTRE_DATASETS,
                emptyMessage: 'El corte no trae campos adicionales para este predio.',
                shareAlike: true,
              },
            ),
          },
          {
            id: 'anexo_zonas_homogeneas',
            title: 'Anexo: zonas homogéneas',
            description:
              'Zonas homogéneas físicas y geoeconómicas que cubren el predio. El valor unitario es catastral, no de mercado.',
            table: table(
              'anexo_zh_tabla',
              'Zonas homogéneas',
              [
                { key: 'kind', label: 'Tipo', align: 'left', width: 18 },
                { key: 'code', label: 'Código', align: 'left', width: 14 },
                { key: 'unit_value', label: 'Valor unitario (COP/m²)', align: 'right', numFmt: '#,##0', width: 22 },
                { key: 'overlap_pct', label: 'Solape (%)', align: 'right', numFmt: '#,##0.0', width: 12 },
              ],
              (homogeneousZones as Array<Record<string, unknown>>).map((z) => ({
                kind: z.kind ?? NOT_AVAILABLE,
                code: z.code ?? NOT_AVAILABLE,
                unit_value: z.unit_value ?? NOT_AVAILABLE,
                overlap_pct: z.overlap_pct ?? NOT_AVAILABLE,
              })),
              {
                sourceDatasetIds: CADASTRE_DATASETS,
                emptyMessage: 'No hay zonas homogéneas cargadas que cubran este predio.',
                shareAlike: true,
                hasCadastralValue: true,
                note: DISCLAIMERS.notAppraisal,
              },
            ),
          },
        ]
      : [];

  const data: ParcelReportData = {
    parcel: {
      npn,
      npnOld: parcel.npn_old ?? NOT_AVAILABLE,
      muniCode,
      muniName: parcel.muni_name,
      deptCode: parcel.dept_code,
      deptName: parcel.dept_name,
      zone: parcel.zone,
      zoneLabel: ZONE_LABEL[parcel.zone] ?? NOT_AVAILABLE,
      address: parcel.address ?? NOT_AVAILABLE,
      areaGeomM2: parcel.area_geom_m2 ?? NOT_AVAILABLE,
      areaReportedM2: parcel.area_reported_m2 ?? NOT_AVAILABLE,
      builtAreaM2: parcel.built_area_m2 ?? NOT_AVAILABLE,
      economicUse: parcel.economic_use ?? NOT_AVAILABLE,
      cadastralValue: parcel.cadastral_value ?? NOT_AVAILABLE,
      valuationYear: parcel.valuation_year ?? NOT_AVAILABLE,
      centroid: center,
    },
    parcelGeometry: geometry,
    parcelBBox: geometry ? geometryBBox(geometry) : null,
    buildings: buildings.map((b) => ({
      id: String(b.id),
      floors: b.floors ?? NOT_AVAILABLE,
      builtAreaM2: b.built_area_m2 ?? NOT_AVAILABLE,
      use: b.use ?? NOT_AVAILABLE,
      attrs: b.attrs ?? {},
    })),
    context: {
      radiusM,
      population: {
        total: population?.pop_total ?? NOT_AVAILABLE,
        households: population?.households ?? NOT_AVAILABLE,
        dwellings: population?.dwellings ?? NOT_AVAILABLE,
        schoolAge: NOT_AVAILABLE,
        ageBands: population?.age_bands ?? null,
      },
      schools: near.filter((n) => n.layer === 'school').map(toNearbyItem),
      healthFacilities: near.filter((n) => n.layer === 'health_facility').map(toNearbyItem),
      pois: near.filter((n) => n.layer === 'poi').map(toNearbyItem),
      roads: near.filter((n) => n.layer === 'road').map(toNearbyItem),
      soils: soils.map((s) => ({
        kind: s.kind,
        code: s.code ?? NOT_AVAILABLE,
        label: s.label ?? NOT_AVAILABLE,
        overlapPct: s.overlap_pct,
        attrs: s.attrs ?? {},
      })),
      hazards: hazards.map((h) => ({
        kind: h.kind,
        level: h.level ?? NOT_AVAILABLE,
        source: h.source,
        overlapPct: h.overlap_pct,
      })),
      protectedAreas: protectedAreas.map((p) => ({
        name: p.name,
        category: p.category ?? NOT_AVAILABLE,
        overlapPct: p.overlap_pct,
      })),
      ethnicTerritories: ethnic.map((e) => ({
        name: e.name,
        kind: e.kind ?? NOT_AVAILABLE,
        overlapPct: e.overlap_pct,
      })),
      potZones: pot.map((p) => ({
        classification: p.classification ?? NOT_AVAILABLE,
        use: p.use ?? NOT_AVAILABLE,
        sourceDoc: p.source_doc ?? NOT_AVAILABLE,
        overlapPct: p.overlap_pct,
      })),
      relief: {
        elevationMeanM: relief?.elevation_mean_m ?? NOT_AVAILABLE,
        slopeMeanPct: relief?.slope_mean_pct ?? NOT_AVAILABLE,
      },
    },
    municipality,
    coverage,
    hydrography,
    suitability: [],
    history: (history as Array<Record<string, unknown>>).map((h) => ({
      cutDate: String(h.to_cut_date ?? ''),
      changeType: String(h.change_type ?? ''),
      changeLabel: changeLabel(String(h.change_type ?? '')),
      detail: JSON.stringify(h.detail ?? {}),
    })),
    planningNote:
      pot.length > 0
        ? pot
            .map(
              (p) =>
                `${p.classification ?? 'clasificación no declarada'}${p.use ? ` · ${p.use}` : ''}` +
                `${p.source_doc ? ` (${p.source_doc})` : ''}`,
            )
            .join('; ')
        : NOT_AVAILABLE,
    miningTitles: miningTable,
    indicators,
    annexes,
    warnings,
  };

  // Estas tablas también se guardan como secciones consultables sin abrir el PDF.
  const sections = [
    { key: 'localizacion', title: MESSAGES.reports.sections[0]!, isMissing: center === null, payload: { municipality, centroid: center, address: parcel.address ?? NOT_AVAILABLE, insideUrbanPerimeter: urban ?? NOT_AVAILABLE, distanceToMuniSeatM: distSeat ?? NOT_AVAILABLE } },
    { key: 'identificacion', title: MESSAGES.reports.sections[1]!, isMissing: false, payload: { ...data.parcel, npnExplained: explainNpn(npn), cutDate: parcel.cut_date, cadastralValueWarning: DISCLAIMERS.notAppraisal } },
    { key: 'construcciones', title: MESSAGES.reports.sections[2]!, isMissing: buildings.length === 0, payload: { count: buildings.length, table: buildingsTable } },
    { key: 'contexto_geografico', title: MESSAGES.reports.sections[3]!, isMissing: !relief?.slope_mean_pct, payload: { relief: data.context.relief, hydrography, accessibility: access ?? {} } },
    { key: 'suelos', title: MESSAGES.reports.sections[4]!, isMissing: soils.length === 0, payload: { soils, agriculturalFrontier: frontier } },
    { key: 'amenazas', title: MESSAGES.reports.sections[5]!, isMissing: hazards.length === 0 && protectedAreas.length === 0, payload: { hazards, protectedAreas, ethnicTerritories: ethnic, miningTitles: mining, scaleWarning: DISCLAIMERS.hazardScale } },
    { key: 'ordenamiento', title: MESSAGES.reports.sections[6]!, isMissing: pot.length === 0, payload: { potZones: pot, planningNote: data.planningNote, legalNote: DISCLAIMERS.notUrbanNorm } },
    { key: 'entorno', title: MESSAGES.reports.sections[7]!, isMissing: (population?.n_blocks ?? 0) === 0, payload: { radiusM, population: data.context.population, facilities: facilities ?? {}, nearest: near.slice(0, 20) } },
    { key: 'analisis', title: MESSAGES.reports.sections[8]!, isMissing: indicators.length === 0, payload: { indicators, warnings } },
    { key: 'fuentes', title: MESSAGES.reports.sections[9]!, isMissing: false, payload: { coverage, disclaimers: Object.values(DISCLAIMERS), immutabilityNote: MESSAGES.reports.immutable } },
  ];

  const datasetIds = [
    ...ADMIN_DATASETS,
    ...CADASTRE_DATASETS,
    'igac-suelos',
    'igac-capacidad-uso',
    'igac-vocacion',
    'igac-conflictos',
    'sgc-movimientos-masa',
    'sgc-sismica',
    'ideam-inundacion',
    'runap-areas-protegidas',
    'ant-resguardos',
    'anm-titulos',
    'men-establecimientos',
    'minsalud-reps',
    'osm-vias-colombia',
    'osm-poi-colombia',
    'copernicus-dem',
    'dane-cnpv',
    'pot-municipal',
    'demo-facilities',
  ];

  const spec: ReportSpec = {
    kind: 'parcel',
    level,
    data,
    verification: {
      reportId: verification.reportId,
      verifyUrl: verification.verifyUrl,
      issuedAt: verification.issuedAt,
      checksum: null,
      snapshotIds: {},
    },
    meta: buildMeta(sources, { coverage, warnings }),
    titleOverride: verification.titleOverride ?? null,
    subtitle: `${parcel.muni_name}, ${parcel.dept_name}`,
    requestedBy: verification.requestedBy ?? null,
  };

  return { spec, datasetIds, sections, synthetic: parcel.is_synthetic, geometry };
}

// ─── Informe Municipal ────────────────────────────────────────────────────────

async function buildMunicipalityReport(
  level: 'resumen' | 'completo' | 'tecnico',
  subject: Record<string, unknown>,
  verification: Parameters<typeof buildReport>[3],
  sources: SourceRef[],
): Promise<BuiltReport> {
  const muniCode = String(subject.muniCode ?? '');
  const muni = await getMunicipality(muniCode);
  if (!muni) throw new Error(`No tenemos el municipio ${muniCode}.`);

  const CADASTRE_DATASETS = await cadastreDatasetsFor({ muniCode });

  const [summary, coverage] = await Promise.all([getMuniSummary(muniCode), getCoverage(muniCode)]);
  const s = (summary ?? {}) as Record<string, number | null>;

  const municipality: MunicipalityBrief = {
    code: muni.code,
    name: muni.name,
    deptCode: muni.dept_code,
    deptName: muni.dept_name,
    cadastralManager: coverage.cadastralManager ?? NOT_AVAILABLE,
    isIgac: coverage.isIgac,
    populationTotal: muni.population ?? NOT_AVAILABLE,
    areaKm2: muni.area_km2 ?? NOT_AVAILABLE,
    centroid: muni.lng !== null && muni.lat !== null ? [muni.lng, muni.lat] : null,
  };

  const warnings: string[] = [];
  if (coverage.status === 'none' && coverage.message) warnings.push(coverage.message);

  const indicators: ReportIndicator[] = [
    indicator('n_parcels', 'Predios cargados', s.n_parcels ?? null, 'predios',
      'Conteo de predios del corte activo en el municipio.',
      'Es cuántos predios tenemos nosotros, no cuántos existen: depende de la cobertura del gestor catastral.',
      CADASTRE_DATASETS, { own: true }),
    indicator('n_urban', 'Predios urbanos', s.n_parcels_urban ?? null, 'predios',
      'Predios con zona 01 (urbano) en el NPN.', 'Los del casco urbano según el código predial.',
      CADASTRE_DATASETS, { own: true }),
    indicator('n_rural', 'Predios rurales', s.n_parcels_rural ?? null, 'predios',
      'Predios con zona 02 (rural) en el NPN.', 'Los de fuera del casco urbano según el código predial.',
      CADASTRE_DATASETS, { own: true }),
    indicator('population', 'Población', muni.population ?? null, 'personas',
      'Población del municipio según la proyección del DANE.',
      `Corresponde al año ${muni.population_year ?? 'no declarado'}.`, ['dane-projections'], {}),
    indicator('n_schools', 'Establecimientos educativos', s.n_schools ?? null, 'sedes',
      'Sedes educativas del MEN localizadas en el municipio.',
      'Solo cuenta las sedes con coordenadas válidas en la fuente.', ['men-establecimientos', 'demo-facilities'], {}),
    indicator('n_health', 'Prestadores de salud', s.n_health_facilities ?? null, 'sedes',
      'Sedes del REPS localizadas en el municipio.',
      'Solo cuenta las sedes con coordenadas válidas en la fuente.', ['minsalud-reps', 'demo-facilities'], {}),
  ];

  return {
    spec: {
      kind: 'municipality',
      level,
      data: {
        municipality,
        coverage,
        indicators,
        tables: [],
        rankings: [],
        extraSections: [],
        annexes: [],
        warnings,
      } as never,
      verification: {
        reportId: verification.reportId,
        verifyUrl: verification.verifyUrl,
        issuedAt: verification.issuedAt,
        checksum: null,
        snapshotIds: {},
      },
      meta: buildMeta(sources, { coverage, warnings }),
      titleOverride: verification.titleOverride ?? null,
      subtitle: `${muni.name}, ${muni.dept_name}`,
      requestedBy: verification.requestedBy ?? null,
    },
    datasetIds: [...ADMIN_DATASETS, ...CADASTRE_DATASETS, 'dane-cnpv', 'dane-projections', 'men-establecimientos', 'minsalud-reps', 'demo-facilities'],
    sections: [
      { key: 'ficha', title: 'Ficha municipal', isMissing: false, payload: { municipality, indicators } },
      { key: 'cobertura', title: 'Cobertura catastral', isMissing: coverage.status === 'none', payload: { coverage, summary } },
      { key: 'fuentes', title: MESSAGES.reports.sections[9]!, isMissing: false, payload: { disclaimers: Object.values(DISCLAIMERS) } },
    ],
    synthetic: sources.some((x) => x.synthetic),
    geometry: null,
  };
}

// ─── Informe de Zona ──────────────────────────────────────────────────────────

async function buildAreaReport(
  level: 'resumen' | 'completo' | 'tecnico',
  subject: Record<string, unknown>,
  verification: Parameters<typeof buildReport>[3],
  sources: SourceRef[],
): Promise<BuiltReport> {
  const scope = subject.scope as {
    kind?: string;
    geometry?: unknown;
    center?: [number, number];
    radiusM?: number;
  };

  let geometry: unknown;
  let scopeLabel: string;
  if (scope?.kind === 'polygon' && scope.geometry) {
    geometry = scope.geometry;
    scopeLabel = 'Polígono dibujado';
  } else if (scope?.kind === 'radius' && scope.center && scope.radiusM) {
    geometry = radiusToPolygon(scope.center, scope.radiusM);
    scopeLabel = `Radio de ${formatDistance(scope.radiusM)}`;
  } else {
    throw new Error('El informe de zona necesita `subject.scope` con un polígono o un centro y un radio.');
  }

  const CADASTRE_DATASETS = await cadastreDatasetsFor({});

  const [stats, population, facilities, soils, hazards, protectedAreas, relief] = await Promise.all([
    parcelStatsIn(geometry as never),
    populationIn(geometry as never),
    facilitiesIn(geometry as never),
    soilOverlaps(geometry as never),
    hazardOverlaps(geometry as never),
    protectedAreaOverlaps(geometry as never),
    reliefFor(geometry as never),
  ]);

  const bbox = geometryBBox(geometry as never);
  const areaKm2 = areaOf(geometry);
  const warnings: string[] = [];
  if ((stats?.n_parcels ?? 0) === 0) {
    warnings.push('No hay predios cargados dentro de esta zona en el corte activo.');
  }
  if ((population?.n_blocks ?? 0) === 0) {
    warnings.push('No hay manzanas censales del DANE cargadas para esta zona: la población aparece como no disponible.');
  }

  const headline: ReportIndicator[] = [
    indicator('area', 'Área de la zona', areaKm2, 'km²',
      'Área de la geometría calculada sobre el esferoide.', 'Es el tamaño de la zona que analizaste.',
      [], { own: true }),
    indicator('n_parcels', 'Predios en la zona', stats?.n_parcels ?? null, 'predios',
      'Predios del corte activo cuya geometría intersecta la zona.',
      'Incluye los predios que solo tocan el borde de la zona.', CADASTRE_DATASETS, { own: true }),
    indicator('population', 'Población estimada', population?.pop_total ?? null, 'personas',
      'Suma de la población de cada manzana censal en proporción al área que cae dentro de la zona.',
      'Es una estimación por reparto de área: el censo publica agregados por manzana, no puntos.',
      ['dane-cnpv', 'dane-mgn'], { own: true }),
  ];

  return {
    spec: {
      kind: 'area',
      level,
      data: {
        title: String(subject.title ?? 'Zona analizada'),
        scopeLabel,
        geometry: geometry as never,
        bbox,
        areaKm2,
        municipalities: [],
        coverage: { muniCode: null, cadastralManager: null, isIgac: null, status: 'unknown', availableLayers: [], message: null } as Coverage,
        headline,
        parcels: table('predios', 'Predios', [
          { key: 'metrica', label: 'Métrica', align: 'left', width: 28 },
          { key: 'valor', label: 'Valor', align: 'right', width: 18 },
        ], stats ? [
          { metrica: 'Total', valor: stats.n_parcels },
          { metrica: 'Urbanos', valor: stats.n_urban },
          { metrica: 'Rurales', valor: stats.n_rural },
          { metrica: 'Con construcción', valor: stats.n_with_building },
          { metrica: 'Área sumada (m²)', valor: stats.area_sum_m2 ?? NOT_AVAILABLE },
        ] : [], {
          sourceDatasetIds: CADASTRE_DATASETS,
          emptyMessage: 'No hay predios cargados dentro de esta zona en el corte activo.',
          shareAlike: true,
        }),
        landUse: table('uso', 'Reparto por destino económico', [
          { key: 'uso', label: 'Destino económico', align: 'left', width: 30 },
          { key: 'n', label: 'Predios', align: 'right', numFmt: '#,##0', width: 12 },
        ], Object.entries(stats?.use_counts ?? {}).map(([uso, n]) => ({ uso, n })), {
          sourceDatasetIds: CADASTRE_DATASETS,
          emptyMessage: 'Sin predios que clasificar en esta zona.',
          shareAlike: true,
        }),
        population: table('poblacion', 'Población', [
          { key: 'metrica', label: 'Métrica', align: 'left', width: 28 },
          { key: 'valor', label: 'Valor', align: 'right', width: 18 },
        ], population ? [
          { metrica: 'Personas', valor: population.pop_total ?? NOT_AVAILABLE },
          { metrica: 'Hogares', valor: population.households ?? NOT_AVAILABLE },
          { metrica: 'Viviendas', valor: population.dwellings ?? NOT_AVAILABLE },
          { metrica: 'Manzanas usadas', valor: population.n_blocks },
        ] : [], {
          sourceDatasetIds: ['dane-cnpv', 'dane-mgn'],
          emptyMessage: 'No hay manzanas censales cargadas para esta zona.',
          note: 'Estimación por reparto de área sobre las manzanas del Marco Geoestadístico Nacional.',
        }),
        education: table('educacion', 'Educación', [
          { key: 'metrica', label: 'Métrica', align: 'left', width: 28 },
          { key: 'valor', label: 'Valor', align: 'right', width: 18 },
        ], facilities ? [
          { metrica: 'Sedes educativas', valor: facilities.n_schools },
          { metrica: 'Matrícula reportada', valor: facilities.school_enrollment ?? NOT_AVAILABLE },
        ] : [], {
          sourceDatasetIds: ['men-establecimientos', 'demo-facilities'],
          emptyMessage: 'No hay sedes educativas cargadas dentro de esta zona.',
        }),
        health: table('salud', 'Salud', [
          { key: 'metrica', label: 'Métrica', align: 'left', width: 28 },
          { key: 'valor', label: 'Valor', align: 'right', width: 18 },
        ], facilities ? [{ metrica: 'Prestadores de salud', valor: facilities.n_health }] : [], {
          sourceDatasetIds: ['minsalud-reps', 'demo-facilities'],
          emptyMessage: 'No hay prestadores de salud cargados dentro de esta zona.',
        }),
        commerce: table('comercio', 'Comercio y servicios', [
          { key: 'categoria', label: 'Categoría', align: 'left', width: 26 },
          { key: 'n', label: 'Puntos', align: 'right', numFmt: '#,##0', width: 12 },
        ], Object.entries(facilities?.poi_counts ?? {}).map(([categoria, n]) => ({ categoria, n })), {
          sourceDatasetIds: ['osm-poi-colombia', 'demo-facilities'],
          emptyMessage: 'No hay puntos de interés cargados dentro de esta zona.',
          shareAlike: true,
        }),
        roads: table('vias', 'Vías', [], [], {
          sourceDatasetIds: ['osm-vias-colombia'],
          emptyMessage: 'El detalle de vías se incluye en el informe técnico.',
          shareAlike: true,
        }),
        soils: table('suelos', 'Suelos', [
          { key: 'kind', label: 'Capa', align: 'left', width: 22 },
          { key: 'code', label: 'Código', align: 'left', width: 16 },
          { key: 'label', label: 'Descripción', align: 'left', width: 34 },
          { key: 'overlap_pct', label: 'Solape (%)', align: 'right', numFmt: '#,##0.0', width: 12 },
        ], soils.map((x) => ({ kind: x.kind, code: x.code ?? NOT_AVAILABLE, label: x.label ?? NOT_AVAILABLE, overlap_pct: x.overlap_pct })), {
          sourceDatasetIds: ['igac-suelos', 'igac-capacidad-uso', 'igac-vocacion', 'igac-conflictos'],
          emptyMessage: 'No hay estudio de suelos cargado que cubra esta zona.',
          shareAlike: true,
        }),
        hazards: table('amenazas', 'Amenazas', [
          { key: 'kind', label: 'Tipo', align: 'left', width: 22 },
          { key: 'level', label: 'Nivel', align: 'left', width: 16 },
          { key: 'source', label: 'Fuente', align: 'left', width: 16 },
          { key: 'overlap_pct', label: 'Solape (%)', align: 'right', numFmt: '#,##0.0', width: 12 },
        ], hazards.map((h) => ({ kind: h.kind, level: h.level ?? NOT_AVAILABLE, source: h.source, overlap_pct: h.overlap_pct })), {
          sourceDatasetIds: ['sgc-movimientos-masa', 'sgc-sismica', 'ideam-inundacion'],
          emptyMessage: 'No hay capas de amenaza cargadas que cubran esta zona. Que no aparezcan no significa que no existan.',
          note: DISCLAIMERS.hazardScale,
        }),
        protectedAreas: table('areas_protegidas', 'Áreas protegidas', [
          { key: 'name', label: 'Área', align: 'left', width: 34 },
          { key: 'category', label: 'Categoría', align: 'left', width: 24 },
          { key: 'overlap_pct', label: 'Solape (%)', align: 'right', numFmt: '#,##0.0', width: 12 },
        ], protectedAreas.map((p) => ({ name: p.name, category: p.category ?? NOT_AVAILABLE, overlap_pct: p.overlap_pct })), {
          sourceDatasetIds: ['runap-areas-protegidas'],
          emptyMessage: 'No hay áreas protegidas del RUNAP que se solapen con esta zona.',
        }),
        ethnicTerritories: table('territorios_etnicos', 'Territorios étnicos', [], [], {
          sourceDatasetIds: ['ant-resguardos'],
          emptyMessage: 'No hay territorios étnicos que se solapen con esta zona en los datos cargados.',
        }),
        potZones: table('pot', 'Ordenamiento territorial', [], [], {
          sourceDatasetIds: ['pot-municipal'],
          emptyMessage: 'No tenemos la zonificación del POT para esta zona. Consulta Planeación municipal.',
        }),
        relief: table('relieve', 'Relieve', [
          { key: 'metrica', label: 'Métrica', align: 'left', width: 26 },
          { key: 'valor', label: 'Valor', align: 'right', width: 18 },
        ], relief?.slope_mean_pct != null ? [
          { metrica: 'Altitud media (m)', valor: relief.elevation_mean_m ?? NOT_AVAILABLE },
          { metrica: 'Pendiente media (%)', valor: relief.slope_mean_pct },
          { metrica: 'Pendiente máxima (%)', valor: relief.slope_max_pct ?? NOT_AVAILABLE },
        ] : [], {
          sourceDatasetIds: ['copernicus-dem'],
          emptyMessage: 'No hay modelo digital de elevación cargado para esta zona.',
        }),
        indicators: headline,
        extraSections: [],
        annexes: [],
        warnings,
      } as never,
      verification: {
        reportId: verification.reportId,
        verifyUrl: verification.verifyUrl,
        issuedAt: verification.issuedAt,
        checksum: null,
        snapshotIds: {},
      },
      meta: buildMeta(sources, { warnings }),
      titleOverride: verification.titleOverride ?? null,
      subtitle: scopeLabel,
      requestedBy: verification.requestedBy ?? null,
    },
    datasetIds: [
      ...ADMIN_DATASETS, ...CADASTRE_DATASETS, 'dane-cnpv', 'men-establecimientos',
      'minsalud-reps', 'osm-vias-colombia', 'osm-poi-colombia', 'igac-suelos', 'sgc-movimientos-masa',
      'runap-areas-protegidas', 'copernicus-dem', 'demo-facilities',
    ],
    sections: [
      { key: 'predios', title: 'Predios en la zona', isMissing: (stats?.n_parcels ?? 0) === 0, payload: stats ?? {} },
      { key: 'poblacion', title: 'Población', isMissing: (population?.n_blocks ?? 0) === 0, payload: population ?? {} },
      { key: 'equipamientos', title: 'Equipamientos y comercio', isMissing: !facilities, payload: facilities ?? {} },
      { key: 'suelos_amenazas', title: 'Suelos y amenazas', isMissing: soils.length === 0 && hazards.length === 0, payload: { soils, hazards, protectedAreas, relief } },
      { key: 'fuentes', title: MESSAGES.reports.sections[9]!, isMissing: false, payload: { disclaimers: Object.values(DISCLAIMERS) } },
    ],
    synthetic: sources.some((x) => x.synthetic),
    geometry,
  };
}

// ─── Ayudas ───────────────────────────────────────────────────────────────────

function toNearbyItem(n: {
  layer: string;
  id: string;
  name: string | null;
  category: string | null;
  distance_m: number;
  lng: number | null;
  lat: number | null;
  attrs: Record<string, unknown>;
}) {
  return {
    layer: n.layer,
    id: n.id,
    name: n.name ?? NOT_AVAILABLE,
    category: n.category ?? NOT_AVAILABLE,
    distanceM: n.distance_m,
    centroid: n.lng !== null && n.lat !== null ? ([n.lng, n.lat] as [number, number]) : null,
    attrs: n.attrs ?? {},
  };
}

/** Filas de la tabla de relieve: solo las métricas que sí tienen dato. */
function reliefRows(relief: {
  elevation_mean_m: number | null;
  slope_mean_pct: number | null;
  slope_max_pct: number | null;
} | null): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  if (relief?.elevation_mean_m != null) {
    rows.push({ elemento: 'Altitud media', valor: `${formatNumber(relief.elevation_mean_m)} m s. n. m.` });
  }
  if (relief?.slope_mean_pct != null) {
    rows.push({ elemento: 'Pendiente media', valor: `${formatNumber(relief.slope_mean_pct, 1)} %` });
  }
  if (relief?.slope_max_pct != null) {
    rows.push({ elemento: 'Pendiente máxima', valor: `${formatNumber(relief.slope_max_pct, 1)} %` });
  }
  return rows;
}

function changeLabel(kind: string): string {
  const labels: Record<string, string> = {
    created: 'Predio nuevo',
    removed: 'Predio dado de baja',
    attrs_changed: 'Cambio en los datos del predio',
    geometry_changed: 'Cambio en la forma o el tamaño',
    building_added: 'Construcción nueva',
    building_removed: 'Construcción dada de baja',
  };
  return labels[kind] ?? kind;
}

/** Área aproximada en km², para la cabecera del informe de zona. */
function areaOf(geom: unknown): number {
  try {
    return approxAreaKm2(geom as never);
  } catch {
    return 0;
  }
}
