# Kiln improvement loop: hand-off for each timed run

Started 2026-10-10 at the user's request: every ~30 minutes, one round of polish on Kiln. Each
round: add a feature or two, tooltips, easier navigation, and tools that make making game assets fun.
**Every run starts here.** Read this file, then `docs/RESUME.md` (the "Gotchas" section matters), then work.

## Rules for a run

0. **Every 45 minutes** (user, 2026-10-10: keep usage down). **Each run starts with a bug hunt (about 10 min):**
   run `tools/smoke.py`; then take the next area in the rotation below and exercise its main flows with Playwright
   on throwaway `zz_` items (clicks, drags, saves, reloads), watching for script errors, failed requests, wrong
   results, layout glitches. Fix what you find (smallest safe fix), log it under **Bugs**. Then use what's left of
   the run for the top backlog item. Keep runs lean: few screenshots, short replies.
   Rotation (advance one per run, note where you are in the Log): Files → Forge → Animate (+ sheet cutter) →
   Scenes → Levels → HUD → Stage → Concepts → Desk/Help → back to Files.
1. **One backlog item per run**: whatever fits in about 25 minutes. Take the top unchecked item unless it's
   blocked. If an item is big, do one clear slice of it and leave the rest as a new line.
2. **Don't break what works.** Syntax-check modules (`cp x.js $TMP/x.mjs && node --check`), restart with
   `systemctl --user restart kiln` after server.py changes, and check the change with headless Chromium +
   Playwright (venv: `python3 -m venv $TMP/pw && $TMP/pw/bin/pip install playwright pillow`, launch with
   `executable_path='/usr/bin/chromium'`). Look at the screenshot before calling it done.
3. **Respect the user's data.** INCIDENT 2026-10-10: Scenes tests overwrote the user's "night" scene (a preset renamed a new
   scene onto it) and every fresh test browser re-saved "pallid". Fixed: scenes never save over another scene's name
   (owner ids → `name_2`), a fresh browser opens the latest scene without saving, and opening is read-only.
   Desk tests: open only Kiln itself in a window. Other apps (Cutroom, WIW…) keep their own state and a fresh browser
   could trigger their autosave.
   Before any test, `stat` the user's files and check afterwards that they're unchanged. Create test items with New + a `zz_` name.
   (Original rule follows.) They use Kiln live. Name test actors/scenes `zz_test…` and delete them afterwards.
   Never overwrite their actors, scenes or `library/` files. Never delete anything you didn't create.
4. **Money:** no paid cloud generation in tests. The Cloudflare free quota is fine, a few images at most.
   The paid OpenRouter backup is capped at $2 total; leave it to the user.
5. **Docs:** every feature updates `static/help.html` (the in-app guide; new screenshots go in `static/help/`), and
   README / DEVELOPING / FORMATS when relevant. Run `tools/smoke.py` before committing.
6. **Style:** match the surrounding code (vanilla JS modules, `h()` helper, plain-English UI text, no AI or
   model names in the UI). Put a tooltip (`title`) on every new control. Keep the dark UI and the ember accent.
   The command wheel and right-click menu use the black-and-gold HUD look.
7. **Finish:** commit (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), `git push`, tick the item
   below, add a line to the Log, and update `docs/RESUME.md` if something structural changed.
   Keep replies short: the user wants minimal token use.

## Stay understandable (user, 2026-10-10: "we do not want codebase comprehension loss")
Kiln must stay small and plain enough for a person to read and debug by hand. Every run:
- **One job per module**, each with a header comment saying what it is for. Nothing over 1000 lines: split
  before adding (`python3 tools/map.py` prints the map and fails past the limit; smoke.py runs it).
- **New feature → its own module** when it is more than a few functions (workshop.js, actor_godot.js, hud_godot.js).
- **Delete before you add:** remove dead code, duplicate helpers and unused options you touch. Prefer one
  obvious way over several clever ones; no frameworks, no build step, no clever metaprogramming.
- **Keep the map current:** docs/DEVELOPING.md code map and FORMATS.md change in the same commit as the code.
- **The games stay understandable too:** the GDScript Kiln writes is short, commented, one job per script, plain
  Godot nodes, no hidden runtime: a Godot developer can open any generated file and follow it.

