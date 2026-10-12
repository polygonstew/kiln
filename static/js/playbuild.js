// Play builds: a small playable game from what is in the asset folder (a level, the player actor, a HUD, menus),
// exported for the web with Godot and played in the Stage (stage.js). The build happens in a copy (server: play.py);
// this file writes the main scene + main.gd that ties it together (gameFiles; Export game uses them too) and runs the build.
import { api, pref } from './core.js';
import { S as FS } from './files.js';
import { BRAIN_GD } from './brains.js';
import { INPUT_GD } from './input_godot.js';
import { GAME, P, roleBrain, LOOK } from './gametype.js';
import { ADVENTURE, adventureRuntime } from './adventure_godot.js';
import { STACKER, STACKER_GD } from './stacker_godot.js';
import { FLOW, FLOW_GD, flowJSON } from './flow_godot.js';
import { STORY, STORY_GD } from './story_godot.js';
import { DIALOGUE_GD } from './dialogue_godot.js';
import { MATCH3, MATCH3_GD } from './match3_godot.js';
import { BATTLE, BATTLE_GD, cardsJSON } from './cards_godot.js';

const MAIN_GD = `extends Node2D
## Kiln game: a title screen (optional), then the level with the player, a camera (following it, room by room or
## fixed on one screen) and the HUD. Doors and room exits call go_to_level().
## Written by Kiln's Play button; the build is a copy, so change this freely.

@export var level_scene: PackedScene
@export var background_scene: PackedScene
@export var player_scene: PackedScene
@export var hud_scene: PackedScene
@export var title_menu: PackedScene      ## Kiln Menus: shown first (else a plain title screen)
@export var options_menu: PackedScene
@export var pause_menu: PackedScene       ## Esc while playing
@export var logic_scripts: Array[Script] = []   ## Kiln Logic graphs (logic/*.gd): each runs on its own node while playing
@export var adventure: Script             ## point & click: Kiln's adventure runtime (_kiln/adventure/adventure.gd)
@export_file("*.json") var flow := ""     ## Kiln Flow: the game's path of scenes (flow/game.json); when set, it runs the game
@export var player_brain := "res://_kiln/brains/player.gd"   ## for a player actor without a Brain of its own
@export_enum("follow", "rooms", "fixed", "scroll") var camera_mode := "follow"   ## scrolls with the player · room by room · one screen · by itself
@export var title := "Kiln demo"
@export var controls := "Arrows / stick move · Space / A jumps · X attacks · C / B shoots"   ## under the title
@export var show_title := true
@export var start_at := Vector2.INF      ## Kiln's "Play from here": the player starts at this spot of the first level
@export var playtest := true            ## in Kiln's Stage: take live tuning and screenshot requests from the page
var playing := false
var menus: Array[Node] = []               # open menu screens, top last
var player: Node2D
var _web: JavaScriptObject                # the page around a web build (Kiln's Stage talks through it)
var _tuned := ""
var world: Node2D                         # the level being played (built again by go_to_level)
signal level_started(level: Node2D)       # after every level change (the stacker and Logic can listen)

func _ready() -> void:
\tprocess_mode = Node.PROCESS_MODE_ALWAYS    # Main hears Esc / Start while paused; the world under it pauses
\tadd_to_group("kiln_main")                  # zones and rooms ask Main to change level
\tKilnInput.ensure()                         # keys and gamepad for every action (_kiln/game/input.gd)
\tif playtest and OS.has_feature("web"):
\t\t_web = JavaScriptBridge.get_interface("window")
\tif flow != "":                             # the flow decides everything: videos, menus, levels, rooms…
\t\t_setup()
\t\tvar f: Node = load("res://_kiln/game/flow.gd").new()
\t\tadd_child(f)
\t\tf.begin(flow)
\telif title_menu:
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
\t\t\tget_tree().paused = false
\t\t\tif flow != "":
\t\t\t\tflow_done("done")
\t\t\telse:
\t\t\t\t_start()
\t\t"rules":
\t\t\t_rules()
\t\t"save":
\t\t\tget_tree().call_group("kiln_adventure", "save_game")
\t\t"load":
\t\t\twhile menus.size():
\t\t\t\t_close_top()
\t\t\tget_tree().paused = false
\t\t\tif not playing:
\t\t\t\t_start()
\t\t\tget_tree().call_group("kiln_adventure", "load_game")
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

## How to play: the rule book Kiln wrote (rules/rules.json), or at least the controls; Esc, Enter or a click closes it.
func _rules() -> void:
\tvar parts: Array = [{"title": "Controls", "text": controls}]
\tif FileAccess.file_exists("res://rules/rules.json"):
\t\tvar d = JSON.parse_string(FileAccess.get_file_as_string("res://rules/rules.json"))
\t\tif d is Array and d.size():
\t\t\tparts = d
\tvar layer := CanvasLayer.new()
\tlayer.layer = 60
\tlayer.process_mode = Node.PROCESS_MODE_ALWAYS
\tvar dim := ColorRect.new()
\tdim.color = Color(0, 0, 0, 0.85)
\tdim.set_anchors_preset(Control.PRESET_FULL_RECT)
\tlayer.add_child(dim)
\tvar scroll := ScrollContainer.new()
\tscroll.set_anchors_preset(Control.PRESET_FULL_RECT)
\tscroll.offset_left = 40
\tscroll.offset_right = -40
\tscroll.offset_top = 24
\tscroll.offset_bottom = -24
\tlayer.add_child(scroll)
\tvar box := VBoxContainer.new()
\tbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
\tscroll.add_child(box)
\tvar fs := maxi(8, int(get_viewport_rect().size.y / 36))
\tfor p in parts:
\t\tfor t in [[p.get("title", ""), fs + 4, Color(1, 0.8, 0.4)], [p.get("text", ""), fs, Color.WHITE]]:
\t\t\tvar l := Label.new()
\t\t\tl.text = t[0]
\t\t\tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
\t\t\tl.add_theme_font_size_override("font_size", t[1])
\t\t\tl.add_theme_color_override("font_color", t[2])
\t\t\tbox.add_child(l)
\tvar back := Button.new()
\tback.text = "Back"
\tback.pressed.connect(layer.queue_free)
\tbox.add_child(back)
\tadd_child(layer)
\tback.grab_focus.call_deferred()

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
\thelp.text = controls
\thelp.add_theme_font_size_override("font_size", 8)
\thelp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(help)
\tbox.position -= box.get_combined_minimum_size() / 2
\tplay.grab_focus()

func _start() -> void:
\t_setup()
\t_enter(level_scene, "")

# ---- the parts that last the whole game, added once: the HUD, the point & click runtime, the Logic graphs
var _set_up := false
func _setup() -> void:
\tif _set_up:
\t\treturn
\t_set_up = true
\tplaying = true
\tif hud_scene:
\t\tvar hud := hud_scene.instantiate()
\t\tif hud is CanvasLayer:                   # Kiln HUDs are laid out on a 480×270 screen: scale them to this one
\t\t\thud.scale = Vector2.ONE * (get_viewport_rect().size.x / 480.0)
\t\tadd_child(hud)
\tif adventure:                              # point & click: cursor, inventory, saving (_kiln/adventure/)
\t\tvar a := CanvasLayer.new()
\t\ta.set_script(adventure)
\t\tadd_child(a)
\tfor s in logic_scripts:
\t\tvar n := Node.new()
\t\tn.name = s.resource_path.get_file().get_basename()
\t\tn.set_script(s)
\t\tn.process_mode = Node.PROCESS_MODE_PAUSABLE
\t\tadd_child(n)

# ---- for the flow (_kiln/game/flow.gd): a menu screen, a level or room, nothing (under a video), a scene's outcome
func open_menu(scene: PackedScene) -> void:
\t_open(scene)

func play_scene(scene: PackedScene, entry := "") -> void:
\t_setup()
\t_enter(scene, entry)

func clear_world() -> void:
\tif world:
\t\tremove_child(world)
\t\tworld.queue_free()
\tworld = null
\tplayer = null
\t_cam = null

## A scene of the flow ended with this outcome (a Door zone to "next in the flow", a room's "leaves" hotspot).
func flow_done(outcome := "done") -> void:
\tget_tree().call_group_flags(SceneTree.GROUP_CALL_DEFERRED, "kiln_flow", "done", outcome)   # after physics: a zone may be asking

## Go to another level (a Door zone, a room's exit): the world is built again from that scene, the player appears at
## the marker named entry (a room's Entries/<entry>) or at its PlayerStart. The HUD, menus and Logic carry on.
func go_to_level(path: String, entry := "") -> void:
\t_enter.call_deferred(load(path), entry)

## The player is out: the level they were in starts again.
func replay() -> void:
\t_enter.call_deferred(_last[0], _last[1])

var _last := [null, ""]
func _enter(scene: PackedScene, entry: String) -> void:
\t_last = [scene, entry]
\tif world:
\t\tremove_child(world)
\t\tworld.queue_free()
\tworld = Node2D.new()
\tworld.process_mode = Node.PROCESS_MODE_PAUSABLE
\tadd_child(world)
\tmove_child(world, 0)                       # under the HUD and menus
\tvar view := get_viewport_rect().size
\tvar start := Vector2(48, view.y - 16)
\tvar lv: Node = null
\tif scene:
\t\tlv = scene.instantiate()
\t\tworld.add_child(lv)
\t\tvar m := lv.get_node_or_null("Entries/" + entry) if entry != "" else null
\t\tif m == null:
\t\t\tm = lv.get_node_or_null("PlayerStart")
\t\tif m == null:
\t\t\tm = lv.get_node_or_null("Entries/start")
\t\tif m:
\t\t\tstart = (m as Node2D).position
\t\tif start_at != Vector2.INF:
\t\t\tstart = start_at
\t\t\tstart_at = Vector2.INF
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
\tplayer = null
\tif player_scene:
\t\tvar p := player_scene.instantiate() as Node2D
\t\tp.position = start
\t\tif not p.is_in_group("player"):
\t\t\tp.add_to_group("player")
\t\tif p.get_node_or_null("Brain") == null and ResourceLoader.exists(player_brain):
\t\t\tvar b := Node.new()
\t\t\tb.name = "Brain"
\t\t\tb.set_script(load(player_brain))
\t\t\tp.add_child(b)
\t\tplayer = p
\t\tif _web:
\t\t\t_retune()   # the Stage's numbers go in before the player starts
\t\tworld.add_child(p)
\t_camera(lv, view)
\tlevel_started.emit(world)

# the camera: follow (scrolls with the player, kept inside the level), rooms (one screen-sized room at a time,
# sliding to the next as the player walks through a doorway) or fixed (one screen, centred on the level)
var _cam: Camera2D
var _room := Vector2.ZERO                    # rooms: a room's size, the screen rounded up to whole tiles
var _cs := {}                                # Kiln's Camera settings for this level (camera/camera.json), if any
func _camera(lv: Node, view: Vector2) -> void:
\t_cam = Camera2D.new()
\t_cs = {}
\tif FileAccess.file_exists("res://camera/camera.json"):
\t\tvar d = JSON.parse_string(FileAccess.get_file_as_string("res://camera/camera.json"))
\t\tif d is Dictionary:
\t\t\t_cs = d.get("levels", {}).get(String(lv.name) if lv else "", d.get("game", {}))
\tif _cs.has("mode"):
\t\tcamera_mode = _cs["mode"]
\t_cam.zoom = Vector2.ONE * float(_cs.get("zoom", 1.0))
\t_cam.offset.y = float(_cs.get("bias", 0.0)) * view.y
\tif _cs.has("damping"):
\t\t_cam.position_smoothing_speed = float(_cs["damping"])
\tif camera_mode == "follow" and _cs.has("dead_w"):          # the dead zone: the player moves freely inside it
\t\t_cam.drag_horizontal_enabled = true
\t\t_cam.drag_vertical_enabled = true
\t\t_cam.drag_left_margin = float(_cs["dead_w"])
\t\t_cam.drag_right_margin = float(_cs["dead_w"])
\t\t_cam.drag_top_margin = float(_cs["dead_h"])
\t\t_cam.drag_bottom_margin = float(_cs["dead_h"])
\tvar bounds := Rect2(Vector2.ZERO, view)
\tvar bounded := true
\tvar tiles := lv.get_node_or_null("Tiles") as TileMapLayer if lv else null
\tif tiles and tiles.get_used_rect().has_area():
\t\tvar ts := Vector2(tiles.tile_set.tile_size)
\t\tbounds = Rect2(Vector2(tiles.get_used_rect().position) * ts, Vector2(tiles.get_used_rect().size) * ts)
\t\t_room = (view / ts).ceil() * ts
\t\tif bounds.size.y < view.y:             # a low strip of tiles: keep its bottom, show sky above it
\t\t\tbounds = Rect2(bounds.position.x, bounds.end.y - view.y, bounds.size.x, view.y)
\t\tif bounds.size.x < view.x:             # narrower than the screen: the level in the middle
\t\t\tbounds = Rect2(bounds.get_center().x - view.x / 2, bounds.position.y, view.x, bounds.size.y)
\telif lv and lv.get("size") is Vector2:       # a point & click room: its background's size
\t\tbounds = Rect2(Vector2.ZERO, lv.get("size"))
\telse:
\t\tbounded = false                          # nothing to measure: the camera goes where the player goes
\tif not _cs.get("confine", true):
\t\tbounded = false
\tif camera_mode == "follow" and player:
\t\t_cam.position_smoothing_enabled = true
\t\tplayer.add_child(_cam)
\t\tif not bounded:
\t\t\t_cam.make_current()
\t\t\treturn
\t\t_cam.limit_left = int(bounds.position.x)
\t\t_cam.limit_top = int(bounds.position.y)
\t\t_cam.limit_right = int(bounds.end.x)
\t\t_cam.limit_bottom = int(bounds.end.y)
\telse:
\t\tworld.add_child(_cam)
\t\t_cam.position = bounds.get_center() if camera_mode == "fixed" or player == null else _room_centre()
\t_cam.make_current()

func _room_centre() -> Vector2:
\tvar size := _room if _room != Vector2.ZERO else get_viewport_rect().size
\treturn (player.global_position / size).floor() * size + size / 2

func _physics_process(delta: float) -> void:
\tif camera_mode == "rooms" and is_instance_valid(player) and _cam:
\t\t_cam.position = _cam.position.move_toward(_room_centre(), 1800.0 * delta)   # a quick slide to the next room
\telif camera_mode == "scroll" and _cam:                      # a runner / shmup: the screen moves on by itself
\t\t_cam.position.x += float(_cs.get("scroll", 60.0)) * delta
\telif camera_mode == "follow" and _cam and is_instance_valid(player) and "velocity" in player and _cs.has("look"):
\t\t_cam.offset.x = move_toward(_cam.offset.x, signf(player.velocity.x) * float(_cs["look"]), float(_cs["look"]) * 2.0 * delta)   # look-ahead

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

// what goes in the game: the Stage's pickers (pref 'stage.build:<asset folder>', one set per game); the first time, the
// player actor and the first level (a point & click: the first room) / background / HUD in the folder
export const buildKey = () => 'stage.build:' + FS.root;
export async function gamePicks() {
  const p = pref.get(buildKey(), { start: 'none' });
  if ('player' in p) return p;
  const [levels, rooms, scenes, actors, huds] = await Promise.all(['levels', 'rooms', 'backgrounds', 'sprites', 'hud'].map(listScenes));
  const first = (GAME.path === 'adventure' ? rooms[0] || levels[0] : levels[0] || rooms[0])?.[1] || '';
  const q = { ...p, player: await findPlayer(actors), level: first, bg: scenes[0]?.[1] || '', hud: huds[0]?.[1] || '' };
  pref.set(buildKey(), q);
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

// The game's own files for the build: the main scene, main.gd, the controls, the player's brain and the runtime the
// game's path needs (gametype.js): the point & click runtime when it starts in a room, the stacker for a stacking puzzle.
// pick = { level, bg, player, hud (res:// scene paths or ''), name, start: 'menu' | 'title' | 'none' };
// shipped = true for Export game (no Stage bridge: the game ignores the page around it)
export async function gameFiles(pick, shipped = false) {
  const ext = [], props = [];
  // Levels' "Play from here": this one level alone, the player starting at that spot (used once)
  const here = shipped ? null : pref.get('play.from', null);
  if (here) { pref.set('play.from', null); pick = { ...pick, level: here.level, start: 'none' }; props.push(`start_at = Vector2(${here.x}, ${here.y})`); }
  const add = (key, path) => { if (!path) return; ext.push(`[ext_resource type="PackedScene" path="${path}" id="${key}"]`); props.push(`${key}_scene = ExtResource("${key}")`); };
  // a Flow (the game's path of scenes) runs the game when it has scenes; then rooms anywhere in it bring the point & click runtime
  const F = (await fetch('/api/project?id=flow-game').then(r => r.ok ? r.json() : null).catch(() => null))?.flow, flowOn = !here && !!F?.nodes?.length;
  const room = flowOn ? F.nodes.some(n => n.kind === 'room') : /(^|\/)rooms\//.test(pick.level || ''), stack = GAME.path === 'puzzle' && GAME.puzzle === 'stack';
  add('level', pick.level); add('background', pick.level ? '' : pick.bg); add('player', stack ? '' : pick.player); add('hud', pick.hud);
  // saved Kiln menus (Menus area): the title menu if asked for, options from it, pause on Esc
  const mn = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/menus')).catch(() => ({ items: [] }));
  for (const k of ['title', 'options', 'pause']) if ((k !== 'title' || pick.start === 'menu') && (mn.items || []).some(i => i.name === k + '.tscn')) { ext.push(`[ext_resource type="PackedScene" path="res://menus/${k}.tscn" id="${k}m"]`); props.push(`${k}_menu = ExtResource("${k}m")`); }
  // Logic graphs: every logic/*.gd runs while playing (a stacking puzzle's stacker runs the same way)
  const lg = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/logic')).catch(() => ({ items: [] }))).items || []).filter(i => /\.gd$/.test(i.name)).map(i => 'logic/' + i.name);
  if (stack) lg.push(STACKER);
  lg.forEach((f, i) => ext.push(`[ext_resource type="Script" path="res://${f}" id="lg${i}"]`));
  if (lg.length) props.push(`logic_scripts = Array[Script]([${lg.map((_, i) => `ExtResource("lg${i}")`).join(', ')}])`);
  if (room) { ext.push(`[ext_resource type="Script" path="res://${ADVENTURE}" id="adv"]`); props.push('adventure = ExtResource("adv")'); }
  if (flowOn) props.push('flow = "res://flow/game.json"');
  const brain = room ? 'walker' : roleBrain('hero') || 'player';
  props.push(`player_brain = "res://_kiln/brains/${brain}.gd"`, `camera_mode = "${room ? 'follow' : P().camera}"`, `controls = ${JSON.stringify(room ? CONTROLS.adventure : CONTROLS[stack ? 'stack' : GAME.path] || CONTROLS.scroller)}`);
  const main = `[gd_scene load_steps=${ext.length + 2} format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="main"]\n${ext.join('\n')}\n\n`
    + `[node name="Main" type="Node2D"]\nscript = ExtResource("main")\n${props.join('\n')}\ntitle = ${JSON.stringify(pick.name || 'Kiln demo')}\nshow_title = ${pick.start !== 'none'}\n${shipped ? 'playtest = false\n' : ''}`;
  const files = { 'kiln_main.tscn': main, 'main.gd': MAIN_GD, '_kiln/game/input.gd': INPUT_GD };     // the controls, always current
  if (room) Object.assign(files, adventureRuntime());
  if (stack) files[STACKER] = STACKER_GD;
  const from = pref.get('flow.from', ''); pref.set('flow.from', '');      // Flow's "▶ From here": this build starts there
  if (flowOn && F.nodes.some(n => n.kind === 'match3')) files[MATCH3] = MATCH3_GD;
  const cam = (await fetch('/api/project?id=camera-game').then(r => r.ok ? r.json() : null).catch(() => null))?.camera;
  if (cam) files['camera/camera.json'] = JSON.stringify(cam, null, 1) + '\n';          // Kiln's Camera settings
  const rules = (await fetch('/api/project?id=rules-game').then(r => r.ok ? r.json() : null).catch(() => null))?.rules;
  if (rules?.sections?.length) files['rules/rules.json'] = JSON.stringify(rules.sections, null, 1) + '\n';      // "How to play" in the menus
  if (flowOn && F.nodes.some(n => n.kind === 'cards')) Object.assign(files, { [BATTLE]: BATTLE_GD,
    'cards/cards.json': cardsJSON((await fetch('/api/project?id=cards-game').then(r => r.ok ? r.json() : null).catch(() => null))?.cards || {}, rel => 'res://' + rel) });
  if (flowOn) Object.assign(files, { 'flow/game.json': flowJSON(F.nodes.some(n => n.id === from) ? { ...F, start: from } : F, rel => 'res://' + rel), [FLOW]: FLOW_GD, [STORY]: STORY_GD, '_kiln/ui/dialogue.gd': DIALOGUE_GD });
  // the player brain main.gd falls back on: the folder's own copy (here or in the old sprites/_kiln/), else Kiln's
  const ls = async d => ((await api('/api/fs?path=' + encodeURIComponent(`${FS.root}/${d}`)).catch(() => ({ items: [] }))).items || []).map(i => i.name);
  if (!(await ls('_kiln/brains')).includes(brain + '.gd')) files[`_kiln/brains/${brain}.gd`] = (await ls('sprites/_kiln/brains')).includes(brain + '.gd')
    ? await fetch('/api/fs/raw?path=' + encodeURIComponent(`${FS.root}/sprites/_kiln/brains/${brain}.gd`)).then(r => r.text()) : BRAIN_GD[brain];
  return files;
}
// the line under the title, per path; controlsText(level) for the Stage
export const controlsText = level => /(^|\/)rooms\//.test(level || '') ? CONTROLS.adventure : CONTROLS[GAME.path === 'puzzle' && GAME.puzzle === 'stack' ? 'stack' : GAME.path] || CONTROLS.scroller;
const CONTROLS = {
  scroller: 'Arrows / stick move · Space / A jumps · X attacks · C / B shoots',
  wild: 'Arrows / stick move · Space / A jumps · X attacks · C / B shoots',
  topdown: 'WASD / left stick move · arrows / right stick shoot · X attacks',
  puzzle: 'Arrows / stick move · Space / A jumps · walk into crates to push them',
  stack: '← → move the brick · ↑ turns it · ↓ drops it faster',
  adventure: 'Click to walk · click a thing to use it · right-click to look · click an item, then a thing, to use it there',
  text: 'Space turns the page · click a choice, or type what you do',
  fmv: 'Space skips a video · 1–6 or a click choose · press in time when it says NOW',
  match3: 'Click a piece, then a neighbour, to swap them · or arrows and Space',
  cards: 'Click a card (or 1–9) to play it · E or Enter ends the turn',
  vn: 'Space or Enter reads on · pick a choice when it comes',
  runner: 'Space, a click or pad A jumps (hold for higher)',
};

// Build for the Stage: onLog(lines) gets the build log as it grows; resolves true when the game is ready at /play/.
export async function buildGame(pick, onLog) {
  const files = await gameFiles(pick);
  const r = await api('/api/play/build', { root: FS.root, files, opts: { name: pick.name, w: LOOK().w, h: LOOK().h, look: GAME.look } }).catch(e => ({ err: e.message }));
  if (r.err) { onLog([r.err]); return false; }
  for (;;) {
    await new Promise(ok => setTimeout(ok, 1200));
    const st = await api('/api/play/status').catch(() => null);
    if (st) onLog(st.log);
    if (st && !st.running) return !!st.ok;
  }
}
