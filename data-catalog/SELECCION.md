# Selección de datasets para el MVP — Fase 0

> Propuesta de los datasets que entran al MVP (Fases 0–6), con justificación y matriz módulo × dataset × campos. Requiere aprobación antes de pasar a la Fase 1.
> Generado el 2026-09-21 16:04:01 UTC por `pnpm catalog:report`.
> Esquema de catálogo v1.

## Resumen

| Concepto | Valor |
|---|---|
| **Datasets del MVP (prioridad 1–2)** | **24** |
| Declarados para fases posteriores (prioridad 3) | 8 |
| Total declarado | 32 |
| Con campos inspeccionados (mapeo real) | 24 |
| Sin inspeccionar (`fieldMapping: NO_INSPECCIONADO`) | 8 |
| Prioridad 1 (imprescindibles) | 13 |
| Fuentes distintas | 9 |

> **La propuesta del MVP son los 24 datasets de prioridad 1 y 2** (PLAN.md §6.5 pide entre 15 y 25). Los 8 de prioridad 3 quedan declarados, con su evidencia, para las fases posteriores: están aquí para no perder el trabajo de descubrimiento, no como compromiso del MVP.

> Regla 2 de CLAUDE.md: los datasets marcados `NO_INSPECCIONADO` **no tienen mapeo de campos declarado**. Sus campos se definirán cuando se inspeccione el archivo real; hasta entonces ninguna consulta del producto puede depender de ellos.

## Datasets propuestos

