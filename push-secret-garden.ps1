& {
  $ErrorActionPreference = "Continue"
  $User = "shaver3josiah"; $Repo = "secret-garden"
  $candidates = @(".", "$HOME\Downloads\secret-garden", "$HOME\Downloads\secret-garden\secret-garden", "$HOME\secret-garden", "$HOME\Desktop\secret-garden")
  $root = $null
  foreach ($c in $candidates) { if (Test-Path (Join-Path $c "web\index.html")) { $root = (Resolve-Path $c).Path; break } }
  if (-not $root) { $root = Read-Host "Full path to the extracted secret-garden folder" }
  if (-not (Test-Path (Join-Path $root "web\index.html"))) { Write-Host "web\index.html not found there. Extract the zip first." -ForegroundColor Yellow; return }
  Set-Location $root
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host "git not found. Install: winget install Git.Git  or https://git-scm.com/download/win" -ForegroundColor Yellow; return }
  $email = git config --get user.email
  if (-not $email) { git config --global user.email "shaver3josiah@gmail.com"; git config --global user.name "Josiah Shaver" }
  if (-not (Test-Path ".git")) { git init; git branch -M main }
  git add -A
  git commit -m "Secret Garden v1.0.0 PWA, Android shell, CI"
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh repo create "$User/$Repo" --public --source . --push
  } else {
    Write-Host "1. Open https://github.com/new  name it $Repo, Public, add nothing else" -ForegroundColor Cyan
    Read-Host "Press Enter once the empty repo exists"
    if ((git remote) -contains "origin") { git remote set-url origin "https://github.com/$User/$Repo.git" } else { git remote add origin "https://github.com/$User/$Repo.git" }
    git push -u origin main
    if ($LASTEXITCODE -ne 0) { Write-Host "Push failed, likely sign-in. Complete the Git Credential Manager browser prompt, then rerun this block." -ForegroundColor Yellow; return }
  }
  Write-Host ""
  Write-Host "Pushed. One time setup:" -ForegroundColor Green
  Write-Host "A. Pages:   https://github.com/$User/$Repo/settings/pages  set Source to GitHub Actions"
  Write-Host "B. Signing: https://github.com/$User/$Repo/settings/secrets/actions  add KEYSTORE_PASSPHRASE"
  Write-Host "C. APK:     https://github.com/$User/$Repo/releases/tag/latest"
  Write-Host "D. Web:     https://$User.github.io/$Repo/"
}
