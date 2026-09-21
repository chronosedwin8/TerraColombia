-- 0008 · Búsqueda universal
--
-- El buscador acepta: dirección, municipio, código predial (30 o 20 dígitos), coordenadas,
-- topónimo, barrio y vereda. La resolución por tipo se hace en la API (`/search`); esta
-- migración provee el índice unificado de texto que evita consultar seis tablas por tecla.

CREATE TABLE IF NOT EXISTS analytics.search_index (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* municipality | department | neighborhood | vereda | toponym | populated_place |
     address | sector | protected_area | school | health_facility */
  kind        TEXT NOT NULL,
  /* Identificador dentro de su tipo: code, npn, id… */
  ref         TEXT NOT NULL,
  label       TEXT NOT NULL,                  -- texto que se muestra al usuario
  label_fold  TEXT NOT NULL,                  -- texto normalizado para buscar
  /* Contexto para desambiguar: "Soledad, Atlántico" */
  context     TEXT,
  muni_code   CHAR(5),
  dept_code   CHAR(2),
  /* Prioridad de desempate: menor = más relevante (municipio antes que topónimo) */
  rank        INT NOT NULL DEFAULT 100,
  centroid    geometry(Point, 4326),
  snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  UNIQUE (kind, ref)
);

CREATE INDEX IF NOT EXISTS search_index_trgm_idx
  ON analytics.search_index USING GIN (label_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS search_index_kind_idx ON analytics.search_index (kind, rank);
CREATE INDEX IF NOT EXISTS search_index_muni_idx ON analytics.search_index (muni_code);
CREATE INDEX IF NOT EXISTS search_index_geom_idx ON analytics.search_index USING GIST (centroid);

COMMENT ON TABLE analytics.search_index IS
  'Indice unificado de texto para el buscador universal. Se reconstruye en el paso `index` del ETL.';

-- Reconstrucción del índice desde las tablas de origen. Idempotente por tipo.
CREATE OR REPLACE FUNCTION analytics.rebuild_search_index()
RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  v_count BIGINT := 0;
BEGIN
  TRUNCATE analytics.search_index;

  -- Departamentos (rank 10): lo más general va primero al escribir poco.
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, dept_code, rank, centroid, snapshot_id)
  SELECT 'department', d.code, d.name, d.name_fold, 'Departamento', d.code, 10, d.centroid, d.snapshot_id
  FROM core.department d;

  -- Municipios (rank 20)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, dept_code, rank, centroid, snapshot_id)
  SELECT 'municipality', m.code, m.name, m.name_fold, d.name, m.code, m.dept_code, 20, m.centroid, m.snapshot_id
  FROM core.municipality m
  JOIN core.department d ON d.code = m.dept_code;

  -- Barrios (rank 40)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, dept_code, rank, centroid, snapshot_id)
  SELECT
    'neighborhood',
    n.muni_code || ':' || n.code,
    n.name,
    n.name_fold,
    m.name || ', ' || d.name,
    n.muni_code,
    m.dept_code,
    40,
    ST_PointOnSurface(n.geom),
    n.snapshot_id
  FROM core.neighborhood n
  JOIN meta.snapshot s ON s.id = n.snapshot_id AND s.is_active
  JOIN core.municipality m ON m.code = n.muni_code
  JOIN core.department d ON d.code = m.dept_code
  WHERE n.name IS NOT NULL AND n.geom IS NOT NULL
  ON CONFLICT (kind, ref) DO NOTHING;

  -- Veredas (rank 45)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, dept_code, rank, centroid, snapshot_id)
  SELECT
    'vereda',
    v.muni_code || ':' || v.code,
    v.name,
    v.name_fold,
    'Vereda · ' || m.name || ', ' || d.name,
    v.muni_code,
    m.dept_code,
    45,
    ST_PointOnSurface(v.geom),
    v.snapshot_id
  FROM core.vereda v
  JOIN meta.snapshot s ON s.id = v.snapshot_id AND s.is_active
  JOIN core.municipality m ON m.code = v.muni_code
  JOIN core.department d ON d.code = m.dept_code
  WHERE v.name IS NOT NULL AND v.geom IS NOT NULL
  ON CONFLICT (kind, ref) DO NOTHING;

  -- Centros poblados (rank 50)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, dept_code, rank, centroid, snapshot_id)
  SELECT
    'populated_place',
    pp.id::text,
    pp.name,
    pp.name_fold,
    initcap(replace(pp.kind, '_', ' ')) || ' · ' || m.name,
    pp.muni_code,
    m.dept_code,
    50,
    pp.geom,
    pp.snapshot_id
  FROM core.populated_place pp
  JOIN meta.snapshot s ON s.id = pp.snapshot_id AND s.is_active
  JOIN core.municipality m ON m.code = pp.muni_code
  ON CONFLICT (kind, ref) DO NOTHING;

  -- Topónimos (rank 60)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, rank, centroid, snapshot_id)
  SELECT
    'toponym',
    t.id::text,
    t.name,
    t.name_fold,
    COALESCE(t.category, 'Nombre geográfico'),
    t.muni_code,
    60,
    t.geom,
    t.snapshot_id
  FROM core.toponym t
  JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
  ON CONFLICT (kind, ref) DO NOTHING;

  -- Áreas protegidas (rank 70)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, rank, centroid, snapshot_id)
  SELECT
    'protected_area',
    pa.id::text,
    pa.name,
    pa.name_fold,
    COALESCE(pa.category, 'Área protegida'),
    70,
    ST_PointOnSurface(pa.geom),
    pa.snapshot_id
  FROM ctx.protected_area pa
  JOIN meta.snapshot s ON s.id = pa.snapshot_id AND s.is_active
  ON CONFLICT (kind, ref) DO NOTHING;

  -- Colegios (rank 80)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, rank, centroid, snapshot_id)
  SELECT
    'school',
    sc.id::text,
    sc.name,
    sc.name_fold,
    'Establecimiento educativo · ' || COALESCE(m.name, 'municipio no determinado'),
    sc.muni_code,
    80,
    sc.geom,
    sc.snapshot_id
  FROM ctx.school sc
  JOIN meta.snapshot s ON s.id = sc.snapshot_id AND s.is_active
  LEFT JOIN core.municipality m ON m.code = sc.muni_code
  WHERE sc.geom IS NOT NULL
  ON CONFLICT (kind, ref) DO NOTHING;

  -- IPS (rank 85)
  INSERT INTO analytics.search_index (kind, ref, label, label_fold, context, muni_code, rank, centroid, snapshot_id)
  SELECT
    'health_facility',
    hf.id::text,
    hf.name,
    hf.name_fold,
    'Prestador de salud · ' || COALESCE(m.name, 'municipio no determinado'),
    hf.muni_code,
    85,
    hf.geom,
    hf.snapshot_id
  FROM ctx.health_facility hf
  JOIN meta.snapshot s ON s.id = hf.snapshot_id AND s.is_active
  LEFT JOIN core.municipality m ON m.code = hf.muni_code
  WHERE hf.geom IS NOT NULL
  ON CONFLICT (kind, ref) DO NOTHING;

  SELECT count(*) INTO v_count FROM analytics.search_index;
  RETURN v_count;
