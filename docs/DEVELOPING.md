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

## Code map
`python3 tools/map.py` prints every module with its size and purpose (from its header comment) and fails if one
passes 1000 lines or has no header. It is the code map: run it instead of keeping a hand-written list here.
Rules for keeping Kiln readable are in CLAUDE.md ("Stay understandable"). Rough shape:
- **Shell:** app.js (tabs), core.js (DOM, API, pixel pipeline), menubar.js, wheel.js, quick.js, sendto.js, owners.js
- **Logic:** logic.js (scripts + editor gdedit.js) + logic_graph.js (graphs: list, palette, variables, live script), graph_view.js (the board), graph_nodes.js (node types → GDScript), graph_compile.js (graph → script)
- **Dialogue:** dialogue.js (area: dialogues, cast, lines), dialogue_play.js (preview), dialogue_godot.js (game JSON + kiln_dialogue.gd runner)
- **Areas:** files, forge, animate (+ actor_save, workshop, motion, sheets, slicer, player), scenes (+ procgen), levels, hud, stage (playtest room: playbuild.js + play.py), concepts
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
| `open-actor` / `open-scene` | folder | Animate / Scenes |
| `scene-layer` | path or URL | Scenes: image layer |
| `level-tileset` | {url, tile, name} | Levels |
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

## Godot plugin

`godot/addons/kiln/` (GDScript, Godot 4). Test without touching the user's settings: make a temp project with
`[editor_plugins] enabled=PackedStringArray("res://addons/kiln/plugin.cfg")` and run
`godot --headless --editor --path <proj> --quit-after 400`: the dock prints `Kiln: …` after its connection check.
Never press "Link here" in tests: it changes Kiln's asset folder.

## Conventions

Plain-English UI text, a `title` tooltip on every control, no AI/model names in the UI, the dark theme with the
ember accent (gold HUD look for wheel/menus). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
