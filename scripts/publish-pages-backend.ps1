param(
  [int]$Port = 18080,
  [string]$Repo = 'center2055/vp26',
  [switch]$SkipPagesDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $repoRoot '.vp26-runtime'
$cloudflaredExe = Join-Path $runtimeDir 'cloudflared.exe'
$backendStdout = Join-Path $runtimeDir 'backend.stdout.log'
$backendStderr = Join-Path $runtimeDir 'backend.stderr.log'
$cloudflaredStdout = Join-Path $runtimeDir 'cloudflared.stdout.log'
$cloudflaredStderr = Join-Path $runtimeDir 'cloudflared.stderr.log'
$backendPidFile = Join-Path $runtimeDir 'backend.pid'
$cloudflaredPidFile = Join-Path $runtimeDir 'cloudflared.pid'
$backendPython = Join-Path $repoRoot 'backend\.venv\Scripts\python.exe'
$backendAppDir = Join-Path $repoRoot 'backend'
$cloudflaredDownloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

function Stop-TrackedProcess {
  param([string]$PidPath)

  if (-not (Test-Path $PidPath)) {
    return
  }

  $rawPid = (Get-Content $PidPath -Raw).Trim()
  if (-not $rawPid) {
    Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
    return
  }

  $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }

  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}

function Wait-ForBackendHealth {
  param([int]$TargetPort)

  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$TargetPort/api/health" -TimeoutSec 2
      if ($health.status -eq 'ok') {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  $stderr = if (Test-Path $backendStderr) { (Get-Content $backendStderr -Raw).Trim() } else { '' }
  $stdout = if (Test-Path $backendStdout) { (Get-Content $backendStdout -Raw).Trim() } else { '' }
  $details = ($stderr, $stdout | Where-Object { $_ }) -join [Environment]::NewLine
  throw "Lokales VP26-Backend wurde auf Port $TargetPort nicht gesund. $details"
}

function Wait-ForTunnelUrl {
  for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
    $combined = @()
    if (Test-Path $cloudflaredStdout) {
      $combined += Get-Content $cloudflaredStdout -Raw
    }
    if (Test-Path $cloudflaredStderr) {
      $combined += Get-Content $cloudflaredStderr -Raw
    }

    $match = [regex]::Matches(($combined -join [Environment]::NewLine), 'https://[-a-z0-9]+\.trycloudflare\.com') |
      Select-Object -Last 1
    if ($match) {
      return $match.Value
    }

    Start-Sleep -Milliseconds 500
  }

  $details = @()
  if (Test-Path $cloudflaredStdout) {
    $details += (Get-Content $cloudflaredStdout -Raw).Trim()
  }
  if (Test-Path $cloudflaredStderr) {
    $details += (Get-Content $cloudflaredStderr -Raw).Trim()
  }

  throw "Cloudflared hat keine Tunnel-URL geliefert. $($details -join [Environment]::NewLine)"
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if (-not (Test-Path $backendPython)) {
  throw "Python-Venv für das Backend fehlt: $backendPython"
}

if (-not (Test-Path $cloudflaredExe)) {
  Invoke-WebRequest -Uri $cloudflaredDownloadUrl -OutFile $cloudflaredExe
}

Stop-TrackedProcess -PidPath $cloudflaredPidFile
Stop-TrackedProcess -PidPath $backendPidFile

Set-Content -Path $backendStdout -Value ''
Set-Content -Path $backendStderr -Value ''
Set-Content -Path $cloudflaredStdout -Value ''
Set-Content -Path $cloudflaredStderr -Value ''

$backendProcess = Start-Process `
  -FilePath $backendPython `
  -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', $backendAppDir, '--host', '127.0.0.1', '--port', "$Port") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $backendStdout `
  -RedirectStandardError $backendStderr `
  -PassThru

Set-Content -Path $backendPidFile -Value $backendProcess.Id
Wait-ForBackendHealth -TargetPort $Port

$cloudflaredProcess = Start-Process `
  -FilePath $cloudflaredExe `
  -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") `
  -WorkingDirectory $runtimeDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $cloudflaredStdout `
  -RedirectStandardError $cloudflaredStderr `
  -PassThru

Set-Content -Path $cloudflaredPidFile -Value $cloudflaredProcess.Id
$tunnelUrl = Wait-ForTunnelUrl

gh variable set VP26_WEB_API_BASE_URL --repo $Repo --body $tunnelUrl | Out-Null

if (-not $SkipPagesDeploy) {
  gh workflow run deploy-pages.yml --repo $Repo --ref main | Out-Null
}

Write-Output "Tunnel URL: $tunnelUrl"
Write-Output "Backend PID: $($backendProcess.Id)"
Write-Output "Cloudflared PID: $($cloudflaredProcess.Id)"
