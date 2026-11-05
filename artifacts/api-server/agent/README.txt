IT Hub device agent  (Windows 10/11, Windows Server 2016+)
=========================================================
Reports hardware / security health every 15 minutes and daily usage (active vs idle minutes, signed-in user,
minutes per foreground application) to IT Hub at __ITHUB_URL__.
It never collects keystrokes, screenshots, window titles, browsing history or file contents.

Every installation needs a valid IT Hub installation key (IT Hub > IT Assets > Device Health > Install agent):
  - Personal key (default): for one employee, installs ONE computer only; when issued for an asset it installs only on the
    computer with that asset's serial number. Expires in 1-30 days. Used / expired / disabled keys are refused by IT Hub.
  - Bulk key (administrators only): for Intune / SCCM rollouts to many devices; expires.
The agent updates itself: IT Hub always holds the current version and devices replace their copy after checking its SHA-256.

1) Employee / manual: IT downloads (or emails) the personal installer zip from IT Hub. Unzip it and double-click
   "Install IT Hub Agent.cmd" (asks for administrator rights). The key is in installation-key.txt.
   Or from an Administrator Command Prompt:   install.cmd ABCD-EFGH-JKLM-NPQR

2) Intune (Win32 app):
     - Download the BULK key installer zip from IT Hub, unzip, and wrap the folder:  IntuneWinAppUtil.exe -c <folder> -s install.cmd -o <out>
     - Install command:    install.cmd   (reads installation-key.txt)
     - Uninstall command:  powershell.exe -ExecutionPolicy Bypass -File Uninstall-ITHubAgent.ps1
     - Install behaviour:  System
     - Detection rule:     File  C:\ProgramData\ITHubAgent\ITHubAgent.ps1  exists
     - Assign to the device group(s).

3) SCCM / RMM tool / Group Policy start-up script (if used later):
     run  install.cmd  as SYSTEM from the bulk-key folder on a network share.

Check on a device:   Task Scheduler > "IT Hub Agent" and "IT Hub Agent Usage";  log: C:\ProgramData\ITHubAgent\agent.log
Run a check-in now:  schtasks /run /tn "IT Hub Agent"
Remove:              powershell -ExecutionPolicy Bypass -File C:\ProgramData\ITHubAgent\Uninstall-ITHubAgent.ps1
                     (and remove the device in IT Hub > Device Health)

Employee notice (DPDP): tell employees that IT records device health and how long the device is actively used
(including which applications are in use) for asset management and support. No content is recorded.
