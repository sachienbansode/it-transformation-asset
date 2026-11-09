<#
  IT Hub device agent (Windows 10/11 and Windows Server 2016+; PowerShell 5.1).
  Modes:
    -Collect        run as SYSTEM every 15 min (scheduled task "IT Hub Agent"): hardware / security health + daily usage -> IT Hub
    -Pulse          run as SYSTEM every minute (task "IT Hub Agent Pulse"): tiny call that shows the device online in IT Hub;
                    when IT or the user presses "Refresh now" it runs -Collect straight away.
    -UsageMonitor   runs in each signed-in user's session (task "IT Hub Agent Usage"): once a minute records active / idle
                    and the foreground application's process name. No keystrokes, screenshots, window titles or files.
#>
param([switch]$Collect, [switch]$UsageMonitor, [switch]$Pulse, [switch]$Once)
$ErrorActionPreference = 'Stop'
$AgentVersion = '1.2.0'
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
# Signed requests (1.2.0+): every call to IT Hub carries time, a one-time nonce and an HMAC-SHA256 signature made with
# SHA-256(token) as the key over "time`nnonce`nMETHOD`n/agent/v1/...`nSHA-256(body)". A copied or replayed request is refused.
function Hex([byte[]]$b) { -join ($b | ForEach-Object { $_.ToString('x2') }) }
function Sign-Headers([string]$token, [string]$method, [string]$uri, [byte[]]$body) {
  $sha = [Security.Cryptography.SHA256]::Create()
  $key = Hex ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)))
  if (-not $body) { $body = [byte[]]@() }
  $bodyHash = Hex ($sha.ComputeHash($body))
  $path = ([Uri]$uri).AbsolutePath -replace '^/api', ''
  $time = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  $nonce = [guid]::NewGuid().ToString()
  $hmac = New-Object Security.Cryptography.HMACSHA256 (,[Text.Encoding]::UTF8.GetBytes($key))
  $sig = Hex ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$time`n$nonce`n$($method.ToUpper())`n$path`n$bodyHash")))
  @{ Authorization = "Bearer $token"; 'X-ITHub-Time' = $time; 'X-ITHub-Nonce' = $nonce; 'X-ITHub-Signature' = $sig }
}
# a new token handed out by IT Hub (rotation every 30 days) is saved machine-protected; the old one keeps working until it is used
function Save-NewToken([string]$t) {
  if ($t -notmatch '^[a-f0-9]{64}$') { return }
  try {
    $prot = [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t), $null, 'LocalMachine'))
    $s2 = Get-Content $SecretFile -Raw | ConvertFrom-Json
    $s2 | Add-Member -NotePropertyName tokenProtected -NotePropertyValue $prot -Force
    $s2 | Add-Member -NotePropertyName rotatedAt -NotePropertyValue (Get-Date).ToString('o') -Force
    ($s2 | ConvertTo-Json) | Set-Content $SecretFile -Encoding UTF8
    Log 'Device token rotated'
  } catch { Log "Token rotation could not be saved: $($_.Exception.Message)" }
}

