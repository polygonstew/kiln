// A card battle (a small Slay the Spire fight) as a Flow scene: your deck (Kiln's Cards area: cards/cards.json) against
// one enemy (the scene's settings). Each turn: draw five, three energy, play cards to attack, block, heal or draw;
// the enemy shows what it will do next, then does it. _kiln/cards/battle.gd is the whole fight.
export const BATTLE = '_kiln/cards/battle.gd';

// cards/cards.json: { hp, energy, hand, cards: { id: { name, cost, attack, block, heal, draw, picture } }, deck: [ids] }
export function cardsJSON(C, res) {
  return JSON.stringify({ hp: C.hp || 40, energy: C.energy || 3, hand: C.hand || 5,
    cards: Object.fromEntries((C.cards || []).map(c => [c.id, { name: c.name, cost: +c.cost || 0, attack: +c.attack || 0, block: +c.block || 0, heal: +c.heal || 0, draw: +c.draw || 0, picture: c.picture ? res(c.picture) : '' }])),
    deck: (C.cards || []).flatMap(c => Array(Math.max(0, +c.copies || 0)).fill(c.id)) }, null, 1) + '\n';
}
// "attack 6, attack 8, block 5" → [["attack", 6], …]
export const parseMoves = s => String(s || 'attack 6').split(',').map(t => t.trim().split(/\s+/)).filter(p => p.length === 2 && +p[1]).map(([k, v]) => [k.toLowerCase(), +v]);

