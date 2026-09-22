/**
 * Tipos de la capa de transporte del API interno (`/api/v1`).
 *
 * ── VERIFICADO CONTRA LA API VIVA ────────────────────────────────────────────
 * Cada forma declarada aquí se comprobó ejecutando la API real (no la prosa del plan,
 * que es lo que produjo la versión anterior de este archivo y una veintena de pantallas
 * vacías). La versión anterior describía un contrato imaginario y `normalizeEnvelope`
 * lo castaba a ciegas, así que TypeScript nunca vio el desajuste.
 *
 * CÓMO VOLVER A VERIFICARLO (hazlo cuando cambie una ruta del API):
 *   1. Levanta el stack:  pnpm dev           (la API queda en http://127.0.0.1:3001/api/v1)
 *   2. Crea una cuenta:
 *        curl -X POST http://127.0.0.1:3001/api/v1/auth/register \
 *          -H 'Content-Type: application/json' \
 *          -d '{"email":"tipos-<algo>@terracolombia.test","password":"contrasena-de-prueba-larga"}'
 *      Guarda `data.user.organizationId` y `data.accessToken`.
 *   3. Para ver rutas de pago/admin, sube el plan con SQL (uuid LITERAL, nunca subconsulta:
 *      `app.user` no tiene `organization_id` y Postgres resolvería la columna contra la
 *      consulta externa, actualizando TODAS las filas):
 *        UPDATE app.subscription SET plan_code='enterprise' WHERE organization_id = '<uuid>'::uuid;
 *        UPDATE app."user" SET role='admin' WHERE email = '<email>';
 *        INSERT INTO app.credit_ledger (id, organization_id, delta, reason, created_at)
 *          VALUES (gen_random_uuid(), '<uuid>'::uuid, 9000, 'adjustment', now());
 *      Vuelve a iniciar sesión: el token lleva el plan dentro.
 *   4. Datos de prueba: municipio Soledad `08758`, NPN `087580101010200010001000000000`.
 *   5. Contrasta la respuesta con el tipo. Si no coinciden, gana la API.
 *
 * ── DECISIÓN: snake_case SE TIPA TAL CUAL ────────────────────────────────────
 * La API es mayoritariamente camelCase, pero varios bloques anidados viajan en snake_case
 * porque salen directos de SQL: `distance_m`, `overlap_pct`, `cut_date`, `area_geom_m2`,
 * `built_area_m2`, `muni_code`, `level_rank`, `with_parcels`…
 *
 * Se tipan EXACTAMENTE como llegan, y los envoltorios de `api/*.ts` NO los renombran.
 * Por qué: renombrar en el envoltorio crea una segunda fuente de verdad que TypeScript no
 * puede contrastar con nada —es el mismo agujero que el cast ciego que estamos cerrando—.
 * Si el tipo refleja el cable, cualquier vista que adivine el nombre falla en compilación,
 * que es justo lo que queremos. La normalización, si algún día se quiere, va en el API.
 *
 * ── SENTINELA `NO_DISPONIBLE` ────────────────────────────────────────────────
 * La API nunca estima: cuando un dato falta devuelve la cadena `'NO_DISPONIBLE'`
 * (`NOT_AVAILABLE` de `@terracolombia/shared`) en lugar del número. Por eso muchos campos
 * numéricos son `Maybe<number>`. Usa `isAvailable()` de shared antes de operar con ellos.
 *
 * Nota sobre NUMERIC: `packages/db/src/pool.ts` sobrescribe el parser de `pg`, así que
 * NUMERIC y BIGINT llegan como `number`, no como cadena. La única cadena que aparece en un
 * campo numérico es el centinela `'NO_DISPONIBLE'`.
 *
 * ── SOBRE ────────────────────────────────────────────────────────────────────
 * Toda respuesta viene como `{ data, meta }` salvo las de `/auth/*`, que devuelven solo
 * `{ data }` (ver `normalizeEnvelope` en `client.ts`, que lo compensa).
 */
import type {
  Coverage,
  Entitlements,
  FactorScore,
  GeoJsonGeometry,
  GlossaryEntry,
  JobStatus,
  LngLat,
  Maybe,
  PlanCode,
} from '@terracolombia/shared';

/**
 * Estados reales del worker (`JOB_STATUSES` de shared, usado por `apps/api/src/routes/jobs.ts`).
 * Son `done`/`canceled`, NO `completed`/`cancelled`: el cliente anterior esperaba los
 * segundos, así que ningún trabajo terminaba nunca en la UI.
 */
export type { JobStatus } from '@terracolombia/shared';

// ─── Paginación ───────────────────────────────────────────────────────────────

/** Verificado: coincide con `apps/api/src/lib/page.ts`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  /** Total exacto cuando el backend lo puede calcular sin costo; null si no. */
  total: number | null;
}

// ─── Trabajos asíncronos ──────────────────────────────────────────────────────

/**
 * Lo que devuelve una operación que se encola (202): `POST /areas/analyze` con área grande.
 * Ojo: aquí el identificador se llama `jobId`, pero `GET /jobs/:id` lo devuelve como `id`.
 */
export interface JobHandle {
  jobId: string;
  status: JobStatus;
  /** Presente en el 202 de `/areas/analyze`. */
  areaKm2?: number;
  message?: string;
  creditsCharged?: number;
}

/** `GET /jobs/:id`. Verificado contra `apps/api/src/routes/jobs.ts`. */
export interface Job<TResult = unknown> {
  id: string;
  /** `area_analyze` | `report` | `etl` | `export`… lo fija el productor del trabajo. */
  kind: string;
  status: JobStatus;
  /** 0–100. */
  progress: number;
  /** Etapa legible en español. Se llama `progressMessage`, no `stage`. */
  progressMessage: string | null;
  /** Texto del fallo. Es plano: no existe `error.message`. */
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Solo viaja cuando `status === 'done'`; en cualquier otro estado es `null`. */
  result: TResult | null;
}

