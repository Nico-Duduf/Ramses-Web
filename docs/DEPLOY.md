# Deploying

Two halves, and they go to two different places on the same host.

    app/         ->  <api root>/app/     static files, served as-is
    server/*.php ->  <api root>/src/     four PHP files, plus a hand edit to index.php

`<api root>` is wherever Ramses-Server is installed, the folder its `index.php`
lives in. If the desktop client talks to `https://server.tld/ramses/`, the app
ends up at `https://server.tld/ramses/app/`.

## How it goes out

Uploads are manual, with an SFTP client. `tools\publish.ps1` stages a release
into `publish\`, laid out exactly like the server, and writes an `UPLOAD.txt`
next to it saying where each half goes:

    tools\build.ps1
    node --test
    tools\publish.ps1
    # then drag publish\app\ and publish\src\ across with FileZilla / WinSCP

`publish\` is gitignored and rebuilt from scratch each run.

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
3. `tools\publish.ps1`, then upload `publish\app\` and `publish\src\`.
4. Add the three `include` lines to the server's `index.php` by hand. See
   `server/README.md`; nothing here edits that file, because a three-line change
   to Ramses-Server's own file should show up in its diff.
5. Open the app, log in, confirm the project list appears.

Only step 4 is once-only. Later releases are steps 1 to 3 without the fetch.

## The stale-stylesheet guard

`publish.ps1` refuses to stage when `app/assets/app.css` is older than any file
the Tailwind CLI scans. The stylesheet is a committed build artifact, so without
that check, changing a class name in `index.html` and forgetting to rebuild ships
markup whose styles do not exist, and the failure reads as a CSS bug rather than
a missed build.

## Caching

The server sends no cache headers for static files, so Apache's defaults apply
and `app.css` can survive an upload in a phone's cache. If a release looks like
it did not land, hard-reload before debugging anything else. If that becomes a
recurring annoyance, the fix is a query string on the `<link>` and `<script>`
tags in `index.html`, bumped at build time.
