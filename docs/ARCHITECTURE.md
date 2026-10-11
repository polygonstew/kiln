# Architecture

```
server.py            stdlib HTTP server: static files (/, /help, /desk), ComfyUI driver + websocket progress,
                     cloud engine (Cloudflare FLUX.2 free → OpenRouter paid, capped), Fast engine client,
                     file manager API, projects (with owner ids), exporter, inbox, quick-switch index, app probe
static/index.html    shell: top bar (KILN logo = menu, tabs, style chip, asset-folder chip with Godot status, job tray)
static/help.html     the in-app guide (searchable); screenshots in static/help/*.jpg
static/desk.html     the Desk: home apps as windows (Ubuntu or Windows look)
static/kiln.css      the whole design system (tokens at :root)
play.py              ▶ Play builds: copy the asset folder to build/game, Godot web export to build/web, the Stage bridge
tidy.py              moves an older layout of Kiln's runtime into _kiln/ and fixes every scene (File → Tidy)
checks.py            GDScript list / check (godot --check-only), Doctor, history snapshots
static/js/
  app.js             boot, tabs, cross-area routing of events, the ▶ Play button
  layout.js          WHERE everything goes: content folders + the _kiln/ runtime (actor/, brains/, level/, ui/, game/)
  projects.js        the shared Open dialog (open / rename / copy / remove / restore)   saveall.js  Save all (saveProject hooks)
  journey.js         the "Your game" chip and next steps        demo.js  the demo game (every area, then the Stage)
  core.js            DOM helper h(), api(), event bus (emit/on), palettes + HARDWARE limits, image ops, k-means,
                     dithering, pixelize() with native pixel-grid detection (detectGrid/snapGrid), tracePolys()
  wheel.js           Shift+A command wheel, right-click menu, ? shortcuts overlay, shared tooltips
  menubar.js         the KILN-logo menu: File / Edit / View / Tools / Help (acts on the area that is showing)
  quick.js           Ctrl+K find anything      sendto.js   "Send to…" on every image
  owners.js          name guard: one item per name (clashes → name_2)
  queue.js           generation queue + tray, time estimates, budget tags
  style.js           style bible            files.js    Files + saveFiles()          text.js/fonts.js  bitmap text
  player.js          animation previewer (+ juice), loadActor()     motion.js  motion generators
  forge.js           Forge                  animate.js  Animate      sheets.js  animation sets + box templates
  slicer.js          sheet cutter (analysis, grid/rows/figures/custom, untangle, erase/clear, frame focus)
  scenes.js          Scenes (+ weather, review tools, Godot export)   procgen.js  layer generators + presets
  levels.js          Levels (+ tilekinds, zones, autotile, leveltools)   hud.js / hud_godot.js  HUD     concepts.js  Concepts
  stage.js           the playtest room (embedded web build, live tuning)   playbuild.js  main scene + build request
  logic.js           Logic: scripts + gdedit.js editor; logic_graph.js (graphs), graph_view / graph_nodes / graph_compile
  dialogue.js        Dialogue (+ dialogue_play.js preview, dialogue_godot.js runner)     menus.js / menus_godot.js  Menus
  puppet.js          Puppet (rig.js bones + render, timeline.js, rig_import/rig_kit parts kits, face.js + puppet_face.js
                     heads and mouths, lipsync.js voice → mouth cues, rig_godot.js Skeleton2D)
  actor_save.js      saving an actor (actor_godot.js scenes + juice.gd, brains.js, sfx.js, vfx.js, workshop.js)
  forge_kit.js       Forge makers' shared bits; forge_bg.js Background in layers; forge_sets.js Tileset + Icon set
  input_godot.js     KilnInput: every action on keys and a gamepad (_kiln/game/input.gd)
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

Generation: Forge/Scenes enqueue jobs (`POST /api/gen`, a picture-kind hint: sprite / scene / layer / texture); the
server routes by engine (cloud / fast / ComfyUI), images come back as URLs (`/api/cloudimg`, `/api/view`).

Games: every Save writes plain Godot files; Kiln's runtime scripts go to `_kiln/` (layout.js). ▶ Play (play.py) copies
the asset folder into `build/game`, adds a main scene (playbuild.js: level, player, HUD, menus, every logic/*.gd,
KilnInput) and exports for the web; the Stage embeds it and talks to it through a small bridge (tuning, screenshots).
