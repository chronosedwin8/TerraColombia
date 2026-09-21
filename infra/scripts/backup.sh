#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — respaldo de la base de datos
#
# Hace `pg_dump` en formato dirigido (`--format=directory`), que es el único que
# permite restauración paralela y selectiva. Una base con el catastro nacional
# son cientos de GB: un volcado de texto plano sería inmanejable.
#
# Opcionalmente sube el respaldo a S3 y aplica retención local y remota.
#
# ─── Qué se respalda y qué no ───────────────────────────────────────────────
# Por defecto se EXCLUYE el esquema `raw` (datos crudos por corte): se puede
# volver a descargar del IGAC y es la mayor parte del volumen. Lo que no se
# puede reconstruir es `app` (usuarios, pagos, informes) y `meta` (linaje).
# Con `--completo` se incluye todo.
#
# ─── Secretos ───────────────────────────────────────────────────────────────
# La contraseña se toma de PGPASSWORD, de un archivo ~/.pgpass, o de .env.
# NUNCA se pasa por la línea de comandos ni se imprime.
#
# Uso:
#   bash infra/scripts/backup.sh
#   bash infra/scripts/backup.sh --completo --subir-s3
#   BACKUP_DIR=/mnt/backups bash infra/scripts/backup.sh --subir-s3
#
# Cron sugerido (diario a las 02:15, hora de Bogotá):
#   15 2 * * *  TZ=America/Bogota /ruta/repo/infra/scripts/backup.sh --subir-s3 >> /var/log/terracolombia-backup.log 2>&1
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

# ─── Carga de .env sin exportar nada que no haga falta ──────────────────────
# Se leen solo las claves que este script usa, para no arrastrar el entorno
# entero (y para que un .env con comandos raros no se ejecute).
leer_env() {
  local clave="$1"
  [ -f "$ENV_FILE" ] || return 1
  grep -E "^[[:space:]]*${clave}[[:space:]]*=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'
}

# ─── Parámetros ─────────────────────────────────────────────────────────────
DATABASE="${POSTGRES_DB:-$(leer_env POSTGRES_DB || true)}"
DATABASE="${DATABASE:-terracolombia}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENCION_DIAS="${BACKUP_RETENTION_DAYS:-14}"
JOBS="${BACKUP_JOBS:-4}"
SUBIR_S3=0
COMPLETO=0

while [ $# -gt 0 ]; do
  case "$1" in
    --completo)    COMPLETO=1; shift ;;
    --subir-s3)    SUBIR_S3=1; shift ;;
    --database|-d) DATABASE="$2"; shift 2 ;;
    --destino)     BACKUP_DIR="$2"; shift 2 ;;
    --retencion)   RETENCION_DIAS="$2"; shift 2 ;;
    --help|-h)     sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fallar "Opción desconocida: $1" "Ejecute '$0 --help'." ;;
  esac
done

command -v pg_dump >/dev/null 2>&1 \
  || fallar 'No se encontró pg_dump en el PATH.' \
            'Instale el cliente de PostgreSQL: apt install postgresql-client-16'

# ─── Contraseña (nunca se imprime ni pasa por argv) ─────────────────────────
if [ -z "${PGPASSWORD:-}" ] && [ ! -f "${PGPASSFILE:-$HOME/.pgpass}" ]; then
  PGPASSWORD="$(leer_env POSTGRES_PASSWORD || true)"
  if [ -z "${PGPASSWORD:-}" ]; then
    PGPASSWORD="$(leer_env DATABASE_URL | sed -nE 's#.*://[^:]+:([^@]+)@.*#\1#p' || true)"
  fi
  [ -n "${PGPASSWORD:-}" ] \
    || fallar 'No hay credenciales de PostgreSQL.' \
              'Defina PGPASSWORD, cree ~/.pgpass, o ponga POSTGRES_PASSWORD en .env.'
  export PGPASSWORD
fi

# ─── Destino ────────────────────────────────────────────────────────────────
SELLO="$(date +%Y%m%dT%H%M%S)"
NOMBRE="terracolombia_${DATABASE}_${SELLO}"
[ "$COMPLETO" -eq 1 ] && NOMBRE="${NOMBRE}_completo" || NOMBRE="${NOMBRE}_sin-raw"
DESTINO="$BACKUP_DIR/$NOMBRE"

