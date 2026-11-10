# Ruang /hone run log (2026-11-10)

Goal beyond the goal: a free, no-sign-up "architect in your pocket" that turns one phone photo into a room you can
re-style, rearrange and price in your own currency, with checks a real architect would make (circulation, sun,
fit-through-door, budget) instead of only pretty pictures.

## Run queue
- [x] Q1 Region + language first (24 regions, 7 languages), currency + units follow region
- [x] Q2 Photos -> 3D: tour-into-the-picture reconstruction (back-wall rectangle), room size from photo, wall/floor colour sampling, tap-to-mark furniture, optional on-device AI auto-detect, multi-photo (one per wall)
- [x] Q3 Render styles: realistic, miniature, pixel, cartoon, clay, blueprint, sketch
- [x] Q4 Rearrange: drag, rotate, resize, add/delete, snap, collision, undo/redo
- [x] Q5 Renovation: country templates, describe-in-words, reference-photo palette, before/after split
- [x] Q6 Estimated price in local currency with sources, editable unit prices
- [x] Q7 Architect tips: layout checks + climate/region + style + money tips
- [x] Q8 New features nobody bundles: sun clock + direct-sun hours, flow heatmap, auto-arrange, budget optimiser, rent-safe mode, fit-through-door, culture lens, walk mode, share link, GLB/PNG/CSV export
- [x] Q9 Tests: unit (math) + e2e smoke + i18n coverage + slop check + mobile overflow
- [x] Q10 /hone loop with council judge
- [ ] Q11 Ship: repo juw12/ruang + Pages, profile README, portfolio card, landing page, Obsidian notes, precedent log

## Assumptions
- Assumed: name "Ruang" (Indonesian for room/space), web app on GitHub Pages, no account, no API key, photos never leave the device.
- Assumed: photo -> 3D uses deterministic single-view geometry (Horry et al. 1997 "Tour into the picture": back-wall rectangle + vanishing point, 26 mm-equivalent phone lens, user-entered ceiling height 2.6 m default). AI auto-detect (transformers.js DETR) is optional because the model download is blocked on this office network, so it is unverified here.
- Assumed: prices = US 2026 installed/retail ranges (Angi, CostPilotUSA, FurnFull and others) x World Bank 2024 price-level ratio (PA.NUS.PPPC.RF), converted at 9 Nov 2026 rates. Taiwan has no World Bank value: 0.55 assumed (between China 0.49 and Korea 0.59) and labelled in-app. Items without a sourced price are labelled "proxy".
- Assumed: 7 UI languages (en, id, zh-TW, zh-CN, ja, ko, es); tips translated in the same 7.
- Assumed: feng shui / vastu shown as "tradition" lenses, never as science.

## Rubric v1 (frozen before building)
Hard gates (checker, code):
- G1 unit tests pass: photo reconstruction recovers a rendered room's width/height within 5 %, sun position within 1 deg of NOAA reference, knapsack equals brute force, flow BFS, price conversion.
- G2 e2e smoke passes with 0 console errors: onboarding -> sample photo -> 3D -> all 7 styles render non-blank and differ -> drag moves an item -> template applies -> cost shows local currency -> tips list non-empty -> share link round-trip.
- G3 slop_check: 0 blockers.
- G4 i18n: 100 % key coverage in all 7 languages.
- G5 every price shown carries a source or "proxy"/"assumed" label.
- G6 390 px wide: no horizontal overflow; one obvious primary action per step.
- G7 no purple/indigo; text contrast AA.
Soft criteria (judge, anchors 4 / 7 / 10):
- C1 Photo -> 3D credibility (4: flat photo on a box; 7: recognisable room, sizes plausible; 10: feels like your room, measurements you would trust) w 0.25
- C2 Style rendering (4: colour swaps; 7: 7 distinct looks; 10: each style looks hand-made for its genre) w 0.20
- C3 Flow + clarity (4: confusing; 7: clear steps; 10: a first-time user finishes photo -> priced plan without help) w 0.20
- C4 Architect intelligence (4: generic tips; 7: tips tied to the layout + region; 10: catches what a pro would, with fixes and costs) w 0.20
- C5 Visual design (4: template look; 7: coherent, not AI-looking; 10: distinctive drafting-table identity) w 0.15

- Assumed: style-step thumbnails are pre-rendered images of the sample room (static files) instead of live renders, to avoid a race with the shared viewer.
- Assumed: the viewer renders on demand (on change + 1 fps heartbeat) to save battery and keep SwiftShader CI stable.
- Assumed: default room depth comes from the 26 mm lens guess; on the sample it reads 4.55 m vs 4.2 m truth (8 % long) - user can type the real depth.

## Gate results
| date | G1 unit | G2 e2e | G3 slop | G4 i18n | G5 labels | G6 390px | G7 colour | note |
|---|---|---|---|---|---|---|---|---|
| 2026-11-10 | 49/49 | pass (w 3.6, d 4.55, 3/3 items, 7 styles distinct, drag 0.76 m, auto-arrange 20->89, template+describe, cost Rp 14.8M-85.6M + 5 notes, share round-trip, Indonesian, 0 console errors) | 0 blockers / 0 warnings | 100 % | pass | no overflow | pass | baseline after race + raycast fixes |
| 2026-11-10 r1 | 54/54 | pass (all G2 stages, 0 console errors) | 0 blockers | 100 % | pass | no overflow | pass | one-tap fixes + costs, depth hint, drafting grid; caught + fixed turn-desk placement bug via new unit test |

## Council
| round | mode | result | note |
|---|---|---|---|
| r0 baseline | score | 7.4 (C1 7, C2 7, C3 8, C4 8, C5 7), 3 judges, spread <= 2 | top fixes: fixes+costs on every catch, depth confidence, genre-specific styles, drafting identity |
| r1 | pair vs r0 | B wins 3-0, every vote survived the order swap | kept |

Stopped: r1 kept; remaining judge asks (genre geometry per style, scale priors from door/window size for depth) are multi-day items -> Queue.md.
