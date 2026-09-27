import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8080))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        ".html": "text/html",
        ".htm": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".txt": "text/plain",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    # Friendly slugs (mirrors production api/index.py SLUGS/LEGACY).
    SLUGS = {
        "home": "index.html",
        "login": "login.html",
        "signup": "register.html",
        "find-schemes": "questionnaire.html",
        "my-schemes": "results.html",
        "scheme": "scheme-details.html",
        "saved": "saved-schemes.html",
        "emi-calculator": "calculator.html",
        "partners": "partners.html",
        "profile": "profile-view.html",
        "profile/edit": "profile.html",
        "oauth/callback": "oauth/callback.html",
    }
    LEGACY = {
        "index": "home",
        "register": "signup",
        "questionnaire": "find-schemes",
        "results": "my-schemes",
        "scheme-details": "scheme",
        "saved-schemes": "saved",
        "calculator": "emi-calculator",
        "profile-view": "profile",
    }

    def _redirect(self, target):
        qs = self.path.split("?", 1)[1] if "?" in self.path else ""
        self.send_response(301)
        self.send_header("Location", target + ("?" + qs if qs else ""))
        self.end_headers()

    def do_GET(self):
        raw = self.path.split("?", 1)[0].rstrip("/")
        if raw in ("", "/", "/home", "/index.html"):
            self.path = "/index.html"
        elif raw == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        else:
            stripped = raw.lstrip("/")
            if stripped.endswith(".html"):
                legacy = stripped[:-5] or "index"
                self._redirect("/" + self.LEGACY.get(legacy, legacy))
                return
            if stripped in self.LEGACY:
                self._redirect("/" + self.LEGACY[stripped])
                return
            if stripped in self.SLUGS:
                self.path = "/" + self.SLUGS[stripped] + self.path[len(raw):]
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("VittVanni frontend running at http://127.0.0.1:%d" % PORT)
    print("Backend expected at http://127.0.0.1:8001  (see js/api.js)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()