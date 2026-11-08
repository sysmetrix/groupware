param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$runtimePath = Join-Path $projectRoot 'data/runtime/ollama-0.40.8/ollama.exe'
if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'Install the verified local runtime first. See docs/local-model.md.' }
if (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 11434 is already in use. Keep the existing service or stop it explicitly.' }
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_MODELS = Join-Path $projectRoot 'data/models'
$env:OLLAMA_NO_CLOUD = '1'
$env:OLLAMA_CONTEXT_LENGTH = '8192'
$env:OLLAMA_NUM_PARALLEL = '1'
& $runtimePath serve
exit $LASTEXITCODE
