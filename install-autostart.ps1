# Nio Service Monitor - 一键注册开机自启动
# 自动提权到管理员；如果当前已是管理员则直接执行
#
# 用法：
#   1. 右键此文件 → "使用 PowerShell 运行"（推荐）
#   2. 或 PowerShell: powershell -ExecutionPolicy Bypass -File install-autostart.ps1

$ErrorActionPreference = 'Stop'

# ---- 自动提权 ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "[!] 当前不是管理员，尝试提权..." -ForegroundColor Yellow
    $script = $MyInvocation.MyCommand.Path
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$script`""
    exit
}

Write-Host "[OK] 已是管理员，开始注册任务...`n" -ForegroundColor Green

# ---- 路径 ----
$root = $PSScriptRoot
$openclawScript = Join-Path $root 'scripts\start-openclaw.cmd'
$hermesScript   = Join-Path $root 'scripts\start-hermes.cmd'
$monitorScript  = Join-Path $root 'scripts\start-monitor.cmd'

# ---- Tailscale 路径探测 ----
$tsPath = (Get-Command tailscale -ErrorAction SilentlyContinue).Source
if (-not $tsPath) {
    foreach ($p in @('C:\Program Files\Tailscale\tailscale.exe', 'C:\Windows\System32\tailscale.exe')) {
        if (Test-Path $p) { $tsPath = $p; break }
    }
}
if (-not $tsPath) {
    Write-Host "[WARN] Tailscale 路径未找到，跳过 NioTailscaleBoot" -ForegroundColor Yellow
}

# ---- 注册任务函数 ----
function Register-Task {
    param($Name, $Cmd, $ArgString, [int]$DelaySec = 0, $Description = '')
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue

    $delay = "PT${DelaySec}S"

    $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>$Description</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Delay>$delay</Delay>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$Cmd</Command>
      <Arguments>$ArgString</Arguments>
    </Exec>
  </Actions>
</Task>
"@

    Write-Host "  Registering: $Name  (Delay ${DelaySec}s)"
    $tmpXml = Join-Path $env:TEMP "$Name.xml"
    [System.IO.File]::WriteAllText($tmpXml, $xml, [System.Text.Encoding]::Unicode)
    Register-ScheduledTask -TaskName $Name -Xml (Get-Content $tmpXml -Raw) | Out-Null
    Remove-Item $tmpXml -Force -ErrorAction SilentlyContinue
    Write-Host "    [OK]" -ForegroundColor Green
}

Write-Host "=== Nio Service Monitor - 注册开机自启动 ===`n" -ForegroundColor Cyan

if ($tsPath) {
    Register-Task -Name 'NioTailscaleBoot' `
        -Cmd $tsPath -ArgString 'up --accept-routes' -DelaySec 0 `
        -Description 'Tailscale fallback boot'
}

Register-Task -Name 'NioOpenClawBoot' `
    -Cmd 'cmd.exe' `
    -ArgString "/c `"$openclawScript`"" -DelaySec 30 `
    -Description 'OpenClaw Gateway boot'

Register-Task -Name 'NioHermesBoot' `
    -Cmd 'cmd.exe' `
    -ArgString "/c `"$hermesScript`"" -DelaySec 60 `
    -Description 'Hermes (WSL) boot'

Register-Task -Name 'NioMonitorBoot' `
    -Cmd 'cmd.exe' `
    -ArgString "/c `"$monitorScript`"" -DelaySec 90 `
    -Description 'Nio Service Monitor (self-healing)'

Write-Host "`n=== All Done ===`n" -ForegroundColor Green
Write-Host "查看任务列表: schtasks /Query /TN Nio*"
Write-Host "手动触发测试:  schtasks /Run /TN NioOpenClawBoot"
