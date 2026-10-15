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
  menus/                title / options / pause scenes (Menus; behind: scene, picture or looping video; font from fonts/; each item may set size, color, hover, font, align)
  dialogue/             <name>.json conversations (Dialogue); voice lines live in sprites/<actor>/voice/
  logic/                <graph>.gd compiled Logic graphs and your own scripts (Play runs every logic/*.gd)
  docs/                 GAME.md, pitch.html, game_doc.html (Game doc → Save doc; editable source kiln/gamedoc-game.json)
  icons/<set>/          <item>.png + sheet.png + sheet.json (Forge → Icon set: one palette, one size)
  tiles/                <name>.png tileset sheets (Forge → Tileset: row 1 four fills, row 2 two lit tops, platform, underside)
  _kiln/                Kiln's runtime scripts (below)
  kiln/                 editable sources: actor-*, scene-*, level-*, hud-*, graph-*, dialogue-*, menus-*.json, style.json, history/
  .trash/               things "deleted" in Files
  ASSETS.md             layout description
```

Exports (File → Export game) are not written into the asset folder: they land in Kiln's `build/releases/` as
`<name>-<version>-<web|windows|linux|macos|project>.zip` (download them from the dialog). The project zip is the Godot
project the build uses: project.godot, kiln_main.tscn + main.gd, export_presets.cfg, icon.png/.ico and the asset folders.

Point the asset folder at a game's assets (e.g. `~/.jcodes/pallidmask/assets`). Inside a Godot
project, `.tres`/`.tscn` paths are written as `res://…` automatically (`/api/godot`).

## _kiln/ (Kiln's runtime, layout.js)
- `_kiln/actor/` juice.gd, hit_flash.gdshader, projectile.gd, lipsync.gd, vfx.gd · `_kiln/brains/` player.gd, patrol.gd, flyer.gd
  (written once, yours) · `_kiln/level/` level_tiles.gd, zone.gd · `_kiln/ui/` hud.gd (every HUD shares it), menu.gd,
  settings.gd (KilnSettings), dialogue.gd · `_kiln/README.md`. Kiln rewrites these on save, except brains/.
- Older folders had them in sprites/_kiln/, menus/kiln_*.gd, dialogue/kiln_dialogue.gd, hud/<hud>/hud.gd: File → Tidy game
  files (tidy.py) moves them and fixes every scene, keeping originals in .trash/<time>-tidy/ (TIDY.md).

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

## Layer flags (layers.js)
`locked: true` on a scene layer, HUD widget or Puppet bone (and `hidden: true` on a bone: not drawn, not baked) is
editor state kept in the Kiln project; levels keep `view: {bg|tiles|ents|zones: {hidden, locked, opacity}}`. None of it
changes what Godot gets, except hidden Puppet parts are left out of baked frames.

## Game doc (kiln/gamedoc-game.json)
`{meta, doc: {v: {...}}}`: one flat map keyed `<section>.<part>` (gamedoc_shape.js). Text parts are strings, list parts
arrays of `{id, name, text, link?: 'level:<n>'|'scene:<n>', done?}`, `story.themes` an array of strings, `pitch.keyart`
`{kind: 'scene'|'actor', name}`, `cast.notes` `{<actor>: {want, flaw, voice, notes}}`, `levels.notes` `{<level>: text}`,
`<section>.thoughts` the questions answered from the Stuck? panel (`{name: question, text: answer}`).


## Game paths, Flow, Rooms (2026-10-12)

- `kiln/game-path.json`: `{ game: { path, puzzle } }`: scroller, topdown, puzzle (push / stack), adventure, text, fmv, wild (none saved = wild).
- `kiln/flow-game.json` (Flow): `{ flow: { nodes: [{ id, kind, name, x, y, video, menu, level, room, entry, dialogue, picture, text, options, seconds, fallback, from, to, action, flag, item }], links: [{ from, out, to }], start } }`
  → `flow/game.json` (res:// paths) played by `_kiln/game/flow.gd`; story pages by `_kiln/ui/story.gd` (extends the dialogue runner).
- `kiln/room-<name>.json` (Rooms) → `rooms/<name>/<name>.tscn` (room.gd: Background, Walk = NavigationRegion2D from the outline cut into triangles, Entries, Hotspots with hotspot.gd + CollisionPolygon2D + Stand, Front), `background.png`, `front.png`, `room.json`.
- `kiln/items-adventure.json` → `adventure/items.json` `{ items: [{ id, name, look, icon }], combos: [{ a, b, makes, text }] }`; runtime `_kiln/adventure/{adventure,room,hotspot}.gd`, brain `_kiln/brains/walker.gd`.
- `videos/<name>.ogv` (Theora/Vorbis via ffmpeg; originals in `videos/.src/`), `pictures/*.png` (Flow and story pictures), dialogue lines may carry `pic`.
- Levels: crate entities `{ type: 'crate', tile, x, y }` → CharacterBody2D with `_kiln/level/crate.gd`; Door zones with target `flow` → `flow:<zone name>`.
- Puzzle stack: `_kiln/puzzle/stacker.gd` (runs like a Logic script; a zone named `goal` is the line). Top-down brains: topdown, chaser, turret (brains_more.js); KilnInput gains aim_* actions and `twin_stick()`.
- Save game (point & click): `user://adventure_save.json` `{ room, x, y, carried, flags, gone }`.

## Looks, kits, physics, cards (2026-10-12, later)

- `kiln/game-path.json` also holds `look`: `modern` (1280×720, smooth: project default_texture_filter linear, stretch canvas_items, no `texture_filter = 1` in scenes) or `pixel` (480×270, sharp: the old way). Folders without one are Pixel.
- Template art: `static/templates/<name>.webp` + `art.json` (descriptions) from `tools/template_art.py`; kits in `adventure_kits.js`.
- Keys: `~/.config/kiln/keys.env` (mode 600, written by Edit → Services & keys…, setup.py/setup.js): CF_ACCOUNT_ID,
  CF_API_TOKEN, OPENROUTER_API_KEY, GEMINI_API_KEY; wins over ~/.config/uwf-apps/{keys,cloudflare}.env. GET /api/keys gives
  the last 4 characters only.
- Art directions: `static/templates/directions.json` `{ key: { name, inspired, words, avoid, light, pixel } }`: cold signal
  (Signalis), neon cinema (REPLACED), oil and grief (Disco Elysium), gothic relic (Blasphemous), classic 16-bit. The
  Style bible offers them ("Start from an art direction"); template_art.py paints each template picture in one.
- Levels things: `{ type: 'body', shape: box|ball|plank|seesaw, colour? }` → RigidBody2D (+ StaticBody2D pivot and PinJoint2D for a seesaw); `{ type: 'button' }` → Area2D with `_kiln/level/button.gd`; `{ type: 'gate' }` → AnimatableBody2D with `_kiln/level/gate.gd`.
- Ragdoll: actor `ragdoll: true` + `rig` → `sprites/<actor>/ragdoll.tscn` (+ `rag_<bone>.png`), `_kiln/actor/ragdoll.gd`; juice.gd `ragdoll` export.
- Cards: `kiln/cards-game.json` → `cards/cards.json` `{ hp, energy, hand, cards: {id: {name, cost, attack, block, heal, draw, picture}}, deck: [ids] }`; runtime `_kiln/cards/battle.gd`.
- Flow scene kinds added: `match3` (cols, rows, goal, moves, pieces) → `_kiln/puzzle/match3.gd`; `cards` (hp, pattern → moves, picture) ; `talk` gains `portrait`; `menu` gains `picture`.
- Room pictures keep their format (`background.webp|jpg|png`, adventure_godot.js picFile); hotspot pictures may have `scale`.
- `videos/<name>.ogv` title cards can zoom into a picture (`/api/video/card` with `image`).
- Rule book: `kiln/rules-game.json` `{ rules: { sections: [{ title, text }] } }` → `docs/RULES.md` and `rules/rules.json` (main.gd `_rules()`, menu action `rules`).
- Camera: `kiln/camera-game.json` → `camera/camera.json` `{ game: { mode, dead_w, dead_h, damping, look, bias, zoom, confine, scroll }, levels: { name: {…} } }`; main.gd `_camera()` (drag margins, smoothing, zoom, offset, look-ahead, scroll mode).