# --------------------------- usage monitor (user session) ---------------------------
if ($UsageMonitor) {
  Add-Type -Namespace ITHub -Name Win -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
[DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
'@
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $safe = ($user -replace '[^A-Za-z0-9._-]', '_')
  # what IT allows to be recorded for this computer's employee (re-read every 10 minutes; set in IT Hub by an administrator)
  $script:trackApps = $true; $script:trackUsage = $true; $script:cfgAt = [datetime]::MinValue
  $readCfg = { try { $c = Get-Content $ConfigFile -Raw | ConvertFrom-Json; $script:trackApps = ($c.trackApps -ne $false); $script:trackUsage = ($c.trackUsage -ne $false) } catch { }; $script:cfgAt = Get-Date }
  $tick = {
    if (((Get-Date) - $script:cfgAt).TotalMinutes -ge 10) { & $readCfg }
    if (-not $script:trackUsage) { return }
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
        if ($script:trackApps -and $proc) {
          $k = "$proc.exe".ToUpper()
          if ($u.apps.PSObject.Properties[$k]) { $u.apps.$k++ } else { $u.apps | Add-Member -NotePropertyName $k -NotePropertyValue 1 }
        }
      } else { $u.idleMins++ }
      ($u | ConvertTo-Json -Depth 4 -Compress) | Set-Content -Path $file -Encoding UTF8
    } catch { }
  }
  if ($Once) { & $tick; exit 0 }
  # NIYTRI icon in the notification area while the agent runs (no exit option: the agent is managed by IT)
  function Get-TrayIcon {
    foreach ($n in 'tray.ico', 'niytri.ico') {
      $fp = Join-Path $Root $n
      if (Test-Path $fp) { try { return New-Object System.Drawing.Icon($fp, [System.Windows.Forms.SystemInformation]::SmallIconSize) } catch { } }
    }
    return $null
  }
  $tray = $null
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $tray = New-Object System.Windows.Forms.NotifyIcon
    $ic = Get-TrayIcon; $script:iconOk = [bool]$ic
    $tray.Icon = if ($ic) { $ic } else { [System.Drawing.SystemIcons]::Shield }
    $tray.Text = 'IT Hub Agent - managed by IT'
    $menu = New-Object System.Windows.Forms.ContextMenuStrip
    $hdr = $menu.Items.Add("IT Hub Agent $AgentVersion"); $hdr.Enabled = $false
    $last = $menu.Items.Add('Last report: -'); $last.Enabled = $false
    [void]$menu.Items.Add('-')
    $mine = $menu.Items.Add('My device health'); $mine.Font = New-Object System.Drawing.Font($mine.Font, [System.Drawing.FontStyle]::Bold)
    $mine.add_Click({ $c = Try-Get { Get-Content $ConfigFile -Raw | ConvertFrom-Json }; if ($c.url) { Start-Process "$($c.url)/my-device" } })
    $open = $menu.Items.Add('Open IT Hub'); $open.add_Click({ $c = Try-Get { Get-Content $ConfigFile -Raw | ConvertFrom-Json }; if ($c.url) { Start-Process $c.url } })
    $pol = $menu.Items.Add('My Policies'); $pol.add_Click({ $c = Try-Get { Get-Content $ConfigFile -Raw | ConvertFrom-Json }; if ($c.url) { Start-Process "$($c.url)/my-policies" } })
    $menu.add_Opening({
      $c = Try-Get { Get-Content $ConfigFile -Raw | ConvertFrom-Json }
      $last.Text = if ($c.lastCheckin) { 'Last report: ' + ([datetime]$c.lastCheckin).ToString('dd-MMM-yyyy HH:mm') } else { 'Last report: not yet' }
    })
    $tray.ContextMenuStrip = $menu
    # left click: open this computer's health page in IT Hub (right click shows the menu)
    $tray.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { $c = Try-Get { Get-Content $ConfigFile -Raw | ConvertFrom-Json }; if ($c.url) { Start-Process "$($c.url)/my-device" } } })
    $tray.Visible = $true
  } catch { $tray = $null }
  if ($tray) {
    & $tick
    $timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 60000
    $timer.add_Tick({ & $tick; if (-not $script:iconOk) { $ic = Get-TrayIcon; if ($ic) { $tray.Icon = $ic; $script:iconOk = $true } } })
    $timer.Start()
    try { [System.Windows.Forms.Application]::Run() } finally { $tray.Visible = $false; $tray.Dispose() }
  } else {
    while ($true) { & $tick; Start-Sleep -Seconds 60 }
  }
  exit 0
}

# --------------------------- pulse (SYSTEM, every minute) ---------------------------
if ($Pulse) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Add-Type -AssemblyName System.Security
    $cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    $sec = Get-Content $SecretFile -Raw | ConvertFrom-Json
    $token = [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($sec.tokenProtected), $null, 'LocalMachine'))
    $pu = "$($cfg.url)/api/agent/v1/pulse"
    $r = Invoke-RestMethod -Method Get -Uri $pu -Headers (Sign-Headers $token 'GET' $pu $null) -TimeoutSec 20 -UseBasicParsing
    if ($r.refresh) {
      Log 'Refresh requested from IT Hub - collecting now'
      $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
      & $ps -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File (Join-Path $Root 'ITHubAgent.ps1') -Collect
    }
  } catch {
    $code = Try-Get { [int]$_.Exception.Response.StatusCode }
    if ($code -eq 410) { Disable-ScheduledTask -TaskName 'IT Hub Agent Pulse' -ErrorAction SilentlyContinue | Out-Null }
  }
  exit 0
}

