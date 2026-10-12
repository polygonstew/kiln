// Play builds: a small playable game from what is in the asset folder (a level, the player actor, a HUD, menus),
// exported for the web with Godot and played in the Stage (stage.js). The build happens in a copy (server: play.py);
// this file writes the main scene + main.gd that ties it together (gameFiles; Export game uses them too) and runs the build.
import { api, pref } from './core.js';
import { S as FS } from './files.js';
import { BRAIN_GD } from './brains.js';
import { INPUT_GD } from './input_godot.js';

const MAIN_GD = `extends Node2D
## Kiln demo: a title screen (optional), then the level with the player, a camera that follows it and the HUD.
## Written by Kiln's Play button; the build is a copy, so change this freely.

@export var level_scene: PackedScene
@export var background_scene: PackedScene
@export var player_scene: PackedScene
@export var hud_scene: PackedScene
@export var title_menu: PackedScene      ## Kiln Menus: shown first (else a plain title screen)
@export var options_menu: PackedScene
@export var pause_menu: PackedScene       ## Esc while playing
@export var logic_scripts: Array[Script] = []   ## Kiln Logic graphs (logic/*.gd): each runs on its own node while playing
@export var title := "Kiln demo"
@export var show_title := true
@export var playtest := true            ## in Kiln's Stage: take live tuning and screenshot requests from the page
var playing := false
var menus: Array[Node] = []               # open menu screens, top last
var player: Node2D
var _web: JavaScriptObject                # the page around a web build (Kiln's Stage talks through it)
var _tuned := ""
const BRAIN := "res://_kiln/brains/player.gd"

func _ready() -> void:
\tprocess_mode = Node.PROCESS_MODE_ALWAYS    # Main hears Esc / Start while paused; the world under it pauses
\tKilnInput.ensure()                         # keys and gamepad for every action (_kiln/game/input.gd)
\tif playtest and OS.has_feature("web"):
\t\t_web = JavaScriptBridge.get_interface("window")
\tif title_menu:
\t\t_open(title_menu)
\telif show_title:
\t\t_title_screen()
\telse:
\t\t_start()

# ---- Kiln menus: each screen emits action(name); this decides what it means
func _open(scene: PackedScene) -> void:
\tvar layer := CanvasLayer.new()
\tlayer.layer = 10 + menus.size()
\tlayer.process_mode = Node.PROCESS_MODE_ALWAYS
\tvar m := scene.instantiate()
\tlayer.add_child(m)
\tadd_child(layer)
\tmenus.append(layer)
\tm.action.connect(_on_menu)

func _close_top() -> void:
\tif menus.size():
\t\tmenus.pop_back().queue_free()

func _on_menu(a: String) -> void:
\tmatch a:
\t\t"start":
\t\t\twhile menus.size():
\t\t\t\t_close_top()
\t\t\t_start()
\t\t"open:options":
\t\t\tif options_menu:
\t\t\t\t_open(options_menu)
\t\t"back":
\t\t\t_close_top()
\t\t"resume":
\t\t\twhile menus.size():
\t\t\t\t_close_top()
\t\t\tget_tree().paused = false
\t\t"title":
\t\t\tget_tree().paused = false
\t\t\tget_tree().reload_current_scene()

func _unhandled_input(e: InputEvent) -> void:
\tif not playing or not e.is_action_pressed("pause"):
\t\treturn
\tif pause_menu and menus.is_empty():
\t\tget_tree().paused = true
\t\t_open(pause_menu)
\telif not pause_menu:
\t\t_simple_pause()

# no Kiln pause menu: Esc / Start still pauses, with a word on screen
var _paused_label: CanvasLayer
func _simple_pause() -> void:
\tget_tree().paused = not get_tree().paused
\tif _paused_label == null:
\t\t_paused_label = CanvasLayer.new()
\t\t_paused_label.layer = 40
\t\tvar l := Label.new()
\t\tl.text = "PAUSED"
\t\tl.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
\t\t_paused_label.add_child(l)
\t\tadd_child(_paused_label)
\t_paused_label.visible = get_tree().paused

func _title_screen() -> void:
\tvar ui := CanvasLayer.new()
\tadd_child(ui)
\tvar bg := ColorRect.new()
\tbg.color = Color(0.07, 0.07, 0.08)
\tbg.set_anchors_preset(Control.PRESET_FULL_RECT)
\tui.add_child(bg)
\tvar box := VBoxContainer.new()
\tbox.set_anchors_preset(Control.PRESET_CENTER)
\tbox.alignment = BoxContainer.ALIGNMENT_CENTER
\tbox.add_theme_constant_override("separation", 10)
\tui.add_child(box)
\tvar t := Label.new()
\tt.text = title
\tt.add_theme_font_size_override("font_size", 28)
\tt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(t)
\tvar play := Button.new()
\tplay.text = "Play"
\tplay.pressed.connect(func(): ui.queue_free(); _start())
\tbox.add_child(play)
\tvar help := Label.new()
\thelp.text = "Arrows / stick move · Space / A jumps · X attacks · C / B shoots"
\thelp.add_theme_font_size_override("font_size", 8)
\thelp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(help)
\tbox.position -= box.get_combined_minimum_size() / 2
\tplay.grab_focus()

func _start() -> void:
\tplaying = true
\tvar world := Node2D.new()
\tworld.process_mode = Node.PROCESS_MODE_PAUSABLE
\tadd_child(world)
\tvar view := get_viewport_rect().size
\tvar start := Vector2(48, view.y - 16)
\tvar tiles: TileMapLayer = null
\tif level_scene:
\t\tvar lv := level_scene.instantiate()
\t\tworld.add_child(lv)
\t\tvar m := lv.get_node_or_null("PlayerStart") as Node2D
\t\tif m:
\t\t\tstart = m.position
\t\ttiles = lv.get_node_or_null("Tiles") as TileMapLayer
\telse:
\t\t# no level yet: the background scene (if any) over a long flat floor
\t\tif background_scene:
\t\t\tworld.add_child(background_scene.instantiate())
\t\tvar floor := StaticBody2D.new()
\t\tvar shape := CollisionShape2D.new()
\t\tvar rect := RectangleShape2D.new()
\t\trect.size = Vector2(6000, 32)
\t\tshape.shape = rect
\t\tfloor.add_child(shape)
\t\tfloor.position = Vector2(3000, view.y)
\t\tworld.add_child(floor)
\tif player_scene:
\t\tvar p := player_scene.instantiate() as Node2D
\t\tp.position = start
\t\tif not p.is_in_group("player"):
\t\t\tp.add_to_group("player")
\t\tif p.get_node_or_null("Brain") == null and ResourceLoader.exists(BRAIN):
\t\t\tvar b := Node.new()
\t\t\tb.name = "Brain"
\t\t\tb.set_script(load(BRAIN))
\t\t\tp.add_child(b)
\t\tplayer = p
\t\tif _web:
\t\t\t_retune()   # the Stage's numbers go in before the player starts
\t\tworld.add_child(p)
\t\tvar cam := Camera2D.new()
\t\tcam.position_smoothing_enabled = true
\t\tp.add_child(cam)
\t\tcam.make_current()
\t\tif tiles:
\t\t\tvar r := tiles.get_used_rect()
\t\t\tvar ts := tiles.tile_set.tile_size
\t\t\tcam.limit_left = r.position.x * ts.x
\t\t\tcam.limit_top = r.position.y * ts.y
\t\t\tcam.limit_right = r.end.x * ts.x
\t\t\tcam.limit_bottom = r.end.y * ts.y
\tif hud_scene:
\t\tadd_child(hud_scene.instantiate())
\tfor s in logic_scripts:
\t\tvar n := Node.new()
\t\tn.name = s.resource_path.get_file().get_basename()
\t\tn.set_script(s)
\t\tn.process_mode = Node.PROCESS_MODE_PAUSABLE
\t\tadd_child(n)

# ---- Kiln Stage: inside Kiln's Stage the sliders tune the player while you play, and the camera button asks
# ---- for a screenshot. Web builds only; in Godot itself _web is null and none of this runs.
func _process(_delta: float) -> void:
\tif _web == null:
\t\treturn
\tif player and str(_web.kilnTune) != _tuned:
\t\t_retune()
\t\tprint("Kiln Stage: player numbers ", _tuned)
\tif str(_web.kilnCmd) == "shot":
\t\t_web.kilnCmd = ""
\t\tvar png := get_viewport().get_texture().get_image().save_png_to_buffer()
\t\t_web.kilnSend("shot", Marshalls.raw_to_base64(png))

## kilnTune is JSON: {"brain": {"speed": 90, "jump_height": 40, …}, "body": {"max_health": 3, "knockback": 60, …}}
func _retune() -> void:
\t_tuned = str(_web.kilnTune)
\tif not _tuned.begins_with("{"):
\t\treturn
\tvar t = JSON.parse_string(_tuned)
\tif not t is Dictionary:
\t\treturn
\tvar brain := player.get_node_or_null("Brain")
\tfor k in t.get("brain", {}):
\t\tif brain and brain.get(k) != null:
\t\t\tbrain.set(k, t["brain"][k])
\tif brain and brain.is_inside_tree() and brain.has_method("retune"):
\t\tbrain.retune()
\tfor k in t.get("body", {}):
\t\tif player.get(k) != null:
\t\t\tplayer.set(k, t["body"][k])
\tif player.is_inside_tree() and player.has_method("heal"):
\t\tplayer.heal(player.max_health)   # back to full health with the new numbers
`;

