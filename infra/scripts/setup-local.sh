#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — preparación del entorno de desarrollo local (Linux / macOS)
#
# Equivalente de `setup-local.ps1`. Verifica Node, pnpm, PostgreSQL, PostGIS y
# GDAL; crea la base si falta; aplica las extensiones; y copia .env.example a
# .env si no existe.
#
# NO ejecuta `pnpm install` ni las migraciones: se lo indica al final.
# NUNCA imprime contraseñas.
#
# Uso:
#   bash infra/scripts/setup-local.sh
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres bash infra/scripts/setup-local.sh
#   bash infra/scripts/setup-local.sh --database terracolombia_test
# ═════════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail

# ─── Presentación ───────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m';  C_GRAY=$'\033[90m';  C_OFF=$'\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_GRAY=''; C_OFF=''
fi

paso()  { printf '\n%s[ %s ]%s\n' "$C_CYAN" "$1" "$C_OFF"; }
ok()    { printf '  %sOK   %s %s\n' "$C_GREEN" "$C_OFF" "$1"; }
aviso() { printf '  %sAVISO%s %s\n' "$C_YELLOW" "$C_OFF" "$1"; }
info()  { printf '        %s%s%s\n' "$C_GRAY" "$1" "$C_OFF"; }

fallar() {
  printf '\n%sERROR: %s%s\n' "$C_RED" "$1" "$C_OFF" >&2
  if [ $# -gt 1 ]; then
    printf '%sCómo resolverlo: %s%s\n\n' "$C_YELLOW" "$2" "$C_OFF" >&2
  fi
  exit 1
}

trap 'fallar "El script se interrumpió en la línea $LINENO." "Revise el mensaje anterior."' ERR

# ─── Parámetros ─────────────────────────────────────────────────────────────
DATABASE="${DATABASE:-terracolombia}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
SKIP_EXTENSIONS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --database|-d)      DATABASE="$2"; shift 2 ;;
    --host)             PGHOST="$2"; shift 2 ;;
    --port)             PGPORT="$2"; shift 2 ;;
    --user|-U)          PGUSER="$2"; shift 2 ;;
    --skip-extensions)  SKIP_EXTENSIONS=1; shift ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) fallar "Opción desconocida: $1" "Ejecute '$0 --help'." ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_EXAMPLE="$REPO_ROOT/.env.example"
ENV_FILE="$REPO_ROOT/.env"
SQL_INIT="$REPO_ROOT/infra/postgres/init/01-extensions.sql"

printf '\n%s════════════════════════════════════════════════════════════%s\n' "$C_CYAN" "$C_OFF"
printf '%s  TerraColombia · preparación del entorno local%s\n' "$C_CYAN" "$C_OFF"
printf '%s════════════════════════════════════════════════════════════%s\n' "$C_CYAN" "$C_OFF"
info "Repositorio: $REPO_ROOT"

# ═════════════════════════════════════════════════════════════════════════════
# 1. Node.js
# ═════════════════════════════════════════════════════════════════════════════
paso 'Node.js'
command -v node >/dev/null 2>&1 \
  || fallar 'No se encontró Node.js en el PATH.' \
            'Instale Node.js 22 LTS o superior (https://nodejs.org o nvm).'
NODE_VERSION="$(node --version | tr -d 'v')"
NODE_MAJOR="${NODE_VERSION%%.*}"
[ "$NODE_MAJOR" -ge 22 ] \
  || fallar "Node.js $NODE_VERSION es demasiado antiguo (se requiere 22 o superior)." \
            'El proyecto se prueba en CI contra las versiones 22 y 24.'
ok "Node.js $NODE_VERSION"

# ═════════════════════════════════════════════════════════════════════════════
# 2. pnpm
# ═════════════════════════════════════════════════════════════════════════════
paso 'pnpm'
command -v pnpm >/dev/null 2>&1 \
  || fallar 'No se encontró pnpm en el PATH.' \
            'Ejecute: corepack enable && corepack prepare pnpm@9.15.9 --activate'
PNPM_VERSION="$(pnpm --version)"
PNPM_MAJOR="${PNPM_VERSION%%.*}"
[ "$PNPM_MAJOR" -ge 9 ] \
  || fallar "pnpm $PNPM_VERSION es demasiado antiguo (se requiere 9.x)." \
            'Ejecute: corepack prepare pnpm@9.15.9 --activate'
ok "pnpm $PNPM_VERSION"

