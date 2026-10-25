$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$processFile = Join-Path $serviceRoot 'var/service-processes.json'
if (-not (Test-Path -LiteralPath $processFile)) { Write-Output 'No service process record.'; exit 0 }
$record = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
$supervisor = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$record.supervisor)"
if (-not $supervisor) { Write-Output 'Recorded service is already stopped.'; exit 0 }
if ($supervisor.Name -ne 'node.exe' -or $supervisor.CommandLine -notmatch 'scripts[/\\]dev\.mjs') {
    throw 'Process identity does not match this service; no process was stopped.'
}
if (-not $record.startedAt -or [Math]::Abs((([datetime]$supervisor.CreationDate).ToUniversalTime() - ([datetime]$record.startedAt).ToUniversalTime()).TotalSeconds) -gt 30) {
    throw 'Process start time does not match; no process was stopped.'
}
& taskkill.exe /PID ([string]$record.supervisor) /T /F
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the service process tree.' }
Remove-Item -LiteralPath $processFile
