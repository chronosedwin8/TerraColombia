# Estado del proyecto

Actualizado: 2026-09-21

## Resumen

| Fase | Entregable | Estado |
|---|---|---|
| **0 Descubrimiento** | Crawler, catálogo, selección de datasets, diccionario | 🟢 hecho |
| **1 Cimientos** | Monorepo, BD, auth, CI | 🟢 hecho |
| **2 ETL catastro piloto** | Pipeline de un departamento | 🟡 motor completo, falta el corte real del IGAC |
| **3 Explorador + Ficha** | Mapa, buscador universal, ficha de predio | 🟢 hecho |
| **4 Contexto** | DANE, MEN, REPS, OSM, suelos, amenazas, H3 | 🟡 OSM nacional cargado (vías y POIs); faltan las demás fuentes |
| **5 Buscador + Zona + Exportación** | M3, M4, exportes | 🟢 hecho |
| **6 Informes + Pagos** | M7 PDF, planes, créditos, pasarela | 🟢 hecho (sandbox) |
| **7 Escala nacional + gestores** | Todos los departamentos, adaptadores | 🟡 tabla de cobertura y adaptadores declarados |
| **8 Inteligencia** | M5 aptitud, M6 localización, M11 asistente | 🟢 hecho |
| **9 Cambio + Observatorio + Alertas** | M8, M9 | 🟡 motor listo, necesita dos cortes reales |
| **10 GeoAPI pública** | Llaves, cuotas, portal, SDK | 🟢 hecho |
| **11 Endurecimiento y lanzamiento** | Rendimiento, seguridad, legal, analítica | 🟡 técnico hecho, legal pendiente |

## Lo que funciona hoy, verificado

Entorno del equipo de desarrollo: PostgreSQL 17.10 con PostGIS 3.6.2, `h3`, `h3_postgis`,
`postgis_raster`, `pg_trgm`, `unaccent`, `pgrouting`, y GDAL 3.9.2.

- **Base de datos**: 13 migraciones aplicadas. 6 esquemas, `core.parcel` y `core.building`
  particionadas en 34 particiones cada una, EPSG:9377 insertado y midiendo correctamente
  (verificado: 0,01° × 0,01° cerca del ecuador = 1,22 km²).
- **Datos reales cargados**: 33 departamentos y **1.122 municipios de DIVIPOLA** descargados
  del portal de datos abiertos (`gdxc-w37w`), con gestor catastral asignado.
- **Límites administrativos reales cargados** (ADR-009): **1.121 de 1.122 municipios** y
  **33 de 33 departamentos** con polígono, del ArcGIS REST del IGAC
  (`catastro/direccionesterritorialesigac`, capas `municipio` y `departamento`). Geometría
  `MultiPolygon` en EPSG:4326, saneada con `core.clean_polygon()`, área recalculada en
  EPSG:9377 (coincide con el área que declara la fuente: Antioquia 62.786,02 km²,
  Medellín 373,44 km²). Dos salvedades honestas:
  - **27493 Nuevo Belén de Bajirá** queda sin límite: la fuente no lo publica porque su
    pertenencia está en disputa. No se inventa.
  - El límite del **departamento 11 (Bogotá, D.C.)** es DERIVADO por disolución de sus
    municipios: la capa de departamentos del IGAC no lo trae. Marcado como
    `derived_geometry` en `meta.validation`.
