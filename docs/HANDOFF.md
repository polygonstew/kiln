# HANDOFF: start here (next session)

Written 2026-10-11 at the end of session 4; updated 2026-10-12 (Export game, File → New / Open game, Game doc, layer controls). Read this, then `CLAUDE.md` (rules), then whatever doc the task needs:
`docs/DEVELOPING.md` (code map, events, API), `docs/FORMATS.md` (what Kiln writes), `docs/LOOP.md` (backlog + log),
`docs/RESUME.md` (the long running log: engines, machine limits, gotchas).

## What Kiln is now

A 2D pixel-art game *authoring shell over Godot*. Eleven areas (Files, Forge, Animate, Scenes, HUD, Stage, Levels,
Concepts, Logic, Dialogue, Menus) feed each other and save plain Godot files; ▶ Play builds the asset folder into a real
Godot web game that runs inside the Stage, with keys or a gamepad. A newcomer can press **File → Make a demo game** and
get a complete small game made by every area, or follow the **Your game** chip (11 steps, each with "Do it"). **File →
Export game** makes it for players (Web zip for itch.io, Windows, Linux, macOS, Godot project); **File → New game / Open
game** switch between games (each game is an asset folder).

Session 4 (2026-10-11) added, all committed and pushed on `main`:

| | |
|---|---|
| Logic graphs | node board → plain GDScript in `logic/<name>.gd` (graph_nodes / graph_compile / graph_view / logic_graph) |
| Talking puppets | head views (front/back/left/right/¾/up/down), 9 pixel mouths, lip sync from a voice line, Godot LipSync node |
| Dialogue area | cast, lines, choices with if/does, live talking preview, runner (HUD box or its own) |
| Usability | one Open dialog (open/rename/copy/remove/restore) everywhere, HUD undo, tooltips on every control, Logic script delete/restore |
| Readable output | Kiln's runtime in `_kiln/` (layout.js); File → Tidy game files moves an older layout (tidy.py) |
| Controller | KilnInput (`_kiln/game/input.gd`): every action on keys + gamepad; pause works without a pause menu |
| Whole game | File → Make a demo game (demo.js), File → Save all for Godot (saveall.js), Your game journey (journey.js) |
| Forge makers | What are you making? → Sprite (+ UI pieces), **Background** in depth layers → Scenes, **Tileset** → Levels, **Icon set** → icons/ |
| Export game (10-12) | release.py (on play.prepare) + release.js: five targets as zips in build/releases/; shipped games set `playtest = false` |
| File menu (10-12) | games.js New game / Open game; New / Open / Save press buttons marked `data-file` (see DEVELOPING Conventions) |
| Game doc (10-12) | first tab: the design doc (gamedoc*.js), Stuck? sparks, ✦ free ideas (writer.py), pitch page, docs/GAME.md |
| Layers (10-12) | layers.js: one modern layer list in Scenes, HUD, Levels; eye/lock in Puppet rows and the Forge Background maker |

## Running

- `kiln.service` (user unit) on **:8510**, LAN http://192.168.0.105:8510. Restart after `server.py` changes:
  `systemctl --user restart kiln` (only when `/api/status` shows an empty queue). **Never** `pkill -f server.py`.
- Secure address (needed for ▶ Play / Stage off this machine): **https://cachyos-x8664.taila1da5d.ts.net:8519**
  (`tailscale serve --bg --https=8519 http://127.0.0.1:8510`; off: `sudo tailscale serve --https=8519 off`).
- Generators: Cloud (Cloudflare free daily quota first, then a paid cap of $2 total, `KILN_CLOUD_CAP`), `kiln-fast`
  (:8511, local), ComfyUI (:8188, local, slow CPU). No AI or model names in the UI.

## The user's game folder (handle with care)

- Asset folder = `library/settings.json` → `root`. On 2026-10-12 the user switched it to **`library/games/demo_game`** (they
  made the demo game themselves); **`library/games/untitled_demo`** is their main work. They work in these live (actors `drowned_sailor`, `new_actor`, `eye_guy`, an image-named actor, level `room`, graph `hello`, dialogue
  `miner_greeting`, menus `game`, voice line `sprites/new_actor/voice/maintenance_107.mp3`). `library/games/untitled` is
  theirs too. Their `.trash/` holds their own deleted `scripts/my_script.gd`.
- It still uses the **old runtime layout** (`sprites/_kiln/` etc.). Tidy was tested on a copy only; offer File → Tidy game
  files (or Doctor) to the user, don't run it on their folder yourself. Their old graph scripts pick up KilnInput when
  re-saved.

## Testing safely (the method that worked)

1. **Before any UI test:** snapshot the user's folder (`find $ROOT -type f | sort | xargs sha1sum > before.list`) and
   compare afterwards. Only new files under `kiln/history/` from the user's own saves are expected.
2. **Risky flows (save, delete, rename, generate, demo game) go to an isolated copy:** `tools/iso.sh <tmpdir>` starts
   Kiln's code with an empty asset folder on **:8521** and a paid budget of $0; `tools/iso.sh stop <tmpdir>` removes it.
3. On the real Kiln, create only `zz_` items and delete them afterwards. Never overwrite or delete the user's items.
4. **Smoke test** after every change: `python3 -m venv .venv-test && .venv-test/bin/pip install playwright` once (it uses
   the system `/usr/bin/chromium`, no browser download), then `.venv-test/bin/python tools/smoke.py [url]`. For WebGL pages
   launch Chromium with `--enable-unsafe-swiftshader --use-gl=swiftshader`. `python3 tools/map.py` checks the 1000-line rule.
5. **Godot runtime checks:** ▶ Play writes `build/game`; append a probe to a logic script (print what you need), then
   `godot --headless --path build/game --quit-after 3000`. Simulated "just pressed" input misses the frame in headless
   runs: check mappings with `InputMap.event_is_action` instead.
6. Syntax-check a module with a `.mjs` copy: `cp static/js/x.js /tmp/x.mjs && node --check /tmp/x.mjs`.
7. Shell is fish/zsh: quote globs (`--include='*.tscn'`); an unmatched glob aborts the whole `rm`.

## Next (in order; details in docs/LOOP.md "Next up")

1. Export is done (2026-10-12). Possible follow-ups: Android (templates are installed; needs a keystore + SDK), an
   itch.io upload with butler, a boot splash image.
2. Godot skeleton export (rig_godot.js) lacks head views and mouths: add them plus the LipSync node.
3. Items database (icons from Forge → Icon set already land in `icons/<set>/`), then 2D lighting, Cutscenes, more Menus
   backgrounds, a lore bible + writing help for Dialogue.
4. From LOOP: collapsible sections everywhere, a redesign pass (Forge / Animate right panels), a Recent strip.

## Rules the user cares about

- "We do not want codebase comprehension loss": one job per module, a header comment each, under 1000 lines, delete
  before adding, and the GDScript Kiln writes stays short and plain. Update the docs (DEVELOPING code map, FORMATS,
  help.html) in the same commit as the code.
- Friendly yet powerful; the user should "feel intrigued to move forward and create" (journey chip, demo, nudges).
- Short replies, few tokens. Commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and push.
