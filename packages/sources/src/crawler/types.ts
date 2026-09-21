/**
 * Tipos del catálogo de Fase 0.
 *
 * Son tipos propios de `@terracolombia/sources`: describen lo que el crawler
 * observó en la fuente, no el modelo de datos del producto (ese vive en
 * `packages/shared`). Se serializan tal cual a `data-catalog/<fuente>/<servicio>.json`.
 */

import type { GeoJsonFeature } from '@terracolombia/shared';

export const CATALOG_SCHEMA_VERSION = 1;

/** Entidad que publica el dato. */
export type SourceId =
  | 'igac'
  | 'datos-gov-co'
  | 'dane'
  | 'men'
  | 'minsalud'
  | 'secop'
  | 'osm'
  | 'sgc'
  | 'ideam'
  | 'pnn'
  | 'upra'
  | 'ant';

export type ConnectorKind =
  | 'arcgis-rest'
  | 'socrata'
  | 'wfs'
  | 'file-download'
  | 'osm'
  | 'manual';

// ─── Campos ───────────────────────────────────────────────────────────────────

export interface CatalogFieldDomain {
  type: string;
  name: string | null;
  /** Valores codificados, truncados a 50 para no inflar el JSON. */
  codedValues: { code: string | number; name: string }[];
  /** true si se truncó la lista de valores. */
  truncated: boolean;
  range: [number, number] | null;
}

export interface CatalogField {
  name: string;
  alias: string | null;
  /** Tipo tal como lo declara la fuente (`esriFieldTypeString`, `text`…). */
  type: string;
  length: number | null;
  nullable: boolean | null;
  domain: CatalogFieldDomain | null;
  /** true si la lista negra de PII lo descartó. */
  pii: boolean;
  /** Regla que lo descartó, si aplica. */
  piiRuleId: string | null;
  piiReason: string | null;
  /** true si es un identificador registral que conviene vigilar (matrícula, FMI). */
  piiAdjacent: boolean;
}

// ─── Capas ────────────────────────────────────────────────────────────────────

export interface CatalogExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  wkid: number | null;
}

export interface CatalogLayer {
  /** Identificador dentro del servicio (`0`, `1`…). */
  id: number;
  name: string;
  /** `Feature Layer`, `Table`, `Raster Layer`… */
  type: string | null;
  description: string | null;
  /** `esriGeometryPolygon`, `esriGeometryPoint`… `null` en tablas. */
  geometryType: string | null;
  url: string;
  /** CRS declarado: `latestWkid` si existe, si no `wkid`. */
  wkid: number | null;
  latestWkid: number | null;
  /** Descripción legible del CRS para el informe. */
  crsLabel: string;
  maxRecordCount: number | null;
  capabilities: string[];
  supportedQueryFormats: string[];
  supportsPagination: boolean | null;
  supportsStatistics: boolean | null;
  supportsOrderBy: boolean | null;
  objectIdField: string | null;
  displayField: string | null;
  /** Conteo de registros si el servicio lo permitió; `null` si no. */
  count: number | null;
  extent: CatalogExtent | null;
  fields: CatalogField[];
  /** Muestra de hasta 5 registros, ya filtrada de PII. */
  sample: Record<string, unknown>[];
  /** Cuántos registros se pidieron para la muestra y cuántos llegaron. */
  sampleRequested: number;
  sampleReturned: number;
  /** Columnas eliminadas de la muestra por la lista negra. */
  piiDroppedColumns: string[];
  /** Columnas cuyo valor se redactó por heurística de contenido. */
  piiRedactedColumns: string[];
  /** Avisos de la inspección (paginación degradada, formato, errores tolerados). */
  notes: string[];
  /** Error que impidió inspeccionar la capa, si lo hubo. */
  error: string | null;
}

// ─── Servicios ────────────────────────────────────────────────────────────────

export interface CatalogService {
  schemaVersion: number;
  source: SourceId;
  connector: ConnectorKind;
  /** Nombre del servicio sin carpeta. */
  name: string;
  /** Carpeta del catálogo ArcGIS (`catastro`, `agrologia`…); `''` en la raíz. */
  folder: string;
  /** `MapServer`, `FeatureServer`, `ImageServer`… */
  serviceType: string;
  url: string;
  description: string | null;
  copyrightText: string | null;
  /** Versión del servidor ArcGIS. */
  currentVersion: number | null;
  capabilities: string[];
  supportedQueryFormats: string[];
  maxRecordCount: number | null;
  /** Extensiones anunciadas: `WFSServer`, `WMSServer`. */
  supportedExtensions: string[];
  spatialReferenceWkid: number | null;
  fullExtent: CatalogExtent | null;
  layers: CatalogLayer[];
  tables: CatalogLayer[];
  /** Momento de la inspección. */
  inspectedAt: string;
  /** Duración total de la inspección del servicio, en ms. */
  durationMs: number;
  notes: string[];
  error: string | null;
}

