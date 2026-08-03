// The one piece of shared state, registered as an Alpine store.
//
// Deliberately small: a route, a session, the project list, and the overview of
// whichever project is open. Views read from it and call its methods; nothing
// else holds state.

import * as api from "./api.js";
import { projectCompletion } from "./format.js";

/** #/projects | #/project/<uuid> | #/shot/<uuid> */
function parseHash() {
  const [, view = "projects", arg = ""] = window.location.hash.split("/");
  return { view: view || "projects", arg };
}

export function createStore() {
  return {
    route: parseHash(),
    user: null,
    projects: [],
    /** Per project uuid: the ?weboverview payload, cached for this session. */
    overviews: {},
    busy: false,
    error: "",

    get current() {
      return this.overviews[this.route.arg] || null;
    },

    async boot() {
      window.addEventListener("hashchange", () => {
        this.route = parseHash();
        this.refresh();
      });
      // Establishes the session cookie and settles the version handshake before
      // the user has typed anything, so a version mismatch surfaces on the login
      // screen rather than halfway through the first real request.
      try {
        await api.ping();
      } catch (e) {
        this.error = e.message;
      }
    },

    async login(email, password) {
      return this.guard(async () => {
        this.user = await api.login(email, password);
        this.projects = await api.getProjects();
        await this.loadCompletions();
        this.go("projects");
      });
    },

    async logout() {
      await api.logout();
      this.user = null;
      this.projects = [];
      this.overviews = {};
      this.go("projects");
    },

    /**
     * The projects list shows a percentage per project, and the percentage can
     * only be computed from that project's rows, so the list view needs every
     * project's overview.
     *
     * Fine at three people and a handful of projects; each payload is tens of
     * kilobytes. If this list ever grows past that, this is the place to change:
     * either compute the figure in weboverview.php, or drop the bars from the
     * list and show them only once a project is open.
     */
    async loadCompletions() {
      await Promise.all(
        this.projects.map(async (p) => {
          try {
            this.overviews[p.uuid] = await api.overview(p.uuid);
            p.completion = projectCompletion(this.overviews[p.uuid]);
          } catch {
            // One unreadable project must not blank the whole list.
            p.completion = null;
          }
        })
      );
    },

    /** Re-fetch whatever the current route needs. */
    async refresh() {
      if (!api.isAuthenticated()) return;
      const uuid = this.route.arg;
      if (this.route.view === "projects") return this.guard(() => this.loadCompletions());
      if (uuid) {
        return this.guard(async () => {
          this.overviews[uuid] = await api.overview(uuid);
        });
      }
    },

    go(view, arg = "") {
      window.location.hash = "/" + view + (arg ? "/" + arg : "");
    },

    /** Runs a call with the busy flag set and the error surfaced, never thrown. */
    async guard(fn) {
      this.busy = true;
      this.error = "";
      try {
        return await fn();
      } catch (e) {
        this.error = e.message;
      } finally {
        this.busy = false;
      }
    },
  };
}
