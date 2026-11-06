# Removes the IT Hub device agent (run as Administrator). The device stays listed in IT Hub until IT removes it.
$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'IT Hub Agent' -Confirm:$false
Unregister-ScheduledTask -TaskName 'IT Hub Agent Usage' -Confirm:$false
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force (Join-Path $env:ProgramData 'ITHubAgent')
Remove-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent' -Recurse -Force
Write-Output 'IT Hub agent removed.'
exit 0