## Backlog (top first)

**User, 2026-10-10: "create tools that are not available that make things flow easier". These come first, top to bottom.**

- [x] **Flow 1** DONE: Concepts card "Actor" and Forge "+ animations" (set chooser): pixelize → actor with identity → full set,
  every frame starting from the sprite. Event `make-actor` {path|url, name, set}. Was: On a Concepts/Forge image: "Make actor" = pixelize with the style settings, create
  the actor (identity, palette, scale), add the hero (or enemy) animation set, open Animate with the box template ready. One click.
- [x] **Flow 2** DONE: Concepts "Batch → sprites": one shared palette (pooled from all images), one height (median default), outline,
  hardware; tick + rename; saves sprites/<name>/<name>.png, never into an existing folder (name_2). Was: Pick a concept session or a folder: every image → sprite with ONE shared palette, size and
  outline (consistency), saved to sprites/<name>/. Preview grid first, then save the ticked ones.
- [x] **Flow 3** DONE: sendto.js right-click "Send to" on Concepts cards, Forge results/viewports, Files images, Animate frames,
  scene layers, batch cards: Forge source/guide, Animate frame, new actor, Scene layer, Level tileset (asks if > 256 tiles), Concept board. Was: Every image (Concepts, Forge results, Files, Animate frames, scene layers) gets the same
  right-click "Send to": Forge source · Forge guide · Animate frame · new actor · Scene layer · Level tileset · Concept board.
**User, 2026-10-10 (big features, in this order; Claude decides the layout, keep it simple by default and let users
override everything; each gets a Help section and a Godot export):**

- [x] **Actor workshop, slice 1** DONE (workshop.js; Animate → Workshop): role checklist (missing / not posed / done) with Add,
  Make with Forge (pose presets via forge-for poses), Edit; status faces (8 states, cloud or local, palette-locked + blood) →
  faces.png/faces.json on save.
- [x] **Actor workshop, slice 2** DONE: hit reaction (knockback, i-frames → juice.gd hurt()), projectiles (proj_<name> anim → projectile_<name>.tscn
  + _kiln/projectile.gd, actor shoot()), HUD portrait status faces (set_health / show_face). Verified in Godot 4.7. Was: HUD portrait "faces from actor" (hud.gd `set_health()` picks healthy→dead, `flash_face("grin")`),
  projectiles (sprite + flight anim + impact, speed/gravity/lifetime → projectile.tscn + script), hurt reaction settings
  (flash, knockback, i-frames) feeding juice.gd.
  Original: **Actor workshop** ("open an actor → everything for it"): one page per actor with a checklist of what a game character
  needs (animation set status, hit/hurt reaction, death, projectiles, sounds later), each item one click to make (Forge locked
  to the identity). **Hurt-state portrait faces like the Doom marine** (healthy, hurt, badly hurt, near death, dead, grin,
  look left/right) generated from the reference, wired to HUD portraits: `hud.gd set_health()` switches the face.
  **Projectiles**: sprite + flight animation + impact, speed/gravity/lifetime, exported as a scene + script.
- [x] **Colliders** DONE 2026-10-10 (actor boxes, tile behaviours, zones): per-animation-frame hitboxes and hurtboxes on actors (attack frames get hitboxes), drawn in Animate;
  level extras: one-way platforms, ladders, hazards (spike tiles), trigger areas. Export: Area2D/CollisionShape2D per frame
  driven by the AnimatedSprite2D frame, and level Area2D nodes.
- [x] **Systems / Logic** DONE 2026-10-10 (brains, health, Logic tab + GDScript editor; next: visual rule blocks?) (a tab) with an **in-house GDScript editor** (user ask): syntax colours, line numbers, Kiln's API
  hints, and checking with the real Godot here (`godot --headless --check-only`) so errors show before the game runs: ready-made behaviours as small editable GDScript: platformer player controller (speed,
  jump, coyote time, dash, attack), enemy AI (patrol, chase, attack range), health/damage/knockback/i-frames, pickups,
  doors/switches/triggers, save points. Presets with sliders; an "edit the code" view to override. Attach to actors/levels.
