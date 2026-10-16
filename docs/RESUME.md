# RESUME: Kiln state of build

Last updated: 2026-10-11 (session 4). **New session: read docs/HANDOFF.md first**; this file is the long log.
The 45-min loop is PAUSED by the user (don't re-create it unless asked).

## At a glance (newest first)

- 2026-10-10 night: **Stage = playtest room** (stage.js + playbuild.js buildGame + play.py bridge): the Godot web build
  runs in the Stage; sliders tune the player live (main.gd reads window.kilnTune via JavaScriptBridge, brain retune()),
  Keep → Animate (`tune-actor`), screenshot / WebM, log pane; ▶ Play = emit('play'). **Puppet import** (rig_import.js +
  rig_kit.js): drop a picture or Import image… → one drawing is auto-rigged, a parts kit opens the kit screen.
  animate.js saving moved to actor_save.js (animate.js ≈920 lines).
- 2026-10-11: **Logic graphs** (graph_nodes / graph_compile / graph_view / logic_graph: node board → plain GDScript in
  logic/<name>.gd, ▶ Play runs them) · **talking puppets** (face.js heads + pixel mouths, puppet_face.js, lipsync.js voice
  line → cues, Bake mouth set → Godot LipSync / lipsync.gd) · **Dialogue** area (dialogue.js, dialogue_play.js preview,
  dialogue_godot.js runner kiln_dialogue.gd). Logic nodes: Speak a voice line, Start a dialogue, When a dialogue ends,
  Dialogue flag is set. All verified by running real Godot headless (build/game + a test probe appended to a logic script).
- 2026-10-11 (late): shared Open dialog (projects.js: rename/copy/remove/restore), HUD undo, tooltips everywhere, Logic script
  delete/restore, head views + Try mouths, **_kiln/ runtime layout** (layout.js; File → Tidy game files, tidy.py), **KilnInput**
  controller support (input_godot.js), **Save all** (saveall.js + each area's saveProject) and **demo game** (demo.js, File menu),
  **Your game** journey chip (journey.js). Test risky flows on an isolated Kiln copy (KILN_PORT=8521 in a tmp copy).
- 2026-10-11 (end): **Forge makers** (forge_kit / forge_bg / forge_sets): What are you making? → Background in depth layers
  (→ Scenes), Tileset (→ Levels), Icon set (one palette → icons/), UI pieces; server picture-kind hints (layer / texture).
  Docs pass (README, ARCHITECTURE, FORMATS, LOOP "Next up"), **docs/HANDOFF.md**, tools/iso.sh (isolated test copy).
- **START HERE (next session):** docs/HANDOFF.md. Next = export functions (File → Export game), then Godot skeleton
  head views + mouths, items DB, 2D lighting, cutscenes, Menus backgrounds, lore bible. Secure address for Stage: https://cachyos-x8664.taila1da5d.ts.net:8519. A one-shot session-only timer may start a build at 22:04.
  The user's asset folder is now **library/games/untitled_demo** (they work in it live): read the root from
  library/settings.json, sha1 it before/after every test, only create zz_ items and delete them (a zz actor's save also
  creates sprites/_kiln/ in an empty folder: remove it too). Restart `kiln` only when /api/status queue is 0.
- 2026-10-10 evening: **Puppet** (Animate → Puppet: rig.js engine, puppet.js screen, timeline.js Flash-style timeline with
  tweens/ease, rig_godot.js Skeleton2D export) · **▶ Play** (play.py + playbuild.js: web build of the asset folder at
  /play/) · **Menus** area (key 0: title/options/pause → menus/*.tscn + KilnSettings) · **Logic** area (key 9: GDScript
  editor checked by Godot; checks.py) · Workshop (faces, hit reactions, projectiles, brains, sounds sfx.js, effects
  vfx.js) · hit/hurt boxes · Levels: tile behaviours, zones, autotile, tool bar + undo · Doctor · History snapshots ·
  tours (Shift+F1) · Forge mask + sheet detection · right-click menu sections · "Kiln updated · Reload" chip.

- Menu bar (menubar.js), in-app guide `/help` (help.html + static/help/*.jpg), developer guide docs/DEVELOPING.md,
  smoke test tools/smoke.py, asset chip shows "Godot ✓ / not in Godot" (asset folder is NOT in a Godot project yet:
  Pallid Mask's project.godot lives in its build worktree).
- Sheet cutter: movable grid + Custom boxes, untangle bleeding frames, erase/clear/undo, double-click frame focus + skip.
- Flows: Concepts tab (remote-friendly meta.ai workflow), concept → actor with an animation set, batch → sprites,
  Send to… on every image. Name guard everywhere (owners.js); opening never saves.
- Scenes push: undo, solo, drag, depth sort, layer look (opacity/blend/tint/haze), ground/foreground generators,
  weather particles, Scenes ↔ Levels bridge, review tools (overlays, time of day, snapshot, WebM pan).
- Levels tab (tiles, solid, things, background) · Desk (/desk) · Kiln Studio (desktop only; user works over SSH).
- Fast local engine (kiln-fast, OpenVINO) · Ctrl+K · ? shortcuts · wheel/right-click menus · juice + Godot juice.gd.

## Where things are

- Code: `~/.jcodes/kiln` (git, private GitHub `polygonstew/kiln`, branch `main`)
- Secure address: **https://cachyos-x8664.taila1da5d.ts.net:8519** (`tailscale serve --bg --https=8519 http://127.0.0.1:8510`,
  tailnet only, real cert; off: `sudo tailscale serve --https=8519 off`). Needed for ▶ Play / Stage: Godot web games only run in a
  secure context, and the LAN http address is not one (play.py `secure_url` finds it; Stage links there).
- Running: `kiln.service` (user unit), port **8510**, binds 0.0.0.0. Restart after server.py
  changes: `systemctl --user restart kiln`. Static files are served from disk (no cache), so a
  browser reload picks up JS/CSS edits.
- Default asset folder: `~/.jcodes/kiln/library/games/untitled` (gitignored). Settings
  (`root`, bookmarks, `cloud_spent`) live in `library/settings.json`.
- Generation: ComfyUI at :8188 (`comfyui.service`, CPU, `--cache-none`). Models added this session:
  - `checkpoints/AllInOnePixel.safetensors` (converted from the PublicPrompts .ckpt; prompt
    tokens `pixelsprite` for sprites, `16bitscene` for scenes)
  - `loras/lcm-lora-sdv1-5.safetensors` (4–6 step sampling, `lcm` + `sgm_uniform`, cfg ~1.6)
  - `loras/PixelArtRedmond15V.safetensors` (trigger `PixArFK`, used by the "Painted" engine with DreamShaper 8)
- Cloud engine (`cloud_image` in server.py):
  1. **Cloudflare Workers AI** (free, 10,000 neurons/day, resets 00:00 UTC; creds in
     `~/.config/uwf-apps/cloudflare.env`). New things -> `flux-2-klein-4b` (~110 neurons, ~90/day),
     frames from a reference -> `flux-2-klein-9b` (~1,390 neurons, ~7/day; it is the one that redraws a
     reference in a new pose and stays on-model; 4b just copies the reference). Multipart API, 1024 long side.
  2. **OpenRouter** `google/gemini-2.5-flash-image` (paid, ~4¢) when the free quota is gone or a prompt is
     filtered. Capped by `KILN_CLOUD_CAP` (default $2.00) against `cloud_spent` in settings.json.
  - The direct Gemini key is NOT used: its free tier has zero image quota (always 429). Groq has no image models.
  - `/api/status` -> `cloud: {free_left (fraction, from CF GraphQL analytics), left, cap, spent, account}`;
    shown next to every "Cloud" choice (`budgetTag()` in queue.js).

## Fast engine (live)

`kiln-fast.service` (user unit, enabled) runs `fast/serve.py` on 127.0.0.1:8511 and loads the model on first use (~15 s), unloading after 15 min idle. Kiln engine `fast` (server.py `submit_fast`), Forge "Fast". img2img works for identity frames.


`fast/` holds a converted AllInOnePixel+LCM (diffusers + OpenVINO UNet), the venv `fast/.venv` (system site-packages
from miniconda: torch 2.14, diffusers, openvino 2026.4, peft), `convert.py` and `bench.py`. Models and the venv
are gitignored. Benchmark: OpenVINO 36 s at 384², torch 43 s; ComfyUI ~2 min because of `--cache-none`.

## Machine limits (important)

- i5-7200U, **no GPU**, 11 GB RAM. SD1.5 is about **30 s per step at 512²** (≈17 s at 384²). A
  local 4-step sprite takes 1.5–2.5 min including model load. The queue learns the real speed
  (`perStep`/`overhead` in localStorage) for its time estimates.
- systemd-oomd killed ComfyUI once while Roundtable's Ollama model (qwen2.5:3b, 2.1 GB) was loaded.
  This session **stopped `roundtable.service` and `roundtable-tts.service`** and unloaded the Ollama model
  (the tunnel was left up). They are still enabled and will come back on reboot. If ComfyUI gets
  OOM-killed again, check `ollama ps` and stop Roundtable.

## Done (all tested with headless Chromium + Playwright)

Files manager · Forge (local + cloud, hardware limits, identity mode with height/colour-match
checks) · Animate (editor, timeline, onion skin, 12 motions, slicer with figure detection,
identity card, export) · Scenes (9 generators, 4 presets, 3 looks, described layers matched to the
layers behind them, export + Godot tscn) · HUD (8 widget types, parts export, BMFont) · Stage ·
Style bible · cloud budget cap · Panel registration (both editions) · LAN service.

## Pixelize: native grid (session 2)

AI "pixel art" is a 1024 image drawn on fake ~8-11 px cells. `detectGrid` (core.js) finds the cell size
from a Fourier peak of the edge profiles, snaps each cut line to real edges, `snapGrid` takes one colour
per cell -> the art's own pixels. Then `centreDown` (not majority vote) if a smaller frame is wanted, so
1-px eyes/staffs survive; despeckle is skipped for grid art. Forge Size **Auto** (default) keeps the
native size. Actor identity stores `cell` (per 1024 px); later frames search near it (`cellHint`).
Interior background gaps (between legs) are keyed too. Test images live in `library/cloud/`.

## Session 2 additions

- **Sheet import** (slicer.js `analyzeSheet`): filename `RxC` (+ anim words -> row names, actor name cleaned),
  else evenly spaced rows of frames ("Rows found"), else loose figures grouped by pixel distance (dilate +
  label; join gap = 8% of typical figure height), caption filter, blown-up pixel art detected (k×k blocks)
  and shrunk to 1×, background removal decided from the border. Keeps exact pixels by default. Drop a sheet
  anywhere on the Animate tab. Tested on ~/.jcodes/pallidmask/concept (hero/enemy 4×8, ripped Simon /
  Splatterhouse / red-background sheets).
- **Godot colliders**: Scenes layer "Solid" (auto on for scroll≈1 layers named ground/floor/platform…)
  -> `tracePolys` (core.js: hole-filled pixel-edge contour + Douglas-Peucker) -> `StaticBody2D` +
  `CollisionPolygon2D` per shape in the .tscn (3 copies for repeating layers) and `collision` in scene.json.
  Actor save writes `<name>.tscn` (CharacterBody2D, origin at feet, AnimatedSprite2D, body RectangleShape2D
  from the idle frames, 60% of figure width), `manifest.hitbox`, `palette.hex`, `reference.png`, and
  `CHARACTER.md` (recreation guide for people/agents; its `## Notes` section is preserved on rewrite).
- **Forge guide image**: drop/pick/"Use source" an image; it is sent as the reference (klein-9b) with "use only
  as a guide to shape and design". Links to OpenGameArt / itch.io free assets / image search for the prompt.
- **Downloads inbox** (`/api/inbox`): images saved to ~/Downloads in the last 30 min appear in Forge's
  Generated tray tagged "new" (works with meta.ai or any site: user generates + saves, Kiln picks it up;
  deliberately no scraping/automation of other sites).

## Kiln Studio (desktop window)

`tools/studio.py` (PyQt6 WebEngine, `python-pyqt6-webengine` installed via pacman; run with /usr/bin/python3),
launcher `~/.local/bin/kiln-studio [session]` + app-menu entry. Two panes of tabs: Kiln left, meta.ai right
(+ Tab: Gemini, ChatGPT, Bing Image Creator, OpenGameArt, itch, Lospec, Notes, any address); Split toggle
Ctrl+\. Named concept sessions (tabs, layout, notes) in `~/.local/share/kiln-studio/sessions/`, autosaved
every 20 s and on close; logins persist in `~/.local/share/kiln-studio/profile`. Right-click > Save image saves
into `<asset folder>/concepts/<session>/` (+ `notes.md`), which `/api/inbox` watches, so it shows up in
Forge as "new". Nothing on the sites is automated. A plain iframe can't host meta.ai (Meta blocks framing),
hence the desktop window. Self-test: `QT_QPA_PLATFORM=offscreen KILN_STUDIO_SHOT=/path.png kiln-studio test`.

## Levels tab (loop run 9)

`static/js/levels.js`: tile painting into a TileMapLayer. Projects `kiln/level-<name>.json`; export `levels/<name>/` (tileset.png,
<name>.tres TileSet with physics polygons for solid tiles, <name>.tscn with `tile_map_data` = uint16 0 then 6×int16 per cell).

## Concepts tab (key 8)

`static/js/concepts.js`: the remote-friendly version of Kiln Studio (the user works over SSH / from other devices).
Links open meta.ai and others in a tab on the user's own device; images come back by drop, paste or upload into
`concepts/<session>/` (+ notes.md). Cards: Pixelize (Forge source), Guide (Forge guide, event `forge-guide`), Frames (slicer), trash.

## Next ideas (not started)

- Pose prompts: klein-9b sometimes changes the pose too little (strike looked like idle). Try stronger
  pose wording, or a pose sketch as a 2nd input image (`input_image_1`).

- Forge identity mode: choose which animation the new frame goes into (it currently goes after
  the current frame in Animate).
- Turnaround/model-sheet generator: one cloud call for front/side/back, sliced into views.
- Tilesets tab (`tiles/` exists in the layout but has no editor yet): 8×8/16×16 tile
  extraction from scenes, autotile rules, Godot TileSet export.
- GIF/WebM preview export of animations.
- Scenes: per-layer "draw again" history; NES attribute-grid (16×16 sub-palette) check.
- HUD: drag-resize handles; nine-slice preview stretched.

## Gotchas

- **User data:** the user works in Kiln live. Before any UI test, `stat` their files and check afterwards; create test
  items with New + `zz_` names and delete them. A Scenes test once overwrote their "night" scene (now impossible: owner ids).
- The user is on SSH from another device: build browser features, not desktop windows.

- Never `pkill -f "python3 server.py"`: it matches your own shell and other servers. Kill by PID
  from `ss -ltnp | grep :8510`, or use systemctl.
- `node --check` on ES modules needs a `.mjs` copy: `cp x.js /tmp/x.mjs && node --check /tmp/x.mjs`.
- Optional tabs load with dynamic `import()` in `app.js`. A syntax error in one module hides
  its tab silently (check the browser console), and an error in a statically imported module
  (`core`, `files`, `style`, `queue`, `text`) blanks the whole app.
- Playwright test harness used this session: `python3 -m venv /tmp/.../pw && pip install playwright`,
  launch with `executable_path='/usr/bin/chromium'`. After setting localStorage, reload the page;
  changing only the hash doesn't re-route.

## 2026-10-12 session 7: Ask Gloop
Handoff item 5 built: ask.js, helpsearch.py (BM25), helpbot.py (key → local llama-server → passages), tools/godot_docs.py, Groq card in Services & keys. llama-cpp installed with pacman on this machine; help.gguf symlinks the Ollama qwen2.5:1.5b blob. Local answers take 10-40 s on the 4-core CPU (streaming would help perceived speed).

## 2026-10-15 session 8: art follows the Look (handoff job 1)
`<html data-look>` (gametype.js apply) + `--ir` in kiln.css + core.js `smooth()` / `artCtx(x, scale)`: every preview, thumbnail, export
and pitch picture is smooth in Modern, sharp in Pixel (shrinking always smooth). 20 canvas sites moved to `artCtx`, 26 CSS rules to
`var(--ir)`, inline `imageRendering` too. Kept sharp on purpose: Puppet pixel editors (.pp-cv, head/mouth views), Slicer, cutout.js /
scenes.js area-average downscales. Concepts "Batch → sprites" keeps full colour (cutout) in Modern. Godot side was already right (SHARP(), play.py filter).
Verified: smoke clean, `data-look` flips computed `image-rendering` on canvas/img (not `.pp-cv`), batch in Modern vs Pixel on a painted image.

## 2026-10-15 session 8: huge pictures (handoff job 2)
Profiled a 4096×3072 import: Forge re-ran cutout/pixelize on the full picture at every tweak (1.4-1.7 s each), the Concepts grid decoded
every original just for a 200 px card, Animate's cutter held the full sheet. Fix at the door: core.js `readPicture(file)` / `imgData(url, true)`
give a working copy (longest side 1536) of anything over ~2.4 MP; Forge (file, drop, tray, Concepts), Animate sheet cutter + Slicer, Puppet import,
pictures.js, Concepts batch and rooms_items use it. New `thumbs.py` + `GET /api/thumb` (WebP cache in ~/.cache/kiln/thumbs) feeds Concepts grid,
Files grid, picture picker and the Forge inbox. After: Forge import longest task 250 ms (was ~1.5 s+), pixelize 1696 → 228 ms. Not changed on purpose:
Concepts/Files uploads keep the original file; tilesets, rooms and saved rigs keep their size (coordinates depend on it). localStorage audit: no pref holds a
picture except `level.cur` (L.ts, a tileset sheet, small); `forge.results` holds server URLs. Restart kiln.service for the new endpoint.

## 2026-10-15 session 8: start over everywhere (handoff job 3)
Audit: Animate, Scenes, Levels, HUD, Rooms, Dialogue and Logic graphs already had Open + New + restorable Remove (projects.js). Added `startover.js`:
`projectBar` for the one-per-game projects (Camera, Cards, Flow, Menus, Game doc, Style bible, Forge's piece in hand: prompt, source, guide as `forge-work`)
and `startOverBar` for Concepts sessions (folder → `.trash/<stamp>-concepts__<name>`). Start over/New/Remove archives to `.trash`, the area reloads blank;
"Put back…" lists the archive (newest first) and restores, archiving the current one first. Forge's Background / Tileset / Icon set makers got a New (clears
their settings and tries; saved scenes/tiles stay). Menus also rewrites menus/*.tscn after start over/put back so ▶ Play matches. Not changed: Puppet rigs
live inside the actor (Animate Open/Remove covers them), single concept images have no remove yet. File → New presses Start over in these areas.
Verified in the throwaway copy: Camera, Cards, Flow, Game doc, Style (modal), Menus, Concepts, Forge (prompt + source restored) all archive and restore; smoke clean.


## 2026-10-16 session 9: the sleek pass (handoff job 6)
Goal: calmer, less corny defaults. (The wheel / right-click menu / Ctrl+K restyle was reverted the same day: the user prefers the black-and-gold look. Do not restyle them.) **Gloop**: smaller (44 px), sage-green, eyes only (no smile, highlights, shadow or
jiggle; one slow blink), fades in 8 px instead of bouncing, neutral bubble border; calmer copy (no "Hi, I'm Gloop!", no exclamation marks). **Emoji out**:
🎲 🔑 🎙 🔒 🖼 ⚡ ✸ replaced by plain text or the dice glyph ⚂; the ✦ next to every Game doc part is a small "Ideas" button; the Wild card tile lost its rainbow
stripe; step nudge lost its "!" and its 20 px slide. Kept: ✕ ✓ ⚑ ⚙ ▶ and the other typographic glyphs (monochrome). Game content (demo dialogue) is untouched.
Verified with Playwright screenshots in the throwaway copy and smoke.py (clean). No server change, so no restart needed.

**Files fix (same day):** Files was broken since the docks (session 6): its view was `view fm`, not `view ws fm`, so `.ws.dk` never applied and the middle column was 0 px; its detail pieces (`pv`, a bare `extra` div) became "Panel" docks. Now `view ws fm`, and every detail piece is its own titled panel (Preview, the file's name, What goes here, Palette, Contents) appended with `more()`. smoke.py fails if a docked area's middle column is under 200 px.

**Also (session 9):** Files previews video and sound in place (`<video>`/`<audio>`; a game's `.ogv` plays its original from `videos/.src/` because browsers do not play Theora; with no original it shows a frame; "Open in Cutroom"). Video cards get a poster frame: `thumbs.py` takes a frame with ffmpeg for `/api/thumb` (Files grid, asset shelf). CSS scoped under `.detail` stopped matching once the docks moved Files' panels, so it is now `.fm`. Empty unnamed dock slots (`.dk-mini` only child) are hidden. Verified headless in Godot by driving flow.gd: the interactive-movie template (intro, title, scene, choice, quick-time, scene, end) and the text-adventure template (title, story, check, end) both build and run with no script errors (clips cannot "finish" in headless, so the probe called `done()` itself).

**Session 9, round 2 (QA sweep of every area on the side-scroller and interactive-movie templates):** Flow cards and Home's scene map show a poster (a frame of the video, or the scene's picture): flow.js `poster(n)` → flow_view.js `.fw-pic` (fixed height, so link ports do not move when it loads), home.js `.hm-pic`. dock.js: an unnamed empty slot no longer makes a dock (Logic had a blank 330 px column; it counts once content arrives, via a MutationObserver on that slot). Animate preview: the F S K All buttons wrap together; layer blend select no longer clips ("Norma"). smoke.py also fails on an empty Files tree. Seen but left: Forge's Model segmented control wraps in a 300 px panel; Logic's Variables type select clips ("whole numb").

