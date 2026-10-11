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
  levels/<level>/       tileset.png, <level>.tres (TileSet), <level>.tscn (background + TileMapLayer + actors + PlayerStart), level.json
  concepts/<session>/   concept images + notes.md (Concepts area, Kiln Studio)
  sprites/_kiln/        juice.gd + hit_flash.gdshader shared by every actor scene
  tiles/                (reserved)
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

## levels/<level>/level.json

`{background, entities: [{type: actor|start, name, x, y}], tile, cols, rows, tileset, tilesetCols, solid: [tile index], cells: [tile index or -1]}`.
`<level>.tscn` instances `backgrounds/<scene>/<scene>.tscn` as `Background`, then `Tiles` (TileMapLayer; `tile_map_data` = uint16 0, then per
cell 6 × int16: x, y, source, atlas x, atlas y, alternative), then actor instances and a `PlayerStart` Marker2D.

## Scene extras

`scene.json` layers can carry `opacity`, `blend` (normal/add/screen/multiply → CanvasItemMaterial), `collision` (solid layers) and
weather layers `{kind: weather, weather: rain|snow|embers|mist, color, amount, speed, wind, size}` (→ GPUParticles2D). `tod` < 0 → a
`TimeOfDay` CanvasModulate node.

## Actor extras

`manifest.json` anims may carry `w` (2-wide animations), plus `hitbox {x, y, w, h}`. `<actor>.tscn`: CharacterBody2D (origin at the
feet) with `Sprite` (AnimatedSprite2D, hit-flash ShaderMaterial) and `Body` (RectangleShape2D); script `sprites/_kiln/juice.gd`.

## Talking actors (Puppet: Head & mouth, Voice line…)
- `sprites/<actor>/voice/<line>.wav|ogg|mp3` + `<line>.lipsync.json`: `{ "sound": "<line>.wav", "duration": 3.2, "cues": [[0, "X"], [0.21, "D"], …] }`,
  cues = seconds and mouth shape (X rest, A M/B/P, B K/S/T/EE, C EH/AE, D AA, E AO/ER, F OO/W, G F/V, H L), Rhubarb-style.
- An animation `mouths` (9 frames in that order) makes the actor's scene get a `LipSync` node running `_kiln/lipsync.gd`:
  `$LipSync.say("res://…/voice/<line>.lipsync.json")` plays the sound and sets the mouth frame from the cues.
- Rig (Kiln project only): `rig.heads` [{ id, name, src, ax, ay, mouth }], `rig.mouths` { w, shapes: { X…H: png } }, `rig.mouthAt`;
  motions key `_head` (head id) and `_mouth` (shape) rows; `motion.voice` { file, cues, duration }.

## Dialogue
- `kiln/dialogue-<name>.json` (project: cast [{ name, actor }], beats [{ id, who, text, voice, next, choices, do }]) → on Save
  `dialogue/<name>.json` { name, start, beats: { id: { who, actor, text, voice (res://…lipsync.json), next (id | "end"),
  choices [{ text, next, if: { item|noitem|flag|noflag: v }, do: [{ give|take|flag|unflag|message: v }] }], do } } }
  and `dialogue/kiln_dialogue.gd` (the runner, group "kiln_dialogue": start(path), flags, signal finished(name)).

## Logic graphs
- `kiln/graph-<name>.json` (the graph: nodes, wires, vars, view) → `logic/<name>.gd` on Save (extends Node; ▶ Play runs every one).

## hud/<hud>/ for Godot

`<hud>.tscn`: CanvasLayer (script `hud.gd`, `items_json`) → `Screen` (Control, view size) → one node per widget: bar = TextureProgressBar
(`_frame.png` under, `_fill.png` progress), gauge = radial TextureProgressBar (`_track`/`_arc`), pips = Control + TextureRect pips (AtlasTexture of
`_icons.png`: full/half/empty), counter/text = Label (font `fonts/kiln_<font>_white.fnt`, tinted), panel/slot/portrait = NinePatchRect (`_9slice.png`),
inventory/dialogue/prompt = NinePatchRect/Control trees (start hidden). `items.json` = [{id, name, desc, count, icon}]. Node metadata `kiln` names the
widget kind for `hud.gd`.

## godot/addons/kiln (the Godot plugin)

`plugin.cfg`, `plugin.gd` (EditorPlugin: adds the dock), `kiln_dock.gd` (HTTP to Kiln: /api/settings, POST /api/fs {op: root} to link). Served as
`/godot-plugin.zip`; `POST /api/godot/install {path}` copies it into the project containing `path` and enables it in project.godot.

## Actor hit / hurt boxes
Project: each animation stores `boxes: [ {hit:[{x,y,w,h}], hurt:[…]} | null per frame ]` (frame pixels, top-left).
Export: `manifest.json` → `boxes: { anim: [ {hit:[[cx,cy,w,h]], hurt:[…]} | {} per frame ] }` in actor space
(centre-based, feet at y = 0, x = 0 at the frame centre); the same dictionary is `metadata/boxes` on the actor scene root,
read by `_kiln/juice.gd` to drive the `Hitbox` / `Hurtbox` Area2D shapes. No hurt boxes on a frame → the body box.

## Level tile behaviours
Project + `level.json`: `kinds: { "<tile index>": "solid" | "oneway" | "slope_r" | "slope_l" | "ladder" | "hazard" | "water" }`
(`solid: [...]` is kept for old readers). TileSet: physics layer 0 (solid/one-way/slopes; one-way = `one_way = true`),
custom data layer 0 `kind` (String) on every tile with a behaviour. Scene: the TileMapLayer runs `sprites/_kiln/level_tiles.gd`.

## Level zones
Project + `level.json`: `zones: [{ kind: checkpoint|door|message|deadly|event, x, y, w, h (level px), name, text, target (level name), once }]`.
Scene: `Zones` Node2D with one Area2D per zone (centre position, RectangleShape2D) running `sprites/_kiln/zone.gd`
(exports kind, event_name, target = that level's .tscn, text, once). Actors with Workshop role Player get group `player`;
hud.gd joins group `kiln_hud`; juice.gd joins `kiln_actors`.

## History
`<asset folder>/kiln/history/<project id>/<YYYYmmdd-HHMMSS>.json`: earlier versions of a project file (same format), written by the server before it overwrites one.

## Level autotiles
`terrains: [{ name, first }]`: 16 pieces from tile `first`; piece = first + mask (1 above, 2 right, 4 below, 8 left = same-terrain neighbour). TileSet: `terrain_set_0/mode = 2` (match sides) with peering bits per piece.
