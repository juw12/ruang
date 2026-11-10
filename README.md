# Ruang

**Photo of your room in, priced 3D plan out.** Ruang turns one phone photo per wall into a 3D room you can
re-style, rearrange and renovate, then prices the plan in your own currency and checks it the way an
architect would (walking space, door swing, sun, light, budget). It runs entirely on your device: no
account, no API key, and your photos never leave it.

Live: https://juw12.github.io/ruang/

## Install it as an app

| Device | How |
|---|---|
| **Windows 10/11** | Download `Ruang-<version>-windows-x64.exe` from [Releases](https://github.com/juw12/ruang/releases/latest) and run it. One portable file, no installer; it opens in its own window and works offline. Uses the WebView2 runtime that ships with Windows 10/11. The exe is not code-signed yet, so SmartScreen may ask "More info -> Run anyway". |
| **Android** | Open the live link in Chrome -> menu -> **Install app** (or *Add to Home screen*). It gets its own icon, opens full-screen and works offline after the first visit. |
| **iPhone / iPad** | Open the live link in Safari -> Share -> **Add to Home Screen**. |
| **Mac / Linux / Chromebook** | Chrome or Edge -> the install icon in the address bar. |

The desktop app is a [Tauri 2](https://tauri.app) shell around the same code (web assets embedded in the
exe). Share links made in the desktop app point at the public web app so anyone can open them.

Build the exe yourself (needs Rust + the MSVC build tools): `python desktop/build.py` ->
`desktop/target/release/ruang.exe`. CI does the same on every `v*` tag
([.github/workflows/desktop.yml](.github/workflows/desktop.yml)) and smoke-tests the real window
(`tests/desktop_smoke.py`: WebView2 + Playwright over CDP) before attaching the exe to the release.

## How it works

1. **Region + language first.** 24 regions, 7 UI languages (English, Bahasa Indonesia, 繁體中文, 简体中文,
   日本語, 한국어, Español). Currency, units, climate tips and the sun clock follow the region.
2. **Photos -> 3D.** Drag four corners onto the back wall (or keep the auto guess), enter the ceiling
   height, tap furniture and windows/doors. Ruang reconstructs the room with single-view geometry
   ("Tour into the picture", Horry et al. 1997): the back-wall rectangle plus the image centre as vanishing
   point gives room width, camera height and floor positions. Wall, floor and ceiling colours are sampled
   from the photo. One photo per wall fuses into one room. Optional on-device AI detection (DETR via
   transformers.js) can pre-mark furniture.
3. **Look.** Seven render styles: realistic, miniature (tilt-shift), pixel, cartoon (toon + ink outline),
   clay, blueprint and sketch. Photo-3D mode projects your own photo onto the walls.
4. **Arrange.** Drag, rotate, resize, duplicate, delete, undo/redo, 22 catalogue items. Live warnings for
   overlaps, blocked doors and windows, narrow walkways and door swing.
5. **Renovate.** 18 country/style templates (Japandi, Scandinavian, Javanese joglo, Bali tropical, Korean
   hanok, Mediterranean, industrial loft and more), describe-it-in-words (works in all 7 languages), or
   upload a reference photo and Ruang extracts its palette. Before | after split view.
6. **Cost + tips.** Line-item estimate (paint, floor, furniture, lighting, labour) as a low-high range in
   local currency, every price editable and labelled with its source. Architect notes tied to your layout,
   climate and region, plus design and money tips. Every catch comes with a one-tap fix and its cost:
   free moves (clear a window, turn the desk to side light, re-route a blocked path) or a sourced local
   price (add a floor lamp, curtains for sun glare). CSV, PNG, GLB and share-link export.

![Architect notes with one-tap fixes and costs](docs/screens/architect-fixes.jpg)

## Things no other room app bundles

- **Sun clock + direct-sun hours** – NOAA solar position for your city and date, shadows cast through your
  real window openings, and hours of direct sun per piece of furniture (glare on the TV, fading on the sofa).
- **Walking-space heatmap** – grid flood-fill from the door shows reachable floor and the narrowest
  bottleneck in centimetres.
- **Auto-arrange** – simulated annealing over a layout score (clearances, light, door swing, focal walls).
- **Best look for my money** – a knapsack budget optimiser picks the upgrades with the biggest visual impact
  that fit your budget.
- **Rent-safe mode** – renovation plans that use only removable changes (rugs, lamps, peel-and-stick,
  plants, furniture) for tenants.
- **Will it fit through the door?** – checks a new item's smallest cross-section against your door.
- **Culture lens** – optional feng shui or vastu notes, shown as tradition, not science.
- **Walk mode** – explore at eye height (1.6 m) with WASD or the on-screen pad.

## Where the prices come from

US 2026 installed/retail ranges (Angi cost guides, CostPilotUSA, US flooring guides, FurnFull) are scaled
by the World Bank price-level ratio (WDI PA.NUS.PPPC.RF, 2024) for your region and converted at exchange
rates of 9 Nov 2026. Items without a direct source are marked *proxy*; Taiwan has no World Bank value, so
0.55 is assumed and labelled. These are planning ranges, not quotes – the app says so on every total.

## Limits (honest list)

- Room depth is not visible in a single back-wall photo; Ruang assumes the camera stood 0.4 m inside the
  front wall and lets you edit it. On the bundled sample the default depth is 4.55 m against a true 4.2 m.
- Reconstruction assumes a rectangular room and a level phone; strongly tilted photos give worse sizes.
- AI auto-detect downloads a model from Hugging Face on first use; it could not be tested on the build
  network, so treat it as experimental.

## Run locally

Any static file server works, e.g. `python -m http.server` in this folder, then open
http://localhost:8000/. No build step. three.js r160 is vendored in `vendor/three/` (MIT).

## Tests

`python tests/gates.py` (needs Python + Playwright + Microsoft Edge) runs:
- 49 unit checks (photo reconstruction against a rendered ground-truth room, NOAA sun position, knapsack
  vs brute force, flow BFS, price conversion, architect checks, describe-it parsing in 3 languages),
- i18n key coverage for all 7 languages,
- end-to-end: onboarding -> sample photo -> 3D -> 7 styles render and differ -> drag -> template ->
  describe -> cost in local currency -> share-link round trip -> language switch -> 390 px phone layout.

## License

MIT. three.js is MIT (see `vendor/three/LICENSE`).
