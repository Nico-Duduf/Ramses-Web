# Builds app/assets/app.css from src/input.css.
#
# The output is a committed artifact: there is no build step on the server, so
# whatever is in git is what gets served. Rebuild and commit whenever a class
# name changes in app/.

param([switch]$NoMinify)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root "tools\tailwindcss.exe"

if (-not (Test-Path $cli)) {
    throw "Tailwind CLI not found. Run tools\fetch-tools.ps1 first."
}

$argv = @("-i", (Join-Path $root "src\input.css"),
          "-o", (Join-Path $root "app\assets\app.css"))
if (-not $NoMinify) { $argv += "--minify" }

& $cli @argv
if ($LASTEXITCODE -ne 0) { throw "Tailwind build failed with exit code $LASTEXITCODE." }

$css = Get-Item (Join-Path $root "app\assets\app.css")
Write-Host ("Built {0} ({1:N1} KB)" -f $css.FullName, ($css.Length / 1KB))
