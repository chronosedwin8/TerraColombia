# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — imagen de `apps/worker` (BullMQ: ETL, informes, análisis)
#
# Contexto de construcción: la RAÍZ del repositorio.
#   docker build -f infra/caprover/worker/Dockerfile -t terracolombia/worker .
#
# Esta imagen es la pesada del proyecto y lleva DOS conjuntos de herramientas
# externas a Node:
#
#   · GDAL (`gdal-bin`): `ogr2ogr` es el único camino confiable para leer la
#     File Geodatabase / GeoPackage / Shapefile mensual del IGAC
#     (docs/DECISIONES.md ADR-005). Sin GDAL el ETL catastral no arranca, y
#     preferimos que falle al construir la imagen antes que en producción.
#
#   · Chromium de Playwright: los informes PDF son HTML→PDF (PLAN §11) y se
#     generan aquí, no en la API — ver la justificación en
#     infra/caprover/README.md. Se instala SOLO Chromium.
#
# Si la imagen se vuelve un problema, la salida está prevista: la variable
# WORKER_QUEUES permite desplegar la misma imagen dos veces (una para `etl`,
# otra para `reports`) sin reconstruirla.
# ═════════════════════════════════════════════════════════════════════════════

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ─── 1. Descarga de dependencias ────────────────────────────────────────────
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ─── 2. Construcción ────────────────────────────────────────────────────────
FROM fetch AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm --filter @terracolombia/db exec prisma generate
RUN pnpm --filter @terracolombia/worker... run build
RUN pnpm --filter @terracolombia/worker deploy --prod --legacy /out

# ─── 3. Imagen final ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# Debian bookworm trae GDAL 3.6 en `gdal-bin`. Es suficiente para lo que
# usamos (`-makevalid`, `-nlt PROMOTE_TO_MULTI`, OpenFileGDB, GPKG, SHP).
# Si en algún momento hiciera falta ≥ 3.8, el camino es ubuntugis o la imagen
# `ghcr.io/osgeo/gdal` como base — decisión pendiente hasta que un dataset lo exija.
#
# `postgresql-client-15` (el que trae bookworm) da `psql`, `pg_dump` y sobre
# todo `\copy`, que el ETL usa para cargas masivas a `raw.*`. El cliente 15
# habla sin problemas con un servidor 16/17.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      openssl \
      tini \
      tzdata \
      curl \
      unzip \
      gdal-bin \
      python3-gdal \
      postgresql-client-15 \
      # Dependencias de sistema de Chromium (Playwright). Se listan a mano en
      # vez de usar `playwright install-deps` para no arrastrar los paquetes de
      # Firefox y WebKit, que no se usan.
      fonts-liberation \
      fonts-noto-color-emoji \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      xdg-utils \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=America/Bogota \
    # Ruta absoluta de ogr2ogr: `packages/sources/src/gdal.ts` la lee de aquí
    # y así no depende de resolver el PATH.
    GDAL_OGR2OGR=/usr/bin/ogr2ogr \
    # GDAL deja de reintentar contra servidores caídos y no toca $HOME.
    GDAL_HTTP_TIMEOUT=120 \
    CPL_TMPDIR=/app/tmp \
    # Playwright guarda los navegadores en una ruta fija y legible por el
    # usuario no root; sin esto los busca en ~/.cache y falla.
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    # Colas que atiende este proceso. Ver infra/caprover/README.md.
    WORKER_QUEUES=etl,reports,analysis,alerts

RUN groupadd --gid 10001 terracolombia \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin terracolombia

WORKDIR /app
COPY --from=build --chown=10001:10001 /out ./

# Chromium de Playwright. Se instala DESPUÉS de copiar el árbol de producción
# porque el CLI de Playwright viene con la dependencia y así la versión del
# navegador coincide exactamente con la de la librería.
# `--only-shell` no se usa: los informes necesitan el Chromium completo para
# renderizar mapas MapLibre en WebGL/canvas.
RUN mkdir -p /ms-playwright \
 && node node_modules/playwright-core/cli.js install chromium \
 && chmod -R a+rX /ms-playwright

RUN mkdir -p /app/tmp /app/storage && chown -R 10001:10001 /app/tmp /app/storage
ENV TMPDIR=/app/tmp

USER 10001:10001

# El worker no expone HTTP de negocio, pero sí un puerto de métricas para
# Prometheus (cola, duración de trabajos, linaje de ETL).
EXPOSE 9100

# Verificación de salud sin HTTP de negocio: el propio worker expone
# `/metrics` y `/health` en el puerto de métricas. Si el proceso se quedó
# bloqueado en un trabajo, el latido deja de actualizarse y salta la alerta
# `TerraColombiaWorkerSinLatido`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:9100/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# SIGTERM: el worker deja de tomar trabajos nuevos y espera a que termine el
# actual (los ETL son reanudables, pero un corte a mitad de `publish` sería
# un snapshot a medias).
CMD ["node", "dist/main.js"]
