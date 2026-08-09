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
  deadlineText,
  showStrip,
  frameCount,
  framerateFor,
  groupDigits,
  lastActivity,
  matchesSearch,
  parseStamp,
  stateTally,
  terminalStep,
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
  assert.equal(completionOf("MaMo"), 81);
  assert.equal(completionOf("Mod"), 16);
  assert.equal(completionOf("Comp"), 39);
});

test("project completion is the mean of the shot steps", () => {
  assert.equal(projectCompletion(fixture), 59);
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
  assert.equal(stepCompletion(byShortName["PLATE"], withGhost), 98);
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
  // The whole reference project at 25 fps: 51 shots, 4 minutes 18 seconds.
  assert.equal(total, 6446);
  assert.equal(shots.length, 51);
});

test("long counts stay scannable and clocks roll over at a minute", () => {
  assert.equal(groupDigits(6446), "6 446");
  assert.equal(groupDigits(93), "93");
  assert.equal(clockText(48), "48 s");
  assert.equal(clockText(128), "2:08");
  assert.equal(clockText(600), "10:00");
});

test("timestamps are read as UTC, which is how the server writes them", () => {
  // "2026-07-13 15:38:53" is not a format Safari accepts at all, and Chrome
  // reads it as local time, which is an hour or two of silent drift.
  assert.equal(parseStamp("2026-07-13 15:38:53").toISOString(),
    "2026-07-13T15:38:53.000Z");
  assert.equal(parseStamp(""), null);
  assert.equal(parseStamp("not a date"), null);
});

test("last activity is the most recent change, not the first found", () => {
  assert.equal(
    lastActivity(fixture.statuses).toISOString(),
    "2026-08-03T10:35:53.000Z"
  );
  assert.equal(lastActivity([]), null);
  assert.equal(lastActivity([{ modified: "" }]), null);
});

test("the state tally counts what is left", () => {
  const plate = Object.entries(fixture.steps).find(
    ([, s]) => s.shortName === "PLATE"
  )[0];
  const tally = stateTally(plate, fixture);

  // Same exclusions as the completion formula: no nothing-to-do, no orphans.
  assert.equal(tally.reduce((n, t) => n + t.count, 0), 50);
  assert.ok(!tally.some((t) => t.state.shortName === "NO"));
});

