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

# Stamp the output even when the build produced identical bytes.
#
# Tailwind skips the write when nothing changed, which is correct of it and
# fatal for publish.ps1: that guard compares mtimes, so editing a .js file that
# contains no class names left app.css permanently "older than" a source it did
# not depend on, and no amount of rebuilding could clear it. The guard's real
# question is "has a build been run since the sources changed", and this is what
# makes the answer truthful.
$css.LastWriteTime = Get-Date
Write-Host ("Built {0} ({1:N1} KB)" -f $css.FullName, ($css.Length / 1KB))
