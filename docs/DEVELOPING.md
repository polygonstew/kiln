# Developing Kiln

## Run

- `systemctl --user restart kiln` after editing `server.py`. Static files are served from disk: reload the browser
  for JS/CSS. Never `pkill -f server.py` (matches other things); use systemctl.
- No build step. Syntax-check a module: `cp static/js/x.js /tmp/x.mjs && node --check /tmp/x.mjs`.
- A module with a syntax error hides its area (optional areas load with dynamic `import()` in app.js);
  an error in `core/files/style/queue/text/wheel` blanks the app.

## Test

```
python3 -m venv .venv-test && .venv-test/bin/pip install playwright   # once; uses /usr/bin/chromium
.venv-test/bin/python tools/smoke.py                                    # every area, logo menu, wheel, Ctrl+K, /help, /desk
```

`smoke.py` is read-only. For feature tests, drive the UI with Playwright and **protect the user's data**:
`stat` their files under the asset folder before and after; create test items with New and a `zz_` name and
delete them (`kiln/<kind>-zz_*.json`, `sprites/zz_*`, …) afterwards. A fresh browser opens the latest scene,
the blank actor `new_actor`, the HUD `hud`; nothing saves until something is edited, and the name guard
(`owners.js`) renames clashes, but tests that edit must still use their own items.

