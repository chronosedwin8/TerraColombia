<#
.SYNOPSIS
    Prepara el entorno de desarrollo local de TerraColombia en Windows.

.DESCRIPTION
    Verifica Node, pnpm, PostgreSQL, PostGIS y GDAL; crea la base de datos si
    falta; aplica las extensiones de infra/postgres/init/01-extensions.sql; y
    copia .env.example a .env si todavía no existe.

    NO ejecuta `pnpm install` ni las migraciones: esos pasos los decide la
    persona, y el script se lo dice al terminar.

    Este script NUNCA imprime contraseñas. Lee la de PostgreSQL de la variable
    de entorno PGPASSWORD o de POSTGRES_PASSWORD en .env, y si no la encuentra
    la pide por consola de forma oculta.

.PARAMETER PostgresBin
    Carpeta con psql.exe y ogr2ogr.exe.
    Por defecto: C:\Program Files\PostgreSQL\17\bin

.PARAMETER Database
    Nombre de la base. Por defecto: terracolombia

.PARAMETER SkipExtensions
    No aplicar el script de extensiones (útil si ya está hecho).

.EXAMPLE
    pwsh -File infra\scripts\setup-local.ps1

.EXAMPLE
    pwsh -File infra\scripts\setup-local.ps1 -Database terracolombia_test
#>
[CmdletBinding()]
param(
    [string] $PostgresBin = 'C:\Program Files\PostgreSQL\17\bin',
    [string] $PgHost      = 'localhost',
    [int]    $PgPort      = 5432,
    [string] $PgUser      = 'postgres',
    [string] $Database    = 'terracolombia',
    [switch] $SkipExtensions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Utilidades de salida ────────────────────────────────────────────────────
function Write-Paso  { param([string]$m) Write-Host "`n[ $m ]" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "  OK    $m" -ForegroundColor Green }
function Write-Aviso { param([string]$m) Write-Host "  AVISO $m" -ForegroundColor Yellow }
function Write-Info  { param([string]$m) Write-Host "        $m" -ForegroundColor DarkGray }

function Stop-ConError {
    param([string]$Mensaje, [string]$Solucion)
    Write-Host ''
    Write-Host "ERROR: $Mensaje" -ForegroundColor Red
    if ($Solucion) {
        Write-Host "Cómo resolverlo: $Solucion" -ForegroundColor Yellow
    }
    Write-Host ''
    exit 1
}

# Raíz del repositorio = dos niveles por encima de este archivo.
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvExample = Join-Path $RepoRoot '.env.example'
$EnvFile    = Join-Path $RepoRoot '.env'
$SqlInit    = Join-Path $RepoRoot 'infra\postgres\init\01-extensions.sql'

Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  TerraColombia · preparación del entorno local (Windows)'   -ForegroundColor Cyan
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Info "Repositorio: $RepoRoot"

# ═════════════════════════════════════════════════════════════════════════════
# 1. Node.js
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso 'Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Stop-ConError 'No se encontró Node.js en el PATH.' `
        'Instale Node.js 22 LTS o superior desde https://nodejs.org y vuelva a abrir la terminal.'
}
$nodeVersion = (& node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 22) {
    Stop-ConError "Node.js $nodeVersion es demasiado antiguo (se requiere 22 o superior)." `
        'Actualice Node.js. El proyecto se prueba en CI contra las versiones 22 y 24.'
}
Write-Ok "Node.js $nodeVersion"

# ═════════════════════════════════════════════════════════════════════════════
# 2. pnpm
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso 'pnpm'
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Stop-ConError 'No se encontró pnpm en el PATH.' `
        'Ejecute:  corepack enable  y luego  corepack prepare pnpm@9.15.9 --activate'
}
$pnpmVersion = (& pnpm --version).Trim()
if ([version]($pnpmVersion -replace '-.*$','') -lt [version]'9.0.0') {
    Stop-ConError "pnpm $pnpmVersion es demasiado antiguo (se requiere 9.x)." `
        'Ejecute:  corepack prepare pnpm@9.15.9 --activate'
}
Write-Ok "pnpm $pnpmVersion"

# ═════════════════════════════════════════════════════════════════════════════
# 3. Herramientas de PostgreSQL y GDAL
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso 'Herramientas de PostgreSQL y GDAL'

$psql = Join-Path $PostgresBin 'psql.exe'
if (-not (Test-Path $psql)) {
    # Segundo intento: buscarlo en el PATH.
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($cmd) {
        $psql = $cmd.Source
        $PostgresBin = Split-Path -Parent $psql
    } else {
        Stop-ConError "No se encontró psql.exe en '$PostgresBin' ni en el PATH." `
            "Instale PostgreSQL 16 o superior, o indique la ruta con -PostgresBin 'C:\ruta\a\PostgreSQL\17\bin'."
    }
}
Write-Ok "psql: $psql"

