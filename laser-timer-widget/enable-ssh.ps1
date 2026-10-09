# Turns on SSH on the lasercutter PC so Ruben's laptop can log in with its key.
# Run from the NAS (it asks for admin by itself):
#   powershell -ExecutionPolicy Bypass -File "\\mlp-nas\htl-nas\1) STAFF\Ruben\laser-timer\enable-ssh.ps1"
# Writes the PC's IP and status to pc-info.txt next to this script.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pubKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFgj3L2iCVG93tatpQ4qZoQ5SFQh8z76OZ9NQro30JKb eggmansmile@rubenscachyos'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    # Remember who is logged in, so the key also goes to that user.
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -ForUser $env:USERNAME"
    exit
}
$forUser = if ($args.Count -ge 2 -and $args[0] -eq '-ForUser') { $args[1] } else { $env:USERNAME }

# 1. OpenSSH server
$cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') {
    Write-Host 'Installing OpenSSH server (can take a few minutes)...'
    Add-WindowsCapability -Online -Name $cap.Name | Out-Null
}
Set-Service sshd -StartupType Automatic
Start-Service sshd

# 2. Firewall: port 22 on every network profile (the HTL network may count as Public).
Get-NetFirewallRule -Name 'sshd', 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -Name 'sshd' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound `
    -Protocol TCP -Action Allow -LocalPort 22 -Profile Any | Out-Null

# 3. Key: admins read it from ProgramData, normal users from their own .ssh.
$adminKeys = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (-not (Test-Path $adminKeys) -or -not (Select-String -Path $adminKeys -SimpleMatch $pubKey -Quiet)) {
    Add-Content -Path $adminKeys -Value $pubKey
}
icacls $adminKeys /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null

$userSsh = "C:\Users\$forUser\.ssh"
New-Item -ItemType Directory -Force $userSsh | Out-Null
$userKeys = Join-Path $userSsh 'authorized_keys'
if (-not (Test-Path $userKeys) -or -not (Select-String -Path $userKeys -SimpleMatch $pubKey -Quiet)) {
    Add-Content -Path $userKeys -Value $pubKey
}
icacls $userKeys /inheritance:r /grant "${forUser}:F" /grant 'SYSTEM:F' /grant 'Administrators:F' | Out-Null

# 4. Report
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { "$($_.IPAddress) ($($_.InterfaceAlias))" }
$isAdmin = $null -ne (Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*\$forUser" })
$timer = Get-Process -Name 'laser-timer', 'Laser Timer' -ErrorAction SilentlyContinue
$info = @(
    "Written: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    "Computer: $env:COMPUTERNAME"
    "User: $forUser (admin: $isAdmin)"
    "IPs: $($ips -join ', ')"
    "sshd: $((Get-Service sshd).Status)"
    "Laser Timer running: $([bool]$timer)"
    "Watchdog task: $([bool](Get-ScheduledTask -TaskName 'Laser Timer watchdog' -ErrorAction SilentlyContinue))"
)
$info | ForEach-Object { Write-Host $_ }
try { $info | Set-Content (Join-Path $here 'pc-info.txt') } catch { Write-Host "Could not write pc-info.txt to the NAS: $_" }
Write-Host "`nDone. Ruben can now: ssh $forUser@<IP above>"
