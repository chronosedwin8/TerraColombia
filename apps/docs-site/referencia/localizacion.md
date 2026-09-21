---
title: POST /location-intel
description: Mapa de oportunidad por celda H3 para una plantilla de negocio, con pesos editables y desglose por factor.
---

# `POST /location-intel`

«¿Dónde abro mi X?». Puntúa celdas de la rejilla H3 según una plantilla de negocio con pesos que
tú controlas.

```
POST /geo/v1/location-intel
Content-Type: application/json
```

**Ámbito requerido:** `analyze:location` · **Planes:** Business, Enterprise · **Costo:** 20 créditos

::: info Por qué celdas H3
Todas las celdas de una misma resolución tienen **el mismo tamaño**, así que las comparaciones
son justas. Comparar barrios directamente no lo es: un barrio grande acumula más población que
uno pequeño solo por ser grande.
:::

## Cuerpo

```json
{
  "templateId": "colegio",
  "scope": { "kind": "municipality", "muniCode": "08638" },
  "resolution": 8,
  "weights": { "poblacion_edad_escolar": 0.4, "oferta_educativa_existente": 0.3, "accesibilidad_vial": 0.2, "predios_grandes_disponibles": 0.1 },
  "thresholds": { "poblacion_edad_escolar": { "gte": 200 } },
  "limit": 200
}
```

