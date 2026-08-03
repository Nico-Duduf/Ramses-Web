# -*- coding: utf-8 -*-
"""Strips client-identifying data out of a Ramses-Client database.

    python tests/anonymise_fixture.py path/to/real.ramses tests/fixtures/demo.ramses

This repository is public, so the committed fixture must not carry a real
production's shot list. What it MUST carry is the exact structure the
completion formula is tested against, so this rewrites text fields only and
never touches uuids, states, completion ratios, or the item/step references
that the formula walks. The golden numbers in format.test.js are unchanged by
design: if running this alters them, something here reached too far.

Kept deliberately:
 - every uuid, so the orphaned status still points at a shot that is absent
   from RamShot, which is the regression case the tests exist for
 - every state, completionRatio and step type
 - shot numbers, so natural sorting is still exercised on realistic input

Scrubbed:
 - the project name, and every folder path (studio drive layout)
 - source media names (client's camera reel identifiers)
 - status comments, which embed ingest source paths and local user folders
 - the encrypted RamUser blobs, the server address and the local project path
"""

import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

PROJECT_NAME = "Demo Project"
PROJECT_SHORT = "DEMO"
ROOT = "P:/Projects/Demo"

# "Ingested v001 from D:/tmp/<vendor>/<date>/<reel>_v00 via ..."
INGEST = re.compile(r"^Ingested (v\d+) from .* via (.*)$")


def scrub_text(key, value, shortname, table):
    if not isinstance(value, str) or value == "":
        return value

    if key == "folderPath":
        # Rebuilt from the object's own short name rather than derived from the
        # original path. Folder basenames embed the production's name
        # ("<production>_S_0932"), so preserving the tail would have leaked
        # exactly what this script exists to remove.
        if table == "RamShot":
            return "%s/05-SHOTS/%s_S_%s" % (ROOT, PROJECT_SHORT, shortname or "0000")
        if table == "RamSequence":
            return "%s/05-SHOTS/%s" % (ROOT, shortname or "000")
        return ROOT

    if key == "sourceMedia":
        return "DEMO_" + (shortname or "0000") + "_v00"

    if key == "comment":
        m = INGEST.match(value)
        if m:
            # Preserve the sentence the UI actually renders, lose the path.
            return "Ingested %s from %s via %s" % (m.group(1), ROOT + "/_in", m.group(2))
        return "Note."

    return value


def scrub_row(data, table):
    shortname = data.get("shortName")

    for key in list(data.keys()):
        data[key] = scrub_text(key, data[key], shortname, table)

    if table == "RamProject":
        data["name"] = PROJECT_NAME
        data["shortName"] = PROJECT_SHORT

    return data


def sensitive_strings(path):
    """Every original value this script promises to remove.

    Collected from the source database so the check needs no hardcoded client
    names, which would defeat the purpose in a public repository.
    """
    con = sqlite3.connect(path)
    identity = set()   # the production's own name, checked at any length
    content = set()    # paths, media names, free text

    tables = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' and name not like 'sqlite%'"
    )]
    for table in tables:
        cols = [r[1] for r in con.execute("PRAGMA table_info(%s)" % table)]
        if "data" not in cols:
            continue
        for (data,) in con.execute("select data from %s" % table):
            try:
                parsed = json.loads(data)
            except (ValueError, TypeError):
                continue
            if not isinstance(parsed, dict):
                continue
            # The three fields this script rewrites, wherever they occur, plus
            # the production's own name. Not `name` in general: Ramses ships
            # notifications called "Message from Edward Snowden" and steps
            # called "Compositing", and those are neither secret nor ours.
            for key in ("folderPath", "sourceMedia", "comment"):
                value = parsed.get(key)
                if isinstance(value, str) and value.strip():
                    content.add(value)

            if table == "RamProject":
                for key in ("name", "shortName"):
                    value = parsed.get(key)
                    if isinstance(value, str) and value.strip():
                        identity.add(value)

    for (address, *_rest) in con.execute("select * from _Server"):
        content.add(address)
    for (_id, _name, p) in con.execute("select * from _Paths"):
        content.add(p)

    con.close()

    # Short free-text values are dropped: one status comment is the single word
    # "RFR", which collides with the built-in state of that name that has to
    # survive. Nothing under 8 characters identifies a production, and matching
    # them verbatim only produces false alarms. The project's own name is
    # checked regardless of length, because that is the one short string that
    # would matter.
    return identity | {s for s in content if len(s) >= 8}


def verify(dst, forbidden):
    """Fails loudly if anything the source considered sensitive survived.

    Reads the output file as raw bytes rather than querying it, so a value
    hiding in a column this script never considered is still caught.

    Shot names, step names and state names are expected to survive: they are
    numbers and generic pipeline vocabulary, and the tests assert on them.
    """
    blob = Path(dst).read_bytes().decode("utf-8", "ignore")

    leaked = sorted(s for s in forbidden if s in blob)
    if leaked:
        print("LEAKED, the fixture is NOT safe to publish:")
        for s in leaked[:20]:
            print("   " + repr(s[:120]))
        raise SystemExit(1)

    print("Verified: %d sensitive values from the source, none present in the output."
          % len(forbidden))


def main(src, dst):
    forbidden = sensitive_strings(src)

    shutil.copyfile(src, dst)
    con = sqlite3.connect(dst)

    tables = [r[0] for r in con.execute(
        "select name from sqlite_master where type='table' and name not like 'sqlite%'"
    )]

    for table in tables:
        cols = [r[1] for r in con.execute("PRAGMA table_info(%s)" % table)]
        if "data" not in cols:
            continue

        for uuid, data in list(con.execute("select uuid, data from %s" % table)):
            try:
                parsed = json.loads(data)
            except (ValueError, TypeError):
                continue  # RamUser rows are encrypted blobs, handled below
            if not isinstance(parsed, dict):
                continue
            scrub_row(parsed, table)
            con.execute(
                "update %s set data = ? where uuid = ?" % table,
                (json.dumps(parsed), uuid),
            )

    # The user rows are AES blobs from the server. Unreadable without the
    # deployment key, but they are still ciphertext of real names and emails.
    for i, (uuid,) in enumerate(list(con.execute("select uuid from RamUser"))):
        con.execute(
            "update RamUser set data = ?, role = ? where uuid = ?",
            ("(anonymised user %d)" % (i + 1), "(anonymised)", uuid),
        )

    con.execute("update _Server set address = ?", ("server.example/ramses/",))
    con.execute("update _Paths set path = ?", (ROOT.replace("/", "\\"),))

    con.commit()
    con.execute("VACUUM")
    con.close()

    print("Anonymised %s -> %s" % (src, dst))
    verify(dst, forbidden)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[2] if len(sys.argv) > 2 else str(
        Path(__file__).parent / "fixtures" / "demo.ramses")
    main(sys.argv[1], out)
