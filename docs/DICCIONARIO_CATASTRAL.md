# Diccionario catastral — estructura real observada (Fase 0)

> **Qué es este documento.** El diccionario de la estructura catastral del IGAC
> **tal como la entregan sus fuentes**, no como la describe la norma. Lo marcado
> ✔ se inspeccionó de verdad; lo marcado ✗ **no está verificado** y no puede
> usarse para programar nada (regla 2 de `CLAUDE.md`).
>
> **Fecha de inspección:** 2026-09-21.
>
> **Dos fuentes, dos esquemas distintos de la misma información:**
>
> | | Base Catastral Pública (descarga) | Dato Fundamental Catastro (REST) |
> |---|---|---|
> | Acceso | GDB por departamento, ArcGIS Online | `mapas.igac.gov.co/server/rest/services` |
> | Capas | **18** | 5 |
> | CRS | **EPSG:9377** (métrico) | EPSG:4686 (grados) |
> | Nombres de campo | completos (`TERRENO_CODIGO`) | truncados a 10 (`TERRENO_CO`) |
> | Dominios | declarados (`domTipoConstruccion`) | ninguno |
> | Áreas | en m², utilizables | en grados², inservibles |
> | Licencia | **CC BY-SA 4.0 explícita** | no declarada |
> | Papel en el producto | **fuente primaria** | respaldo y control de cobertura |
>
> **Evidencia:** `data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`
> (servicio) y el paquete `08_ATLANTICO.zip` del departamento piloto
> (SHA-256 `11647eeb3dbe5db92d514c87095ae1a665cd16f4b109fa55f893dcb20519eaeb`).

---

## 0. Resumen ejecutivo

| Pregunta | Respuesta verificada |
|---|---|
| ¿Existe la base catastral descargable? | **Sí.** 31 departamentos publicados como *File Geodatabase* en ArcGIS Online, ítem por departamento ✔ |
| ¿Con qué licencia? | **CC BY-SA 4.0**, declarada literalmente en el ítem, con la cláusula de compartir-igual explícita ✔ |
| ¿Qué capas trae? | 18: la jerarquía urbana y rural completa, incluidas las que el servicio REST no publica ✔ |
| ¿Trae avalúo catastral o destino económico? | **NO.** No hay Registro 1 ni Registro 2 en el paquete público ✔ |
| ¿Trae datos de propietario? | **NO.** Ninguna de las 18 capas tiene columna de titularidad ✔ |
| ¿Trae la dirección del predio? | Formalmente sí, en la práctica **no**: de 73 215 registros de nomenclatura en Atlántico, 18 contienen un tipo de vía ✔ |
| ¿El NPN es clave única? | **No.** 706 duplicados sobre 67 925 predios urbanos de Atlántico (1,04 %) ✔ |
| ¿El tramo de zona del NPN distingue urbano de rural? | **No** como booleano: rural = `00`, urbano = `01`…`06` (una por área urbana) ✔ |
| ¿Se puede servir desde el REST en vivo? | **No.** Sin paginación, `maxRecordCount` 2 000, 6,7 millones de predios ✔ |

---

## 1. La descarga: Base Catastral Pública por departamento ✔

### 1.1 Cómo se localiza

Los paquetes departamentales son ítems de ArcGIS Online del usuario `IGAC-Admin`
(organización `RVvWzU3lgJISqdke`). Se listan con la API de búsqueda de ArcGIS:

```
https://www.arcgis.com/sharing/rest/search?f=json&num=100
  &q=owner:IGAC-Admin AND type:"File Geodatabase"
```

→ 34 ítems, de los cuales **31 son Bases Catastrales Públicas departamentales**
(los otros tres son curvas de nivel, gestores catastrales y POT/usos/cultivos).

La descarga de un ítem es:

```
https://www.arcgis.com/sharing/rest/content/items/{itemId}/data
```

### 1.2 El paquete del piloto (Atlántico) ✔

