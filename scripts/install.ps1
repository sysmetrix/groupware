$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
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
Write-Host 'Ready. Run npm start, then open http://127.0.0.1:3210'
