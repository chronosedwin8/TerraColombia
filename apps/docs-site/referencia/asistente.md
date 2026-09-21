---
title: Asistente
description: POST /ai/ask y POST /ai/explain - búsqueda en lenguaje natural y explicación de indicadores, sin inventar cifras.
---

# Asistente

Dos endpoints con un modelo de lenguaje detrás, y con una regla que los gobierna:

::: danger El asistente no inventa cifras
El modelo **no consulta la base de datos ni escribe SQL**. Solo puede llamar a un conjunto de
herramientas tipadas, y responde a partir de lo que esas herramientas devuelven. Si la
herramienta no trae el dato, el asistente dice que no lo tiene. No estima, no interpola y no
completa con conocimiento general.
:::

**Ámbito requerido:** `ai:ask` · **Costo:** 1 crédito por pregunta

## `POST /ai/ask`

Pregunta en lenguaje natural.

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/ai/ask" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "¿Cuántos lotes de más de mil metros hay en Sabanalarga cerca de una vía principal?",
    "context": { "muniCode": "08638" }
  }'
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `question` | string | La pregunta, de 3 a 500 caracteres |
| `context` | objeto | Opcional: `muniCode`, `npn`, `bbox` o `scope` para acotar |
| `conversationId` | string | Opcional: para encadenar preguntas |

### Respuesta

```json
{
  "data": {
    "answer": "En Sabanalarga hay 87 predios urbanos de más de 1.000 m² a menos de 300 metros de una vía primaria o troncal. El más grande mide 1,2 hectáreas y está en el sector 01. De esos 87, 31 no tienen construcción registrada.\n\nEstas cifras salen del corte del 31 de julio de 2026 de la base catastral del IGAC, cruzado con la malla vial de OpenStreetMap del 1 de agosto de 2026.",
    "toolCalls": [
      {
        "tool": "query_parcels",
        "arguments": {
          "scope": { "municipality": "08638" },
          "where": { "zone": "urbano", "area_m2": { "gte": 1000 } },
          "near": [{ "layer": "road", "class": ["primary", "trunk"], "max_m": 300 }],
          "limit": 0
        },
        "resultSummary": "87 predios; área máxima 12.043 m²; 31 sin construcción"
      }
    ],
    "citations": [
      { "datasetId": "igac-catastro-terreno", "cutDate": "2026-07-31" },
      { "datasetId": "osm-colombia-vias", "cutDate": "2026-08-01" }
    ],
    "conversationId": "conv_01JQZX8K4T",
    "disclaimer": "Esta explicación la genera un asistente a partir de los datos que ya calculamos. No agrega cifras nuevas: si un dato no está, dice que no está."
  },
  "meta": { }
}
```

`toolCalls[]` es la auditoría: muestra exactamente qué consultas se ejecutaron y con qué
argumentos. **Muéstralo** —aunque sea plegado— para que el usuario pueda verificar la respuesta y
reproducirla con la API directamente.

## Herramientas disponibles

El modelo solo puede llamar a estas, con esquemas JSON validados:

| Herramienta | Qué hace | Endpoint equivalente |
| --- | --- | --- |
| `search_places` | Resolver un nombre a un código o una coordenada | `GET /search` |
| `query_parcels` | Consultar predios con el DSL | `POST /parcels/query` |
| `get_parcel` | Ficha de un predio | `GET /parcels/:npn` |
| `analyze_area` | Tablero de una zona | `POST /areas/analyze` |
| `nearby` | Qué hay alrededor de un punto | `GET /nearby` |
| `get_indicators` | Indicadores de un municipio | `GET /indicators/:muniCode` |
| `explain_indicator` | Definición y fórmula de un indicador | — |

No hay ninguna herramienta que ejecute SQL libre, ni que acceda a tablas fuera de este conjunto.

## Cuando no hay dato

```json
{
  "data": {
    "answer": "No tengo el dato de avalúos comerciales: la base del IGAC solo publica avalúos catastrales, que son valores fiscales y no precios de mercado. Si quieres, puedo darte el avalúo catastral de los predios que te interesan, pero ten en cuenta que no es lo mismo.",
    "toolCalls": [],
    "citations": [],
    "conversationId": "conv_01JQZX8K4T",
    "disclaimer": "…"
  },
  "meta": {
    "warnings": ["El asistente no encontró el dato solicitado en las fuentes disponibles."]
  }
}
```

