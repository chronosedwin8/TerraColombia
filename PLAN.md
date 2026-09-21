# PLAN MAESTRO PARA CLAUDE CODE — "TerraColombia" (nombre de trabajo)

> Motor de inteligencia territorial de Colombia: catastro + suelos + geografía + demografía + equipamientos, con mapa interactivo, explicaciones en lenguaje claro, informes exportables y API comercial.
>
> **Cómo usar este archivo:** cópialo en la raíz del repo como `PLAN.md`. La sección 0 va además en `CLAUDE.md`. Pídele a Claude Code: *"Lee PLAN.md y ejecuta la Fase 0. No avances de fase sin cumplir los criterios de aceptación y sin mi aprobación."*

---

## 0. Reglas de trabajo para Claude Code (copiar a `CLAUDE.md`)

1. **Trabaja por fases** (sección 14). Al cerrar cada fase: corre tests, actualiza `docs/ESTADO.md` y detente a pedir aprobación.
2. **Nunca inventes nombres de campos, capas ni URLs de fuentes.** Todo campo de IGAC/DANE/MEN sale de la inspección real hecha en la Fase 0 (`data-catalog/`). Si algo no existe, márcalo `NO_DISPONIBLE`, no lo simules.
3. **Cero datos personales.** Si en cualquier fuente aparecen nombre de propietario, documento, teléfono o dirección personal, se descartan en la ingesta (lista negra de columnas en `etl/config/pii-blocklist.ts`) y se registra en el log. No existe ni existirá la ruta predio → persona.
4. **Toda cifra mostrada lleva procedencia:** fuente, dataset, fecha de corte y licencia. Sin procedencia no se muestra.
5. **Avalúo catastral ≠ valor comercial.** Cualquier dato económico catastral va con esa advertencia. El sistema entrega indicadores, no avalúos ni conceptos jurídicos.
6. **Cobertura honesta:** si el municipio no es jurisdicción del IGAC o no tiene datos, la UI lo dice claramente (no mapa vacío sin explicación).
7. TypeScript estricto, ESLint + Prettier, commits convencionales, migraciones versionadas, sin secretos en el repo (`.env.example`).
8. Geometría siempre vía SQL crudo/PostGIS; Prisma solo para tablas de aplicación.
9. Idioma de UI, informes y mensajes: **español (Colombia)**. Código e identificadores en inglés.
10. Ante ambigüedad de negocio: pregunta. Ante ambigüedad técnica menor: decide, documenta en `docs/DECISIONES.md` y sigue.

---

## 1. Producto

### 1.1 Propuesta de valor
"Pregúntale al territorio": cualquier persona o empresa señala un punto, predio, dirección o zona y obtiene, en segundos y en lenguaje claro, qué hay ahí, qué lo rodea, qué restricciones y oportunidades tiene, con un informe descargable y fuentes citadas.

### 1.2 Usuarios
| Segmento | Necesidad | Producto |
|---|---|---|
| Persona natural (compra lote/casa, herencia, finca) | Entender un predio antes de decidir | Informe territorial por pago único |
| Inmobiliarias, constructoras, urbanizadores, avaluadores | Buscar y filtrar predios, analizar zonas | Property Intelligence (suscripción) |
| Retail, colegios, clínicas, franquicias, logística | Dónde abrir / expandirse | Territory Intelligence (suscripción) |
| Bancos, aseguradoras, fondos | Due diligence masivo | Lotes de informes + API |
| Desarrolladores, proptech, consultoras | Datos normalizados | GeoAPI por consumo |
| Alcaldías, gestores catastrales, academia | Análisis territorial | Plan institucional |

