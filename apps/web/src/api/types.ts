/**
 * Tipos de la capa de transporte que **no** viven en `@terracolombia/shared`.
 *
 * Todo lo que el paquete compartido ya define (ParcelSummary, ParcelContext,
 * SuitabilityResult, FactorScore, ResponseMeta, Coverage, SourceRef, los esquemas del DSL…)
 * se reutiliza tal cual. Aquí solo se declaran las formas de respuesta que el contrato
 * de §9 describe en prosa y que el API todavía no exporta como Zod.
 *
 * SUPUESTOS DEL CONTRATO (documentados también en el README):
 * - Toda respuesta viene envuelta en `{ data, meta }` con `meta: ResponseMeta`.
 * - Las listas paginadas traen `items` + `nextCursor` dentro de `data`.
 * - Las operaciones asíncronas devuelven `{ jobId, status }` como `data`.
 */
import type {
  BBox,
  Building,
  Coverage,
  FactorScore,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  LngLat,
  ParcelContext,
  ParcelSummary,
  PlanCode,
  Entitlements,
  SourceRef,
} from '@terracolombia/shared';

// ─── Paginación ───────────────────────────────────────────────────────────────

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Total exacto cuando el backend lo puede calcular sin costo; null si no. */
  total: number | null;
}

// ─── Trabajos asíncronos ──────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobHandle {
  jobId: string;
  status: JobStatus;
}

export interface Job<TResult = unknown> extends JobHandle {
  /** 0–100. null mientras el worker no reporte progreso. */
  progress: number | null;
  /** Etapa legible en español, p. ej. "Calculando población". */
  stage: string | null;
  result: TResult | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  finishedAt: string | null;
}

/** Un resultado que puede llegar de inmediato o como trabajo en cola. */
export type SyncOrJob<T> = { kind: 'result'; result: T } | { kind: 'job'; job: JobHandle };

// ─── Búsqueda universal ───────────────────────────────────────────────────────

export type SearchResultKind =
  | 'parcel'
  | 'municipality'
  | 'department'
  | 'address'
  | 'place'
  | 'coordinates';

export interface SearchResult {
  kind: SearchResultKind;
  /** NPN para predios, código DIVIPOLA para municipios, id interno en los demás. */
  id: string;
  label: string;
  /** Segunda línea: municipio y departamento, o el tipo de topónimo. */
  sublabel: string | null;
  centroid: LngLat | null;
  bbox: BBox | null;
  /** 0–1: qué tan seguro está el backend de la coincidencia. */
  confidence: number;
  muniCode: string | null;
}

// ─── Municipio ────────────────────────────────────────────────────────────────

export interface MunicipalityDetail {
  code: string;
  name: string;
  deptCode: string;
  deptName: string;
  centroid: LngLat | null;
  bbox: BBox | null;
  areaKm2: number | null;
  population: number | null;
  /** Cortes disponibles de la base catastral, del más reciente al más antiguo. */
  availableCutDates: string[];
  coverage: Coverage;
}

// ─── Predio ───────────────────────────────────────────────────────────────────

export interface ParcelDetail {
  summary: ParcelSummary;
  buildings: Building[];
  geometry: GeoJsonGeometry | null;
  /** Campos abiertos de los Registros 1 y 2 tal cual llegan. Sección "datos crudos". */
  attrs: Record<string, unknown>;
  homogeneousZones: Array<{
    kind: 'fisica' | 'geoeconomica';
    code: string | null;
    label: string | null;
  }>;
  /** Cortes en los que este NPN existe. */
  cutDates: string[];
}

export type ParcelChangeType =
  | 'created'
  | 'removed'
  | 'attrs_changed'
  | 'geometry_changed'
  | 'building_added';

export interface ParcelHistoryEntry {
  fromCutDate: string;
  toCutDate: string;
  changeType: ParcelChangeType;
  /** Descripción en español lista para mostrar. */
  label: string;
  detail: Record<string, unknown>;
}

export interface ParcelQueryRow {
  npn: string;
  muniCode: string;
  muniName: string;
  address: string | null;
  zoneLabel: string | null;
  areaM2: number | null;
  builtAreaM2: number | null;
  economicUse: string | null;
  cadastralValue: number | null;
  centroid: LngLat | null;
  /** Distancia al filtro `near` que la generó, cuando se ordenó por distancia. */
  distanceM: number | null;
}

// ─── Cercanías ────────────────────────────────────────────────────────────────

export interface NearbyResponse {
  center: LngLat;
  radiusM: number;
  byLayer: Record<string, ParcelContext['schools']>;
}

