#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — restauración de un respaldo
#
# Restaura un volcado en formato dirigido creado por `backup.sh`, ya sea desde
# el disco local o desde S3.
#
# ─── ESTO BORRA DATOS ───────────────────────────────────────────────────────
# Restaurar sobre una base existente la deja como estaba el día del respaldo:
# todo lo posterior se pierde. El script exige confirmación escrita y, si la
# base de destino parece de producción, exige además --si-estoy-seguro.
#
# Uso:
#   # Restaurar en una base nueva para verificar el respaldo (lo recomendado):
#   bash infra/scripts/restore.sh backups/terracolombia_..._sin-raw --destino terracolombia_verificacion
#
#   # Restaurar desde S3:
#   bash infra/scripts/restore.sh s3://terracolombia-backups/postgres/terracolombia_....tar.zst
#
#   # Restaurar solo el esquema de aplicación (usuarios, pagos, informes):
#   bash infra/scripts/restore.sh <respaldo> --esquema app
#
# Prueba de restauración: hacerla UNA VEZ AL MES contra una base desechable.
# Un respaldo que nunca se ha restaurado no es un respaldo, es una esperanza.
# ═════════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_GRAY=$'\033[90m'; C_OFF=$'\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_GRAY=''; C_OFF=''
fi

marca()  { date '+%Y-%m-%d %H:%M:%S'; }
log()    { printf '%s  %s\n' "$(marca)" "$1"; }
ok()     { printf '%s  %sOK%s    %s\n' "$(marca)" "$C_GREEN" "$C_OFF" "$1"; }
aviso()  { printf '%s  %sAVISO%s %s\n' "$(marca)" "$C_YELLOW" "$C_OFF" "$1"; }
fallar() {
  printf '\n%s  %sERROR: %s%s\n' "$(marca)" "$C_RED" "$1" "$C_OFF" >&2
  [ $# -gt 1 ] && printf '%sCómo resolverlo: %s%s\n\n' "$C_YELLOW" "$2" "$C_OFF" >&2
  exit 1
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

leer_env() {
  [ -f "$ENV_FILE" ] || return 1
  grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}

# ─── Parámetros ─────────────────────────────────────────────────────────────
ORIGEN=''
DESTINO_DB=''
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
JOBS="${RESTORE_JOBS:-4}"
ESQUEMA=''
CREAR=1
SI_ESTOY_SEGURO=0

while [ $# -gt 0 ]; do
  case "$1" in
    --destino|-d)      DESTINO_DB="$2"; shift 2 ;;
    --host)            PGHOST="$2"; shift 2 ;;
    --port)            PGPORT="$2"; shift 2 ;;
    --user|-U)         PGUSER="$2"; shift 2 ;;
    --esquema)         ESQUEMA="$2"; shift 2 ;;
    --jobs|-j)         JOBS="$2"; shift 2 ;;
    --no-crear)        CREAR=0; shift ;;
    --si-estoy-seguro) SI_ESTOY_SEGURO=1; shift ;;
    --help|-h)         sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)                fallar "Opción desconocida: $1" "Ejecute '$0 --help'." ;;
    *)                 ORIGEN="$1"; shift ;;
  esac
done

[ -n "$ORIGEN" ] || fallar 'Falta indicar el respaldo a restaurar.' \
                           "Ejecute '$0 --help' para ver ejemplos."

command -v pg_restore >/dev/null 2>&1 \
  || fallar 'No se encontró pg_restore en el PATH.' \
            'Instale el cliente de PostgreSQL: apt install postgresql-client-16'
command -v psql >/dev/null 2>&1 || fallar 'No se encontró psql en el PATH.' 'Instale el cliente de PostgreSQL.'

DESTINO_DB="${DESTINO_DB:-$(leer_env POSTGRES_DB || true)}"
DESTINO_DB="${DESTINO_DB:-terracolombia}"

# ─── Contraseña (nunca se imprime) ──────────────────────────────────────────
if [ -z "${PGPASSWORD:-}" ] && [ ! -f "${PGPASSFILE:-$HOME/.pgpass}" ]; then
  PGPASSWORD="$(leer_env POSTGRES_PASSWORD || true)"
  [ -z "${PGPASSWORD:-}" ] && PGPASSWORD="$(leer_env DATABASE_URL | sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p' || true)"
  [ -n "${PGPASSWORD:-}" ] \
    || fallar 'No hay credenciales de PostgreSQL.' \
              'Defina PGPASSWORD, cree ~/.pgpass, o ponga POSTGRES_PASSWORD en .env.'
  export PGPASSWORD
fi

psql_run() {
  local db="$1"; shift
  psql --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$db" \
       --no-password --set ON_ERROR_STOP=1 "$@"
}
psql_valor() { local db="$1"; shift; psql_run "$db" --tuples-only --no-align "$@" | tr -d '[:space:]'; }

