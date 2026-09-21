---
title: POST /suitability
description: Semáforo de aptitud de un predio o de una zona para un uso objetivo, con desglose por factor.
---

# `POST /suitability`

Semáforo de aptitud para un uso objetivo, **siempre con el desglose por factor**.

```
POST /geo/v1/suitability
Content-Type: application/json
```

**Ámbito requerido:** `analyze:areas` · **Planes:** Pro, Business, API, Enterprise

::: info Qué es y qué no es
Esto es un **indicador territorial**: compara los datos del predio con umbrales declarados. No es
un avalúo, ni un concepto de norma urbanística, ni un estudio técnico. No dice «compre» ni «no
compre». Muestra factores y deja que el criterio lo ponga quien decide.
:::

## Cuerpo

```json
{
  "target": { "kind": "parcel", "npn": "080010102000000010001000000000" },
  "use": "vivienda_unifamiliar",
  "weights": { "pendiente": 0.15, "amenaza_inundacion": 0.45 }
}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `target` | objeto | `{ kind: "parcel", npn }` o `{ kind: "area", scope }` con el mismo `scope` de [`/areas/analyze`](/referencia/areas-analizar) |
| `use` | enum | Uso objetivo (tabla abajo) |
| `weights` | objeto | Pesos por indicador, de 0 a 1. Opcional; se renormalizan para sumar 1 |

## Usos objetivo

| `use` | Descripción |
| --- | --- |
| `vivienda_unifamiliar` | Casa individual |
| `vivienda_multifamiliar` | Edificio de apartamentos |
| `bodega_logistica` | Bodega o centro de distribución |
| `agricultura` | Cultivos |
| `ganaderia` | Pastoreo |
| `colegio` | Establecimiento educativo |
| `comercio_local` | Local comercial de barrio |
| `industria` | Uso industrial |
| `turismo_rural` | Alojamiento o actividad turística rural |
| `solar_fotovoltaico` | Generación solar |

Cada uso trae su propio conjunto de indicadores y pesos por omisión. Los puedes consultar con
`GET /suitability/uses`.

## Petición

::: code-group

```bash [curl]
curl -s -X POST "https://api.terracolombia.co/geo/v1/suitability" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "target": { "kind": "parcel", "npn": "080010102000000010001000000000" },
    "use": "vivienda_unifamiliar"
  }'
```

```js [fetch]
const { data, meta } = await geoapi('/suitability', {
  method: 'POST',
  body: JSON.stringify({
    target: { kind: 'parcel', npn: '080010102000000010001000000000' },
    use: 'vivienda_unifamiliar',
  }),
});