- [ ] **Toolsets (user asked 2026-10-10 "have you considered toolsets?"), in this order:**
  1. [x] DONE **Snapshots**: every save keeps earlier versions (kiln/history/, throttled, size-capped); "History…" to restore. (A test once lost the user's scene.)
  2. [x] DONE **Retro sound effects**: sfxr-style generator (jump, coin, hit, explosion, shoot) → .wav; actors play them on hurt/shoot/jump/die.
  3. [x] DONE **VFX sprites**: procedural hit sparks, slashes, dust, explosions, pickups sparkle → SpriteFrames; used by hurt/projectile impact.
  4. [x] DONE **Autotile / terrains**: from 1–3 tiles build a Godot terrain set (edges, corners) so Levels paints walls that join up.
  5. [x] DONE **Doctor**: check the asset folder (oversized sprites, too many colours, missing files/refs, unused files) with one-click fixes.
  6. **Items database**: items with icon, stats, text → Godot Resources, feeding HUD inventory and pickups.
  7. **2D lighting**: normal maps from sprites for Godot lights (CanvasTexture), torch/lamp presets.
- [ ] **Dialogue + lore**: dialogue trees (lines, choices, conditions, item checks) for the HUD dialogue box, a lore bible
  (characters, places, factions) and a writing assistant (free text engines first, per the AI cost rules; no model names
  in the UI). Export: JSON + a runner that drives `hud.gd say()`.
- [ ] **Cutscenes**: a timeline (camera moves, actor animations/positions, dialogue lines, fades, waits) exported as a
  Godot AnimationPlayer scene + script.
- [ ] LATER: **menus and boot** (splash, title, options, save slots, pause) and **music options**.
- [ ] **Godot Asset Library / standalone**: a public repo with the plugin (MIT licence, icon, README); optionally ship Kiln
  inside the addon (server.py + static) with a "Start Kiln" button so others can use it without this machine. Needs the
  user's go-ahead (public release).

- [ ] **Collapsible sections everywhere** (user, 2026-10-10): every panel section header gets a ▾ / ▸ toggle to fold it away;
  folded state remembered per area (pref). One shared helper in core.js (`h('div', {class:'sec'})` headers become clickable),
  applied to all areas at once. Do this as part of / right before the redesign pass.
- [ ] **Redesign pass (user: "redesign sections that seem janky"):** from the 2026-10-10 review: Forge's right panel is long
  (split into Size / Colour / Clean-up tabs or collapsible groups); Animate's right panel stacks too much (preview,
  identity, motions, sheet, import, save: make collapsible with remembered state); Stage needs a "pick actor" hint inline;
  HUD fine; Files fine. One area per run, screenshot before/after.
- [ ] **Flow 4: Save all + project health.** One button (top bar) exports every changed actor/scene/level/HUD for Godot, then
  a health report: unsaved items, actors missing animations from their set, frames touching box edges, colours over the
  hardware limit, levels whose background or actors aren't exported. Each line has a "fix / go there" link.
- [ ] **Flow 5: Recent strip.** Top-bar dropdown of the last 12 things touched across tabs (thumbnails), one click back.

**User, 2026-10-10: "tighten up the scenes section and double down the next few runs". Scenes slices come first.**

- [x] **Scenes 1, layer control:** undo/redo (Ctrl+Z/Y), Delete with undo, Ctrl+D duplicate, drag to reorder, Alt+click eye = solo,
  H hide, [ ] select; depth-order warning + "Sort by depth"; zoom Auto/Sharp/Fill/1–4×; the duplicate Look control removed; wheel + ? entries.
- [x] **Scenes 2, layer look** DONE: opacity, blend (Glow/Light/Shade → Godot CanvasItemMaterial), tint, own haze, depth ruler,
  reroll ◀ ▶ history, Reset; verified in Godot 4.7. Was: per-layer opacity, tint, blend (normal / add for glows), and haze override; a depth ruler showing the
  scroll speeds side by side; regenerate keeps the seed history (back/forward through rolls). Every new control needs undo.
