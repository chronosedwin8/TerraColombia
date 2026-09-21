-- 0004 · Catastro normalizado
--
-- `core.parcel` está particionada por LIST (dept_code) porque el volumen nacional es del
-- orden de decenas de millones de filas y toda consulta de negocio arranca por municipio
-- o departamento (el DSL lo exige en `scope`). El particionado permite además cargar y
-- reemplazar un departamento sin tocar los demás.
--
-- Licencia: estas tablas contienen datos del IGAC bajo CC BY-SA 4.0. Se mantienen en `core`,
-- separadas de `analytics` (indicadores propios), por la cláusula ShareAlike (PLAN §2).

CREATE TABLE IF NOT EXISTS core.parcel (
  id                BIGINT GENERATED ALWAYS AS IDENTITY,
  /* Numero Predial Nacional de 30 digitos. Ver packages/geo/src/npn.ts */
  npn               CHAR(30) NOT NULL,
  /* Codigo anterior de 20 digitos, cuando la fuente lo trae */
  npn_old           VARCHAR(20),
  dept_code         CHAR(2) NOT NULL,          -- clave de particion
  muni_code         CHAR(5) NOT NULL,
  /* 01 urbano | 02 rural (tramo `zona` del NPN) */
  zone              CHAR(2) NOT NULL,
  -- Tramos derivados del NPN, materializados para filtrar sin recalcular
  sector            CHAR(2),
  commune           CHAR(2),
  neighborhood      CHAR(2),
  block_or_vereda   CHAR(4),
  terrain           CHAR(4),
  condition         CHAR(1),
  building_code     CHAR(2),
  floor_code        CHAR(2),
  unit_code         CHAR(4),
  /* true si el NPN identifica una unidad de propiedad horizontal y no el predio completo */
  is_ph             BOOLEAN NOT NULL DEFAULT FALSE,
  /* NPN del predio matriz (mismo terreno, sin la parte de PH) */
  matrix_npn        CHAR(30),

  /* Area calculada sobre la geometria en EPSG:9377 (metros) */
  area_geom_m2      NUMERIC(18, 2),
  /* Area que reporta el registro catastral (R1/R2). Puede diferir de la geometrica. */
  area_reported_m2  NUMERIC(18, 2),
  built_area_m2     NUMERIC(18, 2),

  economic_use      TEXT,                      -- destino economico, tal como lo trae la fuente
  economic_use_fold TEXT GENERATED ALWAYS AS (public.tc_fold(economic_use)) STORED,
  address           TEXT,
  /* Direccion normalizada por packages/geo/src/address.ts, para busqueda difusa */
  address_fold      TEXT,

  /* Avaluo CATASTRAL, no comercial. Toda presentacion debe llevar la advertencia. */
  cadastral_value   NUMERIC(20, 2),
  valuation_year    INT,

  /* Resto de campos abiertos de los Registros 1 y 2, tal cual, sin columnas de PII */
  attrs             JSONB NOT NULL DEFAULT '{}'::jsonb,

  geom              geometry(MultiPolygon, 4326),
  centroid          geometry(Point, 4326),
  h3_r9             h3index,
  h3_r8             h3index,

  snapshot_id       BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  valid_from        DATE NOT NULL,
  valid_to          DATE,

  PRIMARY KEY (dept_code, id),
  CONSTRAINT parcel_npn_digits_chk CHECK (npn ~ '^[0-9]{30}$'),
  CONSTRAINT parcel_zone_chk CHECK (zone IN ('01', '02')),
  CONSTRAINT parcel_muni_dept_chk CHECK (left(muni_code, 2) = dept_code),
  CONSTRAINT parcel_area_nonneg_chk CHECK (area_geom_m2 IS NULL OR area_geom_m2 >= 0)
) PARTITION BY LIST (dept_code);

COMMENT ON TABLE core.parcel IS
  'Predios catastrales normalizados. Fuente IGAC (CC BY-SA 4.0) u otro gestor. Particionada por departamento.';
COMMENT ON COLUMN core.parcel.cadastral_value IS
  'Avaluo CATASTRAL (valor fiscal). NO es valor comercial: toda presentacion debe incluir la advertencia.';
COMMENT ON COLUMN core.parcel.attrs IS
  'Campos abiertos de los Registros 1 y 2 tal como llegan, ya filtrados por la blocklist de PII.';

-- Particiones: un DO por cada codigo DIVIPOLA de departamento existente.
-- La particion DEFAULT recoge codigos que aparezcan y no esten previstos (se alerta en validacion).
DO $$
DECLARE
  d TEXT;
  codes TEXT[] := ARRAY[
    '05','08','11','13','15','17','18','19','20','23','25','27','41','44','47','50','52','54',
    '63','66','68','70','73','76','81','85','86','88','91','94','95','97','99'
  ];
BEGIN
  FOREACH d IN ARRAY codes LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS core.parcel_%s PARTITION OF core.parcel FOR VALUES IN (%L)',
      d, d
    );
  END LOOP;
  EXECUTE 'CREATE TABLE IF NOT EXISTS core.parcel_default PARTITION OF core.parcel DEFAULT';
