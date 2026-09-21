<#
.SYNOPSIS
    Diagnóstico del entorno de TerraColombia.

.DESCRIPTION
    Comprueba, uno por uno, todo lo que el sistema necesita para funcionar y
    dice exactamente qué está mal y cómo arreglarlo. Es lo primero que hay que
    ejecutar cuando algo "no arranca".

    Comprueba:
      1. Herramientas: Node, pnpm, psql, ogr2ogr
      2. Archivo .env y variables obligatorias (sin imprimir sus valores)
      3. PostgreSQL: conexión, versión, extensiones, EPSG:9377
      4. Esquemas y migraciones aplicadas
      5. Snapshots publicados y su antigüedad
      6. Redis (si REDIS_URL está definida)
      7. Almacenamiento S3/MinIO (si S3_ENDPOINT está definida)
      8. API y web (si están levantadas)
      9. Martin (si MARTIN_URL está definida)

    NUNCA imprime contraseñas, tokens ni llaves: de cada secreto solo dice si
    está definido y si tiene una longitud razonable.

    Código de salida: 0 si todo está bien, 1 si hay algo crítico mal.

.EXAMPLE
    pwsh -File infra\scripts\check-health.ps1

.EXAMPLE
    pwsh -File infra\scripts\check-health.ps1 -Detallado
#>
[CmdletBinding()]
param(
    [string] $PostgresBin = 'C:\Program Files\PostgreSQL\17\bin',
    [string] $PgHost      = 'localhost',
    [int]    $PgPort      = 5432,
    [string] $PgUser      = 'postgres',
    [string] $Database    = '',
    [switch] $Detallado
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$script:Problemas = 0
$script:Avisos    = 0

function Write-Seccion { param([string]$m) Write-Host "`n$m" -ForegroundColor Cyan; Write-Host ('─' * 60) -ForegroundColor DarkGray }
function Write-Bien    { param([string]$m) Write-Host "  [ok]    $m" -ForegroundColor Green }
function Write-Mal     {
    param([string]$m, [string]$Solucion)
    Write-Host "  [FALLO] $m" -ForegroundColor Red
    if ($Solucion) { Write-Host "          → $Solucion" -ForegroundColor Yellow }
    $script:Problemas++
}
function Write-Ojo {
    param([string]$m, [string]$Solucion)
    Write-Host "  [aviso] $m" -ForegroundColor Yellow
    if ($Solucion) { Write-Host "          → $Solucion" -ForegroundColor DarkYellow }
    $script:Avisos++
}
function Write-Dato { param([string]$m) Write-Host "          $m" -ForegroundColor DarkGray }

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvFile  = Join-Path $RepoRoot '.env'

function Get-EnvValor {
    param([string]$Clave)
    $delEntorno = [Environment]::GetEnvironmentVariable($Clave)
    if ($delEntorno) { return $delEntorno }
    if (-not (Test-Path $EnvFile)) { return $null }
    foreach ($linea in Get-Content $EnvFile) {
        if ($linea -match "^\s*$([regex]::Escape($Clave))\s*=\s*(.*?)\s*$") {
            $v = $Matches[1].Trim('"').Trim("'")
            if ($v) { return $v }
        }
    }
    return $null
}

# Describe un secreto sin revelarlo.
function Show-Secreto {
    param([string]$Clave, [int]$MinimoCaracteres = 16, [switch]$Obligatorio)
    $v = Get-EnvValor $Clave
    if (-not $v) {
        if ($Obligatorio) { Write-Mal "$Clave no está definida." "Añádala a .env" }
        else { Write-Ojo "$Clave no está definida (opcional)." }
        return
    }
    if ($v -like '*CHANGEME*') {
        Write-Mal "$Clave sigue con el valor de ejemplo (CHANGEME)." `
            'Genere uno real: node -e "console.log(require(''crypto'').randomBytes(32).toString(''base64url''))"'
        return
    }
    if ($v.Length -lt $MinimoCaracteres) {
        Write-Mal "$Clave es demasiado corta ($($v.Length) caracteres; mínimo $MinimoCaracteres)." `
            'Un secreto corto es un secreto roto.'
        return
    }
    Write-Bien "$Clave definida ($($v.Length) caracteres)."
}

Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host '  TerraColombia · diagnóstico del entorno'                    -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"                  -ForegroundColor DarkGray
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan

# ═════════════════════════════════════════════════════════════════════════════
Write-Seccion '1. Herramientas'
# ═════════════════════════════════════════════════════════════════════════════
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nv = (& node --version).TrimStart('v')
    if ([int]($nv -split '\.')[0] -ge 22) { Write-Bien "Node.js $nv" }
    else { Write-Mal "Node.js $nv es demasiado antiguo." 'Se requiere 22 o superior.' }
} else { Write-Mal 'Node.js no está en el PATH.' 'Instálelo desde https://nodejs.org' }

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) { Write-Bien "pnpm $(& pnpm --version)" }
else { Write-Mal 'pnpm no está en el PATH.' 'corepack enable; corepack prepare pnpm@9.15.9 --activate' }

