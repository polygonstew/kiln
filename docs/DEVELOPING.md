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
.venv-test/bin/python tools/smoke.py                                    # every area, menus, wheel, Ctrl+K, /help, /desk
```

`smoke.py` is read-only. For feature tests, drive the UI with Playwright and **protect the user's data**:
`stat` their files under the asset folder before and after; create test items with New and a `zz_` name and
delete them (`kiln/<kind>-zz_*.json`, `sprites/zz_*`, …) afterwards. A fresh browser opens the latest scene,
the blank actor `new_actor`, the HUD `hud`; nothing saves until something is edited, and the name guard
(`owners.js`) renames clashes, but tests that edit must still use their own items.

## Adding an area

1. `static/js/<area>.js` exporting `export const <area> = { id, title, key, mount(el), show() }`.
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

## Conventions

Plain-English UI text, a `title` tooltip on every control, no AI/model names in the UI, the dark theme with the
ember accent (gold HUD look for wheel/menus). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
