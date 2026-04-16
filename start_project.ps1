param(
    [string]$OllamaHost = $(if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { '127.0.0.1' }),
    [int]$OllamaPort = $(if ($env:OLLAMA_PORT) { [int]$env:OLLAMA_PORT } else { 11434 }),
    [int]$BackendPort = $(if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 3000 }),
    [int]$FrontendPort = $(if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 8080 })
)

$ErrorActionPreference = 'Stop'

$script:RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:BackendDir = Join-Path $script:RootDir 'backend'
$script:FrontendDir = Join-Path $script:RootDir 'frontend'
$script:StartedProcesses = @()

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PortOpen {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 700
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Test-OllamaReady {
    $uri = "http://$OllamaHost`:$OllamaPort/api/tags"
    try {
        Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 2 | Out-Null
        return $true
    }
    catch {
        return (Test-PortOpen -HostName $OllamaHost -Port $OllamaPort)
    }
}

function Wait-Port {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Label,
        [int]$TimeoutSeconds = 20
    )

    $attempts = $TimeoutSeconds * 2
    for ($i = 0; $i -lt $attempts; $i++) {
        if (Test-PortOpen -HostName $HostName -Port $Port) {
            Write-Host "[OK] $Label disponible sur $HostName:$Port"
            return
        }
        Start-Sleep -Milliseconds 500
    }

    throw "[ERREUR] Timeout: $Label n'est pas disponible sur $HostName:$Port"
}

function Register-StartedProcess {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)
    $script:StartedProcesses += $Process
}

function Stop-StartedProcesses {
    if ($script:StartedProcesses.Count -eq 0) {
        return
    }

    Write-Host ''
    Write-Host 'Arret des services lances par ce script...'
    foreach ($process in $script:StartedProcesses) {
        try {
            if (-not $process.HasExited) {
                Stop-Process -Id $process.Id -Force -ErrorAction Stop
            }
        }
        catch {
            # Ignore process stop errors during shutdown.
        }
    }
}

function Start-OllamaIfNeeded {
    if (Test-OllamaReady) {
        Write-Host "[INFO] Ollama est deja actif sur $OllamaHost:$OllamaPort"
        return
    }

    if (-not (Test-CommandExists -Name 'ollama')) {
        throw "[ERREUR] La commande 'ollama' est introuvable. Installe Ollama puis reessaye."
    }

    $outLog = Join-Path $env:TEMP 'gymshark-ollama.out.log'
    $errLog = Join-Path $env:TEMP 'gymshark-ollama.err.log'

    Write-Host '[INFO] Demarrage de Ollama...'
    $process = Start-Process -FilePath 'ollama' -ArgumentList 'serve' -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Register-StartedProcess -Process $process

    for ($i = 0; $i -lt 20; $i++) {
        if (Test-OllamaReady) {
            Write-Host '[OK] Ollama est pret'
            return
        }
        Start-Sleep -Milliseconds 500
    }

    throw "[ERREUR] Ollama ne repond pas. Consulte $outLog et $errLog"
}

function Start-BackendIfNeeded {
    if (Test-PortOpen -HostName '127.0.0.1' -Port $BackendPort) {
        Write-Host "[INFO] Backend deja actif sur le port $BackendPort"
        return
    }

    if (-not (Test-CommandExists -Name 'npm')) {
        throw "[ERREUR] La commande 'npm' est introuvable. Installe Node.js puis reessaye."
    }

    $nodeModulesPath = Join-Path $script:BackendDir 'node_modules'
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Host '[INFO] Installation des dependances backend...'
        Push-Location $script:BackendDir
        try {
            & cmd.exe /c 'npm install'
            if ($LASTEXITCODE -ne 0) {
                throw "[ERREUR] Echec de 'npm install'"
            }
        }
        finally {
            Pop-Location
        }
    }

    $outLog = Join-Path $env:TEMP 'gymshark-backend.out.log'
    $errLog = Join-Path $env:TEMP 'gymshark-backend.err.log'

    Write-Host '[INFO] Demarrage du backend...'
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm start' -WorkingDirectory $script:BackendDir -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Register-StartedProcess -Process $process

    Wait-Port -HostName '127.0.0.1' -Port $BackendPort -Label 'Backend' -TimeoutSeconds 20
}

function Get-FrontendPythonCommand {
    if (Test-CommandExists -Name 'py') {
        return @('py', '-3')
    }

    if (Test-CommandExists -Name 'python') {
        return @('python')
    }

    throw '[ERREUR] Commande Python introuvable (ni py, ni python).'
}

function Start-FrontendIfNeeded {
    if (Test-PortOpen -HostName '127.0.0.1' -Port $FrontendPort) {
        Write-Host "[INFO] Frontend deja servi sur le port $FrontendPort"
        return
    }

    $pythonCmd = Get-FrontendPythonCommand
    $pythonBinary = $pythonCmd[0]
    $pythonArgs = @()
    if ($pythonCmd.Length -gt 1) {
        $pythonArgs += $pythonCmd[1]
    }
    $pythonArgs += '-m'
    $pythonArgs += 'http.server'
    $pythonArgs += "$FrontendPort"

    $outLog = Join-Path $env:TEMP 'gymshark-frontend.out.log'
    $errLog = Join-Path $env:TEMP 'gymshark-frontend.err.log'

    Write-Host '[INFO] Demarrage du serveur frontend...'
    $process = Start-Process -FilePath $pythonBinary -ArgumentList $pythonArgs -WorkingDirectory $script:FrontendDir -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Register-StartedProcess -Process $process

    Wait-Port -HostName '127.0.0.1' -Port $FrontendPort -Label 'Frontend' -TimeoutSeconds 20
}

Write-Host '--- Lancement automatique Gymshark Sync (Windows) ---'

try {
    Start-OllamaIfNeeded
    Start-BackendIfNeeded
    Start-FrontendIfNeeded

    Write-Host ''
    Write-Host 'Projet lance.'
    Write-Host "Backend :  http://localhost:$BackendPort"
    Write-Host "Frontend : http://localhost:$FrontendPort"
    Write-Host 'Ferme cette fenetre ou Ctrl+C pour arreter les services demarres par ce script.'

    if ($script:StartedProcesses.Count -gt 0) {
        Wait-Process -Id ($script:StartedProcesses | ForEach-Object { $_.Id })
    }
}
finally {
    Stop-StartedProcesses
}
