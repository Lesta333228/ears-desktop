$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$electronDist = Join-Path $projectRoot 'node_modules/electron/dist'
if (-not (Test-Path (Join-Path $electronDist 'electron.exe'))) {
    throw 'Run npm install on Windows x64 before packaging.'
}
$outputRoot = Join-Path $projectRoot 'dist'
$releaseFolder = Join-Path $outputRoot 'Ears-Desktop-1.0.0-Windows-x64'
if (Test-Path -LiteralPath $releaseFolder) {
    throw 'Release directory already exists. Rename it before rebuilding.'
}
New-Item -ItemType Directory -Path $releaseFolder -Force | Out-Null
Copy-Item -Path (Join-Path $electronDist '*') -Destination $releaseFolder -Recurse
Rename-Item -LiteralPath (Join-Path $releaseFolder 'electron.exe') -NewName 'Ears Desktop.exe'
$appDestination = Join-Path $releaseFolder 'resources/app'
New-Item -ItemType Directory -Path $appDestination -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'resources/app') |
    Where-Object { $_.Name -notmatch '^(self-test|route-test|\.publish-capture)' } |
    Copy-Item -Destination $appDestination -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/guide.pdf') -Destination (Join-Path $releaseFolder 'Ears Desktop Guide.pdf')
Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $releaseFolder
$archivePath = Join-Path $outputRoot 'Ears-Desktop-1.0.0-Windows-x64.zip'
if (Test-Path -LiteralPath $archivePath) { throw 'Release ZIP already exists. Rename it before rebuilding.' }
Compress-Archive -LiteralPath $releaseFolder -DestinationPath $archivePath -CompressionLevel Optimal
Write-Output $archivePath
