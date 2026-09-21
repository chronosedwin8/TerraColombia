-- 0006 · Agregados e indicadores propios
--
-- Todo lo que vive en `analytics` es trabajo derivado nuestro: cálculo, normalización y
-- combinación. Se mantiene separado de `core` y `ctx` porque la cláusula ShareAlike de
-- CC BY-SA 4.0 puede alcanzar a las bases derivadas que se redistribuyan (PLAN §2), y las
-- exportaciones deben poder separar un grupo del otro.

CREATE TABLE IF NOT EXISTS analytics.h3_cell (
  h3                h3index PRIMARY KEY,
  res               INT NOT NULL,
  muni_code         CHAR(5),
  dept_code         CHAR(2),
  /* Geometria de la celda, derivada del indice: columna generada, no puede desincronizarse */
  geom              geometry(Polygon, 4326)
                      GENERATED ALWAYS AS (h3_cell_to_boundary_geometry(h3)) STORED,

  -- Catastro
  n_parcels         INT NOT NULL DEFAULT 0,
  /* { min, p25, median, p75, max, sum } del area de predio en m2 */
  area_stats        JSONB NOT NULL DEFAULT '{}'::jsonb,
  parcel_area_sum_m2 NUMERIC(18, 2),
  built_area_sum_m2  NUMERIC(18, 2),
  n_large_lots      INT NOT NULL DEFAULT 0,      -- predios > 1.000 m2 sin construccion
  /* Reparto por destino economico: { "habitacional": n, … } */
  use_counts        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Población (DANE)
  pop               INT,
  pop_school_age    INT,                         -- 5 a 16 anos
  households        INT,
  dwellings         INT,

  -- Equipamientos
  n_schools         INT NOT NULL DEFAULT 0,
  school_enrollment INT,
  n_health          INT NOT NULL DEFAULT 0,
  /* Conteo de POIs por categoria: { "comercio": n, "financiero": n, … } */
  poi_counts        JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Accesibilidad y relieve
  /* 0–100. Fórmula declarada en packages/scoring/src/indicators.ts */
  road_access_score NUMERIC(6, 2),
  dist_primary_road_m NUMERIC(12, 2),
  dist_paved_road_m   NUMERIC(12, 2),
  dist_muni_seat_m    NUMERIC(12, 2),
  slope_mean_pct    NUMERIC(6, 2),
  elevation_mean_m  NUMERIC(8, 2),

  -- Restricciones (banderas, no puntajes)
  /* { "mass_movement": "alta", "flood": null, "protected": true, "ethnic": false, … } */
  hazard_flags      JSONB NOT NULL DEFAULT '{}'::jsonb,
  protected_pct     NUMERIC(6, 3),
  ethnic_pct        NUMERIC(6, 3),
  urban_pct         NUMERIC(6, 3),
  /* Reparto de clases agrologicas dentro de la celda: { "3": 0.6, "4": 0.4 } */
  capability_mix    JSONB NOT NULL DEFAULT '{}'::jsonb,
  vocation_mix      JSONB NOT NULL DEFAULT '{}'::jsonb,

  /* Linaje: que snapshot de cada dataset alimento esta celda */
  source_snapshots  JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT h3_cell_res_chk CHECK (res BETWEEN 0 AND 15)
);

CREATE INDEX IF NOT EXISTS h3_cell_geom_idx ON analytics.h3_cell USING GIST (geom);
CREATE INDEX IF NOT EXISTS h3_cell_muni_idx ON analytics.h3_cell (muni_code, res);
CREATE INDEX IF NOT EXISTS h3_cell_dept_idx ON analytics.h3_cell (dept_code, res);
CREATE INDEX IF NOT EXISTS h3_cell_res_idx ON analytics.h3_cell (res);

COMMENT ON TABLE analytics.h3_cell IS
  'Agregados por celda H3. Base de los mapas de calor y del motor de localizacion de negocio.';
COMMENT ON COLUMN analytics.h3_cell.source_snapshots IS
  'Linaje por dataset: { datasetId: snapshotId }. Permite citar fuente y fecha de corte de cada cifra.';

