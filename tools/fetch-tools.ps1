# Downloads the Tailwind standalone CLI, and re-vendors Alpine.js.
#
# Run once after cloning. The CLI is 108 MB and gitignored on purpose; Alpine is
# small and IS committed, so this only re-fetches it when you want a new version.
#
#     tools\fetch-tools.ps1
#     tools\fetch-tools.ps1 -TailwindVersion 4.3.3 -AlpineVersion 3.15.12

param(
    [string]$TailwindVersion = "4.3.3",
    [string]$AlpineVersion = "3.15.12",
    [switch]$Alpine
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$cli = Join-Path $root "tools\tailwindcss.exe"
if (Test-Path $cli) {
    Write-Host "Tailwind CLI already present: $cli"
} else {
    $url = "https://github.com/tailwindlabs/tailwindcss/releases/download/v$TailwindVersion/tailwindcss-windows-x64.exe"
    Write-Host "Downloading Tailwind $TailwindVersion (about 108 MB)..."
    Invoke-WebRequest -Uri $url -OutFile $cli
    Write-Host "Saved $cli"
}

if ($Alpine) {
    $out = Join-Path $root "app\assets\alpine.min.js"
    $url = "https://cdn.jsdelivr.net/npm/alpinejs@$AlpineVersion/dist/cdn.min.js"
    Write-Host "Vendoring Alpine $AlpineVersion..."
    Invoke-WebRequest -Uri $url -OutFile $out
    Write-Host "Saved $out - commit it, and note the version in the commit message."
}
