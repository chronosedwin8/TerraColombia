# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — imagen de `apps/api` (Fastify 5)
#
# Contexto de construcción: la RAÍZ del repositorio.
#   docker build -f infra/caprover/api/Dockerfile -t terracolombia/api .
#
# Estrategia de capas para pnpm workspaces:
#   1. `pnpm fetch` con solo el lockfile → esta capa se reutiliza mientras el
#      lockfile no cambie, aunque cambie todo el código.
#   2. `pnpm install --offline --frozen-lockfile` desde la store ya poblada.
#   3. `pnpm deploy --prod` produce un árbol autocontenido sin dependencias de
#      desarrollo y sin enlaces simbólicos al workspace.
#
# La imagen NO lleva Playwright: los informes PDF los genera el `worker`
# (justificación en infra/caprover/README.md).
# ═════════════════════════════════════════════════════════════════════════════

# ─── Base común ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true
# Corepack fija la versión exacta de pnpm declarada en package.json.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ─── 1. Descarga de dependencias (capa cacheable) ───────────────────────────
FROM base AS fetch
# Solo el lockfile: cualquier otro cambio no invalida la descarga.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ─── 2. Construcción ────────────────────────────────────────────────────────
FROM fetch AS build
# `openssl` lo necesita el motor de Prisma en Debian.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY . .

# `--offline`: todo tiene que estar en la store de la etapa anterior; si falta
# algo es que el lockfile está desincronizado y queremos que falle aquí.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

# Cliente de Prisma (esquema `app`). Se genera antes del build de TypeScript
# porque `apps/api` importa sus tipos.
RUN pnpm --filter @terracolombia/db exec prisma generate

# `...` construye la app y todas sus dependencias del workspace en orden.
RUN pnpm --filter @terracolombia/api... run build

# Árbol de producción autocontenido en /out.
# `--legacy` es necesario en pnpm 9 cuando el workspace no usa
# `inject-workspace-packages`.
RUN pnpm --filter @terracolombia/api deploy --prod --legacy /out

# ─── 3. Imagen final ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# `tini` como PID 1: reenvía SIGTERM a Node para que Fastify cierre las
# conexiones y el pool de Postgres antes de morir (CapRover manda SIGTERM en
# cada despliegue).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl tini tzdata \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=America/Bogota \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    # Sin telemetría de terceros en producción.
    NEXT_TELEMETRY_DISABLED=1 \
    npm_config_update_notifier=false

# Usuario no root. La imagen `node` ya trae `node` (uid 1000); creamos uno
# propio con nombre explícito para que los logs y `ps` sean legibles.
RUN groupadd --gid 10001 terracolombia \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin terracolombia

WORKDIR /app
COPY --from=build --chown=10001:10001 /out ./

# Directorio temporal para descargas de exportación en curso; se monta como
# volumen efímero en CapRover si hace falta más espacio.
RUN mkdir -p /app/tmp && chown 10001:10001 /app/tmp
ENV TMPDIR=/app/tmp

USER 10001:10001
EXPOSE 3001

# `/health` responde sin tocar la base de datos (¿el proceso vive?).
# `/ready` sí comprueba Postgres/Redis/S3 y es lo que mira el balanceador.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${API_PORT}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
