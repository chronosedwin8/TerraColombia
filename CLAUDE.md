# CLAUDE.md — Reglas de trabajo en TerraColombia

> Estas son las reglas de la sección 0 de `PLAN.md`. Son obligatorias para cualquier cambio en este repositorio.

1. **Trabaja por fases** (`PLAN.md` §14). Al cerrar cada fase: corre tests, actualiza `docs/ESTADO.md` y detente a pedir aprobación.
2. **Nunca inventes nombres de campos, capas ni URLs de fuentes.** Todo campo de IGAC/DANE/MEN sale de la inspección real hecha en la Fase 0 (`data-catalog/`). Si algo no existe, márcalo `NO_DISPONIBLE`, no lo simules.
3. **Cero datos personales.** Si en cualquier fuente aparecen nombre de propietario, documento, teléfono o dirección personal, se descartan en la ingesta (lista negra en `etl/config/pii-blocklist.ts`) y se registra en el log. No existe ni existirá la ruta predio → persona.
4. **Toda cifra mostrada lleva procedencia:** fuente, dataset, fecha de corte y licencia. Sin procedencia no se muestra.
5. **Avalúo catastral ≠ valor comercial.** Cualquier dato económico catastral va con esa advertencia. El sistema entrega indicadores, no avalúos ni conceptos jurídicos.
6. **Cobertura honesta:** si el municipio no es jurisdicción del IGAC o no tiene datos, la UI lo dice claramente (no mapa vacío sin explicación).
7. TypeScript estricto, ESLint + Prettier, commits convencionales, migraciones versionadas, sin secretos en el repo (`.env.example`).
8. Geometría siempre vía SQL crudo/PostGIS; Prisma solo para tablas de aplicación (`app`).
9. Idioma de UI, informes y mensajes: **español (Colombia)**. Código e identificadores en inglés.
10. Ante ambigüedad de negocio: pregunta. Ante ambigüedad técnica menor: decide, documenta en `docs/DECISIONES.md` y sigue.

## Comandos frecuentes

```bash
pnpm install                 # instalar dependencias del monorepo
pnpm db:migrate              # aplicar migraciones SQL (meta/core/ctx/analytics) + Prisma (app)
pnpm db:seed                 # semilla reproducible del municipio piloto
pnpm catalog:crawl           # Fase 0: recorrer ArcGIS REST / Socrata y escribir data-catalog/
pnpm catalog:report          # generar data-catalog/CATALOGO.md y SELECCION.md
pnpm etl -- run <datasetId>  # ejecutar un dataset del catálogo ETL
pnpm dev                     # api + web + worker
pnpm test                    # vitest en todos los paquetes
```

## Convenciones de datos

- Geometrías servidas en **EPSG:4326**; medidas (área, distancia) calculadas en **EPSG:9377** (MAGNA-SIRGAS / Origen-Nacional).
- Toda tabla de dato externo lleva `snapshot_id` con linaje en `meta.snapshot`.
- Toda respuesta de API incluye el bloque `meta.sources[]` con `license` y `attribution`.
- Nunca concatenar SQL: usar los constructores parametrizados de `packages/db/src/sql.ts`.

## Atribución obligatoria

> Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0

Debe aparecer en mapa, ficha, informe y respuestas de API que usen datos catastrales.
