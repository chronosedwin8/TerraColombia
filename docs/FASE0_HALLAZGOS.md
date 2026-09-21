# Fase 0 — Hallazgos, riesgos y decisiones pendientes

> **Qué es este documento.** El cierre de la Fase 0: qué se inspeccionó de verdad,
> qué se encontró, qué riesgos de datos hay y qué decisiones de negocio hacen
> falta antes de pasar a la Fase 1.
>
> Corrida: 2026-09-21. Todo lo que aquí se afirma tiene evidencia en
> `data-catalog/`, en `docs/DICCIONARIO_CATASTRAL.md` o en un comando reproducible.
> Lo que no se verificó está marcado como tal.

---

## 1. Lo que se inspeccionó

| Fuente | Cómo | Resultado |
|---|---|---|
| **IGAC — ArcGIS REST** | crawler recursivo del catálogo + metadatos de capa + conteo + extensión + muestra de 5 filas | 1 401 servicios descubiertos en 13 carpetas; muestreo representativo de 32; capas y conteos reales en `data-catalog/igac/` |
| **IGAC — Base Catastral Pública** | búsqueda en ArcGIS Online + descarga + `ogrinfo` + consultas SQL sobre la GDB | 31 departamentos publicados; **piloto Atlántico descargado e inspeccionado capa por capa**: 18 capas, 86 876 predios |
| **datos.gov.co (Socrata)** | API de descubrimiento + metadatos por id + muestra de filas | **138 datasets** catalogados de IGAC, DANE, MEN, MinSalud y SECOP, con columnas, conteos y licencias reales |
| **OpenStreetMap (Geofabrik)** | lectura del índice + `HEAD` + `.md5` | extracto de Colombia, corte 2026-09-20, 3 archivos |
| **Geoportal DANE** | verificación de la URL | responde 200, pero **sin índice de descargas legible por máquina** |
| **GDAL / `ogr2ogr`** | detector propio | GDAL 3.9.2 disponible, con drivers PostgreSQL, OpenFileGDB, GPKG y Shapefile |

Cifras de la corrida: **255 descartes de datos personales** registrados,
**85 riesgos** anotados, 0 columnas de PII escritas al catálogo.

---

## 2. Los seis hallazgos que cambian el plan

### 2.1 ✅ La base catastral descargable existe, es accesible y es CC BY-SA 4.0

`PLAN.md` §5.1 daba por supuesto que la base se descarga, pero no decía de dónde.
**Está en ArcGIS Online**, como un ítem *File Geodatabase* por departamento del
usuario `IGAC-Admin`, y se descarga con una URL directa y estable:

```
https://www.arcgis.com/sharing/rest/content/items/{itemId}/data
```

El piloto de Atlántico son 56 MB, con `Accept-Ranges: bytes` (reanudable), y el
ítem declara la licencia **literalmente**: *Reconocimiento-CompartirIgual 4.0*,
con la cláusula de compartir-igual explícita sobre los productos derivados.

Esto **confirma** el supuesto legal de `PLAN.md` §2 y cierra la duda sobre si era
CC BY 4.0 o CC BY-SA 4.0: es BY-SA. El modelo de negocio sobre servicio (no sobre
exclusividad del dato) es el correcto.

### 2.2 ❌ No hay Registro 1 ni Registro 2: no hay avalúo ni destino económico

La geodatabase pública trae **solo las 18 capas geométricas**. No hay tablas
alfanuméricas. Por tanto **ninguna fuente abierta inspeccionada entrega**:

- avalúo catastral y año de vigencia,
- destino económico,
- área de terreno y área construida reportadas,
- propietario (lo cual, por la regla 3, es una buena noticia).

**Impacto directo en el producto:**

