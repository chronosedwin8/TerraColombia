-- ═════════════════════════════════════════════════════════════════════════════
-- TerraColombia — inicialización del contenedor PostGIS
--
-- ÁMBITO: este script SOLO prepara el motor (extensiones, CRS, ajustes de
-- sesión). NO crea esquemas de aplicación ni tablas: eso es responsabilidad
-- exclusiva de `packages/db/migrations` (`pnpm db:migrate`), que es el único
-- lugar donde vive el modelo de datos. Duplicar DDL aquí produciría dos
-- verdades y rompería el versionado de migraciones.
--
-- CUÁNDO CORRE: `docker-entrypoint.sh` de la imagen `postgis/postgis` ejecuta
-- los archivos de `/docker-entrypoint-initdb.d` en orden alfabético y SOLO la
-- primera vez que se inicializa el volumen de datos. Si se cambia este archivo
-- hay que recrear el volumen (`docker compose down -v`) o aplicarlo a mano.
--
-- IDEMPOTENCIA: todo con `IF NOT EXISTS` / `ON CONFLICT`, para poder aplicarlo
-- a mano sobre una base existente sin romper nada:
--   psql -U postgres -d terracolombia -f infra/postgres/init/01-extensions.sql
--
-- El equipo de Windows con PostgreSQL 17 nativo aplica este mismo archivo con
-- `infra/scripts/setup-local.ps1` (ver docs/OPERACION.md).
-- ═════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensiones geográficas
-- ─────────────────────────────────────────────────────────────────────────────

-- PostGIS: geometrías, índices GiST, ST_MakeValid, ST_AsMVT, ST_Subdivide.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Rásteres: DEM Copernicus 30 m (altitud y pendiente, PLAN §5.2).
-- En PostGIS 3.x el raster es una extensión aparte.
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- `postgis_topology` NO se crea a propósito: no se usa, y crearla añade un
-- esquema `topology` a la base. Este script no crea esquemas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Búsqueda de texto (buscador universal: municipios, barrios, veredas,
--    topónimos y direcciones — PLAN §7)
-- ─────────────────────────────────────────────────────────────────────────────

-- Similitud por trigramas para búsqueda tolerante a errores de escritura.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Quita tildes y diacríticos: "Bogotá" = "bogota".
CREATE EXTENSION IF NOT EXISTS unaccent;

-- UUID v4 para identificadores de `app` y de informes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Métricas de consultas para los tableros de Grafana y el objetivo p95 de §13.
--
-- OJO: `pg_stat_statements` necesita estar en `shared_preload_libraries`, lo que
-- exige reiniciar el servidor. El contenedor ya lo trae configurado
-- (`docker-compose.yml`), pero una instalación nativa normalmente no.
--
-- Si la librería no está cargada, `CREATE EXTENSION` funciona pero la vista
-- falla al consultarla ("must be loaded via shared_preload_libraries"), que es
-- peor que no tenerla: el exportador de métricas daría error en cada raspado.
-- Por eso solo se crea si la librería está cargada de verdad.
DO $$
BEGIN
  IF current_setting('shared_preload_libraries', true) LIKE '%pg_stat_statements%' THEN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    RAISE NOTICE 'TerraColombia: pg_stat_statements activa.';
  ELSE
    RAISE NOTICE 'TerraColombia: pg_stat_statements NO se crea porque la librería no está en shared_preload_libraries.';
    RAISE NOTICE '  Para activarla en una instalación nativa: añada a postgresql.conf';
    RAISE NOTICE '    shared_preload_libraries = ''pg_stat_statements''';
    RAISE NOTICE '    pg_stat_statements.track = all';
    RAISE NOTICE '  reinicie el servicio y vuelva a ejecutar este script.';
    RAISE NOTICE '  Sin ella, el panel "Consultas SQL más costosas" de Grafana queda vacío;';
    RAISE NOTICE '  nada más del producto depende de esta extensión.';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extensiones opcionales: H3 y pgRouting
