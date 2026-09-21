-- 0005 · Contexto territorial
-- Datos de terceros: DANE, MEN, MinSalud/REPS, OSM, SGC, IDEAM, PNN/RUNAP, ANT, UPRA, Copernicus.
-- Cada tabla lleva `snapshot_id` para poder decir siempre fuente y fecha de corte.

-- ─── DANE · Marco Geoestadístico y CNPV ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.census_block (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT NOT NULL,                  -- codigo de manzana o seccion del MGN
  muni_code     CHAR(5) NOT NULL,
  /* urbano | rural — el MGN separa manzana (urbana) de seccion rural */
  kind          TEXT NOT NULL DEFAULT 'urbano',
  pop_total     INT,
  households    INT,
  dwellings     INT,
  /* Bandas de edad del CNPV: { "0_4": n, "5_9": n, … }. Se usa para poblacion en edad escolar. */
  age_bands     JSONB NOT NULL DEFAULT '{}'::jsonb,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  centroid      geometry(Point, 4326),
  h3_r9         h3index,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (code, snapshot_id)
);
CREATE INDEX IF NOT EXISTS census_block_geom_idx ON ctx.census_block USING GIST (geom);
CREATE INDEX IF NOT EXISTS census_block_muni_idx ON ctx.census_block (muni_code, snapshot_id);
CREATE INDEX IF NOT EXISTS census_block_h3_idx ON ctx.census_block (h3_r9);

COMMENT ON TABLE ctx.census_block IS
  'Manzanas y secciones del MGN con agregados del CNPV 2018. Dato agregado: nunca individual.';

CREATE TABLE IF NOT EXISTS ctx.population_projection (
  muni_code     CHAR(5) NOT NULL,
  year          INT NOT NULL,
  pop_total     BIGINT,
  pop_urban     BIGINT,
  pop_rural     BIGINT,
  age_bands     JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  PRIMARY KEY (muni_code, year, snapshot_id)
);