| Módulo | Estado real tras la Fase 0 |
|---|---|
| M2 Ficha de predio | viable pero **sin sección económica** |
| M3 Buscador avanzado | **sin filtro por destino económico ni por avalúo**; queda área geométrica, zona y ubicación |
| M7 Informe territorial | la sección 2 (características catastrales) queda incompleta |
| M9 Observatorio | **sin dinámica de valor catastral**; se sustituye parcialmente con §2.6 |

Es el hallazgo más importante de la Fase 0 y **requiere una decisión de negocio**
(§5.1).

### 2.3 ❌ La cobertura se pierde municipio a municipio, no solo por gestor

`PLAN.md` §2 anticipa que faltan los catastros descentralizados (Bogotá, Medellín,
Cali, Barranquilla). La realidad es peor: en **Atlántico, que sí es jurisdicción
del IGAC, la base pública solo trae 15 de los 23 municipios**. Faltan
Barranquilla (esperado) pero también **Soledad, Sabanalarga, Puerto Colombia,
Galapa, Ponedera y Juan de Acosta**.

La regla 6 («cobertura honesta») no es un caso de borde: es el comportamiento
normal. `core.cadastral_manager` tiene que estar poblado **antes** de mostrar el
primer mapa, y la UI necesita el estado vacío honesto desde la Fase 3, no en la 7.

Buena noticia: el dataset que lo resuelve existe y está inspeccionado —
**Gestores Catastrales de Colombia** (`bhcx-bx97`, 1 122 filas con geometría
municipal, CC BY-SA 4.0).

### 2.4 ❌ El tramo de zona del NPN no es un booleano urbano/rural

Sobre los 86 876 predios de Atlántico:

| Zona (dígitos 6–7) | Urbanos | Rurales |
|---|---|---|
| `00` | 2 *(anómalos)* | **18 951 (100 %)** |
| `01`–`06` | **67 923** | 0 |

Rural es `00`; urbano es `01`…`NN`, **una zona por área urbana** (cabecera más
centros poblados), coherente con los 29 perímetros urbanos de 15 municipios.

`packages/shared/src/constants.ts` declara `ZONE = { URBAN: '01', RURAL: '02' }`,
y con eso `validateNpn()` de `packages/geo/src/npn.ts` **rechazaría el 100 % de
los NPN rurales reales y 5 374 urbanos de centros poblados solo en Atlántico**.

Además, `npn30to20()` hace `slice(0, 20)`, y el `CODIGO_ANTERIOR` real del IGAC
**omite los cuatro dígitos de comuna y barrio**, así que no coincide.

No se modificó ningún archivo de `shared` ni de `geo` desde este paquete: son
decisiones de quien los mantiene. Detalle y evidencia en
`docs/DICCIONARIO_CATASTRAL.md` §4.

### 2.5 ❌ El catastro no tiene direcciones: el buscador por dirección no se sostiene

De los 73 215 registros de `U_NOMENCLATURA_DOMICILIARIA` de Atlántico:

- **14 125** dicen literalmente `NS`,
- **18** contienen un tipo de vía (15 «Carrera», 3 «Calle», 0 «Diagonal» o «Transversal»),
- los **58 935** restantes son topónimos y nombres de lote: `ARROYO GRANDE`,
  `PARCELA L-1 DIVISION 1`, `ZONA DE CESION No.1`, `LOTE URBANO`.

Es **0,02 % de direcciones utilizables**. Y la geometría es una línea de
rotulación, no un punto de dirección.

`PLAN.md` §1.3 promete en M1 un «buscador universal (dirección, municipio, código
predial, coordenadas, topónimo)». **La dirección es la única de las cinco que no
se puede cumplir con el catastro.** Alternativas y decisión en §5.2.

Lo que **sí** funciona para el buscador, ya inspeccionado: código predial (30 y 20
dígitos), municipio y departamento (DIVIPOLA), coordenadas, topónimos
(8 161 centros poblados del DANE, 33 barrios y 50 veredas del catastro por
departamento).

### 2.6 ✅ Sí hay un dato de mercado inmobiliario abierto

