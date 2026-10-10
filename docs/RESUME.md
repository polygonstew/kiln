# RESUME: Kiln state of build

Last updated: 2026-10-10 (first build session).

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
- Cloud engine: Gemini free key first, then OpenRouter `google/gemini-2.5-flash-image` (~4¢/image).
  Capped by `KILN_CLOUD_CAP` (default $2.00) against `cloud_spent` in settings.json. About 9 s per image.

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

## Next ideas (not started)

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
