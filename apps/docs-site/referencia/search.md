---
title: GET /search
description: Buscador universal de la GeoAPI - direcciones, códigos prediales, municipios, topónimos y coordenadas.
---

# `GET /search`

Un solo buscador para todo. Detecta qué le pasaste y busca donde corresponde.

```
GET /geo/v1/search?q=<texto>
```

**Ámbito requerido:** `read:parcels`

## Qué reconoce

| Entrada | Ejemplo | Tipo devuelto |
| --- | --- | --- |
| Número Predial Nacional de 30 dígitos | `080010102000000010001000000000` | `parcel` |
| Código predial anterior de 20 dígitos | `08001010200000001000` | `parcel` |
| Nombre de municipio | `Sabanalarga` | `municipality` |
| Dirección colombiana | `Cra 41 # 72-20, Barranquilla` | `address` |
| Barrio o vereda | `El Prado, Barranquilla` | `neighborhood` |
| Topónimo | `Ciénaga de Mallorquín` | `place` |
| Coordenadas `lat,lng` | `10.9878,-74.7964` | `coordinate` |

El normalizador de direcciones entiende las abreviaturas colombianas: `Cra`, `Kra`, `Kr`,
`Carrera`, `Cl`, `Calle`, `Av`, `Dg`, `Tv`, `#`, `-`, `Bis`, `Sur`, `Este`, `Oeste`, `Apto`,
`Mz`, `Lt`. `Cra 41 No 72 - 20`, `KR 41 #72-20` y `carrera 41 72 20` llegan al mismo sitio.

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `q` | string | — | **Obligatorio.** Entre 2 y 200 caracteres |
| `limit` | entero | 10 | Máximo de resultados (1 a 50) |
| `types` | string | todos | Lista separada por comas: `parcel,municipality,address,neighborhood,place,coordinate` |
| `muniCode` | string | — | Restringe la búsqueda a un municipio (DIVIPOLA de 5 dígitos) |
| `deptCode` | string | — | Restringe la búsqueda a un departamento (2 dígitos) |
| `bbox` | string | — | `minLng,minLat,maxLng,maxLat` en EPSG:4326 |

## Petición

::: code-group

```bash [curl]
curl -s -G "https://api.terracolombia.co/geo/v1/search" \
  --data-urlencode "q=Cra 41 # 72-20, Barranquilla" \
  --data-urlencode "limit=5" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const params = new URLSearchParams({ q: 'Cra 41 # 72-20, Barranquilla', limit: '5' });
const { data, meta } = await geoapi(`/search?${params}`);
```

:::

## Respuesta

