Param(
  [switch]$NoNewWindow,
  [int]$Port
)

# Determine project directory (works when running as script or as compiled exe)
try {
  if ($MyInvocation.MyCommand.Definition -and (Test-Path $MyInvocation.MyCommand.Definition)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
  } else {
    $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $scriptDir = Split-Path -Parent $exePath
  }
} catch {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
}

# Ensure we have a plain filesystem path string
$projectDir = (Resolve-Path (Join-Path $scriptDir '..')).ProviderPath

if (-not $Port) { $Port = [int]($env:PORT) }
if (-not $Port) { $Port = 3000 }

# Ensure the server runs in production mode by default when using this launcher
if (-not $env:NODE_ENV) { $env:NODE_ENV = 'production' }

Write-Host "Starting Gezyne LIS (project: $projectDir)" -ForegroundColor Cyan
Write-Host "Using port: $Port" -ForegroundColor Cyan

# Start server in a new PowerShell window unless NoNewWindow is specified
if (-not $NoNewWindow) {
  # Prefer PM2 if available to run the server as a managed daemon
  $hasPM2 = (Get-Command pm2 -ErrorAction SilentlyContinue) -ne $null
  if ($hasPM2) {
    Write-Host "PM2 found — starting via PM2 (ecosystem.config.js)" -ForegroundColor Cyan
      # Use PowerShell-compatible fallback instead of shell '||'
      # Append `pm2 monit` so the new PowerShell window shows PM2's real-time status
      $cmd = "Set-Location -Path '$projectDir'; `$env:NODE_ENV='production'; `$env:PORT='$Port'; & pm2 start ecosystem.config.js --env production; if (`$LASTEXITCODE -ne 0) { & pm2 start server.js --name 'lis-app' }; pm2 save; pm2 monit"
  } else {
    Write-Host "PM2 not found — falling back to npm start" -ForegroundColor Yellow
    $cmd = "Set-Location -Path '$projectDir'; `$env:NODE_ENV='production'; `$env:PORT='$Port'; npm start"
  }

  Start-Process -FilePath powershell -ArgumentList "-NoExit","-NoProfile","-Command",$cmd -WorkingDirectory $projectDir
  Write-Host "Started server in a new PowerShell window." -ForegroundColor Green
} else {
  Push-Location $projectDir
  # set NODE_ENV and PORT for the current session before running
  $env:NODE_ENV = 'production'
  $env:PORT = "$Port"
  # Prefer PM2 when available
  $hasPM2 = (Get-Command pm2 -ErrorAction SilentlyContinue) -ne $null
  if ($hasPM2) {
    Write-Host "PM2 found — starting via PM2 (ecosystem.config.js)" -ForegroundColor Cyan
    & pm2 start ecosystem.config.js --env production
    if ($LASTEXITCODE -ne 0) { & pm2 start server.js --name 'lis-app' }
    pm2 save
      # Show PM2 monitor in the current console so the user sees app status
      pm2 monit
  } else {
    Write-Host "PM2 not found — running npm start" -ForegroundColor Yellow
    npm start
  }
  Pop-Location
}

# Poll the server until it responds, then open the default browser
$maxWait = 60
$wait = 0
$url = "http://localhost:$Port"
Write-Host "Waiting for server to become available at $url ..."
$serverUp = $false
while ($wait -lt $maxWait) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    $serverUp = $true
    break
  } catch {
    Start-Sleep -Seconds 1
    $wait++
  }
}

if ($serverUp) {
  Write-Host "Server is up — opening browser at $url" -ForegroundColor Green
  Start-Process $url
} else {
  Write-Warning "Server did not respond within $maxWait seconds. You can open $url manually once the server starts."
}
