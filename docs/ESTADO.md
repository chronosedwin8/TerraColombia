# Estado del proyecto

Actualizado: 2026-09-22

## Resumen

| Fase | Entregable | Estado |
|---|---|---|
| **0 Descubrimiento** | Crawler, catálogo, selección de datasets, diccionario | 🟢 hecho |
| **1 Cimientos** | Monorepo, BD, auth, CI | 🟢 hecho |
| **2 ETL catastro piloto** | Pipeline de un departamento | 🟢 corte nacional cargado: 5.124.105 predios en 819 municipios de 31 departamentos |
| **3 Explorador + Ficha** | Mapa, buscador universal, ficha de predio | 🟢 hecho |
| **4 Contexto** | DANE, MEN, REPS, OSM, suelos, amenazas, H3 | 🟡 MEN, REPS, OSM, RUNAP, amenazas (inundación y sismo) y el agregado H3 ya están cargados; faltan suelos del IGAC, movimientos en masa del SGC, población (DANE) y DEM |
| **5 Buscador + Zona + Exportación** | M3, M4, exportes | 🟢 hecho |
| **6 Informes + Pagos** | M7 PDF, planes, créditos, pasarela | 🟢 hecho (sandbox) |
| **7 Escala nacional + gestores** | Todos los departamentos, adaptadores | 🟢 catastro cargado en 819 municipios de 31 departamentos (Antioquia y Bogotá tienen gestor catastral propio y no publican en la base del IGAC; cobertura declarada) |
| **8 Inteligencia** | M5 aptitud, M6 localización, M11 asistente | 🟢 hecho |
| **9 Cambio + Observatorio + Alertas** | M8, M9 | 🟡 motor listo, sigue faltando un segundo corte catastral real para comparar |
| **10 GeoAPI pública** | Llaves, cuotas, portal, SDK | 🟢 hecho |
| **11 Endurecimiento y lanzamiento** | Rendimiento, seguridad, legal, analítica | 🟡 técnico hecho, legal pendiente |

## Lo que funciona hoy, verificado

Entorno del equipo de desarrollo: PostgreSQL 17.10 con PostGIS 3.6.2, `h3`, `h3_postgis`,
`postgis_raster`, `pg_trgm`, `unaccent`, `pgrouting`, y GDAL 3.9.2.

- **Base de datos**: 29 GB, 18 migraciones aplicadas (la última con datos reales es la 0017;
  también existe la `0020_ctx_hidrografia_relieve`, que crea las tablas `ctx.water_body` y
  `ctx.contour`, todavía sin ninguna carga: 0 filas en ambas). 6 esquemas, `core.parcel` y
  `core.building` particionadas en 34 particiones cada una, EPSG:9377 insertado y midiendo
  correctamente (verificado: 0,01° × 0,01° cerca del ecuador = 1,22 km²).
- **Catastro del IGAC cargado a escala nacional**: Base Catastral Pública (CC BY-SA 4.0), corte
  **2026-08-31** salvo Cauca (19), que quedó en **2026-07-31**. **5.124.105 predios**
  (`core.parcel`), **3.840.750 construcciones**, **172.462 manzanas** y **16.913 veredas**, en
  **819 municipios de 31 departamentos**. Antioquia (05) y Bogotá (11) no están: tienen gestor
  catastral propio y no publican en la base del IGAC; la cobertura lo declara así, sin dejar un
  mapa vacío sin explicación (regla 6). Snapshots activos: `igac-cadastre-08,13,15,17,18,19,20,
  23,25,27,41,44,47,50,52,54,63,66,68,70,73,76,81,85,86,88,91,94,95,97,99`.
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
- **MEN cargado**: **71.667 sedes educativas**, de las cuales **48.209 tienen coordenadas
  (67 %)**. Snapshots `men-sedes-educativas` (corte 2021-03-19) y
  `men-establecimientos-educativos` (corte 2026-09-03). Además, **124.867 filas** de
  indicadores municipales de educación en `analytics.muni_indicator`
  (`men-estadisticas-educacion-municipio`, corte 2024-12-31).
