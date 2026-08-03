# Stages a release into publish\ramses\, laid out exactly like the server.
#
#     tools\publish.ps1
#
# Then upload the CONTENTS of publish\ramses\ into the server's ramses folder,
# the one holding index.php. One drag: an app\ subfolder and four .php files
# that land next to index.php.
#
# For Overmind that folder is
#     <the folder Ramses-Server is installed in>/
# serving https://www.overmind-studios.de/ramses/
#
# Note the PHP files go NEXT TO index.php, not into a src\ subfolder. src\ is
# how Ramses-Server's repository is laid out; its contents are what gets
# deployed, so on the server there is no src\ at all.
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

# ...and the endpoints land beside index.php, in the same folder.
Copy-Item (Join-Path $root "server\*.php") $stage

$appCount = (Get-ChildItem (Join-Path $stage "app") -Recurse -File).Count
$phpCount = (Get-ChildItem $stage -File).Count

@"
Ramses-Web, staged $(Get-Date -Format "yyyy-MM-dd HH:mm")

Upload the CONTENTS of publish\ramses\ into the server folder that holds
index.php. For Overmind that is

    <the folder Ramses-Server is installed in>/

You are dropping in:

    app\             $appCount files, a new subfolder -> /ramses/app/
    *.php            $phpCount files, next to index.php

Nothing is overwritten: all four PHP names are new.

The PHP files do NOT go into a src\ subfolder. src\ is how the Ramses-Server
repository is laid out; what gets deployed is its contents, so there is no
src\ on the server.

The app MUST be same-origin with the API and exactly one level below it: it
resolves the API as "../" relative to itself, and the PHP session cookie it
authenticates with is marked secure, so it also has to be HTTPS. Ending up at
https://www.overmind-studios.de/ramses/app/ satisfies all three.

STILL TO DO BY HAND, once, on the server:

    Add three include lines to index.php.

        include("users_reset_password.php");
        include("weblogin.php");          <-- add, MUST be before login.php
        include("login.php");

        include("projects_get.php");
        include("weboverview.php");       <-- add
        include("setstatus.php");         <-- add

    See server\README.md in the repo for the full context.
"@ | Set-Content -Path (Join-Path $publish "UPLOAD.txt") -Encoding utf8

Write-Host ("Staged {0} app files and {1} PHP files in {2}" -f $appCount, $phpCount, $publish) -ForegroundColor Green
Write-Host "Read publish\UPLOAD.txt, then upload."
