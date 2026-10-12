// The text adventure page: _kiln/ui/story.gd, Kiln's dialogue runner shown as full pages (Flow → story scenes).
export const STORY = '_kiln/ui/story.gd';

export const STORY_GD = `extends "res://_kiln/ui/dialogue.gd"
## Kiln story: a conversation (Kiln's Dialogue) shown as full pages, for a text adventure. Each line fills the page:
## its picture if it has one (Dialogue → a line's Picture), who speaks, and the words, typed out (Space shows them
## all, then turns the page). Choices are buttons, and the reader may type instead: the choice sharing the most
## words with what they typed is taken. Conditions and what lines do (items, flags, messages) work as in the
## dialogue runner this extends.

var _pic: TextureRect
var _who: Label
var _text: Label
var _said: Label                # "You can't do that here." under the typing line

func _box_hud() -> Node:
\treturn null                  # always the page, never the HUD's small box

func _line(id: String) -> void:
\tvar b: Dictionary = _d.get("beats", {}).get(id, {})
\tif _own == null:
\t\t_build()
\tvar pic: String = b.get("pic", "")
\tif pic != "":
\t\t_pic.texture = load(pic)
\t_pic.visible = _pic.texture != null
\tawait super(id)

func _own_box(who: String, text: String) -> void:
\t_own.visible = true
\t_who.text = who.to_upper()
\t_text.text = text
\t_text.visible_ratio = 0.0

func _process(delta: float) -> void:
\tif _text and _text.visible_ratio < 1.0:
\t\t_text.visible_ratio = minf(1.0, _text.visible_ratio + delta * 45.0 / maxf(1.0, _text.text.length()))

func _unhandled_input(e: InputEvent) -> void:
\tif _text and _text.visible_ratio < 1.0 and e.is_action_pressed("ui_accept"):
\t\t_text.visible_ratio = 1.0       # first press: all the words; the next turns the page
\t\tget_viewport().set_input_as_handled()
\t\treturn
\tsuper(e)

# the choices: buttons, and a line to type into
func _ask(choices: Array) -> void:
\t_menu = CanvasLayer.new()
\t_menu.layer = 31
\tvar box := VBoxContainer.new()
\tbox.anchor_left = 0.1
\tbox.anchor_right = 0.9
\tbox.anchor_top = 0.62
\tbox.anchor_bottom = 0.98
\tbox.add_theme_constant_override("separation", 3)
\t_menu.add_child(box)
\tadd_child(_menu)
\tfor c in choices:
\t\tvar b := Button.new()
\t\tb.text = "> " + c.get("text", "…")
\t\tb.alignment = HORIZONTAL_ALIGNMENT_LEFT
\t\tb.flat = true
\t\tb.pressed.connect(_chose.bind(c))
\t\tbox.add_child(b)
\tvar typed := LineEdit.new()
\ttyped.placeholder_text = "or type what you do…"
\ttyped.text_submitted.connect(_typed.bind(choices))
\tbox.add_child(typed)
\t_said = Label.new()
\t_said.add_theme_font_size_override("font_size", 9)
\tbox.add_child(_said)
\tbox.get_child(0).grab_focus.call_deferred()

func _typed(words: String, choices: Array) -> void:
\tvar said := _words(words)
\tvar best: Dictionary = {}
\tvar most := 0
\tfor c in choices:
\t\tvar n := 0
\t\tfor w in _words(c.get("text", "")):
\t\t\tif w in said:
\t\t\t\tn += 1
\t\tif n > most:
\t\t\tmost = n
\t\t\tbest = c
\tif most > 0:
\t\t_chose(best)
\telse:
\t\t_said.text = "You can't do that here."

func _words(s: String) -> Array:
\treturn Array(s.to_lower().replace(",", " ").replace(".", " ").split(" ", false)).filter(func(w): return w.length() > 2)

func _build() -> void:
\t_own = CanvasLayer.new()
\t_own.layer = 25
\tvar bg := ColorRect.new()
\tbg.color = Color("#14110c")
\tbg.set_anchors_preset(Control.PRESET_FULL_RECT)
\t_own.add_child(bg)
\tvar page := VBoxContainer.new()
\tpage.anchor_left = 0.1
\tpage.anchor_right = 0.9
\tpage.anchor_top = 0.05
\tpage.anchor_bottom = 0.6
\tpage.add_theme_constant_override("separation", 4)
\t_own.add_child(page)
\t_pic = TextureRect.new()
\t_pic.custom_minimum_size = Vector2(0, 90)
\t_pic.size_flags_vertical = Control.SIZE_EXPAND_FILL
\t_pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t_pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
\tpage.add_child(_pic)
\t_who = Label.new()
\t_who.add_theme_color_override("font_color", Color("#d9bf6a"))
\t_who.add_theme_font_size_override("font_size", 9)
\tpage.add_child(_who)
\t_text = Label.new()
\t_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\t_text.add_theme_color_override("font_color", Color("#ece4cf"))
\tpage.add_child(_text)
\tadd_child(_own)
`;
