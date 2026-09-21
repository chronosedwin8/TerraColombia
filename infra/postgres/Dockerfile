# ─────────────────────────────────────────────────────────────────────────────
# Base de datos de TerraColombia: PostgreSQL + PostGIS + H3 + pgRouting.
#
# POR QUÉ ESTA IMAGEN EXISTE
#
# El compose usaba `postgis/postgis` a secas, que NO incluye `h3` ni
# `h3_postgis`. La migración 0001 las crea sin red de seguridad y el esquema
# declara columnas del tipo `h3index` en ocho tablas (`analytics.h3_cell`,
# `ctx.census_block`, `ctx.elevation_cell`, `ctx.poi`, `ctx.school`,
# `ctx.health_facility`…), además de usar `h3_lat_lng_to_cell` y
# `h3_polygon_to_cells` en la siembra y en el paso `aggregate`.
#
# Es decir: con la imagen oficial de PostGIS, `pnpm db:migrate` falla en la
# primera migración y el despliegue no arranca. El comentario de
# `init/01-extensions.sql` decía que el producto no dependía de H3 porque los
# índices se calculaban en Node con `h3-js` y se guardaban como TEXT (ADR-002);
# eso dejó de ser cierto cuando el cálculo se movió a SQL, y el comentario se
# quedó atrás.
#
# POR QUÉ SE PARTE DE `postgres` Y NO DE `postgis/postgis`
#
# Las etiquetas Debian de `postgis/postgis` siguen sobre Debian 11 (bullseye).
# La imagen oficial de PostgreSQL 17 va sobre Debian 12 (bookworm) y todo
# —PostGIS, H3 y pgRouting— entra como paquete del repositorio oficial de
# PostgreSQL, sin compilar nada. Eso hace la construcción reproducible y sin
# dependencias de código fuente de terceros.
#
# Construir:
#   docker build -t terracolombia/postgis:17 infra/postgres
# o dejar que lo haga el compose, que ya apunta aquí.
# ─────────────────────────────────────────────────────────────────────────────

ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}-bookworm

# `FROM` consume el ARG anterior, así que hay que volver a declararlo.
ARG PG_MAJOR=17
# Serie de PostGIS. El repositorio sirve 3.6, la misma que corre en desarrollo.
ARG POSTGIS_MAJOR=3

RUN set -eux; \
    # El repositorio de PostgreSQL responde 403 por HTTP plano desde dentro de
    # Docker (resuelve a un nodo que lo rechaza), aunque por HTTPS sí sirve. Y
    # para hablar HTTPS hace falta `ca-certificates`, que la imagen no trae. De
    # ahí este baile: se aparta el repositorio, se instalan los certificados
    # desde Debian —que sí responde—, y se vuelve a poner apuntando a HTTPS.
    mv /etc/apt/sources.list.d/pgdg.list /tmp/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    sed 's|http://apt.postgresql.org|https://apt.postgresql.org|' /tmp/pgdg.list \
        > /etc/apt/sources.list.d/pgdg.list; \
    rm /tmp/pgdg.list; \
    \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        postgresql-${PG_MAJOR}-postgis-${POSTGIS_MAJOR} \
        postgresql-${PG_MAJOR}-postgis-${POSTGIS_MAJOR}-scripts \
        postgresql-${PG_MAJOR}-h3 \
        postgresql-${PG_MAJOR}-pgrouting; \
    \
    rm -rf /var/lib/apt/lists/*

# Comprobación en tiempo de construcción: si alguna extensión no quedó
# instalada, es mejor que falle aquí que en el primer arranque del servidor.
RUN set -eux; \
    test -f "$(pg_config --sharedir)/extension/postgis.control"; \
    test -f "$(pg_config --sharedir)/extension/postgis_raster.control"; \
    test -f "$(pg_config --sharedir)/extension/h3.control"; \
    test -f "$(pg_config --sharedir)/extension/h3_postgis.control"; \
    test -f "$(pg_config --sharedir)/extension/pgrouting.control"

# `docker-entrypoint-initdb.d` lo monta el compose desde `infra/postgres/init`,
# que crea las extensiones y registra EPSG:9377. No se copia aquí para que
# cambiar ese SQL no obligue a reconstruir la imagen.