| Propiedad | Valor verificado |
|---|---|
| Ítem | `b4c2079287ee40bdb159a412fb5bdfad` |
| Título | «Base Catastral Pública del Departamento Atlántico» |
| Archivo | `08_ATLANTICO.zip` |
| Tamaño | 56 609 544 bytes (54,0 MiB); 134,2 MiB descomprimido, 134 entradas |
| `Accept-Ranges` | `bytes` → la descarga es reanudable |
| SHA-256 | `11647eeb3dbe5db92d514c87095ae1a665cd16f4b109fa55f893dcb20519eaeb` |
| Contenido | una única geodatabase `08.gdb` (driver GDAL `OpenFileGDB`) |
| Corte declarado | «a corte de 31 de julio de 2026»; ítem publicado el 2026-09-03 |
| Licencia | **CC BY-SA 4.0** (texto completo en §1.3) |

### 1.3 Licencia, textual ✔

> «Este producto adopta la licencia pública internacional de
> Reconocimiento-CompartirIgual 4.0 de Creative Commons, *Creative Commons
> attribution – ShareAlike 4.0 Internacional*. Por tal razón, nuevos productos y
> servicios derivados de su reutilización deben ser también licenciados bajo las
> mismas condiciones de uso y disponibilidad que habilitó la licencia antes
> mencionada. Lo anterior, sin perjuicio de los derechos de autor y propiedad
> intelectual del Instituto Geográfico Agustín Codazzi, con base en la Ley 23 de
> 1982 y demás normas concordantes.»

Esto **confirma** el supuesto de `PLAN.md` §2 y deja la cláusula *ShareAlike*
fuera de discusión: se aplica a los productos derivados que se redistribuyan.
Sigue pendiente el concepto de abogado sobre qué cuenta como «producto derivado
redistribuido» frente a «servicio» (§9 de este documento).

### 1.4 CRS ✔

La geodatabase está en **MAGNA CTM12**, que es EPSG:9377
(MAGNA-SIRGAS / Origen-Nacional). Parámetros leídos del WKT de la GDB:

| Parámetro | Valor en la GDB | Valor en `packages/geo/src/crs.ts` |
|---|---|---|
| Método | Transverse Mercator | Transverse Mercator |
| Latitud de origen | 4 | 4 |
| Longitud de origen | −73 | −73 |
| Factor de escala | 0,9992 | 0,9992 |
| Falso Este | 5 000 000 m | 5 000 000 m |
| Falso Norte | 2 000 000 m | 2 000 000 m |
| Elipsoide / datum | GRS 1980 / MAGNA-SIRGAS (EPSG 6686) | GRS 1980 / MAGNA-SIRGAS |

Coinciden exactamente. `CRS_9377` del paquete `geo` es correcto y sirve tal cual
para insertar el SRID en `spatial_ref_sys`.

Consecuencia práctica: **las áreas y los perímetros de la GDB están en metros y
son utilizables** (`SHAPE_Area` de `U_TERRENO` en Atlántico: mín 5,1 m², media
489,6 m², máx 1 030 087 m², ningún cero). Aun así se recalculan con `ST_Area` en
9377 para no depender del dato de origen.

---

## 2. Las 18 capas de la geodatabase ✔

Conteos reales del departamento piloto (Atlántico, 15 municipios con datos).

### Grupo `URBANO`

| Capa | Geometría | Registros | Papel |
|---|---|---|---|
| `U_TERRENO` | MultiPolygon | **67 925** | el predio urbano |
| `U_CONSTRUCCION` | MultiPolygon | **89 697** | huella de construcción |
| `U_MANZANA` | MultiPolygon | **5 164** | manzana |
| `U_BARRIO` | MultiPolygon | **33** | barrio, **con nombre** |
| `U_SECTOR` | MultiPolygon | **38** | sector catastral |
| `U_PERIMETRO` | MultiPolygon | **29** | perímetro urbano / centro poblado |
| `U_NOMENCLATURA_DOMICILIARIA` | MultiLineString | **73 215** | rótulo de dirección |
| `U_NOMENCLATURA_VIAL` | MultiLineString | **4 280** | rótulo de vía |
| `U_TERRENO_INFORMAL` | MultiPolygon | **0** | ocupación informal |
| `U_CONSTRUCCION_INFORMAL` | MultiPolygon | **0** | ídem |

### Grupo `RURAL`