END $$;

-- Indices: se crean sobre la tabla padre y PostgreSQL los propaga a cada particion.
CREATE UNIQUE INDEX IF NOT EXISTS parcel_npn_snapshot_uq
  ON core.parcel (dept_code, npn, snapshot_id);
CREATE INDEX IF NOT EXISTS parcel_npn_idx ON core.parcel (npn);
CREATE INDEX IF NOT EXISTS parcel_npn_old_idx ON core.parcel (npn_old) WHERE npn_old IS NOT NULL;
CREATE INDEX IF NOT EXISTS parcel_muni_idx ON core.parcel (muni_code, zone);
CREATE INDEX IF NOT EXISTS parcel_geom_idx ON core.parcel USING GIST (geom);
CREATE INDEX IF NOT EXISTS parcel_centroid_idx ON core.parcel USING GIST (centroid);
CREATE INDEX IF NOT EXISTS parcel_h3_r9_idx ON core.parcel (h3_r9);
CREATE INDEX IF NOT EXISTS parcel_h3_r8_idx ON core.parcel (h3_r8);
CREATE INDEX IF NOT EXISTS parcel_snapshot_idx ON core.parcel (snapshot_id);
CREATE INDEX IF NOT EXISTS parcel_area_idx ON core.parcel (muni_code, area_geom_m2);
CREATE INDEX IF NOT EXISTS parcel_use_idx ON core.parcel (muni_code, economic_use_fold);
CREATE INDEX IF NOT EXISTS parcel_address_trgm_idx ON core.parcel USING GIN (address_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS parcel_matrix_idx ON core.parcel (matrix_npn) WHERE is_ph;
CREATE INDEX IF NOT EXISTS parcel_attrs_idx ON core.parcel USING GIN (attrs jsonb_path_ops);

-- ─── Construcciones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.building (
  id            BIGINT GENERATED ALWAYS AS IDENTITY,
  dept_code     CHAR(2) NOT NULL,
  parcel_npn    CHAR(30) NOT NULL,
  muni_code     CHAR(5) NOT NULL,
  /* Identificador de la construccion dentro del predio, si la fuente lo trae */
  building_ref  TEXT,
  floors        INT,
  built_area_m2 NUMERIC(18, 2),
  /* Uso de la construccion segun la fuente */
  use           TEXT,
  /* Anio de construccion, si viene */
  built_year    INT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiPolygon, 4326),
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  PRIMARY KEY (dept_code, id),
  CONSTRAINT building_floors_chk CHECK (floors IS NULL OR floors BETWEEN 0 AND 200)
) PARTITION BY LIST (dept_code);

DO $$
DECLARE
  d TEXT;
  codes TEXT[] := ARRAY[
    '05','08','11','13','15','17','18','19','20','23','25','27','41','44','47','50','52','54',
    '63','66','68','70','73','76','81','85','86','88','91','94','95','97','99'
  ];
BEGIN
  FOREACH d IN ARRAY codes LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS core.building_%s PARTITION OF core.building FOR VALUES IN (%L)',
      d, d
    );
  END LOOP;
  EXECUTE 'CREATE TABLE IF NOT EXISTS core.building_default PARTITION OF core.building DEFAULT';
END $$;

CREATE INDEX IF NOT EXISTS building_parcel_idx ON core.building (parcel_npn, snapshot_id);
CREATE INDEX IF NOT EXISTS building_geom_idx ON core.building USING GIST (geom);
CREATE INDEX IF NOT EXISTS building_muni_idx ON core.building (muni_code);
CREATE INDEX IF NOT EXISTS building_snapshot_idx ON core.building (snapshot_id);

-- ─── Unidades territoriales del catastro ──────────────────────────────────────
-- Manzana, sector, barrio, vereda y perímetro urbano comparten forma: una tabla por capa
-- para que los nombres sigan siendo legibles y las teselas simples.

CREATE TABLE IF NOT EXISTS core.sector (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  zone        CHAR(2) NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (muni_code, zone, code, snapshot_id)
);
CREATE INDEX IF NOT EXISTS sector_geom_idx ON core.sector USING GIST (geom);
CREATE INDEX IF NOT EXISTS sector_muni_idx ON core.sector (muni_code, snapshot_id);