/** `GET /jobs` (arreglo pelado). No trae `attempts` ni `result`. */
export type JobSummary = Omit<Job, 'attempts' | 'result'>;

/** `POST /jobs/:id/cancel`. No es 204: devuelve este objeto. */
export interface JobCancelled {
  ok: true;
  status: 'canceled';
}

/** Evento SSE `progress` de `GET /jobs/:id/stream`. El campo es `message`, no `stage`. */
export interface JobProgressEvent {
  id: string;
  status: JobStatus;
  progress: number | null;
  message: string | null;
}

/**
 * Eventos SSE `done` y `failed`. El resultado va ANIDADO en `result`:
 * la versión anterior de `useJob` guardaba este sobre entero como si fuera el resultado.
 */
export interface JobDoneEvent<TResult = unknown> {
  id: string;
  status: JobStatus;
  result: TResult | null;
  errorMessage: string | null;
}

/** Un resultado que puede llegar de inmediato o como trabajo en cola. */
export type SyncOrJob<T> = { kind: 'result'; result: T } | { kind: 'job'; job: JobHandle };

// ─── Búsqueda universal ───────────────────────────────────────────────────────

export type SearchResultKind =
  | 'parcel'
  // `address` y `coordenadas` no salen del índice de búsqueda sino de interpretar la
  // entrada, por eso es fácil olvidarlos al leer solo el SQL. La ruta los emite.
  | 'address'
  | 'coordinates'
  | 'municipality'
  | 'department'
  | 'neighborhood'
  | 'vereda'
  | 'toponym'
  | 'populated_place'
  | 'protected_area'
  | 'school'
  | 'health_facility';

/** A dónde navega un resultado. La UI enruta con esto: no hay `centroid` ni `bbox`. */
export type SearchTarget =
  | { type: 'parcel'; npn: string }
  | { type: 'municipality'; code: string }
  | { type: 'department'; code: string }
  | { type: 'point'; lng: number; lat: number; zoom: number }
  | { type: 'area'; kind: string; ref: string; lng: number | null; lat: number | null };

/**
 * Verificado contra `apps/api/src/routes/search.ts`.
 * No existen `id`, `sublabel`, `centroid`, `bbox`, `confidence` ni `muniCode`.
 */
export interface SearchResultItem {
  kind: SearchResultKind;
  label: string;
  /** Segunda línea para desambiguar: «Atlántico», «Predio · Soledad, Atlántico»… */
  context: string | null;
  target: SearchTarget;
  /** Relevancia 0–1. Se llamaba `confidence`. */
  score: number;
  /** Por qué se interpretó así la entrada. La UI lo muestra como ayuda. */
  interpretation: string | null;
}

/** `GET /search` devuelve este objeto, NO un arreglo de resultados. */
export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  /** Explicación en español cuando `results` viene vacío. Nunca una lista muda. */
  emptyReason: string | null;
}

/** `GET /search/resolve` (resolver un punto del mapa). */
export interface ResolvePointResponse {
  point: { lng: number; lat: number };
  municipality: {
    code: string;
    name: string;
    deptCode: string;
    deptName: string;
    match: string;
  };
  parcel: { npn: string; address: string | null; areaGeomM2: Maybe<number> } | null;
}

// ─── Municipio ────────────────────────────────────────────────────────────────

/**
 * Bloque `summary` de la ficha municipal: sale directo de SQL, así que va en snake_case.
 * Verificado en vivo contra `GET /municipalities/08758`.
 */
export interface MunicipalSummary {
  muni_code: string;
  muni_name: string;
  dept_code: string;
  dept_name: string;
  population: number | null;
  population_year: number | null;
  area_km2: number | null;
  manager_name: string | null;
  is_igac: boolean | null;
  coverage_status: Coverage['status'];
  /** Marca de tiempo ISO completa, no `AAAA-MM-DD`. */
  last_cut_date: string | null;
  n_parcels: number;
  n_parcels_urban: number;
  n_parcels_rural: number;
  area_sum_m2: number;
  built_area_sum_m2: number;
  n_schools: number;
  n_health_facilities: number;
}

/**
 * `GET /municipalities/:code`.
 * NO trae `availableCutDates` (eso vive en la ficha de predio) ni `bbox`.
 * La cobertura NO viene en `data`: llega en `meta.coverage` del sobre.
 */
export interface MunicipalityDetail {
  code: string;
  name: string;
  deptCode: string;
  deptName: string;
  category: Maybe<string>;
  isCapital: boolean;
  /** `number` cuando hay dato; `'NO_DISPONIBLE'` cuando no. Nunca se estima. */
  areaKm2: Maybe<number>;
  population: Maybe<number>;
  populationYear: Maybe<number>;
  centroid: LngLat | null;
  /** Solo con `?geometry=true`, y hoy suele ser null: falta cargar el MGN del DANE. */
  geometry: GeoJsonGeometry | null;
  summary: MunicipalSummary | null;
  // FALTA EN LA API: `bbox` del municipio. El mapa tendrá que encuadrar por `centroid`
  // o por la geometría cuando el MGN esté cargado.
}

/** `GET /municipalities` (arreglo pelado). */
/** Fila de `GET /departments`. Arreglo pelado, 33 filas. */
export interface DepartmentListItem {
  code: string;
  name: string;
  region: string | null;
  area_km2: number | null;
}

