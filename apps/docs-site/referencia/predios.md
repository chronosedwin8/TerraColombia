---
title: GET /parcels/:npn
description: Ficha completa de un predio por Número Predial Nacional, con procedencia y advertencias.
---

# `GET /parcels/:npn`

Ficha completa de un predio.

```
GET /geo/v1/parcels/:npn
```

**Ámbito requerido:** `read:parcels`

## Formato del NPN {#formato-del-npn}

El **Número Predial Nacional** tiene 30 dígitos y cada tramo significa algo:

```
08  001  01  02  00  00  0001  0001  0  00  00  0000
│   │    │   │   │   │   │     │     │  │   │   └─ unidad (4)
│   │    │   │   │   │   │     │     │  │   └───── piso (2)
│   │    │   │   │   │   │     │     │  └───────── edificio (2)
│   │    │   │   │   │   │     │     └──────────── condición (1)
│   │    │   │   │   │   │     └────────────────── terreno (4)
│   │    │   │   │   │   └──────────────────────── manzana o vereda (4)
│   │    │   │   │   └──────────────────────────── barrio (2)
│   │    │   │   └──────────────────────────────── comuna (2)
│   │    │   └──────────────────────────────────── sector (2)
│   │    └──────────────────────────────────────── zona: 01 urbano, 02 rural
│   └───────────────────────────────────────────── municipio (3)
└───────────────────────────────────────────────── departamento (2)
```

Reglas prácticas:

- Los dos primeros tramos juntos son el **código DIVIPOLA del municipio** (`08001`).
- Si los últimos cuatro tramos están en ceros (`0`, `00`, `00`, `0000`), el código se refiere al
  **predio completo**. Si no, a una **unidad de propiedad horizontal** dentro de un edificio.
- Se acepta el **código anterior de 20 dígitos**: la API lo completa con los valores neutros del
  predio matriz.
- Se ignoran espacios, puntos, guiones y barras: `08-001-01-02-...` funciona igual.

## Parámetros de consulta

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `geometry` | string | `full` | `none`, `centroid` o `full` |
| `cutDate` | string | snapshot activo | Corte concreto, `AAAA-MM-DD` |
| `includeBuildings` | boolean | `true` | Incluir el detalle de construcciones |
| `includeRaw` | boolean | `false` | Incluir `attrs`, los campos crudos de la fuente sin transformar |

## Petición

::: code-group

```bash [curl]
curl -s "https://api.terracolombia.co/geo/v1/parcels/080010102000000010001000000000" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const { data, meta } = await geoapi('/parcels/080010102000000010001000000000');

if (data === null) {
  // Puede ser un municipio sin cobertura: no es un error.
  console.log(meta.coverage?.message);
}
```

:::

## Respuesta

```json
{
  "data": {
    "npn": "080010102000000010001000000000",
    "npnOld": "08001010200000001000",
    "npnParts": {
      "department": "08",
      "municipality": "001",
      "zone": "01",
      "sector": "02",
      "commune": "00",
      "neighborhood": "00",
      "blockOrVereda": "0001",
      "parcel": "0001",
      "condition": "0",
      "building": "00",
      "floor": "00",
      "unit": "0000"
    },
    "isHorizontalProperty": false,
    "matrixNpn": "080010102000000010001000000000",

    "muniCode": "08001",
    "muniName": "Barranquilla",
    "deptCode": "08",
    "deptName": "Atlántico",
    "zone": "01",
    "zoneLabel": "Urbano",
    "sector": "02",
    "neighborhoodName": "El Prado",
    "blockOrVeredaName": "NO_DISPONIBLE",

    "address": "CL 72 # 41-20",
    "areaGeomM2": 812.5,
    "areaReportedM2": 800,
    "builtAreaM2": 340,
    "economicUse": "Habitacional",
    "cadastralValue": 285000000,
    "valuationYear": 2026,

    "centroid": [-74.7964, 10.9878],
    "bbox": [-74.7968, 10.9875, -74.796, 10.9881],
    "geometry": {
      "type": "MultiPolygon",
      "coordinates": [[[[-74.7968, 10.9875], [-74.796, 10.9875], [-74.796, 10.9881], [-74.7968, 10.9881], [-74.7968, 10.9875]]]]
    },
    "h3R9": "89285a2a3b7ffff",

    "buildings": [
      { "id": "C-1", "floors": 2, "builtAreaM2": 240, "use": "Residencial", "attrs": {} },
      { "id": "C-2", "floors": 1, "builtAreaM2": 100, "use": "Depósito", "attrs": {} }
    ],

    "homogeneousZones": [
      { "kind": "fisica", "code": "ZHF-014", "label": "Topografía plana, servicios completos" },
      { "kind": "geoeconomica", "code": "ZHG-207", "label": "NO_DISPONIBLE" }
    ],

    "snapshotId": "snap_igac_2026_07",
    "validFrom": "2026-07-31",
    "validTo": null,
    "attrs": null
  },
  "meta": {
    "sources": [
      {
        "datasetId": "igac-catastro-terreno",
        "source": "IGAC",
        "name": "Base Catastral Pública — capa de terrenos",
        "cutDate": "2026-07-31",
        "license": "CC-BY-SA-4.0",
        "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0",
        "url": "https://www.datos.gov.co/",
        "synthetic": false
      },
      {
        "datasetId": "igac-catastro-construccion",
        "source": "IGAC",
        "name": "Base Catastral Pública — capa de construcciones",
        "cutDate": "2026-07-31",
        "license": "CC-BY-SA-4.0",
        "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0",
        "url": null,
        "synthetic": false
      }
    ],
    "cutDate": "2026-07-31",
    "coverage": {
      "muniCode": "08001",
      "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)",
      "isIgac": true,
      "status": "full",
      "availableLayers": [],
      "message": null
    },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": [
      "El área medida (812,5 m²) difiere del área declarada (800 m²) en 1,6 %. Publicamos las dos cifras sin ajustarlas."
    ]
  }
}
```

