<?php
    // If this file is called directly, abort.
    if (!defined('RAMROOT')) die;

    require_once(RAMROOT."/functions.php");
    require_once(RAMROOT."/reply.php");
    require_once(RAMROOT."/webcommon.php");

    /*
        Ramses-Web: the one write.

        Sets a shot step's state, with an optional comment. Everything else the
        app does is read-only.

        The browser does not build the status row and does not orchestrate a
        sync push. It names the four things it means (project, shot, step,
        state) and this endpoint writes one RamStatus with a server-stamped
        `modified`, so the timestamp comes from the same clock as every other
        client's. Clock skew between machines has already caused a class of sync
        bugs here; there is no reason to reintroduce it from a phone.

        Requires: included AFTER the token check in index.php. See README.md.
    */

    if ( acceptReply( "setstatus" ) )
    {
        $projectUuid = getArg("project");
        $shotUuid    = getArg("shot");
        $stepUuid    = getArg("step");
        $stateUuid   = getArg("state");
        $comment     = getArg("comment");

        // Refuses and dies if the user is not assigned to this project.
        $project = ramwebProject($projectUuid);
        $projectId = $project["id"];

        if ($shotUuid == "" || $stepUuid == "" || $stateUuid == "")
        {
            $reply["success"] = false;
            $reply["message"] = "A shot, a step and a state are all required.";
            printAndDie();
        }

        // The shot and the step must belong to the project the caller was
        // authorized for. Without this, an authorized project uuid would be
        // enough to write a status onto any shot on the server.
        $shots = ramwebRows("RamShot", array("shortName", "name"), $projectId);
        $steps = ramwebRows("RamStep", array("shortName", "name"), $projectId);

        if ( !isset($shots[$shotUuid]) || !isset($steps[$stepUuid]) )
        {
            $reply["success"] = false;
            $reply["message"] = "That shot or step is not part of this project.";
            $log->debugLog("setstatus refused: {$shotUuid}/{$stepUuid} not in project {$projectUuid}", "WARNING");
            printAndDie();
        }

        // States are global templates, so this only checks the state exists.
        $states = ramwebRows("RamState", array("shortName", "name", "completionRatio"), $projectId, false);
        if ( !isset($states[$stateUuid]) )
        {
            $reply["success"] = false;
            $reply["message"] = "Unknown state.";
            printAndDie();
        }

        $now = gmdate("Y-m-d H:i:s");
        $userUuid = $_SESSION["userUuid"];
        $userId = $_SESSION["userid"];

        /*
            Completion follows the state.

            RamStatus carries its own completionRatio, separate from the state's,
            and in the client they are separate fields with separate menu
            actions. But in practice they track: across the reference project every task
            whose state defines a ratio carries exactly that ratio (OK 100 x40,
            CHK 85 x2, TODO and NO 0 x118). Only the states that define no ratio
            of their own (WIP) show tasks that differ.

            So: copy the state's ratio when it has one, and leave the existing
            value untouched when it does not. Setting a shot to OK from a phone
            has to move the percentage, or the app lies about the thing it
            exists to show.
        */
        $stateRatio = isset($states[$stateUuid]["completionRatio"])
            ? $states[$stateUuid]["completionRatio"]
            : null;

        // Find the existing task for this shot at this step.
        $q = new DBQuery();
        $q->prepare("SELECT `uuid`, `data` FROM `{$tablePrefix}RamStatus`
                        WHERE `removed` = 0 AND `project_id` = :projectid ;");
        $q->bindInt("projectid", $projectId);
        $q->execute();

        $existingUuid = "";
        $data = array();
        while ($r = $q->fetch())
        {
            $d = json_decode($r["data"], true);
            if (!is_array($d)) continue;
            if ( ($d["item"] ?? "") == $shotUuid && ($d["step"] ?? "") == $stepUuid )
            {
                $existingUuid = $r["uuid"];
                $data = $d;
                break;
            }
        }
        $q->close();

        $data["state"] = $stateUuid;
        $data["comment"] = $comment;
        $data["modifiedBy"] = $userUuid;
        if ($stateRatio !== null) $data["completionRatio"] = $stateRatio;

        if ($existingUuid != "")
        {
            $q = new DBQuery();
            $q->prepare("UPDATE `{$tablePrefix}RamStatus`
                            SET `data` = :data, `modified` = :modified, `modified_by` = :modifiedby
                            WHERE `uuid` = :uuid ;");
            $q->bindStr("data", json_encode($data));
            $q->bindStr("modified", $now);
            $q->bindInt("modifiedby", $userId);
            $q->bindStr("uuid", $existingUuid);
            $q->execute();
            $q->close();

            $statusUuid = $existingUuid;
        }
        else
        {
            // No task yet for this shot at this step. Build one the way the
            // client names them: "0610 | Compositing" / "0610-Comp".
            $statusUuid = uuid();

            $data["item"] = $shotUuid;
            $data["itemType"] = "shot";
            $data["step"] = $stepUuid;
            $data["name"] = ($shots[$shotUuid]["shortName"] ?? "") . " | " . ($steps[$stepUuid]["name"] ?? "");
            $data["shortName"] = ($shots[$shotUuid]["shortName"] ?? "") . "-" . ($steps[$stepUuid]["shortName"] ?? "");
            if (!isset($data["order"])) $data["order"] = 0;
            if (!isset($data["completionRatio"])) $data["completionRatio"] = 50;

            $q = new DBQuery();
            $q->prepare("INSERT INTO `{$tablePrefix}RamStatus`
                            (`uuid`, `data`, `modified`, `modified_by`, `removed`, `project_id`)
                            VALUES (:uuid, :data, :modified, :modifiedby, 0, :projectid) ;");
            $q->bindStr("uuid", $statusUuid);
            $q->bindStr("data", json_encode($data));
            $q->bindStr("modified", $now);
            $q->bindInt("modifiedby", $userId);
            $q->bindInt("projectid", $projectId);
            $q->execute();
            $q->close();
        }

        $reply["content"] = array(
            "uuid" => $statusUuid,
            "modified" => $now,
            "completionRatio" => $data["completionRatio"],
        );
        $reply["success"] = true;
        $reply["message"] = "Status updated.";
        $log->debugLog("Ramses-Web set {$shotUuid}/{$stepUuid} to {$stateUuid}", "INFO");
        printAndDie();
    }