CREATE TABLE IF NOT EXISTS core.neighborhood (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (muni_code, code, snapshot_id)
);
CREATE INDEX IF NOT EXISTS neighborhood_geom_idx ON core.neighborhood USING GIST (geom);
CREATE INDEX IF NOT EXISTS neighborhood_name_trgm_idx ON core.neighborhood USING GIN (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS neighborhood_muni_idx ON core.neighborhood (muni_code, snapshot_id);

CREATE TABLE IF NOT EXISTS core.block (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  code        TEXT NOT NULL,
  /* Codigo compuesto sector-comuna-barrio-manzana, tal como lo forma la fuente */
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (muni_code, code, snapshot_id)
);
CREATE INDEX IF NOT EXISTS block_geom_idx ON core.block USING GIST (geom);
CREATE INDEX IF NOT EXISTS block_muni_idx ON core.block (muni_code, snapshot_id);

CREATE TABLE IF NOT EXISTS core.vereda (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT,
  name_fold   TEXT GENERATED ALWAYS AS (public.tc_fold(name)) STORED,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (muni_code, code, snapshot_id)
);
CREATE INDEX IF NOT EXISTS vereda_geom_idx ON core.vereda USING GIST (geom);
CREATE INDEX IF NOT EXISTS vereda_name_trgm_idx ON core.vereda USING GIN (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS vereda_muni_idx ON core.vereda (muni_code, snapshot_id);

CREATE TABLE IF NOT EXISTS core.urban_perimeter (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  name        TEXT,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326) NOT NULL,
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS urban_perimeter_geom_idx ON core.urban_perimeter USING GIST (geom);
CREATE INDEX IF NOT EXISTS urban_perimeter_muni_idx ON core.urban_perimeter (muni_code, snapshot_id);

-- ─── Nomenclatura vial y domiciliaria ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.street_name (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  name        TEXT NOT NULL,
  /* Nombre normalizado por packages/geo/src/address.ts */
  name_fold   TEXT NOT NULL,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiLineString, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS street_name_geom_idx ON core.street_name USING GIST (geom);
CREATE INDEX IF NOT EXISTS street_name_trgm_idx ON core.street_name USING GIN (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS street_name_muni_idx ON core.street_name (muni_code, snapshot_id);

-- Direcciones de predios. NO es un directorio de personas: solo la etiqueta de nomenclatura
-- publicada por el catastro y el NPN al que corresponde.
CREATE TABLE IF NOT EXISTS core.address_point (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  label       TEXT NOT NULL,
  label_fold  TEXT NOT NULL,
  parcel_npn  CHAR(30),
  geom        geometry(Point, 4326) NOT NULL,
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS address_point_geom_idx ON core.address_point USING GIST (geom);
CREATE INDEX IF NOT EXISTS address_point_trgm_idx ON core.address_point USING GIN (label_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS address_point_npn_idx ON core.address_point (parcel_npn);
CREATE INDEX IF NOT EXISTS address_point_muni_idx ON core.address_point (muni_code, snapshot_id);

COMMENT ON TABLE core.address_point IS
  'Nomenclatura domiciliaria publicada por el catastro. No contiene datos de ocupantes ni propietarios.';

-- ─── Zonas homogéneas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.homogeneous_zone (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  muni_code   CHAR(5) NOT NULL,
  /* fisica | geoeconomica */
  kind        TEXT NOT NULL,
  code        TEXT NOT NULL,
  /* Valor de referencia por m2 en zonas geoeconomicas (valor CATASTRAL) */
  unit_value  NUMERIC(20, 2),
  value_year  INT,
  attrs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom        geometry(MultiPolygon, 4326),
  snapshot_id BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  CONSTRAINT homogeneous_zone_kind_chk CHECK (kind IN ('fisica', 'geoeconomica'))
);
CREATE INDEX IF NOT EXISTS homogeneous_zone_geom_idx ON core.homogeneous_zone USING GIST (geom);
CREATE INDEX IF NOT EXISTS homogeneous_zone_muni_idx ON core.homogeneous_zone (muni_code, kind, snapshot_id);

COMMENT ON COLUMN core.homogeneous_zone.unit_value IS
  'Valor unitario CATASTRAL de referencia. No es precio de mercado.';

-- ─── Cambio territorial (M8) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.parcel_change (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  npn            CHAR(30) NOT NULL,
  dept_code      CHAR(2) NOT NULL,
  muni_code      CHAR(5) NOT NULL,
  from_snapshot  BIGINT REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  to_snapshot    BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  /* created | removed | attrs_changed | geometry_changed | building_added | building_removed */
  change_type    TEXT NOT NULL,
  /* Detalle legible: que campos cambiaron, de que valor a que valor */
  detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
  /* Indice de solape (interseccion / union) entre las dos geometrias; < 0.98 => cambio geometrico */
  geom_iou       NUMERIC(6, 5),
  geom_diff      geometry(MultiPolygon, 4326),
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT parcel_change_type_chk CHECK (
    change_type IN ('created','removed','attrs_changed','geometry_changed','building_added','building_removed')
  )
);
CREATE INDEX IF NOT EXISTS parcel_change_npn_idx ON core.parcel_change (npn);
CREATE INDEX IF NOT EXISTS parcel_change_snapshots_idx ON core.parcel_change (to_snapshot, from_snapshot, change_type);
CREATE INDEX IF NOT EXISTS parcel_change_muni_idx ON core.parcel_change (muni_code, change_type);
CREATE INDEX IF NOT EXISTS parcel_change_geom_idx ON core.parcel_change USING GIST (geom_diff);
