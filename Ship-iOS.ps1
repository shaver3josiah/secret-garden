# One click: commit everything, push main, tag the next ios-vX.Y.Z, push the tag.
# The tag push fires .github/workflows/ios-release.yml which builds, signs, and
# uploads to TestFlight — no Mac involved. One-time Apple setup: ios/APPLE-SETUP.md.
# If PowerShell blocks the script:  powershell -NoProfile -ExecutionPolicy Bypass -File .\Ship-iOS.ps1
& {
  $ErrorActionPreference = "Continue"
  $User = "shaver3josiah"; $Repo = "secret-garden"
  $candidates = @(".", "$HOME\SecretGarden\secret-garden", "$HOME\Downloads\secret-garden", "$HOME\Downloads\secret-garden\secret-garden", "$HOME\secret-garden", "$HOME\Desktop\secret-garden")
  $root = $null
  foreach ($c in $candidates) { if (Test-Path (Join-Path $c "web\index.html")) { $root = (Resolve-Path $c).Path; break } }
  if (-not $root) { $root = Read-Host "Full path to the secret-garden folder" }
  if (-not (Test-Path (Join-Path $root "web\index.html"))) { Write-Host "web\index.html not found there." -ForegroundColor Yellow; return }
  Set-Location $root
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "git not found. Install: winget install Git.Git" -ForegroundColor Yellow; return }
  if (-not (Test-Path ".git")) { Write-Host "This folder is not a git repo yet. Run push-secret-garden.ps1 first." -ForegroundColor Yellow; return }

  git add -A
  $pending = git status --porcelain
  if ($pending) {
    git commit -m ("iOS release " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
    if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed (git identity? hook?) - fix the error above and rerun." -ForegroundColor Yellow; return }
  } else {
    Write-Host "Nothing new to commit, shipping what's already there." -ForegroundColor Cyan
  }
  git push origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "Push failed, likely sign-in. Complete the Git Credential Manager browser prompt, then rerun this script." -ForegroundColor Yellow; return }

  # Next tag: bump the patch of the newest existing ios-v* tag, or start at ios-v1.0.0.
  git fetch origin --tags --quiet
  $latest = git tag -l "ios-v*" |
    ForEach-Object { try { [version]$_.Substring(5) } catch {} } |
    Sort-Object | Select-Object -Last 1
  if ($latest) { $next = "ios-v{0}.{1}.{2}" -f $latest.Major, $latest.Minor, ($latest.Build + 1) }
  else { $next = "ios-v1.0.0" }

  git tag $next
  git push origin $next
  if ($LASTEXITCODE -ne 0) { Write-Host "Tag push failed. Fix the error above and rerun." -ForegroundColor Yellow; return }

  Write-Host ""
  Write-Host "Shipped $next. TestFlight upload is running here:" -ForegroundColor Green
  Write-Host "  https://github.com/$User/$Repo/actions/workflows/ios-release.yml" -ForegroundColor Cyan
  Write-Host "When the run turns green, the build appears in TestFlight a few minutes later."
}
