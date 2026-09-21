# Diccionario catastral — estructura real observada (Fase 0)

> **Qué es este documento.** El diccionario de la estructura catastral del IGAC
> **tal como la devuelven sus servicios**, no como la describe la norma. Todo lo
> marcado ✔ se inspeccionó de verdad con `pnpm catalog:crawl`; todo lo marcado ✗
> **no se ha verificado** y no puede usarse para programar nada (regla 2 de
> `CLAUDE.md`).
>
> Evidencia: `data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`.
> Fecha de inspección: 2026-09-21.
> Fuente: IGAC — `https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer`
> (ArcGIS Server 11.3, `currentVersion` 11.3).

---

## 0. Resumen ejecutivo

| Pregunta | Respuesta observada |
|---|---|
| ¿Qué capas catastrales publica el IGAC por REST? | 5: `R_CONSTRUCCION`, `R_TERRENO`, `U_CONSTRUCCION`, `U_MANZANA`, `U_TERRENO` ✔ |
| ¿Traen atributos alfanuméricos (avalúo, destino económico, dirección, área)? | **No.** Solo códigos y geometría ✔ |
| ¿Traen datos de propietario? | **No** en las capas de terreno y manzana. `R_CONSTRUCCION` expone `USUARIO_LO` (usuario que editó el registro), que la lista negra descarta ✔ |
| CRS | EPSG:4686 (MAGNA-SIRGAS geográficas) ✔ |
| ¿Se puede paginar? | **No.** `supportsPagination: false`; el servicio responde `400 Pagination is not supported.` ✔ |
| ¿Sirve como backend en vivo? | **No.** Confirma la decisión de PLAN.md §5.1: ingerir a PostGIS propio ✔ |
| ¿Estructura de la GDB descargable y de los Registros 1 y 2? | ✗ **Sin verificar** (ver §6) |

---

## 1. El servicio

```
https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer
```

| Propiedad | Valor observado |
|---|---|
| `currentVersion` | 11.3 |
| `spatialReference` | `wkid: 4686`, `latestWkid: 4686` — MAGNA-SIRGAS geográficas |
| `capabilities` | `Query, Map, Data` |
| `supportedQueryFormats` | `JSON, geoJSON, PBF` |
| `maxRecordCount` | 2 000 |
| `supportedExtensions` | `WFSServer, WMSServer` |
| `fullExtent` | `-86.024, -4.385` → `-67.468, 13.394` (EPSG:4686) |
| `documentInfo.Keywords` | `IGAC,CIAF,Fundamental,catastro` |
| `copyrightText` | **vacío** — el servicio no declara licencia ni atribución |
| `serviceItemId` | `f64fe3b8f6a04f368eee3deccc91b3ff` |

Las cinco capas comparten `maxRecordCount: 2000`, `capabilities: Query,Map,Data`,
`supportsStatistics: false`, `supportsAdvancedQueries: false` y
`advancedQueryCapabilities.supportsPagination: false`. El campo OID es `FID` y
empieza en **0**.

---

## 2. Capas: conteo y extensión ✔

Conteos obtenidos con `returnCountOnly=true` el 2026-09-21. Son el universo
nacional bajo jurisdicción del IGAC, no de un departamento.

| Id | Capa | Geometría | Registros | CRS | OID | Extensión (EPSG:4686) |
|---|---|---|---|---|---|---|
| 0 | `R_CONSTRUCCION` | Polygon | **393 507** | 4686 | `FID` | `-86.024, -4.385` → `-67.538, 13.393` |
| 1 | `R_TERRENO` | Polygon | **3 146 345** | 4686 | `FID` | `-81.841, -4.130` → `-67.468, 13.394` |
| 2 | `U_CONSTRUCCION` | Polygon | **4 790 310** | 4686 | `FID` | `-81.722, -0.056` → `-67.921, 12.590` |
| 3 | `U_MANZANA` | Polygon | **240 033** | 4686 | `FID` | `-81.723, -0.057` → `-67.916, 12.591` |
| 4 | `U_TERRENO` | Polygon | **3 616 349** | 4686 | `FID` | `-81.723, -0.057` → `-67.916, 12.591` |

**Total de terrenos publicados: 6 762 694** (3 616 349 urbanos + 3 146 345 rurales).

Observación de cobertura: la extensión de `R_CONSTRUCCION` llega a `-86.02` de
longitud, muy al oeste de la Colombia continental; corresponde a las islas del
Caribe occidental (Providencia / cayos). Las capas urbanas se quedan en `-81.72`.

