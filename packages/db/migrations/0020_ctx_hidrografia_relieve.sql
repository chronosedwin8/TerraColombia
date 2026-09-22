-- 0014 · Hidrografia y curvas de nivel del IGAC (Datos Fundamentales)
--
-- La 0005 creo ctx.road y ctx.soil_unit pero no las dos tablas que los datasets
-- `igac-cuerpos-agua-500k` e `igac-curvas-nivel-500k` declaran como destino
-- (`ctx.water_body`, `ctx.contour`). Sin ellas el paso `transform` del ETL no tiene
-- donde escribir y la seccion 4 del Informe Territorial (PLAN.md §11) se queda sin
-- hidrografia ni relieve.
--
-- Escalas: 1:500 000 en ambas capas. Es contexto regional, NO detalle de predio; el
-- producto debe declararlo (validacion `scale-disclosure` de los dos datasets).

-- ─── IGAC · Cuerpos de agua 1:500 000 ─────────────────────────────────────────
-- Una sola tabla para las 7 capas del servicio: drenajes lineales (Drenaj_L),
-- drenajes en poligono (Drenaj_R), depositos de agua, bancos de arena, islas,
-- manglares y humedales. Mezclan MultiLineString y MultiPolygon, asi que la columna
-- es `geometry(Geometry, 4326)`: no se puede forzar un solo tipo sin perder capas.
CREATE TABLE IF NOT EXISTS ctx.water_body (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  /* Identificador de la fuente (DIdentif, DAIdentif, BAIdentif, IsIdentif, MgIdentif…).
     En la corrida de 2026-09 casi todos vienen en blanco: la fuente no lo diligencia. */
  code          TEXT,
  /* Tipo tal como lo codifica el IGAC. Son CODIGOS, no etiquetas: el servicio no
     publica el dominio de valores, asi que se guardan sin traducir (regla 2). */
  kind          TEXT,
  /* Capa de origen dentro del MapServer, p. ej. "Drenaj_L". Es la unica procedencia
     fina que tiene la fila y hay que poder mostrarla (regla 4). */
  source_layer  TEXT,
  /* line | polygon: derivado de la geometria, para poder filtrar sin ST_GeometryType */
  geom_kind     TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(Geometry, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS water_body_geom_idx ON ctx.water_body USING GIST (geom);
CREATE INDEX IF NOT EXISTS water_body_snapshot_idx ON ctx.water_body (snapshot_id);
CREATE INDEX IF NOT EXISTS water_body_layer_idx ON ctx.water_body (source_layer);

COMMENT ON TABLE ctx.water_body IS
  'Hidrografia del IGAC 1:500 000. Contexto regional: PROHIBIDO derivar rondas hidricas ni amenaza de inundacion de predio (validacion no-ronda-hidrica-claim).';

-- ─── IGAC · Curvas de nivel 1:500 000 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctx.contour (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          TEXT,
  /* Altura de la curva en metros sobre el nivel del mar, tal como la trae CNAltura */
  elevation_m   NUMERIC(7, 1),
  source_layer  TEXT,
  attrs         JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom          geometry(MultiLineString, 4326) NOT NULL,
  snapshot_id   BIGINT NOT NULL REFERENCES meta.snapshot(id) ON DELETE CASCADE,
  /* Rango del territorio colombiano: del nivel del mar al Pico Cristobal Colon (5 775 m).
     Un valor fuera de rango es un error de lectura del campo, no un dato. */
  CONSTRAINT contour_elevation_chk CHECK (elevation_m IS NULL OR elevation_m BETWEEN -5 AND 5800)
);
CREATE INDEX IF NOT EXISTS contour_geom_idx ON ctx.contour USING GIST (geom);
CREATE INDEX IF NOT EXISTS contour_snapshot_idx ON ctx.contour (snapshot_id);
CREATE INDEX IF NOT EXISTS contour_elevation_idx ON ctx.contour (elevation_m);

COMMENT ON TABLE ctx.contour IS
  'Curvas de nivel del IGAC 1:500 000. NO sirven para calcular pendiente de un predio: para eso esta ctx.elevation_cell (DEM). Validacion prefer-dem.';

-- ─── Procedencia fina en las capas agrologicas ────────────────────────────────
-- ctx.land_capability y ctx.soil_unit reciben polígonos de estudios distintos (la
-- capacidad de uso son cientos de estudios regionales, las áreas homogéneas son un
-- servicio por municipio). Dos polígonos vecinos pueden venir de estudios de años y
-- escalas incomparables, así que la fila tiene que decir de cuál salió (regla 4).
ALTER TABLE ctx.land_capability ADD COLUMN IF NOT EXISTS source_study TEXT;
ALTER TABLE ctx.land_capability ADD COLUMN IF NOT EXISTS muni_code CHAR(5);
ALTER TABLE ctx.soil_unit ADD COLUMN IF NOT EXISTS source_study TEXT;

CREATE INDEX IF NOT EXISTS land_capability_snapshot_idx ON ctx.land_capability (snapshot_id);
CREATE INDEX IF NOT EXISTS land_capability_muni_idx ON ctx.land_capability (muni_code);

COMMENT ON COLUMN ctx.land_capability.source_study IS
  'Servicio/estudio del IGAC del que salio el poligono, p. ej. "capacidaddeusodelastierrascvc2023". Sin esto no se puede mostrar la procedencia de la fila.';
COMMENT ON COLUMN ctx.soil_unit.source_study IS
  'Servicio/estudio del IGAC del que salio el poligono, p. ej. "actividadquimicanacional".';
