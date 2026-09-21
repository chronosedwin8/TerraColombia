-- 0011 · Poda de particiones en el cálculo de cobertura
--
-- `core.coverage_for` contaba los predios filtrando solo por `muni_code`. Como `core.parcel`
-- está particionada por `dept_code`, PostgreSQL no podía podar y recorría las 34 particiones
-- en cada llamada. La ficha de predio y la ficha municipal la invocan siempre, así que el
-- costo se notaba (más de un segundo con la base casi vacía).
--
-- El código de departamento son los dos primeros dígitos del código de municipio, así que
-- se puede añadir al filtro sin pedir nada al llamador.

CREATE OR REPLACE FUNCTION core.coverage_for(p_muni_code CHAR(5))
RETURNS TABLE (
  muni_code CHAR(5),
  manager_name TEXT,
  is_igac BOOLEAN,
  coverage_status TEXT,
  last_cut_date DATE,
  available_layers TEXT[],
  manager_url TEXT,
  n_parcels BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    m.code,
    COALESCE(cm.manager_name, 'No determinado'),
    cm.is_igac,
    COALESCE(cm.coverage_status, 'unknown'),
    cm.last_cut_date,
    COALESCE(cm.available_layers, '{}'::text[]),
    cm.manager_url,
    COALESCE((
      SELECT count(*) FROM core.parcel p
      JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      /* El filtro por dept_code permite podar particiones: es la clave de partición. */
      WHERE p.dept_code = substring(m.code FROM 1 FOR 2)
        AND p.muni_code = m.code
    ), 0)
  FROM core.municipality m
  LEFT JOIN core.cadastral_manager cm ON cm.muni_code = m.code
  WHERE m.code = p_muni_code;
$$;

COMMENT ON FUNCTION core.coverage_for(CHAR) IS
  'Cobertura catastral de un municipio. Filtra por dept_code ademas de muni_code para podar particiones.';

-- La ficha municipal también consulta `analytics.muni_summary`, que se recalcula por ETL.
-- Un índice por departamento evita recorrerla entera al listar municipios de un departamento.
CREATE INDEX IF NOT EXISTS muni_summary_manager_idx
  ON analytics.muni_summary (is_igac, coverage_status);

-- Estadísticas al día: sin ANALYZE, el planificador supone cardinalidades irreales en tablas
-- recién cargadas y elige recorridos secuenciales donde hay índice.
ANALYZE core.municipality;
ANALYZE core.cadastral_manager;
ANALYZE core.parcel;