---

## 3. Campos por capa ✔

Los nombres están **truncados a 10 caracteres** (`TERRENO_CO`, `MANZANA_CO`,
`NUMERO_PIS`, `USUARIO_LO`, `SHAPE_Leng`). Es la firma inconfundible de una
publicación que pasó por Shapefile: dBASE limita los nombres de campo a 10
caracteres. Ninguna capa declara `domain` (dominios codificados) ni `alias`
distinto del nombre: **no hay diccionario de valores en el servicio**; los
dominios hay que deducirlos del contenido o leerlos de la GDB descargable.

### 3.1 `U_TERRENO` (id 4) y `R_TERRENO` (id 1) — el predio

| Campo | Tipo | Long. | En | Significado observado |
|---|---|---|---|---|
| `FID` | OID | — | ambas | Identificador interno del servicio. Empieza en 0. **No es estable entre cortes.** |
| `Shape` | Geometry | — | ambas | Polígono del terreno |
| `CODIGO` | String | 30 | ambas | **Número Predial Nacional de 30 dígitos** (ver §4) |
| `CODIGO_ANT` | String | 20 | ambas | Código predial anterior, 20 dígitos |
| `MANZANA_CO` | String | 17 | `U_TERRENO` | Código de la manzana que contiene el predio (17 dígitos) |
| `VEREDA_COD` | String | 17 | `R_TERRENO` | Código de la vereda. **Ojo: en la muestra llega en ceros** (`08421000000000000`), ver §5 |
| `NUMERO_SUB` | Integer | — | ambas | Número de subpredio. `0` en toda la muestra |
| `GLOBALID_S` | String | 38 | ambas | Cadena vacía (`" "`) en toda la muestra |
| `SHAPE_Leng` | Double | — | ambas | Perímetro **en grados decimales**, no en metros |
| `SHAPE_Area` | Double | — | ambas | Área **en grados cuadrados**, no en m² (ver §5) |
| `GlobalID` | String | 254 | ambas | GUID, p. ej. `{8893EF9E-214F-4753-9181-C6B18DB7F5F0}` |

> **No hay** avalúo catastral, destino económico, dirección, área de terreno en m²,
> área construida ni matrícula inmobiliaria. La capa REST es **solo geometría +
> identificadores**.

Muestra real de `U_TERRENO` (5 filas, sin columnas de PII):

```json
{ "FID": 0, "CODIGO": "084210100000000080013000000000", "MANZANA_CO": "08421010000000008",
  "NUMERO_SUB": 0, "CODIGO_ANT": "08421010000080013000", "GLOBALID_S": " ",
  "SHAPE_Leng": 0.000660920897569, "SHAPE_Area": 2.47467940194e-8,
  "GlobalID": "{8893EF9E-214F-4753-9181-C6B18DB7F5F0}" }
```

### 3.2 `U_CONSTRUCCION` (id 2) y `R_CONSTRUCCION` (id 0) — la construcción

| Campo | Tipo | Long. | En | Significado observado | Valores vistos |
|---|---|---|---|---|---|
| `FID` | OID | — | ambas | Identificador interno | 0,1,2… |
| `Shape` | Geometry | — | ambas | Polígono de la construcción | |
| `CODIGO` | String | 30 | ambas | NPN del predio al que pertenece | |
| `TERRENO_CO` | String | 30 | ambas | NPN del terreno. En la muestra **igual a `CODIGO`** | |
| `TIPO_CONST` | String | 20 | ambas | Tipo de construcción | `CONVENCIONAL` |
| `TIPO_DOMIN` | String | 20 | ambas | Tipo de dominio | `PRIVADO` |
| `NUMERO_PIS` | Integer | — | ambas | Número de pisos | `1` |
| `NUMERO_SOT` | Integer | — | ambas | Número de sótanos | `0` |
| `NUMERO_MEZ` | Integer | — | ambas | Número de mezanines | `0` |
| `NUMERO_SEM` | Integer | — | ambas | Número de semisótanos | `0` |
| `ETIQUETA` | String | 50 | ambas | Etiqueta de dibujo | `" "` (vacía) |
| `IDENTIFICA` | String | 20 | ambas | Identificador de la unidad de construcción dentro del terreno | `A`, `B`, `D` |
| `CODIGO_EDI` | Integer | — | ambas | Número de edificación dentro del terreno | `1`, `2` |
| `CODIGO_ANT` | String | 20 / 30 | ambas | Código anterior. **Longitud declarada distinta: 20 en `R_CONSTRUCCION`, 30 en `U_CONSTRUCCION`** | |
| `USUARIO_LO` | String | 100 | **solo `R_CONSTRUCCION`** | Usuario que editó el registro. ⛔ **Descartado por la lista negra de PII** (regla `operator_user`) | |
| `FECHA_LOG` | Date | 8 | **solo `R_CONSTRUCCION`** | Fecha de la edición | `null` en toda la muestra |
| `codigo_mun` | String | 5 | **solo `R_CONSTRUCCION`** | Código DIVIPOLA del municipio (minúsculas) | `" "` (vacío) en la muestra |
| `GLOBALID_S` | String | 38 | ambas | Vacío | `" "` |
| `SHAPE_Leng` / `SHAPE_Area` | Double | — | ambas | En grados / grados² | |
| `GlobalID` | String | 254 | ambas | GUID | |

