-- 0009 · Funciones de tesela para Martin
--
-- Contrato acordado con infra/martin.yaml:
--   analytics.tile_<capa>(z integer, x integer, y integer, query json) RETURNS bytea
--   STABLE PARALLEL SAFE SECURITY DEFINER
--
-- Por qué funciones y no tablas: la publicación del ETL es atómica por `snapshot_id`.
-- Mientras se carga un corte nuevo, sus filas ya están en la tabla pero NO deben verse.
-- Una fuente de tipo `table` en Martin no puede aplicar ese filtro y filtraría datos a
-- medio cargar. Estas funciones resuelven el snapshot activo dentro del SQL.
--
-- Regla 3 de CLAUDE.md aplicada a teselas: cada función publica una lista CERRADA de
-- columnas. Nunca se publica `attrs` (JSONB crudo de los Registros 1 y 2, que puede traer
-- campos no inspeccionados) ni nada de la lista negra de PII. Las teselas son el canal más
-- fácil de raspar a gran escala, así que aquí la regla se aplica con más rigor, no menos.

-- Resuelve el snapshot a usar: el activo del dataset, o el que pida `query->>'snapshot'`
-- siempre que esté publicado (para la comparación entre cortes de M8).
CREATE OR REPLACE FUNCTION analytics.tile_snapshot_id(p_dataset_like TEXT, p_query json)
RETURNS BIGINT
LANGUAGE plpgsql STABLE PARALLEL SAFE AS $$
DECLARE
  v_requested BIGINT;
  v_id BIGINT;
BEGIN
  BEGIN
    v_requested := NULLIF(p_query->>'snapshot', '')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_requested := NULL;
  END;

  IF v_requested IS NOT NULL THEN
    SELECT s.id INTO v_id
    FROM meta.snapshot s
    WHERE s.id = v_requested
      AND s.dataset_id LIKE p_dataset_like
      AND s.status IN ('published', 'superseded')
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  SELECT s.id INTO v_id
  FROM meta.snapshot s
  WHERE s.dataset_id LIKE p_dataset_like AND s.is_active
  ORDER BY s.cut_date DESC
  LIMIT 1;
  RETURN v_id;
END $$;

COMMENT ON FUNCTION analytics.tile_snapshot_id(TEXT, json) IS
  'Resuelve el snapshot de una tesela: el activo, o el solicitado si esta publicado. Evita servir cargas a medias.';

-- Resolución H3 adecuada al zoom. Misma tabla que packages/db/src/repositories/tiles.ts.
CREATE OR REPLACE FUNCTION analytics.tile_h3_res(z INTEGER)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN z <= 7 THEN 6
    WHEN z <= 9 THEN 7
    WHEN z <= 12 THEN 8
    ELSE 9
  END;
$$;

