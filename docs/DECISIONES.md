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
