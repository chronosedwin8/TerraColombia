---
title: GET /parcels/:npn/context
description: Entorno de un predio - población, colegios, salud, comercio, vías, suelos, amenazas, áreas protegidas y ordenamiento.
---

# `GET /parcels/:npn/context`

Todo lo que rodea a un predio, en una sola llamada.

```
GET /geo/v1/parcels/:npn/context?radius=800
```

**Ámbito requerido:** `read:context`

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `radius` | entero | 800 | Radio en metros (100 a 5.000) |
| `sections` | string | todas | Lista separada por comas: `population,education,health,commerce,roads,soils,hazards,protected,ethnic,pot,relief` |
| `limit` | entero | 20 | Máximo de elementos por capa (1 a 200) |
| `cutDate` | string | snapshot activo | Corte concreto |

Pedir solo las secciones que vas a usar es la diferencia entre 200 ms y 2 s.

## Petición

::: code-group

```bash [curl]
curl -s "https://api.terracolombia.co/geo/v1/parcels/080010102000000010001000000000/context?radius=800&sections=population,education,health" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const { data, meta } = await geoapi(
  '/parcels/080010102000000010001000000000/context?radius=800&sections=population,education,health',
);

console.log('Población alrededor:', data.population.total);
console.log('Colegio más cercano:', data.schools[0]?.name, data.schools[0]?.distanceM, 'm');
```

:::

## Respuesta

```json
{
  "data": {
    "radiusM": 800,

    "population": {
      "total": 6420,
      "households": 1830,
      "dwellings": 1910,
      "schoolAge": 1210,
      "ageBands": { "0-4": 420, "5-17": 1210, "18-59": 3890, "60+": 900 }
    },

    "schools": [
      {
        "layer": "school",
        "id": "men_108001000123",
        "name": "INSTITUCIÓN EDUCATIVA DISTRITAL EL PRADO",
        "category": "Oficial",
        "distanceM": 240,
        "centroid": [-74.795, 10.988],
        "attrs": { "daneCode": "108001000123", "levels": "Preescolar, Básica, Media", "enrollment": 1420 }
      }
    ],

    "healthFacilities": [
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

    "pois": [
      {
        "layer": "poi",
        "id": "osm_node_1234567",
        "name": "Supermercado Olímpica",
        "category": "comercio",
        "distanceM": 120,
        "centroid": [-74.7965, 10.9882],
        "attrs": { "subcategory": "supermarket" }
      }
    ],

    "roads": [
      {
        "layer": "road",
        "id": "osm_way_7654321",
        "name": "Calle 72",
        "category": "secondary",
        "distanceM": 35,
        "centroid": [-74.7966, 10.9879],
        "attrs": { "surface": "asphalt", "lanes": 4 }
      }
    ],

    "soils": [
      {
        "kind": "capacidad_uso",
        "code": "3s",
        "label": "Clase 3 con limitaciones por salinidad",
        "overlapPct": 100,
        "attrs": { "clase": 3, "limitante": "salinidad" }
      },
      {
        "kind": "vocacion_uso",
        "code": "AGR",
        "label": "Agrícola",
        "overlapPct": 100,
        "attrs": {}
      }
    ],

    "hazards": [
      { "kind": "inundacion", "level": "media", "source": "IDEAM", "overlapPct": 22.4 },
      { "kind": "movimiento_en_masa", "level": "baja", "source": "SGC", "overlapPct": 100 }
    ],

    "protectedAreas": [],
    "ethnicTerritories": [],

    "potZones": [
      {
        "classification": "Suelo urbano",
        "use": "Residencial mixto",
        "sourceDoc": "Decreto 0212 de 2014",
        "overlapPct": 100
      }
    ],

    "relief": { "elevationMeanM": 12, "slopeMeanPct": 2.1 }
  },
  "meta": {
    "sources": [
      { "datasetId": "dane-mgn-manzanas", "source": "DANE", "name": "Marco Geoestadístico Nacional — manzanas censales", "cutDate": "2024-12-31", "license": "datos-abiertos-co", "attribution": "Fuente: DANE, MGN 2024", "url": "https://geoportal.dane.gov.co/", "synthetic": false },
      { "datasetId": "men-establecimientos-educativos", "source": "MEN", "name": "Directorio de establecimientos educativos", "cutDate": "2026-03-31", "license": "datos-abiertos-co", "attribution": "Fuente: Ministerio de Educación Nacional", "url": "https://www.datos.gov.co/", "synthetic": false },
      { "datasetId": "minsalud-reps", "source": "MinSalud", "name": "Registro Especial de Prestadores de Servicios de Salud (REPS)", "cutDate": "2026-06-30", "license": "datos-abiertos-co", "attribution": "Fuente: Ministerio de Salud, REPS", "url": "https://prestadores.minsalud.gov.co/", "synthetic": false },
      { "datasetId": "osm-colombia-vias", "source": "OpenStreetMap", "name": "Extracto de Colombia — vías", "cutDate": "2026-08-01", "license": "ODbL-1.0", "attribution": "© colaboradores de OpenStreetMap, ODbL 1.0", "url": "https://download.geofabrik.de/south-america/colombia.html", "synthetic": false }
    ],
    "cutDate": "2026-08-01",
    "coverage": { "muniCode": "08001", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": [
      "La población se agrega por manzana o sección censal que intersecta el radio; no es un conteo exacto de habitantes dentro del círculo."
    ]
  }
}
```