// ─── Análisis de zona ─────────────────────────────────────────────────────────

/** Una fila de tablero: siempre con unidad y con los datasets que la respaldan. */
export interface MetricRow {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  /** Datasets que respaldan la cifra. Sin esto la UI no la muestra (regla 4). */
  sourceDatasetIds: string[];
  /** Explicación corta en español. */
  note?: string;
}

export interface DistributionBucket {
  label: string;
  value: number;
  /** Porcentaje 0–100 cuando aplique. */
  pct: number | null;
}

export interface AreaAnalysisSection {
  id: string;
  label: string;
  metrics: MetricRow[];
  distributions: Array<{ key: string; label: string; unit: string | null; buckets: DistributionBucket[] }>;
  warnings: string[];
}

export interface AreaAnalysisResult {
  /** Identificador estable para guardar y comparar zonas. */
  id: string;
  label: string;
  areaKm2: number;
  geometry: GeoJsonGeometry;
  bbox: BBox;
  sections: AreaAnalysisSection[];
  coverage: Coverage | null;
}

// ─── Localización de negocio ──────────────────────────────────────────────────

export interface LocationIntelTemplate {
  id: string;
  name: string;
  /** Para quién es, en una línea. */
  audience: string;
  description: string;
  indicators: Array<{
    key: string;
    label: string;
    /** Peso por omisión, 0–1. */
    defaultWeight: number;
    direction: FactorScore['direction'];
    unit: string | null;
    /** Id de la entrada de glosario que lo explica. */
    glossaryId: string | null;
    formula: string;
    sourceDatasetIds: string[];
  }>;
}

export interface ScoredCell {
  h3: string;
  score: number;
  /** Aporte de cada indicador al puntaje, para explicabilidad. */
  breakdown: Array<{ key: string; raw: number | null; normalized: number | null; weighted: number | null }>;
}

export interface LocationIntelResult {
  templateId: string;
  resolution: 7 | 8 | 9;
  /** Celdas puntuadas, ya ordenadas de mayor a menor. */
  cells: ScoredCell[];
  /** Zonas agrupadas (celdas contiguas) para el listado "top zonas". */
  topZones: Array<{
    id: string;
    label: string;
    score: number;
    cellCount: number;
    centroid: LngLat;
    muniCode: string | null;
    /** Predios candidatos dentro de la zona; vacío si el municipio no tiene catastro. */
    candidateParcels: ParcelQueryRow[];
  }>;
  indicators: LocationIntelTemplate['indicators'];
}

// ─── Cambio territorial ───────────────────────────────────────────────────────

export interface ChangeItem {
  npn: string;
  changeType: ParcelChangeType;
  label: string;
  areaBeforeM2: number | null;
  areaAfterM2: number | null;
  centroid: LngLat | null;
  detail: Record<string, unknown>;
}

export interface ChangeCompareResult {
  fromCutDate: string;
  toCutDate: string;
  counts: Record<ParcelChangeType, number>;
  items: ChangeItem[];
  /** Geometrías para pintar el antes/después en el mapa. */
  before: GeoJsonFeatureCollection | null;
  after: GeoJsonFeatureCollection | null;
}

// ─── Observatorio ─────────────────────────────────────────────────────────────

export interface IndicatorSeriesPoint {
  period: string;
  value: number | null;
}

export interface MunicipalIndicators {
  muniCode: string;
  muniName: string;
  coverage: Coverage;
  indicators: Array<{
    key: string;
    label: string;
    unit: string | null;
    latest: number | null;
    latestPeriod: string | null;
    /** Puesto nacional y total comparado, cuando el backend lo calcula. */
    rank: { position: number; of: number } | null;
    series: IndicatorSeriesPoint[];
    formula: string;
    sourceDatasetIds: string[];
  }>;
}

// ─── Informes ─────────────────────────────────────────────────────────────────

export type ReportKind = 'parcel' | 'area' | 'location_intel' | 'change' | 'municipality';
export type ReportLevel = 'summary' | 'full' | 'technical';
export type ExportFormat = Entitlements['exportFormats'][number];

export interface ReportSummary {
  id: string;
  kind: ReportKind;
  level: ReportLevel;
  title: string;
  status: JobStatus;
  createdAt: string;
  /** Formatos ya generados y descargables. */
  formats: ExportFormat[];
  /** Snapshots congelados: hacen el informe inmutable y verificable. */
  sources: SourceRef[];
  projectId: string | null;
}

