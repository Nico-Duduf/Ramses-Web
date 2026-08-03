import { label } from "../format.js";

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
    open(p) {
      store.go("project", p.uuid);
    },
  };
}
