import type {
  BBox,
  Building,
  Coverage,
  FactorScore,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  LngLat,
  Maybe,
  ParcelContext,
  ParcelSummary,
  ResponseMeta,
  SuitabilityResult,
} from '@terracolombia/shared';

/**
 * Modelo de entrada de los informes. Todo lo que aparece en un PDF entra por aquí:
 * el paquete no consulta la base ni la red, así que un informe es reproducible a
 * partir de su `ReportSpec` (PLAN.md §11: los informes son inmutables).
 */

// ─── Niveles y formatos ───────────────────────────────────────────────────────

export const REPORT_LEVELS = ['resumen', 'completo', 'tecnico'] as const;
export type ReportLevel = (typeof REPORT_LEVELS)[number];

export const REPORT_LEVEL_LABEL: Record<ReportLevel, string> = {
  resumen: 'Resumen',
  completo: 'Completo',
  tecnico: 'Técnico',
};

export const REPORT_LEVEL_DESCRIPTION: Record<ReportLevel, string> = {
  resumen:
    'Versión corta: las cifras principales de cada sección, sin tablas de detalle ni anexos.',
  completo: 'Todas las secciones con sus tablas de detalle.',
  tecnico:
    'Todas las secciones, tablas de detalle y anexos con los datos tal como llegan de cada fuente.',
};

