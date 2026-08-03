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

/**
 * The frame rate that actually applies to a shot.
 *
 * A sequence may override the project's rate, and Ramses stores the override
 * value whether or not the flag is set, so the flag is what decides. Falls back
 * to the project, then to 25: a wrong-but-stated rate is more useful here than
 * a blank, because the shot list is scanned for relative size, not audited.
 */
export function framerateFor(sequence, project) {
  if (sequence?.overrideFramerate && sequence.framerate) return sequence.framerate;
  return project?.framerate || 25;
}

/**
 * A shot's length in frames.
 *
 * Durations are stored in seconds, but nobody in the building talks in seconds:
 * bids, retakes and delivery are all counted in frames. Rounded, not floored,
 * because a 3.98 second shot at 25 is 100 frames and calling it 99 would be
 * wrong in the direction that matters.
 */
export function frameCount(shot, sequence, project) {
  return Math.round((shot?.duration || 0) * framerateFor(sequence, project));
}

/**
 * 3204 -> "3 204", so long frame counts stay scannable.
 *
 * Grouped by hand with an explicit ASCII space, not through toLocaleString,
 * which separates with a comma in some locales and a non-breaking space in
 * others. The first version of this used a thin space that was invisible in the
 * source and in the diff, and made the function fail its own test with
 * "4 201" !== "4 201".
 */
export function groupDigits(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Seconds -> "48 s" under a minute, "2:08" beyond it. */
export function clockText(seconds) {
  const total = Math.round(seconds || 0);
  if (total < 60) return total + " s";
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

/**
 * The server stamps `modified` as UTC without saying so, in the SQL shape
 * "2026-07-13 15:38:53". Safari refuses that string outright and Chrome reads
 * it as local time, which is an hour or two of silent drift.
 */
export function parseStamp(stamp) {
  if (!stamp) return null;
  const d = new Date(String(stamp).replace(" ", "T") + "Z");
  return isNaN(d) ? null : d;
}

/** The most recent change to any task, or null if there are none. */
export function lastActivity(statuses) {
  let latest = null;
  for (const s of statuses || []) {
    const d = parseStamp(s.modified);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/**
 * How the remaining work at one step is distributed, least finished first.
 *
 * A percentage says how far along a step is; it cannot say whether what is left
 * is forty untouched shots or two in review.
 *
 * Ordered by each state's own completionRatio, so the tally always reads from
 * least done to most done: TODO, then WIP, then RTK, then CHK, then OK. An
 * earlier version sorted on the state's `order` field, which is not in the
 * payload at all, so every key was undefined and the sort did nothing while
 * claiming to be in pipeline order. Completion is the better key regardless:
 * it is what the reader actually wants ranked, and it needs no new field.
 *
 * States with no ratio of their own (WIP is one) sort at 50, the same default
 * taskCompletion applies, which lands them between started and finished.
 */
export function stateTally(stepUuid, { statuses, states, shots }) {
  const counts = new Map();
  for (const s of statuses) {
    if (s.step !== stepUuid || s.itemType !== "shot" || !shots[s.item]) continue;
    const state = states[s.state];
    if (!state || state.shortName === "NO") continue;
    counts.set(s.state, (counts.get(s.state) || 0) + 1);
  }

  const rank = (state) =>
    typeof state.completionRatio === "number" ? state.completionRatio : 50;

  return [...counts.entries()]
    .map(([uuid, count]) => ({ count, state: states[uuid] }))
    .sort((a, b) => rank(a.state) - rank(b.state));
}

/**
 * "Deadline 13 Jul, in 9 days".
 *
 * Stated, never judged: this app deliberately has no behind-schedule
 * detection, so a passed deadline reads as a fact in the same dim type as any
 * other, not as an alarm. Whole days from local midnight, so "today" means
 * today rather than "within 24 hours".
 */
export function deadlineText(deadline, now = new Date()) {
  if (!deadline) return "";
  const due = new Date(String(deadline) + "T00:00:00");
  if (isNaN(due)) return "";

  const label = due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - midnight) / 86400000);

  if (days === 0) return "Deadline " + label + ", today";
  const n = Math.abs(days);
  const unit = n === 1 ? " day" : " days";
  return "Deadline " + label + (days > 0 ? ", in " + n + unit : ", " + n + unit + " ago");
}

/**
 * How long ago the data on screen was fetched.
 *
 * Deliberately coarse. The exact second is never the question; "is this
 * current?" is, and "just now" answers it faster than a timestamp does.
 */
export function sinceText(date) {
  if (!date) return "";
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + (minutes === 1 ? " min ago" : " min ago");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  return Math.round(hours / 24) + " days ago";
}

/**
 * "2026-07-13 15:38:53" (UTC, as the server stamps it) -> "13 Jul, 15:38".
 *
 * Pinned to en-GB rather than the browser's locale. Following the browser meant
 * a German phone rendered "13. Juli, 15:38" inside an otherwise English
 * interface, which reads as a bug rather than as localisation. The whole app is
 * one language, so its dates are too. Day before month, and 24 hour time, both
 * because that is what the studio uses and what every other Ramses tool shows.
 *
 * The timezone stays local: the question is always "when did this change,
 * relative to my day", never "what did the server's clock say".
 */
export function shortDate(stamp) {
  const d = parseStamp(stamp);
  if (!d) return stamp || "";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
