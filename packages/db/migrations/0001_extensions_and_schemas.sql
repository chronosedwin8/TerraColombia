-- 0001 · Extensiones, esquemas y sistemas de referencia
-- Idempotente. Se aplica con `pnpm db:migrate`.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- pgrouting es opcional (solo para isócronas por red vial). No falla si no está.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgrouting;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgrouting no disponible: las isocronas usaran aproximacion por distancia';
END $$;

-- ─── Esquemas ─────────────────────────────────────────────────────────────────
-- raw       : el dato tal cual llega de la fuente, por corte. Nunca se consulta desde la API.
-- core      : catastro normalizado (IGAC y otros gestores). Licencia CC BY-SA: se mantiene separado.
-- ctx       : contexto territorial (DANE, MEN, REPS, OSM, SGC, IDEAM, RUNAP, UPRA…).
-- analytics : agregados propios (H3, indicadores municipales). Trabajo derivado nuestro.
-- app       : tablas de aplicación gestionadas por Prisma (usuarios, pagos, informes).
-- meta      : catálogo de datasets, cortes y linaje.
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ctx;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS meta;

COMMENT ON SCHEMA raw IS 'Datos tal como llegan de la fuente, por corte. No se sirve al usuario.';
COMMENT ON SCHEMA core IS 'Catastro normalizado. Datos con licencia CC BY-SA 4.0 del IGAC: separados de los indicadores propios.';
COMMENT ON SCHEMA ctx IS 'Contexto territorial de terceros (DANE, MEN, REPS, OSM, SGC, IDEAM, RUNAP, UPRA).';
COMMENT ON SCHEMA analytics IS 'Agregados e indicadores propios (trabajo derivado de TerraColombia).';
COMMENT ON SCHEMA app IS 'Tablas de aplicacion gestionadas por Prisma.';
COMMENT ON SCHEMA meta IS 'Catalogo de datasets, cortes y linaje de datos.';

-- ─── EPSG:9377 · MAGNA-SIRGAS / Origen-Nacional ───────────────────────────────
-- PROJ 8.2.1 no lo trae. Es el CRS en el que se calculan areas y distancias (PLAN §7).
-- Parametros del registro EPSG; misma definicion que packages/geo/src/crs.ts.
INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text)
SELECT
  9377,
  'EPSG',
  9377,
  'PROJCS["MAGNA-SIRGAS / Origen-Nacional",GEOGCS["MAGNA-SIRGAS",DATUM["Marco_Geocentrico_Nacional_de_Referencia",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6686"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4686"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",4],PARAMETER["central_meridian",-73],PARAMETER["scale_factor",0.9992],PARAMETER["false_easting",5000000],PARAMETER["false_northing",2000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Northing",NORTH],AXIS["Easting",EAST],AUTHORITY["EPSG","9377"]]',
  '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
WHERE NOT EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = 9377);

-- ─── Utilidades de texto para busqueda ────────────────────────────────────────
-- `unaccent` no es IMMUTABLE, asi que no se puede indexar directamente.
-- Este envoltorio fija el diccionario y declara la inmutabilidad, que es la
-- practica recomendada por la documentacion de PostgreSQL para indexar.
CREATE OR REPLACE FUNCTION public.tc_fold(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT upper(public.unaccent('public.unaccent', txt));
$$;

COMMENT ON FUNCTION public.tc_fold(text) IS
  'Normaliza texto para busqueda: quita tildes y pasa a mayusculas. IMMUTABLE para poder indexar.';
