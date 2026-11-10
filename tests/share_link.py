import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from harness import launch, serve

OUT = Path(__file__).resolve().parent.parent / "hone" / "share_code.txt"
with serve() as base, sync_playwright() as p:
    browser = launch(p)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.set_default_timeout(45000)
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
    page.evaluate("window.__ruang.goStep('arrange')")
    page.click("#btnAuto", force=True)
    time.sleep(1.0)
    code = page.evaluate("window.__ruang.encodeShare()")
    OUT.write_text(code, encoding="utf-8")
    print("share code length", len(code))
    browser.close()
