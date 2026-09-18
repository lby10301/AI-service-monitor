# Check Feishu WebSocket connection status by inspecting OpenClaw's TCP connections
# Output format (one per line):
#   COUNT:<number>
#   IPS:<ip1,ip2,ip3>

$ErrorActionPreference = 'SilentlyContinue'

# Find OpenClaw node process
$ocPids = @()
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    if ($cmd -and $cmd -match 'openclaw') {
        $ocPids += $_.Id
    }
}

if ($ocPids.Count -eq 0) {
    Write-Output 'COUNT:0'
    Write-Output 'IPS:none'
    Write-Output 'STATUS:openclaw-not-found'
    exit 0
}

# Get established TCP connections from OpenClaw process to port 443 (feishu uses WSS=443)
$conns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
    Where-Object { $ocPids -contains $_.OwningProcess -and $_.RemotePort -eq 443 }

$count = if ($conns) { @($conns).Count } else { 0 }
$ips = if ($conns) { ($conns | Select-Object -ExpandProperty RemoteAddress -Unique) -join ',' } else { 'none' }

Write-Output ('COUNT:' + $count)
Write-Output ('IPS:' + $ips)
Write-Output ('STATUS:' + $(if ($count -gt 0) { 'connected' } else { 'disconnected' }))