# --------------------------- collector (SYSTEM) ---------------------------
if (-not $Collect) { Write-Output 'Use -Collect (SYSTEM task), -Pulse (SYSTEM task) or -UsageMonitor (user task)'; exit 1 }
# the 1-minute pulse task (online status + "Refresh now"); added here so devices that self-update get it too
if (-not (Get-ScheduledTask -TaskName 'IT Hub Agent Pulse' -ErrorAction SilentlyContinue)) {
  try {
    $psP = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $aP = New-ScheduledTaskAction -Execute $psP -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\ITHubAgent.ps1`" -Pulse"
    $tP = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $sP = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'IT Hub Agent Pulse' -Action $aP -Trigger $tP -Settings $sP -Principal (New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest) -Force | Out-Null
    Log 'Pulse task added (online status / Refresh now)'
  } catch { Log "Pulse task could not be added: $($_.Exception.Message)" }
}
# keep the Apps & features entry (NIYTRI icon) in step with self-updates
$appKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent'
if (Test-Path $appKey) { Set-ItemProperty -Path $appKey -Name DisplayVersion -Value $AgentVersion -ErrorAction SilentlyContinue }
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
  $battery = [pscustomobject]@{ present = $true; chargePct = $b.EstimatedChargeRemaining; onPower = ($b.BatteryStatus -in 2, 6, 7, 8, 9); designMwh = $design; fullMwh = $full; healthPct = if ($design -and $full) { [math]::Min(100, [math]::Round($full * 100 / $design, 1)) } else { $null }; cycleCount = $null; chemistry = $null; maker = $null; source = 'wmi' }
  # many laptops (e.g. HP) do not fill the WMI battery classes: fall back to the Windows battery report
  if (-not $battery.healthPct) {
    try {
      $bx = Join-Path $env:TEMP ('ithub-batt-' + [guid]::NewGuid().ToString('N') + '.xml')
      & "$env:SystemRoot\System32\powercfg.exe" /batteryreport /xml /output $bx | Out-Null
      [xml]$br = Get-Content $bx -Raw; Remove-Item $bx -Force -ErrorAction SilentlyContinue
      $bt = @($br.BatteryReport.Batteries.Battery)[0]
      if ($bt) {
        $d = [double]$bt.DesignCapacity; $f = [double]$bt.FullChargeCapacity
        $battery.designMwh = $d; $battery.fullMwh = $f; $battery.source = 'battery report'
        if ($d -gt 0) { $battery.healthPct = [math]::Min(100, [math]::Round($f * 100 / $d, 1)) }
        $battery.cycleCount = Try-Get { [int]$bt.CycleCount }; $battery.chemistry = "$($bt.Chemistry)"; $battery.maker = "$($bt.Manufacturer)"
      }
    } catch { }
  }
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
# last Windows update: the Windows Update history (cumulative / monthly updates), else the hotfix list - whichever is newer
$lastHotfix = Try-Get { (Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1).InstalledOn }
$wu = Try-Get {
  $se = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); $n = $se.GetTotalHistoryCount()
  if ($n -gt 0) { $se.QueryHistory(0, [Math]::Min($n, 300)) | Where-Object { $_.Operation -eq 1 -and $_.ResultCode -in 2, 3 -and $_.Title -notmatch 'Defender|Security Intelligence|Malicious Software Removal' } | Sort-Object Date -Descending | Select-Object -First 1 }
}
$lastUpd = @($lastHotfix, $(if ($wu) { $wu.Date.ToLocalTime() })) | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1
$lastHotfix = if ($lastUpd) { ([datetime]$lastUpd).ToString('yyyy-MM-dd') } else { $null }
$lastUpdTitle = if ($wu) { [string]$wu.Title } else { $null }
$pendingReboot = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
$ip = Try-Get { (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Sort-Object InterfaceMetric | Select-Object -First 1).IPAddress }
# ---- OS details, activation and update status (ITH-094)
$cv = Try-Get { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' }
$lic = $null
if (-not $cfg.licenseAt -or ((Get-Date) - [datetime]$cfg.licenseAt).TotalHours -gt 23 -or -not $cfg.license) {
  $lic = Try-Get {
    $l = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1
    if ($l) { [pscustomobject]@{ status = @('Unlicensed', 'Licensed', 'Grace period', 'Grace period (out of tolerance)', 'Grace period (non-genuine)', 'Notification', 'Extended grace')[[int]$l.LicenseStatus]; channel = "$($l.ProductKeyChannel)"; description = "$($l.Description)"; partialKey = "$($l.PartialProductKey)" } }
  }
  if ($lic) { $cfg | Add-Member -NotePropertyName license -NotePropertyValue $lic -Force; $cfg | Add-Member -NotePropertyName licenseAt -NotePropertyValue (Get-Date).ToString('o') -Force }
} else { $lic = $cfg.license }
$wuHist = @(Try-Get {
  $se2 = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); $n2 = $se2.GetTotalHistoryCount()
  if ($n2 -gt 0) { $se2.QueryHistory(0, [Math]::Min($n2, 60)) | Where-Object { $_.Operation -eq 1 -and $_.Title } | Sort-Object Date -Descending | Select-Object -First 10 | ForEach-Object {
    [pscustomobject]@{ title = [string]$_.Title; date = $_.Date.ToUniversalTime().ToString('o'); result = @('Not started', 'In progress', 'Succeeded', 'Succeeded with errors', 'Failed', 'Aborted')[[int]$_.ResultCode] } } }
} @())
$au = Try-Get { (New-Object -ComObject Microsoft.Update.AutoUpdate).Results }
$wus = Try-Get { Get-Service wuauserv }
$osd = [ordered]@{ name = $os.Caption; version = $os.Version; build = $os.BuildNumber; ubr = $cv.UBR; displayVersion = $cv.DisplayVersion; edition = $cv.EditionID; arch = $os.OSArchitecture
  installDate = $os.InstallDate.ToString('yyyy-MM-dd'); lastBoot = $os.LastBootUpTime.ToUniversalTime().ToString('o'); activation = $lic }
# ---- ports, USB and open access (ITH-095)
$usbStart = Try-Get { (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR').Start }
$denyAll = Try-Get { (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices' -ErrorAction Stop).Deny_All }
$denyWrite = Try-Get { (Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}' -ErrorAction Stop).Deny_Write }
$usbDisks = @(Try-Get { Get-CimInstance Win32_DiskDrive | Where-Object { $_.InterfaceType -eq 'USB' } | ForEach-Object { [pscustomobject]@{ model = "$($_.Model)".Trim(); sizeGb = [math]::Round($_.Size / 1GB, 1); serial = "$($_.SerialNumber)".Trim() } } } @())
$removable = @(Try-Get { Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | ForEach-Object { $_.DeviceID } } @())
$cd = @(Try-Get { Get-CimInstance Win32_CDROMDrive } @()).Count
$ts = Try-Get { Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' }
$admins = @(Try-Get { Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop | ForEach-Object { "$($_.Name)" } } @())
if (-not $admins.Count) { $admins = @(Try-Get { ([ADSI]'WinNT://./Administrators,group').psbase.Invoke('Members') | ForEach-Object { $_.GetType().InvokeMember('Name', 'GetProperty', $null, $_, $null) } } @()) }
$guest = Try-Get { (Get-LocalUser | Where-Object { "$($_.SID)" -like '*-501' }).Enabled }
$shares = @(Try-Get { Get-SmbShare | Where-Object { -not $_.Special -and $_.Name -notmatch '\$$' } | ForEach-Object { "$($_.Name)" } } @())
$bt2 = @(Try-Get { Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction Stop } @()).Count
$smb = Try-Get { Get-SmbServerConfiguration }
$pol = Try-Get { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' }
$expl = Try-Get { Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer' -ErrorAction Stop }
$sb = Try-Get { Confirm-SecureBootUEFI -ErrorAction Stop }
$tpm = Try-Get { Get-Tpm -ErrorAction Stop }
$access = [ordered]@{
  usbStorage = if ($usbStart -eq 4 -or $denyAll -eq 1) { 'Blocked' } elseif ($denyWrite -eq 1) { 'Read only' } else { 'Allowed' }
  usbDisks = $usbDisks; removableDrives = $removable; cdDrives = $cd; bluetooth = ($bt2 -gt 0)
  rdpEnabled = if ($ts) { $ts.fDenyTSConnections -eq 0 } else { $null }
  localAdmins = @($admins | Select-Object -First 30); guestEnabled = $guest; shares = @($shares | Select-Object -First 30)
  autorunOff = if ($expl -and $expl.NoDriveTypeAutoRun -ge 255) { $true } elseif ($expl) { $false } else { $null }
  smb1 = if ($smb) { [bool]$smb.EnableSMB1Protocol } else { $null }
  uac = if ($pol) { $pol.EnableLUA -eq 1 } else { $null }
  screenLockSecs = if ($pol -and $pol.InactivityTimeoutSecs) { [int]$pol.InactivityTimeoutSecs } else { $null }
  secureBoot = $sb; tpm = if ($tpm) { [pscustomobject]@{ present = [bool]$tpm.TpmPresent; ready = [bool]$tpm.TpmReady } } else { $null }
}
# ---- this agent (ITH-097)
$tasks = [ordered]@{}
foreach ($tn in 'IT Hub Agent', 'IT Hub Agent Usage', 'IT Hub Agent Pulse') { $tasks[$tn] = Try-Get { "$((Get-ScheduledTask -TaskName $tn -ErrorAction Stop).State)" } 'Missing' }
$monRunning = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' }).Count -gt 0
$errs = @(Try-Get { Get-Content $LogFile -Tail 300 | Where-Object { $_ -match 'failed|error|rejected' -and $_ -ge (Get-Date).AddDays(-1).ToString('yyyy-MM-dd HH:mm') } } @())
$agentInfo = [ordered]@{ version = $AgentVersion; url = $cfg.url; tasks = $tasks; trayRunning = $monRunning; errors24h = $errs.Count; lastError = if ($errs.Count) { [string]$errs[-1] } else { $null }; installedAt = $cfg.installedAt; ps = "$($PSVersionTable.PSVersion)" }
$health = [ordered]@{
  hostname = $env:COMPUTERNAME; serial = "$($bios.SerialNumber)".Trim(); manufacturer = $cs.Manufacturer; model = $cs.Model; user = $cs.UserName
  platform = if ($isServer) { 'Server' } else { 'Workstation' }
  os = $osd
  uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
  cpu = @{ pct = $cpuPct; name = $cpuAll[0].Name; cores = ($cpuAll | Measure-Object NumberOfCores -Sum).Sum }
  mem = @{ totalGb = [math]::Round($memTot / 1MB, 1); usedPct = [math]::Round(($memTot - $memFree) * 100 / $memTot, 1) }
  disks = $disks; physicalDisks = $phys; battery = $battery
  security = @{ av = $av; bitlocker = $bitlocker; firewall = $fw }
  patches = @{ lastInstalled = $lastHotfix; lastTitle = $lastUpdTitle; pendingReboot = $pendingReboot; history = $wuHist
    lastSearch = if ($au -and $au.LastSearchSuccessDate) { $au.LastSearchSuccessDate.ToUniversalTime().ToString('o') } else { $null }
    service = if ($wus) { "$($wus.Status) / $($wus.StartType)" } else { $null } }
  access = $access
  agent = $agentInfo
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
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $cu = "$($cfg.url)/api/agent/v1/checkin"
  $r = Invoke-RestMethod -Method Post -Uri $cu -Headers (Sign-Headers $token 'POST' $cu $bytes) -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60 -UseBasicParsing
  if ($body.software) { $cfg | Add-Member -NotePropertyName softwareAt -NotePropertyValue (Get-Date).ToString('o') -Force }
  $cfg | Add-Member -NotePropertyName trackApps -NotePropertyValue ([bool]$r.trackApps) -Force
  $cfg | Add-Member -NotePropertyName trackUsage -NotePropertyValue ($r.trackUsage -ne $false) -Force
  $cfg | Add-Member -NotePropertyName lastCheckin -NotePropertyValue (Get-Date).ToString('o') -Force
  ($cfg | ConvertTo-Json) | Set-Content $ConfigFile -Encoding UTF8
  Log "Check-in OK: $($r.state)"
  if ($r.newToken) { Save-NewToken ([string]$r.newToken) }
  # tray / usage monitor closed by the user (e.g. Task Manager): start it again for signed-in users
  $mon = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ITHubAgent.ps1*-UsageMonitor*' })
  if (-not $mon.Count -and @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'").Count) { Start-ScheduledTask -TaskName 'IT Hub Agent Usage' -ErrorAction SilentlyContinue; Log 'Usage monitor was not running - restarted' }
  # keep the uninstaller current (admin-only removal that reports to IT)
  $unf = Join-Path $Root 'Uninstall-ITHubAgent.ps1'
  if (-not (Test-Path $unf) -or -not (Select-String -Path $unf -Pattern 'X-ITHub-Signature' -SimpleMatch -Quiet)) {
    try { $fu = "$($cfg.url)/api/agent/v1/files/Uninstall-ITHubAgent.ps1"; Invoke-WebRequest -Uri $fu -Headers (Sign-Headers $token 'GET' $fu $null) -OutFile $unf -UseBasicParsing -TimeoutSec 30; Log 'Uninstaller updated' } catch { Log "Uninstaller update failed: $($_.Exception.Message)" }
  }
  foreach ($icn in 'niytri.ico', 'tray.ico') {
    $ico = Join-Path $Root $icn
    if (-not (Test-Path $ico)) { try { $fu = "$($cfg.url)/api/agent/v1/files/$icn"; Invoke-WebRequest -Uri $fu -Headers (Sign-Headers $token 'GET' $fu $null) -OutFile $ico -UseBasicParsing -TimeoutSec 30; Log "Downloaded $icn" } catch { Log "Icon download failed ($icn): $($_.Exception.Message)" } }
  }
  $appKey3 = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent'
  if ((Test-Path $appKey3) -and (Test-Path (Join-Path $Root 'tray.ico'))) { Set-ItemProperty -Path $appKey3 -Name DisplayIcon -Value (Join-Path $Root 'tray.ico') -ErrorAction SilentlyContinue }
  # IT Hub moved to a new address (e.g. UAT -> production): switch only after the new address accepts this device's token
  if ($r.serverUrl -and $r.serverUrl -match '^https://' -and $r.serverUrl.TrimEnd('/') -ne $cfg.url) {
    $new = $r.serverUrl.TrimEnd('/')
    try {
      $nu = "$new/api/agent/v1/checkin"
      $null = Invoke-RestMethod -Method Post -Uri $nu -Headers (Sign-Headers $token 'POST' $nu $bytes) -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 60 -UseBasicParsing
      Log "IT Hub address changed: $($cfg.url) -> $new"
      $cfg.url = $new; ($cfg | ConvertTo-Json) | Set-Content $ConfigFile -Encoding UTF8
      $appKey2 = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ITHubAgent'; if (Test-Path $appKey2) { Set-ItemProperty -Path $appKey2 -Name URLInfoAbout -Value $new -ErrorAction SilentlyContinue }
    } catch { Log "New IT Hub address $new not reachable yet, staying on $($cfg.url): $($_.Exception.Message)" }
  }
  # self-update: IT Hub always holds the current agent; replace this script only if the download matches the published SHA-256
  if ($r.latestVersion -and $r.agentSha256 -and $r.latestVersion -ne $AgentVersion) {
    try {
      $tmp = Join-Path $Root 'ITHubAgent.new.ps1'
      $au = "$($cfg.url)/api/agent/v1/files/ITHubAgent.ps1"
      Invoke-WebRequest -Uri $au -Headers (Sign-Headers $token 'GET' $au $null) -OutFile $tmp -UseBasicParsing -TimeoutSec 60
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
  if ($code -eq 410) { Log 'Device removed in IT Hub - disabling agent tasks'; Disable-ScheduledTask -TaskName 'IT Hub Agent' -ErrorAction SilentlyContinue | Out-Null; Disable-ScheduledTask -TaskName 'IT Hub Agent Usage' -ErrorAction SilentlyContinue | Out-Null }
  exit 1
}
