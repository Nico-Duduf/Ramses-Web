# Server endpoints

Four files that belong next to `login.php` and `projects_get.php`. They are
**not** part of the shipped `app/` folder and are not served to the browser.

In the Ramses-Server *repository* those siblings live in `src/`. On a *server*
there is no `src/`: what gets deployed is that folder's contents, so the four
files land directly in the API folder, beside `index.php` and `init.php`.

| File | Query | Where it goes in `index.php` |
| --- | --- | --- |
| `webcommon.php` | none, helpers only | required by the two below, no include needed |
| `weblogin.php` | `?weblogin` | **public** area, immediately BEFORE `include("login.php")` |
| `weboverview.php` | `?weboverview` | **private** area, after the token check |
| `setstatus.php` | `?setstatus` | **private** area, after the token check |

## Installing

1. Copy all four files into the API folder, next to `index.php`.
2. Add three lines to `index.php`:

```php
    include("users_reset_password.php");
    include("weblogin.php");            // <-- add, MUST be before login.php
    include("login.php");
    include("logout.php");
```

```php
    include("projects_get.php");
    include("weboverview.php");         // <-- add
    include("setstatus.php");           // <-- add
    include("projects_get_users.php");
```

`tools/deploy.ps1` copies the files but will not edit `index.php`; that is a
three-line change to someone else's file and it should be visible in their diff,
not applied behind their back.

## Why `weblogin.php` has to come before `login.php`

It does not authenticate anything. It replaces one field in the request body
with its peppered hash and then rewrites `$_GET` so the stock `?login` handler
picks the request up. All credential handling stays in `login.php`, unduplicated.

The pepper (`clientKey`) is why the endpoint exists at all: Ramses-Client applies
it locally before sending, and a browser cannot without publishing it to anyone
who opens the developer tools.

## Three upstream issues found while writing these

None is caused by this app, and none is fixed here. All three are worth a PR.

0. **`init.php:8` reads `$_SERVER["HTTP_ACCEPT_ENCODING"]` unguarded.** A request
   that does not send `Accept-Encoding` gets a PHP warning printed *before* the
   JSON, which makes the reply unparseable, and because output has started the
   session cookie can no longer be set: `session_name()`,
   `session_set_cookie_params()` and two `ini_set()` calls all then fail with
   "headers have already been sent". Reproduced against the live Overmind server
   on 2026-08-03 with a plain `curl` POST to `?ping`.

   Browsers always send `Accept-Encoding`, and so does Ramses-Client, so this
   stays invisible until something scripted talks to the API. It is a one-line
   fix (`$_SERVER["HTTP_ACCEPT_ENCODING"] ?? ""`) and it silently breaks
   authentication, which makes it the most worthwhile of the three.

1. **`setCurrentProject()` does not check the user.** `functions.php:280` joins
   `ServerProjectUser` but never restricts `user_id` to the session's user, so
   any logged-in account can set any project as current, and therefore sync it.
   `webcommon.php` does its own check rather than inheriting this.

2. **`setCurrentProject()` writes to a local `$reply`.** It assigns
   `$reply["message"]` and `$reply["success"]` without declaring
   `global $reply`, so on the failure path the message is written to a local
   array and thrown away; `printAndDie()` then prints the untouched global. The
   caller gets a generic failure instead of "you're not assigned to it".

## Testing them

There is no PHP test harness here. The endpoints are small and mostly SQL, so
verify them against a real server:

- `?weblogin` with a wrong password must fail exactly like `?login` does.
- `?weboverview` for a project you are not assigned to must be refused. Check
  this as a non-admin: an admin bypasses the join by design.
- `?setstatus` on a throwaway shot, then confirm the change appears in the
  desktop Ramses-Client after a sync, with the right `modified` timestamp and
  the completion percentage moved to match the state.