export interface MunicipalityListItem {
  code: string;
  name: string;
  deptCode: string;
  deptName: string;
  isCapital: boolean;
  population: Maybe<number>;
  populationYear: Maybe<number>;
  areaKm2: Maybe<number>;
  centroid: LngLat | null;
}

// ─── Predio ───────────────────────────────────────────────────────────────────

/** Construcción del predio. No trae `attrs`; sí `ref` y `builtYear`. */
export interface ParcelBuilding {
  id: string;
  /** Identificador de la construcción dentro del predio: «01», «02»… */
  ref: Maybe<string>;
  floors: Maybe<number>;
  builtAreaM2: Maybe<number>;
  use: Maybe<string>;
  builtYear: Maybe<number>;
}

/**
 * `GET /parcels/:npn`. Objeto PLANO.
 * La versión anterior lo partía en `{ summary, attrs, cutDates }`, que no existe.
 */
export interface ParcelDetail {
  npn: string;
  /** NPN con separadores para leerlo. */
  npnPretty: string;
  /** Qué significa cada tramo del código, en español. */
  npnExplained: string;
  npnOld: Maybe<string>;
  municipality: {
    code: string;
    name: string;
    deptCode: string;
    deptName: string;
  };
  zone: Maybe<string>;
  zoneLabel: Maybe<string>;
  address: Maybe<string>;
  /** Área calculada sobre la geometría (EPSG:9377). */
  areaGeomM2: Maybe<number>;
  /** Área que reporta la fuente. Puede diferir de la geométrica. */
  areaReportedM2: Maybe<number>;
  /** Presente solo cuando ambas áreas existen y discrepan. */
  areaDiscrepancy: {
    differenceM2: number;
    differencePct: number;
    note: string;
  } | null;
  builtAreaM2: Maybe<number>;
  economicUse: Maybe<string>;
  cadastralValue: Maybe<number>;
  valuationYear: Maybe<number>;
  /** Regla 5 de CLAUDE.md: avalúo catastral ≠ valor comercial. Se muestra siempre. */
  cadastralValueWarning: string;
  isHorizontalProperty: boolean;
  matrixNpn: string | null;
  /** Unidades de propiedad horizontal colgando de este predio matriz. */
  units: ParcelUnit[];
  centroid: LngLat | null;
  geometry: GeoJsonGeometry | null;
  buildings: ParcelBuilding[];
  homogeneousZones: HomogeneousZone[];
  /** Campos crudos de los Registros 1 y 2, tal como llegan. Sección «datos crudos». */
  rawAttributes: Record<string, unknown>;
  /** Cortes en los que este NPN existe, de más antiguo a más reciente. */
  availableCutDates: string[];
  currentCutDate: string | null;
}

export interface ParcelUnit {
  npn: string;
  address: Maybe<string>;
  areaGeomM2: Maybe<number>;
  builtAreaM2: Maybe<number>;
  economicUse: Maybe<string>;
}

export interface HomogeneousZone {
  kind: string;
  code: Maybe<string>;
  label: Maybe<string>;
  overlap_pct?: number;
}

/**
 * Elemento de contexto cercano (colegios, salud, POIs, vías).
 * snake_case `distance_m` tal como llega. La posición son `lng`/`lat` sueltos,
 * no un `centroid`; en las vías ambos pueden ser `null`.
 */
export interface ContextNearbyItem {
  layer: string;
  id: string;
  name: Maybe<string>;
  category: Maybe<string>;
  distance_m: number;
  lng: number | null;
  lat: number | null;
  attrs: Record<string, unknown>;
}

export interface ContextSoil {
  kind: string;
  code: Maybe<string>;
  label: Maybe<string>;
  overlap_pct: number;
  attrs: Record<string, unknown>;
}

export interface ContextHazard {
  kind: string;
  level: Maybe<string>;
  /** Orden de la clase de amenaza, para pintar la escala. */
  level_rank: number | null;
  source: string;
  /** Escala del estudio: «1:25.000». Importa para no sobreinterpretar. */
  scale: Maybe<string>;
  overlap_pct: number;
}

export interface ContextProtectedArea {
  name: string;
  category: Maybe<string>;
  overlap_pct: number;
}

export interface ContextEthnicTerritory {
  name: string;
  kind: Maybe<string>;
  overlap_pct: number;
}

export interface ContextPotZone {
  classification: Maybe<string>;
  use: Maybe<string>;
  sourceDoc: Maybe<string>;
  overlap_pct: number;
}

export interface ContextMiningTitle {
  id: Maybe<string>;
  mineral: Maybe<string>;
  stage: Maybe<string>;
  overlap_pct: number;
}

export interface ContextPopulation {
  total: Maybe<number>;
  households: Maybe<number>;
  dwellings: Maybe<number>;
  /** Tramos quinquenales: «0_4», «5_9»… «60_mas». */
  ageBands: Record<string, number> | null;
  blocksUsed: number;
  method: string;
}

/**
 * `GET /parcels/:npn/context`.
 * Es una forma propia del API, NO el `ParcelContext` de `@terracolombia/shared`
 * (ese usa `distanceM`/`overlapPct` camelCase y le faltan la mitad de los bloques).
 */
