<?php
    // If this file is called directly, abort.
    if (!defined('RAMROOT')) die;

    require_once(RAMROOT."/functions.php");
    require_once(RAMROOT."/reply.php");
    require_once(RAMROOT."/webcommon.php");

    /*
        Ramses-Web: everything one project's views need, in one read.

        Why not the sync API: reading a project through sync means calling
        ?sync, then ?push (even with nothing to push, because only a commit
        builds the server-side cache), then ?fetch, then ?pull once per table
        per page, and then reimplementing the client's merge in JavaScript. That
        is a large amount of browser code whose only purpose is to arrive at
        rows this query already has.

        It is also a write path. It creates a cache folder per session under
        sync_cache/ and commits a push session, for what is meant to be a
        read-only glance from a phone.

        So: one request, already filtered to the rows the four views read, with
        only the fields they use. On the reference project that is roughly 70 KB for 41
        shots, 4 steps and 165 statuses.

        Completion is deliberately NOT computed here. It is computed in
        app/js/format.js, so the formula that has to agree with Ramses-Client
        exists once and is unit-tested, rather than twice in two languages.

        Requires: included AFTER the token check in index.php. See README.md.
    */

    if ( acceptReply( "weboverview" ) )
    {
        $projectUuid = getArg("project");

        // Refuses and dies if the user is not assigned to this project.
        $project = ramwebProject($projectUuid);
        $projectId = $project["id"];

        // Only the fields the app reads. Mirrors KEEP in tests/make_fixture.py;
        // keep the two in step, or the tests stop resembling production.
        $keep = array(
            // framerate rides along because frame counts have to be exact: a
            // sequence may override the project's rate, and a shot's duration
            // is only ever stored in seconds.
            "project"   => array("name", "shortName", "deadline", "framerate"),
            "sequences" => array("name", "shortName", "order", "framerate",
                                 "overrideFramerate"),
            "shots"     => array("name", "shortName", "sequence", "duration"),
            "steps"     => array("name", "shortName", "type", "order", "color"),
            "states"    => array("name", "shortName", "color", "completionRatio"),
            "statuses"  => array("item", "itemType", "step", "state",
                                 "completionRatio", "comment", "modifiedBy"),
        );

        $content = array();

        $content["project"] = array_merge(
            array("uuid" => $projectUuid),
            ramwebTrim($project["data"], $keep["project"])
        );

        $content["sequences"] = ramwebRows("RamSequence", $keep["sequences"], $projectId);
        $content["shots"]     = ramwebRows("RamShot",     $keep["shots"],     $projectId);
        $content["steps"]     = ramwebRows("RamStep",     $keep["steps"],     $projectId);

        // States are shared templates, not per-project rows, so they carry no
        // project_id and must not be filtered by one.
        $content["states"]    = ramwebRows("RamState",    $keep["states"],    $projectId, false);

        // Statuses go out as a list rather than a map: nothing looks one up by
        // uuid, everything scans them by item and step. `modified` rides along
        // because the shot view shows when a task last changed.
        $q = new DBQuery();
        $q->prepare("SELECT `uuid`, `data`, `modified` FROM `{$tablePrefix}RamStatus`
                        WHERE `removed` = 0 AND `project_id` = :projectid ;");
        $q->bindInt("projectid", $projectId);
        $q->execute();

        $statuses = array();
        while ($r = $q->fetch())
        {
            $status = ramwebTrim($r["data"], $keep["statuses"]);
            // Shots only, by design. Asset tasks are out of scope for this app,
            // and dropping them here keeps them off the wire entirely.
            if ( !isset($status["itemType"]) || $status["itemType"] != "shot" ) continue;
            $status["uuid"] = $r["uuid"];
            $status["modified"] = $r["modified"];
            $statuses[] = $status;
        }
        $q->close();

        $content["statuses"] = $statuses;

        $reply["content"] = $content;
        $reply["success"] = true;
        $reply["message"] = "Overview for {$projectUuid}.";
        printAndDie();
    }
