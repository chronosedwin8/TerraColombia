# Decisiones técnicas (ADR ligero)

Formato: `ADR-NNN · fecha · decisión · contexto · consecuencias`.

---

## ADR-001 · 2026-09-21 · Postgres local del equipo como base de desarrollo

**Contexto.** El plan propone Docker Compose con `postgis/postgis`. En el equipo de desarrollo hay
PostgreSQL 17.10 instalado como servicio de Windows (usuario `postgres`), y el demonio de Docker no
está en ejecución.

**Decisión.** Usar la instancia local `localhost:5432` con la base `terracolombia`. Se instala PostGIS
3.6 (bundle oficial de OSGeo para pg17) sobre esa instancia. `infra/docker-compose.yml` se mantiene
para quien prefiera contenedores y para CI, pero no es el camino por defecto en este equipo.

**Consecuencias.** Las migraciones deben ser compatibles con PostgreSQL 17 y PostGIS 3.6 (lo son).
`DATABASE_URL` apunta a la instancia local. CI usa el contenedor `postgis/postgis:16-3.4`.

---

## ADR-002 · 2026-09-21 · H3 nativo en la base con el tipo `h3index`

**Contexto.** El plan pide las extensiones `h3` y `h3_postgis`. Se temía que no hubiera binario para
PostgreSQL 17 en Windows.

**Decisión.** El *bundle* oficial de PostGIS para pg17 (`postgis-bundle-pg17-3.6.2x64`, OSGeo) trae
`h3` y `h3_postgis` compiladas, además de `pgrouting`, `ogr_fdw` y GDAL 3.9.2. Se instalaron ambas.
Los índices H3 se almacenan con el tipo nativo `h3index` y se calculan indistintamente en SQL
(`h3_lat_lng_to_cell(geometry, res)`, `h3_polygon_to_cells(geometry, res)`) o en Node con `h3-js`
(misma implementación de referencia, resultados idénticos carácter a carácter).

**Consecuencias.** Los agregados por celda se calculan dentro de la base, sin viajes de datos. La
geometría de la celda sale de `h3_cell_to_boundary_geometry(...)`, así que `analytics.h3_cell.geom`
es una columna generada y no hay riesgo de desincronización.

---

## ADR-002b · 2026-09-21 · EPSG:9377 se inserta en `spatial_ref_sys`

**Contexto.** PROJ 8.2.1 (el que trae el bundle) no incluye `EPSG:9377` (MAGNA-SIRGAS /
Origen-Nacional), que es el sistema en el que el plan exige calcular áreas y distancias.

**Decisión.** La migración `0001` inserta la definición en `spatial_ref_sys` con los parámetros del
registro EPSG (Transverse Mercator, lat₀ 4° N, lon₀ 73° W, k 0,9992, falso Este 5.000.000 m, falso
Norte 2.000.000 m, elipsoide GRS 1980). La definición vive en `packages/geo/src/crs.ts` para que la
migración, el ETL y las pruebas usen la misma cadena.

**Consecuencias.** `ST_Transform(geom, 9377)` funciona en cualquier instalación del proyecto sin
depender de la versión de PROJ.

---

## ADR-003 · 2026-09-21 · Teselas vectoriales servidas por la API con `ST_AsMVT`

**Contexto.** Martin es un binario aparte que requiere Docker o instalación nativa.

**Decisión.** `GET /tiles/:layer/:z/:x/:y.mvt` se implementa en Fastify con `ST_AsMVT` + caché
(Redis si existe, LRU en memoria si no) y control de plan. Si `MARTIN_URL` está definido, el mismo
endpoint hace proxy a Martin conservando el control de acceso.

**Consecuencias.** Un solo despliegue en desarrollo; en producción se puede activar Martin sin tocar
el frontend (misma URL).

---

## ADR-004 · 2026-09-21 · Cola con degradación a memoria y almacenamiento con degradación a disco

**Contexto.** Redis y MinIO no están disponibles en el equipo de desarrollo.

