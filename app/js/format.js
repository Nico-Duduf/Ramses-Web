// Completion figures, colours and labels.
//
// Pure functions, no DOM and no fetch, so tests/format.test.js can import this
// under `node --test` without a browser.
//
// The completion formula mirrors Ramses-Client. If the numbers here disagree
// with the ones on the desktop, this file is wrong, not the desktop. The C++ it
// reproduces, for when it needs re-checking:
//
//   RamStatus::completionRatio()             ramobjects/ramstatus.cpp:45
//       getData("completionRatio").toInt(50)   <- note the default of 50
//   RamTaskTableModel::updateStepEstimCache  ramobjectmodels/ramtasktablemodel.cpp:535
//       returns early when the state shortName is "NO", then accumulates
//       completionRatio and total, and StepEstimation divides one by the other
//   RamProject::updateEstimation             ramobjects/ramproject.cpp:515
//       averages the steps, skipping any that is not Shot/AssetProduction,
//       and yields 100 when there are none
//
// The divisions are integer divisions because the C++ accumulates into ints.

/** RamStatus::completionRatio() - absent means 50, not 0. */
export function taskCompletion(status) {
  const raw = status?.completionRatio;
  return typeof raw === "number" ? raw : 50;
}

/**
 * Tasks that count towards a step's completion.
 *
 * Two exclusions, both load-bearing:
 *
 *  - state "NO" (nothing to do). Ramses-Client returns early on it. On the
 *    reference project that is 74 of 165 statuses, so including them would
 *    roughly halve every step.
 *
 *  - orphans, whose item is not in `shots`. Ramses-Client cannot hit these
 *    because it builds its task table by walking the item list, so a status
 *    left behind by a deleted shot is simply never visited. Here the statuses
 *    arrive as a flat list and the orphan has to be dropped by hand. One such
 *    row (`SH010 | Plate`, at 0%) was enough to report a fully finished plate
 *    step as 97%.
 */
function countableTasks(statuses, states, shots) {
  return statuses.filter((s) => {
    if (s.itemType !== "shot") return false;
    if (!shots[s.item]) return false;
    return states[s.state]?.shortName !== "NO";
  });
}

/**
 * Integer mean completion of one step, or null when the step has no countable
 * task at all.
 *
 * null rather than 0: "every shot at this step is marked nothing-to-do" and
 * "no shot has been started" are different things, and a bar pinned at 0 would
 * claim the second. The views render null as a dash.
 */
export function stepCompletion(stepUuid, { statuses, states, shots }) {
  const tasks = countableTasks(statuses, states, shots).filter(
    (s) => s.step === stepUuid
  );
  if (tasks.length === 0) return null;
  const sum = tasks.reduce((acc, s) => acc + taskCompletion(s), 0);
  return Math.floor(sum / tasks.length);
}

/**
 * Integer mean over the shot-production steps.
 *
 * 100 when the project has no such step, matching RamProject::updateEstimation,
 * which reads as "nothing to do, so nothing outstanding".
 *
 * Steps with no countable task are skipped rather than counted as zero, for the
 * same reason stepCompletion returns null.
 */
export function projectCompletion({ steps, statuses, states, shots }) {
  const ratios = shotSteps(steps)
    .map((step) => stepCompletion(step.uuid, { statuses, states, shots }))
    .filter((r) => r !== null);

  if (ratios.length === 0) return 100;
  return Math.floor(ratios.reduce((a, b) => a + b, 0) / ratios.length);
}

/** Shot-production steps, in their configured order. */
export function shotSteps(steps) {
  return Object.entries(steps)
    .filter(([, s]) => s.type === "shot")
    .map(([uuid, s]) => ({ uuid, ...s }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** The status for one shot at one step, or undefined if there is none yet. */
export function taskFor(shotUuid, stepUuid, statuses) {
  return statuses.find((s) => s.item === shotUuid && s.step === stepUuid);
}

/**
 * A state's colour, straight from the server's RamState row.
 *
 * Never hardcode these: a state recoloured in Ramses-Client must recolour here
 * too. Some rows genuinely have no colour (the built-in "New state" is one), so
 * fall back to the neutral swatch.
 */
export function stateColor(state) {
  return state?.color || "#3a3a3a";
}

/**
 * Readable text on a state swatch.
 *
 * The states range from #111111 to #55aaff, so a fixed foreground fails at one
 * end or the other. Rec. 601 luma, thresholded where the mid-grey states stop
 * being readable on black.
 */
export function textOn(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#e8e8e8";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? "#101010" : "#e8e8e8";
}

/** Sequence, shot, step and state rows all label themselves the same way. */
export function label(obj) {
  return obj?.shortName || obj?.name || "?";
}

/**
 * Shots in natural order.
 *
 * String comparison puts SH10 before SH9, which is the exact bug that had to be
 * fixed in Ramses-Out's shot table. Compare digit runs numerically.
 */
export function sortShots(shots) {
  const key = (s) => label(s);
  return [...shots].sort((a, b) =>
    key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: "base" })
  );
}

/** "2026-07-13 15:38:53" (UTC, as the server stamps it) -> "13 Jul, 15:38". */
export function shortDate(stamp) {
  if (!stamp) return "";
  const d = new Date(stamp.replace(" ", "T") + "Z");
  if (isNaN(d)) return stamp;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
