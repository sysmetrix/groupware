$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$testRoot = Join-Path $repo ('data\autostart-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $testRoot 'scripts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'src') -Destination $testRoot -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'public') -Destination $testRoot -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'scripts\windows-autostart.ps1') -Destination (Join-Path $testRoot 'scripts\windows-autostart.ps1')
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
[IO.File]::WriteAllText((Join-Path $testRoot '.env'), "PORT=$port`nDATA_DIR=./data`n", [Text.UTF8Encoding]::new($false))
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($testRoot.ToLowerInvariant())))).Replace('-', '').Substring(0, 12) } finally { $sha.Dispose() }
$taskName = "GroupwareAssistant-$suffix"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Verification task already exists.' }
$registered = $false
try {
    & (Join-Path $testRoot 'scripts\windows-autostart.ps1')
    $registered = $true
    $task = Get-ScheduledTask -TaskName $taskName
    if ($task.Triggers[0].CimClass.CimClassName -ne 'MSFT_TaskLogonTrigger') { throw 'Unexpected trigger type' }
    if ($task.Principal.LogonType -ne 'Interactive' -or $task.Principal.RunLevel -ne 'Limited') { throw 'Unexpected execution identity' }
    Start-ScheduledTask -TaskName $taskName
    $response = $null
    for ($i = 0; $i -lt 30; $i++) {
        try { $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 1; break } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $response -or $response.source.kind -ne 'demo' -or $response.liveConnected -ne $false) { throw 'Scheduled server did not serve synthetic status' }
    Write-Host 'PASS: registration, interactive limited identity, logon trigger, scheduled launch, synthetic HTTP response.'
    Write-Host 'An actual sign-out/sign-in was NOT performed.'
} finally {
    if ($registered) {
        try { Stop-ScheduledTask -TaskName $taskName } finally { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        Write-Host "Removed verification task: $taskName"
    }
    Write-Host "Synthetic verification files retained at: $testRoot"
}
