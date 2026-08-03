# Server endpoints

Four files that belong in Ramses-Server's `src/` folder, next to `login.php` and
`projects_get.php`. They are **not** part of the shipped `app/` folder and are
not served to the browser.

| File | Query | Where it goes in `index.php` |
| --- | --- | --- |
| `webcommon.php` | none, helpers only | required by the two below, no include needed |
| `weblogin.php` | `?weblogin` | **public** area, immediately BEFORE `include("login.php")` |
| `weboverview.php` | `?weboverview` | **private** area, after the token check |
| `setstatus.php` | `?setstatus` | **private** area, after the token check |

## Installing

1. Copy all four files into the server's `src/`.
2. Add three lines to `src/index.php`:

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

## Two upstream issues found while writing these

Neither is caused by this app, and neither is fixed here. Both are worth a PR.

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
