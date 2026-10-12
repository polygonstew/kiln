# HANDOFF: start here (next session)

Written 2026-10-11 at the end of session 4; updated 2026-10-12 (Export game, File → New / Open game, Game doc, layer controls). Read this, then `CLAUDE.md` (rules), then whatever doc the task needs:
`docs/DEVELOPING.md` (code map, events, API), `docs/FORMATS.md` (what Kiln writes), `docs/LOOP.md` (backlog + log),
`docs/RESUME.md` (the long running log: engines, machine limits, gotchas).

## What Kiln is now

A 2D pixel-art game *authoring shell over Godot*. Eleven areas (Files, Forge, Animate, Scenes, HUD, Stage, Levels,
Concepts, Logic, Dialogue, Menus) feed each other and save plain Godot files; ▶ Play builds the asset folder into a real
Godot web game that runs inside the Stage, with keys or a gamepad. A newcomer can press **File → New game from a template** and
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
| Whole game | File → New game from a template (demo.js, demo_paths.js), File → Save all for Godot (saveall.js), Your game journey (journey.js) |
| Forge makers | What are you making? → Sprite (+ UI pieces), **Background** in depth layers → Scenes, **Tileset** → Levels, **Icon set** → icons/ |
| Export game (10-12) | release.py (on play.prepare) + release.js: five targets as zips in build/releases/; shipped games set `playtest = false` |
| File menu (10-12) | games.js New game / Open game; New / Open / Save press buttons marked `data-file` (see DEVELOPING Conventions) |
| Game doc (10-12) | first tab: the design doc (gamedoc*.js), Stuck? sparks, ✦ free ideas (writer.py), pitch page, docs/GAME.md |
| Layers (10-12) | layers.js: one modern layer list in Scenes, HUD, Levels; eye/lock in Puppet rows and the Forge Background maker |

## Session 5 (2026-10-12): game paths, Flow, Rooms

| | |
|---|---|
| Paths | gametype.js: scroller / topdown / puzzle (push, stack) / adventure / text / fmv / wild; tint, per-path tabs (topbar.js), brains per role, level size, journey steps |
| Top bar | topbar.js: game chip (switch game, kind of game), the path's tabs, More ▾; New/Open game restart Kiln clean (games.js restart) |
| Flow | flow.js + flow_view.js (board) + flow_godot.js (flow.gd) + story_godot.js (story.gd); video.py (ffmpeg → .ogv, title cards) |
| Rooms | rooms.js, rooms_canvas.js, rooms_inspect.js, rooms_items.js, rooms_flow.js (puzzle chart), rooms_script.js; adventure_gd.js (room/hotspot/adventure.gd), adventure_godot.js (scene writer, ear clipping) |
| Other runtimes | brains_more.js (topdown, chaser, turret, walker), crates.js, stacker_godot.js; main.gd: camera follow/rooms/fixed, go_to_level, flow hooks |
| Templates | demo_paths.js (shown as "templates"): one per path (adventure, text, fmv, topdown, push, stack) |

Verified in headless Godot: the adventure demo played through to its ending; flow video → timed choice → quick-time →
check → end; story pages with a typed answer; top-down shooting + room camera; push crate + exit → next level.
Also verified: the stacker (bricks fall, land, next spawns). FMV/text templates were tested through hand-made flows, not their template builds.

## START HERE (session 6, written 2026-10-12 late; the user's usage ran out mid-session)

