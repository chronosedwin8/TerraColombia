---
title: POST /areas/analyze
description: Tablero completo de una zona definida por polígono, radio, municipio o isócrona.
---

# `POST /areas/analyze`

Tablero completo de una zona: predios, población, equipamientos, suelos, amenazas, ordenamiento y
relieve, agregados.

```
POST /geo/v1/areas/analyze
Content-Type: application/json
```

**Ámbito requerido:** `analyze:areas` · **Planes:** Pro, Business, API, Enterprise

## Definir el ámbito

Cuatro formas de decir «esta zona»:

::: code-group

```json [Polígono]
{
  "scope": {
    "kind": "polygon",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[-74.81, 10.98], [-74.78, 10.98], [-74.78, 11.0], [-74.81, 11.0], [-74.81, 10.98]]]
    }
  }
}
```

```json [Radio]
{
  "scope": { "kind": "radius", "center": [-74.7964, 10.9878], "radiusM": 1500 }
}
```

```json [Municipio]
{
  "scope": { "kind": "municipality", "muniCode": "08638" }
}
```

```json [Isócrona]
{
  "scope": { "kind": "isochrone", "center": [-74.7964, 10.9878], "minutes": 15, "mode": "walk" }
}
```

:::

| `kind` | Campos | Límites |
| --- | --- | --- |
| `polygon` | `geometry`: `Polygon` o `MultiPolygon` en EPSG:4326 | Área según el plan |
| `radius` | `center`: `[lng, lat]`, `radiusM`: 1 a 50.000 | |
| `municipality` | `muniCode`: DIVIPOLA de 5 dígitos | |
| `isochrone` | `center`, `minutes`: 1 a 60, `mode`: `walk` o `drive` | |

## Cuerpo completo

```json
{
  "scope": { "kind": "radius", "center": [-74.7964, 10.9878], "radiusM": 1500 },
  "sections": ["parcels", "population", "education", "health", "commerce", "soils", "hazards", "relief"],
  "cutDate": "2026-07-31",
  "async": false
}
```

| Campo | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `scope` | objeto | — | Obligatorio |
| `sections` | string[] | todas | `parcels`, `population`, `education`, `health`, `commerce`, `soils`, `hazards`, `protected`, `relief`, `pot`, `accessibility` |
| `cutDate` | string | snapshot activo | `AAAA-MM-DD` |
| `async` | boolean | automático | Fuerza la ejecución en cola |

## Petición

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/areas/analyze" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "kind": "radius", "center": [-74.7964, 10.9878], "radiusM": 1500 },
    "sections": ["parcels", "population", "education", "health"]
  }'