Esta es la respuesta correcta, no un fallo. Es preferible a una cifra inventada.

## `POST /ai/explain` {#explicar}

«Explícame esto» sobre un dato **ya calculado**. No consulta nada nuevo: reformula lo que le pasas.

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/ai/explain" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "indicator",
    "payload": {
      "indicator": "suelo_sin_construir_urbano",
      "value": 12.4,
      "unit": "%",
      "formula": "área de predios urbanos sin construcción / área total de predios urbanos × 100",
      "comparison": { "departmentValue": 18.9, "departmentRank": 17, "departmentTotal": 23 }
    },
    "audience": "no_tecnica"
  }'
```

| Campo | Valores | Descripción |
| --- | --- | --- |
| `subject` | `indicator`, `factor`, `verdict`, `term`, `change` | Qué se explica |
| `payload` | objeto | El dato tal como lo devolvió la API. **Solo se usa esto** |
| `audience` | `no_tecnica`, `tecnica` | Registro de la explicación |

### Respuesta

```json
{
  "data": {
    "explanation": "El 12,4 % del suelo urbano de este municipio está en lotes donde el catastro no registra ninguna construcción. Se calcula sumando el área de esos lotes y dividiéndola entre el área de todos los predios urbanos.\n\nComparado con su departamento, este municipio tiene menos suelo urbano libre que la mayoría: ocupa el puesto 17 de 23 municipios con dato. Eso suele indicar un casco urbano bastante consolidado, con menos espacio para proyectos nuevos dentro del perímetro.\n\nOjo: «sin construir» según el catastro no significa disponible para comprar. Puede ser un lote con dueño que no piensa vender, o suelo de protección.",
    "termsUsed": [
      { "id": "pot", "term": "POT (Plan de Ordenamiento Territorial)" }
    ],
    "disclaimer": "Esta explicación la genera un asistente a partir de los datos que ya calculamos. No agrega cifras nuevas: si un dato no está, dice que no está."
  },
  "meta": { }
}
```

`termsUsed[]` enlaza con el [glosario](/guia/glosario) para que puedas poner los enlaces.

## Garantías

| Garantía | Cómo se implementa |
| --- | --- |
| No inventa cifras | El modelo solo ve lo que devuelven las herramientas; ninguna cifra de la respuesta puede no estar en `toolCalls` o en `payload` |
| No ejecuta SQL libre | Solo hay herramientas tipadas con esquemas JSON validados |
| Cita las fuentes | `citations[]` y el `meta.sources[]` de las herramientas |
| No procesa datos personales | Las fuentes no los tienen, y los registros de las conversaciones se guardan sin datos personales |
| No da consejo jurídico ni avalúos | Está instruido para rechazarlo y remitir a un profesional; el `disclaimer` acompaña toda respuesta |
| Es auditable | `toolCalls[]` permite reproducir la respuesta llamando a la API directamente |

## Lo que el asistente no responde

- **«¿Cuánto vale este predio?»** → explica que solo hay avalúo catastral, que es fiscal.
- **«¿Quién es el dueño?»** → no existe esa información en el producto.
- **«¿Puedo construir un edificio de 10 pisos?»** → remite al POT y a Planeación municipal.
- **«¿Me conviene comprar?»** → entrega indicadores; la decisión no es suya.

## El modelo

Se configura por variable de entorno del servidor y puede cambiar. `meta.warnings` avisa si la
respuesta se generó con un modelo de respaldo por indisponibilidad del principal.

Los *prompts* se registran **sin datos personales** para auditoría y mejora. Si envías datos de
tus usuarios dentro de `question`, es responsabilidad tuya: no lo hagas.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Pregunta vacía, demasiado larga, o `subject` desconocido |
| `INSUFFICIENT_CREDITS` | 402 | Faltan créditos |
| `FORBIDDEN` | 403 | Falta el ámbito `ai:ask` |
| `RATE_LIMITED` | 429 | Demasiadas preguntas seguidas |
| `UPSTREAM_UNAVAILABLE` | 503 | El proveedor del modelo no responde |
| `TIMEOUT` | 504 | La cadena de herramientas tardó demasiado |
