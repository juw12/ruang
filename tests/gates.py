"""Ruang hard gates: G1 unit, G2 e2e flow, G4 i18n (inside unit), G6 phone overflow. Writes hone/gates.json + shots.

Run detached (takes ~1-2 min):  python -u tests/gates.py
"""
import io
import json
import sys
import time

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

from harness import ROOT, capture_errors, launch, serve

OUT = ROOT / "hone"
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
STYLES = ["realistic", "miniature", "pixel", "cartoon", "clay", "blueprint", "sketch"]
report = {"gates": {}, "details": {}}


def gate(name, passed, detail=""):
    report["gates"][name] = bool(passed)
    report["details"][name] = detail
    print(("PASS " if passed else "FAIL ") + name + "  " + str(detail)[:300], flush=True)


def img(png):
    return Image.open(io.BytesIO(png)).convert("RGB")


def run_unit(browser, base):
    page = browser.new_page()
    errors = []
    capture_errors(page, errors)
    page.goto(base + "/tests/unit.html")
    page.wait_for_function("window.unitDone === true", timeout=60000)
    results = page.evaluate("window.results")
    page.close()
    failed = [r for r in results if not r["pass"]]
    for r in results:
        print(("  ok  " if r["pass"] else "  XX  ") + r["name"] + "  " + r["detail"], flush=True)
    i18n = [r for r in results if r["name"].startswith("i18n")]
    gate("G1 unit math", not [r for r in failed if not r["name"].startswith("i18n")] and not errors, f"{len(results) - len(failed)}/{len(results)} pass; errors={errors[:3]}")
    gate("G4 i18n coverage", all(r["pass"] for r in i18n), [r["name"] + " " + r["detail"] for r in i18n if not r["pass"]])


def run_e2e(browser, base):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(45000)
    errors = []
    capture_errors(page, errors)
    page.goto(base + "/index.html")
    page.wait_for_selector("#onboard[open]", timeout=30000)
    page.select_option("#selRegion", "ID")
    page.select_option("#selLang", "en")
    page.click("#onboardForm button", force=True)
    page.wait_for_function("document.body.dataset.ready === '1'")
    page.screenshot(path=str(SHOTS / "01-start.png"))
    page.click("#btnSample", force=True)
    page.wait_for_function("window.__ruang.photos().length === 1", timeout=45000)
    time.sleep(0.6)
    page.screenshot(path=str(SHOTS / "02-photo-editor.png"))
    page.click("#btnBuild", force=True)
    time.sleep(1.5)
    room = page.evaluate("window.__ruang.S.room")
    n_items = page.evaluate("window.__ruang.S.items.length")
    page.screenshot(path=str(SHOTS / "03-photo3d.png"))
    ok_dims = abs(room["w"] - 3.6) <= 0.18 and abs(room["h"] - 2.7) < 0.01
    n_marked = page.evaluate("window.__ruang.photos()[0].markers.filter(m => m.type).length")
    gate("G2a photo -> 3D room size", ok_dims and n_items == n_marked and n_items >= 3, f"w={room['w']} d={room['d']} items={n_items}/{n_marked} marked")

    # styles: every style renders non-blank and differs from the others
    page.evaluate("window.__ruang.setMode('model')")
    page.evaluate("window.__ruang.goStep('look')")
    shots = {}
    for s in STYLES:
        print('  style', s, flush=True)
        page.evaluate(f"window.__ruang.setStyle('{s}')")
        time.sleep(0.9)
        data_url = page.evaluate("window.__ruang.viewer.snapshot('image/png')")
        png = __import__("base64").b64decode(data_url.split(",", 1)[1])
        (SHOTS / f"style-{s}.png").write_bytes(png)
        shots[s] = img(png).resize((160, 100))
    blank = [s for s, im in shots.items() if max(ImageStat.Stat(im).stddev) < 6]
    same = []
    for i, a in enumerate(STYLES):
        for b in STYLES[i + 1:]:
            diff = ImageStat.Stat(ImageChops.difference(shots[a], shots[b])).mean
            if sum(diff) / 3 < 4:
                same.append(f"{a}={b}")
    gate("G2b seven styles render and differ", not blank and not same, f"blank={blank} same={same}")
    page.evaluate("window.__ruang.setStyle('realistic')")
    time.sleep(0.4)
    page.screenshot(path=str(SHOTS / "04-look.png"))

    # drag an item with the real mouse
    page.evaluate("window.__ruang.goStep('arrange')")
    page.evaluate("window.__ruang.viewer.setCameraPreset('top')")
    time.sleep(0.8)
    target = page.evaluate("""() => {
      const R = window.__ruang; const v = R.viewer;
      const it = R.S.items.find(x => x.type === 'bed') || R.S.items[0];
      const p = v.camera.position.clone(); const THREE_V = p.constructor;
      const w = new THREE_V(it.x, it.h * 0.9, it.z).project(v.camera);
      const r = v.canvas.getBoundingClientRect();
      return { id: it.id, x: it.x, z: it.z, sx: r.left + (w.x + 1) / 2 * r.width, sy: r.top + (1 - w.y) / 2 * r.height };
    }""")
    page.mouse.move(target["sx"], target["sy"])
    page.mouse.down()
    page.mouse.move(target["sx"] + 40, target["sy"] + 10, steps=6)
    page.mouse.move(target["sx"] + 80, target["sy"] + 20, steps=6)
    page.mouse.up()
    time.sleep(0.5)
    moved = page.evaluate(f"(() => {{ const it = window.__ruang.S.items.find(x => x.id === '{target['id']}'); return [it.x, it.z]; }})()")
    dist = ((moved[0] - target["x"]) ** 2 + (moved[1] - target["z"]) ** 2) ** 0.5
    page.screenshot(path=str(SHOTS / "05-arrange.png"))
    page.click("#btnAuto", force=True)
    time.sleep(0.8)
    page.check("#chkFlow", force=True)
    time.sleep(0.6)
    page.screenshot(path=str(SHOTS / "06-flow.png"))
    gate("G2c drag moves furniture + auto-arrange runs", dist > 0.15, f"moved {dist:.2f} m")

    # renovation from a country template + describe-it
    page.evaluate("window.__ruang.goStep('renovate')")
    page.click("[data-tpl='japandi']", force=True)
    time.sleep(1.2)
    split = page.evaluate("window.__ruang.viewer.mode === 'split' && window.__ruang.viewer.hasAfter")
    page.screenshot(path=str(SHOTS / "07-renovate-split.png"))
    page.evaluate("window.__ruang.S.renoTab = 'describe'; window.__ruang.goStep('renovate')")
    page.fill("#describeBox", "bright scandinavian, more plants, sage green walls")
    page.click("#btnDescribe", force=True)
    time.sleep(0.8)
    tpl = page.evaluate("window.__ruang.S.plan && window.__ruang.S.plan.templateId")
    gate("G2d renovation template + describe", split and tpl == "scandi", f"split={split} describe->{tpl}")

    # cost + tips
    page.evaluate("window.__ruang.goStep('cost')")
    time.sleep(1.0)
    page.screenshot(path=str(SHOTS / "08-cost-tips.png"), full_page=False)
    total = page.inner_text("#costTotal") if page.locator("#costTotal").count() else ""
    notes = page.locator("#notesList li").count()
    gate("G2e cost in local currency + tips", ("Rp" in total or "IDR" in total) and notes >= 3, f"total={total!r} notes={notes}")
    page.click("#btnOptimise", force=True)
    time.sleep(0.4)

    # share link round-trip
    rt = page.evaluate("""async () => {
      const R = window.__ruang; const code = await R.encodeShare(); const back = await R.decodeShare(code);
      return { len: code.length, same: JSON.stringify(back.items) === JSON.stringify(R.S.items) && back.room.w === R.S.room.w };
    }""")
    gate("G2f share link round-trip", rt["same"], f"code length {rt['len']}")

    # language switch: Indonesian UI renders
    page.evaluate("window.__ruang.S.lang = 'id'")
    page.click("#btnRegion", force=True)
    page.select_option("#selLang", "id")
    page.click("#onboardForm button", force=True)
    time.sleep(0.6)
    step_txt = page.inner_text(".steps")
    page.screenshot(path=str(SHOTS / "09-indonesian.png"))
    gate("G2g language switch", "Renovasi" in step_txt, step_txt.replace("\n", " ")[:80])
    gate("G2 no console errors", not errors, errors[:5])
    ctx.close()