> **No hay** área construida en m², ni año de construcción, ni uso, ni material.
> `NUMERO_PIS` es el único indicador volumétrico.

### 3.3 `U_MANZANA` (id 3) — la manzana urbana

| Campo | Tipo | Long. | Significado observado |
|---|---|---|---|
| `FID` | OID | — | Identificador interno |
| `Shape` | Geometry | — | Polígono de la manzana |
| `CODIGO` | String | **17** | Código de manzana de 17 dígitos |
| `BARRIO_COD` | String | **13** | Código de barrio de 13 dígitos |
| `CODIGO_ANT` | String | 254 | Código anterior de manzana; en la muestra tiene **13** caracteres |
| `GLOBALID_S` | String | 38 | Vacío |
| `SHAPE_Leng` / `SHAPE_Area` | Double | — | En grados / grados² |
| `GlobalID` | String | 254 | GUID |

Jerarquía verificada en la muestra: predio `084210100000000080013000000000` →
manzana `08421010000000008` → barrio `0842101000000`. El código de manzana es el
prefijo de 17 dígitos del NPN y el de barrio su prefijo de 13.

### 3.4 Capas que el plan nombra y **no** están en este servicio ✗

`U_SECTOR`, `U_BARRIO`, `U_PERIMETRO`, `U_NOMENCLATURA_VIAL`,
`U_NOMENCLATURA_DOMICILIARIA`, `R_SECTOR`, `R_VEREDA`, `R_NOMENCLATURA_*`
(PLAN.md §5.1) **no se publican por REST**. Se esperan en la GDB/GeoPackage
descargable, que todavía no se ha inspeccionado. Hasta entonces se marcan
`NO_DISPONIBLE`.

---

## 4. Número Predial Nacional (NPN) — descomposición observada ✔

Descomposición de los 30 dígitos aplicando la segmentación de PLAN.md §7 a las
20 muestras reales (5 por capa, todas del municipio **08421 — Malambo, Atlántico**):

| Tramo | Long. | `U_TERRENO` | `U_CONSTRUCCION` | `R_TERRENO` | `R_CONSTRUCCION` |
|---|---|---|---|---|---|
| Departamento | 2 | `08` | `08` | `08` | `08` |
| Municipio | 3 | `421` | `421` | `421` | `421` |
| **Zona** | 2 | **`01`** | **`01`** | **`00`** | **`00`** |
| Sector | 2 | `00` | `00` | `02` | `01` |
| Comuna | 2 | `00` | `00` | `00` | `00` |
| Barrio | 2 | `00` | `00` | `00` | `00` |
| Manzana / Vereda | 4 | `0008` | `0066` | `0001` | `0001` |
| Terreno | 4 | `0013` | `0001` | `0127` | `0520` |
| Condición | 1 | `0` | `0` | `0` | `0` |
| Edificio | 2 | `00` | `00` | `00` | `00` |
| Piso | 2 | `00` | `00` | `00` | `00` |
| Unidad | 4 | `0000` | `0000` | `0000` | `0000` |

### ⚠ Hallazgo crítico: el código de zona rural es `00`, no `02`

En las 10 muestras de capas rurales (`R_TERRENO`, `R_CONSTRUCCION`) el tramo de
zona vale **`00`**, y en las 10 urbanas vale **`01`**. Lo rural se distingue
además por el sector (`01`/`02` frente a `00` en lo urbano).

