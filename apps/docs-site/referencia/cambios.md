---
title: POST /changes/compare
description: Diferencias de la base catastral entre dos cortes, dentro de un ámbito.
---

# `POST /changes/compare`

Qué cambió en un área entre dos cortes de la base catastral.

```
POST /geo/v1/changes/compare
Content-Type: application/json
```

**Ámbito requerido:** `read:changes` · **Planes:** Business, Enterprise · **Costo:** 8 créditos

## Cuerpo

```json
{
  "scope": { "kind": "municipality", "muniCode": "08638" },
  "fromCutDate": "2026-05-31",
  "toCutDate": "2026-07-31",
  "changeTypes": ["created", "removed", "geometry_changed", "building_added"],
  "limit": 500
}
```

| Campo | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `scope` | objeto | — | El mismo `scope` de [`/areas/analyze`](/referencia/areas-analizar) |
| `fromCutDate` | string | — | Corte inicial, `AAAA-MM-DD`. Obligatorio |
| `toCutDate` | string | — | Corte final, `AAAA-MM-DD`. Obligatorio |
| `changeTypes` | string[] | todos | `created`, `removed`, `attrs_changed`, `geometry_changed`, `building_added` |
| `limit` | entero | 500 | Cambios devueltos (1 a 5.000) |

Los cortes disponibles vienen en `cadastral.availableCutDates` de
[`GET /municipalities/:code`](/referencia/municipios).

## Petición

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/changes/compare" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "kind": "municipality", "muniCode": "08638" },
    "fromCutDate": "2026-05-31",
    "toCutDate": "2026-07-31",
    "limit": 100
  }'