## Cómo leer cada bloque

### `population`

Agrega las manzanas y secciones censales del MGN que **intersectan** el radio. Consecuencia
importante: si una manzana entra parcialmente, entra completa. **No es un conteo exacto** de
habitantes dentro del círculo, y la API lo dice en `meta.warnings`.

`ageBands` trae los rangos tal como los publica el DANE. `schoolAge` es la suma del rango
5–17 años, que es el que importa para la plantilla de colegios.

### `schools`, `healthFacilities`, `pois`, `roads`

Elementos puntuales o lineales ordenados **por distancia ascendente** desde el borde del predio,
no desde su centroide. Las distancias se calculan en EPSG:9377, así que están en metros reales.

`attrs` lleva los campos propios de cada fuente. Para colegios, el código DANE; para prestadores,
el código REPS; para OSM, las etiquetas relevantes.

### `soils`

Capas de agrología del IGAC que cruzan el predio. `overlapPct` es el porcentaje del área del
predio que cae dentro de cada unidad; suma 100 % por cada `kind`.

`kind` puede ser `unidad_suelo`, `capacidad_uso`, `vocacion_uso` o `conflicto_uso`.

### `hazards`

::: warning Escala de las capas de amenaza
Las capas de amenaza vienen de estudios a escala regional o nacional (1:100.000 o menor). Sirven
para orientar decisiones preliminares y **no sustituyen** los estudios de detalle que exigen las
licencias de construcción o urbanización.

Además: amenaza no es riesgo. El riesgo depende de qué y quién está expuesto y de su
vulnerabilidad.
:::

Una lista vacía significa «las capas que tenemos no reportan afectación», **no** «no hay riesgo».

### `protectedAreas` y `ethnicTerritories`

Si `ethnicTerritories` no está vacío, el predio cruza un resguardo indígena o un territorio
colectivo de comunidades negras. En esos territorios **no aplica la compraventa ordinaria de
predios**: hay propiedad colectiva y hay que consultar a la autoridad étnica correspondiente.
Es una restricción fuerte y tu interfaz debería destacarla.

### `potZones`

Clasificación del suelo y usos según el POT, **donde lo tenemos integrado**. Una lista vacía
significa que no tenemos la cartografía de ese municipio, no que no haya norma. Hay que remitir a
la Secretaría de Planeación municipal.

Esto no es un concepto de norma urbanística. Lo que se puede construir lo determinan el POT y los
actos administrativos del municipio.

### `relief`

Altitud y pendiente medias dentro del predio, calculadas sobre el modelo digital de elevación
Copernicus de 30 m. Referencia: por encima del 25 % de pendiente construir encarece mucho; por
encima del 45 % suele haber restricción ambiental.

## Elegir el radio

| Radio | Para qué |
| --- | --- |
| 300 m | Entorno inmediato, «lo que hay en la cuadra» |
| 800 m | Distancia caminable de 10 minutos. **Es el valor por omisión** |
| 1.500 m | Barrio |
| 3.000 m | Zona de influencia de un comercio o de un colegio |
| 5.000 m | Máximo. Por encima, usa [`POST /areas/analyze`](/referencia/areas-analizar) |

A mayor radio, más tiempo y más elementos. Con radios grandes, sube `limit` o la lista quedará
truncada a los más cercanos.

## Endpoints relacionados

- [`GET /nearby`](/referencia/cercanos) — lo mismo pero desde un punto arbitrario, sin predio
- [`POST /areas/analyze`](/referencia/areas-analizar) — para polígonos, radios grandes e isócronas
- [`POST /suitability`](/referencia/aptitud) — convierte este contexto en un semáforo explicado

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `INVALID_NPN` | 400 | El código predial no es válido |
| `PARCEL_NOT_FOUND` | 404 | El predio no está en los cortes cargados |
| `VALIDATION` | 400 | `radius` fuera de rango, o `sections` con un valor desconocido |
| `FORBIDDEN` | 403 | Falta el ámbito `read:context` |
| `TIMEOUT` | 504 | Radio grande con todas las secciones. Reduce `sections` o `radius` |