Backup made before the UI work: `~/.jcodes/kiln-backup-2026-10-12-before-ui/` (kiln.bundle = full git history,
library.tar.zst = all the user's games, plus a copy of the code). Everything below is committed and pushed (main).

**Done this session (UI rework the user asked for: "docks + workspaces", Blender/Godot/Construct-style):**
- `dock.js`: every area's side sections are panels: drag by title to left / right / bottom dock, click title to fold,
  ✕ to put away, pin a dock to the edge (slides out on hover), drag a dock edge to resize. Layout kept per area;
  top bar **Layout ▾**: panels on/off, Add a panel (Assets, Preview), save / use / reset layouts, **Simple mode**
  (hides `ADVANCED` panels). Areas are untouched: their asides are hidden "sources" and a MutationObserver moves
  sections into docks (replaceChildren on a source = rebuild). Game doc is skipped (it queries its own column).
- `assets.js` asset shelf (drag onto Flow → a scene; Levels → place a character; Rooms → hotspot showing it);
  Flow, Levels, Rooms start with it docked at the bottom. `preview.js` play-in-place panel.
- `home.js` **Home** tab (first on every path): game name/kind/look, next step, flow map, lately, counts, Play/Export/Rule book.
- Levels (Mario Maker ideas): zoom ¼×–8× at the cursor (Ctrl+wheel, + −), recent strip of tiles/things in the toolbar,
  drag placed things to move them, **▶ Play from here** (pref `play.from` → main.gd `start_at`, no Flow, no title).
- Held state fix (user: "animate/levels still hold the old game"): app.js drops `HELD` prefs (games.js) whenever Kiln
  opens in a different folder than they were saved in (`pref held.root`); Files → Change folder and the side-scroller
  template now restart Kiln like New/Open game.
- Earlier today (5b, below): looks, kits, physics, ragdolls, match-3, cards, VN, runner, rule book, Gloop, templates.

**Not done yet (in order):**
1. **Camera section** (user picked it): a Camera area modelled on Cinemachine (dead zone / soft zone drawn over the
   level, look-ahead, damping, zoom, shake, confiner) + Godot Camera2D drag margins; `camera/camera.json` read by
   main.gd `_camera()`. Keep Kiln's look ("keep our edge"; user: "stay away from corny looking stuff").
2. Half-built work found in the audit: **one items database** (HUD items.json and adventure items are separate lists);
   Godot skeleton export lacks head views + LipSync (rig_godot.js); 2D lighting; cutscenes.
3. A "sleek pass": the user finds some things corny; review Gloop's look, emoji in UI, make defaults calm.
4. Ideas from research to offer: Blender-style named workspaces across areas, Construct's pin-to-edge (done), Bitsy-like
   constraints for first games.

Testing: `tools/iso.sh <tmpdir>` test copy on :8521 (it is the user's question: 8510 = their real Kiln, 8521 = my
throwaway copy). Playwright scripts used this session lived in the job tmp dir; the pattern: make a game through the
UI, wait for `/api/play/status`, screenshot `/play/` in Chromium with `--use-gl=swiftshader`, or probe in headless Godot.

## Session 5b (2026-10-12, later): looks, kits, physics, new kinds of game

Done: per-game **Look** (Modern default / Pixel), Forge full-colour mode (cutout.js); **templates** (the UI word for demos)
for every path on painted art (static/templates, tools/template_art.py: 51 pictures, 35 from the free quota, $0.62 paid
from the user's OpenRouter key OPENROUTER_KILN_TEMPLATES_KEY), point & click **kits** (The Last Light, Star Janitor,
Bayou Noir) with art slots (keep / new / mine / sheet); item pictures from a picture or a sheet; **character guide**;
**Gloop** (helper.js) instead of the welcome window; **physics** things in Levels (box, ball, plank, seesaw, button, gate)
and **ragdolls** from Puppet rigs (+ physics guide with examples); new paths **match-3**, **card battler** (Cards area),
**visual novel** (Talk portraits), **endless runner**; Play lives only inside tabs.
Verified in Godot or in the browser on the built game: every kit, every template (screenshots), button/gate, ragdoll.
Gotchas: PinJoint2D angular limits make 2D physics NaN (don't use them); Godot's default font has no emoji; WebP data
must be saved as .webp; a white figure on a white background can't be cut out (generate characters on flat green).
Next ideas: a gamepad cursor for point & click, cards with special effects (poison, draw-and-discard), match-3 special
pieces, shmup path, Puppet for big painted characters (rig a cut-out picture), more kits.

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
