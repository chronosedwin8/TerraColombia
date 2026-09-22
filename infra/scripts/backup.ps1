<#
.SYNOPSIS
    Respaldo de la base de datos de TerraColombia (Windows).

.DESCRIPTION
    Equivalente de `backup.sh`. Hace `pg_dump --format=directory` (único formato
    con restauración paralela y selectiva), verifica que el volcado se pueda
    leer, escribe un manifiesto, opcionalmente lo sube a S3 y aplica retención
    local y remota.

    Por defecto EXCLUYE el esquema `raw`: se puede volver a descargar del IGAC y
    es la mayor parte del volumen. Lo irreemplazable es `app` (usuarios, pagos,
    informes) y `meta` (linaje). Use -Completo para incluirlo todo.

    La contraseña se toma de PGPASSWORD, de %APPDATA%\postgresql\pgpass.conf o
    de .env. NUNCA se imprime ni se pasa por la línea de comandos.

.PARAMETER Completo
    Incluye el esquema `raw`.

.PARAMETER SubirS3
    Empaqueta y sube el respaldo a S3 (requiere la CLI de AWS).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File infra\scripts\backup.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File infra\scripts\backup.ps1 -Completo -SubirS3 -RetencionDias 30

.NOTES
    Tarea programada diaria (02:15, hora de Bogotá):
      schtasks /Create /TN "TerraColombia Respaldo" /SC DAILY /ST 02:15 ^
        /TR "powershell -NoProfile -File C:\ruta\repo\infra\scripts\backup.ps1 -SubirS3"
