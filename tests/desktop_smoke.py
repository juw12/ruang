"""Smoke-test the native Ruang desktop app (Tauri + WebView2), not a browser.

Starts desktop/target/release/ruang.exe with RUANG_DEVTOOLS_PORT (WebView2 remote debugging),
attaches Playwright over CDP and checks: the app window loads the embedded
web app, the 3D view renders, the sample room loads, the share link points at
the public web app, and a CSV export download is produced.

Usage: python tests/desktop_smoke.py
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXE = ROOT / "desktop" / "target" / "release" / "ruang.exe"
SHOTS = ROOT / "hone" / "shots"
PORT = 9333


def wait_for_cdp(app, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if app.poll() is not None:
            raise SystemExit(f"ruang.exe exited early with code {app.returncode}")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=3) as response:
                return json.load(response)
        except Exception:
            time.sleep(1)
    # diagnostics for CI: what is on screen, and is WebView2 running at all?
    try:
        from PIL import ImageGrab
        SHOTS.mkdir(parents=True, exist_ok=True)
        ImageGrab.grab().save(SHOTS / "12-desktop-timeout.png")
    except Exception as exc:  # noqa: BLE001
        print("no screen grab:", exc)
    tasks = subprocess.run(["tasklist", "/fi", "imagename eq msedgewebview2.exe"], capture_output=True, text=True)
    print(tasks.stdout[-800:])
    raise SystemExit("WebView2 debugging port never opened")


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
        results.append(ok)
        print(("PASS " if ok else "FAIL ") + name + ("  " + str(detail) if detail else ""), flush=True)

    try:
        info = wait_for_cdp(app)
        check("native window started with WebView2", True, info.get("Browser"))
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
            page = None
            seen = []
            for _ in range(45):
                pages = [pg for ctx in browser.contexts for pg in ctx.pages]
                seen = [pg.url for pg in pages]
                page = next((pg for pg in pages if "tauri.localhost" in pg.url or pg.url.startswith("tauri:")), None)
                if page:
                    break
                time.sleep(1)
            if page is None:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5) as response:
                    targets = [(t.get("type"), t.get("url")) for t in json.load(response)]
                print("pages seen by Playwright:", seen, "CDP targets:", targets, flush=True)
            check("app page served from the embedded assets (tauri.localhost)", page is not None, page.url if page else seen)
            if page is None:
                raise SystemExit(1)
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.wait_for_load_state("load")
            page.wait_for_timeout(2500)
            check("title", "Ruang" in page.title(), page.title())
            check("embedded three.js loaded", page.evaluate("!!document.querySelector('#view canvas')"))
            check("not marked as web install (no service worker)", page.evaluate("!navigator.serviceWorker || !navigator.serviceWorker.controller"))
            page.wait_for_function("document.body.dataset.ready === '1'", timeout=30000)
            check("app reports desktop mode", page.evaluate("window.__ruang.isDesktopApp()"))
            # close onboarding if shown, then load the sample room through the app API
            page.evaluate("""() => {
              const dlg = document.querySelector('dialog[open]');
              if (dlg) dlg.close();
            }""")
            page.evaluate("window.__ruang.loadSample()")
            page.wait_for_timeout(2500)
            page.evaluate("window.__ruang.buildFromPhotos()")
            page.wait_for_timeout(2500)
            walls = page.evaluate("(() => { const r = window.__ruang.S.room; return r && r.w > 0 && r.d > 0 ? [r.w, r.d] : null; })()")
            check("sample room builds in the native window", walls is not None, walls)
            page.screenshot(path=str(SHOTS / "12-desktop-app.png"))
            share = page.evaluate("window.__ruang.shareBase()")
            check("share links use the public web app", share == "https://juw12.github.io/ruang/", share)
            # CSV export download through the WebView2 download path
            page.evaluate("""() => {
              const blob = new Blob(['a,b\\n1,2'], {type: 'text/csv'});
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'ruang-desktop-test.csv';
              document.body.append(a);
              a.click();
            }""")
            downloads = Path.home() / "Downloads"
            downloads.mkdir(exist_ok=True)
            found = None
            for _ in range(20):
                hits = sorted(downloads.glob("ruang-desktop-test*.csv"), key=lambda f: f.stat().st_mtime)
                if hits:
                    found = hits[-1]
                    break
                time.sleep(0.5)
            check("file export downloads in the app", found is not None, found)
            if found:
                found.unlink()
            check("no console errors", not errors, errors[:3])
            browser.close()
    finally:
        app.terminate()
        try:
            app.wait(timeout=10)
        except Exception:
            app.kill()
    passed = sum(results)
    print(f"desktop smoke: {passed}/{len(results)} pass", flush=True)
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
