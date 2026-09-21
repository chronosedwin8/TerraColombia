import {
  DISCLAIMERS,
  MESSAGES,
  NOT_AVAILABLE,
  ZONE_LABEL,
  formatArea,
  formatCop,
  formatDistance,
  formatNumber,
  isAvailable,
  type NearbyItem,
} from '@terracolombia/shared';
import { explainNpn, formatNpnPretty, validateNpn } from '@terracolombia/geo';
import {
  REPORT_KIND_TITLE,
  resolveAssets,
  resolveBranding,
  type ParcelReportData,
  type ReportSpec,
  type ReportTable,
} from '../types.js';
import { html, joinHtml, raw, type RawHtml } from './html.js';
import {
  annexBlock,
  cadastralValueWarning,
  chartFigure,
  cover,
  coverageWarning,
  dataTable,
  documentShell,
  indicatorGrid,
  kvList,
  legalBlock,
  paragraphs,
  qrBlock,
  sectionBlock,
  showMaybe,
  sourcesBlock,
  staticMapFigure,
  subsection,
  tableOfContents,
  verdictBlock,
  warningsBlock,
  type TocEntry,
} from './partials.js';

/**
 * Informe Territorial de Predio (M7).
 *
 * Las **10 secciones** son las de PLAN.md §11, en ese orden y con esos títulos, tomados
 * literalmente de `MESSAGES.reports.sections` para que informe, ficha web y API digan lo mismo:
 *
 *  1 Localización
 *  2 Identificación y características catastrales
 *  3 Construcciones
 *  4 Contexto geográfico
 *  5 Suelos, capacidad y vocación
 *  6 Amenazas y restricciones
 *  7 Ordenamiento territorial
 *  8 Entorno: población, educación, salud, comercio y accesibilidad
 *  9 Análisis y semáforos explicados
 * 10 Fuentes, fechas de corte, licencias y advertencias
 *
 * El nivel (`resumen` | `completo` | `tecnico`) cambia la **profundidad** de cada sección,
 * nunca su presencia ni su título: un informe resumen sigue teniendo las 10 secciones, con
 * las cifras principales y sin tablas de detalle ni anexos.
 */

const SECTIONS = MESSAGES.reports.sections;

/** Claves de mapas y gráficos que este informe espera en `spec.assets`. */
export const PARCEL_REPORT_ASSET_KEYS = {
  maps: {
    location: 'predio_localizacion',
    context: 'predio_contexto',
    soils: 'predio_suelos',
    hazards: 'predio_amenazas',
    planning: 'predio_ordenamiento',
  },
  charts: {
    buildingsByUse: 'predio_construcciones_uso',
    population: 'predio_poblacion_edades',
    distances: 'predio_distancias',
    factors: 'predio_factores',
  },
} as const;

function nearbyTable(
  id: string,
  title: string,
  items: readonly NearbyItem[],
  emptyMessage: string,
  sourceDatasetIds: string[],
  limit: number,
): ReportTable {
  return {
    id,
    title,
    columns: [
      { key: 'name', label: 'Nombre', width: 38 },
      { key: 'category', label: 'Categoría', width: 20 },
      { key: 'distance', label: 'Distancia', align: 'right', width: 14 },
    ],
    rows: items.slice(0, limit).map((i) => ({
      name: isAvailable(i.name) ? i.name : MESSAGES.common.notAvailable,
      category: isAvailable(i.category) ? i.category : i.layer,
      distance: formatDistance(i.distanceM),
    })),
    emptyMessage,
    sourceDatasetIds,
    shareAlike: true,
  };
}

function buildingsTable(data: ParcelReportData): ReportTable {
  return {
    id: 'construcciones',
    title: 'Construcciones registradas en el catastro',
    columns: [
      { key: 'id', label: 'Identificador', width: 22 },
      { key: 'use', label: 'Uso', width: 24 },
      { key: 'floors', label: 'Pisos', align: 'right', numFmt: '#,##0', width: 10 },
      { key: 'area', label: 'Área construida', align: 'right', width: 18 },
    ],
    rows: data.buildings.map((b) => ({
      id: b.id,
      use: isAvailable(b.use) ? b.use : MESSAGES.common.notAvailable,
      floors: isAvailable(b.floors) ? b.floors : null,
      area: isAvailable(b.builtAreaM2) ? formatArea(b.builtAreaM2) : null,
    })),
    emptyMessage: MESSAGES.parcel.noBuildings,
    sourceDatasetIds: ['igac-catastro-construccion'],
    shareAlike: true,
  };
}