export interface ParcelContextResponse {
  npn: string;
  radiusM: number;
  schools: ContextNearbyItem[];
  healthFacilities: ContextNearbyItem[];
  pois: ContextNearbyItem[];
  roads: ContextNearbyItem[];
  population: ContextPopulation | null;
  soils: ContextSoil[];
  hazards: ContextHazard[];
  protectedAreas: ContextProtectedArea[];
  ethnicTerritories: ContextEthnicTerritory[];
  potZones: ContextPotZone[];
  miningTitles: ContextMiningTitle[];
  agriculturalFrontier: Array<{ category: string; overlap_pct: number }>;
  relief: {
    elevationMeanM: Maybe<number>;
    slopeMeanPct: Maybe<number>;
    slopeMaxPct: Maybe<number>;
  } | null;
  urbanPerimeter: { inside: boolean; note: string | null } | null;
  accessibility: {
    distPrimaryRoadM: Maybe<number>;
    distSecondaryRoadM: Maybe<number>;
    distPavedRoadM: Maybe<number>;
    distAnyRoadM: Maybe<number>;
    distMuniSeatM: Maybe<number>;
  } | null;
}

/** Una fila de la línea de tiempo del predio. snake_case: sale directo de SQL. */
export interface ParcelHistoryCut {
  cut_date: string;
  area_geom_m2: number | null;
  built_area_m2: number | null;
}

export type ParcelChangeType =
  | 'created'
  | 'removed'
  | 'attrs_changed'
  | 'geometry_changed'
  | 'building_added'
  | 'building_removed';

export interface ParcelHistoryChange {
  changeType: ParcelChangeType;
  fromCutDate: string;
  toCutDate: string;
  detail: Record<string, unknown>;
}

/** `GET /parcels/:npn/history`. Objeto, no un arreglo de entradas. */
export interface ParcelHistoryResponse {
  npn: string;
  cuts: ParcelHistoryCut[];
  changes: ParcelHistoryChange[];
  /** Por qué no hay nada que comparar (p. ej. un solo corte cargado). */
  emptyReason: string | null;
}

/** Fila de `POST /parcels/query`. */
export interface ParcelQueryRow {
  npn: string;
  muniCode: string;
  muniName: string;
  zone: Maybe<string>;
  zoneLabel: Maybe<string>;
  address: Maybe<string>;
  /** Se llama `areaGeomM2`, no `areaM2`. */
  areaGeomM2: Maybe<number>;
  /** Puede llegar como la cadena `'NO_DISPONIBLE'`: verificado en vivo. */
  builtAreaM2: Maybe<number>;
  economicUse: Maybe<string>;
  cadastralValue: Maybe<number>;
  centroid: LngLat | null;
  /** `null` con `geometry: 'none' | 'centroid'`; el polígono con `geometry: 'full'`. */
  geometry: GeoJsonGeometry | null;
  /** Solo cuando se ordenó por distancia con un filtro `near`. */
  distance_m?: number;
}

/** `POST /parcels/query`. No es `Page<T>`: las filas van en `rows`. */
export interface ParcelQueryResponse {
  rows: ParcelQueryRow[];
  nextCursor: string | null;
  /** Límite que el backend aplicó de verdad (puede recortarlo el plan). */
  limitApplied: number;
  /** Regla 5: acompaña a cualquier respuesta con avalúo catastral. */
  cadastralValueWarning: string;
  // FALTA EN LA API: no hay `total` de coincidencias. Con `nextCursor` se sabe si hay más,
  // pero no cuántas: la UI no puede prometer «N resultados».
}

// ─── Cercanías ────────────────────────────────────────────────────────────────

/** `GET /nearby`. */
export interface NearbyResponse {
  /** Se llama `point`, no `center`. */
  point: { lng: number; lat: number };
  radiusM: number;
  total: number;
  /** Agrupado por capa; solo aparecen las capas con resultados. */
  byLayer: Record<string, ContextNearbyItem[]>;
  /** La lista plana, ya ordenada por distancia. */
  items: ContextNearbyItem[];
  /** Capas que el backend sabe servir, para pintar el selector. */
  availableLayers: string[];
  emptyReason: string | null;
}

// ─── Análisis de zona ─────────────────────────────────────────────────────────

export interface AreaParcelStats {
  total: number;
  urban: number;
  rural: number;
  areaSumM2: Maybe<number>;
  areaMedianM2: Maybe<number>;
  builtAreaSumM2: Maybe<number>;
  withBuilding: number;
  withoutBuilding: number;
  /** Conteo por destino económico: «Habitacional», «Comercial»… */
  byEconomicUse: Record<string, number>;
  parcelsPerKm2: number | null;
}

export interface AreaPopulationStats extends ContextPopulation {
  densityPerKm2: Maybe<number>;
}

export interface AreaFacilitiesStats {
  schools: number;
  schoolEnrollment: Maybe<number>;
  healthFacilities: number;
  poisByCategory: Record<string, number>;
}

/**
 * `POST /areas/analyze` (respuesta síncrona).
 * NO existe `sections`: el tablero son bloques con nombre propio, y cada uno puede ser
 * `null` cuando la sección no se pidió o no hay datos. `missingSections` dice cuáles.
 * Tampoco hay `id`, `geometry` ni `bbox`.
 */
export interface AreaAnalysisResult {
  /** Descripción legible del ámbito: «Radio de 800 m». */
  label: string;
  areaKm2: number;
  areaHa: number;
  muniCode: string | null;
  coverage: Coverage | null;
  parcels: AreaParcelStats | null;
  population: AreaPopulationStats | null;
  facilities: AreaFacilitiesStats | null;
  soils: ContextSoil[];
  hazards: ContextHazard[];
  protectedAreas: ContextProtectedArea[];
  ethnicTerritories: ContextEthnicTerritory[];
  potZones: ContextPotZone[];
  agriculturalFrontier: Array<{ category: string; overlap_pct: number }>;
  relief: {
    elevationMeanM: Maybe<number>;
    slopeMeanPct: Maybe<number>;
    slopeMaxPct: Maybe<number>;
  } | null;
  /**
   * Secciones que no se pudieron calcular, con su motivo. Regla 6: cobertura honesta.
   *
   * Verificado contra la respuesta real: son objetos `{section, reason}`, no cadenas.
   * Declararlo como `string[]` dejaba pasar una interpolación directa, que habría impreso
   * «[object Object]» en la tarjeta de lo que falta.
   */
  missingSections: Array<{ section: string; reason: string }>;
  warnings: string[];
  // FALTA EN LA API: `id` estable para guardar/comparar zonas, y la geometría resuelta
  // del ámbito. La vista debe conservar el `scope` que envió si necesita repintarlo.
}