- **OpenStreetMap nacional cargado** (ADR-010), del extracto de Geofabrik
  `colombia-latest.osm.pbf` (330 MB, md5 verificado contra el `.md5` publicado), corte
  **2026-09-20** declarado por el propio fichero:
  - `ctx.road`: **965.695 vías** de la red vehicular, `MultiLineString` en EPSG:4326, en los
    **33 departamentos** y en **1.114 de 1.122 municipios**. Por clase: residential 424.744,
    service 195.877, track 126.115, unclassified 111.484, tertiary 41.328, secondary 24.478,
    primary 16.746, trunk 15.394, más enlaces y `living_street`. En Colombia **no existe
    ninguna `highway=motorway`**: la red principal es `trunk` y `primary`.
  - `ctx.poi`: **199.607 puntos de interés** (109.619 nodos y 89.988 polígonos llevados a su
    centroide) en **1.108 municipios**, normalizados a las categorías del producto: ocio
    58.227, alimentación 48.712, servicios 41.013, comercio 28.332, alojamiento 10.137,
    turismo 7.336, financiero 5.850. Educación y salud NO se ingieren de OSM: sus fuentes son
    el MEN y el REPS.
  - `is_paved` sale **solo** de `surface` (312.055 vías la traen): trunk 96 %, primary 71 %,
    secondary 67 %, residential 26 %. Donde no hay etiqueta queda NULL, no se supone pavimento.
  - Licencia **ODbL 1.0 con compartir-igual** (`meta.dataset.share_alike = TRUE`). Atribución
    obligatoria: «© colaboradores de OpenStreetMap, ODbL 1.0».
  - Regla 3: 0 etiquetas de contacto o dirección de puerta en la base. Se descartaron por lista
    blanca 130.932 apariciones de `phone`, `email`, `operator`, `contact:*`, `addr:*`,
    `description`, `note` y `fixme`, registradas en `meta.pii_discard_log`.
  - Cobertura honesta (regla 6): 8 municipios sin ninguna vía y 14 sin ningún POI. La cobertura
    de OSM es muy desigual: Bogotá tiene 50.595 POIs y Vaupés 113 en todo el departamento.
- **Datos de demostración**: 528 predios sintéticos en Soledad (08758) con construcciones,
  colegios e IPS. Marcados `is_synthetic = true`; la API señala `meta.synthetic`
  y `meta.publish_snapshot` impide que tapen un corte real (ADR-006). Las 4 vías y los 40 POIs
  sintéticos se retiraron al cargar OSM: `pnpm db:seed` los volvería a crear, así que la
  siembra de demostración no debe correrse sobre una base con OSM cargado.
- **API**: 126 rutas documentadas en OpenAPI 3.1, servida en `/api/v1` (sesión) y `/geo/v1`
  (llave). Autenticación con JWT y refresco rotativo con detección de reutilización, OAuth de
  Google, llaves de API con hash, cuotas y créditos.
- **Teselas vectoriales**: `ST_AsMVT` desde PostGIS, más 13 funciones de tesela para Martin.
  Tesela de predios real de 35 KB en z15.
- **Informes**: flujo completo verificado de punta a punta. PDF de 18 páginas y 258 KB con las
  10 secciones del plan, XLSX de 28 KB, QR de verificación funcionando sin sesión, y créditos
  cobrados una sola vez de forma idempotente.
- **Frontend**: 17 pantallas, compila y empaqueta (10,5 MB con MapLibre y ECharts separados).

### Rendimiento medido (mediana / p95, base del equipo)

| Consulta | Mediana | p95 | Objetivo del plan |
|---|---|---|---|
| Cobertura de municipio | 1,4 ms | 2,1 ms | — |
| Ficha de predio | 1,1 ms | 1,7 ms | < 800 ms |
| Búsqueda de texto | 2,4 ms | 3,3 ms | — |
| Tesela de predios | 16,7 ms | 22,3 ms | < 200 ms |
| Entorno en radio de 1,5 km | 0,4 ms | 0,7 ms | — |

### Pruebas

871 pruebas automatizadas, todas en verde:

| Paquete | Pruebas |
|---|---|
| `shared` | 47 |
| `geo` | 69 |
| `db` | 52 (23 del constructor SQL + 29 de integración contra PostGIS real) |
| `sources` | 141 |
| `scoring` | 119 |
| `ai` | 90 |
| `reports` | 108 (incluye PDF real con Chromium) |
| `payments` | 113 |
| `api` | 48 (integración con Fastify `inject` contra la base real) |
| `worker` | 21 |
| `web` | 52 |

`tsc --noEmit` limpio en los 11 paquetes. ESLint limpio.

## Bugs reales encontrados y corregidos durante la construcción

Se listan porque cada uno cambió una decisión de diseño, no solo una línea:

1. **El código predial de 20 dígitos no es un prefijo del de 30.** El tramo que identifica el
   terreno ya ocupa 21 dígitos. La conversión aritmética que había producía códigos falsos.
   Ahora no se convierte: se resuelve buscándolo en `core.parcel.npn_old`, y si la fuente no
   publica ese campo el producto lo dice. (Migración 0010, `packages/geo/src/npn.ts`.)
