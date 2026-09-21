---
title: GET /municipalities/:code
description: Ficha del municipio, gestor catastral y estado real de la cobertura de datos.
---

# `GET /municipalities/:code`

Ficha de un municipio. **Es el endpoint que hay que consultar antes de prometerle datos
catastrales a un usuario**, porque dice quién es el gestor catastral y qué tenemos realmente.

```
GET /geo/v1/municipalities/:code
```

**Ámbito requerido:** `read:parcels`

## Parámetros de ruta

| Parámetro | Descripción |
| --- | --- |
| `code` | Código DIVIPOLA de 5 dígitos (`08638`). Los dos primeros son el departamento |

## Parámetros de consulta

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `geometry` | string | `none` | `none`, `centroid` o `full`. El límite municipal completo es pesado |
| `cutDate` | string | snapshot activo | Fecha de corte concreta, `AAAA-MM-DD` |

## Petición

::: code-group

```bash [curl]
curl -s "https://api.terracolombia.co/geo/v1/municipalities/08638?geometry=centroid" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const { data, meta } = await geoapi('/municipalities/08638?geometry=centroid');

if (data.coverage.status !== 'full') {
  mostrarAviso(data.coverage.message);
}
```

:::

## Respuesta: municipio con catastro del IGAC

```json
{
  "data": {
    "code": "08638",
    "name": "Sabanalarga",
    "deptCode": "08",
    "deptName": "Atlántico",
    "centroid": [-74.9217, 10.6317],
    "bbox": [-75.058, 10.517, -74.812, 10.742],
    "geometry": null,
    "areaKm2": 431.7,
    "population": {
      "total": 104512,
      "households": 29340,
      "dwellings": 31207,
      "urbanShare": 0.87,
      "sourceYear": 2024
    },
    "cadastral": {
      "manager": "Instituto Geográfico Agustín Codazzi (IGAC)",
      "isIgac": true,
      "parcelCount": 42318,
      "urbanParcelCount": 28904,
      "ruralParcelCount": 13414,
      "buildingCount": 39702,
      "lastCutDate": "2026-07-31",
      "availableCutDates": ["2026-05-31", "2026-06-30", "2026-07-31"]
    },
    "context": {
      "schools": 128,
      "healthFacilities": 31,
      "protectedAreaKm2": 12.4,
      "ethnicTerritoryKm2": 0,
      "elevationMeanM": 95,
      "slopeMeanPct": 4.2
    },
    "coverage": {
      "muniCode": "08638",
      "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)",
      "isIgac": true,
      "status": "full",
      "availableLayers": [
        "predios", "construcciones", "manzanas", "nomenclatura",
        "población", "colegios", "salud", "vías", "suelos", "amenazas", "áreas protegidas"
      ],
      "message": null
    },
    "potAvailable": false,
    "potNote": "No tenemos la cartografía del POT de este municipio. Consulte la Secretaría de Planeación municipal."
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
        "datasetId": "dane-mgn-manzanas",
        "source": "DANE",
        "name": "Marco Geoestadístico Nacional — manzanas censales",
        "cutDate": "2024-12-31",
        "license": "datos-abiertos-co",
        "attribution": "Fuente: DANE, MGN 2024",
        "url": "https://geoportal.dane.gov.co/",
        "synthetic": false
      }
    ],
    "cutDate": "2026-07-31",
    "coverage": { "muniCode": "08638", "isIgac": true, "status": "full", "availableLayers": [], "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

## Respuesta: municipio con catastro descentralizado

Este es el caso que hay que manejar bien. La respuesta sigue siendo `200`:

```json
{
  "data": {
    "code": "11001",
    "name": "Bogotá, D.C.",
    "deptCode": "11",
    "deptName": "Bogotá, D.C.",
    "centroid": [-74.0721, 4.711],
    "bbox": [-74.5, 3.73, -73.98, 4.84],
    "geometry": null,
    "areaKm2": 1775.0,
    "population": {
      "total": 7968095,
      "households": 2618540,
      "dwellings": 2731204,
      "urbanShare": 0.99,
      "sourceYear": 2024
    },
    "cadastral": {
      "manager": "Unidad Administrativa Especial de Catastro Distrital",
      "isIgac": false,
      "parcelCount": null,
      "urbanParcelCount": null,
      "ruralParcelCount": null,
      "buildingCount": null,
      "lastCutDate": null,
      "availableCutDates": []
    },
    "context": {
      "schools": 2814,
      "healthFacilities": 1962,
      "protectedAreaKm2": 620.4,
      "ethnicTerritoryKm2": 0,
      "elevationMeanM": 2640,
      "slopeMeanPct": 11.8
    },
    "coverage": {
      "muniCode": "11001",
      "cadastralManager": "Unidad Administrativa Especial de Catastro Distrital",
      "isIgac": false,
      "status": "none",
      "availableLayers": ["población", "colegios", "salud", "vías", "suelos", "amenazas", "áreas protegidas"],
      "message": "Este municipio lo gestiona la Unidad Administrativa Especial de Catastro Distrital, que no publica su catastro como dato abierto o todavía no lo hemos integrado. Sí tenemos para esta zona: población, colegios, salud, vías, suelos, amenazas, áreas protegidas."
    },
    "potAvailable": false,
    "potNote": "No tenemos la cartografía del POT de este municipio. Consulte la Secretaría de Planeación municipal."
  },
  "meta": { }
}
```

Fíjate: `cadastral.*` viene en `null`, pero `population` y `context` **sí traen datos**. La
API no se queda muda: entrega lo que sí tiene y explica lo que falta.

## Estados de cobertura

| `status` | Significa | Qué debe hacer tu interfaz |
| --- | --- | --- |
| `full` | Tenemos el catastro completo de ese corte | Nada especial |
| `partial` | Tenemos parte; lo que falta viene marcado como no disponible | Avisar de que hay campos incompletos |
| `none` | No tenemos catastro de ese municipio | **Mostrar `message` y ofrecer `availableLayers`** |
| `unknown` | No sabemos quién es el gestor | Tratar como `none`, y avisarnos |

## Campos

### `cadastral`

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `manager` | string | Entidad responsable del catastro del municipio |
| `isIgac` | boolean \| null | `true` si es jurisdicción del IGAC |
| `parcelCount` | número \| null | Predios cargados en el corte activo |
| `urbanParcelCount` / `ruralParcelCount` | número \| null | Desglose por zona |
| `buildingCount` | número \| null | Construcciones registradas |
| `lastCutDate` | string \| null | Corte más reciente cargado |
| `availableCutDates` | string[] | Cortes que se pueden consultar, para comparaciones |

### `population`

Proviene del Marco Geoestadístico Nacional del DANE agregado al límite municipal. `sourceYear`
dice el año de la proyección: no es un censo actualizado.

### `context`

Conteos y promedios de las capas de contexto dentro del límite municipal. Los que no tenemos
vienen en `null`.

### `potAvailable` y `potNote`

No existe un repositorio nacional completo de POT. Cuando `potAvailable` es `false`, `potNote`
trae el texto que se le debe mostrar al usuario.

## Listar todos los municipios

```bash
curl -s "https://api.terracolombia.co/geo/v1/municipalities?deptCode=08&limit=50" \
  -H "X-API-Key: $TC_API_KEY"
```

Acepta `deptCode`, `coverageStatus`, `isIgac`, `q`, `limit` y `cursor`. Devuelve la misma ficha
sin los bloques `context` ni `population` detallados, para que la colección no pese.

## Para una pantalla de selección de municipio

Filtra por cobertura y dile al usuario qué va a encontrar **antes** de que haga clic:

```js
const { data } = await geoapi('/municipalities?deptCode=08&limit=50');

const conCatastro = data.filter((m) => m.coverage.status === 'full');
const sinCatastro = data.filter((m) => m.coverage.status !== 'full');
// Muestra los dos grupos, no escondas el segundo.
```

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `NOT_FOUND` | 404 | El código DIVIPOLA no existe |
| `VALIDATION` | 400 | El código no tiene 5 dígitos |
| `UNAUTHORIZED` | 401 | Llave ausente o inválida |
| `FORBIDDEN` | 403 | Falta el ámbito `read:parcels` |