Esto **contradice** `packages/shared/src/constants.ts`, que declara
`ZONE = { URBAN: '01', RURAL: '02' }`, y hace que `validateNpn()` de
`packages/geo/src/npn.ts` **rechace todos los NPN rurales reales del IGAC**
(exige `zone ∈ {01, 02}`).

- Alcance de la evidencia: 20 filas, un solo municipio, un solo servicio. Es
  consistente al 100 % dentro de esa muestra pero **no es prueba nacional**.
- Decisión pendiente: confirmar contra la base descargable de un departamento
  completo antes de cambiar la constante. Registrado como riesgo de severidad
  alta en `data-catalog/RIESGOS.md` (`npn-zone-rural-00`).
- Ningún archivo de `packages/shared` ni `packages/geo` se modificó desde este
  paquete: la decisión y el cambio corresponden a quien los mantiene.

### Códigos derivados verificados

| Código | Longitud | Composición verificada | Ejemplo |
|---|---|---|---|
| NPN | 30 | completo | `084210100000000080013000000000` |
| Código anterior | 20 | los 20 primeros dígitos del NPN, **pero sin comuna ni barrio** | `08421010000080013000` |
| Manzana (`MANZANA_CO`) | 17 | dept+muni+zona+sector+comuna+barrio+manzana | `08421010000000008` |
| Barrio (`BARRIO_COD`) | 13 | dept+muni+zona+sector+comuna+barrio | `0842101000000` |
| Vereda (`VEREDA_COD`) | 17 | dept+muni+zona+sector+comuna+barrio+vereda | `08421000000000000` (en ceros, ver §5) |

**Ojo con el código anterior.** No es el prefijo de 20 del NPN. Comparando
`084210100000000080013000000000` (30) con `08421010000080013000` (20), el de 20
omite los cuatro dígitos de comuna+barrio. Es decir, `npn30to20()` de
`packages/geo/src/npn.ts`, que hace `slice(0, 20)`, **no reproduce el
`CODIGO_ANT` real del IGAC**. Registrado como riesgo `npn-20-digitos-no-es-prefijo`.

---

## 5. Calidad de los datos observada ✔

| Hallazgo | Evidencia | Consecuencia |
|---|---|---|
| `SHAPE_Area` y `SHAPE_Leng` vienen en **grados** | `SHAPE_Area: 2.47e-8` para un lote urbano | Inservibles como área. El área se calcula en PostGIS con `ST_Area(geom::geography)` o reproyectando a EPSG:9377 |
| `VEREDA_COD` llega en ceros | `08421000000000000` en las 5 filas de `R_TERRENO` | No se puede armar la jerarquía rural desde REST. Validación obligatoria en la ingesta |
| `GLOBALID_S` siempre vacío | `" "` en las 20 filas | Campo muerto; no usar como identificador |
| `codigo_mun` vacío en `R_CONSTRUCCION` | `" "` en las 5 filas | El municipio hay que derivarlo del NPN, no del campo |
| `ETIQUETA` siempre vacía | `" "` | Campo de dibujo, sin valor analítico |
| `FECHA_LOG` siempre `null` | 5 filas | No sirve para fechar el corte |
| `CODIGO_ANT` con longitudes declaradas distintas entre capas | 20 en `R_CONSTRUCCION`, 30 en `U_CONSTRUCCION`, 254 en `U_MANZANA` | La columna destino debe ser `VARCHAR` holgada y validarse por contenido, no por la longitud declarada |
| El servicio no declara licencia | `copyrightText: ""` | La atribución CC BY-SA 4.0 que exige PLAN.md §2 **no sale del servicio**: hay que sostenerla con el portal de datos abiertos |
| Sin dominios codificados | `domain: null` en los 68 campos | El diccionario de valores (`TIPO_CONST`, `TIPO_DOMIN`, destino económico…) debe salir de la GDB o de la norma |

---

## 6. Lo que **NO** se ha verificado ✗

Nada de esta sección puede usarse para declarar campos ni programar consultas.

