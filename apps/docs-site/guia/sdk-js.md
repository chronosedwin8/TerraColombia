---
title: SDK de JavaScript
description: Cliente tipado de la GeoAPI de TerraColombia para Node, Deno, Bun y navegadores a través de un proxy.
---

# SDK de JavaScript

El SDK es un envoltorio delgado sobre `fetch`: tipos, reintentos, paginación y lectura del bloque
`meta`. **No es obligatorio**: la API es HTTP + JSON y se usa perfectamente con `curl`.

::: info Estado
El paquete `@terracolombia/sdk` se publica junto con la Fase 10 del producto. Hasta entonces,
copia el cliente mínimo de más abajo: son treinta líneas y cubre todo lo que hace el SDK.
:::

## Instalación

```bash
pnpm add @terracolombia/sdk
# npm install @terracolombia/sdk
# yarn add @terracolombia/sdk
```

Requiere Node 18 o superior (por `fetch` global), Deno o Bun.

## Uso

```ts
import { TerraColombia } from '@terracolombia/sdk';

const tc = new TerraColombia({
  apiKey: process.env.TC_API_KEY!,
  // baseUrl: 'https://api.terracolombia.co/geo/v1',  // por omisión
  // timeoutMs: 15_000,
  // retries: 3,
});

const { data, meta } = await tc.parcels.get('080010102000000010001000000000');

console.log(data.address);
console.log('Corte:', meta.cutDate);
console.log('Atribución:', meta.sources.map((s) => s.attribution).join(' · '));
```

Todos los métodos devuelven `{ data, meta }`, igual que la API. **El `meta` no es opcional ni se
esconde:** el SDK no te deja olvidar la procedencia.

## Métodos

| Método | Endpoint |
| --- | --- |
| `tc.search(q, options?)` | `GET /search` |
| `tc.municipalities.get(code)` | `GET /municipalities/:code` |
| `tc.parcels.get(npn)` | `GET /parcels/:npn` |
| `tc.parcels.context(npn, { radiusM })` | `GET /parcels/:npn/context` |
| `tc.parcels.history(npn)` | `GET /parcels/:npn/history` |
| `tc.parcels.query(dsl)` | `POST /parcels/query` |
| `tc.parcels.queryAll(dsl)` | `POST /parcels/query`, paginado como iterador asíncrono |
| `tc.nearby(params)` | `GET /nearby` |
| `tc.areas.analyze(request)` | `POST /areas/analyze` |
| `tc.suitability(request)` | `POST /suitability` |
| `tc.locationIntel(request)` | `POST /location-intel` |
| `tc.locationIntel.templates()` | `GET /location-intel/templates` |
| `tc.changes.compare(request)` | `POST /changes/compare` |
| `tc.indicators.get(muniCode)` | `GET /indicators/:muniCode` |
| `tc.reports.create(request)` | `POST /reports` |
| `tc.reports.get(id)` | `GET /reports/:id` |
| `tc.reports.download(id, format)` | `GET /reports/:id/download` |
| `tc.layers()` | `GET /layers` |
| `tc.jobs.wait(jobId)` | Sigue un trabajo asíncrono por SSE hasta que termina |

## Paginación como iterador

```ts
for await (const parcel of tc.parcels.queryAll({
  scope: { municipality: '08638' },
  where: { zone: 'urbano', area_m2: { gte: 1000 } },
  sort: 'area_m2:desc',
  limit: 500,
  geometry: 'none',
})) {
  console.log(parcel.npn, parcel.areaGeomM2);
}
```

El iterador gestiona el cursor, respeta el límite de ritmo y renueva el cursor si caduca.

## Manejo de errores

```ts
import { TerraColombiaError } from '@terracolombia/sdk';

try {
  await tc.parcels.get('123');
} catch (e) {
  if (e instanceof TerraColombiaError) {
    console.error(e.code);      // 'INVALID_NPN'
    console.error(e.message);   // mensaje en español, mostrable al usuario
    console.error(e.details);   // { npn: '123' }
    console.error(e.requestId); // para reportar el caso
  }
}
```

Los códigos son los de [Errores](/guia/errores). El SDK reintenta solo los recuperables.

## Cobertura: el caso que hay que manejar

