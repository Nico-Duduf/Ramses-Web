// The payload contract, enforced rather than asked for politely.
//
// Ramses-Server's project_overview.php decides which fields reach the browser,
// and tests/make_fixture.py has to trim the fixture to exactly the same set.
// Both files carry a comment telling the next person to keep them in step,
// which is the weakest form of enforcement there is: nothing fails when they
// drift, the tests simply start exercising a payload richer or poorer than
// production.
//
// That is how the framerate work went wrong once already, in the other
// direction: a field was added to the fixture and the tests passed while the
// server was still not sending it.
//
// The endpoint used to live in this repo as server/weboverview.php. Ramses-Server
// adopted it (its issue #18, shipped in 1.0.0-RC12), so the only copy now lives
// there and this reads it out of a sibling clone. Without one there is nothing
// to compare against and these tests skip rather than pass, because a contract
// test that quietly stops testing is worse than one that is absent.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");

const SERVER_CANDIDATES = [
  "../../Ramses-Server/src/project_overview.php",
  "../../Ramses-Server-src/src/project_overview.php",
];

const phpRel = SERVER_CANDIDATES.find((rel) =>
  existsSync(fileURLToPath(new URL(rel, import.meta.url)))
);
const skip = phpRel
  ? false
  : "no Ramses-Server clone beside this repo; expected one of " +
    SERVER_CANDIDATES.join(" or ");

const php = phpRel ? read(phpRel) : "";
const py = read("./make_fixture.py");

const GROUPS = ["project", "sequences", "shots", "steps", "states", "statuses"];

/** The quoted field names inside one entry of a PHP array(...) map. */
function phpKeep(group) {
  // \r?\n, not \n: the server repo is checked out with CRLF on Windows, and a
  // regex anchored on a bare newline silently matches nothing at all.
  const m = php.match(new RegExp(`"${group}"\\s*=> array\\(([\\s\\S]*?)\\),\\r?\\n`));
  assert.ok(m, `project_overview.php has no "${group}" entry`);
  return [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]).sort();
}

/** The same, from the Python KEEP dict. */
function pyKeep(group) {
  const m = py.match(new RegExp(`"${group}":\\s*\\(([\\s\\S]*?)\\),\\r?\\n`));
  assert.ok(m, `make_fixture.py has no "${group}" entry`);
  return [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]).sort();
}

test("the fixture keeps exactly the fields the server sends", { skip }, () => {
  for (const group of GROUPS) {
    assert.deepEqual(
      pyKeep(group),
      phpKeep(group),
      `${group}: make_fixture.py and project_overview.php disagree, so the ` +
        `tests no longer resemble production`
    );
  }
});

test("every field the payload carries is one the app reads", { skip }, () => {
  // A field on the wire that nothing reads is either dead weight or a feature
  // someone started and abandoned. Both are worth noticing.
  const app = ["format.js", "store.js", "api.js", "views/project.js", "views/projects.js", "views/shot.js"]
    .map((f) => read("../app/js/" + f))
    .join("\n");

  // uuid and modified are attached by project_overview.php outside the keep lists.
  const exempt = new Set(["itemType", "name"]);

  for (const group of GROUPS) {
    for (const field of phpKeep(group)) {
      if (exempt.has(field)) continue;
      assert.ok(
        app.includes(field),
        `${group}.${field} is sent by the server but read nowhere in app/js`
      );
    }
  }
});