--
-- `h3`/`h3_postgis` y `pgrouting` no vienen en la imagen `postgis/postgis`.
-- El producto NO depende de ellas: los índices H3 se calculan en Node con
-- `h3-js` y se guardan como TEXT (docs/DECISIONES.md ADR-002). Se intenta
-- crearlas dentro de un bloque que captura el error para que la ausencia no
-- aborte la inicialización del contenedor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS h3;
  RAISE NOTICE 'TerraColombia: extensión h3 disponible.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TerraColombia: extensión h3 NO disponible (%). Se usa h3-js en Node y columnas TEXT (ADR-002).', SQLERRM;
END
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS h3_postgis;
  RAISE NOTICE 'TerraColombia: extensión h3_postgis disponible.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TerraColombia: extensión h3_postgis NO disponible (%).', SQLERRM;
END
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgrouting;
  RAISE NOTICE 'TerraColombia: extensión pgrouting disponible.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TerraColombia: extensión pgrouting NO disponible (%). Las isócronas usarán buffers/red OSM sin enrutamiento.', SQLERRM;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. EPSG:9377 — MAGNA-SIRGAS / Origen-Nacional
--
-- Es el CRS en el que TerraColombia calcula TODA área y TODA distancia
-- (PLAN §7). Las versiones de PROJ anteriores a la 9.x no lo traen en
-- `spatial_ref_sys`, así que lo insertamos si falta.
--
-- Parámetros oficiales del registro EPSG:
--   Proyección          Transverse Mercator
--   Latitud de origen   4° N
--   Meridiano central   73° W
--   Factor de escala    0,9992
--   Falso Este          5.000.000 m
--   Falso Norte         2.000.000 m
--   Elipsoide           GRS 1980 (datum MAGNA-SIRGAS, EPSG:6686)
--
-- Debe coincidir carácter a carácter con `packages/geo/src/crs.ts` (CRS_9377)
-- y con la migración 0001 de `packages/db`. Si se cambia aquí, cambiar allí.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, proj4text, srtext)
VALUES (
  9377,
  'EPSG',
  9377,
  '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'PROJCS["MAGNA-SIRGAS / Origen-Nacional",GEOGCS["MAGNA-SIRGAS",DATUM["Marco_Geocentrico_Nacional_de_Referencia",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6686"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4686"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",4],PARAMETER["central_meridian",-73],PARAMETER["scale_factor",0.9992],PARAMETER["false_easting",5000000],PARAMETER["false_northing",2000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Northing",NORTH],AXIS["Easting",EAST],AUTHORITY["EPSG","9377"]]'
)
ON CONFLICT (srid) DO NOTHING;

-- EPSG:4686 — MAGNA-SIRGAS geográficas. Es el CRS nativo de casi toda la
-- cartografía del IGAC y el `-s_srs` habitual de `ogr2ogr`. PROJ sí lo trae,
-- pero lo verificamos porque sin él falla la ingesta entera.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM spatial_ref_sys WHERE srid = 4686) THEN
    RAISE EXCEPTION
      'Falta EPSG:4686 (MAGNA-SIRGAS) en spatial_ref_sys. La ingesta del IGAC no puede reproyectar. Revise la instalación de PROJ.';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verificación final: si algo esencial falta, fallar con mensaje claro en
--    español en vez de dejar un contenedor "sano" pero inservible.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  faltantes TEXT[] := ARRAY[]::TEXT[];
  requeridas TEXT[] := ARRAY['postgis', 'postgis_raster', 'pg_trgm', 'unaccent', 'pgcrypto'];
  ext TEXT;
BEGIN
  FOREACH ext IN ARRAY requeridas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext) THEN
      faltantes := faltantes || ext;
    END IF;
  END LOOP;

  IF array_length(faltantes, 1) > 0 THEN
    RAISE EXCEPTION 'Extensiones obligatorias que no se pudieron crear: %. La base no sirve para TerraColombia.', array_to_string(faltantes, ', ');
  END IF;

  RAISE NOTICE 'TerraColombia: motor listo. PostGIS %, EPSG:9377 presente. Los esquemas los crea "pnpm db:migrate".',
    (SELECT extversion FROM pg_extension WHERE extname = 'postgis');
END
$$;