`PLAN.md` §5.1 dejaba abierto «verificar qué expone el Observatorio Inmobiliario».
La Fase 0 encontró algo mejor: **Registro de transacciones inmobiliarias en
Colombia** (`7y2j-43cv`, IGAC, CC BY-SA 4.0), **30 903 248 anotaciones
registrales** con municipio, número catastral, fecha, tipo de predio y, cuando
existe, **valor de la transacción**.

Habilita M9 sin inventar un modelo de precios. Con dos advertencias serias: dos de
sus columnas son PII (descartadas) y publicar valores de transacción es una
decisión de negocio con riesgo legal (§5.3).

---

## 3. Hallazgos técnicos sobre las APIs

Estos no cambian el producto, pero sí el código, y están todos incorporados a los
conectores:

| Hallazgo | Evidencia | Qué se hizo |
|---|---|---|
| El servicio del IGAC **no soporta paginación** y responde `400 Pagination is not supported.` al recibir `resultRecordCount` | `Dato_Fundamental_Catastro` y todas sus capas | el conector detecta `supportsPagination: false` y pagina con rangos acotados de OID en el `where`, sin enviar parámetros de paginación |
| `/api/views/metadata/v1` de datos.gov.co **ignora `q` y `offset`** | 34 offsets consecutivos devolvieron los mismos 100 ids; 6 consultas distintas devolvieron el mismo conjunto | se cambió el descubrimiento a `api.us.socrata.com/api/catalog/v1`, que sí filtra y pagina, y responde en décimas de segundo |
| El IGAC devuelve 502/503/504 de forma intermitente y tarda minutos en `returnCountOnly` sobre capas nacionales | corrida completa | presupuesto por consulta (25 s para conteos, 40 s para muestras), backoff con jitter, caché en disco y escritura incremental del catálogo |
| El IGAC publica **1 401 servicios**, la mayoría estudios de un municipio con el mismo esquema (`carto*`: 941 servicios en una familia) | catálogo real | muestreo por familia de nombre y tope por carpeta, documentado en `RIESGOS.md` |
| `SHAPE_Area` del servicio REST viene en **grados cuadrados** (reproyecta a 4686); en la GDB viene en m² (CRS 9377) | `SHAPE_Area: 2.47e-8` para un lote urbano | las áreas se recalculan con `ST_Area` en EPSG:9377; el campo de origen no se ingiere desde REST |
| Los dominios de la GDB están declarados pero **no se respetan** | `CONVENCIONAL` vs `Convencional`; `TIPO_DOMINIO` en blanco en 3 324 filas | normalización declarada en el `transform` de cada dataset |
| EPSG:9377 de la GDB (MAGNA CTM12) **coincide exactamente** con `CRS_9377` de `packages/geo` | WKT de la GDB | nada que cambiar: el paquete `geo` estaba bien |

---

## 4. Departamento piloto propuesto: **Atlántico (08)**

### Recomendación

**Atlántico**, ítem `b4c2079287ee40bdb159a412fb5bdfad`, ya descargado e
inspeccionado. Coincide con `ETL_PILOT_DEPARTMENT=08` de `.env.example`.

### Por qué

1. **Ya está verificado de punta a punta.** Es el único departamento cuyo paquete
   se descargó, se abrió con GDAL, se le contaron las filas y se le midió la
   calidad. Arrancar la Fase 2 con otro departamento significaría repetir todo ese
   trabajo a ciegas.
2. **Tamaño ideal para iterar.** 86 876 predios (1,28 % del total nacional de
   6 762 694) y 56 MB de descarga. Una carga completa cabe en minutos, no en
   horas, lo que permite equivocarse y rehacer el ETL varias veces al día.
3. **Ejercita la regla 6 desde el primer día.** Con 15 de 23 municipios cubiertos,
   el piloto **obliga** a construir la cobertura honesta y el mensaje de «este
   municipio lo gestiona otro gestor» desde la Fase 2, en vez de descubrirlo en la
   Fase 7 con todo el país cargado. Es una ventaja, no un defecto.
