"""Local dev server.

Serves public/ as the site root and additionally exposes admin/ at /admin.html
and /admin.js. The admin files live outside public/ on purpose: whatever is in
public/ is exactly what `wrangler deploy` uploads, so the admin panel cannot
reach the internet by accident.

    python tools/serve.py [port]
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
ADMIN = os.path.join(ROOT, "admin")
LOCAL_ONLY = {"/admin.html": "admin.html", "/admin.js": "admin.js", "/admin": "admin.html"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PUBLIC, **kw)

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean in LOCAL_ONLY:
            return os.path.join(ADMIN, LOCAL_ONLY[clean])
        return super().translate_path(path)

    def end_headers(self):
        # Schedules get edited and reloaded constantly during dev; a stale JSON
        # from the disk cache wastes more time than the requests cost.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f"site  http://127.0.0.1:{port}/")
    print(f"admin http://127.0.0.1:{port}/admin.html")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
