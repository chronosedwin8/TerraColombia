---
title: GET /nearby
description: Qué hay alrededor de un punto - colegios, salud, comercio, vías, amenazas y áreas protegidas.
---

# `GET /nearby`

Qué hay alrededor de un punto cualquiera. No necesita que exista un predio: sirve igual para una
coordenada que el usuario señaló en el mapa.

```
GET /geo/v1/nearby?lat=10.9878&lng=-74.7964&radius=800&layers=school,health_facility
```

**Ámbito requerido:** `read:context`

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `lat` | número | — | Latitud en EPSG:4326. Obligatorio si no usas `bbox` |
| `lng` | número | — | Longitud en EPSG:4326 |
| `radius` | entero | 1000 | Radio en metros (50 a 20.000) |
| `bbox` | string | — | `minLng,minLat,maxLng,maxLat`. Alternativa a `lat`/`lng`/`radius` |
| `layers` | string | todas | Lista separada por comas: `school,health_facility,poi,road,protected_area,hazard,ethnic_territory,parcel` |
| `class` | string | — | Filtra por subclase dentro de las capas pedidas |
| `limit` | entero | 50 | Máximo de elementos **por capa** (1 a 500) |
| `sort` | string | `distance:asc` | `distance:asc` o `distance:desc` |
| `cutDate` | string | snapshot activo | Corte concreto |

Debes enviar `lat`+`lng` **o** `bbox`, no los dos.

## Petición

::: code-group

```bash [curl]
curl -s -G "https://api.terracolombia.co/geo/v1/nearby" \
  --data-urlencode "lat=10.9878" \
  --data-urlencode "lng=-74.7964" \
  --data-urlencode "radius=800" \
  --data-urlencode "layers=school,health_facility,poi" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const params = new URLSearchParams({
  lat: '10.9878',
  lng: '-74.7964',
  radius: '800',
  layers: 'school,health_facility,poi',
  limit: '20',
});
const { data, meta } = await geoapi(`/nearby?${params}`);
```

:::

## Respuesta

```json
{
  "data": {
    "center": [-74.7964, 10.9878],
    "radiusM": 800,
    "muniCode": "08001",
    "muniName": "Barranquilla",
    "counts": { "school": 7, "health_facility": 3, "poi": 84 },
    "items": {
      "school": [
        {
          "layer": "school",
          "id": "men_108001000123",
          "name": "INSTITUCIÓN EDUCATIVA DISTRITAL EL PRADO",
          "category": "Oficial",
          "distanceM": 240,
          "centroid": [-74.795, 10.988],
          "attrs": {
            "daneCode": "108001000123",
            "levels": "Preescolar, Básica primaria, Básica secundaria, Media",
            "enrollment": 1420
          }
        }
      ],
      "health_facility": [
        {
          "layer": "health_facility",
          "id": "reps_0800100123",
          "name": "IPS CENTRO DE SALUD EL PRADO",
          "category": "Nivel 1",
          "distanceM": 610,
          "centroid": [-74.798, 10.989],
          "attrs": { "repsCode": "0800100123", "services": "Consulta externa, Odontología" }
        }
      ],
      "poi": [
        {
          "layer": "poi",
          "id": "osm_node_1234567",
          "name": "Supermercado Olímpica",
          "category": "comercio",
          "distanceM": 120,
          "centroid": [-74.7965, 10.9882],
          "attrs": { "subcategory": "supermarket" }
        }
      ]
    }
  },
  "meta": {
    "sources": [
      { "datasetId": "men-establecimientos-educativos", "source": "MEN", "name": "Directorio de establecimientos educativos", "cutDate": "2026-03-31", "license": "datos-abiertos-co", "attribution": "Fuente: Ministerio de Educación Nacional", "url": "https://www.datos.gov.co/", "synthetic": false },
      { "datasetId": "minsalud-reps", "source": "MinSalud", "name": "Registro Especial de Prestadores (REPS)", "cutDate": "2026-06-30", "license": "datos-abiertos-co", "attribution": "Fuente: Ministerio de Salud, REPS", "url": "https://prestadores.minsalud.gov.co/", "synthetic": false },
      { "datasetId": "osm-colombia-pois", "source": "OpenStreetMap", "name": "Extracto de Colombia — puntos de interés", "cutDate": "2026-08-01", "license": "ODbL-1.0", "attribution": "© colaboradores de OpenStreetMap, ODbL 1.0", "url": "https://download.geofabrik.de/south-america/colombia.html", "synthetic": false }
    ],
    "cutDate": "2026-08-01",
    "coverage": { "muniCode": "08001", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

## Estructura

| Campo | Descripción |
| --- | --- |
| `center` | El punto consultado, `[lng, lat]` |
| `muniCode` / `muniName` | Municipio en el que cae el punto |
| `counts` | **Total** de elementos dentro del radio por capa, sin truncar por `limit` |
| `items` | Los elementos, agrupados por capa, ordenados por distancia y truncados a `limit` |

`counts` y `items[capa].length` pueden diferir: `counts` es el total real, `items` lo que cabe en
`limit`. Usa `counts` para decir «hay 84 comercios cerca» y `items` para listar los más próximos.

## Capas disponibles

| `layer` | Contenido | Fuente |
| --- | --- | --- |
| `school` | Establecimientos y sedes educativas | MEN |
| `health_facility` | Prestadores de servicios de salud | MinSalud (REPS) |
| `poi` | Comercio, servicios, equipamientos | OpenStreetMap |
| `road` | Malla vial | OpenStreetMap |
| `protected_area` | Áreas protegidas | PNN (RUNAP) |
| `hazard` | Amenazas | SGC, IDEAM |
| `ethnic_territory` | Resguardos y territorios colectivos | ANT, MinInterior |
| `parcel` | Predios | IGAC (solo donde hay cobertura) |

El catálogo completo con las clases de cada capa está en [`GET /layers`](/referencia/capas).

## Distancias

Se calculan en **EPSG:9377** desde el punto consultado hasta la geometría del elemento (no hasta
su centroide). Para una vía, la distancia es al eje más cercano; para un polígono, a su borde,
y es **0** si el punto está dentro.

## Usar `bbox` en lugar de radio

```bash
curl -s -G "https://api.terracolombia.co/geo/v1/nearby" \
  --data-urlencode "bbox=-74.81,10.98,-74.78,11.00" \
  --data-urlencode "layers=school" \
  -H "X-API-Key: $TC_API_KEY"
