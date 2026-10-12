// Crates for Levels (one-screen puzzles, Unit 404 / Sokoban style): a box the player pushes by walking into it. It
// falls, slides while pushed and settles on whole tiles. Placed in Levels → Things → Crate, it looks like the tile that
// was picked; saved as a CharacterBody2D running _kiln/level/crate.gd (group "pushable": the platformer brain pushes it).
// A crate is an entity { type: 'crate', tile, x, y } (x, y = the middle of its bottom edge, in level pixels).
import { SHARP } from './gametype.js';

export const CRATE_GD = `extends CharacterBody2D
## Kiln crate: a box the player pushes (the platformer brain calls push() when it walks into one). It falls with
## gravity, slides while pushed and settles on a whole tile so puzzles stay tidy. Its origin is the middle of its
## bottom edge, like Kiln's actors.

@export var push_speed := 40.0   ## px/s while pushed
@export var gravity := 900.0
@export var tile := 16.0         ## settles on this grid when nobody pushes it
var _pushed := 0.0               # the push this frame: -1 left, 1 right

func _ready() -> void:
\tadd_to_group("pushable")

## Push it left (-1) or right (1) for this frame.
func push(direction: float) -> void:
\t_pushed = signf(direction)

func _physics_process(delta: float) -> void:
\tvelocity.y += gravity * delta
\tif _pushed != 0.0 and is_on_floor():
\t\tvelocity.x = _pushed * push_speed
\telif is_on_floor():                       # settle on the nearest whole tile
\t\tvar goal := (roundf(position.x / tile - 0.5) + 0.5) * tile
\t\tvelocity.x = clampf((goal - position.x) / delta, -push_speed, push_speed)
\telse:
\t\tvelocity.x = 0.0
\t_pushed = 0.0
\tmove_and_slide()
`;

// draw the crates on the Levels map (src: the tileset canvas, z: zoom)
export function drawCrates(x, ents, src, T, cols, z) {
  for (const e of ents) if (e.type === 'crate') {
    x.drawImage(src, (e.tile % cols) * T, Math.floor(e.tile / cols) * T, T, T, (e.x - T / 2) * z, (e.y - T) * z, T * z, T * z);
    x.strokeStyle = '#e3b04b'; x.lineWidth = 1; x.strokeRect((e.x - T / 2) * z + .5, (e.y - T) * z + .5, T * z - 1, T * z - 1);
  }
}

// scene text for a level's crates: { ext, subs, nodes }; tsRes = the level's tileset.png, crateGd = the script's res path
export function crateParts(ents, T, cols, tsRes, crateGd) {
  const crates = ents.filter(e => e.type === 'crate');
  if (!crates.length) return { ext: '', subs: '', nodes: '' };
  const tiles = [...new Set(crates.map(e => e.tile))];
  return {
    ext: `[ext_resource type="Texture2D" path="${tsRes}" id="crate_ts"]\n[ext_resource type="Script" path="${crateGd}" id="crate"]\n`,
    subs: `[sub_resource type="RectangleShape2D" id="crate_shape"]\nsize = Vector2(${T - 0.5}, ${T})\n\n`
      + tiles.map(t => `[sub_resource type="AtlasTexture" id="crate_${t}"]\natlas = ExtResource("crate_ts")\nregion = Rect2(${(t % cols) * T}, ${Math.floor(t / cols) * T}, ${T}, ${T})\n\n`).join(''),
    nodes: crates.map((e, i) => `[node name="Crate_${i + 1}" type="CharacterBody2D" parent="."]\nposition = Vector2(${e.x}, ${e.y})\nscript = ExtResource("crate")\ntile = ${T}.0\n\n`
      + `[node name="Sprite" type="Sprite2D" parent="Crate_${i + 1}"]\n${SHARP()}position = Vector2(0, ${-T / 2})\ntexture = SubResource("crate_${e.tile}")\n\n`
      + `[node name="Shape" type="CollisionShape2D" parent="Crate_${i + 1}"]\nposition = Vector2(0, ${-T / 2})\nshape = SubResource("crate_shape")\n\n`).join(''),
  };
}
