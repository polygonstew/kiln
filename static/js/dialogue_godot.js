// Dialogue → Godot: the game file (dialogue/<name>.json, res:// paths) and the runner script that plays it through
// the Kiln HUD (_kiln/ui/dialogue.gd). Plain data and one short, commented script; Logic's "Start a dialogue"
// makes the runner when it is first needed.

// the Kiln project (dialogue.js) → what the game reads
export function gameJSON(d, resPrefix = 'res://') {
  const cast = Object.fromEntries((d.cast || []).map(c => [c.name, c.actor || '']));
  const order = d.beats.map(b => b.id), beats = {};
  d.beats.forEach((b, i) => {
    const next = b.next === 'end' ? 'end' : b.next || order[i + 1] || 'end';
    beats[b.id] = { who: b.who || '', actor: cast[b.who] || '', text: b.text || '', voice: b.voice ? resPrefix + b.voice : '', next,
      choices: (b.choices || []).map(c => ({ text: c.text || '…', next: c.next === 'end' ? 'end' : c.next || order[i + 1] || 'end', if: c.if?.k ? { [c.if.k]: c.if.v || '' } : {}, do: (c.do || []).filter(x => x.k).map(x => ({ [x.k]: x.v || '' })) })),
      do: (b.do || []).filter(x => x.k).map(x => ({ [x.k]: x.v || '' })) };
  });
  return { name: d.name, start: order[0] || 'end', beats };
}

