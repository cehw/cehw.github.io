param(
    [ValidateSet('help', 'preview', 'test', 'gallery-check', 'gallery-build', 'weather-fetch', 'weather-sync', 'gnn-status')]
    [string]$Task = 'help',
    [int]$Port = 8765
)
$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $siteRoot
try {
    switch ($Task) {
        'help' {
            Write-Output 'Tasks: preview, test, gallery-check, gallery-build, weather-fetch, weather-sync, gnn-status'
            Write-Output 'Guide: docs/README.md. Preview binds to localhost; Ctrl+C stops it.'
        }
        'preview' { & python -X utf8 -m http.server $Port --bind 127.0.0.1 }
        'test' {
            & node --test 'tests/*.test.mjs'
            if ($LASTEXITCODE -ne 0) { throw 'JavaScript tests failed' }
            & python -X utf8 -B -m unittest discover -s tests -p 'test_*.py'
        }
        'gallery-check' { & python -X utf8 -B scripts/gallery/validate_meta.py }
        'gallery-build' {
            & python -X utf8 -B scripts/gallery/generate_meta.py
            if ($LASTEXITCODE -ne 0) { throw 'Gallery metadata build failed' }
            & python -X utf8 -B scripts/gallery/generate_thumbs.py
            if ($LASTEXITCODE -ne 0) { throw 'Gallery thumbnail build failed' }
            & python -X utf8 -B scripts/gallery/validate_meta.py
        }
        'weather-fetch' {
            & node scripts/weather/update-weather.mjs --output (Join-Path $siteRoot '_tmp/weather.json')
        }
        'gnn-status' {
            & ssh climet3 'cd /workspace/wanghan/personal/weather && cat output/gnn.json && tail -n 15 logs/run.log'
        }
        'weather-sync' { & python -X utf8 -B scripts/weather/sync-archive.py }
    }
    if ($Task -ne 'help' -and $LASTEXITCODE -ne 0) { throw "Task failed: $Task (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