### 1.3 Módulos funcionales
- **M1 Explorador**: mapa nacional, capas, buscador universal (dirección, municipio, código predial de 30 o 20 dígitos, coordenadas, topónimo).
- **M2 Ficha de predio**: todo lo disponible de un predio + contexto, con "ver más detalle" por sección.
- **M3 Buscador avanzado de predios**: filtros alfanuméricos + espaciales (área, zona urbana/rural, destino económico, zona homogénea, distancia a vías/colegios/hospitales, dentro de polígono).
- **M4 Analizador de zona**: el usuario dibuja polígono/radio/isócrona y recibe tablero (predios, áreas, población, equipamientos, suelos, riesgos).
- **M5 Aptitud de terreno**: cruce predio × suelo × vocación × pendiente × amenazas × áreas protegidas → semáforo explicado por uso objetivo (vivienda, bodega, agro, colegio…).
- **M6 Localización de negocio** ("¿Dónde abro mi X?"): plantillas por tipo de negocio con pesos editables → mapa de calor de oportunidad en rejilla H3. Incluye plantilla **Colegios** (población en edad escolar, oferta MEN, predios grandes, accesibilidad).
- **M7 Due diligence territorial**: informe PDF de 10 secciones (ver §11).
- **M8 Cambio territorial**: comparación entre cortes mensuales de la base catastral (predios nuevos, englobes/desenglobes, cambios de geometría, nuevas construcciones).
- **M9 Observatorio**: indicadores agregados por municipio/sector (dinámica predial, y mercado si el Observatorio Inmobiliario del IGAC expone datos utilizables — verificar en Fase 0).
- **M10 GeoAPI**: API pública con llaves, cuotas, documentación y SLA.
- **M11 Asistente**: búsqueda en lenguaje natural y botón "Explícame esto" en cada dato.
- **M12 Cuenta y negocio**: planes, pagos, créditos, equipos, historial, proyectos guardados, alertas.

---

## 2. Marco legal y de datos (restricciones de diseño)

- **Licencia CC BY-SA 4.0** de la base catastral: atribución obligatoria ("Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0") en mapa, ficha, informe y API. La cláusula *ShareAlike* puede alcanzar a bases derivadas que se redistribuyan: el negocio se monta sobre **servicio** (normalización, cruce, análisis, UX, SLA), no sobre exclusividad del dato. Mantén separados en BD y en exportaciones los datos IGAC (capa abierta) de los indicadores propios. **Pendiente: concepto de abogado antes del lanzamiento comercial.**
- **Ley 1581/2012 (habeas data)** y **Ley 1712/2014 art. 19** (predios con reserva legal excluidos): regla 3 de §0.
- **Cobertura:** la base abierta del IGAC cubre los municipios donde el IGAC es gestor catastral. Quedan por fuera catastros descentralizados y gestores habilitados (Bogotá, Medellín, Cali, Antioquia, **Barranquilla**, y un número creciente de gestores). Crear tabla `core.cadastral_manager` (municipio → gestor → fuente → estado de cobertura) y una arquitectura de **adaptadores por gestor** (Fase 7).
- **POT:** no existe repositorio nacional completo; se integra lo que haya (ColombiaOT/IGAC y portales municipales) y el resto se declara "no disponible: consulte Planeación municipal".
- Textos legales obligatorios en informes: no es certificado catastral, no es avalúo, no es concepto de norma urbanística, no reemplaza estudio de títulos.

---

## 3. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 LTS + TypeScript 5 (strict) |
| Monorepo | pnpm workspaces + Turborepo |
| API | Fastify 5, Zod (validación + tipos), `@fastify/swagger` (OpenAPI 3.1), `@fastify/rate-limit`, `@fastify/jwt` |
| BD | PostgreSQL 16 + PostGIS 3.4, extensiones `pg_trgm`, `unaccent`, `h3` + `h3_postgis`, `pgrouting` (opcional) |
| ORM | Prisma (esquema `app`), `pg`/Kysely con SQL crudo para geo |
| Colas | BullMQ + Redis 7 |
| ETL | Workers Node + GDAL/`ogr2ogr` (CLI), `osm2pgsql`, `tippecanoe` |
| Teselas | **Martin** (vector tiles desde PostGIS y PMTiles) detrás de caché; alternativa: endpoint propio con `ST_AsMVT` |
| Frontend | Vue 3 + Vite + TypeScript + Tailwind, Pinia, Vue Router, **MapLibre GL JS**, `terra-draw` (dibujo), Turf.js, Apache ECharts, TanStack Query (vue) |
| Informes | Playwright (HTML→PDF), ExcelJS (XLSX), `ogr2ogr` (GPKG/SHP/KML), GeoJSON/CSV nativos |
| Almacenamiento | S3 compatible (AWS S3 / MinIO en local) |
| Auth | Email+contraseña (argon2), OAuth Google, JWT corto + refresh rotativo, API keys con hash |
| Pagos | Interfaz `PaymentProvider` (puertos y adaptadores): Wompi primero; Mercado Pago, PayU, ePayco como adaptadores |
| IA | API de Anthropic, modelo por variable de entorno; solo *tool use* con esquemas JSON, nunca SQL libre |
| Observabilidad | Pino, OpenTelemetry, Prometheus + Grafana, Sentry |
| Infra | Docker Compose (dev), CapRover sobre AWS EC2 (prod), RDS PostgreSQL con PostGIS, GitHub Actions |
| Tests | Vitest, Supertest, Playwright e2e, pruebas SQL con datos semilla de 1 municipio |

