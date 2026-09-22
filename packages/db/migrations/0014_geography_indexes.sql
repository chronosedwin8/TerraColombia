-- 0014 · Índices geográficos para las consultas de cercanía
--
-- PROBLEMA
--
-- Las consultas de «qué hay cerca» y las distancias que alimentan la
-- accesibilidad usan `ST_DWithin(t.geom::geography, punto::geography, radio)`,
-- porque en geografía el radio va en metros y no hay que preocuparse por la
-- proyección. Pero el índice GiST que existe está sobre `geom`, que es
-- `geometry`: **el cast a `geography` lo inutiliza**, y PostgreSQL cae en un
-- recorrido secuencial de la tabla entera.
--
-- Con los datos de demostración —cuatro vías y cuarenta puntos— eso no se
-- notaba. Con los datos reales sí: 965.695 vías, 199.607 puntos de interés,
-- 76.824 prestadores de salud y 71.673 sedes educativas. `GET /nearby` pasó a
-- responder **504 por tiempo agotado**, y la prueba de repositorio que ordena
-- por distancia tardaba 55 segundos.
--
-- Medido sobre esta misma base antes de la migración:
--   · `roadAccess(-74.076, 4.598)` → recorrido secuencial en paralelo sobre
--     `ctx.road`, 11.547 ms.
--   · Cercanía de sedes educativas → recorrido secuencial, coste estimado
--     269.032, 232 ms para devolver 20 filas.
-- Con un `statement_timeout` de 8 s para consultas interactivas, lo primero no
-- es lentitud: es un fallo del producto.
--
-- Se descartó la alternativa de reescribir las consultas expandiendo un radio en
-- grados sobre `geometry`: mide mal según la latitud y obliga a un segundo
-- filtro exacto de todas formas. El cast a `geography` es lo correcto para medir
-- en metros, y el índice funcional es lo que PostGIS espera en ese caso.
--
-- SOLUCIÓN
--
-- Un índice GiST sobre la expresión `(geom::geography)`. Es exactamente la
-- expresión que aparece en las consultas, así que el planificador puede usarlo
-- sin tocar una sola línea de SQL de la aplicación. Se prefiere esto a
-- reescribir cada consulta con un filtro previo en `geometry` porque el cast
-- está repartido por varios repositorios —cercanía, accesibilidad vial,
-- distancia a la cabecera— y un índice los arregla todos a la vez.
--
-- El índice sobre `geom` (geometry) se conserva: lo siguen usando las teselas y
-- los cruces por solape, que trabajan en `geometry` y no en `geography`.

-- Construir un índice GiST sobre cerca de un millón de geometrías tarda varios
-- minutos, muy por encima del `statement_timeout` que el migrador fija para que
-- una consulta descuidada no bloquee la base. Aquí se quita para esta
-- transacción: es una operación de mantenimiento, no una consulta de producto.
SET LOCAL statement_timeout = 0;
SET LOCAL maintenance_work_mem = '512MB';

-- Puntos: son los que más sufren, porque la cercanía se consulta sobre ellos.
CREATE INDEX IF NOT EXISTS school_geog_idx
  ON ctx.school USING GIST ((geom::geography));

CREATE INDEX IF NOT EXISTS health_facility_geog_idx
  ON ctx.health_facility USING GIST ((geom::geography));

CREATE INDEX IF NOT EXISTS poi_geog_idx
  ON ctx.poi USING GIST ((geom::geography));

-- Líneas: la distancia a la vía más cercana alimenta el índice de accesibilidad,
-- que es indicador obligatorio de varios usos en el motor de aptitud.
CREATE INDEX IF NOT EXISTS road_geog_idx
  ON ctx.road USING GIST ((geom::geography));

-- Polígonos: menos filas, pero cada geometría es grande y el recorrido completo
-- es caro igualmente.
CREATE INDEX IF NOT EXISTS protected_area_geog_idx
  ON ctx.protected_area USING GIST ((geom::geography));

CREATE INDEX IF NOT EXISTS hazard_geog_idx
  ON ctx.hazard USING GIST ((geom::geography));

-- La cabecera municipal se consulta por distancia desde cualquier punto del
-- país, así que también conviene tenerla indexada en geografía.
CREATE INDEX IF NOT EXISTS municipality_seat_geog_idx
  ON core.municipality USING GIST ((seat_point::geography))
  WHERE seat_point IS NOT NULL;

COMMENT ON INDEX ctx.school_geog_idx IS
  'Sirve ST_DWithin(geom::geography, …). Sin él, /nearby recorre la tabla entera.';
