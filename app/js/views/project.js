import {
  clockText,
  deadlineText,
  frameCount,
  groupDigits,
  label,
  lastActivity,
  shotSteps,
  sinceText,
  sortShots,
  stateColor,
  stateTally,
  stepCompletion,
  taskFor,
  textOn,
} from "../format.js";

export function projectView(store) {
  return {
    get data() {
      return store.current;
    },
    get steps() {
      return this.data ? shotSteps(this.data.steps) : [];
    },
    /** One column template shared by the summary bars, the sticky header and
     * every lane, so all three stay aligned with the steps they name. */
    get laneCols() {
      return `repeat(${this.steps.length}, minmax(0, 1fr))`;
    },
    get laneStyle() {
      return { gridTemplateColumns: this.laneCols };
    },
    /** Sequences in configured order, each with its shots in natural order. */
    get sequences() {
      if (!this.data) return [];
      return Object.entries(this.data.sequences)
        .map(([uuid, seq]) => ({
          uuid,
          ...seq,
          shots: sortShots(
            Object.entries(this.data.shots)
              .filter(([, s]) => s.sequence === uuid)
              .map(([uuid, s]) => ({ uuid, ...s }))
          ),
        }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },
    /** A shot's length in frames, at its own sequence's rate. */
    frames(shot) {
      return frameCount(shot, this.data.sequences[shot.sequence], this.data.project);
    },
    /** Bare number: the column it sits in is headed "Frames", so repeating
     * the unit on every row of forty is noise. The sequence and project
     * tallies keep their unit, because those run inline with other figures. */
    framesText(shot) {
      return groupDigits(this.frames(shot));
    },
    /** "27 shots / 2 105 f / 1:24" for a sequence or the whole project. */
    tally(shots, sequenceUuid) {
      const seq = sequenceUuid ? this.data.sequences[sequenceUuid] : null;
      const frames = shots.reduce(
        (sum, s) =>
          sum + frameCount(s, seq || this.data.sequences[s.sequence], this.data.project),
        0
      );
      const seconds = shots.reduce((sum, s) => sum + (s.duration || 0), 0);
      return `${shots.length} / ${groupDigits(frames)} f / ${clockText(seconds)}`;
    },
    get projectTally() {
      const shots = Object.entries(this.data.shots).map(([uuid, s]) => ({ uuid, ...s }));
      return this.tally(shots, null);
    },
    get deadline() {
      return deadlineText(this.data.project.deadline);
    },
    /** When anyone last touched this project, as opposed to when this page last
     * fetched it. Both are worth knowing, and they are not the same thing. */
    get lastChange() {
      const at = lastActivity(this.data.statuses);
      return at ? "Last change " + sinceText(at) : "";
    },
    /**
     * The shape of the remaining work at one step, in pipeline order.
     *
     * Each entry carries its state's own colour, so the tally and the lanes
     * below it are visibly the same information counted two ways.
     */
    tallyFor(stepUuid) {
      return stateTally(stepUuid, this.data).map((t) => ({
        count: t.count,
        name: label(t.state),
        color: stateColor(t.state),
      }));
    },
    stepPercent(stepUuid) {
      const r = stepCompletion(stepUuid, this.data);
      return r === null ? "--" : r + "%";
    },
    stepWidth(stepUuid) {
      return (stepCompletion(stepUuid, this.data) ?? 0) + "%";
    },
    /**
     * One segment of a shot's lane.
     *
     * "Idle" covers both no task at all and the nothing-to-do state, because on
     * screen they mean the same thing: this step is not part of this shot's
     * work. Most shots are idle at most steps, so drawing them as full chips
     * buried the states that actually matter under a wall of "NO".
     */
    segment(shotUuid, stepUuid) {
      const task = taskFor(shotUuid, stepUuid, this.data.statuses);
      const state = task ? this.data.states[task.state] ?? null : null;
      const idle = !state || state.shortName === "NO";

      if (idle) return { idle: true, style: {}, label: "" };

      const bg = stateColor(state);
      return {
        idle: false,
        style: { backgroundColor: bg, color: textOn(bg) },
        label: label(state),
      };
    },
    open(shot) {
      store.go("shot", shot.uuid);
    },
    back() {
      store.go("projects");
    },
    label,
  };
}
