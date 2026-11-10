"""Shared Playwright helpers for Ruang tests: local static server + WebGL-capable headless Chromium."""
import contextlib
import functools
import http.server
import os
import socket
import sys
import threading

sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(key, None)
os.environ["NO_PROXY"] = "*"

CHROME_ARGS = [
    "--no-proxy-server",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


QuietHandler.extensions_map.update({".js": "text/javascript", ".mjs": "text/javascript", ".webmanifest": "application/manifest+json"})


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def serve(root=ROOT):
    port = free_port()
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()


def launch(p, **kw):
    return p.chromium.launch(headless=True, channel="msedge", args=CHROME_ARGS, **kw)


def capture_errors(page, errors):
    """Collect page errors, console errors and failed requests (favicon excluded)."""
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

    def on_console(m):
        if m.type == "error" and "Failed to load resource" not in m.text:
            errors.append("console: " + m.text)

    def on_response(r):
        if r.status >= 400 and not r.url.endswith("favicon.ico"):
            errors.append(f"http {r.status}: {r.url}")

    page.on("console", on_console)
    page.on("response", on_response)
