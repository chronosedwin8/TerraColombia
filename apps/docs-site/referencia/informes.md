---
title: Informes y exportación
description: Encargar, consultar y descargar informes en PDF, XLSX, CSV, GeoJSON, GeoPackage, Shapefile y KML.
---

# Informes y exportación

Tres endpoints:

```
POST /geo/v1/reports              # encargar
GET  /geo/v1/reports/:id          # consultar estado
GET  /geo/v1/reports/:id/download # descargar
```

**Ámbito requerido:** `write:reports`

## Tipos de informe

| `kind` | Informe | Ámbito que necesita |
| --- | --- | --- |
| `parcel` | **Informe Territorial de Predio** (10 secciones) | `npn` |
| `area` | Informe de Zona | `scope` |
| `location` | Informe de Localización de Negocio | `templateId` + `scope` |
| `change` | Informe de Cambio Territorial | `scope` + `fromCutDate` + `toCutDate` |
| `municipality` | Informe Municipal | `muniCode` |

## Niveles

| `level` | Contenido | Créditos |
| --- | --- | --- |
| `resumen` | Cifras principales de cada sección, sin tablas de detalle ni anexos | 5 |
| `completo` | Todas las secciones con sus tablas | 15 |
| `tecnico` | Todo lo anterior más anexos con los datos crudos de cada fuente | 25 |

::: info El nivel cambia la profundidad, no las secciones
El Informe Territorial de Predio tiene **las mismas 10 secciones en los tres niveles**, con los
mismos títulos y en el mismo orden. Un informe resumen no omite la sección de amenazas: la
presenta condensada. Y la sección 10, con las fuentes y los descargos legales, es idéntica
siempre.
:::

## Las 10 secciones del Informe Territorial de Predio

1. Localización
2. Identificación y características catastrales
3. Construcciones
4. Contexto geográfico
5. Suelos, capacidad y vocación
6. Amenazas y restricciones
7. Ordenamiento territorial
8. Entorno: población, educación, salud, comercio y accesibilidad
9. Análisis y semáforos explicados
10. Fuentes, fechas de corte, licencias y advertencias

## Encargar un informe

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/reports" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "parcel",
    "npn": "080010102000000010001000000000",
    "level": "completo",
    "formats": ["pdf", "xlsx"],
    "reference": "mi-referencia-0001",
    "suitabilityUses": ["vivienda_unifamiliar"],
    "branding": { "organizationName": "Inmobiliaria del Caribe", "primaryColor": "#0f4c81" }
  }'
```

| Campo | Tipo | Por omisión | Descripción |
| --- | --- | --- | --- |
| `kind` | enum | — | Tipo de informe |
| `level` | enum | `completo` | `resumen`, `completo` o `tecnico` |
| `formats` | string[] | `["pdf"]` | Formatos a generar. Limitados por tu plan |
| `reference` | string | generada | **Tu** referencia. Hace la petición idempotente |
| `suitabilityUses` | string[] | — | Usos objetivo a incluir en la sección 9 (solo `kind: "parcel"`) |
| `branding` | objeto | — | Marca blanca. Solo planes Business y Enterprise |
| `radiusM` | entero | 800 | Radio del contexto (solo `kind: "parcel"`) |
| `cutDate` | string | snapshot activo | Corte concreto |

::: tip `reference` hace la petición idempotente
Reenviar la misma `reference` **no** crea un informe nuevo ni vuelve a cobrar créditos: devuelve
el que ya existe. Es la forma correcta de reintentar tras un error de red.
:::

### Respuesta

```json
{
  "data": {
    "id": "rep_01JQZX8K4T2M3N4P5Q6R7S8T9V",
    "reference": "mi-referencia-0001",
    "kind": "parcel",
    "level": "completo",
    "status": "queued",
    "progress": 0,
    "formats": ["pdf", "xlsx"],
    "creditsCharged": 15,
    "verifyUrl": "https://terracolombia.co/verificar/01JQZX8K4T2M3N4P5Q6R7S8T9V",
    "createdAt": "2026-09-21T14:30:00.000Z",
    "estimatedSeconds": 35
  },
  "meta": { }
}
```

## Consultar un informe {#consultar-un-informe}

```bash
curl -s "https://api.terracolombia.co/geo/v1/reports/rep_01JQZX8K4T2M3N4P5Q6R7S8T9V" \
  -H "X-API-Key: $TC_API_KEY"
