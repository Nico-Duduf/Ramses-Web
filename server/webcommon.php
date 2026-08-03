<?php
    // If this file is called directly, abort.
    if (!defined('RAMROOT')) die;

    require_once(RAMROOT."/functions.php");
    require_once(RAMROOT."/reply.php");

    /*
        Ramses-Web: helpers shared by weboverview.php and setstatus.php.

        Pulled out so the authorization check exists once. Both endpoints take a
        project uuid from the browser, and both must prove the caller is
        actually assigned to it.
    */

    /** Keeps only the listed keys of a row's JSON `data` blob. */
    function ramwebTrim($json, $fields)
    {
        $data = json_decode($json, true);
        if (!is_array($data)) return array();
        return array_intersect_key($data, array_flip($fields));
    }

    /** Rows of one table, trimmed to $fields and keyed by uuid. */
    function ramwebRows($table, $fields, $projectId, $byProject = true)
    {
        global $tablePrefix;

        $q = new DBQuery();
        $qStr = "SELECT `uuid`, `data`, `modified` FROM `{$tablePrefix}{$table}`
                    WHERE `removed` = 0 ";
        if ($byProject) $qStr .= "AND `project_id` = :projectid ";
        $qStr .= ";";

        $q->prepare($qStr);
        if ($byProject) $q->bindInt("projectid", $projectId);
        $q->execute();

        $rows = array();
        while ($r = $q->fetch())
            $rows[ $r["uuid"] ] = ramwebTrim($r["data"], $fields);
        $q->close();

        return $rows;
    }

    /**
     * The internal id of a project the current user may read, or dies with a
     * refusal.
     *
     * Deliberately not setCurrentProject(). That function joins
     * ServerProjectUser but never restricts it to the current user, so it
     * accepts any project uuid from any logged-in account; see README.md. It
     * also mutates the session's current project, which a read has no business
     * doing.
     *
     * Returns array(id, data).
     */
    function ramwebProject($projectUuid)
    {
        global $tablePrefix, $reply, $log;

        if ($projectUuid == "")
        {
            $reply["success"] = false;
            $reply["message"] = "The project UUID is required.";
            printAndDie();
        }

        $q = new DBQuery();
        $qStr = "SELECT `{$tablePrefix}RamProject`.`id`, `{$tablePrefix}RamProject`.`data`
                FROM `{$tablePrefix}RamProject` ";

        $admin = isAdmin();
        if (!$admin)
            $qStr .= "LEFT JOIN `{$tablePrefix}ServerProjectUser`
                        ON `{$tablePrefix}RamProject`.`id` = `{$tablePrefix}ServerProjectUser`.`project_id` ";

        $qStr .= "WHERE `{$tablePrefix}RamProject`.`uuid` = :projectUuid
                    AND `{$tablePrefix}RamProject`.`removed` = 0 ";

        if (!$admin)
            $qStr .= "AND `{$tablePrefix}ServerProjectUser`.`user_id` = :userid ";

        $qStr .= ";";

        $q->prepare($qStr);
        $q->bindStr("projectUuid", $projectUuid);
        if (!$admin) $q->bindInt("userid", $_SESSION["userid"]);
        $q->execute();
        $project = $q->fetch();
        $q->close();

        if (!$project)
        {
            $reply["success"] = false;
            $reply["message"] = "Either this project doesn't exist on this server, or you're not assigned to it.";
            $log->debugLog("Ramses-Web refused project {$projectUuid} for user " . $_SESSION["userid"], "WARNING");
            printAndDie();
        }

        return $project;
    }