$psql = Join-Path $PostgresBin 'psql.exe'
if (-not (Test-Path $psql)) {
    $c = Get-Command psql -ErrorAction SilentlyContinue
    if ($c) { $psql = $c.Source; $PostgresBin = Split-Path -Parent $psql }
}
if (Test-Path $psql) { Write-Bien "psql: $psql" }
else { Write-Mal "psql.exe no encontrado en '$PostgresBin' ni en el PATH." 'Instale PostgreSQL o use -PostgresBin.' }

$ogrEnv = Get-EnvValor 'GDAL_OGR2OGR'
$ogr = if ($ogrEnv -and (Test-Path $ogrEnv)) { $ogrEnv } else { Join-Path $PostgresBin 'ogr2ogr.exe' }
if (Test-Path $ogr) {
    Write-Bien "ogr2ogr: $((& $ogr --version 2>&1 | Select-Object -First 1))"
} else {
    Write-Ojo 'ogr2ogr no disponible.' 'La carga de la GDB del IGAC no funcionará (docs/DECISIONES.md ADR-005).'
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) { Write-Bien 'Docker: instalado y el demonio responde.' }
    else { Write-Dato 'Docker instalado pero el demonio no corre (no es obligatorio).' }
} else { Write-Dato 'Docker no instalado (no es obligatorio en este equipo).' }

# ═════════════════════════════════════════════════════════════════════════════
Write-Seccion '2. Configuración (.env)'
# ═════════════════════════════════════════════════════════════════════════════
if (-not (Test-Path $EnvFile)) {
    Write-Mal '.env no existe.' 'Ejecute infra\scripts\setup-local.ps1 o copie .env.example a .env.'
} else {
    Write-Bien ".env encontrado."
    foreach ($obligatoria in @('DATABASE_URL')) {
        if (Get-EnvValor $obligatoria) { Write-Bien "$obligatoria definida." }
        else { Write-Mal "$obligatoria no está definida." 'Sin ella no arranca nada.' }
    }
    Show-Secreto -Clave 'JWT_SECRET'         -MinimoCaracteres 32 -Obligatorio
    Show-Secreto -Clave 'JWT_REFRESH_SECRET' -MinimoCaracteres 32 -Obligatorio

    # Los dos secretos de JWT tienen que ser distintos: si son iguales, un
    # token de refresco vale como token de acceso.
    $a = Get-EnvValor 'JWT_SECRET'; $b = Get-EnvValor 'JWT_REFRESH_SECRET'
    if ($a -and $b -and $a -eq $b) {
        Write-Mal 'JWT_SECRET y JWT_REFRESH_SECRET son iguales.' `
            'Deben ser distintos: si no, un token de refresco sirve como token de acceso.'
    }

    Show-Secreto -Clave 'ANTHROPIC_API_KEY'  -MinimoCaracteres 20
    Show-Secreto -Clave 'WOMPI_PRIVATE_KEY'  -MinimoCaracteres 20

    # .env no debe estar versionado.
    Push-Location $RepoRoot
    $seguimiento = (& git ls-files --error-unmatch .env) 2>$null
    Pop-Location
    if ($LASTEXITCODE -eq 0 -and $seguimiento) {
        Write-Mal '.env está siendo seguido por git.' `
            'Ejecute: git rm --cached .env   y rote TODOS los secretos que contenía.'
    }
}