```

```json
{
  "data": {
    "id": "rep_01JQZX8K4T2M3N4P5Q6R7S8T9V",
    "reference": "mi-referencia-0001",
    "kind": "parcel",
    "level": "completo",
    "status": "ready",
    "progress": 100,
    "creditsCharged": 15,
    "verifyUrl": "https://terracolombia.co/verificar/01JQZX8K4T2M3N4P5Q6R7S8T9V",
    "checksum": "b8f1c2d3e4a5960718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f",
    "snapshotIds": {
      "igac-catastro-terreno": "snap_igac_2026_07",
      "dane-mgn-manzanas": "snap_dane_2024_12"
    },
    "files": [
      { "format": "pdf", "sizeBytes": 2841203, "pages": 24, "url": "https://…/informe.pdf?firma=…", "expiresAt": "2026-09-21T15:30:00.000Z" },
      { "format": "xlsx", "sizeBytes": 184320, "sheets": 16, "url": "https://…/informe.xlsx?firma=…", "expiresAt": "2026-09-21T15:30:00.000Z" }
    ],
    "createdAt": "2026-09-21T14:30:00.000Z",
    "completedAt": "2026-09-21T14:30:38.000Z"
  },
  "meta": { }
}
```

| `status` | Significa |
| --- | --- |
| `queued` | En cola |
| `running` | Generándose |
| `ready` | Listo para descargar |
| `failed` | Falló. `error` explica por qué y **los créditos se devuelven** |

Objetivo de tiempo: **menos de 60 segundos** para un informe de predio completo.

Sigue el progreso por SSE en lugar de consultar en bucle:

```js
const events = new EventSource(`${API}/reports/${id}/events?key=${KEY}`);
events.addEventListener('progress', (e) => setProgress(JSON.parse(e.data).progress));
events.addEventListener('done', () => { events.close(); descargar(); });
```

## Descargar {#descargar}

```bash
curl -sL "https://api.terracolombia.co/geo/v1/reports/rep_01JQZX8K4T2M3N4P5Q6R7S8T9V/download?format=pdf" \
  -H "X-API-Key: $TC_API_KEY" \
  -o informe.pdf
