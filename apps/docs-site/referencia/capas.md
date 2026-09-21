---
title: GET /layers
description: Catálogo de capas disponibles, sus clases, leyendas, fuentes y el glosario.
---

# `GET /layers`

Catálogo de todo lo que la API tiene cargado: capas, clases, leyendas, fuentes y glosario.

```
GET /geo/v1/layers
```

**Ámbito requerido:** `read:context`

Es el endpoint que hay que consultar **al arrancar tu aplicación**: construye tu selector de
capas, tus leyendas y tus listas de filtros a partir de aquí, y no se te quedarán desfasados
cuando añadamos una capa o cambie una clase.

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `muniCode` | string | — | Devuelve solo las capas con datos en ese municipio |
| `include` | string | `layers` | `layers`, `glossary`, `sources`, `all` |
| `withClasses` | boolean | `true` | Incluir las clases realmente presentes en el snapshot |

## Petición

```bash
curl -s "https://api.terracolombia.co/geo/v1/layers?muniCode=08638&include=all" \
  -H "X-API-Key: $TC_API_KEY"
```

## Respuesta

```json
{
  "data": {
    "layers": [
      {
        "id": "parcel",
        "label": "Predios",
        "description": "Terrenos de la base catastral pública del IGAC.",
        "geometryType": "MultiPolygon",
        "datasetId": "igac-catastro-terreno",
        "minZoom": 14,
        "maxZoom": 22,
        "tileable": true,
        "glossaryIds": ["npn", "destino_economico", "avaluo_catastral"],
        "classes": [],
        "legend": {
          "kind": "categorical",
          "property": "economic_use",
          "entries": [
            { "value": "Habitacional", "label": "Habitacional", "color": "#2a78d6" },
            { "value": "Comercial", "label": "Comercial", "color": "#eb6834" },
            { "value": "Industrial", "label": "Industrial", "color": "#4a3aa7" },
            { "value": "Lote urbanizable", "label": "Lote urbanizable", "color": "#1baf7a" },
            { "value": "Agropecuario", "label": "Agropecuario", "color": "#008300" }
          ]
        },
        "coverage": { "muniCode": "08638", "status": "full", "featureCount": 42318 },
        "cutDate": "2026-07-31"
      },
      {
        "id": "road",
        "label": "Vías",
        "description": "Malla vial de OpenStreetMap.",
        "geometryType": "MultiLineString",
        "datasetId": "osm-colombia-vias",
        "minZoom": 8,
        "maxZoom": 22,
        "tileable": true,
        "glossaryIds": [],
        "classes": [
          { "value": "motorway", "label": "Autopista", "count": 0 },
          { "value": "trunk", "label": "Troncal", "count": 42 },
          { "value": "primary", "label": "Primaria", "count": 186 },
          { "value": "secondary", "label": "Secundaria", "count": 412 },
          { "value": "tertiary", "label": "Terciaria", "count": 908 },
          { "value": "residential", "label": "Residencial", "count": 3241 }
        ],
        "legend": {
          "kind": "categorical",
          "property": "class",
          "entries": [
            { "value": "trunk", "label": "Troncal", "color": "#0b0b0b", "width": 4 },
            { "value": "primary", "label": "Primaria", "color": "#52514e", "width": 3 },
            { "value": "secondary", "label": "Secundaria", "color": "#898781", "width": 2 }
          ]
        },
        "coverage": { "muniCode": "08638", "status": "full", "featureCount": 4789 },
        "cutDate": "2026-08-01"
      },
      {
        "id": "hazard",
        "label": "Amenazas",
        "description": "Amenaza por movimientos en masa e inundación, a escala regional o nacional.",
        "geometryType": "MultiPolygon",
        "datasetId": "sgc-amenaza-movimientos-masa",
        "minZoom": 8,
        "maxZoom": 22,
        "tileable": true,
        "glossaryIds": ["amenaza"],
        "classes": [
          { "value": "movimiento_en_masa", "label": "Movimiento en masa", "count": 34 },
          { "value": "inundacion", "label": "Inundación", "count": 12 }
        ],
        "legend": {
          "kind": "ordinal",
          "property": "level",
          "entries": [
            { "value": "baja", "label": "Baja", "color": "#cde2fb" },
            { "value": "media", "label": "Media", "color": "#5598e7" },
            { "value": "alta", "label": "Alta", "color": "#184f95" }
          ]
        },
        "coverage": { "muniCode": "08638", "status": "partial", "featureCount": 46 },
        "cutDate": "2024-06-30",
        "warning": "Las capas de amenaza provienen de estudios a escala regional o nacional. Sirven para orientar decisiones preliminares y no sustituyen los estudios de detalle exigidos para licencias."
      }
    ],

    "glossary": [
      {
        "id": "npn",
        "term": "Número Predial Nacional (NPN)",
        "plain": "Es la \"cédula\" del predio: un código de 30 dígitos que lo identifica de forma única en todo el país.",
        "detail": "Cada tramo del código dice algo: departamento, municipio, si es urbano o rural, sector, comuna, barrio, manzana o vereda, el terreno, y si es una unidad dentro de un edificio, también el piso y la unidad.",
        "source": "IGAC, Resolución de nomenclatura predial"
      }
    ],

    "sources": [
      {
        "datasetId": "igac-catastro-terreno",
        "source": "IGAC",
        "name": "Base Catastral Pública — capa de terrenos",
        "cutDate": "2026-07-31",
        "license": "CC-BY-SA-4.0",
        "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0",
        "url": "https://www.datos.gov.co/",
        "synthetic": false,
        "frequency": "mensual",
        "shareAlike": true
      }
    ]
  },
  "meta": {
    "sources": [],
    "cutDate": "2026-08-01",
    "coverage": { "muniCode": "08638", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

## Campos de una capa

| Campo | Descripción |
| --- | --- |
| `id` | Identificador estable. Es el que se usa en `layers=` de `/nearby` y en la ruta de teselas |
| `label` / `description` | Textos en español para la interfaz |
| `geometryType` | Tipo de geometría GeoJSON |
| `datasetId` | Dataset de origen. Cruzar con `sources[]` |
| `minZoom` / `maxZoom` | Zooms a los que tiene sentido dibujarla |
| `tileable` | `true` si se sirve como [tesela vectorial](/referencia/teselas) |
| `glossaryIds` | Términos del glosario que aplican a esta capa |
| `classes` | Valores reales presentes en el snapshot, con su conteo |
| `legend` | Leyenda sugerida, con colores accesibles |
| `coverage` | Estado y número de objetos en el municipio consultado |
| `cutDate` | Fecha de corte de la capa |
| `warning` | Advertencia que debe acompañar a la capa, si la tiene |

## `classes` viene del dato, no de una lista fija

Los valores de `classes` se calculan sobre el snapshot activo, con su conteo. Consecuencias
útiles:

- No ofreces al usuario filtros que no van a devolver nada.
- Puedes ordenar los filtros por frecuencia.
- Si una fuente introduce un valor nuevo, aparece solo.

Por eso `withClasses=true` es el valor por omisión, aunque cueste un poco más: una lista de
filtros desfasada es peor que una llamada más.

## Leyendas

Los colores de `legend` vienen de una paleta validada para visión con deficiencia de color y para
impresión en blanco y negro. Puedes usarlos tal cual o ignorarlos, pero si los cambias:

::: warning El color nunca debe ser el único canal
Acompaña siempre el color con una etiqueta de texto y, en impresión, con una trama. Un mapa donde
«amenaza alta» y «amenaza baja» solo se distinguen por el color es inaccesible.
:::

| `legend.kind` | Significa |
| --- | --- |
| `categorical` | Valores sin orden: destino económico, tipo de vía |
| `ordinal` | Valores ordenados: nivel de amenaza, clase agrológica |
| `continuous` | Rango numérico: pendiente, densidad |

## El glosario

Con `include=glossary` o `include=all` viene el glosario completo, el mismo que está publicado en
[la página de glosario](/guia/glosario) y el mismo que usan la web y los informes.

Úsalo para poner *tooltips* sobre los términos técnicos de tu interfaz. `glossaryIds` de cada capa
dice qué términos aplican.

## Construir un selector de capas

```js
const { data } = await geoapi(`/layers?muniCode=${muniCode}&include=all`);

const disponibles = data.layers.filter((l) => l.coverage.featureCount > 0);
const vacias = data.layers.filter((l) => l.coverage.featureCount === 0);

// Muestra las vacías deshabilitadas, con el motivo. No las escondas:
// "no tenemos esta capa aquí" es información útil.
```

## Cacheable

El catálogo cambia solo cuando se despliega una versión nueva o entra un snapshot. Trae `ETag` y
`Cache-Control` largo: cachéalo en tu cliente por horas y revalida con `If-None-Match`.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | `muniCode` mal formado o `include` desconocido |
| `NOT_FOUND` | 404 | El municipio no existe |
| `FORBIDDEN` | 403 | Falta el ámbito `read:context` |