mkdir -p "$BACKUP_DIR" || fallar "No se pudo crear el directorio de respaldos '$BACKUP_DIR'." \
                                 'Verifique permisos o indique otro con --destino.'

log "Base:       $DATABASE en $PGHOST:$PGPORT (usuario $PGUSER)"
log "Destino:    $DESTINO"
log "Alcance:    $( [ "$COMPLETO" -eq 1 ] && echo 'completo (incluye raw)' || echo 'sin el esquema raw' )"
log "Retención:  $RETENCION_DIAS días"

# ─── Espacio en disco ───────────────────────────────────────────────────────
# Comprobación barata que evita el fallo más común: quedarse sin espacio a las
# tres horas de volcado.
if command -v df >/dev/null 2>&1; then
  LIBRE_KB="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
  LIBRE_GB=$(( LIBRE_KB / 1024 / 1024 ))
  log "Espacio libre en el destino: ${LIBRE_GB} GB"
  [ "$LIBRE_GB" -lt 5 ] && aviso 'Menos de 5 GB libres: el respaldo puede fallar por falta de espacio.'
fi

# ─── Volcado ────────────────────────────────────────────────────────────────
PG_DUMP_ARGS=(
  --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$DATABASE"
  --no-password
  --format=directory          # único formato con restauración paralela
  --jobs="$JOBS"
  --compress=6
  --verbose
  --file="$DESTINO"
)

if [ "$COMPLETO" -eq 0 ]; then
  # `raw` se puede volver a descargar del IGAC; es el 80 % del volumen.
  PG_DUMP_ARGS+=(--exclude-schema=raw)
  # Las tablas sombra de una publicación en curso tampoco sirven de nada.
  PG_DUMP_ARGS+=(--exclude-table-data='*.*_shadow')
fi

log 'Iniciando pg_dump…'
INICIO="$(date +%s)"
if ! pg_dump "${PG_DUMP_ARGS[@]}" 2>&1 | sed 's/^/          /'; then
  rm -rf "$DESTINO"
  fallar 'pg_dump falló; el respaldo incompleto se eliminó.' \
         'Revise el mensaje anterior. Si es un fallo de conexión, verifique credenciales y que el servidor acepta conexiones.'
fi
DURACION=$(( $(date +%s) - INICIO ))
TAMANO="$(du -sh "$DESTINO" | cut -f1)"
ok "Volcado terminado en ${DURACION}s · tamaño $TAMANO"

# ─── Verificación mínima: el volcado tiene que ser legible ──────────────────
# `pg_restore --list` lee el catálogo del volcado. Si falla, el respaldo no
# sirve y es mejor saberlo ahora que el día de la restauración.
if command -v pg_restore >/dev/null 2>&1; then
  if pg_restore --list "$DESTINO" > "$DESTINO.indice.txt" 2>/dev/null; then
    OBJETOS="$(grep -c ';' "$DESTINO.indice.txt" || true)"
    ok "Volcado verificado: $OBJETOS entradas en el índice."
  else
    fallar 'El volcado generado no se puede leer con pg_restore.' \
           'El respaldo NO es válido. No lo suba ni confíe en él.'
  fi
fi

# ─── Manifiesto: qué es este respaldo, sin secretos ─────────────────────────
cat > "$DESTINO.manifiesto.json" <<MANIFIESTO
{
  "proyecto": "TerraColombia",
  "base_de_datos": "$DATABASE",
  "servidor": "$PGHOST:$PGPORT",
  "fecha_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "formato": "directory",
  "alcance": "$( [ "$COMPLETO" -eq 1 ] && echo completo || echo sin-raw )",
  "tamano": "$TAMANO",
  "duracion_segundos": $DURACION,
  "restaurar_con": "infra/scripts/restore.sh $NOMBRE"
}
MANIFIESTO
ok 'Manifiesto escrito.'

