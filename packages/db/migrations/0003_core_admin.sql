-- 0003 · División administrativa y gestores catastrales

CREATE TABLE IF NOT EXISTS core.department (
  code        CHAR(2) PRIMARY KEY,              -- DIVIPOLA
  name        TEXT NOT NULL,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  region      TEXT,                             -- Caribe, Andina, Pacifica, Orinoquia, Amazonia, Insular
  area_km2    NUMERIC,
  geom        geometry(MultiPolygon, 4326),
  centroid    geometry(Point, 4326),
  snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS department_geom_idx ON core.department USING GIST (geom);
CREATE INDEX IF NOT EXISTS department_name_trgm_idx ON core.department USING GIN (name_fold gin_trgm_ops);

CREATE TABLE IF NOT EXISTS core.municipality (
  code        CHAR(5) PRIMARY KEY,              -- DIVIPOLA: 2 depto + 3 municipio
  dept_code   CHAR(2) NOT NULL REFERENCES core.department(code) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  /* Categoria municipal (Ley 617/2000), si la fuente la trae */
  category    TEXT,
  is_capital  BOOLEAN NOT NULL DEFAULT FALSE,
  area_km2    NUMERIC,
  /* Poblacion proyectada DANE, con su ano en population_year */
  population      BIGINT,
  population_year INT,
  geom        geometry(MultiPolygon, 4326),
  centroid    geometry(Point, 4326),
  /* Centro poblado principal (cabecera municipal) */
  seat_point  geometry(Point, 4326),
  snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS municipality_geom_idx ON core.municipality USING GIST (geom);
CREATE INDEX IF NOT EXISTS municipality_centroid_idx ON core.municipality USING GIST (centroid);
CREATE INDEX IF NOT EXISTS municipality_dept_idx ON core.municipality (dept_code);
CREATE INDEX IF NOT EXISTS municipality_name_trgm_idx ON core.municipality USING GIN (name_fold gin_trgm_ops);

COMMENT ON TABLE core.municipality IS 'Municipios DIVIPOLA con geometria del MGN del DANE.';

-- ─── Gestores catastrales (PLAN §2) ───────────────────────────────────────────
-- La base abierta del IGAC solo cubre los municipios donde el IGAC es gestor.
-- Esta tabla es la que permite ser honestos con la cobertura (regla 6 de CLAUDE.md).
CREATE TABLE IF NOT EXISTS core.cadastral_manager (
  muni_code       CHAR(5) PRIMARY KEY REFERENCES core.municipality(code) ON DELETE CASCADE,
  manager_name    TEXT NOT NULL,
  is_igac         BOOLEAN NOT NULL,
  /* Dataset del que provienen los predios de este municipio, si hay alguno */
  source_id       TEXT REFERENCES meta.dataset(id) ON DELETE SET NULL,
  /* full | partial | none | unknown — alimenta el bloque `coverage` de la API */
  coverage_status TEXT NOT NULL DEFAULT 'unknown',
  /* Fecha de corte de los predios que tenemos para este municipio */
  last_cut_date   DATE,
  /* Capas que SI tenemos cuando no hay catastro, para el estado vacio honesto */
  available_layers TEXT[] NOT NULL DEFAULT '{}',
  /* URL del portal del gestor, para remitir al usuario */
  manager_url     TEXT,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cadastral_manager_status_chk
    CHECK (coverage_status IN ('full', 'partial', 'none', 'unknown'))
);

COMMENT ON TABLE core.cadastral_manager IS
  'Municipio -> gestor catastral -> fuente -> estado de cobertura. Base de la arquitectura de adaptadores de la Fase 7.';

CREATE INDEX IF NOT EXISTS cadastral_manager_igac_idx ON core.cadastral_manager (is_igac, coverage_status);

-- ─── Centros poblados y topónimos (geocodificación y búsqueda) ────────────────
CREATE TABLE IF NOT EXISTS core.populated_place (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) REFERENCES core.municipality(code) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  /* cabecera | centro_poblado | caserio | inspeccion | corregimiento | vereda */
  kind        TEXT NOT NULL,
  geom        geometry(Point, 4326) NOT NULL,
  snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS populated_place_geom_idx ON core.populated_place USING GIST (geom);
CREATE INDEX IF NOT EXISTS populated_place_name_trgm_idx ON core.populated_place USING GIN (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS populated_place_muni_idx ON core.populated_place (muni_code);

CREATE TABLE IF NOT EXISTS core.toponym (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  /* Categoria del nombre geografico segun la fuente del IGAC */
  category    TEXT,
  muni_code   CHAR(5),
  geom        geometry(Point, 4326) NOT NULL,
  snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS toponym_geom_idx ON core.toponym USING GIST (geom);
CREATE INDEX IF NOT EXISTS toponym_name_trgm_idx ON core.toponym USING GIN (name_fold gin_trgm_ops);

COMMENT ON TABLE core.toponym IS 'Nombres geograficos oficiales (IGAC). Alimenta el buscador universal.';
