<#
.SYNOPSIS
    Actualiza los datos vencidos de TerraColombia.
.DESCRIPTION
    Pregunta a `freshness` qué fuentes están vencidas y lanza el cargador de cada una, de la
    más barata a la más cara. Al terminar recalcula los agregados por celda y el índice de
    búsqueda, que es lo que hace que los datos nuevos se vean en el producto.

    POR QUÉ NO REFRESCA TODO SIEMPRE

    Bajar el catastro nacional son 31 geodatabases y varias horas. Repetirlo cada noche
    castigaría al IGAC y no aportaría nada: publica corte mensual. Se refresca solo lo que su
    propia frecuencia declarada dice que toca.

    POR QUÉ UN FALLO NO DETIENE EL RESTO

    Los servicios del Estado se caen a rachas —durante el desarrollo, el del IGAC estuvo caído
    horas y el del SGC entregaba a 2,5 polígonos por minuto—. Si una fuente falla, se anota y
    se sigue con la siguiente: quedarse sin actualizar las otras siete porque una no responde
    sería peor.

    QUÉ NO HACE

    No publica cortes a medias. Cada cargador decide si su corte se publica; los que terminan
    incompletos quedan en `transformed` y no llegan al usuario.
.PARAMETER Seco
    Muestra qué haría, sin ejecutar ningún cargador.
.PARAMETER Incluir
    Solo estas fuentes, separadas por comas. Útil para reintentar una que falló.
.PARAMETER SaltarCatastro
    No toca el catastro, que es lo que más tarda. Para una pasada rápida del resto.
.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File infra\scripts\refresh.ps1 -Seco
.EXAMPLE
    powershell -NoProfile -File infra\scripts\refresh.ps1 -SaltarCatastro
.NOTES
    Cadencia sugerida, con una tarea programada:

      Semanal (domingo 03:00)  — todo salvo el catastro. Recoge OSM, colegios, salud y
                                  cualquier capa eventual que se haya movido.
      Mensual (día 5, 02:00)   — pasada completa, con catastro. El IGAC publica corte
                                  mensual y el día 5 ya está arriba.

      schtasks /Create /TN "TerraColombia Actualizacion semanal" /SC WEEKLY /D SUN /ST 03:00 ^
        /TR "powershell -NoProfile -File C:\ruta\repo\infra\scripts\refresh.ps1 -SaltarCatastro"

      schtasks /Create /TN "TerraColombia Actualizacion mensual" /SC MONTHLY /D 5 /ST 02:00 ^
        /TR "powershell -NoProfile -File C:\ruta\repo\infra\scripts\refresh.ps1"

    En Linux, el equivalente con cron:
      0 3 * * 0  cd /ruta/repo && pnpm --filter @terracolombia/db freshness -- --vencidos
#>
[CmdletBinding()]
param(
    [switch] $Seco,
    [string] $Incluir = '',
    [switch] $SaltarCatastro
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $raiz

function Write-Log($mensaje) {
    Write-Host ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $mensaje)
}

Write-Log 'Consultando la vigencia de las fuentes…'

# `freshness --json` es la fuente de verdad: el criterio de qué está vencido vive ahí y no
# duplicado aquí, para que no puedan discrepar.
$salida = & pnpm --filter @terracolombia/db freshness -- --json 2>$null
$json = ($salida | Out-String)
$inicio = $json.IndexOf('{')
if ($inicio -lt 0) {
    Write-Host 'No se pudo leer el informe de vigencia. ¿Está la base de datos accesible?' -ForegroundColor Red
    exit 1
}
$informe = $json.Substring($inicio) | ConvertFrom-Json

$pendientes = @($informe.datasets | Where-Object { $_.estado -eq 'vencido' -or $_.estado -eq 'sin-corte' })

if ($Incluir -ne '') {
    $filtro = $Incluir.Split(',') | ForEach-Object { $_.Trim() }
    $pendientes = @($pendientes | Where-Object { $filtro -contains $_.id })
}
if ($SaltarCatastro) {
    $pendientes = @($pendientes | Where-Object { -not $_.id.StartsWith('igac-cadastre-') })
}

if ($pendientes.Count -eq 0) {
    Write-Log 'Nada que actualizar: todas las fuentes están dentro de su plazo.'
    exit 0
}

# Se ordena de lo barato a lo caro: si algo va a fallar, que sea con el resto ya actualizado.
# El catastro va al final porque son horas.
$ordenadas = $pendientes | Sort-Object @{ Expression = { if ($_.id.StartsWith('igac-cadastre-')) { 2 } else { 1 } } }, id

# El catastro se lanza UNA vez con --all: 31 órdenes separadas repetirían la inspección.
$comandos = [System.Collections.Generic.List[string]]::new()
$catastroIncluido = $false
foreach ($d in $ordenadas) {
    if ($d.id.StartsWith('igac-cadastre-')) {
        if (-not $catastroIncluido) {
            $comandos.Add('pnpm --filter @terracolombia/db load:cadastre -- --all')
            $catastroIncluido = $true
        }
        continue
    }
    if (-not $comandos.Contains($d.comando)) { $comandos.Add($d.comando) }
}

Write-Log ("{0} fuente(s) vencida(s) · {1} orden(es) a ejecutar" -f $pendientes.Count, $comandos.Count)
foreach ($c in $comandos) { Write-Host "    $c" -ForegroundColor DarkGray }

if ($Seco) {
    Write-Log 'Modo seco: no se ejecutó nada.'
    exit 0
}

$fallidas = [System.Collections.Generic.List[string]]::new()
foreach ($comando in $comandos) {
    Write-Log "Ejecutando: $comando"
    $inicioCmd = Get-Date
    # Una fuente caída no debe tumbar la actualización de las demás.
    try {
        Invoke-Expression $comando
        if ($LASTEXITCODE -ne 0) { throw "código de salida $LASTEXITCODE" }
        $seg = [int]((Get-Date) - $inicioCmd).TotalSeconds
        Write-Log "  terminado en ${seg}s"
    } catch {
        Write-Host ("  FALLÓ: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        $fallidas.Add($comando)
    }
}

# Los datos nuevos no se ven hasta recalcular los agregados por celda y el índice de búsqueda.
Write-Log 'Recalculando agregados por celda…'
try {
    & pnpm etl -- aggregate --loaded
} catch {
    Write-Host '  No se pudieron recalcular los agregados.' -ForegroundColor Yellow
}

Write-Log '─────────────────────────────────────────────'
if ($fallidas.Count -eq 0) {
    Write-Log 'Actualización terminada sin fallos.'
} else {
    Write-Log ("Terminado con {0} orden(es) fallida(s):" -f $fallidas.Count)
    foreach ($f in $fallidas) { Write-Host "    $f" -ForegroundColor Yellow }
    Write-Host ''
    Write-Host 'Los servicios del Estado se caen a rachas. Reintenta con:' -ForegroundColor DarkGray
    Write-Host '    powershell -NoProfile -File infra\scripts\refresh.ps1' -ForegroundColor DarkGray
    exit 1
}