- **REPS cargado**: **76.821 prestadores y sedes de salud**, **0 con coordenadas**: la fuente
  no publica coordenadas geográficas. La API lo distingue de "no hay prestadores": cuando el
  municipio sí tiene prestadores pero ninguno está localizado, responde "desconocido" y no `0`
  (bug 13).
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
    `description`, `note` y `fixme`.
  - Cobertura honesta (regla 6): 8 municipios sin ninguna vía y 14 sin ningún POI. La cobertura
    de OSM es muy desigual: Bogotá tiene 50.595 POIs y Vaupés 113 en todo el departamento.
- **RUNAP cargado**: **1.924 áreas protegidas** (corte 2026-09-11).
- **Amenazas cargadas parcialmente**: **49.159 polígonos activos** = inundación TR100 del
  IDEAM (49.153 polígonos; solo 79 centros poblados fueron estudiados por la fuente, corte
  2025-08-05) + amenaza sísmica NSR-10 del SGC (6 polígonos). Movimientos en masa del SGC
  **no** están cargados (ver "Lo que falta").
- **Agregado por celda H3 corriendo a escala nacional** (ADR-012): `analytics.h3_cell` tiene
  **78.921 celdas y sigue creciendo** — el agregado nacional
  (`pnpm etl -- aggregate --loaded`, 819 municipios con predios, resoluciones 8 y 9) está
  corriendo hoy en segundo plano tras arreglar el rendimiento. `analytics.overlay_piece` tiene
  **647.820 piezas** (capas de restricción trocedas para el cruce con las celdas).
- **Protección de datos personales** (regla 3): `meta.pii_discard_log` tiene hoy **269
  registros** — cada uno un nombre de columna descartado por dataset, nunca un valor — que
  cubren las fuentes cargadas hasta hoy.
- **Datos de demostración apagados**: los 10 cortes sintéticos se desactivaron
  (`pnpm --filter @terracolombia/db demo -- --off`); la banda roja "DATOS DE DEMOSTRACIÓN" ya
  no aparece en la UI. `meta.publish_snapshot` sigue impidiendo que un corte sintético tape uno
  real si algún día se reactiva (ADR-006).
- **API**: 126 rutas documentadas en OpenAPI 3.1, servida en `/api/v1` (sesión) y `/geo/v1`
  (llave). Autenticación con JWT y refresco rotativo con detección de reutilización, OAuth de
  Google, llaves de API con hash, cuotas y créditos.
- **Teselas vectoriales**: `ST_AsMVT` desde PostGIS, más 13 funciones de tesela para Martin.
  Tesela de predios real de 35 KB en z15.
- **Informes**: flujo completo verificado de punta a punta. PDF de 18 páginas y 258 KB con las
  10 secciones del plan, XLSX de 28 KB, QR de verificación funcionando sin sesión, y créditos
  cobrados una sola vez de forma idempotente.
- **Frontend**: 17 pantallas, compila y empaqueta (10,5 MB con MapLibre y ECharts separados).
- **Prueba de humo con datos reales**: script temporal
  `packages/db/src/cli/tmpK/smoke.ts` corrió hoy sobre Palmira (76520) y pasó **30 de 30
  flujos**: búsqueda, ficha, contexto, historial, cercanías, municipio, observatorio, aptitud,
  zona, localización, teselas, cambios, informe PDF, capas y cobertura.

### Rendimiento medido (mediana / p95, base del equipo)

| Consulta | Mediana | p95 | Objetivo del plan |
|---|---|---|---|
| Cobertura de municipio | 1,4 ms | 2,1 ms | — |
| Ficha de predio | 1,1 ms | 1,7 ms | < 800 ms |
| Búsqueda de texto | 2,4 ms | 3,3 ms | — |
| Tesela de predios | 16,7 ms | 22,3 ms | < 200 ms |
| Entorno en radio de 1,5 km | 0,4 ms | 0,7 ms | — |

### Pruebas

Pruebas unitarias confirmadas hoy (2026-09-22), todas en verde:

| Paquete | Pruebas |
|---|---|
| `shared` | 47 |
| `geo` | 69 |
| `sources` | 152 |
| `scoring` | 119 |
| `ai` | 90 |
| `reports` | 108 (incluye PDF real con Chromium) |
| `payments` | 113 |
| `web` | 52 |