| Elemento | Estado | Qué falta |
|---|---|---|
| **Base Catastral Pública descargable (GDB / GeoPackage) por departamento** | ✗ No descargada | El portal ArcGIS Hub del IGAC no expone una URL de descarga directa y estable localizable por API. Hay que obtenerla a mano y fijarla en `etl/config/datasets` |
| **Registro 1 (predial) y Registro 2 (propietarios)** | ✗ No inspeccionados | Son los que traen avalúo, destino económico, área de terreno y área construida — es decir, **todo lo que la ficha de predio necesita** — y también los datos de titularidad que hay que descartar |
| Capas `U_SECTOR`, `U_BARRIO`, `U_PERIMETRO`, `U_NOMENCLATURA_*`, `R_SECTOR`, `R_VEREDA` | ✗ No vistas | Solo se esperan en la GDB |
| Zonas homogéneas físicas y geoeconómicas | ✗ No localizadas como servicio nacional | PLAN.md §5.1 las pide para M3 y M9 |
| Avalúo catastral y destino económico | ✗ **No existen en ninguna fuente abierta inspeccionada** | Sin ellos, M3 (buscador por destino económico) y M9 (observatorio) quedan sin insumo |
| Dominios de `TIPO_CONST`, `TIPO_DOMIN`, `IDENTIFICA` | ✗ Solo se vio un valor de cada uno | `CONVENCIONAL`, `PRIVADO`, `A/B/D`. El catálogo completo no está publicado |
| Estructura de los cortes mensuales / históricos (M8) | ✗ No verificada | Sin conocer el empaquetado, no se puede diseñar el `diff` |

### Por qué `FID` no sirve como identificador estable

`FID` es el OID que ArcGIS Server asigna al publicar. Cambia con cada
republicación del servicio. La clave del producto es el **NPN (`CODIGO`)**, y
para las construcciones la pareja `CODIGO` + `CODIGO_EDI` + `IDENTIFICA`
(en la muestra hay varias construcciones con el mismo `CODIGO` y distinto
`IDENTIFICA`, p. ej. `084210100000000660001000000000` con `IDENTIFICA` `B` y `D`).

---

## 7. Consecuencias para el modelo de datos (PLAN.md §7)

| Columna de `core.parcel` | ¿Se puede llenar desde REST? | Origen real |
|---|---|---|
| `npn` | ✔ | `CODIGO` |
| `npn_old` | ✔ | `CODIGO_ANT` (⚠ no es el prefijo de 20 del NPN) |
| `muni_code` | ✔ derivado | primeros 5 dígitos de `CODIGO` (no de `codigo_mun`, que viene vacío) |
| `zone` | ✔ derivado, **con la salvedad de §4** | dígitos 6–7 de `CODIGO` |
| `manzana_vereda` | ✔ | `MANZANA_CO` / `VEREDA_COD` (esta última, en ceros) |
| `geom`, `centroid` | ✔ | `Shape`, reproyectado 4686 → 4326 |
| `area_geom_m2` | ✔ calculado | `ST_Area` en EPSG:9377. **No** desde `SHAPE_Area` |
| `area_reported_m2` | ✗ | Registro 1 (sin inspeccionar) |
| `built_area_m2` | ✗ | Registro 1 |
| `economic_use` | ✗ | Registro 1 |
| `address` | ✗ | Registro 1 / `U_NOMENCLATURA_DOMICILIARIA` |
| `cadastral_value`, `valuation_year` | ✗ | Registro 1 |

| Columna de `core.building` | ¿Desde REST? | Origen |
|---|---|---|
| `parcel_npn` | ✔ | `TERRENO_CO` (o `CODIGO`) |
| `floors` | ✔ | `NUMERO_PIS` |
| `geom` | ✔ | `Shape` |
| `attrs` | ✔ parcial | `TIPO_CONST`, `TIPO_DOMIN`, `NUMERO_SOT`, `NUMERO_MEZ`, `NUMERO_SEM`, `IDENTIFICA`, `CODIGO_EDI` |
| `built_area_m2` | ✗ | Registro 1 (el área del polígono no es el área construida: hay que multiplicar por pisos y eso es una estimación, no un dato) |
| `use` | ✗ | Registro 1 |

**Conclusión de diseño.** Con la fuente REST sola se puede construir el mapa y la
identificación del predio (M1 y la mitad de M2), pero **no** la ficha económica ni
el buscador por destino económico (M3) ni el observatorio (M9). Descargar la base
departamental completa con sus Registros 1 y 2 es el bloqueante número uno para el
MVP.

---

## 8. Cómo reproducir esta inspección

```bash
pnpm catalog:crawl -- --source igac-arcgis --max-services 1
# o, contra un solo servicio:
npx tsx packages/sources/src/cli/crawl.ts --source igac-arcgis --max-per-folder 1
```

La evidencia cruda queda en
`data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`, con los campos,
los conteos, la extensión y las muestras ya filtradas de PII.
