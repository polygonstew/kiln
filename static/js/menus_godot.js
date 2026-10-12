// Menus → Godot: each menu screen is a tiny scene whose script (_kiln/ui/menu.gd) builds its buttons, sliders and
// toggles from `items` at runtime, so the scene file stays readable and Kiln's preview matches the game.
// _kiln/ui/settings.gd (KilnSettings) keeps volumes / fullscreen / toggles in user://settings.cfg (static functions, no autoload).
import { rtRes } from './layout.js';

export const MENU_GD = `extends Control
## Kiln menu screen: builds itself from \`items\` (set in Kiln's Menus area). It emits action(name) for the game
## to handle: "start", "resume", "title", "open:<menu>", "back", or your own names. Volumes, fullscreen and
## toggles are applied and saved by KilnSettings here; "quit" quits.

signal action(name: String)
@export var title := ""
@export var items: Array = []           ## [{label, action, bus?, key?}]
@export var accent := Color(1.0, 0.36, 0.18)
@export var text_color := Color(0.92, 0.89, 0.82)
@export var dim := 0.55                 ## how dark the cover over the background is (0..1)
@export var font_size := 16
@export var background: PackedScene     ## a Kiln scene behind the menu (optional)
@export var picture: Texture2D          ## or a picture behind it (used when there is no scene)
@export var video: VideoStream          ## or a looping, silent video (used when there is neither)
@export var font: Font                  ## the text font (optional: Godot's own when empty)
@export var align_left := false

func _ready() -> void:
\tset_anchors_preset(Control.PRESET_FULL_RECT)
\tprocess_mode = Node.PROCESS_MODE_ALWAYS       # works while the game is paused
\tKilnSettings.load_all()
\tif background:
\t\tadd_child(background.instantiate())
\telif picture:
\t\tvar pic := TextureRect.new()
\t\tpic.texture = picture
\t\tpic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
\t\tpic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
\t\tpic.mouse_filter = Control.MOUSE_FILTER_IGNORE
\t\tpic.set_anchors_preset(Control.PRESET_FULL_RECT)
\t\tadd_child(pic)
\telif video:
\t\tvar vp := VideoStreamPlayer.new()
\t\tvp.stream = video
\t\tvp.expand = true
\t\tvp.loop = true
\t\tvp.volume_db = -80.0
\t\tvp.mouse_filter = Control.MOUSE_FILTER_IGNORE
\t\tvp.set_anchors_preset(Control.PRESET_FULL_RECT)
\t\tadd_child(vp)
\t\tvp.play()
\tvar cover := ColorRect.new()
\tcover.color = Color(0, 0, 0, dim)
\tcover.set_anchors_preset(Control.PRESET_FULL_RECT)
\tadd_child(cover)
\tvar box := VBoxContainer.new()
\tbox.add_theme_constant_override("separation", max(4, font_size / 3))
\tadd_child(box)
\tif title != "":
\t\tvar t := Label.new()
\t\tt.text = title
\t\tt.add_theme_font_size_override("font_size", font_size * 2)
\t\tt.add_theme_color_override("font_color", accent)
\t\t_font(t)
\t\tt.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if align_left else HORIZONTAL_ALIGNMENT_CENTER
\t\tbox.add_child(t)
\tvar first: Control = null
\tfor it in items:
\t\tvar c := _row(it)
\t\tbox.add_child(c)
\t\tif first == null and c is BaseButton:
\t\t\tfirst = c
\t\telif first == null and c.get_child_count() > 1 and c.get_child(1) is Range:
\t\t\tfirst = c.get_child(1)
\tawait get_tree().process_frame
\tvar view := get_viewport_rect().size
\tvar sz := box.get_combined_minimum_size()
\tbox.position = Vector2(view.x * 0.12 if align_left else (view.x - sz.x) / 2, (view.y - sz.y) / 2)
\tif first:
\t\tfirst.grab_focus()

func _row(it: Dictionary) -> Control:
\tvar kind: String = it.get("action", "")
\tif kind == "volume":
\t\tvar row := HBoxContainer.new()
\t\trow.add_child(_label(it.get("label", "Volume")))
\t\tvar s := HSlider.new()
\t\ts.custom_minimum_size = Vector2(font_size * 6, font_size)
\t\ts.min_value = 0.0
\t\ts.max_value = 1.0
\t\ts.step = 0.05
\t\ts.value = KilnSettings.volume(it.get("bus", "Master"))
\t\ts.value_changed.connect(func(v): KilnSettings.set_volume(it.get("bus", "Master"), v))
\t\trow.add_child(s)
\t\treturn row
\tif kind == "fullscreen" or kind == "toggle":
\t\tvar key: String = "fullscreen" if kind == "fullscreen" else it.get("key", it.get("label", "option"))
\t\tvar c := CheckButton.new()
\t\tc.text = it.get("label", key)
\t\tc.button_pressed = KilnSettings.flag(key)
\t\tc.toggled.connect(func(on): KilnSettings.set_flag(key, on))
\t\t_style(c)
\t\treturn c
\tif kind == "controls":
\t\tvar l := _label(KilnSettings.controls_text())
\t\tl.add_theme_font_size_override("font_size", max(8, font_size * 2 / 3))
\t\treturn l
\tvar b := Button.new()
\tb.text = it.get("label", kind)
\tb.flat = true
\tb.alignment = HORIZONTAL_ALIGNMENT_LEFT if align_left else HORIZONTAL_ALIGNMENT_CENTER
\t_style(b)
\tb.pressed.connect(func(): _press(kind))
\treturn b

func _label(text: String) -> Label:
\tvar l := Label.new()
\tl.text = text
\tl.add_theme_font_size_override("font_size", font_size)
\tl.add_theme_color_override("font_color", text_color)
\t_font(l)
\treturn l

func _font(c: Control) -> void:
\tif font:
\t\tc.add_theme_font_override("font", font)

func _style(b: BaseButton) -> void:
\tb.add_theme_font_size_override("font_size", font_size)
\tb.add_theme_color_override("font_color", text_color)
\t_font(b)
\tfor s in ["font_hover_color", "font_focus_color", "font_pressed_color"]:
\t\tb.add_theme_color_override(s, accent)

func _press(kind: String) -> void:
\tif kind == "quit":
\t\tget_tree().quit()
\t\treturn
\taction.emit(kind)
`;