def run_phone(browser, base):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errors = []
    capture_errors(page, errors)
    page.goto(base + "/index.html")
    page.wait_for_selector("#onboard[open]", timeout=30000)
    page.screenshot(path=str(SHOTS / "m0-onboard.png"))
    page.click("#onboardForm button", force=True)
    page.wait_for_function("document.body.dataset.ready === '1'")
    worst = 0
    for step in ["photos", "room", "look", "arrange", "renovate", "cost"]:
        page.evaluate(f"window.__ruang.goStep('{step}')")
        time.sleep(0.5)
        sw = page.evaluate("document.documentElement.scrollWidth")
        worst = max(worst, sw)
        page.screenshot(path=str(SHOTS / f"m-{step}.png"))
    gate("G6 phone 390 px no horizontal overflow", worst <= 392 and not errors, f"max scrollWidth={worst} errors={errors[:3]}")
    ctx.close()


def main():
    t0 = time.time()
    with serve() as base, sync_playwright() as p:
        browser = launch(p)
        for fn in (run_unit, run_e2e, run_phone):
            for attempt in (1, 2):
                try:
                    if not browser.is_connected():
                        browser = launch(p)
                    fn(browser, base)
                    break
                except Exception as exc:  # a crash is a failed gate, never a pass
                    infra = "Target page, context or browser has been closed" in str(exc)
                    if infra and attempt == 1:
                        # SwiftShader's GPU process occasionally dies on a loaded machine; that is the
                        # test rig, not the app, so relaunch once and rerun the whole stage from scratch.
                        print(f"  {fn.__name__}: browser died, relaunching once", flush=True)
                        stage_prefix = {"run_unit": ("G1", "G4"), "run_e2e": ("G2",), "run_phone": ("G6",)}[fn.__name__]
                        for key in [k for k in report["gates"] if k.startswith(stage_prefix)]:
                            report["gates"].pop(key)
                            report["details"].pop(key, None)
                        browser = launch(p)
                        continue
                    gate(fn.__name__ + " crashed", False, repr(exc)[:400])
                    break
        browser.close()
    report["seconds"] = round(time.time() - t0, 1)
    report["all_pass"] = all(report["gates"].values())
    (OUT / "gates.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print("ALL PASS" if report["all_pass"] else "SOME FAILED", report["seconds"], "s", flush=True)
    (OUT / "gates.done").write_text("1")
    sys.exit(0 if report["all_pass"] else 1)


if __name__ == "__main__":
    main()
