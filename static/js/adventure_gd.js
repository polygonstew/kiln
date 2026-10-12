// The point & click runtime: three short GDScripts Kiln writes into _kiln/adventure/ for a game that starts in a room.
//   ROOM_GD       room.gd on every room scene: size, depth scale, music
//   HOTSPOT_GD    hotspot.gd on every hotspot (an Area2D with a CollisionPolygon2D): what it is and what it does
//   ADVENTURE_GD  adventure.gd, one node Main adds: clicking, the cursor, the inventory, speech, flags, save / load, music
// The walker brain (brains_more.js) does the walking. room_godot.js writes the scenes that use these.

export const ROOM_GD = `extends Node2D
## Kiln room: one place in a point & click adventure (made in Kiln's Rooms). Background is the picture, Walk (a
## NavigationRegion2D) is where people can walk, Hotspots are the things to look at and use, Entries are where you
## arrive (an exit names one), Front is drawn over everyone. People are smaller further away: their scale goes from
## far_scale at far_y to near_scale at near_y (the walker brain asks scale_at()).

@export var size := Vector2(480, 270)   ## the room's size (its background): the camera stays inside it
@export var far_y := 150.0
@export var far_scale := 0.6
@export var near_y := 270.0
@export var near_scale := 1.0
@export var music: AudioStream           ## plays while you are here (it carries on into rooms with the same music)

func _ready() -> void:
\tadd_to_group("kiln_room")

## How big a person standing at height y is drawn.
func scale_at(y: float) -> float:
\treturn lerpf(far_scale, near_scale, clampf(inverse_lerp(far_y, near_y, y), 0.0, 1.0))

func has_walk() -> bool:
\treturn has_node("Walk")
`;

export const HOTSPOT_GD = `extends Area2D
## Kiln hotspot: a thing in a room you can look at (right click) and use (left click), or use an item on. Its shape is
## the CollisionPolygon2D "Shape"; the hero walks to the Marker2D "Stand" first. What it does when used:
##   say   says text            pick  gives item (and says text)        talk  starts a conversation (dialogue)
##   go    goes to another room (room), arriving at entry               none  only text, if any
##   leave ends this part of the game: Kiln's Flow goes on, with this hotspot's name as the outcome
## It can need an item used on it (needs) or a story flag (needs_flag) first, use the item up (takes), set a flag,
## play a sound, send a message to Logic graphs, and vanish afterwards. "when" / "unless" make it appear or go as the
## story moves on (a door that is open only once the flag door_open is set). The adventure runtime does the clicking.

@export var title := ""                  ## the name shown under the cursor
@export_multiline var look := ""         ## said when you look at it (right click)
@export_file("*.json") var look_voice := ""   ## a Kiln voice line for the look (lip sync)
@export_enum("say", "pick", "talk", "go", "leave", "none") var does := "say"
@export_multiline var text := ""         ## said when it is used
@export var item := ""                   ## pick: the item it gives
@export_file("*.json") var dialogue := ""     ## talk: the conversation
@export_file("*.tscn") var room := ""         ## go: the room
@export var entry := "start"             ## go: where you arrive there
@export var needs := ""                  ## an item you must use on it first
@export var needs_flag := ""             ## a story flag that must be set first
@export_multiline var locked_text := ""  ## said when it needs something
@export var takes := false               ## the needed item is used up
@export var sets_flag := ""              ## a story flag it sets when used
@export var vanish := false              ## gone once used (a thing you pick up)
@export var when := ""                   ## only here while this flag is set
@export var unless := ""                 ## gone once this flag is set
@export var sound: AudioStream           ## played when it is used
@export var message := ""                ## sent to Logic graphs when it is used ("When a message arrives")
signal used(hotspot: Node)

## Is this point (in the world) on it?
func contains(point: Vector2) -> bool:
\tvar shape := get_node_or_null("Shape") as CollisionPolygon2D
\treturn shape != null and Geometry2D.is_point_in_polygon(shape.to_local(point), shape.polygon)

## Where the hero stands to use it.
func stand_point() -> Vector2:
\tvar m := get_node_or_null("Stand") as Node2D
\treturn m.global_position if m else global_position
`;