export const BATTLE_GD = `extends Control
## Kiln card battle: your deck (cards/cards.json, made in Kiln's Cards area) against one enemy. Each turn you draw a
## hand and get energy; click a card (or press 1-9) to play it: attack, block, heal, draw. End the turn (E / Enter / pad
## Y) and the enemy does what its sign says, then you draw again. Win: finished("win"); out of health: finished("lose").
## Your health carries from fight to fight in run["hp"]. setup() takes Kiln Flow's scene: name, hp, picture, moves.

signal finished(outcome: String)
const CARDS := "res://cards/cards.json"
var data := {}
var run := {}                   # what lasts the whole game (the flow keeps it): hp
var foe := {"name": "Enemy", "hp": 30, "max": 30, "block": 0}
var moves: Array = [["attack", 6]]
var turn := 0
var hp := 40
var max_hp := 40
var block := 0
var energy := 3
var pile: Array = []
var hand: Array = []
var used: Array = []
var over := false
var foe_pic: TextureRect
var foe_label: Label
var me_label: Label
var row: HBoxContainer
var log_label: Label

func setup(n: Dictionary, keep: Dictionary) -> void:
\trun = keep
\tdata = JSON.parse_string(FileAccess.get_file_as_string(CARDS)) if FileAccess.file_exists(CARDS) else {}
\tif not data is Dictionary or data.get("deck", []).is_empty():
\t\tdata = {"hp": 40, "energy": 3, "hand": 5, "deck": ["strike", "strike", "strike", "strike", "guard", "guard", "guard", "mend"],
\t\t\t"cards": {"strike": {"name": "Strike", "cost": 1, "attack": 6}, "guard": {"name": "Guard", "cost": 1, "block": 5}, "mend": {"name": "Mend", "cost": 1, "heal": 4}}}
\tmax_hp = int(data.get("hp", 40))
\thp = int(run.get("hp", max_hp))
\tfoe = {"name": n.get("name", "Enemy"), "hp": int(n.get("hp", 30)) if n.get("hp", 0) else 30, "block": 0, "picture": n.get("picture", "")}
\tfoe["max"] = foe["hp"]
\tmoves = n.get("moves", []) if n.get("moves", []).size() else [["attack", 6]]

func _ready() -> void:
\tset_anchors_preset(Control.PRESET_FULL_RECT)
\tvar view := get_viewport_rect().size
\tfoe_pic = TextureRect.new()
\tfoe_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\tfoe_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
\tfoe_pic.size = Vector2(view.x * 0.3, view.y * 0.42)
\tfoe_pic.position = Vector2((view.x - foe_pic.size.x) / 2, view.y * 0.04)
\tfoe_pic.pivot_offset = foe_pic.size / 2
\tif foe["picture"] != "" and ResourceLoader.exists(foe["picture"]):
\t\tfoe_pic.texture = load(foe["picture"])
\tadd_child(foe_pic)
\tfoe_label = _label(Vector2(view.x / 2 - 200, view.y * 0.47), 400, HORIZONTAL_ALIGNMENT_CENTER, 18)
\tme_label = _label(Vector2(24, view.y * 0.56), 400, HORIZONTAL_ALIGNMENT_LEFT, 18)
\tlog_label = _label(Vector2(view.x - 424, view.y * 0.56), 400, HORIZONTAL_ALIGNMENT_RIGHT, 14)
\trow = HBoxContainer.new()
\trow.add_theme_constant_override("separation", 10)
\trow.position = Vector2(24, view.y * 0.66)
\trow.size = Vector2(view.x - 48, view.y * 0.32)
\trow.alignment = BoxContainer.ALIGNMENT_CENTER
\tadd_child(row)
\tvar end := Button.new()
\tend.text = "End turn (E)"
\tend.position = Vector2(view.x - 180, view.y * 0.6)
\tend.pressed.connect(end_turn)
\tadd_child(end)
\tpile = data["deck"].duplicate()
\tpile.shuffle()
\t_start_turn()

func _label(at: Vector2, w: float, align: HorizontalAlignment, size: int) -> Label:
\tvar l := Label.new()
\tl.position = at
\tl.size.x = w
\tl.horizontal_alignment = align
\tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\tl.add_theme_font_size_override("font_size", size)
\tl.add_theme_color_override("font_outline_color", Color.BLACK)
\tl.add_theme_constant_override("outline_size", 6)
\tadd_child(l)
\treturn l

func _start_turn() -> void:
\tenergy = int(data.get("energy", 3))
\tblock = 0
\tfor i in int(data.get("hand", 5)):
\t\t_draw()
\t_show()

func _draw() -> void:
\tif pile.is_empty():
\t\tpile = used.duplicate()
\t\tused.clear()
\t\tpile.shuffle()
\tif pile.size():
\t\thand.append(pile.pop_back())

func _intent() -> Array:
\treturn moves[turn % moves.size()]

func _show() -> void:
\tvar i := _intent()
\tfoe_label.text = "%s   %d / %d%s\\nNext: %s %d" % [foe["name"], foe["hp"], foe["max"], "   block %d" % foe["block"] if foe["block"] else "", i[0], i[1]]
\tme_label.text = "You   %d / %d%s\\n%d energy   deck %d · used %d" % [hp, max_hp, "   block %d" % block if block else "", energy, pile.size(), used.size()]
\tfor c in row.get_children():
\t\tc.queue_free()
\tfor k in hand.size():
\t\trow.add_child(_card(hand[k], k))

# one card: its cost, picture, name and what it does
func _card(id: String, k: int) -> Button:
\tvar c: Dictionary = data["cards"].get(id, {"name": id})
\tvar b := Button.new()
\tb.custom_minimum_size = Vector2(150, 210)
\tb.disabled = int(c.get("cost", 0)) > energy or over
\tvar look := StyleBoxFlat.new()
\tlook.bg_color = Color("#1d1b2a")
\tlook.border_color = Color("#e05d5d") if c.get("attack", 0) else Color("#4cc9f0") if c.get("block", 0) else Color("#06d6a0")
\tlook.set_border_width_all(3)
\tlook.set_corner_radius_all(10)
\tb.add_theme_stylebox_override("normal", look)
\tvar hover := look.duplicate()
\thover.bg_color = Color("#2b2840")
\tb.add_theme_stylebox_override("hover", hover)
\tvar box := VBoxContainer.new()
\tbox.set_anchors_preset(Control.PRESET_FULL_RECT)
\tbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
\tbox.add_theme_constant_override("separation", 2)
\tb.add_child(box)
\tvar pic := TextureRect.new()
\tpic.custom_minimum_size = Vector2(0, 100)
\tpic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\tpic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
\tpic.mouse_filter = Control.MOUSE_FILTER_IGNORE
\tif c.get("picture", "") != "" and ResourceLoader.exists(c["picture"]):
\t\tpic.texture = load(c["picture"])
\tvar parts := []
\tfor key in ["attack", "block", "heal", "draw"]:
\t\tif c.get(key, 0):
\t\t\tparts.append({"attack": "Deal %d", "block": "Block %d", "heal": "Heal %d", "draw": "Draw %d"}[key] % int(c[key]))
\tfor t in ["%d · %s" % [int(c.get("cost", 0)), c.get("name", id)], "", ". ".join(parts)]:
\t\tif t == "":
\t\t\tbox.add_child(pic)
\t\t\tcontinue
\t\tvar l := Label.new()
\t\tl.text = t
\t\tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\t\tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\t\tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
\t\tbox.add_child(l)
\tb.pressed.connect(play.bind(k))
\treturn b

## Play the card at this place in the hand.
func play(k: int) -> void:
\tif over or k >= hand.size():
\t\treturn
\tvar id: String = hand[k]
\tvar c: Dictionary = data["cards"].get(id, {})
\tif int(c.get("cost", 0)) > energy:
\t\tlog_label.text = "Not enough energy."
\t\treturn
\tenergy -= int(c.get("cost", 0))
\thand.remove_at(k)
\tused.append(id)
\tif c.get("attack", 0):
\t\tvar dmg := maxi(0, int(c["attack"]) - foe["block"])
\t\tfoe["block"] = maxi(0, foe["block"] - int(c["attack"]))
\t\tfoe["hp"] = maxi(0, foe["hp"] - dmg)
\t\tvar t := create_tween()
\t\tt.tween_property(foe_pic, "rotation", 0.08, 0.05)
\t\tt.tween_property(foe_pic, "rotation", 0.0, 0.1)
\t\tlog_label.text = "%s: %d damage" % [c.get("name", id), dmg]
\tblock += int(c.get("block", 0))
\thp = mini(max_hp, hp + int(c.get("heal", 0)))
\tfor i in int(c.get("draw", 0)):
\t\t_draw()
\tif foe["hp"] <= 0:
\t\t_end("win")
\t\treturn
\t_show()

## The enemy's turn: it does what its sign said, then you draw a new hand.
func end_turn() -> void:
\tif over:
\t\treturn
\tused.append_array(hand)
\thand.clear()
\tfoe["block"] = 0
\tvar i := _intent()
\tif i[0] == "attack":
\t\tvar dmg := maxi(0, int(i[1]) - block)
\t\thp -= dmg
\t\tlog_label.text = "%s hits you for %d" % [foe["name"], dmg]
\t\tvar t := create_tween()
\t\tt.tween_property(self, "position", Vector2(8, 0), 0.04)
\t\tt.tween_property(self, "position", Vector2.ZERO, 0.08)
\telse:
\t\tfoe["block"] = int(i[1])
\t\tlog_label.text = "%s raises its guard" % foe["name"]
\tturn += 1
\tif hp <= 0:
\t\t_end("lose")
\t\treturn
\t_start_turn()

func _end(outcome: String) -> void:
\tover = true
\trun["hp"] = maxi(1, hp) if outcome == "win" else max_hp
\t_show()
\tlog_label.text = "Victory!" if outcome == "win" else "You fall…"
\tawait get_tree().create_timer(1.6).timeout
\tfinished.emit(outcome)

func _unhandled_input(e: InputEvent) -> void:
\tif e is InputEventKey and e.pressed and not e.echo:
\t\tif e.keycode >= KEY_1 and e.keycode <= KEY_9:
\t\t\tplay(e.keycode - KEY_1)
\t\telif e.keycode == KEY_E or e.keycode == KEY_ENTER:
\t\t\tend_turn()
\telif e.is_action_pressed("interact"):
\t\tend_turn()
`;
