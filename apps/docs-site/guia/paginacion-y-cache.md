---
title: Paginación, caché y bbox
description: Cursores, ETag, filtros espaciales por bbox y cómo recorrer resultados grandes sin quemar la cuota.
---

# Paginación, caché y bbox

## Paginación por cursor

La API **no** usa `offset`. Un `offset` grande obliga a la base a recorrer y descartar filas, y
además cambia de resultado si los datos se mueven mientras paginas. Se usa un **cursor opaco**.

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/parcels/query" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "municipality": "08638" },
    "where": { "zone": "urbano", "area_m2": { "gte": 1000 } },
    "sort": "area_m2:desc",
    "limit": 100
  }'
```

```json
{
  "data": [ /* 100 predios */ ],
  "page": {
    "limit": 100,
    "returned": 100,
    "cursor": "eyJhIjoxMjM0LjU2LCJuIjoiMDg2MzgwMTAyMDAwMDAwMDEwMDAxMDAwMDAwMDAwIn0",
    "hasMore": true
  },
  "meta": { /* … */ }
}
```

Para la página siguiente, repite la **misma** consulta añadiendo el `cursor`:

```json
{
  "scope": { "municipality": "08638" },
  "where": { "zone": "urbano", "area_m2": { "gte": 1000 } },
  "sort": "area_m2:desc",
  "limit": 100,
  "cursor": "eyJhIjoxMjM0LjU2LCJuIjoiMDg2MzgwMTAyMDAwMDAwMDEwMDAxMDAwMDAwMDAwIn0"
}
```

Reglas del cursor:

- Es **opaco**. No lo interpretes ni lo construyas: su contenido puede cambiar.
- Va atado a `scope`, `where`, `near`, `within`, `bbox` y `sort`. Si cambias cualquiera de esos,
  el cursor deja de valer y la API responde `400 VALIDATION`.
- **Caduca a los 15 minutos.** Para recorridos largos, guarda el cursor y sigue; si caduca,
  vuelve a empezar la página.
- `hasMore: false` o `cursor: null` significan que terminaste.

### Recorrer todo, en JavaScript

```js
async function* allParcels(query) {
  let cursor;
  do {
    const { data, page } = await geoapi('/parcels/query', {
      method: 'POST',
      body: JSON.stringify({ ...query, ...(cursor ? { cursor } : {}) }),
    });
    yield* data;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

for await (const parcel of allParcels({
  scope: { municipality: '08638' },
  where: { zone: 'urbano' },
  limit: 500,
  geometry: 'none',
})) {
  // …
}
```

::: tip Para volcados grandes, exporta
Si vas a traer decenas de miles de filas, no pagines: usa
[`POST /reports` con formato `csv` o `gpkg`](/referencia/informes). Un volcado cuesta créditos
una vez, en lugar de cientos de llamadas.
:::

## `ETag` y peticiones condicionales {#etag-y-condicionales}

Toda respuesta `GET` lleva `ETag`, derivado del contenido y del `snapshot_id` de las fuentes.

```http
HTTP/1.1 200 OK
ETag: "W/tc-08001-2026-07-31-9f3a2c"
Cache-Control: private, max-age=300
Vary: X-API-Key, Accept
```

Reenvía el `ETag` en la siguiente petición:

```bash
curl -s "https://api.terracolombia.co/geo/v1/parcels/080010102000000010001000000000" \
  -H "X-API-Key: $TC_API_KEY" \
  -H 'If-None-Match: "W/tc-08001-2026-07-31-9f3a2c"' \
  -i
```

```http
HTTP/1.1 304 Not Modified
ETag: "W/tc-08001-2026-07-31-9f3a2c"
```

**Un `304` no consume cuota ni créditos.** Es la forma más barata de mantener datos frescos.

En `fetch`:

```js
const cache = new Map();

async function cachedGet(path) {
  const previous = cache.get(path);
  const response = await fetch(`${API}${path}`, {
    headers: {
      'X-API-Key': KEY,
      ...(previous ? { 'If-None-Match': previous.etag } : {}),
    },
  });

  if (response.status === 304 && previous) return previous.body;

  const body = await response.json();
  const etag = response.headers.get('etag');
  if (etag) cache.set(path, { etag, body });
  return body;
}
```

### Cuánto puedes cachear

| Recurso | Vida útil razonable | Por qué |
| --- | --- | --- |
| Ficha de predio, municipio, indicadores | Hasta el siguiente corte (`meta.cutDate`) | Los datos catastrales se publican por cortes mensuales |
| `/layers`, glosario | Días | Cambian con cada despliegue |
| `/nearby`, contexto | Hasta el siguiente corte de la capa más volátil | OSM se actualiza más seguido que el catastro |
| Resultados de `POST /parcels/query` | Minutos | Depende del cursor, que caduca |
| Análisis de zona y localización | Mientras no cambien los pesos ni el corte | Son cálculos deterministas sobre un snapshot |

El campo `meta.cutDate` es la clave: mientras no cambie, los datos son los mismos. Guárdalo con
tu caché y compáralo.

## Filtrar por `bbox`

Los endpoints que devuelven colecciones aceptan `bbox` como cuatro números en **EPSG:4326**, en
el orden `minLng,minLat,maxLng,maxLat`:

```bash
curl -s "https://api.terracolombia.co/geo/v1/nearby?bbox=-74.81,10.98,-74.78,11.00&layers=school" \
  -H "X-API-Key: $TC_API_KEY"
```

En `POST /parcels/query` va como arreglo:

```json
{
  "scope": { "municipality": "08001" },
  "bbox": [-74.81, 10.98, -74.78, 11.0],
  "limit": 200,
  "geometry": "centroid"
}
```

Reglas:

- El orden es **longitud primero**, igual que GeoJSON. Un `bbox` con el orden invertido devuelve
  `400 VALIDATION` si queda fuera de Colombia, y resultados vacíos si por casualidad queda dentro.
- El `bbox` se recorta a la extensión de Colombia (`[-81.85, -4.30, -66.80, 13.60]`). Pedir el
  mundo entero no barre el mundo entero.
- Un `bbox` no sustituye a `scope`: `POST /parcels/query` **exige** `department` o `municipality`
  para no permitir barridos nacionales.
- El `bbox` filtra por intersección con la geometría, no por contención del centroide.

### `bbox` frente a `within`

| Usa | Cuando |
| --- | --- |
| `bbox` | Te basta un rectángulo. Es mucho más rápido: se resuelve con el índice GiST |
| `within` | Necesitas un polígono real (un barrio, una zona dibujada por el usuario) |

`within` acepta cualquier geometría GeoJSON de tipo `Polygon` o `MultiPolygon`. Los polígonos
muy grandes se subdividen internamente, pero cuestan más que un `bbox`: si puedes, filtra primero
por `bbox` y luego por `within`.

## Ordenar

`sort` tiene la forma `campo:dirección`:

```
area_m2:desc
built_area_m2:asc
cadastral_value:desc
npn:asc
distance:asc
```

`distance:asc` solo vale si la consulta trae al menos un filtro `near`, porque es la distancia a
esa capa.

El orden es **estable**: internamente se desempata por `npn`, así que paginar no repite ni se
salta filas aunque haya empates en el campo de orden.

## Geometrías: cuánto pedir

| `geometry` | Devuelve | Costo relativo |
| --- | --- | --- |
| `"none"` | Solo atributos | 1× |
| `"centroid"` | Atributos + punto del centroide | 1,1× |
| `"full"` | Atributos + polígono completo | 3× a 20× según el predio |

El valor por omisión es `"centroid"`. Pide `"full"` solo cuando vayas a dibujar el predio.

## Límites y tiempos

| Límite | Valor |
| --- | --- |
| `limit` máximo | 1.000 (según plan; ver [Cuotas](/guia/cuotas-y-planes)) |
| Vida del cursor | 15 minutos |
| Tiempo máximo de una consulta interactiva | 8 s |
| Tiempo máximo de una búsqueda | 4 s |
| Tiempo máximo de un análisis síncrono | 30 s |
| Área máxima de análisis síncrono | 5 km² |
| Área máxima absoluta por petición | 2.000 km² |

Una consulta que excede su tiempo devuelve `504 TIMEOUT` con un mensaje que sugiere reducir el
área o los filtros, o ejecutarla como tarea en segundo plano.

## Trabajos asíncronos

Los análisis grandes se encolan:

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/areas/analyze" \
  -H "X-API-Key: $TC_API_KEY" -H "Content-Type: application/json" \
  -d '{ "scope": { "kind": "municipality", "muniCode": "08638" }, "async": true }'
```

```json
{
  "data": { "jobId": "job_01JQZX8K4T", "status": "queued", "progress": 0 },
  "meta": { /* … */ }
}
```

Sigue el progreso por SSE, que es más barato y más rápido que consultar en bucle:

```js
const events = new EventSource(`${API}/jobs/job_01JQZX8K4T/events?key=${KEY}`);
events.addEventListener('progress', (e) => console.log(JSON.parse(e.data).progress));
events.addEventListener('done', (e) => {
  console.log(JSON.parse(e.data));
  events.close();
});
```

::: warning El SSE es la excepción a "la llave no va en la URL"
`EventSource` no permite cabeceras personalizadas, así que este endpoint acepta la llave por
parámetro. Úsalo **solo desde tu backend**, nunca desde el navegador con la llave real.
:::
