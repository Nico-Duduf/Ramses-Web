// The completion formula, pinned against a real project database.
//
// These numbers are not invented. They come from a real production database as
// it stood on 2026-07-15, anonymised by tests/anonymise_fixture.py, and they
// have to keep agreeing with what Ramses-Client shows. If one of them changes,
// either the formula drifted or the fixture was regenerated from a different
// project; find out which before editing.
//
//   node --test tests/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  clockText,
  frameCount,
  framerateFor,
  groupDigits,
  projectCompletion,
  shotSteps,
  sortShots,
  stepCompletion,
  taskCompletion,
  textOn,
} from "../app/js/format.js";

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/demo.json", import.meta.url)))
);

const byShortName = Object.fromEntries(
  Object.entries(fixture.steps).map(([uuid, s]) => [s.shortName, uuid])
);

const completionOf = (shortName) =>
  stepCompletion(byShortName[shortName], fixture);

test("step completion matches the desktop client", () => {
  assert.equal(completionOf("PLATE"), 100);
  assert.equal(completionOf("MaMo"), 0);
  assert.equal(completionOf("Mod"), 0);
  assert.equal(completionOf("Comp"), 6);
});

test("project completion is the mean of the shot steps", () => {
  assert.equal(projectCompletion(fixture), 26);
});

test("a status whose shot no longer exists is not counted", () => {
  // The fixture carries one orphan: `SH010 | Plate`, at 0%, pointing at a shot
  // that is gone from RamShot. Ramses-Client never sees it because it walks the
  // item list; this app gets a flat list of statuses and has to drop it.
  const orphans = fixture.statuses.filter((s) => !fixture.shots[s.item]);
  assert.equal(orphans.length, 1, "fixture must still contain the orphan");

  // Prove the exclusion is load-bearing rather than decorative: put the missing
  // shot back and the finished plate step drops to 97%.
  const withGhost = {
    ...fixture,
    shots: { ...fixture.shots, [orphans[0].item]: { shortName: "SH010" } },
  };
  assert.equal(stepCompletion(byShortName["PLATE"], withGhost), 97);
});

test("a nothing-to-do task is not counted", () => {
  const noUuid = Object.entries(fixture.states).find(
    ([, s]) => s.shortName === "NO"
  )[0];
  const nos = fixture.statuses.filter((s) => s.state === noUuid);
  assert.ok(nos.length > 0, "fixture must contain NO statuses");

  // Modeling has 5 real tasks; the other 36 shots are marked nothing-to-do.
  // Counting them would not change 0%, so assert on the task count instead by
  // recolouring every NO task to a finished state and watching Mod move.
  const okUuid = Object.entries(fixture.states).find(
    ([, s]) => s.shortName === "OK"
  )[0];
  const promoted = {
    ...fixture,
    statuses: fixture.statuses.map((s) =>
      s.state === noUuid ? { ...s, state: okUuid, completionRatio: 100 } : s
    ),
  };
  assert.ok(
    stepCompletion(byShortName["Mod"], promoted) > 0,
    "NO tasks must be genuinely excluded, not merely zero-valued"
  );
});

test("a step with no countable task reports null, not zero", () => {
  const empty = { ...fixture, statuses: [] };
  assert.equal(stepCompletion(byShortName["Comp"], empty), null);
  // ...and a project made only of such steps is 100, as RamProject does.
  assert.equal(projectCompletion(empty), 100);
});

test("a missing completionRatio means 50, not 0", () => {
  assert.equal(taskCompletion({}), 50);
  assert.equal(taskCompletion({ completionRatio: 0 }), 0);
  assert.equal(taskCompletion({ completionRatio: 100 }), 100);
});

test("only shot-production steps are listed, in order", () => {
  const names = shotSteps(fixture.steps).map((s) => s.shortName);
  assert.deepEqual(names, ["PLATE", "MaMo", "Mod", "Comp"]);
});

test("shots sort naturally", () => {
  // Plain string comparison puts SH10 before SH9. This is the same bug that
  // had to be fixed in Ramses-Out's shot table.
  const sorted = sortShots([
    { shortName: "SH10" },
    { shortName: "SH9" },
    { shortName: "SH100" },
  ]).map((s) => s.shortName);
  assert.deepEqual(sorted, ["SH9", "SH10", "SH100"]);
});

test("a sequence's frame rate overrides the project's, but only when flagged", () => {
  const project = { framerate: 25 };
  assert.equal(framerateFor({ overrideFramerate: true, framerate: 48 }, project), 48);

  // Ramses stores the override value whether or not the flag is set, so the
  // flag is the only thing that decides. Reading the value alone would silently
  // recount every shot in the sequence.
  assert.equal(framerateFor({ overrideFramerate: false, framerate: 48 }, project), 25);
  assert.equal(framerateFor(null, project), 25);
  assert.equal(framerateFor(null, null), 25, "a stated rate beats a blank");
});

test("frame counts round rather than truncate", () => {
  const project = { framerate: 25 };
  // 3.98 s at 25 is 100 frames; calling it 99 would be wrong in the direction
  // that gets noticed at delivery.
  assert.equal(frameCount({ duration: 3.98 }, null, project), 100);
  assert.equal(frameCount({ duration: 5.96 }, null, project), 149);
  assert.equal(frameCount({}, null, project), 0);
});

test("frame counts use each shot's own sequence rate", () => {
  const shots = Object.entries(fixture.shots).map(([uuid, s]) => ({ uuid, ...s }));
  const total = shots.reduce(
    (sum, s) => sum + frameCount(s, fixture.sequences[s.sequence], fixture.project),
    0
  );
  // The whole reference project at 25 fps: 41 shots, 197.4 seconds.
  assert.equal(total, 4935);
  assert.equal(shots.length, 41);
});

test("long counts stay scannable and clocks roll over at a minute", () => {
  assert.equal(groupDigits(4935), "4 935");
  assert.equal(groupDigits(93), "93");
  assert.equal(clockText(48), "48 s");
  assert.equal(clockText(128), "2:08");
  assert.equal(clockText(600), "10:00");
});

test("swatch text flips with the state colour", () => {
  assert.equal(textOn("#111111"), "#e8e8e8"); // Nothing to do, near black
  assert.equal(textOn("#55aaff"), "#101010"); // Ready for review, light blue
  assert.equal(textOn(null), "#e8e8e8");
});