- [x] **Scenes 3a** DONE: Ground (bumps, lit lip + shadow, texture cobbles/soil+roots/rubble, puddles; old ground layers render as before),
  Foreground generator (grass, railings, pillars, chains; scroll 1.3, the actor walks behind it).
- [x] **Scenes 3b** DONE: weather layers Rain / Snow / Embers / Mist (live animated preview; export = Parallax2D + GPUParticles2D,
  verified in Godot 4.7). Was: rain, snow, embers, drifting fog as animated layers in the preview; export as a Godot
  GPUParticles2D (or an animated strip). Was: **Scenes 3, better generators:** ground with a surface edge and detail (cobbles, roots, puddles), foreground silhouettes
  (scroll > 1, darkened), weather layers (rain, snow, embers, drifting fog) that animate in the preview and export as a Godot
  GPUParticles2D or an animated strip.
- [x] **Scenes 4** DONE: Levels → Background (a saved scene drawn behind the map, instanced behind the TileMapLayer in Godot);
  Scenes layer → "Tiles for Levels (16/8)" cuts unique tiles into a Levels tileset. Verified in Godot 4.7. Was: "Use as level background" (the parallax layers go behind a Levels map, exported together)
  and cutting 8/16 px tiles from a layer into a Levels tileset.
- [x] **SAFETY name guard** DONE: owners.js (`loadOwners`/`claim`) in Animate, Levels, HUD (saves + exports); tested from fresh
  browsers: hero → hero_2, hud → hud_2, zz_a → zz_a_2; the user's files unchanged. Was: same as Scenes: never save over another item's project/export by
  name (owner ids → `name_2`); a fresh browser must not save anything until the user edits.
- [x] **Scenes 5** DONE: Show = safe frame / HUD mock-up / both; Time of day slider (night exports as Godot CanvasModulate);
  snapshot PNG (3×); Record pan = 4 s WebM at 3× (frame-count based, recording canvas must stay on screen). Was: a safe-frame / HUD overlay toggle, the actor walking on the ground line (exists, check it), a
  day/night palette shift slider, and PNG/GIF export of a short pan for sharing.

- [x] **Local generation benchmark (slice 1).** `fast/convert.py` turns AllInOnePixel + fused LCM-LoRA into diffusers
  (`fast/models/aiop-lcm`, 4 GB) plus an OpenVINO UNet (`fast/models/unet-ov`, fp16). `fast/bench.py` measures,
  4 steps: torch diffusers 384² = 43 s; OpenVINO 384² = 36 s, 512² = 70 s; output is identical. OpenVINO alone is
  only 1.2×. The real cost today is ComfyUI `--cache-none` reloading the model every job (1.5–2.5 min).
- [x] **"Fast" local engine (slice 2).** DONE: `fast/serve.py`, unit `kiln-fast.service` (copy in fast/), Kiln engine `fast`, Forge "Fast" button. Measured 50 s for the first image (includes the load), ~35 s after. Still open: nncf int8, and a Scenes "This PC" option.
  Original plan: A small resident server in `fast/` (venv `fast/.venv`, reuses miniconda torch)
  holding the OpenVINO pipeline warm (~2.5 GB RAM), with HTTP `/gen {prompt, neg, w, h, steps, seed, init?, denoise?}` →
  PNG. A systemd user unit; Kiln `server.py` engine `fast` routed to it, with progress = step count. Expect ~35 s at
  384 instead of ~2 min. Only run it while ComfyUI is idle (11 GB RAM). Then try nncf int8 weight compression
  for speed, and img2img for identity frames.
- [x] **On-model local frames (slice 3): evaluated, not adopted.** IP-Adapter SD1.5 with AllInOnePixel+LCM, 4 steps, 384:
  46 s, 6.6 GB RAM, weak likeness (colours drift, the shield and trim are lost). Removed (`fast/ipbench.py` kept for reference). For on-model
  frames use Cloud (FLUX.2-klein-9b) or Fast img2img from the reference. ControlNet OpenPose skipped for the same RAM/CPU reasons.
  Original plan: IP-Adapter SD1.5 (diffusers `load_ip_adapter`, h94/IP-Adapter
  `ip-adapter_sd15.safetensors` + its image encoder, ~2.5 GB) in the fast engine, and optionally ControlNet
  OpenPose. Check RAM first.
