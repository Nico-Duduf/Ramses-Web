# Stages a release into publish\, laid out exactly like the server.
#
#     tools\publish.ps1
#
# Then upload the two folders with your SFTP client:
#
#     publish\app\  ->  <api root>/app/
#     publish\src\  ->  <api root>/src/     (four .php files, merges with what is there)
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
New-Item -ItemType Directory -Path $publish | Out-Null

# app/ is copied wholesale on purpose: it holds only the shipped app, no tests,
# no build tooling, no docs. If that ever stops being true, fix the layout
# rather than adding excludes here.
Copy-Item (Join-Path $root "app") (Join-Path $publish "app") -Recurse

New-Item -ItemType Directory -Path (Join-Path $publish "src") | Out-Null
Copy-Item (Join-Path $root "server\*.php") (Join-Path $publish "src")

$appCount = (Get-ChildItem (Join-Path $publish "app") -Recurse -File).Count
$phpCount = (Get-ChildItem (Join-Path $publish "src") -File).Count

@"
Ramses-Web, staged $(Get-Date -Format "yyyy-MM-dd HH:mm")

Upload with your SFTP client:

    app\   ($appCount files)  ->  <api root>/app/
    src\   ($phpCount files)  ->  <api root>/src/

<api root> is the folder Ramses-Server's index.php lives in. If the desktop
client talks to https://server.tld/ramses/ then the app ends up at
https://server.tld/ramses/app/.

The app MUST be same-origin with the API and exactly one level below it: it
resolves the API as "../" relative to itself, and the PHP session cookie it
authenticates with is marked secure, so it also has to be HTTPS.

The src\ files merge into the server's existing src\ folder. They do not
overwrite anything: all four names are new.

STILL TO DO BY HAND, once, on the server:

    Add three include lines to src/index.php.

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