Mapa base: teselas vectoriales OSM propias (Protomaps/PMTiles) + ortoimágenes/WMS del IGAC si están disponibles. **No usar teselas de Google.**

---

## 4. Estructura del repositorio

```
terracolombia/
├─ apps/
│  ├─ api/            # Fastify: REST interno + GeoAPI pública
│  ├─ web/            # Vue 3 SPA
│  ├─ worker/         # BullMQ: ETL, informes, análisis pesados, alertas
│  └─ docs-site/      # Documentación pública de la API (VitePress)
├─ packages/
│  ├─ db/             # Prisma (app) + migraciones SQL (raw/core/ctx/analytics)
│  ├─ geo/            # Utilidades: CRS, código predial, H3, validación geometrías
│  ├─ sources/        # Conectores: arcgis-rest, socrata, wfs, file-download, osm
│  ├─ scoring/        # Motor de indicadores y plantillas de negocio
│  ├─ reports/        # Plantillas HTML de informes + generadores
│  ├─ payments/       # PaymentProvider + adaptadores
│  ├─ ai/             # Asistente: herramientas, prompts, guardas
│  └─ shared/         # Tipos Zod, constantes, i18n es-CO, glosario
├─ data-catalog/      # Salida de Fase 0 (JSON + Markdown por servicio)
├─ etl/config/        # Definición declarativa de datasets, pii-blocklist
├─ infra/             # docker-compose, captain-definition, martin.yaml, grafana
└─ docs/              # ESTADO.md, DECISIONES.md, ARQUITECTURA.md, LEGAL.md
```

---

## 5. Fuentes de datos

Todas se **verifican en Fase 0**; registrar URL exacta, formato, campos, CRS, frecuencia, licencia y límites.

### 5.1 IGAC (núcleo)
| Fuente | Acceso conocido | Uso |
|---|---|---|
| Base Catastral Pública (mensual, por depto.) | Descarga GDB / GeoPackage / SHP + Registros 1 y 2 en texto; también servicio WFS publicado en datos.gov.co; portal `datos-abiertos-igac-igac-oit.hub.arcgis.com` | Carga masiva a PostGIS (fuente primaria) |
| Capas: `U_TERRENO`, `U_CONSTRUCCION`, `U_MANZANA`, `U_SECTOR`, `U_BARRIO`, `U_PERIMETRO`, `U_NOMENCLATURA_VIAL`, `U_NOMENCLATURA_DOMICILIARIA`, `R_TERRENO`, `R_CONSTRUCCION`, `R_SECTOR`, `R_VEREDA`, `R_NOMENCLATURA_*` | Dentro de la GDB/GPKG | Modelo `core` |
| ArcGIS REST `https://mapas.igac.gov.co/server/rest/services` (carpetas: `catastro`, `agrologia`, `ambiente`, `carto`, `limites`, `ordenamientoterritorial`, `relieve`, `nombresgeograficos`, `poblacion`, `infraestructura`, …) | MapServer / FeatureServer / GPServer | Descubrimiento, capas temáticas, consultas puntuales |
| `Dato_Fundamental_Catastro/MapServer` | Capas R/U terreno y construcción, EPSG:4686, `maxRecordCount` 2000, sin estadísticas ni consultas avanzadas | Respaldo/validación; **no** como backend en vivo |
| Agrología: suelos, capacidad de uso, vocación, conflictos de uso, oferta ambiental | REST + descargas | M5 |
| Cartografía básica, límites oficiales, nombres geográficos | REST + descargas | Base, geocodificación |
| Zonas homogéneas físicas y geoeconómicas | Verificar disponibilidad abierta por municipio | M3, M9 |
| Observatorio Inmobiliario | Verificar qué expone y con qué licencia | M9 |
| Históricos mensuales de la base catastral | Portal de datos abiertos | M8 |