if (-not $Database) { $Database = Get-EnvValor 'POSTGRES_DB' }
if (-not $Database) {
    $url = Get-EnvValor 'DATABASE_URL'
    if ($url -and $url -match '/([^/?]+)(\?|$)') { $Database = $Matches[1] }
}
if (-not $Database) { $Database = 'terracolombia' }

# ═════════════════════════════════════════════════════════════════════════════
Write-Seccion "3. PostgreSQL ($PgHost`:$PgPort / $Database)"
# ═════════════════════════════════════════════════════════════════════════════
$puedeSql = $false
if (Test-Path $psql) {
    $clave = $env:PGPASSWORD
    if (-not $clave) {
        $clave = Get-EnvValor 'POSTGRES_PASSWORD'
        if (-not $clave) {
            $url = Get-EnvValor 'DATABASE_URL'
            if ($url -and $url -match '://[^:]+:([^@]+)@') { $clave = [System.Uri]::UnescapeDataString($Matches[1]) }
        }
    }
    if ($clave) { $env:PGPASSWORD = $clave }

    function Invoke-Valor {
        param([string]$Db, [string]$Sql)
        $r = & $psql --host $PgHost --port $PgPort --username $PgUser --dbname $Db `
                     --no-password --tuples-only --no-align --command $Sql 2>&1
        if ($LASTEXITCODE -ne 0) { return $null }
        return ($r | Out-String).Trim()
    }

    $ver = Invoke-Valor -Db 'postgres' -Sql 'SHOW server_version;'
    if ($ver) {
        Write-Bien "Conexión correcta · PostgreSQL $ver"
        $puedeSql = $true
    } else {
        Write-Mal "No se pudo conectar a PostgreSQL en $PgHost`:$PgPort como '$PgUser'." `
            'Verifique que el servicio corre (Get-Service postgresql*), el puerto y la contraseña.'
    }
} else {
    Write-Ojo 'Sin psql no se puede comprobar la base de datos.'
}

