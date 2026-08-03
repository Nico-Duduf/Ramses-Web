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
    /** The state row for one shot at one step, or null when there is no task. */
    state(shotUuid, stepUuid) {
      const task = taskFor(shotUuid, stepUuid, this.data.statuses);
      return task ? this.data.states[task.state] ?? null : null;
    },
    swatch(shotUuid, stepUuid) {
      const bg = stateColor(this.state(shotUuid, stepUuid));
      return { "background-color": bg, color: textOn(bg) };
    },
    stateName(shotUuid, stepUuid) {
      return label(this.state(shotUuid, stepUuid)) === "?"
        ? ""
        : label(this.state(shotUuid, stepUuid));
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
