---
title: Cuotas y planes
description: Límites de la GeoAPI por plan, créditos por operación y qué hacer cuando se agotan.
---

# Cuotas y planes

Hay **dos mecanismos** que limitan lo que puedes hacer, y conviene no confundirlos:

1. **Límites del plan** (`entitlements`): qué funciones tienes, cuántas peticiones por minuto,
   cuánta área puedes analizar, cuántas filas puedes exportar. Se renuevan solos.
2. **Créditos** (`credit_ledger`): cada operación costosa descuenta créditos. Se recargan al
   inicio del periodo y se pueden comprar aparte.

Una llamada barata (la ficha de un predio) solo consume cuota. Una llamada costosa (un informe,
un análisis de zona grande) consume cuota **y** créditos.

::: warning Los precios son hipótesis
Los precios de esta página son las hipótesis de trabajo del producto, no una lista de precios
firme. Antes de cerrar un contrato, confírmalos en <https://terracolombia.co/planes>.
:::

## Planes

| Plan | Para quién | Precio guía (COP) | Créditos/mes |
| --- | --- | --- | --- |
| **Gratis** | Primer contacto | $0 | 0 |
| **Pago por informe** | Persona natural | $45.000 por informe | 0 |
| **Pro** | Avaluadores, arquitectos, independientes | $190.000/mes | 200 |
| **Business** | Inmobiliarias, constructoras, retail | $1.200.000/mes | 2.000 |
| **API** | Desarrolladores y proptech | $250.000/mes + excedente | 5.000 |
| **Enterprise** | Bancos, aseguradoras, entidades | Cotización | A convenir |

Los pagos se procesan con **Mercado Pago** (tarjeta, PSE y Efecty). Ver
[Informes y exportación](/referencia/informes#pagar-un-informe).

## Límites técnicos por plan

| Límite | Gratis | Pro | Business | API | Enterprise |
| --- | --- | --- | --- | --- | --- |
| Peticiones por minuto | 30 | 120 | 600 | 300 | 3.000 |
| Máximo de resultados por consulta (`limit`) | 50 | 500 | 1.000 | 1.000 | 1.000 |
| Área máxima por análisis (km²) | 1 | 25 | 500 | 100 | 2.000 |
| Filas máximas por exportación | 0 | 20.000 | 250.000 | 100.000 | 5.000.000 |
| Teselas por día | 20.000 | 200.000 | 2.000.000 | 1.000.000 | 50.000.000 |
| Usuarios incluidos | 1 | 1 | 5 | 1 | 50 |
| Consultas detalladas/mes | 3 | sin límite | sin límite | sin límite | sin límite |
| Informes/mes | 0 | 20 | 200 | 0 | sin límite |

## Funciones por plan

| Función | Gratis | Pro | Business | API | Enterprise |
| --- | --- | --- | --- | --- | --- |
| Exportar | — | ✔ | ✔ | ✔ | ✔ |
| Búsqueda avanzada (`POST /parcels/query`) | — | ✔ | ✔ | ✔ | ✔ |
| Análisis de zona (`POST /areas/analyze`) | — | ✔ | ✔ | ✔ | ✔ |
| Aptitud (`POST /suitability`) | — | ✔ | ✔ | ✔ | ✔ |
| Localización de negocio (`POST /location-intel`) | — | — | ✔ | — | ✔ |
| Cambio territorial (`POST /changes/compare`) | — | — | ✔ | — | ✔ |
| Acceso a la GeoAPI | — | — | ✔ | ✔ | ✔ |
| Marca blanca en informes | — | — | ✔ | — | ✔ |
| Alertas | — | — | ✔ | — | ✔ |
| Lotes de informes | — | — | ✔ | — | ✔ |
| Marca de agua en mapas | Sí | No | No | No | No |

## Formatos de exportación por plan

| Plan | Formatos |
| --- | --- |
| Pago por informe | `pdf` |
| Pro | `pdf`, `xlsx`, `csv`, `geojson`, `kml` |
| API | `geojson`, `csv`, `xlsx` |
| Business y Enterprise | `pdf`, `xlsx`, `csv`, `geojson`, `gpkg`, `shp`, `kml` |

## Costo en créditos por operación

| Operación | Créditos |
| --- | --- |
| Informe resumen (`report_summary`) | 5 |
| Informe completo (`report_full`) | 15 |
| Informe técnico (`report_technical`) | 25 |
| Análisis de zona grande (`area_analysis_large`) | 10 |
| Localización de negocio (`location_intel`) | 20 |
| Exportación masiva (`bulk_export`) | 15 |
| Comparación entre cortes (`change_compare`) | 8 |
| Pregunta al asistente (`ai_ask`) | 1 |

Un «análisis de zona grande» es cualquiera que supere 5 km². Por debajo de eso no cuesta
créditos.

## Cómo saber cuánto te queda

Cada respuesta trae cabeceras de cuota:

```http
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1758461460
X-TC-Credits-Remaining: 4830
X-TC-Credits-Cost: 0
```

| Cabecera | Significado |
| --- | --- |
| `X-RateLimit-Limit` | Peticiones por minuto de tu plan |
| `X-RateLimit-Remaining` | Peticiones que te quedan en esta ventana |
| `X-RateLimit-Reset` | Epoch en segundos en que se reinicia la ventana |
| `X-TC-Credits-Remaining` | Créditos disponibles después de esta llamada |
| `X-TC-Credits-Cost` | Créditos que costó **esta** llamada |

## Cuando se agota

### Límite de peticiones

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 23
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Demasiadas peticiones. Espera unos segundos.",
    "details": {}
  }
}
```

Respeta `Retry-After`. Reintentar antes solo alarga el bloqueo.

### Cuota del periodo

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Alcanzaste el límite de tu plan para esta operación. Puedes esperar al próximo periodo o mejorar tu plan.",
    "details": { "what": "detailed_queries" }
  }
}
```