function soilsTable(data: ParcelReportData): ReportTable {
  return {
    id: 'suelos',
    title: 'Unidades de suelo, capacidad de uso y vocación que cruzan el predio',
    columns: [
      { key: 'kind', label: 'Tipo de capa', width: 24 },
      { key: 'code', label: 'Código', width: 16 },
      { key: 'label', label: 'Descripción', width: 46 },
      { key: 'overlap', label: 'Traslape', align: 'right', width: 12 },
    ],
    rows: data.context.soils.map((s) => ({
      kind: s.kind,
      code: isAvailable(s.code) ? s.code : null,
      label: isAvailable(s.label) ? s.label : null,
      overlap: `${formatNumber(s.overlapPct, 1)} %`,
    })),
    emptyMessage:
      'Los estudios de suelos que tenemos no cubren este predio. Consulte la Subdirección de Agrología del IGAC.',
    sourceDatasetIds: ['igac-agrologia-suelos', 'igac-agrologia-capacidad', 'igac-agrologia-vocacion'],
    shareAlike: true,
  };
}

function hazardsTable(data: ParcelReportData): ReportTable {
  return {
    id: 'amenazas',
    title: 'Amenazas que cruzan el predio',
    columns: [
      { key: 'kind', label: 'Amenaza', width: 26 },
      { key: 'level', label: 'Nivel', width: 18 },
      { key: 'source', label: 'Fuente', width: 22 },
      { key: 'overlap', label: 'Traslape', align: 'right', width: 12 },
    ],
    rows: data.context.hazards.map((h) => ({
      kind: h.kind,
      level: isAvailable(h.level) ? h.level : null,
      source: h.source,
      overlap: `${formatNumber(h.overlapPct, 1)} %`,
    })),
    emptyMessage:
      'Las capas de amenaza que tenemos no reportan afectación en este predio. Eso no equivale a un certificado de ausencia de riesgo.',
    sourceDatasetIds: ['sgc-amenaza-movimientos-masa', 'ideam-inundaciones'],
    shareAlike: false,
    note: DISCLAIMERS.hazardScale,
  };
}

function restrictionsTable(data: ParcelReportData): ReportTable {
  const rows: Array<Record<string, string | number | null>> = [];
  for (const p of data.context.protectedAreas) {
    rows.push({
      kind: 'Área protegida (RUNAP)',
      name: p.name,
      detail: isAvailable(p.category) ? p.category : MESSAGES.common.notAvailable,
      overlap: `${formatNumber(p.overlapPct, 1)} %`,
    });
  }
  for (const e of data.context.ethnicTerritories) {
    rows.push({
      kind: 'Territorio étnico',
      name: e.name,
      detail: isAvailable(e.kind) ? e.kind : MESSAGES.common.notAvailable,
      overlap: `${formatNumber(e.overlapPct, 1)} %`,
    });
  }
  for (const m of data.miningTitles.rows) {
    rows.push({
      kind: 'Título minero',
      name: String(m['name'] ?? MESSAGES.common.notAvailable),
      detail: String(m['detail'] ?? MESSAGES.common.notAvailable),
      overlap: String(m['overlap'] ?? MESSAGES.common.notAvailable),
    });
  }
  return {
    id: 'restricciones',
    title: 'Restricciones legales y ambientales que cruzan el predio',
    columns: [
      { key: 'kind', label: 'Tipo', width: 24 },
      { key: 'name', label: 'Nombre', width: 40 },
      { key: 'detail', label: 'Detalle', width: 24 },
      { key: 'overlap', label: 'Traslape', align: 'right', width: 12 },
    ],
    rows,
    emptyMessage:
      'No encontramos áreas protegidas, territorios étnicos ni títulos mineros que crucen este predio en las capas disponibles.',
    sourceDatasetIds: ['runap-areas-protegidas', 'ant-territorios-etnicos', 'anm-titulos-mineros'],
    shareAlike: false,
  };
}