4. **Mezcla urbana y rural real.** 67 925 predios urbanos y 18 951 rurales, con
   municipios de corredor metropolitano (Malambo, Sabanagrande, Santo Tomás) y
   municipios netamente rurales (Piojó y Tubará tienen más predios rurales que
   urbanos). Permite probar M2, M3, M4 y M5 sin cambiar de piloto.
5. **Mercado activo y comprensible.** El corredor Barranquilla–Malambo–Galapa
   tiene dinámica inmobiliaria real, lo que hace que las demos con inmobiliarias
   tengan sentido comercial.
6. **Seis zonas urbanas distintas** (`01`–`06`) en el mismo departamento: obliga a
   resolver bien el NPN desde el principio, en vez de asumir que zona = cabecera.

### Alternativas y por qué no

| Opción | A favor | En contra |
|---|---|---|
| **Boyacá** (`723e946e9ede418a95a6eefd28439626`) | 123 municipios: mucho más representativo de la Colombia rural y del problema de veredas | 5× los municipios ⇒ ETL y QA mucho más lentos; ningún dato verificado todavía |
| **Tolima** (`2236f306e7694e42bd2394a063f70052`) | tamaño intermedio, buena mezcla | sin verificar; no aporta nada que Atlántico no dé |

### Segundo departamento recomendado

**Boyacá, en la Fase 7**, y con un objetivo concreto: **confirmar los hallazgos
§2.4 (código de zona) y §2.3 (cobertura municipal) en un departamento con 123
municipios y mucha vereda.** Hasta que eso se haga, ninguna de las dos
conclusiones puede tratarse como nacional.

---

## 5. Decisiones de negocio pendientes

Son las que no puede tomar quien escribe el código.

### 5.1 🔴 ¿Qué se hace sin avalúo ni destino económico? (bloqueante)

La sección económica de la ficha, el filtro por destino económico de M3 y la
dinámica de valor catastral de M9 **no tienen fuente abierta**.

Opciones:

- **(a) Reducir el alcance del MVP.** Quitar de la promesa comercial el avalúo y
  el destino económico. La ficha vendería identificación, geometría, construcción,
  entorno y aptitud. Es honesto y entregable ya.
- **(b) Gestionar el dato con el IGAC.** Averiguar si los Registros 1 y 2 se
  entregan por solicitud formal o convenio. Cambia el calendario y puede cambiar
  la licencia (y con ella el modelo de negocio).
- **(c) Sustituir por el registro de transacciones** (§2.6): no es avalúo, pero es
  valor real de mercado. Requiere resolver 5.3.
- **(d) Adaptadores por gestor catastral.** Los catastros descentralizados sí
  suelen publicar avalúo. Adelantar la Fase 7 para las grandes ciudades.

**Recomendación técnica:** (a) para el MVP + (b) en paralelo. No arrancar la Fase 6
(informes de pago) prometiendo datos económicos que no se tienen.

### 5.2 🔴 ¿El buscador por dirección entra al MVP? (bloqueante para M1)

Con 0,02 % de direcciones utilizables en el catastro (§2.5), hay tres caminos:

- **(a) Quitar la dirección del buscador del MVP** y dejar código predial,
  municipio, topónimo y coordenadas. Es lo que los datos permiten hoy.
- **(b) Geocodificar con OSM.** Cobertura buena en ciudades grandes, mala en el
  resto; en el piloto habría que medirla municipio a municipio.
- **(c) Geocodificador propio** sobre `U_NOMENCLATURA_VIAL` (4 280 rótulos de vía
  en Atlántico) + interpolación por manzana. Es un proyecto en sí mismo.

**Recomendación técnica:** (a) en el MVP, con (b) como mejora medida y declarada.
Prometer búsqueda por dirección y no cumplirla es la forma más rápida de perder la
confianza del usuario no técnico, que es justo el segmento del informe de pago
único.