**Decisión.** `packages/db`/`apps/worker` exponen `createQueue()`: BullMQ si `REDIS_URL` está definido,
cola en proceso con la misma interfaz si no. `packages/shared/storage` expone `ObjectStore`: S3 si
`S3_ENDPOINT` está definido, sistema de archivos bajo `STORAGE_LOCAL_DIR` si no.

**Consecuencias.** El mismo código de ETL e informes corre en desarrollo y en producción. La cola en
memoria no persiste entre reinicios y está marcada como "solo desarrollo" en los logs.

---

## ADR-005 · 2026-09-21 · Doble camino de *staging*: GDAL para binarios, Node para servicios

**Contexto.** El plan usa `ogr2ogr` para cargar GDB/GPKG/SHP a `raw.*`.

**Decisión.** GDAL 3.9.2 vino con el bundle de PostGIS y quedó en
`C:\Program Files\PostgreSQL\17\bin\ogr2ogr.exe` (con `gdal-data` al lado). El pipeline:

- usa `ogr2ogr` para formatos binarios (File Geodatabase, GeoPackage, Shapefile), que es el único
  camino confiable para ellos;
- usa lectores nativos de Node para GeoJSON (incluido el *streaming* paginado de ArcGIS REST), CSV y
  Socrata, sin depender de GDAL.

El detector está en `packages/sources/src/connectors/gdal.ts`, fija `GDAL_DATA` y `PROJ_LIB`, y el
pipeline registra qué camino usó en `meta.snapshot`.

**Consecuencias.** No hay degradación silenciosa: si falta GDAL y el dataset es binario, el ETL falla
con un mensaje que dice cómo instalarlo.

---

## ADR-006 · 2026-09-21 · Snapshots sintéticos marcados, nunca mezclados con datos reales

**Contexto.** Para tener tests y demo reproducibles sin depender de una descarga de 1 GB del IGAC.

**Decisión.** `pnpm db:seed` carga un snapshot de demostración con `meta.snapshot.is_synthetic = true`
y `meta.dataset.source = 'DEMO'`. La API marca toda respuesta que toque un snapshot sintético con
`meta.synthetic = true` y la UI muestra una banda roja "DATOS DE DEMOSTRACIÓN". Un snapshot sintético
nunca puede publicarse como activo si existe uno real para el mismo dataset.

**Consecuencias.** Cumple la regla 2 y 4 del `CLAUDE.md`: nada inventado se presenta como real.

---

## ADR-008 · 2026-09-21 · Mercado Pago como proveedor de pagos principal

**Contexto.** El plan (§3 y §12) proponía Wompi primero, con Mercado Pago, PayU y ePayco como
adaptadores. El responsable del producto decidió usar Mercado Pago.

**Decisión.** `PAYMENT_PROVIDER` vale `mercadopago` por defecto. El adaptador implementa Checkout Pro
para la creación de la preferencia, consulta de pago por id y verificación de la firma `x-signature`
del webhook con HMAC-SHA256 y comparación en tiempo constante. Los medios soportados en Colombia son
tarjeta, PSE y Efecty. Wompi, PayU y ePayco se mantienen como adaptadores de la misma interfaz
`PaymentProvider`, porque la arquitectura de puertos y adaptadores no cambia.

**Consecuencias.** La facturación electrónica sigue siendo un puerto aparte (`InvoiceProvider`), sin
proveedor elegido. Cambiar de pasarela es cambiar una variable de entorno y un adaptador.

---

## ADR-007 · 2026-09-21 · DSL de consulta traducido con constructor tipado

**Contexto.** `/parcels/query` recibe filtros arbitrarios del cliente.

**Decisión.** El DSL se valida con Zod y se traduce con `packages/db/src/sql.ts` (plantillas
etiquetadas que solo producen `$n` + arreglo de valores). Los nombres de columna solo pueden salir de
un mapa blanco (`PARCEL_FILTER_COLUMNS`). `statement_timeout` por petición según plan.

**Consecuencias.** No hay ruta de concatenación de cadenas a SQL en el código de consulta.

---

## ADR-009 · 2026-09-21 · Los límites administrativos vienen del IGAC, no del DANE, y llevan su propio snapshot