/** `POST /areas/compare`. */
export interface AreaCompareResponse {
  comparisons: Array<AreaAnalysisResult & { name: string }>;
}

// ─── Localización de negocio ──────────────────────────────────────────────────

/** Indicador de una plantilla. Se llama `indicator`, no `key`; `weight`, no `defaultWeight`. */
export interface TemplateIndicator {
  indicator: string;
  /** Peso por omisión, 0–1. Editable por el usuario. */
  weight: number;
  /** Por qué este indicador importa para este negocio, en español. */
  rationale: string;
  // FALTA EN LA API: `label`, `unit`, `direction`, `formula`, `glossaryId` y
  // `sourceDatasetIds` NO vienen en la plantilla. Llegan por celda, dentro de
  // `IntelCellFactor` (que sí es un `FactorScore` completo), una vez se ejecuta el análisis.
}

export interface TemplateHardFilter {
  id: string;
  label: string;
  description: string;
  /** Indicadores que alimentan el filtro. */
  indicators: string[];
}

export interface LocationIntelTemplate {
  id: string;
  name: string;
  description: string;
  /** Para quién es, en una línea. */
  audience: string;
  recommendedResolution: number;
  indicators: TemplateIndicator[];
  /** Criterios que descartan una celda por completo (área protegida, pendiente…). */
  hardFilters: TemplateHardFilter[];
}

/** `GET /location-intel/templates` devuelve este objeto, NO un arreglo. */
export interface LocationIntelTemplatesResponse {
  templates: LocationIntelTemplate[];
  note: string;
}

/** Motivo por el que una celda quedó descartada por un filtro duro. */
export interface CellExclusion {
  filterId: string;
  label: string;
  reason: string;
}

/**
 * Desglose por factor de una celda. Es el `FactorScore` de shared, que sí coincide
 * con lo que devuelve la API (indicator, label, score, rawValue, unit, weight,
 * direction, formula, sourceDatasetIds, explanation, flag).
 */
export type IntelCellFactor = FactorScore;

/** Celda puntuada. El desglose se llama `factors`, no `breakdown`. */
export interface ScoredCell {
  h3: string;
  /** 0–100, o `null` si no hubo datos suficientes. */
  score: number | null;
  /** Proporción del peso total que sí tuvo dato, 0–1. */
  confidence: number;
  /** Posición en el orden desde 1; `null` en celdas descartadas. */
  rank: number | null;
  center: [number, number] | null;
  geometry: GeoJsonGeometry | null;
  excluded: boolean;
  exclusions: CellExclusion[];
  /** Indicadores sin dato en esta celda. */
  missing: string[];
  factors: IntelCellFactor[];
}

export interface IntelZoneFactor {
  indicator: string;
  label: string;
  scoreMean: number;
  weight: number;
}

/** Zona agrupada (celdas contiguas) para el listado «top zonas». */
export interface IntelZone {
  id: string;
  rank: number;
  /** Índices H3 que la componen. */
  cells: string[];
  cellCount: number;
  areaKm2: number | null;
  center: [number, number] | null;
  scoreMean: number;
  scoreMax: number;
  scoreMin: number;
  confidenceMean: number;
  factors: IntelZoneFactor[];
  summary: string;
  // FALTA EN LA API: la zona no trae `candidateParcels` ni `muniCode`. Para listar predios
  // candidatos hay que llamar aparte a `POST /parcels/query` acotado a la zona.
}

/** `POST /location-intel`. */
export interface LocationIntelResult {
  templateId: string;
  templateName: string;
  resolution: number | null;
  areaKm2: number;
  cellsEvaluated: number;
  cellsExcluded: number;
  cells: ScoredCell[];
  topZones: IntelZone[];
  /** Pesos finalmente aplicados, renormalizados a 1. Se llama así, no `indicators`. */
  weightsApplied: Record<string, number> | null;
  /** Lectura en español de por qué el ranking quedó así. */
  explanation: string | null;
  disclaimer?: string;
  note?: string;
  /** Presente cuando no hay celdas calculadas para la zona. */
  emptyReason?: string | null;
}

// ─── Aptitud de terreno ───────────────────────────────────────────────────────

/**
 * `POST /suitability`.
 * NO es el `SuitabilityResult` de `@terracolombia/shared`: ese declara
 * `targetUse`/`targetUseLabel` y le faltan `target`, `areaKm2`, `verdictHelp`,
 * `rawInputs` y `legalNotes`. La API manda `use`/`useLabel`.
 */
export interface SuitabilityResponse {
  /** Descripción legible del objetivo: «Predio 0875801…». */
  target: string;
  use: string;
  /** Etiqueta en español del uso. Se llama `useLabel`, no `targetUseLabel`. */
  useLabel: string;
  areaKm2: number;
  /** Puntaje compuesto 0–100; `null` si faltan factores obligatorios. */
  score: number | null;
  verdict: 'favorable' | 'condicionado' | 'desfavorable' | 'sin_datos';
  verdictLabel: string;
  /** Qué significa el veredicto, en español llano. */
  verdictHelp: string;
  factors: FactorScore[];
  /** Impedimentos que hacen inviable el uso. */
  blockers: string[];
  /** Puntos que encarecen o limitan, sin impedir. */
  cautions: string[];
  /** Datos que no tenemos. Regla 2: se declaran, no se estiman. */
  missing: string[];
  /** Valores crudos que alimentaron el cálculo, para «Explícame esto». */
  rawInputs: Record<string, number | string | boolean | null>;
  disclaimer: string;
  /** Advertencias legales aplicables (POT, licencias, escalas de amenaza). */
  legalNotes: string[];
}

