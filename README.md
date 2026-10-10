# Kiln

A 2D game asset workbench for retro pixel art (NES 8-bit through SNES 16-bit). It turns descriptions and images
into sprites, animations, parallax scenes, tile levels, HUDs and bitmap fonts, and saves them in a folder layout
Godot reads directly (`.tres`/`.tscn` with `res://` paths when the asset folder is inside a Godot project).
Its first rule is **consistency**: characters and styles stay on-model across everything made after them.

- **Open:** http://192.168.0.105:8510 on the LAN (`http://localhost:8510` locally). Guide: **`/help`** (or F1, Help menu)
- **Services:** `kiln` (port 8510), `kiln-fast` (8511, local Fast generator), `comfyui` (8188, local models)
- **Stack:** `server.py` (Python stdlib only) + `static/` (vanilla ES modules, no build step)
- **Test:** `.venv-test/bin/python tools/smoke.py` (see docs/DEVELOPING.md)

## Areas

| Key | Area | What it does |
|---|---|---|
| 1 | **Files** | The asset folder as a file manager: tree, thumbnails, animated sprite previews, drop-in import, rename, trash |
| 2 | **Forge** | Generate (Cloud / Fast / local) or bring an image; turn it into real sprite pixels on the art's own grid; guide images; dice; actor from one click |
| 3 | **Animate** | Pixel editor (left adds, right removes, wheel rolls colours), timeline, onion skin, 1/2-wide boxes, animation sets, box templates, colour cycles, juice preview, sheet cutter (grid/rows/figures/custom, untangle, erase) |
| 4 | **Scenes** | Parallax layers (generators incl. ground, foreground, weather; described layers; images), opacity/blend/tint/haze, undo, depth sort, review tools, Godot Parallax2D export |
| 5 | **HUD** | Bars, gauges, pips, counters, text, 9-slice panels, slots, portraits, bitmap fonts |
| 6 | **Stage** | Play an exported actor over a scene with the HUD; animation timing |
| 7 | **Levels** | Tile maps with solid tiles, background scene, actors and a player start → Godot TileSet + TileMapLayer scene |
| 8 | **Concepts** | Concept boards: images from meta.ai and others (paste/drop/upload), notes, batch → consistent sprites |

Everywhere: menu bar (File/Edit/View/Tools/Help), **Ctrl+K** find anything, **Shift+A** command wheel, right-click
menu with **Send to…** on every image, **?** shortcuts. Extra pages: **`/desk`** (home apps as windows),
**Kiln Studio** (`kiln-studio`, a desktop window with meta.ai beside Kiln; local screen only).

## Docs

- `docs/RESUME.md`: current state, machine limits, gotchas. **Read first when resuming.**
- `docs/DEVELOPING.md`: code map, events, API, how to add an area, testing safely
- `docs/ARCHITECTURE.md`: files and data flow · `docs/FORMATS.md`: everything Kiln writes
- `docs/CONSISTENCY.md`: how things stay on-model · `docs/LOOP.md`: the timed improvement runs (rules, backlog, log)
- In the app: `/help`, the searchable illustrated guide (`static/help.html`, pictures in `static/help/`)
