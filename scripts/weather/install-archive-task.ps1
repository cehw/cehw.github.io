$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$python = Join-Path (Split-Path (Get-Command python.exe).Source -Parent) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'pythonw.exe is required for background sync without a console window' }
$script = Join-Path $PSScriptRoot 'sync-archive.py'
$action = New-ScheduledTaskAction -Execute $python -Argument ('-X utf8 "{0}"' -f $script) -WorkingDirectory $siteRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Personal Weather Archive Sync' -Description 'Pull HKO observations and website archives from climet3 every 10 minutes; catch up after downtime.' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Select-Object TaskName, State