| Capa | Geometría | Registros | Papel |
|---|---|---|---|
| `R_TERRENO` | MultiPolygon | **18 951** | el predio rural |
| `R_CONSTRUCCION` | MultiPolygon | **18 310** | huella de construcción |
| `R_VEREDA` | MultiPolygon | **50** | vereda, **con nombre** |
| `R_SECTOR` | MultiPolygon | **40** | sector rural |
| `R_NOMENCLATURA_DOMICILIARIA` | MultiLineString | **11 856** | rótulo de dirección |
| `R_NOMENCLATURA_VIAL` | MultiLineString | **14** | rótulo de vía |
| `R_TERRENO_INFORMAL` | MultiPolygon | **0** | ocupación informal |
| `R_CONSTRUCCION_INFORMAL` | MultiPolygon | **0** | ídem |

Además hay una relación declarada: `R_SECTOR_VEREDA` (asociación
`R_SECTOR` ↔ `R_VEREDA`).

**Total de predios en Atlántico: 86 876** (67 925 urbanos + 18 951 rurales).

Las cuatro capas `*_INFORMAL` existen con esquema pero vacías en Atlántico. Hay
que comprobarlas en otro departamento antes de decir que el IGAC no publica
ocupación informal.

---

## 3. Campos, capa por capa ✔

Todos los campos llevan `GLOBALID` (NOT NULL), `SHAPE_Length`, `SHAPE_Area`
(solo polígonos), `codigo_municipio` (String 5) y `CODIGO_DEPARTAMENTO`
(String 2). En las tablas de abajo esos comunes se omiten salvo cuando hay algo
que decir.

### 3.1 `U_TERRENO` — el predio urbano

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `CODIGO` | String(30) | NOT NULL | **NPN de 30 dígitos**. No es único (§4.3) |
| `MANZANA_CODIGO` | String(17) | sí | llave a `U_MANZANA.CODIGO` |
| `NUMERO_SUBTERRANEOS` | Integer | NOT NULL, def. 0 | |
| `CODIGO_ANTERIOR` | String(20) | sí | código de 20 dígitos; **no** es el prefijo del NPN (§4.4) |

### 3.2 `R_TERRENO` — el predio rural

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `CODIGO` | String(30) | NOT NULL | NPN |
| `VEREDA_CODIGO` | String(17) | sí | llave a `R_VEREDA.CODIGO`. **En la GDB sí viene poblado**; en el servicio REST llega en ceros |
| `NUMERO_SUBTERRANEOS` | Integer | NOT NULL, def. 0 | |
| `CODIGO_ANTERIOR` | String(20) | sí | |

### 3.3 `U_CONSTRUCCION` y `R_CONSTRUCCION` — la construcción

| Campo | Tipo | Nulo | Notas |
|---|---|---|---|
| `CODIGO` | String(30) | NOT NULL | NPN del predio |
| `TERRENO_CODIGO` | String(30) | sí | llave al terreno |
| `TIPO_CONSTRUCCION` | String(20) | NOT NULL, def. `'CONVENCIONAL'` | dominio `domTipoConstruccion` |
| `TIPO_DOMINIO` | String(20) | NOT NULL, def. `'PRIVADO'` | dominio `domTipoDominio` |
| `NUMERO_PISOS` | Integer | NOT NULL, def. 0 | **único indicador volumétrico** |
| `NUMERO_SOTANOS` | Integer | NOT NULL, def. 0 | |
| `NUMERO_MEZANINES` | Integer | NOT NULL, def. 0 | |
| `NUMERO_SEMISOTANOS` | Integer | NOT NULL | |
| `ETIQUETA` | String(50) | sí | etiqueta de dibujo |
| `IDENTIFICADOR` | String(20) | NOT NULL en R, def. `'A'` | distingue unidades dentro del terreno |
| `CODIGO_EDIFICACION` | Integer | sí | número de edificación |
| `CODIGO_ANTERIOR` | String(20) en R, **String(30) en U** | sí | longitud declarada distinta entre capas |

**Clave natural de la construcción:** `(TERRENO_CODIGO, CODIGO_EDIFICACION, IDENTIFICADOR)`.
Un mismo `CODIGO` aparece en varias filas.

**Valores reales de los dominios (Atlántico, `U_CONSTRUCCION`, 89 697 filas):**