- [x] **Tooltip and shortcut pass.** DONE: `?` overlay (wheel.js `KEYS`, `registerKeys`), "Controls and shortcuts" in the right-click menu,
  and a shared `TIPS` table that titles plain buttons in every area. What remains untitled is self-labelled (size chips, presets).
  Original plan: Every button and control in every tab gets a `title`. Press `?` for a
  shortcuts overlay (black-and-gold HUD style), generated from a shared registry.
- [x] **Quick switcher, Ctrl+K** DONE (quick.js + `/api/index`; project list cached by mtime, 6 s → 2 ms).: fuzzy search across actors, scenes, HUDs, files, tabs and wheel actions.
- [x] **Fun tools, slice 1** DONE: juice preview on the live player (F hit flash, S squash, K shake, ✸ all) and the Forge dice (⚂ Roll / D).
- [x] **Fun tools, slice 2**: colour cycle DONE (Shift+click palette colours, then "Colour cycle" builds a looping `<anim>_cycle`).
- [x] Juice in Godot DONE: actor .tscn gets `sprites/_kiln/juice.gd` (`hit_flash()`, `squash()`, `shake()`) + `hit_flash.gdshader`
  on the sprite; verified by loading the exported scene in headless Godot 4.7 and calling all three.
  Original note: **Fun tools in Animate**: a "juice" preview (hit flash, squash and stretch, screen shake) on the live
  player; a palette-cycle animation; a "dice" button that rolls a random enemy prompt from parts (body,
  weapon, mood, colours) and sends it to Forge.
- [x] **Levels tab, slice 1** DONE (levels.js, key 7): tile painting (left/right/wheel/middle like Animate), starter tileset or any image,
  solid tiles → Godot TileSet .tres with collision + .tscn TileMapLayer (tile_map_data bytes), verified in Godot 4.7.
- [x] **Levels, slice 2** DONE: Paint → Things: player start (Marker2D) + exported actors (instanced .tscn, feet on the tile top),
  right-click removes; also level.json entities. Verified in Godot 4.7. Remaining ideas: auto-tiling, several tile layers.
  Was: entities (place actors and a player start, exported as instanced actor .tscn), tiles cut from a Scenes layer,
  auto-tiling (grass top / dirt fill), several layers (background/foreground).
  Original: **Mold existing software: LDtk-style "Levels" tab.** Paint tiles cut from scenes, place entities (actors),
  draw collision, and export a Godot TileMap/TileSet plus a .tscn. Start small: grid painting + export.
- [x] **Desk, slice 1** DONE: `/desk` (static/desk.html) + Kiln Studio "Desk" tab: Ubuntu/Windows looks, app icons + dock/taskbar,
  draggable/resizable/min/max windows (iframes; HOMEBASE pops out, as it forbids framing), running status from `/api/apps`, layout remembered.
- [ ] **Desk, slice 2:** real controls for one app through its API (start with ytgrab: paste URL → grab, progress, list), a launcher/search,
  and the window title showing that app's status. Read the app's code in ~/.jcodes first; don't change other apps' data.
  Was: **Desk in Kiln Studio (the OS idea).** A desktop shell with an Ubuntu or Windows look: wallpaper, dock or
  taskbar, and icons for the user's own apps opening as movable windows with min/max/close. Apps and ports:
  Cutroom :8500, ytgrab :8480, HOMEBASE :8490, Panel :8790, LegoFind :8440, ToyFinder :8450, WIW :8460,
  WorldWire, OStink :8470 (LAN only, never public). Research one (start with ytgrab or Cutroom: read its code
  in ~/.jcodes) and give its window real controls through its API.
- [ ] GIF/WebM export of an animation (Animate → Save), with a 1×/2×/4× choice.
- [ ] Forge: let identity mode choose which animation a new frame goes into.
- [ ] Turnaround sheet: one cloud call for front/side/back, sliced into views.
- [ ] Scenes: per-layer "draw again" history.

## Bugs (found by the hunt)

