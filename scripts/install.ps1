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
            throw "Cannot replace '$exe'. Close Groupware AI Control using its close-window-only button, then rerun scripts/install.ps1. If already closed, check file permissions or another file lock. No services were stopped. Details: $($_.Exception.Message)"
        }
    }
}
Assert-ControlPanelClosed
foreach ($command in @('git', 'node', 'npm.cmd')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required. Install Git and Node.js 24+, then reopen PowerShell." }
}
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
& npm.cmd run setup
if ($LASTEXITCODE -ne 0) { throw 'Setup failed.' }
& npm.cmd run setup:documents
if ($LASTEXITCODE -ne 0) { throw 'Document setup failed. Install Python 3.14 and try again.' }
& npm.cmd run doctor
if ($LASTEXITCODE -ne 0) { throw 'Doctor failed. Review the checks above.' }
Assert-ControlPanelClosed
try {
    & (Join-Path $PSScriptRoot 'install-control-panel.ps1') -NoShortcut:$NoShortcut
} catch {
    throw "Control panel installation failed. Close Groupware AI Control, resolve the error below, then rerun scripts/install.ps1. The Windows .NET Framework C# compiler and a writable Desktop folder are required. Details: $($_.Exception.Message)"
}
Write-Host 'Ready. Open the Groupware AI Control desktop shortcut to start the application, or run npm start and open http://127.0.0.1:3210. Local settings and data were preserved.'
