---
title: GET /parcels/:npn/history
description: Cambios de un predio entre cortes de la base catastral.
---

# `GET /parcels/:npn/history`

Qué ha cambiado en un predio entre los cortes que tenemos cargados.

```
GET /geo/v1/parcels/:npn/history
```

**Ámbito requerido:** `read:changes`

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `fromCutDate` | string | el más antiguo cargado | `AAAA-MM-DD` |
| `toCutDate` | string | el más reciente | `AAAA-MM-DD` |
| `changeTypes` | string | todos | `created,removed,attrs_changed,geometry_changed,building_added` |
| `includeGeometry` | boolean | `false` | Incluir la geometría de cada corte |

## Petición

```bash
curl -s "https://api.terracolombia.co/geo/v1/parcels/080010102000000010001000000000/history" \
  -H "X-API-Key: $TC_API_KEY"
```

## Respuesta

```json
{
  "data": {
    "npn": "080010102000000010001000000000",
    "cutDatesAvailable": ["2026-05-31", "2026-06-30", "2026-07-31"],
    "firstSeen": "2026-05-31",
    "lastSeen": "2026-07-31",
    "present": true,
    "changes": [
      {
        "fromCutDate": "2026-06-30",
        "toCutDate": "2026-07-31",
        "changeType": "attrs_changed",
        "changeLabel": "Cambio de atributos",
        "detail": "El área construida pasó de 300 m² a 340 m².",
        "fields": [
          { "field": "builtAreaM2", "before": 300, "after": 340 },
          { "field": "cadastralValue", "before": 268000000, "after": 285000000 }
        ],
        "geometryIoU": null
      },
      {
        "fromCutDate": "2026-05-31",
        "toCutDate": "2026-06-30",
        "changeType": "geometry_changed",
        "changeLabel": "Cambio de geometría",
        "detail": "La geometría cambió: el índice de superposición entre los dos cortes es 0,94.",
        "fields": [{ "field": "areaGeomM2", "before": 792.1, "after": 812.5 }],
        "geometryIoU": 0.94
      }
    ]
  },
  "meta": {
    "sources": [
      {
        "datasetId": "igac-catastro-terreno",
        "source": "IGAC",
        "name": "Base Catastral Pública — capa de terrenos",
        "cutDate": "2026-07-31",
        "license": "CC-BY-SA-4.0",
        "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0",
        "url": "https://www.datos.gov.co/",
        "synthetic": false
      }
    ],
    "cutDate": "2026-07-31",
    "coverage": { "muniCode": "08001", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

## Tipos de cambio

| `changeType` | Significa | Cómo se detecta |
| --- | --- | --- |
| `created` | El NPN aparece por primera vez | Está en el corte B y no en el A |
| `removed` | El NPN deja de aparecer | Está en el corte A y no en el B |
| `attrs_changed` | Cambió algún atributo | Comparación campo a campo del registro alfanumérico |
| `geometry_changed` | Cambió la forma o el tamaño | Índice de superposición (intersección sobre unión) menor que 0,98 |
| `building_added` | Apareció una construcción nueva | Comparación de la capa de construcciones del mismo predio |

## Lo que un cambio **no** significa {#interpretacion}

::: warning Este endpoint describe el dato, no su causa
- Una **baja** (`removed`) no es una demolición ni una venta. Puede ser un **englobe** (varios
  predios se unieron en uno), un **desenglobe** (uno se partió en varios), una corrección
  cartográfica o un ajuste administrativo del gestor catastral. Los englobes y desenglobes
  **cambian el NPN**, así que el predio «desaparece» y aparecen otros.
- Un **alta** (`created`) no significa que se construyó algo. Suele ser el otro lado de un
  desenglobe.
- Un **cambio de avalúo** no refleja el mercado: refleja un proceso catastral.
- La **fecha del cambio** es la fecha del corte en que se publicó, no la fecha en que ocurrió el
  hecho en terreno. Los procesos catastrales se publican con rezago.
:::

Si tu interfaz muestra estos cambios, muestra también esta explicación. Un usuario que vea
«predio eliminado» sin contexto sacará la conclusión equivocada.

## `geometryIoU`

El **índice de superposición** (*Intersection over Union*) compara la geometría del corte A con
la del corte B:

```
IoU = área(A ∩ B) / área(A ∪ B)
```

| Valor | Interpretación |
| --- | --- |
| 1,00 | Geometrías idénticas |
| 0,98 – 1,00 | Diferencia despreciable; no se marca como cambio |
| 0,80 – 0,98 | Ajuste de linderos o mejora cartográfica |
| < 0,80 | Cambio sustancial: probable englobe, desenglobe o redefinición |

## Predio con un solo corte

```json
{
  "data": {
    "npn": "080010102000000010001000000000",
    "cutDatesAvailable": ["2026-07-31"],
    "firstSeen": "2026-07-31",
    "lastSeen": "2026-07-31",
    "present": true,
    "changes": []
  },
  "meta": {
    "warnings": [
      "Solo tenemos un corte de la base catastral para este predio, así que todavía no hay historial que comparar."
    ]
  }
}
```

`changes: []` con ese aviso significa «todavía no hay con qué comparar», no «nunca cambió».

## Predio que dejó de aparecer

```json
{
  "data": {
    "npn": "080010102000000010009000000000",
    "cutDatesAvailable": ["2026-05-31", "2026-06-30", "2026-07-31"],
    "firstSeen": "2026-05-31",
    "lastSeen": "2026-06-30",
    "present": false,
    "changes": [
      {
        "fromCutDate": "2026-06-30",
        "toCutDate": "2026-07-31",
        "changeType": "removed",
        "changeLabel": "El predio dejó de aparecer",
        "detail": "El NPN no está en el corte 2026-07-31. Puede corresponder a un englobe, un desenglobe o una corrección de la fuente; este informe no infiere la causa.",
        "fields": [],
        "geometryIoU": null
      }
    ]
  },
  "meta": { }
}
```

`present: false` indica que el predio no está en el corte más reciente.

## Para analizar una zona entera

Este endpoint es para un predio. Para comparar todos los predios de un área entre dos cortes,
usa [`POST /changes/compare`](/referencia/cambios), que además devuelve los agregados.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `INVALID_NPN` | 400 | El código predial no es válido |
| `PARCEL_NOT_FOUND` | 404 | El NPN no aparece en ningún corte cargado |
| `VALIDATION` | 400 | `fromCutDate` posterior a `toCutDate`, o un corte que no existe |
| `FORBIDDEN` | 403 | Falta el ámbito `read:changes`, o el plan no incluye cambio territorial |