**Decisión de arquitectura:** los servicios REST del IGAC tienen paginación corta y no garantizan disponibilidad; el producto **ingiere a PostGIS propio** por descargas masivas mensuales y usa REST solo para descubrir, completar capas pequeñas y validar. Nunca depender de IGAC en vivo para servir al usuario.

### 5.2 Contexto
| Fuente | Dato | Vía |
|---|---|---|
| DANE – MGN y CNPV 2018 | Manzanas/secciones censales, población, hogares, viviendas, edades; DIVIPOLA; proyecciones municipales | Geoportal DANE (descarga) |
| MEN | Establecimientos y sedes educativas, matrícula | datos.gov.co (Socrata API) |
| MinSalud – REPS | IPS y sedes | datos.gov.co / REPS |
| SECOP II | Contratación pública por municipio | datos.gov.co (Socrata) |
| OpenStreetMap | Vías, POIs, edificios | Extracto Colombia (Geofabrik) + `osm2pgsql` |
| SGC | Amenaza por movimientos en masa, sísmica | Servicios SGC |
| IDEAM | Zonas inundables, clima | Servicios IDEAM |
| PNN – RUNAP | Áreas protegidas | Servicios RUNAP |
| ANT / MinInterior | Resguardos y consejos comunitarios | Datos abiertos |
| UPRA | Frontera agrícola, aptitudes | SIPRA |
| ANM / ANH | Títulos mineros, bloques | Verificar apertura |
| DEM Copernicus 30 m | Pendiente, altitud | Descarga → raster PostGIS o COG en S3 |
| ColombiaOT / municipios | POT (clasificación del suelo, usos) donde exista | Por adaptador |

Cada dataset se declara en `etl/config/datasets/*.ts` con: `id, fuente, url, conector, formato, crs, frecuencia, licencia, atribución, mapeoCampos, piiBlocklist, tablaDestino, validaciones`.

---

## 6. Fase 0 — Descubrimiento (primer entregable de Claude Code)

Construir `packages/sources/arcgis-crawler` y un CLI `pnpm catalog:crawl`:
1. Recorre recursivamente `…/rest/services?f=json`: carpetas → servicios → capas/tablas.
2. Por capa guarda: nombre, tipo de geometría, campos (nombre, alias, tipo, dominio), CRS, `maxRecordCount`, capacidades, formatos, `count` (si lo permite), extensión, una muestra de 5 registros **sin columnas de la blocklist**.
3. Respeta al servidor: concurrencia 2, *backoff* exponencial, caché en disco, `User-Agent` identificable.
4. Igual para: portal ArcGIS Hub del IGAC, datasets IGAC en datos.gov.co, MEN, REPS, SECOP, y listado de descargas del geoportal DANE.
5. Salida: `data-catalog/<fuente>/<servicio>.json` + `data-catalog/CATALOGO.md` (tabla legible) + `data-catalog/SELECCION.md` proponiendo los **15–25 datasets** del MVP con justificación, y una matriz *módulo × dataset × campos*.
6. Descargar la base catastral de **un departamento piloto** (proponer uno mediano bajo jurisdicción IGAC, p. ej. Atlántico sin Barranquilla, Boyacá o Tolima) e inspeccionar estructura real de la GDB/GPKG y de los Registros 1 y 2; documentar el diccionario en `docs/DICCIONARIO_CATASTRAL.md`.

**Aceptación:** catálogo completo, selección propuesta, diccionario del piloto, lista de riesgos de datos encontrados. **Detenerse y pedir aprobación.**

---

## 7. Modelo de datos (PostgreSQL + PostGIS)

Esquemas: `raw` (tal cual llega, por corte), `core` (catastro normalizado), `ctx` (contexto), `analytics` (agregados/H3), `app` (Prisma: usuarios, pagos, informes), `meta` (catálogo, linaje).

Convenciones: geometrías almacenadas en **EPSG:4686→4326** para servir; áreas y distancias calculadas en **EPSG:9377 (MAGNA-SIRGAS Origen Nacional)** — verificar que exista en `spatial_ref_sys`, si no insertarlo. `ST_MakeValid` en ingesta; índice GiST en toda geometría; `ST_Subdivide` para polígonos grandes (límites, suelos).

