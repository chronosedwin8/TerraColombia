---
title: POST /parcels/query
description: DSL de consulta de predios - filtros alfanuméricos, filtros espaciales de proximidad, contención, bbox, orden y paginación por cursor.
---

# `POST /parcels/query`

El buscador avanzado. Combina filtros alfanuméricos con filtros espaciales en un DSL validado.

```
POST /geo/v1/parcels/query
Content-Type: application/json
```

**Ámbito requerido:** `query:parcels` · **Planes:** Pro, Business, API, Enterprise

## El ejemplo canónico

Lotes urbanos de más de 1.000 m² en Sabanalarga, a menos de 300 m de una vía primaria o troncal y
a menos de 800 m de un colegio:

::: code-group

```bash [curl]
curl -s -X POST "https://api.terracolombia.co/geo/v1/parcels/query" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "municipality": "08638" },
    "where": {
      "zone": "urbano",
      "area_m2": { "gte": 1000 },
      "economic_use": ["Lote urbanizable", "Lote no urbanizable"]
    },
    "near": [
      { "layer": "road", "class": ["primary", "trunk"], "max_m": 300 },
      { "layer": "school", "max_m": 800 }
    ],
    "sort": "area_m2:desc",
    "limit": 100,
    "geometry": "centroid"
  }'
```

```js [fetch]
const { data, page, meta } = await geoapi('/parcels/query', {
  method: 'POST',
  body: JSON.stringify({
    scope: { municipality: '08638' },
    where: {
      zone: 'urbano',
      area_m2: { gte: 1000 },
      economic_use: ['Lote urbanizable', 'Lote no urbanizable'],
    },
    near: [
      { layer: 'road', class: ['primary', 'trunk'], max_m: 300 },
      { layer: 'school', max_m: 800 },
    ],
    sort: 'area_m2:desc',
    limit: 100,
    geometry: 'centroid',
  }),
});
```

:::

## Estructura del DSL

```ts
{
  scope:    { department?, municipality?, cutDate? },  // obligatorio
  where:    { … },                                      // filtros alfanuméricos
  near:     [ { layer, class?, max_m, invert? } ],      // filtros de proximidad
  within:   GeoJsonGeometry,                            // contención en un polígono
  bbox:     [minLng, minLat, maxLng, maxLat],
  sort:     "campo:asc|desc",
  limit:    100,
  cursor:   "…",
  geometry: "none" | "centroid" | "full"
}
```

## `scope` (obligatorio)

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `department` | string(2) | Código DANE del departamento |
| `municipality` | string(5) | Código DIVIPOLA del municipio |
| `cutDate` | string | `AAAA-MM-DD`; por omisión, el snapshot activo |

**Se exige `department` o `municipality`.** Es deliberado: sin ámbito, una consulta sería un
barrido nacional sobre decenas de millones de predios. Si lo omites, la API responde:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "La consulta tiene campos inválidos.",
    "details": {
      "issues": [
        { "path": "scope", "message": "Se requiere department o municipality en scope (evita barridos nacionales)" }
      ]
    }
  }
}
```

## `where`: filtros alfanuméricos

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `zone` | `"urbano"` \| `"rural"` | Zona del predio |
| `area_m2` | rango numérico | Área del terreno |
| `built_area_m2` | rango numérico | Área construida |
| `economic_use` | string[] (máx. 30) | Destino económico. Coincidencia exacta |
| `cadastral_value` | rango numérico | Avalúo catastral en COP |
| `floors` | rango numérico | Número de pisos de la construcción más alta |
| `has_building` | boolean | `true`: con construcción; `false`: lote sin construir |
| `sector` | string(≤4) | Código de sector |
| `neighborhood` | string(≤4) | Código de barrio |
| `block_or_vereda` | string(≤8) | Código de manzana o vereda |
| `address_like` | string(≤200) | Búsqueda difusa sobre la dirección normalizada |
| `homogeneous_zone` | string[] (máx. 30) | Códigos de zona homogénea |

### Rangos numéricos

```json
{ "area_m2": { "gte": 1000, "lte": 5000 } }
```

| Operador | Significa |
| --- | --- |
| `eq` | igual a |
| `gte` | mayor o igual que |
| `lte` | menor o igual que |
| `gt` | estrictamente mayor que |
| `lt` | estrictamente menor que |

Un rango vacío (`{}`) es un error de validación: probablemente querías omitir el campo.

::: warning Filtrar por `cadastral_value`
Filtras por un **valor fiscal**, no por precio de mercado. Un predio con avalúo bajo no es
necesariamente barato. Ver [avalúo catastral](/guia/glosario#avaluo_catastral).
:::

## `near`: filtros de proximidad

```json
{
  "near": [
    { "layer": "road", "class": ["primary", "trunk"], "max_m": 300 },
    { "layer": "school", "max_m": 800 },
    { "layer": "hazard", "class": ["inundacion"], "max_m": 200, "invert": true }
  ]
}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `layer` | enum | `road`, `school`, `health_facility`, `poi`, `protected_area`, `hazard`, `urban_perimeter` |
| `class` | string[] (máx. 30) | Subclase dentro de la capa. Opcional |
| `max_m` | entero | Distancia máxima en metros (1 a 20.000) |
| `invert` | boolean | `false` (por omisión): incluye los que cumplen. `true`: **excluye** los que cumplen |

