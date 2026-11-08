param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-', '').Substring(0, 12) } finally { $sha.Dispose() }
$taskName = "GroupwareAssistant-$suffix"
if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
    Write-Host "Removed: $taskName"
    exit
}
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw "Task already exists: $taskName. Use -Remove before replacing it." }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Run npm run setup first.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $nodePath -Argument '--env-file-if-exists=.env src/server.mjs' -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local groupware export processing. No password stored.' | Out-Null
Write-Host "Registered: $taskName. Starts on next login. Keep the PC awake for scheduled reports."