# ─── Empaquetado (S3 quiere un objeto, no un árbol de archivos) ─────────────
if [ "$SUBIR_S3" -eq 1 ]; then
  log 'Empaquetando para subirlo…'
  TAR="$BACKUP_DIR/$NOMBRE.tar.zst"
  if command -v zstd >/dev/null 2>&1; then
    tar -C "$BACKUP_DIR" -cf - "$NOMBRE" "$NOMBRE.manifiesto.json" \
      | zstd -T0 -3 -o "$TAR" -q -f
  else
    aviso 'zstd no está instalado; se usa gzip (más lento y más grande).'
    TAR="$BACKUP_DIR/$NOMBRE.tar.gz"
    tar -C "$BACKUP_DIR" -czf "$TAR" "$NOMBRE" "$NOMBRE.manifiesto.json"
  fi
  ok "Paquete: $(basename "$TAR") ($(du -sh "$TAR" | cut -f1))"

  command -v aws >/dev/null 2>&1 \
    || fallar 'No se encontró la CLI de AWS y se pidió --subir-s3.' \
              'Instálela (https://aws.amazon.com/cli/) o quite --subir-s3.'

  S3_BUCKET_BK="${BACKUP_S3_BUCKET:-$(leer_env BACKUP_S3_BUCKET || true)}"
  [ -n "${S3_BUCKET_BK:-}" ] \
    || fallar 'BACKUP_S3_BUCKET no está definida.' \
              'Defínala en .env o como variable de entorno (ej.: terracolombia-backups).'
  S3_PREFIJO="${BACKUP_S3_PREFIX:-$(leer_env BACKUP_S3_PREFIX || true)}"
  S3_PREFIJO="${S3_PREFIJO:-postgres}"
  DESTINO_S3="s3://$S3_BUCKET_BK/$S3_PREFIJO/$(basename "$TAR")"

  log "Subiendo a $DESTINO_S3 …"
  AWS_ARGS=(s3 cp "$TAR" "$DESTINO_S3" --only-show-errors)
  # Cifrado en reposo del lado del servidor. Si hay una llave KMS propia, se usa.
  if [ -n "${BACKUP_S3_KMS_KEY_ID:-}" ]; then
    AWS_ARGS+=(--sse aws:kms --sse-kms-key-id "$BACKUP_S3_KMS_KEY_ID")
  else
    AWS_ARGS+=(--sse AES256)
  fi
  # Almacenamiento de acceso infrecuente: los respaldos se leen casi nunca.
  AWS_ARGS+=(--storage-class STANDARD_IA)

  aws "${AWS_ARGS[@]}" \
    || fallar "Falló la subida a $DESTINO_S3." \
              'Verifique credenciales de AWS, que el bucket existe y que el rol tiene permiso s3:PutObject.'
  ok "Subido a $DESTINO_S3"

  # ─── Retención remota ────────────────────────────────────────────────────
  # Lo ideal es una regla de ciclo de vida del bucket (no depende de que este
  # script corra). Esto es la red de seguridad por si no está configurada.
  log "Retención remota: borrando objetos de más de $RETENCION_DIAS días…"
  LIMITE="$(date -u -d "-${RETENCION_DIAS} days" +%Y-%m-%d 2>/dev/null \
            || date -u -v-"${RETENCION_DIAS}"d +%Y-%m-%d)"
  aws s3api list-objects-v2 --bucket "$S3_BUCKET_BK" --prefix "$S3_PREFIJO/" \
      --query "Contents[?LastModified<'${LIMITE}'].Key" --output text 2>/dev/null \
    | tr '\t' '\n' | grep -v '^None$' | grep -v '^$' \
    | while read -r clave; do
        log "  borrando s3://$S3_BUCKET_BK/$clave"
        aws s3 rm "s3://$S3_BUCKET_BK/$clave" --only-show-errors || aviso "  no se pudo borrar $clave"
      done || true

  rm -f "$TAR"
fi

# ─── Retención local ────────────────────────────────────────────────────────
log "Retención local: borrando respaldos de más de $RETENCION_DIAS días en $BACKUP_DIR…"
BORRADOS=0
while IFS= read -r -d '' viejo; do
  log "  borrando $(basename "$viejo")"
  rm -rf "$viejo" "$viejo.manifiesto.json" "$viejo.indice.txt"
  BORRADOS=$(( BORRADOS + 1 ))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'terracolombia_*' -mtime "+$RETENCION_DIAS" -print0 2>/dev/null || true)

# Salvaguarda: nunca dejar el directorio sin ningún respaldo.
RESTANTES="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'terracolombia_*' | wc -l | tr -d ' ')"
if [ "$RESTANTES" -eq 0 ]; then
  aviso 'La retención dejó el directorio sin respaldos. Revise RETENCION_DIAS.'
fi
ok "Retención aplicada: $BORRADOS eliminados, $RESTANTES conservados."

printf '\n%s  %sRespaldo completado.%s  %s\n\n' "$(marca)" "$C_GREEN" "$C_OFF" "$DESTINO"