```

Útil cuando el usuario mueve el mapa: el `bbox` de la vista es lo natural. En ese caso las
distancias se calculan desde el centro del `bbox` y se devuelve `center` con ese centro.

## Cuando no hay nada

```json
{
  "data": {
    "center": [-70.5, 2.1],
    "radiusM": 800,
    "muniCode": "95001",
    "muniName": "San José del Guaviare",
    "counts": { "school": 0, "health_facility": 0 },
    "items": { "school": [], "health_facility": [] }
  },
  "meta": {
    "warnings": [
      "No hay establecimientos inventariados en este radio. En zonas rurales dispersas, la ausencia en la fuente no siempre significa ausencia en terreno."
    ]
  }
}
```

::: warning Ausencia en la fuente ≠ ausencia en terreno
Especialmente con datos de OpenStreetMap, que dependen de la cobertura de la comunidad
cartógrafa: las ciudades están muy bien mapeadas y las zonas rurales dispersas, mucho menos. La
API lo advierte en `meta.warnings` cuando el conteo es cero en una zona de baja densidad de datos.
:::

## Para un mapa interactivo

- Usa `bbox` con el `bbox` de la vista y aplica `debounce` de 300 ms al mover el mapa.
- Pide solo las capas que estén encendidas en el selector.
- Baja el `limit` en zooms bajos: nadie lee 500 puntos superpuestos.
- Por encima del zoom 14, considera [teselas vectoriales](/referencia/teselas) en lugar de
  `nearby`: es mucho más eficiente para dibujar.
- Cachea por `bbox` redondeado; la respuesta trae `ETag`.

## Endpoints relacionados

- [`GET /parcels/:npn/context`](/referencia/predios-contexto) — lo mismo centrado en un predio, con
  población, suelos y ordenamiento
- [`POST /areas/analyze`](/referencia/areas-analizar) — agregados de un polígono, no listas
- [`GET /layers`](/referencia/capas) — catálogo de capas y clases

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Falta `lat`/`lng` y `bbox`; `radius` fuera de rango; capa desconocida; punto fuera de Colombia |
| `FORBIDDEN` | 403 | Falta el ámbito `read:context` |
| `TIMEOUT` | 504 | Radio grande con muchas capas. Reduce `layers` o `radius` |
| `RATE_LIMITED` | 429 | Demasiadas peticiones. Aplica `debounce` al mover el mapa |