export const DIALOGUE_GD = `extends Node
## Kiln dialogue: runs a conversation written in Kiln's Dialogue area (dialogue/<name>.json) through the Kiln HUD:
## each line in the dialogue box (said with lip sync when it has a voice line and its actor has a LipSync node),
## choices as a small menu, conditions on items and flags, and what lines and choices do (give or take an item,
## set or clear a flag, send a message to the Logic graphs). The player stands still while a conversation runs.
##   get_tree().get_first_node_in_group("kiln_dialogue").start("res://dialogue/miner.json")   (Logic: "Start a dialogue")
signal finished(dialogue_name: String)
signal _read                    # Space / Enter on our own box
var flags := {}                 # flags set by dialogues, kept all game: every dialogue (and Logic) can read them
var _d := {}                    # the conversation running now
var _menu: CanvasLayer
var _own: CanvasLayer           # a plain box of our own, when the HUD has no dialogue box

func _ready() -> void:
\tadd_to_group("kiln_dialogue")

func start(path: String) -> void:
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(path))
\tif not d is Dictionary:
\t\tpush_warning("Kiln dialogue: cannot read " + path)
\t\treturn
\t_d = d
\t_hold_player(true)
\t_line(str(d.get("start", "end")))

func running() -> bool:
\treturn not _d.is_empty()

# one line: do what it does, show it, say it, then its choices or the next line
func _line(id: String) -> void:
\tvar beats: Dictionary = _d.get("beats", {})
\tif not beats.has(id):
\t\t_end()
\t\treturn
\tvar b: Dictionary = beats[id]
\t_apply(b.get("do", []))
\tvar hud := _box_hud()
\tif hud:
\t\thud.say(b.get("who", ""), b.get("text", ""))
\telse:
\t\t_own_box(b.get("who", ""), b.get("text", ""))
\tif b.get("voice", "") != "":
\t\t_speak(b.get("actor", ""), b["voice"])
\tvar choices: Array = b.get("choices", []).filter(func(c): return _allowed(c.get("if", {})))
\tif choices.size():
\t\t_ask(choices)
\t\treturn
\tif hud:
\t\tawait hud.dialogue_finished       # the player read it (Space / Enter)
\telse:
\t\tawait _read
\t_line(str(b.get("next", "end")))

# the Kiln HUD, if it has a dialogue box (HUD → Dialogue widget)
func _box_hud() -> Node:
\tvar hud := get_tree().get_first_node_in_group("kiln_hud")
\treturn hud if hud and hud.has_method("_dialogue") and hud._dialogue() else null

# no HUD dialogue box: a plain one along the bottom of the screen
func _own_box(who: String, text: String) -> void:
\tif _own == null:
\t\t_own = CanvasLayer.new()
\t\t_own.layer = 25
\t\tvar panel := PanelContainer.new()
\t\tpanel.anchor_right = 1.0
\t\tpanel.anchor_top = 1.0
\t\tpanel.anchor_bottom = 1.0
\t\tpanel.offset_left = 8
\t\tpanel.offset_right = -8
\t\tpanel.offset_top = -64
\t\tpanel.offset_bottom = -8
\t\tvar label := Label.new()
\t\tlabel.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\t\tpanel.add_child(label)
\t\t_own.add_child(panel)
\t\tadd_child(_own)
\t_own.visible = true
\t(_own.get_child(0).get_child(0) as Label).text = (who + ": " if who != "" else "") + text

func _unhandled_input(e: InputEvent) -> void:
\tif _own and _own.visible and _menu == null and e.is_action_pressed("ui_accept"):
\t\tget_viewport().set_input_as_handled()
\t\t_read.emit()

# choices: a menu of buttons; the one picked does its things and leads on
func _ask(choices: Array) -> void:
\t_menu = CanvasLayer.new()
\t_menu.layer = 30
\tvar box := VBoxContainer.new()
\tbox.set_anchors_and_offsets_preset(Control.PRESET_CENTER_RIGHT)
\tbox.position.x -= 12
\t_menu.add_child(box)
\tadd_child(_menu)
\tfor c in choices:
\t\tvar b := Button.new()
\t\tb.text = c.get("text", "…")
\t\tb.pressed.connect(_chose.bind(c))
\t\tbox.add_child(b)
\tbox.get_child(0).grab_focus()

func _chose(c: Dictionary) -> void:
\t_menu.queue_free()
\t_menu = null
\t_apply(c.get("do", []))
\t_line(str(c.get("next", "end")))

func _allowed(cond: Dictionary) -> bool:
\tvar hud := get_tree().get_first_node_in_group("kiln_hud")
\tif cond.has("item"):
\t\treturn hud != null and hud.has_item(cond["item"])
\tif cond.has("noitem"):
\t\treturn hud == null or not hud.has_item(cond["noitem"])
\tif cond.has("flag"):
\t\treturn flags.has(cond["flag"])
\tif cond.has("noflag"):
\t\treturn not flags.has(cond["noflag"])
\treturn true

func _apply(effects: Array) -> void:
\tvar hud := get_tree().get_first_node_in_group("kiln_hud")
\tfor e in effects:
\t\tif e.has("give") and hud:
\t\t\thud.add_item(e["give"])
\t\telif e.has("take") and hud:
\t\t\thud.remove_item(e["take"])
\t\telif e.has("flag"):
\t\t\tflags[e["flag"]] = true
\t\telif e.has("unflag"):
\t\t\tflags.erase(e["unflag"])
\t\telif e.has("message"):
\t\t\tget_tree().call_group("kiln_logic", "_kiln_message", e["message"])

# the speaker's voice line: its actor moves its mouth (LipSync), or the sound just plays
func _speak(actor: String, voice: String) -> void:
\tfor a in get_tree().get_nodes_in_group("kiln_actors"):
\t\tif actor != "" and a.name.begins_with(actor) and a.has_node("LipSync"):
\t\t\ta.get_node("LipSync").say(voice)
\t\t\treturn
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(voice))
\tif d is Dictionary:
\t\tvar s := AudioStreamPlayer.new()
\t\ts.stream = load(voice.get_base_dir().path_join(d.get("sound", "")))
\t\ts.finished.connect(s.queue_free)
\t\tadd_child(s)
\t\ts.play()

func _hold_player(on: bool) -> void:
\tvar p := get_tree().get_first_node_in_group("player")
\tif p and p.has_node("Brain"):
\t\tp.get_node("Brain").process_mode = Node.PROCESS_MODE_DISABLED if on else Node.PROCESS_MODE_INHERIT
\tif p and on and "velocity" in p:
\t\tp.velocity = Vector2.ZERO

func _end() -> void:
\tif _box_hud():
\t\t_box_hud()._dialogue().visible = false
\tif _own:
\t\t_own.visible = false
\t_hold_player(false)
\tvar n: String = _d.get("name", "")
\t_d = {}
\tfinished.emit(n)
`;
