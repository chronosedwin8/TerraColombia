---
title: Autenticación
description: Llaves de API, entornos, rotación y buenas prácticas de la GeoAPI de TerraColombia.
---

# Autenticación

La GeoAPI pública (`/geo/v1`) se autentica con **llaves de API**. La API interna que usa la
aplicación web (`/api/v1`) usa sesión con JWT y no está documentada aquí: no es una superficie
pública y puede cambiar sin aviso.

## La cabecera

```http
GET /geo/v1/parcels/080010102000000010001000000000 HTTP/1.1
Host: api.terracolombia.co
X-API-Key: tc_sandbox_7f3a9c2e5b8d1046a7c3e9f2b5d8a104
Accept: application/json
```

Se acepta también el esquema `Bearer`, por comodidad con clientes HTTP que ya lo soportan:

```http
Authorization: Bearer tc_sandbox_7f3a9c2e5b8d1046a7c3e9f2b5d8a104
```

No se aceptan llaves por parámetro de consulta (`?api_key=`): quedan en los registros de los
servidores intermedios y en el historial del navegador.

## Entornos

| Entorno | Prefijo de la llave | Base URL | Datos | Cuota |
| --- | --- | --- | --- | --- |
| Sandbox | `tc_sandbox_` | `https://api.terracolombia.co/geo/v1` | Snapshot de demostración del municipio piloto | Gratuita, limitada |
| Producción | `tc_live_` | `https://api.terracolombia.co/geo/v1` | Snapshots reales publicados | Según el plan |

La base URL es la misma: **el entorno lo determina la llave**, no la ruta. Una llave de sandbox
contra datos reales devuelve `403`.

::: danger Sandbox devuelve datos sintéticos
Las respuestas de sandbox llevan `meta.synthetic: true` y cada fuente lleva `synthetic: true`.
Esas cifras **no vienen de la fuente oficial**: son un snapshot de demostración reproducible.
Si tu interfaz muestra datos de sandbox, márcalos como datos de demostración.
:::

## Formato de las llaves

```
tc_<entorno>_<32 caracteres hexadecimales>
```

Guardamos únicamente el hash de la llave (Argon2), nunca la llave. Consecuencias:

- La llave se muestra **una sola vez**, al crearla.
- No podemos recuperarla ni decirte cuál era. Solo revocarla y crear otra.
- Si la pierdes, revócala: una llave perdida es una llave comprometida.

## Dónde **no** poner la llave {#donde-no-poner-la-llave}

- **No en el navegador.** Ni en JavaScript de una SPA, ni en una app móvil, ni en un `<script>`.
  Cualquiera puede leerla y consumir tu cuota.
- **No en el repositorio.** Ni en `.env` versionado, ni en un comentario, ni en un test.
- **No en la URL.** Ni como parámetro de consulta ni en el *path*.
- **No en los registros.** Filtra la cabecera `X-API-Key` en tu propio *logging*.

El camino correcto para una interfaz de usuario es un **proxy en tu propio backend**: el
navegador llama a tu servidor, tu servidor añade la llave y llama a la GeoAPI. Así también
controlas tu propia cuota por usuario.

```js
// Ejemplo de proxy mínimo (Node + Fastify)
app.get('/api/predio/:npn', async (request, reply) => {
  const response = await fetch(
    `https://api.terracolombia.co/geo/v1/parcels/${request.params.npn}`,
    { headers: { 'X-API-Key': process.env.TC_API_KEY } },
  );
  reply.code(response.status).send(await response.json());
});
```

## Ámbitos

Cada llave lleva un conjunto de ámbitos. Se piden al crearla y se pueden reducir después, nunca
ampliar (para ampliar, se crea otra llave).

| Ámbito | Permite |
| --- | --- |
| `read:parcels` | `/search`, `/parcels/*`, `/municipalities/*` |
| `read:context` | `/nearby`, `/parcels/:npn/context`, `/layers` |
| `query:parcels` | `POST /parcels/query` |
| `analyze:areas` | `POST /areas/analyze`, `POST /suitability` |
| `analyze:location` | `POST /location-intel` |
| `read:changes` | `POST /changes/compare`, `/parcels/:npn/history` |
| `read:indicators` | `/indicators/*` |
| `write:reports` | `POST /reports` y las descargas |
| `read:tiles` | `/tiles/*` |
| `ai:ask` | `POST /ai/ask`, `POST /ai/explain` |

Una llamada fuera del ámbito devuelve `403 FORBIDDEN`. Concede el mínimo: una llave de solo
lectura que se filtre no puede generar informes y gastarte los créditos.

## Restringir por IP y por origen

En **Cuenta → Llaves de API** puedes fijar, por llave:

- una lista de IP o rangos CIDR permitidos;
- una lista de orígenes (`Origin`) permitidos, útil si aun así decides llamar desde un
  navegador en un entorno controlado.

Una petición desde fuera de la lista devuelve `403`, y el intento queda registrado en el
historial de la llave.

## Rotación

Puedes tener **hasta cinco llaves activas** por organización, lo que permite rotar sin cortar el
servicio:

1. Crea la llave nueva.
2. Despliega tu servicio con la llave nueva.
3. Comprueba en **Cuenta → Llaves de API** que la llave vieja dejó de recibir tráfico.
4. Revoca la llave vieja.

Una llave revocada devuelve `401` de inmediato: no hay periodo de gracia.

## Errores de autenticación

| Situación | Código HTTP | `error.code` |
| --- | --- | --- |
| Falta la cabecera | 401 | `UNAUTHORIZED` |
| Llave inexistente o revocada | 401 | `UNAUTHORIZED` |
| Llave válida, ámbito insuficiente | 403 | `FORBIDDEN` |
| Llave válida, función fuera del plan | 403 | `PLAN_REQUIRED` |
| Llave de sandbox pidiendo datos reales | 403 | `FORBIDDEN` |
| IP u origen no permitidos | 403 | `FORBIDDEN` |

Ver [Errores](/guia/errores) para el formato completo del cuerpo de error.

## Registro de uso

Cada llamada queda registrada con: llave, endpoint, código de respuesta, latencia, filas
devueltas y créditos consumidos. Lo puedes consultar en **Cuenta → Consumo** y por API con
`GET /api/v1/api-keys/:id/usage` (esa ruta pertenece a la API interna y requiere sesión, no
llave).

No registramos el contenido de las respuestas ni datos personales de tus usuarios finales.