function potTable(data: ParcelReportData): ReportTable {
  return {
    id: 'ordenamiento',
    title: 'Clasificación del suelo y usos según el POT integrado',
    columns: [
      { key: 'classification', label: 'Clasificación del suelo', width: 30 },
      { key: 'use', label: 'Uso', width: 30 },
      { key: 'doc', label: 'Acto administrativo', width: 30 },
      { key: 'overlap', label: 'Traslape', align: 'right', width: 12 },
    ],
    rows: data.context.potZones.map((z) => ({
      classification: isAvailable(z.classification) ? z.classification : null,
      use: isAvailable(z.use) ? z.use : null,
      doc: isAvailable(z.sourceDoc) ? z.sourceDoc : null,
      overlap: `${formatNumber(z.overlapPct, 1)} %`,
    })),
    emptyMessage:
      'No tenemos el POT de este municipio integrado. No existe un repositorio nacional completo: consulte la Secretaría de Planeación municipal.',
    sourceDatasetIds: ['pot-municipal'],
    note: DISCLAIMERS.notUrbanNorm,
  };
}

function populationTable(data: ParcelReportData): ReportTable {
  const p = data.context.population;
  const ageRows = Object.entries(p.ageBands ?? {}).map(([band, value]) => ({
    concept: `Población en el rango ${band}`,
    value: formatNumber(value),
  }));
  return {
    id: 'poblacion',
    title: `Población en un radio de ${formatDistance(data.context.radiusM)}`,
    columns: [
      { key: 'concept', label: 'Concepto', width: 46 },
      { key: 'value', label: 'Valor', align: 'right', width: 18 },
    ],
    rows: [
      { concept: 'Población total', value: isAvailable(p.total) ? formatNumber(p.total) : null },
      { concept: 'Hogares', value: isAvailable(p.households) ? formatNumber(p.households) : null },
      { concept: 'Viviendas', value: isAvailable(p.dwellings) ? formatNumber(p.dwellings) : null },
      {
        concept: 'Población en edad escolar (5 a 17 años)',
        value: isAvailable(p.schoolAge) ? formatNumber(p.schoolAge) : null,
      },
      ...ageRows,
    ],
    emptyMessage: 'No tenemos datos de población para esta zona.',
    sourceDatasetIds: ['dane-mgn-manzanas', 'dane-cnpv-2018'],
    note: 'La población se agrega por manzana o sección censal que intersecta el radio; no es un conteo exacto de habitantes dentro del círculo.',
  };
}

