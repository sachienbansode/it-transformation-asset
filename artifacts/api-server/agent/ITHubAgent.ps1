<#
  IT Hub device agent (Windows 10/11 and Windows Server 2016+; PowerShell 5.1).
  Modes:
    -Collect        run as SYSTEM every 15 min (scheduled task "IT Hub Agent"): hardware / security health + daily usage → IT Hub
    -UsageMonitor   runs in each signed-in user's session (task "IT Hub Agent Usage"): once a minute records active / idle
                    and the foreground application's process name. No keystrokes, screenshots, window titles or files.
#>
param([switch]$Collect, [switch]$UsageMonitor, [switch]$Once)
$ErrorActionPreference = 'Stop'
$AgentVersion = '1.1.0'
$Root = Join-Path $env:ProgramData 'ITHubAgent'
$UsageDir = Join-Path $Root 'usage'
$ConfigFile = Join-Path $Root 'config.json'      # readable by users (URL, settings)
$SecretFile = Join-Path $Root 'secret.json'      # SYSTEM / Administrators only (device token, DPAPI machine-protected)
$LogFile = Join-Path $Root 'agent.log'

function Log($m) {
  try {
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) { Move-Item $LogFile "$LogFile.1" -Force }
    Add-Content -Path $LogFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m)
  } catch { }
}
function Try-Get([scriptblock]$b, $default = $null) { try { & $b } catch { $default } }

# ─────────────────────────── usage monitor (user session) ───────────────────────────
if ($UsageMonitor) {
  Add-Type -Namespace ITHub -Name Win -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
'@
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $safe = ($user -replace '[^A-Za-z0-9._-]', '_')
  $trackApps = $true
  try { $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json; if ($cfg.trackApps -eq $false) { $trackApps = $false } } catch { }
  while ($true) {
    try {
      $li = New-Object ITHub.Win+LASTINPUTINFO; $li.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($li)
      [void][ITHub.Win]::GetLastInputInfo([ref]$li)
      $idleSec = ([Environment]::TickCount - $li.dwTime) / 1000
      $proc = $null
      $h = [ITHub.Win]::GetForegroundWindow(); $procId = 0
      if ($h -ne [IntPtr]::Zero) { [void][ITHub.Win]::GetWindowThreadProcessId($h, [ref]$procId); $proc = Try-Get { (Get-Process -Id $procId).ProcessName } }
      $locked = ($proc -eq 'LockApp') -or ($null -eq $proc)
      $active = ($idleSec -lt 300) -and -not $locked
      $day = Get-Date -Format 'yyyy-MM-dd'; $now = (Get-Date).ToUniversalTime().ToString('o')
      $file = Join-Path $UsageDir "$day`_$safe.json"
      $u = Try-Get { Get-Content $file -Raw | ConvertFrom-Json }
      if (-not $u) { $u = [pscustomobject]@{ day = $day; user = $user; firstSeen = $now; lastSeen = $now; activeMins = 0; idleMins = 0; apps = [pscustomobject]@{} } }
      $u.lastSeen = $now
      if ($active) {
        $u.activeMins++
        if ($trackApps -and $proc) {
          $k = "$proc.exe".ToUpper()
          if ($u.apps.PSObject.Properties[$k]) { $u.apps.$k++ } else { $u.apps | Add-Member -NotePropertyName $k -NotePropertyValue 1 }
        }
      } else { $u.idleMins++ }
      ($u | ConvertTo-Json -Depth 4 -Compress) | Set-Content -Path $file -Encoding UTF8
    } catch { }
    if ($Once) { break }
    Start-Sleep -Seconds 60
  }
  exit 0
}

