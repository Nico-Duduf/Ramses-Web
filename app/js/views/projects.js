import { label, showStrip } from "../format.js";

export function projectsView(store) {
  return {
    get projects() {
      return [...store.projects].sort((a, b) =>
        label(a).localeCompare(label(b), undefined, { numeric: true })
      );
    },
    /** A dash, not a zero: an unreadable project has no figure, not a figure of 0. */
    percent(p) {
      return p.completion === null || p.completion === undefined
        ? "--"
        : p.completion + "%";
    },
    /**
     * The card shows the project's own strip rather than a progress bar.
     *
     * A bar restates the percentage printed next to it. The strip says
     * something the number cannot: where the work is, and how much of the
     * running time each state accounts for.
     */
    strip(p) {
      const overview = store.overviews[p.uuid];
      return overview ? showStrip(overview) : [];
    },
    open(p) {
      store.go("project", p.uuid);
    },
  };
}
