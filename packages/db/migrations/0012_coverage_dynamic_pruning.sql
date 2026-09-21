-- 0012 · Poda estática de particiones en el conteo de cobertura
--
-- La 0011 añadió el filtro por `dept_code`, pero seguía costando ~2 s de PLANIFICACIÓN:
-- `substring(m.code FROM 1 FOR 2)` no es una constante en tiempo de planificación, así que
-- PostgreSQL planificaba las 34 particiones de `core.parcel` y podaba en ejecución.
-- La ejecución era de 4 ms; el costo estaba entero en planificar.
--
-- Solución: SQL dinámico con el código de departamento ya resuelto como literal. Así el
-- planificador ve una constante, poda estáticamente y solo planifica una partición.
-- El literal no viene del usuario: sale de `p_muni_code`, que se valida antes con una
-- expresión regular, así que no hay superficie de inyección.

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
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_muni CHAR(5);
  v_dept CHAR(2);
  v_count BIGINT := 0;
BEGIN
  -- Validación estricta antes de construir SQL dinámico: solo cinco dígitos.
  IF p_muni_code IS NULL OR p_muni_code !~ '^[0-9]{5}$' THEN
    RETURN;
  END IF;
  v_muni := p_muni_code;
  v_dept := substring(v_muni FROM 1 FOR 2);

  EXECUTE format(
    'SELECT count(*) FROM core.parcel p
       JOIN meta.snapshot s ON s.id = p.snapshot_id AND s.is_active
      WHERE p.dept_code = %L AND p.muni_code = %L',
    v_dept, v_muni
  ) INTO v_count;

  RETURN QUERY
  SELECT
    m.code,
    COALESCE(cm.manager_name, 'No determinado'),
    cm.is_igac,
    COALESCE(cm.coverage_status, 'unknown'),
    cm.last_cut_date,
    COALESCE(cm.available_layers, '{}'::text[]),
    cm.manager_url,
    v_count
  FROM core.municipality m
  LEFT JOIN core.cadastral_manager cm ON cm.muni_code = m.code
  WHERE m.code = v_muni;
END $$;

COMMENT ON FUNCTION core.coverage_for(CHAR) IS
  'Cobertura catastral de un municipio. Usa SQL dinamico con dept_code literal para que el planificador pode particiones estaticamente.';
