# scripts/usb-setup.ps1 — call after plugging USB to (re)establish the SSH tunnel.
# Idempotent — safe to run multiple times.
# Usage:  .\scripts\usb-setup.ps1
. "$PSScriptRoot\env.ps1"

if (-not (Test-Path $ADB)) {
  Write-Error "adb not found at $ADB. Install Android Platform Tools and update scripts/env.ps1"
  exit 1
}

Write-Host "=== adb devices ===" -ForegroundColor Cyan
& $ADB devices
$state = (& $ADB get-state) 2>&1
if ($state -ne 'device') {
  Write-Error "Phone not in 'device' state (got: $state). Plug in USB and approve the 'Allow USB debugging?' prompt on the phone."
  exit 2
}

Write-Host ""
Write-Host "=== adb forward tcp:$PHONE_PORT --> phone tcp:$PHONE_PORT ===" -ForegroundColor Cyan
& $ADB forward tcp:$PHONE_PORT tcp:$PHONE_PORT | Out-Null
& $ADB forward --list | Select-String "tcp:$PHONE_PORT"

Write-Host ""
Write-Host "=== probing Termux sshd through tunnel ===" -ForegroundColor Cyan
$probe = & $PLINK -ssh -P $PHONE_PORT -batch -hostkey $PHONE_HOSTKEY -pw $PHONE_PW "$PHONE_USER@$PHONE_HOST" 'echo OK; uname -m' 2>&1
Write-Host $probe
if ($probe -match 'OK') {
  Write-Host "`nSSH-over-USB tunnel ready. PHONE_HOST=$PHONE_HOST PHONE_PORT=$PHONE_PORT" -ForegroundColor Green
} else {
  Write-Host "`nTunnel up but SSH didn't respond — Termux sshd may not be running. On phone:" -ForegroundColor Yellow
  Write-Host "    sshd"
  exit 3
}
