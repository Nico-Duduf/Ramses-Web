// Wires the store and the views into Alpine, then starts it.
//
// Alpine is loaded with `defer` from index.html, so registering on
// `alpine:init` is what guarantees these exist before any x-data is evaluated.

import { createStore } from "./store.js";
import { loginView } from "./views/login.js";
import { projectsView } from "./views/projects.js";
import { projectView } from "./views/project.js";
import { shotView } from "./views/shot.js";

document.addEventListener("alpine:init", () => {
  window.Alpine.store("ramses", createStore());
  const store = window.Alpine.store("ramses");

  window.Alpine.data("loginView", () => loginView(store));
  window.Alpine.data("projectsView", () => projectsView(store));
  window.Alpine.data("projectView", () => projectView(store));
  window.Alpine.data("shotView", () => shotView(store));

  store.boot();
});