| # | Id | Fuente | Nombre | Conector | Formato | CRS | Frecuencia | Tabla destino | Módulos | Fase | Prio | Inspección |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `dane-divipola-departamentos` | DANE | DIVIPOLA — códigos de departamento | socrata | json | 4326 | anual | `core.department` | M1 M3 M9 M10 | 2 | 1 | ✔ campos reales |
| 2 | `dane-mgn-limites` | DANE | Marco Geoestadístico Nacional — departamentos y munici… | file-download | zip | 4686 | anual | `core.department / core.municipality` | M1 M2 M3 M4 M9 M10 | 2 | 1 | ~ URL verificada |
| 3 | `dane-mgn-manzanas-censales` | DANE | Marco Geoestadístico Nacional — sectores, secciones y … | file-download | zip | 4686 | decenal | `ctx.census_block` | M2 M4 M6 M7 M9 | 4 | 1 | ~ URL verificada |
| 4 | `igac-areas-homogeneas-tierra` | IGAC | Áreas homogéneas de tierra (por municipio) | arcgis-rest | geojson | 9377 | eventual | `ctx.land_capability` | M5 M7 | 4 | 1 | ✔ campos reales |
| 5 | `igac-capacidad-uso-tierras` | IGAC | Capacidad de uso de las tierras (estudios regionales) | arcgis-rest | geojson | 9377 | eventual | `ctx.land_capability` | M5 M7 | 4 | 1 | ✔ campos reales |
| 6 | `igac-gdb-r-terreno` | IGAC | Base Catastral Pública — R_TERRENO (terrenos rurales) | file-download | gdb | 9377 | mensual | `core.parcel` | M1 M2 M3 M4 M5 M7 M8 | 2 | 1 | ✔ campos reales |
| 7 | `igac-gdb-u-construccion` | IGAC | Base Catastral Pública — U_CONSTRUCCION (construccione… | file-download | gdb | 9377 | mensual | `core.building` | M2 M4 M7 M8 | 2 | 1 | ✔ campos reales |
| 8 | `igac-gdb-u-terreno` | IGAC | Base Catastral Pública — U_TERRENO (terrenos urbanos) | file-download | gdb | 9377 | mensual | `core.parcel` | M1 M2 M3 M4 M7 M8 | 2 | 1 | ✔ campos reales |
| 9 | `igac-gestores-catastrales` | IGAC | Gestores Catastrales de Colombia | socrata | json | 4326 | eventual | `core.cadastral_manager` | M1 M2 M9 M12 | 2 | 1 | ✔ campos reales |
| 10 | `men-establecimientos-educativos` | MEN | Establecimientos educativos de preescolar, básica y me… | socrata | json | — | anual | `ctx.school` | M2 M4 M6 M7 M9 | 4 | 1 | ✔ campos reales |
| 11 | `men-sedes-educativas` | MEN | Sedes educativas de preescolar, básica y media | socrata | json | 4326 | anual | `ctx.school` | M2 M4 M6 M7 | 4 | 1 | ✔ campos reales |
| 12 | `osm-vias-colombia` | OpenStreetMap | Red vial de Colombia (extracto Geofabrik) | osm | pbf | 4326 | diaria | `ctx.road` | M1 M2 M4 M5 M6 M7 | 4 | 1 | ~ URL verificada |
| 13 | `reps-prestadores-sedes` | MinSalud | Registro Especial de Prestadores y Sedes de Servicios … | socrata | json | — | mensual | `ctx.health_facility` | M2 M4 M6 M7 | 4 | 1 | ✔ campos reales |
| 14 | `dane-divipola-centros-poblados` | DANE | DIVIPOLA — códigos de cabeceras y centros poblados | socrata | json | 4326 | anual | `core.populated_center` | M1 M2 M4 | 2 | 2 | ✔ campos reales |
| 15 | `igac-actividad-quimica-suelos` | IGAC | Actividad química de los suelos (nacional) | arcgis-rest | geojson | 9377 | eventual | `ctx.soil_unit` | M5 M7 | 4 | 2 | ✔ campos reales |
| 16 | `igac-gdb-r-construccion` | IGAC | Base Catastral Pública — R_CONSTRUCCION (construccione… | file-download | gdb | 9377 | mensual | `core.building` | M2 M4 M5 M7 M8 | 2 | 2 | ✔ campos reales |
| 17 | `igac-gdb-r-vereda` | IGAC | Base Catastral Pública — R_VEREDA y R_SECTOR (jerarquí… | file-download | gdb | 9377 | mensual | `core.vereda / core.sector` | M1 M2 M4 M5 | 2 | 2 | ✔ campos reales |
| 18 | `igac-gdb-u-manzana` | IGAC | Base Catastral Pública — U_MANZANA, U_BARRIO y U_SECTO… | file-download | gdb | 9377 | mensual | `core.block / core.neighborhood / core.sector` | M1 M3 M4 M9 | 2 | 2 | ✔ campos reales |
| 19 | `igac-gdb-u-perimetro` | IGAC | Base Catastral Pública — U_PERIMETRO (perímetros urban… | file-download | gdb | 9377 | mensual | `core.urban_perimeter` | M1 M2 M4 M5 | 2 | 2 | ✔ campos reales |
| 20 | `igac-transacciones-inmobiliarias` | IGAC | Registro de transacciones inmobiliarias en Colombia | socrata | json | — | anual | `analytics.real_estate_transaction` | M9 M8 | 4 | 2 | ✔ campos reales |
| 21 | `igac-transporte-100k` | IGAC | Datos Fundamentales de Transporte 1:100 000 | arcgis-rest | geojson | 9377 | eventual | `ctx.road` | M2 M4 M5 M7 | 4 | 2 | ✔ campos reales |
| 22 | `osm-poi-colombia` | OpenStreetMap | Puntos de interés y edificios de Colombia (extracto Ge… | osm | pbf | 4326 | diaria | `ctx.poi` | M2 M4 M6 M7 | 4 | 2 | ~ URL verificada |
| 23 | `runap-areas-protegidas` | PNN — RUNAP | Registro Único Nacional de Áreas Protegidas | manual | geojson | — | eventual | `ctx.protected_area` | M5 M7 | 4 | 2 | ✗ sin inspeccionar |
| 24 | `sgc-ideam-amenazas` | SGC / IDEAM | Amenaza por movimientos en masa, sísmica e inundación | manual | geojson | — | eventual | `ctx.hazard` | M5 M7 | 4 | 2 | ✗ sin inspeccionar |
| 25 | `agrosavia-analisis-suelos` | AGROSAVIA | Resultados de análisis de laboratorio de suelos en Col… | socrata | json | — | anual | `ctx.soil_lab_result` | M5 | 8 | 3 | ✔ campos reales |
| 26 | `dane-proyecciones-poblacion` | DANE | Proyecciones de población por municipio | socrata | json | — | anual | `analytics.muni_indicator` | M9 M6 | 9 | 3 | ✗ sin inspeccionar |
| 27 | `igac-areas-potenciales-irrigacion` | IGAC | Áreas potenciales para adecuación de tierras con fines… | socrata | json | — | eventual | `ctx.land_vocation` | M5 | 8 | 3 | ~ URL verificada |
| 28 | `igac-cuerpos-agua-500k` | IGAC | Datos Fundamentales de Cuerpos de Agua 1:500 000 | arcgis-rest | geojson | 9377 | eventual | `ctx.water_body` | M2 M5 M7 | 4 | 3 | ✔ campos reales |
| 29 | `igac-curvas-nivel-500k` | IGAC | Datos Fundamentales de Curvas de Nivel 1:500 000 | arcgis-rest | geojson | 9377 | eventual | `ctx.contour` | M2 M7 | 4 | 3 | ✔ campos reales |
| 30 | `igac-gdb-nomenclatura` | IGAC | Base Catastral Pública — U_/R_NOMENCLATURA_DOMICILIARI… | file-download | gdb | 9377 | mensual | `core.address_point / core.street_name` | M1 M2 | 3 | 3 | ✔ campos reales |
| 31 | `igac-u-terreno-rest` | IGAC | Dato Fundamental Catastro (REST) — U_TERRENO, validaci… | arcgis-rest | geojson | 4686 | desconocida | `raw.igac_rest_u_terreno` | M1 M9 | 2 | 3 | ✔ campos reales |
| 32 | `secop-ubicaciones-contratos` | Colombia Compra Eficiente | SECOP II — ubicaciones de ejecución de contratos | socrata | json | — | diaria | `ctx.public_contract` | M9 | 9 | 3 | ✔ campos reales |

## Justificación por dataset

### `dane-divipola-departamentos` — DIVIPOLA — códigos de departamento

La DIVIPOLA es el código con el que se cruza absolutamente todo lo demás (catastro, MEN, REPS, SECOP, proyecciones). 33 filas, licencia CC BY-SA 4.0, corte 2025-01. Es el dataset más pequeño y más imprescindible del catálogo.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/vcjz-niiq.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: DANE, DIVIPOLA, corte 2025-01, CC BY-SA 4.0 |
| Tabla destino | `core.department` |
| Evidencia | `data-catalog/dane/socrata__vcjz-niiq.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/vcjz-niiq.json (4 columnas, 33 filas) |
| Campos de origen declarados | `codigo_departamento`, `nombre_departamento`, `longitud`, `latitud` |

- Solo trae el centroide, no el polígono: la geometría departamental viene del MGN (`dane-mgn-limites`) o del IGAC.
- Coma decimal en las coordenadas: error clásico de ingesta, declarado en el transform.

### `dane-mgn-limites` — Marco Geoestadístico Nacional — departamentos y municipios

Los límites oficiales y la DIVIPOLA son el esqueleto del producto: sin ellos no hay buscador de municipios, ni particionado de `core.parcel` por departamento, ni tabla de cobertura por gestor catastral. El IGAC publica límites, pero la DIVIPOLA —el código con el que se cruza TODO lo demás (MEN, REPS, SECOP, proyecciones)— es del DANE.

| Campo | Valor |
|---|---|
| URL | <https://geoportal.dane.gov.co/> |
| Licencia | NO_VERIFICADO — el geoportal no declara licencia en la página de entrada. Pendiente de confirmar antes de publicar dato derivado. |
| Atribución | Fuente: DANE, Marco Geoestadístico Nacional |
| Tabla destino | `core.department / core.municipality` |
| Evidencia | `data-catalog/dane/manual__dane-geoportal.json` |
| Inspeccionado desde | https://geoportal.dane.gov.co/ |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. El geoportal responde 200 pero no publica un índice de descargas recorrible: hay que bajar el ZIP a mano y fijar aquí la URL y los campos reales.
- DECISIÓN PENDIENTE: confirmar la licencia del MGN. Sin licencia clara no se puede redistribuir el dato derivado.

### `dane-mgn-manzanas-censales` — Marco Geoestadístico Nacional — sectores, secciones y manzanas censales con CNPV 2018

Es la única fuente abierta de población georreferenciada a escala de manzana en Colombia. Sin ella no se puede responder "cuánta gente vive alrededor de este predio" (M2), ni dimensionar un mercado en un polígono (M4), ni calcular población en edad escolar para la plantilla de colegios de M6, que es uno de los casos de uso que el plan nombra explícitamente.

| Campo | Valor |
|---|---|
| URL | <https://geoportal.dane.gov.co/> |
| Licencia | NO_VERIFICADO — el geoportal no declara licencia en la página de entrada. Pendiente de confirmar antes de publicar dato derivado. |
| Atribución | Fuente: DANE, Marco Geoestadístico Nacional y CNPV 2018 |
| Tabla destino | `ctx.census_block` |
| Evidencia | `data-catalog/dane/manual__dane-geoportal.json` |
| Inspeccionado desde | https://geoportal.dane.gov.co/ |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO.
- El CNPV es de 2018: toda cifra de población que muestre el producto debe llevar esa fecha de corte (regla 4) y advertir que no es actual.
- El código de manzana censal del DANE NO coincide con el de manzana catastral del IGAC: el enlace es por geometría.

### `igac-areas-homogeneas-tierra` — Áreas homogéneas de tierra (por municipio)

Es el dataset agrológico más rico que publica el IGAC: 34 atributos por polígono, con pendiente, erosión, inundación, encharcamiento, nivel freático, profundidad efectiva, salinidad y vocación potencial. Un solo cruce espacial llena casi todos los factores del semáforo de M5 y las secciones 5 y 6 del informe de M7, sin necesidad de DEM ni de modelos propios.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/agrologia/areashomogeneasdetierra05360itagui/MapServer/0> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Áreas homogéneas de tierra |
| Tabla destino | `ctx.land_capability` |
| Evidencia | `data-catalog/igac/agrologia__areashomogeneasdetierra05360itagui__MapServer.json` |
| Inspeccionado desde | agrologia/areashomogeneasdetierra05360itagui/MapServer/0 (AREA_HOMOGENEA_TIERRA) |
| Campos de origen declarados | `Divipola`, `SIMBOLO`, `UCSuelo`, `CLASE`, `UClimatica`, `PENDIENTE`, `FPendiente`, `EHidrica`, `EEolica`, `ERemosion`, `INUNDACION`, `Encharcami`, `FNFreatico`, `PEfectiva`, `HDensicos`, `FGPerfil`, `PSuperfici`, `LRocosidad`, `LSodicidad`, `LSalinidad`, `CYeso`, `DArtificia`, `AIntercamb`, `Miscelaneo`, `VPotencial`, `TRelieve`, `MParental`, `CSimbolo`, `Observacio`, `Fecha`, `AREA_HA`, `Shape` |

- RIESGO ALTO DE COBERTURA: hay un servicio por municipio. En la raíz del servidor se ven 7 (Girardota, Olaya, El Peñol, San Jacinto, Betéitiva, Covarachía, La Celia) y en `agrologia` más; son decenas, no 1 122 municipios.
- Los nombres de campo están truncados a 10 caracteres: la fuente pasó por Shapefile.
- El servicio no respondió a `returnCountOnly`.
- DECISIÓN PENDIENTE: si el municipio del piloto no tiene áreas homogéneas, M5 arranca sin este insumo. Verificar la lista completa de municipios cubiertos antes de la Fase 8.

### `igac-capacidad-uso-tierras` — Capacidad de uso de las tierras (estudios regionales)

Es el dato que convierte a M5 de una promesa en un producto: la clase agrológica, los limitantes y los usos recomendados vienen del propio IGAC, así que el semáforo de aptitud no es un modelo nuestro sino la lectura del criterio oficial. El esquema (UCP, CLASE, SUBCLASE, GRUPO_MANEJO, UCS, CARACTERISTICAS, LIMITANTES_USO, USOS_RECOMENDADOS, PRACTICAS_MANEJO) se verificó en dos estudios distintos y es estable.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/agrologia/capacidaddeusodelastierrascvc2023/MapServer/0> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Capacidad de uso de las tierras (estudio CVC 2023) |
| Tabla destino | `ctx.land_capability` |
| Evidencia | `data-catalog/igac/agrologia__capacidaddeusodelastierrascvc2023__MapServer.json` |
| Inspeccionado desde | agrologia/capacidaddeusodelastierrascvc2023/MapServer/0 (CUT_CVC_2023_25K) y agrologia/capacidaddeusodelastierrasbordenortebogota2011/MapServer/0 (CUT_BordeNorte_2011_10K) |
| Campos de origen declarados | `UCP`, `CLASE`, `SUBCLASE`, `GRUPO_MANEJO`, `UCS`, `CARACTERISTICAS`, `LIMITANTES_USO`, `USOS_RECOMENDADOS`, `PRACTICAS_MANEJO`, `AREA_ha`, `SHAPE` |

- RIESGO ALTO DE ALCANCE: no hay capa nacional. Cada estudio es un servicio distinto y cubre una región (CVC = Valle del Cauca, Borde Norte de Bogotá, distritos de Boyacá, Santander, Nariño-Putumayo, Perijá, Macizo…). La carpeta `agrologia` tiene 382 servicios.
- El estudio del Borde Norte de Bogotá añade `ESTUDIO`, `ESCALA` y `AÑO`; el de la CVC no. El esquema es parecido pero no idéntico: la ingesta debe tolerar campos ausentes.
- Las escalas varían (1:10 000 a 1:100 000) y los años van de 2011 a 2023: dos polígonos vecinos pueden venir de estudios incomparables. Hay que guardar el estudio de origen en cada fila y mostrarlo (regla 4).
- Ningún estudio inspeccionado respondió a `returnCountOnly`: el número de polígonos queda desconocido.
- DECISIÓN PENDIENTE: si el departamento piloto no tiene estudio de capacidad de uso, M5 no puede entrar en el MVP con ese piloto. Verificar antes de comprometer la Fase 8.

### `igac-gdb-r-terreno` — Base Catastral Pública — R_TERRENO (terrenos rurales)

Geometría predial rural: 18 951 predios en Atlántico. Es el insumo de M5 (aptitud de terreno), que solo tiene sentido en suelo rural, y de los informes de finca, que son el caso de uso de persona natural con mayor disposición a pagar.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.parcel` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capa R_TERRENO (grupo RURAL) |
| Campos de origen declarados | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- El tramo de zona del NPN vale 00 en el 100 % de los predios rurales, y 01–06 en los urbanos: la zona identifica el área urbana (cabecera y centros poblados), no un booleano urbano/rural. Esto contradice `ZONE = {URBAN:01, RURAL:02}` de `packages/shared`.

### `igac-gdb-u-construccion` — Base Catastral Pública — U_CONSTRUCCION (construcciones urbanas)

Huella y pisos de 89 697 construcciones urbanas en Atlántico. Alimenta la sección de construcciones de la ficha (M2), la densidad edificada del analizador de zona (M4) y la detección de obra nueva entre cortes (M8), que es el diferencial de M8 frente a la competencia.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.building` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capa U_CONSTRUCCION |
| Campos de origen declarados | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- No trae área construida en m², ni año de construcción, ni uso, ni material.
- La clave natural es (TERRENO_CODIGO, CODIGO_EDIFICACION, IDENTIFICADOR): un mismo CODIGO aparece en varias filas.
- Inconsistencia de mayúsculas observada en TIPO_CONSTRUCCION y TIPO_DOMINIO: normalizar en el transform, no en la consulta.

### `igac-gdb-u-terreno` — Base Catastral Pública — U_TERRENO (terrenos urbanos)

Es la geometría predial urbana con sus identificadores, la fuente primaria de `core.parcel`. En Atlántico son 67 925 predios en 15 municipios. Sin ella no hay mapa de predios, ni ficha, ni buscador espacial.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.parcel` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capa U_TERRENO (grupo URBANO) |
| Campos de origen declarados | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- Descarga verificada: HEAD 200, 08_ATLANTICO.zip, 56 609 544 bytes, Accept-Ranges: bytes. SHA-256 11647eeb3dbe5db92d514c87095ae1a665cd16f4b109fa55f893dcb20519eaeb.
- Corte declarado por el IGAC: 2026-07-31 (publicado el 2026-09-03).
- La GDB NO trae avalúo catastral, destino económico ni área reportada: los Registros 1 y 2 no están en el paquete público. Ver riesgo `sin-registro-1-2` en data-catalog/RIESGOS.md.
- Hay un ítem por departamento: para cambiar de departamento basta cambiar el id del ítem de ArcGIS Online. Son 31 departamentos publicados.

### `igac-gestores-catastrales` — Gestores Catastrales de Colombia

La regla 6 de CLAUDE.md exige decirle al usuario cuándo un municipio no es jurisdicción del IGAC. Este dataset, con 1 122 filas y geometría municipal, es exactamente `core.cadastral_manager` y es lo que convierte "mapa vacío" en "este municipio lo gestiona X, esto sí tenemos". Sin él el producto miente por omisión.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/bhcx-bx97.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Gestores Catastrales de Colombia, CC BY-SA 4.0 |
| Tabla destino | `core.cadastral_manager` |
| Evidencia | `data-catalog/igac/socrata__bhcx-bx97.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/bhcx-bx97.json (28 columnas, 1 122 filas) |
| Campos de origen declarados | `mpcodigo`, `divipola`, `mpnombre`, `departamen`, `depto`, `gestor_cat`, `estado_act`, `ley617`, `acto_admin`, `fecha_cont`, `inicio`, `restriccio`, `url_habili`, `url_servic`, `the_geom` |

- Corte declarado: 2025-03-05. Los gestores catastrales cambian con frecuencia: hay que revisar la vigencia antes de cada lanzamiento.
- Existe también el servicio REST `catastro/Gestores_Catastrales/MapServer` (EPSG:9377, con paginación y estadísticas) como alternativa si el dataset de Socrata se queda atrás.
- La columna `contacto` fue marcada por la lista negra de PII y se descarta.

### `men-establecimientos-educativos` — Establecimientos educativos de preescolar, básica y media

La oferta educativa es uno de los tres contextos que cualquier comprador de vivienda pregunta, y es el insumo de la plantilla "¿dónde abro un colegio?" que PLAN.md §1.3 nombra explícitamente en M6. 606 206 filas con matrícula, sector y municipio, licencia CC BY-SA 4.0 y corte 2026-09: es el dataset de equipamiento social mejor mantenido del catálogo colombiano.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/cfw5-qzt5.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: Ministerio de Educación Nacional, corte 2026-09, CC BY-SA 4.0 |
| Tabla destino | `ctx.school` |
| Evidencia | `data-catalog/men/socrata__cfw5-qzt5.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/cfw5-qzt5.json (24 columnas, 606 206 filas) |
| Campos de origen declarados | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_sedes`, `web` |

- NO trae coordenadas: hay que geocodificar por municipio + dirección, o cruzar con `men-sedes-educativas`, que sí las trae.
- 3 columnas de PII detectadas (email, telefono, fax) y descartadas; `rector` se añade a mano por ser nombre de persona.
- El dataset es una serie histórica, no un directorio: filtrar por año es obligatorio o se cuentan colegios varias veces.

### `men-sedes-educativas` — Sedes educativas de preescolar, básica y media

Es el único dataset de educación con coordenadas, y la sede —no el establecimiento— es la que el usuario ve como "el colegio de la esquina". 53 796 sedes. Sin coordenadas no hay distancia a colegio, que es el indicador de entorno más pedido en la ficha de predio.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/x5ay-984n.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: Ministerio de Educación Nacional, corte 2021-03, CC BY-SA 4.0 |
| Tabla destino | `ctx.school` |
| Evidencia | `data-catalog/men/socrata__x5ay-984n.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/x5ay-984n.json (23 columnas, 53 796 filas) |
| Campos de origen declarados | `codigo_dane_sede`, `sede_id`, `nombre_sede`, `codigo_dane`, `est_id`, `nombre_establecimiento`, `principal`, `coordenada_x_sede`, `coordenada_y_sede`, `zona`, `cte_id_sector`, `cte_id_calendario`, `cod_dane_municipio`, `municipio`, `departamento`, `secretaria`, `direccion`, `barrio_vereda`, `total_matricula`, `a_o` |

- RIESGO: el corte declarado es 2021-03-19, cinco años más antiguo que el de establecimientos (2026-09). Toda cifra debe llevar su propia fecha de corte (regla 4), no la del otro dataset.
- RIESGO: las coordenadas observadas traen solo dos decimales (~1 km de error). Hay que medirlo sobre el total antes de prometer distancias.

### `osm-vias-colombia` — Red vial de Colombia (extracto Geofabrik)

Es la única fuente abierta con red vial detallada y actualizada a diario de todo el país. Alimenta la distancia a vía principal de la ficha (M2), la accesibilidad del analizador de zona (M4) y el mapa de calor de localización de negocio (M6). La alternativa del IGAC (`Datos_Fundamentales_Transporte_100k`) es de escala 1:100 000: sirve para el contexto regional, no para saber si un lote tiene acceso.

| Campo | Valor |
|---|---|
| URL | <https://download.geofabrik.de/south-america/colombia-latest.osm.pbf> |
| Licencia | ODbL 1.0 (Open Database License) |
| Atribución | © colaboradores de OpenStreetMap, ODbL 1.0 |
| Tabla destino | `ctx.road` |
| Evidencia | `data-catalog/osm/geofabrik-colombia.json` |
| Inspeccionado desde | https://download.geofabrik.de/south-america/colombia.html |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. El esquema depende del estilo de `osm2pgsql`, que se decide en la Fase 4; no se inventan columnas.
- ODbL es una licencia con cláusula de compartir-igual sobre bases derivadas: hay que mantener OSM separado de los datos del IGAC en la base y en las exportaciones.
- DECISIÓN PENDIENTE: qué subconjunto de etiquetas ingerir. Cargar el .pbf completo de Colombia es innecesario para el MVP.

### `reps-prestadores-sedes` — Registro Especial de Prestadores y Sedes de Servicios de Salud (REPS)

Es el registro oficial y único de la oferta de salud del país: 76 821 sedes con municipio, dirección y clase de prestador, actualizado a 2026-03. Alimenta la distancia a servicio de salud de la ficha (M2) y la plantilla de clínicas de M6. La dirección viene en formato real, así que sirve para geocodificar.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/c36g-9fc2.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: Ministerio de Salud y Protección Social, REPS, corte 2026-03, CC BY-SA 4.0 |
| Tabla destino | `ctx.health_facility` |
| Evidencia | `data-catalog/minsalud/socrata__c36g-9fc2.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/c36g-9fc2.json (22 columnas, 76 821 filas) |
| Campos de origen declarados | `codigohabilitacionsede`, `nombresede`, `nombreprestador`, `codigoprestador`, `claseprestador`, `naturalezajuridica`, `ese`, `municipiosede`, `municipiosededesc`, `departamentodededesc`, `direcci_nsede`, `fecha_corte_reps` |

- 4 columnas de PII detectadas automáticamente; la lista negra del dataset añade 6 más que identifican al prestador persona natural.
- HALLAZGO SENSIBLE: una parte importante del REPS son profesionales independientes, cuyo `nombreprestador` y `nombresede` son el nombre de una persona (observado "MANUEL DE JESUS LUBO OROZCO"). Publicarlos violaría la regla 3 aunque el dato sea público en el REPS.
- NO trae coordenadas: hay que geocodificar por dirección + municipio.

### `dane-divipola-centros-poblados` — DIVIPOLA — códigos de cabeceras y centros poblados

8 161 cabeceras y centros poblados con nombre y coordenada. Es lo que permite que el buscador universal de M1 responda a "Sabanas del Rincón" y no solo a códigos y municipios, y explica los códigos de zona 01–06 del NPN (hay varias áreas urbanas por municipio).

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/xaxy-8nri.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: DANE, DIVIPOLA, corte 2025-01, CC BY-SA 4.0 |
| Tabla destino | `core.populated_center` |
| Evidencia | `data-catalog/dane/socrata__xaxy-8nri.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/xaxy-8nri.json (9 columnas, 8 161 filas) |
| Campos de origen declarados | `codigo_departamento`, `nombre_departamento`, `codigo_municipio`, `nombre_municipio`, `codigo_centro_poblado`, `nombre_centro_poblado`, `tipo_centro_poblado`, `longitud`, `latitud` |

- Es un punto por centro poblado, no un polígono: para el polígono está `U_PERIMETRO` del catastro.
- El dataset de municipios (`gdxc-w37w`) existe en el portal pero lo publica una gobernación, no el DANE: se prefiere el MGN como fuente de municipios.

### `igac-actividad-quimica-suelos` — Actividad química de los suelos (nacional)

Es el **único** dataset agrológico del IGAC que la Fase 0 encontró con alcance nacional declarado ("nacional" en el nombre del servicio, con campo `DEPARTAMEN`). Da clima, paisaje, tipo de relieve, material parental y subgrupo taxonómico para todo el país, lo que permite que M5 diga algo en cualquier predio en vez de callar donde no hay estudio regional.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/agrologia/actividadquimicanacional/MapServer/0> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Actividad química de los suelos |
| Tabla destino | `ctx.soil_unit` |
| Evidencia | `data-catalog/igac/agrologia__actividadquimicanacional__MapServer.json` |
| Inspeccionado desde | agrologia/actividadquimicanacional/MapServer/0 (capa "Actividad") |
| Campos de origen declarados | `UCSuelo`, `UCS`, `CLIMA_1`, `PAISAJE`, `TIPO_RELIE`, `MATERIAL_P`, `SUBGRUPO`, `PERFILES`, `PORCENTAJE`, `ACTIVIDAD`, `AREA_HA`, `DEPARTAMEN`, `COD`, `COD_1`, `Shape` |

- El alcance nacional está inferido del nombre del servicio y de la presencia del campo DEPARTAMEN; el servicio no respondió a `returnCountOnly` ni a la muestra, así que **no se verificó fila a fila**. Confirmar antes de prometer cobertura nacional.
- Nombres truncados a 10 caracteres (`TIPO_RELIE`, `MATERIAL_P`, `DEPARTAMEN`).

### `igac-gdb-r-construccion` — Base Catastral Pública — R_CONSTRUCCION (construcciones rurales)

Huella de 18 310 construcciones rurales en Atlántico. En suelo rural la construcción es el indicio de ocupación efectiva del predio, que es lo que pregunta quien compra una finca.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.building` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capa R_CONSTRUCCION |
| Campos de origen declarados | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- La capa equivalente del servicio REST (`R_CONSTRUCCION`) sí trae `USUARIO_LO`, la única columna de PII hallada en toda la oferta catastral del IGAC. La GDB no la trae, pero la lista negra la declara igualmente.

### `igac-gdb-r-vereda` — Base Catastral Pública — R_VEREDA y R_SECTOR (jerarquía rural)

El nombre de la vereda es como la gente identifica un predio rural ("la finca en la vereda X"): sin R_VEREDA el buscador universal no funciona fuera de las cabeceras. Son 50 veredas y 40 sectores rurales en Atlántico.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.vereda / core.sector` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capas R_VEREDA, R_SECTOR |
| Campos de origen declarados | `CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- Solo 50 veredas para 15 municipios rurales: la cobertura es baja frente a la realidad del territorio. Verificar contra otro departamento antes de prometer búsqueda por vereda a nivel nacional.

### `igac-gdb-u-manzana` — Base Catastral Pública — U_MANZANA, U_BARRIO y U_SECTOR (jerarquía urbana)

La jerarquía urbana (5 164 manzanas, 33 barrios, 38 sectores en Atlántico) es la unidad de agregación con la que se sirve el mapa a zooms intermedios sin mandar 68 000 predios, y U_BARRIO aporta el único nombre de barrio oficial del catastro, imprescindible para el buscador universal de M1.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.block / core.neighborhood / core.sector` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al 08_ATLANTICO/08.gdb → capas U_MANZANA, U_BARRIO, U_SECTOR |
| Campos de origen declarados | `CODIGO`, `BARRIO_CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- Son tres capas con esquemas casi idénticos; se declaran juntas porque comparten transformación y tabla destino por tipo.
- El código de manzana del IGAC NO coincide con el de manzana censal del DANE: el enlace entre ambos es por geometría.
- Atlántico tiene solo 33 barrios para 15 municipios: la cobertura de U_BARRIO es parcial y la UI debe tolerar barrio nulo.

### `igac-gdb-u-perimetro` — Base Catastral Pública — U_PERIMETRO (perímetros urbanos y centros poblados)

Distinguir suelo urbano de rural es la primera pregunta de cualquier análisis de aptitud (M5) y el filtro más usado del buscador (M3). Con 29 perímetros para 15 municipios queda claro que hay más de un área urbana por municipio (cabecera + centros poblados), lo que explica los códigos de zona 01–06 del NPN.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.urban_perimeter` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al + consultas SQLITE sobre 08_ATLANTICO/08.gdb → U_PERIMETRO (29 filas) |
| Campos de origen declarados | `DEPARTAMENTO_CODIGO`, `MUNICIPIO_CODIGO`, `TIPO_AVALUO`, `NOMBRE_GEOGRAFICO`, `CODIGO_NOMBRE`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- Tres campos con uso inconsistente (MUNICIPIO_CODIGO, TIPO_AVALUO, CODIGO_NOMBRE): no se interpretan en el MVP, se guardan crudos en `attrs` y se documenta.

### `igac-transacciones-inmobiliarias` — Registro de transacciones inmobiliarias en Colombia

Es lo más cerca que hay de un dato abierto de mercado inmobiliario en Colombia: 30 903 248 anotaciones registrales con municipio, número catastral, fecha y, cuando existe, valor. Resuelve la duda que PLAN.md §5.1 dejaba abierta sobre el Observatorio Inmobiliario y habilita M9 (dinámica de transacciones por municipio) sin inventar un modelo de precios.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/7y2j-43cv.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Registro de transacciones inmobiliarias, CC BY-SA 4.0 |
| Tabla destino | `analytics.real_estate_transaction` |
| Evidencia | `data-catalog/igac/socrata__7y2j-43cv.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/7y2j-43cv.json (26 columnas, 30 903 248 filas) |
| Campos de origen declarados | `pk`, `divipola`, `departamento`, `municipio`, `numero_catastral`, `numero_catastral_antiguo`, `year_radica`, `fecha_radica_texto`, `fecha_apertura_texto`, `tipo_predio_zona`, `categoria_ruralidad_2024`, `valor`, `tiene_valor`, `tiene_mas_de_un_valor`, `num_anotacion`, `cod_natujur`, `orip`, `estado_folio`, `predios_nuevos`, `dinamica_2024` |

- Corte declarado: 2025-04-04. 30,9 millones de filas: la ingesta debe ser por municipio y con $select explícito, nunca completa.
- Dos columnas de PII detectadas y descartadas: `nombre_natujur` y `documento_justificativo`.
- DECISIÓN DE NEGOCIO PENDIENTE: publicar indicadores de valor de transacción es sensible. Requiere el concepto jurídico de PLAN.md §2 y una redacción muy cuidada de la advertencia de la regla 5.

### `igac-transporte-100k` — Datos Fundamentales de Transporte 1:100 000

Es la jerarquía vial oficial del país y trae `VEstado` (estado de la vía), que OSM casi nunca tiene y que es exactamente lo que decide si una finca es accesible en invierno. Complementa a OSM, no lo sustituye: OSM gana en detalle urbano, el IGAC gana en autoridad y en atributos de estado.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Datos Fundamentales de Transporte 1:100 000 |
| Tabla destino | `ctx.road` |
| Evidencia | `data-catalog/igac/Datos_Fundamentales_Transporte_100k__MapServer.json` |
| Inspeccionado desde | https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer — 7 capas: Limite_Via_100k, Puente_L_100k, Puente_P_100k, Separador_Vial_100k, Tunel_100k, "Via Ferrea_100k", Via_100k |
| Campos de origen declarados | `VIdentifi`, `VTipo`, `VEstado`, `VCarril`, `VAcceso`, `Shape` |

- Escala 1:100 000: sirve para contexto regional y accesibilidad rural, NO para saber a qué calle da un lote urbano. Para eso está OSM.
- El servicio trae 7 capas; el mapeo de arriba es de `Via_100k` (id 6). Los puentes (`Puente_P_100k`, id 2) y las vías férreas (id 5) se ingieren como `ctx.poi` y `ctx.road` respectivamente.
- El nombre de la capa 5 es literalmente `Via Ferrea_100k ` con espacios: hay que escaparlo en las URL.
- No respondió a `returnCountOnly`: el número de vías queda desconocido.

### `osm-poi-colombia` — Puntos de interés y edificios de Colombia (extracto Geofabrik)

Comercio, servicios y equipamientos con los que se describe el entorno de un predio y se puntúan las celdas H3 para la localización de negocio (M6). Complementa MEN y REPS, que solo cubren educación y salud.

| Campo | Valor |
|---|---|
| URL | <https://download.geofabrik.de/south-america/colombia-latest.osm.pbf> |
| Licencia | ODbL 1.0 (Open Database License) |
| Atribución | © colaboradores de OpenStreetMap, ODbL 1.0 |
| Tabla destino | `ctx.poi` |
| Evidencia | `data-catalog/osm/geofabrik-colombia.json` |
| Inspeccionado desde | https://download.geofabrik.de/south-america/colombia.html |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO, por la misma razón que la red vial.
- La cobertura de POI en OSM es muy desigual entre ciudades y zonas rurales: la UI debe advertirlo (regla 6).

### `runap-areas-protegidas` — Registro Único Nacional de Áreas Protegidas

Un predio dentro de un área protegida tiene restricciones de uso que cambian por completo la respuesta de M5, y omitirlo sería el error más caro que puede cometer el producto. Es un "blocker" del semáforo, no un matiz.

| Campo | Valor |
|---|---|
| URL | <https://runap.parquesnacionales.gov.co/> |
| Licencia | NO_VERIFICADO |
| Atribución | Fuente: Parques Nacionales Naturales de Colombia, RUNAP |
| Tabla destino | `ctx.protected_area` |
| Evidencia | sin evidencia en el catálogo |
| Inspeccionado desde | — |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. No se inspeccionó en la Fase 0.
- La carpeta `ambiente` del IGAC sí tiene `reservasforestalesley` y `reservasnaturalesdelasociedadcivil`, que cubren parte del problema y sí están en el catálogo.
- TAREA PENDIENTE DE FASE 0: verificar si el RUNAP expone un servicio OGC y añadirlo al registro de fuentes.

### `sgc-ideam-amenazas` — Amenaza por movimientos en masa, sísmica e inundación

La sección 6 del Informe Territorial (amenazas y restricciones) es una de las diez que PLAN.md §11 declara obligatorias, y es lo que más valor percibido tiene para quien compra. Sin amenazas el informe está incompleto.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/> |
| Licencia | NO_VERIFICADO |
| Atribución | Fuente: Servicio Geológico Colombiano / IDEAM |
| Tabla destino | `ctx.hazard` |
| Evidencia | sin evidencia en el catálogo |
| Inspeccionado desde | — |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. La Fase 0 NO inspeccionó los servicios del SGC ni del IDEAM: no están en `mapas.igac.gov.co` y no se añadieron al registro de fuentes.
- Lo que sí se encontró como sustituto parcial: el campo `INUNDACION` y `ERemosion` de las áreas homogéneas de tierra del IGAC, que dan susceptibilidad a inundación y remoción en masa donde hay estudio.
- TAREA PENDIENTE DE FASE 0: añadir los servicios ArcGIS del SGC (`srvags.sgc.gov.co`) y del IDEAM al registro `ARCGIS_SOURCES` y volver a correr el crawler.

### `agrosavia-analisis-suelos` — Resultados de análisis de laboratorio de suelos en Colombia

92 738 análisis de laboratorio reales con pH, materia orgánica y bases intercambiables. No sustituye a la capacidad de uso, pero da un indicador de fertilidad allí donde no hay estudio agrológico, y es un dato que un comprador de finca entiende de inmediato.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/ch4u-f3i5.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: Corporación Colombiana de Investigación Agropecuaria (AGROSAVIA), corte 2025-10, CC BY-SA 4.0 |
| Tabla destino | `ctx.soil_lab_result` |
| Evidencia | `data-catalog/igac/socrata__ch4u-f3i5.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/ch4u-f3i5.json (32 columnas, 92 738 filas) |
| Campos de origen declarados | `secuencial`, `fecha_de_an_lisis`, `departamento`, `municipio`, `cultivo`, `topografia`, `drenaje`, `riego`, `ph_agua_suelo`, `materia_organica`, `fosforo_bray_ii`, `capacidad_de_intercambio_cationico`, `conductividad_electrica`, `aluminio_intercambiable`, `calcio_intercambiable`, `magnesio_intercambiable`, `potasio_intercambiable`, `sodio_intercambiable` |

- El publicador es AGROSAVIA, no el IGAC, aunque la búsqueda lo encontró con la consulta de suelos del IGAC.
- Solo tiene municipio, no coordenada: sirve para caracterizar un municipio, NO para decir nada de un predio concreto. La UI debe dejarlo clarísimo.
- Usa "ND" y "No indica" como faltantes: cargarlos como 0 falsearía cualquier promedio.

### `dane-proyecciones-poblacion` — Proyecciones de población por municipio

Actualiza la población municipal más allá del censo de 2018, que es lo que permite hablar de dinámica poblacional en el observatorio (M9) sin mentir con cifras de hace ocho años.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/> |
| Licencia | NO_VERIFICADO — ver ficha del dataset en datos.gov.co |
| Atribución | Fuente: DANE, proyecciones de población |
| Tabla destino | `analytics.muni_indicator` |
| Evidencia | `data-catalog/dane/` |
| Inspeccionado desde | — |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. La búsqueda de Fase 0 solo encontró proyecciones municipales sueltas publicadas por alcaldías (p. ej. `stc8-i9y9`, Chiquinquirá, 54 filas), no la serie nacional del DANE.
- DECISIÓN PENDIENTE: la serie nacional de proyecciones se publica en el sitio del DANE en XLSX, no en datos.gov.co. Hay que decidir si se ingiere desde ahí (y entonces el conector es `file-download`, no `socrata`).

### `igac-areas-potenciales-irrigacion` — Áreas potenciales para adecuación de tierras con fines de irrigación

El potencial de riego es determinante para el valor de una finca y es una de las primeras preguntas de quien compra tierra agrícola. 32 307 filas con licencia CC BY-SA 4.0.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/wmwx-9aap.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Áreas potenciales para irrigación, CC BY-SA 4.0 |
| Tabla destino | `ctx.land_vocation` |
| Evidencia | `data-catalog/igac/socrata__wmwx-9aap.json` |
| Inspeccionado desde | catálogo de datos.gov.co (11 columnas declaradas, 32 307 filas) |
| Campos de origen declarados | **NO_INSPECCIONADO** |

- fieldMapping: NO_INSPECCIONADO. Se conocen el conteo y la licencia del catálogo, pero no se bajó la muestra de filas: quedó fuera del `inspectTop` de la corrida.
- Reinspeccionar con `pnpm catalog:crawl -- --source igac-socrata` subiendo `inspectTop`.

### `igac-cuerpos-agua-500k` — Datos Fundamentales de Cuerpos de Agua 1:500 000

La sección 4 del Informe Territorial exige hidrografía, y la proximidad a un cauce es un factor de amenaza que el usuario espera ver. Con conteos verificados (935 bancos de arena, 271 drenajes en polígono, 11 manglares, 0 humedales) queda claro que es una capa de contexto regional, no de detalle.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Datos Fundamentales de Cuerpos de Agua 1:500 000 |
| Tabla destino | `ctx.water_body` |
| Evidencia | `data-catalog/igac/Dato_Fundamental_Cuerpos_de_Agua_500k__MapServer.json` |
| Inspeccionado desde | https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer — 7 capas |
| Campos de origen declarados | `DIdentif`, `DTipo`, `DEstado`, `DDisperso`, `DAIdentif`, `DATipo`, `Shape` |

- Conteos verificados: `Banco de Arena` 935, `Drenaj_R` 271, `Manglar` 11, `Humedal` **0** (capa vacía).
- A escala 1:500 000 esta capa NO sirve para rondas hídricas ni para amenaza de inundación a nivel de predio. Para eso hacen falta el IDEAM y las áreas homogéneas de tierra.
- Todas las capas llevan un campo `RuleID` que es metadato de simbología, no dato: no se ingiere.

### `igac-curvas-nivel-500k` — Datos Fundamentales de Curvas de Nivel 1:500 000

Da altitud de contexto sin necesidad de raster, útil mientras el DEM Copernicus no esté cargado. Entra con prioridad baja precisamente porque el DEM lo sustituye.

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0> |
| Licencia | CC BY-SA 4.0 (por analogía con la Base Catastral; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Datos Fundamentales de Curvas de Nivel 1:500 000 |
| Tabla destino | `ctx.contour` |
| Evidencia | `data-catalog/igac/Dato_Fundamental_Curvas_de_nivel_500k__MapServer.json` |
| Inspeccionado desde | https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0 (Elevacion_500k) |
| Campos de origen declarados | `CNIdentif`, `CNAltura`, `CNTipo`, `Shape` |

- A escala 1:500 000 la equidistancia es de cientos de metros: NO sirve para calcular pendiente de un predio. El plan ya prevé el DEM Copernicus 30 m para eso (PLAN.md §5.2).
- No respondió a `returnCountOnly` ni devolvió muestra dentro del presupuesto: el esquema se conoce por los metadatos de la capa, no por filas.

### `igac-gdb-nomenclatura` — Base Catastral Pública — U_/R_NOMENCLATURA_DOMICILIARIA y VIAL

Es la única capa del catastro que podría dar la dirección de un predio, y la dirección es la forma en que el 99 % de los usuarios buscará. Entra al MVP para medirla y decidir, no para prometerla: la inspección de Atlántico dice que hoy NO sirve como dirección.

| Campo | Valor |
|---|---|
| URL | <https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0 |
| Tabla destino | `core.address_point / core.street_name` |
| Evidencia | `docs/DICCIONARIO_CATASTRAL.md` |
| Inspeccionado desde | ogrinfo -so -al + consultas SQLITE sobre 08_ATLANTICO/08.gdb → U_NOMENCLATURA_DOMICILIARIA (73 215 filas), U_NOMENCLATURA_VIAL (4 280), R_NOMENCLATURA_DOMICILIARIA (11 856), R_NOMENCLATURA_VIAL (14) |
| Campos de origen declarados | `TEXTO`, `TERRENO_CODIGO`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |

- HALLAZGO CRÍTICO: de 73 215 registros de nomenclatura domiciliaria urbana en Atlántico, 14 125 dicen literalmente "NS" y solo 18 contienen "Carrera" o "Calle". El resto son topónimos y nombres de lote ("ARROYO GRANDE", "PARCELA L-1 DIVISION 1", "ZONA DE CESION No.1").
- Consecuencia: el buscador por dirección del MVP NO puede sostenerse con el catastro. Alternativas a evaluar: nomenclatura de OSM, geocodificador propio sobre U_NOMENCLATURA_VIAL, o declarar la búsqueda por dirección fuera del alcance del MVP.
- La geometría es una línea de rotulación, no un punto de dirección: `core.address_point` necesitaría derivar el punto (p. ej. ST_LineInterpolatePoint), lo que es una estimación y debe marcarse como tal.

### `igac-u-terreno-rest` — Dato Fundamental Catastro (REST) — U_TERRENO, validación nacional

No sirve como carga primaria (3,6 millones de registros con `maxRecordCount` 2 000 y sin paginación serían ~1 808 peticiones), pero sí como control de cobertura: su conteo nacional permite saber cuántos predios del IGAC existen y, por diferencia, cuántos nos faltan. Es la forma honesta de llenar la tabla de cobertura (regla 6).

| Campo | Valor |
|---|---|
| URL | <https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/4> |
| Licencia | CC BY-SA 4.0 (asumida del portal; el servicio no declara copyrightText) |
| Atribución | Fuente: IGAC, Dato Fundamental Catastro, CC BY-SA 4.0 |
| Tabla destino | `raw.igac_rest_u_terreno` |
| Evidencia | `data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json` |
| Inspeccionado desde | https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/4 (U_TERRENO, id 4) |
| Campos de origen declarados | `CODIGO`, `CODIGO_ANT`, `MANZANA_CO`, `NUMERO_SUB`, `GLOBALID_S`, `GlobalID`, `Shape` |

- Conteos nacionales verificados el 2026-09-21: U_TERRENO 3 616 349, R_TERRENO 3 146 345, U_CONSTRUCCION 4 790 310, R_CONSTRUCCION 393 507, U_MANZANA 240 033.
- El servicio declara `supportsPagination: false` y responde 400 a `resultRecordCount`: el conector pagina por rangos de FID.
- Los nombres de campo están truncados a 10 caracteres y NO coinciden con los de la GDB: son dos esquemas distintos de la misma información.

### `secop-ubicaciones-contratos` — SECOP II — ubicaciones de ejecución de contratos

La inversión pública ejecutada en un municipio es un indicador de dinámica territorial que ninguna otra fuente da, y con 6 333 733 filas georreferenciadas a municipio alimenta el observatorio (M9). Entra con prioridad baja: es valor añadido, no núcleo.

| Campo | Valor |
|---|---|
| URL | <https://www.datos.gov.co/resource/gra4-pcp2.json> |
| Licencia | CC BY-SA 4.0 |
| Atribución | Fuente: Agencia Nacional de Contratación Pública — Colombia Compra Eficiente, SECOP II, CC BY-SA 4.0 |
| Tabla destino | `ctx.public_contract` |
| Evidencia | `data-catalog/secop/socrata__gra4-pcp2.json` |
| Inspeccionado desde | https://www.datos.gov.co/resource/gra4-pcp2.json (13 columnas, 6 333 733 filas) |
| Campos de origen declarados | `id_contrato`, `referencia_del_contrato`, `proceso_de_compra`, `nombre_entidad`, `codigo_entidad`, `localizaci_n`, `ubicacion`, `urlproceso` |

- Este dataset no trae el valor del contrato: para eso está `SECOP II - Contratos Electrónicos` (jbjy-vk9h, 6 066 730 filas, 85 columnas), en el que la lista negra detectó 16 columnas de PII. Se deja fuera del MVP por ese coste de saneamiento.
- 2 columnas de PII detectadas automáticamente; la lista negra del dataset añade 3 más.
- La ubicación es solo a nivel de municipio: no sirve para análisis intraurbano.

## Matriz módulo × dataset × campos

Qué campos concretos necesita cada módulo de cada dataset. Los campos son los nombres reales devueltos por la fuente; `NO_INSPECCIONADO` marca lo que falta verificar.

### M1 Explorador

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-manzana` | `core.block / core.neighborhood / core.sector` | `CODIGO`, `BARRIO_CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-vereda` | `core.vereda / core.sector` | `CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-nomenclatura` | `core.address_point / core.street_name` | `TEXTO`, `TERRENO_CODIGO`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-perimetro` | `core.urban_perimeter` | `DEPARTAMENTO_CODIGO`, `MUNICIPIO_CODIGO`, `TIPO_AVALUO`, `NOMBRE_GEOGRAFICO`, `CODIGO_NOMBRE`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-u-terreno-rest` | `raw.igac_rest_u_terreno` | `CODIGO`, `CODIGO_ANT`, `MANZANA_CO`, `NUMERO_SUB`, `GLOBALID_S`, `GlobalID`, `Shape` |
| `igac-gestores-catastrales` | `core.cadastral_manager` | `mpcodigo`, `divipola`, `mpnombre`, `departamen`, `depto`, `gestor_cat`, `estado_act`, `ley617`, `acto_admin`, `fecha_cont`, `inicio`, `restriccio`, `url_habili`, `url_servic`, `the_geom` |
| `dane-divipola-departamentos` | `core.department` | `codigo_departamento`, `nombre_departamento`, `longitud`, `latitud` |
| `dane-divipola-centros-poblados` | `core.populated_center` | `codigo_departamento`, `nombre_departamento`, `codigo_municipio`, `nombre_municipio`, `codigo_centro_poblado`, `nombre_centro_poblado`, `tipo_centro_poblado`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |

### M2 Ficha de predio

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-vereda` | `core.vereda / core.sector` | `CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-nomenclatura` | `core.address_point / core.street_name` | `TEXTO`, `TERRENO_CODIGO`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-perimetro` | `core.urban_perimeter` | `DEPARTAMENTO_CODIGO`, `MUNICIPIO_CODIGO`, `TIPO_AVALUO`, `NOMBRE_GEOGRAFICO`, `CODIGO_NOMBRE`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gestores-catastrales` | `core.cadastral_manager` | `mpcodigo`, `divipola`, `mpnombre`, `departamen`, `depto`, `gestor_cat`, `estado_act`, `ley617`, `acto_admin`, `fecha_cont`, `inicio`, `restriccio`, `url_habili`, `url_servic`, `the_geom` |
| `igac-transporte-100k` | `ctx.road` | `VIdentifi`, `VTipo`, `VEstado`, `VCarril`, `VAcceso`, `Shape` |
| `igac-cuerpos-agua-500k` | `ctx.water_body` | `DIdentif`, `DTipo`, `DEstado`, `DDisperso`, `DAIdentif`, `DATipo`, `Shape` |
| `igac-curvas-nivel-500k` | `ctx.contour` | `CNIdentif`, `CNAltura`, `CNTipo`, `Shape` |
| `dane-divipola-centros-poblados` | `core.populated_center` | `codigo_departamento`, `nombre_departamento`, `codigo_municipio`, `nombre_municipio`, `codigo_centro_poblado`, `nombre_centro_poblado`, `tipo_centro_poblado`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |
| `dane-mgn-manzanas-censales` | `ctx.census_block` | **NO_INSPECCIONADO** |
| `men-establecimientos-educativos` | `ctx.school` | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_… |
| `men-sedes-educativas` | `ctx.school` | `codigo_dane_sede`, `sede_id`, `nombre_sede`, `codigo_dane`, `est_id`, `nombre_establecimiento`, `principal`, `coordenada_x_sede`, `coordenada_y_sede`, `zona`, `cte_id_sector`, `cte_id_calendario`, `cod_dane_municipio`, `municipio`, `departamento`, `secretaria`, `direccion`, `barrio_vereda`, `total… |
| `reps-prestadores-sedes` | `ctx.health_facility` | `codigohabilitacionsede`, `nombresede`, `nombreprestador`, `codigoprestador`, `claseprestador`, `naturalezajuridica`, `ese`, `municipiosede`, `municipiosededesc`, `departamentodededesc`, `direcci_nsede`, `fecha_corte_reps` |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |
| `osm-poi-colombia` | `ctx.poi` | **NO_INSPECCIONADO** |

### M3 Buscador avanzado

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-manzana` | `core.block / core.neighborhood / core.sector` | `CODIGO`, `BARRIO_CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `dane-divipola-departamentos` | `core.department` | `codigo_departamento`, `nombre_departamento`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |

### M4 Analizador de zona

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-u-manzana` | `core.block / core.neighborhood / core.sector` | `CODIGO`, `BARRIO_CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-vereda` | `core.vereda / core.sector` | `CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-perimetro` | `core.urban_perimeter` | `DEPARTAMENTO_CODIGO`, `MUNICIPIO_CODIGO`, `TIPO_AVALUO`, `NOMBRE_GEOGRAFICO`, `CODIGO_NOMBRE`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-transporte-100k` | `ctx.road` | `VIdentifi`, `VTipo`, `VEstado`, `VCarril`, `VAcceso`, `Shape` |
| `dane-divipola-centros-poblados` | `core.populated_center` | `codigo_departamento`, `nombre_departamento`, `codigo_municipio`, `nombre_municipio`, `codigo_centro_poblado`, `nombre_centro_poblado`, `tipo_centro_poblado`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |
| `dane-mgn-manzanas-censales` | `ctx.census_block` | **NO_INSPECCIONADO** |
| `men-establecimientos-educativos` | `ctx.school` | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_… |
| `men-sedes-educativas` | `ctx.school` | `codigo_dane_sede`, `sede_id`, `nombre_sede`, `codigo_dane`, `est_id`, `nombre_establecimiento`, `principal`, `coordenada_x_sede`, `coordenada_y_sede`, `zona`, `cte_id_sector`, `cte_id_calendario`, `cod_dane_municipio`, `municipio`, `departamento`, `secretaria`, `direccion`, `barrio_vereda`, `total… |
| `reps-prestadores-sedes` | `ctx.health_facility` | `codigohabilitacionsede`, `nombresede`, `nombreprestador`, `codigoprestador`, `claseprestador`, `naturalezajuridica`, `ese`, `municipiosede`, `municipiosededesc`, `departamentodededesc`, `direcci_nsede`, `fecha_corte_reps` |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |
| `osm-poi-colombia` | `ctx.poi` | **NO_INSPECCIONADO** |

### M5 Aptitud de terreno

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-vereda` | `core.vereda / core.sector` | `CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-perimetro` | `core.urban_perimeter` | `DEPARTAMENTO_CODIGO`, `MUNICIPIO_CODIGO`, `TIPO_AVALUO`, `NOMBRE_GEOGRAFICO`, `CODIGO_NOMBRE`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-transporte-100k` | `ctx.road` | `VIdentifi`, `VTipo`, `VEstado`, `VCarril`, `VAcceso`, `Shape` |
| `igac-cuerpos-agua-500k` | `ctx.water_body` | `DIdentif`, `DTipo`, `DEstado`, `DDisperso`, `DAIdentif`, `DATipo`, `Shape` |
| `igac-capacidad-uso-tierras` | `ctx.land_capability` | `UCP`, `CLASE`, `SUBCLASE`, `GRUPO_MANEJO`, `UCS`, `CARACTERISTICAS`, `LIMITANTES_USO`, `USOS_RECOMENDADOS`, `PRACTICAS_MANEJO`, `AREA_ha`, `SHAPE` |
| `igac-areas-homogeneas-tierra` | `ctx.land_capability` | `Divipola`, `SIMBOLO`, `UCSuelo`, `CLASE`, `UClimatica`, `PENDIENTE`, `FPendiente`, `EHidrica`, `EEolica`, `ERemosion`, `INUNDACION`, `Encharcami`, `FNFreatico`, `PEfectiva`, `HDensicos`, `FGPerfil`, `PSuperfici`, `LRocosidad`, `LSodicidad`, `LSalinidad`, `CYeso`, `DArtificia`, `AIntercamb`, `Misce… |
| `igac-actividad-quimica-suelos` | `ctx.soil_unit` | `UCSuelo`, `UCS`, `CLIMA_1`, `PAISAJE`, `TIPO_RELIE`, `MATERIAL_P`, `SUBGRUPO`, `PERFILES`, `PORCENTAJE`, `ACTIVIDAD`, `AREA_HA`, `DEPARTAMEN`, `COD`, `COD_1`, `Shape` |
| `agrosavia-analisis-suelos` | `ctx.soil_lab_result` | `secuencial`, `fecha_de_an_lisis`, `departamento`, `municipio`, `cultivo`, `topografia`, `drenaje`, `riego`, `ph_agua_suelo`, `materia_organica`, `fosforo_bray_ii`, `capacidad_de_intercambio_cationico`, `conductividad_electrica`, `aluminio_intercambiable`, `calcio_intercambiable`, `magnesio_interca… |
| `igac-areas-potenciales-irrigacion` | `ctx.land_vocation` | **NO_INSPECCIONADO** |
| `sgc-ideam-amenazas` | `ctx.hazard` | **NO_INSPECCIONADO** |
| `runap-areas-protegidas` | `ctx.protected_area` | **NO_INSPECCIONADO** |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |

### M6 Localización de negocio

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `dane-mgn-manzanas-censales` | `ctx.census_block` | **NO_INSPECCIONADO** |
| `dane-proyecciones-poblacion` | `analytics.muni_indicator` | **NO_INSPECCIONADO** |
| `men-establecimientos-educativos` | `ctx.school` | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_… |
| `men-sedes-educativas` | `ctx.school` | `codigo_dane_sede`, `sede_id`, `nombre_sede`, `codigo_dane`, `est_id`, `nombre_establecimiento`, `principal`, `coordenada_x_sede`, `coordenada_y_sede`, `zona`, `cte_id_sector`, `cte_id_calendario`, `cod_dane_municipio`, `municipio`, `departamento`, `secretaria`, `direccion`, `barrio_vereda`, `total… |
| `reps-prestadores-sedes` | `ctx.health_facility` | `codigohabilitacionsede`, `nombresede`, `nombreprestador`, `codigoprestador`, `claseprestador`, `naturalezajuridica`, `ese`, `municipiosede`, `municipiosededesc`, `departamentodededesc`, `direcci_nsede`, `fecha_corte_reps` |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |
| `osm-poi-colombia` | `ctx.poi` | **NO_INSPECCIONADO** |

### M7 Due diligence

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-transporte-100k` | `ctx.road` | `VIdentifi`, `VTipo`, `VEstado`, `VCarril`, `VAcceso`, `Shape` |
| `igac-cuerpos-agua-500k` | `ctx.water_body` | `DIdentif`, `DTipo`, `DEstado`, `DDisperso`, `DAIdentif`, `DATipo`, `Shape` |
| `igac-curvas-nivel-500k` | `ctx.contour` | `CNIdentif`, `CNAltura`, `CNTipo`, `Shape` |
| `dane-mgn-manzanas-censales` | `ctx.census_block` | **NO_INSPECCIONADO** |
| `men-establecimientos-educativos` | `ctx.school` | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_… |
| `men-sedes-educativas` | `ctx.school` | `codigo_dane_sede`, `sede_id`, `nombre_sede`, `codigo_dane`, `est_id`, `nombre_establecimiento`, `principal`, `coordenada_x_sede`, `coordenada_y_sede`, `zona`, `cte_id_sector`, `cte_id_calendario`, `cod_dane_municipio`, `municipio`, `departamento`, `secretaria`, `direccion`, `barrio_vereda`, `total… |
| `reps-prestadores-sedes` | `ctx.health_facility` | `codigohabilitacionsede`, `nombresede`, `nombreprestador`, `codigoprestador`, `claseprestador`, `naturalezajuridica`, `ese`, `municipiosede`, `municipiosededesc`, `departamentodededesc`, `direcci_nsede`, `fecha_corte_reps` |
| `igac-capacidad-uso-tierras` | `ctx.land_capability` | `UCP`, `CLASE`, `SUBCLASE`, `GRUPO_MANEJO`, `UCS`, `CARACTERISTICAS`, `LIMITANTES_USO`, `USOS_RECOMENDADOS`, `PRACTICAS_MANEJO`, `AREA_ha`, `SHAPE` |
| `igac-areas-homogeneas-tierra` | `ctx.land_capability` | `Divipola`, `SIMBOLO`, `UCSuelo`, `CLASE`, `UClimatica`, `PENDIENTE`, `FPendiente`, `EHidrica`, `EEolica`, `ERemosion`, `INUNDACION`, `Encharcami`, `FNFreatico`, `PEfectiva`, `HDensicos`, `FGPerfil`, `PSuperfici`, `LRocosidad`, `LSodicidad`, `LSalinidad`, `CYeso`, `DArtificia`, `AIntercamb`, `Misce… |
| `igac-actividad-quimica-suelos` | `ctx.soil_unit` | `UCSuelo`, `UCS`, `CLIMA_1`, `PAISAJE`, `TIPO_RELIE`, `MATERIAL_P`, `SUBGRUPO`, `PERFILES`, `PORCENTAJE`, `ACTIVIDAD`, `AREA_HA`, `DEPARTAMEN`, `COD`, `COD_1`, `Shape` |
| `sgc-ideam-amenazas` | `ctx.hazard` | **NO_INSPECCIONADO** |
| `runap-areas-protegidas` | `ctx.protected_area` | **NO_INSPECCIONADO** |
| `osm-vias-colombia` | `ctx.road` | **NO_INSPECCIONADO** |
| `osm-poi-colombia` | `ctx.poi` | **NO_INSPECCIONADO** |

### M8 Cambio territorial

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-terreno` | `core.parcel` | `CODIGO`, `MANZANA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-r-terreno` | `core.parcel` | `CODIGO`, `VEREDA_CODIGO`, `NUMERO_SUBTERRANEOS`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-gdb-u-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-gdb-r-construccion` | `core.building` | `CODIGO`, `TERRENO_CODIGO`, `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_PISOS`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `ETIQUETA`, `IDENTIFICADOR`, `CODIGO_EDIFICACION`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Sh… |
| `igac-transacciones-inmobiliarias` | `analytics.real_estate_transaction` | `pk`, `divipola`, `departamento`, `municipio`, `numero_catastral`, `numero_catastral_antiguo`, `year_radica`, `fecha_radica_texto`, `fecha_apertura_texto`, `tipo_predio_zona`, `categoria_ruralidad_2024`, `valor`, `tiene_valor`, `tiene_mas_de_un_valor`, `num_anotacion`, `cod_natujur`, `orip`, `estad… |

### M9 Observatorio

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gdb-u-manzana` | `core.block / core.neighborhood / core.sector` | `CODIGO`, `BARRIO_CODIGO`, `SECTOR_CODIGO`, `NOMBRE`, `CODIGO_ANTERIOR`, `GLOBALID`, `codigo_municipio`, `CODIGO_DEPARTAMENTO`, `SHAPE_Length`, `SHAPE_Area`, `Shape` |
| `igac-u-terreno-rest` | `raw.igac_rest_u_terreno` | `CODIGO`, `CODIGO_ANT`, `MANZANA_CO`, `NUMERO_SUB`, `GLOBALID_S`, `GlobalID`, `Shape` |
| `igac-gestores-catastrales` | `core.cadastral_manager` | `mpcodigo`, `divipola`, `mpnombre`, `departamen`, `depto`, `gestor_cat`, `estado_act`, `ley617`, `acto_admin`, `fecha_cont`, `inicio`, `restriccio`, `url_habili`, `url_servic`, `the_geom` |
| `igac-transacciones-inmobiliarias` | `analytics.real_estate_transaction` | `pk`, `divipola`, `departamento`, `municipio`, `numero_catastral`, `numero_catastral_antiguo`, `year_radica`, `fecha_radica_texto`, `fecha_apertura_texto`, `tipo_predio_zona`, `categoria_ruralidad_2024`, `valor`, `tiene_valor`, `tiene_mas_de_un_valor`, `num_anotacion`, `cod_natujur`, `orip`, `estad… |
| `dane-divipola-departamentos` | `core.department` | `codigo_departamento`, `nombre_departamento`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |
| `dane-mgn-manzanas-censales` | `ctx.census_block` | **NO_INSPECCIONADO** |
| `dane-proyecciones-poblacion` | `analytics.muni_indicator` | **NO_INSPECCIONADO** |
| `men-establecimientos-educativos` | `ctx.school` | `codigo_dane`, `nombre_establecimiento`, `a_o`, `cod_dane_departamento`, `departamento`, `cod_dane_municipio`, `municipio`, `cod_secretaria`, `secretaria`, `cod_sector`, `sector`, `cod_caracter`, `caracter`, `cod_calendario`, `calendario`, `direccion`, `barrio_vereda`, `total_matricula`, `cantidad_… |
| `secop-ubicaciones-contratos` | `ctx.public_contract` | `id_contrato`, `referencia_del_contrato`, `proceso_de_compra`, `nombre_entidad`, `codigo_entidad`, `localizaci_n`, `ubicacion`, `urlproceso` |

### M10 GeoAPI

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `dane-divipola-departamentos` | `core.department` | `codigo_departamento`, `nombre_departamento`, `longitud`, `latitud` |
| `dane-mgn-limites` | `core.department / core.municipality` | **NO_INSPECCIONADO** |

### M12 Cuenta y negocio

| Dataset | Tabla destino | Campos de origen |
|---|---|---|
| `igac-gestores-catastrales` | `core.cadastral_manager` | `mpcodigo`, `divipola`, `mpnombre`, `departamen`, `depto`, `gestor_cat`, `estado_act`, `ley617`, `acto_admin`, `fecha_cont`, `inicio`, `restriccio`, `url_habili`, `url_servic`, `the_geom` |

### Cobertura compacta

| Dataset | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `dane-divipola-departamentos` | ● | — | ● | — | — | — | — | — | ● | ● | — | — |
| `dane-mgn-limites` | ● | ● | ● | ● | — | — | — | — | ● | ● | — | — |
| `dane-mgn-manzanas-censales` | — | ● | — | ● | — | ● | ● | — | ● | — | — | — |
| `igac-areas-homogeneas-tierra` | — | — | — | — | ● | — | ● | — | — | — | — | — |
| `igac-capacidad-uso-tierras` | — | — | — | — | ● | — | ● | — | — | — | — | — |
| `igac-gdb-r-terreno` | ● | ● | ● | ● | ● | — | ● | ● | — | — | — | — |
| `igac-gdb-u-construccion` | — | ● | — | ● | — | — | ● | ● | — | — | — | — |
| `igac-gdb-u-terreno` | ● | ● | ● | ● | — | — | ● | ● | — | — | — | — |
| `igac-gestores-catastrales` | ● | ● | — | — | — | — | — | — | ● | — | — | ● |
| `men-establecimientos-educativos` | — | ● | — | ● | — | ● | ● | — | ● | — | — | — |
| `men-sedes-educativas` | — | ● | — | ● | — | ● | ● | — | — | — | — | — |
| `osm-vias-colombia` | ● | ● | — | ● | ● | ● | ● | — | — | — | — | — |
| `reps-prestadores-sedes` | — | ● | — | ● | — | ● | ● | — | — | — | — | — |
| `dane-divipola-centros-poblados` | ● | ● | — | ● | — | — | — | — | — | — | — | — |
| `igac-actividad-quimica-suelos` | — | — | — | — | ● | — | ● | — | — | — | — | — |
| `igac-gdb-r-construccion` | — | ● | — | ● | ● | — | ● | ● | — | — | — | — |
| `igac-gdb-r-vereda` | ● | ● | — | ● | ● | — | — | — | — | — | — | — |
| `igac-gdb-u-manzana` | ● | — | ● | ● | — | — | — | — | ● | — | — | — |
| `igac-gdb-u-perimetro` | ● | ● | — | ● | ● | — | — | — | — | — | — | — |
| `igac-transacciones-inmobiliarias` | — | — | — | — | — | — | — | ● | ● | — | — | — |
| `igac-transporte-100k` | — | ● | — | ● | ● | — | ● | — | — | — | — | — |
| `osm-poi-colombia` | — | ● | — | ● | — | ● | ● | — | — | — | — | — |
| `runap-areas-protegidas` | — | — | — | — | ● | — | ● | — | — | — | — | — |
| `sgc-ideam-amenazas` | — | — | — | — | ● | — | ● | — | — | — | — | — |
| `agrosavia-analisis-suelos` | — | — | — | — | ● | — | — | — | — | — | — | — |
| `dane-proyecciones-poblacion` | — | — | — | — | — | ● | — | — | ● | — | — | — |
| `igac-areas-potenciales-irrigacion` | — | — | — | — | ● | — | — | — | — | — | — | — |
| `igac-cuerpos-agua-500k` | — | ● | — | — | ● | — | ● | — | — | — | — | — |
| `igac-curvas-nivel-500k` | — | ● | — | — | — | — | ● | — | — | — | — | — |
| `igac-gdb-nomenclatura` | ● | ● | — | — | — | — | — | — | — | — | — | — |
| `igac-u-terreno-rest` | ● | — | — | — | — | — | — | — | ● | — | — | — |
| `secop-ubicaciones-contratos` | — | — | — | — | — | — | — | — | ● | — | — | — |

