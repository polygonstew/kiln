# What Kiln writes

## Asset folder layout

```
<asset folder>/
  sprites/<actor>/      <anim>.png strips, manifest.json (+hitbox), <actor>.tres, <actor>.tscn, sheet.png, sheet.json,
                        palette.hex, reference.png?, CHARACTER.md, icon.png?
  backgrounds/<scene>/  <layer>.png, scene.json, <scene>.tscn
  hud/<hud>/            hud.png, hud.json, <widget>_*.png parts
  fonts/                kiln_<font>[_outline|_shadow].png + .fnt
  palettes/             <name>.hex + <name>.png
  tiles/                (reserved; no editor yet)
  kiln/                 editable sources: actor-*.json, scene-*.json, hud-*.json, style.json
  .trash/               things "deleted" in Files
  ASSETS.md             layout description
```

Point the asset folder at a game's assets (e.g. `~/.jcodes/pallidmask/assets`). Inside a Godot
project, `.tres`/`.tscn` paths are written as `res://…` automatically (`/api/godot`).

## sprites/<actor>/manifest.json (same as Pallid Mask's SpriteForge)

```json
{ "w": 64, "h": 64, "source": "kiln",
  "anims": { "walk": { "file": "walk.png", "frames": 6, "fps": 8, "loop": true } } }
```
Each `<anim>.png` is a horizontal strip of `frames × w` by `h`, feet on the bottom row.

- `<actor>.tres`: Godot 4 `SpriteFrames` (AtlasTexture regions into each strip, speed = fps)
- `sheet.png` + `sheet.json`: one row per animation; Aseprite-style JSON (`frames` hash with
  `frame` rect + `duration` ms, `meta.frameTags` per animation)

## backgrounds/<scene>/scene.json

```json
{ "view": {"w": 480, "h": 270}, "look": "paint", "source": "kiln",
  "layers": [ { "name": "sky", "file": "sky.png", "scroll": 0, "y": 0, "repeat": true, "w": 480, "h": 270, "visible": true } ] }
```
`scroll` is the parallax factor (0 = fixed, 1 = moves with the camera). `y` is the top of the
layer on screen. `<scene>.tscn` is a Godot 4 scene: one `Parallax2D` per layer
(`scroll_scale`, `repeat_size`) with a `Sprite2D` child. Solid layers also get `"collision": [[[x,y],…],…]`
(polygons in layer pixels) and a `<layer>_solid` StaticBody2D of CollisionPolygon2D nodes in the .tscn.

## hud/<hud>/hud.json

`{view, widgets:[{name, type, x, y, w, h, parts:{…}}]}`. Parts by type:
- bar: `frame`, `fill`, `states` strip (`frames`, `frameW`), `fillRect` inset
- gauge: `states` strip
- pips: `icons` strip ordered `full, half, empty`, `spacing`
- panel / slot / portrait: `nineSlice` (minimal corner+1+corner image), `margin` (Godot
  NinePatchRect patch margins), `full`
- counter / text: `image` (+ `font` name)

## fonts/*.fnt

BMFont text format, one page PNG. Godot imports `.fnt` as a FontFile.

## palettes/*.hex

One `rrggbb` per line (Lospec format) + a 1-px-per-colour swatch PNG.
