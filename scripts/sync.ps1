# scripts/sync.ps1 — push project sources to the phone (~/aclaw/) via pscp.
# Excludes node_modules, rollout, smoke, .git, etc. Re-sends every file (no checksums).
# Run from repo root:  .\scripts\sync.ps1
. "$PSScriptRoot\env.ps1"
$root = Resolve-Path "$PSScriptRoot\.."
$pushList = @('src', 'package.json', 'tsconfig.json', 'prompts')

# Ensure project dir exists on phone
& $PLINK -ssh -P $PHONE_PORT -batch -hostkey $PHONE_HOSTKEY -pw $PHONE_PW "$PHONE_USER@$PHONE_HOST" "mkdir -p $PHONE_PROJECT" | Out-Null

foreach ($item in $pushList) {
  $local = Join-Path $root $item
  if (-not (Test-Path $local)) { continue }
  $isDir = (Get-Item $local).PSIsContainer
  if ($isDir) {
    & $PSCP -P $PHONE_PORT -batch -hostkey $PHONE_HOSTKEY -pw $PHONE_PW -r $local "$PHONE_USER@$PHONE_HOST`:$PHONE_PROJECT/"
  } else {
    & $PSCP -P $PHONE_PORT -batch -hostkey $PHONE_HOSTKEY -pw $PHONE_PW $local "$PHONE_USER@$PHONE_HOST`:$PHONE_PROJECT/"
  }
}
Write-Host "synced -> $PHONE_PROJECT"