```

## Respuesta

```json
{
  "data": {
    "scopeLabel": "Radio de 1.500 m alrededor de -74,7964 / 10,9878",
    "areaKm2": 7.07,
    "municipalities": [{ "code": "08001", "name": "Barranquilla", "overlapPct": 100 }],

    "parcels": {
      "count": 4218,
      "areaTotalM2": 3120400,
      "areaMedianM2": 312.5,
      "builtAreaTotalM2": 1840200,
      "withBuilding": 3902,
      "withoutBuilding": 316,
      "byZone": { "urbano": 4218, "rural": 0 },
      "byEconomicUse": [
        { "value": "Habitacional", "count": 3410, "areaM2": 2180000 },
        { "value": "Comercial", "count": 492, "areaM2": 540400 },
        { "value": "Lote urbanizable", "count": 316, "areaM2": 400000 }
      ],
      "cadastralValueTotal": 892400000000,
      "cadastralValueMedian": 148000000
    },

    "population": {
      "total": 24180,
      "households": 6912,
      "dwellings": 7240,
      "schoolAge": 4530,
      "densityPerKm2": 3420,
      "ageBands": { "0-4": 1580, "5-17": 4530, "18-59": 14620, "60+": 3450 }
    },

    "education": {
      "count": 21,
      "bySector": { "Oficial": 9, "No oficial": 12 },
      "enrollmentTotal": 12840,
      "studentsPerSchoolAgePopulation": 2.83,
      "nearestDistanceM": 120
    },

    "health": {
      "count": 14,
      "byLevel": { "Nivel 1": 11, "Nivel 2": 2, "Nivel 3": 1 },
      "nearestDistanceM": 340
    },

    "relief": { "elevationMeanM": 14, "elevationMinM": 3, "elevationMaxM": 41, "slopeMeanPct": 2.8, "slopeMaxPct": 18.2 }
  },
  "meta": {
    "sources": [
      { "datasetId": "igac-catastro-terreno", "source": "IGAC", "name": "Base Catastral Pública — capa de terrenos", "cutDate": "2026-07-31", "license": "CC-BY-SA-4.0", "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0", "url": "https://www.datos.gov.co/", "synthetic": false },
      { "datasetId": "dane-mgn-manzanas", "source": "DANE", "name": "Marco Geoestadístico Nacional — manzanas censales", "cutDate": "2024-12-31", "license": "datos-abiertos-co", "attribution": "Fuente: DANE, MGN 2024", "url": "https://geoportal.dane.gov.co/", "synthetic": false }
    ],
    "cutDate": "2026-07-31",
    "coverage": { "muniCode": "08001", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": [
      "La población se agrega por manzana o sección censal que intersecta el ámbito; no es un conteo exacto de habitantes dentro del polígono."
    ]
  }
}
```

## Cómo se cuenta

| Regla | Detalle |
| --- | --- |
| **Predios** | Entra el predio que **intersecta** el ámbito, y se cuenta completo. Las áreas son las del predio entero, no la parte que cae dentro |
| **Población** | Se agregan las manzanas o secciones censales que intersectan. Una manzana parcial entra completa |
| **Equipamientos** | Solo los que caen dentro del ámbito (puntos) |
| **Suelos y amenazas** | `overlapPct` es el porcentaje del **área del ámbito** cubierto por cada categoría |
| **Relieve** | Media, mínimo y máximo sobre el modelo digital de elevación recortado al ámbito |

::: warning Los conteos son del intersecta, no del contiene
Si esto importa para tu caso (por ejemplo, para repartir población proporcionalmente), tendrás
que hacer el reparto tú con las geometrías. La API prefiere una regla simple y declarada a un
reparto que parezca preciso y no lo sea.
:::

## Área grande: ejecución asíncrona

Por encima de **5 km²** el análisis se encola automáticamente:

```json
{
  "data": { "jobId": "job_01JQZX8K4T2M3N4P", "status": "queued", "progress": 0, "estimatedSeconds": 22 },
  "meta": { }
}
```

Sigue el progreso por SSE:

```js
const events = new EventSource(`${API}/jobs/job_01JQZX8K4T2M3N4P/events?key=${KEY}`);
events.addEventListener('progress', (e) => setProgress(JSON.parse(e.data).progress));
events.addEventListener('done', (e) => {
  const { data, meta } = JSON.parse(e.data);
  events.close();
});
events.addEventListener('error', () => events.close());
```

O consulta el resultado cuando termine:

```bash
curl -s "https://api.terracolombia.co/geo/v1/jobs/job_01JQZX8K4T2M3N4P" \
  -H "X-API-Key: $TC_API_KEY"
```

Un análisis asíncrono de más de 5 km² consume **10 créditos** (`area_analysis_large`).

## Área demasiado grande

```json
{
  "error": {
    "code": "AREA_TOO_LARGE",
    "message": "El área que dibujaste (742,30 km²) supera el límite de tu plan (100 km²). Dibuja un área más pequeña o mejora tu plan.",
    "details": { "area": 742.3, "limit": 100 }
  }
}
```

Límites por plan en [Cuotas y planes](/guia/cuotas-y-planes). El techo absoluto, sea cual sea el
plan, es **2.000 km²** por petición.

## Isócronas

`kind: "isochrone"` calcula el área alcanzable en `minutes` minutos, caminando o en carro, sobre
la malla vial de OpenStreetMap.

::: warning Las isócronas son aproximadas
Se calculan sobre la topología de la red vial con velocidades medias por tipo de vía. **No
modelan tráfico, semáforos, sentidos de circulación en todos los casos, ni el estado real de la
vía.** Sirven para comparar zonas entre sí, no para prometer un tiempo de viaje.
:::

La isócrona devuelta va en `data.scopeGeometry` para que puedas dibujarla.

## Comparar varias zonas

No hay un endpoint de comparación: haz una llamada por zona y compara del lado tuyo. Las cifras
son comparables porque se calculan con las mismas reglas y sobre el mismo corte.

Para comparar zonas **del mismo tamaño**, usa [`POST /location-intel`](/referencia/localizacion),
que trabaja sobre celdas H3 de área idéntica.

## Exportar el tablero

```json
{
  "kind": "area",
  "level": "completo",
  "format": "xlsx",
  "scope": { "kind": "radius", "center": [-74.7964, 10.9878], "radiusM": 1500 }
}
```

Ver [Informes y exportación](/referencia/informes).

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Ámbito mal formado, geometría inválida, `minutes` o `radiusM` fuera de rango |
| `AREA_TOO_LARGE` | 413 | El área supera el límite del plan |
| `INSUFFICIENT_CREDITS` | 402 | No hay créditos para un análisis grande |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El plan no incluye análisis de zona |
| `TIMEOUT` | 504 | Análisis síncrono que superó 30 s. Usa `async: true` |