```sql
-- meta
meta.dataset(id, source, name, license, attribution, url, frequency)
meta.snapshot(id, dataset_id, cut_date, loaded_at, row_count, checksum, status)

-- core (particionar parcel por departamento)
core.department(code PK, name, geom)
core.municipality(code PK, dept_code, name, geom, centroid)
core.cadastral_manager(muni_code PK, manager_name, is_igac, source_id, coverage_status, notes)
core.parcel(
  id BIGSERIAL, npn CHAR(30), npn_old VARCHAR(20), muni_code, zone CHAR(2) /*urbano/rural*/,
  sector, comuna, barrio, manzana_vereda, terreno, condicion, edificio, piso, unidad, -- derivados del NPN
  area_geom_m2 NUMERIC, area_reported_m2 NUMERIC, built_area_m2 NUMERIC,
  economic_use TEXT, address TEXT, cadastral_value NUMERIC NULL, valuation_year INT NULL,
  attrs JSONB,            -- resto de campos abiertos de R1/R2 tal cual
  geom geometry(MultiPolygon,4326), centroid geometry(Point,4326), h3_r9 h3index,
  snapshot_id, valid_from DATE, valid_to DATE NULL)
core.building(id, parcel_npn, floors, built_area_m2, use, attrs JSONB, geom, snapshot_id)
core.block / core.sector / core.neighborhood / core.vereda / core.urban_perimeter
core.street_name(geom, name) ; core.address_point(geom, label, parcel_npn)
core.homogeneous_zone(kind /*fisica|geoeconomica*/, code, attrs, geom)
core.parcel_change(npn, from_snapshot, to_snapshot, change_type, detail JSONB, geom_diff)

-- ctx
ctx.census_block(code, muni_code, pop_total, households, dwellings, age_bands JSONB, geom)
ctx.school(id, dane_code, name, sector, levels, enrollment, geom)
ctx.health_facility(id, reps_code, name, level, services, geom)
ctx.poi(osm_id, category, subcategory, name, geom)
ctx.road(osm_id, class, name, geom)
ctx.soil_unit / ctx.land_capability / ctx.land_vocation / ctx.land_use_conflict
ctx.hazard(kind, level, source, geom) ; ctx.protected_area ; ctx.ethnic_territory
ctx.pot_zone(muni_code, classification, use, source_doc, geom)
ctx.public_contract(id, muni_code, entity, object, value, date, geom NULL)
ctx.elevation (raster o tabla por H3: altitud, pendiente media)

-- analytics
analytics.h3_cell(h3 h3index PK, res, muni_code, n_parcels, area_stats JSONB, pop, pop_school_age,
                  n_schools, n_health, poi_counts JSONB, road_access_score, slope_mean, hazard_flags JSONB)
analytics.muni_indicator(muni_code, indicator, period, value)

-- app (Prisma)
user, organization, membership, api_key, plan, subscription, credit_ledger, payment,
project, saved_area, saved_search, report, report_section, alert, usage_event, audit_log
```

El NPN de 30 dígitos se descompone así: depto(2) municipio(3) zona(2) sector(2) comuna(2) barrio(2) manzana/vereda(4) terreno(4) condición(1) edificio(2) piso(2) unidad(4). Implementar `packages/geo/npn.ts` con *parse*, validación y formateo; aceptar también el código de 20 dígitos.

Búsqueda: `pg_trgm` + `unaccent` sobre municipios, barrios, veredas, topónimos y direcciones; normalizador de nomenclatura colombiana (`Cra/Kr/Carrera`, `Cl/Calle`, `#`, `-`, `Bis`, `Sur`).

---

## 8. ETL

Pipeline por dataset (BullMQ, idempotente, reanudable):
`discover → download (S3 raw, checksum) → stage (ogr2ogr a raw.*) → validate → transform (SQL a core/ctx) → index → aggregate (H3, indicadores) → tiles (tippecanoe→PMTiles o invalidar caché Martin) → publish (marca snapshot activo) → diff (M8)`.

- Carga catastral: `ogr2ogr -f PostgreSQL … -nlt PROMOTE_TO_MULTI -lco GEOMETRY_NAME=geom -t_srs EPSG:4326 -makevalid`; unir geometría con R1/R2 por código predial; reportar huérfanos (geometría sin registro y viceversa).
- Validaciones: conteos vs. corte anterior (alerta si varía >10 %), geometrías inválidas, NPN mal formados, duplicados, áreas cero, PII detectada.
- Publicación atómica: cargar en tablas sombra y cambiar con `snapshot_id` activo; el usuario nunca ve una carga a medias.
- Cron mensual de catastro; trimestral/anual para el resto; panel admin con estado de cada corrida y linaje.
- `diff` entre cortes: por NPN (alta/baja/cambio de atributos) y por geometría (`ST_Equals`/IoU < 0,98 → cambio geométrico); construcciones nuevas por comparación de `core.building`.

