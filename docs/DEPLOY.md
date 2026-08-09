# Deploying

Ramses-Server ships this app. From 1.0.0-RC12 its `tools/deploy.py` copies
`Ramses-Web/app` into the server package, so deploying the server deploys the
app, and the endpoints the app calls (`login`, `project_overview`,
`set_status`) are part of the server itself.

What follows is the hand-upload path, for putting a changed app on a server you
do not want to rebuild.

    app/         ->  <api root>/app/     static files, served as-is

`<api root>` is wherever Ramses-Server is installed. If the desktop client talks
to `https://server.tld/ramses/`, the app ends up at
`https://server.tld/ramses/app/`.

**Overmind's server**, confirmed 2026-08-09:

    https://www.overmind-studios.de/ramses/            the API, version 1.0.0-RC12
    <the folder Ramses-Server is installed in>/    the folder it lives in
    https://www.overmind-studios.de/ramses/app/        where the app goes

Upgraded from 1.0.0-RC6 on 2026-08-09, which is what put the endpoints on the
server. The standalone `weblogin.php`, `weboverview.php`, `setstatus.php` and
`webcommon.php` that used to sit beside `index.php` are no longer included by
anything and have been removed.

## How it goes out

Uploads are manual, with an SFTP client. `tools\publish.ps1` stages a release
into `publish\`, laid out exactly like the server, and writes an `UPLOAD.txt`
next to it saying where each half goes:

    tools\build.ps1
    node --test
    tools\publish.ps1
    # then drag the CONTENTS of publish\ramses\ into the server's ramses folder

`publish\ramses\` mirrors the destination exactly, so it is one drag: an `app\`
subfolder. `publish\` is gitignored and rebuilt from scratch each run.

No host, credentials or key path live in this repo, and nothing here connects to
anything. Staging first also means you can look at exactly what is about to go
out before it does.

## The app must be same-origin, one level below the API

`app/js/api.js` resolves the API as `../` relative to itself. Nothing else
configures a URL, and that is deliberate:

- **Same-origin** because auth rides the PHP session cookie, and the server marks
  it `secure`. A cross-origin app would need CORS and credentialed fetches, and
  would still lose the cookie on Safari.
- **HTTPS**, for the same reason. Over plain HTTP the cookie is never stored and
  every request looks like a fresh unauthenticated session.
- **One level below**, so `../` is the API. If you ever serve the app somewhere
  else, `BASE` in `api.js` is the single line to change.

## First deployment

1. `tools\fetch-tools.ps1` then `tools\build.ps1`.
2. `node --test` should be green.
3. `tools\publish.ps1`, then upload the contents of `publish\ramses\`.
4. Open the app, log in, confirm the project list appears.

Later releases are the same without the fetch. Nothing is once-only any more:
the server-side wiring that used to need hand-editing `index.php` is part of
Ramses-Server from 1.0.0-RC12.

## The stale-stylesheet guard

`publish.ps1` refuses to stage when `app/assets/app.css` is older than any file
the Tailwind CLI scans. The stylesheet is a committed build artifact, so without
that check, changing a class name in `index.html` and forgetting to rebuild ships
markup whose styles do not exist, and the failure reads as a CSS bug rather than
a missed build.

## Caching

The host sends `Cache-Control: max-age=31536000` on static files, a one-year
cache. That is correct for assets with versioned filenames and wrong for this
app, whose filenames are stable and uploaded by hand: a phone that visited once
would keep the old JavaScript for a year.

`app/.htaccess` overrides it to `no-cache`, which means revalidate before use
rather than do not store. The server sends ETags, so an unchanged file costs a
304 and no body.

A device that visited before that override was uploaded is still holding the
old files and will not ask for new ones. Clear the site data for it once, or
open it in a private tab to confirm that is all it is.