// ─── Datasets de portales tipo Socrata ────────────────────────────────────────

export interface CatalogSocrataDataset {
  schemaVersion: number;
  source: SourceId;
  connector: 'socrata';
  /** Identificador de 4x4 de Socrata (`et8i-qmah`). */
  id: string;
  name: string;
  description: string | null;
  publisher: string | null;
  category: string | null;
  theme: string | null;
  tags: string[];
  license: string | null;
  attribution: string | null;
  /** URL de la API de datos (`/resource/{id}.json`). */
  dataUri: string | null;
  /** Página del dataset en el portal. */
  webUri: string | null;
  /** Portal ArcGIS Hub de origen, cuando el dataset es un espejo. */
  homepage: string | null;
  createdAt: string | null;
  dataUpdatedAt: string | null;
  cutDate: string | null;
  /** BBox declarada `minLon,minLat,maxLon,maxLat`. */
  geographicCoverage: string | null;
  /** Conteo exacto si `$select=count(*)` funcionó. */
  rowCount: number | null;
  columns: { name: string; jsType: string; pii: boolean; piiReason: string | null }[];
  sample: Record<string, unknown>[];
  piiDroppedColumns: string[];
  piiRedactedColumns: string[];
  notes: string[];
  error: string | null;
  inspectedAt: string;
}

// ─── Descriptores manuales ────────────────────────────────────────────────────

/**
 * Fuente que no se puede recorrer por API (portales de descarga con formularios,
 * geoportales que sirven HTML). Se registra con la URL verificada a mano.
 */
export interface CatalogManualDescriptor {
  schemaVersion: number;
  source: SourceId;
  connector: ConnectorKind;
  id: string;
  name: string;
  description: string;
  /** URL verificada por el crawler (se comprueba con HEAD/GET). */
  url: string;
  /** Estado HTTP observado al verificar la URL. */
  httpStatus: number | null;
  format: string;
  license: string;
  attribution: string;
  frequency: string;
  /** Qué queda por verificar a mano. */
  pending: string[];
  notes: string[];
  inspectedAt: string;
}

// ─── Registro de descartes de PII ─────────────────────────────────────────────

export interface PiiDiscardRecord {
  source: SourceId;
  /** Servicio o dataset donde apareció. */
  container: string;
  /** Capa/tabla concreta. */
  layer: string;
  column: string;
  /** `column-name` si lo detectó la lista negra; `content-heuristic` si fue el valor. */
  detectedBy: 'column-name' | 'content-heuristic';
  ruleId: string;
  reason: string;
  /** `dropped` (columna eliminada) o `redacted` (valor sustituido). */
  action: 'dropped' | 'redacted';
  detectedAt: string;
}

// ─── Riesgos ──────────────────────────────────────────────────────────────────

export type RiskSeverity = 'alta' | 'media' | 'baja';

export interface CatalogRisk {
  id: string;
  severity: RiskSeverity;
  source: SourceId | 'general';
  /** Servicio/dataset afectado, o `''` si es transversal. */
  target: string;
  title: string;
  detail: string;
  /** Qué se propone hacer. */
  mitigation: string;
  /** Módulos del plan afectados (`M1`…`M12`). */
  modules: string[];
}

// ─── Resumen de la corrida ────────────────────────────────────────────────────

export interface CrawlRunSummary {
  schemaVersion: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Fuentes solicitadas en esta corrida. */
  sources: string[];
  counts: {
    servicesDiscovered: number;
    servicesInspected: number;
    servicesFailed: number;
    layersCatalogued: number;
    layersWithSample: number;
    socrataDatasets: number;
    manualDescriptors: number;
    piiColumnsDropped: number;
    piiValuesRedacted: number;
  };
  http: { requests: number; cacheHits: number; retries: number; errors: number; bytes: number };
  gdal: { available: boolean; path: string | null; version: string | null };
  notes: string[];
}

/** Muestra de features ya convertida a filas planas para el catálogo. */
export function featuresToRows(features: readonly GeoJsonFeature[]): Record<string, unknown>[] {
  return features.map((f) => ({ ...(f.properties ?? {}) }));
}
