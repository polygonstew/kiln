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
3. **Respect the user's data.** They use Kiln live. Name test actors/scenes `zz_test…` and delete them afterwards.
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

- [x] **Local generation benchmark (slice 1).** `fast/convert.py` turns AllInOnePixel + fused LCM-LoRA into diffusers
  (`fast/models/aiop-lcm`, 4 GB) plus an OpenVINO UNet (`fast/models/unet-ov`, fp16). `fast/bench.py` measures,
  4 steps: torch diffusers 384² = 43 s; OpenVINO 384² = 36 s, 512² = 70 s; output is identical. OpenVINO alone is
  only 1.2×. The real cost today is ComfyUI `--cache-none` reloading the model every job (1.5–2.5 min).
- [ ] **"Fast" local engine (slice 2).** A small resident server in `fast/` (venv `fast/.venv`, reuses miniconda torch)
  holding the OpenVINO pipeline warm (~2.5 GB RAM), with HTTP `/gen {prompt, neg, w, h, steps, seed, init?, denoise?}` →
  PNG. A systemd user unit; Kiln `server.py` engine `fast` routed to it, with progress = step count. Expect ~35 s at
  384 instead of ~2 min. Only run it while ComfyUI is idle (11 GB RAM). Then try nncf int8 weight compression
  for speed, and img2img for identity frames.
- [ ] **On-model local frames (slice 3).** IP-Adapter SD1.5 (diffusers `load_ip_adapter`, h94/IP-Adapter
  `ip-adapter_sd15.safetensors` + its image encoder, ~2.5 GB) in the fast engine, and optionally ControlNet
  OpenPose. Check RAM first.
- [ ] **Tooltip and shortcut pass.** Every button and control in every tab gets a `title`. Press `?` for a
  shortcuts overlay (black-and-gold HUD style), generated from a shared registry.
- [ ] **Quick switcher, Ctrl+K**: fuzzy search across actors, scenes, HUDs, files, tabs and wheel actions.
- [ ] **Fun tools in Animate**: a "juice" preview (hit flash, squash and stretch, screen shake) on the live
  player; a palette-cycle animation; a "dice" button that rolls a random enemy prompt from parts (body,
  weapon, mood, colours) and sends it to Forge.
- [ ] **Mold existing software: LDtk-style "Levels" tab.** Paint tiles cut from scenes, place entities (actors),
  draw collision, and export a Godot TileMap/TileSet plus a .tscn. Start small: grid painting + export.
- [ ] **Desk in Kiln Studio (the OS idea).** A desktop shell with an Ubuntu or Windows look: wallpaper, dock or
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