export const SETTINGS_GD = `class_name KilnSettings
extends RefCounted
## Settings kept in user://settings.cfg: bus volumes (0..1), fullscreen and any on/off option your menus have.
## Read them anywhere: KilnSettings.flag("screen_shake"), KilnSettings.volume("Music").

static var cfg: ConfigFile = null
const PATH := "user://settings.cfg"

static func load_all() -> void:
\tif cfg != null:
\t\treturn
\tcfg = ConfigFile.new()
\tcfg.load(PATH)
\tfor bus in ["Master", "Music", "SFX"]:
\t\t_apply_volume(bus, volume(bus))
\tif flag("fullscreen"):
\t\tDisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)

static func volume(bus: String) -> float:
\tload_all()
\treturn cfg.get_value("volume", bus, 0.8)

static func set_volume(bus: String, v: float) -> void:
\tload_all()
\tcfg.set_value("volume", bus, v)
\t_apply_volume(bus, v)
\tcfg.save(PATH)

static func _apply_volume(bus: String, v: float) -> void:
\tvar i := AudioServer.get_bus_index(bus)
\tif i < 0:
\t\tAudioServer.add_bus()
\t\ti = AudioServer.bus_count - 1
\t\tAudioServer.set_bus_name(i, bus)
\tAudioServer.set_bus_volume_db(i, linear_to_db(max(v, 0.0001)))

static func flag(key: String) -> bool:
\tload_all()
\treturn cfg.get_value("flags", key, key != "fullscreen")

static func set_flag(key: String, on: bool) -> void:
\tload_all()
\tcfg.set_value("flags", key, on)
\tcfg.save(PATH)
\tif key == "fullscreen":
\t\tDisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if on else DisplayServer.WINDOW_MODE_WINDOWED)

## The controls as text: every input action and its keys.
static func controls_text() -> String:
\tvar lines := []
\tfor a in ["ui_left", "ui_right", "ui_up", "ui_down", "ui_accept", "attack", "shoot", "ui_cancel"]:
\t\tif InputMap.has_action(a):
\t\t\tvar keys := []
\t\t\tfor e in InputMap.action_get_events(a):
\t\t\t\tif e is InputEventKey:
\t\t\t\t\tkeys.append(OS.get_keycode_string(e.physical_keycode if e.physical_keycode else e.keycode))
\t\t\tif keys.size():
\t\t\t\tlines.append("%s: %s" % [a.trim_prefix("ui_").capitalize(), ", ".join(keys.slice(0, 3))])
\treturn "\\n".join(lines)
`;

// one menu screen as a scene; base = path prefix of the asset folder ('' or 'res://…/'). Behind it: a scene, a picture
// (pictures/…) or a video (videos/….ogv), by m.bgKind; the text font is fonts/<m.font>.
export function menuScene(m, base) {
  const kind = m.bgKind ?? (m.background ? 'scene' : '');
  const ext = [];
  const add = (type, path, id) => { ext.push(`[ext_resource type="${type}" path="${path}" id="${id}"]`); return id; };
  const bg = kind === 'scene' && m.background ? add('PackedScene', `${base}backgrounds/${m.background}/${m.background}.tscn`, 'bg') : '';
  const pic = kind === 'picture' && m.bgPicture ? add('Texture2D', base + m.bgPicture, 'pic') : '';
  const vid = kind === 'video' && m.bgVideo ? add('VideoStream', base + m.bgVideo, 'vid') : '';
  const font = m.font ? add('FontFile', `${base}fonts/${m.font}`, 'font') : '';
  const c = h => { const n = parseInt(h.slice(1), 16); return `Color(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255}, 1)`; };
  const items = '[' + m.items.map(it => '{' + Object.entries(it).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ') + '}').join(', ') + ']';
  return `[gd_scene load_steps=${ext.length + 2} format=3]\n\n[ext_resource type="Script" path="${rtRes(base, 'menu')}" id="1"]\n${ext.join('\n')}\n\n`
    + `[node name="${m.id}" type="Control"]\nlayout_mode = 3\nanchors_preset = 15\nanchor_right = 1.0\nanchor_bottom = 1.0\nscript = ExtResource("1")\n`
    + `title = ${JSON.stringify(m.title || '')}\nitems = ${items}\naccent = ${c(m.accent || '#ff5b2e')}\ntext_color = ${c(m.text || '#ebe3d0')}\ndim = ${m.dim ?? .55}\nfont_size = ${m.fontSize || 16}\nalign_left = ${!!m.left}\n`
    + (bg ? 'background = ExtResource("bg")\n' : '') + (pic ? 'picture = ExtResource("pic")\n' : '') + (vid ? 'video = ExtResource("vid")\n' : '') + (font ? 'font = ExtResource("font")\n' : '');
}
