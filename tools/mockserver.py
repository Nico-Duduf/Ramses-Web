# Local stand-in for Ramses-Server, so the UI can be driven without touching
# the live server. Serves app/ at /ramses/app/ and answers the four endpoints
# the app uses, from the anonymised test fixture.
#
#     python tools/mockserver.py 8099

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parent.parent
APP = REPO / "app"
FIXTURE = json.loads((REPO / "tests/fixtures/demo.json").read_text(encoding="utf-8"))

TYPES = {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
    ".json": "application/json", ".map": "application/json",
}


def reply(content, message="ok"):
    return {
        "accepted": True, "success": True, "message": message,
        "query": "mock", "content": content, "serverUuid": "mock", "debug": [],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if not path.startswith("/ramses/app"):
            return self._send(404, b"not here", "text/plain")

        rel = path[len("/ramses/app"):].lstrip("/") or "index.html"
        target = APP / rel
        if not target.is_file():
            return self._send(404, b"missing", "text/plain")

        self._send(200, target.read_bytes(),
                   TYPES.get(target.suffix, "application/octet-stream"))

    def do_POST(self):
        query = urlparse(self.path).query.split("=")[0]
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)

        if query == "ping":
            out = reply({})
        elif query == "weblogin":
            out = reply({
                "uuid": "mock-user", "token": "mock-token",
                "data": json.dumps({"name": "Demo User"}), "role": "admin",
            })
        elif query == "getProjects":
            p = dict(FIXTURE["project"])
            uuid = p.pop("uuid")
            out = reply([{ "uuid": uuid, "modified": "2026-07-15 18:54:23",
                           "removed": 0, "data": json.dumps(p) }])
        elif query == "weboverview":
            out = reply(FIXTURE)
        elif query == "logout":
            out = reply({})
        else:
            out = reply({}, "unhandled: " + query)

        self._send(200, json.dumps(out).encode(), "application/json")


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
print("mock Ramses at http://127.0.0.1:%d/ramses/app/" % port)
HTTPServer(("127.0.0.1", port), Handler).serve_forever()
