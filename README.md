# Kiln

A 2D game asset workbench for retro pixel art (NES 8-bit through SNES 16-bit). It turns
descriptions and images into sprites, animations, parallax backgrounds, HUDs and bitmap fonts,
and saves them in a folder layout game engines read directly.

- **Open:** http://192.168.0.105:8510 on the LAN (also `http://localhost:8510`, and over Tailscale)
- **Service:** `systemctl --user {status,restart} kiln` (unit `~/.config/systemd/user/kiln.service`)
- **Needs:** ComfyUI on `127.0.0.1:8188` (`comfyui.service`) for local generation. The cloud
  model needs `~/.config/uwf-apps/keys.env` (Gemini key first, OpenRouter fallback, capped at $2)
- **Stack:** `server.py` (Python stdlib only) + `static/` (vanilla JS modules, no build step)

## Tabs

| Key | Tab | What it does |
|---|---|---|
| 1 | **Files** | File manager for the *asset folder*: folder tree, thumbnails, animated sprite previews, a label on each folder saying what it is for, drag-in import, rename, move to trash |
| 2 | **Forge** | Describe a thing, generate it, then turn it into real sprite pixels (hardware colour limits, palette, size, outline, background removal). *Making frames for an actor* mode locks reference, palette and scale so new poses stay on-model |
| 3 | **Animate** | Pixel editor + timeline + onion skin + live previewer, 12 motion generators, sheet slicer, identity card, export (strips + manifest + Godot SpriteFrames + packed sheet) |
| 4 | **Scenes** | Parallax layers (9 procedural generators, described layers, images), three looks (8-bit Cartridge / 16-bit Painted / Noir Ink), scrolling preview, export with a Godot `Parallax2D` scene |
| 5 | **HUD** | Bars, gauges, pips, counters, bitmap text, 9-slice panels, slots and portraits. Exports parts, meter state strips, `hud.json` and BMFont fonts |
| 6 | **Stage** | Drive an exported actor over a saved scene with the HUD on top. Shows the animation timing frame by frame |

The top bar has the **Style bible** (one art direction for the whole game) and the **asset folder**.

## Docs

- `docs/RESUME.md`: current state, what's next, gotchas. **Read this first when resuming.**
- `docs/ARCHITECTURE.md`: files, modules, data flow, server API
- `docs/CONSISTENCY.md`: how characters and styles stay on-model (style bible, identity, locks)
- `docs/FORMATS.md`: everything Kiln writes (folder layout, manifest, scene.json, hud.json, Godot files)

## Credits

Bitmap fonts: Spleen (BSD-2, `vendor/fonts/LICENSE.spleen`) and Tom Thumb (MIT/CC0).