`db`, `api` y `worker` seguían corriendo sus suites al redactar este documento y no se
contabilizan aquí; puede verificarse con `pnpm test` (tarda ~10 min) cuando haga falta una
cifra fresca de esos tres paquetes.

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
9. **El validador de NPN rechazaba todos los predios rurales reales** (tramo de zona `00`) y
   los predios urbanos fuera de la cabecera (tramos `02` a `08`), porque solo aceptaba `01` o
   `02`. Con los 5,1 millones de predios reales, esto tumbaba con `400 INVALID_NPN` a más de la
   mitad de la base. (ADR-011, migración 0015.)
10. **El agregado por celda no terminaba con datos reales**, por tres causas distintas:
    polígonos de restricción de hasta 486.547 vértices sin trocear (`ST_Intersects` contra
    inundación IDEAM y RUNAP completos), vecino más cercano por vía recorriendo el índice
    general sin filtrar por clase, y una CTE que el planificador recalculaba dentro de un
    bucle anidado (celdas² búsquedas). (ADR-012, migraciones 0016 y 0017.)
11. **`analytics.muni_summary` no se refrescaba tras cargar el catastro**, así que `/coverage`
    seguía respondiendo que solo había predios en 1 municipio; y `getSourceRefs` citaba
    datasets inactivos de demostración por un `LEFT JOIN` que no filtraba por snapshot activo.
12. **El respaldo `pg_dump --jobs=4` quedó colgado 2,5 horas**, con los procesos trabajadores en
    estado «idle in transaction» sin escribir nada. Se está reintentando (pendiente, no
    resuelto — ver "Lo que falta").
13. **Los indicadores sin dato decían solo «No disponible»**, sin explicar por qué. Ahora cada
    uno trae `missingNote` con la razón real (cobertura parcial de la fuente, servicio caído,
    coordenadas no publicadas, etc.) en `packages/scoring`.
14. **La interfaz tenía fallos que ninguna prueba de API veía** (ADR-013, encontrados con el
    recorrido en navegador real `pnpm ui:audit`): ninguna capa propia se cargaba en el mapa
    (URL relativa de teselas dentro del *worker* de MapLibre), el recorrido de bienvenida
    bloqueaba el formulario de ingreso, la sesión se perdía al cambiar de página (dos
    refrescos simultáneos del token), la portada entraba en bucle reactivo, el observatorio
    fallaba al pintar los 112 indicadores (contrato distinto entre API y vista), la ficha de
    Palmira decía «aún no tenemos los predios de este municipio» y no centraba el mapa, la
    atribución decía «corte sin corte declarado» y el límite de 30 peticiones por minuto
    cortaba a un usuario en la séptima pantalla. Todos corregidos y verificados con capturas.

## Lo que falta

### Datos

El catastro ya está cargado a escala nacional (819 municipios de 31 departamentos), lo que
cierra la Fase 2 y la Fase 7. Lo que sigue pendiente:

1. **Movimientos en masa del SGC**: no cargado. El servicio del SGC no respondió durante la
   carga; el snapshot quedó en estado `transformed` (inactivo). Cargador resumible:
   `pnpm --filter @terracolombia/db load:hazards -- --only=mass-movement`.
2. **Suelos del IGAC** (capacidad de uso, vocación): no cargados. El snapshot
   `igac-capacidad-uso-tierras` quedó en estado `failed`: `mapas.igac.gov.co` estaba caído al
   intentar la descarga.
3. **Población por manzana censal del DANE**: no disponible como dato abierto descargable. Se
   extrajeron **504.996 geometrías de manzana** del Marco Geoestadístico Nacional, pero sin
   población asociada; no se cargaron.
4. **Población municipal total**: no se encontró fuente abierta para este dato.
5. **DEM / modelo de elevación**: no cargado.
6. **Hidrografía y curvas de nivel** (`ctx.water_body`, `ctx.contour`): las tablas ya existen
   (migración `0020_ctx_hidrografia_relieve`), pero siguen en 0 filas; falta la carga.
7. **Segundo corte catastral** para que `M8 Cambio territorial` tenga qué comparar (bloquea la
   Fase 9 al 100 %).
8. **Respaldo verificado**: el intento de `pg_dump` de hoy quedó colgado (bug 12); se está
   reintentando y todavía no hay un respaldo completo confirmado.

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
