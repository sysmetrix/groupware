$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
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
& npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Syntax checks failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Do not restart with this version.' }
Write-Host 'Updated. Restart the application to use the new code. Local settings and data were preserved.'
