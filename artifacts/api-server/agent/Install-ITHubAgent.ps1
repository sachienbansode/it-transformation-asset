<#
  Installs the IT Hub device agent. Run as Administrator / SYSTEM (Intune, SCCM, or manually).
    powershell -ExecutionPolicy Bypass -File Install-ITHubAgent.ps1 [-Code ABCD-EFGH-JKLM-NPQR] [-Url https://ithub.example.com]
  The installation key comes from IT Hub (Device Health). A personal key installs one computer only and, when it is issued
  for an asset, only on the computer with that asset's serial number. Without -Code the key is read from installation-key.txt.
  Creates C:\ProgramData\ITHubAgent, enrols the device, and registers two scheduled tasks:
    "IT Hub Agent"        SYSTEM, at start-up and every N minutes  -> health + usage check-in
    "IT Hub Agent Usage"  each signed-in user, at logon (hidden)   -> active / idle minutes, foreground app name
  Re-running upgrades the files and keeps the device identity.
#>
param([string]$Code, [string]$Url = '__ITHUB_URL__')
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Write-Error 'Run as Administrator'; exit 1 }
if (-not $Code) { $kf = Join-Path $PSScriptRoot 'installation-key.txt'; if (Test-Path $kf) { $Code = (Get-Content $kf -Raw).Trim() } }
if (-not $Code -or $Code -notmatch '^[A-Za-z0-9]{4}(-?[A-Za-z0-9]{4}){2,3}$') { Write-Error 'A valid IT Hub installation key is required (from IT Hub > Device Health). Installation stopped.'; exit 3 }
$Url = $Url.TrimEnd('/')
if ($Url -notmatch '^https://') { Write-Error "IT Hub address must start with https:// (got '$Url')"; exit 1 }
$Root = Join-Path $env:ProgramData 'ITHubAgent'; $Usage = Join-Path $Root 'usage'
New-Item -ItemType Directory -Force -Path $Root, $Usage | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'ITHubAgent.ps1') -Destination $Root -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'Uninstall-ITHubAgent.ps1') -Destination $Root -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $PSScriptRoot 'niytri.ico') -Destination $Root -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $PSScriptRoot 'tray.ico') -Destination $Root -Force -ErrorAction SilentlyContinue

# Folder rights: SYSTEM + Administrators full; users read the agent, write only their own usage files
icacls $Root /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
icacls $Usage /grant '*S-1-5-32-545:(OI)(CI)M' | Out-Null

$cfgFile = Join-Path $Root 'config.json'; $secFile = Join-Path $Root 'secret.json'
$old = $null; if (Test-Path $cfgFile) { $old = Get-Content $cfgFile -Raw | ConvertFrom-Json }
$deviceId = if ($old.deviceId) { $old.deviceId } else { [guid]::NewGuid().ToString() }
$agentVer = ((Get-Content (Join-Path $Root 'ITHubAgent.ps1') -Raw) | Select-String "\`$AgentVersion = '([^']+)'").Matches[0].Groups[1].Value
$os = Get-CimInstance Win32_OperatingSystem; $cs = Get-CimInstance Win32_ComputerSystem; $bios = Get-CimInstance Win32_BIOS
$enrol = @{ code = $Code; deviceId = $deviceId; hostname = $env:COMPUTERNAME; serial = "$($bios.SerialNumber)".Trim(); manufacturer = $cs.Manufacturer; model = $cs.Model
  platform = if ($os.ProductType -ne 1) { 'Server' } else { 'Workstation' }; osName = $os.Caption; osVersion = $os.Version; agentVersion = $agentVer } | ConvertTo-Json
try { $r = Invoke-RestMethod -Method Post -Uri "$Url/api/agent/v1/enrol" -ContentType 'application/json' -Body $enrol -TimeoutSec 60 -UseBasicParsing }
catch { $m = $_.ErrorDetails.Message; Write-Error "Enrolment failed: $(if ($m) { $m } else { $_.Exception.Message })"; exit 2 }

Add-Type -AssemblyName System.Security
$prot = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($r.token), $null, 'LocalMachine'))
@{ tokenProtected = $prot } | ConvertTo-Json | Set-Content $secFile -Encoding UTF8
icacls $secFile /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' | Out-Null
@{ url = $Url; deviceId = $deviceId; agentId = $r.agentId; trackApps = [bool]$r.trackApps; checkinMinutes = $r.checkinMinutes; installedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content $cfgFile -Encoding UTF8

# hidden launcher for the per-user monitor (no console window)
$vbs = Join-Path $Root 'usage.vbs'
@"
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$Root\ITHubAgent.ps1"" -UsageMonitor", 0, False
"@ | Set-Content $vbs -Encoding ASCII

$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$every = [Math]::Max(5, [int]$r.checkinMinutes)
$a1 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\ITHubAgent.ps1`" -Collect"
$t1 = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $every)))
$s1 = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'IT Hub Agent' -Action $a1 -Trigger $t1 -Settings $s1 -Principal (New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest) -Force | Out-Null

$a2 = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument "`"$vbs`""
$s2 = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'IT Hub Agent Usage' -Action $a2 -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s2 -Principal (New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited) -Force | Out-Null

# Apps & features entry with the NIYTRI icon (uninstall from Settings > Apps)
$appKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent'
New-Item -Path $appKey -Force | Out-Null
$un = "$ps -NoProfile -ExecutionPolicy Bypass -File `"$Root\Uninstall-ITHubAgent.ps1`""
@{ DisplayName = 'IT Hub Agent'; Publisher = 'NIYTRI Technologies'; DisplayVersion = $agentVer; DisplayIcon = "$Root\tray.ico"; InstallLocation = $Root
   UninstallString = $un; QuietUninstallString = $un; URLInfoAbout = $Url }.GetEnumerator() | ForEach-Object { Set-ItemProperty -Path $appKey -Name $_.Key -Value $_.Value }
Set-ItemProperty -Path $appKey -Name NoModify -Value 1 -Type DWord; Set-ItemProperty -Path $appKey -Name NoRepair -Value 1 -Type DWord

Start-ScheduledTask -TaskName 'IT Hub Agent'
Write-Output "IT Hub agent installed. Device $env:COMPUTERNAME - $($r.matchNote). Reports every $every minutes to $Url"
exit 0
