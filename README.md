# Kiln

A 2D game asset workbench for retro pixel art (NES 8-bit through SNES 16-bit). It turns descriptions and images
into sprites, animations, parallax scenes, tile levels, HUDs and bitmap fonts, and saves them in a folder layout
Godot reads directly (`.tres`/`.tscn` with `res://` paths when the asset folder is inside a Godot project).
Its first rule is **consistency**: characters and styles stay on-model across everything made after them.

**Direction (user, 2026-10-10):** Kiln is the *shell* a game is built in, sitting on top of Godot. Godot stays the
engine and runtime; Kiln is the authoring layer (art, actors, boxes, levels, HUD, then logic, dialogue, cutscenes),
and every part feeds the others (an actor's faces drive the HUD portrait, its boxes drive combat, a scene becomes a
level background). Everything it writes is plain Godot (`.tscn`, `.tres`, `.gd`), so a project never depends on Kiln.

- **Open:** http://192.168.0.105:8510 on the LAN, or **https://cachyos-x8664.taila1da5d.ts.net:8519** (Tailscale, secure: needed for ▶ Play / Stage off this machine). Guide: **`/help`** (or F1)
- **Services:** `kiln` (port 8510), `kiln-fast` (8511, local Fast generator), `comfyui` (8188, local models)
- **Stack:** `server.py` (Python stdlib only) + `static/` (vanilla ES modules, no build step)
- **Test:** `tools/smoke.py` with a Playwright venv (see docs/DEVELOPING.md); risky flows on an isolated copy (docs/HANDOFF.md)

## Areas

| Key | Area | What it does |
|---|---|---|
| 1 | **Files** | The asset folder as a file manager: tree, thumbnails, animated previews, drop-in import, rename, trash |
| 2 | **Forge** | *What are you making?* Sprites (characters, creatures, items, props, effects, portraits, vehicles, UI pieces) from a description or an image, on the art's own pixel grid; **Background** (depth layers → Scenes), **Tileset** (→ Levels), **Icon set** (one palette) |
| 3 | **Animate** | Pixel editor, timeline, onion skin, animation sets, sheet cutter, Workshop (roles, faces, hit reactions, brains, sounds, effects, projectiles), **Puppet** (bones, Flash-style timeline, image / parts-kit import, swappable heads, pixel mouths, lip sync from voice lines) |
| 4 | **Scenes** | Parallax layers (generators, described layers, images, weather), look per layer, review tools, Godot Parallax2D export |
| 5 | **HUD** | Bars, gauges, pips, counters, text, panels, slots, portraits, inventory, dialogue box, prompts, bitmap fonts; undo |
| 6 | **Stage** | The playtest room: the real Godot web build of your game, live player tuning, screenshot / video, game log |
| 7 | **Levels** | Tiles with behaviours (solid, one-way, slopes, ladder, hazard, water), autotile, things, zones, background scene |
| 8 | **Concepts** | Concept boards from any site, notes, batch → consistent sprites |
| 9 | **Logic** | **Graphs** (events wired to actions, ~55 nodes, compiled to plain GDScript) and every script in an editor checked by Godot |
| – | **Dialogue** | Conversations with a cast, voice lines, choices, conditions and effects; live preview with a talking portrait |
| 0 | **Menus** | Title, options and pause screens → Godot scenes + saved settings |

Everywhere: **▶ Play** builds the game into the Stage (keys or a **gamepad**); the **Your game** chip shows the next step;
**File → New game / Open game** (each game is an asset folder), **New / Open / Save** for the area you are in,
**Export game** (Web for itch.io, Windows, Linux, macOS, the Godot project), **Make a demo game**, **Save all for Godot**, **Tidy game files**,
**Open…** (rename / copy / remove / restore anything you made), History, Doctor. **Ctrl+K** finds anything, **Shift+A**
command wheel, right-click **Send to…** on every image, **?** shortcuts, tooltips on every control. Extra pages:
**`/desk`** (home apps as windows), **Kiln Studio** (`kiln-studio`, a desktop window with meta.ai beside Kiln).

What a game folder holds: your content (`sprites/`, `backgrounds/`, `levels/`, `hud/`, `menus/`, `dialogue/`, `logic/`,
`icons/`, `sfx/`…) and Kiln's small commented runtime in **`_kiln/`** (actor, brains, level, ui, game/input.gd), plus
Kiln's editable projects in `kiln/`. Everything is plain Godot; a game never depends on Kiln.

## Docs

- `docs/HANDOFF.md`: **start here** in a new session: state, how to work safely, what is next
- `docs/RESUME.md`: the running log of the build, machine limits, engines, gotchas
- `docs/DEVELOPING.md`: code map, events, API, how to add an area, testing safely
- `docs/ARCHITECTURE.md`: files and data flow · `docs/FORMATS.md`: everything Kiln writes
- `docs/CONSISTENCY.md`: how things stay on-model · `docs/LOOP.md`: the timed improvement runs (rules, backlog, log)
- In the app: `/help`, the searchable illustrated guide (`static/help.html`, pictures in `static/help/`)