$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
if (Test-Path $pgDump) {
    Write-Ok 'pg_dump disponible (necesario para infra\scripts\backup.ps1)'
} else {
    Write-Aviso 'No se encontró pg_dump.exe; los respaldos no funcionarán.'
}

$ogr = Join-Path $PostgresBin 'ogr2ogr.exe'
if (Test-Path $ogr) {
    $ogrVersion = (& $ogr --version 2>&1 | Select-Object -First 1)
    Write-Ok "GDAL: $ogrVersion"
    Write-Info "En .env:  GDAL_OGR2OGR=$ogr"
} else {
    $ogrCmd = Get-Command ogr2ogr -ErrorAction SilentlyContinue
    if ($ogrCmd) {
        Write-Ok "GDAL: $($ogrCmd.Source)"
        $ogr = $ogrCmd.Source
    } else {
        Write-Aviso 'No se encontró ogr2ogr. La ingesta desde servicios REST y CSV funcionará,'
        Write-Info  'pero la carga de la GDB/GeoPackage mensual del IGAC no (docs/DECISIONES.md ADR-005).'
        $ogr = $null
    }
}

# ═════════════════════════════════════════════════════════════════════════════
# 4. Contraseña de PostgreSQL (nunca se imprime)
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso 'Credenciales de PostgreSQL'

function Get-PasswordDeEnvFile {
    param([string]$Ruta)
    if (-not (Test-Path $Ruta)) { return $null }
    foreach ($linea in Get-Content $Ruta) {
        if ($linea -match '^\s*POSTGRES_PASSWORD\s*=\s*(.+?)\s*$') {
            return $Matches[1].Trim('"').Trim("'")
        }
        # También se acepta extraerla de DATABASE_URL.
        if ($linea -match '^\s*DATABASE_URL\s*=\s*postgres(?:ql)?://[^:]+:([^@]+)@') {
            return [System.Uri]::UnescapeDataString($Matches[1])
        }
    }
    return $null
}

$pgPassword = $env:PGPASSWORD
$origenPassword = 'variable de entorno PGPASSWORD'

if (-not $pgPassword) {
    $pgPassword = Get-PasswordDeEnvFile -Ruta $EnvFile
    if ($pgPassword) { $origenPassword = '.env' }
}
if (-not $pgPassword) {
    Write-Info "No se encontró la contraseña de '$PgUser' en PGPASSWORD ni en .env."
    $secure = Read-Host -Prompt "  Contraseña de PostgreSQL para el usuario '$PgUser'" -AsSecureString
    $pgPassword = [System.Net.NetworkCredential]::new('', $secure).Password
    $origenPassword = 'entrada por consola'
}
if (-not $pgPassword) {
    Stop-ConError 'No se proporcionó contraseña de PostgreSQL.' `
        'Defina PGPASSWORD, o POSTGRES_PASSWORD en .env, o escríbala cuando el script la pida.'
}
Write-Ok "Contraseña obtenida de: $origenPassword  (no se muestra ni se registra)"

# psql lee PGPASSWORD del entorno del proceso: así no aparece en la línea de
# comandos ni en el historial de la consola.
$env:PGPASSWORD = $pgPassword

function Invoke-Psql {
    param(
        [string]   $Db,
        [string]   $Comando,
        [string]   $Archivo,
        [switch]   $SinTuplas
    )
    $args = @('--host', $PgHost, '--port', $PgPort, '--username', $PgUser,
              '--dbname', $Db, '--no-password', '--set', 'ON_ERROR_STOP=1')
    if ($SinTuplas) { $args += @('--tuples-only', '--no-align') }
    if ($Comando)   { $args += @('--command', $Comando) }
    if ($Archivo)   { $args += @('--file', $Archivo) }
    & $psql @args
}

# ═════════════════════════════════════════════════════════════════════════════
# 5. Conexión al servidor
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso "Conexión a PostgreSQL ($PgHost`:$PgPort)"
$serverVersion = Invoke-Psql -Db 'postgres' -Comando 'SHOW server_version;' -SinTuplas 2>&1
if ($LASTEXITCODE -ne 0) {
    Stop-ConError "No se pudo conectar a PostgreSQL en $PgHost`:$PgPort como '$PgUser'." `
        ("Verifique que el servicio está corriendo (Get-Service postgresql*), que el puerto es correcto, " +
         "y que la contraseña es la del usuario '$PgUser'. Detalle: $serverVersion")
}
$serverVersion = ($serverVersion | Out-String).Trim()
Write-Ok "PostgreSQL $serverVersion"

$major = [int](($serverVersion -split '\.')[0])
if ($major -lt 16) {
    Write-Aviso "El plan pide PostgreSQL 16 o superior; se encontró $serverVersion. Algunas migraciones pueden fallar."
}

# ═════════════════════════════════════════════════════════════════════════════
# 6. Base de datos
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso "Base de datos '$Database'"
$existe = (Invoke-Psql -Db 'postgres' -SinTuplas `
    -Comando "SELECT 1 FROM pg_database WHERE datname = '$Database';" | Out-String).Trim()

