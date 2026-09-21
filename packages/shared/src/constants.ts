/** Sistemas de referencia usados en todo el producto. */
export const SRID = {
  /** Geometrías servidas al cliente (WGS 84). */
  WGS84: 4326,
  /** MAGNA-SIRGAS, sistema nacional geográfico del IGAC. */
  MAGNA_SIRGAS: 4686,
  /** MAGNA-SIRGAS / Origen-Nacional: cálculo de áreas y distancias en metros. */
  ORIGEN_NACIONAL: 9377,
} as const;

/** Resoluciones H3 usadas por el motor de puntuación. */
export const H3_RES = {
  /** ~0,74 km² por celda: tableros municipales y mapas de calor. */
  COARSE: 8,
  /** ~0,10 km² por celda: localización de negocio y agregados finos. */
  FINE: 9,
} as const;

export const ZONE = {
  URBAN: '01',
  RURAL: '02',
} as const;

export type ZoneCode = (typeof ZONE)[keyof typeof ZONE];

export const ZONE_LABEL: Record<string, string> = {
  '01': 'Urbano',
  '02': 'Rural',
};

/** Longitudes válidas de código predial nacional. */
export const NPN_LENGTH_30 = 30;
export const NPN_LENGTH_20 = 20;

/** Límite duro de área analizable, en km², por encima del cual se exige cola. */
export const AREA_ANALYSIS_SYNC_LIMIT_KM2 = 5;

/** Techo absoluto de área analizable en una sola petición, cualquiera sea el plan. */
export const AREA_ANALYSIS_HARD_LIMIT_KM2 = 2000;

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 1000;

/** Tiempo máximo de una consulta interactiva, en milisegundos. */
export const STATEMENT_TIMEOUT_MS = {
  interactive: 8_000,
  search: 4_000,
  analysis: 30_000,
  export: 120_000,
} as const;

export const TILE_LAYERS = [
  'parcel',
  'building',
  'block',
  'sector',
  'municipality',
  'department',
  'h3',
  'school',
  'health_facility',
  // `road` se servía desde la base y estaba en el catálogo de `meta.layer`, pero faltaba en
  // esta lista, así que el cliente no podía declararla ni ofrecerla: era la única capa de
  // contexto con datos reales inalcanzable desde el panel de capas.
  'road',
  'protected_area',
  'hazard',
  'soil_unit',
  'pot_zone',
] as const;

export type TileLayer = (typeof TILE_LAYERS)[number];

/** Zoom mínimo al que se sirven predios individuales. */
export const PARCEL_MIN_ZOOM = 14;

/**
 * Estados de un trabajo en cola.
 *
 * Viven aquí porque los leen los dos extremos: la API los escribe y la interfaz decide con
 * ellos cuándo dejar de sondear. Estuvieron duplicados como literales en cada lado y
 * divergieron —la interfaz esperaba `completed` y `cancelled`, la API escribía `done` y
 * `canceled`—, así que ningún trabajo terminaba nunca en pantalla: la barra de progreso se
 * quedaba girando y el resultado no se mostraba jamás. Un solo sitio para que no vuelva a
 * pasar.
 */
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'canceled'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Estados en los que el trabajo ya no va a cambiar: el cliente deja de sondear. */
export const JOB_TERMINAL_STATUSES = ['done', 'failed', 'canceled'] as const;

export function isJobFinished(status: string): boolean {
  return (JOB_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Tipos de cambio predial entre dos cortes.
 *
 * La restricción `parcel_change_type_chk` de la migración 0004 admite estos seis y la API
 * tiene etiqueta para los seis, pero el DSL de la petición solo aceptaba cinco: se podía
 * detectar que una construcción desapareció y no se podía pedir ese filtro. Declararlos aquí
 * evita que las tres listas vuelvan a separarse.
 */
export const PARCEL_CHANGE_TYPES = [
  'created',
  'removed',
  'attrs_changed',
  'geometry_changed',
  'building_added',
  'building_removed',
] as const;

export type ParcelChangeType = (typeof PARCEL_CHANGE_TYPES)[number];
