// The one piece of shared state, registered as an Alpine store.
//
// Deliberately small: a route, a session, the project list, and the overview of
// whichever project is open. Views read from it and call its methods; nothing
// else holds state.

import * as api from "./api.js";
import { projectCompletion, sinceText } from "./format.js";

const USER_KEY = "ramses.user";

/** #/projects | #/project/<uuid> | #/shot/<uuid> */
function parseHash() {
  const [, view = "projects", arg = ""] = window.location.hash.split("/");
  return { view: view || "projects", arg };
}

function storedUser() {
  try {
    return JSON.parse(window.localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
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
    /** When the data on screen was last fetched, for the "updated" line. */
    updatedAt: null,

    get current() {
      return this.overviews[this.route.arg] || null;
    },

    get since() {
      return sinceText(this.updatedAt);
    },

    /** The project a shot belongs to, which the route does not carry. */
    projectOf(shotUuid) {
      const found = Object.entries(this.overviews).find(
        ([, o]) => o.shots && o.shots[shotUuid]
      );
      return found ? found[0] : "";
    },

    async boot() {
      window.addEventListener("hashchange", () => {
        this.route = parseHash();
        this.refresh();
      });

      // Coming back to the app should show current data, not whatever was on
      // screen when it was last backgrounded. This is what makes the overview
      // "always current" on a phone, where the app is left open for days.
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && this.user) this.refresh();
      });

      // Establishes the session cookie and settles the version handshake before
      // the user has typed anything, so a version mismatch surfaces on the login
      // screen rather than halfway through the first real request.
      try {
        await api.ping();
      } catch (e) {
        this.error = e.message;
        return;
      }

      await this.resume();
    },

    /**
     * Restores a stored session, if the server still honours it.
     *
     * The token outlives the page, but the session behind it may not: it can
     * time out, and it is pinned to the client's IP, so moving between wifi and
     * mobile data invalidates it. The only way to know is to ask, so this makes
     * one real request and falls back to the login screen if it is refused.
     */
    async resume() {
      if (!api.isAuthenticated()) return;

      try {
        const projects = await api.getProjects();
        this.user = storedUser() || { uuid: "" };
        this.projects = projects;
        await this.loadCompletions();
      } catch {
        api.forget();
        window.localStorage.removeItem(USER_KEY);
        this.user = null;
      }
    },

    async login(email, password) {
      return this.guard(async () => {
        this.user = await api.login(email, password);
        window.localStorage.setItem(USER_KEY, JSON.stringify(this.user));
        this.projects = await api.getProjects();
        await this.loadCompletions();
        this.go("projects");
      });
    },

    async logout() {
      await api.logout();
      window.localStorage.removeItem(USER_KEY);
      this.user = null;
      this.projects = [];
      this.overviews = {};
      this.error = "";
      this.go("projects");
    },

    /**
     * The projects list shows a percentage per project, and the percentage can
     * only be computed from that project's rows, so the list view needs every
     * project's overview.
     *
     * Fine at three people and a handful of projects; each payload is tens of
     * kilobytes. If this list ever grows past that, this is the place to change:
     * either compute the figure in weboverview.php, or drop the strips from the
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
      this.updatedAt = new Date();
    },

    /**
     * Re-fetch whatever the current route needs.
     *
     * Note what the shot route does NOT do: ask for an overview of its own
     * argument. A shot route carries a shot uuid, and passing that to
     * ?weboverview asks the server for a project that does not exist, which it
     * correctly refuses. That put a red "you're not assigned to it" banner on
     * every shot the user opened. A shot refreshes the project that contains it.
     */
    async refresh() {
      if (!this.user) return;

      const { view, arg } = this.route;
      const projectUuid =
        view === "project" ? arg : view === "shot" ? this.projectOf(arg) : "";

      if (view === "projects" || !projectUuid) {
        return this.guard(() => this.loadCompletions());
      }

      return this.guard(async () => {
        this.overviews[projectUuid] = await api.overview(projectUuid);
        const project = this.projects.find((p) => p.uuid === projectUuid);
        if (project)
          project.completion = projectCompletion(this.overviews[projectUuid]);
        this.updatedAt = new Date();
      });
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