---

## 9. API (Fastify)

Base interna `/api/v1` (sesión) y pública `/geo/v1` (API key). Respuestas JSON/GeoJSON con bloque `meta: {sources[], cut_date, license, coverage}`. Paginación por cursor, `bbox`, `limit` máx. por plan, ETag, caché Redis, *rate limit* por plan.

```
GET  /search?q=                       # universal: dirección, NPN, municipio, topónimo, lat,lng
GET  /municipalities/:code            # ficha + cobertura + gestor catastral
GET  /parcels/:npn                    # ficha completa
GET  /parcels/:npn/context?radius=    # equipamientos, vías, población, suelos, amenazas
GET  /parcels/:npn/history            # cambios entre cortes
POST /parcels/query                   # filtros alfanuméricos + espaciales (JSON DSL validado con Zod)
GET  /nearby?lat&lng&radius&layers=
POST /areas/analyze                   # polígono|radio|isócrona → tablero completo (async si es grande)
POST /suitability                     # predio/área + uso objetivo → semáforo + factores
POST /location-intel                  # plantilla + pesos + ámbito → celdas H3 puntuadas
GET  /location-intel/templates
POST /changes/compare                 # área + corte A + corte B
GET  /indicators/:muniCode
POST /reports        GET /reports/:id   GET /reports/:id/download?format=pdf|xlsx|geojson|gpkg|kml|csv
POST /ai/ask         POST /ai/explain
GET  /layers                          # catálogo de capas, leyendas, glosario
GET  /tiles/{layer}/{z}/{x}/{y}       # proxy con control de plan → Martin
/auth/*  /me  /projects/*  /billing/*  /api-keys/*  /admin/*
```

DSL de `/parcels/query` (ejemplo):
```json
{ "scope": {"municipality":"08573"},
  "where": {"zone":"urbano","area_m2":{"gte":1000},"economic_use":["lote"]},
  "near": [{"layer":"road","class":["primary","trunk"],"max_m":300},
           {"layer":"school","max_m":800}],
  "within": {"type":"Polygon","coordinates":[]},
  "sort":"area_m2:desc", "limit":100 }
```
El DSL se traduce a SQL parametrizado con constructores seguros (nunca concatenación). Límite de tiempo por consulta (`statement_timeout`) y de área analizable por plan. Análisis pesados → cola + progreso por SSE/WebSocket.

**Motor de puntuación (`packages/scoring`):** indicadores normalizados 0–100 por celda H3 (res. 8–9) con fórmula, fuente y dirección (más es mejor/peor) declaradas; las plantillas combinan indicadores con pesos editables. La respuesta siempre incluye el desglose por factor (explicabilidad), nunca solo el puntaje. No dice "elige A": muestra indicadores y deja al usuario fijar criterios.

---

## 10. Frontend (Vue 3 + MapLibre)

### 10.1 Principios UX
- **Una caja de búsqueda y un mapa**: la home es el producto. Tres accesos grandes: *Consultar un predio*, *Analizar una zona*, *¿Dónde abro mi negocio?*
- **Divulgación progresiva**: tarjeta resumen → secciones plegables → "Ver detalle completo" → datos crudos + fuente. Nunca abrumar de entrada.
- **Todo se explica**: cada término técnico (zona homogénea, vocación, NPN, destino económico) tiene *tooltip* y entrada de glosario; cada indicador tiene "¿Cómo se calcula?" y "Explícame esto" (IA).
- **Semáforos con texto**, nunca solo color; accesibilidad WCAG AA; *mobile-first* (panel inferior deslizable sobre el mapa).
- **Estados vacíos honestos**: "Este municipio lo gestiona otro gestor catastral; aún no tenemos sus predios. Sí tenemos: población, colegios, suelos…".
- Asistentes paso a paso para M5, M6 y M7; *onboarding* interactivo de 60 s; ejemplos precargados.
- Todo resultado tiene barra fija: **Guardar · Comparar · Exportar · Compartir enlace**.