-- ─── core.parcel ──────────────────────────────────────────────────────────────
-- Columnas publicadas: npn, muni_code, zone, area_geom_m2, built_area_m2, economic_use.
-- NO se publica: address (nomenclatura completa), attrs, cadastral_value.
CREATE OR REPLACE FUNCTION analytics.tile_parcel(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_snapshot BIGINT;
  v_mvt bytea;
BEGIN
  IF z < 14 THEN RETURN NULL; END IF;
  v_snapshot := analytics.tile_snapshot_id('%cadastre%', query);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;

  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(p.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      p.npn, p.muni_code, p.zone, p.area_geom_m2, p.built_area_m2, p.economic_use
    FROM core.parcel p
    CROSS JOIN bounds
    WHERE p.snapshot_id = v_snapshot AND p.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'parcel', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── core.building ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_building(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_snapshot BIGINT;
  v_mvt bytea;
BEGIN
  IF z < 14 THEN RETURN NULL; END IF;
  v_snapshot := analytics.tile_snapshot_id('%cadastre%', query);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;

  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(b.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      b.parcel_npn, b.floors, b.built_area_m2, b.use
    FROM core.building b
    CROSS JOIN bounds
    WHERE b.snapshot_id = v_snapshot AND b.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'building', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── core.block ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_block(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_snapshot BIGINT;
  v_mvt bytea;
BEGIN
  IF z < 12 THEN RETURN NULL; END IF;
  v_snapshot := analytics.tile_snapshot_id('%cadastre%', query);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;

  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(bl.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      bl.muni_code, bl.code
    FROM core.block bl
    CROSS JOIN bounds
    WHERE bl.snapshot_id = v_snapshot AND bl.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'block', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── core.sector ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_sector(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_snapshot BIGINT;
  v_mvt bytea;
BEGIN
  IF z < 10 THEN RETURN NULL; END IF;
  v_snapshot := analytics.tile_snapshot_id('%cadastre%', query);
  IF v_snapshot IS NULL THEN RETURN NULL; END IF;

  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(s.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      s.muni_code, s.code, s.name, s.zone
    FROM core.sector s
    CROSS JOIN bounds
    WHERE s.snapshot_id = v_snapshot AND s.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'sector', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── core.municipality ────────────────────────────────────────────────────────
-- No lleva filtro de snapshot: la división administrativa no tiene cortes activos
-- que puedan estar a medio cargar (se reemplaza en una sola transacción).
CREATE OR REPLACE FUNCTION analytics.tile_municipality(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(m.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      m.code, m.name, m.dept_code, m.population
    FROM core.municipality m
    CROSS JOIN bounds
    WHERE m.geom IS NOT NULL AND m.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'municipality', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── core.department ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_department(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(d.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      d.code, d.name, d.region
    FROM core.department d
    CROSS JOIN bounds
    WHERE d.geom IS NOT NULL AND d.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'department', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── analytics.h3_cell ────────────────────────────────────────────────────────
-- La resolución se elige por zoom, salvo que `query->>'res'` pida una concreta.
CREATE OR REPLACE FUNCTION analytics.tile_h3_cell(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_res INTEGER;
  v_mvt bytea;
BEGIN
  BEGIN
    v_res := NULLIF(query->>'res', '')::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    v_res := NULL;
  END;
  IF v_res IS NULL OR v_res < 0 OR v_res > 15 THEN
    v_res := analytics.tile_h3_res(z);
  END IF;

  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(c.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      c.h3::text AS h3,
      c.res, c.muni_code, c.n_parcels, c.pop, c.pop_school_age,
      c.n_schools, c.n_health, c.road_access_score, c.slope_mean_pct,
      c.protected_pct, c.urban_pct, c.n_large_lots
    FROM analytics.h3_cell c
    CROSS JOIN bounds
    WHERE c.res = v_res AND c.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'h3_cell', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.school ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_school(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_snapshot BIGINT;
  v_mvt bytea;
BEGIN
  IF z < 9 THEN RETURN NULL; END IF;
  v_snapshot := analytics.tile_snapshot_id('%', query);
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(s.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      s.name, s.sector, s.muni_code, s.enrollment, s.location_kind
    FROM ctx.school s
    JOIN meta.snapshot sn ON sn.id = s.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE s.geom IS NOT NULL AND s.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'school', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.health_facility ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_health_facility(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  IF z < 9 THEN RETURN NULL; END IF;
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(h.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      h.name, h.level, h.nature, h.muni_code
    FROM ctx.health_facility h
    JOIN meta.snapshot sn ON sn.id = h.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE h.geom IS NOT NULL AND h.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'health_facility', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.protected_area ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_protected_area(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(a.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      a.name, a.category, a.is_restrictive, a.authority
    FROM ctx.protected_area a
    JOIN meta.snapshot sn ON sn.id = a.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE a.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'protected_area', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.hazard ───────────────────────────────────────────────────────────────
-- Acepta `query->>'kind'` para pintar una sola clase de amenaza.
CREATE OR REPLACE FUNCTION analytics.tile_hazard(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_kind TEXT;
  v_mvt bytea;
BEGIN
  v_kind := NULLIF(query->>'kind', '');
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(hz.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      hz.kind, hz.level, hz.level_rank, hz.source, hz.scale
    FROM ctx.hazard hz
    JOIN meta.snapshot sn ON sn.id = hz.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE hz.geom && bounds.b4326
      AND (v_kind IS NULL OR hz.kind = v_kind)
  )
  SELECT ST_AsMVT(mvtgeom.*, 'hazard', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.soil_unit ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_soil_unit(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  IF z < 8 THEN RETURN NULL; END IF;
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(su.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      su.symbol, su.slope_range, su.climate
    FROM ctx.soil_unit su
    JOIN meta.snapshot sn ON sn.id = su.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE su.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'soil_unit', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── ctx.pot_zone ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.tile_pot_zone(z INTEGER, x INTEGER, y INTEGER, query json)
RETURNS bytea
LANGUAGE plpgsql STABLE PARALLEL SAFE SECURITY DEFINER AS $$
DECLARE
  v_mvt bytea;
BEGIN
  IF z < 11 THEN RETURN NULL; END IF;
  WITH bounds AS (
    SELECT ST_TileEnvelope(z, x, y) AS b3857,
           ST_Transform(ST_TileEnvelope(z, x, y), 4326) AS b4326
  ),
  mvtgeom AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(pz.geom, 3857), bounds.b3857, 4096, 64, true) AS geom,
      pz.muni_code, pz.classification, pz.use, pz.source_doc, pz.max_height_floors
    FROM ctx.pot_zone pz
    JOIN meta.snapshot sn ON sn.id = pz.snapshot_id AND sn.is_active
    CROSS JOIN bounds
    WHERE pz.geom && bounds.b4326
  )
  SELECT ST_AsMVT(mvtgeom.*, 'pot_zone', 4096, 'geom') INTO v_mvt
  FROM mvtgeom WHERE geom IS NOT NULL;

  RETURN v_mvt;
END $$;

-- ─── Rol de Martin ────────────────────────────────────────────────────────────
-- Martin solo puede EJECUTAR estas funciones; no puede leer ninguna tabla base.
-- Así ninguna columna fuera de las listas de arriba puede salir por accidente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'terracolombia_tiles') THEN
    CREATE ROLE terracolombia_tiles NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA analytics TO terracolombia_tiles;
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'tile_parcel', 'tile_building', 'tile_block', 'tile_sector', 'tile_municipality',
    'tile_department', 'tile_h3_cell', 'tile_school', 'tile_health_facility',
    'tile_protected_area', 'tile_hazard', 'tile_soil_unit', 'tile_pot_zone'
  ] LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION analytics.%I(integer, integer, integer, json) TO terracolombia_tiles',
      fn
    );
  END LOOP;
END $$;

-- ─── Vista de compatibilidad para los scripts de operación ────────────────────
-- `infra/scripts/check-health.ps1` y el exportador de Prometheus consultan
-- `meta.migration`. El historial real lo mantiene el corredor de migraciones en
-- `public.schema_migration`; esta vista lo expone donde la operación lo espera.
CREATE OR REPLACE VIEW meta.migration AS
SELECT version, name, checksum, applied_at, duration_ms
FROM public.schema_migration;

COMMENT ON VIEW meta.migration IS
  'Vista del historial de migraciones (public.schema_migration) en el esquema que espera la operacion.';
