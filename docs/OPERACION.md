# Operación de TerraColombia

> Cómo se pone en marcha, se opera y se arregla el sistema.
>
> La última sección, [resolución de problemas](#problemas), está escrita para
> leerse a las tres de la mañana: cada entrada dice qué síntoma corresponde, qué
> comprobar y qué hacer. Las alertas de
> [`infra/prometheus/alerts.yml`](../infra/prometheus/alerts.yml) apuntan
> directamente a esas secciones.

---

## Tabla de contenido

1. [Puesta en marcha local (Windows, Postgres nativo)](#local-windows)
2. [Puesta en marcha local con Docker](#local-docker)
3. [Comandos frecuentes](#comandos)
4. [Corridas de ETL](#etl)
5. [Cron mensual del catastro](#cron-mensual-del-catastro)
6. [Panel de administración](#panel-admin)
7. [Respaldos y restauración](#respaldos)
8. [Entornos: dev, staging, producción](#entornos)
9. [Migraciones y su reversión](#migraciones)
10. [Observabilidad y alertas](#alertas)
11. [Resolución de problemas frecuentes](#problemas)

---

<a id="local-windows"></a>

## 1. Puesta en marcha local (Windows, Postgres nativo)

Este es **el camino por defecto del equipo** ([ADR-001](./DECISIONES.md)): hay
PostgreSQL 17 instalado como servicio de Windows y el demonio de Docker no corre.

### Requisitos

| Herramienta | Versión | Cómo comprobarlo |
|---|---|---|
| Node.js | 22 LTS o superior | `node --version` |
| pnpm | 9.x | `pnpm --version` |
| PostgreSQL | 16 o superior | `psql --version` |
| PostGIS | 3.4 o superior | se comprueba en el paso 1 |
| GDAL (`ogr2ogr`) | 3.6 o superior | `ogr2ogr --version` |

Si falta pnpm: `corepack enable` y después
`corepack prepare pnpm@9.15.9 --activate`.

PostGIS se instala con el **Stack Builder** que viene con PostgreSQL
(*Spatial Extensions → PostGIS*), o con el paquete de OSGeo para la versión
correspondiente.

### Los cinco pasos

```powershell
# 1. Verificar el entorno, crear la base, aplicar extensiones y crear .env
pwsh -File infra\scripts\setup-local.ps1

# 2. Editar .env: al menos DATABASE_URL, JWT_SECRET y JWT_REFRESH_SECRET.
#    Generar secretos con:
#      node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
notepad .env

# 3. Instalar dependencias
pnpm install

# 4. Migraciones y semilla del municipio piloto
pnpm db:migrate
pnpm db:seed

# 5. Levantar api + web + worker
pnpm dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3001> · salud en `/health`, dependencias en `/ready`
- OpenAPI: <http://localhost:3001/documentation>

### Qué hace `setup-local.ps1`

1. Comprueba Node ≥ 22, pnpm ≥ 9, `psql`, `pg_dump` y `ogr2ogr`.
2. Obtiene la contraseña de PostgreSQL de `PGPASSWORD`, de `.env` o pidiéndola
   por consola de forma oculta. **Nunca la imprime ni la pasa por la línea de
   comandos.**
3. Conecta al servidor y verifica la versión.
4. Crea la base `terracolombia` si no existe.
5. Aplica [`infra/postgres/init/01-extensions.sql`](../infra/postgres/init/01-extensions.sql):
   PostGIS, raster, `pg_trgm`, `unaccent`, `pgcrypto`, `pg_stat_statements`, y
   registra **EPSG:9377** si falta.
6. Copia `.env.example` a `.env` si no existe.

No ejecuta `pnpm install` ni las migraciones: esos pasos los decide la persona.

### Servicios opcionales

Sin Redis ni MinIO, el sistema funciona con degradación
([ADR-004](./DECISIONES.md)): cola en memoria (se pierde al reiniciar, marcada
como «solo desarrollo» en los logs) y almacenamiento en disco bajo
`STORAGE_LOCAL_DIR`.

Para probar el camino real, con el demonio de Docker corriendo:

```powershell
docker compose -f infra\docker-compose.dev.yml --env-file .env up -d
```

Y en `.env`:

```
REDIS_URL=redis://:LA_CLAVE@localhost:6379
S3_ENDPOINT=http://localhost:9000
```

### Diagnóstico

Cuando algo no arranca, esto es lo primero que hay que ejecutar:

```powershell
pwsh -File infra\scripts\check-health.ps1
# con más detalle:
pwsh -File infra\scripts\check-health.ps1 -Detallado
```

Comprueba herramientas, `.env` (sin imprimir secretos), conexión a Postgres,
extensiones, EPSG:9377, esquemas, snapshots publicados, Redis, almacenamiento,
Martin, API y web. Devuelve código 1 si hay algo crítico mal.

---

<a id="local-docker"></a>

## 2. Puesta en marcha local con Docker

Para quien prefiera contenedores, o para reproducir la configuración de
producción.

```bash
cp .env.example .env
# Editar .env: POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_USER,
# MINIO_ROOT_PASSWORD, S3_SECRET_KEY, GRAFANA_ADMIN_PASSWORD, JWT_*

cd infra
docker compose --env-file ../.env up -d
docker compose --env-file ../.env ps
```

Levanta PostGIS 16-3.4, Redis 7, MinIO (con el bucket ya creado y un usuario de
aplicación sin permisos de administración) y Martin.

> **El puerto de PostgreSQL es 55432**, no 5432, para no chocar con el Postgres
> nativo del equipo. `DATABASE_URL` tiene que reflejarlo.

Observabilidad (Prometheus, Grafana y los exportadores) va en un perfil aparte
para que `up` no levante seis contenedores que casi nunca se necesitan:

```bash
docker compose --env-file ../.env --profile observability up -d
# Grafana:     http://localhost:3030   (tableros ya aprovisionados)
# Prometheus:  http://localhost:9090
```

Para las pruebas de integración, una base efímera y desechable, la misma que usa
CI:

```bash
docker compose -f docker-compose.ci.yml up -d --wait
DATABASE_URL=postgresql://postgres:postgres@localhost:55433/terracolombia_test \
  pnpm db:migrate && pnpm db:seed && pnpm -r --if-present run test:integration
docker compose -f docker-compose.ci.yml down -v
```

Sus datos viven en `tmpfs` (RAM) y desaparecen al bajar el contenedor.

---

<a id="comandos"></a>

## 3. Comandos frecuentes

```bash
# Desarrollo
pnpm dev                         # api + web + worker en paralelo
pnpm build                       # construir todo
pnpm lint                        # ESLint
pnpm typecheck                   # tsc --noEmit
pnpm test                        # tests unitarios
pnpm ui:audit                    # recorre la interfaz en un Chromium real (ver abajo)
pnpm format                      # Prettier

# Base de datos
pnpm db:migrate                  # aplicar migraciones pendientes
pnpm db:seed                     # semilla del municipio piloto (sintética)
pnpm db:reset                    # ¡BORRA TODO! recrea desde cero

# Catálogo de fuentes (Fase 0)
pnpm catalog:crawl               # recorrer ArcGIS REST / Socrata
pnpm catalog:report              # generar CATALOGO.md y SELECCION.md

# ETL
pnpm etl -- aggregate --loaded         # agregados H3 de todo municipio con predios (ADR-012)
pnpm etl -- aggregate --loaded --from=<muniCode>   # retomar una corrida nacional interrumpida
AGGREGATE_TRACE=1 pnpm etl -- aggregate <muniCode> # ver cuánto tarda cada paso
pnpm etl -- run <datasetId>            # una corrida completa
pnpm etl -- run <datasetId> --dry-run  # sin escribir en core/ctx
pnpm etl -- status                     # estado de todos los datasets
pnpm etl -- resume <runId>             # reanudar una corrida interrumpida

# Infraestructura
pwsh -File infra\scripts\setup-local.ps1     # preparar el entorno
pwsh -File infra\scripts\check-health.ps1    # diagnóstico
pwsh -File infra\scripts\backup.ps1          # respaldo
bash   infra/scripts/backup.sh --subir-s3    # respaldo + S3 (Linux)
bash   infra/scripts/restore.sh <respaldo>   # restauración
```

### Recorrido de la interfaz con un navegador real

Las pruebas de API dicen si una ruta responde; no dicen si el usuario ve lo que debe ver.
`pnpm ui:audit` (`infra/scripts/ui-audit.mjs`, Playwright) abre un Chromium sin ventana
contra `http://localhost:5173`, crea una cuenta de prueba, inicia sesión por el formulario,
recorre las 20 pantallas (escritorio y móvil) y guarda en `.ui-audit/shots/` una captura de
cada una más `problemas.json` con los errores de consola, errores de página, peticiones
fallidas y respuestas 4xx/5xx, agrupados por frecuencia. Requiere `pnpm dev` corriendo y,
la primera vez, `pnpm exec playwright install chromium`.

Lo que ya encontró y que ninguna prueba de API habría visto: las teselas propias nunca se
cargaban (URL relativa dentro del *worker* de MapLibre), el recorrido de bienvenida
bloqueaba el formulario de ingreso, la ficha no centraba el mapa en el predio, y la portada
entraba en un bucle reactivo. Conviene correrlo antes de cada despliegue y después de tocar
el mapa, la sesión o el enrutador.

---

<a id="etl"></a>

## 4. Corridas de ETL

### Anatomía de una corrida

Diez pasos, idempotentes y reanudables (detalle en
[`ARQUITECTURA.md` §4](./ARQUITECTURA.md#el-etl-paso-por-paso)):

```
discover → download → stage → validate → transform → index → aggregate → tiles → publish → diff
```

### Ejecutar una

```bash
# Ver qué hay y en qué estado
pnpm etl -- status

# Corrida completa de un dataset
pnpm etl -- run igac-catastro-08

# Solo hasta validar, sin tocar core/ctx: lo que se usa para revisar un corte
# nuevo antes de publicarlo
pnpm etl -- run igac-catastro-08 --until validate

# Reanudar desde donde murió
pnpm etl -- resume <runId>

# Volver a publicar el corte anterior (reversión instantánea)
pnpm etl -- rollback igac-catastro-08
```

### Lo que hay que mirar en cada corrida

El informe de carga sale al final de la corrida y queda en el panel de
administración. Cinco cifras importan:

| Cifra | Qué significa si está mal |
|---|---|
| **Filas cargadas vs. corte anterior** | Variación > ±10 %: descarga truncada, o un municipio que entró o salió de la base abierta. **No publicar sin revisar.** |
| **Geometrías inválidas irreparables** | Se marcan huérfanas y no se publican. Si son muchas, la descarga puede estar corrupta. |
| **NPN mal formados** | Esos predios no serán consultables. Si aparecen de repente, el IGAC cambió el formato. |
| **Huérfanos** | Geometría sin registro alfanumérico o al contrario. Existen de forma normal en la base del IGAC; lo anómalo es que el número salte. |
| **PII detectada** | **Cualquier valor distinto de cero es un incidente.** La fuente trae campos nuevos. Ver [SEGURIDAD.md](./SEGURIDAD.md#respuesta-ante-incidentes). |

### Publicar un corte

La publicación es explícita y separada de la carga, a propósito:

```bash
# 1. Cargar y validar, sin publicar
pnpm etl -- run igac-catastro-08 --until validate

# 2. Revisar el informe de carga
pnpm etl -- report <runId>

# 3. Publicar
pnpm etl -- publish <snapshotId>
```

El cambio de snapshot activo es una transacción: el usuario nunca ve una carga a
medias ([`ARQUITECTURA.md` §5](./ARQUITECTURA.md#publicacion-atomica)).

### Orden de carga la primera vez

Las dependencias importan: sin límites municipales no se puede asignar
`muni_code`, y sin `core.parcel` no hay agregados que calcular.

```
1. DIVIPOLA + límites (DANE / IGAC)   → core.department, core.municipality
2. core.cadastral_manager              → quién gestiona cada municipio
3. Catastro del departamento piloto    → core.parcel, core.building, core.block…
4. Contexto: DANE, MEN, REPS, OSM      → ctx.*
5. Suelos, amenazas, áreas protegidas  → ctx.*
6. DEM Copernicus                      → pendiente y altitud
7. Agregados H3                        → analytics.h3_cell
```

---

<a id="cron-mensual-del-catastro"></a>

## 5. Cron mensual del catastro

La base catastral del IGAC se publica **mensualmente**. La automatización tiene
tres partes.

### Programación

```
# Día 5 de cada mes, 01:00 hora de Bogotá.
# El día 5 y no el 1: el IGAC no publica siempre el primer día del mes, y
# esperar cuatro días evita descargar el corte anterior y tener que repetirlo.
0 1 5 * *  pnpm etl -- run-group igac-catastro --until validate
```

En producción, el propio worker programa el trabajo con BullMQ (cola `etl`,
trabajo repetible), así que no hace falta cron del sistema operativo. La
expresión está ahí para documentar la ventana.

### Qué corre sin intervención y qué no

| Paso | Automático |
|---|---|
| `discover`, `download`, `stage`, `validate` | Sí |
| `transform`, `index`, `aggregate`, `tiles` | Sí, si `validate` pasó sin alertas |
| **`publish`** | **No.** Requiere aprobación en el panel de administración. |
| `diff` | Sí, tras publicar |

**Por qué `publish` es manual.** Publicar un corte cambia lo que ven todos los
usuarios y lo que dicen los informes que se emitan desde ese momento. Una
descarga truncada que pase las validaciones automáticas por poco margen no debe
poder llegar a producción mientras nadie mira. Cuando haya seis meses de cortes
publicados sin sobresaltos, se puede automatizar con la condición de que todas
las validaciones estén en verde.

### Vigilancia

- `tc_snapshot_age_days{dataset=~"igac-catastro.*"}` — alerta a los 45 días.
- `tc_etl_row_count_delta_ratio` — alerta si la variación supera el ±10 %.
- El tablero **TerraColombia · ETL y linaje de datos** en Grafana muestra el
  estado de todos los datasets de un vistazo.

### Si el IGAC no publicó

No es un fallo del sistema. El corte anterior sigue activo y la fecha de corte
aparece en la atribución obligatoria, así que el usuario ve qué está mirando. A
los 45 días salta `TerraColombiaCatastroDesactualizado`: entonces hay que
verificar en el portal del IGAC si dejaron de publicar o cambiaron la URL, y
registrar lo que se encuentre.

---

<a id="panel-admin"></a>

## 6. Panel de administración

En `/admin`, solo para cuentas con rol de administración.

| Sección | Qué permite |
|---|---|
| **ETL** | Estado de cada dataset, historial de corridas, informes de carga, lanzar y reanudar corridas, **publicar y revertir snapshots**. |
| **Linaje** | Qué corte está activo de cada dataset, su checksum, cuándo se cargó y cuántas filas trae. |
| **Cobertura** | Tabla de gestores catastrales por municipio y estado. Es lo que alimenta los mensajes de cobertura honesta de la interfaz. |
| **Colas** | Trabajos en espera, activos y fallidos por cola. Reintentar o descartar. |
| **Usuarios y organizaciones** | Planes, créditos, llaves de API, consumo. **Sin acceso a contraseñas ni a tokens**: solo hashes y metadatos. |
| **Métricas de negocio** | MRR, activación, conversión, informes por usuario, churn. Los mismos números que el tablero de Grafana. |
| **Auditoría** | `app.audit_log`: quién hizo qué y cuándo. Solo lectura, sin borrado. |

Toda acción destructiva (publicar, revertir, descartar trabajos, cambiar un plan)
queda en `app.audit_log` con el usuario, la hora y el motivo, que es obligatorio
escribir.

---

<a id="respaldos"></a>

## 7. Respaldos y restauración

### Qué se respalda

| Esquema | ¿Se respalda? | Por qué |
|---|---|---|
| `app` | **Sí, siempre** | Usuarios, pagos, informes emitidos. Irreemplazable. |
| `meta` | **Sí, siempre** | El linaje. Sin él, los informes emitidos no se pueden verificar. |
| `core`, `ctx`, `analytics` | Sí | Reconstruible, pero cuesta días de reprocesamiento. |
| `raw` | **No, por defecto** | Es la mayor parte del volumen y se puede volver a descargar. Con `--completo` se incluye. |

### Respaldo

```powershell
# Windows
pwsh -File infra\scripts\backup.ps1
pwsh -File infra\scripts\backup.ps1 -Completo -SubirS3 -RetencionDias 30
```

```bash
# Linux / macOS
bash infra/scripts/backup.sh
bash infra/scripts/backup.sh --completo --subir-s3
```

Usa `pg_dump --format=directory`, el único formato que permite restauración
paralela y selectiva; comprueba con `pg_restore --list` que el volcado se puede
leer (un respaldo corrupto que nadie verificó no es un respaldo); escribe un
manifiesto JSON con qué es y cómo restaurarlo; y aplica retención local y remota.

### Programación en producción

```
# Diario, 02:15 hora de Bogotá
15 2 * * *  TZ=America/Bogota /ruta/repo/infra/scripts/backup.sh --subir-s3 >> /var/log/terracolombia-backup.log 2>&1

# Completo (con raw) los domingos
15 3 * * 0  TZ=America/Bogota /ruta/repo/infra/scripts/backup.sh --completo --subir-s3
```

En producción hay además **snapshots automáticos de RDS** y **versionado del
bucket de S3**. El `pg_dump` es la tercera copia: la que se puede restaurar en
otro proveedor si hiciera falta.

### Restauración

```bash
# Desde disco local, a una base nueva (lo recomendado)
bash infra/scripts/restore.sh backups/terracolombia_..._sin-raw \
     --destino terracolombia_verificacion

# Desde S3
bash infra/scripts/restore.sh s3://terracolombia-backups/postgres/terracolombia_....tar.zst

# Solo el esquema de aplicación
bash infra/scripts/restore.sh <respaldo> --esquema app
```

El script verifica el volcado antes de tocar nada, exige escribir el nombre de la
base para confirmar y, si el destino parece producción, exige además
`--si-estoy-seguro`.

### Prueba de restauración mensual

**Obligatoria, el primer lunes de cada mes.** Un respaldo que nunca se ha
restaurado no es un respaldo, es una esperanza.

```bash
bash infra/scripts/restore.sh <último respaldo> --destino terracolombia_prueba
# Comprobar conteos por esquema, que EPSG:9377 esté, y que la API arranque
# contra esa base.
psql -d terracolombia_prueba -c "SELECT count(*) FROM core.parcel;"
dropdb terracolombia_prueba
```

Anotar la fecha y el resultado. Si la prueba falla, es un incidente de prioridad
alta aunque nada esté caído.

---

<a id="entornos"></a>

## 8. Entornos

| | **dev** | **staging** | **producción** |
|---|---|---|---|
| Dónde | Equipo de cada persona | EC2 + CapRover | EC2 + CapRover |
| Rama | cualquiera | `develop` | `main` |
| Despliegue | manual (`pnpm dev`) | automático al fusionar | **con aprobación manual** |
| Base de datos | Postgres 17 nativo o contenedor | RDS pequeña | RDS + pgbouncer + réplica de lectura |
| Datos | semilla sintética | 1 departamento real | todos los departamentos IGAC |
| Redis | opcional | contenedor | contenedor con persistencia |
| S3 | disco local | bucket de staging | bucket versionado |
| Pagos | `PAYMENT_PROVIDER=mock` | Wompi *sandbox* | Wompi producción |
| IA | opcional | llave de desarrollo | llave de producción |
| Martin | opcional | activo | activo |
| Respaldos | ninguno | semanal | diario + snapshots RDS + versionado S3 |
| Observabilidad | ninguna | Prometheus + Grafana | Prometheus + Grafana + Sentry + alertas |

### Dominios

| | staging | producción |
|---|---|---|
| Web | `staging.terracolombia.co` | `terracolombia.co` |
| API | `api.staging.terracolombia.co` | `api.terracolombia.co` |
| Docs | `docs.staging.terracolombia.co` | `docs.terracolombia.co` |
| CapRover | `captain.staging.terracolombia.co` | `captain.terracolombia.co` |

### Desplegar

Normalmente no hay que hacer nada: fusionar en `develop` despliega staging, y
fusionar en `main` abre la aprobación de producción.

A mano: pestaña **Actions → Desplegar → Run workflow**, eligiendo entorno y
opcionalmente una etiqueta de imagen (para desplegar una versión anterior sin
revertir código).

`deploy.yml` no construye nada: despliega las imágenes que `build-images.yml` ya
publicó en GHCR para ese commit, así que lo que llega a producción es bit a bit lo
que pasó CI.

### Revertir un despliegue

**Desde CapRover** (lo más rápido, menos de un minuto): App → *Deployment* →
*Versions* → seleccionar la versión anterior → **Rollback**.

**Desde GitHub** (deja rastro): Actions → Desplegar → Run workflow → entorno
`produccion` → etiqueta de la versión buena (`main-<sha>`).

Si el problema viene de una migración, ver la sección siguiente.

### Secretos y variables

Los secretos viven en CapRover (App → *App Configs* → Environmental Variables) y
en GitHub (Settings → Secrets). **Nunca en el repositorio.** La lista completa
está en `.env.example` y el mínimo por aplicación en
[`infra/caprover/README.md`](../infra/caprover/README.md).

Secretos que necesita `deploy.yml`:

```
CAPROVER_URL_STAGING       CAPROVER_PASSWORD_STAGING
CAPROVER_URL_PROD          CAPROVER_PASSWORD_PROD
GHCR_PULL_TOKEN            (PAT con read:packages, para que CapRover baje imágenes)
DATABASE_URL               (por entorno, solo si MIGRAR_AL_DESPLEGAR=true)
```

---

<a id="migraciones"></a>

## 9. Migraciones y su reversión

### Dos mecanismos, una frontera

- **SQL versionado** en `packages/db/migrations/NNNN-descripcion.sql` para
  `meta`, `core`, `ctx` y `analytics`. Se aplican en orden y se registran en una
  tabla de control.
- **Prisma Migrate** para el esquema `app`, y solo para ese (regla 8 de
  `CLAUDE.md`).

`pnpm db:migrate` ejecuta ambos, en ese orden.

### La regla que hace posible desplegar sin ventana de mantenimiento

> **Toda migración debe poder aplicarse con la versión anterior del código
> todavía corriendo.**

Durante un despliegue, las migraciones se aplican antes de cambiar las imágenes:
por unos minutos, código viejo habla con esquema nuevo. Eso obliga a partir en
dos los cambios destructivos:

| Cambio | Despliegue N | Despliegue N+1 |
|---|---|---|
| Añadir columna | `ADD COLUMN` con valor por defecto o `NULL` | el código empieza a usarla |
| Renombrar columna | añadir la nueva, escribir en ambas | leer solo la nueva; borrar la vieja |
| Borrar columna | el código deja de usarla | `DROP COLUMN` |
| Índice en tabla grande | `CREATE INDEX CONCURRENTLY` (fuera de transacción) | — |
| `NOT NULL` en tabla grande | añadir `CHECK … NOT VALID`, después `VALIDATE CONSTRAINT` | convertir a `NOT NULL` |

Añadir un `NOT NULL` o un índice no concurrente sobre una tabla de millones de
filas toma un `ACCESS EXCLUSIVE LOCK` y deja la aplicación caída mientras dura.
Es la causa más común de una caída provocada por un despliegue «inofensivo».

### Reversión

Cada migración debe traer su camino de vuelta. Tres casos:

**1. Reversión escrita.** `packages/db/migrations/NNNN-descripcion.down.sql`. Es
lo preferible para cambios estructurales.

```bash
pnpm --filter @terracolombia/db migrate:down     # revierte la última
pnpm --filter @terracolombia/db migrate:to 0012  # revierte hasta la 0012
```

**2. Reversión trivial.** Añadir una columna `NULL` se revierte con
`DROP COLUMN`, y basta documentarlo en un comentario de la migración.

**3. Irreversible.** Borrar datos no se deshace con SQL. La migración debe
decirlo en su cabecera y, antes de aplicarse en producción, exige un respaldo
reciente verificado.

### Procedimiento en producción

```bash
# 1. Respaldo verificado, sí o sí
bash infra/scripts/backup.sh --subir-s3

# 2. Probar primero en staging con datos reales de un departamento
#    (Actions → Desplegar → staging)

# 3. Aplicar en producción: lo hace deploy.yml si MIGRAR_AL_DESPLEGAR=true,
#    desde la imagen del worker, para que la versión de las migraciones sea
#    exactamente la del despliegue.

# 4. Verificar
psql "$DATABASE_URL" -c "SELECT * FROM meta.migration ORDER BY applied_at DESC LIMIT 5;"
curl -fsS https://api.terracolombia.co/ready
```

Si la migración falla a medias: revertir el despliegue desde CapRover (el código
viejo sigue funcionando con el esquema a medio migrar **si** se respetó la regla
de compatibilidad), y después arreglar la migración con calma.

---

<a id="alertas"></a>

## 10. Observabilidad y alertas

### Qué hay

| Pieza | Para qué |
|---|---|
| **Prometheus** | Recoge métricas de la API, el worker, Postgres y Redis. Configuración en [`infra/prometheus/prometheus.yml`](../infra/prometheus/prometheus.yml). |
| **Reglas de alerta** | [`infra/prometheus/alerts.yml`](../infra/prometheus/alerts.yml). Los umbrales de rendimiento son los objetivos de PLAN §13. |
| **Grafana** | Tres tableros aprovisionados: **API y rendimiento**, **ETL y linaje de datos**, **Negocio**. |
| **Sentry** | Errores con traza y contexto, sin PII. |
| **Pino** | Registro estructurado en JSON. |
| **`/health` y `/ready`** | Salud del proceso y de sus dependencias. |

### Severidades

| Severidad | Qué significa | Respuesta |
|---|---|---|
| **crítica** | El producto no funciona, o hay riesgo legal o de datos personales. | Inmediata, a cualquier hora. |
| **alta** | Una función principal está degradada. | El mismo día laboral. |
| **media** | Funciona peor de lo que debería. | Esta semana. |

Dos alertas son de **cumplimiento**, no de rendimiento, y ambas son críticas sin
periodo de espera:

- `TerraColombiaPiiDetectada` — la fuente trae campos con datos personales.
- `TerraColombiaSnapshotSinteticoActivo` — hay datos de demostración publicados
  como reales.

### Contrato de métricas

Los nombres de métrica que esperan las alertas y los tableros están documentados
en la cabecera de [`prometheus.yml`](../infra/prometheus/prometheus.yml). Si se
añade una métrica nueva, tiene que haber un panel o una alerta que la use: una
métrica que nadie mira es coste sin beneficio.

### Acceso a `/metrics`

`/metrics` **no se publica a Internet**: la API y el worker no exponen ese puerto
fuera de la red interna y el proxy de CapRover no enruta esa ruta. Esa es la
protección principal. Si alguna vez hace falta raspar desde fuera, se activa el
bloque `authorization` de `prometheus.yml` y se define `METRICS_TOKEN`.

---

<a id="problemas"></a>

## 11. Resolución de problemas frecuentes

> Cada entrada corresponde a una alerta o a un síntoma que ya ocurrió.
> **Antes de cualquier cosa**: `pwsh -File infra\scripts\check-health.ps1`.

<a id="servicio-caido"></a>

### Servicio caído

**Alerta:** `TerraColombiaServicioCaido`

```bash
# 1. ¿Responde el proceso?
curl -fsS https://api.terracolombia.co/health
curl -fsS https://api.terracolombia.co/ready

# 2. Registros en CapRover: App → terracolombia-api → Logs
```

| Lo que se ve | Causa habitual | Qué hacer |
|---|---|---|
| `/health` responde, `/ready` falla | Una dependencia caída (Postgres, Redis, S3) | La respuesta de `/ready` dice cuál. Ir a su sección. |
| Reinicios en bucle | Variable de entorno obligatoria ausente, o migración pendiente | Los registros lo dicen en la primera línea. |
| «too many connections» | Pool agotado | [Conexiones agotadas](#conexiones-agotadas) |
| Nada, contenedor muerto | Falta de memoria (OOM) | Subir el límite de la app en CapRover; si es el worker, bajar `ETL_CONCURRENCY`. |

Si no se encuentra la causa en cinco minutos: **revertir a la versión anterior**
desde CapRover y diagnosticar sin presión.

<a id="errores-5xx"></a>

### Errores 5xx

**Alerta:** `TerraColombiaApiErrores5xx`

1. Sentry: agrupa por traza y suele señalar la línea exacta.
2. Tablero **API y rendimiento** → panel «Peticiones por segundo, por código de
   respuesta»: ¿son de una ruta o de todas?
3. Una sola ruta → error en el código de esa ruta. Todas → dependencia (base de
   datos, Redis) o falta de memoria.

```bash
# ¿Coincide con un despliegue? Es la pregunta más rentable.
gh run list --workflow=deploy.yml --limit 5
```

<a id="worker-bloqueado"></a>

### Worker bloqueado

**Alerta:** `TerraColombiaWorkerSinLatido`

El worker no expone HTTP de negocio: su señal de vida es un latido que escribe
periódicamente. Si se detuvo, el proceso puede estar vivo pero atascado.

```bash
# ¿En qué trabajo está?
curl -fsS http://worker:9100/metrics | grep tc_queue_jobs
# Panel de administración → Colas → trabajos activos
```

| Causa | Señal | Qué hacer |
|---|---|---|
| ETL largo y normal | El trabajo activo es de la cola `etl` y avanza | Esperar. Una carga departamental tarda horas. |
| Consulta atascada | Hay una transacción activa de horas | [Transacciones largas](#transacciones-largas) |
| Chromium colgado | Trabajo de la cola `reports` sin avanzar | Reiniciar el worker; el trabajo se reintenta. |
| Falta de memoria | El contenedor reinició | Subir memoria o bajar `ETL_CONCURRENCY`. |

Reiniciar el worker es seguro: los ETL son reanudables y los informes se
reintentan. Lo único delicado es un corte a mitad de `publish`, que es una
transacción y por tanto tampoco puede quedar a medias.

<a id="ficha-de-predio-lenta"></a>

### Ficha de predio lenta

**Alerta:** `TerraColombiaFichaPredioLenta` · **objetivo: p95 < 800 ms**

Es la pantalla central del producto. Por orden de probabilidad:

```sql
-- 1. ¿Falta ANALYZE tras una carga? Es la causa número uno.
SELECT relname, last_analyze, last_autoanalyze, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'core' ORDER BY last_analyze NULLS FIRST LIMIT 10;
-- Si sale NULL o muy antiguo:
ANALYZE core.parcel;
```

```sql
-- 2. ¿El plan dejó de usar el índice?
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM core.parcel
WHERE npn = '08573001000000010001000000000' AND snapshot_id = <activo>;
-- Debe salir Index Scan, nunca Seq Scan.
```

```sql
-- 3. ¿El particionado está descartando particiones?
-- El plan debe mencionar una sola partición, no 32.
EXPLAIN SELECT * FROM core.parcel WHERE muni_code = '08573' LIMIT 10;
```

4. Vistas materializadas de contexto sin refrescar: tablero **ETL y linaje**,
   panel de vistas materializadas.
5. Tablero **API y rendimiento** → «Consultas SQL más costosas»
   (`pg_stat_statements`).

<a id="teselas-lentas"></a>

### Teselas lentas

**Alertas:** `TerraColombiaTeselaLenta`, `TerraColombiaTeselaLentaSinCache`,
`TerraColombiaCacheTeselasFria` · **objetivo: p95 < 200 ms con caché**

El panel «Latencia de teselas: acierto vs. fallo de caché» separa los dos
problemas posibles:

**Solo los fallos de caché son lentos** → el problema está en PostGIS:

```sql
-- ¿Hay índice GiST en la geometría?
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'core' AND tablename = 'parcel' AND indexdef LIKE '%gist%';

-- ¿Los polígonos grandes están troceados? Un polígono de un millón de vértices
-- hace inútil el índice: su bounding box cubre medio país.
SELECT 'protected_area' AS tabla, max(ST_NPoints(geom)) AS max_vertices FROM ctx.protected_area
UNION ALL SELECT 'soil_unit', max(ST_NPoints(geom)) FROM ctx.soil_unit;
-- Por encima de ~10.000 vértices, aplicar ST_Subdivide en la ingesta.
```

Verificar también que `core.parcel` tiene `minzoom: 14` en
[`infra/martin.yaml`](../infra/martin.yaml): servir predios a zoom 10 son decenas
de miles de polígonos por tesela.

**También los aciertos son lentos** → Redis o la red:

```bash
redis-cli --latency
redis-cli info memory | grep -E 'used_memory_human|maxmemory_human'
```

**El acierto de caché cayó** → puede ser normal (se acaba de publicar un corte, y
la clave de caché incluye el `snapshot_id`) o señal de raspado sistemático. Cruzar
con `tc_tile_quota_exceeded_total` y con
[SEGURIDAD.md §Anti-scraping](./SEGURIDAD.md#anti-scraping).

<a id="analisis-de-zona-lento"></a>

### Análisis de zona lento

**Alerta:** `TerraColombiaAnalisisZonaLento` · **objetivo: p95 < 5 s para ≤ 5 km²**

Solo se vigila el tramo ≤ 5 km²: por encima el análisis es asíncrono por diseño.

1. **¿Está usando los agregados H3 o consultando en crudo?** Es el error de
   diseño más caro: contar población y equipamientos dentro de un polígono
   arbitrario en tiempo real no cabe en cinco segundos. Con la rejilla H3
   precalculada, es una suma sobre celdas.
2. **¿Está `analytics.h3_cell` calculada para esa zona?** Si el ETL de agregados
   no corrió, cada análisis la recalcula al vuelo.
3. **¿El límite de área por plan está bien aplicado?** Un usuario del plan gratis
   no debería poder lanzar un análisis de 500 km².

```sql
SELECT res, count(*) FROM analytics.h3_cell GROUP BY res ORDER BY res;
```

<a id="informes-lentos"></a>

### Informes lentos

**Alerta:** `TerraColombiaInformePdfLento` · **objetivo: p95 < 60 s**

| Causa | Comprobación |
|---|---|
| Chromium sin memoria | Memoria del contenedor `worker` en CapRover. Chromium necesita ~512 MB por instancia. |
| ETL saturando la base | ¿Hay una carga corriendo? Los informes compiten por la misma base. |
| Mapas estáticos lentos | El renderizado headless de MapLibre es lo más caro del informe. |
| Demasiados informes a la vez | Panel de administración → Colas → `reports`. |

Si es recurrente, la salida está prevista: separar la cola de informes de la de
ETL desplegando la misma imagen del worker dos veces, con `WORKER_QUEUES=etl` y
`WORKER_QUEUES=reports` (ver
[`infra/caprover/README.md`](../infra/caprover/README.md), decisión 2).

<a id="informes-fallidos"></a>

### Informes fallidos

**Alertas:** `TerraColombiaInformesFallando`, `TerraColombiaSinInformesGenerados`

**Un informe fallido es un cobro sin entrega.** Es lo más urgente de esta lista
después de los incidentes de cumplimiento.

```bash
# Panel de administración → Colas → reports → fallidos
# El error de cada trabajo está en su registro.
```

1. Reintentar desde el panel.
2. Si no se puede reintentar, **devolver los créditos** al usuario y avisarle. No
   esperar a que reclame.
3. Causas habituales: Chromium sin memoria, snapshot revertido a mitad de
   generación, S3 inalcanzable al subir el PDF.

`TerraColombiaSinInformesGenerados` (24 h sin un solo informe habiendo
suscripciones activas) detecta el fallo silencioso: algo se rompió en el flujo y
no produce error visible. Probar la generación de punta a punta con una cuenta de
prueba.

<a id="conexiones-agotadas"></a>

### Conexiones agotadas

**Alerta:** `TerraColombiaConexionesAgotandose`

```sql
SELECT count(*), state, application_name
FROM pg_stat_activity WHERE datname = 'terracolombia'
GROUP BY state, application_name ORDER BY count(*) DESC;
```

| Lo que se ve | Causa | Qué hacer |
|---|---|---|
| Muchas `idle in transaction` | Código que abre transacción y no la cierra | Buscar la ruta culpable; matarlas con `pg_terminate_backend` es un parche. |
| Muchas de Martin | `pool_size` demasiado alto | Bajar `MARTIN_POOL_SIZE`. Martin no debe agotar el pool que necesita la API. |
| Reparto normal, simplemente muchas | Falta pgbouncer | En producción debería absorberlo pgbouncer (PLAN §13). |

```sql
-- Último recurso: cerrar las inactivas de más de 10 minutos.
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname = 'terracolombia' AND state = 'idle in transaction'
  AND state_change < now() - interval '10 minutes';
```

<a id="espacio-en-disco"></a>

### Espacio en disco

**Alerta:** `TerraColombiaDiscoBaseDeDatos`

```sql
-- Qué ocupa qué
SELECT schemaname,
       pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||relname))) AS tamano
FROM pg_stat_user_tables GROUP BY schemaname ORDER BY sum(pg_total_relation_size(schemaname||'.'||relname)) DESC;
```

Casi siempre es `raw`. Política: **tres cortes en línea**, el resto en S3.

```sql
-- Qué snapshots de raw se pueden soltar
SELECT s.id, d.id AS dataset, s.cut_date, s.status, s.row_count
FROM meta.snapshot s JOIN meta.dataset d ON d.id = s.dataset_id
WHERE s.status = 'superseded' ORDER BY s.cut_date;
```

```bash
pnpm etl -- prune --keep 3
```

Segunda causa: bloat por falta de `VACUUM` tras una carga grande.

```sql
VACUUM (ANALYZE, VERBOSE) core.parcel;
-- Si el bloat es severo (requiere ACCESS EXCLUSIVE LOCK: ventana de mantenimiento):
VACUUM FULL core.parcel_08;
```

<a id="replicacion"></a>

### Replicación retrasada

**Alerta:** `TerraColombiaReplicacionRetrasada`

`DATABASE_URL_RO` sirve la GeoAPI pública desde una réplica de lectura. Con
retraso, puede devolver un snapshot que ya no es el activo.

1. Es **esperable** durante una carga masiva: la réplica no sigue el ritmo de
   escritura.
2. Si persiste fuera de la ventana de ETL, revisar en el panel de RDS si la
   réplica está saturada de consultas.
3. Mitigación inmediata: apuntar `DATABASE_URL_RO` a la primaria mientras se
   diagnostica. Cuesta rendimiento, pero no sirve datos incoherentes.

<a id="transacciones-largas"></a>

### Transacciones largas

**Alerta:** `TerraColombiaTransaccionLarga`

```sql
SELECT pid, now() - xact_start AS duracion, state, application_name,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS consulta
FROM pg_stat_activity
WHERE datname = 'terracolombia' AND xact_start IS NOT NULL
ORDER BY xact_start LIMIT 10;
```

Normal durante una carga catastral. Fuera de esa ventana, bloquea el `VACUUM` y
hace crecer el bloat.

```sql
-- Cancelar la consulta (suave)
SELECT pg_cancel_backend(<pid>);
-- Cerrar la conexión (duro; no usar sobre un ETL en curso salvo necesidad)
SELECT pg_terminate_backend(<pid>);
```

<a id="etl-fallido"></a>

### ETL fallido

**Alerta:** `TerraColombiaEtlFallido`

```bash
pnpm etl -- status
pnpm etl -- report <runId>     # informe de la corrida fallida
pnpm etl -- resume <runId>     # reanudar desde el paso que falló
```

| Paso donde falló | Causa habitual | Qué hacer |
|---|---|---|
| `discover` | La fuente cambió de URL o dejó de publicar | Verificar a mano. Si murió, marcarla `NO_DISPONIBLE` en `meta.dataset` en vez de dejarla envejecer en silencio. |
| `download` | Red, o descarga truncada | Reintentar. El checksum detecta la truncación. |
| `stage` | **Falta GDAL**, o la fuente cambió de estructura | `ogr2ogr --version`. Si la estructura cambió, **reinspeccionar**: no inventar campos (regla 2). |
| `validate` | El corte nuevo no pasa una comprobación | [Validaciones de carga](#validaciones-de-carga) |
| `transform` | Un mapeo de campos ya no corresponde | Comparar `raw` con el mapeo de `etl/config/datasets/`. |
| `aggregate` | Un paso supera los 10 min de `executeMaintenance` | Correr `AGGREGATE_TRACE=1 pnpm etl -- aggregate <muni>` para ver qué paso se lleva el tiempo (ADR-012). Si es el 6, comprobar que `analytics.overlay_piece` tiene piezas de la capa (`SELECT layer, count(*) FROM analytics.overlay_piece GROUP BY 1`); si cargaste una capa de restricción con un cargador nuevo, llama a `refreshOverlayPieces()` al publicar. |
| `publish` | Otro snapshot en publicación | Esperar; es una transacción. |

<a id="validaciones-de-carga"></a>

### Validaciones de carga

**Alertas:** `TerraColombiaVariacionAnomalaDeFilas`,
`TerraColombiaGeometriasInvalidas`

**Variación de filas > ±10 %.** El corte no se publica hasta revisarlo a mano.
Dos posibilidades:

```sql
-- ¿Entró o salió un municipio de la base abierta? Eso es un cambio real.
SELECT muni_code, count(*) FROM core.parcel WHERE snapshot_id = <nuevo>
GROUP BY muni_code
EXCEPT
SELECT muni_code, count(*) FROM core.parcel WHERE snapshot_id = <anterior>
GROUP BY muni_code;
```

Si el cambio se concentra en uno o dos municipios, es real. Si está repartido por
todos, es una descarga truncada: repetir `download`.

**Geometrías inválidas.** `ST_MakeValid` se aplica en ingesta, así que el contador
cuenta las que ni así se arreglaron. Se marcan huérfanas y no se publican.

```sql
SELECT count(*), ST_IsValidReason(geom) AS motivo
FROM raw.igac_terreno WHERE NOT ST_IsValid(geom)
GROUP BY ST_IsValidReason(geom) ORDER BY count(*) DESC LIMIT 10;
```

<a id="npn-mal-formados"></a>

### NPN mal formados

**Alerta:** `TerraColombiaNpnMalFormado`

El NPN es la llave del producto: sin él, esos predios no son consultables.

```sql
SELECT npn, length(npn) FROM raw.igac_terreno
WHERE npn !~ '^[0-9]{30}$' LIMIT 20;
```

| Patrón | Causa | Qué hacer |
|---|---|---|
| 20 dígitos | Código antiguo | `packages/geo/npn.ts` debe aceptarlo y convertirlo. |
| Espacios o guiones | Formato de la fuente | Normalizar en `transform`. |
| Menos de 20 dígitos | Ceros a la izquierda perdidos (típico de leer como número) | Leer siempre como texto. |
| Letras | La fuente cambió de estructura | **Reinspeccionar.** No adivinar. |

Si el porcentaje de NPN mal formados salta de golpe, el IGAC cambió algo: pararse
y volver al catálogo, no parchear.

<a id="datasets-envejecidos"></a>

### Datasets envejecidos

**Alerta:** `TerraColombiaContextoDesactualizado`

Puede ser correcto (el MGN del DANE no cambia cada año) o señal de que la fuente
dejó de publicar. Verificar y, si murió, marcarla `NO_DISPONIBLE` en
`meta.dataset` en vez de dejarla envejecer en silencio (reglas 2 y 4).

<a id="cola-atascada"></a>

### Cola atascada

**Alertas:** `TerraColombiaColaAtascada`, `TerraColombiaTrabajosFallidosAcumulados`

```bash
curl -fsS http://worker:9100/metrics | grep tc_queue_jobs
```

Si la cola atascada es `reports`, hay usuarios esperando algo que pagaron:
tratarlo como urgente.

1. ¿El worker está vivo? → [Worker bloqueado](#worker-bloqueado)
2. Escalar réplicas del worker en CapRover.
3. Si es un ETL largo bloqueando informes, separar las colas (ver
   [Informes lentos](#informes-lentos)).
4. Trabajos fallidos acumulados: revisar el error de uno, arreglar la causa,
   reintentar en lote.

<a id="redis-lleno"></a>

### Redis lleno

**Alerta:** `TerraColombiaRedisMemoriaAlta`

```bash
redis-cli info memory | grep -E 'used_memory_human|maxmemory_human|maxmemory_policy'
```

La política es **`noeviction` a propósito**: si Redis desalojara claves, se
perderían trabajos de BullMQ a medias. La consecuencia es que al llegar al límite
**rechaza escrituras** y el ETL falla.

```bash
# Purgar solo la caché de teselas (se regenera sola)
redis-cli --scan --pattern 'tile:*' | xargs -r redis-cli del
```

Subir `REDIS_MAXMEMORY` si el uso legítimo creció. Antes, comprobar que la caché
de teselas tiene TTL: sin TTL, crece indefinidamente.

<a id="pagos"></a>

### Pagos

**Alerta:** `TerraColombiaPagosFallando`

1. **Comprobar primero el panel de estado de Wompi.** Un fallo del proveedor se ve
   exactamente igual que un fallo nuestro desde la métrica.
2. Credenciales: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`,
   `WOMPI_INTEGRITY_SECRET`. Un secreto rotado y no actualizado hace fallar el
   100 %, no el 30 %.
3. Webhooks: tienen que ser idempotentes. Un pago contado dos veces es peor que
   uno perdido.
4. Si el proveedor está caído: los usuarios con suscripción activa siguen
   funcionando; los nuevos cobros esperan. No inventar créditos.

<a id="problema-de-datos"></a>

### «Este dato está mal»

El reporte más frecuente, y casi nunca es un error del programa. Antes de buscar
en el código:

1. **¿El municipio es jurisdicción del IGAC?** Bogotá, Medellín, Cali,
   Barranquilla, Antioquia y otros gestores tienen su propio catastro.
   `core.cadastral_manager` lo dice.
2. **¿Está comparando avalúo catastral con valor comercial?** Son dos cosas
   distintas por definición legal.
3. **¿Qué fecha de corte muestra la ficha?** Si la fuente publicó uno más
   reciente, no es un error, es un corte pendiente.
4. **¿La fuente oficial dice otra cosa hoy?** Comprobar directamente en el
   servicio del IGAC.

Si tras eso el dato sigue estando mal, es un problema real:

```sql
-- Rastrear el dato hasta su origen
SELECT p.npn, p.area_geom_m2, p.area_reported_m2,
       s.cut_date, d.id AS dataset, d.attribution
FROM core.parcel p
JOIN meta.snapshot s ON s.id = p.snapshot_id
JOIN meta.dataset d ON d.id = s.dataset_id
WHERE p.npn = '...';

-- Comparar con lo que llegó en raw
SELECT * FROM raw.igac_terreno WHERE npn = '...';
```

Si `raw` coincide con la fuente y `core` no, el error es del `transform` y es
nuestro. Si `raw` ya venía mal, el error es del origen: se documenta, se reporta
al IGAC y se declara en la ficha.

---

## Contactos y escalado

| Situación | Quién |
|---|---|
| Producción caída | Guardia técnica |
| **Datos personales expuestos** | **privacidad@terracolombia.co, inmediato.** Ver [SEGURIDAD.md](./SEGURIDAD.md#respuesta-ante-incidentes) |
| Fallo de seguridad | Aviso privado en GitHub Security Advisories |
| Duda sobre licencia o atribución | Revisión legal (PLAN §2) |
| Problema de datos de una fuente | Plantilla «Problema de datos» en GitHub |

---

## Documentos relacionados

- [`ARQUITECTURA.md`](./ARQUITECTURA.md) — cómo está construido y por qué
- [`SEGURIDAD.md`](./SEGURIDAD.md) — OWASP ASVS nivel 2, incidentes
- [`DECISIONES.md`](./DECISIONES.md) — registro de decisiones (ADR)
- [`infra/caprover/README.md`](../infra/caprover/README.md) — imágenes y despliegue
- [`../README.md`](../README.md) — presentación y puesta en marcha en cinco pasos

## Actualización de los datos

Los datos del Estado cambian, cada fuente a su ritmo, y ninguna avisa. Hay dos
herramientas y una cadencia sugerida.

### Ver qué está vencido

```
pnpm --filter @terracolombia/db freshness
pnpm --filter @terracolombia/db freshness -- --vencidos
```

El criterio no está escrito a mano en ningún sitio: sale de la frecuencia que cada
dataset declara en el catálogo (`meta.dataset.frequency`) y de la fecha del corte
activo. El informe dice, para cada fuente, si está al día, conviene revisarla o está
vencida, y qué orden la actualiza.

El umbral lleva margen a propósito. Un catastro mensual se avisa a los 35 días y no a
los 30, porque el IGAC no publica el día 1 en punto y avisar antes sería ruido.

### Actualizar

```
powershell -NoProfile -File infra\scripts\refresh.ps1 -Seco          ver qué haría
powershell -NoProfile -File infra\scripts\refresh.ps1 -SaltarCatastro
powershell -NoProfile -File infra\scripts\refresh.ps1
```

Refresca solo lo vencido, de lo barato a lo caro, y recalcula los agregados por celda
al terminar —sin eso los datos nuevos no se ven en el producto—. Un fallo no detiene
el resto: los servicios del Estado se caen a rachas y quedarse sin actualizar siete
fuentes porque una no responde sería peor. Las órdenes fallidas se listan al final.

### Cadencia sugerida

| Cuándo | Qué | Por qué |
|---|---|---|
| Semanal, domingo 03:00 | Todo salvo el catastro | Recoge OSM (cambia a diario), colegios, salud y las capas eventuales |
| Mensual, día 5 a las 02:00 | Pasada completa | El IGAC publica corte mensual; el día 5 ya está arriba |
| Diario, 02:15 | Respaldo (`backup.ps1`) | Restaurar desde volcado no depende de que las fuentes estén en pie |

```
schtasks /Create /TN "TerraColombia Actualizacion semanal" /SC WEEKLY /D SUN /ST 03:00 ^
  /TR "powershell -NoProfile -File C:\ruta\repo\infra\scripts\refresh.ps1 -SaltarCatastro"

schtasks /Create /TN "TerraColombia Actualizacion mensual" /SC MONTHLY /D 5 /ST 02:00 ^
  /TR "powershell -NoProfile -File C:\ruta\repo\infra\scripts\refresh.ps1"
```

### PowerShell: qué versión hace falta

En el equipo de desarrollo está instalado **PowerShell 7.6** (`winget install --id
Microsoft.PowerShell`). Los guiones funcionan igual con él y con el **Windows PowerShell
5.1** que trae Windows de fábrica, y eso es deliberado: un servidor recién montado puede
no tener el 7, y un guion de respaldo que solo corre en la máquina de quien lo escribió
no sirve de nada.

Mantener la compatibilidad con 5.1 cuesta dos reglas, ambas aprendidas a la mala:

**Guardar los `.ps1` con marca de orden de bytes.** Windows PowerShell 5.1 los lee como
ANSI si no la llevan, y los acentos rompen el guion *antes* de ejecutarse: el error que
sale es de sintaxis y no dice nada de codificación.

**Nunca redirigir con `2>&1` la salida de un ejecutable nativo.** Esa versión convierte
cada línea de stderr en un error que aborta el guion, aunque el programa termine bien.
`pg_dump` escribe ahí sus mensajes de progreso y sus avisos informativos, así que el
respaldo fallaba siempre fuera de PowerShell 7 — y como en la máquina de desarrollo
estaba el 7, nadie lo había notado. La salida de error se manda a un archivo y se lee
después.
