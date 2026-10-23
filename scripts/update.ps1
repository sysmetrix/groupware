[CmdletBinding()]
param([switch]$NoShortcut)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
function Assert-ControlPanelClosed {
    $exe = Join-Path (Split-Path -Parent $PSScriptRoot) 'data/control-panel/GroupwareControl.exe'
    if (Test-Path -LiteralPath $exe) {
        try {
            $handle = [System.IO.File]::Open($exe, 'Open', 'ReadWrite', 'None')
            $handle.Dispose()
        } catch {
            throw "Cannot replace '$exe'. Close Groupware AI Control using its close-window-only button, then rerun scripts/update.ps1. If already closed, check file permissions or another file lock. No services were stopped. Details: $($_.Exception.Message)"
        }
    }
}
Assert-ControlPanelClosed
$changes = & git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Not a Git checkout.' }
if ($changes) { throw 'Commit or move local code changes before updating. Local data/config are ignored.' }
$upstream = & git rev-parse --abbrev-ref '@{u}'
if ($LASTEXITCODE -ne 0) { throw 'Set a tracking branch first.' }
& git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'GitHub fetch failed.' }
& git merge --ff-only $upstream
if ($LASTEXITCODE -ne 0) { throw 'Update requires review: branch histories diverged.' }
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
& npm.cmd run setup:documents
if ($LASTEXITCODE -ne 0) { throw 'Document setup failed. Install Python 3.14 and try again.' }
& npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax checks failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Do not restart with this version.' }
Assert-ControlPanelClosed
try {
    & (Join-Path $PSScriptRoot 'install-control-panel.ps1') -NoShortcut:$NoShortcut
} catch {
    throw "Code was updated, but control panel installation failed. Close Groupware AI Control, resolve the error below, then run powershell -NoProfile -File scripts/install-control-panel.ps1 to finish. The Windows .NET Framework C# compiler and a writable Desktop folder are required. Details: $($_.Exception.Message)"
}
if ($NoShortcut) { Write-Host 'Updated, including Groupware AI Control; desktop shortcut unchanged (-NoShortcut). Restart manually to use the new code. Local settings and data were preserved.' }
else { Write-Host 'Updated, including Groupware AI Control and its desktop shortcut. Restart the application manually to use the new code. Local settings and data were preserved.' }
