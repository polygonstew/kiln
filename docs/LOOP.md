# Kiln improvement loop: hand-off for each timed run

Started 2026-10-10 at the user's request: every ~30 minutes, one round of polish on Kiln. Each
round: add a feature or two, tooltips, easier navigation, and tools that make making game assets fun.
**Every run starts here.** Read this file, then `docs/RESUME.md` (the "Gotchas" section matters), then work.

## Rules for a run

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
5. **Style:** match the surrounding code (vanilla JS modules, `h()` helper, plain-English UI text, no AI or
   model names in the UI). Put a tooltip (`title`) on every new control. Keep the dark UI and the ember accent.
   The command wheel and right-click menu use the black-and-gold HUD look.
6. **Finish:** commit (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), `git push`, tick the item
   below, add a line to the Log, and update `docs/RESUME.md` if something structural changed.
   Keep replies short: the user wants minimal token use.

## Backlog (top first)

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
