/**
 * Declaración de datasets del ETL (PLAN.md §5, último párrafo).
 *
 * Cada dataset del MVP se declara con: `id, source, name, url, connector, format,
 * crs, frequency, license, attribution, fieldMapping, piiBlocklist, targetTable,
 * validations`. Aquí van además los campos que el producto necesita para cumplir
 * las reglas 2, 4 y 6 de CLAUDE.md: qué módulos alimenta, de dónde salió la
 * inspección y qué queda sin verificar.
 *
 * Regla 2 (crítica): `fieldMapping` solo puede traer nombres de campo observados
 * de verdad en la Fase 0. Si un dataset no se pudo inspeccionar, se declara con
 * `fieldMapping: NOT_INSPECTED` y una nota; nunca con campos inventados.
 */

// ─── Marcadores ───────────────────────────────────────────────────────────────

/** El dataset no se pudo inspeccionar: sus campos están sin verificar. */
export const NOT_INSPECTED = 'NO_INSPECCIONADO' as const;
export type NotInspected = typeof NOT_INSPECTED;

/** La fuente no ofrece el dato. Coherente con `NOT_AVAILABLE` de `@terracolombia/shared`. */
export const NOT_AVAILABLE = 'NO_DISPONIBLE' as const;

// ─── Piezas ───────────────────────────────────────────────────────────────────

export type DatasetConnector =
  | 'arcgis-rest'
  | 'socrata'
  | 'wfs'
  | 'file-download'
  | 'osm'
  | 'manual';

export type DatasetFormat =
  | 'geojson'
  | 'esri-json'
  | 'json'
  | 'csv'
  | 'gpkg'
  | 'gdb'
  | 'shp'
  | 'zip'
  | 'pbf'
  | 'tif'
  | 'xlsx'
  | 'html';

export type DatasetFrequency =
  | 'diaria'
  | 'semanal'
  | 'mensual'
  | 'trimestral'
  | 'semestral'
  | 'anual'
  | 'decenal'
  | 'eventual'
  | 'desconocida';

/** Módulos funcionales de PLAN.md §1.3. */
export type ModuleId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10'
  | 'M11'
  | 'M12';

/** Confianza en la declaración, según lo que se pudo verificar en la Fase 0. */
export type InspectionStatus =
  /** Se listaron los campos reales desde el servicio o el archivo. */
  | 'inspeccionado'
  /** Se verificó que la URL responde, pero no los campos. */
  | 'url-verificada'
  /** Solo se conoce por documentación o por el portal; nada verificado por máquina. */
  | 'no-inspeccionado';

/**
 * Mapeo de campo de origen → columna destino.
 * La clave es el nombre EXACTO tal como lo devuelve la fuente (mayúsculas
 * incluidas); el valor describe la columna de destino y la transformación.
 */
export interface FieldMap {
  /** Columna de la tabla destino. */
  readonly target: string;
  /** Tipo SQL destino. */
  readonly sqlType: string;
  /**
   * Transformación a aplicar, en texto. Se implementa en el paso `transform` del
   * pipeline; aquí se declara para que el catálogo sea legible.
   */
  readonly transform?: string;
  /** Nota sobre el campo (dominio, semántica, rarezas observadas). */
  readonly note?: string;
}

export interface DatasetValidation {
  readonly id: string;
  /** Qué comprueba, en español. */
  readonly description: string;
  /** `blocker` detiene la publicación del snapshot; `warning` solo alerta. */
  readonly severity: 'blocker' | 'warning';
}

export interface DatasetSourceRef {
  /** Servicio/capa concreta de la que salió la inspección. */
  readonly inspectedFrom: string | null;
  /** Archivo del catálogo con la evidencia. */
  readonly catalogFile: string | null;
  /** Fecha de la inspección (AAAA-MM-DD). */
  readonly inspectedAt: string | null;
}

// ─── Declaración ──────────────────────────────────────────────────────────────

export interface DatasetDefinition {
  /** Identificador estable; se usa en `meta.dataset.id` y en la procedencia. */
  readonly id: string;
  /** Entidad responsable: IGAC, DANE, MEN, MinSalud, Colombia Compra, OSM… */
  readonly source: string;
  readonly name: string;
  /** URL exacta y verificada del recurso. Nunca inventada (regla 2). */
  readonly url: string;
  readonly connector: DatasetConnector;
  readonly format: DatasetFormat;
  /** EPSG de origen, o `null` si el dataset es alfanumérico. */
  readonly crs: number | null;
  readonly frequency: DatasetFrequency;
  readonly license: string;
  /** Texto exacto de atribución que debe mostrarse (regla 4). */
  readonly attribution: string;
  /**
   * Mapeo campo origen → destino, o `NOT_INSPECTED` si no se pudo inspeccionar.
   * Regla 2 de CLAUDE.md.
   */
  readonly fieldMapping: Readonly<Record<string, FieldMap>> | NotInspected;
  /**
   * Columnas que este dataset debe descartar explícitamente, además de la lista
   * negra global. Vacío no significa "no hay PII": la lista global siempre aplica.
   */
  readonly piiBlocklist: readonly string[];
  /** Tabla destino, con esquema (`core.parcel`, `ctx.school`…). */
  readonly targetTable: string;
  readonly validations: readonly DatasetValidation[];

  // ─ Campos propios del producto ─
  /** Módulos de PLAN.md §1.3 que dependen de este dataset. */
  readonly modules: readonly ModuleId[];
  /** Por qué entra al MVP. Se imprime en `data-catalog/SELECCION.md`. */
  readonly justification: string;
  readonly inspection: InspectionStatus;
  readonly evidence: DatasetSourceRef;
  /** Prioridad dentro del MVP: 1 = imprescindible, 3 = deseable. */
  readonly priority: 1 | 2 | 3;
  /** Riesgos o pendientes concretos de este dataset. */
  readonly notes: readonly string[];
  /** Fase del plan en la que se ingiere (§14). */
  readonly phase: number;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function isInspected(
  mapping: DatasetDefinition['fieldMapping'],
): mapping is Readonly<Record<string, FieldMap>> {
  return mapping !== NOT_INSPECTED;
}

/** Nombres de campo de origen declarados, o `[]` si no se inspeccionó. */
export function sourceFieldsOf(dataset: DatasetDefinition): string[] {
  return isInspected(dataset.fieldMapping) ? Object.keys(dataset.fieldMapping) : [];
}

/** Columnas destino declaradas. */
export function targetColumnsOf(dataset: DatasetDefinition): string[] {
  return isInspected(dataset.fieldMapping)
    ? Object.values(dataset.fieldMapping).map((m) => m.target)
    : [];
}