```ts
const { data, meta } = await tc.parcels.get(npn);

if (data === null && meta.coverage?.status === 'none') {
  // No es un error: el municipio no es jurisdicción del IGAC.
  mostrarAviso(meta.coverage.message, meta.coverage.availableLayers);
  return;
}
```

El SDK **no** convierte esto en una excepción, precisamente para que tu interfaz lo trate como lo
que es: una respuesta válida con una explicación.

## Datos de demostración

```ts
if (meta.synthetic) {
  mostrarBanda('DATOS DE DEMOSTRACIÓN');
}
```

Con una llave de sandbox esto es siempre `true`. Ver
[Autenticación](/guia/autenticacion#entornos).

## Tipos

El SDK reexporta los tipos de `@terracolombia/shared`, que son los mismos que usa la API:

```ts
import type {
  ParcelSummary,
  ParcelContext,
  SuitabilityResult,
  FactorScore,
  ResponseMeta,
  SourceRef,
  Coverage,
  ParcelQuery,
  Maybe,
} from '@terracolombia/sdk';
```

`Maybe<T>` es `T | 'NO_DISPONIBLE' | null`. Usa el ayudante `isAvailable` antes de operar con un
valor:

```ts
import { isAvailable } from '@terracolombia/sdk';

if (isAvailable(parcel.cadastralValue)) {
  // Aquí TypeScript ya sabe que es un number.
  // Y recuerda: avalúo catastral ≠ valor comercial.
}
```

## Navegador

**No pongas la llave en el navegador.** El SDK acepta una `baseUrl` distinta para que apunte a tu
propio proxy:

```ts
// En el navegador
const tc = new TerraColombia({ baseUrl: '/api/geo', apiKey: '' });
```

```ts
// En tu backend: un proxy que añade la llave
app.all('/api/geo/*', async (request, reply) => {
  const upstream = await fetch(
    `https://api.terracolombia.co/geo/v1${request.url.replace('/api/geo', '')}`,
    {
      method: request.method,
      headers: { 'X-API-Key': process.env.TC_API_KEY!, 'Content-Type': 'application/json' },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    },
  );
  reply.code(upstream.status).send(await upstream.json());
});
```

## Cliente mínimo, sin SDK

Si prefieres no añadir una dependencia, esto es todo lo que hace falta:

```ts
export interface Envelope<T> {
  data: T;
  meta: {
    sources: Array<{
      datasetId: string;
      source: string;
      name: string;
      cutDate: string | null;
      license: string;
      attribution: string;
      url: string | null;
      synthetic: boolean;
    }>;
    cutDate: string | null;
    coverage: {
      muniCode: string | null;
      cadastralManager: string | null;
      isIgac: boolean | null;
      status: 'full' | 'partial' | 'none' | 'unknown';
      availableLayers: string[];
      message: string | null;
    } | null;
    synthetic: boolean;
    generatedAt: string;
    warnings: string[];
  };
}

export class TerraColombiaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'TerraColombiaError';
  }
}

export function createClient(apiKey: string, baseUrl = 'https://api.terracolombia.co/geo/v1') {
  return async function call<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    const body = await response.json();

    if (!response.ok) {
      throw new TerraColombiaError(
        body.error?.code ?? 'INTERNAL',
        body.error?.message ?? `HTTP ${response.status}`,
        body.error?.details ?? {},
        response.headers.get('x-request-id'),
      );
    }

    return body as Envelope<T>;
  };
}
```

Uso:

```ts
const call = createClient(process.env.TC_API_KEY!);
const { data, meta } = await call<{ npn: string; address: string | null }>(
  '/parcels/080010102000000010001000000000',
);
```

## Otros lenguajes

No publicamos SDK oficiales para otros lenguajes, pero sí un
**esquema OpenAPI 3.1** en `https://api.terracolombia.co/geo/v1/openapi.json`, con el que puedes
generar un cliente:

```bash
# Python
openapi-python-client generate --url https://api.terracolombia.co/geo/v1/openapi.json

# Go
oapi-codegen -package terracolombia https://api.terracolombia.co/geo/v1/openapi.json

# Java, C#, PHP…
openapi-generator-cli generate -i https://api.terracolombia.co/geo/v1/openapi.json -g <lenguaje>
```
