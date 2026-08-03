# Rebuilds app.css on change and serves app/ on http://localhost:8080
#
#     tools\watch.ps1
#
# What this gets you is layout and styling. It does NOT get you data: the API is
# same-origin at ../ relative to the app, so a local static server has nothing to
# talk to, and the login screen will report that it cannot reach the server.
# That is expected. Verify anything data-shaped against the real deployment.

param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root "tools\tailwindcss.exe"

if (-not (Test-Path $cli)) {
    throw "Tailwind CLI not found. Run tools\fetch-tools.ps1 first."
}

$watcher = Start-Process -FilePath $cli -PassThru -NoNewWindow -ArgumentList @(
    "-i", (Join-Path $root "src\input.css"),
    "-o", (Join-Path $root "app\assets\app.css"),
    "--watch"
)

try {
    Write-Host "Serving $root\app on http://localhost:$Port  (Ctrl+C to stop)"
    python -m http.server $Port --directory (Join-Path $root "app")
}
finally {
    if ($watcher -and -not $watcher.HasExited) { $watcher.Kill() }
}