-- ─── MEN · Educación ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.school (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Codigo DANE del establecimiento o de la sede */
  dane_code     TEXT,
  name          TEXT NOT NULL,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  muni_code     CHAR(5),
  /* oficial | no_oficial | NO_DISPONIBLE */
  sector        TEXT,
  /* Niveles ofrecidos, tal como los reporta la fuente */
  levels        TEXT[] NOT NULL DEFAULT '{}',
  /* urbana | rural */
  location_kind TEXT,
  enrollment    INT,
  enrollment_year INT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(Point, 4326),
  h3_r9         h3index,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS school_geom_idx ON ctx.school USING GIST (geom);
CREATE INDEX IF NOT EXISTS school_muni_idx ON ctx.school (muni_code, snapshot_id);
CREATE INDEX IF NOT EXISTS school_name_trgm_idx ON ctx.school USING GIN (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS school_h3_idx ON ctx.school (h3_r9);

-- ─── MinSalud · REPS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.health_facility (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reps_code     TEXT,
  name          TEXT NOT NULL,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  muni_code     CHAR(5),
  /* Nivel de complejidad, tal como lo reporta el REPS */
  level         TEXT,
  /* publico | privado | mixto */
  nature        TEXT,
  services      TEXT[] NOT NULL DEFAULT '{}',
  beds          INT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(Point, 4326),
  h3_r9         h3index,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS health_facility_geom_idx ON ctx.health_facility USING GIST (geom);
CREATE INDEX IF NOT EXISTS health_facility_muni_idx ON ctx.health_facility (muni_code, snapshot_id);
CREATE INDEX IF NOT EXISTS health_facility_h3_idx ON ctx.health_facility (h3_r9);

-- ─── OpenStreetMap ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.poi (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  osm_id        BIGINT,
  osm_type      CHAR(1),                        -- n | w | r
  /* Categoria normalizada por nosotros: comercio, educacion, salud, financiero, ocio… */
  category      TEXT NOT NULL,
  subcategory   TEXT,
  name          TEXT,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  muni_code     CHAR(5),
  tags          JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(Point, 4326) NOT NULL,
  h3_r9         h3index,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS poi_geom_idx ON ctx.poi USING GIST (geom);
CREATE INDEX IF NOT EXISTS poi_category_idx ON ctx.poi (category, subcategory);
CREATE INDEX IF NOT EXISTS poi_muni_idx ON ctx.poi (muni_code, snapshot_id);
CREATE INDEX IF NOT EXISTS poi_h3_idx ON ctx.poi (h3_r9);
CREATE INDEX IF NOT EXISTS poi_name_trgm_idx ON ctx.poi USING GIN (name_fold gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ctx.road (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  osm_id        BIGINT,
  /* Clase OSM: motorway, trunk, primary, secondary, tertiary, residential, track… */
  class         TEXT NOT NULL,
  name          TEXT,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  surface       TEXT,
  /* true si la superficie es pavimentada segun las etiquetas de OSM */
  is_paved      BOOLEAN,
  lanes         INT,
  maxspeed_kmh  INT,
  muni_code     CHAR(5),
  tags          JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiLineString, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS road_geom_idx ON ctx.road USING GIST (geom);
CREATE INDEX IF NOT EXISTS road_class_idx ON ctx.road (class);
CREATE INDEX IF NOT EXISTS road_muni_idx ON ctx.road (muni_code, snapshot_id);
CREATE INDEX IF NOT EXISTS road_name_trgm_idx ON ctx.road USING GIN (name_fold gin_trgm_ops);

-- ─── IGAC Agrología · suelos ──────────────────────────────────────────────────
-- Polígonos grandes: se cargan subdivididos con ST_Subdivide para que el índice GiST sirva.

CREATE TABLE IF NOT EXISTS ctx.soil_unit (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Simbolo de la unidad cartografica de suelos, tal como lo trae el IGAC */
  symbol        TEXT,
  description   TEXT,
  /* Rango de pendiente declarado por la fuente */
  slope_range   TEXT,
  climate       TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS soil_unit_geom_idx ON ctx.soil_unit USING GIST (geom);
CREATE INDEX IF NOT EXISTS soil_unit_snapshot_idx ON ctx.soil_unit (snapshot_id);

CREATE TABLE IF NOT EXISTS ctx.land_capability (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Clase agrologica 1..8 */
  class_code    INT,
  /* Subclase con las limitantes, p. ej. 4pe */
  subclass      TEXT,
  description   TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  CONSTRAINT land_capability_class_chk CHECK (class_code IS NULL OR class_code BETWEEN 1 AND 8)
);
CREATE INDEX IF NOT EXISTS land_capability_geom_idx ON ctx.land_capability USING GIST (geom);
CREATE INDEX IF NOT EXISTS land_capability_class_idx ON ctx.land_capability (class_code);

CREATE TABLE IF NOT EXISTS ctx.land_vocation (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Vocacion: agricola, ganadera, agroforestal, forestal, conservacion… */
  vocation      TEXT,
  use_class     TEXT,
  description   TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS land_vocation_geom_idx ON ctx.land_vocation USING GIST (geom);
CREATE INDEX IF NOT EXISTS land_vocation_idx ON ctx.land_vocation (vocation);

CREATE TABLE IF NOT EXISTS ctx.land_use_conflict (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* sobreutilizacion | subutilizacion | uso_adecuado | otro */
  conflict_kind TEXT,
  severity      TEXT,
  description   TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS land_use_conflict_geom_idx ON ctx.land_use_conflict USING GIST (geom);

CREATE TABLE IF NOT EXISTS ctx.agricultural_frontier (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Categoria de la UPRA: frontera agricola, exclusion legal, bosques naturales… */
  category      TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agricultural_frontier_geom_idx ON ctx.agricultural_frontier USING GIST (geom);

-- ─── Amenazas y restricciones ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.hazard (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* mass_movement | seismic | flood | wildfire | volcanic | tsunami */
  kind          TEXT NOT NULL,
  /* Nivel tal como lo publica la fuente (muy alta, alta, media, baja, muy baja) */
  level         TEXT,
  /* Nivel normalizado 1..5 para poder puntuar; null si no se puede mapear */
  level_rank    INT,
  source        TEXT NOT NULL,                  -- SGC | IDEAM | otro
  /* Escala del estudio; determina si sirve para orientar o solo para contexto */
  scale         TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  CONSTRAINT hazard_rank_chk CHECK (level_rank IS NULL OR level_rank BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS hazard_geom_idx ON ctx.hazard USING GIST (geom);
CREATE INDEX IF NOT EXISTS hazard_kind_idx ON ctx.hazard (kind, level_rank);

COMMENT ON COLUMN ctx.hazard.scale IS
  'Escala del estudio de origen. A escala 1:100.000 el dato orienta pero no sustituye estudio de detalle.';

CREATE TABLE IF NOT EXISTS ctx.protected_area (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  runap_id      TEXT,
  name          TEXT NOT NULL,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  /* Categoria de manejo del RUNAP */
  category      TEXT,
  /* true si la categoria restringe de forma fuerte el uso del suelo */
  is_restrictive BOOLEAN NOT NULL DEFAULT TRUE,
  authority     TEXT,
  declared_year INT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS protected_area_geom_idx ON ctx.protected_area USING GIST (geom);
CREATE INDEX IF NOT EXISTS protected_area_name_trgm_idx ON ctx.protected_area USING GIN (name_fold gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ctx.ethnic_territory (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  name_fold     TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  /* resguardo_indigena | consejo_comunitario | territorio_ancestral */
  kind          TEXT NOT NULL,
  people        TEXT,                           -- pueblo o comunidad, dato colectivo
  resolution_ref TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ethnic_territory_geom_idx ON ctx.ethnic_territory USING GIST (geom);

COMMENT ON TABLE ctx.ethnic_territory IS
  'Territorios colectivos. Dato colectivo, nunca individual. Su presencia implica consulta a la autoridad etnica.';

CREATE TABLE IF NOT EXISTS ctx.mining_title (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title_code    TEXT,
  /* Etapa: exploracion, construccion y montaje, explotacion */
  stage         TEXT,
  mineral       TEXT,
  /* Razon social del titular: es persona juridica, dato publico. Si la fuente trae persona
     natural, la columna se descarta en la ingesta por la blocklist de PII. */
  holder_legal_entity TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mining_title_geom_idx ON ctx.mining_title USING GIST (geom);

-- ─── Ordenamiento territorial ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.pot_zone (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code     CHAR(5) NOT NULL,
  /* urbano | expansion | rural | suburbano | proteccion | NO_DISPONIBLE */
  classification TEXT,
  use           TEXT,
  /* Acto administrativo de origen: acuerdo, decreto, ano */
  source_doc    TEXT,
  /* Indices normativos, si el municipio los publica */
  max_height_floors INT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pot_zone_geom_idx ON ctx.pot_zone USING GIST (geom);
CREATE INDEX IF NOT EXISTS pot_zone_muni_idx ON ctx.pot_zone (muni_code, snapshot_id);

COMMENT ON TABLE ctx.pot_zone IS
  'Zonificacion del POT donde exista fuente. No hay repositorio nacional completo: la ausencia se declara como NO_DISPONIBLE.';

-- ─── SECOP II · contratación pública ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.public_contract (
  id            TEXT PRIMARY KEY,
  muni_code     CHAR(5),
  /* Entidad contratante: persona juridica publica, dato publico */
  entity        TEXT,
  object        TEXT,
  value_cop     NUMERIC(20, 2),
  signed_date   DATE,
  /* Categoria normalizada: infraestructura, educacion, salud, vias… */
  category      TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(Point, 4326),
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS public_contract_muni_idx ON ctx.public_contract (muni_code, signed_date DESC);
CREATE INDEX IF NOT EXISTS public_contract_geom_idx ON ctx.public_contract USING GIST (geom);

-- ─── Relieve ──────────────────────────────────────────────────────────────────
-- El DEM se guarda como raster para consultas puntuales y además agregado por celda H3,
-- que es lo que consume el motor de puntuación.
CREATE TABLE IF NOT EXISTS ctx.elevation_raster (
  rid           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rast          raster NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS elevation_raster_conv_idx
  ON ctx.elevation_raster USING GIST (ST_ConvexHull(rast));

CREATE TABLE IF NOT EXISTS ctx.elevation_cell (
  h3            h3index NOT NULL,
  res           INT NOT NULL,
  elevation_min_m  NUMERIC(8, 2),
  elevation_mean_m NUMERIC(8, 2),
  elevation_max_m  NUMERIC(8, 2),
  slope_mean_pct   NUMERIC(6, 2),
  slope_max_pct    NUMERIC(6, 2),
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  PRIMARY KEY (h3, snapshot_id)
);
CREATE INDEX IF NOT EXISTS elevation_cell_res_idx ON ctx.elevation_cell (res);

COMMENT ON TABLE ctx.elevation_cell IS
  'Altitud y pendiente agregadas por celda H3 desde el DEM. Es lo que consume packages/scoring.';