| `TIPO_CONSTRUCCION` | `TIPO_DOMINIO` | Filas |
|---|---|---|
| `CONVENCIONAL` | `PRIVADO` | 72 126 |
| `NO CONVENCIONAL` | `PRIVADO` | 13 561 |
| `Convencional` | *(en blanco)* | 3 324 |
| `Convencional` | `PRIVADO` | 627 |
| `No Convencional` | *(en blanco)* | resto |
| `NO CONVENCIONAL` | `COMUN` | 1 |

⚠ **Los dominios están declarados pero no se respetan.** El mismo valor aparece
en dos grafías (`CONVENCIONAL` / `Convencional`) y `TIPO_DOMINIO` llega en blanco
en más de 3 300 filas. Hay que normalizar a mayúsculas y tratar el blanco como
nulo en la ingesta, no en la consulta.

### 3.4 `U_MANZANA`, `U_BARRIO`, `U_SECTOR` — jerarquía urbana

| Capa | `CODIGO` | Llave al padre | Nombre |
|---|---|---|---|
| `U_MANZANA` | String(17) NOT NULL | `BARRIO_CODIGO` String(13) | — |
| `U_BARRIO` | String(13) NOT NULL | `SECTOR_CODIGO` String(9) | **`NOMBRE` String(100) NOT NULL** |
| `U_SECTOR` | String(9) NOT NULL | — | — |

`U_MANZANA` trae además `CODIGO_ANTERIOR` String(255) (aunque el contenido
observado son 13 caracteres). `U_BARRIO` no trae `CODIGO_DEPARTAMENTO`.

Jerarquía verificada: predio `084210100000000080013000000000` → manzana
`08421010000000008` → barrio `0842101000000`. Cada código es prefijo del
anterior.

### 3.5 `R_VEREDA`, `R_SECTOR` — jerarquía rural

| Capa | `CODIGO` | Llave al padre | Nombre |
|---|---|---|---|
| `R_VEREDA` | String(17) NOT NULL | `SECTOR_CODIGO` String(9) | **`NOMBRE` String(100) NOT NULL** |
| `R_SECTOR` | String(9) NOT NULL | — | — |

`R_VEREDA` trae `CODIGO_ANTERIOR` String(13).

### 3.6 `U_PERIMETRO` — perímetros urbanos

| Campo | Tipo | Notas |
|---|---|---|
| `DEPARTAMENTO_CODIGO` | String(2) | |
| `MUNICIPIO_CODIGO` | String(5) | ⚠ **inconsistente**: observados `08078` (5 dígitos) y `137` (3) en la misma capa |
| `TIPO_AVALUO` | String(30) | ⚠ **campo mal usado**: mezcla `01`, `02` con `0814101` (7 dígitos) |
| `NOMBRE_GEOGRAFICO` | String(50) | topónimo del área urbana; con nulos |
| `CODIGO_NOMBRE` | String(255) | dominio `domAdministrativo`. ⚠ observados `Cabecera Municipal`, `Corregimiento` y también el propio nombre del municipio (`Baranoa`) |

29 perímetros para 15 municipios ⇒ hay **más de un área urbana por municipio**
(cabecera más centros poblados). Eso explica los códigos de zona `01`–`06` del
NPN (§4.2).

### 3.7 `*_NOMENCLATURA_DOMICILIARIA` y `*_NOMENCLATURA_VIAL`

| Campo | Tipo | Notas |
|---|---|---|
| `TEXTO` | String(600) | NOT NULL en las urbanas. Debería ser la dirección |
| `TERRENO_CODIGO` | String(30) | NOT NULL en `R_NOMENCLATURA_DOMICILIARIA`, nullable en la urbana. Ausente en las viales |

⚠ **Hallazgo crítico: no son direcciones.** De los 73 215 registros de
`U_NOMENCLATURA_DOMICILIARIA` de Atlántico:

| Contenido de `TEXTO` | Registros |
|---|---|
| Literalmente `NS` (sin nomenclatura) | 14 125 |
| Contiene «Carrera» | 15 |
| Contiene «Calle» | 3 |
| Contiene «Diagonal» o «Transversal» | 0 |
| Cualquier otra cosa | 58 935 |

