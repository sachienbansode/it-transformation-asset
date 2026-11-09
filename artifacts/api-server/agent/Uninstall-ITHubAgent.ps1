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
  $body = [Text.Encoding]::UTF8.GetBytes((@{ by = "$env:USERDOMAIN\$env:USERNAME"; hostname = $env:COMPUTERNAME; reason = $Reason } | ConvertTo-Json))
  # signed like the agent (X-ITHub-Signature): HMAC-SHA256, key = SHA-256(token) hex
  $sha = [Security.Cryptography.SHA256]::Create(); $hx = { param($b) -join ($b | ForEach-Object { $_.ToString('x2') }) }
  $key = & $hx ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))); $bh = & $hx ($sha.ComputeHash($body))
  $time = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); $nonce = [guid]::NewGuid().ToString()
  $hmac = New-Object Security.Cryptography.HMACSHA256 (,[Text.Encoding]::UTF8.GetBytes($key))
  $sig = & $hx ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$time`n$nonce`nPOST`n/agent/v1/uninstall`n$bh")))
  $hd = @{ Authorization = "Bearer $token"; 'X-ITHub-Time' = $time; 'X-ITHub-Nonce' = $nonce; 'X-ITHub-Signature' = $sig }
  Invoke-RestMethod -Method Post -Uri "$($cfg.url)/api/agent/v1/uninstall" -Headers $hd -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 20 -UseBasicParsing | Out-Null
} catch { }
Unregister-ScheduledTask -TaskName 'IT Hub Agent' -Confirm:$false
Unregister-ScheduledTask -TaskName 'IT Hub Agent Usage' -Confirm:$false
Unregister-ScheduledTask -TaskName 'IT Hub Agent Pulse' -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force $Root
Remove-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent' -Recurse -Force
Write-Output 'IT Hub agent removed.'
exit 0