Los filtros `near` se combinan con **Y lógico**: el predio debe cumplir todos. Máximo 6 por
consulta.

`invert: true` es la forma de decir «lejos de»: el ejemplo de arriba excluye los predios que
estén a menos de 200 m de una zona de amenaza de inundación.

### Valores de `class` por capa

| Capa | `class` habituales |
| --- | --- |
| `road` | `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`, `unclassified` |
| `school` | `Oficial`, `No oficial` |
| `health_facility` | `Nivel 1`, `Nivel 2`, `Nivel 3` |
| `poi` | `comercio`, `educacion`, `salud`, `financiero`, `transporte`, `recreacion`, `gobierno` |
| `hazard` | `inundacion`, `movimiento_en_masa`, `sismica` |
| `protected_area` | Categoría RUNAP |

La lista viva está en [`GET /layers`](/referencia/capas), que devuelve las clases realmente
presentes en el snapshot activo.

## `within` y `bbox`: filtros espaciales

```json
{
  "within": {
    "type": "Polygon",
    "coordinates": [[[-74.81, 10.98], [-74.78, 10.98], [-74.78, 11.0], [-74.81, 11.0], [-74.81, 10.98]]]
  }
}
```

- `within` acepta `Polygon` o `MultiPolygon` en EPSG:4326.
- El predio entra si **intersecta** la geometría, no hace falta que esté contenido.
- `bbox` es la versión rápida cuando te basta un rectángulo. Ver
  [Paginación y bbox](/guia/paginacion-y-cache#filtrar-por-bbox).
- Se pueden combinar: `bbox` recorta primero (barato) y `within` afina después.

## `sort`

| Valor | Ordena por |
| --- | --- |
| `area_m2:desc` \| `area_m2:asc` | Área del terreno |
| `built_area_m2:desc` \| `:asc` | Área construida |
| `cadastral_value:desc` \| `:asc` | Avalúo catastral |
| `npn:asc` \| `npn:desc` | Código predial |
| `distance:asc` \| `distance:desc` | Distancia al primer filtro `near` |

Por omisión, `area_m2:desc`. `distance` exige al menos un filtro `near`.

El orden es estable: se desempata internamente por `npn`, así que paginar no repite ni se salta
filas.

## `geometry`

| Valor | Devuelve | Costo |
| --- | --- | --- |
| `"none"` | Solo atributos | 1× |
| `"centroid"` | Atributos + centroide. **Por omisión** | 1,1× |
| `"full"` | Atributos + polígono completo | 3× a 20× |

## Respuesta

```json
{
  "data": [
    {
      "npn": "086380101000000010023000000000",
      "muniCode": "08638",
      "muniName": "Sabanalarga",
      "zone": "01",
      "zoneLabel": "Urbano",
      "address": "CL 20 # 14-05",
      "areaGeomM2": 2340.8,
      "areaReportedM2": 2300,
      "builtAreaM2": null,
      "economicUse": "Lote urbanizable",
      "cadastralValue": 96000000,
      "valuationYear": 2026,
      "centroid": [-74.9231, 10.6302],
      "geometry": null,
      "distances": {
        "road": { "distanceM": 142, "name": "Vía Oriental", "class": "primary" },
        "school": { "distanceM": 610, "name": "I.E. SABANALARGA", "class": "Oficial" }
      }
    }
  ],
  "page": {
    "limit": 100,
    "returned": 1,
    "cursor": null,
    "hasMore": false
  },
  "meta": {
    "sources": [
      { "datasetId": "igac-catastro-terreno", "source": "IGAC", "name": "Base Catastral Pública — capa de terrenos", "cutDate": "2026-07-31", "license": "CC-BY-SA-4.0", "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0", "url": "https://www.datos.gov.co/", "synthetic": false },
      { "datasetId": "osm-colombia-vias", "source": "OpenStreetMap", "name": "Extracto de Colombia — vías", "cutDate": "2026-08-01", "license": "ODbL-1.0", "attribution": "© colaboradores de OpenStreetMap, ODbL 1.0", "url": "https://download.geofabrik.de/south-america/colombia.html", "synthetic": false },
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

El bloque `distances` solo aparece si la consulta trae filtros `near`, y da la distancia y el
elemento más cercano de cada capa filtrada.

## Contar sin traer

```json
{ "scope": { "municipality": "08638" }, "where": { "zone": "urbano" }, "limit": 0 }
```

Con `limit: 0` la respuesta trae `data: []` y `page.total` con el conteo exacto. Es mucho más
barato que traer las filas para contarlas.

## Recetas

### Lotes sin construir, grandes, en zona rural

```json
{
  "scope": { "municipality": "08638" },
  "where": { "zone": "rural", "has_building": false, "area_m2": { "gte": 10000 } },
  "sort": "area_m2:desc",
  "limit": 200
}
```

### Predios lejos de amenazas y cerca de servicios

```json
{
  "scope": { "department": "08" },
  "where": { "zone": "urbano", "area_m2": { "gte": 500, "lte": 3000 } },
  "near": [
    { "layer": "hazard", "class": ["inundacion"], "max_m": 500, "invert": true },
    { "layer": "health_facility", "max_m": 1500 },
    { "layer": "road", "class": ["primary", "secondary"], "max_m": 400 }
  ],
  "sort": "distance:asc",
  "limit": 100
}
```

### Predios dentro de un polígono dibujado por el usuario

```json
{
  "scope": { "municipality": "08001" },
  "within": { "type": "Polygon", "coordinates": [[[-74.81, 10.98], [-74.78, 10.98], [-74.78, 11.0], [-74.81, 11.0], [-74.81, 10.98]]] },
  "geometry": "full",
  "limit": 500
}
```

### Candidatos para un colegio

```json
{
  "scope": { "municipality": "08638" },
  "where": { "area_m2": { "gte": 5000 }, "has_building": false },
  "near": [
    { "layer": "road", "class": ["primary", "secondary", "tertiary"], "max_m": 500 },
    { "layer": "school", "max_m": 1000, "invert": true }
  ],
  "sort": "area_m2:desc",
  "limit": 50
}
```

El `invert: true` sobre colegios excluye los predios que ya tienen un colegio cerca: si buscas
dónde abrir uno, quieres las zonas desatendidas.

## Cómo se traduce a SQL

El DSL **no** se concatena en una consulta. Se valida con Zod y se traduce con constructores
parametrizados: los nombres de columna solo pueden salir de una lista blanca, y los valores viajan
siempre como parámetros `$n`. No existe una ruta de concatenación de cadenas a SQL en el código de
consulta.

Cada consulta corre con `statement_timeout` según el plan (8 s en interactivo), y el ámbito
obligatorio garantiza que el planificador use la partición del departamento correspondiente.

## Rendimiento

| Factor | Impacto |
| --- | --- |
| `scope.municipality` frente a `scope.department` | Mucho más rápido: menos particiones |
| `geometry: "full"` | El mayor costo de toda la consulta |
| Cada filtro `near` | Un cruce espacial más. 6 es el máximo por algo |
| `within` con polígonos de muchos vértices | Simplifica el polígono antes de enviarlo |
| `limit` alto con `geometry: "full"` | Respuestas de decenas de MB |

Objetivo de la consulta del ejemplo canónico en el municipio piloto: **menos de 3 segundos**.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Falta `scope`, rango vacío, capa desconocida, `limit` fuera de rango, cursor que no corresponde a la consulta |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El plan no incluye búsqueda avanzada |
| `TIMEOUT` | 504 | Consulta demasiado costosa. Acota el ámbito, quita filtros `near` o baja `geometry` |
| `AREA_TOO_LARGE` | 413 | El polígono de `within` supera el límite del plan |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