Código HTTP `402`, no `429`: no es un problema de ritmo, es que se acabó el cupo.

### Créditos

```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "No tienes créditos suficientes para esta operación (necesitas 15).",
    "details": { "needed": 15, "available": 3 }
  }
}
```

`details.needed` y `details.available` te permiten mostrar al usuario exactamente cuánto falta.

### Área demasiado grande

```json
{
  "error": {
    "code": "AREA_TOO_LARGE",
    "message": "El área que dibujaste (742,30 km²) supera el límite de tu plan (100 km²). Dibuja un área más pequeña o mejora tu plan.",
    "details": { "area": 742.3, "limit": 100 }
  }
}
```

Código HTTP `413`. Divide el polígono y suma los resultados, o sube de plan.

## Cómo gastar menos

- **Usa `ETag`.** Una respuesta `304` no consume cuota. Ver
  [Paginación y caché](/guia/paginacion-y-cache#etag-y-condicionales).
- **Pide solo lo que necesitas.** En `POST /parcels/query`, `geometry: "none"` o `"centroid"` en
  lugar de `"full"` reduce mucho el trabajo y el tamaño.
- **Filtra por `bbox`** en lugar de traer todo y descartar en el cliente.
- **Encola los análisis grandes.** `POST /areas/analyze` con `async: true` devuelve un trabajo y
  no bloquea tu petición ni tu ventana de ritmo.
- **Cachea del lado tuyo.** Los datos catastrales cambian por cortes mensuales: una ficha de
  predio se puede cachear hasta el siguiente corte, que viene en `meta.cutDate`.
- **No hagas polling.** Para los trabajos asíncronos usa SSE
  (`GET /jobs/:id/events`) en lugar de consultar en bucle.

## Excedentes en el plan API

Por encima de los créditos incluidos, el plan API cobra por consumo en escalones. El excedente
se factura al cierre del periodo y **no** corta el servicio: preferimos que tu integración siga
funcionando y que la conversación sea sobre la factura, no sobre una caída.

Puedes fijar un techo de gasto en **Cuenta → Facturación → Límite de excedente**. Al llegar al
techo, la API empieza a responder `402 QUOTA_EXCEEDED` en lugar de seguir cobrando.
