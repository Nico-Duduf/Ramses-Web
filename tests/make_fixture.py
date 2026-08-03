# -*- coding: utf-8 -*-
"""Extracts a test fixture from a real Ramses-Client database.

The fixture is shaped exactly like the ?weboverview reply, so the tests exercise
format.js against the payload it will really be handed.

    python tests/make_fixture.py                       # regenerates from the committed copy
    python tests/make_fixture.py path/to/other.ramses  # or from another database

The source database is committed alongside its output as
`tests/fixtures/demo.ramses`, a copy of a real client database as it
stood on 2026-07-15. It is a deliberate copy rather than a path into the live
project, which will be deleted when the show wraps; nothing here may depend on a
database that exists on one disk only.

Only the fields the app actually reads are kept, and the orphaned status row
(the one whose shot is gone from RamShot) is deliberately preserved: it is the
regression case for the completion formula.
"""

import json
import sqlite3
import sys
from pathlib import Path

# Mirrors server/weboverview.php. Keep the two in step.
KEEP = {
    "project": ("name", "shortName", "deadline", "framerate"),
    "sequences": ("name", "shortName", "order", "framerate", "overrideFramerate"),
    "shots": ("name", "shortName", "sequence", "duration"),
    "steps": ("name", "shortName", "type", "order", "color"),
    "states": ("name", "shortName", "color", "completionRatio"),
    "statuses": ("item", "itemType", "step", "state", "completionRatio",
                 "comment"),
}


def trim(data, fields):
    return {k: v for k, v in data.items() if k in fields}


def rows(con, table):
    q = "select uuid, data, modified, removed from %s" % table
    return [
        (u, json.loads(d), m)
        for u, d, m, removed in con.execute(q)
        if not removed
    ]


def main(db_path, out_path):
    con = sqlite3.connect(db_path)

    project_uuid, project_data, _ = rows(con, "RamProject")[0]

    def keyed(table, kind):
        return {u: trim(d, KEEP[kind]) for u, d, _ in rows(con, table)}

    fixture = {
        "project": dict(uuid=project_uuid, **trim(project_data, KEEP["project"])),
        "sequences": keyed("RamSequence", "sequences"),
        "shots": keyed("RamShot", "shots"),
        "steps": keyed("RamStep", "steps"),
        "states": keyed("RamState", "states"),
        # `modified` is a column rather than a field of `data`, and the shot view
        # shows it, so it has to be added explicitly. weboverview.php does the same.
        "statuses": [
            dict(uuid=u, modified=m, **trim(d, KEEP["statuses"]))
            for u, d, m in rows(con, "RamStatus")
            if d.get("itemType") == "shot"
        ],
    }

    Path(out_path).write_text(
        json.dumps(fixture, indent=1, sort_keys=True), encoding="utf-8"
    )

    orphans = sum(1 for s in fixture["statuses"] if s["item"] not in fixture["shots"])
    print("%s: %d shots, %d steps, %d statuses (%d orphaned)" % (
        out_path, len(fixture["shots"]), len(fixture["steps"]),
        len(fixture["statuses"]), orphans))
    if orphans == 0:
        print("WARNING: no orphaned status in this database. The orphan-exclusion "
              "test needs one; keep the existing fixture instead of replacing it.")


if __name__ == "__main__":
    fixtures = Path(__file__).parent / "fixtures"
    db = sys.argv[1] if len(sys.argv) > 1 else str(fixtures / "demo.ramses")
    out = sys.argv[2] if len(sys.argv) > 2 else str(fixtures / "demo.json")
    main(db, out)