### 10.2 Pantallas
1. Home/Explorador (mapa, buscador, selector de capas con leyenda y opacidad, selector de corte temporal).
2. Ficha de predio (resumen, catastro, construcciones, entorno con distancias, suelo y aptitud, amenazas y restricciones, ordenamiento, población alrededor, historial, fuentes).
3. Buscador avanzado (constructor visual de filtros + lista/mapa sincronizados + tabla exportable).
4. Analizador de zona (herramientas de dibujo, tablero con ECharts, comparación de hasta 4 zonas lado a lado).
5. Aptitud de terreno (asistente + semáforo por factor).
6. Localización de negocio (elige plantilla → ajusta pesos con *sliders* y ve el mapa de calor recalcularse → top zonas → predios candidatos dentro de cada zona).
7. Cambio territorial (deslizador antes/después, lista de cambios).
8. Observatorio municipal (indicadores, *rankings*, series).
9. Mis proyectos / informes / alertas.
10. Planes y pagos; panel de equipo; llaves de API y consumo.
11. Portal de desarrolladores (docs OpenAPI, *playground*, ejemplos).
12. Admin (ETL, cobertura, usuarios, métricas de negocio).

### 10.3 Técnica
Teselas vectoriales para predios (zoom ≥ 14) y agregados H3 para zooms bajos; *feature-state* para *hover*/selección; consultas por `bbox` con *debounce*; estado en URL (toda vista es compartible); TanStack Query para caché; *lazy-load* de módulos; i18n preparado (es-CO por defecto).

---

## 11. Informes y exportación

Generador en `packages/reports`: plantillas HTML (mismos componentes visuales que la web) → Playwright → PDF A4 con marca, portada, índice, mapas estáticos (MapLibre en *headless*), gráficos, tablas, QR de verificación y anexos.

**Informe Territorial de Predio (M7):** 1 Localización · 2 Identificación y características catastrales · 3 Construcciones · 4 Contexto geográfico (vías, hidrografía, relieve, pendiente) · 5 Suelos, capacidad y vocación · 6 Amenazas y restricciones (áreas protegidas, territorios étnicos, rondas, títulos mineros si aplica) · 7 Ordenamiento (si disponible) · 8 Entorno: población, educación, salud, comercio, accesibilidad · 9 Análisis y semáforos explicados · 10 Fuentes, fechas de corte, licencias y advertencias legales.

Otros: Informe de Zona, Informe de Localización de Negocio, Informe de Cambio Territorial, Informe Municipal. Niveles: **Resumen** (2 pág.), **Completo**, **Técnico** (con anexos de datos). Marca blanca para planes Business+.

Formatos: PDF, XLSX (una hoja por sección + hoja de fuentes), CSV, GeoJSON, GeoPackage, Shapefile, KML. Toda exportación incluye archivo/hoja `FUENTES_Y_LICENCIA`. Los informes son inmutables (guardan `snapshot_id` de cada dataset) y verificables por QR.

---

## 12. Monetización (implementar en `app` + `packages/payments`)

| Plan | Para quién | Incluye | Precio guía (hipótesis a validar) |
|---|---|---|---|
| Gratis | Curiosos, captación | Mapa, ficha básica, 3 consultas detalladas/mes, sin exportar | $0 |
| Pago por informe | Persona natural | 1 Informe Territorial completo (PDF) | COP 25.000–60.000 |
| Pro | Independientes, avaluadores, arquitectos | Búsqueda avanzada, análisis de zona, 20 informes/mes, exportación | COP 150.000–250.000/mes |
| Business | Inmobiliarias, constructoras, retail | 5 usuarios, localización de negocio, cambio territorial, marca blanca, alertas, lotes | COP 900.000–2.000.000/mes |
| API | Desarrolladores | Por consumo con escalones; *sandbox* gratis | Desde COP 200.000/mes + excedente |
| Enterprise / Institucional | Bancos, aseguradoras, entidades | SLA, SSO, despliegue dedicado, integraciones, estudios a medida | Cotización |

Mecánica: suscripciones + **créditos** (`credit_ledger`) que cada operación costosa descuenta (informe, análisis de zona grande, exportación masiva, llamadas API). *Feature flags* por plan (`plan.entitlements JSONB`). Pagos con Wompi (tarjeta, PSE, Nequi) primero; *webhooks* idempotentes; facturación electrónica vía proveedor externo (dejar puerto `InvoiceProvider`). Métricas: activación, conversión a pago, informes/usuario, MRR, *churn*, costo por informe.

