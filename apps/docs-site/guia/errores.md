---
title: Errores
description: Formato de error, tabla completa de códigos de la GeoAPI y qué hacer con cada uno.
---

# Errores

## Formato

Todo error tiene el mismo cuerpo:

```json
{
  "error": {
    "code": "PARCEL_NOT_FOUND",
    "message": "No hay un predio con ese código predial en los cortes que tenemos. Verifica los dígitos o busca por dirección.",
    "details": { "npn": "080010102000000019999000000000" }
  }
}
```

| Campo | Para qué |
| --- | --- |
| `code` | **Estable.** Es el valor sobre el que debes programar tu lógica |
| `message` | Texto en español de Colombia, escrito para un usuario final. Se puede mostrar tal cual |
| `details` | Contexto estructurado del caso concreto. Su forma depende del código |

::: tip Programa contra `code`, muestra `message`
Los mensajes se pueden reescribir para mejorar la claridad; los códigos no cambian sin una versión
nueva de la API. Y los mensajes ya están redactados para el usuario final: no hace falta que
traduzcas `PARCEL_NOT_FOUND` a español, porque `message` ya lo está.
:::

## Tabla de códigos

| `code` | HTTP | Cuándo ocurre | Qué hacer |
| --- | --- | --- | --- |
| `NOT_FOUND` | 404 | El recurso no existe | Revisar el identificador |
| `PARCEL_NOT_FOUND` | 404 | El NPN tiene estructura válida pero no está en los cortes cargados | Verificar dígitos, o buscar por dirección con `/search`. Puede ser un municipio sin cobertura: ver `meta.coverage` |
| `INVALID_NPN` | 400 | El código predial no tiene 30 dígitos (ni 20 en el formato anterior) | Corregir el código. Ver [GET /parcels/:npn](/referencia/predios#formato-del-npn) |
| `VALIDATION` | 400 | El cuerpo o los parámetros no pasan la validación | Leer `details`, que trae la ruta y el motivo de cada campo inválido |
| `AREA_TOO_LARGE` | 413 | El área supera el límite del plan | Dividir el polígono, o subir de plan. `details.area` y `details.limit` traen las cifras |
| `QUOTA_EXCEEDED` | 402 | Se agotó el cupo del periodo | Esperar al próximo periodo o mejorar el plan |
| `INSUFFICIENT_CREDITS` | 402 | No hay créditos para la operación | `details.needed` y `details.available` dicen cuántos faltan |
| `RATE_LIMITED` | 429 | Demasiadas peticiones por minuto | Respetar `Retry-After` |
| `TIMEOUT` | 504 | La consulta excedió su tiempo máximo | Reducir el área o los filtros, o ejecutarla como tarea asíncrona |
| `UNAUTHORIZED` | 401 | Falta la llave, o es inválida o revocada | Revisar la cabecera `X-API-Key` |
| `FORBIDDEN` | 403 | La llave es válida pero no alcanza: ámbito, plan, IP u origen | Revisar los ámbitos de la llave y las restricciones |
| `PLAN_REQUIRED` | 403 | La función existe pero no está en tu plan | `details.feature` y `details.minPlan` dicen qué hace falta |
| `COVERAGE_MISSING` | **200** | El municipio no tiene cobertura catastral | **No es un error de tu petición.** Ver abajo |
| `UPSTREAM_UNAVAILABLE` | 503 | Una dependencia nuestra está caída | Reintentar con retroceso exponencial |
| `INTERNAL` | 500 | Fallo nuestro | Reintentar; si persiste, reportar con el identificador de la petición |

## `COVERAGE_MISSING` responde 200 a propósito {#coverage-missing}

Este es el único caso raro y es deliberado.

Si pides un predio de un municipio cuyo catastro **no gestiona el IGAC** —Bogotá, Medellín, Cali,
Barranquilla y otros—, la API no está fallando: el dato no existe en las fuentes abiertas. Un
`404` daría a entender que el predio no existe, y un `500` que algo se rompió. Ninguna de las dos
cosas es verdad.

La respuesta es `200` con la explicación en `meta.coverage`:

```json
{
  "data": null,
  "meta": {
    "sources": [],
    "cutDate": null,
    "coverage": {
      "muniCode": "11001",
      "cadastralManager": "Unidad Administrativa Especial de Catastro Distrital (Bogotá)",
      "isIgac": false,
      "status": "none",
      "availableLayers": ["población", "colegios", "salud", "vías", "suelos", "amenazas"],
      "message": "Este municipio lo gestiona la Unidad Administrativa Especial de Catastro Distrital, que no publica su catastro como dato abierto o todavía no lo hemos integrado. Sí tenemos para esta zona: población, colegios, salud, vías, suelos, amenazas."
    },
    "synthetic": false,
    "generatedAt": "2026-09-21T14:30:00.000Z",
    "warnings": []
  }
}
```

Tu interfaz debe:

1. Comprobar `data === null` **y** leer `meta.coverage.status`.
2. Mostrar `meta.coverage.message`, que ya está redactado para el usuario final.
3. Ofrecer lo que sí hay: `meta.coverage.availableLayers` lista las capas disponibles para esa
   zona.

Un mapa vacío sin explicación es la peor respuesta posible, y es la razón de que este caso no sea
un error HTTP.

## Validación: cómo leer `details`

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "La consulta tiene campos inválidos.",
    "details": {
      "issues": [
        { "path": "scope", "message": "Se requiere department o municipality en scope (evita barridos nacionales)" },
        { "path": "where.area_m2", "message": "Rango numérico vacío" },
        { "path": "limit", "message": "Number must be less than or equal to 1000" }
      ]
    }
  }
}
```

`details.issues[]` viene de la validación con Zod: `path` es la ruta al campo dentro del cuerpo
que enviaste.

## Reintentos

| Código | ¿Reintentar? | Cómo |
| --- | --- | --- |
| `RATE_LIMITED` | Sí | Esperar lo que diga `Retry-After` |
| `TIMEOUT` | Sí, una vez | Y si vuelve a fallar, reducir la consulta |
| `UPSTREAM_UNAVAILABLE` | Sí | Retroceso exponencial: 1 s, 2 s, 4 s, 8 s, con un máximo de 4 intentos |
| `INTERNAL` | Sí, con cuidado | Retroceso exponencial, máximo 3 intentos |
| `VALIDATION`, `INVALID_NPN` | **No** | Reintentar lo mismo da lo mismo. Corrige la petición |
| `UNAUTHORIZED`, `FORBIDDEN`, `PLAN_REQUIRED` | **No** | Es de configuración |
| `QUOTA_EXCEEDED`, `INSUFFICIENT_CREDITS` | **No** | Hace falta una acción de tu parte |
| `NOT_FOUND`, `PARCEL_NOT_FOUND` | **No** | El dato no está |
| `AREA_TOO_LARGE` | **No** | Cambia la geometría |

Nunca reintentes un `POST /reports` sin cambiar nada: podrías pagar dos veces. Los informes son
idempotentes por la referencia que envías, así que **reenvía la misma referencia** y la API
devuelve el informe ya creado.

### Cliente con reintentos, en JavaScript

```js
const RETRIABLE = new Set(['RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_UNAVAILABLE', 'INTERNAL']);