END $$;

COMMENT ON FUNCTION analytics.rebuild_search_index() IS
  'Reconstruye el indice de busqueda desde las tablas del snapshot activo. Devuelve el numero de filas.';

-- Búsqueda difusa con umbral y desempate por relevancia de tipo.
-- Las direcciones se buscan aparte (core.address_point / core.parcel.address_fold) porque
-- su volumen es de otro orden y no cabe en el índice unificado.
CREATE OR REPLACE FUNCTION analytics.search_text(
  p_query TEXT,
  p_limit INT DEFAULT 10,
  p_muni_code CHAR(5) DEFAULT NULL
)
RETURNS TABLE (
  kind TEXT, ref TEXT, label TEXT, context TEXT,
  muni_code CHAR(5), dept_code CHAR(2),
  similarity REAL, lng DOUBLE PRECISION, lat DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
  WITH q AS (SELECT public.tc_fold(p_query) AS needle)
  SELECT
    si.kind,
    si.ref,
    si.label,
    si.context,
    si.muni_code,
    si.dept_code,
    similarity(si.label_fold, q.needle) AS similarity,
    ST_X(si.centroid)::double precision,
    ST_Y(si.centroid)::double precision
  FROM analytics.search_index si, q
  WHERE (p_muni_code IS NULL OR si.muni_code = p_muni_code)
    AND (si.label_fold % q.needle OR si.label_fold LIKE q.needle || '%')
  ORDER BY
    (si.label_fold LIKE q.needle || '%') DESC,
    similarity(si.label_fold, q.needle) DESC,
    si.rank ASC,
    si.label ASC
  LIMIT LEAST(p_limit, 50);
$$;

-- Umbral de similitud por defecto: 0,25 admite errores de tecleo sin traer ruido.
-- Se fija por sesión en la API (`SET LOCAL pg_trgm.similarity_threshold`).
