# Ramses-Web

A glanceable, always-current overview of where each project stands, for use away
from the desk (phone and tablet). A window into Ramses, not a replacement for
Ramses-Client.

Read-mostly: the only write is setting a shot step's state, with an optional note.

See [docs/SPEC.md](docs/SPEC.md) for the locked MVP scope and
[docs/DEPLOY.md](docs/DEPLOY.md) for how it reaches the server.

## Layout

    app/         THE SHIPPED FOLDER. This, and only this, is copied to the server.
      index.html
      assets/    app.css (built, committed), alpine.min.js (vendored)
      js/        api.js, format.js, store.js, views/
    src/         Tailwind authoring input. Not shipped.
    server/      Four PHP files to graft into Ramses-Server's src/. Not shipped as-is.
    tools/       build / watch / publish scripts, and the Tailwind CLI (gitignored).
    tests/       node --test for the completion formula. No npm dependencies.
    docs/        SPEC.md, DEPLOY.md

`app/` holds no build tooling, no tests and no docs, so deploying is literally
"copy `app/`". That is the same split Ramses-Fusion uses, and it exists because
these folders get copied by hand.

## Stack

- **Tailwind CSS** through the standalone CLI. No npm, no `node_modules`, no
  build step on the server: `app/assets/app.css` is committed as a built artifact.
- **Alpine.js**, vendored at a pinned version in `app/assets/`.
- Vanilla `fetch` in ES modules. No framework, no bundler.

Node is used for one thing only: running `node --test` on the completion formula.
It is not part of the build and not required to deploy.

## Working on it

    tools\fetch-tools.ps1     # once: downloads the Tailwind CLI
    tools\watch.ps1           # rebuilds app.css on change, serves app/ on :8080
    tools\build.ps1           # one-off minified build
    node --test               # the completion formula against real project data
    tools\publish.ps1         # stages publish\ for upload (refuses if app.css is stale)

`app/` is copied wholesale to the server, so it must never grow a test, a script
or a doc. Those live in the folders above it.

## Why the completion numbers must be reproduced exactly

The percentages here have to agree with the ones Ramses-Client shows, or the app
is worse than useless. The formula is reimplemented in `app/js/format.js` and
pinned by tests against a fixture extracted from a real project database. See the
comment at the top of that file for the C++ it mirrors.

The database that fixture came from is committed as `tests/fixtures/demo.ramses`,
so the tests keep working after the the reference project project is archived. Nothing in
this repo reads a path outside it.

`package.json` exists only so `node --test` parses `app/js/*.js` as ES modules.
It has no dependencies and never should: adding one puts a `node_modules` between
you and a deploy that is supposed to be a folder copy.
