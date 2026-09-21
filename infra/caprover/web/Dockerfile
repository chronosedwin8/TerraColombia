# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — imagen de `apps/web` (Vue 3 + Vite → estático en nginx)
#
# Contexto de construcción: la RAÍZ del repositorio.
#   docker build -f infra/caprover/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.terracolombia.co \
#     -t terracolombia/web .
#
# Vite incrusta las variables `VITE_*` en el bundle EN TIEMPO DE CONSTRUCCIÓN:
# por eso son `ARG` y no variables de ejecución. Cambiar la URL de la API exige
# reconstruir. Corolario de seguridad: nunca poner un secreto en una `VITE_*`,
# porque queda en el JavaScript que descarga cualquiera (docs/SEGURIDAD.md).
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

# ─── 2. Construcción del bundle ─────────────────────────────────────────────
FROM fetch AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

# Configuración pública del frontend.
ARG VITE_API_URL=/api
ARG VITE_MAP_STYLE_URL=/map-style.json
ARG VITE_TILES_URL=/api/v1/tiles
ARG VITE_SENTRY_DSN=
# Versión y commit: se muestran en el pie de la web y en los informes, para que
# un informe descargado se pueda atar a una versión concreta del código.
ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=desconocido
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL \
    VITE_TILES_URL=$VITE_TILES_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_APP_VERSION=$APP_VERSION \
    VITE_GIT_SHA=$GIT_SHA

RUN pnpm --filter @terracolombia/web... run build

# ─── 3. Servidor estático ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache tzdata curl \
 && cp /usr/share/zoneinfo/America/Bogota /etc/localtime \
 && echo "America/Bogota" > /etc/timezone

COPY infra/caprover/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

# Orígenes permitidos por la CSP. Se inyectan aquí porque nginx no puede leer
# variables de entorno sin `envsubst`, y el script de plantillas de la imagen
# oficial se salta cuando el contenedor no corre como root (que es nuestro caso).
# Reconstruir la imagen si cambian los dominios.
ARG CSP_CONNECT_SRC="https://api.terracolombia.co"
ARG CSP_IMG_SRC="https://api.terracolombia.co https://mapas.igac.gov.co"
RUN sed -i "s|__CSP_CONNECT_SRC__|${CSP_CONNECT_SRC}|g; s|__CSP_IMG_SRC__|${CSP_IMG_SRC}|g" \
      /etc/nginx/conf.d/default.conf \
 && ! grep -q '__CSP_' /etc/nginx/conf.d/default.conf \
      || (echo "ERROR: quedaron marcadores __CSP_* sin reemplazar en nginx.conf" >&2 && exit 1)

# nginx no root: escucha en 8080 y escribe temporales en /tmp.
# La imagen oficial trae el usuario `nginx` (uid 101).
RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/default.conf \
 && sed -i '/^user /d' /etc/nginx/nginx.conf \
 && sed -i 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && mkdir -p /tmp/nginx-cache \
 && chown -R 101:101 /tmp/nginx-cache /usr/share/nginx/html /var/cache/nginx

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health.txt || exit 1

CMD ["nginx", "-g", "daemon off;"]
