<#
.SYNOPSIS
    One-shot SYSTEM-environment validation for the auto-refresh pipeline.

.CREATED_FOR
    Confirms node/npx/python PATH and Prisma DB access run correctly under
    the SYSTEM account used by the scheduled task.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:PATH = ((@('C:\Python311','C:\Program Files\nodejs') | Where-Object { Test-Path $_ }) + ($env:PATH -split ';')) -join ';'
Set-Location $root

$out = "$root\.kilo\state\sys-validation.log"
"=== SYS VALIDATION $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $out -Encoding utf8
"whoami: $(whoami)" | Out-File -FilePath $out -Append -Encoding utf8
$tsx = "$root\node_modules\.bin\tsx"
"node: $(node -v 2>&1)" | Out-File -FilePath $out -Append -Encoding utf8
"python: $(python --version 2>&1)" | Out-File -FilePath $out -Append -Encoding utf8
"tsx: $(& $tsx --version 2>&1)" | Out-File -FilePath $out -Append -Encoding utf8
"DATABASE_URL: $((Get-Content .env -ErrorAction SilentlyContinue | Where-Object { $_ -match 'DATABASE_URL' }).Trim())" | Out-File -FilePath $out -Append -Encoding utf8
"--- check_db output ---" | Out-File -FilePath $out -Append -Encoding utf8
try {
    $r = & $tsx scripts/check_db.ts 2>&1
    $r | Out-File -FilePath $out -Append -Encoding utf8
    "check_db exit: OK" | Out-File -FilePath $out -Append -Encoding utf8
} catch {
    "check_db FAILED: $($_.Exception.Message)" | Out-File -FilePath $out -Append -Encoding utf8
}
"=== END $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $out -Append -Encoding utf8
