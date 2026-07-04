# scripts/remote.ps1 — run a shell command on the phone via plink.
# Usage:   .\scripts\remote.ps1 'echo hello; whoami'
#          .\scripts\remote.ps1 -Stdin 'pretty long command from stdin'
param(
  [Parameter(Position=0, ValueFromRemainingArguments=$true)]
  [string[]]$Cmd
)
. "$PSScriptRoot\env.ps1"
$joined = ($Cmd -join ' ')
if (-not $joined) {
  $joined = [Console]::In.ReadToEnd()
}
& $PLINK -ssh -P $PHONE_PORT -batch -hostkey $PHONE_HOSTKEY -pw $PHONE_PW -no-antispoof "$PHONE_USER@$PHONE_HOST" $joined
exit $LASTEXITCODE
