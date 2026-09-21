-- 0013 · Linaje separado para la geometría de la división administrativa
--
-- `core.department.snapshot_id` y `core.municipality.snapshot_id` ya apuntan al corte de
-- DIVIPOLA (DANE), que es quien crea la fila: código, nombre y centroide. El límite
-- (`geom`) lo publica otra entidad —el IGAC— con su propio corte y su propia licencia.
--
-- Si se reutilizara la misma columna, el bloque `meta.sources[]` de la API atribuiría el
-- límite municipal al DANE, que no lo produce: eso rompe la regla 4 de CLAUDE.md
-- (procedencia exacta de cada cifra). Por eso la geometría lleva su propio snapshot.

ALTER TABLE core.department
  ADD COLUMN IF NOT EXISTS geom_snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL;

ALTER TABLE core.municipality
  ADD COLUMN IF NOT EXISTS geom_snapshot_id BIGINT REFERENCES meta.snapshot(id) ON DELETE SET NULL;

COMMENT ON COLUMN core.department.geom_snapshot_id IS
  'Corte del que proviene `geom`. Distinto de `snapshot_id` (DIVIPOLA), que es el del padron de codigos y nombres.';

COMMENT ON COLUMN core.municipality.geom_snapshot_id IS
  'Corte del que proviene `geom`. Distinto de `snapshot_id` (DIVIPOLA), que es el del padron de codigos y nombres.';

CREATE INDEX IF NOT EXISTS department_geom_snapshot_idx ON core.department (geom_snapshot_id);
CREATE INDEX IF NOT EXISTS municipality_geom_snapshot_idx ON core.municipality (geom_snapshot_id);

-- La 0003 dejó escrito que la geometría vendría del MGN del DANE. El geoportal del DANE no
-- publica un índice recorrible (ver `etl/config/datasets/dane.ts`), así que la fuente real
-- es el IGAC. Se corrige el comentario para que la base no afirme algo que no es cierto.
COMMENT ON TABLE core.municipality IS
  'Municipios DIVIPOLA (DANE). El limite `geom` viene del IGAC: ver `geom_snapshot_id`.';
