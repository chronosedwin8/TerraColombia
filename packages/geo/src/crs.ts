import { SRID } from '@terracolombia/shared';

/**
 * Definiciones de CRS necesarias. EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional) no viene
 * en `spatial_ref_sys` de PostGIS 3.6 con PROJ 8.2, así que lo insertamos en la migración
 * 0001 con estas cadenas. Fuente de los parámetros: registro EPSG.
 *
 * EPSG:9377 — Transverse Mercator
 *   Latitud de origen  : 4° N
 *   Longitud de origen : 73° W
 *   Factor de escala   : 0,9992
 *   Falso Este         : 5.000.000 m
 *   Falso Norte        : 2.000.000 m
 *   Elipsoide          : GRS 1980 (MAGNA-SIRGAS)
 */
export const CRS_9377 = {
  srid: SRID.ORIGEN_NACIONAL,
  authName: 'EPSG',
  authSrid: 9377,
  proj4:
    '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  srtext:
    'PROJCS["MAGNA-SIRGAS / Origen-Nacional",' +
    'GEOGCS["MAGNA-SIRGAS",' +
    'DATUM["Marco_Geocentrico_Nacional_de_Referencia",' +
    'SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],' +
    'AUTHORITY["EPSG","6686"]],' +
    'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
    'AUTHORITY["EPSG","4686"]],' +
    'PROJECTION["Transverse_Mercator"],' +
    'PARAMETER["latitude_of_origin",4],' +
    'PARAMETER["central_meridian",-73],' +
    'PARAMETER["scale_factor",0.9992],' +
    'PARAMETER["false_easting",5000000],' +
    'PARAMETER["false_northing",2000000],' +
    'UNIT["metre",1,AUTHORITY["EPSG","9001"]],' +
    'AXIS["Northing",NORTH],AXIS["Easting",EAST],' +
    'AUTHORITY["EPSG","9377"]]',
} as const;

/** Extensión aproximada de Colombia continental + insular, en EPSG:4326. */
export const COLOMBIA_BBOX: [number, number, number, number] = [-81.85, -4.3, -66.8, 13.6];

/** Extensión de la zona continental, para validar geometrías de ingesta. */
export const COLOMBIA_MAINLAND_BBOX: [number, number, number, number] = [-79.1, -4.3, -66.8, 12.6];

export function isInsideColombia(lng: number, lat: number, insular = true): boolean {
  const b = insular ? COLOMBIA_BBOX : COLOMBIA_MAINLAND_BBOX;
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/**
 * Códigos EPSG que aparecen en las fuentes colombianas y su equivalencia de trabajo.
 * Se usan para decidir el `-s_srs` al reproyectar en la ingesta.
 */
export const KNOWN_SOURCE_SRIDS: Record<number, string> = {
  4326: 'WGS 84',
  4686: 'MAGNA-SIRGAS (geográficas)',
  9377: 'MAGNA-SIRGAS / Origen-Nacional',
  3116: 'MAGNA-SIRGAS / Colombia Bogota zone (origen antiguo, aún frecuente en el IGAC)',
  3115: 'MAGNA-SIRGAS / Colombia West zone',
  3117: 'MAGNA-SIRGAS / Colombia East Central zone',
  3118: 'MAGNA-SIRGAS / Colombia East zone',
  3857: 'WGS 84 / Pseudo-Mercator (teselas web)',
  21818: 'Bogota 1975 / Colombia Bogota zone (datum anterior, requiere transformación)',
};

export function describeSrid(srid: number | null | undefined): string {
  if (srid === null || srid === undefined) return 'CRS no declarado por la fuente';
  return KNOWN_SOURCE_SRIDS[srid] ?? `EPSG:${srid} (no catalogado)`;
}

/** SRID en el que se calculan áreas y distancias. */
export const MEASURE_SRID = SRID.ORIGEN_NACIONAL;
/** SRID en el que se almacenan y sirven las geometrías. */
export const SERVE_SRID = SRID.WGS84;
