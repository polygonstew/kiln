// Tile behaviours for Levels: what a tile does in the game (solid, one-way, slope, ladder, hazard, water),
// how Kiln draws that over the map, and what Godot gets: collision polygons + a "kind" custom data layer
// on the TileSet, and _kiln/level_tiles.gd on the TileMapLayer to ask "what is here?" (hazards hurt by themselves).

// [id, label, colour, what it does]
export const KINDS = [
  ['', 'Nothing', '#777', 'Decoration: no collision'],
  ['solid', 'Solid', '#e5534b', 'Walls and floors: nothing passes'],
  ['oneway', 'One-way', '#e3b04b', 'Platforms: stand on top, jump up through from below'],
  ['slope_r', 'Slope ◢', '#e5534b', 'Floor rising to the right (walkable ramp)'],
  ['slope_l', 'Slope ◣', '#e5534b', 'Floor rising to the left (walkable ramp)'],
  ['ladder', 'Ladder', '#9cc76b', 'Climbable, no collision: ask kind_at() in your player code'],
  ['hazard', 'Hazard', '#c06bd6', 'Spikes, lava: calls hurt() on any Kiln actor touching it'],
  ['water', 'Water', '#6fb3d9', 'Swim zone, no collision: ask kind_at()'],
];
export const kindColour = k => (KINDS.find(r => r[0] === k) || KINDS[0])[2];
export const COLLIDES = new Set(['solid', 'oneway', 'slope_r', 'slope_l']);

// collision polygon around the tile centre (Godot tile space), or null
export function polygon(k, hT) {
  const m = -hT, p = hT;
  if (k === 'solid') return [m, m, p, m, p, p, m, p];
  if (k === 'oneway') return [m, m, p, m, p, m / 2, m, m / 2];        // a thin slab on top
  if (k === 'slope_r') return [m, p, p, m, p, p];
  if (k === 'slope_l') return [m, m, p, p, m, p];
  return null;
}

// overlay one tile at (x, y) of size s on a 2d context
export function drawKind(x, k, X, Y, s) {
  if (!k) return;
  const c = kindColour(k);
  x.save(); x.fillStyle = c + '55'; x.strokeStyle = c; x.lineWidth = Math.max(1, s / 12);
  x.beginPath();
  if (k === 'slope_r') { x.moveTo(X, Y + s); x.lineTo(X + s, Y); x.lineTo(X + s, Y + s); }
  else if (k === 'slope_l') { x.moveTo(X, Y); x.lineTo(X + s, Y + s); x.lineTo(X, Y + s); }
  else if (k === 'oneway') x.rect(X, Y, s, s / 4);
  else x.rect(X, Y, s, s);
  x.closePath(); x.fill();
  if (k === 'ladder') for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(X + s * .2, Y + s * i / 4); x.lineTo(X + s * .8, Y + s * i / 4); x.stroke(); }
  if (k === 'hazard') { x.beginPath(); for (let i = 0; i <= 4; i++) x.lineTo(X + s * i / 4, Y + (i % 2 ? s * .35 : s * .75)); x.stroke(); }
  if (k === 'oneway') { x.beginPath(); x.moveTo(X, Y + 1); x.lineTo(X + s, Y + 1); x.stroke(); }
  x.restore();
}

// the TileSet lines for one tile: collision (+ one_way) and its kind
export function tileLines(key, k, hT) {
  const out = [`${key} = 0`], poly = polygon(k, hT);
  if (poly) out.push(`${key}/physics_layer_0/polygon_0/points = PackedVector2Array(${poly.join(', ')})`);
  if (k === 'oneway') out.push(`${key}/physics_layer_0/polygon_0/one_way = true`);
  if (k) out.push(`${key}/custom_data_0 = "${k}"`);
  return out.join('\n');
}
export const TILESET_LAYERS = 'physics_layer_0/collision_layer = 1\ncustom_data_layer_0/name = "kind"\ncustom_data_layer_0/type = 4\n';

export const LEVEL_TILES_GD = `extends TileMapLayer
## Kiln tile behaviours. Each tile has a "kind" (set in Kiln's Levels): "solid", "oneway", "slope_r",
## "slope_l", "ladder", "hazard", "water" or "" (decoration). Collision is already in the TileSet; this
## script answers "what is here?" and makes hazards hurt.
##   In your player:  var tiles: TileMapLayer = get_tree().get_first_node_in_group("kiln_tiles")
##                    if tiles.kind_at(global_position + Vector2(0, -4)) == "ladder": ... climb
##                    if tiles.kind_at(global_position + Vector2(0, -4)) == "water": ... swim

@export var hazards_hurt := true   ## Kiln actors (juice.gd) touching a hazard tile get hurt()
signal hazard_touched(actor: Node)

func _ready() -> void:
\tadd_to_group("kiln_tiles")

## The kind of tile at a point in the world ("" if empty or plain).
func kind_at(world_pos: Vector2) -> String:
\tvar d := get_cell_tile_data(local_to_map(to_local(world_pos)))
\treturn d.get_custom_data("kind") if d else ""

## True if any tile of this kind overlaps a rectangle in the world (e.g. an actor's body).
func touches(rect: Rect2, kind: String) -> bool:
\tvar a := local_to_map(to_local(rect.position))
\tvar b := local_to_map(to_local(rect.end - Vector2(0.01, 0.01)))
\tfor y in range(a.y, b.y + 1):
\t\tfor x in range(a.x, b.x + 1):
\t\t\tvar d := get_cell_tile_data(Vector2i(x, y))
\t\t\tif d and d.get_custom_data("kind") == kind:
\t\t\t\treturn true
\treturn false

## An actor's body rectangle in the world (its "Body" CollisionShape2D).
func body_rect(actor: Node2D) -> Rect2:
\tvar b := actor.get_node_or_null("Body") as CollisionShape2D
\tif b == null or not (b.shape is RectangleShape2D):
\t\treturn Rect2(actor.global_position, Vector2.ONE)
\tvar s: Vector2 = b.shape.size
\treturn Rect2(b.global_position - s / 2, s)

func _physics_process(_delta: float) -> void:
\tif not hazards_hurt:
\t\treturn
\tfor a in get_tree().get_nodes_in_group("kiln_actors"):
\t\tvar r := body_rect(a)
\t\tif touches(r.grow(1), "hazard"):
\t\t\thazard_touched.emit(a)
\t\t\tif a.has_method("hurt"):
\t\t\t\ta.hurt(Vector2(r.get_center().x, r.end.y + 8))
`;
