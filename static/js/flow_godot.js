// Flow → Godot: the game's path of scenes as flow/game.json, and flow.gd, the runtime that plays it. main.gd hands
// the game to flow.gd when a flow exists. Each scene ends with an outcome ("done", a choice's words, "hit" or "miss"
// in a quick-time moment, "yes" or "no" for a check, the name of an exit) and the flow follows that link.
import { parseMoves } from './cards_godot.js';
export const FLOW = '_kiln/game/flow.gd';

// the game's flow file: { start, nodes: { id: { kind, name, …res:// paths } }, links: [{ from, out, to }] }; res(rel) → res://…
export function flowJSON(F, res) {
  const r = rel => rel ? res(rel) : '', nodes = {};
  for (const n of F.nodes) nodes[n.id] = {
    kind: n.kind, name: n.name || n.kind,
    video: r(n.video), picture: r(n.picture), portrait: r(n.portrait), skip: n.skip !== false,
    scene: n.kind === 'level' && n.level ? res(`levels/${n.level}/${n.level}.tscn`) : n.kind === 'room' && n.room ? res(`rooms/${n.room}/${n.room}.tscn`) : n.kind === 'menu' ? res(`menus/${n.menu || 'title'}.tscn`) : '',
    entry: n.entry || '', dialogue: n.dialogue ? res(`dialogue/${n.dialogue}.json`) : '',
    text: n.text || '', options: n.options || [], seconds: +n.seconds || 0, fallback: +n.fallback || 0,
    from: +n.from || 0, to: +n.to || 0, action: n.action || 'any', flag: n.flag || '', item: n.item || '',
    cols: +n.cols || 8, rows: +n.rows || 8, pieces: (n.pieces || []).filter(Boolean).map(res), goal: +n.goal || 1500, hp: +n.hp || 30,
    moves: n.kind === 'cards' ? parseMoves(n.pattern) : +n.moves || 20,
  };
  return JSON.stringify({ start: F.start || F.nodes[0]?.id || '', nodes, links: F.links }, null, 1) + '\n';
}

