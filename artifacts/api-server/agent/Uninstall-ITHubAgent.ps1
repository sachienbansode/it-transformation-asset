# Removes the IT Hub device agent. Needs administrator rights on this computer: a standard user is asked for an
# administrator's password (UAC) and cannot remove it. IT is told who removed it and when.
param([string]$Reason = '')
$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  try { Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -ErrorAction Stop }
  catch { Write-Output 'The IT Hub agent is managed by IT and can only be removed by a computer administrator.' }
  exit 1
}
$ErrorActionPreference = 'SilentlyContinue'
$Root = Join-Path $env:ProgramData 'ITHubAgent'
# tell IT Hub (best effort)
try {
  $cfg = Get-Content (Join-Path $Root 'config.json') -Raw | ConvertFrom-Json
  $sec = Get-Content (Join-Path $Root 'secret.json') -Raw | ConvertFrom-Json
  Add-Type -AssemblyName System.Security
  $token = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($sec.tokenProtected), $null, 'LocalMachine'))
  $body = @{ by = "$env:USERDOMAIN\$env:USERNAME"; hostname = $env:COMPUTERNAME; reason = $Reason } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$($cfg.url)/api/agent/v1/uninstall" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body -TimeoutSec 20 -UseBasicParsing | Out-Null
} catch { }
Unregister-ScheduledTask -TaskName 'IT Hub Agent' -Confirm:$false
Unregister-ScheduledTask -TaskName 'IT Hub Agent Usage' -Confirm:$false
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force $Root
Remove-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent' -Recurse -Force
Write-Output 'IT Hub agent removed.'
exit 0