export async function listScenes(folder) {      // [name, res path] of folder/<name>/<name>.tscn
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + folder)).catch(() => ({ items: [] }));
  const out = [];
  for (const d of (r.items || []).filter(i => i.dir && !i.name.startsWith('_'))) {
    const x = await api('/api/fs?path=' + encodeURIComponent(d.path)).catch(() => ({ items: [] }));
    if (x.items.some(i => i.name === d.name + '.tscn')) out.push([d.name, `res://${folder}/${d.name}/${d.name}.tscn`]);
  }
  return out;
}

// what goes in the game: the Stage's pickers (pref 'stage.build'); the first time, the player actor and the first
// level / background / HUD in the folder
export async function gamePicks() {
  const p = pref.get('stage.build', { start: 'none' });
  if ('player' in p) return p;
  const [levels, scenes, actors, huds] = await Promise.all(['levels', 'backgrounds', 'sprites', 'hud'].map(listScenes));
  const q = { ...p, player: await findPlayer(actors), level: levels[0]?.[1] || '', bg: scenes[0]?.[1] || '', hud: huds[0]?.[1] || '' };
  pref.set('stage.build', q);
  return q;
}

// the player: an actor saved with the Player role (its scene joins the "player" group), else the first one
export async function findPlayer(actors) {
  for (const [n, p] of actors) {
    const t = await fetch('/api/fs/raw?path=' + encodeURIComponent(`${FS.root}/sprites/${n}/${n}.tscn`)).then(r => r.text()).catch(() => '');
    if (t.includes('groups=["player"]')) return p;
  }
  return actors[0]?.[1] || '';
}

