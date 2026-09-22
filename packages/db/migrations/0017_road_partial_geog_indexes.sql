-- 0017 · Índices parciales de vías para el vecino más cercano por clase
--
-- El paso de accesibilidad del agregado busca, para cada celda, la vía primaria más
-- cercana y la vía pavimentada más cercana. Con el índice geográfico general (0014)
-- el recorrido por cercanía tiene que descartar cientos de vías terciarias antes de
-- encontrar una primaria: 8 ms por celda medidos, 200 s para un municipio de 9.000
-- celdas, y hay 819 municipios. Un índice parcial por clase hace que el recorrido
-- devuelva la primera vía que encuentra: menos de 1 ms.
--
-- Las condiciones WHERE deben coincidir literalmente con las del paso 7 de
-- `rebuildCellsForMunicipality` para que el planificador pueda usarlos.

SET LOCAL statement_timeout = 0;
SET LOCAL maintenance_work_mem = '512MB';

CREATE INDEX IF NOT EXISTS road_primary_geog_idx
  ON ctx.road USING GIST ((geom::geography))
  WHERE class IN ('motorway', 'trunk', 'primary');

CREATE INDEX IF NOT EXISTS road_paved_geog_idx
  ON ctx.road USING GIST ((geom::geography))
  WHERE is_paved;
