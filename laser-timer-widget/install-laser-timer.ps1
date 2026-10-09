# Installs the Laser Timer on the lasercutter PC. Put this next to the
# "Laser Timer_*_x64-setup.exe" from CI (and optionally a config.json), then run:
#   powershell -ExecutionPolicy Bypass -File install-laser-timer.ps1
# as the user that is logged in on the lasercutter PC (not as admin).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'Laser Timer'

$setup = Get-ChildItem $here -Filter 'Laser Timer_*-setup.exe' | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $setup) { throw "No 'Laser Timer_*-setup.exe' next to this script." }

# Stop a running one, then install silently (per user, no admin needed).
Get-Process -Name 'laser-timer', 'Laser Timer' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process $setup.FullName -ArgumentList '/S' -Wait

$exe = Get-ChildItem $installDir -Filter '*.exe' | Where-Object { $_.Name -notlike 'uninstall*' } | Select-Object -First 1
if (-not $exe) { throw "Installed, but no exe found in $installDir." }

$config = Join-Path $here 'config.json'
if (Test-Path $config) { Copy-Item $config (Join-Path $installDir 'config.json') -Force }

# Older versions had a watchdog task that restarted it; ending the process now really stops it.
Unregister-ScheduledTask -TaskName 'Laser Timer watchdog' -Confirm:$false -ErrorAction SilentlyContinue

Start-Process $exe.FullName
Write-Host "Laser Timer installed in $installDir and running. It starts again at every login; to stop it now, end laser-timer.exe in Task Manager."