export const ADVENTURE_GD = `extends CanvasLayer
## Kiln adventure: the point & click part of a game, one node Main adds when the game starts in a room.
##   Click to walk; click a thing (a hotspot) to use it: the hero walks there first. Right click to look at it.
##   The inventory slides up at the bottom: click an item to hold it, then click a thing to use it there or another
##   item to combine them. Right click an item to look at it, or to put back the one in hand.
##   Keys / pad: the stick walks, E / Y uses the nearest thing, Tab / Back opens the inventory, F5 saves, F9 loads.
## It keeps the game's state: the items you carry, the story flags (shared with Kiln's dialogue runner, so
## conversations see them) and which things are gone, and saves it to user://adventure_save.json (Menus: "Save the
## game", "Load the last save"). Items and how they combine come from adventure/items.json (Kiln's Rooms → Items).

const ITEMS := "res://adventure/items.json"
const SAVE := "user://adventure_save.json"
const DIALOGUE := "res://_kiln/ui/dialogue.gd"
const NOPE := ["That won't work.", "I can't use that there.", "Hmm. No."]

var items := {}                 # id -> {name, look, icon}
var combos: Array = []          # [{a, b, makes, text}]
var carried: Array[String] = []
var flags := {}                 # story flags (the dialogue runner shares this dictionary)
var gone := {}                  # "room:thing" -> true, things that vanished
var held := ""                  # the item in hand
var room: Node                  # the room on screen
var _dlg: Node                  # the dialogue runner
var _icons := {}
var _say_left := 0.0
var _drawer_open := 0.0         # seconds the inventory stays up (after picking something up)
var _load_at := Vector2.INF     # where the hero stands after loading a save
var bar: HBoxContainer
var drawer: PanelContainer
var hover: Label
var hand: TextureRect
var speech: Label
var note: Label
var music: AudioStreamPlayer

func _ready() -> void:
\tadd_to_group("kiln_adventure")
\tadd_to_group("kiln_items")              # dialogue and Logic give, take and ask about items here
\tlayer = 5
\tprocess_mode = Node.PROCESS_MODE_PAUSABLE
\t_read_items()
\t_build_ui()
\t_runner()
\tvar main := get_tree().get_first_node_in_group("kiln_main")
\tif main:
\t\tmain.level_started.connect(_enter)
\t\tif main.world:
\t\t\t_enter(main.world)

func _read_items() -> void:
\tif not FileAccess.file_exists(ITEMS):
\t\treturn
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(ITEMS))
\tif d is Dictionary:
\t\tfor it in d.get("items", []):
\t\t\titems[it["id"]] = it
\t\tcombos = d.get("combos", [])

# ---------------------------------------------------------------- rooms
func _enter(_world: Node) -> void:
\troom = get_tree().get_first_node_in_group("kiln_room")
\t_refresh()
\tvar m: AudioStream = room.music if room else null
\tif m != music.stream:
\t\tmusic.stream = m
\t\tif m:
\t\t\tmusic.play()
\tif _load_at != Vector2.INF and _player():
\t\t_player().global_position = _load_at
\t_load_at = Vector2.INF

## Show or hide every thing in the room by the story so far (when / unless flags, things that vanished).
func _refresh() -> void:
\tvar list := room.get_node_or_null("Hotspots") if room else null
\tif list == null:
\t\treturn
\tfor h in list.get_children():
\t\th.visible = (h.when == "" or flags.has(h.when)) and (h.unless == "" or not flags.has(h.unless)) and not gone.has(_key(h))

func _key(h: Node) -> String:
\treturn room.scene_file_path + ":" + h.name

func _hotspot_at(point: Vector2) -> Node:
\tvar list := room.get_node_or_null("Hotspots") if room else null
\tif list == null:
\t\treturn null
\tfor i in range(list.get_child_count() - 1, -1, -1):     # the last one drawn is on top
\t\tvar h := list.get_child(i)
\t\tif h.visible and h.contains(point):
\t\t\treturn h
\treturn null

# ---------------------------------------------------------------- clicking
func _unhandled_input(e: InputEvent) -> void:
\tif room == null or not is_instance_valid(room) or not room.is_inside_tree():
\t\treturn                                  # not in a room now (a video or a level of the flow)
\tif e is InputEventMouseButton and e.pressed:
\t\tget_viewport().set_input_as_handled()
\t\tif _say_left > 0.0:                    # a click skips the line being said
\t\t\t_say_left = 0.0
\t\t\treturn
\t\tif _talking():
\t\t\treturn
\t\tvar at := _world(e.position)
\t\tvar h := _hotspot_at(at)
\t\tif e.button_index == MOUSE_BUTTON_LEFT:
\t\t\tif h:
\t\t\t\t_walk(h.stand_point(), _arrived.bind(h))
\t\t\telse:
\t\t\t\t_walk(at)
\t\telif e.button_index == MOUSE_BUTTON_RIGHT:
\t\t\tif held != "":
\t\t\t\t_hold("")
\t\t\telif h:
\t\t\t\t_face(h)
\t\t\t\tsay(h.look if h.look != "" else "It's " + h.title.to_lower() + ".", h.look_voice)
\telif e.is_action_pressed("interact") and not _talking():
\t\tvar h := _nearest()
\t\tif h:
\t\t\t_walk(h.stand_point(), _arrived.bind(h))
\telif e.is_action_pressed("inventory"):
\t\t_drawer_open = 0.0 if _drawer_open > 0.0 else 3600.0
\telif e is InputEventKey and e.pressed and e.physical_keycode == KEY_F5:
\t\tsave_game()
\telif e is InputEventKey and e.pressed and e.physical_keycode == KEY_F9:
\t\tload_game()

# the screen point under the mouse, in the world (the camera may have scrolled)
func _world(screen: Vector2) -> Vector2:
\treturn get_viewport().get_canvas_transform().affine_inverse() * screen

func _nearest() -> Node:
\tvar p := _player()
\tvar best: Node = null
\tif p == null or room == null or not room.has_node("Hotspots"):
\t\treturn null
\tfor h in room.get_node("Hotspots").get_children():
\t\tif h.visible and h.stand_point().distance_to(p.global_position) < 56.0 and (best == null or h.stand_point().distance_to(p.global_position) < best.stand_point().distance_to(p.global_position)):
\t\t\tbest = h
\treturn best

## Use a thing: with the item in hand, or by itself.
func use(h: Node) -> void:
\tvar it := held
\t_hold("")
\tvar flag_ok: bool = h.needs_flag == "" or flags.has(h.needs_flag)
\tif it != "":
\t\tif it == h.needs and flag_ok:
\t\t\tif h.takes:
\t\t\t\tremove_item(it)
\t\t\t_do(h)
\t\telse:
\t\t\tsay(NOPE.pick_random())
\telif h.needs != "":
\t\tsay(h.locked_text if h.locked_text != "" else "I need something to use on it.")
\telif not flag_ok:
\t\tsay(h.locked_text if h.locked_text != "" else "Not yet.")
\telse:
\t\t_do(h)

func _do(h: Node) -> void:
\tif h.sound:
\t\t_play_sound(h.sound)
\tif h.sets_flag != "":
\t\tflags[h.sets_flag] = true
\tif h.message != "":
\t\tget_tree().call_group("kiln_logic", "_kiln_message", h.message)
\tif h.vanish:
\t\tgone[_key(h)] = true
\tmatch h.does:
\t\t"pick":
\t\t\tif h.item != "":
\t\t\t\tadd_item(h.item)
\t\t\tsay(h.text)
\t\t"talk":
\t\t\tif h.dialogue != "" and _runner():
\t\t\t\t_runner().start(h.dialogue)
\t\t"go":
\t\t\tif h.room != "":
\t\t\t\tget_tree().get_first_node_in_group("kiln_main").go_to_level(h.room, h.entry)
\t\t"leave":
\t\t\tsay(h.text)
\t\t\tget_tree().get_first_node_in_group("kiln_main").flow_done(h.name)
\t\t_:
\t\t\tsay(h.text)
\th.used.emit(h)
\t_refresh()

# ---------------------------------------------------------------- the hero
func _player() -> Node2D:
\treturn get_tree().get_first_node_in_group("player") as Node2D

func _walk(to: Vector2, then := Callable()) -> void:
\tvar b := _player().get_node_or_null("Brain") if _player() else null
\tif b and b.has_method("walk_to"):
\t\tb.walk_to(to, then)
\telif then.is_valid():
\t\tthen.call()

func _arrived(h: Node) -> void:
\t_face(h)
\tuse(h)

func _face(h: Node) -> void:
\tvar b := _player().get_node_or_null("Brain") if _player() else null
\tif b and b.has_method("face"):
\t\tb.face(h.global_position)

## The hero says a line over their head (a click skips it); a voice line moves their mouth.
func say(line: String, voice := "") -> void:
\tif line == "":
\t\treturn
\tspeech.text = line
\t_say_left = 1.2 + line.length() * 0.055
\tif voice == "":
\t\treturn
\tvar p := _player()
\tif p and p.has_node("LipSync"):
\t\tp.get_node("LipSync").say(voice)
\telse:
\t\tvar d = JSON.parse_string(FileAccess.get_file_as_string(voice))
\t\tif d is Dictionary:
\t\t\t_play_sound(load(voice.get_base_dir().path_join(d.get("sound", ""))))

func _play_sound(s: AudioStream) -> void:
\tvar a := AudioStreamPlayer.new()
\ta.stream = s
\ta.bus = "SFX" if AudioServer.get_bus_index("SFX") >= 0 else "Master"
\ta.finished.connect(a.queue_free)
\tadd_child(a)
\ta.play()

# ---------------------------------------------------------------- items (the same calls as the Kiln HUD's)
func add_item(id: String, _count := 1) -> void:
\tif not carried.has(id):
\t\tcarried.append(id)
\t_drawer_open = 2.0
\t_draw_bar()

func remove_item(id: String, _count := 1) -> bool:
\tif held == id:
\t\t_hold("")
\tvar had := carried.has(id)
\tcarried.erase(id)
\t_draw_bar()
\treturn had

func has_item(id: String) -> bool:
\treturn carried.has(id)

func _name(id: String) -> String:
\treturn items.get(id, {}).get("name", id.capitalize())

func _icon(id: String) -> Texture2D:
\tif not _icons.has(id):
\t\tvar path: String = items.get(id, {}).get("icon", "")
\t\t_icons[id] = load(path) if path != "" and ResourceLoader.exists(path) else null
\treturn _icons[id]

func _hold(id: String) -> void:
\theld = id
\thand.texture = _icon(id) if id != "" else null
\thand.visible = id != ""
\t_draw_bar()

## Two items together: a combination from Kiln's Rooms → Items, or a shrug.
func combine(a: String, b: String) -> void:
\t_hold("")
\tfor c in combos:
\t\tif (c["a"] == a and c["b"] == b) or (c["a"] == b and c["b"] == a):
\t\t\tremove_item(a)
\t\t\tremove_item(b)
\t\t\tadd_item(c["makes"])
\t\t\tsay(c.get("text", "") if c.get("text", "") != "" else "Now I have " + _name(c["makes"]).to_lower() + ".")
\t\t\treturn
\tsay(NOPE.pick_random())

func _slot_input(e: InputEvent, id: String) -> void:
\tif not (e is InputEventMouseButton and e.pressed):
\t\treturn
\tget_viewport().set_input_as_handled()
\tif e.button_index == MOUSE_BUTTON_RIGHT:
\t\tif held != "":
\t\t\t_hold("")
\t\telse:
\t\t\tsay(items.get(id, {}).get("look", "") if items.get(id, {}).get("look", "") != "" else "It's " + _name(id).to_lower() + ".")
\telif held == "":
\t\t_hold(id)
\telif held == id:
\t\t_hold("")
\telse:
\t\tcombine(held, id)

# ---------------------------------------------------------------- the screen: inventory drawer, cursor label, speech
func _build_ui() -> void:
\tdrawer = PanelContainer.new()
\tvar look := StyleBoxFlat.new()
\tlook.bg_color = Color(0.06, 0.05, 0.08, 0.92)
\tlook.border_color = Color(0.7, 0.55, 1.0, 0.6)
\tlook.border_width_top = 1
\tlook.content_margin_left = 6
\tlook.content_margin_top = 3
\tlook.content_margin_bottom = 3
\tdrawer.add_theme_stylebox_override("panel", look)
\tbar = HBoxContainer.new()
\tbar.add_theme_constant_override("separation", 4)
\tbar.custom_minimum_size = Vector2(0, 24)
\tdrawer.add_child(bar)
\tadd_child(drawer)
\tspeech = _label(Color.WHITE)
\tspeech.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tspeech.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\tspeech.custom_minimum_size = Vector2(180, 0)
\thover = _label(Color(1, 0.92, 0.6))
\tnote = _label(Color(0.8, 1, 0.8))
\thand = TextureRect.new()
\thand.mouse_filter = Control.MOUSE_FILTER_IGNORE
\thand.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
\thand.visible = false
\tadd_child(hand)
\tmusic = AudioStreamPlayer.new()
\tmusic.bus = "Music" if AudioServer.get_bus_index("Music") >= 0 else "Master"
\tadd_child(music)
\t_draw_bar()

func _label(colour: Color) -> Label:
\tvar l := Label.new()
\tl.mouse_filter = Control.MOUSE_FILTER_IGNORE
\tl.add_theme_color_override("font_color", colour)
\tl.add_theme_color_override("font_outline_color", Color.BLACK)
\tl.add_theme_constant_override("outline_size", 4)
\tl.add_theme_font_size_override("font_size", 10)
\tadd_child(l)
\treturn l

func _draw_bar() -> void:
\tfor c in bar.get_children():
\t\tc.queue_free()
\tfor id in carried:
\t\tvar slot := TextureRect.new()
\t\tslot.custom_minimum_size = Vector2(24, 24)
\t\tslot.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t\tslot.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
\t\tslot.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
\t\tslot.texture = _icon(id)
\t\tslot.tooltip_text = ""
\t\tslot.modulate = Color(1, 1, 1, 0.35) if id == held else Color.WHITE
\t\tif slot.texture == null:              # no picture: its name, short
\t\t\tvar l := Label.new()
\t\t\tl.text = _name(id).left(4)
\t\t\tl.add_theme_font_size_override("font_size", 8)
\t\t\tslot.add_child(l)
\t\tslot.gui_input.connect(_slot_input.bind(id))
\t\tslot.mouse_entered.connect(func(): hover.set_meta("item", id))
\t\tslot.mouse_exited.connect(func(): hover.remove_meta("item"))
\t\tbar.add_child(slot)

func _process(delta: float) -> void:
\tvar view := get_viewport().get_visible_rect().size
\tvar mouse := get_viewport().get_mouse_position()
\t# the inventory slides up when the mouse is near the bottom, or for a moment after picking something up
\t_drawer_open -= delta
\tvar here := room != null and is_instance_valid(room) and room.is_inside_tree()
\tvisible = here
\tvar up := here and (mouse.y > view.y - 30.0 or _drawer_open > 0.0 or held != "") and not _talking()
\tdrawer.size = Vector2(view.x, 30)
\tdrawer.position.y = move_toward(drawer.position.y, view.y - 30.0 if up else view.y + 2.0, 240.0 * delta)
\t# under the cursor: what it is, or what the item in hand would do
\tvar h: Node = null if _talking() or not here else _hotspot_at(_world(mouse))
\tvar what: String = _name(hover.get_meta("item")) if hover.has_meta("item") else (h.title if h else "")
\thover.text = ("Use %s with %s" % [_name(held), what]) if held != "" and what != "" else what
\thover.position = (mouse + Vector2(10, -14)).clamp(Vector2.ZERO, view - hover.size)
\tInput.set_default_cursor_shape(Input.CURSOR_POINTING_HAND if h or hover.has_meta("item") else Input.CURSOR_ARROW)
\thand.position = mouse + Vector2(6, 6)
\thand.size = Vector2(16, 16)
\t# speech over the hero's head
\t_say_left -= delta
\tspeech.visible = _say_left > 0.0
\tvar p := _player()
\tif speech.visible and p:
\t\tvar head := p.get_global_transform_with_canvas().origin + Vector2(0, -40.0 * p.scale.y)
\t\tspeech.position = (head - Vector2(speech.size.x / 2, speech.size.y)).clamp(Vector2.ZERO, view - speech.size)
\tnote.position = Vector2(view.x - note.size.x - 6, 4)

# ---------------------------------------------------------------- conversations share the story flags
func _runner() -> Node:
\tif is_instance_valid(_dlg):
\t\treturn _dlg
\t_dlg = get_tree().get_first_node_in_group("kiln_dialogue")
\tif _dlg == null and ResourceLoader.exists(DIALOGUE):
\t\t_dlg = load(DIALOGUE).new()
\t\tget_parent().add_child.call_deferred(_dlg)
\tif _dlg:
\t\tflags.merge(_dlg.flags)
\t\t_dlg.flags = flags                     # one dictionary: a flag set in a conversation is seen here, and back
\t\t_dlg.finished.connect(func(_n): _refresh())
\treturn _dlg

func _talking() -> bool:
\treturn is_instance_valid(_dlg) and _dlg.is_inside_tree() and _dlg.running()

# ---------------------------------------------------------------- saving
## Save where you are, what you carry and the story so far (F5, or a menu button "Save the game").
func save_game() -> void:
\tvar p := _player()
\tvar d := {"room": room.scene_file_path if room else "", "x": p.global_position.x if p else 0.0, "y": p.global_position.y if p else 0.0,
\t\t"carried": carried, "flags": flags, "gone": gone}
\tvar f := FileAccess.open(SAVE, FileAccess.WRITE)
\tif f:
\t\tf.store_string(JSON.stringify(d))
\t\t_note("Saved")

## Load the last save (F9, or a menu button "Load the last save").
func load_game() -> void:
\tif not FileAccess.file_exists(SAVE):
\t\t_note("Nothing saved yet")
\t\treturn
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
\tif not d is Dictionary or d.get("room", "") == "":
\t\treturn
\tcarried.assign(d.get("carried", []))
\tflags.clear()
\tflags.merge(d.get("flags", {}))
\tgone = d.get("gone", {})
\t_hold("")
\t_load_at = Vector2(d.get("x", 0.0), d.get("y", 0.0))
\tget_tree().get_first_node_in_group("kiln_main").go_to_level(d["room"])
\t_note("Loaded")

func _note(text: String) -> void:
\tnote.text = text
\tnote.show()
\tget_tree().create_timer(1.5).timeout.connect(note.hide)
`;