// Nunca muestres data.score sin data.factors.
for (const f of data.factors) {
  console.log(f.label, f.score, f.flag, f.explanation);
}
```

:::

## Respuesta

```json
{
  "data": {
    "targetUse": "vivienda_unifamiliar",
    "targetUseLabel": "Vivienda unifamiliar",
    "score": 72,
    "verdict": "condicionado",
    "verdictLabel": "Favorable con condiciones",
    "factors": [
      {
        "indicator": "pendiente",
        "label": "Pendiente del terreno",
        "score": 95,
        "rawValue": 2.1,
        "unit": "%",
        "weight": 0.25,
        "direction": "lower_is_better",
        "formula": "100 − min(100, pendiente_media_pct × 2)",
        "sourceDatasetIds": ["copernicus-dem-30"],
        "explanation": "El terreno es casi plano, así que construir no exige movimientos de tierra.",
        "flag": "ok"
      },
      {
        "indicator": "amenaza_inundacion",
        "label": "Amenaza de inundación",
        "score": 35,
        "rawValue": "media",
        "unit": null,
        "weight": 0.35,
        "direction": "categorical",
        "formula": "mapa de nivel de amenaza a puntaje: baja=100, media=35, alta=0",
        "sourceDatasetIds": ["ideam-inundaciones"],
        "explanation": "El 22 % del predio queda en zona de amenaza media de inundación según la capa nacional.",
        "flag": "caution"
      },
      {
        "indicator": "acceso_vial",
        "label": "Acceso vial",
        "score": 88,
        "rawValue": 35,
        "unit": "m",
        "weight": 0.2,
        "direction": "lower_is_better",
        "formula": "100 − min(100, distancia_a_via_m / 10)",
        "sourceDatasetIds": ["osm-colombia-vias"],
        "explanation": "El predio da a la Calle 72, a 35 m del eje vial.",
        "flag": "ok"
      },
      {
        "indicator": "servicios_publicos",
        "label": "Cobertura de servicios públicos",
        "score": null,
        "rawValue": null,
        "unit": null,
        "weight": 0.2,
        "direction": "higher_is_better",
        "formula": "cobertura declarada en la zona homogénea física",
        "sourceDatasetIds": ["igac-zonas-homogeneas"],
        "explanation": "No tenemos la zona homogénea física de este predio, así que no calculamos este factor.",
        "flag": "unknown"
      }
    ],
    "blockers": [],
    "cautions": ["Amenaza media de inundación en el 22 % del predio"],
    "missing": ["Cobertura de servicios públicos (zona homogénea física no disponible)"],
    "disclaimer": "Este semáforo es un indicador territorial, no un concepto técnico ni un avalúo. No reemplaza los estudios exigidos para licencias de construcción o urbanización."
  },
  "meta": {
    "sources": [
      { "datasetId": "copernicus-dem-30", "source": "Copernicus", "name": "Modelo digital de elevación 30 m", "cutDate": "2023-12-31", "license": "datos-abiertos-co", "attribution": "Contiene datos modificados de Copernicus", "url": null, "synthetic": false },
      { "datasetId": "ideam-inundaciones", "source": "IDEAM", "name": "Zonas susceptibles de inundación", "cutDate": "2024-06-30", "license": "datos-abiertos-co", "attribution": "Fuente: IDEAM", "url": null, "synthetic": false },
      { "datasetId": "osm-colombia-vias", "source": "OpenStreetMap", "name": "Extracto de Colombia — vías", "cutDate": "2026-08-01", "license": "ODbL-1.0", "attribution": "© colaboradores de OpenStreetMap, ODbL 1.0", "url": null, "synthetic": false }
    ],
    "cutDate": "2026-08-01",
    "coverage": { "muniCode": "08001", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": ["Las capas de amenaza provienen de estudios a escala regional o nacional."]
  }
}
```

## El veredicto

| `verdict` | `verdictLabel` | Significa |
| --- | --- | --- |
| `favorable` | Favorable | No encontramos restricciones relevantes para el uso elegido |
| `condicionado` | Favorable con condiciones | Es viable, pero hay factores que encarecen o limitan |
| `desfavorable` | Desfavorable | Al menos una restricción fuerte |
| `sin_datos` | Sin datos suficientes | Faltan factores obligatorios. `score` es `null` |

::: danger El color nunca va solo
Si pintas un semáforo, acompáñalo **siempre** del texto de `verdictLabel` y de un icono. Un
usuario con daltonismo, o un informe impreso en blanco y negro, no distinguen verde de rojo.
Es un requisito de accesibilidad (WCAG 1.4.1) y una regla del producto.
:::

## Los factores

| Campo | Descripción |
| --- | --- |
| `indicator` | Identificador estable del indicador |
| `label` | Nombre para mostrar |
| `score` | 0 a 100, ya orientado: **100 siempre es lo mejor** para el uso elegido. `null` si falta el dato |
| `rawValue` | Valor crudo tal como sale de los datos |
| `unit` | Unidad del valor crudo |
| `weight` | Peso en el puntaje compuesto, de 0 a 1. Suman 1 entre todos |
| `direction` | `higher_is_better`, `lower_is_better` o `categorical` |
| `formula` | La fórmula, en texto. Es lo que responde «¿cómo se calcula?» |
| `sourceDatasetIds` | Datasets de los que sale. Cruzar con `meta.sources[]` |
| `explanation` | Explicación en español claro, para un usuario no técnico |
| `flag` | `ok`, `caution`, `blocker` o `unknown` |

::: warning Nunca publiques `score` sin `factors`
El puntaje compuesto es una combinación ponderada que depende de pesos discutibles. El valor de
este endpoint está en el desglose: permite que alguien esté en desacuerdo con el **criterio**, no
solo con el resultado. Mostrar «72/100» a secas convierte un indicador explicable en un oráculo.
:::

## `blockers`, `cautions` y `missing`

| Campo | Contenido |
| --- | --- |
| `blockers` | Restricciones fuertes. Si no está vacío, `verdict` es `desfavorable` |
| `cautions` | Puntos que encarecen o limitan |
| `missing` | Factores que no se pudieron calcular. **No se estiman** |

Si `missing` deja fuera un factor obligatorio del uso, `verdict` es `sin_datos` y `score` es
`null`. La API prefiere decir «no sé» a inventar un número.

## Pesos personalizados

```json
{
  "target": { "kind": "parcel", "npn": "080010102000000010001000000000" },
  "use": "bodega_logistica",
  "weights": { "acceso_vial": 0.5, "pendiente": 0.1, "area_disponible": 0.4 }
}
```

- Los pesos van de 0 a 1 y se **renormalizan** para sumar 1.
- Un indicador con peso 0 se calcula igual y aparece en `factors`, pero no afecta al puntaje: así
  el usuario ve lo que decidió ignorar.
- Los indicadores que no menciones conservan su peso por omisión antes de la renormalización.
- Poner un peso a un indicador que ese uso no contempla devuelve `400 VALIDATION` con la lista de
  indicadores válidos.

Los pesos que se usaron vienen en `factors[].weight`, así que el resultado siempre es
reproducible.

## Aptitud de una zona

```json
{
  "target": {
    "kind": "area",
    "scope": { "kind": "polygon", "geometry": { "type": "Polygon", "coordinates": [[]] } }
  },
  "use": "agricultura"
}
```

Los factores se calculan sobre el agregado del ámbito: pendiente media, porcentaje de área bajo
amenaza, distancia media a vía. `blockers` incluye lo que afecte a **cualquier** parte de la
zona, porque una restricción en una esquina sigue siendo una restricción.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Uso desconocido, peso fuera de 0–1, indicador que no aplica al uso |
| `INVALID_NPN` | 400 | El código predial no es válido |
| `PARCEL_NOT_FOUND` | 404 | El predio no está en los cortes cargados |
| `AREA_TOO_LARGE` | 413 | El ámbito supera el límite del plan |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El plan no incluye aptitud de terreno |
| `TIMEOUT` | 504 | Ámbito demasiado grande |