```

## Respuesta

```json
{
  "data": {
    "scopeLabel": "Municipio de Sabanalarga (08638)",
    "fromCutDate": "2026-05-31",
    "toCutDate": "2026-07-31",
    "summary": {
      "parcelsAtFrom": 42106,
      "parcelsAtTo": 42318,
      "netChange": 212,
      "created": 389,
      "removed": 177,
      "attrsChanged": 1284,
      "geometryChanged": 96,
      "buildingsAdded": 421,
      "areaCreatedM2": 1284000,
      "areaRemovedM2": 942000,
      "builtAreaAddedM2": 58400
    },
    "byType": [
      { "changeType": "created", "changeLabel": "Predios nuevos", "count": 389 },
      { "changeType": "removed", "changeLabel": "Predios que dejaron de aparecer", "count": 177 },
      { "changeType": "attrs_changed", "changeLabel": "Cambio de atributos", "count": 1284 },
      { "changeType": "geometry_changed", "changeLabel": "Cambio de geometría", "count": 96 },
      { "changeType": "building_added", "changeLabel": "Construcciones nuevas", "count": 421 }
    ],
    "changes": [
      {
        "npn": "086380101000000010451000000000",
        "changeType": "created",
        "changeLabel": "Predio nuevo",
        "detail": "El NPN aparece por primera vez en el corte 2026-06-30.",
        "cutDate": "2026-06-30",
        "areaGeomM2": 412.8,
        "centroid": [-74.9241, 10.6288],
        "fields": [],
        "geometryIoU": null
      },
      {
        "npn": "086380101000000010023000000000",
        "changeType": "geometry_changed",
        "changeLabel": "Cambio de geometría",
        "detail": "El índice de superposición entre los dos cortes es 0,71: probable englobe o desenglobe.",
        "cutDate": "2026-07-31",
        "areaGeomM2": 4820.4,
        "centroid": [-74.9231, 10.6302],
        "fields": [{ "field": "areaGeomM2", "before": 2340.8, "after": 4820.4 }],
        "geometryIoU": 0.71
      }
    ],
    "geojson": {
      "type": "FeatureCollection",
      "features": []
    }
  },
  "page": { "limit": 100, "returned": 100, "cursor": "eyJuIjoiMDg2MzgwMTAxIn0", "hasMore": true },
  "meta": {
    "sources": [
      { "datasetId": "igac-catastro-terreno", "source": "IGAC", "name": "Base Catastral Pública — capa de terrenos", "cutDate": "2026-07-31", "license": "CC-BY-SA-4.0", "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0", "url": "https://www.datos.gov.co/", "synthetic": false }
    ],
    "cutDate": "2026-07-31",
    "coverage": { "muniCode": "08638", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": [
      "Un cambio entre cortes refleja lo que publicó el gestor catastral, no necesariamente un hecho ocurrido en terreno en esa fecha."
    ]
  }
}
```

## Cómo se detecta cada cambio

| `changeType` | Método |
| --- | --- |
| `created` | El NPN está en el corte B y no en el A |
| `removed` | El NPN está en el corte A y no en el B |
| `attrs_changed` | Comparación campo a campo del registro alfanumérico del mismo NPN |
| `geometry_changed` | Índice de superposición (intersección sobre unión) menor que 0,98 |
| `building_added` | Comparación de la capa de construcciones del mismo predio |

## Interpretar los resultados

::: warning Esto describe el dato, no su causa
- **`removed` no es demolición ni venta.** Suele ser un englobe, un desenglobe o una corrección
  cartográfica. Los englobes y desenglobes cambian el NPN, así que el predio «desaparece» y
  aparecen otros.
- **`created` no es construcción.** Casi siempre es el otro lado de un desenglobe.
- **`netChange` no es crecimiento urbano.** Es la diferencia de conteos, y un desenglobe de un
  predio en diez suma nueve al neto sin que se haya construido nada.
- **La fecha es la del corte**, no la del hecho en terreno. Los procesos catastrales se publican
  con rezago.
:::

Para detectar **crecimiento real**, el indicador menos engañoso es `buildingsAdded` cruzado con
`builtAreaAddedM2`: una construcción nueva registrada sí implica algo construido, aunque con el
rezago de la actualización catastral.

## Pares de englobe y desenglobe

Un englobe aparece como varios `removed` y un `created` con área similar a la suma. La API no
afirma la relación —no tiene cómo probarla— pero sí la señala cuando la geometría lo respalda:

```json
{
  "npn": "086380101000000010451000000000",
  "changeType": "created",
  "changeLabel": "Predio nuevo",
  "detail": "El NPN aparece por primera vez en el corte 2026-06-30. Su geometría coincide en un 97 % con la unión de 3 predios que dejaron de aparecer en el mismo corte: posible englobe.",
  "relatedNpns": [
    "086380101000000010023000000000",
    "086380101000000010024000000000",
    "086380101000000010025000000000"
  ],
  "relationConfidence": 0.97
}
```

`relationConfidence` es la superposición geométrica, no una certeza jurídica. Preséntalo como
«posible englobe», que es como está redactado el `detail`.

## Paginación

Los cambios se paginan por cursor, igual que `POST /parcels/query`. El bloque `summary` y
`byType` traen los **totales completos**, no solo los de la página: sirven para el tablero sin
tener que recorrerlo todo.

## Exportar

Para bajarlo entero, usa [`POST /reports`](/referencia/informes) con `kind: "change"`:

```json
{
  "kind": "change",
  "level": "completo",
  "format": "xlsx",
  "scope": { "kind": "municipality", "muniCode": "08638" },
  "fromCutDate": "2026-05-31",
  "toCutDate": "2026-07-31"
}
```

Genera el Informe de Cambio Territorial con las tablas separadas por tipo de cambio y la hoja
`FUENTES_Y_LICENCIA`.

## Alertas

Los planes Business y Enterprise pueden suscribirse a cambios en un área guardada: cuando entra
un corte nuevo, se envía un aviso con el resumen. Se configura en **Proyectos → Alertas**, no por
esta API.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | `fromCutDate` posterior o igual a `toCutDate`; un corte que no existe para ese municipio |
| `NOT_FOUND` | 404 | No hay snapshots cargados para el ámbito |
| `AREA_TOO_LARGE` | 413 | El ámbito supera el límite del plan |
| `INSUFFICIENT_CREDITS` | 402 | Faltan créditos (cuesta 8) |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El plan no incluye cambio territorial |
| `TIMEOUT` | 504 | Comparación demasiado grande. Acota el ámbito o usa `POST /reports` |
