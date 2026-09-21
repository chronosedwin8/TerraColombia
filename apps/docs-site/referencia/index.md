---
title: Referencia de la API
description: Convenciones comunes de la GeoAPI de TerraColombia y listado de endpoints.
---

# Referencia de la API

Base URL:

```
https://api.terracolombia.co/geo/v1
```

Todos los endpoints requieren la cabecera `X-API-Key`. Ver [Autenticación](/guia/autenticacion).

## Convenciones

### La envoltura de respuesta

Toda respuesta correcta tiene la misma forma:

```json
{
  "data": { /* o [ … ] */ },
  "meta": {
    "sources": [],
    "cutDate": "2026-07-31",
    "coverage": null,
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

Las colecciones añaden un bloque `page`:

```json
{
  "data": [],
  "page": { "limit": 100, "returned": 100, "cursor": "…", "hasMore": true },
  "meta": { }
}
```

Los endpoints que devuelven geometrías pueden responder GeoJSON si pides
`Accept: application/geo+json`. En ese caso el `meta` va en el miembro de extensión
`terracolombia` de la `FeatureCollection`.

### Sistemas de referencia

| Para | SRID |
| --- | --- |
| Geometrías que devuelve y acepta la API | **EPSG:4326** (WGS 84), orden `longitud, latitud` |
| Áreas y distancias que calcula la API | **EPSG:9377** (MAGNA-SIRGAS / Origen-Nacional) |
| Teselas vectoriales | EPSG:3857 (Web Mercator), como manda el esquema XYZ |

Si envías geometrías, van en EPSG:4326. La API las reproyecta internamente para medir: por eso
las áreas y distancias están en metros reales y no en grados.

### Valores ausentes

| Valor | Significa |
| --- | --- |
| `null` | El campo no aplica o la fuente no lo trae |
| `"NO_DISPONIBLE"` | La fuente existe pero no publica ese dato para este objeto |

**Nunca son cero.** La API no estima: si el dato no está, lo dice.

### Fechas y números

- Las fechas de corte van como `AAAA-MM-DD`.
- Las marcas de tiempo van en ISO 8601 con zona (`2026-09-21T14:30:00.000Z`).
- Los números van sin formatear, con punto decimal. El formato para mostrar (`1.234,56` en
  es-CO) es responsabilidad de tu interfaz.
- Las áreas van en **m²**, las distancias en **metros**, las superficies grandes en **km²** solo
  donde el nombre del campo lo dice (`areaKm2`).
- Los montos van en **pesos colombianos enteros**, sin centavos.

### Códigos oficiales

- **Municipio:** código DIVIPOLA de 5 dígitos (`08001`).
- **Departamento:** 2 dígitos (`08`).
- **Predio:** Número Predial Nacional de 30 dígitos. Se acepta también el de 20 dígitos del
  formato anterior. Ver [GET /parcels/:npn](/referencia/predios#formato-del-npn).

### Límite de ritmo, cuotas y créditos

Ver [Cuotas y planes](/guia/cuotas-y-planes). Las cabeceras `X-RateLimit-*` y `X-TC-Credits-*`
vienen en todas las respuestas.

### Errores

Ver [Errores](/guia/errores). Atención especial a `COVERAGE_MISSING`, que responde `200`.

## Endpoints

### Búsqueda y fichas

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | [`/search`](/referencia/search) | Buscador universal: dirección, NPN, municipio, topónimo, coordenadas |
| `GET` | [`/municipalities/:code`](/referencia/municipios) | Ficha del municipio, gestor catastral y cobertura |
| `GET` | [`/parcels/:npn`](/referencia/predios) | Ficha completa del predio |
| `GET` | [`/parcels/:npn/context`](/referencia/predios-contexto) | Equipamientos, vías, población, suelos y amenazas alrededor |
| `GET` | [`/parcels/:npn/history`](/referencia/predios-historial) | Cambios entre cortes |

### Consulta y análisis

| Método | Ruta | Para qué |
| --- | --- | --- |
| `POST` | [`/parcels/query`](/referencia/predios-consulta) | Filtros alfanuméricos y espaciales (DSL) |
| `GET` | [`/nearby`](/referencia/cercanos) | Qué hay alrededor de un punto |
| `POST` | [`/areas/analyze`](/referencia/areas-analizar) | Tablero completo de una zona |
| `POST` | [`/suitability`](/referencia/aptitud) | Semáforo de aptitud por uso objetivo |
| `POST` | [`/location-intel`](/referencia/localizacion) | Celdas H3 puntuadas por plantilla de negocio |
| `GET` | [`/location-intel/templates`](/referencia/localizacion#plantillas) | Plantillas de negocio disponibles |
| `POST` | [`/changes/compare`](/referencia/cambios) | Diferencias entre dos cortes |
| `GET` | [`/indicators/:muniCode`](/referencia/indicadores) | Indicadores agregados del municipio |

### Salidas

| Método | Ruta | Para qué |
| --- | --- | --- |
| `POST` | [`/reports`](/referencia/informes) | Encargar un informe |
| `GET` | [`/reports/:id`](/referencia/informes#consultar-un-informe) | Estado del informe |
| `GET` | [`/reports/:id/download`](/referencia/informes#descargar) | Descargar en PDF, XLSX, CSV, GeoJSON, GPKG, SHP o KML |

### Asistente y catálogo

| Método | Ruta | Para qué |
| --- | --- | --- |
| `POST` | [`/ai/ask`](/referencia/asistente) | Pregunta en lenguaje natural |
| `POST` | [`/ai/explain`](/referencia/asistente#explicar) | "Explícame esto" sobre un dato ya calculado |
| `GET` | [`/layers`](/referencia/capas) | Catálogo de capas, leyendas y glosario |
| `GET` | [`/tiles/{layer}/{z}/{x}/{y}`](/referencia/teselas) | Teselas vectoriales |

## Versionado

La versión va en la ruta (`/geo/v1`). Dentro de una versión:

**Puede cambiar sin aviso:**
- Añadirse campos nuevos a las respuestas.
- Añadirse endpoints nuevos.
- Añadirse valores nuevos a campos de texto libre.
- Mejorarse la redacción de los `message` de error.

**No cambia sin una versión nueva:**
- Los `error.code`.
- El significado o el tipo de un campo existente.
- La estructura de `meta`.
- Los nombres de los campos.

**Diseña tu cliente para ignorar los campos que no conoce.** Un campo nuevo en una respuesta no
debe romper tu integración.