- 2026-10-10 Files: Backspace/Delete/F2/Enter stopped working after a confirm()/prompt() (focus left the view). Fixed: page-level
  listener while Files is showing. Test-harness note: Playwright `has-text("Folder")` also matches "Bookmark this folder"
  (case-insensitive substring); use `get_by_role('button', name=..., exact=True)`. (A test bookmark was added and removed.)

## Log

- 2026-10-10: loop set up. This session already shipped the native-grid pixelize, the Cloudflare free engine
  with the budget display, the self-reading sheet slicer, Godot colliders, CHARACTER.md, the guide image,
  the Downloads inbox, Kiln Studio, editor input (left adds, right removes, wheel rolls colours), 2-wide
  boxes, animation sets, box templates, and the Shift+A wheel with the right-click menu.
- 2026-10-10 06:4x: run 1. Local generation benchmark: OpenVINO 1.2× over torch; a model kept loaded beats ComfyUI's
  per-job reload by 2.5–4×. Next run: a resident "Fast" engine.
- 2026-10-10: run 2. Fast engine live (127.0.0.1:8511, loads on first use, unloads after 15 min idle). Forge → Model → Fast: ~35 s at 384 vs ~2 min.
- 2026-10-10: run 3. IP-Adapter tried and rejected (weak likeness on this model, 6.6 GB RAM); 2.4 GB download removed.
- 2026-10-10: run 4. `?` controls overlay per area plus shared button tooltips (wheel.js).
- 2026-10-10: run 5. Ctrl+K finds areas, actions, actors, scenes, files (path-order fuzzy); also in the right-click menu and the ? list.
- 2026-10-10: run 6. Juice preview (flash, squash, shake) in the Animate player plus the Forge dice roll for random enemy ideas.
- 2026-10-10: run 7. Colour cycling in Animate (Shift+click colours, then Colour cycle).
- 2026-10-10: run 8. Juice exported to Godot (script + shader wired into each actor .tscn, tested in Godot 4.7); fixed the stale Save button name after New.
- 2026-10-10: run 9. Levels tab (tile painting, solid tiles, Godot TileSet + TileMapLayer export with collision, tested in Godot).
- 2026-10-10: user asked to double down on Scenes. Scenes 1 done (undo, solo, drag reorder, duplicate, depth sort, zoom modes); Scenes 2-5 queued at the top.
- 2026-10-10: run 10. Scenes 2 (layer look). Found and fixed scene-overwrite bugs (my tests had overwritten the user's "night" scene; not recoverable, no /home snapshots).
- 2026-10-10: run 11. Scenes 3a: richer Ground and a new Foreground generator. User files checked unchanged before and after.
- 2026-10-10: run 12. Scenes weather layers (rain, snow, embers, mist) animated in preview, exported as Godot particles.
- 2026-10-10: run 13. Scenes ↔ Levels bridge (scene as level background; cut layer tiles into a tileset). TODO next to it: Levels needs the same
  name-ownership guard as Scenes (a new level named like an existing one would save over it).
- 2026-10-10: run 14. Name guard everywhere (Animate, Levels, HUD use owners.js like Scenes).
- 2026-10-10: run 15. Scenes review tools (overlays, time of day, snapshot, pan video). The Scenes push (1-5) is complete.
- 2026-10-10: run 16. Levels entities: place actors and the player start, exported as instanced scenes and a Marker2D.
- 2026-10-10: run 17. The Desk: your home apps as icons and windows (Ubuntu or Windows look) at /desk and in Kiln Studio.
- 2026-10-10: user is on SSH, so Kiln Studio (a desktop window) is no use remotely. Added the Concepts tab (meta.ai links + drop/paste/upload + notes).
- 2026-10-10: slicer grids made movable (drag the grid, size cells by corner, gap/offset fields, arrows; boxes draggable, drawable, right-click delete). Flow tools queued first.
- 2026-10-10: run 18. Flow 1: concept → actor with a full animation set in one click.
- 2026-10-10: run 19. Batch pixelize a concept session into a consistent sprite set.
- 2026-10-10: slicer "Untangle touching frames" (grid/rows modes): pieces go to the box they mostly sit in; joined poses split along
  min-pixel seams between every adjacent pair; frames grow by common margins (no clipping). Tested: unit cases + the hero sheet's attack row.
- 2026-10-10: run 20. "Send to…" on every image. User then asked: better controls to clear out a space and work section by section (next).
- 2026-10-10: menu bar, /help guide (searchable, illustrated, Into Godot), DEVELOPING.md, smoke test, Godot chip, quick fixes
  (missing file 404, Levels Background row, new_actor default, Stage preselects). Redesign pass queued.
- 2026-10-10: timer changed to every 45 min; each run now opens with a bug hunt (rotation starts at Files).
- 2026-10-10: HUD inventory/dialogue/prompt + Godot HUD scene + hud.gd; Godot plugin (dock, zip, one-click install). Queued: actor
  workshop, colliders, systems/logic, dialogue+lore, cutscenes, menus/music, asset library.
- 2026-10-10: loop run 21 (bug hunt: Files). Next hunt: Forge. Backlog top: Actor workshop.
- 2026-10-10: Actor workshop slice 1 shipped (tested: checklist, add all, local face, save writes faces.png/json). GDScript editor queued.
- 2026-10-10: user asked for collapsible sections (logged above, GUI pass later); continuing with Actor workshop slice 2.
- 2026-10-10: Actor workshop slice 2 shipped (reactions, projectiles, HUD faces). Next: Colliders.
- 2026-10-10: Colliders slice 1 (actor boxes): per-frame hit/hurt boxes in Animate (Boxes, Guess hitboxes, Copy → next) → Hitbox/Hurtbox Area2D driven by juice.gd + manifest boxes. Verified in Godot (hit → hurt, flip mirrors). Next colliders: level one-way/ladder/hazard/trigger tiles.
- 2026-10-10: comprehension guard: animate.js split (Godot export → actor_godot.js, 1186 → 959 lines), tools/map.py (code map, 1000-line limit, headers) wired into smoke.py, rules above.
- 2026-10-10: Colliders slice 2 (level tiles): tile behaviours (solid, one-way, slopes, ladder, hazard, water) in tilekinds.js → TileSet collision + kind custom data + _kiln/level_tiles.gd (kind_at, hazards hurt kiln_actors). Verified in Godot. Next: trigger zones (rect regions: checkpoint, door, message, cutscene) in Levels → Area2D with signals; then Systems/Logic + GDScript editor.
- 2026-10-10: Colliders slice 3 (zones): Levels → Paint → Zones (checkpoint, door, message, deadly, event) in zones.js → Area2D + _kiln/zone.gd. Verified in Godot (walked a player through all four). Fixed stray "null" in the Levels left panel (Things/Zones modes). Colliders backlog item done. Next: Systems/Logic tab + GDScript editor.
- 2026-10-10: Systems slice 1: health/death/heal in juice.gd (player → HUD set_health), brains.js (player platformer, patrol, flyer GDScript) picked in Workshop → Brain node; brain scripts written once (user-editable). Played in Godot: run, jump 42/40 px, patrol, contact damage, enemy death. Next: Logic tab = GDScript editor (+ godot --check-only endpoint).
- 2026-10-10: Logic tab (logic.js + gdedit.js): every .gd in the asset folder, GDScript editor (highlight, tab indents, auto-indent, Ctrl+/ , Ctrl+S), Godot --check-only on save via POST /api/godot/check (scratch project symlinked to the assets), Kiln reference panel. Tested.
- 2026-10-10 BUG (user screenshot): a 454x621 actor pushed Animate off-screen, tabs gone, could not scroll up. Causes: my `#v-animate {position: relative}` (workshop CSS) overrode `.view {position:absolute}`; Fit never went below 1x; `.viewport` place-items:center made overflow unreachable. Fixed: rule removed, core.fitZoom (scales below 1x) used by Animate/player/Files/Forge/Levels, `safe center`, html/body/#views overflow: clip, view rows minmax(0,1fr). Also: opening an actor marked it dirty and autosaved it (rewrote the user's file, identical bytes): now opened() never saves. RULE: never put position on a .view; overlays go inside it as they are.
- 2026-10-10: loop run 22 (bug hunt: Forge). Fast generation OK (94 s for 2 at 384/4 steps; likeness weak = model). Found: a sprite sheet sent to Forge was squashed into one 48 px sprite with no way out → Forge now counts poses on the source (keyed, 96 px tall) and offers "Looks like N poses: cut into frames" (slice-sheet now also takes {url, name}). Known noise: 404 for /api/project?id=style when no style is saved. Next hunt: Animate. Backlog top: Dialogue + lore.
- 2026-10-10: user screenshot: still cut off. Cause: their tab was open from before the fix (a page keeps the code it loaded). Added /api/status build id + "Kiln updated · Reload" chip (queue.js). Preview zoom label shows %.
- 2026-10-10: Toolset 1 Snapshots: server keeps the replaced version on each project save (history/<id>/, 10 min gap, 5 each, 1 GB cap, unchanged skipped); File → History… (history.js) restores as a new copy. Tested via API + UI. Restarted kiln only after the user's generation queue emptied (do that every time).
- 2026-10-10: Toolset 2 Sounds: sfx.js (sfxr-style synth, 9 presets, WAV), Workshop Sounds card → sfx_<event>.wav + AudioStreamPlayer2D nodes, juice.gd sfx() on hurt/die/shoot, player brain on jump/attack; Tools → Sound effects… designer → sfx/. Verified in Godot (wav imports, hurt + jump play).
- 2026-10-10: Toolset 3 Effects: vfx.js (spark, slash, dust, explosion, sparkle, ring × 6 colour sets, Bayer fades) → strip + one-shot AnimatedSprite2D scene (_kiln/vfx.gd); Workshop hit effect (juice.gd hit_effect) + projectile impact_effect; Tools → Effects…. Verified in Godot.
- 2026-10-10: Toolset 4 Autotile: autotile.js (16 match-sides pieces from one tile: grass/lit/outline, rounded corners), Levels paints with a terrain (fixAround neighbours), TileSet terrain_set_0 mode 2 + peering bits. Verified: Godot's set_cells_terrain_connect picks the same piece.
- 2026-10-10: Toolset 5 Doctor: /api/doctor (missing refs, big/colourful actors incl. unexported ones, loose images, unsaved items grouped, heavy projects) + doctor.js (Tools → Doctor…); Animate "Make a game-size copy" (area-average boxDown → shared 15-colour palette → despeckle; majority-down speckled on detailed art). Tested on the user's knight (158×264 → 38×64), copy deleted.
- 2026-10-10: size guard tripped (animate.js 1016) → split: actor_tools.js (CHARACTER.md, shrinkActor/boxDown); server.py 1106 → checks.py (scripts list/check, Doctor, snapshots; path-taking functions). map.py now guards .py too. Lesson: moving code broke save (characterDoc used FS and hex, not imported, error swallowed by the save's try/catch): after moving code, list its free identifiers and run a save test.
- 2026-10-10: loop run 23 (bug hunt: Animate + sheet cutter) on the user's 2992×816 knight sheet (3 rows, gaps): Find figures merged stacked knights into 12 tall boxes; row detection needed equal counts per row. analyzeSheet now accepts rows with gaps when every figure sits on the fullest rows' pitch → 27 frames, 3 rows. 'How' help text was always Custom's; now per method. Next hunt: Scenes. Backlog top: Toolset 6 Items.
- 2026-10-10: user: weather made the actor vanish. Cause: groundLayer() picked a weather layer (scroll 1) as the ground; weather layers skip normal drawing, so drawActor never ran. Fixed (weather is never the ground); picking an actor also redraws while paused.
- 2026-10-10 INCIDENT: my weather test edited the user's "night" scene: New was pressed while restore() was still loading the 62 MB latest scene; the load then replaced the new scene and the test's Rain/Snow chips went into night (saved 18:53:57). Repaired: removed exactly those 2 appended weather layers (back to the user's 18:51:42 layers), kept the edited file as history/scene-night/20261010-185357.json. Bug fixed with load tickets (restore/Open/openSceneDir drop results if New/Open happened meanwhile; preset fallback only for the untouched start scene). RULE: before an editing test in Scenes, wait until the area finished loading AND check the name field shows the test item; back up any user file in reach (sha1 before/after).