#>
[CmdletBinding()]
param(
    [string] $PostgresBin   = 'C:\Program Files\PostgreSQL\17\bin',
    [string] $PgHost        = 'localhost',
    [int]    $PgPort        = 5432,
    [string] $PgUser        = 'postgres',
    [string] $Database      = '',
    [string] $Destino       = '',
    [int]    $RetencionDias = 14,
    [int]    $Jobs          = 4,
    [switch] $Completo,
    [switch] $SubirS3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Marca { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Write-Log   { param([string]$m) Write-Host "$(Marca)  $m" }
function Write-Ok    { param([string]$m) Write-Host "$(Marca)  OK    $m" -ForegroundColor Green }
function Write-Aviso { param([string]$m) Write-Host "$(Marca)  AVISO $m" -ForegroundColor Yellow }

function Stop-ConError {
    param([string]$Mensaje, [string]$Solucion)
    Write-Host ''
    Write-Host "$(Marca)  ERROR: $Mensaje" -ForegroundColor Red
    if ($Solucion) { Write-Host "Cómo resolverlo: $Solucion" -ForegroundColor Yellow }
    Write-Host ''
    exit 1
}

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvFile  = Join-Path $RepoRoot '.env'

# Lee una clave de .env sin ejecutar nada del archivo.
function Get-EnvValor {
    param([string]$Clave)
    if (-not (Test-Path $EnvFile)) { return $null }
    foreach ($linea in Get-Content $EnvFile) {
        if ($linea -match "^\s*$([regex]::Escape($Clave))\s*=\s*(.*?)\s*$") {
            return $Matches[1].Trim('"').Trim("'")
        }
    }
    return $null
}

if (-not $Database) { $Database = (Get-EnvValor 'POSTGRES_DB') }
if (-not $Database) { $Database = 'terracolombia' }
if (-not $Destino)  { $Destino  = (Get-EnvValor 'BACKUP_DIR') }
if (-not $Destino)  { $Destino  = Join-Path $RepoRoot 'backups' }
$retEnv = Get-EnvValor 'BACKUP_RETENTION_DAYS'
if ($retEnv -and -not $PSBoundParameters.ContainsKey('RetencionDias')) { $RetencionDias = [int]$retEnv }

# ─── Herramientas ───────────────────────────────────────────────────────────
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
if (-not (Test-Path $pgDump)) {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { $pgDump = $cmd.Source; $PostgresBin = Split-Path -Parent $pgDump }
    else {
        Stop-ConError "No se encontró pg_dump.exe en '$PostgresBin' ni en el PATH." `
            "Instale PostgreSQL o indique la ruta con -PostgresBin."
    }
}
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'

# ─── Contraseña (nunca se imprime) ──────────────────────────────────────────
$pgPassFile = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
if (-not $env:PGPASSWORD -and -not (Test-Path $pgPassFile)) {
    $pwd = Get-EnvValor 'POSTGRES_PASSWORD'
    if (-not $pwd) {
        $url = Get-EnvValor 'DATABASE_URL'
        if ($url -and $url -match '://[^:]+:([^@]+)@') {
            $pwd = [System.Uri]::UnescapeDataString($Matches[1])
        }
    }
    if (-not $pwd) {
        Stop-ConError 'No hay credenciales de PostgreSQL.' `
            "Defina PGPASSWORD, cree $pgPassFile, o ponga POSTGRES_PASSWORD en .env."
    }
    $env:PGPASSWORD = $pwd
}

# ─── Destino ────────────────────────────────────────────────────────────────
$sello   = (Get-Date).ToString('yyyyMMddTHHmmss')
$sufijo  = if ($Completo) { 'completo' } else { 'sin-raw' }
$nombre  = "terracolombia_${Database}_${sello}_${sufijo}"
$rutaDump = Join-Path $Destino $nombre

if (-not (Test-Path $Destino)) {
    try { New-Item -ItemType Directory -Path $Destino -Force | Out-Null }
    catch { Stop-ConError "No se pudo crear el directorio de respaldos '$Destino'." 'Verifique permisos o use -Destino.' }
}

Write-Log "Base:       $Database en $PgHost`:$PgPort (usuario $PgUser)"
Write-Log "Destino:    $rutaDump"
Write-Log "Alcance:    $(if ($Completo) { 'completo (incluye raw)' } else { 'sin el esquema raw' })"
Write-Log "Retención:  $RetencionDias días"

# ─── Espacio libre ──────────────────────────────────────────────────────────
try {
    $unidad = (Get-Item $Destino).PSDrive
    if ($unidad -and $unidad.Free) {
        $libreGb = [math]::Round($unidad.Free / 1GB, 1)
        Write-Log "Espacio libre en el destino: $libreGb GB"
        if ($libreGb -lt 5) { Write-Aviso 'Menos de 5 GB libres: el respaldo puede fallar por falta de espacio.' }
    }
} catch { Write-Aviso 'No se pudo determinar el espacio libre del destino.' }

# ─── Volcado ────────────────────────────────────────────────────────────────
$argumentos = @(
    "--host=$PgHost", "--port=$PgPort", "--username=$PgUser", "--dbname=$Database",
    '--no-password',
    '--format=directory',
    "--jobs=$Jobs",
    '--compress=6',
    '--verbose',
    "--file=$rutaDump"
)
if (-not $Completo) {
    $argumentos += '--exclude-schema=raw'
    $argumentos += '--exclude-table-data=*.*_shadow'
}

Write-Log 'Iniciando pg_dump…'
$inicio = Get-Date

# La salida de error se manda a un archivo en vez de a la tubería con `2>&1`.
#
# Windows PowerShell 5.1 envuelve CADA línea que un ejecutable nativo escribe en stderr en un
# NativeCommandError y aborta el guion, aunque el programa termine con código 0. `pg_dump`
# escribe ahí sus mensajes de progreso de `--verbose` y avisos informativos como «el último
# OID interno es 16383», que no son fallos: con `2>&1` el respaldo moría siempre en esta
# versión de PowerShell. Bajo pwsh 7 funcionaba, y por eso no se había notado. Un respaldo que
# solo funciona en la máquina de quien lo escribió no es un respaldo.
$errLog = Join-Path ([System.IO.Path]::GetTempPath()) "tc-pgdump-$PID.err"
& $pgDump @argumentos 2> $errLog
$codigoDump = $LASTEXITCODE
if (Test-Path $errLog) {
    Get-Content $errLog | ForEach-Object { Write-Host "          $_" -ForegroundColor DarkGray }
    Remove-Item -Force $errLog -ErrorAction SilentlyContinue
}
if ($codigoDump -ne 0) {
    if (Test-Path $rutaDump) { Remove-Item -Recurse -Force $rutaDump }
    Stop-ConError 'pg_dump falló; el respaldo incompleto se eliminó.' `
        'Revise el mensaje anterior. Si es un fallo de conexión, verifique credenciales y que el servidor acepta conexiones.'
}
$duracion = [int]((Get-Date) - $inicio).TotalSeconds
$bytes = (Get-ChildItem -Recurse -File $rutaDump | Measure-Object -Property Length -Sum).Sum
$tamano = "{0:N2} GB" -f ($bytes / 1GB)
Write-Ok "Volcado terminado en ${duracion}s · tamaño $tamano"

# ─── Verificación: el volcado tiene que ser legible ─────────────────────────
if (Test-Path $pgRestore) {
    $indice = "$rutaDump.indice.txt"
    # Mismo motivo que arriba: nada de `2>&1` sobre un ejecutable nativo en PowerShell 5.1.
    & $pgRestore --list $rutaDump 2> $null | Out-File -FilePath $indice -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Stop-ConError 'El volcado generado no se puede leer con pg_restore.' `
            'El respaldo NO es válido. No lo suba ni confíe en él.'
    }
    $objetos = (Get-Content $indice | Where-Object { $_ -match ';' }).Count
    Write-Ok "Volcado verificado: $objetos entradas en el índice."
}

# ─── Manifiesto (sin secretos) ──────────────────────────────────────────────
$manifiesto = [ordered]@{
    proyecto          = 'TerraColombia'
    base_de_datos     = $Database
    servidor          = "$PgHost`:$PgPort"
    fecha_utc         = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    formato           = 'directory'
    alcance           = $sufijo
    tamano            = $tamano
    duracion_segundos = $duracion
    restaurar_con     = "infra/scripts/restore.sh $nombre"
}
$manifiesto | ConvertTo-Json | Out-File -FilePath "$rutaDump.manifiesto.json" -Encoding utf8
Write-Ok 'Manifiesto escrito.'

# ─── Subida a S3 ────────────────────────────────────────────────────────────
if ($SubirS3) {
    $aws = Get-Command aws -ErrorAction SilentlyContinue
    if (-not $aws) {
        Stop-ConError 'No se encontró la CLI de AWS y se pidió -SubirS3.' `
            'Instálela desde https://aws.amazon.com/cli/ o quite -SubirS3.'
    }

    Write-Log 'Empaquetando para subirlo…'
    $zip = Join-Path $Destino "$nombre.zip"
    Compress-Archive -Path $rutaDump, "$rutaDump.manifiesto.json" -DestinationPath $zip -CompressionLevel Optimal -Force
    $zipGb = "{0:N2} GB" -f ((Get-Item $zip).Length / 1GB)
    Write-Ok "Paquete: $(Split-Path -Leaf $zip) ($zipGb)"

    $bucket = if ($env:BACKUP_S3_BUCKET) { $env:BACKUP_S3_BUCKET } else { Get-EnvValor 'BACKUP_S3_BUCKET' }
    if (-not $bucket) {
        Stop-ConError 'BACKUP_S3_BUCKET no está definida.' `
            'Defínala en .env o como variable de entorno (ej.: terracolombia-backups).'
    }
    $prefijo = if ($env:BACKUP_S3_PREFIX) { $env:BACKUP_S3_PREFIX } else { Get-EnvValor 'BACKUP_S3_PREFIX' }
    if (-not $prefijo) { $prefijo = 'postgres' }
    $destinoS3 = "s3://$bucket/$prefijo/$(Split-Path -Leaf $zip)"

    Write-Log "Subiendo a $destinoS3 …"
    $awsArgs = @('s3', 'cp', $zip, $destinoS3, '--only-show-errors', '--storage-class', 'STANDARD_IA')
    if ($env:BACKUP_S3_KMS_KEY_ID) {
        $awsArgs += @('--sse', 'aws:kms', '--sse-kms-key-id', $env:BACKUP_S3_KMS_KEY_ID)
    } else {
        $awsArgs += @('--sse', 'AES256')
    }
    & aws @awsArgs
    if ($LASTEXITCODE -ne 0) {
        Stop-ConError "Falló la subida a $destinoS3." `
            'Verifique credenciales de AWS, que el bucket existe y que el rol tiene permiso s3:PutObject.'
    }
    Write-Ok "Subido a $destinoS3"

    # Retención remota (red de seguridad; lo ideal es una regla de ciclo de vida del bucket).
    Write-Log "Retención remota: borrando objetos de más de $RetencionDias días…"
    $limite = (Get-Date).ToUniversalTime().AddDays(-$RetencionDias).ToString('yyyy-MM-dd')
    $viejos = & aws s3api list-objects-v2 --bucket $bucket --prefix "$prefijo/" `
        --query "Contents[?LastModified<'$limite'].Key" --output text 2>$null
    if ($viejos -and $viejos -ne 'None') {
        foreach ($clave in ($viejos -split '\s+' | Where-Object { $_ })) {
            Write-Log "  borrando s3://$bucket/$clave"
            & aws s3 rm "s3://$bucket/$clave" --only-show-errors
        }
    }

    Remove-Item -Force $zip
}

# ─── Retención local ────────────────────────────────────────────────────────
Write-Log "Retención local: borrando respaldos de más de $RetencionDias días en $Destino…"
$limiteLocal = (Get-Date).AddDays(-$RetencionDias)
$borrados = 0
Get-ChildItem -Path $Destino -Directory -Filter 'terracolombia_*' -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $limiteLocal } |
    ForEach-Object {
        Write-Log "  borrando $($_.Name)"
        Remove-Item -Recurse -Force $_.FullName
        foreach ($extra in @("$($_.FullName).manifiesto.json", "$($_.FullName).indice.txt")) {
            if (Test-Path $extra) { Remove-Item -Force $extra }
        }
        $borrados++
    }
$restantes = (Get-ChildItem -Path $Destino -Directory -Filter 'terracolombia_*' -ErrorAction SilentlyContinue).Count
if ($restantes -eq 0) { Write-Aviso 'La retención dejó el directorio sin respaldos. Revise -RetencionDias.' }
Write-Ok "Retención aplicada: $borrados eliminados, $restantes conservados."

$env:PGPASSWORD = $null
Write-Host ''
Write-Host "$(Marca)  Respaldo completado.  $rutaDump" -ForegroundColor Green
Write-Host ''
