# Stages a release into publish\ramses\, laid out exactly like the server.
#
#     tools\publish.ps1
#
# Then upload the CONTENTS of publish\ramses\ into the server's ramses folder,
# the one holding index.php. One drag: an app\ subfolder.
#
# For Overmind that folder is
#     <the folder Ramses-Server is installed in>/
# serving https://www.overmind-studios.de/ramses/
#
# This stages the APP ONLY. Ramses-Server ships the endpoints and the app
# itself as of 1.0.0-RC12, and its own tools\deploy.py copies this repo's app\
# into the server package. Use that for a full server deployment; use this when
# you have changed a view and want it on a phone without rebuilding a server.
#
# There is no upload step here on purpose. No host, no credentials and no
# private key path live in this repo, and staging locally means you can see
# exactly what is about to go out before anything does.
#
# publish\ is gitignored. It is rebuilt from scratch every run, so anything you
# drop into it by hand will be deleted.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$publish = Join-Path $root "publish"

# --- Refuse to ship a stale stylesheet -------------------------------------
#
# app.css is a committed build artifact, so it is entirely possible to change a
# class in index.html, forget to rebuild, and ship markup whose styles do not
# exist. The failure then looks like a CSS bug rather than a missed build.
# Compare it against every file the Tailwind CLI scans.
$css = Join-Path $root "app\assets\app.css"
if (-not (Test-Path $css)) {
    throw "app\assets\app.css does not exist. Run tools\build.ps1."
}

$cssTime = (Get-Item $css).LastWriteTimeUtc
$sources = @(Get-Item (Join-Path $root "src\input.css")) +
           @(Get-ChildItem (Join-Path $root "app") -Recurse -Include *.html, *.js |
                Where-Object { $_.Name -ne "alpine.min.js" })

$stale = $sources | Where-Object { $_.LastWriteTimeUtc -gt $cssTime }
if ($stale) {
    Write-Host "app.css is older than:" -ForegroundColor Yellow
    $stale | ForEach-Object { Write-Host "  $($_.FullName)" }
    throw "Stale stylesheet. Run tools\build.ps1 and commit the result before publishing."
}

# --- Stage -----------------------------------------------------------------

if (Test-Path $publish) { Remove-Item $publish -Recurse -Force }
$stage = Join-Path $publish "ramses"
New-Item -ItemType Directory -Path $stage -Force | Out-Null

# app/ is copied wholesale on purpose: it holds only the shipped app, no tests,
# no build tooling, no docs. If that ever stops being true, fix the layout
# rather than adding excludes here.
Copy-Item (Join-Path $root "app") (Join-Path $stage "app") -Recurse

$appCount = (Get-ChildItem (Join-Path $stage "app") -Recurse -File).Count

@"
Ramses-Web, staged $(Get-Date -Format "yyyy-MM-dd HH:mm")

Upload the CONTENTS of publish\ramses\ into the server folder that holds
index.php. For Overmind that is

    <the folder Ramses-Server is installed in>/

You are dropping in:

    app\             $appCount files -> /ramses/app/

This replaces the app and nothing else. The endpoints it calls ship with
Ramses-Server itself from 1.0.0-RC12 on, so there is nothing to add beside
index.php any more.

The app MUST be same-origin with the API and exactly one level below it: it
resolves the API as "../" relative to itself, and the PHP session cookie it
authenticates with is marked secure, so it also has to be HTTPS. Ending up at
https://www.overmind-studios.de/ramses/app/ satisfies all three.

Requires Ramses-Server 1.0.0-RC12 or newer, which is where the endpoints
(login, project_overview, set_status) live. On an older server, use the
standalone-php tag of this repo, which still ships them separately.
"@ | Set-Content -Path (Join-Path $publish "UPLOAD.txt") -Encoding utf8

Write-Host ("Staged {0} app files in {1}" -f $appCount, $publish) -ForegroundColor Green
Write-Host "Read publish\UPLOAD.txt, then upload."
