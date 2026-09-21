---
title: GET /indicators/:muniCode
description: Indicadores agregados de un municipio, con su fórmula, su serie de tiempo y su procedencia.
---

# `GET /indicators/:muniCode`

Indicadores agregados de un municipio: el observatorio, por API.

```
GET /geo/v1/indicators/:muniCode
```

**Ámbito requerido:** `read:indicators`

## Parámetros

| Parámetro | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `muniCode` | ruta | — | Código DIVIPOLA de 5 dígitos |
| `indicators` | consulta | todos | Lista separada por comas de identificadores |
| `period` | consulta | el más reciente | `AAAA-MM` o `AAAA` |
| `series` | consulta | `false` | `true` incluye la serie histórica de cada indicador |
| `compareWith` | consulta | — | `department`, `country` o una lista de códigos DIVIPOLA |

## Petición

::: code-group

```bash [curl]
curl -s "https://api.terracolombia.co/geo/v1/indicators/08638?series=true&compareWith=department" \
  -H "X-API-Key: $TC_API_KEY"
```

```js [fetch]
const { data, meta } = await geoapi('/indicators/08638?series=true&compareWith=department');

for (const ind of data.indicators) {
  console.log(ind.label, ind.value, ind.unit, '·', ind.formula);
}
```

:::

## Respuesta

```json
{
  "data": {
    "muniCode": "08638",
    "muniName": "Sabanalarga",
    "deptCode": "08",
    "deptName": "Atlántico",
    "period": "2026-07",
    "indicators": [
      {
        "indicator": "densidad_predial_urbana",
        "label": "Densidad predial urbana",
        "value": 1842.3,
        "unit": "predios/km²",
        "period": "2026-07",
        "formula": "predios urbanos / área del perímetro urbano en km²",
        "explanation": "Cuántos predios hay por kilómetro cuadrado dentro del perímetro urbano. Una densidad alta suele indicar un tejido urbano consolidado.",
        "sourceDatasetIds": ["igac-catastro-terreno", "igac-catastro-perimetro"],
        "direction": "higher_is_better",
        "comparison": {
          "departmentValue": 1204.8,
          "departmentRank": 4,
          "departmentTotal": 23,
          "percentile": 0.83
        },
        "series": [
          { "period": "2026-05", "value": 1830.1 },
          { "period": "2026-06", "value": 1836.7 },
          { "period": "2026-07", "value": 1842.3 }
        ]
      },
      {
        "indicator": "suelo_sin_construir_urbano",
        "label": "Suelo urbano sin construir",
        "value": 12.4,
        "unit": "%",
        "period": "2026-07",
        "formula": "área de predios urbanos sin construcción / área total de predios urbanos × 100",
        "explanation": "Qué porcentaje del suelo urbano está en lotes sin construir. Es una medida de potencial de desarrollo, no de disponibilidad para comprar.",
        "sourceDatasetIds": ["igac-catastro-terreno", "igac-catastro-construccion"],
        "direction": "higher_is_better",
        "comparison": { "departmentValue": 18.9, "departmentRank": 17, "departmentTotal": 23, "percentile": 0.26 },
        "series": []
      },
      {
        "indicator": "cobertura_educativa",
        "label": "Cobertura educativa",
        "value": null,
        "unit": "cupos por persona en edad escolar",
        "period": "2026-07",
        "formula": "matrícula total / población de 5 a 17 años",
        "explanation": "No lo calculamos para este municipio porque la matrícula del MEN no está disponible en el corte actual. No lo estimamos.",
        "sourceDatasetIds": ["men-establecimientos-educativos", "dane-mgn-manzanas"],
        "direction": "higher_is_better",
        "comparison": null,
        "series": []
      }
    ]
  },
  "meta": {
    "sources": [
      { "datasetId": "igac-catastro-terreno", "source": "IGAC", "name": "Base Catastral Pública — capa de terrenos", "cutDate": "2026-07-31", "license": "CC-BY-SA-4.0", "attribution": "Fuente: IGAC, Base Catastral, corte 2026-07, CC BY-SA 4.0", "url": "https://www.datos.gov.co/", "synthetic": false },
      { "datasetId": "dane-mgn-manzanas", "source": "DANE", "name": "Marco Geoestadístico Nacional — manzanas censales", "cutDate": "2024-12-31", "license": "datos-abiertos-co", "attribution": "Fuente: DANE, MGN 2024", "url": "https://geoportal.dane.gov.co/", "synthetic": false }
    ],
    "cutDate": "2026-07-31",
    "coverage": { "muniCode": "08638", "cadastralManager": "Instituto Geográfico Agustín Codazzi (IGAC)", "isIgac": true, "status": "full", "availableLayers": [], "message": null },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": ["El indicador cobertura_educativa no se pudo calcular: falta la matrícula del MEN en el corte actual."]
  }
}
```

