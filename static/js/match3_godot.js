// Match-3 (Candy Crush, Bejeweled) as a Flow scene: a board of pieces; swap two neighbours to line up three or more of a
// kind; they pop, the ones above fall, new ones drop in, chains score more. Reach the goal score within the moves to win.
// _kiln/puzzle/match3.gd is the whole game; flow.gd makes one per "match3" scene with that scene's settings.
export const MATCH3 = '_kiln/puzzle/match3.gd';

export const MATCH3_GD = `extends Node2D
## Kiln match-3: swap two neighbouring pieces (click one, then the next; or drag; or arrows + Space / pad A) to line up
## three or more of a kind. They pop, the pieces above fall, new ones drop in, and chains score more each time.
## Reach goal points within moves to win (finished("win")), run out of moves first and it's finished("lose").
## setup() takes Kiln Flow's scene: cols, rows, pieces (picture paths; plain gems if there are none), moves, goal.

signal finished(outcome: String)
const COLOURS := [Color("#ff5d73"), Color("#ffd166"), Color("#06d6a0"), Color("#4cc9f0"), Color("#b388ff"), Color("#ff9f1c"), Color("#f1faee")]
var cols := 8
var rows := 8
var kinds := 6
var moves := 20
var goal := 1500
var score := 0
var cell := 64.0
var board: Array = []           # kind per cell, -1 = empty
var tiles: Array = []           # a Sprite2D per cell
var looks: Array[Texture2D] = []
var picked := Vector2i(-1, -1)
var cursor := Vector2i(0, 0)
var busy := false
var hud: Label
var mark: Sprite2D

func setup(n: Dictionary) -> void:
\tcols = clampi(int(n.get("cols", 8)), 4, 12)
\trows = clampi(int(n.get("rows", 8)), 4, 12)
\tmoves = int(n.get("moves", 20)) if n.get("moves", 0) else 20
\tgoal = int(n.get("goal", 1500)) if n.get("goal", 0) else 1500
\tfor p in n.get("pieces", []):
\t\tif p != "" and ResourceLoader.exists(p):
\t\t\tlooks.append(load(p))
\tkinds = looks.size() if looks.size() >= 3 else 6
\tif looks.size() < 3:
\t\tlooks.clear()
\t\tfor i in kinds:
\t\t\tlooks.append(_gem(COLOURS[i]))

func _ready() -> void:
\tvar view := get_viewport_rect().size
\tcell = floorf(minf(view.x * 0.62 / cols, view.y * 0.84 / rows))
\tposition = (view - Vector2(cols, rows) * cell) / 2 + Vector2(view.x * 0.08, 0)
\thud = Label.new()
\thud.position = Vector2(24, 24) - position          # top left of the screen
\thud.add_theme_font_size_override("font_size", int(cell * 0.38))
\tadd_child(hud)
\tvar bg := ColorRect.new()
\tbg.color = Color(0, 0, 0, 0.35)
\tbg.size = Vector2(cols, rows) * cell + Vector2(12, 12)
\tbg.position = Vector2(-6, -6)
\tbg.show_behind_parent = true
\tadd_child(bg)
\tmark = Sprite2D.new()
\tmark.texture = _ring()
\tmark.z_index = 2
\tadd_child(mark)
\tboard.resize(cols * rows)
\ttiles.resize(cols * rows)
\tfor y in rows:
\t\tfor x in cols:
\t\t\tvar k := randi() % kinds
\t\t\twhile (x >= 2 and board[_i(x - 1, y)] == k and board[_i(x - 2, y)] == k) or (y >= 2 and board[_i(x, y - 1)] == k and board[_i(x, y - 2)] == k):
\t\t\t\tk = randi() % kinds          # no matches at the start
\t\t\tboard[_i(x, y)] = k
\t\t\ttiles[_i(x, y)] = _piece(k, Vector2i(x, y), -rows + y)
\t_show()

func _i(x: int, y: int) -> int:
\treturn y * cols + x

func _at(c: Vector2i) -> Vector2:
\treturn (Vector2(c) + Vector2(0.5, 0.5)) * cell

# a piece: its picture fitted to the cell, dropping in from row "from"
func _piece(k: int, c: Vector2i, from: int) -> Sprite2D:
\tvar s := Sprite2D.new()
\ts.texture = looks[k]
\ts.scale = Vector2.ONE * (cell * 0.86 / maxf(looks[k].get_width(), looks[k].get_height()))
\ts.position = _at(Vector2i(c.x, from))
\tadd_child(s)
\tcreate_tween().tween_property(s, "position", _at(c), 0.12 + 0.03 * (c.y - from)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
\treturn s

func _show() -> void:
\thud.text = "Score %d / %d\\nMoves %d" % [score, goal, moves]
\tmark.visible = picked.x >= 0 or Input.get_connected_joypads().size() > 0
\tmark.position = _at(picked if picked.x >= 0 else cursor)
\tmark.scale = Vector2.ONE * (cell / 64.0)

# ---------------------------------------------------------------- input: click, drag, keys and pad
func _unhandled_input(e: InputEvent) -> void:
\tif busy:
\t\treturn
\tif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
\t\tvar c := Vector2i(((e.position - global_position) / cell).floor())
\t\tif c.x < 0 or c.y < 0 or c.x >= cols or c.y >= rows:
\t\t\treturn
\t\tif e.pressed:
\t\t\t_choose(c)
\t\telif picked.x >= 0 and c != picked:
\t\t\t_choose(c)                        # dragged onto a neighbour
\telif e.is_action_pressed("move_left") or e.is_action_pressed("ui_left"):
\t\t_move(Vector2i.LEFT)
\telif e.is_action_pressed("move_right") or e.is_action_pressed("ui_right"):
\t\t_move(Vector2i.RIGHT)
\telif e.is_action_pressed("move_up") or e.is_action_pressed("ui_up"):
\t\t_move(Vector2i.UP)
\telif e.is_action_pressed("move_down") or e.is_action_pressed("ui_down"):
\t\t_move(Vector2i.DOWN)
\telif e.is_action_pressed("jump") or e.is_action_pressed("ui_accept"):
\t\t_choose(cursor)

func _move(d: Vector2i) -> void:
\tcursor = (cursor + d).clamp(Vector2i.ZERO, Vector2i(cols - 1, rows - 1))
\tif picked.x >= 0:
\t\t_choose(cursor)
\t_show()

func _choose(c: Vector2i) -> void:
\tif picked.x < 0:
\t\tpicked = c
\telif (c - picked).abs().x + (c - picked).abs().y == 1:
\t\tvar a := picked
\t\tpicked = Vector2i(-1, -1)
\t\t_swap(a, c)
\telse:
\t\tpicked = c
\tcursor = c
\t_show()

# ---------------------------------------------------------------- a move: swap, pop, fall, fill, repeat
func _swap(a: Vector2i, b: Vector2i) -> void:
\tbusy = true
\tawait _exchange(a, b)
\tif _matches().is_empty():
\t\tawait _exchange(a, b)                 # no match: back they go
\t\tbusy = false
\t\treturn
\tmoves -= 1
\tvar chain := 1
\twhile true:
\t\tvar hit := _matches()
\t\tif hit.is_empty():
\t\t\tbreak
\t\tscore += hit.size() * 20 * chain
\t\tchain += 1
\t\tfor i in hit:
\t\t\tvar s: Sprite2D = tiles[i]
\t\t\tcreate_tween().tween_property(s, "scale", Vector2.ZERO, 0.15)
\t\t\tboard[i] = -1
\t\tawait get_tree().create_timer(0.17).timeout
\t\tfor i in hit:
\t\t\ttiles[i].queue_free()
\t\t\ttiles[i] = null
\t\t_fall()
\t\tawait get_tree().create_timer(0.32).timeout
\t_show()
\tbusy = false
\tif score >= goal:
\t\tfinished.emit("win")
\telif moves <= 0:
\t\tfinished.emit("lose")

func _exchange(a: Vector2i, b: Vector2i) -> void:
\tvar ia := _i(a.x, a.y)
\tvar ib := _i(b.x, b.y)
\tvar k = board[ia]; board[ia] = board[ib]; board[ib] = k
\tvar s = tiles[ia]; tiles[ia] = tiles[ib]; tiles[ib] = s
\tvar t := create_tween().set_parallel()
\tt.tween_property(tiles[ia], "position", _at(a), 0.16)
\tt.tween_property(tiles[ib], "position", _at(b), 0.16)
\tawait t.finished

# every cell in a line of three or more of a kind
func _matches() -> Array:
\tvar out := {}
\tfor y in rows:
\t\tfor x in cols:
\t\t\tvar k = board[_i(x, y)]
\t\t\tif k < 0:
\t\t\t\tcontinue
\t\t\tif x + 2 < cols and board[_i(x + 1, y)] == k and board[_i(x + 2, y)] == k:
\t\t\t\tfor d in 3:
\t\t\t\t\tout[_i(x + d, y)] = true
\t\t\tif y + 2 < rows and board[_i(x, y + 1)] == k and board[_i(x, y + 2)] == k:
\t\t\t\tfor d in 3:
\t\t\t\t\tout[_i(x, y + d)] = true
\treturn out.keys()

# pieces fall into the gaps, new ones drop in from the top
func _fall() -> void:
\tfor x in cols:
\t\tvar dest := rows - 1
\t\tfor y in range(rows - 1, -1, -1):
\t\t\tif board[_i(x, y)] >= 0:
\t\t\t\tif y != dest:
\t\t\t\t\tboard[_i(x, dest)] = board[_i(x, y)]
\t\t\t\t\ttiles[_i(x, dest)] = tiles[_i(x, y)]
\t\t\t\t\tboard[_i(x, y)] = -1
\t\t\t\t\ttiles[_i(x, y)] = null
\t\t\t\t\tcreate_tween().tween_property(tiles[_i(x, dest)], "position", _at(Vector2i(x, dest)), 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
\t\t\t\tdest -= 1
\t\tfor y in range(dest, -1, -1):
\t\t\tvar k := randi() % kinds
\t\t\tboard[_i(x, y)] = k
\t\t\ttiles[_i(x, y)] = _piece(k, Vector2i(x, y), y - dest - 1)

# ---------------------------------------------------------------- plain looks when the scene has no pictures
func _gem(c: Color) -> Texture2D:
\tvar img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
\tfor y in 64:
\t\tfor x in 64:
\t\t\tvar d := Vector2(x - 31.5, y - 31.5).length()
\t\t\tif d < 28.0:
\t\t\t\timg.set_pixel(x, y, c.lightened(clampf((20.0 - Vector2(x - 24, y - 22).length()) / 40.0, 0.0, 0.5)) if d < 26.0 else c.darkened(0.35))
\treturn ImageTexture.create_from_image(img)

func _ring() -> Texture2D:
\tvar img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
\tfor y in 64:
\t\tfor x in 64:
\t\t\tif x < 3 or y < 3 or x > 60 or y > 60:
\t\t\t\timg.set_pixel(x, y, Color.WHITE)
\treturn ImageTexture.create_from_image(img)
`;
