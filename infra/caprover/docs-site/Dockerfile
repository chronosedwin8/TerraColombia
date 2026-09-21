# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — imagen de `apps/docs-site` (portal de desarrolladores, VitePress)
#
# Contexto de construcción: la RAÍZ del repositorio.
#   docker build -f infra/caprover/docs-site/Dockerfile -t terracolombia/docs .
#
# Publica la documentación de la GeoAPI pública (`/geo/v1`) generada a partir
# del OpenAPI 3.1 que emite Fastify. La especificación se descarga en tiempo de
# construcción desde la API del entorno correspondiente: así la documentación
# nunca puede describir una versión de la API que no existe.
# ═════════════════════════════════════════════════════════════════════════════

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

FROM fetch AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

ARG VITE_API_URL=https://api.terracolombia.co
ARG APP_VERSION=0.0.0-dev
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_VERSION=$APP_VERSION

RUN pnpm --filter @terracolombia/docs-site... run build

FROM nginx:1.31-alpine AS runtime

RUN apk add --no-cache tzdata curl \
 && cp /usr/share/zoneinfo/America/Bogota /etc/localtime \
 && echo "America/Bogota" > /etc/timezone

# VitePress genera rutas limpias con directorios; `try_files` con barra final
# resuelve `/guia/inicio` → `/guia/inicio/index.html`.
COPY infra/caprover/docs-site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs-site/.vitepress/dist /usr/share/nginx/html

ARG CSP_CONNECT_SRC="https://api.terracolombia.co"
RUN sed -i "s|__CSP_CONNECT_SRC__|${CSP_CONNECT_SRC}|g" /etc/nginx/conf.d/default.conf \
 && ! grep -q '__CSP_' /etc/nginx/conf.d/default.conf \
      || (echo "ERROR: quedaron marcadores __CSP_* sin reemplazar en nginx.conf" >&2 && exit 1)

RUN sed -i 's/listen\s*80;/listen 8080;/' /etc/nginx/conf.d/default.conf \
 && sed -i '/^user /d' /etc/nginx/nginx.conf \
 && sed -i 's#^pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
 && chown -R 101:101 /usr/share/nginx/html /var/cache/nginx

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health.txt || exit 1

CMD ["nginx", "-g", "daemon off;"]
