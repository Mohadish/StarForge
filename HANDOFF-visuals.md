# Handoff — ship visuals (painter, turrets, skins in the battle lab)

Written 2026-10-08 by the "ship look" chat for the game-development chat. Both chats edit THIS folder; nothing here lives anywhere else except the two published pages.

## What exists now
- **Painter** `paint.html` + `src/eon/painter.js` (page), `src/eon/paint.js` (the engine), `src/eon/styles.js` (20 plating styles, 10 deco sheets, 8 turret sheets — all in `assets/parts/*.webp`, 15 MB), `src/eon/shapeedit.js` (outline editor on the canvas; library key `forge.eon.hulls.v1`, shared with the game).
- **Locked recipe** (his settings) lives in `paint.js` `RECIPE` / `recipeFor(volume)`: outer ribbon 47 % −3 %/500 volume, core 67 %, spine 61 %, inner rings ×1.75, engines ×1.32 (one per 280 volume), greebles ×1.6, mounts ×1, turrets ×1. Pitch always 1. Two colours: a depth WASH (outline → core, bright greys only, never on engine cones) and LIGHTS (top 4 % specks bloomed).
- **Hard points**: `hull.js hardPoints(hull, guns, room)` is the single rule (game + painter). The painter puts a style's turret MOUNT under each (capped at 42 % of the hull's half-width there) and draws the style's TURRET on top (beams/guns pivot, launcher fixed forward, hangar = icon only — no hangar art yet). Greebles never sit on a pointy nose; the scatter seed is style+seed+point count (not coordinates), so editing an outline keeps the layout.
- **Battle lab wears the skins**: `src/eon/skins.js` — `lookOf(fleetName)` = style + wash pair per fleet (never the same style on both sides), `spriteOf(ship, look)` paints one sprite per design with the battle's own hard points under the mounts. `lab.js` draws the sprite instead of the plate ("painted" checkbox), turrets from the style on the guns. `battle.js starshipHulls()` = the player's own starships when the library has any, else the built-ins.
- **Live shots** (`battle.js` log → 15-field records; `lab.js` drawShot): every shot is anchored to where the barrel and the target are NOW, beams flash 0.35 s, shells travel 0.45 s and burst on the target, missiles fly their last leg to the burst. Shield = gradient skin, solid at the rim. `PACE = 0.5` (×1 = half real pace).

## Published pages (update from any chat: pass the URL, read first)
- Painter + lab inside it: https://claude.ai/artifact/DqgDRtHyuQfGrjCMtuYLEV (index = painter; files `lab.html`, `paint.html`, all modules, all sheets). HIS LIBRARY LIVES HERE (localStorage of this origin).
- Lab + painter inside it: https://claude.ai/artifact/W87TEfwNmecfJNxxSD3aNB (index = lab). Separate origin → separate library. Prefer the first.
- Publishing recipe: content-only page = `sed -n '/<title>/,/<\/body>/p' X.html | grep -v '^</head>$' | grep -v '^<body>$' | grep -v '^</body>$'`; stage the page + `src/eon/*.js` + `src/data/properties.js` + `assets/parts/*.webp` under the chat's own scratchpad and publish with `root` + `files` (a full `.html` with doctype as a file = a second page). A sandboxed page may not open new tabs: links between the pages navigate the same tab.

## Open, in his words
- Hangar: "we have not designed hangars yet — or ignore". Bay art or a drawn opening.
- Weapons simulator on the painted ship (he keeps mentioning it; the lab's live shots are the base).
- Maybe: double-tap a greeble to move/delete it (3 systems: scatter + editor + save) — offered, not asked for.
- Free turret rows unassigned (see `styles.js` comments). Pipes/tanks/bone/cables/greeble all have art now.