Ese «cualquier otra cosa» son topónimos y nombres de lote:
`ARROYO GRANDE`, `VILLA ARISMENDI`, `GUAYABAL LOTE1`, `MONTE ROJO`, `CUCAYAL`,
`PARCELA L-1 DIVISION 1`, `ZONA DE CESION No.1`,
`AREA DE PROTECCION CAUCE DEL ARROYO`, `LOTE URBANO` (138 veces).

**Solo 18 de 73 215 registros (0,02 %) contienen un tipo de vía.** La geometría,
además, es una línea de rotulación, no un punto de dirección.

Consecuencia: **el buscador por dirección del MVP no se puede sostener con el
catastro.** Es la decisión de alcance más importante que sale de la Fase 0 (§9).

---

## 4. Número Predial Nacional (NPN) ✔

### 4.1 Descomposición verificada

Aplicando la segmentación de `PLAN.md` §7 a los datos reales:

| Tramo | Long. | Ejemplo urbano | Ejemplo rural |
|---|---|---|---|
| Departamento | 2 | `08` | `08` |
| Municipio | 3 | `421` | `421` |
| **Zona** | 2 | `01` | `00` |
| Sector | 2 | `00` | `02` |
| Comuna | 2 | `00` | `00` |
| Barrio | 2 | `00` | `00` |
| Manzana / Vereda | 4 | `0008` | `0001` |
| Terreno | 4 | `0013` | `0127` |
| Condición | 1 | `0` | `0` |
| Edificio | 2 | `00` | `00` |
| Piso | 2 | `00` | `00` |
| Unidad | 4 | `0000` | `0000` |

La segmentación de 12 tramos del plan cuadra: 2+3+2+2+2+2+4+4+1+2+2+4 = 30.

### 4.2 ⚠ El tramo de zona NO es un booleano urbano/rural

Distribución real del tramo de zona (dígitos 6–7) en Atlántico:

| Zona | `U_TERRENO` | `R_TERRENO` |
|---|---|---|
| `00` | 2 *(anómalos)* | **18 951 (100 %)** |
| `01` | **62 549** | 0 |
| `02` | 2 699 | 0 |
| `03` | 1 124 | 0 |
| `04` | 867 | 0 |
| `05` | 413 | 0 |
| `06` | 271 | 0 |

Interpretación, coherente con los 29 perímetros urbanos de §3.6:

- **`00` = rural.**
- **`01`…`NN` = cada área urbana del municipio** (cabecera = `01`, y los centros
  poblados numerados a continuación).

Esto **contradice** `packages/shared/src/constants.ts`, que declara
`ZONE = { URBAN: '01', RURAL: '02' }`, y hace que `validateNpn()` de
`packages/geo/src/npn.ts` **rechace el 100 % de los NPN rurales reales del IGAC**
y también los urbanos de centros poblados (`02`–`06`), que en Atlántico son 5 374
predios.

- **Evidencia:** 86 876 predios, un departamento completo, dos capas. Es sólido,
  pero es un solo departamento.
- **Qué hace falta:** repetir la comprobación en un segundo departamento antes de
  cambiar la constante. Boyacá (`723e946e9ede418a95a6eefd28439626`) es buen
  candidato por su número de municipios rurales.
- **Ningún archivo de `packages/shared` ni `packages/geo` se modificó desde este
  paquete:** la decisión y el cambio corresponden a quien los mantiene. Riesgo
  `npn-zone-no-es-booleano` en `data-catalog/RIESGOS.md`.

### 4.3 ⚠ El NPN no es clave única

| Capa | Filas | `CODIGO` distintos | Duplicados |
|---|---|---|---|
| `U_TERRENO` (Atlántico) | 67 925 | 67 219 | **706 (1,04 %)** |

`core.parcel` **no puede declarar `npn` como PRIMARY KEY ni UNIQUE**. El modelo de
`PLAN.md` §7 ya usa un `id BIGSERIAL`, lo cual es correcto; pero cualquier
consulta que asuma «un NPN, un predio» dará resultados incompletos, y la ficha de
predio tiene que poder mostrar varios polígonos para un mismo código.

### 4.4 ⚠ El código de 20 dígitos no es el prefijo del de 30

| NPN (30) | `CODIGO_ANTERIOR` (20) |
|---|---|
| `084210100000000080013000000000` | `08421010000080013000` |
| `084210002000000010127000000000` | `08421000200010127000` |