Anything that saves, deletes, renames or generates: run it on an **isolated copy** instead, `tools/iso.sh <tmpdir>`
(Kiln's code, an empty asset folder, port 8521, paid cloud budget 0; `tools/iso.sh stop <tmpdir>` removes it).

## Code map
`python3 tools/map.py` prints every module with its size and purpose (from its header comment) and fails if one
passes 1000 lines or has no header. It is the code map: run it instead of keeping a hand-written list here.
Rules for keeping Kiln readable are in CLAUDE.md ("Stay understandable"). Rough shape:
- **Looks, kits, physics, new paths (2026-10-12, later):** gametype.js LOOKS/SHARP (Modern / Pixel), cutout.js (full-colour cut-outs), templates.js + adventure_kits.js (point & click kits, art slots), guide_actor.js, guide_physics.js, helper.js (Gloop), physics_godot.js (bodies, buttons, gates), ragdoll_godot.js, match3_godot.js, cards_godot.js + cards.js (Cards area), brains_more.js runner; tools/template_art.py (static/templates art).
- **Game paths, Flow, Rooms (2026-10-12):** gametype.js (paths), topbar.js (game chip, path tabs, More), flow.js + flow_view.js + flow_godot.js + story_godot.js + video.py, rooms.js + rooms_canvas.js + rooms_inspect.js + rooms_items.js + rooms_flow.js + rooms_script.js + pictures.js, adventure_gd.js + adventure_godot.js, brains_more.js, crates.js, stacker_godot.js, demo_paths.js (templates per path). Templates = "demos" in code.
- **Session 6 additions:** camera.js (Camera area → camera/camera.json), audio.py + sound_tools.js (Sound tools: ffmpeg trim/fade/loudnorm, Open in Audacity/Cutroom), setup.py + setup.js (Edit → Services & keys), rig_godot.js RIG_FACE_GD (head views + mouths), static/templates/directions.json (art directions for the Style bible and tools/template_art.py).
- **Layout:** layout.js says where every file Kiln writes goes (content folders + the _kiln/ runtime); generators take paths from it. tidy.py moves an older layout. projects.js: the shared Open dialog. saveall.js: Save all (each area's saveProject(id) hook). demo.js: the demo game (procedural hero / slime / miner, scene, level, HUD, menus, dialogue, graph → saveAll → Stage). input_godot.js: KilnInput. Layers: layers.js is the one layer list (eye, Alt+click solo, lock, rename, drag reorder, blend/opacity, add/dup/delete, right-click), used by Scenes, HUD, Levels; Puppet's timeline rows and Forge's Background maker use its look (timeline.js eye/lock, lp-eye). Game doc: gamedoc.js (the page, autosave, Save / pitch), gamedoc_shape.js (sections and parts), gamedoc_facts.js (cast, levels, controls, style from the game), gamedoc_stuck.js + gamedoc_sparks.js (Stuck? panel: questions, themes, genres, idea roll, names), gamedoc_pitch.js (pitch HTML + Markdown); writer.py (✦ ideas). games.js: File → New game / Open game (switch the asset folder). release.js: File → Export game (release.py exports Web / Windows / Linux / macOS / Godot project zips from play.prepare).
- **Shell:** app.js (tabs), core.js (DOM, API, pixel pipeline), menubar.js, wheel.js, quick.js, sendto.js, owners.js
- **Logic:** logic.js (scripts + editor gdedit.js) + logic_graph.js (graphs: list, palette, variables, live script), graph_view.js (the board), graph_nodes.js (node types → GDScript), graph_compile.js (graph → script)
- **Dialogue:** dialogue.js (area: dialogues, cast, lines), dialogue_play.js (preview), dialogue_godot.js (game JSON + kiln_dialogue.gd runner)
- **Forge makers:** forge_kit.js (generator choice, genOne with a picture-kind hint: sprite / scene / layer / texture; trimFrame), forge_bg.js (Background in depth layers → Scenes), forge_sets.js (Tileset → Levels, Icon set → icons/)
- **Areas:** files, forge, animate (+ actor_save, workshop, motion, sheets, slicer, player), scenes (+ procgen), levels, hud, stage (playtest room: playbuild.js + play.py), concepts
- **Ask Gloop (session 6):** ask.js (the question bubble: Help → Ask Gloop…), helpsearch.py (BM25 over help.html sections + FORMATS/ARCHITECTURE/DEVELOPING/CONSISTENCY + static/help/godot_classes.txt from tools/godot_docs.py), helpbot.py (prompt from the top 3 passages; engines: own Gemini/Groq key, else llama-server + a GGUF in ~/.local/share/kiln/models, else the passages themselves; `fetch_model()` downloads Qwen2.5-1.5B Q4).
- **Godot writers:** actor_godot.js (actor scene + juice.gd/projectile.gd), hud_godot.js, the export parts of scenes.js / levels.js
- **Server:** server.py (stdlib): files, projects, generation queue, cloud budget, Godot plugin endpoints; checks.py: GDScript list/check, Doctor, snapshots
- **Actor extras:** workshop.js, actor_tools.js (CHARACTER.md, game-size copy), brains.js, sfx.js, vfx.js; Puppet: puppet.js, rig.js, timeline.js, rig_godot.js, rig_import.js (picture → figure or parts kit → rig), rig_kit.js (kit screen), face.js (heads + pixel mouths), puppet_face.js (Head & mouth card), lipsync.js (voice line → mouth cues); **Level extras:** tilekinds.js, zones.js, autotile.js

## Adding an area

1. `static/js/<area>.js` exporting `export const <area> = { id, title, key, mount(el), show(), hide()? }` (hide runs when you leave it).
2. Add its name to `optional` in `app.js` (and to the generic-wheel exclusion list if it registers its own).
3. Optional: `registerWheel(id, () => ({ tools, guides }))`, `registerKeys(id, [[key, what]])`,
   `registerMenu(selector, el => items)` from `wheel.js`; projects saved via `POST /api/project` with
   `{meta: {kind, name}, <kind>: {...id...}}` and guarded with `loadOwners/claim` from `owners.js`.
4. Add a section and screenshot to `static/help.html`, a line to README and FORMATS if it writes files.

## Events (core.js `emit(name, data)` / `on(name, fn)`)

| Event | Data | Handled by |
|---|---|---|
| `tab` | area id | app.js (switch) |
| `forge-image` | path or URL | Forge: set as source |
| `forge-guide` | URL | Forge: guide image |
| `make-actor` | {path or url, name, set} | Forge → Animate: actor with an animation set |
| `to-animate` | {mode: new/add, img, pal, name, identity, set} | Animate |
| `forge-for` | identity | Forge locked to an actor |
| `slice-sheet` | path | Animate: sheet cutter |
| `open-actor` / `open-scene` | folder, or {id} of a scene project (Forge → Background) | Animate / Scenes |
| `scene-layer` | path or URL | Scenes: image layer |
| `level-tileset` | {url, tile, name} | Levels (also Forge → Tileset "Use in Levels") |
| `open-level` | level name | Levels: open its project |
| `play` | | Stage: build the game and play it (the ▶ Play button) |
| `tune-actor` | {name, brain, react} | Animate: Stage's "Keep in actor" (sets the numbers, saves) |
| `saved` / `root` | folder | Files refresh |
| `job-done`, `health`, `style` | | queue, budget tags, style bible |

## Server API (main)

| Route | |
|---|---|
| `GET /api/status` | generators, queue, cloud budget, Fast engine |
| `POST /api/gen` · `GET /api/job?id=` · `POST /api/cancel` | generation |
| `GET /api/fs?path=` · `POST /api/fs {op: mkdir/rename/trash/root}` · `GET /api/fs/raw?path=` (404 if missing) | files (home only) |
| `POST /api/export {dest, files: [{name, b64 or text}]}` | write files under the asset folder |
| `GET/POST /api/project` · `GET /api/projects` (with `sid` owner ids) | editable projects |
| `GET /api/godot?path=` | the Godot project containing a path, or null |
| `GET /api/index` · `GET /api/inbox?since=` · `GET /api/apps` · `GET /api/settings` | Ctrl+K, Downloads/concepts inbox, Desk, settings |
| `POST /api/play/build {root, files, opts}` · `GET /api/play/status` · `GET /play/…` | ▶ Play web build (play.py) |
| `POST /api/ask {q, prefer?}` → `{answer, sources, mode: key\|local\|search\|none, passages?, can_fetch?}` | Gloop's answers (helpbot.py); `prefer:'local'` tries the local engine first. `GET /api/ask/status` → `{local, fetch}`; `POST /api/ask/fetch` downloads the model |
| `POST /api/write {part, section, doc, text}` → `{ideas}` or `{err}` | Game doc ✦: ideas from free text engines only (writer.py) |
| `POST /api/release {root, files, opts, targets}` · `GET /api/release/status` · `GET /api/release/file?f=` | Export game (release.py → build/releases/*.zip) |

## Godot plugin

`godot/addons/kiln/` (GDScript, Godot 4). Test without touching the user's settings: make a temp project with
`[editor_plugins] enabled=PackedStringArray("res://addons/kiln/plugin.cfg")` and run
`godot --headless --editor --path <proj> --quit-after 400`: the dock prints `Kiln: …` after its connection check.
Never press "Link here" in tests: it changes Kiln's asset folder.

## Conventions

- **Anything with layers uses `layerPanel` (layers.js)**: the area keeps its data and passes callbacks; locked layers
  (`locked: true` on the layer) must also be refused by the area's canvas tools and inspector (`inert`).
- **File → New / Open / Save** press the area's own buttons, marked `'data-file': 'new' | 'open' | 'save'` (optional
  `'data-noun'` names the thing when the button text doesn't). A new area marks its buttons and the File menu and Ctrl+S work.

Plain-English UI text, a `title` tooltip on every control, no AI/model names in the UI, the dark theme with the
ember accent (gold HUD look for wheel/menus). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