TEMPORAL=''
limpiar() { [ -n "$TEMPORAL" ] && [ -d "$TEMPORAL" ] && rm -rf "$TEMPORAL"; }
trap limpiar EXIT

# ─── Origen: S3 o local ─────────────────────────────────────────────────────
if [ "${ORIGEN#s3://}" != "$ORIGEN" ]; then
  command -v aws >/dev/null 2>&1 \
    || fallar 'El origen está en S3 pero no se encontró la CLI de AWS.' \
              'Instálela desde https://aws.amazon.com/cli/'
  TEMPORAL="$(mktemp -d)"
  ARCHIVO="$TEMPORAL/$(basename "$ORIGEN")"
  log "Descargando $ORIGEN …"
  aws s3 cp "$ORIGEN" "$ARCHIVO" --only-show-errors \
    || fallar "No se pudo descargar $ORIGEN." 'Verifique credenciales de AWS y que el objeto existe.'
  ok "Descargado ($(du -sh "$ARCHIVO" | cut -f1))"

  log 'Desempaquetando…'
  case "$ARCHIVO" in
    *.tar.zst)
      command -v zstd >/dev/null 2>&1 || fallar 'El paquete es .tar.zst pero zstd no está instalado.' 'apt install zstd'
      zstd -d -c "$ARCHIVO" | tar -C "$TEMPORAL" -xf - ;;
    *.tar.gz|*.tgz) tar -C "$TEMPORAL" -xzf "$ARCHIVO" ;;
    *) fallar "Formato de paquete no reconocido: $ARCHIVO" 'Se esperaba .tar.zst o .tar.gz' ;;
  esac
  rm -f "$ARCHIVO"
  RUTA_DUMP="$(find "$TEMPORAL" -maxdepth 1 -type d -name 'terracolombia_*' | head -n1)"
  [ -n "$RUTA_DUMP" ] || fallar 'El paquete no contiene un volcado reconocible.' 'Esperaba un directorio terracolombia_*'
else
  RUTA_DUMP="$ORIGEN"
  [ -d "$RUTA_DUMP" ] \
    || fallar "No se encontró el directorio de volcado '$RUTA_DUMP'." \
              'Indique la ruta al directorio que creó backup.sh (formato dirigido), no a un archivo suelto.'
fi

# ─── Verificación del volcado antes de tocar nada ───────────────────────────
log 'Verificando el volcado…'
pg_restore --list "$RUTA_DUMP" > /dev/null 2>&1 \
  || fallar 'El volcado no se puede leer con pg_restore.' \
            'El respaldo está corrupto o incompleto. No sirve para restaurar.'
OBJETOS="$(pg_restore --list "$RUTA_DUMP" | grep -c ';' || true)"
ok "Volcado válido: $OBJETOS entradas."

if [ -f "$RUTA_DUMP.manifiesto.json" ]; then
  log 'Manifiesto del respaldo:'
  sed 's/^/          /' "$RUTA_DUMP.manifiesto.json"
fi

# ─── Confirmación ───────────────────────────────────────────────────────────
EXISTE="$(psql_valor postgres --command "SELECT 1 FROM pg_database WHERE datname = '$DESTINO_DB';" || true)"

printf '\n'
printf '%s  ─────────────────────────────────────────────────────────%s\n' "$C_YELLOW" "$C_OFF"
printf '%s   Se va a restaurar sobre la base: %s%s\n' "$C_YELLOW" "$DESTINO_DB" "$C_OFF"
printf '%s   Servidor: %s:%s%s\n' "$C_YELLOW" "$PGHOST" "$PGPORT" "$C_OFF"
if [ "$EXISTE" = '1' ]; then
  printf '%s   LA BASE YA EXISTE: sus datos actuales se PERDERÁN.%s\n' "$C_RED" "$C_OFF"
fi
printf '%s  ─────────────────────────────────────────────────────────%s\n\n' "$C_YELLOW" "$C_OFF"

# Heurística de producción: nombre sin sufijo de entorno y host que no es local.
ES_PRODUCCION=0
case "$DESTINO_DB" in *_test|*_dev|*_verificacion|*_staging) ;; *) [ "$PGHOST" != 'localhost' ] && [ "$PGHOST" != '127.0.0.1' ] && ES_PRODUCCION=1 ;; esac
if [ "$ES_PRODUCCION" -eq 1 ] && [ "$SI_ESTOY_SEGURO" -eq 0 ]; then
  fallar "El destino parece una base de producción ('$DESTINO_DB' en '$PGHOST')." \
         'Si de verdad quiere restaurar ahí, repita el comando con --si-estoy-seguro. Antes, haga un respaldo del estado actual.'