El de 20 omite los cuatro dígitos de **comuna + barrio**. Por tanto
`npn30to20()` de `packages/geo/src/npn.ts`, que hace `slice(0, 20)`, **no
reproduce el `CODIGO_ANTERIOR` real del IGAC**, y `npn20to30()`, que concatena
ceros al final, tampoco es la inversa correcta.

Riesgo `npn-20-digitos-no-es-prefijo` en `data-catalog/RIESGOS.md`.

### 4.5 Códigos derivados verificados

| Código | Long. | Composición | Ejemplo |
|---|---|---|---|
| NPN | 30 | completo | `084210100000000080013000000000` |
| Código anterior | 20 | sin comuna ni barrio | `08421010000080013000` |
| Manzana | 17 | dept+muni+zona+sector+comuna+barrio+manzana | `08421010000000008` |
| Vereda | 17 | ídem con vereda | *(poblado en la GDB)* |
| Barrio | 13 | dept+muni+zona+sector+comuna+barrio | `0842101000000` |
| Sector | 9 | dept+muni+zona+sector | *(de `U_SECTOR.CODIGO`)* |

---

## 5. Cobertura real ⚠ ✔

Atlántico tiene **23 municipios**. La base pública trae datos de **15**, los
mismos en urbano y en rural:

| Municipio (DIVIPOLA) | Predios urbanos | Predios rurales |
|---|---|---|
| 08078 Baranoa | 13 145 | 3 763 |
| 08137 Campo de la Cruz | 7 375 | 832 |
| 08141 Candelaria | 2 964 | 688 |
| 08421 Malambo | 4 835 | 1 352 |
| 08436 Manatí | 3 481 | 1 568 |
| 08520 Palmar de Varela | 4 970 | 736 |
| 08558 Piojó | 2 491 | 1 947 |
| 08560 Polonuevo | 4 214 | 731 |
| 08606 Repelón | 3 501 | 1 858 |
| 08634 Sabanagrande | 6 668 | 1 191 |
| 08675 Santa Lucía | 2 778 | 572 |
| 08685 Santo Tomás | 6 090 | 658 |
| 08770 Suan | 2 158 | 338 |
| 08832 Tubará | 956 | 2 183 |
| 08849 Usiacurí | 2 299 | 534 |

**Faltan 8 municipios**, entre ellos Barranquilla (gestor catastral propio, como
anticipa `PLAN.md` §2) pero también Soledad, Sabanalarga, Puerto Colombia,
Galapa, Ponedera y Juan de Acosta.

Esto es más grave de lo que el plan supone: la cobertura no se pierde solo en los
catastros descentralizados de las grandes ciudades, **se pierde municipio a
municipio dentro de un departamento que sí es jurisdicción del IGAC**. La regla 6
(«cobertura honesta») no es un caso de borde: es el comportamiento normal del
producto y hay que diseñarlo desde el principio, con `core.cadastral_manager`
poblado antes de mostrar el primer mapa.

---

## 6. Calidad de los datos observada ✔

| Hallazgo | Evidencia | Consecuencia |
|---|---|---|
| Dominios declarados pero no respetados | `CONVENCIONAL` vs `Convencional`; `TIPO_DOMINIO` en blanco en 3 324 filas | Normalizar en el `transform`, nunca en la consulta |
| `MUNICIPIO_CODIGO` de `U_PERIMETRO` con longitud variable | `08078` y `137` en la misma capa | Usar `codigo_municipio` como fuente autoritativa |
| `TIPO_AVALUO` con dos semánticas distintas | `01`, `02`, `0814101` | No interpretarlo; guardarlo crudo en `attrs` |
| `CODIGO_NOMBRE` con valores fuera de su dominio | `Cabecera Municipal`, `Corregimiento`, `Baranoa` | Ídem |
| Nomenclatura domiciliaria sin direcciones | 18 de 73 215 con tipo de vía | El geocodificador no puede depender del catastro (§3.7) |
| NPN duplicado | 706 de 67 925 | `npn` no es clave única (§4.3) |
| Capas `*_INFORMAL` vacías | 0 filas en las cuatro | Verificar en otro departamento antes de concluir |
| Solo 33 barrios y 50 veredas para 15 municipios | `U_BARRIO`, `R_VEREDA` | La UI debe tolerar barrio y vereda nulos |
| `CODIGO_ANTERIOR` con longitudes declaradas distintas entre capas | 20 / 30 / 255 | Columna destino `VARCHAR` holgada, validada por contenido |

