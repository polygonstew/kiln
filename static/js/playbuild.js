// Play: build a small playable game from what is in the asset folder (a level, the player actor, a HUD, a title
// screen) and export it for the web with Godot, so it can be played in a browser tab. The build happens in a
// copy (server: play.py); this file picks what goes in and writes the main scene + main.gd that ties it together.
import { h, api, toast } from './core.js';
import { S as FS } from './files.js';
import { BRAIN_GD } from './brains.js';

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
@export var title := "Kiln demo"
@export var show_title := true
var playing := false
var menus: Array[Node] = []               # open menu screens, top last
const BRAIN := "res://sprites/_kiln/brains/player.gd"

func _ready() -> void:
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
\tif playing and pause_menu and e.is_action_pressed("ui_cancel") and menus.is_empty():
\t\tget_tree().paused = true
\t\t_open(pause_menu)

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
\thelp.text = "Arrows move · Space jumps · X attacks · C shoots"
\thelp.add_theme_font_size_override("font_size", 8)
\thelp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tbox.add_child(help)
\tbox.position -= box.get_combined_minimum_size() / 2
\tplay.grab_focus()

func _start() -> void:
\tplaying = true
\tvar world := Node2D.new()
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
\t\tworld.add_child(p)
\t\tif not p.is_in_group("player"):
\t\t\tp.add_to_group("player")
\t\tif p.get_node_or_null("Brain") == null and ResourceLoader.exists(BRAIN):
\t\t\tvar b := Node.new()
\t\t\tb.name = "Brain"
\t\t\tb.set_script(load(BRAIN))
\t\t\tp.add_child(b)
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
`;

async function listScenes(folder) {      // [name, res path] of folder/<name>/<name>.tscn
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + folder)).catch(() => ({ items: [] }));
  const out = [];
  for (const d of (r.items || []).filter(i => i.dir && !i.name.startsWith('_'))) {
    const x = await api('/api/fs?path=' + encodeURIComponent(d.path)).catch(() => ({ items: [] }));
    if (x.items.some(i => i.name === d.name + '.tscn')) out.push([d.name, `res://${folder}/${d.name}/${d.name}.tscn`]);
  }
  return out;
}

export async function openPlay() {
  const [levels, actors, scenes, huds] = await Promise.all(['levels', 'sprites', 'backgrounds', 'hud'].map(listScenes));
  // the player: an actor saved with the Player role (its scene joins the "player" group), else the first one
  let player = actors[0]?.[1] || '';
  for (const [n, p] of actors) { const t = await fetch('/api/fs/raw?path=' + encodeURIComponent(`${FS.root}/sprites/${n}/${n}.tscn`)).then(r => r.text()).catch(() => ''); if (t.includes('groups=["player"]')) { player = p; break; } }
  const sel = (opts, val, none) => h('select', {}, ...(none ? [h('option', { value: '' }, none)] : []), ...opts.map(([n, p]) => h('option', { value: p, selected: p === val }, n)));
  const S = { level: sel(levels, levels[0]?.[1], 'No level (a flat floor)'), bg: sel(scenes, scenes[0]?.[1], 'None'), player: sel(actors, player, 'Nobody'), hud: sel(huds, huds[0]?.[1], 'None') };
  const name = h('input', { type: 'text', value: 'Kiln demo' }), title = h('input', { type: 'checkbox', checked: true });
  const logEl = h('pre', { class: 'play-log' }), go = h('button', { class: 'btn go' }, '▶ Build and play');
  const row = (l, c, hint) => h('label', { class: 'fld' }, h('span', { class: 'fl' }, l), c, hint ? h('small', { class: 'hint' }, hint) : '');
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m && !busy) m.remove(); } }, h('div', { style: { width: 'min(560px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Play your game'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' },
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Builds a small game from your asset folder with Godot and opens it in a new tab. Your files are only read: the build is a copy.'),
      row('Game name', name), row('Title screen', title, 'A Play button before the level'),
      row('Level', S.level, levels.length ? '' : 'No levels saved yet: you get a flat floor'), row('Background', S.bg, 'Used when there is no level (a level brings its own)'),
      row('Player', S.player, 'Arrows, Space, X attack, C shoot (the Player brain)'), row('HUD', S.hud),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '10px 0' } }, go, h('a', { class: 'btn ghost', href: '/play/', target: '_blank' }, 'Open the last build')),
      logEl)));
  document.body.append(m);
  let busy = false;
  go.onclick = async () => {
    busy = true; go.disabled = true; go.textContent = 'Building…'; logEl.textContent = '';
    const ext = [], props = [];
    const add = (key, path) => { if (!path) return; ext.push(`[ext_resource type="PackedScene" path="${path}" id="${key}"]`); props.push(`${key}_scene = ExtResource("${key}")`); };
    add('level', S.level.value); add('background', S.level.value ? '' : S.bg.value); add('player', S.player.value); add('hud', S.hud.value);
    // saved Kiln menus (Menus area): title first, options from it, pause on Esc
    const mn = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/menus')).catch(() => ({ items: [] }));
    for (const k of ['title', 'options', 'pause']) if ((mn.items || []).some(i => i.name === k + '.tscn')) { ext.push(`[ext_resource type="PackedScene" path="res://menus/${k}.tscn" id="${k}m"]`); props.push(`${k}_menu = ExtResource("${k}m")`); }
    const main = `[gd_scene load_steps=${ext.length + 2} format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="main"]\n${ext.join('\n')}\n\n`
      + `[node name="Main" type="Node2D"]\nscript = ExtResource("main")\n${props.join('\n')}\ntitle = ${JSON.stringify(name.value || 'Kiln demo')}\nshow_title = ${title.checked}\n`;
    const files = { 'kiln_main.tscn': main, 'main.gd': MAIN_GD };
    const have = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites/_kiln/brains')).catch(() => ({ items: [] }));
    if (!(have.items || []).some(i => i.name === 'player.gd')) files['sprites/_kiln/brains/player.gd'] = BRAIN_GD.player;
    const r = await api('/api/play/build', { root: FS.root, files, opts: { name: name.value, w: 480, h: 270 } }).catch(e => ({ err: e.message }));
    if (r.err) { logEl.textContent = r.err; busy = false; go.disabled = false; go.textContent = '▶ Build and play'; return; }
    const poll = async () => {
      const st = await api('/api/play/status').catch(() => null);
      if (st) logEl.textContent = st.log.join('\n');
      if (st?.running) return setTimeout(poll, 1500);
      busy = false; go.disabled = false; go.textContent = '▶ Build and play';
      if (st?.ok) { window.open('/play/', '_blank'); toast('Built: playing in a new tab', 'ok'); }
    };
    setTimeout(poll, 1000);
  };
}