async function geoapiWithRetry(path, options = {}, maxAttempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { 'X-API-Key': KEY, Accept: 'application/json', ...options.headers },
    });

    if (response.ok) return response.json();

    const body = await response.json().catch(() => ({ error: { code: 'INTERNAL' } }));
    const code = body.error?.code ?? 'INTERNAL';

    if (!RETRIABLE.has(code) || attempt >= maxAttempts) {
      const error = new Error(body.error?.message ?? `HTTP ${response.status}`);
      error.code = code;
      error.details = body.error?.details ?? {};
      throw error;
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 1000 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, waitMs));
  }
}
```

## Identificador de la petición

Toda respuesta trae:

```http
X-Request-Id: 01JQZX8K4T2M3N4P5Q6R7S8T9V
```

Guárdalo en tus registros. Si algo va mal, con ese identificador podemos ver exactamente qué pasó
en nuestro lado sin que tengas que reproducir el caso.

## Lo que la API nunca hace

- **No devuelve `200` con un cuerpo vacío** cuando algo falló. Un error es un error.
- **No devuelve cero en lugar de "no disponible".** Un dato ausente es `null` o `"NO_DISPONIBLE"`.
- **No estima.** Si la fuente no tiene el dato, la API no lo inventa.
- **No filtra detalles internos** en `message`: no verás nombres de tablas, consultas SQL ni
  trazas. Si necesitas detalle técnico, usa `X-Request-Id`.
