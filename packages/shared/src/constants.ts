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
  'protected_area',
  'hazard',
  'soil_unit',
  'pot_zone',
] as const;

export type TileLayer = (typeof TILE_LAYERS)[number];

/** Zoom mínimo al que se sirven predios individuales. */
export const PARCEL_MIN_ZOOM = 14;
