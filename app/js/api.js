// The Ramses-Server API, as this app uses it.
//
// Everything the server accepts is a POST with a JSON body, where the endpoint
// name is a bare query-string flag rather than a path or a field:
//
//     POST /ramses/?weboverview
//     Content-Type: application/json
//     {"token": "...", "version": "0.9.0", "project": "..."}
//
// (functions.php:411 - hasArg() reads $_GET, acceptReply() dispatches on it.)
//
// Replies are always the same envelope, from reply.php:
//
//     {accepted, success, message, query, content, serverUuid, debug}
//
// `accepted` false means the server would not even look at the request, which
// in practice means the version gate rejected it. `success` false means it
// looked and refused. Both come back as a thrown ApiError here, so callers only
// ever deal with content.

/** The API lives one level above the app: /ramses/app/ -> /ramses/ */
const BASE = new URL("../", window.location.href).href;

/**
 * Sent until the server tells us otherwise.
 *
 * check_client_version.php compares major.minor against its own and rejects
 * anything else *before* login, so there is no way to ask politely first. The
 * rejection helpfully carries the real version in content.version, so the first
 * request that gets refused teaches us what to send, and request() retries once.
 * Persisted so a reload does not repeat the handshake.
 */
let apiVersion = window.localStorage.getItem("ramses.version") || "0.0.0";

/**
 * The session token, kept in localStorage.
 *
 * It used to live only in this variable, which meant every reload signed you
 * out even though the PHP session cookie was still perfectly valid. On a phone
 * that is constant: locking the screen, switching apps or returning to the tab
 * all discard the page.
 *
 * The token is useless on its own. The server compares it against the session
 * it issued, and that session is bound to a `secure` cookie and pinned to the
 * client's IP, so a copied token cannot be replayed from anywhere else. What is
 * stored here is a handle to a session, not a credential: the password is never
 * written down, and logging out clears it.
 */
const TOKEN_KEY = "ramses.token";
let token = window.localStorage.getItem(TOKEN_KEY) || "";

function setToken(value) {
  token = value || "";
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, reply) {
    super(message);
    this.name = "ApiError";
    this.reply = reply;
  }
}

/** True once login() has succeeded in this browser session. */
export function isAuthenticated() {
  return token !== "";
}

async function request(query, args = {}, { retryOnVersion = true } = {}) {
  let response;
  try {
    response = await fetch(BASE + "?" + query, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The PHP session cookie is what actually authenticates us; the token
      // only proves this request belongs to that session.
      credentials: "same-origin",
      body: JSON.stringify({ version: apiVersion, token, ...args }),
    });
  } catch (e) {
    throw new ApiError("Cannot reach the Ramses server. " + e.message, null);
  }

  // Parse by hand rather than response.json(), to tell "the server is not
  // there" apart from "something answered, but it was not the API".
  //
  // The second is the likelier mistake and the one whose default message is
  // useless: a misplaced deployment gets an HTML page back and reports a JSON
  // syntax error at character 1, which reads like a bug in this app.
  const body = await response.text();
  let reply;
  try {
    reply = JSON.parse(body);
  } catch {
    throw new ApiError(
      "The server answered with " +
        (body.trimStart().startsWith("<") ? "a web page" : "something") +
        " instead of JSON (HTTP " +
        response.status +
        " from " +
        BASE +
        "). The app has to sit one level below the Ramses API, same origin.",
      null
    );
  }

  if (reply.accepted === false) {
    const served = reply.content?.version;
    if (served && retryOnVersion && served !== apiVersion) {
      apiVersion = served;
      window.localStorage.setItem("ramses.version", served);
      return request(query, args, { retryOnVersion: false });
    }
    throw new ApiError(reply.message || "The server refused the request.", reply);
  }

  if (!reply.success) {
    throw new ApiError(reply.message || "The request failed.", reply);
  }

  return reply.content;
}

/**
 * Starts a session.
 *
 * Mandatory before anything else: the server hands out its session cookie here.
 * Also the cheapest way to learn the version without burning a login attempt.
 */
export async function ping() {
  return request("ping");
}

/**
 * Logs in with a plain password over HTTPS.
 *
 * The pepper (`clientKey`) that Ramses-Client folds into the password never
 * reaches the browser; ?weblogin applies it server-side. See server/README.md.
 */
export async function login(email, password) {
  const content = await request("weblogin", { email, password });
  setToken(content.token);
  return {
    uuid: content.uuid,
    role: content.role,
    ...safeParse(content.data),
  };
}

export async function logout() {
  try {
    await request("logout");
  } finally {
    setToken("");
  }
}

/** Drops the stored token without telling the server. For a session the server
 * has already forgotten, where ?logout would only fail again. */
export function forget() {
  setToken("");
}

/** Projects this user is assigned to. Uses the server's existing endpoint. */
export async function getProjects() {
  const rows = await request("getProjects");
  return rows
    .filter((r) => !r.removed)
    .map((r) => ({ uuid: r.uuid, modified: r.modified, ...safeParse(r.data) }));
}

/**
 * Everything one project's views need, in one request.
 *
 * Deliberately not the sync API. Reading through sync means sync -> push (to
 * commit) -> fetch -> pull, page by page, and reimplementing the client's merge
 * logic in the browser. This is a few tens of kilobytes of already-filtered rows
 * instead, and it keeps the completion formula in exactly one place.
 */
export async function overview(projectUuid) {
  return request("weboverview", { project: projectUuid });
}

/**
 * The one write: set a shot step's state, with an optional comment.
 *
 * The browser does not build the status row or orchestrate a sync push; the
 * endpoint writes one RamStatus with a server-stamped `modified`, so the clock
 * comes from the same place every other client's does.
 */
export async function setStatus({ project, shot, step, state, comment = "" }) {
  return request("setstatus", { project, shot, step, state, comment });
}

function safeParse(json) {
  if (!json) return {};
  try {
    return typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return {};
  }
}