### Diferencias entre la GDB y el servicio REST ✔

Además de los nombres truncados, el servicio REST degrada los datos:

| Campo | En la GDB | En el REST |
|---|---|---|
| `VEREDA_CODIGO` / `VEREDA_COD` | poblado | **en ceros** (`08421000000000000`) |
| `codigo_municipio` | poblado | **vacío** (`" "`) en `R_CONSTRUCCION` |
| `GLOBALID_S` | *(no existe)* | vacío (`" "`), campo muerto |
| `SHAPE_Area` | m² (CRS 9377) | grados² (CRS 4686), inservible |
| `FECHA_LOG` | *(no existe)* | siempre `null` |
| `USUARIO_LO` | *(no existe)* | **presente**: única columna de PII de toda la oferta catastral |

El servicio REST **sí** aporta una cosa que la GDB no: el conteo nacional, que es
lo que permite saber cuánto falta por cargar.

---

## 7. Conteos nacionales del servicio REST ✔

Obtenidos con `returnCountOnly=true` el 2026-09-21 sobre
`Dato_Fundamental_Catastro/MapServer`:

| Capa | Registros |
|---|---|
| `U_TERRENO` | 3 616 349 |
| `R_TERRENO` | 3 146 345 |
| `U_CONSTRUCCION` | 4 790 310 |
| `R_CONSTRUCCION` | 393 507 |
| `U_MANZANA` | 240 033 |

**Total nacional de predios publicados: 6 762 694.** Atlántico aporta 86 876,
un 1,28 % del total: el piloto es manejable y representativo en tamaño.

Limitaciones del servicio, verificadas: `capabilities: Query,Map,Data`,
`supportedQueryFormats: JSON, geoJSON, PBF`, `maxRecordCount: 2000`,
`supportsStatistics: false`, `supportsAdvancedQueries: false`,
`advancedQueryCapabilities.supportsPagination: false` — y responde
`400 Pagination is not supported.` al simple hecho de recibir
`resultRecordCount`. Descargar `U_TERRENO` entero serían ~1 808 peticiones
paginando por rangos de OID. Inviable como carga primaria, tal como anticipaba
`PLAN.md` §5.1.

---

## 8. Consecuencias para el modelo de datos (`PLAN.md` §7)

### `core.parcel`

| Columna | ¿Se puede llenar? | Origen real |
|---|---|---|
| `npn` | ✔ | `CODIGO` — pero **no es único** |
| `npn_old` | ✔ | `CODIGO_ANTERIOR` (⚠ no es el prefijo de 20) |
| `muni_code` | ✔ | `codigo_municipio` de la GDB |
| `zone` | ✔ **con la salvedad de §4.2** | dígitos 6–7 de `CODIGO` |
| `sector`, `comuna`, `barrio`, `manzana_vereda`, `terreno`, `condicion`, `edificio`, `piso`, `unidad` | ✔ | tramos del NPN |
| `area_geom_m2` | ✔ | `ST_Area` en 9377 |
| `area_reported_m2` | ✗ | Registro 1, **no publicado** |
| `built_area_m2` | ✗ | Registro 1 |
| `economic_use` | ✗ | Registro 1 |
| `address` | ✗ *(de facto)* | `TEXTO` existe pero no es una dirección (§3.7) |
| `cadastral_value`, `valuation_year` | ✗ | Registro 1 |
| `geom`, `centroid`, `h3_r9` | ✔ | `Shape` reproyectado 9377 → 4326 |

### `core.building`

| Columna | ¿Se puede llenar? | Origen |
|---|---|---|
| `parcel_npn` | ✔ | `TERRENO_CODIGO` |
| `floors` | ✔ | `NUMERO_PISOS` |
| `geom` | ✔ | `Shape` |
| `attrs` | ✔ | `TIPO_CONSTRUCCION`, `TIPO_DOMINIO`, `NUMERO_SOTANOS`, `NUMERO_MEZANINES`, `NUMERO_SEMISOTANOS`, `IDENTIFICADOR`, `CODIGO_EDIFICACION` |
| `built_area_m2` | ✗ | Registro 1. El área del polígono por pisos es una **estimación**, no un dato: no se rellena (regla 2) |
| `use` | ✗ | Registro 1 |