2. **`SET LOCAL statement_timeout` no aplica fuera de una transacción.** El límite de tiempo
   por plan no se estaba imponiendo. Ahora la consulta va en una transacción de solo lectura.
3. **Planificación de 2 segundos en `core.coverage_for`.** El filtro por municipio no permitía
   podar particiones, así que PostgreSQL planificaba las 34 en cada llamada (ejecución: 4 ms).
   Ahora usa SQL dinámico con el departamento como literal: 1,4 ms totales. (Migraciones 0011 y 0012.)
4. **El límite de peticiones devolvía 500 en vez de 429**, y estrangulaba `/health` y `/docs`.
5. **El almacén local usaba ruta relativa**, así que el worker escribía los informes donde la
   API no los encontraba. Ahora se resuelve contra la raíz del monorepo.
6. **El almacén de objetos se colaba en el bundle del navegador** vía el índice de `shared`.
   Se importa por su propia ruta: es código de servidor.
7. **La dirección "12 - 34" no se normalizaba igual que "12-34"**, y en Colombia se escriben
   ambas. Dos escrituras de la misma dirección no se encontraban entre sí.
8. **`UrlState` resolvía a `never`** cuando el valor por omisión y el codec no unificaban, lo
   que silenciaba el tipado del estado compartible por URL de siete pantallas.

## Lo que falta

### Datos (bloquea Fases 2, 4 y 9 al 100 %)

El motor de ingesta está completo y probado, pero **todavía no se ha corrido el corte real del
IGAC**. Para cerrar esas fases hace falta:

1. Descargar la base catastral del departamento piloto y cargarla con `ogr2ogr`
   (`pnpm etl -- run igac-cadastre-<depto>`). Es una descarga de gigabytes.
2. Cargar del DANE la **población por manzana censal**. Los límites municipales y
   departamentales ya NO faltan: se cargaron del IGAC (ADR-009), así que el municipio se
   resuelve por polígono y no por proximidad al centroide. Lo que sigue pendiente del Marco
   Geoestadístico Nacional es la manzana censal con el CNPV 2018, y su geoportal sigue sin
   índice recorrible.
3. Ingerir MEN, REPS, suelos del IGAC, amenazas del SGC e IDEAM, RUNAP y el DEM. **OSM ya
   está**: 965.695 vías y 199.607 POIs de todo el país (ADR-010,
   `pnpm --filter @terracolombia/db load:osm`). Lo que le falta a OSM es el agregado por
   celda: `analytics.h3_cell` solo tiene las 10 celdas del municipio de demostración, así que
   la accesibilidad y la densidad de comercio por hexágono todavía no están calculadas para
   el país.
4. Un segundo corte catastral para que `M8 Cambio territorial` tenga qué comparar.

### Legal (bloquea el lanzamiento comercial)

Ver `docs/LEGAL.md`. El primero es el concepto de abogado sobre el alcance de la cláusula
ShareAlike de CC BY-SA 4.0 en bases derivadas y en la redistribución vía API.

### Pendientes técnicos menores

- Isócronas reales por red vial: hoy se aproximan con un círculo y **se declara** como tal.
  Requiere cargar el grafo vial y usar pgRouting.
- Redis y MinIO no corren en el equipo; la cola degrada a memoria y el almacén a disco
  (ADR-004). En producción se activan con variables de entorno, sin tocar código.
- El servicio de límites del IGAC **no declara licencia** (`licenseInfo` vacío) **ni fecha de
  corte** (`editingInfo` ausente). `meta.snapshot.cut_date` guarda la fecha de CONSULTA y así
  se declara en `stats`. Hay que confirmar la licencia con el IGAC antes de redistribuir el
  dato derivado (ADR-009).
- El servicio del IGAC responde 502/503 y cuelga peticiones con frecuencia: la carga completa
  de límites tarda ~40 minutos con reintentos. `pnpm db:boundaries -- --from=N` reanuda.
- La asignación del gestor catastral marca al IGAC por omisión en los 1.122 municipios. Hay
  cuatro excepciones explícitas (Bogotá, Medellín, Cali, Barranquilla) y **debe verificarse
  contra la habilitación vigente de gestores**, que crece con el tiempo.
- `ANTHROPIC_API_KEY` no está configurada: el asistente funciona en modo determinista y la API
  lo declara en `GET /ai/status`.
