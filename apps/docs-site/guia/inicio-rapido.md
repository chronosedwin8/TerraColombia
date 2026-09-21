---
title: Inicio rápido
description: De cero a tu primera respuesta de la GeoAPI de TerraColombia en menos de cinco minutos.
---

# Inicio rápido

**Objetivo: en menos de cinco minutos tienes una llave, haces una llamada y entiendes la
respuesta.** Cuatro pasos, sin instalar nada.

## 1. Consigue una llave (1 minuto)

1. Crea una cuenta en <https://terracolombia.co/registro>.
2. Entra en **Cuenta → Llaves de API** y pulsa **Crear llave**.
3. Elige el entorno **Sandbox**, que es gratuito y no consume créditos.
4. Copia la llave. **Se muestra una sola vez**: guardamos solo su hash, así que si la pierdes hay
   que crear otra.

Una llave se ve así:

```
tc_sandbox_7f3a9c2e5b8d1046a7c3e9f2b5d8a104
```

Exporta la llave para el resto de la guía:

::: code-group

```bash [bash / zsh]
export TC_API_KEY="tc_sandbox_7f3a9c2e5b8d1046a7c3e9f2b5d8a104"
```

```powershell [PowerShell]
$env:TC_API_KEY = "tc_sandbox_7f3a9c2e5b8d1046a7c3e9f2b5d8a104"
```

:::

::: warning La llave es un secreto
No la pongas en código de navegador ni en un repositorio. Para el frontend, usa tu propio
backend como intermediario. Ver [Autenticación](/guia/autenticacion#donde-no-poner-la-llave).
:::

## 2. Tu primera llamada con curl (1 minuto)

Busca un municipio por nombre. `/search` acepta nombres, direcciones, códigos prediales,
coordenadas y topónimos, así que es el mejor punto de entrada.

```bash
curl -s "https://api.terracolombia.co/geo/v1/search?q=Sabanalarga" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Accept: application/json"
```

Respuesta (recortada):

```json
{
  "data": [
    {
      "kind": "municipality",
      "code": "08638",
      "label": "Sabanalarga, Atlántico",
      "centroid": [-74.9217, 10.6317],
      "score": 0.98
    }
  ],
  "meta": {
    "sources": [
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
    "cutDate": "2025-12-31",
    "coverage": null,
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

Si ves esto, ya estás dentro. Si no, mira [Errores](/guia/errores).

## 3. La misma llamada con `fetch` (1 minuto)

Desde Node 18+, Deno, Bun o un backend en cualquier runtime con `fetch`:

```js
const API = 'https://api.terracolombia.co/geo/v1';
const KEY = process.env.TC_API_KEY;

async function geoapi(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'X-API-Key': KEY,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    // El cuerpo de error trae { error: { code, message, details } }.
    // `message` ya viene en español y se puede mostrar al usuario tal cual.
    throw new Error(`${body.error.code}: ${body.error.message}`);
  }

  return body;
}

const { data, meta } = await geoapi('/search?q=Sabanalarga');
console.log(data[0].label, '·', meta.sources[0].attribution);
```

Ahora pide la ficha completa de un predio por su Número Predial Nacional:

```js
const { data: parcel, meta } = await geoapi('/parcels/080010102000000010001000000000');

console.log(parcel.address, parcel.areaGeomM2, 'm²');
console.log('Corte de los datos:', meta.cutDate);
```

## 4. Lee el bloque `meta` (2 minutos)

**Esto es lo que diferencia esta API.** Toda respuesta trae un bloque `meta` y hay que leerlo:
sin él, las cifras no significan nada.

```json
{
  "meta": {
    "sources": [ /* … */ ],
    "cutDate": "2026-07-31",
    "coverage": {
      "muniCode": "08001",
      "cadastralManager": "Alcaldía de Barranquilla",
      "isIgac": false,
      "status": "none",
      "availableLayers": ["población", "colegios", "salud", "suelos", "vías"],
      "message": "Este municipio lo gestiona la Alcaldía de Barranquilla…"
    },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": ["El snapshot del POT municipal tiene más de 12 meses."]
  }
}
```

| Campo | Para qué sirve | Qué hacer con él |
| --- | --- | --- |
| `sources[]` | Fuente, dataset, fecha de corte, licencia, atribución y URL de **cada** cifra | Mostrar la atribución. Es **obligatorio** para los datos con licencia CC BY-SA 4.0 y ODbL |
| `cutDate` | Fecha de corte más reciente de las fuentes usadas | Mostrarla junto a las cifras. Un dato sin fecha no es un dato |
| `coverage` | Gestor catastral del municipio y estado de la cobertura | Si `status` es `none` o `partial`, **dile al usuario por qué faltan datos**. No muestres un mapa vacío |
| `synthetic` | `true` si alguna fuente es un snapshot de demostración | Si es `true`, marca la pantalla con "datos de demostración". Nunca presentes esas cifras como reales |
| `warnings[]` | Avisos sobre la calidad o la vigencia de los datos | Mostrarlos. Están escritos para que los lea un usuario final |
| `generatedAt` | Momento en que se calculó la respuesta | Útil para tu propia caché |

::: tip La regla del producto, en una línea
**Sin procedencia no se muestra.** Si tu interfaz enseña una cifra de esta API sin su fuente y
su fecha de corte, estás incumpliendo la licencia de los datos y desinformando a tu usuario.
:::

### Valores que faltan

Cuando un dato no existe en las fuentes, la API **no lo estima**: devuelve `null` o la cadena
literal `"NO_DISPONIBLE"`.

```json
{ "cadastralValue": "NO_DISPONIBLE", "valuationYear": null }
```

Trata los dos casos igual: «no disponible». No los interpretes como cero.

## Ya está. ¿Y ahora?

- [Cuotas y planes](/guia/cuotas-y-planes) — cuántas llamadas y qué funciones incluye tu plan.
- [Paginación, caché y bbox](/guia/paginacion-y-cache) — cómo recorrer muchos resultados sin
  quemar la cuota.
- [POST /parcels/query](/referencia/predios-consulta) — el DSL de filtros, que es lo más potente
  de la API.
- [Licencias y atribución](/guia/licencias-y-atribucion) — **léelo antes** de construir un
  producto encima.
- [Playground](/playground) — probar endpoints desde el navegador con tu llave.

## Resumen para copiar y pegar

```bash
export TC_API_KEY="tu_llave"
BASE="https://api.terracolombia.co/geo/v1"

# Buscar
curl -s "$BASE/search?q=Sabanalarga" -H "X-API-Key: $TC_API_KEY"

# Ficha de municipio (incluye gestor catastral y cobertura)
curl -s "$BASE/municipalities/08638" -H "X-API-Key: $TC_API_KEY"

# Ficha de predio
curl -s "$BASE/parcels/080010102000000010001000000000" -H "X-API-Key: $TC_API_KEY"

# Qué hay alrededor de un punto
curl -s "$BASE/nearby?lat=10.9878&lng=-74.7964&radius=800&layers=school,health_facility" \
  -H "X-API-Key: $TC_API_KEY"

# Catálogo de capas y glosario
curl -s "$BASE/layers" -H "X-API-Key: $TC_API_KEY"
```