| Campo | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `templateId` | string | — | Plantilla de negocio. Ver [Plantillas](#plantillas) |
| `scope` | objeto | — | El mismo `scope` de [`/areas/analyze`](/referencia/areas-analizar) |
| `resolution` | `7` \| `8` \| `9` | 8 | Resolución H3 |
| `weights` | objeto | los de la plantilla | Pesos por indicador, 0 a 1. Se renormalizan |
| `thresholds` | objeto | — | Descarta celdas que no cumplan un mínimo o un máximo |
| `limit` | entero | 1000 | Celdas devueltas (1 a 5.000), las mejor puntuadas |

### Resoluciones

| Resolución | Área por celda | Para qué |
| --- | --- | --- |
| 7 | ~5,2 km² | Comparar zonas de una ciudad entera o de una región |
| 8 | ~0,74 km² | **Por omisión.** Comparar sectores dentro de un municipio |
| 9 | ~0,10 km² (10 ha) | Afinar dentro de un sector |

## Plantillas {#plantillas}

```bash
curl -s "https://api.terracolombia.co/geo/v1/location-intel/templates" \
  -H "X-API-Key: $TC_API_KEY"
```

```json
{
  "data": [
    {
      "id": "colegio",
      "label": "Colegio",
      "description": "Dónde hay demanda educativa desatendida y predios aptos para un establecimiento.",
      "indicators": [
        { "indicator": "poblacion_edad_escolar", "label": "Población de 5 a 17 años", "defaultWeight": 0.4, "direction": "higher_is_better", "formula": "normalización 0–100 de la población de 5 a 17 años de la celda", "sourceDatasetIds": ["dane-mgn-manzanas", "dane-cnpv-2018"] },
        { "indicator": "oferta_educativa_existente", "label": "Oferta educativa existente", "defaultWeight": 0.3, "direction": "lower_is_better", "formula": "cupos ofertados en un radio de 1.500 m sobre población en edad escolar", "sourceDatasetIds": ["men-establecimientos-educativos"] },
        { "indicator": "accesibilidad_vial", "label": "Accesibilidad vial", "defaultWeight": 0.2, "direction": "higher_is_better", "formula": "100 − min(100, distancia media a vía secundaria o superior / 20)", "sourceDatasetIds": ["osm-colombia-vias"] },
        { "indicator": "predios_grandes_disponibles", "label": "Predios grandes sin construir", "defaultWeight": 0.1, "direction": "higher_is_better", "formula": "conteo de predios sin construcción de más de 3.000 m² en la celda, normalizado", "sourceDatasetIds": ["igac-catastro-terreno"] }
      ]
    },
    { "id": "retail_barrio", "label": "Comercio de barrio", "description": "…", "indicators": [] },
    { "id": "clinica", "label": "Centro de salud", "description": "…", "indicators": [] },
    { "id": "bodega", "label": "Bodega logística", "description": "…", "indicators": [] },
    { "id": "vivienda", "label": "Proyecto de vivienda", "description": "…", "indicators": [] }
  ],
  "meta": { }
}
```

Esta llamada **no consume créditos**: pídela para construir tu interfaz de deslizadores antes de
lanzar el análisis.

## Petición

::: code-group

```bash [curl]
curl -s -X POST "https://api.terracolombia.co/geo/v1/location-intel" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "colegio",
    "scope": { "kind": "municipality", "muniCode": "08638" },
    "resolution": 8,
    "limit": 50
  }'
```

```js [fetch]
const { data, meta } = await geoapi('/location-intel', {
  method: 'POST',
  body: JSON.stringify({
    templateId: 'colegio',
    scope: { kind: 'municipality', muniCode: '08638' },
    resolution: 8,
    weights: { poblacion_edad_escolar: 0.5, oferta_educativa_existente: 0.3, accesibilidad_vial: 0.2 },
    limit: 50,
  }),
});
```

:::

## Respuesta

```json
{
  "data": {
    "templateId": "colegio",
    "templateLabel": "Colegio",
    "resolution": 8,
    "cellAreaKm2": 0.7373,
    "cellsEvaluated": 618,
    "cellsReturned": 50,
    "cellsDiscardedByThreshold": 412,
    "weightsUsed": {
      "poblacion_edad_escolar": 0.5,
      "oferta_educativa_existente": 0.3,
      "accesibilidad_vial": 0.2
    },
    "cells": [
      {
        "h3": "8826c4a1a1fffff",
        "score": 84,
        "rank": 1,
        "centroid": [-74.9198, 10.6341],
        "muniCode": "08638",
        "factors": [
          {
            "indicator": "poblacion_edad_escolar",
            "label": "Población de 5 a 17 años",
            "score": 91,
            "rawValue": 842,
            "unit": "personas",
            "weight": 0.5,
            "direction": "higher_is_better",
            "formula": "normalización 0–100 de la población de 5 a 17 años de la celda",
            "sourceDatasetIds": ["dane-mgn-manzanas"],
            "explanation": "Es una de las celdas con más población escolar del municipio.",
            "flag": "ok"
          },
          {
            "indicator": "oferta_educativa_existente",
            "label": "Oferta educativa existente",
            "score": 78,
            "rawValue": 0.31,
            "unit": "cupos por persona en edad escolar",
            "weight": 0.3,
            "direction": "lower_is_better",
            "formula": "cupos ofertados en un radio de 1.500 m sobre población en edad escolar",
            "sourceDatasetIds": ["men-establecimientos-educativos"],
            "explanation": "Hay 0,31 cupos por cada persona en edad escolar: la oferta cubre menos de un tercio de la demanda potencial.",
            "flag": "ok"
          }
        ],
        "candidateParcels": 6
      }
    ],
    "geojson": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "id": "8826c4a1a1fffff",
          "geometry": { "type": "Polygon", "coordinates": [[]] },
          "properties": { "h3": "8826c4a1a1fffff", "score": 84, "rank": 1 }
        }
      ]
    }
  },
  "meta": {
    "sources": [
      { "datasetId": "dane-mgn-manzanas", "source": "DANE", "name": "Marco Geoestadístico Nacional — manzanas censales", "cutDate": "2024-12-31", "license": "datos-abiertos-co", "attribution": "Fuente: DANE, MGN 2024", "url": "https://geoportal.dane.gov.co/", "synthetic": false },
      { "datasetId": "men-establecimientos-educativos", "source": "MEN", "name": "Directorio de establecimientos educativos", "cutDate": "2026-03-31", "license": "datos-abiertos-co", "attribution": "Fuente: Ministerio de Educación Nacional", "url": "https://www.datos.gov.co/", "synthetic": false }
    ],
    "cutDate": "2026-08-01",
    "coverage": { "muniCode": "08638", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

`data.geojson` viene listo para añadirlo como fuente a MapLibre y pintar el mapa de calor por
`score`.

## Umbrales

```json
{
  "thresholds": {
    "poblacion_edad_escolar": { "gte": 200 },
    "accesibilidad_vial": { "gte": 40 }
  }
}
```

Los umbrales se aplican sobre el **valor crudo** de cada indicador y **descartan** la celda
entera. `cellsDiscardedByThreshold` dice cuántas se cayeron: es una cifra que conviene mostrar,
porque un umbral demasiado estricto puede dejar el mapa casi vacío sin que el usuario entienda
por qué.

## Predios candidatos

`candidateParcels` es el número de predios dentro de la celda que cumplen los criterios físicos
de la plantilla (área mínima, sin construir, etc.). Para listarlos, cruza con
[`POST /parcels/query`](/referencia/predios-consulta) usando la geometría de la celda:

```json
{
  "scope": { "municipality": "08638" },
  "where": { "area_m2": { "gte": 3000 }, "has_building": false },
  "within": { "type": "Polygon", "coordinates": [[]] },
  "sort": "area_m2:desc",
  "limit": 50
}
```

::: warning Que un predio aparezca no significa que esté en venta
La API no tiene información de mercado: no sabe si un predio está disponible, ni a qué precio, ni
si es apto legalmente. Eso hay que verificarlo con Planeación municipal y con un estudio de
títulos.
:::

## Pesos editables en vivo

El caso de uso es un panel con deslizadores. Dos formas de hacerlo:

**Recalcular en el servidor** (exacto, cuesta créditos cada vez):

```js
const analizar = (weights) => geoapi('/location-intel', {
  method: 'POST',
  body: JSON.stringify({ templateId, scope, resolution, weights, limit: 500 }),
});
```

**Recalcular en el cliente** (instantáneo, gratis, y suficiente para explorar): los `factors[]`
de cada celda traen el `score` de cada indicador, así que el puntaje compuesto se recalcula sin
volver a llamar.

```js
function recompute(cell, weights) {
  const total = Object.values(weights).reduce((a, w) => a + w, 0) || 1;
  const sum = cell.factors.reduce((acc, f) => {
    if (f.score === null) return acc;
    return acc + f.score * ((weights[f.indicator] ?? 0) / total);
  }, 0);
  return Math.round(sum);
}
```

Llama al servidor una vez con `limit` alto, deja que el usuario juegue con los deslizadores en el
cliente, y vuelve a llamar solo cuando cambie el ámbito, la plantilla o la resolución.

## Lo que este endpoint no hace

- **No decide por ti.** Devuelve celdas puntuadas con su desglose; el criterio es tuyo.
- **No conoce el mercado.** No hay arriendos, ni ventas, ni tráfico peatonal medido, ni
  competencia real más allá de lo que esté en las fuentes abiertas.
- **No garantiza viabilidad legal.** Una celda con puntaje alto puede estar en suelo de
  protección. Cruza siempre con [`POST /suitability`](/referencia/aptitud) y con el POT.
- **No pondera la calidad del dato.** Si OpenStreetMap tiene poca cobertura en una zona, los
  indicadores basados en POI la subestiman. Los `warnings` lo advierten cuando se detecta.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Plantilla desconocida, resolución no admitida, peso o umbral sobre un indicador que no existe en la plantilla |
| `AREA_TOO_LARGE` | 413 | El ámbito supera el límite del plan |
| `INSUFFICIENT_CREDITS` | 402 | Faltan créditos (cuesta 20) |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El plan no incluye localización de negocio |
| `TIMEOUT` | 504 | Ámbito muy grande en resolución 9. Sube a resolución 8 o acota el ámbito |
