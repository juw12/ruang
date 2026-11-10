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
- C1 Photo -> 3D credibility (w=0.25): 4: flat photo on a box; 7: recognisable room, sizes plausible; 10: feels like your room, measurements you would trust
- C2 Style rendering (w=0.20): 4: colour swaps; 7: 7 distinct looks; 10: each style looks hand-made for its genre
- C3 Flow + clarity (w=0.20): 4: confusing; 7: clear steps; 10: a first-time user finishes photo -> priced plan without help
- C4 Architect intelligence (w=0.20): 4: generic tips; 7: tips tied to the layout + region; 10: catches what a pro would, with fixes and costs
- C5 Visual design (w=0.15): 4: template look; 7: coherent, not AI-looking; 10: distinctive drafting-table identity
