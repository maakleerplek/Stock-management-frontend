# Installs lightburn-watch.ps1 on the lasercutter PC: it starts hidden at every
# login (Startup folder, no admin needed) and now. Run as the logged-in user:
#   powershell -ExecutionPolicy Bypass -File install-lightburn-watch.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dir = Join-Path $env:LOCALAPPDATA 'Laser Timer'
New-Item -ItemType Directory -Force $dir | Out-Null
$script = Join-Path $dir 'lightburn-watch.ps1'
Copy-Item (Join-Path $here 'lightburn-watch.ps1') $script -Force

# A .vbs starts PowerShell without a window flashing up.
$vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'lightburn-watch.vbs'
$cmd = 'powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $script + '"'
# In VBScript a quote inside a string is written twice.
Set-Content $vbs ('CreateObject("WScript.Shell").Run "' + ($cmd -replace '"', '""') + '", 0, False') -Encoding ASCII

# Stop a running one (an older version), then start it.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -like '*lightburn-watch.ps1*' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process wscript.exe -ArgumentList "`"$vbs`""
Write-Host "LightBurn watch installed in $dir and running; it starts at every login."