test("the tally reads least finished first", () => {
  const comp = Object.entries(fixture.steps).find(
    ([, s]) => s.shortName === "Comp"
  )[0];
  const tally = stateTally(comp, fixture);

  // Comp is the step with real variety: five distinct states in play.
  assert.deepEqual(
    tally.map((t) => t.state.shortName),
    ["TODO", "WIP", "RTK", "CHK", "OK"]
  );

  // Guard against the previous version of this test, which sorted on a field
  // that is not in the payload: every key was undefined, so the assertion held
  // no matter what order the tally came back in.
  const ranks = tally.map((t) =>
    typeof t.state.completionRatio === "number" ? t.state.completionRatio : 50
  );
  assert.ok(new Set(ranks).size >= 3, "the ordering key must actually vary");
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("a deadline is stated, never judged", () => {
  const now = new Date(2026, 6, 4); // 4 Jul 2026, local midnight
  assert.equal(deadlineText("2026-07-13", now), "Deadline 13 Jul, in 9 days");
  assert.equal(deadlineText("2026-07-05", now), "Deadline 5 Jul, in 1 day");
  assert.equal(deadlineText("2026-07-04", now), "Deadline 4 Jul, today");
  // Passed deadlines read as fact. No alarm wording, by design.
  assert.equal(deadlineText("2026-07-03", now), "Deadline 3 Jul, 1 day ago");
  assert.equal(deadlineText("2026-06-04", now), "Deadline 4 Jun, 30 days ago");
  assert.equal(deadlineText("", now), "");
  assert.equal(deadlineText(null, now), "");
});

test("the end of the pipeline comes from the graph, not the sort order", () => {
  const end = terminalStep(fixture.steps, fixture.pipes);
  assert.equal(end.shortName, "Comp");

  // It must be the graph doing the work, not a coincidence of ordering. Give
  // Comp an order that puts it first and the answer must not move.
  const shuffled = structuredClone(fixture.steps);
  for (const [uuid, step] of Object.entries(shuffled)) {
    step.order = step.shortName === "Comp" ? -10 : 10;
  }
  assert.equal(terminalStep(shuffled, fixture.pipes).shortName, "Comp");
});

test("a project with no pipeline falls back to the last step by order", () => {
  // Half-configured projects keep behaving exactly as they did before pipes
  // were read at all, rather than showing a blank strip.
  assert.equal(terminalStep(fixture.steps, {}).shortName, "Comp");
  assert.equal(terminalStep(fixture.steps, undefined).shortName, "Comp");
  assert.equal(terminalStep({}, fixture.pipes), null);
});

test("a trailing step outside the pipeline does not steal the colouring", () => {
  // The case that breaks sort order: an Archive step added after delivery.
  // Nothing feeds it, so the graph still ends at Comp.
  const steps = structuredClone(fixture.steps);
  steps["archive-uuid"] = { shortName: "Archive", type: "shot", order: 99 };
  assert.equal(terminalStep(steps, fixture.pipes).shortName, "Comp");
});

test("the strip can be coloured by a step other than the end", () => {
  const plate = Object.entries(fixture.steps).find(
    ([, s]) => s.shortName === "PLATE"
  )[0];

  const byEnd = showStrip(fixture).flatMap((g) => g.segments);
  const byPlate = showStrip(fixture, plate).flatMap((g) => g.segments);

  assert.equal(byEnd.length, byPlate.length, "same shots either way");
  assert.notDeepEqual(
    byEnd.map((s) => s.color),
    byPlate.map((s) => s.color),
    "colouring by a different step must actually change the colours"
  );

  // Colouring by the end of the pipeline shows the spread of states; PLATE is
  // finished everywhere, so it collapses to a single colour. Idle segments
  // carry no colour at all, so they are counted separately rather than
  // appearing as an extra "colour".
  const colours = (segs) => new Set(segs.filter((s) => !s.idle).map((s) => s.color));
  assert.equal(colours(byEnd).size, 5, "OK, CHK, TODO, RTK and WIP are all in play");
  assert.equal(colours(byPlate).size, 1, "every plate is finished");
  assert.equal(byPlate.filter((s) => s.idle).length, 1, "one shot has no plate");
});

test("the show strip covers the whole project, weighted by length", () => {
  const groups = showStrip(fixture);

  // One group per sequence, and every shot present exactly once.
  assert.equal(groups.length, Object.keys(fixture.sequences).length);
  const segments = groups.flatMap((g) => g.segments);
  assert.equal(segments.length, Object.keys(fixture.shots).length);

  // Two denominators, and getting them confused is what makes a strip stop
  // short of its container. A group is a share of the whole project...
  const byGroup = groups.reduce((n, g) => n + g.width, 0);
  assert.ok(Math.abs(byGroup - 100) < 0.001, "group widths must sum to 100");

  // ...while a segment is a share of its own group, because it is laid out
  // inside a box already sized to that group.
  for (const g of groups) {
    const inner = g.segments.reduce((n, s) => n + s.width, 0);
    assert.ok(
      Math.abs(inner - 100) < 0.001,
      "each group's segments must fill it, got " + inner
    );
  }

  // The strip is coloured by the LAST pipeline step, not the first.
  assert.ok(segments.some((s) => !s.idle), "some shots must carry a colour");
  assert.ok(
    segments.some((s) => s.idle),
    "the reference project has a shot with no work at its last step"
  );
});

test("search matches the way Ramses-Client's does", () => {
  // Same rule as RamObjectSortFilterProxyModel::filterAcceptsRowObject: short
  // name OR name, case-insensitive substring, empty query matches everything.
  const shots = Object.values(fixture.shots);
  assert.equal(shots.length, 51);

  const hit = (q) => shots.filter((s) => matchesSearch(s, q));

  assert.equal(hit("").length, 51, "an empty query is not a filter");
  assert.equal(hit("   ").length, 51, "nor is whitespace");
  assert.equal(hit("0615").length, 1);
  assert.equal(hit("0615")[0].shortName, "0615");

  // A substring, not a prefix: typing the tail of a shot code is the common
  // case when someone reads it out over the phone.
  assert.ok(hit("15").length >= 1, "matches inside the code, not only at the start");
  assert.equal(hit("zzzz").length, 0);

  // Case folds both ways, and the name is searched as well as the short name.
  assert.equal(matchesSearch({ shortName: "SH010", name: "Opening" }, "sh01"), true);
  assert.equal(matchesSearch({ shortName: "SH010", name: "Opening" }, "OPEN"), true);
  assert.equal(matchesSearch({ shortName: "SH010", name: "Opening" }, "closing"), false);

  // Missing fields are not a crash: the payload trims what it sends.
  assert.equal(matchesSearch({}, "x"), false);
  assert.equal(matchesSearch(undefined, ""), true);
});

test("swatch text flips with the state colour", () => {
  assert.equal(textOn("#111111"), "#e8e8e8"); // Nothing to do, near black
  assert.equal(textOn("#55aaff"), "#101010"); // Ready for review, light blue
  assert.equal(textOn(null), "#e8e8e8");
});
