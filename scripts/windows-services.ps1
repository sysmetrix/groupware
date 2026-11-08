[CmdletBinding()]
param(
    [ValidateSet('Status', 'Start', 'Stop', 'UnloadModel', 'Supervise')][string]$Action = 'Status',
    [ValidateSet('All', 'App', 'Ollama')][string]$Service = 'All',
    [ValidateRange(1, 65535)][int]$AppPort = 3210,
    [ValidateRange(1, 65535)][int]$OllamaPort = 11434,
    [string]$Model,
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 30,
    [string]$LaunchId
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-StrictMode -Version Latest
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$scriptPath = $PSCommandPath
$stateDir = Join-Path $projectRoot 'data/runtime-control'
$powershellPath = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $powershellPath)) { throw 'Run with Windows PowerShell 5.1 (powershell.exe).' }

function Get-StatePath([string]$Name) { Join-Path $stateDir ($Name.ToLowerInvariant() + '.json') }
function Read-State([string]$Name) {
    $path = Get-StatePath $Name
    if (Test-Path -LiteralPath $path) {
        # Writers publish by atomic replacement. Keep the opened snapshot readable
        # while allowing that replacement; Get-Content can deny it on Windows.
        $sharing = [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete
        $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, $sharing)
        try {
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
            try { $record = $reader.ReadToEnd() | ConvertFrom-Json }
            finally { $reader.Dispose() }
        } finally { $stream.Dispose() }
        if ($record.version -ne 1 -or $record.root -ne $projectRoot -or $record.service -ne $Name -or
            $record.launchId -notmatch '^[a-f0-9]{32}$') { throw "Invalid ownership record: $path. Refusing control." }
        return $record
    }
    return $null
}
function Write-State($Record) {
    $path = Get-StatePath $Record.service
    $temp = "$path.$($Record.launchId).tmp"
    [IO.File]::WriteAllText($temp, ($Record | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temp, $path, [NullString]::Value) }
    else { [IO.File]::Move($temp, $path) }
}
function Get-Identity([int]$ProcessId) {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    try {
        return [pscustomobject]@{ pid = $ProcessId; path = $process.Path; started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
    } finally { $process.Dispose() }
}
function Test-Identity($Identity) {
    if ($null -eq $Identity) { return $false }
    try {
        $actual = Get-Identity ([int]$Identity.pid)
        return $actual.path -eq $Identity.path -and $actual.started -eq $Identity.started -and [bool]$actual.path
    } catch { return $false }
}
function Test-Supervisor($Record) {
    if (-not (Test-Identity $Record.supervisor) -or $Record.supervisor.path -ne $powershellPath) { return $false }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($Record.supervisor.pid)" -ErrorAction Stop
    return $null -ne $cim -and $cim.CommandLine.Contains('"' + $scriptPath + '"') -and
        $cim.CommandLine.Contains('-Action Supervise') -and $cim.CommandLine.Contains($Record.launchId)
}
function Get-Listeners([int]$Port) {
    # Enumerate first: errors must not be mistaken for an available port.
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $Port)
}
function Test-Listener($Record) {
    $listeners = @(Get-Listeners $Record.port)
    return $listeners.Count -gt 0 -and @($listeners | Where-Object OwningProcess -ne $Record.child.pid).Count -eq 0
}
function Get-EventName($Record) { 'Local\GroupwareRuntime-' + $Record.launchId }
function Stop-Owned($Record) {
    if (-not (Test-Supervisor $Record)) {
        throw "Cannot verify $($Record.service) supervisor PID/path/start time/command. No process was signalled."
    }
    # Signal a unique launch event, never terminate a PID found by name or port.
    $event = [Threading.EventWaitHandle]::OpenExisting((Get-EventName $Record))
    try { [void]$event.Set() } finally { $event.Dispose() }
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ((Test-Identity $Record.supervisor) -or (Test-Identity $Record.child)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Stop timed out; ownership retained. No global kill attempted.' }
        Start-Sleep -Milliseconds 150
    }
}