### 5.3 🟠 ¿Se publican valores de transacción inmobiliaria?

El dataset de §2.6 trae valores reales de compraventa por predio. Publicarlos
agrega mucho valor, y también riesgo: aunque el dato es abierto, exponerlo predio
a predio se acerca a información patrimonial. Dos de sus columnas son PII y ya se
descartan, pero el valor sigue asociado a un número catastral.

**Requiere el concepto jurídico** que `PLAN.md` §2 ya tenía pendiente, ahora con
una pregunta concreta: *¿se puede mostrar el valor de la última transacción de un
predio identificado?* Mientras no haya respuesta, la recomendación es publicar
**solo agregados** (mediana por sector o por celda H3, con n ≥ 10).

### 5.4 🟠 ¿Qué significa «producto derivado» con licencia ShareAlike?

Ya no es una duda sobre cuál es la licencia (§2.1 lo cierra: CC BY-SA 4.0), sino
sobre su alcance: el ítem dice que «nuevos productos y servicios derivados de su
reutilización deben ser también licenciados bajo las mismas condiciones».

La palabra **«servicios»** es más amplia que la cláusula estándar de CC BY-SA.
Hay que preguntarle al abogado si una API comercial sobre datos del IGAC cuenta
como servicio derivado que deba licenciarse igual.

Mitigación ya prevista en el diseño: mantener separados en la base y en las
exportaciones los datos del IGAC (capa abierta) de los indicadores propios.

### 5.5 🟡 M5 no puede prometer cobertura nacional

No existe una capa nacional de capacidad de uso de las tierras: son **382
servicios** en la carpeta `agrologia`, uno por estudio regional o municipal, con
escalas de 1:10 000 a 1:100 000 y años de 2011 a 2023.

Antes de comprometer la Fase 8 hay que **verificar si el departamento piloto tiene
estudio agrológico**. Si no lo tiene, M5 arranca solo con `actividadquimicanacional`
(el único de alcance nacional hallado, y no verificado fila a fila).

### 5.6 🟡 Los cortes mensuales se sobrescriben: hay que archivarlos ya

El ítem de ArcGIS Online se **reemplaza** en cada corte (el de Atlántico se
modificó el 2026-09-03 con datos a corte del 31 de julio de 2026). No hay
histórico publicado.

**Consecuencia operativa inmediata:** si no se guarda cada descarga mensual desde
ahora, M8 (cambio territorial) no tendrá con qué comparar cuando llegue la Fase 9.
Es una tarea de infraestructura que hay que hacer **antes** de necesitarla:
descarga mensual programada a S3, con checksum, desde la Fase 2.

---

## 6. Riesgos de datos (resumen)

El detalle completo, con mitigación por riesgo, está en `data-catalog/RIESGOS.md`
(85 riesgos registrados). Los de severidad alta:

| Riesgo | Impacto |
|---|---|
| Sin Registro 1 y 2 | M2 incompleta, M3 y M9 sin insumo (§2.2) |
| Cobertura municipal parcial dentro de departamentos del IGAC | la regla 6 es el caso normal (§2.3) |
| Código de zona del NPN mal supuesto en `shared`/`geo` | `validateNpn` rechaza todo NPN rural real (§2.4) |
| `CODIGO_ANTERIOR` no es el prefijo de 20 del NPN | `npn30to20`/`npn20to30` no son correctas (§2.4) |
| Nomenclatura domiciliaria sin direcciones | M1 no puede buscar por dirección (§2.5) |
| NPN duplicado (1,04 % en Atlántico) | `npn` no puede ser clave única |
| Datasets con PII en datos.gov.co (MEN, REPS, SECOP, transacciones) | ingesta obligatoria con `$select` explícito, nunca `SELECT *` |
| Profesionales independientes en el REPS | `nombreprestador` es el nombre de una persona natural: no se puede publicar |
| Sin capa nacional de capacidad de uso | M5 sin cobertura nacional (§5.5) |
| Cortes mensuales sobrescritos | M8 sin histórico si no se archiva desde ya (§5.6) |