# ─────────────────────────── collector (SYSTEM) ───────────────────────────
if (-not $Collect) { Write-Output 'Use -Collect (SYSTEM task) or -UsageMonitor (user task)'; exit 1 }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Security
$cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
$sec = Get-Content $SecretFile -Raw | ConvertFrom-Json
$token = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($sec.tokenProtected), $null, 'LocalMachine'))

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Try-Get { Get-CimInstance Win32_BIOS }
$isServer = $os.ProductType -ne 1
$cpuAll = @(Get-CimInstance Win32_Processor)
$cpuPct = [math]::Round((($cpuAll | Measure-Object -Property LoadPercentage -Average).Average), 1)
$memTot = [double]$os.TotalVisibleMemorySize; $memFree = [double]$os.FreePhysicalMemory
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  [pscustomobject]@{ drive = $_.DeviceID; sizeGb = [math]::Round($_.Size / 1GB, 1); freeGb = [math]::Round($_.FreeSpace / 1GB, 1); freePct = if ($_.Size) { [math]::Round($_.FreeSpace * 100 / $_.Size, 1) } else { $null } } })
$phys = @(Try-Get { Get-PhysicalDisk | ForEach-Object { [pscustomobject]@{ name = $_.FriendlyName; mediaType = "$($_.MediaType)"; health = "$($_.HealthStatus)"; opStatus = "$($_.OperationalStatus)"; sizeGb = [math]::Round($_.Size / 1GB) } } } @())
$battery = $null
$b = Try-Get { Get-CimInstance Win32_Battery }
if ($b) {
  $design = Try-Get { (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData | Select-Object -First 1).DesignedCapacity }
  $full = Try-Get { (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity }
  $battery = [pscustomobject]@{ present = $true; chargePct = $b.EstimatedChargeRemaining; designMwh = $design; fullMwh = $full; healthPct = if ($design -and $full) { [math]::Min(100, [math]::Round($full * 100 / $design, 1)) } else { $null } }
}
# antivirus: Security Center on workstations, Defender status on servers
$av = @()
if (-not $isServer) {
  $av = @(Try-Get { Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct | ForEach-Object {
    $hex = '{0:X6}' -f [int]$_.productState
    [pscustomobject]@{ name = $_.displayName; enabled = ($hex.Substring(2, 2) -in @('10', '11')); upToDate = ($hex.Substring(4, 2) -eq '00') } } } @())
} else {
  $mp = Try-Get { Get-MpComputerStatus }
  if ($mp) { $av = @([pscustomobject]@{ name = 'Microsoft Defender'; enabled = [bool]$mp.AntivirusEnabled; upToDate = ($mp.AntivirusSignatureAge -le 3) }) }
}
$bitlocker = @(Try-Get { Get-BitLockerVolume | ForEach-Object { [pscustomobject]@{ drive = $_.MountPoint; status = "$($_.ProtectionStatus)"; encryption = "$($_.VolumeStatus)" } } } @())
$fw = Try-Get { $p = Get-NetFirewallProfile; [pscustomobject]@{ domain = [bool]($p | Where-Object Name -eq 'Domain').Enabled; private = [bool]($p | Where-Object Name -eq 'Private').Enabled; public = [bool]($p | Where-Object Name -eq 'Public').Enabled } }
$lastHotfix = Try-Get { (Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn.ToString('yyyy-MM-dd') }
$pendingReboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
$ip = Try-Get { (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress }
$health = [ordered]@{
  hostname = $env:COMPUTERNAME; serial = "$($bios.SerialNumber)".Trim(); manufacturer = $cs.Manufacturer; model = $cs.Model; user = $cs.UserName
  platform = if ($isServer) { 'Server' } else { 'Workstation' }
  os = @{ name = $os.Caption; version = $os.Version; build = $os.BuildNumber; installDate = $os.InstallDate.ToString('yyyy-MM-dd'); lastBoot = $os.LastBootUpTime.ToUniversalTime().ToString('o') }
  uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
  cpu = @{ pct = $cpuPct; name = $cpuAll[0].Name; cores = ($cpuAll | Measure-Object NumberOfCores -Sum).Sum }
  mem = @{ totalGb = [math]::Round($memTot / 1MB, 1); usedPct = [math]::Round(($memTot - $memFree) * 100 / $memTot, 1) }
  disks = $disks; physicalDisks = $phys; battery = $battery
  security = @{ av = $av; bitlocker = $bitlocker; firewall = $fw }
  patches = @{ lastInstalled = $lastHotfix; pendingReboot = $pendingReboot }
  network = @{ ip = $ip }
}
# daily usage written by the user-session monitor (last 7 days)
$usage = @()
if (Test-Path $UsageDir) {
  Get-ChildItem $UsageDir -Filter '*.json' | ForEach-Object {
    if ($_.LastWriteTime -lt (Get-Date).AddDays(-8)) { Remove-Item $_.FullName -Force; return }
    $u = Try-Get { Get-Content $_.FullName -Raw | ConvertFrom-Json }; if ($u) { $usage += $u }
  }
}
$body = [ordered]@{ agentVersion = $AgentVersion; health = $health; usage = $usage }
if ($cfg.sendSoftware -ne $false -and (-not $cfg.softwareAt -or ((Get-Date) - [datetime]$cfg.softwareAt).TotalHours -gt 23)) {
  $sw = foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
    Try-Get { Get-ItemProperty $k | Where-Object { $_.DisplayName -and -not $_.SystemComponent } | ForEach-Object { [pscustomobject]@{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; installDate = $_.InstallDate } } } @()
  }
  $body.software = @($sw | Sort-Object name, version -Unique)
}
try {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$($cfg.url)/api/agent/v1/checkin" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60 -UseBasicParsing
  if ($body.software) { $cfg | Add-Member -NotePropertyName softwareAt -NotePropertyValue (Get-Date).ToString('o') -Force }
  $cfg | Add-Member -NotePropertyName trackApps -NotePropertyValue ([bool]$r.trackApps) -Force
  $cfg | Add-Member -NotePropertyName lastCheckin -NotePropertyValue (Get-Date).ToString('o') -Force
  ($cfg | ConvertTo-Json) | Set-Content $ConfigFile -Encoding UTF8
  Log "Check-in OK: $($r.state)"
  # self-update: IT Hub always holds the current agent; replace this script only if the download matches the published SHA-256
  if ($r.latestVersion -and $r.agentSha256 -and $r.latestVersion -ne $AgentVersion) {
    try {
      $tmp = Join-Path $Root 'ITHubAgent.new.ps1'
      Invoke-WebRequest -Uri "$($cfg.url)/api/agent/v1/files/ITHubAgent.ps1" -Headers @{ Authorization = "Bearer $token" } -OutFile $tmp -UseBasicParsing -TimeoutSec 60
      $hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
      if ($hash -eq $r.agentSha256.ToLower()) {
        Copy-Item $tmp (Join-Path $Root 'ITHubAgent.ps1') -Force; Remove-Item $tmp -Force
        Log "Updated agent $AgentVersion -> $($r.latestVersion)"
        # restart the usage monitors so they run the new version
        Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-ScheduledTask -TaskName 'IT Hub Agent Usage' -ErrorAction SilentlyContinue
      } else { Remove-Item $tmp -Force; Log "Update rejected: checksum mismatch ($hash)" }
    } catch { Log "Update failed: $($_.Exception.Message)" }
  }
} catch {
  $err = $_
  $code = Try-Get { [int]$err.Exception.Response.StatusCode }
  Log "Check-in failed ($code): $($err.Exception.Message)"
  if ($code -eq 410) { Log 'Device removed in IT Hub — disabling agent tasks'; Disable-ScheduledTask -TaskName 'IT Hub Agent' -ErrorAction SilentlyContinue | Out-Null; Disable-ScheduledTask -TaskName 'IT Hub Agent Usage' -ErrorAction SilentlyContinue | Out-Null }
  exit 1
}
