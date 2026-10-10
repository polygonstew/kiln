# RESUME: Kiln state of build

Last updated: 2026-10-10 (session 2: cloud engines, native pixel grid, sheet import, Godot colliders, guide image, Downloads inbox).

## Where things are

- Code: `~/.jcodes/kiln` (git, private GitHub `polygonstew/kiln`, branch `main`)
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

- Never `pkill -f "python3 server.py"`: it matches your own shell and other servers. Kill by PID
  from `ss -ltnp | grep :8510`, or use systemctl.
- `node --check` on ES modules needs a `.mjs` copy: `cp x.js /tmp/x.mjs && node --check /tmp/x.mjs`.
- Optional tabs load with dynamic `import()` in `app.js`. A syntax error in one module hides
  its tab silently (check the browser console), and an error in a statically imported module
  (`core`, `files`, `style`, `queue`, `text`) blanks the whole app.
- Playwright test harness used this session: `python3 -m venv /tmp/.../pw && pip install playwright`,
  launch with `executable_path='/usr/bin/chromium'`. After setting localStorage, reload the page;
  changing only the hash doesn't re-route.