**Contexto.** `core.municipality` tenía las 1.122 filas de DIVIPOLA con centroide pero `geom` NULL, y
`core.department` las 33 filas también sin geometría: el mapa abría en zoom 5 sin un solo límite. La
fuente prevista era el Marco Geoestadístico Nacional del DANE, pero su geoportal no publica un índice
recorrible por máquina (verificado en la Fase 0, `etl/config/datasets/dane.ts`): la descarga es por
formulario, así que no hay forma de automatizarla ni de fijar los nombres de campo reales.

**Decisión.** Se usa el ArcGIS REST del IGAC,
`https://mapas.igac.gov.co/server/rest/services/catastro/direccionesterritorialesigac/MapServer`,
capas `1 departamento` y `2 municipio`. Es la «Base de Datos Geográfica de Entidades Territoriales»:
límites de deslinde aprobados por la autoridad competente y elevados a norma (Ley 1447 de 2011,
Decreto 1170 de 2015). Campos verificados con peticiones reales: `MpCodigo`, `MpNombre`, `MpArea`,
`Depto` en municipios; `DeCodigo`, `DeNombre`, `DeArea`, `DeNorma` en departamentos.

La geometría se guarda con un snapshot **distinto** del de DIVIPOLA. La migración `0013` añade
`geom_snapshot_id` a `core.department` y `core.municipality`: `snapshot_id` sigue siendo el del padrón
de códigos y nombres (DANE) y `geom_snapshot_id` es el del límite (IGAC). Reutilizar una sola columna
habría hecho que la API atribuyera el límite municipal al DANE, que no lo produce, rompiendo la regla 4.

**Consecuencias.**
- El cargador (`packages/db/src/cli/load-admin-boundaries.ts`) solo hace `UPDATE`: nunca inserta
  municipios ni departamentos. Un código de la fuente que no exista en la base se informa y se descarta.
- El área se calcula en EPSG:9377 (convención del proyecto), no se copia `MpArea`/`DeArea`.
- Bogotá, D.C. (código 11) **no está** en la capa de departamentos del IGAC. Su límite se DERIVA
  disolviendo sus municipios con `ST_Union` y queda registrado como `derived_geometry` en
  `meta.validation`: es un dato derivado, no el límite oficial publicado.
- Nuevo Belén de Bajirá (27493) no está en la fuente —su pertenencia está en disputa— y queda con
  `geom` NULL. No se inventa.
- **Pendiente legal:** el servicio no declara licencia (`licenseInfo` vacío) ni fecha de corte
  (`editingInfo` ausente). `meta.snapshot.cut_date` guarda la fecha de CONSULTA y así se declara en
  `stats`. Hay que confirmar la licencia con el IGAC antes de redistribuir el dato derivado.

---

## ADR-010 · 2026-09-21 · OpenStreetMap se ingiere con un lector de PBF propio, no con osm2pgsql

**Contexto.** Los datasets `osm-vias-colombia` y `osm-poi-colombia` se sirven del extracto de
Colombia de Geofabrik (`colombia-latest.osm.pbf`, 330 MB, 47 799 384 nodos, 5 239 875 ways,
37 868 relaciones). Antes de elegir herramienta se comprobó qué hay instalado en el equipo:

| Herramienta | Estado |
|---|---|
| `osm2pgsql` | **no instalada** (tampoco en `.env`: `OSM2PGSQL=` vacío) |
| `osmium` / `osmconvert` / `osmfilter` | **no instaladas** |
| GDAL 3.9.2 (`ogr2ogr`, driver `OSM -vector- (rov)`) | sí, del *bundle* de PostGIS para pg17 |
| Docker | instalado, **demonio caído** (igual que en ADR-001) |
| `pbf@3.3.0` en `node_modules/.pnpm` | sí, pero como dependencia transitiva, no declarada |

**Decisión.** Un lector propio de `.osm.pbf` en TypeScript (`packages/db/src/seed/osm-pbf.ts`) y un
cargador (`packages/db/src/cli/load-osm.ts`), sin dependencias nuevas.

Por qué no las alternativas:

- **`osm2pgsql`** habría sido la opción natural, pero instalarlo (con sus DLL de GEOS/PROJ/LuaJIT) a
  dos días del lanzamiento es un riesgo mayor que escribir el lector, y su esquema (`planet_osm_line`
  con `hstore`) no es el de `ctx.road`/`ctx.poi`: habría hecho falta igual una capa de traducción.
- **GDAL `ogr2ogr`** sí puede leer el PBF, pero su driver expone solo un puñado de campos como
  columnas y mete el resto en `other_tags` (hstore): `amenity`, `shop` y `surface` habrían llegado
  dentro de una cadena que hay que parsear en SQL. Además crea un SQLite temporal para resolver las
  geometrías y, sobre todo, **escribe primero y filtra después**: las etiquetas `phone`,
  `contact:phone` y `addr:*` pasarían por la base antes de poder descartarlas, lo que choca con la
  regla 3 (cero datos personales, descarte *en la ingesta*).
- **El extracto `-free.shp.zip`/`.gpkg.zip`** de Geofabrik es más cómodo, pero su esquema reducido no
  trae `surface` ni `lanes`, que es justo de donde sale `is_paved`, y `is_paved` alimenta
  `dist_paved_road_m` y `road_access_score`. Habría obligado a inventar el pavimento (regla 2).
- **Añadir `pbf` como dependencia** no ahorraba casi nada: la parte laboriosa no es el varint, es el
  esquema `DenseNodes`/`Way` y la resolución de geometrías.

Cómo funciona: dos pasadas sobre el fichero en memoria (330 MB). La primera selecciona los ways de la
red vehicular y los elementos con etiqueta de POI y anota qué nodos hacen falta; la segunda resuelve
las coordenadas de **solo esos** nodos (índice ordenado + búsqueda binaria, `Float64Array`). Así no
se guardan en memoria los 47,8 millones de nodos del extracto. Cada pasada tarda ~8 s. La escritura
va por lotes de 2 000 filas, cada lote en su propia transacción con `statement_timeout` ampliado, y
la geometría se construye en PostGIS (`ST_GeomFromText` + `ST_Multi`), nunca en Prisma (regla 8).

**Consecuencias.**

- El lector queda cubierto por `osm-pbf.test.ts`, que construye un PBF sintético byte a byte. Se
  escribió después de encontrar un fallo real: saltar un campo de longitud variable dejaba el cursor
  un byte corrido (`this.pos += this.varint()` usa el `pos` anterior a leer la longitud).
- **No se ingieren relaciones** (37 868 en el extracto): armar su geometría exige ensamblar los ways
  miembros. Queda declarado como faltante en `meta.snapshot.stats`, no disimulado.
- `is_paved` se deriva **solo** de `surface`. Cobertura real de `surface` en este corte: `trunk` 96 %,
  `primary` 71 %, `secondary` 67 %, `tertiary` 62 %, `residential` 26 %, `track` 25 %. Donde no hay
  etiqueta, `is_paved` queda NULL y el motor declara el faltante en vez de suponer pavimento.
- Hallazgo del dato: **en Colombia no existe ninguna vía `highway=motorway`**; la red principal se
  etiqueta `trunk` (15 394) y `primary` (16 746). Las consultas que filtran
  `class IN ('motorway','trunk','primary')` siguen siendo correctas, pero el primer valor no aporta
  filas.
- ODbL 1.0 es *share-alike*: los dos datasets quedan con `meta.dataset.share_alike = TRUE` y hay que
  citar «© colaboradores de OpenStreetMap, ODbL 1.0» en mapa, ficha, informe y API, manteniendo la
  base de OSM separada de la del IGAC en las exportaciones.
- Los cortes sintéticos de demostración que ocupaban estas tablas (`demo-roads`, y los POIs de
  `demo-facilities`) se retiran al cargar el dato real: las consultas del producto filtran por
  `is_active` sin distinguir fuentes, y dejar los dos mezclaría 4 vías inventadas con la red
  nacional. `pnpm db:seed` las volvería a crear, así que la siembra de demostración ya no debe
  correrse sobre una base con OSM cargado (o hay que volver a correr `load:osm`).