fi

if [ -t 0 ]; then
  printf "  Escriba el nombre de la base para confirmar (%s): " "$DESTINO_DB"
  read -r CONFIRMACION
  [ "$CONFIRMACION" = "$DESTINO_DB" ] || fallar 'Confirmación incorrecta; no se hizo nada.' 'Escriba exactamente el nombre de la base.'
else
  [ "$SI_ESTOY_SEGURO" -eq 1 ] \
    || fallar 'Sin terminal interactiva no se puede confirmar.' \
              'Añada --si-estoy-seguro si está ejecutando esto desde un script.'
fi

# ─── Crear la base si hace falta ────────────────────────────────────────────
if [ "$EXISTE" != '1' ]; then
  if [ "$CREAR" -eq 1 ]; then
    log "Creando la base '$DESTINO_DB'…"
    psql_run postgres --command "CREATE DATABASE \"$DESTINO_DB\" ENCODING 'UTF8';" >/dev/null \
      || fallar "No se pudo crear la base '$DESTINO_DB'." "Verifique que '$PGUSER' tiene permiso CREATEDB."
    ok 'Creada.'
  else
    fallar "La base '$DESTINO_DB' no existe y se pasó --no-crear." 'Quite --no-crear o cree la base a mano.'
  fi
fi

# Las extensiones tienen que existir antes de restaurar: el volcado trae
# tablas con columnas `geometry`, y sin PostGIS el tipo no existe.
log 'Aplicando extensiones base…'
psql_run "$DESTINO_DB" --file "$REPO_ROOT/infra/postgres/init/01-extensions.sql" >/dev/null 2>&1 \
  || aviso 'No se pudieron aplicar todas las extensiones; si la restauración falla por tipos desconocidos, revise PostGIS.'

# ─── Restauración ───────────────────────────────────────────────────────────
RESTORE_ARGS=(
  --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$DESTINO_DB"
  --no-password
  --jobs="$JOBS"
  --clean --if-exists          # reemplaza objetos existentes sin fallar si no están
  --no-owner --no-privileges   # los roles del origen pueden no existir aquí
  --verbose
)
[ -n "$ESQUEMA" ] && RESTORE_ARGS+=(--schema="$ESQUEMA")
RESTORE_ARGS+=("$RUTA_DUMP")

log "Restaurando con $JOBS procesos paralelos…"
INICIO="$(date +%s)"
# pg_restore devuelve código 1 con avisos no fatales (p. ej. "no existe el rol").
# Se capturan y se informan, pero no se toman como fallo total.
set +e
pg_restore "${RESTORE_ARGS[@]}" 2>&1 | sed 's/^/          /'
CODIGO=${PIPESTATUS[0]}
set -e
DURACION=$(( $(date +%s) - INICIO ))

if [ "$CODIGO" -gt 1 ]; then
  fallar "pg_restore terminó con código $CODIGO." \
         'La restauración no se completó. Revise los mensajes anteriores.'
elif [ "$CODIGO" -eq 1 ]; then
  aviso "pg_restore terminó con avisos (código 1). Normal si el volcado trae roles o privilegios que aquí no existen."
fi
ok "Restauración terminada en ${DURACION}s."

# ─── Comprobaciones posteriores ─────────────────────────────────────────────
log 'Comprobando la base restaurada…'
psql_run "$DESTINO_DB" --command 'ANALYZE;' >/dev/null 2>&1 || aviso 'No se pudo ejecutar ANALYZE.'

RESUMEN="$(psql_run "$DESTINO_DB" --tuples-only --no-align --command "
SELECT n.nspname || ': ' || count(*) || ' tablas'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('meta','core','ctx','analytics','app','raw')
GROUP BY n.nspname ORDER BY n.nspname;" 2>/dev/null || true)"
if [ -n "$RESUMEN" ]; then
  log 'Esquemas restaurados:'
  printf '%s\n' "$RESUMEN" | sed 's/^/          /'
fi

TIENE_9377="$(psql_valor "$DESTINO_DB" --command 'SELECT count(*) FROM spatial_ref_sys WHERE srid = 9377;' 2>/dev/null || echo 0)"
if [ "$TIENE_9377" = '1' ]; then
  ok 'EPSG:9377 presente: los cálculos de área y distancia funcionarán.'
else
  aviso 'Falta EPSG:9377. Aplique infra/postgres/init/01-extensions.sql antes de usar la base.'
fi

printf '\n%s  %sRestauración completada sobre "%s".%s\n' "$(marca)" "$C_GREEN" "$DESTINO_DB" "$C_OFF"
printf '%s  Siguiente paso: "pnpm db:migrate" por si el respaldo es anterior a alguna migración.%s\n\n' "$C_GRAY" "$C_OFF"
