# Despliegue en CapRover

TerraColombia se despliega como **cuatro aplicaciones CapRover** sobre la misma EC2, contra
una base RDS PostgreSQL con PostGIS (PLAN §3).

| App CapRover | Imagen | Puerto interno | Qué hace |
|---|---|---|---|
| `terracolombia-api` | [`api/Dockerfile`](./api/Dockerfile) | 3001 | Fastify: `/api/v1` interno + `/geo/v1` público + proxy de teselas |
| `terracolombia-web` | [`web/Dockerfile`](./web/Dockerfile) | 80 | SPA Vue 3 servida por nginx |
| `terracolombia-worker` | [`worker/Dockerfile`](./worker/Dockerfile) | — (sin HTTP público) | BullMQ: ETL, informes PDF, análisis pesados, alertas |
| `terracolombia-docs` | [`docs-site/Dockerfile`](./docs-site/Dockerfile) | 80 | Portal de desarrolladores (VitePress) |

En `staging` los nombres llevan sufijo: `terracolombia-api-staging`, etc.

## Ruta del `captain-definition`

CapRover espera `captain-definition` en la raíz del paquete que se le envía. Como aquí hay
cuatro aplicaciones en un monorepo, cada una tiene el suyo en `infra/caprover/<app>/` y se
indica la ruta en la configuración de la app:

> App → **Deployment** → *Captain Definition Relative Path* → `./infra/caprover/api/captain-definition`

El `dockerfilePath` que hay dentro de cada `captain-definition` es relativo a la **raíz del
repositorio**, porque ese es el contexto de construcción que CapRover usa (necesario: el
`Dockerfile` tiene que ver `pnpm-lock.yaml`, `packages/` y `apps/`).

## Decisiones de imagen

**1. Los informes PDF los genera el `worker`, no la `api`.**
Playwright con Chromium añade ~450 MB a una imagen. Meterlo en la `api` encarece cada réplica
del servicio que más escala horizontalmente y que debe arrancar en segundos, para una función
que es asíncrona por diseño: un informe tarda hasta 60 s (§13), así que ya pasa por la cola
(PLAN §4: el worker hace «ETL, informes, análisis pesados, alertas»). La `api` solo crea el
trabajo (`POST /reports`) y entrega el archivo desde S3 (`GET /reports/:id/download`).
Resultado: `api` ligera (~200 MB), `worker` pesada (~1,3 GB) pero con 1–2 réplicas.

**2. El `worker` lleva GDAL y Chromium en la misma imagen.**
Lo alternativo es partirlo en `worker-etl` (GDAL) y `worker-reports` (Chromium), con colas
separadas. No se hace todavía porque duplica la configuración de despliegue para ahorrar
disco en una máquina donde el disco no es el cuello de botella. **Cuándo sí partirlo:** cuando
un ETL mensual largo empiece a retrasar informes de usuarios que ya pagaron; en ese momento se
crea `terracolombia-worker-reports` con la misma imagen y `WORKER_QUEUES=reports`, y al ETL se
le deja `WORKER_QUEUES=etl`. La variable ya está prevista para no tener que tocar la imagen.

**3. Solo Chromium, no los tres navegadores.**
`playwright install chromium` en vez de `playwright install`. Los informes son HTML→PDF con un
único motor; Firefox y WebKit solo hacen falta para los e2e, que corren en CI (no en producción).

## Variables de entorno por app

Se configuran en CapRover (App → *App Configs* → Environmental Variables). **Nunca en el
repositorio.** La lista completa está en `.env.example`; el mínimo por app:

- **api**: `DATABASE_URL`, `DATABASE_URL_RO`, `REDIS_URL`, `S3_*`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `PUBLIC_API_URL`, `MARTIN_URL`, `ANTHROPIC_API_KEY`,
  `WOMPI_*`, `SENTRY_DSN`, `METRICS_TOKEN`
- **web**: se construye con `VITE_API_URL` y `VITE_MAP_STYLE_URL` (van en *build args*, no en
  variables de ejecución: Vite las incrusta en el bundle)
- **worker**: `DATABASE_URL`, `REDIS_URL`, `S3_*`, `ETL_*`, `GDAL_OGR2OGR=/usr/bin/ogr2ogr`,
  `WORKER_QUEUES`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`
- **docs**: `VITE_API_URL` en *build args*

## Salud y reinicio

Las tres apps con HTTP exponen `/health` (listo para servir) y `/ready` (dependencias
alcanzables). CapRover usa el `HEALTHCHECK` del `Dockerfile`. El `worker` no tiene HTTP: su
salud se vigila por el *heartbeat* que escribe en Redis y por la alerta
`TerraColombiaWorkerSinLatido` de `infra/prometheus/alerts.yml`.