-- ─── Indicadores municipales (Observatorio, M9) ───────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.muni_indicator (
  muni_code     CHAR(5) NOT NULL,
  /* id del indicador en packages/scoring/src/indicators.ts */
  indicator     TEXT NOT NULL,
  /* Periodo: AAAA o AAAA-MM */
  period        TEXT NOT NULL,
  value         NUMERIC(20, 4),
  unit          TEXT,
  /* Posicion del municipio en el ranking nacional para ese indicador y periodo */
  national_rank INT,
  /* Percentil 0–100 dentro del pais */
  national_pct  NUMERIC(6, 2),
  source_snapshots JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muni_code, indicator, period)
);
CREATE INDEX IF NOT EXISTS muni_indicator_indicator_idx ON analytics.muni_indicator (indicator, period, value DESC);

-- ─── Dinámica predial entre cortes (para el Observatorio) ──────────────────────
CREATE TABLE IF NOT EXISTS analytics.muni_parcel_dynamics (
  muni_code       CHAR(5) NOT NULL,
  from_cut_date   DATE NOT NULL,
  to_cut_date     DATE NOT NULL,
  parcels_created INT NOT NULL DEFAULT 0,
  parcels_removed INT NOT NULL DEFAULT 0,
  parcels_geom_changed INT NOT NULL DEFAULT 0,
  parcels_attrs_changed INT NOT NULL DEFAULT 0,
  buildings_added INT NOT NULL DEFAULT 0,
  built_area_added_m2 NUMERIC(18, 2),
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (muni_code, from_cut_date, to_cut_date)
);

-- ─── Vista materializada: resumen por municipio para la ficha municipal ───────
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.muni_summary AS
SELECT
  m.code                                   AS muni_code,
  m.name                                   AS muni_name,
  m.dept_code,
  d.name                                   AS dept_name,
  m.population,
  m.population_year,
  m.area_km2,
  cm.manager_name,
  cm.is_igac,
  cm.coverage_status,
  cm.last_cut_date,
  COALESCE(p.n_parcels, 0)                 AS n_parcels,
  COALESCE(p.n_urban, 0)                   AS n_parcels_urban,
  COALESCE(p.n_rural, 0)                   AS n_parcels_rural,
  p.area_sum_m2,
  p.built_area_sum_m2,
  COALESCE(s.n_schools, 0)                 AS n_schools,
  COALESCE(h.n_health, 0)                  AS n_health_facilities
FROM core.municipality m
JOIN core.department d ON d.code = m.dept_code
LEFT JOIN core.cadastral_manager cm ON cm.muni_code = m.code
LEFT JOIN (
  SELECT
    pa.muni_code,
    count(*)                                           AS n_parcels,
    count(*) FILTER (WHERE pa.zone = '01')             AS n_urban,
    count(*) FILTER (WHERE pa.zone = '02')             AS n_rural,
    sum(pa.area_geom_m2)                               AS area_sum_m2,
    sum(pa.built_area_m2)                              AS built_area_sum_m2
  FROM core.parcel pa
  JOIN meta.snapshot sn ON sn.id = pa.snapshot_id AND sn.is_active
  GROUP BY pa.muni_code
) p ON p.muni_code = m.code
LEFT JOIN (
  SELECT sc.muni_code, count(*) AS n_schools
  FROM ctx.school sc
  JOIN meta.snapshot sn ON sn.id = sc.snapshot_id AND sn.is_active
  GROUP BY sc.muni_code
) s ON s.muni_code = m.code
LEFT JOIN (
  SELECT hf.muni_code, count(*) AS n_health
  FROM ctx.health_facility hf
  JOIN meta.snapshot sn ON sn.id = hf.snapshot_id AND sn.is_active
  GROUP BY hf.muni_code
) h ON h.muni_code = m.code;

CREATE UNIQUE INDEX IF NOT EXISTS muni_summary_code_idx ON analytics.muni_summary (muni_code);
CREATE INDEX IF NOT EXISTS muni_summary_dept_idx ON analytics.muni_summary (dept_code);

COMMENT ON MATERIALIZED VIEW analytics.muni_summary IS
  'Resumen por municipio sobre el snapshot activo. Se refresca al final del ETL (paso aggregate).';