```json
{
  "data": [
    {
      "kind": "address",
      "id": "addr_08001_0000123456",
      "label": "CARRERA 41 # 72-20, Barranquilla, Atlántico",
      "muniCode": "08001",
      "muniName": "Barranquilla",
      "deptCode": "08",
      "deptName": "Atlántico",
      "npn": "080010102000000010001000000000",
      "centroid": [-74.7964, 10.9878],
      "bbox": [-74.7968, 10.9875, -74.796, 10.9881],
      "score": 0.94,
      "matchedOn": "direccion_normalizada"
    },
    {
      "kind": "neighborhood",
      "id": "brr_08001_0042",
      "label": "El Prado, Barranquilla, Atlántico",
      "muniCode": "08001",
      "muniName": "Barranquilla",
      "deptCode": "08",
      "deptName": "Atlántico",
      "npn": null,
      "centroid": [-74.7951, 10.9901],
      "bbox": [-74.801, 10.985, -74.789, 10.995],
      "score": 0.61,
      "matchedOn": "nombre_barrio"
    }
  ],
  "page": { "limit": 5, "returned": 2, "cursor": null, "hasMore": false },
  "meta": {
    "sources": [
      {
        "datasetId": "igac-catastro-nomenclatura",
        "source": "IGAC",
        "name": "Base Catastral Pública — nomenclatura domiciliaria",
        "cutDate": "2026-07-31",
        "license": "CC-BY-SA-4.0",
        "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0",
        "url": "https://www.datos.gov.co/",
        "synthetic": false
      },
      {
        "datasetId": "dane-divipola",
        "source": "DANE",
        "name": "División político-administrativa de Colombia (DIVIPOLA)",
        "cutDate": "2025-12-31",
        "license": "datos-abiertos-co",
        "attribution": "Fuente: DANE, DIVIPOLA 2025",
        "url": "https://www.dane.gov.co/",
        "synthetic": false
      }
    ],
    "cutDate": "2026-07-31",
    "coverage": null,
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

## Campos del resultado

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `kind` | string | `parcel`, `municipality`, `address`, `neighborhood`, `place` o `coordinate` |
| `id` | string | Identificador interno del objeto |
| `label` | string | Texto listo para mostrar en una lista de sugerencias |
| `muniCode` / `muniName` | string | Municipio al que pertenece |
| `deptCode` / `deptName` | string | Departamento |
| `npn` | string \| null | Número Predial Nacional, si el resultado es o apunta a un predio |
| `centroid` | `[lng, lat]` \| null | Punto representativo |
| `bbox` | `[minLng, minLat, maxLng, maxLat]` \| null | Extensión, para encuadrar el mapa |
| `score` | número 0–1 | Confianza de la coincidencia |
| `matchedOn` | string | Qué campo produjo la coincidencia. Útil para depurar |

## Cómo se ordenan los resultados

1. Coincidencia exacta de código (NPN o DIVIPOLA) va siempre primero, con `score` 1.
2. Luego las direcciones normalizadas que coinciden con número de vía y número de placa.
3. Luego la similitud difusa (`pg_trgm` sobre texto sin acentos) de municipios, barrios, veredas
   y topónimos.
4. A igualdad de `score`, gana el objeto del municipio más poblado: es lo que el usuario suele
   estar buscando.

## Buscar por coordenadas

```bash
curl -s -G "https://api.terracolombia.co/geo/v1/search" \
  --data-urlencode "q=10.9878,-74.7964" \
  -H "X-API-Key: $TC_API_KEY"
```

Devuelve el predio que contiene el punto (si hay cobertura) y el municipio. El orden es
`latitud,longitud`, que es como la gente copia coordenadas de un mapa. Si los valores están fuera
del rango válido, se prueba el orden inverso antes de rechazar.

## Sin resultados

Devuelve `200` con `data: []`, no `404`:

```json
{
  "data": [],
  "page": { "limit": 10, "returned": 0, "cursor": null, "hasMore": false },
  "meta": {
    "sources": [],
    "cutDate": null,
    "coverage": null,
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": ["No encontramos coincidencias. Prueba con el municipio o con menos palabras."]
  }
}
```

## Cobertura

Si buscas una dirección en un municipio sin catastro del IGAC, obtendrás resultados de tipo
`municipality`, `neighborhood` y `place` pero **no** de tipo `address` ni `parcel`, y `meta.coverage`
lo explicará. Ver [`COVERAGE_MISSING`](/guia/errores#coverage-missing).

## Para un buscador en vivo

- Aplica `debounce` de 250 ms: cada pulsación no debe ser una llamada.
- Pide `limit=8`: más resultados en un desplegable no ayudan.
- Usa `muniCode` cuando el usuario ya eligió municipio. La búsqueda es mucho más rápida y precisa.
- Cachea por `q` normalizado; la respuesta trae `ETag` y un `304` no consume cuota.
- Muestra `meta.sources[].attribution` en algún lugar de la vista, aunque sea en el pie.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | `q` vacío, demasiado corto o demasiado largo; `bbox` mal formado |
| `UNAUTHORIZED` | 401 | Llave ausente o inválida |
| `FORBIDDEN` | 403 | La llave no tiene el ámbito `read:parcels` |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `TIMEOUT` | 504 | La búsqueda superó los 4 s. Acorta `q` o añade `muniCode` |
