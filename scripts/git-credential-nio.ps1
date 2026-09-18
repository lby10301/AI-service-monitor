# git credential helper that fetches GITHUB_PAT from OpenClaw secrets
# Usage:
#   git config --global credential.helper "!powershell -ExecutionPolicy Bypass -File C:\Users\lby10\.openclaw\workspace\scripts\service-monitor\scripts\git-credential-nio.ps1"

param()

# Read input from git (line "protocol=https\nhost=github.com\n")
$input = @()
while ($line = [Console]::In.ReadLine()) {
    if ($line -eq '') { break }
    $input += $line
}

$params = @{}
foreach ($line in $input) {
    if ($line -match '^([^=]+)=(.*)$') {
        $params[$matches[1]] = $matches[2]
    }
}

# Only handle github.com
if ($params['host'] -ne 'github.com') {
    exit 0
}

# Read PAT from file (since we can't read it directly from secrets store in script)
$credFile = "$HOME\.git-credentials"
if (Test-Path $credFile) {
    $content = Get-Content $credFile -Raw
    if ($content -match 'https://([^:]+):([^@]+)@github\.com') {
        Write-Output "username=$($matches[1])"
        Write-Output "password=$($matches[2])"
        exit 0
    }
}

# Fallback: ask user
$cred = Get-Credential -Message "GitHub credentials"
if ($cred) {
    Write-Output "username=$($cred.UserName)"
    Write-Output "password=$($cred.GetNetworkCredential().Password)"
}