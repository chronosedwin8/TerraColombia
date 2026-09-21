-- 0002 · Catálogo de datasets, cortes y linaje
-- Todo dato servido al usuario debe poder rastrearse hasta una fila de meta.snapshot.

CREATE TABLE IF NOT EXISTS meta.dataset (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,                  -- IGAC, DANE, MEN, MINSALUD, OSM, SGC, IDEAM, PNN, UPRA, ANT, DEMO…
  name          TEXT NOT NULL,
  description    TEXT,
  license       TEXT NOT NULL,                  -- id de LICENSES en packages/shared/src/legal.ts
  attribution   TEXT NOT NULL,                  -- texto exacto a mostrar junto a la cifra
  url           TEXT,
  frequency     TEXT NOT NULL DEFAULT 'unknown', -- monthly | quarterly | yearly | irregular | unknown
  connector     TEXT,                           -- arcgis-rest | socrata | wfs | file-download | osm | manual
  format        TEXT,
  source_srid   INT,
  target_table  TEXT,
  /* true si la licencia tiene clausula ShareAlike: obliga a separar en exportaciones */
  share_alike   BOOLEAN NOT NULL DEFAULT FALSE,
  /* Nivel de confianza declarado por nosotros sobre la fuente, para la UI */
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta.dataset IS 'Un dataset = una fuente + una capa/recurso concreto, declarado en etl/config/datasets.';
COMMENT ON COLUMN meta.dataset.attribution IS 'Texto literal de atribucion. Obligatorio mostrarlo (regla 4 de CLAUDE.md).';

CREATE TABLE IF NOT EXISTS meta.snapshot (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id    TEXT NOT NULL REFERENCES meta.dataset(id) ON DELETE CASCADE,
  cut_date      DATE NOT NULL,                  -- fecha a la que corresponde el dato en la fuente
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count     BIGINT,
  checksum      TEXT,                           -- SHA-256 del archivo descargado
  /* pending | downloading | staged | validated | transformed | published | failed | superseded */
  status        TEXT NOT NULL DEFAULT 'pending',
  /* Solo un snapshot activo por dataset: es el que ve el usuario. */
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  /* true = snapshot de demostracion (ADR-006). La API lo marca en meta.synthetic. */
  is_synthetic  BOOLEAN NOT NULL DEFAULT FALSE,
  source_url    TEXT,
  storage_key   TEXT,                           -- clave en el almacen de objetos
  /* Camino de staging usado: ogr2ogr | node-geojson | node-csv | socrata | manual */
  stage_method  TEXT,
  error_message TEXT,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, cut_date)
);

-- Un solo snapshot activo por dataset, garantizado por indice parcial.
CREATE UNIQUE INDEX IF NOT EXISTS snapshot_one_active_per_dataset
  ON meta.snapshot (dataset_id) WHERE is_active;

CREATE INDEX IF NOT EXISTS snapshot_dataset_cut_idx ON meta.snapshot (dataset_id, cut_date DESC);
CREATE INDEX IF NOT EXISTS snapshot_status_idx ON meta.snapshot (status) WHERE status <> 'published';

COMMENT ON TABLE meta.snapshot IS 'Un corte concreto de un dataset. Publicacion atomica: se carga y al final se marca is_active.';

-- ─── Linaje: qué corrida produjo qué ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta.etl_run (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id    TEXT NOT NULL REFERENCES meta.dataset(id) ON DELETE CASCADE,
  snapshot_id   BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL,
  /* discover | download | stage | validate | transform | index | aggregate | tiles | publish | diff */
  step          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running', -- running | ok | failed | skipped
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  duration_ms   BIGINT,
  rows_in       BIGINT,
  rows_out      BIGINT,
  message       TEXT,
  detail        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS etl_run_dataset_idx ON meta.etl_run (dataset_id, started_at DESC);
CREATE INDEX IF NOT EXISTS etl_run_snapshot_idx ON meta.etl_run (snapshot_id);

-- ─── Validaciones y hallazgos de calidad de datos ─────────────────────────────
CREATE TABLE IF NOT EXISTS meta.validation (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  /* row_count_delta | invalid_geometry | bad_npn | duplicate | zero_area | pii_detected |
     orphan_geometry | orphan_record | srid_mismatch | outside_colombia */
  check_name    TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'warning', -- info | warning | error
  /* error bloquea la publicacion del snapshot */
  passed        BOOLEAN NOT NULL,
  affected_rows BIGINT NOT NULL DEFAULT 0,
  message       TEXT NOT NULL,
  sample        JSONB NOT NULL DEFAULT '[]'::jsonb, -- muestra SIN PII
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS validation_snapshot_idx ON meta.validation (snapshot_id, severity);

-- ─── Registro de PII descartada (regla 3 de CLAUDE.md) ────────────────────────
-- Guarda QUE se descarto, nunca el valor descartado.
CREATE TABLE IF NOT EXISTS meta.pii_discard_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id   BIGINT REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  dataset_id    TEXT NOT NULL,
  source_layer  TEXT,
  column_name   TEXT NOT NULL,
  reason        TEXT NOT NULL,                  -- blocklist_exact | blocklist_pattern | content_heuristic
  occurrences   BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta.pii_discard_log IS
  'Registro de columnas descartadas por posible dato personal. Nunca almacena el valor, solo el nombre de la columna y el motivo.';

CREATE INDEX IF NOT EXISTS pii_discard_dataset_idx ON meta.pii_discard_log (dataset_id, created_at DESC);

-- ─── Catálogo de capas publicables (para GET /layers) ─────────────────────────
CREATE TABLE IF NOT EXISTS meta.layer (
  id            TEXT PRIMARY KEY,               -- parcel, school, hazard, h3…
  dataset_id    TEXT REFERENCES meta.dataset(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,                  -- nombre en espanol para la UI
  description   TEXT NOT NULL,
  geometry_type TEXT NOT NULL,                  -- point | line | polygon | h3
  min_zoom      INT NOT NULL DEFAULT 0,
  max_zoom      INT NOT NULL DEFAULT 22,
  /* Definicion de leyenda: [{ value, label, color }] */
  legend        JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* Terminos del glosario relacionados, para el tooltip */
  glossary_ids  TEXT[] NOT NULL DEFAULT '{}',
  /* Plan minimo requerido para ver la capa */
  min_plan      TEXT NOT NULL DEFAULT 'free',
  sort_order    INT NOT NULL DEFAULT 100,
  is_enabled    BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE meta.layer IS 'Catalogo de capas servibles con su leyenda y glosario. Alimenta GET /layers.';
