import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from harness import launch, serve, capture_errors

SHOTS = Path(__file__).resolve().parent.parent / "hone" / "shots"

with serve() as base, sync_playwright() as p:
    browser = launch(p)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.set_default_timeout(45000)
    errors = []
    capture_errors(page, errors)
    page.goto(base + "/index.html")
    page.wait_for_selector("#onboard[open]", timeout=45000)
    page.select_option("#selRegion", "ID")
    page.select_option("#selLang", "en")
    page.click("#onboardForm button", force=True)
    page.wait_for_function("document.body.dataset.ready === '1'")
    page.click("#btnSample", force=True)
    page.wait_for_function("window.__ruang.photos().length === 1", timeout=30000)
    page.click("#btnBuild", force=True)
    time.sleep(1.5)
    page.evaluate("window.__ruang.goStep('room')")
    time.sleep(0.6)
    page.screenshot(path=str(SHOTS / "10-room-depth-hint.png"))
    page.evaluate("window.__ruang.goStep('cost')")
    time.sleep(1.2)
    page.evaluate("document.getElementById('notesList').scrollIntoView({block: 'start'})")
    time.sleep(0.5)
    page.screenshot(path=str(SHOTS / "11-architect-fixes.png"))
    print("fix rows:", page.locator("#notesList .fixrow").count())
    print("errors:", errors)
    browser.close()
