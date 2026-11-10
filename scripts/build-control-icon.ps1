[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'src/live/ext'
$assets = Join-Path $root 'desktop/assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$sizes = @(16,32,48,128,256)
$frames = foreach ($n in $sizes) { $p = Join-Path $src "icon$n.png"; if (!(Test-Path $p)) { throw "Missing icon: $p" }; @{ Size = $n; Bytes = [IO.File]::ReadAllBytes($p) } }
$file = [IO.File]::Create((Join-Path $assets 'groupware-control.ico'))
$writer = [IO.BinaryWriter]::new($file)
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $d = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
    $writer.Write([byte]$d); $writer.Write([byte]$d); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset); $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose(); $file.Dispose() }
Copy-Item (Join-Path $src 'icon256.png') (Join-Path $assets 'groupware-control.png') -Force
Copy-Item (Join-Path $src 'brand.svg') (Join-Path $root 'public/favicon.svg') -Force
Copy-Item (Join-Path $assets 'groupware-control.ico') (Join-Path $root 'public/favicon.ico') -Force
Write-Output 'Built GW assistant icons from the canonical brand assets.'
