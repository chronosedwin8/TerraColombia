-- 0007 · Funciones de dominio
-- Todo cálculo de área/distancia pasa por aquí para que se use siempre EPSG:9377.

-- ─── NPN ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION core.npn_parts(npn CHAR(30))
RETURNS TABLE (
  department CHAR(2), municipality CHAR(3), zone CHAR(2), sector CHAR(2),
  commune CHAR(2), neighborhood CHAR(2), block_or_vereda CHAR(4), terrain CHAR(4),
  condition CHAR(1), building_code CHAR(2), floor_code CHAR(2), unit_code CHAR(4)
)
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT
    substring(npn FROM  1 FOR 2)::CHAR(2),
    substring(npn FROM  3 FOR 3)::CHAR(3),
    substring(npn FROM  6 FOR 2)::CHAR(2),
    substring(npn FROM  8 FOR 2)::CHAR(2),
    substring(npn FROM 10 FOR 2)::CHAR(2),
    substring(npn FROM 12 FOR 2)::CHAR(2),
    substring(npn FROM 14 FOR 4)::CHAR(4),
    substring(npn FROM 18 FOR 4)::CHAR(4),
    substring(npn FROM 22 FOR 1)::CHAR(1),
    substring(npn FROM 23 FOR 2)::CHAR(2),
    substring(npn FROM 25 FOR 2)::CHAR(2),
    substring(npn FROM 27 FOR 4)::CHAR(4);
$$;

COMMENT ON FUNCTION core.npn_parts(CHAR) IS
  'Descompone el NPN de 30 digitos. Misma particion de tramos que packages/geo/src/npn.ts.';

CREATE OR REPLACE FUNCTION core.npn_muni_code(npn CHAR(30))
RETURNS CHAR(5)
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT substring(npn FROM 1 FOR 5)::CHAR(5);
$$;

CREATE OR REPLACE FUNCTION core.npn_dept_code(npn CHAR(30))
RETURNS CHAR(2)
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT substring(npn FROM 1 FOR 2)::CHAR(2);
$$;

CREATE OR REPLACE FUNCTION core.npn_is_ph(npn CHAR(30))
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT substring(npn FROM 22 FOR 9) <> '000000000';
$$;

CREATE OR REPLACE FUNCTION core.npn_matrix(npn CHAR(30))
RETURNS CHAR(30)
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT (substring(npn FROM 1 FOR 21) || '000000000')::CHAR(30);
$$;

