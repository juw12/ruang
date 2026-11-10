"""Smoke-test the native Ruang desktop app (Tauri 2 + WebView2), not a browser.

Starts desktop/target/release/ruang.exe with RUANG_DEVTOOLS_PORT (WebView2 remote
debugging), then talks to the app page over the raw Chrome DevTools Protocol
(Playwright's connect_over_cdp does not list WebView2 pages). Checks: the window
loads the embedded web app from tauri.localhost, the app knows it is the desktop
build, the sample room builds a 3D room, share links point at the public web app,
and no JavaScript errors were thrown. Saves hone/shots/12-desktop-app.png.

Usage: python tests/desktop_smoke.py   (needs: pip install websocket-client)
"""
import base64
import itertools
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import websocket  # websocket-client

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "desktop" / "target" / "release" / "ruang.exe"
SHOTS = ROOT / "hone" / "shots"
PORT = 9333
PUBLIC_URL = "https://juw12.github.io/ruang/"


def get_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=5) as response:
        return json.load(response)


def wait_for(predicate, timeout, what):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            value = predicate()
            if value:
                return value
        except Exception:  # noqa: BLE001 - the endpoint is not up yet
            pass
        time.sleep(1)
    raise SystemExit(f"timed out waiting for {what}")


class Page:
    """Minimal CDP client for one page target."""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, suppress_origin=True)
        self.ids = itertools.count(1)
        self.errors = []

    def send(self, method, **params):
        msg_id = next(self.ids)
        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") == msg_id:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})
            self.note_event(message)

    def note_event(self, message):
        method = message.get("method")
        params = message.get("params", {})
        if method == "Runtime.exceptionThrown":
            details = params.get("exceptionDetails", {})
            self.errors.append(details.get("exception", {}).get("description") or details.get("text"))
        elif method == "Runtime.consoleAPICalled" and params.get("type") == "error":
            self.errors.append(" ".join(str(arg.get("value", arg.get("description", ""))) for arg in params.get("args", [])))

    def evaluate(self, expression):
        result = self.send("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"].get("text", "evaluate failed"))
        return result.get("result", {}).get("value")

    def wait_until(self, expression, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.evaluate(expression):
                return True
            time.sleep(0.5)
        return False


def main():
    if not EXE.exists():
        raise SystemExit(f"missing {EXE}; run python desktop/build.py first")
    SHOTS.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env["RUANG_DEVTOOLS_PORT"] = str(PORT)
    env["NO_PROXY"] = "127.0.0.1,localhost"
    app = subprocess.Popen([str(EXE)], env=env)
    results = []

    def check(name, ok, detail=""):
        results.append(bool(ok))
        print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail != "" else ""), flush=True)

    try:
        info = wait_for(lambda: app.poll() is None and get_json("/json/version"), 90, "the WebView2 debug port")
        check("native window started with WebView2", True, info.get("Browser"))
        target = wait_for(
            lambda: next((t for t in get_json("/json/list") if t.get("type") == "page" and "tauri.localhost" in t.get("url", "")), None),
            45,
            "the app page",
        )
        check("app page served from the embedded assets", True, target["url"])
        page = Page(target["webSocketDebuggerUrl"])
        page.send("Runtime.enable")
        page.send("Page.enable")
        check("app finished booting", page.wait_until("document.body && document.body.dataset.ready === '1'", 45))
        check("title", "Ruang" in (page.evaluate("document.title") or ""), page.evaluate("document.title"))
        check("app reports desktop mode", page.evaluate("window.__ruang.isDesktopApp()"))
        check("no service worker inside the desktop app", page.evaluate("!navigator.serviceWorker || !navigator.serviceWorker.controller"))
        check("3D canvas present", page.evaluate("!!document.querySelector('canvas')"))
        page.evaluate("(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); })()")
        page.evaluate("window.__ruang.loadSample()")
        time.sleep(2)
        page.evaluate("window.__ruang.buildFromPhotos()")
        time.sleep(3)
        walls = page.evaluate("(() => { const r = window.__ruang.S.room; return r && r.w > 0 && r.d > 0 ? [r.w, r.d] : null; })()")
        check("sample room builds in the native window (width, depth m)", walls is not None, walls)
        share = page.evaluate("window.__ruang.shareBase()")
        check("share links use the public web app", share == PUBLIC_URL, share)
        shot = page.send("Page.captureScreenshot", format="png")
        (SHOTS / "12-desktop-app.png").write_bytes(base64.b64decode(shot["data"]))
        check("screenshot saved", (SHOTS / "12-desktop-app.png").stat().st_size > 10_000)
        try:
            page.ws.settimeout(1)
            while True:
                page.note_event(json.loads(page.ws.recv()))
        except Exception:  # noqa: BLE001 - drained
            pass
        check("no JavaScript errors", not page.errors, page.errors[:3])
        page.ws.close()
    finally:
        app.terminate()
        try:
            app.wait(timeout=10)
        except Exception:  # noqa: BLE001
            app.kill()
    passed = sum(results)
    print(f"desktop smoke: {passed}/{len(results)} pass", flush=True)
    sys.exit(0 if results and all(results) else 1)


if __name__ == "__main__":
    main()
