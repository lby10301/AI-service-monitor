# Nio Service Monitor - 注册 watchdog 计划任务
# 用法（管理员 PowerShell）：
#   powershell -ExecutionPolicy Bypass -File install-watchdog.ps1

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "[!] Need admin. Re-running with elevation..."
    $script = $MyInvocation.MyCommand.Path
    Start-Process powershell -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$script`"")
    exit
}

$watchdogScript = Join-Path $PSScriptRoot 'scripts\watchdog.cmd'

# Remove existing task if any
Unregister-ScheduledTask -TaskName 'NioMonitorWatchdog' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

# Create the task
$action = New-ScheduledTaskAction -Execute $watchdogScript
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 30) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName 'NioMonitorWatchdog' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Nio Monitor watchdog - restarts monitor if 18888 is not listening' | Out-Null

Write-Host "[OK] Watchdog registered. Runs every 30 minutes."
Write-Host "Verify: schtasks /Query /TN NioMonitorWatchdog"
Write-Host "Manual run: schtasks /Run /TN NioMonitorWatchdog"
Write-Host "Log: $env:TEMP\nio-watchdog.log"