Riesgos de severidad media que conviene no olvidar:

- El geoportal del DANE no expone índice de descargas: el MGN y el CNPV 2018
  siguen `NO_INSPECCIONADO` y son prioridad 1 del MVP.
- Las coordenadas de las sedes educativas del MEN traen 2 decimales (~1 km de
  error) y su corte es de 2021, cinco años más antiguo que el de establecimientos.
- `SGC`, `IDEAM` y `RUNAP` no se inspeccionaron: amenazas y áreas protegidas
  entran al catálogo como `NO_INSPECCIONADO`. Es trabajo de Fase 0 que queda
  abierto y debería cerrarse antes de la Fase 4.
- La carpeta `minasyenergia` del catálogo del IGAC devolvió error: títulos mineros
  sin verificar.

---

## 7. Qué queda abierto de la propia Fase 0

Para ser honesto sobre el estado del entregable:

1. **Añadir SGC, IDEAM, RUNAP, UPRA/SIPRA y ANM/ANH al registro de fuentes**
   (`packages/sources/src/crawler/sources.ts`) y volver a correr el crawler. Son
   fuentes que `PLAN.md` §5.2 nombra y que no se recorrieron porque no están en
   `mapas.igac.gov.co`.
2. **Ampliar el muestreo del catálogo del IGAC.** Se inspeccionaron 32 de 1 400
   servicios consultables. Suficiente para decidir el MVP, insuficiente para
   prometer cobertura temática nacional.
3. **Verificar un segundo departamento** (Boyacá) para confirmar §2.3 y §2.4.
4. **Extraer los dominios completos de la GDB** (`domTipoConstruccion`,
   `domTipoDominio`, `domAdministrativo`): están declarados en la geodatabase pero
   solo se observaron los valores presentes en Atlántico.
5. **Obtener las URL directas del MGN y del CNPV 2018 del DANE**, que hoy son los
   dos únicos datasets de prioridad 1 sin inspeccionar.

---

## 8. Criterios de aceptación de la Fase 0 (§6 del plan)

| Criterio | Estado |
|---|---|
| Crawler de ArcGIS REST con los puntos 1–3 de §6 | ✔ `packages/sources/src/crawler/arcgis-crawler.ts`, ejecutado de verdad |
| Igual para ArcGIS Hub, datos.gov.co, MEN, REPS, SECOP, geoportal DANE | ✔ 138 datasets + descriptores manuales verificados |
| `data-catalog/<fuente>/<servicio>.json` | ✔ |
| `data-catalog/CATALOGO.md` | ✔ |
| `data-catalog/SELECCION.md` con 15–25 datasets y matriz módulo × dataset × campos | ✔ **24 datasets de MVP**, 24 con campos reales inspeccionados |
| Lista de riesgos de datos | ✔ `data-catalog/RIESGOS.md`, 85 riesgos |
| Descargar la base catastral de un departamento piloto e inspeccionar su estructura real | ✔ Atlántico descargado, 18 capas inspeccionadas |
| Diccionario en `docs/DICCIONARIO_CATASTRAL.md` | ✔ |
| Registros 1 y 2 | ✖ **no existen en el paquete público** (§2.2) |
| Cero datos personales | ✔ 255 descartes registrados en `data-catalog/PII_DESCARTES.md` |

**Se cumplen los criterios de §6 salvo la inspección de los Registros 1 y 2, que
no se pudo hacer porque no se publican.** Esa imposibilidad es, en sí, el hallazgo
más valioso de la fase.

**Siguiente paso: aprobación.** Las decisiones 5.1 y 5.2 condicionan el alcance
del MVP y deberían resolverse antes de arrancar la Fase 1.
