@echo off
REM IT Hub agent installer for Intune (Win32 app), SCCM / RMM, or manual use (run as Administrator).
REM   install.cmd ABCD-EFGH-JKLM-NPQR      or put the key in installation-key.txt next to this file
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ITHubAgent.ps1" %1 %2
exit /b %ERRORLEVEL%
