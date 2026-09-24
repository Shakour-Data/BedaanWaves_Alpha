$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimePaths = @('C:\Python311', 'C:\Program Files\nodejs') | Where-Object { Test-Path $_ }
$env:PATH = (($runtimePaths + ($env:PATH -split ';')) | Select-Object -Unique) -join ';'
Set-Location $projectRoot
$loopArgs = if ($args.Count) { $args } else { @('-InitialDelayHours','1') }

# Array splatting of "-Name value" tokens is ambiguous in PowerShell, so build a
# hashtable for a named-parameter call (matches the param() block of the loop).
$loopParams = @{}
for ($i = 0; $i -lt $loopArgs.Count; $i += 2) {
    $name = $loopArgs[$i] -replace '^-', ''
    $loopParams[$name] = $loopArgs[$i + 1]
}
& "$projectRoot\scripts\auto-refresh-loop.ps1" @loopParams
exit $LASTEXITCODE
