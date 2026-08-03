# Ramses-Web, MVP spec

Locked. Anything not listed under "In scope" is deliberately out.

## What it is

A glanceable, always-current read-mostly overview of where each project stands,
for use away from the desk. Phone first, works on tablet.

Overmind Studios is three people and team chat already handles alerts, so there
is **no** stuck/behind detection, **no** activity feed, **no** scheduling and
**no** filters. Those are not "later", they are not wanted.

## In scope

Four views:

1. **Login** - email and password.
2. **Projects** - every project the user is assigned to, with its completion
   percentage and a bar.
3. **Project** - completion broken down by step and by sequence, then the shots,
   coloured by state.
4. **Shot** - read-only detail for one shot: its state per step, with comments.

Shots only. Shot-production steps only. Assets, asset groups and
pre/post-production steps are not shown.

## The one write

Setting a shot step's **state**, with an **optional note**, behind a confirm
dialog. Built last, after everything read-only works. Verify the round trip in
the desktop Ramses-Client before trusting it, and test on a throwaway shot first.

## Design

Dark-committed. It sits next to Fusion, Nuke and DaVinci all day, and matches the
Ramses-Client palette (`#2c4468`, `#2b5a4c`). Monospace carries the identity:
shot codes and percentages are mono, prose is not.

State colours come from the server's own `RamState` rows, never from a hardcoded
table, so a state recoloured in Ramses-Client is recoloured here too.

## Completion must match Ramses-Client

Reimplemented in `app/js/format.js`, mirroring `RamProject::updateEstimation`,
`RamTaskTableModel::updateStepEstimCache` and `RamStatus::completionRatio`.

    task    = status.completionRatio, defaulting to 50 when the key is absent
    step    = integer mean over that step's tasks, EXCLUDING
                - tasks whose state shortName is "NO" (nothing to do)
                - tasks whose item no longer exists
    project = integer mean over the shot-production steps, or 100 if there are none

Both exclusions are load-bearing. On the reference project 74 of 165 statuses
are "NO", and one orphaned `SH010 | Plate` status points at a shot that is gone
from `RamShot` entirely; counting it turned a finished plate step into 97%.

Ramses-Client gets the orphan exclusion for free because it builds its task table
from the item list. Here it has to be explicit.

**Known, accepted divergence:** Ramses-Client averages shot-production *and*
asset-production steps into the project percentage. This app is shots-only, so on
a project that has asset steps its project percentage will differ from the
desktop client's. Ours is the shot-only figure. The reference project has no
asset steps, so this does not currently bite.

## Data

No sync session. The browser never implements push/fetch/pull; it asks
`?weboverview` for one project's rows and computes everything locally, which
keeps the formula in exactly one place. See `server/README.md` for why.

## Auth constraints, from reading Ramses-Server

- Every request is a `POST` with `Content-Type: application/json`; the endpoint
  name is a bare **query-string flag** (`POST /ramses/?weboverview`).
- Every private request carries `token`, obtained from login.
- Every request carries `version`, and `check_client_version.php` rejects the
  request *before* login if the major.minor does not match the server's. Bootstrap
  it from the rejection reply's `content.version`.
- Auth rides the PHP session cookie, which is `secure`, so the app **must** be
  served over HTTPS and same-origin with the API.
- The session is pinned to `REMOTE_ADDR`. Roaming between wifi and mobile data
  logs you out. Accepted, not fixing.