# ═════════════════════════════════════════════════════════════════════════════
# 3. Herramientas de PostgreSQL y GDAL
# ═════════════════════════════════════════════════════════════════════════════
paso 'Herramientas de PostgreSQL y GDAL'
command -v psql >/dev/null 2>&1 \
  || fallar 'No se encontró psql en el PATH.' \
            'Instale el cliente de PostgreSQL: apt install postgresql-client-16 · brew install libpq'
ok "psql: $(command -v psql)"

if command -v pg_dump >/dev/null 2>&1; then
  ok 'pg_dump disponible (necesario para infra/scripts/backup.sh)'
else
  aviso 'No se encontró pg_dump; los respaldos no funcionarán.'
fi

OGR_PATH=''
if command -v ogr2ogr >/dev/null 2>&1; then
  OGR_PATH="$(command -v ogr2ogr)"
  ok "GDAL: $(ogr2ogr --version 2>&1 | head -n1)"
  info "En .env:  GDAL_OGR2OGR=$OGR_PATH"
else
  aviso 'No se encontró ogr2ogr. La ingesta desde servicios REST y CSV funcionará,'
  info  'pero la carga de la GDB/GeoPackage mensual del IGAC no (docs/DECISIONES.md ADR-005).'
  info  'Instálelo con: apt install gdal-bin · brew install gdal'
fi

# ═════════════════════════════════════════════════════════════════════════════
# 4. Contraseña de PostgreSQL (nunca se imprime)
# ═════════════════════════════════════════════════════════════════════════════
paso 'Credenciales de PostgreSQL'

password_de_env_file() {
  [ -f "$ENV_FILE" ] || return 1
  local v
  v="$(grep -E '^[[:space:]]*POSTGRES_PASSWORD[[:space:]]*=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//')" || true
  if [ -n "${v:-}" ]; then printf '%s' "$v"; return 0; fi
  # Segundo intento: extraerla de DATABASE_URL.
  v="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ENV_FILE" | head -n1 \
       | sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p')" || true
  if [ -n "${v:-}" ]; then printf '%s' "$v"; return 0; fi
  return 1
}

ORIGEN_PASSWORD='variable de entorno PGPASSWORD'
if [ -z "${PGPASSWORD:-}" ]; then
  if PGPASSWORD="$(password_de_env_file)"; then
    ORIGEN_PASSWORD='.env'
  else
    info "No se encontró la contraseña de '$PGUSER' en PGPASSWORD ni en .env."
    printf "  Contraseña de PostgreSQL para el usuario '%s': " "$PGUSER"
    # -s: no se muestra lo que se escribe.
    read -r -s PGPASSWORD
    printf '\n'
    ORIGEN_PASSWORD='entrada por consola'
  fi
fi
[ -n "${PGPASSWORD:-}" ] \
  || fallar 'No se proporcionó contraseña de PostgreSQL.' \
            'Defina PGPASSWORD, o POSTGRES_PASSWORD en .env, o escríbala cuando el script la pida.'
export PGPASSWORD
ok "Contraseña obtenida de: $ORIGEN_PASSWORD  (no se muestra ni se registra)"

# psql lee PGPASSWORD del entorno: la contraseña no pasa por la línea de comandos.
psql_run() {
  local db="$1"; shift
  psql --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$db" \
       --no-password --set ON_ERROR_STOP=1 "$@"
}
psql_valor() {
  local db="$1"; shift
  psql_run "$db" --tuples-only --no-align "$@" | tr -d '[:space:]'
}

# ═════════════════════════════════════════════════════════════════════════════
# 5. Conexión al servidor
# ═════════════════════════════════════════════════════════════════════════════
paso "Conexión a PostgreSQL ($PGHOST:$PGPORT)"
if ! SERVER_VERSION="$(psql_valor postgres --command 'SHOW server_version;' 2>&1)"; then
  fallar "No se pudo conectar a PostgreSQL en $PGHOST:$PGPORT como '$PGUSER'." \
         "Verifique que el servidor está corriendo, el puerto, y la contraseña del usuario '$PGUSER'. Detalle: $SERVER_VERSION"
fi
ok "PostgreSQL $SERVER_VERSION"
PG_MAJOR="${SERVER_VERSION%%.*}"
if [ "${PG_MAJOR:-0}" -lt 16 ] 2>/dev/null; then
  aviso "El plan pide PostgreSQL 16 o superior; se encontró $SERVER_VERSION."
fi