CREATE OR REPLACE FUNCTION core.npn_is_valid(npn TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT npn IS NOT NULL
     AND npn ~ '^[0-9]{30}$'
     AND substring(npn FROM 1 FOR 2) <> '00'
     AND substring(npn FROM 3 FOR 3) <> '000'
     AND substring(npn FROM 6 FOR 2) IN ('01', '02');
$$;

-- Normaliza la entrada del usuario: quita separadores y convierte 20 -> 30 digitos.
CREATE OR REPLACE FUNCTION core.npn_normalize(input TEXT)
RETURNS CHAR(30)
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  s TEXT;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  s := regexp_replace(input, '[^0-9]', '', 'g');
  IF length(s) = 20 THEN
    RETURN (s || '000000000')::CHAR(30);
  ELSIF length(s) = 30 THEN
    RETURN s::CHAR(30);
  ELSE
    RETURN NULL;
  END IF;
END $$;

-- ─── Medidas en EPSG:9377 ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION core.area_m2(g geometry)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT round(ST_Area(ST_Transform(g, 9377))::numeric, 2);
$$;

COMMENT ON FUNCTION core.area_m2(geometry) IS
  'Area en m2 calculada en EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional), el CRS de medida del proyecto.';

CREATE OR REPLACE FUNCTION core.distance_m(a geometry, b geometry)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT round(ST_Distance(ST_Transform(a, 9377), ST_Transform(b, 9377))::numeric, 2);
$$;

-- Porcentaje del area de `subject` cubierta por `other`. Base de todos los solapamientos
-- (area protegida, amenaza, POT, territorio etnico) que muestra la ficha.
CREATE OR REPLACE FUNCTION core.overlap_pct(subject geometry, other geometry)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  a_subject NUMERIC;
  a_inter   NUMERIC;
BEGIN
  IF subject IS NULL OR other IS NULL THEN RETURN NULL; END IF;
  a_subject := ST_Area(ST_Transform(subject, 9377));
  IF a_subject IS NULL OR a_subject <= 0 THEN RETURN NULL; END IF;
  a_inter := ST_Area(ST_Transform(ST_Intersection(subject, other), 9377));
  RETURN round(LEAST(100, GREATEST(0, (a_inter / a_subject) * 100))::numeric, 3);
END $$;

-- Indice de solape (intersection over union). El ETL marca cambio geometrico si < 0,98.
CREATE OR REPLACE FUNCTION core.geom_iou(a geometry, b geometry)
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  ga geometry; gb geometry;
  ai NUMERIC; au NUMERIC;
BEGIN
  IF a IS NULL OR b IS NULL THEN RETURN NULL; END IF;
  ga := ST_Transform(a, 9377);
  gb := ST_Transform(b, 9377);
  ai := ST_Area(ST_Intersection(ga, gb));
  au := ST_Area(ST_Union(ga, gb));
  IF au IS NULL OR au <= 0 THEN RETURN NULL; END IF;
  RETURN round((ai / au)::numeric, 5);
END $$;

-- ─── Saneamiento de geometrías en la ingesta ──────────────────────────────────

CREATE OR REPLACE FUNCTION core.clean_polygon(g geometry, target_srid INT DEFAULT 4326)
RETURNS geometry
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  out_geom geometry;
BEGIN
  IF g IS NULL OR ST_IsEmpty(g) THEN RETURN NULL; END IF;
  out_geom := ST_MakeValid(g);
  -- Descarta restos que no sean superficies tras el saneamiento
  out_geom := ST_CollectionExtract(out_geom, 3);
  IF out_geom IS NULL OR ST_IsEmpty(out_geom) THEN RETURN NULL; END IF;
  out_geom := ST_Multi(out_geom);
  IF ST_SRID(out_geom) <> target_srid AND ST_SRID(out_geom) > 0 THEN
    out_geom := ST_Transform(out_geom, target_srid);
  ELSIF ST_SRID(out_geom) = 0 THEN
    out_geom := ST_SetSRID(out_geom, target_srid);
  END IF;
  RETURN out_geom;
END $$;

COMMENT ON FUNCTION core.clean_polygon(geometry, INT) IS
  'Sanea y reproyecta un poligono de ingesta: ST_MakeValid, extrae superficies, promueve a MULTI.';

-- ─── Cobertura honesta (regla 6 de CLAUDE.md) ─────────────────────────────────

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
      WHERE p.muni_code = m.code
    ), 0)
  FROM core.municipality m
  LEFT JOIN core.cadastral_manager cm ON cm.muni_code = m.code
  WHERE m.code = p_muni_code;
$$;

-- ─── Snapshot activo por dataset ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION meta.active_snapshot(p_dataset_id TEXT)
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT id FROM meta.snapshot
  WHERE dataset_id = p_dataset_id AND is_active
  LIMIT 1;
$$;

-- Publicación atómica: desactiva el anterior y activa el nuevo en una sola transacción.
-- Un snapshot sintético no puede activarse si existe uno real publicado (ADR-006).
CREATE OR REPLACE FUNCTION meta.publish_snapshot(p_snapshot_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_dataset TEXT;
  v_synthetic BOOLEAN;
  v_blocking_errors INT;
  v_real_exists BOOLEAN;
BEGIN
  SELECT dataset_id, is_synthetic INTO v_dataset, v_synthetic
  FROM meta.snapshot WHERE id = p_snapshot_id;

  IF v_dataset IS NULL THEN
    RAISE EXCEPTION 'El snapshot % no existe', p_snapshot_id;
  END IF;

  SELECT count(*) INTO v_blocking_errors
  FROM meta.validation
  WHERE snapshot_id = p_snapshot_id AND severity = 'error' AND NOT passed;

  IF v_blocking_errors > 0 THEN
    RAISE EXCEPTION 'El snapshot % tiene % validaciones con severidad error: no se publica',
      p_snapshot_id, v_blocking_errors;
  END IF;

  IF v_synthetic THEN
    SELECT EXISTS (
      SELECT 1 FROM meta.snapshot
      WHERE dataset_id = v_dataset AND NOT is_synthetic AND status = 'published'
    ) INTO v_real_exists;
    IF v_real_exists THEN
      RAISE EXCEPTION
        'No se publica un snapshot sintetico (%) porque ya existe un corte real del dataset %',
        p_snapshot_id, v_dataset;
    END IF;
  END IF;

  UPDATE meta.snapshot
  SET is_active = FALSE, status = 'superseded'
  WHERE dataset_id = v_dataset AND is_active AND id <> p_snapshot_id;

  UPDATE meta.snapshot
  SET is_active = TRUE, status = 'published'
  WHERE id = p_snapshot_id;
END $$;

COMMENT ON FUNCTION meta.publish_snapshot(BIGINT) IS
  'Publicacion atomica de un corte. Rechaza snapshots con validaciones de error y sinteticos que taparian datos reales.';
