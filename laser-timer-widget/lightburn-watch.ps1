# Tells the laser service which file LightBurn has open, with the thumbnail
# LightBurn stores in it, so each laser cut gets a name and a picture.
# Runs hidden in the logged-in user's session (install-lightburn-watch.ps1).
#
# The file name is in the window title: "Skipped Lines * - Ruida 6445G - LightBurn Pro 2.1.04"
# (" *" = unsaved changes). The thumbnail comes from LightBurn's working copy:
# Documents\AutoSave_<pid in hex>.lbrn2 for an untitled window, "<name>_backup.lbrn2"
# next to a saved file, else the file itself (paths of open files: restore.lb).
# With several LightBurn windows open, the one that was in front last counts.

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LbWin {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@

$server = 'https://10.72.1.246:8086'
$config = Join-Path $env:LOCALAPPDATA 'Laser Timer\config.json'
if (Test-Path $config) {
    $c = Get-Content $config -Raw | ConvertFrom-Json
    if ($c.server) { $server = $c.server.TrimEnd('/') }
}
# The stock server has a self-signed certificate on the HTL network.
[Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$restore = Join-Path $env:LOCALAPPDATA 'LightBurn\restore.lb'
$log = Join-Path $env:LOCALAPPDATA 'Laser Timer\lightburn-watch.log'   # the last error, for debugging
$docs = [Environment]::GetFolderPath('MyDocuments')

function Get-WorkingCopy($proc, $name) {
    $candidates = @(Join-Path $docs ('AutoSave_{0:x}.lbrn2' -f $proc.Id))
    if ($name -ne '<untitled>') {
        # restore.lb also holds lines that are no valid path: compare names with a regex, not [IO.Path].
        $file = Get-Content $restore -ErrorAction SilentlyContinue |
            Where-Object { (($_.Trim() -replace '^.*[\\/]', '') -replace '\.lbrn2?$', '') -eq $name } | Select-Object -First 1
        if ($file) {
            $file = $file.Trim() -replace '/', '\'
            $candidates += ($file -replace '\.lbrn2?$', '_backup.lbrn2'), $file
        }
    }
    # The newest of them holds what is on the screen now (LightBurn autosaves every few minutes).
    $candidates | Where-Object { Test-Path $_ } | Get-Item | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
}

function Get-Thumbnail($file) {
    # The thumbnail sits at the top; the rest can be megabytes of engraving bitmaps.
    $stream = [IO.File]::Open($file.FullName, 'Open', 'Read', 'ReadWrite')
    try {
        $buf = New-Object byte[] ([Math]::Min($stream.Length, 1MB))
        $n = $stream.Read($buf, 0, $buf.Length)
    } finally { $stream.Close() }
    $text = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
    if ($text -match '<Thumbnail Source="([A-Za-z0-9+/=]+)"') { $Matches[1] }
}

function Get-Packed($file) {
    # The whole project gzipped (a 14 MB autosave of numbers packs to a few MB), as base64.
    $stream = [IO.File]::Open($file.FullName, 'Open', 'Read', 'ReadWrite')
    $packed = New-Object IO.MemoryStream
    try {
        $gz = New-Object IO.Compression.GZipStream($packed, [IO.Compression.CompressionMode]::Compress, $true)
        $stream.CopyTo($gz); $gz.Close()
    } finally { $stream.Close() }
    [Convert]::ToBase64String($packed.ToArray())
}

$lastPid = 0; $sent = ''; $sentAt = [datetime]::MinValue
while ($true) {
    try {
        $procs = @(Get-Process LightBurn -ErrorAction SilentlyContinue | Where-Object MainWindowTitle)
        $fgPid = [uint32]0
        [void][LbWin]::GetWindowThreadProcessId([LbWin]::GetForegroundWindow(), [ref]$fgPid)
        if ($procs.Id -contains $fgPid) { $lastPid = $fgPid }
        $p = $procs | Where-Object Id -eq $lastPid | Select-Object -First 1
        if (-not $p) { $p = $procs | Sort-Object StartTime -Descending | Select-Object -First 1 }
        if ($p -and $p.MainWindowTitle -match '^(.*?)( \*)? - .* - LightBurn') {
            $name = $Matches[1]; $unsaved = [bool]$Matches[2]
            $copy = Get-WorkingCopy $p $name
            # LightBurn may still be writing it (autosave every 10 s): read it once it is 3 s old.
            if ($copy -and ((Get-Date).ToUniversalTime() - $copy.LastWriteTimeUtc).TotalSeconds -lt 3) { Start-Sleep -Seconds 2; continue }
            $key = "$($p.Id)|$name|$(if ($copy) { $copy.LastWriteTimeUtc.Ticks })"
            # On a change at once, otherwise every minute so the service knows the watcher still runs.
            if ($key -ne $sent -or ((Get-Date) - $sentAt).TotalSeconds -ge 60) {
                $body = @{ name = $(if ($name -eq '<untitled>') { 'Untitled' } else { $name }); unsaved = $unsaved }
                if ($key -ne $sent -and $copy) {
                    $thumb = Get-Thumbnail $copy
                    # Autosave and _backup copies have no thumbnail: send the project, the service draws it.
                    if ($thumb) { $body.thumb = $thumb } else { $body.lbrn = Get-Packed $copy }
                }
                $r = Invoke-RestMethod -Method Post -Uri "$server/laser/api/lightburn" -ContentType 'application/json' `
                    -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 30
                # The service lost the picture (it restarted) or got a half-written autosave: send it again next round.
                $resend = ($r.has_thumb -eq $false -and -not ($body.thumb -or $body.lbrn)) -or $r.drawn -eq $false
                $sent = $(if ($resend) { '' } else { $key }); $sentAt = Get-Date
            }
        }
    } catch {
        # Server away or LightBurn closing: try again next round. Keep the last error for debugging.
        "$(Get-Date -Format s) $_ $($_.InvocationInfo.PositionMessage)" | Out-File $log -Encoding utf8
    }
    Start-Sleep -Seconds 2
}
