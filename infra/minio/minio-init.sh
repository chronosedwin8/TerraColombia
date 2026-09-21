#!/bin/sh
# ═════════════════════════════════════════════════════════════════════════════
# TerraColombia — inicialización de MinIO
#
# Crea el bucket de la aplicación, activa versionado (los informes son
# inmutables y verificables, PLAN §11), aplica reglas de ciclo de vida para las
# descargas crudas del ETL y crea un usuario de aplicación con permisos
# limitados, para que la API y el worker NO usen las credenciales root.
#
# Lo ejecuta el servicio `minio-init` de docker-compose. Es idempotente.
# No imprime secretos.
# ═════════════════════════════════════════════════════════════════════════════
set -eu

BUCKET="${S3_BUCKET:-terracolombia}"
APP_USER="${S3_ACCESS_KEY:-terracolombia-app}"

fallar() {
  echo "ERROR: $1" >&2
  exit 1
}

[ -n "${MINIO_ROOT_USER:-}" ] || fallar "MINIO_ROOT_USER no está definida."
[ -n "${MINIO_ROOT_PASSWORD:-}" ] || fallar "MINIO_ROOT_PASSWORD no está definida."
[ -n "${S3_SECRET_KEY:-}" ] || fallar "S3_SECRET_KEY no está definida (clave del usuario de aplicación)."

echo "→ Conectando con MinIO…"
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 \
  || fallar "No se pudo autenticar contra MinIO. Verifique MINIO_ROOT_USER / MINIO_ROOT_PASSWORD en .env."

echo "→ Bucket '$BUCKET'…"
mc mb --ignore-existing "local/$BUCKET" >/dev/null

echo "→ Versionado del bucket (informes inmutables)…"
mc version enable "local/$BUCKET" >/dev/null 2>&1 || echo "  aviso: no se pudo activar el versionado (¿backend sin soporte?)."

# Estructura de prefijos que espera el ETL y el generador de informes.
#   raw/<datasetId>/<cutDate>/   descargas originales con checksum
#   tiles/                       PMTiles generados por tippecanoe
#   reports/                     PDF/XLSX entregados al usuario
#   exports/                     GeoJSON/GPKG/SHP/KML de exportación
#   backups/                     volcados de pg_dump (solo si no hay S3 real)
echo "→ Prefijos base…"
for p in raw tiles reports exports backups; do
  # MinIO no tiene "carpetas": se crea un objeto centinela de 0 bytes.
  echo "" | mc pipe "local/$BUCKET/$p/.keep" >/dev/null 2>&1 || true
done

echo "→ Ciclo de vida: las descargas crudas caducan a los ${S3_RAW_EXPIRE_DAYS:-180} días…"
mc ilm rule add --expire-days "${S3_RAW_EXPIRE_DAYS:-180}" --prefix "raw/" "local/$BUCKET" >/dev/null 2>&1 \
  || echo "  aviso: la regla de ciclo de vida ya existía o no se pudo aplicar."

echo "→ Usuario de aplicación '$APP_USER' (sin permisos de administración)…"
mc admin user add local "$APP_USER" "$S3_SECRET_KEY" >/dev/null 2>&1 \
  || echo "  el usuario ya existía; no se cambia su clave desde aquí."

# Política acotada al bucket del proyecto: nada de acceso a otros buckets ni a
# las rutas de administración.
cat >/tmp/tc-policy.json <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"],
      "Resource": ["arn:aws:s3:::${BUCKET}"]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": ["arn:aws:s3:::${BUCKET}/*"]
    }
  ]
}
POLICY

mc admin policy create local terracolombia-app /tmp/tc-policy.json >/dev/null 2>&1 \
  || mc admin policy update local terracolombia-app /tmp/tc-policy.json >/dev/null 2>&1 \
  || echo "  aviso: no se pudo crear/actualizar la política."
mc admin policy attach local terracolombia-app --user "$APP_USER" >/dev/null 2>&1 \
  || echo "  la política ya estaba asociada al usuario."
rm -f /tmp/tc-policy.json

echo "✔ MinIO listo. Bucket '$BUCKET' y usuario de aplicación configurados."
echo "  En .env: S3_ENDPOINT=http://localhost:9000  S3_BUCKET=$BUCKET  S3_ACCESS_KEY=$APP_USER"
