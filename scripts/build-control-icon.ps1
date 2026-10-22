[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $projectRoot 'desktop/assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
# Keep the geometry identical to public/favicon.svg, on a 64-unit grid.
$frames = @()
foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 64.0), ($size / 64.0))
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tile.AddArc(2, 2, 26, 26, 180, 90)
    $tile.AddArc(36, 2, 26, 26, 270, 90)
    $tile.AddArc(36, 36, 26, 26, 0, 90)
    $tile.AddArc(2, 36, 26, 26, 90, 90)
    $tile.CloseFigure()
    $green = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#216B55'))
    $gold = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#F5D982'))
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.FillPath($green, $tile)
    $graphics.DrawArc($pen, 15, 19, 30, 30, -45, 270)
    $graphics.DrawLine($pen, 30, 17, 30, 33)
    $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(49, 8), [System.Drawing.PointF]::new(51.5, 14.5),
        [System.Drawing.PointF]::new(58, 17), [System.Drawing.PointF]::new(51.5, 19.5),
        [System.Drawing.PointF]::new(49, 26), [System.Drawing.PointF]::new(46.5, 19.5),
        [System.Drawing.PointF]::new(40, 17), [System.Drawing.PointF]::new(46.5, 14.5))
    $graphics.FillPolygon($gold, $points)
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += ,@{ Size = $size; Bytes = $stream.ToArray() }
    if ($size -eq 256) { $bitmap.Save((Join-Path $assets 'groupware-control.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
    $stream.Dispose(); $pen.Dispose(); $gold.Dispose(); $green.Dispose(); $tile.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$file = [System.IO.File]::Create((Join-Path $assets 'groupware-control.ico'))
$writer = New-Object System.IO.BinaryWriter($file)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
        $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
} finally { $writer.Dispose(); $file.Dispose() }
Copy-Item -LiteralPath (Join-Path $assets 'groupware-control.ico') -Destination (Join-Path $projectRoot 'public/favicon.ico') -Force
Write-Output 'Built 7 icon sizes (16-256 px), preview PNG, and favicon.ico.'