// ─── Cambio territorial ───────────────────────────────────────────────────────

/** Una fila del resumen por tipo de cambio. */
export interface ChangeSummaryRow {
  changeType: string;
  label: string;
  /** Qué significa ese tipo de cambio, en español llano. */
  explanation: string | null;
  count: number;
}

export interface ChangeItem {
  npn: string;
  muniCode: string;
  changeType: string;
  /** Se llama `changeLabel`, no `label`. */
  changeLabel: string;
  detail: Record<string, unknown>;
  /** Índice de solape de geometrías (IoU) cuando el cambio es geométrico. */
  geometryOverlap: number | null;
  detectedAt: string;
}

/** `POST /changes/compare`. */
export interface ChangeCompareResult {
  fromCutDate: string;
  toCutDate: string;
  areaKm2: number;
  /** Se llama `summary` y es un arreglo, no un `counts` indexado por tipo. */
  summary: ChangeSummaryRow[];
  changes: ChangeItem[];
  /** true si se alcanzó el límite y faltan cambios por listar. */
  truncated: boolean;
  // FALTA EN LA API: no hay FeatureCollections `before`/`after` para pintar el antes/después,
  // ni `centroid` ni áreas por cambio. Cada `ChangeItem` solo trae el NPN.
}

/** `GET /changes/available-cuts`. */
export interface AvailableCutsResponse {
  cuts: string[];
  comparablePairs: Array<{ from: string; to: string }>;
  emptyReason: string | null;
}

// ─── Observatorio ─────────────────────────────────────────────────────────────

export interface IndicatorSeriesPoint {
  period: string;
  value: number | null;
}

export interface MunicipalIndicator {
  key: string;
  label: string;
  unit: string | null;
  latest: number | null;
  latestPeriod: string | null;
  rank: { position: number; of: number } | null;
  series: IndicatorSeriesPoint[];
  formula: string;
  sourceDatasetIds: string[];
}

/**
 * `GET /indicators/:muniCode`.
 * Trae `municipality` + `summary` (snake_case) + `indicators`, no `muniCode`/`muniName`
 * sueltos. Hoy `indicators` suele venir vacío con su `emptyReason`: los calcula el ETL.
 */
export interface MunicipalIndicators {
  municipality: { code: string; name: string; deptName: string };
  summary: MunicipalSummary | null;
  indicators: MunicipalIndicator[];
  emptyReason: string | null;
}

// ─── Informes ─────────────────────────────────────────────────────────────────

export type ReportKind = 'parcel' | 'area' | 'location_intel' | 'change' | 'municipality';

/**
 * Niveles reales: van en español. El cliente anterior mandaba
 * `'summary' | 'full' | 'technical'` y la API los rechazaba con VALIDATION.
 */
export type ReportLevel = 'resumen' | 'completo' | 'tecnico';

export type ExportFormat = Entitlements['exportFormats'][number];

export type ReportStatus = JobStatus;

/** Fila de `GET /reports` (arreglo pelado, NO `Page<T>`). */
export interface ReportSummary {
  id: string;
  kind: ReportKind;
  level: ReportLevel;
  title: string;
  status: ReportStatus;
  progress: number;
  errorMessage: string | null;
  creditsCharged: number;
  /** Mapa formato → ruta del objeto generado. Las claves son los formatos descargables. */
  artifacts: Record<string, string>;
  completedAt: string | null;
  createdAt: string;
}

export interface ReportSection {
  ordinal: number;
  key: string;
  title: string;
  payload: Record<string, unknown>;
  /** true cuando la sección no se pudo calcular. Regla 6: se dice, no se oculta. */
  isMissing: boolean;
}

/** `GET /reports/:id`. Aquí `artifacts` es un arreglo de formatos, no un mapa. */
export interface ReportDetail {
  id: string;
  kind: ReportKind;
  level: ReportLevel;
  title: string;
  status: ReportStatus;
  progress: number;
  errorMessage: string | null;
  subject: Record<string, unknown>;
  sections: ReportSection[];
  /** Snapshots congelados: hacen el informe inmutable y verificable. */
  sourceSnapshots: unknown;
  /** Formatos ya generados y descargables. */
  artifacts: string[];
  creditsCharged: number;
  /** URL a la que apunta el QR del PDF. */
  verifyUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  immutabilityNote: string;
}

/** Respuesta 202 de `POST /reports`. No es `{ jobId }`: el identificador es del informe. */
export interface ReportCreated {
  id: string;
  status: ReportStatus;
  kind: ReportKind;
  level: ReportLevel;
  title: string;
  creditsCharged: number;
  creditCost: number;
  verifyUrl: string | null;
  message: string;
}

/**
 * Cuerpo de `POST /reports`. `kind`, `subject` y `level` son lo que valida la API;
 * `subject` es un objeto libre cuyo contenido depende de `kind`
 * (`{npn}`, `{muniCode}`, `{scope}`, `{scope, fromCutDate, toCutDate}`, `{templateId, scope}`).
 */
export interface CreateReportInput {
  kind: ReportKind;
  subject: Record<string, unknown>;
  level?: ReportLevel;
  title?: string;
  projectId?: string;
  formats?: ExportFormat[];
}