// The game's own files for the build: the main scene, main.gd, the controls and a player brain.
// pick = { level, bg, player, hud (res:// scene paths or ''), name, start: 'menu' | 'title' | 'none' };
// shipped = true for Export game (no Stage bridge: the game ignores the page around it)
export async function gameFiles(pick, shipped = false) {
  const ext = [], props = [];
  const add = (key, path) => { if (!path) return; ext.push(`[ext_resource type="PackedScene" path="${path}" id="${key}"]`); props.push(`${key}_scene = ExtResource("${key}")`); };
  add('level', pick.level); add('background', pick.level ? '' : pick.bg); add('player', pick.player); add('hud', pick.hud);
  // saved Kiln menus (Menus area): the title menu if asked for, options from it, pause on Esc
  const mn = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/menus')).catch(() => ({ items: [] }));
  for (const k of ['title', 'options', 'pause']) if ((k !== 'title' || pick.start === 'menu') && (mn.items || []).some(i => i.name === k + '.tscn')) { ext.push(`[ext_resource type="PackedScene" path="res://menus/${k}.tscn" id="${k}m"]`); props.push(`${k}_menu = ExtResource("${k}m")`); }
  // Logic graphs: every logic/*.gd runs while playing
  const lg = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/logic')).catch(() => ({ items: [] }))).items || []).filter(i => /\.gd$/.test(i.name));
  lg.forEach((f, i) => ext.push(`[ext_resource type="Script" path="res://logic/${f.name}" id="lg${i}"]`));
  if (lg.length) props.push(`logic_scripts = Array[Script]([${lg.map((_, i) => `ExtResource("lg${i}")`).join(', ')}])`);
  const main = `[gd_scene load_steps=${ext.length + 2} format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="main"]\n${ext.join('\n')}\n\n`
    + `[node name="Main" type="Node2D"]\nscript = ExtResource("main")\n${props.join('\n')}\ntitle = ${JSON.stringify(pick.name || 'Kiln demo')}\nshow_title = ${pick.start !== 'none'}\n${shipped ? 'playtest = false\n' : ''}`;
  const files = { 'kiln_main.tscn': main, 'main.gd': MAIN_GD, '_kiln/game/input.gd': INPUT_GD };     // the controls, always current
  // the player brain main.gd falls back on: the folder's own copy (here or in the old sprites/_kiln/), else Kiln's
  const ls = async d => ((await api('/api/fs?path=' + encodeURIComponent(`${FS.root}/${d}`)).catch(() => ({ items: [] }))).items || []).map(i => i.name);
  if (!(await ls('_kiln/brains')).includes('player.gd')) files['_kiln/brains/player.gd'] = (await ls('sprites/_kiln/brains')).includes('player.gd')
    ? await fetch('/api/fs/raw?path=' + encodeURIComponent(`${FS.root}/sprites/_kiln/brains/player.gd`)).then(r => r.text()) : BRAIN_GD.player;
  return files;
}

// Build for the Stage: onLog(lines) gets the build log as it grows; resolves true when the game is ready at /play/.
export async function buildGame(pick, onLog) {
  const files = await gameFiles(pick);
  const r = await api('/api/play/build', { root: FS.root, files, opts: { name: pick.name, w: 480, h: 270 } }).catch(e => ({ err: e.message }));
  if (r.err) { onLog([r.err]); return false; }
  for (;;) {
    await new Promise(ok => setTimeout(ok, 1200));
    const st = await api('/api/play/status').catch(() => null);
    if (st) onLog(st.log);
    if (st && !st.running) return !!st.ok;
  }
}