if ($Action -eq 'Supervise') {
    if ($Service -eq 'All' -or $LaunchId -notmatch '^[a-f0-9]{32}$') { throw 'Supervise is an internal launch action.' }
    $record = Read-State $Service
    if ($null -eq $record -or $record.launchId -ne $LaunchId -or $record.phase -ne 'pending') { throw 'Missing matching pending launch.' }
    # A suspended child is assigned before its first instruction. Descendants inherit
    # this job; closing the sole handle kills the entire tree, even after a crash.
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public sealed class GroupwareJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long PerProcess, PerJob; public uint Flags;
        public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong A,B,C,D,E,F; }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public int cb; public string reserved, desktop, title;
        public int x,y,xs,ys,xc,yc,fill,flags; public short show, reserved2;
        public IntPtr bytes, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a, string n);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j, int c, ref Extended i, int s);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref Startup si, out ProcessInfo pi);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr t);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr p, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    IntPtr job;
    public GroupwareJob() {
        job = CreateJobObject(IntPtr.Zero, null);
        if(job == IntPtr.Zero) throw new Win32Exception();
        var info = new Extended(); info.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway
        if(!SetInformationJobObject(job, 9, ref info, Marshal.SizeOf(info))) {
            var error = new Win32Exception(); Dispose(); throw error;
        }
    }
    public int Launch(string executable, string arguments, string cwd) {
        var si = new Startup(); si.cb = Marshal.SizeOf(si); ProcessInfo pi;
        if(!CreateProcess(executable, new StringBuilder("\"" + executable + "\" " + arguments), IntPtr.Zero, IntPtr.Zero, false, 0x08000004, IntPtr.Zero, cwd, ref si, out pi)) throw new Win32Exception();
        try {
            if(!AssignProcessToJobObject(job, pi.process) || ResumeThread(pi.thread) == 0xffffffff) {
                var error = new Win32Exception(); TerminateProcess(pi.process, 1); throw error;
            }
            return (int)pi.pid;
        } finally { CloseHandle(pi.thread); CloseHandle(pi.process); }
    }
    public void Dispose() { if(job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; } }
}
'@
    $event = $null
    $job = $null
    try {
        $created = $false
        $event = [Threading.EventWaitHandle]::new($false, [Threading.EventResetMode]::ManualReset, (Get-EventName $record), [ref]$created)
        if (-not $created) { throw 'Launch event already exists.' }
        $record.supervisor = Get-Identity $PID
        $record.phase = 'starting'
        Write-State $record
        if (@(Get-Listeners $record.port).Count) { throw "Port $($record.port) is already in use." }
        if ($Service -eq 'App') {
            $env:PORT = [string]$record.port
            $env:OLLAMA_BASE_URL = "http://127.0.0.1:$OllamaPort"
        } else {
            $env:OLLAMA_HOST = "127.0.0.1:$($record.port)"
            $env:OLLAMA_MODELS = Join-Path $projectRoot 'data/models'
            $env:OLLAMA_NO_CLOUD = '1'
            $env:OLLAMA_CONTEXT_LENGTH = '8192'
            $env:OLLAMA_NUM_PARALLEL = '1'
        }
        $job = [GroupwareJob]::new()
        $childId = $job.Launch($record.executable, $record.arguments, $projectRoot)
        $record.child = Get-Identity $childId
        Write-State $record
        $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        while (-not $event.WaitOne(200)) {
            if (-not (Test-Identity $record.child)) { throw 'Owned child exited.' }
            if ($record.phase -eq 'starting') {
                if (Test-Listener $record) { $record.phase = 'running'; Write-State $record }
                elseif ([DateTime]::UtcNow -gt $deadline) { throw 'Timed out waiting for owned listener.' }
            }
        }
        $record.phase = 'stopped'
    } catch {
        $record.phase = 'failed'
        $record.error = $_.Exception.Message
    } finally {
        if ($null -ne $job) { $job.Dispose() }
        if ($null -ne $event) { $event.Dispose() }
        Write-State $record
    }
    exit
}