## Campos

### Identificación

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `npn` | string | Número Predial Nacional de 30 dígitos |
| `npnOld` | `Maybe<string>` | Código anterior de 20 dígitos, si la fuente lo trae |
| `npnParts` | objeto | El NPN descompuesto por tramos |
| `isHorizontalProperty` | boolean | `true` si es una unidad dentro de un edificio |
| `matrixNpn` | string | NPN del predio matriz (el mismo si no es PH) |

### Medidas

| Campo | Unidad | Descripción |
| --- | --- | --- |
| `areaGeomM2` | m² | Área **medida** sobre la geometría, calculada en EPSG:9377 |
| `areaReportedM2` | m² | Área **declarada** en el registro alfanumérico del catastro |
| `builtAreaM2` | m² | Área construida sumada |

::: warning Las dos áreas pueden no coincidir
La API publica las dos **sin ajustarlas** y avisa en `meta.warnings` cuando difieren más de un
5 %. La diferencia puede venir de la escala de la cartografía, de una actualización pendiente o
de un error de la fuente. Para linderos exactos hace falta un levantamiento topográfico.
:::

### Datos económicos

| Campo | Descripción |
| --- | --- |
| `cadastralValue` | Avalúo catastral en COP, o `"NO_DISPONIBLE"` |
| `valuationYear` | Vigencia del avalúo |

::: danger avalúo catastral ≠ valor comercial
El avalúo catastral es un **valor fiscal** determinado por la autoridad catastral para calcular
el impuesto predial. Habitualmente está por debajo del valor de mercado y se actualiza por
procesos catastrales, no por el mercado.

Si muestras esta cifra, **muestra también la advertencia**. Es una regla del producto y de los
términos de uso.
:::

### Geometría

| Campo | Descripción |
| --- | --- |
| `centroid` | `[lng, lat]` en EPSG:4326 |
| `bbox` | `[minLng, minLat, maxLng, maxLat]` |
| `geometry` | `MultiPolygon` en EPSG:4326. `null` si pediste `geometry=none` |
| `h3R9` | Celda H3 de resolución 9 que contiene el centroide |

### `attrs`

Con `includeRaw=true`, `attrs` trae los campos del registro alfanumérico **tal como llegan de la
fuente**, con sus nombres originales. Sirve para auditar y para casos que el modelo normalizado
no cubre.

Las columnas con datos personales se descartan en la ingesta y **nunca** aparecen aquí.

## Predio no encontrado

```json
{
  "error": {
    "code": "PARCEL_NOT_FOUND",
    "message": "No hay un predio con ese código predial en los cortes que tenemos. Verifica los dígitos o busca por dirección.",
    "details": { "npn": "080010102000000019999000000000" }
  }
}
```

Antes de decirle al usuario «no existe», comprueba la cobertura del municipio con
[`GET /municipalities/:code`](/referencia/municipios): puede que el predio exista y el municipio
no esté en la base abierta del IGAC.

## Municipio sin cobertura

Responde `200` con `data: null` y la explicación en `meta.coverage`. Ver
[`COVERAGE_MISSING`](/guia/errores#coverage-missing).

## Consultar un corte anterior

```bash
curl -s "https://api.terracolombia.co/geo/v1/parcels/080010102000000010001000000000?cutDate=2026-05-31" \
  -H "X-API-Key: $TC_API_KEY"
```

Los cortes disponibles están en `cadastral.availableCutDates` de la ficha del municipio. Para ver
qué cambió entre dos cortes, usa
[`GET /parcels/:npn/history`](/referencia/predios-historial).

## Endpoints relacionados

- [`GET /parcels/:npn/context`](/referencia/predios-contexto) — qué hay alrededor
- [`GET /parcels/:npn/history`](/referencia/predios-historial) — qué ha cambiado
- [`POST /suitability`](/referencia/aptitud) — semáforo de aptitud por uso
- [`POST /reports`](/referencia/informes) — informe territorial en PDF

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `INVALID_NPN` | 400 | El código no tiene 30 ni 20 dígitos, o la zona no es `01` ni `02` |
| `PARCEL_NOT_FOUND` | 404 | Estructura válida, pero no está en los cortes cargados |
| `UNAUTHORIZED` | 401 | Llave ausente o inválida |
| `FORBIDDEN` | 403 | Falta el ámbito `read:parcels` |
| `QUOTA_EXCEEDED` | 402 | Se agotaron las consultas detalladas del plan |
