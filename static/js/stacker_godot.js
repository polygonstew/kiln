// The stacking puzzle (Tricky Towers style) for the one-screen puzzler path: one runtime script, _kiln/puzzle/stacker.gd,
// that main.gd runs like a Logic script. The level gives the base (solid tiles), where bricks appear (PlayerStart) and the
// line to reach (a zone named "goal"; its target is the next level). Bricks are made of the level's first tile.
export const STACKER = '_kiln/puzzle/stacker.gd';

export const STACKER_GD = `extends Node
## Kiln stacker: a Tricky Towers-style stacking puzzle. Bricks (four squares in the classic shapes) fall from the
## top: move them with left / right, turn them with up (or jump), drop faster with down. A brick is steered until it
## touches something; then real physics takes over and the next one comes. Build the tower up to the goal line and
## hold it there to win. A brick that falls off the bottom costs a life.
## From the level: the base (its solid tiles), where bricks appear (PlayerStart, else the top middle), the goal line
## (a zone named "goal": its top edge; its target is the next level) and the bricks' look (the tileset's first tile).

@export var fall_speed := 40.0    ## px/s while you steer a brick
@export var fast_speed := 220.0   ## px/s holding down
@export var goal_hold := 3.0      ## seconds the tower must stay up at the line
@export var lives := 3
@export var goal_height := 144.0  ## px above the start of the base, when the level has no "goal" zone

const SHAPES := [   # in squares: I, O, T, L, J, S, Z
\t[Vector2(-1.5, 0), Vector2(-0.5, 0), Vector2(0.5, 0), Vector2(1.5, 0)],
\t[Vector2(-0.5, -0.5), Vector2(0.5, -0.5), Vector2(-0.5, 0.5), Vector2(0.5, 0.5)],
\t[Vector2(-1, 0), Vector2(0, 0), Vector2(1, 0), Vector2(0, -1)],
\t[Vector2(-1, 0), Vector2(0, 0), Vector2(1, 0), Vector2(1, -1)],
\t[Vector2(-1, 0), Vector2(0, 0), Vector2(1, 0), Vector2(-1, -1)],
\t[Vector2(-1, 0), Vector2(0, 0), Vector2(0, -1), Vector2(1, -1)],
\t[Vector2(1, 0), Vector2(0, 0), Vector2(0, -1), Vector2(-1, -1)],
]
const COLOURS := [Color("#7fd6ff"), Color("#ffe066"), Color("#d08cff"), Color("#ffa94d"), Color("#6c8cff"), Color("#8ce99a"), Color("#ff6b6b")]

var world: Node2D                 # where bricks go (Main's world)
var brick: RigidBody2D            # the one being steered
var bricks: Array[RigidBody2D] = []
var size := 16.0                  # a square, px: the level's tile size
var look: Texture2D               # a square's picture (else plain colour)
var goal_y := 0.0
var bottom := 0.0
var spawn := Vector2.ZERO
var next_level := ""
var level_path := ""
var held := 0.0
var left := 0
var done := false
var label: Label
var line: Line2D

func _ready() -> void:
\tKilnInput.ensure()
\tvar ui := CanvasLayer.new()
\tlabel = Label.new()
\tlabel.position = Vector2(6, 4)
\tui.add_child(label)
\tadd_child(ui)
\tvar main := get_tree().get_first_node_in_group("kiln_main")
\tif main:
\t\tmain.level_started.connect(begin)
\t\tif main.world:
\t\t\tbegin(main.world)

## A level starts (or starts again): read the base, the goal and the start from it, then drop the first brick.
func begin(level_world: Node2D) -> void:
\tworld = level_world
\tbricks.clear()
\tbrick = null
\tdone = false
\theld = 0.0
\tleft = lives
\tvar view := get_viewport().get_visible_rect().size
\tvar lv: Node = world.get_child(0) if world.get_child_count() else null
\tlevel_path = lv.scene_file_path if lv else ""
\tvar tiles := lv.get_node_or_null("Tiles") as TileMapLayer if lv else null
\tvar area := Rect2(Vector2.ZERO, view)
\tif tiles and tiles.get_used_rect().has_area():
\t\tvar ts := Vector2(tiles.tile_set.tile_size)
\t\tsize = ts.x
\t\tarea = Rect2(Vector2(tiles.get_used_rect().position) * ts, Vector2(tiles.get_used_rect().size) * ts)
\t\tvar src := tiles.tile_set.get_source(0) as TileSetAtlasSource
\t\tif src:
\t\t\tlook = AtlasTexture.new()
\t\t\tlook.atlas = src.texture
\t\t\tlook.region = Rect2(Vector2.ZERO, ts)
\tif look == null:
\t\tlook = _plain_square()
\tbottom = area.end.y + 48.0
\tvar start := lv.get_node_or_null("PlayerStart") as Node2D if lv else null
\tspawn = start.global_position if start else Vector2(area.get_center().x, area.position.y + size * 2)
\tvar goal := lv.get_node_or_null("Zones/goal") as Node2D if lv else null
\tvar shape := goal.get_node_or_null("Shape") as CollisionShape2D if goal else null
\tgoal_y = shape.global_position.y - shape.shape.size.y / 2 if shape else area.end.y - goal_height
\tnext_level = goal.get("target") if goal else ""
\tline = Line2D.new()
\tline.points = [Vector2(area.position.x, goal_y), Vector2(area.end.x, goal_y)]
\tline.width = 4.0
\tline.default_color = Color(1, 0.75, 0.2, 0.9)
\tworld.add_child(line)
\t_new_brick()

func _new_brick() -> void:
\tif done:
\t\treturn
\tvar i := randi() % SHAPES.size()
\tbrick = RigidBody2D.new()
\tbrick.freeze = true                       # steered by hand until it lands
\tbrick.freeze_mode = RigidBody2D.FREEZE_MODE_KINEMATIC
\tbrick.physics_material_override = PhysicsMaterial.new()
\tbrick.physics_material_override.friction = 1.0
\tfor p in SHAPES[i]:
\t\tvar c := CollisionShape2D.new()
\t\tc.shape = RectangleShape2D.new()
\t\tc.shape.size = Vector2(size, size)
\t\tc.position = p * size
\t\tbrick.add_child(c)
\t\tvar s := Sprite2D.new()
\t\ts.texture = look
\t\ts.modulate = COLOURS[i]
\t\ts.position = p * size
\t\tbrick.add_child(s)
\tbrick.position = spawn
\tworld.add_child(brick)
\tbricks.append(brick)

func _physics_process(delta: float) -> void:
\tif world == null or not is_instance_valid(world) or done:
\t\treturn
\tif brick:
\t\tif Input.is_action_just_pressed("move_left"):
\t\t\t_try(Vector2(-size, 0), 0.0)
\t\tif Input.is_action_just_pressed("move_right"):
\t\t\t_try(Vector2(size, 0), 0.0)
\t\tif Input.is_action_just_pressed("move_up") or Input.is_action_just_pressed("jump"):
\t\t\t_try(Vector2.ZERO, PI / 2)
\t\tvar fall := Vector2(0, (fast_speed if Input.is_action_pressed("move_down") else fall_speed) * delta)
\t\tif brick.test_move(brick.global_transform, fall):
\t\t\t_land()
\t\telse:
\t\t\tbrick.position += fall
\t_check(delta)

# no tileset: a light square with a darker edge (each brick tints it)
func _plain_square() -> Texture2D:
\tvar n := int(size)
\tvar img := Image.create(n, n, false, Image.FORMAT_RGBA8)
\timg.fill(Color(0.55, 0.55, 0.6))
\timg.fill_rect(Rect2i(1, 1, n - 2, n - 2), Color.WHITE)
\treturn ImageTexture.create_from_image(img)

# move or turn the steered brick if nothing is in the way
func _try(move: Vector2, turn: float) -> void:
\tvar t := brick.global_transform.rotated_local(turn)
\tt.origin += move
\tif not brick.test_move(t, Vector2.ZERO):
\t\tbrick.global_transform = t

func _land() -> void:
\tbrick.freeze = false
\tbrick.linear_velocity = Vector2(0, fall_speed)
\tbrick = null
\tget_tree().create_timer(0.35).timeout.connect(_new_brick)

# lost bricks, the tower's height, winning and losing
func _check(delta: float) -> void:
\tvar top := INF
\tfor b in bricks.duplicate():
\t\tif not is_instance_valid(b):
\t\t\tbricks.erase(b)
\t\telif b.global_position.y > bottom:
\t\t\tbricks.erase(b)
\t\t\tb.queue_free()
\t\t\tleft -= 1
\t\t\tif left <= 0:
\t\t\t\t_end("The tower fell! Again…", level_path)
\t\t\t\treturn
\t\telif b != brick and b.linear_velocity.length() < 8.0:
\t\t\tfor c in b.get_children():
\t\t\t\tif c is CollisionShape2D:
\t\t\t\t\ttop = minf(top, c.global_position.y - size / 2)
\theld = held + delta if top <= goal_y else 0.0
\tlabel.text = "Bricks lost: %d of %d" % [lives - left, lives] + ("   Hold it… %.1f" % (goal_hold - held) if held > 0.0 else "")
\tif held >= goal_hold:
\t\t_end("Tower complete!", next_level)

func _end(text: String, then_level: String) -> void:
\tdone = true
\tlabel.text = text
\tawait get_tree().create_timer(2.0).timeout
\tvar main := get_tree().get_first_node_in_group("kiln_main")
\tif then_level.begins_with("flow:") and main:
\t\tmain.flow_done(then_level.substr(5))       # a "goal" Door zone to "next in the game Flow"
\telif then_level != "" and main:
\t\tmain.go_to_level(then_level)
\telse:
\t\tlabel.text = "You built it all! The end."
`;