```

| `format` | Se entrega como | Media type |
| --- | --- | --- |
| `pdf` | `.pdf` | `application/pdf` |
| `xlsx` | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `csv` | `.zip` | `application/zip` |
| `geojson` | `.zip` | `application/zip` |
| `gpkg` | `.gpkg` | `application/geopackage+sqlite3` |
| `shp` | `.zip` | `application/zip` |
| `kml` | `.zip` | `application/zip` |

La respuesta es un `302` a una URL firmada con una hora de validez, o el archivo directamente si
envías `Accept: application/octet-stream`.

## `FUENTES_Y_LICENCIA`: siempre {#fuentes-y-licencia}

**Toda** exportación lleva la procedencia, en el formato que corresponda:

| Formato | Dónde va |
| --- | --- |
| PDF | Sección 10, con la tabla de fuentes, los descargos legales íntegros y el QR de verificación |
| XLSX | Hoja `FUENTES_Y_LICENCIA` |
| GPKG | Tabla no espacial `FUENTES_Y_LICENCIA` |
| CSV, GeoJSON, SHP, KML | `FUENTES_Y_LICENCIA.txt` y `FUENTES_Y_LICENCIA.csv` dentro del ZIP |

Contiene, por cada dataset: fuente, nombre, identificador, fecha de corte, licencia, si tiene
cláusula ShareAlike, atribución exigida, URL y el `snapshot_id` usado.

## Separación por licencia {#separacion}

Los datos con cláusula **CompartirIgual** (IGAC CC BY-SA 4.0, OpenStreetMap ODbL) viajan
**separados** de los indicadores propios de TerraColombia:

| Formato | Cómo se separa |
| --- | --- |
| XLSX | Hojas `SA_…` frente a `TC_…`, con colores de pestaña distintos |
| CSV, GeoJSON | Carpetas `DATOS_ABIERTOS_SHAREALIKE/` e `INDICADORES_TERRACOLOMBIA/` |
| GPKG | Una capa por grupo |
| SHP | Un *shapefile* por grupo |
| KML | Un archivo por grupo |

La razón está en [Licencias y atribución](/guia/licencias-y-atribucion#sharealike): si vas a
redistribuir, necesitas saber qué parte arrastra la obligación.

## Inmutabilidad y verificación

Un informe generado **no cambia nunca**. Guarda el `snapshot_id` de cada dataset que usó, así que
dos descargas del mismo informe dan el mismo contenido aunque entre medias haya llegado un corte
nuevo.

Cada informe lleva un **código QR** que apunta a `verifyUrl`. Quien escanee ese QR llega a una
página pública que confirma: identificador, fecha de emisión, tipo, nivel, cortes usados y huella
SHA-256 del contenido. Sirve para que un tercero —un banco, un comprador— verifique que el PDF
que tiene en la mano es el que emitimos.

## Marca blanca

Planes Business y Enterprise:

```json
{
  "branding": {
    "organizationName": "Inmobiliaria del Caribe",
    "logoDataUri": "data:image/png;base64,iVBORw0KGgo…",
    "primaryColor": "#0f4c81",
    "accentColor": "#e8a33d",
    "website": "https://inmobiliariadelcaribe.co",
    "footerNote": "Documento de uso interno"
  }
}
```

| Se puede cambiar | No se puede quitar |
| --- | --- |
| Nombre de la organización | La sección de fuentes y fechas de corte |
| Logo (data URI de imagen) | Los descargos legales |
| Colores principal y de acento | La advertencia «avalúo catastral ≠ valor comercial» |
| Nota del pie de página | El QR de verificación |
| La mención «Generado por TerraColombia» | La atribución al IGAC y a OpenStreetMap |

Los colores solo se aceptan en hexadecimal y el logo solo como `data:` URI de imagen: cualquier
otra cosa se descarta en silencio, para que no se pueda inyectar CSS ni cargar recursos remotos
en el PDF.

## Datos de demostración

Si el informe toca un snapshot sintético (llave de sandbox), la **portada lleva una banda roja
"DATOS DE DEMOSTRACIÓN"** y la hoja de fuentes lo repite. No se puede quitar, ni con marca blanca.

## Pagar un informe {#pagar-un-informe}

Para el plan **Pago por informe**, el flujo es:

1. `POST /geo/v1/reports` con `payment: { mode: "checkout" }`.
2. La respuesta trae `status: "awaiting_payment"` y `payment.checkoutUrl`.
3. Rediriges al usuario a esa URL, que es el **Checkout Pro de Mercado Pago** (tarjeta, PSE o
   Efecty).
4. Mercado Pago notifica el pago a nuestro webhook. Verificamos la firma, consultamos el pago y,
   si quedó aprobado, encolamos el informe.
5. El informe pasa a `queued` y sigue el flujo normal.

```json
{
  "data": {
    "id": "rep_01JQZX8K4T",
    "status": "awaiting_payment",
    "payment": {
      "provider": "mercadopago",
      "reference": "rep_01JQZX8K4T",
      "amountCop": 45000,
      "checkoutUrl": "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=…",
      "expiresAt": "2026-09-21T15:00:00.000Z"
    }
  },
  "meta": { }
}
```

::: warning PSE y Efecty no son inmediatos
Con PSE el banco puede tardar en confirmar, y con Efecty el usuario paga en un punto físico y la
acreditación puede tardar hasta tres días hábiles. Mientras el pago esté pendiente, el informe se
queda en `awaiting_payment`. Díselo al usuario en ese momento, no después.
:::

## Descargar sin informe: exportación directa

Para volcar el resultado de una consulta sin generar un informe con maqueta:

```bash
curl -s -X POST "https://api.terracolombia.co/geo/v1/exports" \
  -H "X-API-Key: $TC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "gpkg",
    "query": {
      "scope": { "municipality": "08638" },
      "where": { "zone": "urbano", "area_m2": { "gte": 1000 } },
      "geometry": "full"
    }
  }'
```

Cuesta 15 créditos (`bulk_export`) y está limitado por `maxExportRows` de tu plan. Incluye
`FUENTES_Y_LICENCIA` y la separación por licencia, igual que los informes.

## Errores posibles

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION` | 400 | Tipo, nivel o formato inválidos; falta el ámbito del tipo elegido |
| `INSUFFICIENT_CREDITS` | 402 | Faltan créditos |
| `QUOTA_EXCEEDED` | 402 | Se agotaron los informes del mes |
| `FORBIDDEN` / `PLAN_REQUIRED` | 403 | El formato o la marca blanca no están en tu plan |
| `PARCEL_NOT_FOUND` | 404 | El predio no está en los cortes cargados |
| `NOT_FOUND` | 404 | El informe no existe o no es de tu organización |
| `AREA_TOO_LARGE` | 413 | El ámbito supera el límite del plan |
