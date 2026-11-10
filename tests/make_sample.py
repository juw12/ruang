"""Render the ground-truth sample room photo into assets/ (sample-room.jpg + sample-room.json)."""
import base64
import json
import sys

from playwright.sync_api import sync_playwright

from harness import ROOT, capture_errors, launch, serve


def main():
    with serve() as base, sync_playwright() as p:
        browser = launch(p)
        page = browser.new_page(viewport={"width": 1280, "height": 960})
        errors = []
        capture_errors(page, errors)
        page.goto(base + "/tests/make_sample.html")
        page.wait_for_function("window.sampleReady === true", timeout=60000)
        result = page.evaluate("window.makeSample()")
        browser.close()
    if errors:
        print("ERRORS:", errors)
        sys.exit(1)
    head, data = result["url"].split(",", 1)
    (ROOT / "assets" / "sample-room.jpg").write_bytes(base64.b64decode(data))
    (ROOT / "assets" / "sample-room.json").write_text(json.dumps(result["meta"], indent=1), encoding="utf-8")
    print("rect", result["meta"]["rect"])
    print("markers", len(result["meta"]["markers"]))


if __name__ == "__main__":
    main()