export interface CreateReportInput {
  kind: ReportKind;
  level: ReportLevel;
  title?: string;
  projectId?: string;
  /** Objeto del informe: NPN, ámbito de área o id de un análisis guardado. */
  subject:
    | { kind: 'parcel'; npn: string }
    | { kind: 'area'; geometry: GeoJsonGeometry }
    | { kind: 'municipality'; muniCode: string }
    | { kind: 'saved_analysis'; analysisId: string };
  formats: ExportFormat[];
}

// ─── Capas y glosario ─────────────────────────────────────────────────────────

export interface LayerCatalogEntry {
  id: string;
  label: string;
  /** Grupo para el panel de capas: "Catastro", "Contexto", "Riesgos"… */
  group: string;
  geometryType: 'point' | 'line' | 'polygon' | 'h3';
  minZoom: number;
  maxZoom: number;
  unit: string | null;
  glossaryId: string | null;
  legend: Array<{ label: string; color: string; value?: string | number }>;
  sourceDatasetIds: string[];
  /** Plan mínimo requerido; null si es libre. */
  requiresPlan: PlanCode | null;
}

// ─── Asistente ────────────────────────────────────────────────────────────────

export interface AiAnswer {
  /** Texto en español. Nunca contiene cifras que no vengan de `usedData`. */
  answer: string;
  /** Datos ya calculados que el asistente usó. Se muestran junto a la respuesta. */
  usedData: MetricRow[];
  /** Qué pidió y no encontró: se muestra como "no disponible", no se estima. */
  missing: string[];
  disclaimer: string;
}

// ─── Cuenta, proyectos, facturación ───────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  plan: PlanCode;
  entitlements: Entitlements;
  /** Créditos disponibles en el periodo actual. */
  credits: number;
  isPlatformAdmin: boolean;
}

export interface AuthSession {
  accessToken: string;
  /** Segundos de vida del access token. */
  expiresIn: number;
  user: AuthUser;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { savedAreas: number; savedSearches: number; reports: number; alerts: number };
}

export interface SavedItem {
  id: string;
  projectId: string;
  kind: 'area' | 'search' | 'parcel' | 'intel';
  name: string;
  /** Estado serializado de la vista: permite reabrirla tal cual (estado en URL). */
  urlState: string;
  createdAt: string;
}

export interface Alert {
  id: string;
  projectId: string;
  name: string;
  /** Qué vigila: cambios catastrales en un área, nuevos predios que cumplen un filtro… */
  kind: 'area_changes' | 'query_matches';
  active: boolean;
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
  matchCount: number;
}

export interface SubscriptionInfo {
  plan: PlanCode;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'none';
  currentPeriodEnd: string | null;
  seatsUsed: number;
  seatsTotal: number;
  credits: number;
  /** Consumo del periodo frente a los límites del plan. */
  usage: Array<{ key: string; label: string; used: number; limit: number | null }>;
}

export interface PaymentRecord {
  id: string;
  createdAt: string;
  amountCop: number;
  concept: string;
  status: 'pending' | 'approved' | 'declined' | 'refunded';
  /** Wompi, Mercado Pago, PayU… */
  provider: string;
  invoiceUrl: string | null;
}

export interface CreditLedgerEntry {
  id: string;
  createdAt: string;
  delta: number;
  balance: number;
  concept: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: AuthUser['role'];
  status: 'active' | 'invited';
}

export interface ApiKey {
  id: string;
  name: string;
  /** Solo los últimos caracteres; la llave completa se muestra una única vez al crearla. */
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  scopes: string[];
}

export interface ApiKeyCreated extends ApiKey {
  /** Valor en claro. No se puede recuperar después. */
  secret: string;
}

export interface ApiUsagePoint {
  date: string;
  calls: number;
  errors: number;
  creditsSpent: number;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface EtlRun {
  id: string;
  datasetId: string;
  datasetName: string;
  status: 'queued' | 'running' | 'ok' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  rowCount: number | null;
  cutDate: string | null;
  /** Mensajes de validación: conteos, geometrías inválidas, PII detectada. */
  validations: Array<{ level: 'info' | 'warn' | 'error'; message: string }>;
}

export interface CoverageRow {
  muniCode: string;
  muniName: string;
  deptName: string;
  cadastralManager: string | null;
  isIgac: boolean | null;
  status: Coverage['status'];
  parcelCount: number | null;
  lastCutDate: string | null;
}

export interface AdminMetrics {
  users: number;
  activeSubscriptions: number;
  mrrCop: number;
  reportsLast30d: number;
  apiCallsLast30d: number;
  parcelsIndexed: number;
  municipalitiesWithCadastre: number;
}