/** `GET /reports/verify/:token`. */
export interface ReportVerification {
  valid: boolean;
  id: string;
  kind: ReportKind;
  level: ReportLevel;
  title: string;
  completedAt: string | null;
  createdAt: string;
  sourceSnapshots: unknown;
}

// ─── Capas y glosario ─────────────────────────────────────────────────────────

export interface LayerLegendItem {
  label: string;
  color: string;
  value?: string | number;
}

/**
 * Entrada del catálogo de capas.
 * Se llama `name` (no `label`), `minPlan` (no `requiresPlan`), y `glossary` es una lista
 * de términos embebidos, no un `glossaryId`. No hay `group` ni `unit`.
 */
export interface LayerCatalogEntry {
  id: string;
  name: string;
  description: string | null;
  geometryType: string;
  minZoom: number;
  maxZoom: number;
  legend: LayerLegendItem[];
  glossary: Array<{ id: string; term: string; plain: string }>;
  minPlan: string;
  minPlanName: string;
  /** false si el plan del usuario no alcanza: la UI la muestra bloqueada con motivo. */
  accessible: boolean;
  source: {
    datasetId: string;
    source: string;
    license: string;
    attribution: string;
  } | null;
  /** Plantilla de teselas, ya con `{z}/{x}/{y}`. */
  tileUrl: string;
  // FALTA EN LA API: no hay `group` para agrupar el panel de capas ni `unit`.
}

/** `GET /layers` devuelve este objeto, NO un arreglo. */
export interface LayersResponse {
  layers: LayerCatalogEntry[];
}

/** `GET /glossary` devuelve este objeto, NO un arreglo. */
export interface GlossaryResponse {
  terms: GlossaryEntry[];
}

// ─── Asistente ────────────────────────────────────────────────────────────────

/** `POST /ai/ask`. */
export interface AiAskResponse {
  /** Texto en español. */
  answer: string;
  /** `llm` = respuesta del modelo verificada; `template`/`glossary` = determinista sin IA;
   *  `unavailable` = no hay modelo configurado en este despliegue. */
  mode: 'llm' | 'template' | 'glossary' | 'unavailable';
  /** Herramientas tipadas que el asistente llamó. */
  toolCalls: unknown[];
  /** Datos que respaldan cada cifra mencionada. */
  evidence: Record<string, unknown>;
  /** true si se descartó la respuesta por contener cifras sin respaldo. */
  rejectedForUnsupportedNumbers: boolean;
  disclaimer: string;
  // FALTA EN LA API: no hay `usedData: MetricRow[]` ni `missing: string[]`.
  // Lo más cercano es `evidence`, que es un objeto libre.
}

/** `POST /ai/explain`. El texto va en `explanation`, no en `answer`. */
export interface AiExplainResponse {
  explanation: string;
  mode: 'llm' | 'template' | 'glossary' | 'unavailable';
  /** Solo en la vía rápida del glosario. */
  term?: string;
  source?: string | null;
  evidence?: Record<string, unknown>;
  disclaimer: string | null;
}

/** `GET /ai/status`. Permite a la UI decir la verdad sobre el asistente. */
export interface AiStatus {
  enabled: boolean;
  model: string | null;
  fallbackMode: 'template' | null;
  message: string;
}

// ─── Cuenta, proyectos, facturación ───────────────────────────────────────────

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: MemberRole;
  plan: PlanCode;
  entitlements: Entitlements;
  /** Créditos disponibles en el periodo actual. */
  credits: number;
  isPlatformAdmin: boolean;
}

/** `GET /me`: es `AuthUser` con bloques extra que `/auth/login` no devuelve. */
export interface MeResponse extends AuthUser {
  emailVerified: boolean;
  locale: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: MemberRole;
    isCurrent: boolean;
  }>;
  planDetail: {
    code: PlanCode;
    name: string;
    highlights: string[];
    monthlyPriceCop: number | null;
  };
  usage: {
    /** Periodo «AAAA-MM». */
    period: string;
    counters: Array<{ key: string; used: number }>;
    limits: {
      detailedQueriesPerMonth: number | null;
      reportsPerMonth: number | null;
      tilesPerDay: number | null;
    };
  };
}

/**
 * `POST /auth/login` y `POST /auth/register`.
 * OJO: estas rutas devuelven `{ data }` SIN `meta` (verificado en vivo);
 * `normalizeEnvelope` lo compensa para que el resto del cliente no tenga que saberlo.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  /** Segundos de vida del access token. */
  expiresIn: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  /** Color para distinguirlo en la lista. */
  color: string | null;
  createdAt: string;
  updatedAt: string;
  counts: { savedAreas: number; savedSearches: number; reports: number; alerts: number };
}

export interface SavedItem {
  id: string;
  projectId: string;
  kind: 'area' | 'search' | 'parcel' | 'intel';
  name: string;
  /** Estado serializado de la vista: permite reabrirla tal cual. */
  urlState: string;
  notes: string | null;
  createdAt: string;
}

export interface AlertDelivery {
  id: string;
  alertId: string;
  payload: Record<string, unknown>;
  channel: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt: string | null;
  createdAt: string;
}

/**
 * Alerta. El campo es `isActive`, no `active`, y los `kind` son los del worker.
 * Cuelga del usuario, no del proyecto: no tiene `projectId`.
 */
