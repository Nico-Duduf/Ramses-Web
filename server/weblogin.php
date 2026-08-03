<?php
    // If this file is called directly, abort.
    if (!defined('RAMROOT')) die;

    require_once(RAMROOT."/functions.php");
    require_once(RAMROOT."/reply.php");

    /*
        Ramses-Web: browser login.

        Ramses-Client folds a deployment-wide pepper (`clientKey`) into the
        password with preHashPassword() before it ever leaves the machine, and
        the server's ?login expects to receive that hash rather than a password.

        A browser cannot do that step. Shipping clientKey to an internet-facing
        login page publishes it to anyone who opens the developer tools, which
        is worse than not having it. It also drags in a SHA-3 implementation for
        no benefit.

        So this endpoint takes the raw password over HTTPS, applies the pepper
        here, and then hands the request to the stock ?login handler unchanged.
        Note what it does NOT do: it does not look up the user, compare hashes,
        issue a token or touch the session. All of that stays in login.php, in
        one place, where it is already reviewed. This file only rewrites one
        field.

        Requires: included BEFORE login.php in index.php. See README.md.
    */

    if ( hasArg("weblogin") )
    {
        // Read $bodyContent directly rather than through getArg().
        //
        // getArg() runs checkForbiddenWords(), which rewrites "%or%" into " or"
        // and similarly for eight other SQL keywords. That is harmless for
        // ?login, whose password is already a hex digest, but here the value is
        // the user's actual password: a password containing one of those
        // sequences would be silently altered before hashing and would never
        // match. The failure would look like "my password stopped working".
        $password = isset($bodyContent["password"]) ? $bodyContent["password"] : "";

        if (is_string($password) && $password !== "")
        {
            $bodyContent["password"] = preHashPassword($password);
        }

        // acceptReply() dispatches on $_GET (functions.php, hasArg), so this is
        // what makes the following include("login.php") pick the request up.
        $_GET["login"] = "";
        unset($_GET["weblogin"]);
    }