if ($existe -eq '1') {
    Write-Ok "Ya existe."
} else {
    Write-Info "No existe; creándola…"
    Invoke-Psql -Db 'postgres' -Comando "CREATE DATABASE `"$Database`" ENCODING 'UTF8';" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Stop-ConError "No se pudo crear la base de datos '$Database'." `
            "Verifique que el usuario '$PgUser' tiene permiso CREATEDB."
    }
    Write-Ok "Creada."
}

# ═════════════════════════════════════════════════════════════════════════════
# 7. Extensiones y EPSG:9377
# ═════════════════════════════════════════════════════════════════════════════
if ($SkipExtensions) {
    Write-Paso 'Extensiones'
    Write-Aviso 'Omitido por -SkipExtensions.'
} else {
    Write-Paso 'Extensiones y EPSG:9377'
    if (-not (Test-Path $SqlInit)) {
        Stop-ConError "No se encontró $SqlInit." 'El repositorio está incompleto: vuelva a clonarlo.'
    }
    Invoke-Psql -Db $Database -Archivo $SqlInit
    if ($LASTEXITCODE -ne 0) {
        Stop-ConError 'Falló la aplicación de las extensiones.' `
            ("Lo más probable es que falte PostGIS. Instálelo con el Stack Builder de PostgreSQL " +
             "(Spatial Extensions → PostGIS) y vuelva a ejecutar este script.")
    }

    $resumen = (Invoke-Psql -Db $Database -SinTuplas -Comando @"
SELECT string_agg(extname || ' ' || extversion, ', ' ORDER BY extname)
FROM pg_extension
WHERE extname IN ('postgis','postgis_raster','pg_trgm','unaccent','pgcrypto','h3','h3_postgis','pgrouting');
"@ | Out-String).Trim()
    Write-Ok "Extensiones: $resumen"

    $tiene9377 = (Invoke-Psql -Db $Database -SinTuplas `
        -Comando 'SELECT count(*) FROM spatial_ref_sys WHERE srid = 9377;' | Out-String).Trim()
    if ($tiene9377 -eq '1') {
        Write-Ok 'EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional) presente.'
    } else {
        Stop-ConError 'EPSG:9377 no quedó registrado en spatial_ref_sys.' `
            'Sin él no se pueden calcular áreas ni distancias. Revise los errores de psql más arriba.'
    }
}

# ═════════════════════════════════════════════════════════════════════════════
# 8. Archivo .env
# ═════════════════════════════════════════════════════════════════════════════
Write-Paso 'Archivo .env'
if (Test-Path $EnvFile) {
    Write-Ok '.env ya existe; no se toca.'
    Write-Info 'Compare con .env.example por si hay variables nuevas:'
    Write-Info '  pnpm exec node -e "…"   o simplemente ábralos lado a lado.'
} elseif (Test-Path $EnvExample) {
    Copy-Item $EnvExample $EnvFile
    Write-Ok '.env creado a partir de .env.example.'
    Write-Aviso 'Falta editarlo: al menos DATABASE_URL, JWT_SECRET y JWT_REFRESH_SECRET.'
    if ($ogr) { Write-Info "Sugerencia:  GDAL_OGR2OGR=$ogr" }
} else {
    Stop-ConError 'No se encontró .env.example.' 'El repositorio está incompleto: vuelva a clonarlo.'
}

# `.env` no se versiona nunca. Verificación defensiva por si alguien tocó .gitignore.
$gitignore = Join-Path $RepoRoot '.gitignore'
if ((Test-Path $gitignore) -and -not (Select-String -Path $gitignore -Pattern '^\.env$' -Quiet)) {
    Write-Aviso '.gitignore no parece ignorar .env. Revíselo antes de hacer commit.'
}

# ═════════════════════════════════════════════════════════════════════════════
# 9. Siguientes pasos
# ═════════════════════════════════════════════════════════════════════════════
$env:PGPASSWORD = $null

Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
Write-Host '  Entorno verificado.'                                        -ForegroundColor Green
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Green
Write-Host ''
Write-Host '  Siguientes pasos:' -ForegroundColor White
Write-Host '    1. Edite .env (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET).'
Write-Host '    2. pnpm install'
Write-Host '    3. pnpm db:migrate'
Write-Host '    4. pnpm db:seed        # municipio piloto, datos de demostración'
Write-Host '    5. pnpm dev'
Write-Host ''
Write-Host '  Opcional (Redis y MinIO, requiere Docker):' -ForegroundColor DarkGray
Write-Host '    docker compose -f infra\docker-compose.dev.yml --env-file .env up -d' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Documentación: docs\OPERACION.md' -ForegroundColor DarkGray
Write-Host ''
