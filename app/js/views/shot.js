import {
  label,
  shortDate,
  shotSteps,
  stateColor,
  taskCompletion,
  taskFor,
  textOn,
} from "../format.js";

/**
 * Read-only detail for one shot.
 *
 * The state write lives here too, but is built last: see docs/SPEC.md. Until it
 * exists this view never calls api.setStatus.
 */
export function shotView(store) {
  return {
    /**
     * Which project a shot belongs to is not in the route, so find the loaded
     * overview that contains it. Cheap at this scale, and it survives a reload
     * straight onto a #/shot/ URL as long as the projects have been loaded.
     */
    get data() {
      return Object.values(store.overviews).find((o) => o.shots[this.uuid]) || null;
    },
    get uuid() {
      return store.route.arg;
    },
    get shot() {
      return this.data ? { uuid: this.uuid, ...this.data.shots[this.uuid] } : null;
    },
    get sequence() {
      return this.shot ? this.data.sequences[this.shot.sequence] : null;
    },
    /** One row per shot-production step, whether or not it has a task yet. */
    get rows() {
      if (!this.data) return [];
      return shotSteps(this.data.steps).map((step) => {
        const task = taskFor(this.uuid, step.uuid, this.data.statuses);
        const state = task ? this.data.states[task.state] ?? null : null;
        const color = stateColor(state);
        return {
          step,
          task,
          state,
          swatch: { "background-color": color, color: textOn(color) },
          stateName: state ? label(state) : "",
          completion: task ? taskCompletion(task) : null,
          comment: task?.comment || "",
          modified: shortDate(task?.modified),
        };
      });
    },
    back() {
      const project = Object.entries(store.overviews).find(
        ([, o]) => o.shots[this.uuid]
      );
      store.go(project ? "project" : "projects", project ? project[0] : "");
    },
    label,
  };
}