### Capas que el modelo no preveía y conviene añadir

`U_BARRIO` y `R_VEREDA` traen **nombre**, que es lo que el usuario busca.
`U_PERIMETRO` permite decidir urbano/rural por geometría en vez de confiar en el
NPN. `core.populated_center` (de la DIVIPOLA del DANE) cierra el buscador.

---

## 9. Lo que NO se ha verificado, y por qué importa ✗

| Elemento | Estado | Impacto |
|---|---|---|
| **Registro 1 (predial) y Registro 2 (propietarios)** | ✗ **No existen en el paquete público** | Sin ellos no hay avalúo, destino económico, área reportada ni área construida. **M3 (buscador por destino económico) y buena parte de M2 y M9 quedan sin insumo.** Hay que averiguar si se entregan por solicitud formal al IGAC o si simplemente no son públicos |
| Dominios completos (`domTipoConstruccion`, `domTipoDominio`, `domAdministrativo`) | ✗ parcial | Solo se observaron los valores presentes en Atlántico. La GDB declara los dominios; falta extraerlos con `ogrinfo -listmdlayers` o leer la tabla de dominios |
| Zonas homogéneas físicas y geoeconómicas | ✗ no localizadas como capa nacional | `PLAN.md` §5.1 las pide para M3 y M9 |
| Capas `*_INFORMAL` | ✗ vacías en el piloto | Verificar en otro departamento |
| Estructura de los cortes históricos | ✗ | Sin conocer cómo se versionan los ítems de ArcGIS Online no se puede diseñar el `diff` de M8. Lo que sí se sabe: el ítem se **reemplaza** (modificado 2026-09-03), no se archiva ⇒ **hay que guardar cada descarga mensual o se pierde la serie** |
| El otro 30 % de departamentos | ✗ | Solo se verificó Atlántico. 31 ítems publicados frente a 32 departamentos + Bogotá |

### Por qué `OBJECTID`/`FID` no sirve como identificador

Es el OID que asigna la geodatabase o el servidor al publicar, y cambia en cada
republicación. La clave del producto es el NPN (con la advertencia de §4.3) y,
para las construcciones, `(TERRENO_CODIGO, CODIGO_EDIFICACION, IDENTIFICADOR)`.

---

## 10. Cómo reproducir esta inspección

```bash
# 1. Localizar los ítems departamentales
curl -s 'https://www.arcgis.com/sharing/rest/search?f=json&num=100&q=owner:IGAC-Admin%20AND%20type:%22File%20Geodatabase%22'

# 2. Descargar el piloto (56 MB, reanudable)
#    ítem b4c2079287ee40bdb159a412fb5bdfad = Atlántico
curl -L -o 08_ATLANTICO.zip \
  'https://www.arcgis.com/sharing/rest/content/items/b4c2079287ee40bdb159a412fb5bdfad/data'

# 3. Inspeccionar el esquema (GDAL 3.9.2, driver OpenFileGDB)
ogrinfo -so -al 08_ATLANTICO/08.gdb

# 4. Consultas de calidad, con el dialecto SQLITE de OGR
ogrinfo -q -dialect SQLITE -sql \
  "SELECT substr(CODIGO,6,2) zona, COUNT(*) n FROM U_TERRENO GROUP BY 1" \
  08_ATLANTICO/08.gdb
```

El detector de GDAL de `packages/sources/src/connectors/gdal.ts` resuelve el
binario y fija `GDAL_DATA` y `PROJ_DATA` automáticamente; en este equipo
encuentra `C:\Program Files\PostgreSQL\17\bin\ogr2ogr.exe` (GDAL 3.9.2) con
`gdal-data` en `C:\Program Files\PostgreSQL\17\gdal-data` y `proj.db` en
`C:\Program Files\PostgreSQL\17\share\contrib\postgis-3.6\proj`.

El servicio REST se reinspecciona con:

```bash
pnpm catalog:crawl -- --source igac-arcgis --max-services 1
```

y la evidencia queda en
`data-catalog/igac/Dato_Fundamental_Catastro__MapServer.json`.
