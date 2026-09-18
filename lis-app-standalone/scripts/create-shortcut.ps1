Param(
  [string]$ShortcutName = 'Gezyne LIS.lnk'
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDirPath = (Resolve-Path (Join-Path $scriptDir '..')).ProviderPath

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop $ShortcutName

# Prefer the packaged EXE if it exists.
# Also accept a native PowerShell launcher `start-lis.exe` in `dist` (recommended)
$launcherExe = Join-Path $projectDirPath 'dist\start-lis.exe'
$exePath = Join-Path $projectDirPath 'dist\laboratory-information-system.exe'
if (Test-Path $launcherExe) {
  $target = $launcherExe
} elseif (Test-Path $exePath) {
  $target = $exePath
} else {
  Write-Error "No launcher or packaged EXE found. Expected either: $launcherExe or $exePath. Please build the launcher or package and try again."
  exit 1
}

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($linkPath)

# Make the shortcut start PowerShell and run the target, keeping the window open for logs
$powershellPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (Test-Path $powershellPath) {
  $shortcut.TargetPath = $powershellPath
  # Arguments: -NoExit to keep window open, -NoProfile for speed, -Command to run the target
  $escapedTarget = $target -replace "'","''"
  $shortcut.Arguments = "-NoExit -NoProfile -Command `"& '$escapedTarget'`""
} else {
  # Fallback: point directly to the target (may not open a console)
  $shortcut.TargetPath = [string]$target
}

$shortcut.WorkingDirectory = [string]$projectDirPath
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "Created shortcut on Desktop: $linkPath -> $shortcut.TargetPath $($shortcut.Arguments)"
