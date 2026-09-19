# Nio auto-push v2 - read GITHUB_PAT from env, push, capture all output
$ErrorActionPreference = 'Continue'

$RepoDir = 'C:\Nio\service-monitor'

# Try env var (User scope)
$pat = [Environment]::GetEnvironmentVariable('GITHUB_PAT', 'User')
if (-not $pat) {
    $pat = [Environment]::GetEnvironmentVariable('GITHUB_PAT', 'Process')
}

# Fall back to file
if (-not $pat) {
    $PatFile = 'C:\Users\lby10\.openclaw\.git-pat'
    if (Test-Path $PatFile) {
        $pat = (Get-Content $PatFile -Raw).Trim()
    }
}

if (-not $pat) {
    Write-Host 'ERROR: GITHUB_PAT not found.' -ForegroundColor Red
    Write-Host 'Run once: setx GITHUB_PAT "ghp_your_token"'
    exit 1
}

# Validate PAT looks like a GitHub PAT
if ($pat -notmatch '^ghp_') {
    Write-Host "WARN: PAT does not start with 'ghp_' - might not work"
    Write-Host "  Got: $($pat.Substring(0, [Math]::Min(8, $pat.Length)))..."
}

Write-Host '=== Nio Auto-Push v2 ===' -ForegroundColor Cyan
Write-Host "  PAT prefix: $($pat.Substring(0, [Math]::Min(8, $pat.Length)))..."
Write-Host "  PAT length: $($pat.Length)"

Set-Location $RepoDir

$branch = 'master'
$url = "https://lby10301:${pat}@github.com/lby10301/AI-service-monitor.git"

Write-Host "  URL host: github.com"
Write-Host "  Branch: $branch"
Write-Host ''
Write-Host 'Running git push (this may take 10-30 seconds)...'
Write-Host ''

# Capture git output to file AND echo to stdout
$LogFile = Join-Path $RepoDir 'logs\auto-push.log'
New-Item -ItemType Directory -Path (Split-Path $LogFile) -Force | Out-Null

# Use git push through local proxy 127.0.0.1:7897 (PAT embedded in URL, no credential helper needed)
$gitOutput = git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 -c credential.helper= push $url $branch 2>&1
$exitCode = $LASTEXITCODE

# Always show the output
$gitOutput | ForEach-Object { Write-Host "  $_" }
$gitOutput | Out-File -FilePath $LogFile -Append -Encoding utf8

Write-Host ''
Write-Host "  Exit code: $exitCode"
Write-Host "  Log: $LogFile"

if ($exitCode -eq 0) {
    Write-Host ''
    Write-Host 'OK: Push succeeded' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host "FAIL: git push exited with code $exitCode" -ForegroundColor Red
}

exit $exitCode