export const REPORT_FORMATS = ['pdf', 'xlsx', 'csv', 'geojson', 'gpkg', 'shp', 'kml'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_KINDS = ['parcel', 'area', 'location', 'change', 'municipality'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_TITLE: Record<ReportKind, string> = {
  parcel: 'Informe Territorial de Predio',
  area: 'Informe de Zona',
  location: 'Informe de Localización de Negocio',
  change: 'Informe de Cambio Territorial',
  municipality: 'Informe Municipal',
};

/** Nombre canónico del archivo/hoja de procedencia. Obligatorio en toda exportación. */
export const SOURCES_SHEET_NAME = 'FUENTES_Y_LICENCIA';

/** Sufijos que separan los datos con cláusula ShareAlike de los indicadores propios. */
export const SHARE_ALIKE_PART = 'DATOS_ABIERTOS_SHAREALIKE';
export const OWN_INDICATORS_PART = 'INDICADORES_TERRACOLOMBIA';

// ─── Marca (marca blanca para planes Business+) ───────────────────────────────

export interface ReportBranding {
  /** Nombre que encabeza el informe. */
  organizationName: string;
  /** Logo incrustado como `data:` URI. Nunca una URL remota: el PDF no debe depender de red. */
  logoDataUri: string | null;
  /** Color principal en formato `#RRGGBB`. Se sanea antes de entrar al CSS. */
  primaryColor: string;
  accentColor: string;
  website: string | null;
  contactEmail: string | null;
  /** Pie de página adicional del cliente. */
  footerNote: string | null;
  /**
   * true cuando el plan permite sustituir la marca de TerraColombia por la del cliente
   * (`entitlements.canUseWhiteLabel`). Si es false, el pie mantiene "Generado por TerraColombia".
   */
  whiteLabel: boolean;
  /** Texto de la marca de agua diagonal (`entitlements.watermark`). */
  watermarkText: string | null;
}

export const DEFAULT_BRANDING: ReportBranding = {
  organizationName: 'TerraColombia',
  logoDataUri: null,
  // Paleta accesible validada (ver src/charts.ts): azul slot 1 y naranja slot 2.
  primaryColor: '#184f95',
  accentColor: '#eb6834',
  website: null,
  contactEmail: null,
  footerNote: null,
  whiteLabel: false,
  watermarkText: null,
};

/** Solo se aceptan colores hexadecimales; cualquier otra cosa se descarta (evita inyección en CSS). */
export function safeColor(value: string | null | undefined, fallback: string): string {
  if (typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
    return value;
  }
  return fallback;
}

/** Solo se aceptan `data:` URI de imagen: un logo remoto rompería el aislamiento del render. */
export function safeLogo(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^data:image\/(png|jpeg|jpg|webp|svg\+xml|gif);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : null;
}

export function resolveBranding(partial?: Partial<ReportBranding> | null): ReportBranding {
  const b = partial ?? {};
  return {
    organizationName:
      typeof b.organizationName === 'string' && b.organizationName.trim().length > 0
        ? b.organizationName.trim().slice(0, 120)
        : DEFAULT_BRANDING.organizationName,
    logoDataUri: safeLogo(b.logoDataUri),
    primaryColor: safeColor(b.primaryColor, DEFAULT_BRANDING.primaryColor),
    accentColor: safeColor(b.accentColor, DEFAULT_BRANDING.accentColor),
    website: b.website ?? null,
    contactEmail: b.contactEmail ?? null,
    footerNote: b.footerNote ?? null,
    whiteLabel: b.whiteLabel === true,
    watermarkText: b.watermarkText ?? null,
  };
}

// ─── Verificación e inmutabilidad ─────────────────────────────────────────────

export interface ReportVerification {
  /** Identificador del informe en `app.report`. */
  reportId: string;
  /** URL pública que el QR codifica. La página compara `checksum`. */
  verifyUrl: string;
  /** Momento de emisión, ISO 8601. */
  issuedAt: string;
  /** Huella del contenido del informe; null si aún no se ha calculado. */
  checksum: string | null;
  /** `datasetId` → `snapshotId` usado. Ata el informe a los cortes exactos. */
  snapshotIds: Record<string, string>;
}

// ─── Recursos ya renderizados (mapas, gráficos, QR) ───────────────────────────

export interface ReportImageAsset {
  /** `data:` URI (PNG o SVG). Se incrusta en el HTML antes de pasar a Playwright. */
  src: string;
  /** Texto alternativo obligatorio: los informes se leen también con lector de pantalla. */
  alt: string;
  caption: string | null;
  /** Atribución que debe quedar visible junto a la imagen (mapa base, fuente del dato). */
  attribution: string | null;
  /** true cuando el mapa se generó con el respaldo SVG, sin teselas de mapa base. */
  withoutBasemap?: boolean;
  /** Ancho/alto en píxeles del recurso, para reservar el espacio en la maqueta. */
  widthPx?: number;
  heightPx?: number;
}

export interface ReportAssets {
  /** Mapas estáticos por clave (`localizacion`, `contexto`, `suelos`…). */
  maps: Record<string, ReportImageAsset | undefined>;
  /** Gráficos por clave (`uso_economico`, `poblacion_edad`, `factores`…). */
  charts: Record<string, ReportImageAsset | undefined>;
  /** QR de verificación ya renderizado como SVG en línea. */
  qrSvg: string | null;
}

export const EMPTY_ASSETS: ReportAssets = { maps: {}, charts: {}, qrSvg: null };

export function resolveAssets(partial?: Partial<ReportAssets> | null): ReportAssets {
  return {
    maps: partial?.maps ?? {},
    charts: partial?.charts ?? {},
    qrSvg: partial?.qrSvg ?? null,
  };
}

// ─── Tablas e indicadores ─────────────────────────────────────────────────────

export type ReportCell = string | number | null;

export interface ReportTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Formato numérico de ExcelJS, en convención es-CO (p. ej. `#,##0.00`). */
  numFmt?: string;
  /** Ancho sugerido para XLSX, en caracteres. */
  width?: number;
}

export interface ReportTable {
  id: string;
  title: string;
  columns: ReportTableColumn[];
  rows: Array<Record<string, ReportCell>>;
  /** Nota al pie de la tabla: procedencia, unidades, advertencias. */
  note?: string | null;
  /** `datasetId` de cada cifra de la tabla. Regla 4: sin procedencia no se muestra. */
  sourceDatasetIds: string[];
  /** Texto honesto cuando no hay filas (nunca una tabla vacía sin explicación). */
  emptyMessage?: string;
  /**
   * true si la tabla contiene datos con cláusula ShareAlike (IGAC, OSM). Se exporta en
   * archivo/hoja separada de los indicadores propios (PLAN.md §2).
   */
  shareAlike?: boolean;
  /** true si la tabla contiene cifras económicas catastrales (obliga la advertencia). */
  hasCadastralValue?: boolean;
}

export function emptyTable(
  id: string,
  title: string,
  emptyMessage: string,
  sourceDatasetIds: string[] = [],
): ReportTable {
  return { id, title, columns: [], rows: [], sourceDatasetIds, emptyMessage };
}

export interface ReportIndicator {
  id: string;
  label: string;
  /** Valor ya formateado en es-CO, o el texto de "no disponible". */
  value: string;
  rawValue: number | string | null;
  unit: string | null;
  /** Fórmula legible: obligatoria para poder contestar "¿Cómo se calcula?". */
  formula: string;
  /** Explicación en español claro para una persona no técnica. */
  explanation: string;
  sourceDatasetIds: string[];
  flag?: 'ok' | 'caution' | 'blocker' | 'unknown';
  /** true si es un indicador propio de TerraColombia y no un dato de la fuente. */
  own?: boolean;
}

/** Sección genérica para los informes que no son el de predio. */
export interface ReportSection {
  id: string;
  title: string;
  paragraphs: string[];
  tables: ReportTable[];
  indicators: ReportIndicator[];
  /** Claves de `assets.maps` a insertar en esta sección. */
  mapKeys: string[];
  /** Claves de `assets.charts` a insertar en esta sección. */
  chartKeys: string[];
  /** Niveles en los que se imprime la sección; por omisión, todos. */
  levels?: ReportLevel[];
  warnings: string[];
}

export function section(partial: Partial<ReportSection> & { id: string; title: string }): ReportSection {
  return {
    paragraphs: [],
    tables: [],
    indicators: [],
    mapKeys: [],
    chartKeys: [],
    warnings: [],
    ...partial,
  };
}

export interface ReportAnnex {
  id: string;
  title: string;
  /** Descripción de qué contiene el anexo y de dónde sale. */
  description: string;
  table: ReportTable;
}

// ─── Fichas auxiliares ────────────────────────────────────────────────────────

export interface MunicipalityBrief {
  code: string;
  name: string;
  deptCode: string;
  deptName: string;
  cadastralManager: Maybe<string>;
  isIgac: boolean | null;
  populationTotal: Maybe<number>;
  areaKm2: Maybe<number>;
  centroid: LngLat | null;
}

export interface ParcelHistoryEntry {
  cutDate: string;
  /** `created` | `removed` | `attrs_changed` | `geometry_changed` | `building_added` */
  changeType: string;
  changeLabel: string;
  detail: string;
}

// ─── Informe Territorial de Predio (M7) ───────────────────────────────────────

export interface ParcelReportData {
  parcel: ParcelSummary;
  /** Geometría del terreno, para el mapa estático y para las exportaciones espaciales. */
  parcelGeometry: GeoJsonGeometry | null;
  /** Extensión usada al dibujar el mapa de localización. */
  parcelBBox: BBox | null;
  buildings: Building[];
  context: ParcelContext;
  municipality: MunicipalityBrief;
  coverage: Coverage;
  /** Hidrografía y relieve cercanos; vacío cuando la fuente no cubre la zona. */
  hydrography: ReportTable;
  /** Aptitud por uso objetivo evaluado. Puede venir vacío (el usuario no pidió ninguno). */
  suitability: SuitabilityResult[];
  history: ParcelHistoryEntry[];
  /** Texto del POT cuando existe; `NO_DISPONIBLE` cuando hay que remitir a Planeación. */
  planningNote: Maybe<string>;
  /** Títulos mineros u otras restricciones puntuales, si aplica. */
  miningTitles: ReportTable;
  /** Indicadores propios de TerraColombia (accesibilidad, densidad, oferta educativa…). */
  indicators: ReportIndicator[];
  /** Anexos de datos crudos; solo se imprimen en nivel técnico. */
  annexes: ReportAnnex[];
  /** Advertencias específicas de este predio (p. ej. geometría sin registro alfanumérico). */
  warnings: string[];
}

// ─── Informe de Zona ──────────────────────────────────────────────────────────

export interface AreaReportData {
  /** Nombre que el usuario le dio a la zona. */
  title: string;
  /** "Polígono dibujado", "Radio de 500 m alrededor de…", "Municipio de…". */
  scopeLabel: string;
  geometry: GeoJsonGeometry | null;
  bbox: BBox | null;
  areaKm2: number;
  municipalities: MunicipalityBrief[];
  coverage: Coverage;
  /** Cifras de cabecera del tablero. */
  headline: ReportIndicator[];
  parcels: ReportTable;
  landUse: ReportTable;
  population: ReportTable;
  education: ReportTable;
  health: ReportTable;
  commerce: ReportTable;
  roads: ReportTable;
  soils: ReportTable;
  hazards: ReportTable;
  protectedAreas: ReportTable;
  ethnicTerritories: ReportTable;
  potZones: ReportTable;
  relief: ReportTable;
  indicators: ReportIndicator[];
  /** Secciones adicionales que la API quiera añadir sin cambiar este tipo. */
  extraSections: ReportSection[];
  annexes: ReportAnnex[];
  warnings: string[];
}

// ─── Informe de Localización de Negocio ───────────────────────────────────────

export interface LocationWeight {
  indicator: string;
  label: string;
  weight: number;
  /** 'higher_is_better' | 'lower_is_better' | 'categorical' */
  direction: string;
  formula: string;
  sourceDatasetIds: string[];
}

export interface LocationReportData {
  templateId: string;
  templateLabel: string;
  scopeLabel: string;
  geometry: GeoJsonGeometry | null;
  bbox: BBox | null;
  h3Resolution: number;
  /** Pesos con los que el usuario corrió el análisis. Se imprimen para poder reproducirlo. */
  weights: LocationWeight[];
  /** Celdas mejor puntuadas, ya ordenadas. */
  topCells: ReportTable;
  /** Desglose por factor de la celda líder (explicabilidad, PLAN.md §9). */
  leadingCellFactors: FactorScore[];
  /** Predios candidatos dentro de las celdas líderes. */
  candidateParcels: ReportTable;
  /** Umbrales aplicados; vacío si el usuario no puso ninguno. */
  thresholds: ReportTable;
  headline: ReportIndicator[];
  indicators: ReportIndicator[];
  methodology: string[];
  extraSections: ReportSection[];
  annexes: ReportAnnex[];
  warnings: string[];
}

// ─── Informe de Cambio Territorial ────────────────────────────────────────────

export interface ChangeReportData {
  scopeLabel: string;
  geometry: GeoJsonGeometry | null;
  bbox: BBox | null;
  fromCutDate: string;
  toCutDate: string;
  headline: ReportIndicator[];
  byType: ReportTable;
  createdParcels: ReportTable;
  removedParcels: ReportTable;
  geometryChanges: ReportTable;
  attributeChanges: ReportTable;
  newBuildings: ReportTable;
  indicators: ReportIndicator[];
  methodology: string[];
  extraSections: ReportSection[];
  annexes: ReportAnnex[];
  warnings: string[];
}

// ─── Informe Municipal ────────────────────────────────────────────────────────

export interface MunicipalityReportData {
  municipality: MunicipalityBrief;
  coverage: Coverage;
  geometry: GeoJsonGeometry | null;
  bbox: BBox | null;
  headline: ReportIndicator[];
  /** Series de tiempo (una tabla por indicador, periodo en filas). */
  timeSeries: ReportTable[];
  /** Posición del municipio frente a sus pares. */
  rankings: ReportTable;
  cadastralDynamics: ReportTable;
  landUse: ReportTable;
  population: ReportTable;
  education: ReportTable;
  health: ReportTable;
  indicators: ReportIndicator[];
  extraSections: ReportSection[];
  annexes: ReportAnnex[];
  warnings: string[];
}

// ─── Especificación del informe ───────────────────────────────────────────────

export interface ReportSpecBase {
  level: ReportLevel;
  /** Marca del cliente; se ignora si el plan no incluye marca blanca. */
  branding?: Partial<ReportBranding> | null;
  verification: ReportVerification;
  assets?: Partial<ReportAssets> | null;
  /** Bloque de procedencia con `sources[]`, `cutDate`, `coverage` y `synthetic`. */
  meta: ResponseMeta;
  /** Título que sustituye al canónico del tipo de informe, si el usuario puso uno. */
  titleOverride?: string | null;
  /** Subtítulo para la portada. */
  subtitle?: string | null;
  /** Nombre de quien solicitó el informe (organización, nunca datos personales de terceros). */
  requestedBy?: string | null;
}

export type ReportSpec =
  | (ReportSpecBase & { kind: 'parcel'; data: ParcelReportData })
  | (ReportSpecBase & { kind: 'area'; data: AreaReportData })
  | (ReportSpecBase & { kind: 'location'; data: LocationReportData })
  | (ReportSpecBase & { kind: 'change'; data: ChangeReportData })
  | (ReportSpecBase & { kind: 'municipality'; data: MunicipalityReportData });

// ─── Salida ───────────────────────────────────────────────────────────────────

export interface ReportOutput {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface ExportRequest {
  spec: ReportSpec;
  format: Exclude<ReportFormat, 'pdf'>;
  /**
   * Capa geográfica a exportar en los formatos espaciales (GeoJSON, GPKG, SHP, KML).
   * Si falta, se construye a partir de la geometría del informe.
   */
  features?: GeoJsonFeatureCollection | null;
  /** Nombre base del archivo, sin extensión. */
  filenameBase?: string | null;
  /** Nombre de la capa en GPKG/SHP/KML. Solo `[A-Za-z0-9_]`. */
  layerName?: string | null;
  /**
   * Propiedades de `features` que son **indicadores propios** de TerraColombia. Se exportan
   * en una capa/archivo aparte de las propiedades que vienen de datos con cláusula ShareAlike.
   * Si no se declara ninguna, todas las propiedades se tratan como ShareAlike, que es el
   * comportamiento conservador.
   */
  ownPropertyKeys?: string[] | null;
  /** Propiedad que sirve de llave para cruzar las dos capas (por omisión `npn`). */
  joinPropertyKey?: string | null;
}

/** Media type del artefacto suelto de cada formato (lo que sirve la GeoAPI). */
export const CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  geojson: 'application/geo+json',
  gpkg: 'application/geopackage+sqlite3',
  shp: 'application/octet-stream',
  kml: 'application/vnd.google-earth.kml+xml',
};

/**
 * Media type de la **descarga** de cada formato. Los formatos que necesitan separar los
 * datos ShareAlike de los indicadores propios en archivos distintos, y añadir
 * `FUENTES_Y_LICENCIA.txt`, viajan en ZIP (PLAN.md §2 y §11). XLSX y GPKG no lo necesitan
 * porque llevan hojas/capas dentro del mismo archivo.
 */
export const DELIVERY_CONTENT_TYPES: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: CONTENT_TYPES.xlsx,
  csv: 'application/zip',
  geojson: 'application/zip',
  gpkg: CONTENT_TYPES.gpkg,
  shp: 'application/zip',
  kml: 'application/zip',
};

/** Extensión real del archivo entregado. */
export const FORMAT_EXTENSION: Record<ReportFormat, string> = {
  pdf: 'pdf',
  xlsx: 'xlsx',
  csv: 'zip',
  geojson: 'zip',
  gpkg: 'gpkg',
  shp: 'zip',
  kml: 'zip',
};

/** true si la descarga de ese formato es un ZIP y por tanto lleva `FUENTES_Y_LICENCIA.txt`. */
export function isZipDelivery(format: ReportFormat): boolean {
  return FORMAT_EXTENSION[format] === 'zip';
}
