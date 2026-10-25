$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $workspace 'var/postgres/connection.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$dataPath = [IO.Path]::GetFullPath((Join-Path $workspace 'var/postgres/data'))
if (-not $dataPath.StartsWith([IO.Path]::GetFullPath($workspace) + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected cluster path' }
$ctl = Join-Path $config.bin 'pg_ctl.exe'
& $ctl -D $dataPath -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'Database stop failed or database was not running' }