# ═════════════════════════════════════════════════════════════════════════════
# 6. Base de datos
# ═════════════════════════════════════════════════════════════════════════════
paso "Base de datos '$DATABASE'"
EXISTE="$(psql_valor postgres --command "SELECT 1 FROM pg_database WHERE datname = '$DATABASE';")"
if [ "$EXISTE" = '1' ]; then
  ok 'Ya existe.'
else
  info 'No existe; creándola…'
  psql_run postgres --command "CREATE DATABASE \"$DATABASE\" ENCODING 'UTF8';" >/dev/null \
    || fallar "No se pudo crear la base de datos '$DATABASE'." \
              "Verifique que el usuario '$PGUSER' tiene permiso CREATEDB."
  ok 'Creada.'
fi

# ═════════════════════════════════════════════════════════════════════════════
# 7. Extensiones y EPSG:9377
# ═════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_EXTENSIONS" -eq 1 ]; then
  paso 'Extensiones'
  aviso 'Omitido por --skip-extensions.'
else
  paso 'Extensiones y EPSG:9377'
  [ -f "$SQL_INIT" ] || fallar "No se encontró $SQL_INIT." 'El repositorio está incompleto.'
  psql_run "$DATABASE" --file "$SQL_INIT" \
    || fallar 'Falló la aplicación de las extensiones.' \
              'Lo más probable es que falte PostGIS: apt install postgresql-16-postgis-3 · brew install postgis'

  RESUMEN="$(psql_run "$DATABASE" --tuples-only --no-align --command \
    "SELECT string_agg(extname || ' ' || extversion, ', ' ORDER BY extname)
     FROM pg_extension
     WHERE extname IN ('postgis','postgis_raster','pg_trgm','unaccent','pgcrypto','h3','h3_postgis','pgrouting');")"
  ok "Extensiones: $RESUMEN"

  TIENE_9377="$(psql_valor "$DATABASE" --command 'SELECT count(*) FROM spatial_ref_sys WHERE srid = 9377;')"
  if [ "$TIENE_9377" = '1' ]; then
    ok 'EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional) presente.'
  else
    fallar 'EPSG:9377 no quedó registrado en spatial_ref_sys.' \
           'Sin él no se pueden calcular áreas ni distancias. Revise los errores de psql más arriba.'
  fi
fi

# ═════════════════════════════════════════════════════════════════════════════
# 8. Archivo .env
# ═════════════════════════════════════════════════════════════════════════════
paso 'Archivo .env'
if [ -f "$ENV_FILE" ]; then
  ok '.env ya existe; no se toca.'
  info 'Compare con .env.example por si hay variables nuevas:'
  info "  diff <(grep -oE '^[A-Z_]+' .env.example | sort -u) <(grep -oE '^[A-Z_]+' .env | sort -u)"
elif [ -f "$ENV_EXAMPLE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"   # solo el propietario puede leerlo
  ok '.env creado a partir de .env.example (permisos 600).'
  aviso 'Falta editarlo: al menos DATABASE_URL, JWT_SECRET y JWT_REFRESH_SECRET.'
  info  'Genere secretos con:  node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"base64url\"))"'
  [ -n "$OGR_PATH" ] && info "Sugerencia:  GDAL_OGR2OGR=$OGR_PATH"
else
  fallar 'No se encontró .env.example.' 'El repositorio está incompleto.'
fi

if [ -f "$REPO_ROOT/.gitignore" ] && ! grep -qE '^\.env$' "$REPO_ROOT/.gitignore"; then
  aviso '.gitignore no parece ignorar .env. Revíselo antes de hacer commit.'
fi

# ═════════════════════════════════════════════════════════════════════════════
# 9. Siguientes pasos
# ═════════════════════════════════════════════════════════════════════════════
unset PGPASSWORD
trap - ERR

printf '\n%s════════════════════════════════════════════════════════════%s\n' "$C_GREEN" "$C_OFF"
printf '%s  Entorno verificado.%s\n' "$C_GREEN" "$C_OFF"
printf '%s════════════════════════════════════════════════════════════%s\n\n' "$C_GREEN" "$C_OFF"
cat <<'PASOS'
  Siguientes pasos:
    1. Edite .env (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET).
    2. pnpm install
    3. pnpm db:migrate
    4. pnpm db:seed        # municipio piloto, datos de demostración
    5. pnpm dev

  Opcional (Redis y MinIO, requiere Docker):
    docker compose -f infra/docker-compose.dev.yml --env-file .env up -d

  Documentación: docs/OPERACION.md
PASOS
printf '\n'