---

## 13. Calidad, seguridad y operación

- OWASP ASVS nivel 2; consultas parametrizadas; validación Zod en todo borde; CORS estricto; CSP; *rate limiting*; protección anti-*scraping* (cuotas de teselas y de área por plan, marcas de agua en mapas del plan gratis).
- IA: el asistente solo llama herramientas tipadas (`search_places`, `query_parcels`, `analyze_area`, `explain_indicator`); se le pasa contexto con datos ya calculados; prohibido inventar cifras — si la herramienta no devuelve el dato, responde "no disponible". Registro de *prompts* sin PII.
- Rendimiento objetivo: ficha de predio < 800 ms p95; tesela < 200 ms p95 con caché; análisis de zona ≤ 5 km² < 5 s; informe PDF < 60 s.
- Particionado de `core.parcel` por departamento; `CLUSTER`/BRIN donde aplique; vistas materializadas para agregados; *pgbouncer*.
- *Backups* diarios RDS + S3 versionado; entornos dev/staging/prod; migraciones con *rollback*; *seed* reproducible del municipio piloto para tests y demos.
- CI: lint, typecheck, unit, integración con PostGIS en contenedor, e2e Playwright, build de imágenes, despliegue a CapRover por rama.

---

## 14. Fases y criterios de aceptación

| Fase | Entregable | Aceptación |
|---|---|---|
| **0 Descubrimiento** | Crawler, catálogo, selección de datasets, diccionario del piloto | §6 |
| **1 Cimientos** | Monorepo, Docker Compose (Postgres/PostGIS/H3, Redis, MinIO, Martin), Prisma `app`, auth, CI | `pnpm dev` levanta todo; registro/login funcionan; tests verdes |
| **2 ETL catastro piloto** | Pipeline completo para 1 departamento + límites + DIVIPOLA | Predios consultables por NPN; validaciones e informe de carga; 0 PII |
| **3 Explorador + Ficha** | Mapa con teselas, buscador universal, ficha de predio con divulgación progresiva y procedencia | Un usuario no técnico encuentra un predio y entiende su ficha sin ayuda (prueba con 3 personas) |
| **4 Contexto** | DANE, MEN, REPS, OSM, suelos, amenazas, áreas protegidas, DEM; agregados H3 | Ficha muestra entorno completo; `/nearby` y `/areas/analyze` operativos |
| **5 Buscador avanzado + Analizador de zona + Exportación** | M3, M4, exportes en todos los formatos | Consulta del ejemplo del DSL < 3 s en el piloto; XLSX/GPKG válidos |
| **6 Informes + Pagos** | M7 PDF, planes, créditos, Wompi, pago por informe | Compra real en *sandbox* de punta a punta; PDF con fuentes y QR |
| **7 Escala nacional + gestores** | Todos los departamentos IGAC; tabla de cobertura; primeros adaptadores (Bogotá, Barranquilla, Medellín, Cali si tienen datos abiertos) | Carga mensual automática; UI de cobertura honesta |
| **8 Inteligencia** | M5 aptitud, M6 localización (plantillas: colegio, retail, salud, bodega, vivienda), M11 asistente | Desglose explicable por factor; pesos editables en vivo |
| **9 Cambio territorial + Observatorio + Alertas** | M8, M9 | Comparación entre 2 cortes reales con lista de cambios verificable |
| **10 GeoAPI pública** | API keys, cuotas, portal de desarrolladores, SDK JS | *Quickstart* funciona en < 5 min |
| **11 Endurecimiento y lanzamiento** | Rendimiento, seguridad, legal, analítica, *landing*, *onboarding* | Pruebas de carga, revisión legal incorporada, *checklist* de lanzamiento |

**MVP vendible = Fases 0–6** (un departamento o región, persona natural + Pro).

---

## 15. Primer mensaje sugerido para Claude Code

> Lee `PLAN.md` completo. Crea `CLAUDE.md` con la sección 0. Inicializa el monorepo mínimo necesario para la Fase 0 y constrúyela: crawler de ArcGIS REST del IGAC y de las demás fuentes, catálogo en `data-catalog/`, propuesta de selección de datasets y diccionario catastral del departamento piloto. No inventes campos: todo sale de la inspección real. Al terminar, resume hallazgos, riesgos y decisiones que necesitas de mí, y detente.
