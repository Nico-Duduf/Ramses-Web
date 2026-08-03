import {
  label,
  shotSteps,
  sortShots,
  stateColor,
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
