-- 0016 · Piezas subdivididas de las capas de restricción, para el agregado por celda
--
-- El paso 6 del agregado cruzaba cada celda H3 con los polígonos ORIGINALES de áreas
-- protegidas, amenazas, resguardos y perímetros. Con las cuatro figuras de demostración
-- era instantáneo. Con los datos reales no termina: la capa de inundación del IDEAM
-- trae 49.944 polígonos con 77 millones de vértices (uno solo tiene 486.547), y
-- RUNAP polígonos de 130.000 vértices. Cada ST_Intersects / ST_Intersection contra
-- un polígono así recorre todos sus vértices, y un municipio mediano tiene 9.000
-- celdas: la sentencia superaba cualquier tiempo de espera y la matriz de agregados
-- se quedó con 10 celdas de demostración para todo el país.
--
-- La solución clásica: trocear los polígonos con ST_Subdivide en piezas de pocas
-- decenas de vértices, guardarlas con su índice espacial y cruzar las celdas contra
-- las piezas. El porcentaje de solape de una celda con un área es la suma de sus
-- solapes con las piezas de esa área (las piezas no se pisan entre sí), así que el
-- resultado es el mismo y el tiempo baja de horas a segundos.
--
-- Las piezas son un derivado: se regeneran con `analytics.refresh_overlay_pieces()`
-- cuando cambia el conjunto de cortes activos de una capa. No llevan procedencia
-- propia porque la heredan de `snapshot_id` de la fila de origen.

CREATE TABLE IF NOT EXISTS analytics.overlay_piece (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* protected_area | ethnic_territory | urban_perimeter | hazard | land_capability | land_vocation */
  layer        TEXT NOT NULL,
  /* id de la fila de origen en su tabla, para sumar el solape por figura */
  source_id    BIGINT NOT NULL,
  snapshot_id  BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  /* lo que el agregado necesita de la fila: categoría, tipo de amenaza, clase, vocación */
  key          TEXT,
  /* nivel de la amenaza */
  value        TEXT,
  /* level_rank de la amenaza, para quedarse con el peor nivel por celda */
  rank         INTEGER,
  geom         geometry(Geometry, 4326) NOT NULL,
  /* Área de la pieza en EPSG:9377, precalculada: cuando una pieza cae entera dentro de una
     celda, su solape es su área y no hace falta calcular la intersección. */
  area_m2      DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS overlay_piece_geom_idx ON analytics.overlay_piece USING GIST (geom);
CREATE INDEX IF NOT EXISTS overlay_piece_layer_idx ON analytics.overlay_piece (layer, snapshot_id);

COMMENT ON TABLE analytics.overlay_piece IS
  'Derivado: polígonos de restricción subdivididos (ST_Subdivide) para que el agregado por celda no recorra polígonos de cientos de miles de vértices. Se regenera con analytics.refresh_overlay_pieces().';

-- Área de solape entre una celda y una pieza, en m² de EPSG:9377. Los dos casos de
-- contención total se resuelven sin calcular la intersección, que es lo caro: en una
-- zona inundable de la Mojana una celda cae entera dentro de la pieza casi siempre.
CREATE OR REPLACE FUNCTION analytics.overlap_area_m2(
  cell geometry, cell_area_m2 DOUBLE PRECISION,
  piece geometry, piece_area_m2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN ST_Contains(piece, cell) THEN cell_area_m2
    WHEN ST_Contains(cell, piece) THEN piece_area_m2
    ELSE ST_Area(ST_Transform(ST_Intersection(cell, piece), 9377))
  END
$$;

-- Regenera las piezas de una capa cuando el conjunto de cortes activos cambió (o
-- siempre, con p_force). Devuelve una fila por capa con lo que hizo.
CREATE OR REPLACE FUNCTION analytics.refresh_overlay_pieces(p_force BOOLEAN DEFAULT FALSE)
RETURNS TABLE (layer TEXT, refreshed BOOLEAN, n_pieces BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
  l RECORD;
  active_ids BIGINT[];
  piece_ids  BIGINT[];
BEGIN
  FOR l IN
    SELECT * FROM (VALUES
      ('protected_area',   'ctx.protected_area',   'category',          'NULL',  'NULL'),
      ('ethnic_territory', 'ctx.ethnic_territory', 'kind',              'NULL',  'NULL'),
      ('urban_perimeter',  'core.urban_perimeter', 'muni_code',         'NULL',  'NULL'),
      ('hazard',           'ctx.hazard',           'kind',              'level', 'level_rank'),
      ('land_capability',  'ctx.land_capability',  'class_code::text',  'NULL',  'NULL'),
      ('land_vocation',    'ctx.land_vocation',    'vocation',          'NULL',  'NULL')
    ) AS v(layer, tbl, key_expr, value_expr, rank_expr)
  LOOP
    EXECUTE format(
      'SELECT coalesce(array_agg(DISTINCT t.snapshot_id ORDER BY t.snapshot_id), ''{}'')
         FROM %s t JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active', l.tbl)
      INTO active_ids;
    SELECT coalesce(array_agg(DISTINCT p.snapshot_id ORDER BY p.snapshot_id), '{}')
      INTO piece_ids
      FROM analytics.overlay_piece p WHERE p.layer = l.layer;

    layer := l.layer;
    IF NOT p_force AND active_ids = piece_ids THEN
      refreshed := FALSE;
      SELECT count(*) INTO n_pieces FROM analytics.overlay_piece p WHERE p.layer = l.layer;
      RETURN NEXT;
      CONTINUE;
    END IF;

    DELETE FROM analytics.overlay_piece p WHERE p.layer = l.layer;
    -- 128 vértices por pieza: suficiente para que cada cruce con una celda sea barato
    -- y sin multiplicar las filas más de lo necesario. ST_MakeValid evita que un anillo
    -- mal cerrado de la fuente tumbe toda la capa.
    EXECUTE format(
      'INSERT INTO analytics.overlay_piece (layer, source_id, snapshot_id, key, value, rank, geom, area_m2)
         SELECT layer, source_id, snapshot_id, key, value, rank, piece,
                ST_Area(ST_Transform(piece, 9377))
           FROM (
             SELECT %L AS layer, t.id AS source_id, t.snapshot_id, %s AS key, %s AS value, %s AS rank,
                    ST_Subdivide(ST_MakeValid(ST_Force2D(t.geom)), 128) AS piece
               FROM %s t
               JOIN meta.snapshot s ON s.id = t.snapshot_id AND s.is_active
              WHERE t.geom IS NOT NULL AND NOT ST_IsEmpty(t.geom)
           ) sub',
      l.layer, l.key_expr, l.value_expr, l.rank_expr, l.tbl);
    GET DIAGNOSTICS n_pieces = ROW_COUNT;
    refreshed := TRUE;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION analytics.refresh_overlay_pieces(BOOLEAN) IS
  'Regenera analytics.overlay_piece por capa cuando cambió el conjunto de cortes activos. Llamar antes de `etl aggregate` y después de cargar amenazas, RUNAP, resguardos, perímetros o suelos.';
