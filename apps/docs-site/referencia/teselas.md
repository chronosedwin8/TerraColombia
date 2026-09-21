---
title: Teselas vectoriales
description: Teselas vectoriales Mapbox Vector Tile para dibujar predios, construcciones, agregados H3 y capas de contexto.
---

# `GET /tiles/{layer}/{z}/{x}/{y}`

Teselas vectoriales en formato **Mapbox Vector Tile** (MVT), para dibujar mapas sin traerte las
geometrías por JSON.

```
GET /geo/v1/tiles/{layer}/{z}/{x}/{y}.mvt
```

**Ámbito requerido:** `read:tiles`

## Por qué teselas y no GeoJSON

Un municipio mediano tiene decenas de miles de predios. Traerlos por `POST /parcels/query` con
`geometry: "full"` son decenas de megabytes y varios segundos. Una tesela son unas decenas de
kilobytes, llega en milisegundos y el navegador la dibuja con aceleración por hardware.

**Regla práctica:** teselas para dibujar, JSON para consultar.

## Parámetros de ruta

| Parámetro | Descripción |
| --- | --- |
| `layer` | Identificador de capa de [`GET /layers`](/referencia/capas) con `tileable: true` |
| `z` | Zoom, 0 a 22 |
| `x` / `y` | Coordenadas del esquema XYZ (origen arriba a la izquierda) |

La extensión `.mvt` es opcional pero recomendada: ayuda a los clientes y a los intermediarios de
caché.

## Parámetros de consulta

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `cutDate` | string | snapshot activo | Corte concreto. Permite el deslizador antes/después |
| `filter` | string | — | Filtro simple por clase: `class=primary,secondary` |
| `resolution` | entero | automática | Solo para `h3`: 7, 8 o 9 |

## Capas con teselas

| `layer` | Geometría | Zoom mínimo | Contenido |
| --- | --- | --- | --- |
| `parcel` | Polígono | **14** | Predios |
| `building` | Polígono | 15 | Construcciones |
| `block` | Polígono | 12 | Manzanas |
| `sector` | Polígono | 10 | Sectores catastrales |
| `municipality` | Polígono | 5 | Límites municipales |
| `department` | Polígono | 3 | Límites departamentales |
| `h3` | Polígono | 6 | Agregados por celda H3 |
| `school` | Punto | 11 | Establecimientos educativos |
| `health_facility` | Punto | 11 | Prestadores de salud |
| `protected_area` | Polígono | 6 | Áreas protegidas |
| `hazard` | Polígono | 8 | Amenazas |
| `soil_unit` | Polígono | 8 | Unidades de suelo |
| `pot_zone` | Polígono | 12 | Zonas del POT, donde exista |

Por debajo del zoom mínimo, la tesela llega **vacía** con `204 No Content`, no con un error: el
cliente de mapas lo entiende y no dibuja nada.

::: tip Predios desde el zoom 14
Por debajo del zoom 14 los predios se superponen y no se distinguen, y servirlos costaría mucho
sin aportar nada. Usa la capa `h3` para zooms bajos: es el mismo territorio, agregado.
:::

## Autenticación

Los clientes de mapas no envían cabeceras personalizadas en las peticiones de tesela. Hay dos
caminos:

### Recomendado: proxy en tu backend

```js
app.get('/tiles/:layer/:z/:x/:y.mvt', async (request, reply) => {
  const { layer, z, x, y } = request.params;
  const upstream = await fetch(
    `https://api.terracolombia.co/geo/v1/tiles/${layer}/${z}/${x}/${y}.mvt`,
    { headers: { 'X-API-Key': process.env.TC_API_KEY } },
  );
  reply
    .code(upstream.status)
    .header('Content-Type', 'application/vnd.mapbox-vector-tile')
    .header('Cache-Control', 'public, max-age=3600')
    .send(Buffer.from(await upstream.arrayBuffer()));
});
```

### Alternativa: token de teselas de vida corta

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/tiles/token" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "layers": ["parcel", "road"], "ttlSeconds": 3600 }'
```

```json
{
  "data": {
    "token": "tct_9f3a2c5b8d1046a7c3e9f2b5d8a104",
    "expiresAt": "2026-09-21T15:30:00.000Z",
    "tileUrl": "https://api.terracolombia.co/geo/v1/tiles/{layer}/{z}/{x}/{y}.mvt?token=tct_9f3a2c5b8d1046a7c3e9f2b5d8a104"
  },
  "meta": { }
}
```

El token vale solo para las capas que pediste, caduca solo, y se puede revocar sin tocar tu llave
principal. Sigue siendo un secreto, pero uno de bajo riesgo.

## Usar con MapLibre

