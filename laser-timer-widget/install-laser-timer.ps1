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

# Watchdog: every minute, start it again if someone killed it in Task Manager.
# The app adds itself to the startup apps; this also covers that being turned off.
$check = "if (-not (Get-Process -Name '$($exe.BaseName)' -ErrorAction SilentlyContinue)) { Start-Process '$($exe.FullName)' }"
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell -NoProfile -WindowStyle Hidden -Command `"$check`""
$triggers = @(
    New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Laser Timer watchdog' -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null

Start-Process $exe.FullName
Write-Host "Laser Timer installed in $installDir and running. Quit: Ctrl+Alt+Shift+Q (the watchdog starts it again within a minute)."
Write-Host "Remove the watchdog: Unregister-ScheduledTask -TaskName 'Laser Timer watchdog'"
