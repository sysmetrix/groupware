[CmdletBinding()]
param([switch]$NoShortcut)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework C# compiler is required.' }
$output = Join-Path $projectRoot 'data/control-panel'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$exe = Join-Path $output 'GroupwareControl.exe'
& $compiler /nologo /target:winexe /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Core.dll "/win32icon:$(Join-Path $projectRoot 'desktop/assets/groupware-control.ico')" "/out:$exe" (Join-Path $projectRoot 'desktop/GroupwareControl.cs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Close the control panel before rebuilding.' }
if (-not $NoShortcut) {
    $desktop = [Environment]::GetFolderPath('DesktopDirectory')
    $shell = New-Object -ComObject WScript.Shell
    # ASCII name avoids Windows PowerShell 5.1 source-code encoding dependencies.
    $shortcut = $shell.CreateShortcut((Join-Path $desktop 'Groupware AI Control.lnk'))
    $shortcut.TargetPath = $exe
    $shortcut.IconLocation = "$exe,0"
    $shortcut.Arguments = '--root "' + $projectRoot + '"'
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = 'Start and stop local LLM and Groupware Assistant'
    $shortcut.Save()
    Write-Output "Desktop shortcut: $desktop\Groupware AI Control.lnk"
}
Write-Output "Built: $exe"