## Indicadores disponibles

| `indicator` | Unidad | Qué mide |
| --- | --- | --- |
| `densidad_predial_urbana` | predios/km² | Predios urbanos por km² de perímetro urbano |
| `densidad_predial_rural` | predios/km² | Predios rurales por km² de suelo rural |
| `suelo_sin_construir_urbano` | % | Área de lotes urbanos sin construcción |
| `area_predial_mediana_urbana` | m² | Mediana del área de los predios urbanos |
| `area_predial_mediana_rural` | m² | Mediana del área de los predios rurales |
| `indice_construccion` | adimensional | Área construida sobre área de terreno |
| `dinamica_predial_mensual` | % | Predios con cambio en el último corte |
| `altas_prediales` | conteo | Predios nuevos en el último corte |
| `bajas_prediales` | conteo | Predios dados de baja en el último corte |
| `construcciones_nuevas` | conteo | Construcciones nuevas registradas |
| `densidad_poblacional` | hab/km² | Población sobre área municipal |
| `poblacion_edad_escolar` | personas | Población de 5 a 17 años |
| `cobertura_educativa` | cupos/persona | Matrícula sobre población en edad escolar |
| `cobertura_salud` | prestadores/10.000 hab | Prestadores REPS por cada 10.000 habitantes |
| `accesibilidad_vial_media` | 0–100 | Distancia media a vía secundaria o superior, normalizada |
| `pendiente_media` | % | Pendiente media del territorio municipal |
| `area_protegida_pct` | % | Porcentaje del municipio en área protegida |
| `area_amenaza_alta_pct` | % | Porcentaje en amenaza alta (cualquier tipo) |

La lista viva, con la fórmula de cada uno, está en `GET /indicators/catalog`.

## Cada indicador trae su fórmula

`formula` y `explanation` no son decorativos: son lo que permite que alguien discuta el
**criterio**. Si tu interfaz muestra un indicador, muestra también cómo se calcula, aunque sea
detrás de un «¿cómo se calcula?».

## Comparaciones

Con `compareWith=department`:

| Campo | Significa |
| --- | --- |
| `departmentValue` | Valor del departamento (agregado, no promedio de municipios) |
| `departmentRank` | Puesto del municipio, 1 es el mejor según `direction` |
| `departmentTotal` | Municipios del departamento **con dato** para ese indicador |
| `percentile` | Percentil dentro de los municipios con dato, de 0 a 1 |

::: warning Los municipios sin dato no entran en el ranking
`departmentTotal` cuenta solo los que tienen dato. Un municipio ausente del ranking **no** es un
municipio con valor bajo: es un municipio sin dato. Si no lo aclaras en tu interfaz, el ranking
miente.
:::

Con `compareWith=country` se compara contra el agregado nacional. Con una lista de códigos
(`compareWith=08001,08296,08638`) se comparan esos municipios entre sí, que es lo útil para
comparar pares reales en lugar de todo el departamento.

## Series de tiempo

Con `series=true`, cada indicador trae su histórico por periodo. La granularidad depende de la
fuente: los indicadores catastrales son mensuales (siguen los cortes del IGAC), los de población
son anuales.

Una serie vacía significa que solo hay un periodo cargado, no que el indicador sea nuevo.

## Indicadores sin dato

`value: null` con la explicación de por qué en `explanation` y en `meta.warnings`. **No se
estima, no se interpola y no se arrastra el valor del periodo anterior.**

Si tu gráfica necesita continuidad, decide tú qué hacer con el hueco, pero no asumas que la API
te dio un cero.

## Municipio sin cobertura catastral

Los indicadores catastrales vienen en `null`; los de población, educación, salud y relieve **sí**
se calculan, porque no dependen del catastro. `meta.coverage` lo explica.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `NOT_FOUND` | 404 | El código DIVIPOLA no existe |
| `VALIDATION` | 400 | Indicador desconocido, periodo mal formado, `compareWith` inválido |
| `FORBIDDEN` | 403 | Falta el ámbito `read:indicators` |