if ($puedeSql) {
    $existeDb = Invoke-Valor -Db 'postgres' -Sql "SELECT 1 FROM pg_database WHERE datname = '$Database';"
    if ($existeDb -eq '1') {
        Write-Bien "La base '$Database' existe."

        $exts = Invoke-Valor -Db $Database -Sql @"
SELECT string_agg(extname || ' ' || extversion, ', ' ORDER BY extname)
FROM pg_extension WHERE extname IN
('postgis','postgis_raster','pg_trgm','unaccent','pgcrypto','h3','h3_postgis','pgrouting');
"@
        if ($exts) { Write-Bien "Extensiones: $exts" }

        foreach ($req in @('postgis','pg_trgm','unaccent')) {
            $tiene = Invoke-Valor -Db $Database -Sql "SELECT count(*) FROM pg_extension WHERE extname='$req';"
            if ($tiene -ne '1') {
                Write-Mal "Falta la extensión obligatoria '$req'." `
                    'Aplique infra\postgres\init\01-extensions.sql'
            }
        }

        $srid = Invoke-Valor -Db $Database -Sql 'SELECT count(*) FROM spatial_ref_sys WHERE srid = 9377;'
        if ($srid -eq '1') { Write-Bien 'EPSG:9377 (MAGNA-SIRGAS / Origen-Nacional) registrado.' }
        else { Write-Mal 'Falta EPSG:9377 en spatial_ref_sys.' 'Sin él no se calculan áreas ni distancias. Aplique 01-extensions.sql.' }

        # ─── Esquemas ────────────────────────────────────────────────────
        $esquemas = Invoke-Valor -Db $Database -Sql @"
SELECT string_agg(nspname, ', ' ORDER BY nspname) FROM pg_namespace
WHERE nspname IN ('raw','core','ctx','analytics','app','meta');
"@
        if ($esquemas) {
            Write-Bien "Esquemas presentes: $esquemas"
            foreach ($e in @('meta','core','ctx','analytics','app')) {
                if ($esquemas -notmatch "\b$e\b") {
                    Write-Ojo "Falta el esquema '$e'." 'Ejecute: pnpm db:migrate'
                }
            }
        } else {
            Write-Ojo 'No hay ningún esquema de la aplicación.' 'Ejecute: pnpm db:migrate'
        }

        # ─── Snapshots ───────────────────────────────────────────────────
        $haySnapshot = Invoke-Valor -Db $Database -Sql "SELECT to_regclass('meta.snapshot') IS NOT NULL;"
        if ($haySnapshot -eq 't') {
            $activos = Invoke-Valor -Db $Database -Sql @"
SELECT count(*) FROM meta.snapshot WHERE status = 'active';
"@
            if ([int]$activos -gt 0) {
                Write-Bien "Snapshots publicados: $activos"
                if ($Detallado) {
                    $detalle = & $psql --host $PgHost --port $PgPort --username $PgUser --dbname $Database `
                        --no-password --command @"
SELECT d.id AS dataset, s.cut_date AS corte,
       (now()::date - s.cut_date) AS dias, s.row_count AS filas
FROM meta.snapshot s JOIN meta.dataset d ON d.id = s.dataset_id
WHERE s.status = 'active' ORDER BY s.cut_date;
"@ 2>&1
                    ($detalle | Out-String) -split "`n" | ForEach-Object { if ($_.Trim()) { Write-Dato $_ } }
                }
                # Snapshots sintéticos publicados: ADR-006.
                $sinteticos = Invoke-Valor -Db $Database -Sql @"
SELECT count(*) FROM meta.snapshot
WHERE status = 'active' AND COALESCE(is_synthetic, false);
"@
                if ($sinteticos -and [int]$sinteticos -gt 0) {
                    Write-Ojo "$sinteticos snapshot(s) SINTÉTICO(s) publicado(s) como activos." `
                        'Correcto en desarrollo; en producción es un incidente (docs/DECISIONES.md ADR-006).'
                }
            } else {
                Write-Ojo 'No hay ningún snapshot publicado como activo.' 'Ejecute: pnpm db:seed (demo) o un ETL real.'
            }
        }

        # ─── Tamaño ──────────────────────────────────────────────────────
        $tam = Invoke-Valor -Db $Database -Sql "SELECT pg_size_pretty(pg_database_size('$Database'));"
        if ($tam) { Write-Dato "Tamaño de la base: $tam" }
    } else {
        Write-Mal "La base '$Database' no existe." 'Ejecute infra\scripts\setup-local.ps1'
    }
    $env:PGPASSWORD = $null
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Seccion '4. Servicios auxiliares'
# ═════════════════════════════════════════════════════════════════════════════
function Test-Puerto {
    param([string]$Maquina, [int]$Puerto, [int]$TiempoMs = 1500)
    try {
        $cli = [System.Net.Sockets.TcpClient]::new()
        $tarea = $cli.ConnectAsync($Maquina, $Puerto)
        $listo = $tarea.Wait($TiempoMs)
        $cli.Close()
        return $listo -and -not $tarea.IsFaulted
    } catch { return $false }
}

$redisUrl = Get-EnvValor 'REDIS_URL'
if ($redisUrl) {
    if ($redisUrl -match '://(?:[^@]*@)?([^:/]+):(\d+)') {
        if (Test-Puerto -Maquina $Matches[1] -Puerto ([int]$Matches[2])) {
            Write-Bien "Redis responde en $($Matches[1]):$($Matches[2])."
        } else {
            Write-Mal "Redis no responde en $($Matches[1]):$($Matches[2])." `
                'Levántelo: docker compose -f infra\docker-compose.dev.yml --env-file .env up -d redis'
        }
    } else { Write-Ojo 'REDIS_URL no tiene un formato reconocible.' }
} else {
    Write-Dato 'REDIS_URL vacía: se usará la cola en memoria (solo desarrollo, ADR-004).'
}

$s3 = Get-EnvValor 'S3_ENDPOINT'
if ($s3) {
    try {
        $r = Invoke-WebRequest -Uri "$s3/minio/health/live" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { Write-Bien "Almacenamiento S3 responde en $s3." }
        else { Write-Ojo "El almacenamiento en $s3 respondió $($r.StatusCode)." }
    } catch {
        Write-Mal "No se pudo contactar el almacenamiento en $s3." `
            'Levántelo: docker compose -f infra\docker-compose.dev.yml --env-file .env up -d minio'
    }
} else {
    $dirLocal = Get-EnvValor 'STORAGE_LOCAL_DIR'
    if (-not $dirLocal) { $dirLocal = './storage' }
    Write-Dato "S3_ENDPOINT vacía: se usará almacenamiento en disco ($dirLocal, ADR-004)."
}

$martin = Get-EnvValor 'MARTIN_URL'
if ($martin) {
    try {
        $r = Invoke-WebRequest -Uri "$martin/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        Write-Bien "Martin responde en $martin."
    } catch {
        Write-Mal "Martin no responde en $martin." 'Quite MARTIN_URL de .env para que la API sirva las teselas con ST_AsMVT (ADR-003).'
    }
} else {
    Write-Dato 'MARTIN_URL vacía: la API sirve las teselas con ST_AsMVT (ADR-003).'
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Seccion '5. Aplicación'
# ═════════════════════════════════════════════════════════════════════════════
$apiPort = Get-EnvValor 'API_PORT'; if (-not $apiPort) { $apiPort = '3001' }
$apiUrl = "http://localhost:$apiPort"
try {
    $r = Invoke-WebRequest -Uri "$apiUrl/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Bien "API responde en $apiUrl (HTTP $($r.StatusCode))."
    try {
        $listo = Invoke-WebRequest -Uri "$apiUrl/ready" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Bien 'API: /ready correcto (dependencias alcanzables).'
        if ($Detallado) { Write-Dato $listo.Content }
    } catch {
        Write-Mal 'La API vive pero /ready falla: alguna dependencia no responde.' `
            'Revise las secciones 3 y 4 de este diagnóstico.'
    }
} catch {
    Write-Dato "La API no está levantada en $apiUrl (normal si no ejecutó 'pnpm dev')."
}

$webPort = 5173
if (Test-Puerto -Maquina 'localhost' -Puerto $webPort) { Write-Bien "Web (Vite) responde en http://localhost:$webPort." }
else { Write-Dato "La web no está levantada en el puerto $webPort (normal si no ejecutó 'pnpm dev')." }

# ═════════════════════════════════════════════════════════════════════════════
# Resumen
# ═════════════════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
if ($script:Problemas -eq 0 -and $script:Avisos -eq 0) {
    Write-Host '  Todo correcto.' -ForegroundColor Green
} elseif ($script:Problemas -eq 0) {
    Write-Host "  Sin fallos. $($script:Avisos) aviso(s): revise lo marcado en amarillo." -ForegroundColor Yellow
} else {
    Write-Host "  $($script:Problemas) fallo(s) y $($script:Avisos) aviso(s)." -ForegroundColor Red
    Write-Host '  Resuelva primero lo marcado en rojo: sin eso el sistema no funciona.' -ForegroundColor Red
}
Write-Host '  Guía de resolución de problemas: docs\OPERACION.md' -ForegroundColor DarkGray
Write-Host '════════════════════════════════════════════════════════════' -ForegroundColor Cyan
Write-Host ''

exit $(if ($script:Problemas -gt 0) { 1 } else { 0 })
