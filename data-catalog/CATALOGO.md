# Catálogo de fuentes — Fase 0

> Inventario de lo que cada fuente expone realmente. Todo lo de aquí sale de una inspección hecha por el crawler; lo no verificado va marcado.
> Generado el 2026-09-21 15:42:08 UTC por `pnpm catalog:report`.
> Esquema de catálogo v1.

## Resumen

| Concepto | Valor |
|---|---|
| Servicios ArcGIS inspeccionados | 5 |
| Servicios ArcGIS fallidos | 0 |
| Capas y tablas catalogadas | 21 |
| Capas con muestra de registros | 13 |
| Datasets de datos.gov.co catalogados | 138 |
| Datasets de datos.gov.co con columnas inspeccionadas | 138 |
| Descriptores manuales | 3 |
| Extracto OSM | 3 archivos, corte 2026-09-20 |

## IGAC — ArcGIS REST

Raíz: `https://mapas.igac.gov.co/server/rest/services`. Un servicio por fila; las capas se detallan más abajo.

| Carpeta | Servicio | Tipo | Capas | Tablas | CRS | maxRecordCount | Capacidades | Extensiones |
|---|---|---|---|---|---|---|---|---|
| agrologia | [actividadquimicanacional](https://mapas.igac.gov.co/server/rest/services/agrologia/actividadquimicanacional/MapServer) | MapServer | 1 | 0 | 9377 | 2000 | map, query, data | WFSServer, WMSServer |
| (raíz) | [Dato_Fundamental_Catastro](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer) | MapServer | 5 | 0 | 4686 | 2000 | query, map, data | WFSServer, WMSServer |
| (raíz) | [Dato_Fundamental_Cuerpos_de_Agua_500k](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer) | MapServer | 7 | 0 | 9377 | 2000 | query, map, data | — |
| (raíz) | [Dato_Fundamental_Curvas_de_nivel_500k](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Curvas_de_nivel_500k/MapServer) | MapServer | 1 | 0 | 9377 | 2000 | map, query, data | WFSServer, WMSServer |
| (raíz) | [Datos_Fundamentales_Transporte_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer) | MapServer | 7 | 0 | 9377 | 2000 | map, query, data | WFSServer, WMSServer |

### Capas y tablas

| Servicio | Id | Capa | Geometría | CRS | Campos | Registros | maxRecordCount | Paginación | Formatos | Muestra |
|---|---|---|---|---|---|---|---|---|---|---|
| agrologia/actividadquimicanacional | 0 | [Actividad](https://mapas.igac.gov.co/server/rest/services/agrologia/actividadquimicanacional/MapServer/0) | Polygon | 9377 | 18 | — | 2000 | sí | json, geojson, pbf | — |
| (raíz)/Dato_Fundamental_Catastro | 0 | [R_CONSTRUCCION](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/0) | Polygon | 4686 | 21 | 393507 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Catastro | 1 | [R_TERRENO](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/1) | Polygon | 4686 | 10 | 3146345 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Catastro | 2 | [U_CONSTRUCCION](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/2) | Polygon | 4686 | 18 | 4790310 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Catastro | 3 | [U_MANZANA](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/3) | Polygon | 4686 | 9 | 240033 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Catastro | 4 | [U_TERRENO](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Catastro/MapServer/4) | Polygon | 4686 | 10 | 3616349 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 0 | [Banco de Arena](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/0) | Polygon | 9377 | 6 | 935 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 1 | [Deposito de Agua](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/1) | Polygon | 9377 | 7 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 2 | [Drenaj_L](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/2) | Polyline | 9377 | 8 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 3 | [Drenaj_R](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/3) | Polygon | 9377 | 9 | 271 | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 4 | [Humedal](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/4) | Polygon | 9377 | 6 | 0 | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 5 | [Isla](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/5) | Polygon | 9377 | 6 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k | 6 | [Manglar](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/6) | Polygon | 9377 | 6 | 11 | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Dato_Fundamental_Curvas_de_nivel_500k | 0 | [Elevacion_500k](https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0) | Polyline | 9377 | 7 | — | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Datos_Fundamentales_Transporte_100k | 0 | [Limite_Via_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/0) | Polyline | 9377 | 6 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Datos_Fundamentales_Transporte_100k | 1 | [Puente_L_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/1) | Polyline | 9377 | 7 | — | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Datos_Fundamentales_Transporte_100k | 2 | [Puente_P_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/2) | Point | 9377 | 6 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Datos_Fundamentales_Transporte_100k | 3 | [Separador_Vial_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/3) | Polyline | 9377 | 5 | — | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Datos_Fundamentales_Transporte_100k | 4 | [Tunel_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/4) | Polyline | 9377 | 5 | — | 2000 | NO | json, geojson, pbf | — |
| (raíz)/Datos_Fundamentales_Transporte_100k | 5 | [Via Ferrea_100k ](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/5) | Polyline | 9377 | 6 | — | 2000 | NO | json, geojson, pbf | 5 filas |
| (raíz)/Datos_Fundamentales_Transporte_100k | 6 | [Via_100k](https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/6) | Polyline | 9377 | 9 | — | 2000 | NO | json, geojson, pbf | — |

### Campos por capa

#### `agrologia/actividadquimicanacional` → Actividad (id 0)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `OBJECTID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `UCSuelo` | — | String | 10 | — | — |
| `CLIMA_1` | — | String | 254 | — | — |
| `PAISAJE` | — | String | 254 | — | — |
| `TIPO_RELIE` | — | String | 254 | — | — |
| `MATERIAL_P` | — | String | 254 | — | — |
| `SUBGRUPO` | — | String | 254 | — | — |
| `PERFILES` | — | String | 254 | — | — |
| `PORCENTAJE` | — | String | 254 | — | — |
| `AREA_HA` | — | Double | — | — | — |
| `DEPARTAMEN` | — | String | 50 | — | — |
| `UCS` | — | String | 250 | — | — |
| `COD` | — | String | 250 | — | — |
| `COD_1` | — | String | 254 | — | — |
| `ACTIVIDAD` | — | String | 255 | — | — |
| `Shape_Length` | — | Double | — | — | — |
| `Shape_Area` | — | Double | — | — | — |

- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- No se pudo traer la muestra: Se agotaron los 2 intentos contra https://mapas.igac.gov.co/server/rest/services/agrologia/actividadquimicanacional/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=geojson&resultOffset=0&resultRecordCount=5&orderByFields=OBJECTID: This operation was aborted

#### `(raíz)/Dato_Fundamental_Catastro` → R_CONSTRUCCION (id 0)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CODIGO` | — | String | 30 | — | — |
| `TERRENO_CO` | — | String | 30 | — | — |
| `TIPO_CONST` | — | String | 20 | — | — |
| `TIPO_DOMIN` | — | String | 20 | — | — |
| `NUMERO_PIS` | — | Integer | — | — | — |
| `NUMERO_SOT` | — | Integer | — | — | — |
| `NUMERO_MEZ` | — | Integer | — | — | — |
| `NUMERO_SEM` | — | Integer | — | — | — |
| `ETIQUETA` | — | String | 50 | — | — |
| `IDENTIFICA` | — | String | 20 | — | — |
| `CODIGO_EDI` | — | Integer | — | — | — |
| `CODIGO_ANT` | — | String | 20 | — | — |
| `USUARIO_LO` | — | String | 100 | — | **descartado** (operator_user) |
| `FECHA_LOG` | — | Date | 8 | — | — |
| `GLOBALID_S` | — | String | 38 | — | — |
| `codigo_mun` | — | String | 5 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `GlobalID` | — | String | 254 | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- Se descartaron 1 columnas por la lista negra de PII: USUARIO_LO.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "CODIGO": "084210001000000010520000000000",
    "TERRENO_CO": "084210001000000010520000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 2,
    "CODIGO_ANT": "08421000100010520000",
    "FECHA_LOG": null,
    "GLOBALID_S": " ",
    "codigo_mun": " ",
    "SHAPE_Leng": 0.00010905538152,
    "SHAPE_Area": 7.43293089435e-10,
    "GlobalID": "{A825AB44-F5F5-484B-9379-3BB2BE66C22E}"
  },
  {
    "FID": 1,
    "CODIGO": "084210001000000010522000000000",
    "TERRENO_CO": "084210001000000010522000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421000100010522000",
    "FECHA_LOG": null,
    "GLOBALID_S": " ",
    "codigo_mun": " ",
    "SHAPE_Leng": 0.000152506760055,
    "SHAPE_Area": 1.29280691148e-9,
    "GlobalID": "{B7478C44-C3C7-4617-9E55-E6168E141CD7}"
  },
  {
    "FID": 2,
    "CODIGO": "084210001000000010520000000000",
    "TERRENO_CO": "084210001000000010520000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421000100010520000",
    "FECHA_LOG": null,
    "GLOBALID_S": " ",
    "codigo_mun": " ",
    "SHAPE_Leng": 0.000294304098286,
    "SHAPE_Area": 5.36578513403e-9,
    "GlobalID": "{A9DEF113-7D78-426A-985F-0BB913ED8ABC}"
  },
  {
    "FID": 3,
    "CODIGO": "084210001000000010519000000000",
    "TERRENO_CO": "084210001000000010519000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421000100010519000",
    "FECHA_LOG": null,
    "GLOBALID_S": " ",
    "codigo_mun": " ",
    "SHAPE_Leng": 0.000272622695689,
    "SHAPE_Area": 4.63163677634e-9,
    "GlobalID": "{3A36F5BA-40ED-4C21-BC07-A68BF3784EF2}"
  },
  {
    "FID": 4,
    "CODIGO": "084210001000000010521000000000",
    "TERRENO_CO": "084210001000000010521000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421000100010521000",
    "FECHA_LOG": null,
    "GLOBALID_S": " ",
    "codigo_mun": " ",
    "SHAPE_Leng": 0.000268864125531,
    "SHAPE_Area": 4.49412689091e-9,
    "GlobalID": "{1C362564-7A41-4B80-A6B9-283A6BCF9F63}"
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Catastro` → R_TERRENO (id 1)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CODIGO` | — | String | 30 | — | — |
| `VEREDA_COD` | — | String | 17 | — | — |
| `NUMERO_SUB` | — | Integer | — | — | — |
| `CODIGO_ANT` | — | String | 20 | — | — |
| `GLOBALID_S` | — | String | 38 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `GlobalID` | — | String | 254 | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "CODIGO": "084210002000000010127000000000",
    "VEREDA_COD": "08421000000000000",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421000200010127000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.0139942037349,
    "SHAPE_Area": 0.00000817571581279,
    "GlobalID": "{AFC461F7-4577-4127-A424-06B76F9BCB73}"
  },
  {
    "FID": 1,
    "CODIGO": "084210002000000010223000000000",
    "VEREDA_COD": "08421000000000000",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421000200010223000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.0163479654839,
    "SHAPE_Area": 0.00000970363752319,
    "GlobalID": "{303BBFDB-AFEA-423F-B3CA-CDCD865EB9D2}"
  },
  {
    "FID": 2,
    "CODIGO": "084210002000000010222000000000",
    "VEREDA_COD": "08421000000000000",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421000200010222000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.0329781982076,
    "SHAPE_Area": 0.0000415433043967,
    "GlobalID": "{B93D9ED8-A1FF-43D4-99EB-F2D2F2AAE922}"
  },
  {
    "FID": 3,
    "CODIGO": "084210002000000010158000000000",
    "VEREDA_COD": "08421000000000000",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421000200010158000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.0190974722648,
    "SHAPE_Area": 0.0000216135164294,
    "GlobalID": "{AAC4109F-CD6C-4E92-97B1-5D51B932CCDA}"
  },
  {
    "FID": 4,
    "CODIGO": "084210002000000010163000000000",
    "VEREDA_COD": "08421000000000000",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421000200010163000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.0172284293768,
    "SHAPE_Area": 0.0000129345556201,
    "GlobalID": "{9D42BE47-BA68-4D92-802E-0B2C3229310D}"
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Catastro` → U_CONSTRUCCION (id 2)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CODIGO` | — | String | 30 | — | — |
| `TERRENO_CO` | — | String | 30 | — | — |
| `TIPO_CONST` | — | String | 20 | — | — |
| `TIPO_DOMIN` | — | String | 20 | — | — |
| `NUMERO_PIS` | — | Integer | — | — | — |
| `NUMERO_SOT` | — | Integer | — | — | — |
| `NUMERO_MEZ` | — | Integer | — | — | — |
| `NUMERO_SEM` | — | Integer | — | — | — |
| `ETIQUETA` | — | String | 50 | — | — |
| `IDENTIFICA` | — | String | 20 | — | — |
| `CODIGO_EDI` | — | Integer | — | — | — |
| `CODIGO_ANT` | — | String | 30 | — | — |
| `GLOBALID_S` | — | String | 38 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `GlobalID` | — | String | 254 | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "CODIGO": "084210100000000660001000000000",
    "TERRENO_CO": "084210100000000660001000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "B",
    "CODIGO_EDI": 2,
    "CODIGO_ANT": "08421010000660001000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000453471584726,
    "SHAPE_Area": 9.48000701826e-9,
    "GlobalID": "{BBDDF89A-D338-4BA5-8FED-44D422CD8126}"
  },
  {
    "FID": 1,
    "CODIGO": "084210100000000660001000000000",
    "TERRENO_CO": "084210100000000660001000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "D",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421010000660001000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000157490077579,
    "SHAPE_Area": 1.35023680674e-9,
    "GlobalID": "{07F896F3-C0F9-462E-B214-FFADD68BF890}"
  },
  {
    "FID": 2,
    "CODIGO": "084210100000000660014000000000",
    "TERRENO_CO": "084210100000000660014000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421010000660014000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000355572058684,
    "SHAPE_Area": 7.88767757604e-9,
    "GlobalID": "{42743C75-F032-4F75-A088-EA1F60743A9B}"
  },
  {
    "FID": 3,
    "CODIGO": "084210100000000660013000000000",
    "TERRENO_CO": "084210100000000660013000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "A",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421010000660013000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000498336099473,
    "SHAPE_Area": 1.36484954479e-8,
    "GlobalID": "{9F5F44CC-3254-445C-B2E8-DEE4ED380530}"
  },
  {
    "FID": 4,
    "CODIGO": "084210100000000660013000000000",
    "TERRENO_CO": "084210100000000660013000000000",
    "TIPO_CONST": "CONVENCIONAL",
    "TIPO_DOMIN": "PRIVADO",
    "NUMERO_PIS": 1,
    "NUMERO_SOT": 0,
    "NUMERO_MEZ": 0,
    "NUMERO_SEM": 0,
    "ETIQUETA": " ",
    "IDENTIFICA": "B",
    "CODIGO_EDI": 1,
    "CODIGO_ANT": "08421010000660013000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000143472102215,
    "SHAPE_Area": 1.13160492105e-9,
    "GlobalID": "{5DF58A94-84D9-4D06-8668-B831091721B0}"
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Catastro` → U_MANZANA (id 3)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CODIGO` | — | String | 17 | — | — |
| `BARRIO_COD` | — | String | 13 | — | — |
| `CODIGO_ANT` | — | String | 254 | — | — |
| `GLOBALID_S` | — | String | 38 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `GlobalID` | — | String | 254 | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "CODIGO": "08421010000000096",
    "BARRIO_COD": "0842101000000",
    "CODIGO_ANT": "0842101000096",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.00262521643668,
    "SHAPE_Area": 1.68570501365e-7,
    "GlobalID": "{A7A04BC8-7D84-443E-8762-72F7F6A2C504}"
  },
  {
    "FID": 1,
    "CODIGO": "08421010000000043",
    "BARRIO_COD": "0842101000000",
    "CODIGO_ANT": "0842101000043",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.00140517553002,
    "SHAPE_Area": 6.71672366518e-8,
    "GlobalID": "{586D08E5-24E0-459B-AA3C-D8ADCEB4DCF0}"
  },
  {
    "FID": 2,
    "CODIGO": "08421010000000100",
    "BARRIO_COD": "0842101000000",
    "CODIGO_ANT": "0842101000100",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.00218858708511,
    "SHAPE_Area": 2.58862601588e-7,
    "GlobalID": "{6EAFA436-ED79-4261-A38A-CE0E0DCBDA7D}"
  },
  {
    "FID": 3,
    "CODIGO": "08421010000000101",
    "BARRIO_COD": "0842101000000",
    "CODIGO_ANT": "0842101000101",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.00191294052763,
    "SHAPE_Area": 2.16444319911e-7,
    "GlobalID": "{397677A5-9260-46F9-9B8E-7B393B9D7644}"
  },
  {
    "FID": 4,
    "CODIGO": "08421010000000103",
    "BARRIO_COD": "0842101000000",
    "CODIGO_ANT": "0842101000103",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.00180986010312,
    "SHAPE_Area": 2.00608581947e-7,
    "GlobalID": "{4C2E7CA9-822C-487A-B8AA-CBC78D97394C}"
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Catastro` → U_TERRENO (id 4)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CODIGO` | — | String | 30 | — | — |
| `MANZANA_CO` | — | String | 17 | — | — |
| `NUMERO_SUB` | — | Integer | — | — | — |
| `CODIGO_ANT` | — | String | 20 | — | — |
| `GLOBALID_S` | — | String | 38 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `GlobalID` | — | String | 254 | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "CODIGO": "084210100000000080013000000000",
    "MANZANA_CO": "08421010000000008",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421010000080013000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000660920897569,
    "SHAPE_Area": 2.47467940194e-8,
    "GlobalID": "{8893EF9E-214F-4753-9181-C6B18DB7F5F0}"
  },
  {
    "FID": 1,
    "CODIGO": "084210100000000080006000000000",
    "MANZANA_CO": "08421010000000008",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421010000080006000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000576568148127,
    "SHAPE_Area": 1.86036099288e-8,
    "GlobalID": "{FF7CB760-1DE6-4ABF-A284-D21795B0D2F1}"
  },
  {
    "FID": 2,
    "CODIGO": "084210100000000080004000000000",
    "MANZANA_CO": "08421010000000008",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421010000080004000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000545858759146,
    "SHAPE_Area": 1.69099109113e-8,
    "GlobalID": "{66E0504B-A021-4F78-955E-5F67A81660BF}"
  },
  {
    "FID": 3,
    "CODIGO": "084210100000000080005000000000",
    "MANZANA_CO": "08421010000000008",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421010000080005000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000549662197843,
    "SHAPE_Area": 1.64382366056e-8,
    "GlobalID": "{6FE54708-7A35-43E5-BD8A-9EFB572B5E7B}"
  },
  {
    "FID": 4,
    "CODIGO": "084210100000000080007000000000",
    "MANZANA_CO": "08421010000000008",
    "NUMERO_SUB": 0,
    "CODIGO_ANT": "08421010000080007000",
    "GLOBALID_S": " ",
    "SHAPE_Leng": 0.000579806181899,
    "SHAPE_Area": 1.86015359004e-8,
    "GlobalID": "{58D80342-BB33-40C5-8DA4-7C006591EE23}"
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Banco de Arena (id 0)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `BAIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "BAIdentif": " ",
    "SHAPE_Leng": 569.73010559,
    "SHAPE_Area": 10264.9753704,
    "RuleID": 1
  },
  {
    "FID": 1,
    "BAIdentif": " ",
    "SHAPE_Leng": 707.651418097,
    "SHAPE_Area": 34244.2317895,
    "RuleID": 1
  },
  {
    "FID": 2,
    "BAIdentif": " ",
    "SHAPE_Leng": 715.247446249,
    "SHAPE_Area": 29742.4630784,
    "RuleID": 1
  },
  {
    "FID": 3,
    "BAIdentif": " ",
    "SHAPE_Leng": 2432.26102315,
    "SHAPE_Area": 145495.747549,
    "RuleID": 1
  },
  {
    "FID": 4,
    "BAIdentif": " ",
    "SHAPE_Leng": 719.896735765,
    "SHAPE_Area": 17080.3484552,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Deposito de Agua (id 1)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `DAIdentif` | — | String | 50 | — | — |
| `DATipo` | — | Integer | — | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "DAIdentif": " ",
    "DATipo": 1,
    "SHAPE_Leng": 6864.73187816,
    "SHAPE_Area": 501620.961168,
    "RuleID": 1
  },
  {
    "FID": 1,
    "DAIdentif": " ",
    "DATipo": 1,
    "SHAPE_Leng": 9319.14552401,
    "SHAPE_Area": 770988.293314,
    "RuleID": 1
  },
  {
    "FID": 2,
    "DAIdentif": " ",
    "DATipo": 1,
    "SHAPE_Leng": 7248.21765848,
    "SHAPE_Area": 387513.647991,
    "RuleID": 1
  },
  {
    "FID": 3,
    "DAIdentif": " ",
    "DATipo": 1,
    "SHAPE_Leng": 9471.33741617,
    "SHAPE_Area": 725818.120212,
    "RuleID": 1
  },
  {
    "FID": 4,
    "DAIdentif": " ",
    "DATipo": 1,
    "SHAPE_Leng": 2415.19798482,
    "SHAPE_Area": 203853.885975,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Drenaj_L (id 2)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `DIdentif` | — | String | 50 | — | — |
| `DEstado` | — | Integer | — | — | — |
| `DDisperso` | — | String | 50 | — | — |
| `DTipo` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 1922.75070579,
    "RuleID": 2
  },
  {
    "FID": 1,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 1603.10525633,
    "RuleID": 2
  },
  {
    "FID": 2,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 5163.3606708,
    "RuleID": 2
  },
  {
    "FID": 3,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 7819.86334482,
    "RuleID": 2
  },
  {
    "FID": 4,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 3396.7970267,
    "RuleID": 2
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Drenaj_R (id 3)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `DIdentif` | — | String | 50 | — | — |
| `DEstado` | — | Integer | — | — | — |
| `DDisperso` | — | String | 50 | — | — |
| `DTipo` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 11368.0012125,
    "SHAPE_Area": 374759.962604,
    "RuleID": 1
  },
  {
    "FID": 1,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 7268.77914732,
    "SHAPE_Area": 188813.133976,
    "RuleID": 1
  },
  {
    "FID": 2,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 533726.366042,
    "SHAPE_Area": 61574408.4572,
    "RuleID": 1
  },
  {
    "FID": 3,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 1733384.08777,
    "SHAPE_Area": 267727862.473,
    "RuleID": 1
  },
  {
    "FID": 4,
    "DIdentif": " ",
    "DEstado": 1,
    "DDisperso": "02",
    "DTipo": "01",
    "SHAPE_Leng": 678382.185742,
    "SHAPE_Area": 112908431.172,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Humedal (id 4)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `HIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: HTTP 503 en https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/4/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Isla (id 5)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `IsIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "IsIdentif": " ",
    "SHAPE_Leng": 1057.15648592,
    "SHAPE_Area": 63513.6613655,
    "RuleID": 1
  },
  {
    "FID": 1,
    "IsIdentif": " ",
    "SHAPE_Leng": 1506.82738528,
    "SHAPE_Area": 121290.765479,
    "RuleID": 1
  },
  {
    "FID": 2,
    "IsIdentif": " ",
    "SHAPE_Leng": 1668.89389612,
    "SHAPE_Area": 142774.339857,
    "RuleID": 1
  },
  {
    "FID": 3,
    "IsIdentif": " ",
    "SHAPE_Leng": 3161.62715775,
    "SHAPE_Area": 337933.804925,
    "RuleID": 1
  },
  {
    "FID": 4,
    "IsIdentif": " ",
    "SHAPE_Leng": 1599.2627384,
    "SHAPE_Area": 99403.8928805,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Dato_Fundamental_Cuerpos_de_Agua_500k` → Manglar (id 6)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `MgIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `SHAPE_Area` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: HTTP 502 en https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Cuerpos_de_Agua_500k/MapServer/6/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson

#### `(raíz)/Dato_Fundamental_Curvas_de_nivel_500k` → Elevacion_500k (id 0)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `CNIdentif` | — | String | 50 | — | — |
| `CNAltura` | — | Integer | — | — | — |
| `CNTipo` | — | Integer | — | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: HTTP 503 en https://mapas.igac.gov.co/server/rest/services/Dato_Fundamental_Curvas_de_nivel_500k/MapServer/0/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Limite_Via_100k (id 0)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `LVIdentif` | — | String | 50 | — | — |
| `LVTipo` | — | Integer | — | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "LVIdentif": " ",
    "LVTipo": 2,
    "SHAPE_Leng": 579.331038831,
    "RuleID": 2
  },
  {
    "FID": 1,
    "LVIdentif": " ",
    "LVTipo": 2,
    "SHAPE_Leng": 933.913148689,
    "RuleID": 2
  },
  {
    "FID": 2,
    "LVIdentif": " ",
    "LVTipo": 1,
    "SHAPE_Leng": 3644.89464153,
    "RuleID": 1
  },
  {
    "FID": 3,
    "LVIdentif": " ",
    "LVTipo": 1,
    "SHAPE_Leng": 776.62777487,
    "RuleID": 1
  },
  {
    "FID": 4,
    "LVIdentif": " ",
    "LVTipo": 1,
    "SHAPE_Leng": 1078.04170504,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Puente_L_100k (id 1)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `PuIdentif` | — | String | 50 | — | — |
| `PuFuncion` | — | Integer | — | — | — |
| `PuRotacion` | — | Double | — | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: Se agotaron los 2 intentos contra https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/1/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson: This operation was aborted

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Puente_P_100k (id 2)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `PuIdentif` | — | String | 50 | — | — |
| `PuFuncion` | — | Integer | — | — | — |
| `PuRotacion` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "PuIdentif": " ",
    "PuFuncion": 3,
    "PuRotacion": 0,
    "RuleID": 3
  },
  {
    "FID": 1,
    "PuIdentif": " ",
    "PuFuncion": 3,
    "PuRotacion": 77.9213406,
    "RuleID": 3
  },
  {
    "FID": 2,
    "PuIdentif": " ",
    "PuFuncion": 3,
    "PuRotacion": 324.69006059,
    "RuleID": 3
  },
  {
    "FID": 3,
    "PuIdentif": " ",
    "PuFuncion": 3,
    "PuRotacion": -35,
    "RuleID": 3
  },
  {
    "FID": 4,
    "PuIdentif": " ",
    "PuFuncion": 3,
    "PuRotacion": 15,
    "RuleID": 3
  }
]
```

</details>

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Separador_Vial_100k (id 3)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `SVIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: Respuesta no es JSON válido (<HTML>
	<HEAD>
<base href="/" />
<script type="text/javascript">
  var _event_transid='2244335405';
  var _event_client…): Unexpected token '<', "<HTML>
	<"... is not valid JSON

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Tunel_100k (id 4)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `TIdentif` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: Se agotaron los 2 intentos contra https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/4/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson: This operation was aborted

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Via Ferrea_100k  (id 5)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `VFIdentif` | — | String | 50 | — | — |
| `VFTipo` | — | Integer | — | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.

<details><summary>Muestra (sin columnas de PII)</summary>

```json
[
  {
    "FID": 0,
    "VFIdentif": " ",
    "VFTipo": 1,
    "SHAPE_Leng": 102489.877625,
    "RuleID": 1
  },
  {
    "FID": 1,
    "VFIdentif": "[REDACTADO:person_full_name]",
    "VFTipo": 1,
    "SHAPE_Leng": 13103.5630063,
    "RuleID": 1
  },
  {
    "FID": 2,
    "VFIdentif": "Ferrocarriles Nacionales",
    "VFTipo": 1,
    "SHAPE_Leng": 4510.65644384,
    "RuleID": 1
  },
  {
    "FID": 3,
    "VFIdentif": "Ferrocarriles Nacionales",
    "VFTipo": 1,
    "SHAPE_Leng": 908.822299273,
    "RuleID": 1
  },
  {
    "FID": 4,
    "VFIdentif": "Ferrocarriles Nacionales",
    "VFTipo": 1,
    "SHAPE_Leng": 2728.60084499,
    "RuleID": 1
  }
]
```

</details>

#### `(raíz)/Datos_Fundamentales_Transporte_100k` → Via_100k (id 6)

| Campo | Alias | Tipo | Long. | Dominio | PII |
|---|---|---|---|---|---|
| `FID` | — | OID | — | — | — |
| `Shape` | — | Geometry | — | — | — |
| `VIdentifi` | — | String | 50 | — | — |
| `VTipo` | — | Integer | — | — | — |
| `VEstado` | — | String | 50 | — | — |
| `VCarril` | — | String | 50 | — | — |
| `VAcceso` | — | String | 50 | — | — |
| `SHAPE_Leng` | — | Double | — | — | — |
| `RuleID` | — | Integer | — | — | — |

- La capa declara `supportsPagination: false`: `resultOffset` no funciona y hay que paginar por ventanas de OBJECTID.
- La capa declara `supportsStatistics: false`: no se pueden pedir agregados al servicio.
- El servicio no respondió a `returnCountOnly`: el número de registros queda desconocido.
- La capa declara supportsPagination=false; se pagina por ventanas de FID. Tampoco soporta orderByFields: el orden de las ventanas no está garantizado.
- No se envía resultRecordCount: el servicio lo rechaza con "Pagination is not supported." El tamaño de página se acota con un rango de FID.
- No se pudo traer la muestra: Se agotaron los 2 intentos contra https://mapas.igac.gov.co/server/rest/services/Datos_Fundamentales_Transporte_100k/MapServer/6/query?where=%281%3D1%29+AND+FID+%3E+-1+AND+FID+%3C%3D+4&outFields=*&returnGeometry=false&f=geojson: This operation was aborted

## datos.gov.co (Socrata)

### dane

| Id | Nombre | Publicador | Actualizado | Filas | Columnas | Licencia |
|---|---|---|---|---|---|---|
| [dmvp-9swj](https://www.datos.gov.co/d/dmvp-9swj) | Base catastral Municipio Quebradanegra | Agencia Catastral de Cundinamarca, Bogotá D.… | 2026-02-19 | 3430 | 6 | Creative Commons Attribution \| Share Alike 4… |
| [xaxy-8nri](https://www.datos.gov.co/d/xaxy-8nri) | DIVIPOLA - Códigos cabeceras - Centros poblados | Departamento Administrativo Nacional de Esta… | 2025-01-24 | 8161 | 9 | Creative Commons Attribution \| Share Alike 4… |
| [vcjz-niiq](https://www.datos.gov.co/d/vcjz-niiq) | DIVIPOLA- Códigos departamentos | Departamento Administrativo Nacional de Esta… | 2025-01-23 | 33 | 4 | Creative Commons Attribution \| Share Alike 4… |
| [stc8-i9y9](https://www.datos.gov.co/d/stc8-i9y9) | PROYECCIÓN DE POBLACIÓN MUNICIPAL DE CHIQUINQUIRÁ 2018 A 2035 CNPV 20… | Alcaldía de Chiquinquirá, Boyacá | 2021-04-07 | 54 | 7 | Creative Commons Attribution \| Share Alike 4… |

<details><summary><code>dmvp-9swj</code> — Base catastral Municipio Quebradanegra: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `sector` | sector | — |
| `area_geom` | area_geom | — |
| `divipola` | divipola | — |
| `num_pred` | num_pred | — |
| `dest_econo` | dest_econo | — |
| `the_geom` | the_geom | — |

</details>

<details><summary><code>stc8-i9y9</code> — PROYECCIÓN DE POBLACIÓN MUNICIPAL DE CHIQUINQUIRÁ 2018 A 2035 CNPV 2018 DANE: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `dpnom` | DEPARTAMENTO | — |
| `dp` | CODIGO DEPARTAMENTO | — |
| `a_o` | AÑO | — |
| `dpmp` | COD MUNICIPIO | — |
| `total` | TOTAL | — |
| `mpio` | MUNICIPIO | — |
| `rea_geogr_fica` | ÁREA GEOGRÁFICA | — |

</details>

<details><summary><code>vcjz-niiq</code> — DIVIPOLA- Códigos departamentos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigo_departamento` | Código Departamento | — |
| `longitud` | longitud | — |
| `latitud` | Latitud | — |
| `nombre_departamento` | Nombre Departamento | — |

</details>

<details><summary><code>xaxy-8nri</code> — DIVIPOLA - Códigos cabeceras - Centros poblados: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_municipio` | Nombre Municipio | — |
| `tipo_centro_poblado` | Tipo* | — |
| `latitud` | Latitud | — |
| `longitud` | longitud | — |
| `codigo_centro_poblado` | Código Centro Poblado | — |
| `nombre_departamento` | Nombre_departamento | — |
| `nombre_centro_poblado` | Nombre Centro Poblado | — |
| `codigo_municipio` | Codigo Municipio | — |
| `codigo_departamento` | Código Departamento | — |

</details>

### igac

| Id | Nombre | Publicador | Actualizado | Filas | Columnas | Licencia |
|---|---|---|---|---|---|---|
| [6arb-d547](https://www.datos.gov.co/d/6arb-d547) | Alimentos del trópico para alimentación animal - AlimenTro | Corporación Colombiana de Investigación Agro… | 2026-01-28 | 14676117 | 36 | Creative Commons Attribution \| Share Alike 4… |
| [ch4u-f3i5](https://www.datos.gov.co/d/ch4u-f3i5) | Resultados de Análisis de Laboratorio Suelos en Colombia | Corporación Colombiana de Investigación Agro… | 2025-10-03 | 92738 | 32 | Creative Commons Attribution \| Share Alike 4… |
| [7y2j-43cv](https://www.datos.gov.co/d/7y2j-43cv) | Registro de transacciones inmobiliarias en Colombia IGAC | Instituto Geográfico Agustín Codazzi (IGAC) | 2025-04-04 | 30903248 | 26 | Creative Commons Attribution \| Share Alike 4… |
| [bhcx-bx97](https://www.datos.gov.co/d/bhcx-bx97) | Gestores Catastrales de Colombia | Instituto Geográfico Agustín Codazzi - IGAC,… | 2025-03-05 | 1122 | 28 | Creative Commons Attribution \| Share Alike 4… |
| [wmwx-9aap](https://www.datos.gov.co/d/wmwx-9aap) | Áreas potenciales para adecuación de tierras con fines de irrigación | Unidad de Planificación de Tierras Rurales, … | 2020-12-14 | 32307 | 11 | Creative Commons Attribution \| Share Alike 4… |

<details><summary><code>6arb-d547</code> — Alimentos del trópico para alimentación animal - AlimenTro: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `enmrumiantes_mcal_kg_1_ms_` | ENmRumiantes (Mcal.kg-1 MS) | — |
| `ingrediente` | Ingrediente | — |
| `altura_corte_cm_` | Altura corte (cm) | — |
| `nombre_alterno_2` | Nombre alterno 2 | **descartada** |
| `epocarecoleccion` | EpocaRecoleccion | — |
| `altura_planta_cm_` | Altura planta (cm) | — |
| `digestibilidad_ms_g_100_g_1_ms_` | Digestibilidad MS (g 100 g-1 MS) | — |
| `lignina_g_100_g_1_ms_` | Lignina (g 100 g-1 MS) | — |
| `almid_ntotal_g_100_g_1_ms_` | AlmidónTotal (g 100 g-1 MS) | — |
| `carbohidratos_no_estructurales_g_100_g_1_ms_` | Carbohidratos No Estructurales (g 100 g-1 MS) | — |
| `categor_a` | Categoría | — |
| `emrumiantes_mcal_kg_1_ms_` | EMRumiantes (Mcal.kg-1 MS) | — |
| `glicerol_g_100_g_1_ms_` | Glicerol (g 100 g-1 MS) | — |
| `ndt_g_100_g_1_ms_` | NDT (g 100 g-1 MS) | — |
| `enlrumiantes_mcal_kg_1_ms_` | ENlRumiantes (Mcal.kg-1 MS) | — |
| `departamento` | Departamento | — |
| `engrumiantes_mcal_kg_1_ms_` | ENgRumiantes (Mcal.kg-1 MS) | — |
| `prote_na_cruda_g_100_g_1_ms_` | Proteína cruda (g 100 g-1 MS) | — |
| `ceniza_g_100_g_1_ms_` | Ceniza (g 100 g-1 MS) | — |
| `carbohidratos_solubles_g_100_g_1_ms_` | Carbohidratos Solubles (g 100 g-1 MS) | — |
| `fdn_g_100_g_1_ms_` | FDN (g 100 g-1 MS) | — |
| `fda_g_100_g_1_ms_` | FDA (g 100 g-1 MS) | — |
| `municipio` | Municipio | — |
| `fecharecoleccion` | FechaRecoleccion | — |
| `id` | ID | — |
| `hemicelulosa_g_100_g_1_ms_` | Hemicelulosa (g 100 g-1 MS) | — |
| `m_todo_de_conservaci_n` | Método de conservación | — |
| `textura_de_suelo` | Textura de suelo | — |
| `nombre_alterno_1` | Nombre alterno 1 | **descartada** |
| `edad_corte_d_` | Edad corte (d) | — |
| `topograf_a` | Topografía | — |
| `edrumiantes_mcal_kg_1_ms_` | EDRumiantes (Mcal.kg-1 MS) | — |
| `sistema_productivo` | Sistema productivo | — |
| `extracto_et_reo_g_100_g_1_ms_` | Extracto etéreo (g 100 g-1 MS) | — |
| `nombre_alterno_3` | Nombre alterno 3 | **descartada** |
| `subcategor_a` | Subcategoría | — |

</details>

<details><summary><code>7y2j-43cv</code> — Registro de transacciones inmobiliarias en Colombia IGAC: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `categoria_ruralidad_2024` | CATEGORIA_RURALIDAD | — |
| `predios_nuevos` | PREDIOS_NUEVOS | — |
| `fecha_apertura_texto` | FECHA_APERTURA_TEXTO | — |
| `estado_folio` | ESTADO_FOLIO | — |
| `pk` | PK | — |
| `matricula` | MATRICULA | — |
| `fecha_radica_texto` | FECHA_RADICA_TEXTO | — |
| `year_radica` | YEAR_RADICA | — |
| `orip` | ORIP | — |
| `divipola` | DIVIPOLA | — |
| `departamento` | DEPARTAMENTO | — |
| `municipio` | MUNICIPIO | — |
| `tipo_predio_zona` | TIPO_PREDIO_ZONA | — |
| `folios_derivados` | FOLIOS_DERIVADOS | — |
| `num_anotacion` | NUM_ANOTACION | — |
| `dinamica_2024` | Dinámica_Inmobiliaria | — |
| `nombre_natujur` | NOMBRE_NATUJUR | **descartada** |
| `cod_natujur` | COD_NATUJUR | — |
| `documento_justificativo` | DOCUMENTO_JUSTIFICATIVO | **descartada** |
| `count_de` | COUNT_DE | — |
| `count_a` | COUNT_A | — |
| `tiene_valor` | TIENE_VALOR | — |
| `valor` | VALOR | — |
| `numero_catastral_antiguo` | NUMERO_CATASTRAL_ANTIGUO | — |
| `tiene_mas_de_un_valor` | TIENE_MAS_DE_UN_VALOR | — |
| `numero_catastral` | NUMERO_CATASTRAL | — |

</details>

<details><summary><code>bhcx-bx97</code> — Gestores Catastrales de Colombia: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `estado_act` | estado_act | — |
| `contacto` | contacto | **descartada** |
| `shape_area` | shape_Area | — |
| `the_geom` | the_geom | — |
| `municipio` | municipio | — |
| `shape_le_1` | shape_Le_1 | — |
| `fecha_cont` | fecha_cont | — |
| `gestor_cat` | gestor_cat | — |
| `ley617` | ley617 | — |
| `id_gc` | id_gc | — |
| `mpnorma` | mpnorma | — |
| `mpcodigo` | mpcodigo | — |
| `objectid` | objectid | — |
| `mpnombre` | mpnombre | — |
| `restriccio` | restriccio | — |
| `url_habili` | url_habili | — |
| `url_servic` | url_servic | — |
| `depto` | depto | — |
| `gestor_con` | gestor_con | — |
| `inicio` | inicio | — |
| `responsabl` | responsabl | — |
| `mpaltitud` | mpaltitud | — |
| `departamen` | departamen | — |
| `mparea` | mparea | — |
| `divipola` | divipola | — |
| `acto_admin` | acto_admin | — |
| `mpcategor` | mpcategor | — |
| `shape_leng` | shape_leng | — |

</details>

<details><summary><code>ch4u-f3i5</code> — Resultados de Análisis de Laboratorio Suelos en Colombia: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `zinc_disponible_olsen` | Zinc disponible Olsen | — |
| `acidez_kcl` | Acidez Intercambiable | — |
| `boro_disponible` | Boro disponible | — |
| `potasio_intercambiable` | Potasio intercambiable | — |
| `azufre_fosfato_monocalcico` | Azufre Fosfato monocalcico | — |
| `tiempo_de_establecimiento` | Tiempo de establecimiento | — |
| `cultivo` | Cultivo | — |
| `fertilizantes_aplicados` | Fertilizantes aplicados | — |
| `departamento` | Departamento | — |
| `zinc_disponible_doble_acido` | Zinc disponible doble  acido | — |
| `magnesio_intercambiable` | Magnesio intercambiable | — |
| `capacidad_de_intercambio_cationico` | capacidad de intercambio cationico | — |
| `cobre_disponible_doble_acido` | Cobre disponible doble acido | — |
| `fosforo_bray_ii` | Fósforo Bray II | — |
| `secuencial` | Secuencial | — |
| `fecha_de_an_lisis` | Fecha de Análisis | — |
| `municipio` | Municipio | — |
| `riego` | Riego | — |
| `ph_agua_suelo` | pH agua:suelo | — |
| `materia_organica` | Materia organica | — |
| `aluminio_intercambiable` | Aluminio intercambiable | — |
| `drenaje` | Drenaje | — |
| `manganeso_disponible_olsen` | Manganeso disponible Olsen | — |
| `hierro_disponible_doble_acido` | Hierro disponible doble acido | — |
| `manganeso_disponible_doble_acido` | Manganeso disponible doble acido | — |
| `hierro_disponible_olsen` | Hierro disponible olsen | — |
| `cobre_disponible` | Cobre disponible | — |
| `topografia` | Topografia | — |
| `conductividad_electrica` | Conductividad electrica | — |
| `sodio_intercambiable` | Sodio intercambiable | — |
| `estado` | Estado | — |
| `calcio_intercambiable` | Calcio intercambiable | — |

</details>

<details><summary><code>wmwx-9aap</code> — Áreas potenciales para adecuación de tierras con fines de irrigación: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `potencial` | Potencial | — |
| `the_geom` | The geom | — |
| `disponibil` | Disponibilidad | — |
| `socioecono` | Socioeconómico | — |
| `fisico` | Fisico | — |
| `necesidad_` | Necesidad Recurso Hídrico | — |
| `regulacion` | Regulación | — |
| `tipo_tierr` | Tipo tierras | — |
| `consecut` | Consecutivo | — |
| `area_ha` | Área (ha) | — |
| `ecosistemi` | Ecosistemico | — |

</details>

### men

| Id | Nombre | Publicador | Actualizado | Filas | Columnas | Licencia |
|---|---|---|---|---|---|---|
| [spzp-dfuc](https://www.datos.gov.co/d/spzp-dfuc) | CÓDIGO ÚNICO DE MEDICAMENTOS OTROS ESTADOS | Instituto Nacional de Vigilancia de Medicame… | 2026-09-16 | — | 29 | Creative Commons Attribution \| Share Alike 4… |
| [vgr4-gemg](https://www.datos.gov.co/d/vgr4-gemg) | CÓDIGO ÚNICO DE MEDICAMENTOS EN TRÁMITE DE RENOVACIÓN | Instituto Nacional de Vigilancia de Medicame… | 2026-09-16 | — | 29 | Creative Commons Attribution \| Share Alike 4… |
| [vwwf-4ftk](https://www.datos.gov.co/d/vwwf-4ftk) | CÓDIGO ÚNICO DE MEDICAMENTOS VENCIDOS | Instituto Nacional de Vigilancia de Medicame… | 2026-09-16 | — | 29 | Creative Commons Attribution \| Share Alike 4… |
| [i7cb-raxc](https://www.datos.gov.co/d/i7cb-raxc) | CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES | Instituto Nacional de Vigilancia de Medicame… | 2026-09-16 | — | 29 | Creative Commons Attribution \| Share Alike 4… |
| [5c2k-ahfc](https://www.datos.gov.co/d/5c2k-ahfc) | MEN_NÚMERO_BACHILLERES_POR_ETC | Ministerio de Educación Nacional - MinEducac… | 2026-09-11 | — | 19 | Creative Commons Attribution \| Share Alike 4… |
| [enmx-7kvv](https://www.datos.gov.co/d/enmx-7kvv) | MEN_MATRICULA_MIGRANTES_EN_EDUCACION_BASICA_Y_MEDIA | Ministerio de Educación Nacional - MinEducac… | 2026-09-10 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [xbpm-2jee](https://www.datos.gov.co/d/xbpm-2jee) | ESTABLECIMIENTOS NACIONALES FABRICANTES DE MEDICAMENTOS CERTIFICADOS … | Secretaría Distrital de Cultura, Recreación … | 2026-09-09 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [5686-m6za](https://www.datos.gov.co/d/5686-m6za) | ESTABLECIMIENTOS NACIONALES DE MEDICAMENTOS CERTIFICADOS CON BUENAS P… | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [2iht-wwxh](https://www.datos.gov.co/d/2iht-wwxh) | ESTABLECIMIENTOS NACIONALES DE GASES MEDICINALES CERTIFICADOS CON BUE… | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [x6yb-a8cg](https://www.datos.gov.co/d/x6yb-a8cg) | ESTABLECIMIENTOS NACIONALES CERTIFICADOS CON BUENAS PRÁCTICAS DE ELAB… | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [9nwa-4tvt](https://www.datos.gov.co/d/9nwa-4tvt) | ESTABLECIMIENTOS INTERNACIONALES FABRICANTES DE MEDICAMENTOS CERTIFIC… | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [jdjx-jx6d](https://www.datos.gov.co/d/jdjx-jx6d) | FÁBRICAS DE ALIMENTOS CERTIFICADAS EN BUENAS PRÁCTICAS DE MANUFACTURA… | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 6 | Creative Commons Attribution \| Share Alike 4… |
| [f25x-wa6y](https://www.datos.gov.co/d/f25x-wa6y) | ESTABLECIMIENTOS FABRICANTES DE DISPOSITIVOS MÉDICOS SOBRE MEDIDA | Instituto Nacional de Vigilancia de Medicame… | 2026-09-09 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [cfw5-qzt5](https://www.datos.gov.co/d/cfw5-qzt5) | MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA | Ministerio de Educación Nacional - MinEducac… | 2026-09-03 | 606206 | 24 | Creative Commons Attribution \| Share Alike 4… |
| [spve-848d](https://www.datos.gov.co/d/spve-848d) | CONECTIVIDAD EN SEDES EDUCATIVAS OFICIALES DE LOS MUNICIPIOS NO CERTI… | Gobernación de Santander, Santander | 2026-09-02 | 1227 | 7 | Creative Commons Attribution \| Share Alike 4… |
| [b6yg-3vyi](https://www.datos.gov.co/d/b6yg-3vyi) | ESTUDIANTES CON DISCAPACIDAD DEPARTAMENTO DE SANTANDER | Gobernación de Santander, Santander | 2026-09-01 | — | 20 | Creative Commons Attribution \| Share Alike 4… |
| [ngw5-c5nw](https://www.datos.gov.co/d/ngw5-c5nw) | MEN_MATRICULA_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA | Ministerio de Educación Nacional | 2026-08-27 | — | 35 | Creative Commons Attribution \| Share Alike 4… |
| [2btt-9z2g](https://www.datos.gov.co/d/2btt-9z2g) | ESTABLECIMIENTOS AUTORIZADOS PARA EL ALMACENAMIENTO Y DISTRIBUCIÓN DE… | Instituto Departamental de Salud del Norte d… | 2026-07-20 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [gc4x-u4iy](https://www.datos.gov.co/d/gc4x-u4iy) | ESTABLECIMIENTOS INSCRITOS PARA EL MANEJO DE MEDICAMENTOS DE CONTROL … | Instituto Departamental de Salud del Norte d… | 2026-07-20 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [s3n2-sqjp](https://www.datos.gov.co/d/s3n2-sqjp) | ESTABLECIMIENTOS IMPORTADORES CERTIFICADOS EN CCAA DE DISPOSITIVOS MÉ… | Instituto Nacional de Vigilancia de Medicame… | 2026-06-24 | — | 5 | Creative Commons Attribution \| Share Alike 4… |
| [bvpy-6cm7](https://www.datos.gov.co/d/bvpy-6cm7) | Entidades de salud en el Departamento de Risaralda | Gobernación de Risaralda, Risaralda | 2026-05-20 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [c4qb-ek68](https://www.datos.gov.co/d/c4qb-ek68) | INDICADORES EDUCATIVOS DEL DEPARTAMENTO DEL MAGDALENA POR MUNICIPIOS … | Gobernación de Magdalena, Magdalena | 2026-03-03 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [e6kt-wdhu](https://www.datos.gov.co/d/e6kt-wdhu) | Zonas Comunitarias para la Paz – Puntos de Conectividad Instalados en… | Gobernación de Caquetá, Caquetá | 2025-11-21 | — | 22 | Creative Commons Attribution \| Share Alike 4… |
| [72xa-encm](https://www.datos.gov.co/d/72xa-encm) | Centros Digitales – Departamento del Caquetá | Gobernación de Caquetá, Caquetá | 2025-11-20 | — | 22 | Creative Commons Attribution \| Share Alike 4… |
| [nudc-7mev](https://www.datos.gov.co/d/nudc-7mev) | MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_MUNIC… | Ministerio de Educación Nacional MinEducació… | 2025-11-13 | — | 41 | Creative Commons Attribution \| Share Alike 4… |
| [ji8i-4anb](https://www.datos.gov.co/d/ji8i-4anb) | MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_DEPAR… | Ministerio de Educación Nacional - MinEducac… | 2025-11-13 | — | 37 | Creative Commons Attribution \| Share Alike 4… |
| [sras-4t5p](https://www.datos.gov.co/d/sras-4t5p) | MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_ETC | Ministerio de Educación Nacional - MinEducac… | 2025-11-13 | — | 37 | Creative Commons Attribution \| Share Alike 4… |
| [y9ga-zwzy](https://www.datos.gov.co/d/y9ga-zwzy) | MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES | Alcaldía de Sipí, Chocó | 2025-10-29 | — | 12 | Creative Commons Attribution \| Share Alike 4… |
| [4hrb-y62g](https://www.datos.gov.co/d/4hrb-y62g) | MEN_ESTADISTICAS DE MATRICULA POR DEPARTAMENTOS_ES | Ministerio de Educación Nacional - MinEducac… | 2025-10-28 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [5wck-szir](https://www.datos.gov.co/d/5wck-szir) | MEN_MATRICULA_ESTADISTICA_ES | Ministerio de Educación Nacional - MinEducac… | 2025-10-28 | — | 26 | Creative Commons Attribution \| Share Alike 4… |
| [7y7n-8wu6](https://www.datos.gov.co/d/7y7n-8wu6) | Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE … | Alcaldía de Sogamoso, Boyacá | 2025-10-17 | — | 20 | Creative Commons Attribution \| Share Alike 4… |
| [hyqu-diue](https://www.datos.gov.co/d/hyqu-diue) | Exámenes médico legales por presunto delito sexual. Colombia, años 20… | Instituto Nacional de Medicina Legal y Cienc… | 2025-09-19 | — | 32 | Creative Commons Attribution \| Share Alike 4… |
| [uuhz-8xmf](https://www.datos.gov.co/d/uuhz-8xmf) | Matrículas de estudiantes en instituciones educativas oficiales depar… | Gobernación de Casanare, Casanare | 2025-09-01 | — | 31 | Creative Commons Attribution \| Share Alike 4… |
| [vqup-4isj](https://www.datos.gov.co/d/vqup-4isj) | Listado de instituciones y centros educativos públicos del departamen… | Gobernación de Casanare, Casanare | 2025-09-01 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [w3uf-w23h](https://www.datos.gov.co/d/w3uf-w23h) | Directorio de instituciones establecimientos educativas oficiales y a… | Gobernación de Casanare, Casanare | 2025-09-01 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [xeb3-fi75](https://www.datos.gov.co/d/xeb3-fi75) | Matricula total en el Departamento de Risaralda | Gobernación de Risaralda, Risaralda | 2025-08-31 | — | 4 | Creative Commons Attribution \| Share Alike 4… |
| [fbyd-epjh](https://www.datos.gov.co/d/fbyd-epjh) | Matricula con discapacidad Departamento de Risaralda | Gobernación de Risaralda, Risaralda | 2025-08-31 | — | 4 | Creative Commons Attribution \| Share Alike 4… |
| [jebm-jp6y](https://www.datos.gov.co/d/jebm-jp6y) | Establecimientos con manejo de medicamentos de control especial | Unidad Ejecutora de Saneamiento del Valle de… | 2025-07-28 | — | 5 | Creative Commons Attribution \| Share Alike 4… |
| [dhqg-4ngc](https://www.datos.gov.co/d/dhqg-4ngc) | MATRÍCULA POR INSTITUCIONES EDUCATIVAS DEPARTAMENTO DE SANTANDER | Gobernación de Santander, Santander | 2025-06-11 | — | 66 | Creative Commons Attribution \| Share Alike 4… |
| [e4hn-mr8d](https://www.datos.gov.co/d/e4hn-mr8d) | Resumen de Estrategias	Secretaría Educacion - Santander | Gobernación de Santander, Santander | 2025-06-05 | — | 19 | Creative Commons Attribution \| Share Alike 4… |
| [c56g-ubd2](https://www.datos.gov.co/d/c56g-ubd2) | INSTITUCIONES Y SEDES EDUCATIVAS, PUBLICAS Y PRIVADAS EN EL DEPARTAME… | Gobernación de Magdalena, Magdalena | 2025-05-30 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [uhs6-qp53](https://www.datos.gov.co/d/uhs6-qp53) | ESTABLECIMIENTOS VIGILADOS POR EL INVIMA EN LA DISCIPLINA DE ALIMENTOS | Instituto Nacional de Vigilancia de Medicame… | 2025-05-27 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [qsh3-vq78](https://www.datos.gov.co/d/qsh3-vq78) | Registro Especial de Prestadores de Salud en el Departamento del Atlá… | Gobernación del Atlántico, Atlántico | 2025-05-14 | — | 25 | Creative Commons Attribution \| Share Alike 4… |
| [b4dp-ximh](https://www.datos.gov.co/d/b4dp-ximh) | Prestadores de Salud Departamento de Antioquia | Gobernación de Antioquia, Antioquia | 2025-03-19 | — | 33 | Creative Commons Attribution \| Share Alike 4… |
| [cmaw-2gaz](https://www.datos.gov.co/d/cmaw-2gaz) | MATRICULA POR MUNICIPIOS EN EL SECTOR OFICIAL Y PRIVADO, DEPARTAMENTO… | Gobernación de Magdalena, Magdalena | 2025-03-13 | — | 8 | Creative Commons Attribution \| Share Alike 4… |
| [upgu-2ytp](https://www.datos.gov.co/d/upgu-2ytp) | MATRICULA POR GRADO Y EDAD DEPARTAMENTO DE SANTANDER | Gobernación de Santander, Santander | 2025-03-03 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [xaxy-8nri](https://www.datos.gov.co/d/xaxy-8nri) | DIVIPOLA - Códigos cabeceras - Centros poblados | Departamento Administrativo Nacional de Esta… | 2025-01-24 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [vcjz-niiq](https://www.datos.gov.co/d/vcjz-niiq) | DIVIPOLA- Códigos departamentos | Departamento Administrativo Nacional de Esta… | 2025-01-23 | — | 4 | Creative Commons Attribution \| Share Alike 4… |
| [2sza-3ea9](https://www.datos.gov.co/d/2sza-3ea9) | COBERTURA DEL PROGRAMA DE ALIMENTACIÓN ESCOLAR (PAE) EN EL DEPARTAMEN… | Gobernación de Santander, Santander | 2024-11-06 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [7tec-5fhs](https://www.datos.gov.co/d/7tec-5fhs) | Listado de Instituciones Educativas Oficiales y No Oficiales del Depa… | Gobernación del Atlántico, Atlántico | 2024-08-21 | — | 24 | Creative Commons Attribution \| Share Alike 4… |
| [3y4s-dmxy](https://www.datos.gov.co/d/3y4s-dmxy) | MEN_INDICADORES_PRIMERA_INFANCIA | Ministerio de Educación Nacional - MinEducac… | 2024-08-15 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [xrdq-pb8b](https://www.datos.gov.co/d/xrdq-pb8b) | INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS DEL DEPARTAMENTO DE … | Gobernación de Boyacá, Boyacá | 2024-08-06 | — | 19 | Creative Commons Attribution \| Share Alike 4… |
| [rzcg-uhwd](https://www.datos.gov.co/d/rzcg-uhwd) | Programa conexión total del Departamento de Caldas | Gobernación de Caldas, Caldas | 2024-06-12 | — | 27 | Creative Commons Attribution \| Share Alike 4… |
| [qpq9-e4ne](https://www.datos.gov.co/d/qpq9-e4ne) | Matrícula Instituciones Educativas oficiales y no oficiales - DEPARTA… | Gobernación de Boyacá, Boyacá | 2023-11-08 | — | 32 | Creative Commons Attribution \| Share Alike 4… |
| [jmkk-qiin](https://www.datos.gov.co/d/jmkk-qiin) | Equipos y servicios tecnológicos en las instituciones educativas - DE… | Gobernación de Boyacá, Boyacá | 2023-09-30 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [j8bh-xk3n](https://www.datos.gov.co/d/j8bh-xk3n) | Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE… | Gobernación de Boyacá, Boyacá | 2023-06-21 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [pejt-qp6n](https://www.datos.gov.co/d/pejt-qp6n) | INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS NO CERTIFICADOS CON … | Gobernación de Boyacá, Boyacá | 2023-03-27 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [65zu-5xdk](https://www.datos.gov.co/d/65zu-5xdk) | Sedes de los Instituciones Educativas del Departamento de Boyacá | Gobernación de Boyacá, Boyacá | 2023-03-27 | — | 15 | Creative Commons Attribution \| Share Alike 4… |
| [emd6-ef7x](https://www.datos.gov.co/d/emd6-ef7x) | Establecimientos Educativos del sector oficial y no oficial por munic… | Gobernación de Boyacá, Boyacá | 2023-03-01 | 2184 | 32 | Creative Commons Attribution \| Share Alike 4… |
| [px6y-fznz](https://www.datos.gov.co/d/px6y-fznz) | SERVICIO DE CONECTIVIDAD A INTERNET EN INSTITUCIONES EDUCATIVAS DEL D… | Gobernación de Santander, Santander | 2022-06-16 | — | 13 | Creative Commons Attribution \| Share Alike 4… |
| [tgsp-kujm](https://www.datos.gov.co/d/tgsp-kujm) | Sedes de los Establecimientos Educativos del Departamento de Antioquia | Gobernación de Antioquia, Antioquia | 2022-06-08 | 7164 | 16 | Creative Commons Attribution \| Share Alike 4… |
| [epkg-mphw](https://www.datos.gov.co/d/epkg-mphw) | MEN_INDICADORES_PAE | Ministerio de Educación Nacional - MinEducac… | 2022-05-23 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [hqpw-8e5g](https://www.datos.gov.co/d/hqpw-8e5g) | Entidades sin ánimo de lucro en Departamento de Casanare. | Gobernación de Casanare, Casanare | 2022-05-05 | — | 25 | Creative Commons Attribution \| Share Alike 4… |
| [pgv3-riu8](https://www.datos.gov.co/d/pgv3-riu8) | NÚMERO DE INSTITUCIONES EDUCATIVAS BENEFICIADAS DEL PROGRAMA DE ALIME… | Gobernación de Santander, Santander | 2022-04-27 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [68ut-ip9i](https://www.datos.gov.co/d/68ut-ip9i) | COBERTURA DEL PROGRAMA DE ALIMENTACIÓN ESCOLAR (PAE) EN EL DEPARTAMEN… | Gobernación de Santander, Santander | 2022-04-25 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [eb5n-rfw8](https://www.datos.gov.co/d/eb5n-rfw8) | Sedes de Instituciones Educativas ubicadas en zonas rurales de difíci… | Gobernación de Boyacá, Boyacá | 2022-04-13 | — | 6 | Creative Commons Attribution \| Share Alike 4… |
| [v488-qa3u](https://www.datos.gov.co/d/v488-qa3u) | MEN_INDICADORES_EDUCACION_MEDIA | Ministerio de Educación Nacional - MinEducac… | 2022-02-25 | — | 5 | Creative Commons Attribution \| Share Alike 4… |
| [6sqn-9wh9](https://www.datos.gov.co/d/6sqn-9wh9) | MEN_INDICADORES_GENERACION_E | Ministerio de Educación Nacional - MinEducac… | 2022-01-18 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [v5z5-e88h](https://www.datos.gov.co/d/v5z5-e88h) | MEN_INDICE_PARIDAD_POR_GENERO_COBERTURA_BRUTA_ETC | Ministerio de Educación Nacional - MinEducac… | 2022-01-06 | — | 42 | Creative Commons Attribution \| Share Alike 4… |
| [mxqg-ytrw](https://www.datos.gov.co/d/mxqg-ytrw) | MEN_INDICE_PARIDAD_POR_GENERO_PARA_ETNICOS | Ministerio de Educación Nacional - MinEducac… | 2021-12-30 | — | 59 | Creative Commons Attribution \| Share Alike 4… |
| [f5ai-gvqt](https://www.datos.gov.co/d/f5ai-gvqt) | MEN_INDICE_PARIDAD_POR_GENERO_MATRICULA | Ministerio de Educación Nacional - MinEducac… | 2021-12-30 | — | 20 | Creative Commons Attribution \| Share Alike 4… |
| [3ncw-3qwq](https://www.datos.gov.co/d/3ncw-3qwq) | MEN_INDICADORES_INFRAESTRUCTURA | Ministerio de Educación Nacional - MinEducac… | 2021-12-22 | 3354 | 17 | Creative Commons Attribution \| Share Alike 4… |
| [4e5t-9b6q](https://www.datos.gov.co/d/4e5t-9b6q) | NIÑOS, NIÑAS Y ADOLESCENTES DE ESTABLECIMIENTOS EDUCATIVOS DEL MUNICI… | Alcaldía de Tibú, Norte de Santander | 2021-09-27 | 164 | 10 | Creative Commons Attribution \| Share Alike 4… |
| [g53n-xypy](https://www.datos.gov.co/d/g53n-xypy) | Cobertura del Programa de Alimentación Escolar (PAE) en el departamen… | Gobernación de Santander, Santander | 2021-05-20 | 1858 | 8 | Creative Commons Attribution \| Share Alike 4… |
| [x5ay-984n](https://www.datos.gov.co/d/x5ay-984n) | MEN_SEDES_EDUCATIVAS_PREESCOLAR_BÁSICA_Y_MEDIA | Ministerio de Educación Nacional - MinEducac… | 2021-03-19 | 53796 | 23 | Creative Commons Attribution \| Share Alike 4… |
| [m6wg-s96s](https://www.datos.gov.co/d/m6wg-s96s) | Listado de los Establecimientos Educativos No Oficiales del Departame… | Gobernación del Atlántico, Atlántico | 2020-10-30 | 126 | 30 | Creative Commons Attribution \| Share Alike 4… |
| [7g6s-xche](https://www.datos.gov.co/d/7g6s-xche) | Listado de sedes de los Establecimientos Educativos Oficiales (munici… | Gobernación del Atlántico, Atlántico | 2020-10-30 | 204 | 7 | Creative Commons Attribution \| Share Alike 4… |
| [kxdg-e9zy](https://www.datos.gov.co/d/kxdg-e9zy) | Programa de Alimentación Escolar (PAE) 2019-2020 en las Instituciones… | Gobernación de Santander, Santander | 2020-10-21 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [hux2-dk3u](https://www.datos.gov.co/d/hux2-dk3u) | RELACION DE INSTITUCIONES EDUCATIVAS BENEFICIDAS DEL PROGRAMA DE ALIM… | Gobernación de Santander, Santander | 2020-08-18 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [jwvi-unqh](https://www.datos.gov.co/d/jwvi-unqh) | Directorio de cuadrantes de Metropolitanas y Departamentos de Policía | Dirección General de la Policía Nacional - D… | 2020-06-26 | — | 7 | Creative Commons Attribution \| Share Alike 4… |

<details><summary><code>2btt-9z2g</code> — ESTABLECIMIENTOS AUTORIZADOS PARA EL ALMACENAMIENTO Y DISTRIBUCIÓN DE MEDICAMEN…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `clase` | CLASE | — |
| `direccion` | DIRECCION | — |
| `cod_mpio` | COD_MPIO | — |
| `nombre` | NOMBRE | **descartada** |
| `municipio` | MUNICIPIO | — |
| `barrio` | BARRIO | — |
| `cod_clase` | COD_CLASE | — |

</details>

<details><summary><code>2iht-wwxh</code> — ESTABLECIMIENTOS NACIONALES DE GASES MEDICINALES CERTIFICADOS CON BUENAS PRÁCTI…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_vencimiento` | FECHA VENCIMIENTO | — |
| `departamento` | DEPARTAMENTO | — |
| `ciudad` | CIUDAD | — |
| `direccion` | DIRECCION | — |
| `concepto_corto` | CONCEPTO CORTO | — |
| `expediente` | EXPEDIENTE | — |
| `fecha_notificacion` | FECHA NOTIFICACION | — |
| `nombre_establecimiento` | NOMBRE ESTABLECIMIENTO | — |
| `concepto` | CONCEPTO | — |

</details>

<details><summary><code>2sza-3ea9</code> — COBERTURA DEL PROGRAMA DE ALIMENTACIÓN ESCOLAR (PAE) EN EL DEPARTAMENTO DE NORT…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `programado_raci_n_comida` | (PROGRAMADO)  RACIÓN COMIDA CALIENTE TRANSPORTADA - CCT - ALMUERZO | — |
| `entregado_rps` | (ENTREGADO) RPS | — |
| `entregado_cct_almuerzo` | (ENTREGADO) CCT - ALMUERZO | — |
| `programado_raci_n_para` | (PROGRAMADO) RACIÓN PARA PREPARAR EN EL SITIO – ALMUERZO (RPS) | — |
| `entregado_raci_n` | (ENTREGADO) RACIÓN INDUSTRIALIZADA (RI) | — |
| `municipio` | MUNICIPIO | — |
| `zona` | ZONA | — |
| `codigo_dane` | CODIGO DANE | — |
| `fecha` | FECHA | — |
| `institucion_educativas` | INSTITUCION EDUCATIVAS | — |
| `programado_raci_n` | (PROGRAMADO)  RACIÓN INDUSTRIALIZADA (RI) | — |
| `matricula_a_corte_29_03_2023` | MATRICULA A CORTE 29/03/2023 | — |
| `sedes_educativas` | SEDES EDUCATIVAS | — |

</details>

<details><summary><code>3ncw-3qwq</code> — MEN_INDICADORES_INFRAESTRUCTURA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `cod_etc` | CODIGO_ETC | — |
| `dane_sede` | CODIGO_DANE_SEDE | — |
| `fuente_de_financiaci_n` | FUENTE FINACIAMIENTO | — |
| `municipio` | NOMBRE_MUNICIPIO | — |
| `aulas_nuevas` | AULAS_NUEVAS | — |
| `etc` | NOMBRE_ETC | — |
| `fecha` | FECHA | — |
| `dane_depto` | CODIGO_DANE_DEPTO | — |
| `fecha_corte` | FECHA_CORTE | — |
| `nombre_sede` | NOMBRE_SEDE | — |
| `dane_mpio` | CODIGO_DANE_MUNICIPIO | — |
| `depto` | NOMBRE_DEPTO | — |
| `fecha_fin_obra` | FECHA_FIN_OBRA | — |
| `aulas_mejoradas` | AULAS_MEJORADAS | — |
| `estado_general` | ESTADO_GENERAL | — |
| `total_aulas_nue_espec_interv` | TOTAL_AULAS_NUE_ESPEC_INTERV | — |
| `total_aulas_espec_mej_interv` | TOTAL_AULAS_ESPEC_MEJ_INTERV | — |

</details>

<details><summary><code>3y4s-dmxy</code> — MEN_INDICADORES_PRIMERA_INFANCIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `cod_dane_mun` | COD_DANE_MUNICIPIO | — |
| `fecha_corte` | FECHA_CORTE | — |
| `cod_dane_depto` | COD_DANE_DEPARTAMENTO | — |
| `nombre_depto` | NOMBRE_DEPARTAMENTO | — |
| `indicador_1_educaci_n_inicial` | INDICADOR 1. EDUCACIÓN INICIAL ICBF (Incluye Mujeres Gestantes) | — |
| `indicador_2_ni_os_y_ni_as` | INDICADOR 2. NIÑOS Y NIÑAS EN PREESCOLAR CON EDUCACIÓN INICIAL | — |
| `indicador_3_total_educaci` | INDICADOR 3. TOTAL EDUCACIÓN INICIAL ICBF + MEN | — |
| `indicador_4_concurrencia_de_atenciones` | INDICADOR 4. CONCURRENCIA DE ATENCIONES | — |
| `nombre_mun` | NOMBRE_MUNICIPIO | — |
| `fecha` | FECHA | — |
| `etc` | ETC | — |

</details>

<details><summary><code>4e5t-9b6q</code> — NIÑOS, NIÑAS Y ADOLESCENTES DE ESTABLECIMIENTOS EDUCATIVOS DEL MUNICIPIO DE TIB…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `racion_industrializada` | RACION INDUSTRIALIZADA | — |
| `raci_n_preparada_en_sitio` | RACIÓN PREPARADA EN SITIO | — |
| `municipio` | MUNICIPIO | — |
| `codigo_dane` | CODIGO DANE | — |
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |
| `escolares_beneficiados_reporte` | ESCOLARES BENEFICIADOS REPORTE SIMAT | — |
| `cupos_asignados` | CUPOS ASIGNADOS | — |
| `sede_educativa` | SEDE EDUCATIVA | — |
| `tipo_de_comunidad` | TIPO DE COMUNIDAD | — |
| `zona` | ZONA | — |

</details>

<details><summary><code>4hrb-y62g</code> — MEN_ESTADISTICAS DE MATRICULA POR DEPARTAMENTOS_ES: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `doctorado` | DOCTORADO | — |
| `tecnologica` | TECNOLOGICA | — |
| `a_o` | AÑO | — |
| `c_digo_deldepartamento` | Código delDepartamento | — |
| `universitaria` | UNIVERSITARIA | — |
| `nombre_del_departamento` | Nombre del Departamento | **descartada** |
| `especializacion` | ESPECIALIZACION | — |
| `maestria` | MAESTRIA | — |
| `ies_con_oferta` | IES CON OFERTA | — |
| `tecnica_profesional` | TECNICA PROFESIONAL | — |

</details>

<details><summary><code>5686-m6za</code> — ESTABLECIMIENTOS NACIONALES DE MEDICAMENTOS CERTIFICADOS CON BUENAS PRÁCTICAS D…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `expediente` | EXPEDIENTE | — |
| `departamento` | DEPARTAMENTO | — |
| `concepto` | CONCEPTO | — |
| `ciudad` | CIUDAD | — |
| `concepto_corto` | CONCEPTO CORTO | — |
| `fecha_vencimiento` | FECHA VENCIMIENTO | — |
| `nombre_establecimiento` | NOMBRE ESTABLECIMIENTO | — |
| `direccion` | DIRECCION | — |
| `fecha_notificacion` | FECHA NOTIFICACION | — |

</details>

<details><summary><code>5c2k-ahfc</code> — MEN_NÚMERO_BACHILLERES_POR_ETC: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `a_o` | AÑO | — |
| `aprobados_26_oficial` | APROBADOS_26_OFICIAL | — |
| `matricula_26_no_oficial` | MATRICULA_26_NO_OFICIAL | — |
| `aprobados_11_no_oficial` | APROBADOS_11_NO_OFICIAL | — |
| `matricula_11_no_oficial` | MATRICULA_11_NO_OFICIAL | — |
| `matricula_11_total` | MATRICULA_11_TOTAL | — |
| `secretaria` | SECRETARIA | — |
| `codigo_municipio` | CODIGO_MUNICIPIO | — |
| `codigo_departamento` | CODIGO_DEPARTAMENTO | — |
| `aprobados_11_total` | APROBADOS_11_TOTAL | — |
| `aprobados_26_total` | APROBADOS_26_TOTAL | — |
| `departamento` | DEPARTAMENTO | — |
| `matricula_11_oficial` | MATRICULA_11_OFICIAL | — |
| `aprobados_26_no_oficial` | APROBADOS_26_NO_OFICIAL | — |
| `municipio` | MUNICIPIO | — |
| `matricula_26_oficial` | MATRICULA_26_OFICIAL | — |
| `matricula_26_total` | MATRICULA_26_TOTAL | — |
| `aprobados_11_oficial` | APROBADOS_11_OFICIAL | — |
| `codigo_etc` | CODIGO_ETC | — |

</details>

<details><summary><code>5wck-szir</code> — MEN_MATRICULA_ESTADISTICA_ES: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_metodologia` | Id_Metodologia | — |
| `c_digo_del_departamento_programa` | Código del Departamento(Programa) | — |
| `instituci_n_de_educaci_n_superior_ies` | Institución de Educación Superior (IES) | — |
| `programa_acad_mico` | Programa Académico | — |
| `id_nucleo` | Id_Nucleo | — |
| `c_digo_snies_delprograma` | Código SNIES delprograma | — |
| `principal_oseccional` | Principal oSeccional | — |
| `id_nivel` | Id_Nivel | — |
| `c_digo_del_municipio_ies` | Código del Municipio(IES) | — |
| `id_caracter` | Id_Caracter | — |
| `n_cleo_b_sico_del_conocimiento_nbc` | Núcleo Básico del Conocimiento (NBC) | — |
| `a_o` | Año | — |
| `matriculados_2015` | Total Matriculados | — |
| `departamento_de_domicilio_de_la_ies` | Departamento de domicilio de la IES | — |
| `c_digo_del_departamento_ies` | Código del departamento(IES) | — |
| `id_sector` | Id_Sector | — |
| `id_nivel_formacion` | Id_Nivel_Formacion | — |
| `id_area` | Id_Area | — |
| `c_digo_del_municipio_programa` | Código del Municipio(Programa) | — |
| `c_digo_de_la_instituci_n` | Código de la Institución | — |
| `ies_padre` | IES PADRE | — |
| `departamento_de_oferta_del_programa` | Departamento de oferta del programa | — |
| `municipio_de_oferta_del_programa` | Municipio de oferta del programa | — |
| `id_g_nero` | Id Género | — |
| `municipio_dedomicilio_de_la_ies` | Municipio dedomicilio de la IES | — |
| `semestre` | Semestre | — |

</details>

<details><summary><code>65zu-5xdk</code> — Sedes de los Instituciones Educativas del Departamento de Boyacá: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_sede` |  NOMBRE SEDE | — |
| `sector` | SECTOR | — |
| `nombre_establecimiento` |  NOMBRE ESTABLECIMIENTO | — |
| `modelos` |  MODELOS | — |
| `zona` |  ZONA | — |
| `direcci_n` |  DIRECCIÓN | — |
| `estado_sede` |  ESTADO SEDE | — |
| `c_digo_establecimiento` |  CÓDIGO ESTABLECIMIENTO | — |
| `secretaria` | SECRETARIA | — |
| `grados` |  GRADOS | — |
| `c_digo_sede` |  CÓDIGO SEDE | — |
| `c_digo_municipio` | CÓDIGO MUNICIPIO | — |
| `nombre_municipio` |  NOMBRE MUNICIPIO | — |
| `tel_fono` |  TELÉFONO | **descartada** |
| `niveles` |  NIVELES | — |

</details>

<details><summary><code>68ut-ip9i</code> — COBERTURA DEL PROGRAMA DE ALIMENTACIÓN ESCOLAR (PAE) EN EL DEPARTAMENTO DE NORT…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipio` | MUNICIPIO | — |
| `sedes_educativas` | SEDES EDUCATIVAS | — |
| `raci_n_para_preparar_en_el` | RACIÓN PARA PREPARAR EN EL SITIO – ALMUERZO | — |
| `estudiantes_matriculados` | ESTUDIANTES MATRICULADOS HASTA 15/02/2022 | — |
| `total_de_cupos_asignados` | TOTAL DE CUPOS ASIGNADOS | — |
| `fecha` | FECHA | — |
| `codigo_dane` | CODIGO DANE | — |
| `zona` | ZONA | — |
| `institucion_educativas` | INSTITUCION EDUCATIVAS | — |
| `de_cobertura` | % DE COBERTURA | — |
| `raci_n_industrializada` | RACIÓN INDUSTRIALIZADA | — |

</details>

<details><summary><code>6sqn-9wh9</code> — MEN_INDICADORES_GENERACION_E: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `departamento` | NOMBRE_DEPARTAMENTO | — |
| `municipio` | NOMBRE_MUNICIPIO | — |
| `divipola_depto` | COD_DANE_DEPARTAMENTO | — |
| `divipola_municipio` | COD_DANE_MUNICIPIO | — |
| `indicador_1_beneficiarios_ge` | INDICADOR 1. BENEFICIARIOS_GE | — |
| `fecha_de_corte` | FECHA_CORTE | — |
| `fecha_evento` | FECHA | — |

</details>

<details><summary><code>72xa-encm</code> — Centros Digitales – Departamento del Caquetá: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_beneficiario` | ID_Beneficiario | — |
| `velocidad_de_conexion_bajada` | Velocidad_De_Conexion_Bajada_Mbps | — |
| `fecha_instalaci_n` | Fecha_Instalación | — |
| `fecha_inicio_de_operaci_n` | Fecha_Inicio_De_Operación | — |
| `pdet` | Pdet | — |
| `fin_de_operaci_n_inicial` | Fin_De_Operación_Inicial | — |
| `tipo_de_conectividad` | Tipo_De_Conectividad | — |
| `tipo_de_energia` | Tipo_De_Energia | — |
| `contratista` | Contratista | — |
| `velocidad_de_conexion_subida` | Velocidad_De_Conexion_Subida_Mbps | — |
| `nombre_sede_educativa` | Nombre_Sede_Educativa | — |
| `estado_de_los_cdr` | Estado_De_Los_Cdr | — |
| `instituci_n_educativa` | Institución_Educativa | — |
| `tipo_de_sitio` | Tipo_De_Sitio | — |
| `dane_sede_educativa` | Dane_Sede_Educativa | — |
| `centro_poblado` | Centro_Poblado | — |
| `c_digo_instituci_n_educativa` | Código_Institución_Educativa | — |
| `codigo_municipio` | Codigo_Municipio | — |
| `departamento` | Departamento | — |
| `longitud` | Longitud | — |
| `latitud` | Latitud | — |
| `municipio` | Municipio | — |

</details>

<details><summary><code>7g6s-xche</code> — Listado de sedes de los Establecimientos Educativos Oficiales (municipios no ce…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipio` | MUNICIPIO | — |
| `nombre_sede` | Nombre Sede | — |
| `nombre_ee` | Nombre EE | **descartada** |
| `direcci_n_sede` | Dirección Sede | — |
| `codigo_dane_sede` | Codigo Dane Sede | — |
| `codigo_dane_ee` | Codigo Dane EE | — |
| `zona` | Zona | — |

</details>

<details><summary><code>7tec-5fhs</code> — Listado de Instituciones Educativas Oficiales y No Oficiales del Departamento d…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `tipo_establecimiento` | Tipo Establecimiento | — |
| `zona` | Zona | — |
| `nombre_rector` | Nombre Rector | **descartada** |
| `licencia` | Licencia | — |
| `niveles` | Niveles | — |
| `modelos_educativos` | Modelos Educativos | — |
| `c_digo` | Código | — |
| `prestador_de_servicio` | Prestador de servicio | — |
| `n_mero_de_sedes` | Número de Sedes | — |
| `jornadas` | Jornadas | — |
| `genero` | Genero | **descartada** |
| `especialidad` | Especialidad | — |
| `propiedad_de_la_planta_fis` | Propiedad de la planta fisíca | — |
| `direcci_n` | Dirección | — |
| `idiomas` | Idiomas | — |
| `sector` | Sector | — |
| `discapacidades` | Discapacidades | **descartada** |
| `caracter` | Caracter | — |
| `grados` | Grados | — |
| `c_digo_municipio` | Código Municipio | — |
| `nombre` | Nombre | **descartada** |
| `estado` | Estado | — |
| `municipio` | Municipio | — |
| `correo_electr_nico` | Correo Electrónico | **descartada** |

</details>

<details><summary><code>7y7n-8wu6</code> — Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE en el Muni…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `pais_origen` | PAIS_ORIGEN | — |
| `genero` | GENERO | **descartada** |
| `discapacidad` | DISCAPACIDAD | **descartada** |
| `estrato` | ESTRATO | — |
| `modelo` | MODELO | — |
| `grupo` | GRUPO | — |
| `grado_acad_mico` | GRADO ACADÉMICO | — |
| `tipo_documento` | TIPO DOCUMENTO | **descartada** |
| `sisben_tres` | SISBEN_TRES | — |
| `estado` | ESTADO | — |
| `jerarquia` | JERARQUIA | — |
| `jornada` | JORNADA | — |
| `zona_de_la_sede` | ZONA DE LA SEDE | — |
| `consecutivo` | CONSECUTIVO | — |
| `codigo_dane_de_la_sede` | CODIGO DANE DE LA SEDE | — |
| `calendario` | CALENDARIO | — |
| `sede_de_la_instituci_n` | SEDE DE LA INSTITUCIÓN EDUCATIVA | — |
| `sector` | SECTOR | — |
| `nombre_de_la_institucion` | NOMBRE DE LA INSTITUCION EDUCATIVA | **descartada** |
| `c_digo_dane` | CÓDIGO DANE | — |

</details>

<details><summary><code>9nwa-4tvt</code> — ESTABLECIMIENTOS INTERNACIONALES FABRICANTES DE MEDICAMENTOS CERTIFICADOS CON B…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_establecimiento` | NOMBRE ESTABLECIMIENTO | — |
| `pais` | PAIS | — |
| `ciudad` | CIUDAD | — |
| `fecha_notificacion` | FECHA NOTIFICACION | — |
| `expediente` | EXPEDIENTE | — |
| `concepto_corto` | CONCEPTO CORTO | — |
| `concepto` | CONCEPTO | — |
| `direccion` | DIRECCION | — |
| `fecha_vencimiento` | FECHA VENCIMIENTO | — |

</details>

<details><summary><code>b4dp-ximh</code> — Prestadores de Salud Departamento de Antioquia: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `horario_viernes` | horario viernes | — |
| `nombreprestador` | nombre prestador | — |
| `fecha_apertura` | fecha apertura | — |
| `codigo_clase_prestador` | codigo clase prestador | — |
| `clasepersona` | clase persona | — |
| `claseprestador` | clase prestador | — |
| `nivel` | nivel | — |
| `nombre_centro_poblado` | nombre centro poblado | — |
| `privadapublica` | nombre naturaleza juridica | — |
| `codigo_naturaleza_juridica` | codigo naturaleza juridica | — |
| `codigo_centro_poblado` | codigo centro poblado | — |
| `horario_lunes` | horario lunes | — |
| `barrio` | barrio | — |
| `gerente` | gerente | — |
| `nombre_sede` | nombre sede | — |
| `horario_martes` | horario martes | — |
| `horario_jueves` | horario jueves | — |
| `numero_sede` | número sede | — |
| `horario_sabado` | horario sabado | — |
| `digito_verificacion_nit` | digito verificacion nit | **descartada** |
| `email` | email | **descartada** |
| `horario_domingo` | horario domingo | — |
| `nit` | nit | **descartada** |
| `tipo_zona` | tipo zona | — |
| `fax` | fax | **descartada** |
| `municipio` | municipio | — |
| `codigohabilitacion` | codigo habilitacion | — |
| `ese` | ese | — |
| `direccion` | direccion | — |
| `horario_miercoles` | horario miercoles | — |
| `telefono` | telefono | **descartada** |
| `departamento` | departamento | — |
| `caracter` | caracter | — |

</details>

<details><summary><code>b6yg-3vyi</code> — ESTUDIANTES CON DISCAPACIDAD DEPARTAMENTO DE SANTANDER: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `d_sede` | d_sede | — |
| `etnia` | etnia | **descartada** |
| `d_grado` | d_grado | — |
| `d_mujeres` | d_mujeres | — |
| `d_genero` | d_genero | **descartada** |
| `d_nomzon` | d_nomzon | — |
| `d_nombsede` | d_nombsede | — |
| `desplazado` | desplazado | — |
| `d_hombres` | d_hombres | — |
| `d_muni` | d_muni | — |
| `d_nomsec` | d_nomsec | — |
| `dane_ant` | dane_ant | — |
| `d_nombinst` | d_nombinst | — |
| `d_nombmuni` | d_nombmuni | — |
| `d_nomjor` | d_nomjor | — |
| `d_edad` | d_edad | — |
| `d_a_o` | d_año | — |
| `d_tipo` | d_tipo | — |
| `d_provincia` | d_provincia | — |
| `d_total` | d_total | — |

</details>

<details><summary><code>bvpy-6cm7</code> — Entidades de salud en el Departamento de Risaralda: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `sedeppal` | sedeppal | — |
| `barrio` | barrio | — |
| `zona` | zona | — |
| `email` | email | **descartada** |
| `telefono` | telefono | **descartada** |
| `direccion` | direccion | — |
| `codigo` | codigo | — |
| `dpto` | dpto | — |
| `gerente` | gerente | — |
| `mpio` | mpio | — |
| `nombre_sede` | nombre_sede | — |
| `prestador` | prestador | — |
| `numero_sede` | numero_sede | — |

</details>

<details><summary><code>c4qb-ek68</code> — INDICADORES EDUCATIVOS DEL DEPARTAMENTO DEL MAGDALENA POR MUNICIPIOS 2018 - 2024: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipios` | municipios | — |
| `tasa_de_reprobaci_n` | tasa de reprobación | — |
| `tasa_de_deserci_n` | tasa de deserción | — |
| `tasa_de_repitencia` | tasa de repitencia | — |
| `a_o` | año | — |
| `tasa_de_aprobaci_n` | tasa de aprobación | — |
| `tasa_cobertura_bruta` | tasa cobertura bruta | — |
| `tasa_de_matr_cula` | tasa de matrícula | — |
| `n_mero_de_habitantes` | número de habitantes | — |
| `tasa_cobertura_neta` | tasa cobertura neta | — |
| `subregi_n` | Subregión | — |

</details>

<details><summary><code>c56g-ubd2</code> — INSTITUCIONES Y SEDES EDUCATIVAS, PUBLICAS Y PRIVADAS EN EL DEPARTAMENTO DEL MA…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipio` | MUNICIPIO | — |
| `sector` | SECTOR | — |
| `nombre_sede` | NOMBRE SEDE | — |
| `direccion_sede` | DIRECCION SEDE | — |
| `a_o` | SUBREGION | — |
| `nombre_institucion_educativa` | NOMBRE  INSTITUCION EDUCATIVA | — |
| `zona` | ZONA | — |

</details>

<details><summary><code>cfw5-qzt5</code> — MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `caracter` | CARACTER | — |
| `calendario` | CALENDARIO | — |
| `cod_sector` | COD_SECTOR | — |
| `barrio_vereda` | BARRIO_VEREDA | — |
| `rector` | RECTOR | — |
| `cantidad_sedes` | CANTIDAD_SEDES | — |
| `municipio` | MUNICIPIO | — |
| `cod_dane_municipio` | COD_DANE_MUNICIPIO | — |
| `nombre_establecimiento` | NOMBRE_ESTABLECIMIENTO | — |
| `email` | EMAIL | **descartada** |
| `secretaria` | SECRETARIA | — |
| `telefono` | TELEFONO | **descartada** |
| `fax` | FAX | **descartada** |
| `a_o` | AÑO | — |
| `departamento` | DEPARTAMENTO | — |
| `cod_calendario` | COD_CALENDARIO | — |
| `web` | WEB | — |
| `cod_dane_departamento` | COD_DANE_DEPARTAMENTO | — |
| `sector` | SECTOR | — |
| `total_matricula` | TOTAL_MATRICULA | — |
| `codigo_dane` | CODIGO_DANE | — |
| `cod_caracter` | COD_CARACTER | — |
| `direccion` | DIRECCION | — |
| `cod_secretaria` | COD_SECRETARIA | — |

</details>

<details><summary><code>cmaw-2gaz</code> — MATRICULA POR MUNICIPIOS EN EL SECTOR OFICIAL Y PRIVADO, DEPARTAMENTO DEL MAGDA…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `privada` | PRIVADA | — |
| `oficial` | OFICIAL | — |
| `a_o` | AÑO | — |
| `subregion` | SUBREGION | — |
| `contratada_privada` | CONTRATADA PRIVADA | — |
| `municipio` | MUNICIPIO | — |
| `codigo_dane` | CODIGO DANE | — |
| `contratada_oficial` | CONTRATADA OFICIAL | — |

</details>

<details><summary><code>dhqg-4ngc</code> — MATRÍCULA POR INSTITUCIONES EDUCATIVAS DEPARTAMENTO DE SANTANDER: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `grado_1` | grado_1 | — |
| `prim_inf` | prim_inf | — |
| `total` | total | — |
| `jardin` | jardin | — |
| `rgrado_9` | rgrado_9 | — |
| `grado_10` | grado_10 | — |
| `rgrado_0` | rgrado_0 | — |
| `rgrado_4` | rgrado_4 | — |
| `rgrado_8` | rgrado_8 | — |
| `sede` | sede | — |
| `rgrado_25` | rgrado_25 | — |
| `dane_act` | dane_act | — |
| `prejardin` | prejardin | — |
| `dane_ant` | dane_ant | — |
| `rgrado_12` | rgrado_12 | — |
| `rgrado_23` | rgrado_23 | — |
| `grado_6` | grado_6 | — |
| `municipi` | municipi | — |
| `rgrado_5` | rgrado_5 | — |
| `grado_22` | grado_22 | — |
| `grado_9` | grado_9 | — |
| `grado_20` | grado_20 | — |
| `grado_7` | grado_7 | — |
| `rgrado_22` | rgrado_22 | — |
| `grado_11` | grado_11 | — |
| `codi_dan` | codi_dan | — |
| `grado_43` | grado_43 | — |
| `provincia` | provincia | — |
| `grado_2` | grado_2 | — |
| `grado_21` | grado_21 | — |
| `grado_45` | grado_45 | — |
| `grado_25` | grado_25 | — |
| `rgrado_26` | rgrado_26 | — |
| `grado_99` | grado_99 | — |
| `codi_mun` | codi_mun | — |
| `rgrado_1` | rgrado_1 | — |
| `grado_26` | grado_26 | — |
| `grado_0` | grado_0 | — |
| `grado_44` | grado_44 | — |
| `rgrado_10` | rgrado_10 | — |
| `rgrado_2` | rgrado_2 | — |
| `nombsect` | nombsect | — |
| `rgrado_6` | rgrado_6 | — |
| `grado_5` | grado_5 | — |
| `rgrado_13` | rgrado_13 | — |
| `rgrado_7` | rgrado_7 | — |
| `zona` | zona | — |
| `rgrado_21` | rgrado_21 | — |
| `grado_12` | grado_12 | — |
| `especia` | especia | — |
| `rjardin` | rjardin | — |
| `ano` | ano | — |
| `grado_23` | grado_23 | — |
| `rgrado_24` | rgrado_24 | — |
| `grado_41` | grado_41 | — |
| `grado_42` | grado_42 | — |
| `grado_24` | grado_24 | — |
| `rgrado_3` | rgrado_3 | — |
| `sedes` | sedes | — |
| `rgrado_11` | rgrado_11 | — |
| `rprejardin` | rprejardin | — |
| `grado_13` | grado_13 | — |
| `grado_4` | grado_4 | — |
| `rprim_inf` | rprim_inf | — |
| `grado_8` | grado_8 | — |
| `grado_3` | grado_3 | — |

</details>

<details><summary><code>e4hn-mr8d</code> — Resumen de Estrategias	Secretaría Educacion - Santander: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `de_nombzona` | de_nombzona | — |
| `refrigerio` | refrigerio | — |
| `total_alimentacion` | Total Alimentacion | — |
| `de_sede` | de_sede | — |
| `zona_pae` | zona_pae | — |
| `transporte` | transporte | — |
| `compleme` | compleme | — |
| `almuerzo` | almuerzo | — |
| `dane_act` | dane_act | — |
| `matricula` | matricula | — |
| `de_nombmuni` | de_nombmuni | — |
| `jornadasc` | jornadasc | — |
| `de_nombsede` | de_nombsede | — |
| `faltantes_en_pae` | Faltantes en Pae | — |
| `faccion` | faccion | — |
| `de_institu` | de_institu | — |
| `provincia` | provincia | — |
| `de_muni` | de_muni | — |
| `dane_ant` | dane_ant | — |

</details>

<details><summary><code>e6kt-wdhu</code> — Zonas Comunitarias para la Paz – Puntos de Conectividad Instalados en el Depart…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_inicio_operacion` | FECHA_INICIO_OPERACION | — |
| `municipio` | MUNICIPIO | — |
| `cod_dane_departamento` | COD_DANE_DEPARTAMENTO | — |
| `zona` | Zona | — |
| `codigo_dane_sede_2` | Codigo_Dane_Sede_2 | — |
| `latitud` | LATITUD | — |
| `sede_id` | SEDE_ID | — |
| `operador` | OPERADOR | **descartada** |
| `fecha_fin_operacion` | FECHA_FIN_OPERACION | — |
| `cuenta_con_servicio_de_energia` | CUENTA_CON_SERVICIO_DE_ENERGIA_CONSULTA_SE_2023 | — |
| `id_beneficiario` | ID_BENEFICIARIO | — |
| `estado` | ESTADO | — |
| `longitud` | LONGITUD | — |
| `fecha_instalacion` | FECHA_INSTALACION | — |
| `codigo_dane_ee` | Codigo_Dane_EE | — |
| `nombre_ee` | Nombre_EE | **descartada** |
| `tipo_energia_2023__consulta` | TIPO_ENERGIA_2023__CONSULTA_SE_2023 | — |
| `cod_dane_municipio` | COD_DANE_MUNICIPIO | — |
| `prioridad_proyecto_zcp` | PRIORIDAD_PROYECTO_ZCP | — |
| `departamento` | Departamento | — |
| `nombre_sede` | Nombre_Sede | — |
| `codigo_dane_sede` | Codigo_Dane_Sede | — |

</details>

<details><summary><code>eb5n-rfw8</code> — Sedes de Instituciones Educativas ubicadas en zonas rurales de difícil acceso e…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `sede` | SEDE | — |
| `municipio` | MUNICIPIO | — |
| `codigo_dane_instituci_n` | CODIGO DANE INSTITUCIÓN | — |
| `vereda` | VEREDA | — |
| `codigo_dane_sede` | CODIGO DANE SEDE | — |
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |

</details>

<details><summary><code>emd6-ef7x</code> — Establecimientos Educativos del sector oficial y no oficial por municipio - DEP…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `licencia` |  LICENCIA | — |
| `genero` |  GENERO | **descartada** |
| `internado` |  INTERNADO | — |
| `idiomas` |  IDIOMAS | — |
| `matricula_contratada` |  MATRICULA CONTRATADA | — |
| `capacidades_excepcionales` |   CAPACIDADES EXCEPCIONALES | — |
| `resguardo` |  RESGUARDO | — |
| `nombre` |  NOMBRE | **descartada** |
| `tipo_establecimiento` |  TIPO ESTABLECIMIENTO | — |
| `c_digo_municipio` | CÓDIGO MUNICIPIO | — |
| `sector` |  SECTOR | — |
| `propiedad_de_la_planta_fis_ca` |  PROPIEDAD DE LA PLANTA FISÍCA | — |
| `n_mero_de_sedes` |  NÚMERO DE SEDES | — |
| `direcci_n` |   DIRECCIÓN | — |
| `prestador_de_servicio` |  PRESTADOR DE SERVICIO | — |
| `correo_electr_nico` |  CORREO ELECTRÓNICO | **descartada** |
| `tel_fono` |  TELÉFONO | **descartada** |
| `jornadas` |  JORNADAS | — |
| `discapacidades` |  DISCAPACIDADES | **descartada** |
| `estado` |  ESTADO | — |
| `calendario` |  CALENDARIO | — |
| `especialidad` |  ESPECIALIDAD | — |
| `municipio` |  MUNICIPIO | — |
| `nombre_rector` |  NOMBRE RECTOR | **descartada** |
| `grados` |  GRADOS | — |
| `zona` |  ZONA | — |
| `secretar_a` | SECRETARÍA | — |
| `estrato_socio_economico` |  ESTRATO SOCIO-ECONOMICO | — |
| `modelos_educativos` |  MODELOS EDUCATIVOS | — |
| `niveles` |  NIVELES | — |
| `c_digo` | CÓDIGO | — |
| `caracter` |  CARACTER | — |

</details>

<details><summary><code>enmx-7kvv</code> — MEN_MATRICULA_MIGRANTES_EN_EDUCACION_BASICA_Y_MEDIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_sector` | ID_SECTOR | — |
| `codigo_pais_origen` | CODIGO_PAIS_ORIGEN | — |
| `anno` | ANNO | — |
| `total_matricula` | TOTAL_MATRICULA | — |
| `discapacidad` | DISCAPACIDAD | **descartada** |
| `nombre_pais_origen` | NOMBRE_PAIS_ORIGEN | — |
| `tipo_jornada` | TIPO_JORNADA | — |
| `zona` | ZONA | — |
| `genero` | GENERO | **descartada** |
| `id_zona` | ID_ZONA | — |
| `sector` | SECTOR | — |

</details>

<details><summary><code>epkg-mphw</code> — MEN_INDICADORES_PAE: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `cantidad_beneficiarios_pae` | CANTIDAD_BENEFICIARIOS_PAE | — |
| `zona_sede` | ZONA | — |
| `departamento` | DEPARTAMENTO | — |
| `fecha_corte` | FECHA_CORTE | — |
| `jornada` | JORNADA | — |
| `grupo_poblacional` | GRUPO_POBLACIONAL | — |
| `municipio` | MUNICIPIO | — |
| `codigo_departamento` | CODIGO_DEPARTAMENTO | — |
| `fecha` | FECHA | — |
| `codigo_municipio` | CODIGO_MUNICIPIO | — |

</details>

<details><summary><code>f25x-wa6y</code> — ESTABLECIMIENTOS FABRICANTES DE DISPOSITIVOS MÉDICOS SOBRE MEDIDA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `actividad` | ACTIVIDAD | — |
| `concepto` | CONCEPTO | — |
| `lineaproductos` | LINEAPRODUCTOS | — |
| `ciudadmunicipio` | CIUDADMUNICIPIO | — |
| `establecimiento` | ESTABLECIMIENTO | — |
| `fechaconcepto` | FECHACONCEPTO | — |
| `nit` | NIT | **descartada** |

</details>

<details><summary><code>f5ai-gvqt</code> — MEN_INDICE_PARIDAD_POR_GENERO_MATRICULA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `anno_inf` | AÑO | — |
| `ipg_matr_prim` | IPG_MATR_PRIM | — |
| `ipg_matr_prej` | IPG_MATR_PREJ | — |
| `matr_fem_media` | MATR_FEM_MEDIA | — |
| `matr_fem_prej` | MATR_FEM_PREJ | — |
| `etc` | ETC | — |
| `matr_masc_prej` | MATR_MASC_PREJ | — |
| `matr_masc_prim` | MATR_MASC_PRIM | — |
| `matr_masc_media` | MATR_MASC_MEDIA | — |
| `ipg_matr_media` | IPG_MATR_MEDIA | — |
| `c_digoetc` | CODIGOETC | — |
| `matr_masc_trans` | MATR_MASC_TRANS | — |
| `ipg_matr_sec` | IPG_MATR_SEC | — |
| `departamento` | DEPARTAMENTO | — |
| `ipg_matr_trans` | IPG_MATR_TRANS | — |
| `c_digodepartamento` | CODIGODEPARTAMENTO | — |
| `matr_fem_prim` | MATR_FEM_PRIM | — |
| `matr_masc_sec` | MATR_MASC_SEC | — |
| `matr_fem_sec` | MATR_FEM_SEC | — |
| `matr_fem_trans` | MATR_FEM_TRANS | — |

</details>

<details><summary><code>fbyd-epjh</code> — Matricula con discapacidad Departamento de Risaralda: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `variable` | Variable | — |
| `cantidad` | Cantidad | — |
| `a_o` | Año | — |
| `municipio` | Municipio | — |

</details>

<details><summary><code>g53n-xypy</code> — Cobertura del Programa de Alimentación Escolar (PAE) en el departamento Norte d…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |
| `municipio` | MUNICIPIO | — |
| `total_de_cupos_asignados` | TOTAL DE CUPOS ASIGNADOS (PAQUETES ALIMENTARIOS) | — |
| `sede_educativa` | SEDE EDUCATIVA | — |
| `codigo_dane_ie` | CODIGO DANE IE | — |
| `id` | ID | — |
| `zona` | ZONA | — |
| `porcentaje_de_cobertura` | PORCENTAJE DE COBERTURA | — |

</details>

<details><summary><code>gc4x-u4iy</code> — ESTABLECIMIENTOS INSCRITOS PARA EL MANEJO DE MEDICAMENTOS DE CONTROL ESPECIAL: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `barrio` | BARRIO | — |
| `vencimiento` | VENCIMIENTO | — |
| `expedicion` | EXPEDICION | — |
| `cod_mpio` | COD_MPIO | — |
| `clase` | CLASE | — |
| `municipio` | MUNICIPIO | — |
| `direccion` | DIRECCION | — |
| `resolucion` | RESOLUCION | — |
| `cod_clase` | COD_CLASE | — |
| `nombre_o_razon_social` | NOMBRE O RAZON SOCIAL | **descartada** |

</details>

<details><summary><code>hqpw-8e5g</code> — Entidades sin ánimo de lucro en Departamento de Casanare.: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `categoria` | CATEGORIA | — |
| `organizaci_n_jur_dica` | organización Jurídica | — |
| `_ltimo_a_o_renovado` | ÚLTIMO AÑO RENOVADO | — |
| `ciiu_actividad_2` | CIIU ACTIVIDAD-2 | — |
| `est_matricula` | EST-MATRICULA | — |
| `tel_fono_2` | TELÉFONO 2 | **descartada** |
| `fec_constitucion` | FEC-CONSTITUCION | — |
| `fec_renovacion` | FEC-RENOVACION | — |
| `fec_matricula` | FEC-MATRICULA | — |
| `nit` | NIT | **descartada** |
| `fec_disolucion` | FEC-DISOLUCION | — |
| `ciiu_actividad_4` | CIIU ACTIVIDAD-4 | — |
| `activo_total` | ACTIVO-TOTAL | — |
| `raz_n_social` | Razón Social | — |
| `ciiu_actividad_1` | CIIU ACTIVIDAD-1 | — |
| `ciiu_actividad_3` | CIIU ACTIVIDAD-3 | — |
| `vigilancia` | Vigilancia | — |
| `tel_fono_3` | TELÉFONO 3 | **descartada** |
| `tel_fono_1` | TELÉFONO 1 | **descartada** |
| `matr_cula` | Matrícula | — |
| `municipio` | Municipio | — |
| `representante_legal` | Representante Legal | — |
| `direcci_n` | Dirección | — |
| `email` | EMAIL | **descartada** |
| `fec_vigencia` | FEC-VIGENCIA | — |

</details>

<details><summary><code>hux2-dk3u</code> — RELACION DE INSTITUCIONES EDUCATIVAS BENEFICIDAS DEL PROGRAMA DE ALIMENTACIÓN E…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `raci_n_industrializada_ri` | RACIÓN INDUSTRIALIZADA (RI) | — |
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |
| `sede_educativa` | SEDE EDUCATIVA | — |
| `codigo_dane_i_e` | CODIGO DANE I.E | — |
| `almuerzo_preparado_en_sitio` | ALMUERZO PREPARADO EN SITIO (APS) | — |
| `zona` | ZONA | — |
| `a_o` | AÑO | — |
| `municipio` | MUNICIPIO | — |
| `n_instituciones_y_sedes` | Nº INSTITUCIONES Y SEDES EDUCATIVAS BENEFICIADAS | — |
| `total_de_cupos_asignados` | TOTAL DE CUPOS ASIGNADOS POR SEDE | — |

</details>

<details><summary><code>hyqu-diue</code> — Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024.…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigo_dane_departamento` | Código Dane Departamento | — |
| `ciclo_vital` | Ciclo Vital | — |
| `orientacion_sexual` | Orientación Sexual | **descartada** |
| `actividad_durante_el_hecho` | Actividad Durante el Hecho | — |
| `circunstancia_del_hecho_detallada` | Circunstancia del Hecho Detallada | — |
| `a_o_del_hecho` | Año del hecho | — |
| `id` | ID | — |
| `grupo_de_edad_judicial` | Grupo de Edad judicial | — |
| `rango_de_hora_del_hecho_x_3_horas` | Rango de Hora del Hecho X 3 Horas | — |
| `pais_de_nacimiento` | País de Nacimiento | — |
| `departamento_del_hecho_dane` | Departamento del hecho DANE | — |
| `localidad_del_hecho` | Localidad del Hecho | — |
| `municipio_del_hecho_dane` | Municipio del hecho DANE | — |
| `sexo_de_la_victima` | Sexo de la victima | **descartada** |
| `transgenero` | Transgénero | — |
| `sexo_del_agresor` | Sexo del Agresor | **descartada** |
| `pertenencia_etnica` | Pertenencia Étnica | — |
| `dia_del_hecho` | Dia del hecho | — |
| `mes_del_hecho` | Mes del hecho | — |
| `grupo_de_edad_quinquenal` | Grupo de Edad Quinquenal | — |
| `escenario_del_hecho` | Escenario del Hecho | — |
| `pertenencia_grupal` | Pertenencia Grupal | — |
| `grupo_mayor_menor_de_edad` | Grupo Mayor Menor de Edad | — |
| `escolaridad` | Escolaridad | — |
| `zona_del_hecho` | Zona del Hecho | — |
| `estado_civil` | Estado Civil | **descartada** |
| `presunto_agresor_detallado` | Presunto Agresor Detallado | — |
| `codigo_dane_municipio` | Código Dane Municipio | — |
| `tipo_de_discapacidad` | Tipo de Discapacidad | **descartada** |
| `identidad_de_genero` | Identidad de Género | **descartada** |
| `pueblo_indigena` | Pueblo Indígena | — |
| `contexto_del_hecho` | Contexto del Hecho | — |

</details>

<details><summary><code>i7cb-raxc</code> — CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `atc` | atc | — |
| `cantidadcum` | cantidadcum | — |
| `unidadmedida` | unidadmedida | — |
| `tiporol` | tiporol | — |
| `expediente` | expediente | — |
| `registrosanitario` | registrosanitario | — |
| `fechaactivo` | fechaactivo | — |
| `unidad` | unidad | — |
| `consecutivocum` | consecutivocum | — |
| `muestramedica` | muestramedica | — |
| `ium` | IUM | — |
| `fechainactivo` | fechainactivo | — |
| `fechaexpedicion` | fechaexpedicion | — |
| `descripcioncomercial` | descripcioncomercial | — |
| `estadoregistro` | estadoregistro | — |
| `concentracion` | concentracion | — |
| `principioactivo` | principioactivo | — |
| `viaadministracion` | viaadministracion | — |
| `fechavencimiento` | fechavencimiento | — |
| `estadocum` | estadocum | — |
| `expedientecum` | expedientecum | — |
| `formafarmaceutica` | formafarmaceutica | — |
| `titular` | titular | **descartada** |
| `cantidad` | cantidad | — |
| `unidadreferencia` | unidadreferencia | — |
| `descripcionatc` | descripcionatc | — |
| `modalidad` | modalidad | — |
| `nombrerol` | nombrerol | — |
| `producto` | producto | — |

</details>

<details><summary><code>j8bh-xk3n</code> — Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE BOYACÁ: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `correo_electronico` | Correo Electronico | **descartada** |
| `nombre_comercial` | Nombre Comercial | **descartada** |
| `estado` | Estado | — |
| `direccion_comercial` | Direccion Comercial | — |
| `subcategoria` | Subcategoria | — |
| `nombre_gerente` | Nombre Gerente | **descartada** |
| `emp` | Empleados | — |
| `categoria` | Categoria | — |
| `numero_del_rnt` | Numero del RNT | — |
| `hab` | Habitaciones | — |
| `municipio` | Municipio | — |
| `cam` | Camas | — |
| `camara_de_comercio_establecimiento` | Camara de Comercio Establecimiento | — |
| `departamento` | Departamento | — |

</details>

<details><summary><code>jdjx-jx6d</code> — FÁBRICAS DE ALIMENTOS CERTIFICADAS EN BUENAS PRÁCTICAS DE MANUFACTURA - BPM: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fechacertificacion` | FECHACERTIFICACION | — |
| `prodcutoselaborados` | PRODUCTOSELABORADOS | — |
| `consecutivo` | CONSECUTIVO | — |
| `establecimiento` | ESTABLECIMIENTO | — |
| `direccion` | DIRECCION | — |
| `ciudadmunicipio` | CIUDADMUNICIPIO | — |

</details>

<details><summary><code>jebm-jp6y</code> — Establecimientos con manejo de medicamentos de control especial: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `razon_social` | Razon Social | **descartada** |
| `area_operativa` | Area Operativa | — |
| `direcci_n` | Dirección | — |
| `tipo_establecimiento` | Tipo establecimiento | — |
| `municipio` | Municipio | — |

</details>

<details><summary><code>ji8i-4anb</code> — MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_DEPARTAMENTO: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `reprobacion_primaria` | REPROBACIÓN_PRIMARIA | — |
| `repitencia_secundaria` | REPITENCIA_SECUNDARIA | — |
| `ano` | AÑO | — |
| `aprobacion_primaria` | APROBACIÓN_PRIMARIA | — |
| `cobertura_neta_transicion` | COBERTURA_NETA_TRANSICIÓN | — |
| `c_digo_departamento` | CÓDIGO_DEPARTAMENTO | — |
| `tasa_matriculacion_5_16` | TASA_MATRICULACIÓN_5_16 | — |
| `aprobacion_media` | APROBACIÓN_MEDIA | — |
| `aprobacion_transicion` | APROBACIÓN_TRANSICIÓN | — |
| `reprobacion_secundaria` | REPROBACIÓN_SECUNDARIA | — |
| `desercion_secundaria` | DESERCIÓN_SECUNDARIA | — |
| `cobertura_neta_media` | COBERTURA_NETA_MEDIA | — |
| `cobertura_bruta` | COBERTURA_BRUTA | — |
| `cobertura_neta_secundaria` | COBERTURA_NETA_SECUNDARIA | — |
| `desercion_primaria` | DESERCIÓN_PRIMARIA | — |
| `cobertura_bruta_media` | COBERTURA_BRUTA_MEDIA | — |
| `cobertura_bruta_secundaria` | COBERTURA_BRUTA_SECUNDARIA | — |
| `desercion_transicion` | DESERCIÓN_TRANSICIÓN | — |
| `desercion` | DESERCIÓN | — |
| `tamano_promedio_grupo` | TAMAÑO_PROMEDIO_DE_GRUPO | — |
| `cobertura_neta_primaria` | COBERTURA_NETA_PRIMARIA | — |
| `repitencia_transicion` | REPITENCIA_TRANSICIÓN | — |
| `cobertura_neta` | COBERTURA_NETA | — |
| `poblacion_5_16` | POBLACIÓN_5_16 | — |
| `cobertura_bruta_primaria` | COBERTURA_BRUTA_PRIMARIA | — |
| `repitencia` | REPITENCIA | — |
| `repitencia_primaria` | REPITENCIA_PRIMARIA | — |
| `reprobacion_transicion` | REPROBACIÓN_TRANSICIÓN | — |
| `repitencia_media` | REPITENCIA_MEDIA | — |
| `cobertura_bruta_transicion` | COBERTURA_BRUTA_TRANSICIÓN | — |
| `sedes_conectadas_a_internet` | SEDES_CONECTADAS_A_INTERNET | — |
| `aprobacion_secundaria` | APROBACIÓN_SECUNDARIA | — |
| `desercion_media` | DESERCIÓN_MEDIA | — |
| `aprobacion` | APROBACIÓN | — |
| `departamento` | DEPARTAMENTO | — |
| `reprobacion_media` | REPROBACIÓN_MEDIA | — |
| `reprobacion` | REPROBACIÓN | — |

</details>

<details><summary><code>jmkk-qiin</code> — Equipos y servicios tecnológicos en las instituciones educativas - DEPARTAMENTO…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `longitud` | Longitud | — |
| `inventario_educacion_2022` | INVENTARIO EDUCACION 2022 COMP ESCRITORIO | — |
| `municipio` | MUNICIPIO | — |
| `servidores_contenidos` | SERVIDORES  CONTENIDOS EDUCATIVOS OFFLINE -CEO | — |
| `inventario_educacion_2022_2` | INVENTARIO EDUCACION 2022 TABLETAS | — |
| `zona` | ZONA | — |
| `latitud` | latitud | — |
| `sede` | SEDE | — |
| `institucion` | INSTITUCION | — |
| `inventario_educacion_2022_1` | INVENTARIO EDUCACION 2022 PORTÁTILES | — |
| `matricula_01_04_2023` | MATRICULA 01-04-2023 | — |
| `provincia` | Provincia | — |
| `dane_sede` | DANE SEDE | — |
| `lab_stem_2020_2022` | LAB STEM 2020-2022 | — |

</details>

<details><summary><code>jwvi-unqh</code> — Directorio de cuadrantes de Metropolitanas y Departamentos de Policía: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `ciudad_municipio` | CIUDAD/MUNICIPIO | — |
| `cuadrante` | CUADRANTE | — |
| `codigo_cuadrante` | CODIGO_CUADRANTE | — |
| `departamento` | DEPARTAMENTO | — |
| `numero_celular_cuadrante` | NUMERO_CELULAR_CUADRANTE | **descartada** |
| `tipo_unidad` | TIPO UNIDAD | — |
| `unidad` | UNIDAD | — |

</details>

<details><summary><code>kxdg-e9zy</code> — Programa de Alimentación Escolar (PAE) 2019-2020 en las Instituciones Etnoeduca…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `a_o` | Año | — |
| `matricula_corte_simat_24` | MATRICULA CORTE SIMAT 24 DE SEPTIEMBRE 2019 | — |
| `total_de_cupos_asignados` | TOTAL DE CUPOS ASIGNADOS POR SEDE | — |
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |
| `sede_educativa` | SEDE EDUCATIVA | — |
| `complemento_alim_am_y_pm` | COMPLEMENTO ALIM. AM Y PM | — |
| `complemento_tipo_almuerzo` | COMPLEMENTO TIPO ALMUERZO | — |
| `codigo_dane_ie` | CODIGO DANE IE | — |
| `municipio` | MUNICIPIO | — |
| `zona` | ZONA | — |

</details>

<details><summary><code>m6wg-s96s</code> — Listado de los Establecimientos Educativos No Oficiales del Departamento del At…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipio` | Municipio | — |
| `correo_electr_nico` | Correo Electrónico | **descartada** |
| `c_digo_municipio` | Código Municipio | — |
| `c_digo` | Código | — |
| `nombre` | Nombre | **descartada** |
| `direcci_n` | Dirección | — |
| `discapacidades` | Discapacidades | **descartada** |
| `licencia` | Licencia | — |
| `nombre_rector` | Nombre Rector | **descartada** |
| `estrato_socio_economico` | Estrato socio-economico | — |
| `prestador_de_servicio` | Prestador de servicio | — |
| `zona` | Zona | — |
| `propiedad_de_la_planta_fis` | Propiedad de la planta fisíca | — |
| `idiomas` | Idiomas | — |
| `especialidad` | Especialidad | — |
| `niveles` | Niveles | — |
| `grados` | Grados | — |
| `modelos_educativos` | Modelos Educativos | — |
| `calendario` | Calendario | — |
| `tel_fono` | Teléfono | **descartada** |
| `estado` | Estado | — |
| `jornadas` | Jornadas | — |
| `capacidades_excepcionales` | Capacidades Excepcionales | — |
| `matricula_contratada` | Matricula contratada | — |
| `caracter` | Caracter | — |
| `genero` | Genero | **descartada** |
| `sector` | Sector | — |
| `resguardo` | Resguardo | — |
| `n_mero_de_sedes` | Número de Sedes | — |
| `tipo_establecimiento` | Tipo Establecimiento | — |

</details>

<details><summary><code>mxqg-ytrw</code> — MEN_INDICE_PARIDAD_POR_GENERO_PARA_ETNICOS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `etnico_no_m_trans` | ETNICO_NO_M_TRANS | — |
| `matr_etnicos_f_otras` | MATR_ETNICOS_F_Otras | — |
| `etnico_no_m_media` | ETNICO_NO_M_MEDIA | — |
| `ipg_etnico_no_secun` | IPG_ETNICO_NO_SECUN | — |
| `etnico_si_f_prim` | ETNICO_SI_F_PRIM | — |
| `ipg_etnico_si_media` | IPG_ETNICO_SI_MEDIA | — |
| `c_digoetc` | CODIGOETC | — |
| `matr_etnicos_m_raizales` | MATR_ETNICOS_M_Raizales | — |
| `etnico_si_m_prim` | ETNICO_SI_M_PRIM | — |
| `etnico_si_f_media` | ETNICO_SI_F_MEDIA | — |
| `matr_etnicos_f_raizales` | MATR_ETNICOS_F_Raizales | — |
| `ipg_etnico_si_trans` | IPG_ETNICO_SI_TRANS | — |
| `etnico_si_f_prej` | ETNICO_SI_F_PREJ | — |
| `matr_etnicos_f_no_aplica` | MATR_ETNICOS_F_No_aplica | — |
| `anno_inf` | AÑO | — |
| `etnico_no_f_secun` | ETNICO_NO_F_SECUN | — |
| `etnico_no_f_prim` | ETNICO_NO_F_PRIM | — |
| `matr_etnicos_m_no_aplica` | MATR_ETNICOS_M_No_aplica | — |
| `etnico_si_m_secun` | ETNICO_SI_M_SECUN | — |
| `ipg_matr_etnicos_negritudes` | IPG_MATR_ETNICOS_Negritudes | — |
| `etnico_si_m_prej` | ETNICO_SI_M_PREJ | — |
| `ipg_matr_etnicos_rom` | IPG_MATR_ETNICOS_Rom | — |
| `matr_etnicos_f_ind_genas` | MATR_ETNICOS_F_Indígenas | — |
| `ipg_matr_etnicos_palenquero` | IPG_MATR_ETNICOS_Palenquero | — |
| `matr_etnicos_f_afros` | MATR_ETNICOS_F_Afros | — |
| `matr_etnicos_m_rom` | MATR_ETNICOS_M_Rom | — |
| `etc` | ETC | — |
| `ipg_etnico_no_media` | IPG_ETNICO_NO_MEDIA | — |
| `ipg_etnico_no_trans` | IPG_ETNICO_NO_TRANS | — |
| `matr_etnicos_m_negritudes` | MATR_ETNICOS_M_Negritudes | — |
| `matr_etnicos_m_otras` | MATR_ETNICOS_M_Otras | — |
| `departamento` | DEPARTAMENTO | — |
| `matr_etnicos_f_rom` | MATR_ETNICOS_F_Rom | — |
| `matr_etnicos_f_palenquero` | MATR_ETNICOS_F_Palenquero | — |
| `etnico_si_m_trans` | ETNICO_SI_M_TRANS | — |
| `etnico_no_f_media` | ETNICO_NO_F_MEDIA | — |
| `c_digodepartamento` | CODIGODEPARTAMENTO | — |
| `ipg_matr_etnicos_ind_genas` | IPG_MATR_ETNICOS_Indígenas | — |
| `ipg_matr_etnicos_afros` | IPG_MATR_ETNICOS_Afros | — |
| `matr_etnicos_m_ind_genas` | MATR_ETNICOS_M_Indígenas | — |
| `matr_etnicos_m_afros` | MATR_ETNICOS_M_Afros | — |
| `ipg_etnico_si_secun` | IPG_ETNICO_SI_SECUN | — |
| `etnico_si_f_trans` | ETNICO_SI_F_TRANS | — |
| `matr_etnicos_f_negritudes` | MATR_ETNICOS_F_Negritudes | — |
| `matr_etnicos_m_palenquero` | MATR_ETNICOS_M_Palenquero | — |
| `ipg_etnico_si_prim` | IPG_ETNICO_SI_PRIM | — |
| `ipg_etnico_si_prej` | IPG_ETNICO_SI_PREJ | — |
| `ipg_etnico_no_prim` | IPG_ETNICO_NO_PRIM | — |
| `ipg_etnico_no_prej` | IPG_ETNICO_NO_PREJ | — |
| `ipg_matr_etnicos_raizales` | IPG_MATR_ETNICOS_Raizales | — |
| `ipg_matr_etnicos_otras` | IPG_MATR_ETNICOS_Otras | — |
| `ipg_matr_etnicos_no_aplica` | IPG_MATR_ETNICOS_No_aplica | — |
| `etnico_si_m_media` | ETNICO_SI_M_MEDIA | — |
| `etnico_si_f_secun` | ETNICO_SI_F_SECUN | — |
| `etnico_no_m_secun` | ETNICO_NO_M_SECUN | — |
| `etnico_no_m_prim` | ETNICO_NO_M_PRIM | — |
| `etnico_no_m_prej` | ETNICO_NO_M_PREJ | — |
| `etnico_no_f_trans` | ETNICO_NO_F_TRANS | — |
| `etnico_no_f_prej` | ETNICO_NO_F_PREJ | — |

</details>

<details><summary><code>ngw5-c5nw</code> — MEN_MATRICULA_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `cod_dane_departamento` | COD_DANE_DEPARTAMENTO | — |
| `codigo_dane` | CODIGO_DANE | — |
| `departamento` | DEPARTAMENTO | — |
| `cod_dane_municipio` | COD_DANE_MUNICIPIO | — |
| `sector_conpes` | COD_SECTOR_CONPES | — |
| `secretaria` | SECRETARIA | — |
| `municipio` | MUNICIPIO | — |
| `codigo_sed` | COD_SECRETARIA | — |
| `anno_inf` | ANNO_INF | — |
| `sector` | SECTOR | — |
| `especialidad` | ESPECIALIDAD | — |
| `cte_id_sector` | COD_SECTOR | — |
| `codigo_grado` | COD_GRADO | — |
| `grado` | GRADO | — |
| `cte_id_zona` | COD_ZONA | — |
| `genero_1` | GENERO | **descartada** |
| `cte_id_calendario` | COD_CALENDARIO | — |
| `grupo_etnico` | COD_GRUPO_ETNICO | — |
| `cte_caracter` | COD_CARACTER | — |
| `metodologia` | METODOLOGIA | — |
| `caracter` | CARACTER | — |
| `nombre_establecimiento` | NOMBRE_ESTABLECIMIENTO | — |
| `edad` | EDAD | — |
| `grupo_etnico_2` | GRUPO_ETNICO | — |
| `calendario` | CALENDARIO | — |
| `cte_metodologia` | COD_METODOLOGIA | — |
| `codigo_dane_sede` | CODIGO_DANE_SEDE | — |
| `cte_tipo_jornada` | COD_TIPO_JORNADA | — |
| `total_matricula` | TOTAL_MATRICULA | — |
| `nombre_sede` | NOMBRE_SEDE | — |
| `tipo_jornada` | TIPO_JORNADA | — |
| `sector_conpes_2` | SECTOR_CONPES | — |
| `cod_especialidad` | COD_ESPECIALIDAD | — |
| `genero` | COD_GENERO | **descartada** |
| `zona` | ZONA | — |

</details>

<details><summary><code>nudc-7mev</code> — MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_MUNICIPIO: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `reprobaci_n_secundaria` | REPROBACIÓN_SECUNDARIA | — |
| `repitencia_media` | REPITENCIA_MEDIA | — |
| `aprobaci_n` | APROBACIÓN | — |
| `c_digo_municipio` | CÓDIGO_MUNICIPIO | — |
| `tasa_matriculaci_n_5_16` | TASA_MATRICULACIÓN_5_16 | — |
| `repitencia_secundaria` | REPITENCIA_SECUNDARIA | — |
| `cobertura_bruta_transici_n` | COBERTURA_BRUTA_TRANSICIÓN | — |
| `reprobaci_n_primaria` | REPROBACIÓN_PRIMARIA | — |
| `deserci_n_media` | DESERCIÓN_MEDIA | — |
| `repitencia_primaria` | REPITENCIA_PRIMARIA | — |
| `cobertura_neta_transici_n` | COBERTURA_NETA_TRANSICIÓN | — |
| `deserci_n_secundaria` | DESERCIÓN_SECUNDARIA | — |
| `aprobaci_n_primaria` | APROBACIÓN_PRIMARIA | — |
| `cobertura_bruta_primaria` | COBERTURA_BRUTA_PRIMARIA | — |
| `reprobaci_n` | REPROBACIÓN | — |
| `departamento` | DEPARTAMENTO | — |
| `cobertura_bruta_media` | COBERTURA_BRUTA_MEDIA | — |
| `deserci_n_transici_n` | DESERCIÓN_TRANSICIÓN | — |
| `tama_o_promedio_de_grupo` | TAMAÑO_PROMEDIO_DE_GRUPO | — |
| `cobertura_neta_secundaria` | COBERTURA_NETA_SECUNDARIA | — |
| `a_o` | AÑO | — |
| `repitencia` | REPITENCIA | — |
| `c_digo_etc` | CÓDIGO_ETC | — |
| `cobertura_bruta_secundaria` | COBERTURA_BRUTA_SECUNDARIA | — |
| `municipio` | MUNICIPIO | — |
| `aprobaci_n_transici_n` | APROBACIÓN_TRANSICIÓN | — |
| `deserci_n` | DESERCIÓN | — |
| `cobertura_bruta` | COBERTURA_BRUTA | — |
| `cobertura_neta_media` | COBERTURA_NETA_MEDIA | — |
| `reprobaci_n_transici_n` | REPROBACIÓN_TRANSICIÓN | — |
| `c_digo_departamento` | CÓDIGO_DEPARTAMENTO | — |
| `aprobaci_n_media` | APROBACIÓN_MEDIA | — |
| `cobertura_neta` | COBERTURA_NETA | — |
| `sedes_conectadas_a_internet` | SEDES_CONECTADAS_A_INTERNET | — |
| `repitencia_transici_n` | REPITENCIA_TRANSICIÓN | — |
| `deserci_n_primaria` | DESERCIÓN_PRIMARIA | — |
| `aprobaci_n_secundaria` | APROBACIÓN_SECUNDARIA | — |
| `cobertura_neta_primaria` | COBERTURA_NETA_PRIMARIA | — |
| `reprobaci_n_media` | REPROBACIÓN_MEDIA | — |
| `poblaci_n_5_16` | POBLACIÓN_5_16 | — |
| `etc` | ETC | — |

</details>

<details><summary><code>pejt-qp6n</code> — INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS NO CERTIFICADOS CON CONEXIÓN A…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_sede_ie` | NOMBRE_SEDE_IE | — |
| `programa_conexi_n` | PROGRAMA_CONEXIÓN | — |
| `cod_dane_sede_ie` | COD_DANE_SEDE_IE | — |
| `a_o` | AÑO | — |
| `latitud` | LATITUD | — |
| `tecnolog_a_conexi_n` | TECNOLOGÍA_CONEXIÓN | — |
| `tipo_sede` | TIPO_SEDE | — |
| `zona` | ZONA | — |
| `cod_dane_ie` | COD_DANE_IE | — |
| `municipio` | MUNICIPIO | — |
| `nombre_ie` | NOMBRE_IE | **descartada** |
| `ancho_de_banda_mbps_` | ANCHO_DE_BANDA(Mbps) | — |
| `longitud` | LONGITUD | — |

</details>

<details><summary><code>pgv3-riu8</code> — NÚMERO DE INSTITUCIONES EDUCATIVAS BENEFICIADAS DEL PROGRAMA DE ALIMENTACIÓN ES…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `n_instituciones_y_sedes` | Nº INSTITUCIONES Y SEDES EDUCATIVAS BENEFICIADAS | — |
| `total_de_cupos_asignados` | TOTAL DE CUPOS ASIGNADOS POR SEDE | — |
| `n_raciones_almuerzo_preparado` | Nº RACIONES ALMUERZO PREPARADO EN SITIO (APS) | — |
| `a_o` | AÑO | — |
| `municipio` | MUNICIPIO | — |
| `n_raciones_racion` | Nº RACIONES RACION INDUSTRIALIZADA (RI) | — |
| `no_raciones_para_preparar_en_casa_rcp_` | No RACIONES PARA PREPARAR EN CASA (RCP) | — |

</details>

<details><summary><code>px6y-fznz</code> — SERVICIO DE CONECTIVIDAD A INTERNET EN INSTITUCIONES EDUCATIVAS DEL DEPARTAMENT…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigo_dane_sede` | CODIGO DANE SEDE | — |
| `tecnolog_a_ltima_milla_cobre` | Tecnología Última Milla (Cobre – Fibra – HFC – Radio – Satelital – Móvil – Inalámbrica) | — |
| `fecha_fin_servicio` | FECHA FIN SERVICIO | — |
| `nombre_sede_educativa` | NOMBRE SEDE EDUCATIVA | — |
| `ancho_de_banda_mbps_capacidad` | ANCHO DE BANDA (Mbps)  CAPACIDAD PLAN DE DATOS (GB) | — |
| `id` | ID | — |
| `conetividad_para_estudiantes` | CONETIVIDAD PARA ESTUDIANTES DE LA SEDE (PLANES MÓVILES - ZONA WIFI - CONECTIVIDAD EN SEDE) | — |
| `fecha_inicio_servicio` | FECHA INICIO SERVICIO | — |
| `departamento` | DEPARTAMENTO | — |
| `municipio` | MUNICIPIO | — |
| `zona_urbana_rural` | ZONA (URBANA/RURAL) | — |
| `matr_cula_a_beneficiar_por` | MATRÍCULA A BENEFICIAR POR SEDE EDUCATIVA | — |
| `meses_de_servicio` | MESES DE SERVICIO | — |

</details>

<details><summary><code>qpq9-e4ne</code> — Matrícula Instituciones Educativas oficiales y no oficiales - DEPARTAMENTO DE B…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `prescolar_1` | Prescolar 1 | — |
| `dane_sede` | CÓDIGO DANE SEDE | — |
| `municipio` | MUNICIPIO | — |
| `segundo` | Segundo | — |
| `institucion` | INSTITUCION | — |
| `pfc_2` | pfc 2 | — |
| `pfc_1` | pfc 1 | — |
| `ciclo_iv` | ciclo iv | — |
| `pfc_3` | pfc 3 | — |
| `a_o` | año | — |
| `intr` | intr | — |
| `noveno` | Noveno | — |
| `total_ie` | Total IE | — |
| `pfc_4` | pfc 4 | — |
| `zona` | ZONA | — |
| `once` | Once | — |
| `ciclo_ii` | ciclo ii | — |
| `ciclo_i` | ciclo i | — |
| `sector` | SECTOR | — |
| `primero` | Primero | — |
| `tercero` | Tercero | — |
| `sede` | SEDE | — |
| `cuarto` | Cuarto | — |
| `quinto` | Quinto | — |
| `sexto` | Sexto | — |
| `s_ptimo` | Séptimo | — |
| `d_cimo` | Décimo | — |
| `ciclo_v` | ciclo v | — |
| `ciclo_iii` | ciclo iii | — |
| `dane` | CÓDIGO DANE | — |
| `ciclo_vi` | ciclo vi | — |
| `octavo` | Octavo | — |

</details>

<details><summary><code>qsh3-vq78</code> — Registro Especial de Prestadores de Salud en el Departamento del Atlántico.: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nivel` | NIVEL | — |
| `caracter` | CARÁCTER | — |
| `habilitado` | HABILITADO | — |
| `zona` | ZONA | — |
| `cod_habilitacion` | CODIGO HABILITACION | — |
| `clase_prestador` | CLASE_PRESTADOR | — |
| `no_sede` | NUMERO SEDE | — |
| `direccion` | DIRECCION | — |
| `gerente` | GERENTE | — |
| `centro_poblado` | CENTRO_POBLADO | — |
| `email` | EMAIL | **descartada** |
| `nom_prestador` | NOMBRE PRESTADOR | **descartada** |
| `nit` | NIT | **descartada** |
| `cod_prestador` | CODIGO PRESTADOR | — |
| `cod_municipio` | CODIGO MUNICIPIO | — |
| `municipio` | MUNICIPIO | — |
| `nom_sede` | NOMBRE DE SEDE | — |
| `barrio` | BARRIO | — |
| `ese` | ESE | — |
| `telefono` | TELEFONO | **descartada** |
| `clase_persona` | CLASE_PERSONA | — |
| `naturaleza` | NATURALEZA | — |
| `cod_nat_juridica` | COD_NAT_JURIDICA | — |
| `sede_principal` | SEDE_PRINCIPAL | — |
| `cod_clase_prestador` | COD_CLASE_PRESTADOR | — |

</details>

<details><summary><code>rzcg-uhwd</code> — Programa conexión total del Departamento de Caldas: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `a_o` | AÑO | — |
| `meses_de_servicio` | MESES DE SERVICIO | — |
| `ancho_de_banda_mb` | ANCHO DE BANDA /MB | — |
| `total_d_as_contratados` | TOTAL DÍAS CONTRATADOS | — |
| `fecha_inicio_servicio` | FECHA INICIO SERVICIO | — |
| `nombre_instituci_n_educativa` | NOMBRE INSTITUCIÓN EDUCATIVA | **descartada** |
| `direcci_n` | DIRECCIÓN | — |
| `zona` | ZONA | — |
| `codigo_dane_sede` | CODIGO DANE SEDE | — |
| `valor_total` | VALOR TOTAL | — |
| `costo_de_instalaci_n_sin` | COSTO DE INSTALACIÓN (SIN IVA) | — |
| `fecha_fin_servicio` | FECHA FIN SERVICIO | — |
| `costo_de_servicio_sin_iva` | COSTO DE SERVICIO (SIN IVA) | — |
| `reuso` | REUSO | — |
| `matricula` | MATRICULA | — |
| `total_alumnos_aula_de_clase` | TOTAL ALUMNOS AULA DE CLASE | — |
| `tecnolog_a_ltima_milla` | TECNOLOGÍA ÚLTIMA MILLA | — |
| `cod_dane_institucion` | COD DANE INSTITUCION | — |
| `codmunicipio` | CODMUNICIPIO | — |
| `nombre_sede_educativa` | NOMBRE SEDE EDUCATIVA | — |
| `total_alumnos_adultos` | TOTAL ALUMNOS ADULTOS | — |
| `costo_de_servicio_con_iva` | COSTO DE SERVICIO (CON IVA) | — |
| `municipio` | MUNICIPIO | — |
| `costo_de_instalaci_n_con` | COSTO DE INSTALACIÓN (CON IVA) | — |
| `n_mero_del_contrato` | NÚMERO DEL CONTRATO | — |
| `fecha_instalaci_n_programada` | FECHA INSTALACIÓN PROGRAMADA | — |
| `estado_servicio` | ESTADO SERVICIO | — |

</details>

<details><summary><code>s3n2-sqjp</code> — ESTABLECIMIENTOS IMPORTADORES CERTIFICADOS EN CCAA DE DISPOSITIVOS MÉDICOS Y EQ…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `concepto` | concepto | — |
| `nit` | nit | **descartada** |
| `fechaconcepto` | fechaconcepto | — |
| `establecimiento` | establecimiento | — |
| `ciudadmunicipio` | ciudadmunicipio | — |

</details>

<details><summary><code>spve-848d</code> — CONECTIVIDAD EN SEDES EDUCATIVAS OFICIALES DE LOS MUNICIPIOS NO CERTIFICADOS DE…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `zona` | ZONA | — |
| `establecimiento_educativo` | ESTABLECIMIENTO EDUCATIVO | — |
| `ancho_banda` | ANCHO BANDA | — |
| `sede` | SEDE | — |
| `no` | No. | — |
| `municipio` | MUNICIPIO | — |
| `operador_conectividad` | OPERADOR CONECTIVIDAD | **descartada** |

</details>

<details><summary><code>spzp-dfuc</code> — CÓDIGO ÚNICO DE MEDICAMENTOS OTROS ESTADOS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombrerol` | nombrerol | — |
| `descripcionatc` | descripcionatc | — |
| `registrosanitario` | registrosanitario | — |
| `viaadministracion` | viaadministracion | — |
| `unidad` | unidad | — |
| `modalidad` | modalidad | — |
| `concentracion` | concentracion | — |
| `muestramedica` | muestramedica | — |
| `fechainactivo` | fechainactivo | — |
| `formafarmaceutica` | formafarmaceutica | — |
| `estadocum` | estadocum | — |
| `cantidadcum` | cantidadcum | — |
| `titular` | titular | **descartada** |
| `atc` | atc | — |
| `expedientecum` | expedientecum | — |
| `tiporol` | tiporol | — |
| `principioactivo` | principioactivo | — |
| `fechavencimiento` | fechavencimiento | — |
| `fechaactivo` | fechaactivo | — |
| `unidadmedida` | unidadmedida | — |
| `estadoregistro` | estadoregistro | — |
| `producto` | producto | — |
| `ium` | IUM | — |
| `expediente` | expediente | — |
| `cantidad` | cantidad | — |
| `fechaexpedicion` | fechaexpedicion | — |
| `unidadreferencia` | unidadreferencia | — |
| `consecutivocum` | consecutivocum | — |
| `descripcioncomercial` | descripcioncomercial | — |

</details>

<details><summary><code>sras-4t5p</code> — MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_ETC: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `cobertura_bruta_transicion` | COBERTURA_BRUTA_TRANSICIÓN | — |
| `cobertura_bruta_primaria` | COBERTURA_BRUTA_PRIMARIA | — |
| `cobertura_bruta_secundaria` | COBERTURA_BRUTA_SECUNDARIA | — |
| `aprobacion` | APROBACIÓN | — |
| `cobertura_neta_transicion` | COBERTURA_NETA_TRANSICIÓN | — |
| `cobertura_neta` | COBERTURA_NETA | — |
| `desercion_transicion` | DESERCIÓN_TRANSICIÓN | — |
| `nombre_etc` | ETC | **descartada** |
| `desercion_secundaria` | DESERCIÓN_SECUNDARIA | — |
| `cod_etc` | CÓDIGO_ETC | — |
| `aprobacion_transicion` | APROBACIÓN_TRANSICIÓN | — |
| `reprobacion_primaria` | REPROBACIÓN_PRIMARIA | — |
| `aprobacion_secundaria` | APROBACIÓN_SECUNDARIA | — |
| `reprobacion` | REPROBACIÓN | — |
| `desercion_primaria` | DESERCIÓN_PRIMARIA | — |
| `tasa_matriculacion_5_16` | TASA_MATRICULACIÓN_5_16 | — |
| `repitencia_primaria` | REPITENCIA_PRIMARIA | — |
| `tamano_promedio_grupo` | TAMAÑO_PROMEDIO_DE_GRUPO | — |
| `reprobacion_transicion` | REPROBACIÓN_TRANSICIÓN | — |
| `poblacion_5_16` | POBLACIÓN_5_16 | — |
| `cobertura_neta_primaria` | COBERTURA_NETA_PRIMARIA | — |
| `reprobacion_secundaria` | REPROBACIÓN_SECUNDARIA | — |
| `desercion_media` | DESERCIÓN_MEDIA | — |
| `desercion` | DESERCIÓN | — |
| `ano` | AÑO | — |
| `reprobacion_media` | REPROBACIÓN_MEDIA | — |
| `repitencia` | REPITENCIA | — |
| `repitencia_transicion` | REPITENCIA_TRANSICIÓN | — |
| `repitencia_media` | REPITENCIA_MEDIA | — |
| `cobertura_bruta_media` | COBERTURA_BRUTA_MEDIA | — |
| `repitencia_secundaria` | REPITENCIA_SECUNDARIA | — |
| `cobertura_neta_secundaria` | COBERTURA_NETA_SECUNDARIA | — |
| `cobertura_neta_media` | COBERTURA_NETA_MEDIA | — |
| `cobertura_bruta` | COBERTURA_BRUTA | — |
| `aprobacion_media` | APROBACIÓN_MEDIA | — |
| `sedes_conectadas_a_internet` | SEDES_CONECTADAS_A_INTERNET | — |
| `aprobacion_primaria` | APROBACIÓN_PRIMARIA | — |

</details>

<details><summary><code>tgsp-kujm</code> — Sedes de los Establecimientos Educativos del Departamento de Antioquia: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigo_departamento` | Código Departamento | — |
| `modelos` | Modelos | — |
| `codigo_sede` |  Código Sede | — |
| `nombre_sede_establecimiento_educativo` |  Nombre Sede | — |
| `nombre_departamento` |  Nombre Departamento | — |
| `codigo_municipio` | Código Municipio | — |
| `estado_sede` | Estado Sede | — |
| `zona_sede` | Zona Sede | — |
| `nombre_municipio` |  Nombre municipio | — |
| `codigo_establecimiento_educativo` |  Código Establecimiento Educativo | — |
| `nombre_establecimiento_educativo` |  Nombre Establecimiento Educativo | — |
| `grados` | Grados | — |
| `niveles` | Niveles | — |
| `direcci_n` | Dirección | — |
| `tel_fono` | Teléfono | **descartada** |
| `secretar_a` | Secretaría | — |

</details>

<details><summary><code>uhs6-qp53</code> — ESTABLECIMIENTOS VIGILADOS POR EL INVIMA EN LA DISCIPLINA DE ALIMENTOS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `linea_subcateggoria_de` | LINEA SUBCATEGGORIA DE ALIMENTOS (Productos elaborados o Procesados) | — |
| `estado_del_establecimiento` | ESTADO DEL ESTABLECIMIENTO | — |
| `departamento` | DEPARTAMENTO | — |
| `razon_social` | RAZON SOCIAL | **descartada** |
| `n_unico_consecutivo_de` | N° UNICO CONSECUTIVO DE IDENTIFICACION | — |
| `representante_legal` | REPRESENTANTE LEGAL | — |
| `municipio` | MUNICIPIO | — |
| `direccion_o_ubicacion_del` | DIRECCION O UBICACION DEL ESTABLECIMIENTO | — |
| `concepto_sanitario_vigente` | CONCEPTO SANITARIO VIGENTE | — |
| `nit` | NIT | **descartada** |

</details>

<details><summary><code>upgu-2ytp</code> — MATRICULA POR GRADO Y EDAD DEPARTAMENTO DE SANTANDER: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `de_sede` | de_sede | — |
| `de_nombzona` | de_nombzona | — |
| `de_jornada` | de_jornada | — |
| `de_ano` | de_ano | — |
| `de_edad` | de_edad | — |
| `de_nombmuni` | de_nombmuni | — |
| `de_hombres` | de_hombres | — |
| `nomb_sec` | nomb_sec | **descartada** |
| `de_nombsede` | de_nombsede | — |
| `de_muni` | de_muni | — |
| `de_grado` | de_grado | — |
| `de_total` | de_total | — |
| `de_mujeres` | de_mujeres | — |
| `de_institu` | de_institu | — |

</details>

<details><summary><code>uuhz-8xmf</code> — Matrículas de estudiantes en instituciones educativas oficiales departamento de…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `total_general` | Total General | — |
| `grados_8` | Grados_ 8 | — |
| `grados_ciclo_i` | Grados_ CICLO I | — |
| `grados_ciclo_v` | Grados_ Ciclo V | — |
| `grados_7` | Grados_ 7 | — |
| `grados_ciclo_iii` | Grados_ CICLO III | — |
| `grados_11` | Grados_ 11 | — |
| `municipio` | Municipio | — |
| `institucion` | Institucion | — |
| `grados_2` | Grados_ -2 | — |
| `grados_0` | Grados_ 0 | — |
| `grados_ciclo_ii` | Grados_ CICLO II | — |
| `grados_45` | Grados_ 45 | — |
| `grados_10` | Grados_ 10 | — |
| `grados_2_2` | Grados_ 2 | — |
| `grados_44` | Grados_ 44 | — |
| `grados_99` | Grados_ 99 | — |
| `grados_43` | Grados_ 43 | — |
| `grados_1_1` | Grados_ 1 | — |
| `grados_1` | Grados_ -1 | — |
| `grados_4` | Grados_ 4 | — |
| `grados_41` | Grados_ 41 | — |
| `grados_9` | Grados_ 9 | — |
| `grados_3` | Grados_ 3 | — |
| `sector` | Sector | — |
| `grados_6` | Grados_ 6 | — |
| `grados_5` | Grados_ 5 | — |
| `grados_ciclo_vi` | Grados_ Ciclo VI | — |
| `grados_ciclo_iv` | Grados_ CICLO IV | — |
| `sede` | Sede | — |
| `grados_42` | Grados_ 42 | — |

</details>

<details><summary><code>v488-qa3u</code> — MEN_INDICADORES_EDUCACION_MEDIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `doble_titulaci_n` | DOBLE_TITULACIÓN | — |
| `nombre_depto` | NOMBRE_DEPARTAMENTO | — |
| `cod_dane_depto` | COD_DANE_DEPARTAMENTO | — |
| `fecha_corte` | FECHA_CORTE | — |
| `fecha` | FECHA | — |

</details>

<details><summary><code>v5z5-e88h</code> — MEN_INDICE_PARIDAD_POR_GENERO_COBERTURA_BRUTA_ETC: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `c_digodepartamento` | CódigoDepartamento | — |
| `hom_11a14` | Hom_11a14 | — |
| `matr_fem_prej` | MATR_FEM_PREJ | — |
| `matr_fem_trans` | MATR_FEM_TRANS | — |
| `cobertura_bruta_fem_prej` | COBERTURA_BRUTA_FEM_PREJ | — |
| `hom_15y16` | Hom_15y16 | — |
| `departamento` | Departamento | — |
| `cobertura_bruta_masc_trans` | COBERTURA_BRUTA_MASC_TRANS | — |
| `cobertura_bruta_masc_prim` | COBERTURA_BRUTA_MASC_PRIM | — |
| `matr_masc_prej` | MATR_MASC_PREJ | — |
| `muj_15y16` | Muj_15y16 | — |
| `matr_fem_prim` | MATR_FEM_PRIM | — |
| `ipg_cbruta_trans` | IPG_CBRUTA_TRANS | — |
| `matr_masc_prim` | MATR_MASC_PRIM | — |
| `mpio` | MPIO | — |
| `etc` | ETC | — |
| `muj_6a10` | Muj_6a10 | — |
| `matr_masc_trans` | MATR_MASC_TRANS | — |
| `cobertura_bruta_fem_prim` | COBERTURA_BRUTA_FEM_PRIM | — |
| `cobertura_bruta_fem_trans` | COBERTURA_BRUTA_FEM_TRANS | — |
| `ipg_cbruta_media` | IPG_CBRUTA_MEDIA | — |
| `cobertura_bruta_masc_prej` | COBERTURA_BRUTA_MASC_PREJ | — |
| `matr_fem_media` | MATR_FEM_MEDIA | — |
| `muj_3y4` | Muj_3y4 | — |
| `hom_3y4` | Hom_3y4 | — |
| `ipg_cbruta_prej` | IPG_CBRUTA_PREJ | — |
| `ipg_cbruta_sec` | IPG_CBRUTA_SEC | — |
| `muj_5` | Muj_5 | — |
| `muj_11a14` | Muj_11a14 | — |
| `matr_masc_media` | MATR_MASC_MEDIA | — |
| `matr_fem_sec` | MATR_FEM_SEC | — |
| `cobertura_bruta_masc_sec` | COBERTURA_BRUTA_MASC_SEC | — |
| `cobertura_bruta_fem_sec` | COBERTURA_BRUTA_FEM_SEC | — |
| `cobertura_bruta_fem_media` | COBERTURA_BRUTA_FEM_MEDIA | — |
| `c_digoetc` | CódigoETC | — |
| `hom_6a10` | Hom_6a10 | — |
| `divipola_municipio` | DIVIPOLA_MUNICIPIO | — |
| `ipg_cbruta_prim` | IPG_CBRUTA_PRIM | — |
| `matr_masc_sec` | MATR_MASC_SEC | — |
| `anno_inf` | ANNO_INF | — |
| `hom_5` | Hom_5 | — |
| `cobertura_bruta_masc_media` | COBERTURA_BRUTA_MASC_MEDIA | — |

</details>

<details><summary><code>vcjz-niiq</code> — DIVIPOLA- Códigos departamentos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigo_departamento` | Código Departamento | — |
| `longitud` | longitud | — |
| `latitud` | Latitud | — |
| `nombre_departamento` | Nombre Departamento | — |

</details>

<details><summary><code>vgr4-gemg</code> — CÓDIGO ÚNICO DE MEDICAMENTOS EN TRÁMITE DE RENOVACIÓN: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `ium` | ium | — |
| `modalidad` | modalidad | — |
| `unidadmedida` | unidadmedida | — |
| `unidadreferencia` | unidadreferencia | — |
| `registrosanitario` | registrosanitario | — |
| `descripcionatc` | descripcionatc | — |
| `fechainactivo` | fechainactivo | — |
| `viaadministracion` | viaadministracion | — |
| `producto` | producto | — |
| `nombrerol` | nombrerol | — |
| `titular` | titular | **descartada** |
| `atc` | atc | — |
| `muestramedica` | muestramedica | — |
| `estadocum` | estadocum | — |
| `fechavencimiento` | fechavencimiento | — |
| `principioactivo` | principioactivo | — |
| `formafarmaceutica` | formafarmaceutica | — |
| `fechaexpedicion` | fechaexpedicion | — |
| `expediente` | expediente | — |
| `tiporol` | tiporol | — |
| `estadoregistro` | estadoregistro | — |
| `cantidadcum` | cantidadcum | — |
| `fechaactivo` | fechaactivo | — |
| `unidad` | unidad | — |
| `descripcioncomercial` | descripcioncomercial | — |
| `expedientecum` | expedientecum | — |
| `concentracion` | concentracion | — |
| `consecutivocum` | consecutivocum | — |
| `cantidad` | cantidad | — |

</details>

<details><summary><code>vqup-4isj</code> — Listado de instituciones y centros educativos públicos del departamento de Casa…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `zona` | Zona | — |
| `municipio` | Municipio | — |
| `tipo_est` | Tipo Est | — |
| `nombre_del_establecimiento` | Nombre Del Establecimiento | **descartada** |
| `direccion` | Direccion | — |
| `car_cter` | Carácter | — |
| `telefono_de_la_institucion` | Telefono De La Institucion | **descartada** |
| `rector_o_director` | Rector O Director | — |
| `barrio_o_inspeccion` | Barrio O Inspeccion | — |
| `no_` | No.  | — |
| `especialidad_modalida` | Especialidad/Modalida | — |
| `email` | Email | **descartada** |
| `cod_dane` | Cod_Dane | — |

</details>

<details><summary><code>vwwf-4ftk</code> — CÓDIGO ÚNICO DE MEDICAMENTOS VENCIDOS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fechaactivo` | fechaactivo | — |
| `principioactivo` | principioactivo | — |
| `fechainactivo` | fechainactivo | — |
| `expediente` | expediente | — |
| `producto` | producto | — |
| `fechavencimiento` | fechavencimiento | — |
| `viaadministracion` | viaadministracion | — |
| `registrosanitario` | registrosanitario | — |
| `estadocum` | estadocum | — |
| `unidad` | unidad | — |
| `muestramedica` | muestramedica | — |
| `concentracion` | concentracion | — |
| `descripcionatc` | descripcionatc | — |
| `ium` | IUM | — |
| `unidadmedida` | unidadmedida | — |
| `expedientecum` | expedientecum | — |
| `nombrerol` | nombrerol | — |
| `descripcioncomercial` | descripcioncomercial | — |
| `cantidad` | cantidad | — |
| `fechaexpedicion` | fechaexpedicion | — |
| `titular` | titular | **descartada** |
| `estadoregistro` | estadoregistro | — |
| `formafarmaceutica` | formafarmaceutica | — |
| `consecutivocum` | consecutivocum | — |
| `modalidad` | modalidad | — |
| `cantidadcum` | cantidadcum | — |
| `atc` | atc | — |
| `tiporol` | tiporol | — |
| `unidadreferencia` | unidadreferencia | — |

</details>

<details><summary><code>w3uf-w23h</code> — Directorio de instituciones establecimientos educativas oficiales y a nivel dep…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `telefono_de_la_institucion` | TELEFONO DE LA INSTITUCION | **descartada** |
| `direccion` | Direccion | — |
| `email` | Email | **descartada** |
| `car_cter` | carácter | — |
| `tipo_est` | TIPO EST | — |
| `municipio` | Municipio | — |
| `no` | No. | — |
| `zona` | Zona | — |
| `nombre_del_establecimiento` | NOMBRE DEL ESTABLECIMIENTO | **descartada** |
| `rector_o_director` | Rector o director | — |
| `barrio_o_inspeccion` | Barrio o inspeccion | — |
| `cod_dane` | Cod dane | — |
| `especialidad_modalida` | Especialidad/Modalida | — |

</details>

<details><summary><code>x5ay-984n</code> — MEN_SEDES_EDUCATIVAS_PREESCOLAR_BÁSICA_Y_MEDIA: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `direccion` | DIRECCION | — |
| `email` | EMAIL | **descartada** |
| `barrio_vereda` | BARRIO_VEREDA | — |
| `cte_id_sector` | CTE_ID_SECTOR | — |
| `nombre_sede` | NOMBRE_SEDE | — |
| `coordenada_y_sede` | COORDENADA_Y_SEDE | — |
| `codigo_dane_sede` | CODIGO_DANE_SEDE | — |
| `fax` | FAX | **descartada** |
| `sede_id` | SEDE_ID | — |
| `nombre_establecimiento` | NOMBRE_ESTABLECIMIENTO | — |
| `est_id` | EST_ID | — |
| `secretaria` | SECRETARIA | — |
| `departamento` | DEPARTAMENTO | — |
| `municipio` | MUNICIPIO | — |
| `codigo_dane` | CODIGO_DANE | — |
| `principal` | PRINCIPAL | — |
| `coordenada_x_sede` | COORDENADA_X_SEDE | — |
| `cod_dane_municipio` | COD_DANE_MUNICIPIO | — |
| `cte_id_calendario` | CTE_ID_CALENDARIO | — |
| `total_matricula` | TOTAL_MATRICULA | — |
| `a_o` | AÑO | — |
| `zona` | ZONA | — |
| `telefono` | TELEFONO | **descartada** |

</details>

<details><summary><code>x6yb-a8cg</code> — ESTABLECIMIENTOS NACIONALES CERTIFICADOS CON BUENAS PRÁCTICAS DE ELABORACIÓN: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `concepto` | CONCEPTO | — |
| `ciudad` | CIUDAD | — |
| `fecha_vencimiento` | FECHA VENCIMIENTO | — |
| `expediente` | EXPEDIENTE | — |
| `concepto_corto` | CONCEPTO CORTO | — |
| `nombre_establecimiento` | NOMBRE ESTABLECIMIENTO | — |
| `fecha_notificacion` | FECHA NOTIFICACION | — |
| `departamento` | DEPARTAMENTO | — |
| `direccion` | DIRECCION | — |

</details>

<details><summary><code>xaxy-8nri</code> — DIVIPOLA - Códigos cabeceras - Centros poblados: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_municipio` | Nombre Municipio | — |
| `tipo_centro_poblado` | Tipo* | — |
| `latitud` | Latitud | — |
| `longitud` | longitud | — |
| `codigo_centro_poblado` | Código Centro Poblado | — |
| `nombre_departamento` | Nombre_departamento | — |
| `nombre_centro_poblado` | Nombre Centro Poblado | — |
| `codigo_municipio` | Codigo Municipio | — |
| `codigo_departamento` | Código Departamento | — |

</details>

<details><summary><code>xbpm-2jee</code> — ESTABLECIMIENTOS NACIONALES FABRICANTES DE MEDICAMENTOS CERTIFICADOS CON BUENAS…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `concepto` | CONCEPTO | — |
| `concepto_corto` | CONCEPTO CORTO | — |
| `departamento` | DEPARTAMENTO | — |
| `fecha_notificacion` | FECHA NOTIFICACION | — |
| `fecha_vencimiento` | FECHA VENCIMIENTO | — |
| `nombre_establecimiento` | NOMBRE ESTABLECIMIENTO | — |
| `expediente` | EXPEDIENTE | — |
| `ciudad` | CIUDAD | — |
| `direccion` | DIRECCION | — |

</details>

<details><summary><code>xeb3-fi75</code> — Matricula total en el Departamento de Risaralda: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipio` | Municipio | — |
| `valor` | Valor | — |
| `variable` | Variable | — |
| `a_o` | Año | — |

</details>

<details><summary><code>xrdq-pb8b</code> — INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS DEL DEPARTAMENTO DE BOYACÁ CON…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `proyectos_de_conectividad` | PROYECTOS DE CONECTIVIDAD 2024 | — |
| `nombre_sede_educativa` | NOMBRE SEDE EDUCATIVA | — |
| `ancho_de_banda_descarga_mb` | ANCHO DE BANDA DESCARGA (MB) | — |
| `departamento` | DEPARTAMENTO | — |
| `medio_de_enlace` | MEDIO DE ENLACE | — |
| `ancho_de_banda_de_subida` | ANCHO DE BANDA DE SUBIDA (MB) | — |
| `latitud` | LATITUD | — |
| `longitud` | LONGITUD | — |
| `codigo_dane_institucion` | CODIGO DANE INSTITUCION EDUCATIVA | — |
| `operador` | OPERADOR | **descartada** |
| `codigo_departamento` | CÓDIGO DEPARTAMENTO | — |
| `nombre_institucion_educativa` | NOMBRE INSTITUCION EDUCATIVA | — |
| `provincia` | PROVINCIA | — |
| `zona` | ZONA | — |
| `estado` | ESTADO | — |
| `c_digo_municipio` | CÓDIGO MUNICIPIO | — |
| `finalizaci_n_del_contrato` | FINALIZACIÓN DEL CONTRATO | — |
| `municipio` | MUNICIPIO | — |
| `codigo_dane_sede` | CODIGO DANE SEDE | — |

</details>

<details><summary><code>y9ga-zwzy</code> — MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `maestria` | MAESTRIA | — |
| `tecnica_profesional` | TECNICA PROFESIONAL | — |
| `tecnologica` | TECNOLOGICA | — |
| `a_o` | AÑO | — |
| `c_digo_deldepartamento` | Código delDepartamento | — |
| `nombre_del_departamento` | Nombre del Departamento | **descartada** |
| `c_digo_delmunicipio` | Código delMunicipio | — |
| `doctorado` | DOCTORADO | — |
| `universitaria` | UNIVERSITARIA | — |
| `especializacion` | ESPECIALIZACION | — |
| `nombre_del_municipio` | Nombre del Municipio | **descartada** |
| `ies_con_oferta` | IES CON OFERTA | — |

</details>

### minsalud

| Id | Nombre | Publicador | Actualizado | Filas | Columnas | Licencia |
|---|---|---|---|---|---|---|
| [c36g-9fc2](https://www.datos.gov.co/d/c36g-9fc2) | Registro Especial de Prestadores y Sedes de Servicios de Salud | Ministerio de Salud y Protección Social - Mi… | 2026-04-17 | 76821 | 22 | Creative Commons Attribution \| Share Alike 4… |
| [n4dj-8r7k](https://www.datos.gov.co/d/n4dj-8r7k) | Clicsalud - Termómetro de Precios de Medicamentos | Ministerio de Salud y Protección Social - Mi… | 2024-10-18 | 12534 | 12 | Creative Commons Attribution \| Share Alike 4… |
| [9vau-g3q7](https://www.datos.gov.co/d/9vau-g3q7) | Sedes de prestadores con servicio de vacunación | Ministerio de Salud y Protección Social - Mi… | 2023-07-25 | 3962 | 15 | Creative Commons Attribution \| Share Alike 4… |
| [s2ru-bqt6](https://www.datos.gov.co/d/s2ru-bqt6) | Relación de IPS públicas y privadas según el nivel de atención y capa… | Ministerio de Salud y Protección Social - Mi… | 2022-11-21 | 41427 | 20 | Creative Commons Attribution \| Share Alike 4… |
| [kjjp-kasm](https://www.datos.gov.co/d/kjjp-kasm) | Número de prestadores de servicios de salud por departamento, clase d… | Ministerio de Salud y Protección Social - Mi… | 2022-11-21 | 1114 | 5 | Creative Commons Attribution \| Share Alike 4… |
| [4k9h-8qiu](https://www.datos.gov.co/d/4k9h-8qiu) | Registros Individuales de Prestación de Servicios de Salud – RIPS | Ministerio de Salud y Protección Social - Mi… | 2022-06-09 | 38000000 | 6 | Creative Commons Attribution \| Share Alike 4… |
| [vf5x-ngeg](https://www.datos.gov.co/d/vf5x-ngeg) | Reporte de prescripción de tecnologías en salud no financiadas con re… | Ministerio de Salud y Protección Social Mins… | 2022-06-02 | 5970562 | 14 | Creative Commons Attribution \| Share Alike 4… |
| [my8c-6xkk](https://www.datos.gov.co/d/my8c-6xkk) | Registro Único Nacional del Talento Humano en Salud​ - Rethus | Ministerio de Salud y Protección Social - Mi… | 2022-05-30 | 92373 | 8 | Creative Commons Attribution \| Share Alike 4… |
| [thui-g47e](https://www.datos.gov.co/d/thui-g47e) | Clicsalud- Indicadores de calidad IPS | Ministerio de Salud y Protección Social - Mi… | 2022-05-26 | — | 17 | Creative Commons Attribution \| Share Alike 4… |

<details><summary><code>4k9h-8qiu</code> — Registros Individuales de Prestación de Servicios de Salud – RIPS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `departamento` | Departamento | — |
| `tipoatencion` | TipoAtencion | — |
| `municipio` | Municipio | — |
| `numeroatenciones` | NumeroAtenciones | — |
| `diagnostico` | Diagnostico | — |
| `a_o` | Año | — |

</details>

<details><summary><code>9vau-g3q7</code> — Sedes de prestadores con servicio de vacunación: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `numero_sede` | numero_sede | — |
| `nombresedeprestador` | nombresedeprestador | — |
| `barrio_sede_prestador` | barrio_sede_prestador | — |
| `departamento_divipola_sede` | departamento_divipola_sede_prestador | — |
| `nit` | nit | **descartada** |
| `municipio` | municipio | — |
| `clase_prestador` | clase_prestador | — |
| `direccion_sede_prestador` | direccion_sede_prestador | — |
| `fecha_corte_reps` | fecha_corte_REPS | — |
| `habi_codigo_habilitacion` | habi_codigo_habilitacion | — |
| `serv_codigo` | serv_codigo | — |
| `nombre_servicio` | nombre_servicio | — |
| `departamento` | departamento | — |
| `municipio_divipola_sede` | municipio_divipola_sede_prestador | — |
| `codigo_habilitacion` | codigo_habilitacion | — |

</details>

<details><summary><code>c36g-9fc2</code> — Registro Especial de Prestadores y Sedes de Servicios de Salud: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipiosededesc` | MunicipioSedeDesc | — |
| `municipioprestadordesc` | MunicipioPrestadorDesc | — |
| `codigoprestador` | CodigoPrestador | — |
| `t_lefonosede` | TelefonoSede | — |
| `departamentoprestadordesc` | DepartamentoPrestadorDesc | — |
| `numeroidentificacion` | NumeroIdentificacion | **descartada** |
| `ese` | ESE | — |
| `email_prestador` | EmailPrestador | **descartada** |
| `naturalezajuridica` | NaturalezaJuridica | — |
| `fecha_corte_reps` | FechaCorte | — |
| `codigohabilitacionsede` | CodigoHabilitacionSede | — |
| `nombresede` | NombreSede | — |
| `tipoid` | TipoIdentificacion | — |
| `municipiosede` | MunicipioSede | — |
| `departamentodededesc` | DepartamentoSedeDesc | — |
| `direccionprestador` | DireccionPrestador | — |
| `nombreprestador` | NombrePrestador | — |
| `email_sede` | EmailSede | **descartada** |
| `municipio_prestador` | MunicipioPrestador | — |
| `telefonoprestador` | TelefonoPrestador | **descartada** |
| `direcci_nsede` | DireccionSede | — |
| `claseprestador` | ClasePrestadorDesc | — |

</details>

<details><summary><code>kjjp-kasm</code> — Número de prestadores de servicios de salud por departamento, clase de prestado…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `departamento` | Departamento | — |
| `a_o` | Año | — |
| `clase_prestador` | Clase prestador | — |
| `cantidad_de_prestadores` | Cantidad de prestadores | — |
| `naturaleza` | Naturaleza | — |

</details>

<details><summary><code>my8c-6xkk</code> — Registro Único Nacional del Talento Humano en Salud​ - Rethus: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipioresidencia` | MunicipioResidencia | — |
| `perfilprofesional` | PerfilProfesional | — |
| `a_oactoadministrativo` | AñoActoAdministrativo | — |
| `departamentoresidencia` | DepartamentoResidencia | — |
| `tipoprograma` | TipoPrograma | — |
| `numeroregistros` | NumeroRegistros | — |
| `origentitulo` | OrigenTitulo | — |
| `tipoinstitucion` | TipoInstitucion | — |

</details>

<details><summary><code>n4dj-8r7k</code> — Clicsalud - Termómetro de Precios de Medicamentos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fabricante` | fabricante | — |
| `canal` | canal | — |
| `expediente_invima` | Expediente_INVIMA | — |
| `nombre_comercial` | nombre_comercial | **descartada** |
| `factoresprecio` | factoresprecio | — |
| `precio_por_tableta` | precio_por_tableta | — |
| `unidad_base` | unidad_base | — |
| `principio_activo` | principio_activo | — |
| `medicamento` | medicamento | — |
| `numerofactor` | numerofactor | — |
| `unidad_de_dispensacion` | unidad_de_dispensacion | — |
| `concentracion` | concentracion | — |

</details>

<details><summary><code>s2ru-bqt6</code> — Relación de IPS públicas y privadas según el nivel de atención y capacidad inst…: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `naturaleza` | naturaleza | — |
| `fuente` | Fuente | — |
| `nom_grupo_capacidad` | nom grupo capacidad  | **descartada** |
| `gerente` | Gerente | — |
| `direcci_n` | Dirección | — |
| `c_digo_prestador` | Código prestador | — |
| `email` | Email | **descartada** |
| `num_digito_verificion` | num digito_verificion | — |
| `departamento` | Departamento | — |
| `nom_sede_ips` | nom sede IPS | — |
| `nombre_prestador` | Nombre prestador | **descartada** |
| `municipio` | Municipio | — |
| `n_mero_sede` | Número sede | — |
| `nom_descripcion_capacidad` | nom descripcion capacidad  | **descartada** |
| `fecha_corte` | Fecha Corte | — |
| `tel_fono` | Teléfono | **descartada** |
| `nit_ips` | nit IPS  | **descartada** |
| `num_cantidad_capacidad_instalada` | num cantidad capacidad instalada | — |
| `num_nivel_atencion` | num nivel atencion | — |
| `c_digo_sede` | Código sede | — |

</details>

<details><summary><code>thui-g47e</code> — Clicsalud- Indicadores de calidad IPS: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nomfuente` | nomfuente | — |
| `coddepartamento` | coddepartamento | — |
| `enlace` | enlace | — |
| `periodo` | periodo | — |
| `denominador` | denominador | — |
| `nomcategorias` | nomcategorias | — |
| `nomindicador` | nomindicador | — |
| `ips` | ips | — |
| `nomespecifique` | nomespecifique | — |
| `numerador` | numerador | — |
| `codmunicipio` | codmunicipio | — |
| `nomunidad` | nomunidad | — |
| `idips` | idips | — |
| `resultado` | resultado | — |
| `nomservicio` | nomservicio | — |
| `municipio` | municipio | — |
| `departamento` | departamento | — |

</details>

<details><summary><code>vf5x-ngeg</code> — Reporte de prescripción de tecnologías en salud no financiadas con recursos de …: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `soportenutricional` | SoporteNutricional | — |
| `serviciocomplementario` | ServicioComplementario | — |
| `departamento` | Departamento | — |
| `diagnosticoprincipal` | DiagnosticoPrincipal | — |
| `productonutricional` | ProductoNutricional | — |
| `dispositivomedico` | DispositivoMedico | — |
| `numeroprescripciones` | NumeroPrescripciones | — |
| `ambitoatencion` | AmbitoAtencion | — |
| `municipio` | Municipio | — |
| `medicamento` | Medicamento | — |
| `procedimiento` | Procedimiento | — |
| `ips` | IPS | — |
| `eps` | EPS | — |
| `a_o` | Año | — |

</details>

### secop

| Id | Nombre | Publicador | Actualizado | Filas | Columnas | Licencia |
|---|---|---|---|---|---|---|
| [9sue-ezhx](https://www.datos.gov.co/d/9sue-ezhx) | SECOPII - Plan Anual De Adquisiciones Detalle | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 32 | Creative Commons Attribution \| Share Alike 4… |
| [kgcd-kt7i](https://www.datos.gov.co/d/kgcd-kt7i) | SECOP II - Archivos Descarga Historico 2022 | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [uymx-8p3j](https://www.datos.gov.co/d/uymx-8p3j) | SECOP II - Plan de pagos | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 34 | Creative Commons Attribution \| Share Alike 4… |
| [3skv-9na7](https://www.datos.gov.co/d/3skv-9na7) | SECOP II - Archivos Descarga Historico 2023 | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [a86w-fh92](https://www.datos.gov.co/d/a86w-fh92) | SECOP II - Solicitudes CDPs | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 40 | Creative Commons Attribution \| Share Alike 4… |
| [wwhe-4sq8](https://www.datos.gov.co/d/wwhe-4sq8) | SECOP II - Ubicaciones Adicionales | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [rpmr-utcd](https://www.datos.gov.co/d/rpmr-utcd) | SECOP Integrado | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | 22670028 | 22 | Creative Commons Attribution \| Share Alike 4… |
| [u99c-7mfm](https://www.datos.gov.co/d/u99c-7mfm) | SECOP II - Suspensiones de Contratos | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [b28v-edj8](https://www.datos.gov.co/d/b28v-edj8) | SECOPII - Ofertas Por Proceso Historico | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 16 | Creative Commons Attribution \| Share Alike 4… |
| [mfmm-jqmq](https://www.datos.gov.co/d/mfmm-jqmq) | SECOP II - Ejecución Contratos | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 16 | Creative Commons Attribution \| Share Alike 4… |
| [wi7w-2nvm](https://www.datos.gov.co/d/wi7w-2nvm) | SECOPII - Ofertas Por Proceso | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 16 | Creative Commons Attribution \| Share Alike 4… |
| [ibyt-yi2f](https://www.datos.gov.co/d/ibyt-yi2f) | SECOP II - Facturas | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 15 | Creative Commons Attribution \| Share Alike 4… |
| [qmzu-gj57](https://www.datos.gov.co/d/qmzu-gj57) | SECOP II - Proveedores Registrados | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | 1612550 | 26 | Creative Commons Attribution \| Share Alike 4… |
| [cb9c-h8sn](https://www.datos.gov.co/d/cb9c-h8sn) | SECOP II - Adiciones | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 5 | Creative Commons Attribution \| Share Alike 4… |
| [f789-7hwg](https://www.datos.gov.co/d/f789-7hwg) | SECOP I - Procesos de Compra Pública | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 79 | Creative Commons Attribution \| Share Alike 4… |
| [ceth-n4bn](https://www.datos.gov.co/d/ceth-n4bn) | Grupos de Proveedores - SECOP II | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 33 | Creative Commons Attribution \| Share Alike 4… |
| [7fix-nd37](https://www.datos.gov.co/d/7fix-nd37) | SECOP I - Adiciones | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 5 | Creative Commons Attribution \| Share Alike 4… |
| [qddk-cgux](https://www.datos.gov.co/d/qddk-cgux) | SECOP I - Procesos de Compra Pública Historico | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 79 | Creative Commons Attribution \| Share Alike 4… |
| [f8va-cf4m](https://www.datos.gov.co/d/f8va-cf4m) | SECOP II - Archivos Descarga Historico Hasta 2021 | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [nbae-kzan](https://www.datos.gov.co/d/nbae-kzan) | SECOP II - Archivos Descarga Historico 2024 | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [gjp9-cutm](https://www.datos.gov.co/d/gjp9-cutm) | SECOP II - Garantias | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [gra4-pcp2](https://www.datos.gov.co/d/gra4-pcp2) | SECOP II - Ubicaciones ejecucion contratos | Agencia Nacional de Contratación Pública Col… | 2026-09-21 | 6333733 | 13 | Creative Commons Attribution \| Share Alike 4… |
| [ityv-bxct](https://www.datos.gov.co/d/ityv-bxct) | SECOP - Convenios Interadministrativos Historico | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 27 | Creative Commons Attribution \| Share Alike 4… |
| [4ex9-j3n8](https://www.datos.gov.co/d/4ex9-j3n8) | SECOP II - Contacto Entidades y Proveedores | Colombia Compra Eficiente CCE, Bogotá, D.C | 2026-09-21 | — | 23 | Creative Commons Attribution \| Share Alike 4… |
| [hgi6-6wh3](https://www.datos.gov.co/d/hgi6-6wh3) | Proponentes por Proceso SECOP II | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [s484-c9k3](https://www.datos.gov.co/d/s484-c9k3) | SECOP - Convenios Interadministrativos | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 27 | Creative Commons Attribution \| Share Alike 4… |
| [azeg-sgqg](https://www.datos.gov.co/d/azeg-sgqg) | SECOP I - PAA Detalle | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 12 | Creative Commons Attribution \| Share Alike 4… |
| [d9na-abhe](https://www.datos.gov.co/d/d9na-abhe) | SECOP II - BPIN por Proceso | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 6 | Creative Commons Attribution \| Share Alike 4… |
| [prdx-nxyp](https://www.datos.gov.co/d/prdx-nxyp) | SECOP I - PAA Encabezado | Agencia Nacional de Contratación Pública - C… | 2026-09-21 | — | 19 | Creative Commons Attribution \| Share Alike 4… |
| [p6dx-8zbt](https://www.datos.gov.co/d/p6dx-8zbt) | SECOP II - Procesos de Contratación | Agencia Nacional de Contratación Pública - C… | 2026-09-20 | — | 59 | Creative Commons Attribution \| Share Alike 4… |
| [dmgg-8hin](https://www.datos.gov.co/d/dmgg-8hin) | SECOP II - Archivos Descarga Desde 2025 | Agencia Nacional de Contratación Pública - C… | 2026-09-20 | — | 11 | Creative Commons Attribution \| Share Alike 4… |
| [u8cx-r425](https://www.datos.gov.co/d/u8cx-r425) | SECOP II - Modificaciones a contratos | Agencia Nacional de Contratación Pública - C… | 2026-09-20 | — | 35 | Creative Commons Attribution \| Share Alike 4… |
| [jbjy-vk9h](https://www.datos.gov.co/d/jbjy-vk9h) | SECOP II - Contratos Electrónicos | Agencia Nacional de Contratación Pública - C… | 2026-09-20 | 6066730 | 85 | Creative Commons Attribution \| Share Alike 4… |
| [tauh-5jvn](https://www.datos.gov.co/d/tauh-5jvn) | SECOP I - Proponentes | Agencia Nacional de Contratación Pública - C… | 2026-09-20 | — | 10 | Creative Commons Attribution \| Share Alike 4… |
| [36vw-pbq2](https://www.datos.gov.co/d/36vw-pbq2) | SECOP I - Modificaciones a Procesos | Agencia Nacional de Contratación Pública - C… | 2026-09-19 | — | 7 | Creative Commons Attribution \| Share Alike 4… |
| [rgxm-mmea](https://www.datos.gov.co/d/rgxm-mmea) | Tienda Virtual del Estado Colombiano - Consolidado | Agencia Nacional de Contratación Pública - C… | 2026-09-18 | — | 22 | Creative Commons Attribution \| Share Alike 4… |
| [4n4q-k399](https://www.datos.gov.co/d/4n4q-k399) | Multas y Sanciones SECOP I | Agencia Nacional de Contratación Pública - C… | 2026-09-18 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [cwhv-7fnp](https://www.datos.gov.co/d/cwhv-7fnp) | SECOP II - Rubros Presupuestales | Agencia Nacional de Contratación Pública - C… | 2026-09-17 | — | 9 | Creative Commons Attribution \| Share Alike 4… |
| [skc9-met7](https://www.datos.gov.co/d/skc9-met7) | SECOP II - Compromisos Presupuestales | Agencia Nacional de Contratación Pública - C… | 2026-09-17 | — | 14 | Creative Commons Attribution \| Share Alike 4… |
| [e2u2-swiw](https://www.datos.gov.co/d/e2u2-swiw) | SECOP II - Modificaciones a Procesos | Agencia Nacional de Contratación Pública - C… | 2021-02-15 | — | 7 | Creative Commons Attribution \| Share Alike 4… |

<details><summary><code>36vw-pbq2</code> — SECOP I - Modificaciones a Procesos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_modificacion` | ID Modificacion | — |
| `id_proceso` | ID Proceso | — |
| `valor_nuevo` | Valor Nuevo | — |
| `fecha_modificacion` | Fecha Modificacion | — |
| `valor_anterior` | Valor Anterior | — |
| `campo_modificado` | Campo Modificado | — |
| `justificacion_cambio` | Justificacion Cambio | — |

</details>

<details><summary><code>3skv-9na7</code> — SECOP II - Archivos Descarga Historico 2023: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_documento` | ID Documento | **descartada** |
| `proceso` | Proceso | — |
| `nombre_archivo` | Nombre Documento | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `tamanno_archivo` | Tamaño Documento | — |
| `n_mero_de_contrato` | Número de Contrato | — |
| `url_descarga_documento` | URL Descarga Documento | **descartada** |
| `extensi_n` | Extensión | — |
| `descripci_n` | Descripción | — |
| `fecha_carga` | Fecha Carga | — |
| `entidad` | Entidad | — |

</details>

<details><summary><code>4ex9-j3n8</code> — SECOP II - Contacto Entidades y Proveedores: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `es_proveedor` | Es Proveedor | — |
| `pais` | Pais | — |
| `n_mero_documento_representante_legal` | Número documento representante legal | **descartada** |
| `es_pyme` | Es Pyme | — |
| `codigo_categoria_principal` | Codigo categoria principal | — |
| `ciudad` | Ciudad | — |
| `feacha_de_creacion` | Feacha de creacion | — |
| `tipo_documento_representante_legal` | Tipo documento representante legal | **descartada** |
| `descripci_n_categoria_principal` | Descripción categoria principal | — |
| `tipo_entidad` | Tipo entidad | — |
| `nombre_entidad` | Nombre Entidad | — |
| `nombre_representante_legal` | Nombre representante legal | **descartada** |
| `website` | Sitio web | — |
| `c_digo_ubicaci_n` | Código ubicación | — |
| `correo_electronico` | Correo Electronico | **descartada** |
| `departamento` | Departamento | — |
| `es_entidad` | Es Entidad | — |
| `correo_representante_legal` | Correo representante legal | **descartada** |
| `nit_entidad` | NIT Entidad | **descartada** |
| `codigo_entidad` | Codigo Entidad | — |
| `es_grupo` | Es Grupo | — |
| `numero_fax` | Numero Fax | **descartada** |
| `esta_activa` | Esta activa | — |

</details>

<details><summary><code>4n4q-k399</code> — Multas y Sanciones SECOP I: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `orden` | Orden | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `numero_de_resolucion` | Numero de Resolucion | — |
| `ruta_de_proceso` | Ruta de Proceso | — |
| `numero_de_contrato` | Numero de Contrato | — |
| `fecha_de_cargue` | Fecha de Cargue | — |
| `fecha_de_firmeza` | Fecha de Firmeza | — |
| `nombre_contratista` | Nombre Contratista | **descartada** |
| `valor_sancion` | Valor Sancion | — |
| `fecha_de_publicacion` | Fecha de Publicacion | — |
| `documento_contratista` | Documento Contratista | **descartada** |
| `nivel` | Nivel | — |
| `municipio` | Municipio | — |
| `nombre_entidad` | Nombre Entidad | — |

</details>

<details><summary><code>7fix-nd37</code> — SECOP I - Adiciones: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_adjudicacion` | Id_Adjudicacion | — |
| `fecha_firma` | Fecha Firma | **descartada** |
| `adicion_en_valor` | Adicion En Valor | — |
| `adicion_en_meses` | Adicion en Meses | — |
| `adicion_en_dias` | Adicion en Dias | — |

</details>

<details><summary><code>9sue-ezhx</code> — SECOPII - Plan Anual De Adquisiciones Detalle: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_esperada_de_inicio` | Fecha Esperada de Inicio | — |
| `version_del_paa` | Version del PAA | — |
| `requiere_vigencias_futuras` | Requiere vigencias futuras | — |
| `identificador_unico` | Identificador Unico | — |
| `seleccion_abreviada_o_acuerdo` | Seleccion Abreviada o Acuerdo Marco | — |
| `duracion_esperada` | Duracion Esperada | — |
| `grupo_de_procedimiento` | Grupo de procedimiento | — |
| `fecha_esperada_de_recepcion` | Fecha Esperada de Recepcion de Ofertas | — |
| `id_plan_anual_de_adquisiciones` | Id Plan Anual de Adquisiciones | — |
| `valor_esperado_de_presupuesto` | Valor Esperado de Presupuesto Actual | — |
| `procesos_relacionados` | Procesos Relacionados | — |
| `descripcion` | Descripcion | — |
| `valor_total_esperado` | Valor Total Esperado | — |
| `nombre_entidad` | Nombre Entidad | — |
| `causal_de_contratacion` | Causal de contratacion | — |
| `url_proceso` | URL Proceso | — |
| `id` | Id | — |
| `fecha_de_carga_del_paa` | Fecha de carga del PAA | — |
| `annio` | Annio | — |
| `tipo` | Tipo | — |
| `correo_del_contacto` | Correo del Contacto | **descartada** |
| `modalidad` | Modalidad | — |
| `categorias_unspsc` | Categorias UNSPSC | — |
| `telefono_del_contacto` | Telefono del Contacto | **descartada** |
| `estado_de_solicitud_de` | Estado de Solicitud de Vigencias Futuras | — |
| `id_paa_encabezado` | ID PAA Encabezado | — |
| `unidad_de_duracion_esperada` | Unidad de Duracion Esperada | — |
| `origen_recursos` | Origen Recursos | — |
| `nombre_del_contacto` | Nombre del Contacto | **descartada** |
| `fecha_version` | Fecha version del PAA | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `codigo_entidad` | Codigo Entidad | — |

</details>

<details><summary><code>a86w-fh92</code> — SECOP II - Solicitudes CDPs: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `proveedor` | Proveedor | — |
| `c_digo` | Código vigencias futuras | — |
| `departamento` | Departamento | — |
| `estado_del_contrato` | Estado del contrato | — |
| `c_digo_cdp` | Código CDP | — |
| `recursos_propios` | Recursos propios | — |
| `acuerdo_marco` | Acuerdo_marco | — |
| `destino_del_gasto` | Destino del gasto | — |
| `estado_siif` | Estado_SIIF | — |
| `ultima_consulta_siif` | Ultima consulta SIIF | — |
| `entidad_bpin` | Entidad BPIN | — |
| `valor_utilizado` | Valor Utilizado | — |
| `pci_unidad_subejecutora` | PCI Unidad Subejecutora | — |
| `a_o_bpin` | Año BPIN | — |
| `sistema_nacional_participaciones` | Sistema Nacional Participaciones | — |
| `nit` | NIT | **descartada** |
| `ciudad` | Ciudad | — |
| `id_siif` | ID SIIF | — |
| `pilar_acuerdo_paz` | Pilar acuerdo paz | — |
| `fecha_consulta_siif` | Fecha consulta SIIF | — |
| `referencia_del_proceso` | Referencia del proceso | — |
| `bpin_codigo` | BPIN Codigo | — |
| `id_proceso` | ID Proceso | — |
| `registrado_en_siif` | Registrado en SIIF | — |
| `recursos_de_credito` | Recursos de credito | — |
| `saldo_cdp` | Saldo_CDP | — |
| `sistema_general_de_regal_as` | Sistema general de regalías | — |
| `tipo_vigencias_futuras` | Tipo vigencias futuras | — |
| `bpin_validacion` | BPIN_Validacion | — |
| `id_contrato` | ID Contrato | — |
| `fuente_de_los_recursos` | Fuente_de_los_recursos | — |
| `entidad` | Entidad | — |
| `saldo_total_a_comprometer` | Saldo total a comprometer | — |
| `presupuesto_general_estado` | Presupuesto General Estado | — |
| `id_portafolio` | ID Portafolio | — |
| `nit_proveedor` | NIT Proveedor | **descartada** |
| `saldo_vigencias_futuras` | Saldo vigencias futuras | — |
| `referencia_contrato` | Referencia Contrato | — |
| `codigo_unidad_ejecutora` | Codigo unidad ejecutora | — |
| `recursos_propios_agri` | Recursos Propios AGRI | — |

</details>

<details><summary><code>azeg-sgqg</code> — SECOP I - PAA Detalle: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `valor_estimado_vig_actual` | Valor Estimado Vig Actual | — |
| `idpaa` | IDPAA | — |
| `id` | ID | — |
| `contacto_responsable_adquisicion` | Contacto Responsable Adquisicion | **descartada** |
| `duracion_estimada` | Duracion Estimada | — |
| `valor_estimado` | Valor Estimado | — |
| `requiere_vigencias_futuras` | Requiere Vigencias Futuras | — |
| `fuente_de_recursos` | Fuente de Recursos | — |
| `codigo_unspsc` | Codigo UNSPSC | — |
| `modalidad` | Modalidad Seleccion | — |
| `descripcio_item` | Descripcion Item | — |
| `fecha_inicio` | Fecha Inicio | — |

</details>

<details><summary><code>b28v-edj8</code> — SECOPII - Ofertas Por Proceso Historico: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `entidad_compradora` | Entidad Compradora | — |
| `descripcion_del_procedimiento` | Descripcion del Procedimiento | — |
| `invitacion_directa` | Invitacion Directa | — |
| `id_del_proceso_de_compra` | ID del Proceso de Compra | — |
| `referencia_de_la_oferta` | Referencia de la Oferta | — |
| `nombre_proveedor` | Nombre Proveedor | **descartada** |
| `c_digo_proveedor` | Código Proveedor | — |
| `fecha_de_registro` | Fecha de Registro | — |
| `c_digo_entidad` | Código Entidad | — |
| `nit_del_proveedor` | NIT del Proveedor | **descartada** |
| `valor_de_la_oferta` | Valor de la Oferta | — |
| `modalidad` | Modalidad | — |
| `nit_entidad_compradora` | NIT Entidad Compradora | **descartada** |
| `referencia_del_proceso` | Referencia del Proceso | — |
| `moneda` | Moneda | — |
| `identificador_de_la_oferta` | Identificador de la Oferta | — |

</details>

<details><summary><code>cb9c-h8sn</code> — SECOP II - Adiciones: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecharegistro` | FechaRegistro | — |
| `descripcion` | Descripcion | — |
| `id_contrato` | ID_Contrato | — |
| `tipo` | Tipo | — |
| `identificador` | Identificador | — |

</details>

<details><summary><code>ceth-n4bn</code> — Grupos de Proveedores - SECOP II: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_creaci_n_participante` | Fecha Creación Participante | — |
| `sitio_web_grupo` | Sitio web grupo | — |
| `departamento_grupo` | Departamento grupo | — |
| `nombre_participante` | Nombre Participante | **descartada** |
| `nit_participante` | NIT Participante | **descartada** |
| `codigo_grupo` | Codigo grupo | — |
| `numero_doc_representante_legal_grupo` | Numero doc representante legal grupo | — |
| `correo_representante_legal_grupo` | Correo representante legal grupo | **descartada** |
| `participacion` | Participacion | — |
| `minucipio` | Minucipio grupo | — |
| `correo_electronico_grupo` | Correo electronico grupo | **descartada** |
| `ubicaci_n_grupo` | Ubicación Grupo | — |
| `nombre_representante_legal_grupo` | Nombre representante legal grupo | **descartada** |
| `numero_tel_fono_grupo` | Numero teléfono grupo | **descartada** |
| `telefono_representante_legal_grupo` | Telefono representante legal grupo | **descartada** |
| `es_mipyme` | Es Mipyme | — |
| `numero_fax` | Numero fax grupo | **descartada** |
| `codigo_participante` | Codigo participante | — |
| `direcci_n_grupo` | Dirección grupo | — |
| `tipo_empresa_participante` | Tipo Empresa Participante | — |
| `nit_grupo` | NIT Grupo | **descartada** |
| `esta_activo` | Esta activo | — |
| `nombre_grupo` | Nombre Grupo | **descartada** |
| `fecha_creaci_n_grupo` | Fecha Creación Grupo | — |
| `codigo_categor_a_principal_grupo` | Codigo categoría principal grupo | — |
| `pais_grupo` | Pais grupo | — |
| `ubicaci_n_participante` | Ubicación Participante | — |
| `es_proveedor` | Es proveedor | — |
| `descripci_n_c_digo_categor_a_principal_grupo` | Descripción código categoría principal grupo | — |
| `es_lider_del_grupo` | Es Lider del Grupo | — |
| `tipo_empresa_grupo` | Tipo Empresa Grupo | — |
| `tipo_doc_representante_legal_grupo` | Tipo doc representante legal grupo | — |
| `es_entidad` | Es Entidad | — |

</details>

<details><summary><code>cwhv-7fnp</code> — SECOP II - Rubros Presupuestales: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_contrato` | ID Contrato | — |
| `codigo` | Codigo | — |
| `identificador_unico` | Identificador Unico | — |
| `valor_actual` | Valor Actual | — |
| `nombre` | Nombre | **descartada** |
| `identificador_compromiso` | Identificador Compromiso | — |
| `anno` | Anno | — |
| `identificador_item_compromiso` | Identificador Item Compromiso | — |
| `referencia_contrato` | Referencia Contrato | — |

</details>

<details><summary><code>d9na-abhe</code> — SECOP II - BPIN por Proceso: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `validacion_bpin` | Validacion BPIN | — |
| `id_portafolio` | ID Portafolio | — |
| `anno_bpin` | Anno BPIN | — |
| `codigo_bpin` | Codigo BPIN | — |
| `id_proceso` | ID Proceso | — |
| `id_contracto` | ID Contracto | — |

</details>

<details><summary><code>dmgg-8hin</code> — SECOP II - Archivos Descarga Desde 2025: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `entidad` | Entidad | — |
| `id_documento` | ID Documento | **descartada** |
| `extensi_n` | Extensión | — |
| `proceso` | Proceso | — |
| `fecha_carga` | Fecha Carga | — |
| `url_descarga_documento` | URL Descarga Documento | **descartada** |
| `descripci_n` | Descripción | — |
| `nombre_archivo` | Nombre Documento | — |
| `n_mero_de_contrato` | Número de Contrato | — |
| `tamanno_archivo` | Tamaño Documento | — |
| `nit_entidad` | NIT Entidad | **descartada** |

</details>

<details><summary><code>e2u2-swiw</code> — SECOP II - Modificaciones a Procesos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `proceso` | Proceso | — |
| `portafolio` | Portafolio | — |
| `codigo_entidad` | Codigo Entidad | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `ultima_modificacion` | Ultima Modificacion | — |
| `descripcion_proceso` | Descripcion Proceso | — |
| `nombre_entidad` | Nombre Entidad | — |

</details>

<details><summary><code>f789-7hwg</code> — SECOP I - Procesos de Compra Pública: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `pliegos_tipo` | Pliegos tipo | — |
| `sector_pliegos_tipo` | Sector pliegos tipo | — |
| `uid` | UID | — |
| `valor_total_de_adiciones` | Valor Total de Adiciones | — |
| `tiempo_adiciones_en_meses` | Tiempo Adiciones en Meses | — |
| `tiempo_adiciones_en_dias` | Tiempo Adiciones en Dias | — |
| `fecha_de_cargue_en_el_secop` | Fecha de Cargue en el SECOP | — |
| `moneda` | Moneda | — |
| `numero_de_constancia` | Numero de Constancia | — |
| `nombre_sub_unidad_ejecutora` | Nombre Sub Unidad Ejecutora | **descartada** |
| `municipio_entidad` | Municipio Entidad | — |
| `punto_acuerdo_paz` | Punto Acuerdo Paz | — |
| `pilar_acuerdo_paz` | Pilar Acuerdo Paz | — |
| `numero_de_proceso` | Numero de Proceso | — |
| `rango_de_ejec_del_contrato` | Rango de Ejec del Contrato | — |
| `numero_de_contrato` | Numero de Contrato | — |
| `fecha_de_firma_del_contrato` | Fecha de Firma del Contrato | **descartada** |
| `cuantia_proceso` | Cuantia Proceso | — |
| `sexo_replegal` | Sexo RepLegal | **descartada** |
| `valor_rubro` | Valor Rubro | — |
| `nombre_del_represen_legal` | Nombre del Represen Legal | **descartada** |
| `tipo_doc_representante_legal` | Tipo Doc Representante Legal | — |
| `orden_entidad` | Orden Entidad | — |
| `ruta_proceso_en_secop_i` | Ruta Proceso en SECOP I | — |
| `identific_representante_legal` | Identific Representante Legal | — |
| `id_grupo` | ID Grupo | — |
| `plazo_de_ejec_del_contrato` | Plazo de Ejec del Contrato | — |
| `nombre_grupo` | Nombre Grupo | **descartada** |
| `id_familia` | ID Familia | — |
| `nombre_familia` | Nombre Familia | **descartada** |
| `tipo_identifi_del_contratista` | Tipo Identifi del Contratista | — |
| `fecha_ini_ejec_contrato` | Fecha Ini Ejec Contrato | — |
| `id_clase` | ID Clase | — |
| `nombre_rubro` | Nombre Rubro | **descartada** |
| `dpto_y_muni_contratista` | Dpto y Muni Contratista | — |
| `nom_razon_social_contratista` | Nom Razon Social Contratista | **descartada** |
| `nombre_clase` | Nombre Clase | — |
| `id_adjudicacion` | ID Adjudicacion | — |
| `identificacion_del_contratista` | Identificacion del Contratista | **descartada** |
| `nivel_entidad` | Nivel Entidad | — |
| `nombre_regimen_de_contratacion` | Nombre Regimen de Contratacion | **descartada** |
| `posicion_rubro` | Posicion Rubro | — |
| `es_postconflicto` | Es PostConflicto | — |
| `marcacion_adiciones` | Marcacion Adiciones | — |
| `anno_firma_contrato` | Anno Firma Contrato | **descartada** |
| `id_modalidad` | ID Modalidad | — |
| `anno_cargue_secop` | Anno Cargue SECOP | — |
| `modalidad_de_contratacion` | Modalidad de Contratacion | — |
| `valor_contrato_con_adiciones` | Valor Contrato con Adiciones | — |
| `estado_del_proceso` | Estado del Proceso | — |
| `id_objeto_a_contratar` | ID Objeto a Contratar | — |
| `cuantia_contrato` | Cuantia Contrato | — |
| `objeto_a_contratar` | Objeto a Contratar | — |
| `detalle_del_objeto_a_contratar` | Detalle del Objeto a Contratar | — |
| `id_regimen_de_contratacion` | ID Regimen de Contratacion | — |
| `objeto_del_contrato_a_la` | Objeto del Contrato a la Firma | — |
| `proponentes_seleccionados` | Proponentes Seleccionados | — |
| `causal_de_otras_formas_de` | Causal de Otras formas de Contratacion Directa | — |
| `c_digo_de_la_entidad` | Código de la Entidad | — |
| `nit_de_la_entidad` | NIT de la Entidad | **descartada** |
| `ultima_actualizacion` | Ultima Actualizacion | — |
| `nombre_entidad` | Nombre Entidad | — |
| `fecha_liquidacion` | Fecha Liquidacion | — |
| `cumpledecreto248` | Cumple Decreto 248 | — |
| `incluyebienesdecreto248` | IncluyeBienesDecreto248 | — |
| `cumple_sentencia_t302` | Cumple Sentencia T302 | — |
| `es_mipyme` | Es MiPyme | — |
| `tama_o_mipyme` | Tamaño Mipyme | — |
| `tipo_de_contrato` | Tipo De Contrato | — |
| `municipio_de_obtencion` | Municipio de Obtencion | — |
| `calificacion_definitiva` | Calificacion Definitiva | — |
| `departamento_entidad` | Departamento Entidad | — |
| `municipio_de_entrega` | Municipio de Entrega | — |
| `codigo_bpin` | Codigo BPIN | — |
| `destino_gasto` | Destino gasto | — |
| `compromiso_presupuestal` | Compromiso Presupuestal | — |
| `fecha_fin_ejec_contrato` | Fecha Fin Ejec Contrato | — |
| `id_sub_unidad_ejecutora` | ID Sub Unidad Ejecutora | — |
| `municipios_ejecucion` | Municipios Ejecucion | — |

</details>

<details><summary><code>f8va-cf4m</code> — SECOP II - Archivos Descarga Historico Hasta 2021: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_documento` | ID Documento | **descartada** |
| `entidad` | Entidad | — |
| `url_descarga_documento` | URL Descarga Documento | **descartada** |
| `proceso` | Proceso | — |
| `tamanno_archivo` | Tamaño Documento | — |
| `fecha_carga` | Fecha Carga | — |
| `descripci_n` | Descripción | — |
| `extensi_n` | Extensión | — |
| `nombre_archivo` | Nombre Documento | — |
| `n_mero_de_contrato` | Número de Contrato | — |
| `nit_entidad` | NIT Entidad | **descartada** |

</details>

<details><summary><code>gjp9-cutm</code> — SECOP II - Garantias: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `asegurado` | Asegurado | — |
| `fechaenviopoliza` | FechaEnvioPoliza | — |
| `subtipopoliza` | SubTipoPoliza | — |
| `estado` | Estado | — |
| `fechafinpoliza` | FechaFinPoliza | — |
| `tipopoliza` | TipoPoliza | — |
| `ladopoliza` | LadoPoliza | — |
| `fecha_de_creacion` | Fecha de Creacion | — |
| `beneficiario` | Beneficiario | — |
| `numeropoliza` | NumeroPoliza | — |
| `valor` | Valor | — |
| `aseguradora` | Aseguradora | — |
| `fechadecreacionpoliza` | FechaDeCreacionPoliza | — |
| `id_contrato` | ID Contrato | — |

</details>

<details><summary><code>gra4-pcp2</code> — SECOP II - Ubicaciones ejecucion contratos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `referencia_del_contrato` | Referencia del Contrato | — |
| `codigo_entidad` | Codigo Entidad | — |
| `tipodocproveedor` | TipoDocProveedor | — |
| `nit_entidad` | Nit Entidad | **descartada** |
| `proceso_de_compra` | Proceso de Compra | — |
| `urlproceso` | URLProceso | — |
| `documento_proveedor` | Documento Proveedor | **descartada** |
| `ubicacion` | Ubicacion | — |
| `codigo_proveedor` | Codigo Proveedor | — |
| `nombre_entidad` | Nombre Entidad | — |
| `id_contrato` | ID Contrato | — |
| `proveedor_adjudicado` | Proveedor Adjudicado | — |
| `localizaci_n` | Localización | — |

</details>

<details><summary><code>hgi6-6wh3</code> — Proponentes por Proceso SECOP II: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `proveedor` | Proveedor | — |
| `nit_proveedor` | NIT Proveedor | **descartada** |
| `codigo_proveedor` | Codigo Proveedor | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `nombre_procedimiento` | Nombre Procedimiento | **descartada** |
| `codigo_entidad` | Codigo Entidad | — |
| `fecha_publicaci_n` | Fecha Publicación | — |
| `entidad_compradora` | Entidad Compradora | — |
| `id_procedimiento` | ID Procedimiento | — |

</details>

<details><summary><code>ibyt-yi2f</code> — SECOP II - Facturas: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_contrato` | ID Contrato | — |
| `id_pago` | ID Pago | — |
| `fecha_factura` | Fecha Factura | — |
| `codigo_entidad` | Codigo Entidad | — |
| `numero_de_factura` | Numero de Factura | — |
| `valor_neto` | Valor Neto | — |
| `valor_total` | Valor Total | — |
| `notas` | Notas | — |
| `fecha_de_entrega` | Fecha de entrega | — |
| `radicado` | Radicado | — |
| `fecha_estiamda_de_pago` | Fecha estiamda de pago | — |
| `valor_a_pagar` | Valor a Pagar | — |
| `estado` | Estado | — |
| `pago_confirmado` | Pago confirmado | — |
| `usuario_pago` | Usuario Pago | **descartada** |

</details>

<details><summary><code>ityv-bxct</code> — SECOP - Convenios Interadministrativos Historico: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_entidad` | Nombre Entidad | — |
| `link` | Link | — |
| `id_entidad` | ID Entidad | — |
| `fecha_firma` | Fecha Firma | **descartada** |
| `tipo_de_contrato` | Tipo de Contrato | — |
| `anno_cargue` | Anno cargue | — |
| `orden` | Orden | — |
| `objeto_contractual` | Objeto contractual | — |
| `fecha_cargue` | Fecha cargue | — |
| `contratista` | Contratista | — |
| `fecha_inicio_del_contrato` | Fecha Inicio del Contrato | — |
| `justificacion_modalidad` | Justificacion modalidad | — |
| `fecha_fin_del_contrato` | Fecha Fin del Contrato | — |
| `municipio` | Municipio | — |
| `numero_de_contrato` | Numero de Contrato | — |
| `identificacion_contratista` | Identificacion Contratista | **descartada** |
| `anno_firma` | Anno firma | **descartada** |
| `id_contrato` | ID Contrato | — |
| `estado_contrato` | Estado contrato | — |
| `modalidad_contratacion` | Modalidad Contratacion | — |
| `fuente` | Fuente | — |
| `id_proceso` | ID Proceso | — |
| `origen_de_los_recursos` | Origen de los recursos | — |
| `departamento` | Departamento | — |
| `unspsc_id_clase` | UNSPSC ID Clase | — |
| `valor_con_adiciones` | Valor con adiciones | — |
| `tipo_contratista` | Tipo Contratista | — |

</details>

<details><summary><code>jbjy-vk9h</code> — SECOP II - Contratos Electrónicos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `n_mero_de_documento_ordenador_de_pago` | Número de documento Ordenador de Pago | **descartada** |
| `recursos_propios_alcald_as_gobernaciones_y_resguardos_ind_genas_` | Recursos Propios (Alcaldías y Gobernaciones) | — |
| `nombre_del_banco` | Nombre del banco | **descartada** |
| `fecha_fin_liquidacion` | Fecha Fin Liquidacion | — |
| `orden` | Orden | — |
| `tipo_de_cuenta` | Tipo de cuenta | — |
| `sector` | Sector | — |
| `rama` | Rama | — |
| `n_mero_de_cuenta` | Número de cuenta | — |
| `nombre_ordenador_del_gasto` | Nombre ordenador del gasto | **descartada** |
| `entidad_centralizada` | Entidad Centralizada | — |
| `departamento` | Departamento | — |
| `nit_entidad` | Nit Entidad | **descartada** |
| `descripcion_documentos_tipo` | Descripcion Documentos Tipo | **descartada** |
| `documentos_tipo` | Documentos Tipo | **descartada** |
| `valor_de_pago_adelantado` | Valor de pago adelantado | — |
| `valor_facturado` | Valor Facturado | — |
| `ciudad` | Ciudad | — |
| `localizaci_n` | Localización | — |
| `duraci_n_del_contrato` | Duración del contrato | — |
| `valor_pendiente_de_pago` | Valor Pendiente de Pago | — |
| `el_contrato_puede_ser_prorrogado` | El contrato puede ser prorrogado | — |
| `objeto_del_contrato` | Objeto del Contrato | — |
| `fecha_de_firma` | Fecha de Firma | **descartada** |
| `g_nero_representante_legal` | Género Representante Legal | — |
| `fecha_de_inicio_del_contrato` | Fecha de Inicio del Contrato | — |
| `valor_pendiente_de_ejecucion` | Valor Pendiente de Ejecucion | — |
| `presupuesto_general_de_la_nacion_pgn` | Presupuesto General de la Nacion – PGN | — |
| `fecha_de_fin_del_contrato` | Fecha de Fin del Contrato | — |
| `condiciones_de_entrega` | Condiciones de Entrega | — |
| `codigo_entidad` | Codigo Entidad | — |
| `valor_del_contrato` | Valor del Contrato | — |
| `tipodocproveedor` | TipoDocProveedor | — |
| `documento_proveedor` | Documento Proveedor | **descartada** |
| `sistema_general_de_participaciones` | Sistema General de Participaciones | — |
| `valor_pendiente_de` | Valor Pendiente de Amortizacion | — |
| `destino_gasto` | Destino Gasto | — |
| `origen_de_los_recursos` | Origen de los Recursos | — |
| `reversion` | Reversion | — |
| `proveedor_adjudicado` | Proveedor Adjudicado | — |
| `es_grupo` | Es Grupo | — |
| `sistema_general_de_regal_as` | Sistema General de Regalías | — |
| `es_pyme` | Es Pyme | — |
| `ultima_actualizacion` | Ultima Actualizacion | — |
| `recursos_de_credito` | Recursos de Credito | — |
| `habilita_pago_adelantado` | Habilita Pago Adelantado | — |
| `obligaciones_postconsumo` | Obligaciones Postconsumo | — |
| `tipo_de_documento_ordenador_de_pago` | Tipo de documento Ordenador de Pago | **descartada** |
| `nombre_ordenador_de_pago` | Nombre Ordenador de Pago | **descartada** |
| `n_mero_de_documento_supervisor` | Número de documento supervisor | **descartada** |
| `recursos_propios` | Otros Recursos (Especie, Privados, Cooperación, Propios Entidades Autónomas) | — |
| `liquidaci_n` | Liquidación | — |
| `obligaci_n_ambiental` | Obligación Ambiental | — |
| `tipo_de_documento_supervisor` | Tipo de documento supervisor | **descartada** |
| `nombre_supervisor` | Nombre supervisor | **descartada** |
| `n_mero_de_documento_ordenador_del_gasto` | Número de documento Ordenador del gasto | **descartada** |
| `tipo_de_documento_ordenador_del_gasto` | Tipo de documento Ordenador del gasto | **descartada** |
| `fecha_de_notificaci_n_de_prorrogaci_n` | Fecha de notificación de prorrogación | — |
| `proceso_de_compra` | Proceso de Compra | — |
| `id_contrato` | ID Contrato | — |
| `referencia_del_contrato` | Referencia del Contrato | — |
| `estado_contrato` | Estado Contrato | — |
| `espostconflicto` | EsPostConflicto | — |
| `puntos_del_acuerdo` | Puntos del Acuerdo | — |
| `dias_adicionados` | Dias adicionados | — |
| `direcci_n_de_ejecuci_n_del_contrato` | Dirección de ejecución del contrato | — |
| `pilares_del_acuerdo` | Pilares del Acuerdo | — |
| `urlproceso` | URLProceso | — |
| `nombre_representante_legal` | Nombre Representante Legal | **descartada** |
| `nacionalidad_representante_legal` | Nacionalidad Representante Legal | — |
| `saldo_vigencia` | Saldo Vigencia | — |
| `valor_pagado` | Valor Pagado | — |
| `domicilio_representante_legal` | Domicilio Representante Legal | — |
| `valor_amortizado` | Valor Amortizado | — |
| `tipo_de_identificaci_n_representante_legal` | Tipo de Identificación Representante Legal | — |
| `nombre_entidad` | Nombre Entidad | — |
| `identificaci_n_representante_legal` | Identificación Representante Legal | — |
| `fecha_inicio_liquidacion` | Fecha Inicio Liquidacion | — |
| `codigo_de_categoria_principal` | Codigo de Categoria Principal | — |
| `descripcion_del_proceso` | Descripcion del Proceso | — |
| `tipo_de_contrato` | Tipo de Contrato | — |
| `codigo_proveedor` | Codigo Proveedor | — |
| `saldo_cdp` | Saldo CDP | — |
| `modalidad_de_contratacion` | Modalidad de Contratacion | — |
| `justificacion_modalidad_de` | Justificacion Modalidad de Contratacion | — |

</details>

<details><summary><code>kgcd-kt7i</code> — SECOP II - Archivos Descarga Historico 2022: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nit_entidad` | NIT Entidad | **descartada** |
| `fecha_carga` | Fecha Carga | — |
| `entidad` | Entidad | — |
| `url_descarga_documento` | URL Descarga Documento | **descartada** |
| `nombre_archivo` | Nombre Documento | — |
| `descripci_n` | Descripción | — |
| `id_documento` | ID Documento | **descartada** |
| `tamanno_archivo` | Tamaño Documento | — |
| `n_mero_de_contrato` | Número de Contrato | — |
| `proceso` | Proceso | — |
| `extensi_n` | Extensión | — |

</details>

<details><summary><code>mfmm-jqmq</code> — SECOP II - Ejecución Contratos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombreplan` | Nombre del Plan | — |
| `porcentaje_de_avance_real` | Porcentaje de avance real | — |
| `referencia_de_articulos` | Referencia de articulos | — |
| `identificadorcontrato` | Identificador del Contrato | — |
| `unidad` | Unidad | — |
| `descripci_n` | Descripción | — |
| `fechacreacion` | Fecha Creacion | — |
| `tipoejecucion` | Tipo de Ejecucion | — |
| `cantidad_planeada` | Cantidad planeada | — |
| `cantidad_adjudicada` | Cantidad adjudicada | — |
| `estado_del_contrato` | Estado del contrato | — |
| `porcentajedeavanceesperado` | Porcentaje de Avance Esperado | — |
| `fechadeentregareal` | Fecha de Entrega Real | — |
| `cantidadporrecibir` | Cantidad por Recibir | — |
| `cantidadrecibida` | Cantidad Recibida | — |
| `fechadeentregaesperada` | Fecha de Entrega Esperada | — |

</details>

<details><summary><code>nbae-kzan</code> — SECOP II - Archivos Descarga Historico 2024: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_carga` | Fecha Carga | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `entidad` | Entidad | — |
| `extensi_n` | Extensión | — |
| `nombre_archivo` | Nombre Documento | — |
| `url_descarga_documento` | URL Descarga Documento | **descartada** |
| `n_mero_de_contrato` | Número de Contrato | — |
| `descripci_n` | Descripción | — |
| `tamanno_archivo` | Tamaño Documento | — |
| `id_documento` | ID Documento | **descartada** |
| `proceso` | Proceso | — |

</details>

<details><summary><code>p6dx-8zbt</code> — SECOP II - Procesos de Contratación: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `codigoproveedor` | CodigoProveedor | — |
| `departamento_entidad` | Departamento Entidad | — |
| `fecha_de_apertura_efectiva` | Fecha de Apertura Efectiva | — |
| `valor_total_adjudicacion` | Valor Total Adjudicacion | — |
| `ciudad_entidad` | Ciudad Entidad | — |
| `proveedores_con_invitacion` | Proveedores con Invitacion Directa | — |
| `fecha_de_ultima_publicaci` | Fecha de Ultima Publicación | — |
| `nombre_del_proveedor` | Nombre del Proveedor Adjudicado | **descartada** |
| `conteo_de_respuestas_a_ofertas` | Conteo de Respuestas a Ofertas | — |
| `proveedores_invitados` | Proveedores Invitados | — |
| `id_adjudicacion` | ID Adjudicacion | — |
| `departamento_proveedor` | Departamento Proveedor | — |
| `fecha_de_publicacion_del` | Fecha de Publicacion del Proceso | — |
| `fecha_de_recepcion_de` | Fecha de Recepcion de Respuestas | — |
| `fecha_de_publicacion_fase_1` | Fecha de Publicacion (Fase Seleccion Precalificacion) | — |
| `fecha_de_publicacion_fase_2` | Fecha de Publicacion (Fase Borrador) | — |
| `proveedores_que_manifestaron` | Proveedores que Manifestaron Interes | — |
| `estado_de_apertura_del_proceso` | Estado de Apertura del Proceso | — |
| `respuestas_al_procedimiento` | Respuestas al Procedimiento | — |
| `id_del_proceso` | ID del Proceso | — |
| `categorias_adicionales` | Categorias Adicionales | — |
| `unidad_de_duracion` | Unidad de Duracion | — |
| `descripci_n_del_procedimiento` | Descripción del Procedimiento | — |
| `respuestas_externas` | Respuestas Externas | — |
| `ordenentidad` | OrdenEntidad | — |
| `codigo_pci` | Entidad Centralizada | — |
| `estado_del_procedimiento` | Estado del Procedimiento | — |
| `ciudad_proveedor` | Ciudad Proveedor | — |
| `fecha_de_publicacion_fase` | Fecha de Publicacion (Fase Planeacion Precalificacion) | — |
| `fecha_de_publicacion_fase_3` | Fecha de Publicacion (Fase Seleccion) | — |
| `duracion` | Duracion | — |
| `estado_resumen` | Estado Resumen | — |
| `ppi` | PCI | — |
| `nit_entidad` | Nit Entidad | **descartada** |
| `tipo_de_contrato` | Tipo de Contrato | — |
| `referencia_del_proceso` | Referencia del Proceso | — |
| `proveedores_unicos_con` | Proveedores Unicos con Respuestas | — |
| `codigo_entidad` | Codigo Entidad | — |
| `fecha_adjudicacion` | Fecha Adjudicacion | — |
| `fase` | Fase | — |
| `id_estado_del_procedimiento` | ID Estado del Procedimiento | — |
| `entidad` | Entidad | — |
| `modalidad_de_contratacion` | Modalidad de Contratacion | — |
| `nombre_de_la_unidad_de` | Nombre de la Unidad de Contratación | **descartada** |
| `fecha_de_apertura_de_respuesta` | Fecha de Apertura de Respuesta | — |
| `adjudicado` | Adjudicado | — |
| `precio_base` | Precio Base | — |
| `nombre_del_procedimiento` | Nombre del Procedimiento | **descartada** |
| `ciudad_de_la_unidad_de` | Ciudad de la Unidad de Contratación | — |
| `justificaci_n_modalidad_de` | Justificación Modalidad de Contratación | — |
| `id_del_portafolio` | ID del Portafolio | — |
| `codigo_principal_de_categoria` | Codigo Principal de Categoria | — |
| `nit_del_proveedor_adjudicado` | NIT del Proveedor Adjudicado | **descartada** |
| `urlproceso` | URLProceso | — |
| `visualizaciones_del` | Visualizaciones del Procedimiento | — |
| `numero_de_lotes` | Numero de Lotes | — |
| `subtipo_de_contrato` | Subtipo de Contrato | — |
| `fecha_de_publicacion` | Fecha de Publicacion (Manifestacion de Interes) | — |
| `nombre_del_adjudicador` | Nombre del Adjudicador | **descartada** |

</details>

<details><summary><code>prdx-nxyp</code> — SECOP I - PAA Encabezado: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `localidad_paa` | Localidad PAA | — |
| `codigo_entidad` | Codigo Entidad | — |
| `ppto_total` | Ppto total | — |
| `fecha_ultima_actualizacion` | Fecha Ultima Actualizacion | — |
| `direccion_entidad` | Direccion Entidad | — |
| `telefono_entidad` | Telefono Entidad | **descartada** |
| `info_contacto` | Info Contacto | — |
| `limite_minima_cuantia` | Limite Minima Cuantia | — |
| `limite_menor_cuantia` | Limite Menor Cuantia | — |
| `departamento_paa` | Departamento PAA | — |
| `fecha_cargue` | Fecha Cargue | — |
| `perspectiva_estrategica` | Perspectiva Estrategica | — |
| `mision_y_vision` | Mision y Vision | — |
| `municipio_paa` | Municipio PAA | — |
| `nombre_entidad` | Nombre Entidad | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `identificador_paa` | Identificador PAA | — |
| `anno_paa` | Anno PAA | — |
| `codigo_municipio` | Codigo Municipio | — |

</details>

<details><summary><code>qddk-cgux</code> — SECOP I - Procesos de Compra Pública Historico: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `municipios_ejecucion` | Municipios Ejecucion | — |
| `numero_de_proceso` | Numero de Proceso | — |
| `departamento_entidad` | Departamento Entidad | — |
| `nombre_familia` | Nombre Familia | **descartada** |
| `ultima_actualizacion` | Ultima Actualizacion | — |
| `incluyebienesdecreto248` | IncluyeBienesDecreto248 | — |
| `sector_pliegos_tipo` | Sector pliegos tipo | — |
| `tipo_de_contrato` | Tipo De Contrato | — |
| `cumpledecreto248` | Cumple Decreto 248 | — |
| `tipo_identifi_del_contratista` | Tipo Identifi del Contratista | — |
| `punto_acuerdo_paz` | Punto Acuerdo Paz | — |
| `moneda` | Moneda | — |
| `id_sub_unidad_ejecutora` | ID Sub Unidad Ejecutora | — |
| `calificacion_definitiva` | Calificacion Definitiva | — |
| `proponentes_seleccionados` | Proponentes Seleccionados | — |
| `anno_cargue_secop` | Anno Cargue SECOP | — |
| `orden_entidad` | Orden Entidad | — |
| `fecha_liquidacion` | Fecha Liquidacion | — |
| `nombre_rubro` | Nombre Rubro | **descartada** |
| `valor_rubro` | Valor Rubro | — |
| `nom_razon_social_contratista` | Nom Razon Social Contratista | **descartada** |
| `identificacion_del_contratista` | Identificacion del Contratista | **descartada** |
| `nombre_grupo` | Nombre Grupo | **descartada** |
| `identific_representante_legal` | Identific Representante Legal | — |
| `cuantia_contrato` | Cuantia Contrato | — |
| `tiempo_adiciones_en_dias` | Tiempo Adiciones en Dias | — |
| `nombre_del_represen_legal` | Nombre del Represen Legal | **descartada** |
| `fecha_ini_ejec_contrato` | Fecha Ini Ejec Contrato | — |
| `valor_total_de_adiciones` | Valor Total de Adiciones | — |
| `nombre_sub_unidad_ejecutora` | Nombre Sub Unidad Ejecutora | **descartada** |
| `cumple_sentencia_t302` | Cumple Sentencia T302 | — |
| `tama_o_mipyme` | Tamaño Mipyme | — |
| `numero_de_contrato` | Numero de Contrato | — |
| `municipio_entidad` | Municipio Entidad | — |
| `tipo_doc_representante_legal` | Tipo Doc Representante Legal | — |
| `id_familia` | ID Familia | — |
| `valor_contrato_con_adiciones` | Valor Contrato con Adiciones | — |
| `pilar_acuerdo_paz` | Pilar Acuerdo Paz | — |
| `anno_firma_contrato` | Anno Firma Contrato | **descartada** |
| `objeto_del_contrato_a_la` | Objeto del Contrato a la Firma | — |
| `c_digo_de_la_entidad` | Código de la Entidad | — |
| `nivel_entidad` | Nivel Entidad | — |
| `id_modalidad` | ID Modalidad | — |
| `marcacion_adiciones` | Marcacion Adiciones | — |
| `id_regimen_de_contratacion` | ID Regimen de Contratacion | — |
| `pliegos_tipo` | Pliegos tipo | — |
| `id_clase` | ID Clase | — |
| `id_grupo` | ID Grupo | — |
| `nombre_regimen_de_contratacion` | Nombre Regimen de Contratacion | **descartada** |
| `causal_de_otras_formas_de` | Causal de Otras formas de Contratacion Directa | — |
| `modalidad_de_contratacion` | Modalidad de Contratacion | — |
| `id_objeto_a_contratar` | ID Objeto a Contratar | — |
| `uid` | UID | — |
| `fecha_de_cargue_en_el_secop` | Fecha de Cargue en el SECOP | — |
| `numero_de_constancia` | Numero de Constancia | — |
| `es_mipyme` | Es MiPyme | — |
| `rango_de_ejec_del_contrato` | Rango de Ejec del Contrato | — |
| `nombre_entidad` | Nombre Entidad | — |
| `fecha_fin_ejec_contrato` | Fecha Fin Ejec Contrato | — |
| `sexo_replegal` | Sexo RepLegal | **descartada** |
| `detalle_del_objeto_a_contratar` | Detalle del Objeto a Contratar | — |
| `nit_de_la_entidad` | NIT de la Entidad | **descartada** |
| `compromiso_presupuestal` | Compromiso Presupuestal | — |
| `es_postconflicto` | Es PostConflicto | — |
| `posicion_rubro` | Posicion Rubro | — |
| `cuantia_proceso` | Cuantia Proceso | — |
| `fecha_de_firma_del_contrato` | Fecha de Firma del Contrato | **descartada** |
| `tiempo_adiciones_en_meses` | Tiempo Adiciones en Meses | — |
| `nombre_clase` | Nombre Clase | — |
| `codigo_bpin` | Codigo BPIN | — |
| `dpto_y_muni_contratista` | Dpto y Muni Contratista | — |
| `plazo_de_ejec_del_contrato` | Plazo de Ejec del Contrato | — |
| `destino_gasto` | Destino gasto | — |
| `municipio_de_entrega` | Municipio de Entrega | — |
| `municipio_de_obtencion` | Municipio de Obtencion | — |
| `estado_del_proceso` | Estado del Proceso | — |
| `ruta_proceso_en_secop_i` | Ruta Proceso en SECOP I | — |
| `id_adjudicacion` | ID Adjudicacion | — |
| `objeto_a_contratar` | Objeto a Contratar | — |

</details>

<details><summary><code>qmzu-gj57</code> — SECOP II - Proveedores Registrados: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `espyme` | EsPyme | — |
| `sitio_web` | Sitio web | — |
| `municipio` | Municipio | — |
| `tipo_empresa` | Tipo Empresa | — |
| `nombre` | Nombre | **descartada** |
| `esta_activa` | Esta Activa | — |
| `es_entidad` | Es Entidad | — |
| `tama_o_entidad` | Tamaño Entidad | — |
| `nit` | NIT | **descartada** |
| `codigo_categoria_principal` | Codigo Categoria Principal | — |
| `nombre_representante_legal` | Nombre representante legal | **descartada** |
| `telefono` | Telefono | **descartada** |
| `correo_representante_legal` | Correo representante legal | **descartada** |
| `ubicacion` | Ubicación | — |
| `departamento` | Departamento | — |
| `telefono_representante_legal` | Telefono representante legal | **descartada** |
| `fecha_creacion` | Fecha Creación | — |
| `codigo` | Codigo | — |
| `descripcion_categoria_principal` | Descripcion Categoria Principal | — |
| `pais` | Pais | — |
| `direccion` | Direccion | — |
| `n_mero_doc_representante_legal` | Número doc representante legal | — |
| `tipo_doc_representante_legal` | Tipo doc representante legal | — |
| `fax` | Fax | **descartada** |
| `correo` | Correo | **descartada** |
| `es_grupo` | Es grupo | — |

</details>

<details><summary><code>rgxm-mmea</code> — Tienda Virtual del Estado Colombiano - Consolidado: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `entidad_obigada` | Entidad Obigada | — |
| `proveedor` | Proveedor | — |
| `rama_de_la_entidad` | Rama de la Entidad | — |
| `total` | Total | — |
| `id_entidad` | ID Entidad | — |
| `sector_de_la_entidad` | Sector de la Entidad | — |
| `agregacion` | Agregacion | — |
| `solicitud` | Solicitud | — |
| `nit_proveedor` | NIT Proveedor | **descartada** |
| `entidad` | Entidad | — |
| `identificador_de_la_orden` | Identificador de la Orden | — |
| `orden_de_la_entidad` | Orden de la Entidad | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `estado` | Estado | — |
| `ciudad` | Ciudad | — |
| `a_o` | Año | — |
| `actividad_economica_proveedor` | Actividad Economica Proveedor | — |
| `fecha_vence` | Fecha vence | — |
| `solicitante` | Solicitante | **descartada** |
| `fecha` | Fecha | — |
| `items` | Items | — |
| `espostconflicto` | EsPostconflicto | — |

</details>

<details><summary><code>rpmr-utcd</code> — SECOP Integrado: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `origen` | Origen | — |
| `tipo_documento_proveedor` | Tipo Documento Proveedor | **descartada** |
| `url_contrato` | URL Contrato | — |
| `documento_proveedor` | Documento Proveedor | **descartada** |
| `nom_raz_social_contratista` | Nom Raz Social Contratista | **descartada** |
| `objeto_a_contratar` | Objeto del contrato | — |
| `nombre_de_la_entidad` | Nombre de la Entidad | **descartada** |
| `tipo_de_contrato` | Tipo de Contrato | — |
| `municipio_entidad` | Municipio Entidad | — |
| `modalidad_de_contrataci_n` | Modalidad de Contratación | — |
| `nivel_entidad` | Nivel Entidad | — |
| `objeto_del_proceso` | Objeto del proceso | — |
| `nit_de_la_entidad` | NIT de la Entidad | **descartada** |
| `fecha_de_firma_del_contrato` | Fecha de Firma del Contrato | **descartada** |
| `valor_contrato` | Valor Contrato | — |
| `departamento_entidad` | Departamento Entidad | — |
| `fecha_inicio_ejecuci_n` | Fecha inicio ejecución | — |
| `codigo_entidad_en_secop` | Codigo Entidad en SECOP | — |
| `fecha_fin_ejecuci_n` | Fecha fin ejecución | — |
| `estado_del_proceso` | Estado del Proceso | — |
| `numero_del_contrato` | ID Contrato | — |
| `numero_de_proceso` | ID Proceso | — |

</details>

<details><summary><code>s484-c9k3</code> — SECOP - Convenios Interadministrativos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `departamento` | Departamento | — |
| `id_contrato` | ID Contrato | — |
| `nombre_entidad` | Nombre Entidad | — |
| `id_proceso` | ID Proceso | — |
| `numero_de_contrato` | Numero de Contrato | — |
| `anno_firma` | Anno firma | **descartada** |
| `origen_de_los_recursos` | Origen de los recursos | — |
| `tipo_contratista` | Tipo Contratista | — |
| `fecha_firma` | Fecha Firma | **descartada** |
| `fecha_fin_del_contrato` | Fecha Fin del Contrato | — |
| `fuente` | Fuente | — |
| `modalidad_contratacion` | Modalidad Contratacion | — |
| `justificacion_modalidad` | Justificacion modalidad | — |
| `link` | Link | — |
| `anno_cargue` | Anno cargue | — |
| `unspsc_id_clase` | UNSPSC ID Clase | — |
| `orden` | Orden | — |
| `objeto_contractual` | Objeto contractual | — |
| `estado_contrato` | Estado contrato | — |
| `contratista` | Contratista | — |
| `identificacion_contratista` | Identificacion Contratista | **descartada** |
| `tipo_de_contrato` | Tipo de Contrato | — |
| `fecha_cargue` | Fecha cargue | — |
| `valor_con_adiciones` | Valor con adiciones | — |
| `id_entidad` | ID Entidad | — |
| `fecha_inicio_del_contrato` | Fecha Inicio del Contrato | — |
| `municipio` | Municipio | — |

</details>

<details><summary><code>skc9-met7</code> — SECOP II - Compromisos Presupuestales: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `valor_a_liberar` | Valor a Liberar | — |
| `fecha_registro_item` | Fecha Registro Item | — |
| `balance_compromiso` | Saldo de compromisos CDP | — |
| `valor_item` | Saldo total comprometido | — |
| `estado_integraci_n_item` | Estado Compromiso | — |
| `balance_vigencia_futura` | Saldo de compromisos AVF | — |
| `id_contrato` | ID Contrato | — |
| `estado_integraci_n` | Ultima consulta al SIIF | — |
| `identificador_item` | Identificador Item | — |
| `c_digo_item` | Código Item | — |
| `identificador_nico` | Identificador Único | — |
| `tipo_de_compromiso` | Tipo de Compromiso | — |
| `referencia_contrato` | Referencia Contrato | — |
| `fecha_interfase` | Fecha de Consulta SIIF | — |

</details>

<details><summary><code>tauh-5jvn</code> — SECOP I - Proponentes: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `id_adjudicacion` | ID Adjudicacion | — |
| `tipo_doc_proponente` | Tipo Doc Proponente | — |
| `calificacion` | Calificacion | — |
| `fecha_publicacion_del_proceso` | Fecha Publicacion del Proceso | — |
| `num_doc_proponente` | Num Doc Proponente | — |
| `numero_contrato` | Numero Contrato | — |
| `proponente` | Proponente | — |
| `digito_verificaci_n_proponente` | Digito Verificación Proponente | — |
| `id_proceso` | ID Proceso | — |
| `adjudicado` | Adjudicado | — |

</details>

<details><summary><code>u8cx-r425</code> — SECOP II - Modificaciones a contratos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `marca_de_tiempo_cdc` | Marca de tiempo CDC | — |
| `fecha_de_aprobacion` | Fecha de aprobacion | — |
| `direccion_de_la_operacion` | Direccion de la operacion | — |
| `fecha_fin_contrato` | Fecha fin contrato | — |
| `identificador` | Identificador | — |
| `fecha_inicio_contrato` | Fecha inicio contrato | — |
| `fecha_version` | Fecha version | — |
| `codigo_bpin` | Codigo BPIN | — |
| `codigo_empresa_de_version` | Codigo empresa de version | — |
| `dias_extendidos` | Dias extendidos | — |
| `identificador_requerimiento` | Identificador Requerimiento Compra | — |
| `acta_de_liquidacion` | Acta de liquidacion | — |
| `fecha_fin_entrega` | Fecha fin entrega | — |
| `fecha_inicio_entrega` | Fecha inicio entrega | — |
| `fecha_fin_liquidacion` | Fecha fin liquidacion | — |
| `id_contrato` | ID Contrato | — |
| `fecha_de_carga` | Fecha de carga | — |
| `descripcion` | Descripcion | — |
| `nombre_aplicacion_creacion` | Nombre aplicacion creacion | **descartada** |
| `archivo_version_anterior` | Archivo version anterior del contrato | — |
| `fecha_creacion` | Fecha creacion | — |
| `metodo_pago` | Metodo pago | — |
| `version_anterior_del_contrato` | Version anterior del contrato | — |
| `codigo_empresa_creadora` | Codigo empresa creadora | — |
| `proposito_modificacion` | Proposito modificacion | — |
| `valor_modificacion` | Valor Modificacion | — |
| `fecha_inicio_liquidacion` | Fecha inicio liquidacion | — |
| `sustituto_version` | Sustituto version | — |
| `liquidacion` | Liquidacion | — |
| `numero_version` | Numero version | — |
| `estado_modificacion` | Estado modificacion | — |
| `a_o_bpin` | Año BPIN | — |
| `autor_version` | Autor version | — |
| `identificador_modificacion` | Identificador modificacion | — |
| `fuente_del_registro` | Fuente del registro | — |

</details>

<details><summary><code>u99c-7mfm</code> — SECOP II - Suspensiones de Contratos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_de_aprobacion` | Fecha de Aprobacion | — |
| `fecha_de_fin_del_contrato` | Fecha de Fin del Contrato | — |
| `proposito_de_la_modificacion` | Proposito de la modificacion | — |
| `id_contrato` | ID Contrato | — |
| `fecha_de_inicio_del_contrato` | Fecha de Inicio del Contrato | — |
| `tipo` | Tipo | — |
| `fecha_de_creacion` | Fecha de Creacion | — |

</details>

<details><summary><code>uymx-8p3j</code> — SECOP II - Plan de pagos: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_de_vencimiento` | Fecha de vencimiento | — |
| `plan_de_recepci_n` | Plan de recepción | — |
| `valor_neto` | Valor neto | — |
| `cufe` | CUFE | — |
| `fecha_de_emisi_n` | Fecha de emisión | — |
| `valor_total_de_la_factura` | Valor total de la factura | — |
| `valor_total` | Valor total | — |
| `fecha_de_recepci_n_original` | Fecha de recepción original | — |
| `fecha_de_entrega_original` | Fecha de Entrega original | — |
| `aprobado_por` | Aprobado por | — |
| `numero_de_factura` | Numero de factura | — |
| `codigo_entidad` | Codigo Entidad | — |
| `fecha_inicio_contrato` | Fecha inicio contrato | — |
| `nombre_proveedor` | Nombre proveedor | **descartada** |
| `nit_entidad` | NIT Entidad | **descartada** |
| `valor_neto_de_la_factura` | Valor neto de la factura | — |
| `fecha_estimada_de_pago` | Fecha estimada de pago | — |
| `fecha_real_de_pago` | Fecha real de pago | — |
| `tipo_documento_supervisor` | Tipo documento supervisor | **descartada** |
| `documento_proveedor` | Documento proveedor | **descartada** |
| `estado` | Estado | — |
| `fecha_de_emision` | Fecha de emision | — |
| `obligado_a_facturar_electr` | Obligado a facturar electrónicamente | — |
| `fecha_de_recepcion` | Fecha de recepcion | — |
| `notas` | Notas | — |
| `n_mero_de_radicaci_n` | Número de radicación | — |
| `valor_a_pagar` | Valor a pagar | — |
| `documento_supervisor` | Documento supervisor | **descartada** |
| `nombre_entidad` | Nombre Entidad | — |
| `nombre_supervisor` | Nombre supervisor | **descartada** |
| `id_del_contrato` | Id del Contrato | — |
| `compromiso_presupuestal` | Compromiso presupuestal | — |
| `referencia_contrato` | Referencia Contrato | — |
| `id_de_pago` | ID de pago | — |

</details>

<details><summary><code>wi7w-2nvm</code> — SECOPII - Ofertas Por Proceso: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `fecha_de_registro` | Fecha de Registro | — |
| `identificador_de_la_oferta` | Identificador de la Oferta | — |
| `referencia_de_la_oferta` | Referencia de la Oferta | — |
| `referencia_del_proceso` | Referencia del Proceso | — |
| `descripcion_del_procedimiento` | Descripcion del Procedimiento | — |
| `moneda` | Moneda | — |
| `valor_de_la_oferta` | Valor de la Oferta | — |
| `c_digo_entidad` | Código Entidad | — |
| `nit_del_proveedor` | NIT del Proveedor | **descartada** |
| `nombre_proveedor` | Nombre Proveedor | **descartada** |
| `c_digo_proveedor` | Código Proveedor | — |
| `entidad_compradora` | Entidad Compradora | — |
| `nit_entidad_compradora` | NIT Entidad Compradora | **descartada** |
| `invitacion_directa` | Invitacion Directa | — |
| `modalidad` | Modalidad | — |
| `id_del_proceso_de_compra` | ID del Proceso de Compra | — |

</details>

<details><summary><code>wwhe-4sq8</code> — SECOP II - Ubicaciones Adicionales: columnas</summary>

| Columna | Tipo observado | PII |
|---|---|---|
| `nombre_entidad` | Nombre Entidad | — |
| `nit_entidad` | NIT Entidad | **descartada** |
| `departamento_original` | Departamento Original | — |
| `ciudad_original` | Ciudad Original | — |
| `direcci_n_original` | Dirección Original | — |
| `direcci_n` | Dirección | — |
| `ciudad` | Ciudad | — |
| `departamento` | Departamento | — |
| `referencia_contrato` | Referencia Contrato | — |
| `id_contrato` | ID Contrato | — |
| `codigo_entidad` | Codigo Entidad | — |

</details>

## Fuentes sin catálogo legible por máquina

| Id | Nombre | URL | HTTP | Formato | Licencia | Frecuencia |
|---|---|---|---|---|---|---|
| dane-geoportal | Geoportal DANE — descargas del Marco Geoestadístico Nacional | [enlace](https://geoportal.dane.gov.co/) | 200 | SHP / GPKG / CSV dentro de ZIP | NO_VERIFICADO — el portal no declara licenci… | Anual (MGN) / decenal (CNPV) |
| igac-datos-abiertos-hub | IGAC — portal de datos abiertos (ArcGIS Hub) | [enlace](https://datos-abiertos-igac-igac-oit.hub.arcgis.com/) | 200 | Portal HTML + descargas | CC BY 4.0 / CC BY-SA 4.0 según el producto —… | Mensual (base catastral) |
| osm-geofabrik-colombia | OpenStreetMap — extracto de Colombia (Geofabrik) | [enlace](https://download.geofabrik.de/south-america/colombia.html) | 200 | PBF / SHP.ZIP / GPKG.ZIP | ODbL 1.0 | Diaria |

**Geoportal DANE — descargas del Marco Geoestadístico Nacional — pendiente de verificar:**

- Obtener la URL directa y estable del ZIP del MGN del año en curso (el portal usa descargas por formulario).
- Confirmar la licencia de uso y la atribución exigida.
- Verificar el CRS de entrega (se espera EPSG:4686) y la codificación de los CSV.

**IGAC — portal de datos abiertos (ArcGIS Hub) — pendiente de verificar:**

- Localizar la URL directa del paquete departamental de la Base Catastral Pública del corte vigente.
- Confirmar si la licencia del paquete catastral es CC BY-SA 4.0 (como asume PLAN.md §2) o CC BY 4.0 (como declaran los datasets espejados en datos.gov.co).

**OpenStreetMap — extracto de Colombia (Geofabrik) — pendiente de verificar:**

- Decidir el subconjunto de etiquetas a ingerir (osm2pgsql style) para no cargar todo el país.

## OpenStreetMap — extracto de Colombia (Geofabrik)

Corte: **2026-09-20** · Licencia: **ODbL 1.0 (Open Database License)**

| Archivo | Formato | Tamaño | Última modificación | Reanudable | MD5 |
|---|---|---|---|---|---|
| [colombia-latest-free.gpkg.zip](https://download.geofabrik.de/south-america/colombia-latest-free.gpkg.zip) | gpkg | 757.2 MB | 2026-09-21 | sí | — |
| [colombia-latest-free.shp.zip](https://download.geofabrik.de/south-america/colombia-latest-free.shp.zip) | shp | 737.3 MB | 2026-09-21 | sí | — |
| [colombia-latest.osm.pbf](https://download.geofabrik.de/south-america/colombia-latest.osm.pbf) | pbf | 314.4 MB | 2026-09-20 | sí | `e55fbc2186df…` |

> El `.pbf` no se descarga en la Fase 0: solo se registra el descriptor.