function historyTable(data: ParcelReportData): ReportTable {
  return {
    id: 'historial',
    title: 'Cambios detectados entre cortes de la base catastral',
    columns: [
      { key: 'cutDate', label: 'Corte', width: 14 },
      { key: 'change', label: 'Cambio', width: 26 },
      { key: 'detail', label: 'Detalle', width: 60 },
    ],
    rows: data.history.map((h) => ({
      cutDate: h.cutDate,
      change: h.changeLabel,
      detail: h.detail,
    })),
    emptyMessage:
      'Solo tenemos un corte de la base catastral para este predio, así que todavía no hay historial que comparar.',
    sourceDatasetIds: ['igac-catastro-terreno'],
    shareAlike: true,
  };
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function section1(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  const centroid = d.parcel.centroid;
  return html`${coverageWarning(d.coverage)}
  ${kvList([
    ['Municipio', html`${d.municipality.name} (${d.municipality.code})`],
    ['Departamento', html`${d.municipality.deptName} (${d.municipality.deptCode})`],
    [
      'Gestor catastral',
      html`${showMaybe(d.municipality.cadastralManager)}${d.municipality.isIgac === true
        ? ' — jurisdicción del IGAC'
        : d.municipality.isIgac === false
          ? ' — catastro descentralizado o gestor habilitado'
          : ''}`,
    ],
    ['Zona', showMaybe(d.parcel.zoneLabel ?? ZONE_LABEL[String(d.parcel.zone)])],
    ['Dirección registrada', showMaybe(d.parcel.address)],
    [
      'Coordenadas del centroide (EPSG:4326)',
      centroid
        ? html`${centroid[1].toFixed(6)}, ${centroid[0].toFixed(6)}`
        : showMaybe(null),
    ],
  ])}
  ${staticMapFigure(
    assets.maps[PARCEL_REPORT_ASSET_KEYS.maps.location],
    'No se pudo generar el mapa de localización de este predio.',
  )}
  <p>
    <small
      >Las geometrías se sirven en EPSG:4326 (WGS 84). Las áreas y distancias de este informe se
      calculan en EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional), el sistema plano oficial para medir en
      Colombia.</small
    >
  </p>`;
}

function section2(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const npnCheck = validateNpn(d.parcel.npn);
  const hasCadastralValue = isAvailable(d.parcel.cadastralValue);
  return html`${kvList(
    [
      ['Número Predial Nacional (30 dígitos)', html`<code>${formatNpnPretty(d.parcel.npn)}</code>`],
      ['Código anterior (20 dígitos)', showMaybe(d.parcel.npnOld)],
      ['Área del terreno según geometría', showMaybe(d.parcel.areaGeomM2, formatArea)],
      ['Área del terreno reportada por el catastro', showMaybe(d.parcel.areaReportedM2, formatArea)],
      ['Área construida', showMaybe(d.parcel.builtAreaM2, formatArea)],
      ['Destino económico', showMaybe(d.parcel.economicUse)],
      ['Avalúo catastral', showMaybe(d.parcel.cadastralValue, formatCop)],
      ['Vigencia del avalúo', showMaybe(d.parcel.valuationYear, (y) => String(y))],
    ],
    true,
  )}
  ${hasCadastralValue ? cadastralValueWarning() : ''}
  ${npnCheck.ok
    ? html`<div class="card">
        <strong>${MESSAGES.common.explain}</strong> ${explainNpn(d.parcel.npn)}
      </div>`
    : html`<div class="warn">
        <span class="warn__title">Código predial con estructura inesperada</span>${npnCheck.reason}
      </div>`}
  ${isAvailable(d.parcel.areaGeomM2) && isAvailable(d.parcel.areaReportedM2)
    ? areaDiscrepancyNote(d.parcel.areaGeomM2, d.parcel.areaReportedM2)
    : ''}
  ${warningsBlock(d.warnings)}`;
}

/** Diferencia entre área medida y área declarada: se informa, no se corrige. */
function areaDiscrepancyNote(geom: number, reported: number): RawHtml {
  if (reported <= 0) return raw('');
  const diffPct = Math.abs(geom - reported) / reported;
  if (diffPct < 0.05) return raw('');
  return html`<div class="warn">
    <span class="warn__title">El área medida y el área declarada no coinciden</span>
    La geometría del predio mide ${formatArea(geom)} y el registro alfanumérico declara
    ${formatArea(reported)}: una diferencia de ${formatNumber(diffPct * 100, 1)} %. Publicamos las
    dos cifras sin ajustarlas. La diferencia puede venir de la escala de la cartografía, de una
    actualización pendiente o de un error de la fuente; para linderos exactos se necesita un
    levantamiento topográfico.
  </div>`;
}

function section3(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  const totalBuilt = d.buildings.reduce(
    (acc, b) => acc + (isAvailable(b.builtAreaM2) ? b.builtAreaM2 : 0),
    0,
  );
  const maxFloors = d.buildings.reduce(
    (acc, b) => Math.max(acc, isAvailable(b.floors) ? b.floors : 0),
    0,
  );
  return html`${kvList([
    ['Construcciones registradas', html`${formatNumber(d.buildings.length)}`],
    [
      'Área construida sumada',
      d.buildings.length > 0 ? html`${formatArea(totalBuilt)}` : showMaybe(null),
    ],
    ['Número máximo de pisos', maxFloors > 0 ? html`${formatNumber(maxFloors)}` : showMaybe(null)],
  ])}
  ${spec.level === 'resumen' ? raw('') : dataTable(buildingsTable(d))}
  ${chartFigure(assets.charts[PARCEL_REPORT_ASSET_KEYS.charts.buildingsByUse])}
  <p>
    <small
      >El catastro registra construcciones a efectos fiscales. Una construcción no registrada no
      queda acreditada por este informe, y una registrada no implica que cuente con licencia de
      construcción.</small
    >
  </p>`;
}

function section4(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  const relief = d.context.relief;
  return html`${kvList([
    ['Altitud media', showMaybe(relief.elevationMeanM, (v) => `${formatNumber(v)} m s. n. m.`)],
    ['Pendiente media', showMaybe(relief.slopeMeanPct, (v) => `${formatNumber(v, 1)} %`)],
    [
      'Vías cercanas inventariadas',
      html`${formatNumber(d.context.roads.length)} en ${formatDistance(d.context.radiusM)}`,
    ],
  ])}
  ${isAvailable(relief.slopeMeanPct) ? slopeNote(relief.slopeMeanPct) : ''}
  ${staticMapFigure(assets.maps[PARCEL_REPORT_ASSET_KEYS.maps.context])}
  ${spec.level === 'resumen'
    ? raw('')
    : html`${subsection('Vías')}
      ${dataTable(
        nearbyTable(
          'vias',
          'Vías más cercanas',
          d.context.roads,
          'No tenemos vías inventariadas en este radio.',
          ['osm-colombia-vias'],
          15,
        ),
      )}
      ${subsection('Hidrografía y relieve')} ${dataTable(d.hydrography)}`}`;
}

function slopeNote(slope: number): RawHtml {
  if (slope >= 45) {
    return html`<div class="warn">
      <span class="warn__title">Pendiente muy alta</span>La pendiente media supera el 45 %. En este
      rango suele haber restricción ambiental y el costo de construir se dispara. Verifique con
      Planeación municipal y con un estudio geotécnico.
    </div>`;
  }
  if (slope >= 25) {
    return html`<div class="warn">
      <span class="warn__title">Pendiente alta</span>La pendiente media supera el 25 %: construir
      encarece de forma apreciable (movimientos de tierra, muros de contención, accesos).
    </div>`;
  }
  return raw('');
}

function section5(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  return html`${paragraphs([
    'La vocación y la capacidad de uso describen para qué sirve mejor el suelo según sus características naturales (clima, pendiente, profundidad, fertilidad). No autorizan usos: eso lo define el POT del municipio.',
  ])}
  ${staticMapFigure(assets.maps[PARCEL_REPORT_ASSET_KEYS.maps.soils])}
  ${dataTable(soilsTable(d))}`;
}

function section6(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  return html`${staticMapFigure(assets.maps[PARCEL_REPORT_ASSET_KEYS.maps.hazards])}
  ${subsection('Amenazas')} ${dataTable(hazardsTable(d))}
  ${subsection('Áreas protegidas, territorios étnicos y títulos mineros')}
  ${dataTable(restrictionsTable(d))}
  <div class="warn">
    <span class="warn__title">Alcance de esta sección</span>${DISCLAIMERS.hazardScale}
  </div>`;
}

function section7(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  return html`${d.planningNote === NOT_AVAILABLE || d.planningNote === null
    ? html`<div class="warn">
        <span class="warn__title">POT no disponible para este municipio</span>No existe un
        repositorio nacional completo de Planes de Ordenamiento Territorial. Para este municipio no
        tenemos la cartografía del POT integrada: consulte la Secretaría de Planeación municipal con
        el número predial de este informe.
      </div>`
    : html`<div class="card">${d.planningNote}</div>`}
  ${staticMapFigure(assets.maps[PARCEL_REPORT_ASSET_KEYS.maps.planning])}
  ${dataTable(potTable(d))}
  <div class="warn">
    <span class="warn__title">Este informe no es un concepto de norma urbanística</span>
    ${DISCLAIMERS.notUrbanNorm}
  </div>`;
}

function section8(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  const c = d.context;
  const nearest = (items: readonly NearbyItem[]): RawHtml =>
    items.length > 0 && items[0]
      ? html`${isAvailable(items[0].name) ? items[0].name : 'sin nombre'} a
        ${formatDistance(items[0].distanceM)}`
      : showMaybe(null);
  return html`${kvList(
    [
      ['Radio analizado', html`${formatDistance(c.radiusM)}`],
      ['Población total alrededor', showMaybe(c.population.total, (v) => formatNumber(v))],
      ['Población en edad escolar', showMaybe(c.population.schoolAge, (v) => formatNumber(v))],
      ['Colegio más cercano', nearest(c.schools)],
      ['Prestador de salud más cercano', nearest(c.healthFacilities)],
      ['Puntos de comercio y servicios', html`${formatNumber(c.pois.length)}`],
    ],
    true,
  )}
  ${chartFigure(assets.charts[PARCEL_REPORT_ASSET_KEYS.charts.population])}
  ${chartFigure(assets.charts[PARCEL_REPORT_ASSET_KEYS.charts.distances])}
  ${spec.level === 'resumen'
    ? raw('')
    : html`${subsection('Población')} ${dataTable(populationTable(d))}
      ${subsection('Educación')}
      ${dataTable(
        nearbyTable(
          'colegios',
          'Establecimientos educativos más cercanos',
          c.schools,
          'No tenemos establecimientos educativos inventariados en este radio.',
          ['men-establecimientos-educativos'],
          15,
        ),
      )}
      ${subsection('Salud')}
      ${dataTable(
        nearbyTable(
          'salud',
          'Prestadores de salud más cercanos',
          c.healthFacilities,
          'No tenemos prestadores de salud inventariados en este radio.',
          ['minsalud-reps'],
          15,
        ),
      )}
      ${subsection('Comercio, servicios y accesibilidad')}
      ${dataTable(
        nearbyTable(
          'comercio',
          'Puntos de interés más cercanos',
          c.pois,
          'No tenemos puntos de interés inventariados en este radio.',
          ['osm-colombia-pois'],
          20,
        ),
      )}`}`;
}

function section9(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  const d = spec.data;
  const assets = resolveAssets(spec.assets);
  return html`${paragraphs([
    'Los semáforos comparan los datos del predio con umbrales declarados por uso objetivo. Cada factor muestra su valor crudo, su puntaje normalizado de 0 a 100, su peso y su fórmula, para que usted pueda estar en desacuerdo con el criterio y no solo con el resultado. TerraColombia no dice "compre" ni "no compre": entrega indicadores.',
  ])}
  ${chartFigure(assets.charts[PARCEL_REPORT_ASSET_KEYS.charts.factors])}
  ${d.suitability.length === 0
    ? html`<p class="table-empty">
        Este informe no incluye análisis de aptitud porque no se solicitó ningún uso objetivo.
      </p>`
    : joinHtml(d.suitability.map(verdictBlock))}
  ${d.indicators.length > 0
    ? html`${subsection('Indicadores')} ${indicatorGrid(d.indicators)}`
    : ''}
  ${spec.level === 'resumen' ? raw('') : html`${subsection('Historial')} ${dataTable(historyTable(d))}`}
  <div class="warn">
    <span class="warn__title">Qué es y qué no es este análisis</span>
    ${DISCLAIMERS.notAppraisal} ${DISCLAIMERS.notTitleStudy}
  </div>`;
}

/** Sección 10: obligatoria e íntegra en todos los niveles. */
function section10(spec: Extract<ReportSpec, { kind: 'parcel' }>): RawHtml {
  return html`${sourcesBlock(spec.meta, spec.verification)}
  ${spec.meta.warnings.length > 0
    ? warningsBlock(spec.meta.warnings, 'Advertencias sobre los datos de este informe')
    : ''}
  ${cadastralValueWarning()} ${legalBlock()} ${qrBlock(spec.verification, resolveAssets(spec.assets).qrSvg)}
  <p>
    <small>${DISCLAIMERS.noPersonalData} ${DISCLAIMERS.dataFreshness}</small>
  </p>`;
}

// ─── Tablas expuestas para las exportaciones ──────────────────────────────────

function identificationTable(data: ParcelReportData): ReportTable {
  const p = data.parcel;
  const hasValue = isAvailable(p.cadastralValue);
  return {
    id: 'identificacion',
    title: 'Identificación y características catastrales',
    columns: [
      { key: 'concept', label: 'Concepto', width: 44 },
      { key: 'value', label: 'Valor', width: 40 },
    ],
    rows: [
      { concept: 'Número Predial Nacional (30 dígitos)', value: p.npn },
      { concept: 'Código anterior (20 dígitos)', value: isAvailable(p.npnOld) ? p.npnOld : null },
      { concept: 'Municipio', value: `${data.municipality.name} (${data.municipality.code})` },
      { concept: 'Departamento', value: `${data.municipality.deptName} (${data.municipality.deptCode})` },
      { concept: 'Zona', value: isAvailable(p.zoneLabel) ? p.zoneLabel : (ZONE_LABEL[String(p.zone)] ?? null) },
      { concept: 'Dirección registrada', value: isAvailable(p.address) ? p.address : null },
      { concept: 'Área del terreno según geometría (m²)', value: isAvailable(p.areaGeomM2) ? p.areaGeomM2 : null },
      { concept: 'Área del terreno reportada (m²)', value: isAvailable(p.areaReportedM2) ? p.areaReportedM2 : null },
      { concept: 'Área construida (m²)', value: isAvailable(p.builtAreaM2) ? p.builtAreaM2 : null },
      { concept: 'Destino económico', value: isAvailable(p.economicUse) ? p.economicUse : null },
      { concept: 'Avalúo catastral (COP)', value: isAvailable(p.cadastralValue) ? p.cadastralValue : null },
      { concept: 'Vigencia del avalúo', value: isAvailable(p.valuationYear) ? p.valuationYear : null },
      { concept: 'Longitud del centroide (EPSG:4326)', value: p.centroid ? p.centroid[0] : null },
      { concept: 'Latitud del centroide (EPSG:4326)', value: p.centroid ? p.centroid[1] : null },
    ],
    emptyMessage: 'No hay datos catastrales para este predio.',
    sourceDatasetIds: ['igac-catastro-terreno'],
    shareAlike: true,
    hasCadastralValue: hasValue,
    note: hasValue
      ? 'Advertencia: avalúo catastral ≠ valor comercial. El avalúo catastral es un valor fiscal, no el precio de venta del predio.'
      : null,
  };
}

function suitabilityTable(data: ParcelReportData): ReportTable {
  const rows: Array<Record<string, string | number | null>> = [];
  for (const s of data.suitability) {
    for (const f of s.factors) {
      rows.push({
        use: s.targetUseLabel,
        verdict: s.verdictLabel,
        factor: f.label,
        raw: typeof f.rawValue === 'number' ? f.rawValue : (f.rawValue ?? null),
        unit: isAvailable(f.unit) ? f.unit : null,
        score: f.score,
        weight: f.weight,
        flag: f.flag,
        formula: f.formula,
        explanation: f.explanation,
        sources: f.sourceDatasetIds.join(', '),
      });
    }
  }
  return {
    id: 'aptitud',
    title: 'Análisis de aptitud: desglose por factor',
    columns: [
      { key: 'use', label: 'Uso objetivo', width: 24 },
      { key: 'verdict', label: 'Veredicto', width: 22 },
      { key: 'factor', label: 'Factor', width: 30 },
      { key: 'raw', label: 'Valor crudo', align: 'right', width: 14 },
      { key: 'unit', label: 'Unidad', width: 12 },
      { key: 'score', label: 'Puntaje 0–100', align: 'right', numFmt: '#,##0', width: 14 },
      { key: 'weight', label: 'Peso', align: 'right', numFmt: '0.0%', width: 10 },
      { key: 'flag', label: 'Estado', width: 12 },
      { key: 'formula', label: 'Fórmula', width: 44 },
      { key: 'explanation', label: 'Explicación', width: 56 },
      { key: 'sources', label: 'Fuentes', width: 30 },
    ],
    rows,
    emptyMessage: 'Este informe no incluye análisis de aptitud porque no se solicitó ningún uso objetivo.',
    sourceDatasetIds: [...new Set(data.suitability.flatMap((s) => s.factors.flatMap((f) => f.sourceDatasetIds)))],
  };
}

/**
 * Todas las tablas del informe de predio, en el orden de las secciones. Las usan las
 * exportaciones (XLSX, CSV) para que el PDF y la hoja de cálculo digan exactamente lo mismo.
 * Cada tabla declara si contiene datos con cláusula ShareAlike, para poder separarlas.
 */
export function parcelReportTables(data: ParcelReportData): ReportTable[] {
  return [
    identificationTable(data),
    buildingsTable(data),
    nearbyTable(
      'vias',
      'Vías más cercanas',
      data.context.roads,
      'No tenemos vías inventariadas en este radio.',
      ['osm-colombia-vias'],
      200,
    ),
    data.hydrography,
    soilsTable(data),
    hazardsTable(data),
    restrictionsTable(data),
    potTable(data),
    populationTable(data),
    nearbyTable(
      'colegios',
      'Establecimientos educativos más cercanos',
      data.context.schools,
      'No tenemos establecimientos educativos inventariados en este radio.',
      ['men-establecimientos-educativos'],
      200,
    ),
    nearbyTable(
      'salud',
      'Prestadores de salud más cercanos',
      data.context.healthFacilities,
      'No tenemos prestadores de salud inventariados en este radio.',
      ['minsalud-reps'],
      200,
    ),
    nearbyTable(
      'comercio',
      'Puntos de interés más cercanos',
      data.context.pois,
      'No tenemos puntos de interés inventariados en este radio.',
      ['osm-colombia-pois'],
      500,
    ),
    suitabilityTable(data),
    historyTable(data),
  ];
}

// ─── Plantilla completa ───────────────────────────────────────────────────────


export function renderParcelReport(spec: Extract<ReportSpec, { kind: 'parcel' }>): string {
  const branding = resolveBranding(spec.branding);
  const d = spec.data;
  const title = spec.titleOverride ?? REPORT_KIND_TITLE.parcel;
  const runningLeft = `${title} · ${d.municipality.name}`;
  const runningRight = d.parcel.npn;
  const footNote = branding.footerNote ?? (branding.whiteLabel ? branding.organizationName : 'TerraColombia');

  const bodies: RawHtml[] = [
    section1(spec),
    section2(spec),
    section3(spec),
    section4(spec),
    section5(spec),
    section6(spec),
    section7(spec),
    section8(spec),
    section9(spec),
    section10(spec),
  ];

  const sections = joinHtml(
    bodies.map((body, i) =>
      sectionBlock({
        num: i + 1,
        title: SECTIONS[i] ?? `Sección ${i + 1}`,
        body,
        runningLeft,
        runningRight,
        footNote,
      }),
    ),
  );

  const annexes =
    spec.level === 'tecnico'
      ? joinHtml(
          d.annexes.map((a, i) =>
            annexBlock(`A${i + 1}`, a.title, a.description, a.table),
          ),
        )
      : raw('');

  const body = html`${cover({
    branding,
    title,
    subtitle: spec.subtitle ?? `${d.municipality.name}, ${d.municipality.deptName}`,
    level: spec.level,
    facts: [
      ['Número Predial Nacional', formatNpnPretty(d.parcel.npn)],
      ['Municipio', `${d.municipality.name} (${d.municipality.code})`],
      ['Departamento', d.municipality.deptName],
      [
        'Fecha de corte de los datos',
        spec.meta.cutDate ?? MESSAGES.common.notAvailable,
      ],
      [
        'Gestor catastral',
        isAvailable(d.municipality.cadastralManager)
          ? d.municipality.cadastralManager
          : MESSAGES.common.notAvailable,
      ],
    ],
    meta: spec.meta,
    verification: spec.verification,
    requestedBy: spec.requestedBy ?? null,
  })}
  ${tableOfContents([
    ...SECTIONS.map((title, i): TocEntry => ({ num: String(i + 1), title })),
    ...(spec.level === 'tecnico'
      ? d.annexes.map((a, i): TocEntry => ({ num: `A${i + 1}`, title: a.title }))
      : []),
  ])}
  ${sections} ${annexes}`;

  return documentShell({ title: `${title} — ${d.parcel.npn}`, branding, body });
}