export interface Alert {
  id: string;
  userId: string;
  name: string;
  kind: 'new_parcels' | 'parcel_changed' | 'new_buildings' | 'area_change' | 'indicator_threshold';
  /** Ámbito vigilado: `{muniCode}`, `{geometry}` o `{npn}`. */
  scope: Record<string, unknown>;
  condition: Record<string, unknown>;
  frequency: 'daily' | 'weekly' | 'monthly' | 'on_new_cut';
  channels: Array<'email' | 'webhook'>;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
  /** Últimos envíos, cuando la ruta los incluye. */
  deliveries?: AlertDelivery[];
  // FALTA EN LA API: no hay `matchCount`. Lo más cercano es contar `deliveries`.
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  /** DSL de `ParcelQuerySchema`, ya validado al guardarse. */
  query: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriptionInfo {
  plan: PlanCode;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'none';
  currentPeriodEnd: string | null;
  seatsUsed: number;
  seatsTotal: number;
  credits: number;
  /** Consumo del periodo frente a los límites del plan. `limit: null` = sin tope. */
  usage: Array<{ key: string; label: string; used: number; limit: number | null }>;
}

/**
 * Respuesta de `POST /billing/checkout/subscription`.
 * No existe un `/billing/checkout` genérico: hay una ruta por tipo de compra.
 */
export interface SubscriptionCheckout {
  paymentId: string;
  reference: string;
  amountCop: number;
  /** A dónde redirigir. El frontend nunca maneja datos de tarjeta. */
  checkoutUrl: string;
  providerRef: string | null;
  /** Wompi, Mercado Pago, PayU… */
  provider: string;
}

/** Respuesta de `POST /billing/checkout/credits`. */
export interface CreditsCheckout {
  paymentId: string;
  reference: string;
  credits: number;
  amountCop: number;
  checkoutUrl: string;
  provider: string;
}

/** Fila del historial de pagos. */
export interface PaymentRecord {
  id: string;
  createdAt: string;
  amountCop: number;
  concept: string;
  status: 'pending' | 'approved' | 'declined' | 'refunded';
  // FALTA EN LA API: `provider` e `invoiceUrl` no vienen en esta lista.
}

/** Asiento del libro de créditos. */
export interface CreditLedgerEntry {
  id: string;
  createdAt: string;
  delta: number;
  /** Motivo del movimiento: `adjustment`, `purchase`, `consumption`… */
  reason: string;
  /** Operación que lo consumió, cuando aplica. */
  operation: string | null;
  note: string | null;
  // FALTA EN LA API: no hay `balance` acumulado. Hay que sumarlo en el cliente,
  // y solo es exacto si se tiene el libro completo.
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: MemberRole;
  status: 'active' | 'invited';
}

/** Respuesta 201 de `POST /billing/team`: un `TeamMember` invitado con una nota. */
export interface TeamInvitation extends TeamMember {
  status: 'invited';
  note: string;
}

/**
 * Llave de API tal como la lista `GET /api-keys`.
 * No existe `maskedKey`: lo que se muestra es `prefix`.
 */
export interface ApiKey {
  id: string;
  name: string;
  /** Parte pública de la llave: `tc_test_d73cca4bb09e`. */
  prefix: string;
  environment: 'sandbox' | 'live';
  allowedOrigins: string[];
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

/**
 * Respuesta 201 de `POST /api-keys`. NO es un `ApiKey` con secreto:
 * no trae `scopes`, `createdAt`, `allowedOrigins`, `lastUsedAt`, `revokedAt` ni `isActive`.
 */
export interface ApiKeyCreated {
  id: string;
  name: string;
  prefix: string;
  environment: 'sandbox' | 'live';
  /** Valor en claro. No se puede recuperar después. */
  secret: string;
  warning: string;
  /** Ejemplo de `curl` listo para copiar. */
  usage: string;
}

export interface ApiUsagePoint {
  date: string;
  calls: number;
  errors: number;
  creditsSpent: number;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface EtlValidation {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface EtlRun {
  id: string;
  datasetId: string;
  datasetName: string;
  /** Paso del pipeline: `fetch`, `load`, `validate`… */
  step: string;
  status: 'queued' | 'running' | 'ok' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  rowCount: number | null;
  cutDate: string | null;
  validations: EtlValidation[];
}

/**
 * Fila de `GET /admin/coverage`. Es una fila de DEPARTAMENTO, no de municipio:
 * `items` y `byDepartment` son el mismo arreglo. snake_case tal como sale de SQL.
 */
export interface CoverageDepartmentRow {
  code: string;
  name: string;
  municipalities: number;
  /** Cuántos de ellos gestiona el IGAC. */
  igac: number;
  /** De cuántos tenemos predios cargados. */
  with_parcels: number;
}

export interface CoverageSummary {
  total_municipalities: number;
  igac_municipalities: number;
  with_parcels: number;
  other_managers: number;
}

/** `GET /admin/coverage`: un `Page` con dos bloques extra. */
export interface AdminCoverageResponse extends Page<CoverageDepartmentRow> {
  summary: CoverageSummary;
  byDepartment: CoverageDepartmentRow[];
}

export interface AdminMetrics {
  users: number;
  organizations: number;
  activeSubscriptions: number;
  paidSubscriptions: number;
  conversionToPaidPct: number;
  activeUsers30d: number;
  activationPct: number;
  mrrCop: number;
  revenueThisMonthCop: number;
  paymentsThisMonth: number;
  churn30d: number;
  reportsLast30d: number;
  reportsThisMonth: number;
  reportsPerActiveUser: number;
  apiCallsLast30d: number;
  parcelsIndexed: number;
  municipalitiesWithCadastre: number;
  /** Aclaración sobre cómo se calculan las métricas. */
  note: string;
}

// ─── Respuestas genéricas ─────────────────────────────────────────────────────

/** Varias mutaciones (borrar proyecto, quitar miembro…) responden así, no con 204. */
export interface OkResponse {
  ok: true;
  [key: string]: unknown;
}