# Serialize controllers for this checkout without modifying any login tasks.
$sha = [Security.Cryptography.SHA256]::Create()
try { $key = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-', '') }
finally { $sha.Dispose() }
$mutex = [Threading.Mutex]::new($false, "Local\GroupwareRuntime-$key")
$locked = $false
$started = @()
try {
    try { $locked = $mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another runtime controller is busy; retry later.' }
    $names = if ($Service -eq 'All') { @('Ollama', 'App') } else { @($Service) }
    if ($Action -eq 'Status') {
        $rows = foreach ($name in $names) {
            $record = Read-State $name
            $port = if ($null -ne $record) { $record.port } elseif ($name -eq 'App') { $AppPort } else { $OllamaPort }
            $listeners = @(Get-Listeners $port)
            $verified = $null -ne $record -and (Test-Supervisor $record)
            $state = if ($verified -and (Test-Identity $record.child) -and (Test-Listener $record)) { 'running-owned' }
                elseif ($verified) { 'starting-or-exited-owned' }
                elseif ($listeners.Count) { 'unmanaged-listener' }
                elseif ($null -ne $record) { 'stale-or-stopped' } else { 'stopped' }
            [pscustomobject]@{ service = $name; status = $state; port = $port; listenerPids = @($listeners | ForEach-Object OwningProcess); owned = $verified; record = Get-StatePath $name }
        }
        ConvertTo-Json -InputObject @($rows) -Depth 4
    } elseif ($Action -eq 'Stop') {
        foreach ($name in @($names | Sort-Object)) {
            $record = Read-State $name
            if ($null -eq $record) { Write-Output "$name has no ownership record; unmanaged processes left untouched."; continue }
            if (Test-Supervisor $record) { Stop-Owned $record; Write-Output "Stopped owned $name launch." }
            elseif ((Test-Identity $record.child) -or (Test-Identity $record.supervisor)) { throw "$name ownership mismatch; refusing control." }
            else { Write-Output "$name record is stale or stopped; no process signalled." }
        }
    } elseif ($Action -eq 'UnloadModel') {
        if ($Service -eq 'App' -or [string]::IsNullOrWhiteSpace($Model)) { throw 'UnloadModel requires -Model <installed-model> and Service Ollama or All.' }
        $record = Read-State 'Ollama'
        if ($null -eq $record -or -not (Test-Supervisor $record) -or -not (Test-Identity $record.child) -or -not (Test-Listener $record)) {
            throw 'Unload refused: no verified project-owned Ollama listener.'
        }
        $body = @{ model = $Model; keep_alive = 0; stream = $false } | ConvertTo-Json
        $loaded = Invoke-RestMethod -Uri "http://127.0.0.1:$($record.port)/api/ps" -TimeoutSec $TimeoutSeconds -MaximumRedirection 0
        if (-not @($loaded.models | Where-Object { $_.name -eq $Model -or $_.name -eq ($Model + ':latest') }).Count) {
            throw 'The requested model is not loaded; no unload request was sent.'
        }
        Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($record.port)/api/generate" -ContentType 'application/json' -Body $body -TimeoutSec $TimeoutSeconds -MaximumRedirection 0 | ConvertTo-Json -Depth 6
    } elseif ($Action -eq 'Start') {
        if ($Service -eq 'All' -and $AppPort -eq $OllamaPort) { throw 'App and Ollama ports must differ.' }
        $plans = @()
        # Preflight every requested service before starting any of them.
        foreach ($name in $names) {
            $old = Read-State $name
            if ($null -ne $old -and ((Test-Identity $old.supervisor) -or (Test-Identity $old.child))) {
                throw "$name has a live recorded process; use Status/Stop before Start."
            }
            $port = if ($name -eq 'App') { $AppPort } else { $OllamaPort }
            if (@(Get-Listeners $port).Count) { throw "Port $port is already in use; refusing to adopt or replace its listener." }
            $executable = if ($name -eq 'App') { (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source } else { Join-Path $projectRoot 'data/runtime/ollama-0.40.8/ollama.exe' }
            if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Missing executable: $executable. See docs/local-model.md." }
            if ($name -eq 'App' -and -not (Test-Path -LiteralPath (Join-Path $projectRoot 'src/server.mjs'))) { throw 'Missing src/server.mjs.' }
            $plans += [pscustomobject]@{ version = 1; root = $projectRoot; service = $name; port = $port; launchId = [Guid]::NewGuid().ToString('N');
                executable = $executable; arguments = $(if ($name -eq 'App') { '--env-file-if-exists=.env src/server.mjs' } else { 'serve' });
                supervisor = $null; child = $null; phase = 'pending'; error = $null }
        }
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
        foreach ($plan in $plans) {
            Write-State $plan
            $argsLine = '-NoProfile -NonInteractive -File "{0}" -Action Supervise -Service {1} -LaunchId {2} -OllamaPort {3} -TimeoutSeconds {4}' -f $scriptPath, $plan.service, $plan.launchId, $OllamaPort, $TimeoutSeconds
            $launcher = Start-Process -FilePath $powershellPath -ArgumentList $argsLine -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir "$($plan.service).out.log") -RedirectStandardError (Join-Path $stateDir "$($plan.service).err.log")
            try {
                $started += $plan.service
                $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds + 10)
                do {
                    Start-Sleep -Milliseconds 200
                    $current = Read-State $plan.service
                    if ($current.phase -eq 'failed') { throw "$($plan.service): $($current.error)" }
                    if ($launcher.HasExited) { throw "$($plan.service) supervisor exited; inspect data/runtime-control/*.err.log." }
                    if ([DateTime]::UtcNow -gt $deadline) { throw "$($plan.service) start timed out." }
                } until ($current.phase -eq 'running')
                if (-not (Test-Supervisor $current) -or -not (Test-Identity $current.child) -or -not (Test-Listener $current)) { throw 'Startup ownership verification failed.' }
                Write-Output "Started owned $($plan.service) on 127.0.0.1:$($plan.port)."
            } finally { $launcher.Dispose() }
        }
    }
} catch {
    $failure = $_
    foreach ($name in $started) {
        try { $record = Read-State $name; if (Test-Supervisor $record) { Stop-Owned $record } }
        catch { Write-Warning "Rollback for $name could not be verified: $($_.Exception.Message)" }
    }
    throw $failure
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
