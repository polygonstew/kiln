# Architecture

```
server.py            stdlib HTTP server: static files (/, /help, /desk), ComfyUI driver + websocket progress,
                     cloud engine (Cloudflare FLUX.2 free → OpenRouter paid, capped), Fast engine client,
                     file manager API, projects (with owner ids), exporter, inbox, quick-switch index, app probe
static/index.html    shell: top bar (wordmark, menu bar, tabs, style chip, asset-folder chip with Godot status, job tray)
static/help.html     the in-app guide (searchable); screenshots in static/help/*.jpg
static/desk.html     the Desk: home apps as windows (Ubuntu or Windows look)
static/kiln.css      the whole design system (tokens at :root)
static/js/
  app.js             boot, tabs (1–8), cross-area routing of events
  core.js            DOM helper h(), api(), event bus (emit/on), palettes + HARDWARE limits, image ops, k-means,
                     dithering, pixelize() with native pixel-grid detection (detectGrid/snapGrid), tracePolys()
  wheel.js           Shift+A command wheel, right-click menu, ? shortcuts overlay, shared tooltips
  menubar.js         File / Edit / View / Tools / Help (acts on the area that is showing)
  quick.js           Ctrl+K find anything      sendto.js   "Send to…" on every image
  owners.js          name guard: one item per name (clashes → name_2)
  queue.js           generation queue + tray, time estimates, budget tags
  style.js           style bible            files.js    Files + saveFiles()          text.js/fonts.js  bitmap text
  player.js          animation previewer (+ juice), loadActor()     motion.js  motion generators
  forge.js           Forge                  animate.js  Animate      sheets.js  animation sets + box templates
  slicer.js          sheet cutter (analysis, grid/rows/figures/custom, untangle, erase/clear, frame focus)
  scenes.js          Scenes (+ weather, review tools, Godot export)   procgen.js  layer generators + presets
  levels.js          Levels                 hud.js      HUD          stage.js   Stage     concepts.js  Concepts
  icons.js           16px line icons
fast/serve.py        Fast engine: pixel model kept loaded (OpenVINO UNet), 127.0.0.1:8511, unloads when idle
tools/studio.py      Kiln Studio desktop window (Qt WebEngine)     tools/smoke.py  headless smoke test
tools/bdf2js.py      BDF → fonts.js      vendor/fonts/  Spleen + Tom Thumb BDFs and licences
library/             (gitignored) settings.json, default asset folder, cloud images
```

## Data flow

Each area keeps its editable state as a *project* (`<asset folder>/kiln/<kind>-<name>.json`, autosaved) and writes
engine files on **Save** through `POST /api/export`. Areas talk through the event bus (see DEVELOPING.md), so an
image can move Concepts → Forge → Animate → Scenes/Levels without being saved in between.

Generation: Forge/Scenes enqueue jobs (`POST /api/gen`); the server routes by engine (cloud / fast / ComfyUI),
images come back as URLs (`/api/cloudimg`, `/api/view`) and land in Forge's Generated tray.
