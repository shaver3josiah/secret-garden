# One-time Apple / App Store Connect setup for Secret Garden, from Windows.
#
# Do the TWO browser steps in ios/SETUP-WINDOWS.md first (sign in + accept
# agreements; create an ADMIN App Store Connect API key and download its .p8).
# Then run this with the four values that step gives you:
#
#   .\Setup-Apple.ps1 -P8Path "C:\path\AuthKey_XXXXXXXXXX.p8" `
#                     -KeyId XXXXXXXXXX -IssuerId <issuer-uuid> -TeamId <10-char>
#
# It validates the key, registers the bundle id, sets the 4 GitHub secrets, and
# tells you whether the app record still needs creating in the browser.
# If PowerShell blocks it:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Apple.ps1 ...
param(
  [Parameter(Mandatory = $true)][string]$P8Path,
  [Parameter(Mandatory = $true)][string]$KeyId,
  [Parameter(Mandatory = $true)][string]$IssuerId,
  [Parameter(Mandatory = $true)][string]$TeamId,
  [string]$Repo     = "shaver3josiah/secret-garden",
  [string]$BundleId = "com.shaver.secretgarden",
  [string]$AppName  = "Secret Garden - Living Sky",
  [string]$Sku      = "secretgarden-ios",
  [switch]$SkipSecrets
)

# NOT "Stop": on PS 5.1 a native command's stderr (e.g. a python traceback or a pip
# warning) becomes a terminating error under Stop. Every native call below is gated by
# an explicit $LASTEXITCODE check instead.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$asc  = Join-Path $here "scripts\asc_api.py"

function Fail($m) { Write-Host "`n[FAILED] $m" -ForegroundColor Red; exit 1 }
function Ok($m)   { Write-Host "  [ok] $m" -ForegroundColor Green }
function Step($m) { Write-Host "`n== $m ==" -ForegroundColor Cyan }

# --- 0. Preflight ------------------------------------------------------------
Step "Preflight"
if (-not (Test-Path $asc)) { Fail "scripts\asc_api.py not found next to this script." }
if (-not (Test-Path $P8Path)) { Fail "No .p8 at $P8Path" }
$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) { Fail "python not found. Install Python 3, then rerun." }
$ghCmd = (Get-Command gh -ErrorAction SilentlyContinue)
if (-not $SkipSecrets) {
  if (-not $ghCmd) { Fail "gh (GitHub CLI) not found. Install it or pass -SkipSecrets." }
  gh auth status *> $null
  if ($LASTEXITCODE -ne 0) { Fail "gh is not authenticated. Run 'gh auth login' or pass -SkipSecrets." }
  Ok "gh authenticated"
}
$firstLine = (Get-Content $P8Path -TotalCount 1)
if ($firstLine -notmatch "BEGIN PRIVATE KEY") {
  Fail "$P8Path doesn't start with '-----BEGIN PRIVATE KEY-----'. Use the RAW .p8 Apple gave you, not a base64 copy."
}
Ok ".p8 looks like a raw PEM"

# Ensure PyJWT is importable; install on demand. find_spec emits NO stderr when the
# module is missing — a bare `import jwt` would print a traceback that PS 5.1 turns
# into a terminating error.
python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('jwt') else 1)"
if ($LASTEXITCODE -ne 0) {
  Write-Host "  installing PyJWT..." -ForegroundColor DarkGray
  python -m pip install --quiet --user "pyjwt[crypto]"
  if ($LASTEXITCODE -ne 0) { Fail "pip install pyjwt[crypto] failed." }
}
python "$asc" selftest
if ($LASTEXITCODE -ne 0) { Fail "JWT self-test failed - the crypto libs aren't working." }
Ok "ES256 signing works"

$common = @("--p8", $P8Path, "--key-id", $KeyId, "--issuer", $IssuerId)

# --- 1. Validate the key -----------------------------------------------------
Step "Validating the App Store Connect key"
python "$asc" validate @common
if ($LASTEXITCODE -ne 0) { Fail "Key validation failed (see message above)." }

# --- 2. Register the bundle id ----------------------------------------------
Step "Registering bundle id $BundleId"
python "$asc" ensure-bundle-id @common --bundle-id $BundleId --name "Secret Garden"
if ($LASTEXITCODE -ne 0) { Fail "Bundle id registration failed - most often the key role is too low (recreate as Admin)." }

# --- 3. GitHub secrets -------------------------------------------------------
if (-not $SkipSecrets) {
  Step "Setting the 4 GitHub secrets on $Repo"
  # Raw .p8 over stdin (PowerShell has no '<' redirection; -Raw keeps newlines).
  Get-Content $P8Path -Raw | gh secret set APP_STORE_CONNECT_API_KEY --repo $Repo
  if ($LASTEXITCODE -ne 0) { Fail "Setting APP_STORE_CONNECT_API_KEY failed." }
  gh secret set APP_STORE_CONNECT_API_KEY_ID --repo $Repo --body $KeyId
  gh secret set APP_STORE_CONNECT_ISSUER_ID  --repo $Repo --body $IssuerId
  gh secret set APPLE_TEAM_ID                --repo $Repo --body $TeamId
  if ($LASTEXITCODE -ne 0) { Fail "Setting a secret failed." }
  Ok "APP_STORE_CONNECT_API_KEY / _API_KEY_ID / _ISSUER_ID / APPLE_TEAM_ID set"
} else {
  Write-Host "`n(skipping GitHub secrets: -SkipSecrets)" -ForegroundColor DarkGray
}

# --- 4. App record (browser-only) -------------------------------------------
Step "Checking for the app record"
python "$asc" find-app @common --bundle-id $BundleId
$appExists = ($LASTEXITCODE -eq 0)
if (-not $appExists) {
  Write-Host @"

  The app record must be created in the browser (Apple has no API for it).
  Go to https://appstoreconnect.apple.com  ->  Apps  ->  +  ->  New App:

     Platform         iOS
     Name             $AppName
     Primary Language English (U.S.)
     Bundle ID        $BundleId   (pick from the dropdown - just registered)
     SKU              $Sku
     User Access      Full Access

  Then rerun this script to confirm, or just proceed to shipping.
"@ -ForegroundColor Yellow
}

# --- Done --------------------------------------------------------------------
Step "Summary"
Ok "Key valid, bundle id registered$(if(-not $SkipSecrets){', secrets set'})"
if ($appExists) {
  Ok "App record exists"
  Write-Host "`nReady to ship:  .\Ship-iOS.ps1" -ForegroundColor Green
} else {
  Write-Host "`nLeft to do: create the app record (steps above), add internal testers," -ForegroundColor Yellow
  Write-Host "then ship:  .\Ship-iOS.ps1" -ForegroundColor Yellow
}