export const FLOW_GD = `extends Node
## Kiln flow: plays the game's path of scenes, made in Kiln's Flow (flow/game.json). Main hands the game to it.
## Every scene ends with an outcome and the flow follows the link for that outcome (or "done") to the next one:
##   video   plays a video (Ogg Theora, videos/*.ogv); Space, Esc or a click skips it if it may be skipped → done
##   menu    a Kiln menu screen (the title), over a picture if it has one; its "start" button → done
##   level   a Kiln level with the player; a Door zone going to "next in the flow" → the zone's name (or done)
##   room    a point & click room (and every room you walk to from it); a "leaves" hotspot → its name (or done)
##   talk    a conversation over a picture; a line or choice that sends the message flow:<word> → <word>, else done
##   story   a conversation as full pages of text and pictures (a text adventure; story.gd) → the same outcomes
##   choice  words, a picture or a looping video and buttons (1-6 keys), maybe against the clock → the chosen words
##   quick   a quick-time moment: press the action while the video shows "NOW" → hit, else → miss
##   check   a story flag and / or an item → yes or no
##   match3  a match-3 board (_kiln/puzzle/match3.gd) over a picture → win or lose
##   cards   a card battle against one enemy (_kiln/cards/battle.gd); your health carries over → win or lose
##   end     the end: words on screen, a key goes back to the start of the flow

const STORY := "res://_kiln/ui/story.gd"
const DIALOGUE := "res://_kiln/ui/dialogue.gd"
var nodes := {}
var links: Array = []
var first := ""
var at := ""                    # the scene playing now
var out := ""                   # an outcome a conversation asked for (flow:<word>)
var layer: CanvasLayer          # what a video / choice / talk scene shows (removed when it ends)
var hit := false
var _video: VideoStreamPlayer
var _left := 0.0                # a choice's clock
var _now: Label
var run := {}                   # what lasts the whole game between scenes (a card battler's health)

func _ready() -> void:
\tadd_to_group("kiln_flow")
\tadd_to_group("kiln_logic")     # conversations send their flow:<word> messages to the Logic group

func begin(path: String) -> void:
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(path))
\tif not d is Dictionary:
\t\tpush_warning("Kiln flow: cannot read " + path)
\t\treturn
\tnodes = d.get("nodes", {})
\tlinks = d.get("links", [])
\tfirst = d.get("start", "")
\tgo(first)

## Play a scene of the flow.
func go(id: String) -> void:
\tif layer:
\t\tlayer.queue_free()
\t\tlayer = null
\t_video = null
\t_now = null
\tat = id
\tout = ""
\thit = false
\tvar n: Dictionary = nodes.get(id, {})
\tvar main := get_parent()
\tif n.get("kind", "") not in ["level", "room"] and main.has_method("clear_world"):
\t\tmain.clear_world()
\tmatch n.get("kind", ""):
\t\t"video", "quick":
\t\t\t_show_video(n, false)
\t\t"menu":
\t\t\tif n.get("picture", "") != "":
\t\t\t\t_talk_picture(n)
\t\t\t\tlayer.layer = 5                    # behind the menu screens (layer 10 and up)
\t\t\tmain.open_menu(load(n["scene"]))
\t\t"level", "room":
\t\t\tmain.play_scene(load(n["scene"]), n.get("entry", ""))
\t\t"talk", "story":
\t\t\t_talk(n)
\t\t"choice":
\t\t\t_choice(n)
\t\t"check":
\t\t\tvar yes: bool = (n["flag"] == "" or _flags().has(n["flag"])) and (n["item"] == "" or _has(n["item"]))
\t\t\tdone.call_deferred("yes" if yes else "no")
\t\t"match3":
\t\t\t_talk_picture(n)
\t\t\tvar b: Node = load("res://_kiln/puzzle/match3.gd").new()
\t\t\tb.setup(n)
\t\t\tlayer.add_child(b)
\t\t\tb.finished.connect(done)
\t\t"cards":
\t\t\t_layer()
\t\t\tvar c: Node = load("res://_kiln/cards/battle.gd").new()
\t\t\tc.setup(n, run)
\t\t\tlayer.add_child(c)
\t\t\tc.finished.connect(done)
\t\t"end":
\t\t\t_words(n.get("text", "The end."), true)
\t\t_:
\t\t\tpush_warning("Kiln flow: nothing to play at " + id)

## The scene playing now has ended with this outcome: on to the next one.
func done(outcome := "done") -> void:
\tvar next := _next(at, outcome)
\tif next == "" and outcome != "done":
\t\tnext = _next(at, "done")
\tif next == "" and nodes.get(at, {}).get("kind", "") == "end":
\t\tnext = first
\tif next != "":
\t\tgo(next)
\telse:
\t\tpush_warning("Kiln flow: no link from %s for %s" % [at, outcome])

func _next(id: String, outcome: String) -> String:
\tfor l in links:
\t\tif l["from"] == id and l["out"] == outcome:
\t\t\treturn l["to"]
\treturn ""

# ---------------------------------------------------------------- what scenes show
func _layer() -> CanvasLayer:
\tlayer = CanvasLayer.new()
\tlayer.layer = 40
\tadd_child(layer)
\tvar bg := ColorRect.new()
\tbg.color = Color.BLACK
\tbg.set_anchors_preset(Control.PRESET_FULL_RECT)
\tlayer.add_child(bg)
\treturn layer

func _show_video(n: Dictionary, looping: bool) -> void:
\t_video = VideoStreamPlayer.new()
\t_video.stream = load(n["video"]) if n.get("video", "") != "" and ResourceLoader.exists(n["video"]) else null
\t_video.expand = true
\t_video.loop = looping
\t_video.set_anchors_preset(Control.PRESET_FULL_RECT)
\t_layer().add_child(_video)
\tif _video.stream == null:
\t\t_words("(" + n.get("name", "video") + ": no video yet)", false)
\t\tget_tree().create_timer(1.5).timeout.connect(_after.bind(at, "miss" if n["kind"] == "quick" else "done"))
\t\treturn
\tif not looping:
\t\t_video.finished.connect(func(): done("miss" if n["kind"] == "quick" else "done"))
\t_video.play()
\tif n["kind"] == "quick":
\t\t_now = _label(n.get("text", "NOW!") if n.get("text", "") != "" else "NOW!", 28, Color(1, 0.85, 0.3))
\t\t_now.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
\t\t_now.position.y -= 40
\t\t_now.visible = false

func _talk(n: Dictionary) -> void:
\tvar l := _layer()
\tl.layer = 20                               # under the conversation's box (25) and its choices (30)
\tif n.get("picture", "") != "":
\t\tvar pic := TextureRect.new()
\t\tpic.texture = load(n["picture"])
\t\tpic.set_anchors_preset(Control.PRESET_FULL_RECT)
\t\tpic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t\tpic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
\t\tl.add_child(pic)
\tif n.get("portrait", "") != "":             # the one talking, standing on the right (a visual novel)
\t\tvar who := TextureRect.new()
\t\twho.texture = load(n["portrait"])
\t\twho.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t\twho.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
\t\twho.anchor_left = 0.55
\t\twho.anchor_right = 1.0
\t\twho.anchor_top = 0.08
\t\twho.anchor_bottom = 1.0
\t\tl.add_child(who)
\tvar runner: Node = load(STORY if n["kind"] == "story" else DIALOGUE).new()
\tadd_child(runner)
\tvar shared = _runner_flags()
\tif shared != null:
\t\trunner.flags = shared                 # one set of story flags for the whole game
\trunner.finished.connect(_talked.bind(runner))
\trunner.start(n["dialogue"])

func _talked(_name: String, runner: Node) -> void:
\trunner.queue_free()
\tdone(out if out != "" else "done")

# a timer for a scene that may have ended already
func _after(id: String, outcome: String) -> void:
\tif at == id:
\t\tdone(outcome)

func _choice(n: Dictionary) -> void:
\tif n.get("video", "") != "":
\t\t_show_video(n, true)
\telse:
\t\t_talk_picture(n)
\tvar box := VBoxContainer.new()
\tbox.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
\tbox.alignment = BoxContainer.ALIGNMENT_CENTER
\tbox.add_theme_constant_override("separation", 6)
\tlayer.add_child(box)
\tif n.get("text", "") != "":
\t\tvar t := _label(n["text"], 14, Color.WHITE)
\t\tlayer.remove_child(t)
\t\tbox.add_child(t)
\tvar opts: Array = n.get("options", [])
\tfor i in opts.size():
\t\tvar b := Button.new()
\t\tb.text = "%d  %s" % [i + 1, opts[i]]
\t\tb.pressed.connect(done.bind(opts[i]))
\t\tbox.add_child(b)
\t\tif i == 0:
\t\t\tb.grab_focus.call_deferred()
\tbox.position -= box.get_combined_minimum_size() / 2
\t_left = n.get("seconds", 0.0)

func _talk_picture(n: Dictionary) -> void:
\tvar l := _layer()
\tif n.get("picture", "") != "":
\t\tvar pic := TextureRect.new()
\t\tpic.texture = load(n["picture"])
\t\tpic.set_anchors_preset(Control.PRESET_FULL_RECT)
\t\tpic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t\tpic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
\t\tl.add_child(pic)

func _words(text: String, centred: bool) -> void:
\tif layer == null:
\t\t_layer()
\tvar l := _label(text, 16, Color.WHITE)
\tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\tl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tl.set_anchors_and_offsets_preset(Control.PRESET_CENTER if centred else Control.PRESET_CENTER_BOTTOM)
\tl.custom_minimum_size.x = 400

func _label(text: String, size: int, colour: Color) -> Label:
\tvar l := Label.new()
\tl.text = text
\tl.add_theme_font_size_override("font_size", size)
\tl.add_theme_color_override("font_color", colour)
\tl.add_theme_color_override("font_outline_color", Color.BLACK)
\tl.add_theme_constant_override("outline_size", 6)
\tlayer.add_child(l)
\treturn l

# ---------------------------------------------------------------- the clock, the quick-time window, skipping
func _process(delta: float) -> void:
\tvar n: Dictionary = nodes.get(at, {})
\tif n.get("kind", "") == "choice" and _left > 0.0:
\t\t_left -= delta
\t\tif _left <= 0.0 and n["options"].size():
\t\t\tdone(n["options"][clampi(int(n.get("fallback", 0)), 0, n["options"].size() - 1)])
\tif n.get("kind", "") == "quick" and _now and _video:
\t\tvar t := _video.stream_position
\t\t_now.visible = t >= n["from"] and t <= n["to"] and not hit

func _unhandled_input(e: InputEvent) -> void:
\tvar n: Dictionary = nodes.get(at, {})
\tvar pressed := (e is InputEventKey or e is InputEventMouseButton or e is InputEventJoypadButton) and e.is_pressed() and not e.is_echo()
\tif not pressed:
\t\treturn
\tmatch n.get("kind", ""):
\t\t"video":
\t\t\tif n.get("skip", true) and (e.is_action("ui_accept") or e.is_action("pause") or e is InputEventMouseButton):
\t\t\t\tget_viewport().set_input_as_handled()
\t\t\t\tdone()
\t\t"quick":
\t\t\tif hit or _video == null:
\t\t\t\treturn
\t\t\tvar right: bool = n["action"] == "any" or e.is_action(n["action"])
\t\t\tvar t := _video.stream_position
\t\t\tget_viewport().set_input_as_handled()
\t\t\tif right and t >= n["from"] and t <= n["to"]:
\t\t\t\thit = true
\t\t\t\tdone("hit")
\t\t\telif t < n["from"]:
\t\t\t\tdone("miss")          # too early counts as a miss, as in Dragon's Lair
\t\t"choice":
\t\t\tif e is InputEventKey and e.keycode >= KEY_1 and e.keycode <= KEY_6 and e.keycode - KEY_1 < n["options"].size():
\t\t\t\tdone(n["options"][e.keycode - KEY_1])
\t\t"end":
\t\t\tget_viewport().set_input_as_handled()
\t\t\tdone()

# ---------------------------------------------------------------- the story so far
## Conversations send flow:<word> to the Logic group: that word becomes the scene's outcome.
func _kiln_message(message: String) -> void:
\tif message.begins_with("flow:"):
\t\tout = message.substr(5)

func _runner_flags():
\tvar adv := get_tree().get_first_node_in_group("kiln_adventure")
\tif adv:
\t\treturn adv.flags
\tvar r := get_tree().get_first_node_in_group("kiln_dialogue")
\treturn r.flags if r else _own_flags

var _own_flags := {}
func _flags() -> Dictionary:
\treturn _runner_flags()

func _has(item: String) -> bool:
\tvar i := get_tree().get_first_node_in_group("kiln_items")
\tif i == null:
\t\ti = get_tree().get_first_node_in_group("kiln_hud")
\treturn i != null and i.has_item(item)
`;