```js
map.addSource('predios', {
  type: 'vector',
  tiles: ['https://tu-backend.co/tiles/parcel/{z}/{x}/{y}.mvt'],
  minzoom: 14,
  maxzoom: 22,
  attribution: 'Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0',
});

map.addLayer({
  id: 'predios-relleno',
  type: 'fill',
  source: 'predios',
  'source-layer': 'parcel',
  paint: {
    'fill-color': [
      'match',
      ['get', 'economic_use'],
      'Habitacional', '#2a78d6',
      'Comercial', '#eb6834',
      'Industrial', '#4a3aa7',
      'Lote urbanizable', '#1baf7a',
      '#898781',
    ],
    'fill-opacity': 0.55,
  },
});

map.addLayer({
  id: 'predios-borde',
  type: 'line',
  source: 'predios',
  'source-layer': 'parcel',
  paint: { 'line-color': '#0b0b0b', 'line-width': 0.5 },
});
```

::: danger La atribución es obligatoria
El campo `attribution` de la fuente **no es opcional** para los datos del IGAC ni para los de
OpenStreetMap. Y el control de atribución de MapLibre debe estar visible, no colapsado detrás de
un icono que nadie abre. Ver [Licencias y atribución](/guia/licencias-y-atribucion).
:::

El nombre de la capa dentro de la tesela (`source-layer`) es siempre igual al `layer` de la URL.

## Propiedades de cada capa

### `parcel`

| Propiedad | Tipo | Notas |
| --- | --- | --- |
| `npn` | string | Número Predial Nacional |
| `zone` | string | `01` urbano, `02` rural |
| `economic_use` | string | Destino económico |
| `area_m2` | número | Área medida |
| `built_area_m2` | número \| null | Área construida |
| `has_building` | boolean | |

No se incluye `cadastral_value` en las teselas: es un dato que exige mostrar la advertencia de
«avalúo catastral ≠ valor comercial», y una tesela no puede llevar esa advertencia. Para el
avalúo, consulta [`GET /parcels/:npn`](/referencia/predios).

### `h3`

| Propiedad | Tipo |
| --- | --- |
| `h3` | string |
| `res` | entero |
| `n_parcels` | entero |
| `pop` | entero \| null |
| `pop_school_age` | entero \| null |
| `n_schools` | entero |
| `n_health` | entero |
| `slope_mean` | número \| null |

## Selección e interacción

Usa `feature-state` de MapLibre: las teselas traen `id` por objeto, así que se puede resaltar sin
volver a pedir nada.

```js
let hovered = null;

map.on('mousemove', 'predios-relleno', (e) => {
  if (hovered !== null) map.setFeatureState({ source: 'predios', sourceLayer: 'parcel', id: hovered }, { hover: false });
  hovered = e.features[0].id;
  map.setFeatureState({ source: 'predios', sourceLayer: 'parcel', id: hovered }, { hover: true });
});

map.on('click', 'predios-relleno', async (e) => {
  const npn = e.features[0].properties.npn;
  const { data, meta } = await geoapi(`/parcels/${npn}`);
  abrirFicha(data, meta); // La ficha completa sí viene por JSON.
});
```

## Caché

```http
Cache-Control: public, max-age=86400, stale-while-revalidate=604800
ETag: "tc-parcel-14-4653-7396-snap_igac_2026_07"
```

El `ETag` incluye el `snapshot_id`, así que cuando entra un corte nuevo las teselas se invalidan
solas. Cachea agresivamente en tu proxy: una tesela de un corte publicado **no cambia nunca**.

## Cuotas

Las teselas se cuentan aparte, en `tilesPerDay`:

| Plan | Teselas por día |
| --- | --- |
| Gratis | 20.000 |
| Pro | 200.000 |
| API | 1.000.000 |
| Business | 2.000.000 |
| Enterprise | 50.000.000 |

Al superar la cuota, las teselas devuelven `429`. Un mapa que deja de cargar predios es un
síntoma típico de cuota agotada: revisa `X-RateLimit-Remaining`.

::: info Marca de agua en el plan gratuito
Las teselas del plan gratuito llevan una marca de agua en la capa de anotaciones. Es una medida
anti-raspado, y desaparece en los planes de pago.
:::

## Mapa base

TerraColombia **no sirve el mapa base**. Usa teselas vectoriales propias de OpenStreetMap
(Protomaps o PMTiles) o cualquier proveedor que no sea Google, cuyos términos prohíben mezclar
sus teselas con datos de terceros de esta manera.

El estilo que uses se configura en tu cliente; nuestras capas se añaden encima.

## Errores posibles

| Código | Cuándo |
| --- | --- |
| `204` | Zoom por debajo del mínimo de la capa, o tesela sin datos. **No es un error** |
| `400` | Coordenadas `z/x/y` fuera de rango, o capa no tileable |
| `401` | Llave o token ausente o inválido |
| `403` | Capa fuera del ámbito del token, o plan sin acceso |
| `429` | Cuota diaria de teselas agotada |
