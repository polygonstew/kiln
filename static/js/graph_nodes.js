// Logic graph nodes: what each node is (its ports and fields) and the GDScript it becomes. Four kinds:
//   event  starts a chain (the level starts, a key, a zone, a timer…) and becomes one function
//   flow   steers a chain (if, wait, repeat, only once…)
//   act    does something (say a line, heal, spawn, play a sound, set a variable…)
//   val    a value wired into another node's input (numbers, maths, comparisons, the player's health…)
// Ports: exec ports carry "then"; data ports carry num | text | bool | any. A data input that is not wired uses the
// field shown next to it. graph_compile.js walks the wires and calls these; the c object it passes is documented there.

const KEYS = [['ui_accept', 'Jump (Space)'], ['attack', 'Attack (X)'], ['shoot', 'Shoot (C)'], ['ui_cancel', 'Pause (Esc)'],
  ['ui_up', 'Up'], ['ui_down', 'Down'], ['ui_left', 'Left'], ['ui_right', 'Right'],
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(k => ['key:' + k, 'Key ' + k]), ...'1234567890'.split('').map(k => ['key:' + k, 'Key ' + k])];
export const KEY_OPTIONS = KEYS;
// a key or action as a GDScript condition on an input event, or as "held now"
const keyCode = k => k.startsWith('key:') ? 'KEY_' + k.slice(4) : null;
export const keyPressed = k => keyCode(k) ? `event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == ${keyCode(k)}`
  : `InputMap.has_action("${k}") and event.is_action_pressed("${k}")`;
const keyHeld = k => keyCode(k) ? `Input.is_physical_key_pressed(${keyCode(k)})` : `(InputMap.has_action("${k}") and Input.is_action_pressed("${k}"))`;
const WHO = [['player', 'the player'], ['enemy', 'an enemy'], ['anyone', 'anyone']];
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
const num = v => { const n = Number(v); return !isFinite(n) ? '0.0' : Number.isInteger(n) ? n + '.0' : String(n); };

// ports: [id, type, label, default]  (type exec|num|text|bool|any; data inputs with a default get a field)
// fields: [id, label, kind, default, options]  (kind num|text|check|sel|var|zone|actor|sound|key)
export const NODES = {
  /* ------------------------------------------------------------------ events ---- */
  start: { cat: 'event', label: 'When the level starts', hint: 'Runs once, when the level (with the player and HUD) is ready',
    outs: [['then', 'exec']], ev: () => ({ name: 'start', hook: f => [`${f}()`] }) },
  frame: { cat: 'event', label: 'Every frame', hint: 'Runs 60 times a second. delta = seconds since the last frame',
    outs: [['then', 'exec'], ['delta', 'num', 'delta']], ev: () => ({ name: 'every_frame', params: 'delta: float', frame: true }), out: { delta: () => 'delta' } },
  key: { cat: 'event', label: 'When a key is pressed', fields: [['key', 'Key', 'key', 'key:E']], outs: [['then', 'exec']],
    ev: n => ({ name: 'key_' + slug(n.f.key.replace('key:', '')), input: keyPressed(n.f.key) }) },
  zone: { cat: 'event', label: 'When the player enters a zone', hint: 'A zone painted in Levels (Paint → Zones); its name',
    fields: [['zone', 'Zone', 'zone', '']], outs: [['then', 'exec'], ['who', 'any', 'who']],
    ev: n => ({ name: 'enter_' + slug(n.f.zone), params: 'who: Node', hook: f => [`_connect_zones(${JSON.stringify(n.f.zone)}, ${f})`], use: ['_connect_zones'] }), out: { who: () => 'who' } },
  timer: { cat: 'event', label: 'Every few seconds', fields: [['secs', 'Seconds', 'num', 2]], outs: [['then', 'exec']],
    ev: n => ({ name: 'every_' + slug(num(n.f.secs)) + 's', hook: f => [`_every(${num(n.f.secs)}, ${f})`], use: ['_every'] }) },
  died: { cat: 'event', label: 'When someone dies', hint: 'The player, any enemy, anyone, or an actor by name',
    fields: [['who', 'Who', 'sel', 'enemy', WHO]], outs: [['then', 'exec'], ['who', 'any', 'who']],
    ev: n => ({ name: slug(n.f.who) + '_died', params: 'who: Node', hook: f => [`_connect_actors(${JSON.stringify(n.f.who)}, "died", ${f})`], use: ['_connect_actors'] }), out: { who: () => 'who' } },
  hit: { cat: 'event', label: 'When the player is hit', outs: [['then', 'exec']],
    ev: () => ({ name: 'player_hit', params: '_from: Vector2, _who: Node', hook: f => [`_connect_actors("player", "hurt_started", ${f})`], use: ['_connect_actors'] }) },
  message: { cat: 'event', label: 'When a message arrives', hint: '"Send a message" in any graph sends it', fields: [['name', 'Message', 'text', 'open_gate']],
    outs: [['then', 'exec']], ev: n => ({ name: 'message_' + slug(n.f.name), message: n.f.name }) },

  /* -------------------------------------------------------------------- flow ---- */
  if: { cat: 'flow', label: 'If', ins: [['cond', 'bool', 'is true', true]], outs: [['yes', 'exec', 'yes'], ['no', 'exec', 'no']],
    run: c => [`if ${c.in('cond')}:`, ...c.block('yes'), ...(c.has('no') ? ['else:', ...c.block('no')] : [])] },
  wait: { cat: 'flow', label: 'Wait', ins: [['secs', 'num', 'seconds', 1]], outs: [['then', 'exec']],
    run: c => [`await get_tree().create_timer(${c.in('secs')}).timeout`, ...c.flow('then')] },
  repeat: { cat: 'flow', label: 'Repeat', ins: [['times', 'num', 'times', 3]], outs: [['each', 'exec', 'each time'], ['done', 'exec', 'then'], ['i', 'num', 'count']],
    run: c => [`for ${c.id('i')} in range(${c.in('times', 'int')}):`, ...c.block('each'), ...c.flow('done')], out: { i: c => c.id('i') } },
  once: { cat: 'flow', label: 'Only the first time', outs: [['then', 'exec']],
    run: c => { const v = c.member('done', 'bool', 'false'); return [`if not ${v}:`, `\t${v} = true`, ...c.block('then')]; } },
  chance: { cat: 'flow', label: 'Sometimes', hint: 'Goes "yes" this percent of the time', ins: [['pct', 'num', '% of the time', 50]], outs: [['yes', 'exec', 'yes'], ['no', 'exec', 'no']],
    run: c => [`if randf() * 100.0 < ${c.in('pct')}:`, ...c.block('yes'), ...(c.has('no') ? ['else:', ...c.block('no')] : [])] },
  cooldown: { cat: 'flow', label: 'At most every', hint: 'Lets the chain through, then ignores it for a while', ins: [['secs', 'num', 'seconds', 1]], outs: [['then', 'exec']],
    run: c => { const v = c.member('last', 'int', '-100000'); return [`if Time.get_ticks_msec() - ${v} >= ${c.in('secs')} * 1000.0:`, `\t${v} = Time.get_ticks_msec()`, ...c.block('then')]; } },

  /* ----------------------------------------------------------------- actions ---- */
  say: { cat: 'act', label: 'Say', hint: 'A line in the HUD dialogue box (printed if there is no HUD)', ins: [['who', 'text', 'who', ''], ['line', 'text', 'line', 'Hello!']],
    run: c => [`_say(${c.in('who')}, ${c.in('line')})`], use: ['_hud', '_say'] },
  prompt: { cat: 'act', label: 'Show a button prompt', ins: [['key', 'text', 'key', 'E'], ['what', 'text', 'does', 'Open']],
    run: c => [`if _hud(): _hud().prompt(${c.in('key')}, ${c.in('what')})`], use: ['_hud'] },
  unprompt: { cat: 'act', label: 'Hide the prompt', run: () => ['if _hud(): _hud().hide_prompt()'], use: ['_hud'] },
  bar: { cat: 'act', label: 'Set a HUD bar', hint: 'A bar, gauge or pips by its HUD name (0 = empty, 1 = full)', fields: [['widget', 'HUD name', 'text', 'stamina']], ins: [['v', 'num', 'to', 1]],
    run: c => [`if _hud(): _hud().set_value(${JSON.stringify(c.f.widget)}, ${c.in('v')})`], use: ['_hud'] },
  counter: { cat: 'act', label: 'Set a HUD counter', fields: [['widget', 'HUD name', 'text', 'score']], ins: [['v', 'num', 'to', 0]],
    run: c => [`if _hud(): _hud().set_number(${JSON.stringify(c.f.widget)}, ${c.in('v', 'int')})`], use: ['_hud'] },
  set: { cat: 'act', label: 'Set a variable', fields: [['var', 'Variable', 'var', '']], ins: [['v', 'any', 'to', '0']],
    run: c => c.f.var ? [`${c.f.var} = ${c.in('v', c.varType(c.f.var))}`] : ['pass  # pick a variable'] },
  add: { cat: 'act', label: 'Add to a variable', fields: [['var', 'Variable', 'var', '']], ins: [['v', 'num', 'add', 1]],
    run: c => c.f.var ? [`${c.f.var} += ${c.in('v', c.varType(c.f.var) === 'int' ? 'int' : undefined)}`] : ['pass  # pick a variable'] },
  heal: { cat: 'act', label: 'Heal the player', ins: [['n', 'num', 'hits', 1]], run: c => [`if _player(): _player().heal(${c.in('n', 'int')})`], use: ['_player'] },
  hurt: { cat: 'act', label: 'Hurt the player', ins: [['n', 'num', 'hits', 1]], run: c => [`if _player(): _player().hurt(Vector2.INF, ${c.in('n', 'int')})`], use: ['_player'] },
  kill: { cat: 'act', label: 'Kill the player', run: () => ['if _player(): _player().die()'], use: ['_player'] },
  shake: { cat: 'act', label: 'Shake the camera', ins: [['s', 'num', 'strength', 4]], run: c => [`if _player(): _player().shake(${c.in('s')})`], use: ['_player'] },
  flash: { cat: 'act', label: 'Flash the player', run: () => ['if _player(): _player().hit_flash()'], use: ['_player'] },
  anim: { cat: 'act', label: 'Play a player animation', ins: [['name', 'text', 'animation', 'attack']],
    run: c => [`if _player(): _player().get_node("Sprite").play(${c.in('name')})`], use: ['_player'] },
  teleport: { cat: 'act', label: 'Move the player to a zone', fields: [['zone', 'Zone', 'zone', '']],
    run: c => [`if _player(): _player().global_position = _zone_spot(${JSON.stringify(c.f.zone)})`], use: ['_player', '_zone_spot'] },
  spawn: { cat: 'act', label: 'Spawn near the player', hint: 'A saved actor, so many pixels from the player', fields: [['actor', 'Actor', 'actor', '']], ins: [['dx', 'num', 'x', 80], ['dy', 'num', 'y', -16]],
    run: c => c.f.actor ? [`if _player(): _spawn(${JSON.stringify(c.res(c.f.actor))}, _player().global_position + Vector2(${c.in('dx')}, ${c.in('dy')}))`] : ['pass  # pick an actor'], use: ['_player', '_spawn'] },
  spawnzone: { cat: 'act', label: 'Spawn at a zone', fields: [['actor', 'Actor', 'actor', ''], ['zone', 'Zone', 'zone', '']],
    run: c => c.f.actor ? [`_spawn(${JSON.stringify(c.res(c.f.actor))}, _zone_spot(${JSON.stringify(c.f.zone)}))`] : ['pass  # pick an actor'], use: ['_player', '_spawn', '_zone_spot'] },
  sound: { cat: 'act', label: 'Play a sound', fields: [['file', 'Sound', 'sound', '']],
    run: c => c.f.file ? [`_sound(${JSON.stringify(c.res(c.f.file))})`] : ['pass  # pick a sound'], use: ['_sound'] },
  give: { cat: 'act', label: 'Give an item', hint: 'Into the HUD inventory', ins: [['id', 'text', 'item', 'key']], run: c => [`if _hud(): _hud().add_item(${c.in('id')})`], use: ['_hud'] },
  take: { cat: 'act', label: 'Take an item', ins: [['id', 'text', 'item', 'key']], run: c => [`if _hud(): _hud().remove_item(${c.in('id')})`], use: ['_hud'] },
  send: { cat: 'act', label: 'Send a message', hint: 'Every graph\'s "When a message arrives" with this name runs', fields: [['name', 'Message', 'text', 'open_gate']],
    run: c => [`get_tree().call_group("kiln_logic", "_kiln_message", ${JSON.stringify(c.f.name)})`] },
  speed: { cat: 'act', label: 'Game speed', hint: '1 = normal, 0.3 = slow motion', ins: [['v', 'num', 'speed', 1]], run: c => [`Engine.time_scale = ${c.in('v')}`] },
  restart: { cat: 'act', label: 'Restart the level', run: () => ['get_tree().reload_current_scene()'] },
  print: { cat: 'act', label: 'Print', hint: 'To the game output (Stage log, Godot console)', ins: [['t', 'text', 'text', 'Hello']], run: c => [`print(${c.in('t')})`] },

  /* ------------------------------------------------------------------ values ---- */
  number: { cat: 'val', label: 'Number', fields: [['v', '', 'num', 1]], outs: [['v', 'num']], out: { v: c => num(c.f.v) } },
  text: { cat: 'val', label: 'Text', fields: [['v', '', 'text', 'Hello']], outs: [['v', 'text']], out: { v: c => JSON.stringify(String(c.f.v ?? '')) } },
  get: { cat: 'val', label: 'Variable', fields: [['var', '', 'var', '']], outs: [['v', 'any']], out: { v: c => c.f.var || '0' } },
  health: { cat: 'val', label: 'Player health', outs: [['v', 'num']], out: { v: () => '(_player().health if _player() else 0)' }, use: ['_player'] },
  pos: { cat: 'val', label: 'Player position', outs: [['x', 'num', 'x'], ['y', 'num', 'y']],
    out: { x: () => '(_player().global_position.x if _player() else 0.0)', y: () => '(_player().global_position.y if _player() else 0.0)' }, use: ['_player'] },
  random: { cat: 'val', label: 'Random number', ins: [['a', 'num', 'from', 1], ['b', 'num', 'to', 6]], fields: [['whole', 'whole numbers', 'check', true]], outs: [['v', 'num']],
    out: { v: c => c.f.whole ? `randi_range(int(${c.in('a')}), int(${c.in('b')}))` : `randf_range(${c.in('a')}, ${c.in('b')})` } },
  math: { cat: 'val', label: 'Maths', ins: [['a', 'num', '', 1]], fields: [['op', '', 'sel', '+', [['+', '+'], ['-', '−'], ['*', '×'], ['/', '÷']]]], ins2: [['b', 'num', '', 1]], outs: [['v', 'num']],
    out: { v: c => `(${c.in('a')} ${c.f.op} ${c.in('b')})` } },
  compare: { cat: 'val', label: 'Compare', ins: [['a', 'num', '', 0]], fields: [['op', '', 'sel', '>=', [['==', '='], ['!=', '≠'], ['<', '<'], ['>', '>'], ['<=', '≤'], ['>=', '≥']]]], ins2: [['b', 'num', '', 10]], outs: [['v', 'bool']],
    out: { v: c => `(${c.in('a')} ${c.f.op} ${c.in('b')})` } },
  andor: { cat: 'val', label: 'And / or', ins: [['a', 'bool', '', true]], fields: [['op', '', 'sel', 'and', [['and', 'and'], ['or', 'or']]]], ins2: [['b', 'bool', '', true]], outs: [['v', 'bool']],
    out: { v: c => `(${c.in('a')} ${c.f.op} ${c.in('b')})` } },
  not: { cat: 'val', label: 'Not', ins: [['a', 'bool', '', true]], outs: [['v', 'bool']], out: { v: c => `(not ${c.in('a')})` } },
  held: { cat: 'val', label: 'Key held', fields: [['key', '', 'key', 'ui_right']], outs: [['v', 'bool']], out: { v: c => keyHeld(c.f.key) } },
  has: { cat: 'val', label: 'Has an item', ins: [['id', 'text', 'item', 'key']], outs: [['v', 'bool']], out: { v: c => `(_hud() != null and _hud().has_item(${c.in('id')}))` }, use: ['_hud'] },
  join: { cat: 'val', label: 'Join text', ins: [['a', 'text', '', 'Score: '], ['b', 'text', '', '']], outs: [['v', 'text']], out: { v: c => `(${c.in('a')} + ${c.in('b')})` } },
  level: { cat: 'val', label: 'Level is', fields: [['name', 'Level', 'text', '']], outs: [['v', 'bool']], out: { v: c => `_level_is(${JSON.stringify(c.f.name)})` }, use: ['_level_is'] },
};
export const CATS = [['event', 'Events', 'Start a chain'], ['flow', 'Flow', 'Steer a chain'], ['act', 'Actions', 'Do something'], ['val', 'Values', 'Feed a value in']];

// every port of a node type, in display order: { id, type, label, dir: 'in'|'out', def }
export function portsOf(type) {
  const N = NODES[type], P = [];
  if (N.cat === 'flow' || N.cat === 'act') P.push({ id: 'in', type: 'exec', dir: 'in' });
  for (const [id, t, label, def] of [...(N.ins || []), ...(N.ins2 || [])]) P.push({ id, type: t, label, def, dir: 'in' });
  for (const [id, t, label] of N.outs || (N.cat === 'act' ? [['then', 'exec']] : [])) P.push({ id, type: t, label, dir: 'out' });
  return P;
}
// can an output of type a feed an input of type b? (numbers and yes/no become text by themselves)
export const fits = (a, b) => a === 'exec' || b === 'exec' ? a === b : a === b || a === 'any' || b === 'any' || (b === 'text' && (a === 'num' || a === 'bool'));

// helpers a graph's script gets when its nodes use them: short, commented, one job each
export const HELPERS = {
  _player: `func _player() -> Node2D:   # the player (an actor whose Workshop role is Player), or null
\treturn get_tree().get_first_node_in_group("player")`,
  _hud: `func _hud() -> Node:   # the Kiln HUD, or null
\treturn get_tree().get_first_node_in_group("kiln_hud")`,
  _say: `func _say(who: String, line: String) -> void:   # the HUD dialogue box, or the output if there is no HUD
\tif _hud():
\t\t_hud().say(who, line)
\telse:
\t\tprint(who + ": " + line if who != "" else line)`,
  _connect_zones: `func _connect_zones(zone_name: String, handler: Callable) -> void:   # Levels zones with this name
\tfor z in get_tree().current_scene.find_children("*", "Area2D", true, false):
\t\tif z.has_signal("triggered"):
\t\t\tz.triggered.connect(func(n: String, body: Node) -> void:
\t\t\t\tif n == zone_name:
\t\t\t\t\thandler.call(body)
\t\t\t)`,
  _every: `func _every(seconds: float, handler: Callable) -> void:   # a repeating timer
\tvar t := Timer.new()
\tt.wait_time = seconds
\tt.autostart = true
\tt.timeout.connect(handler)
\tadd_child(t)`,
  _connect_actors: `func _connect_actors(which: String, sig: String, handler: Callable) -> void:   # player / enemy / anyone / by name
\tfor a in get_tree().get_nodes_in_group("kiln_actors"):
\t\tvar is_player: bool = a.is_in_group("player")
\t\tvar ok := which == "anyone" or (which == "player" and is_player) or (which == "enemy" and not is_player) or a.name.begins_with(which)
\t\tif ok and a.has_signal(sig):
\t\t\ta.connect(sig, handler.bind(a))`,
  _zone_spot: `func _zone_spot(zone_name: String) -> Vector2:   # the bottom middle of a Levels zone (where feet go)
\tfor z in get_tree().current_scene.find_children("*", "Area2D", true, false):
\t\tif z.get("event_name") == zone_name or z.name == zone_name:
\t\t\treturn z.global_position + (Vector2(0, z._size().y / 2) if z.has_method("_size") else Vector2.ZERO)
\treturn Vector2.ZERO`,
  _spawn: `func _spawn(path: String, at: Vector2) -> Node:   # a copy of a saved scene, put into the level
\tvar n: Node2D = load(path).instantiate()
\tn.position = at
\tvar p := _player()
\t(p.get_parent() if p else get_tree().current_scene).add_child(n)
\treturn n`,
  _sound: `func _sound(path: String) -> void:   # play a sound once
\tvar s := AudioStreamPlayer.new()
\ts.stream = load(path)
\ts.finished.connect(s.queue_free)
\tadd_child(s)
\ts.play()`,
  _level_is: `func _level_is(level_name: String) -> bool:   # the level's scene is called this
\tvar tiles := get_tree().get_first_node_in_group("kiln_tiles")
\treturn tiles != null and tiles.get_parent().name == level_name`,
};

// starting points for a new graph: { name: [label, graph] }
const G = (nodes, wires, vars = []) => ({ nodes, wires, vars });
export const TEMPLATES = {
  empty: ['Empty (when the level starts)', G([{ id: 'n1', type: 'start', x: 40, y: 60, f: {} }], [])],
  hello: ['Hello: a line after a second', G([{ id: 'n1', type: 'start', x: 40, y: 60, f: {} }, { id: 'n2', type: 'wait', x: 300, y: 60, f: { secs: 1 } }, { id: 'n3', type: 'say', x: 540, y: 60, f: { who: '', line: 'Watch your step down here.' } }],
    [{ from: ['n1', 'then'], to: ['n2', 'in'] }, { from: ['n2', 'then'], to: ['n3', 'in'] }])],
  score: ['Score: zones add points to a HUD counter', G([
    { id: 'n1', type: 'zone', x: 40, y: 60, f: { zone: 'coin' } }, { id: 'n2', type: 'add', x: 330, y: 60, f: { var: 'score', v: 10 } },
    { id: 'n3', type: 'counter', x: 590, y: 60, f: { widget: 'score' } }, { id: 'n4', type: 'get', x: 330, y: 220, f: { var: 'score' } }],
    [{ from: ['n1', 'then'], to: ['n2', 'in'] }, { from: ['n2', 'then'], to: ['n3', 'in'] }, { from: ['n4', 'v'], to: ['n3', 'v'] }], [{ name: 'score', type: 'int', value: '0' }])],
  waves: ['Waves: now and then an enemy appears', G([
    { id: 'n1', type: 'timer', x: 40, y: 60, f: { secs: 5 } }, { id: 'n2', type: 'chance', x: 300, y: 60, f: { pct: 50 } },
    { id: 'n3', type: 'spawn', x: 560, y: 40, f: { actor: '', dx: 120, dy: -40 } }, { id: 'n4', type: 'print', x: 560, y: 250, f: { t: 'A wave!' } }],
    [{ from: ['n1', 'then'], to: ['n2', 'in'] }, { from: ['n2', 'yes'], to: ['n3', 'in'] }, { from: ['n3', 'then'], to: ['n4', 'in'] }])],
  door: ['Locked door: needs the key item', G([
    { id: 'n1', type: 'zone', x: 40, y: 60, f: { zone: 'door' } }, { id: 'n2', type: 'if', x: 330, y: 60, f: {} }, { id: 'n3', type: 'has', x: 60, y: 260, f: { id: 'key' } },
    { id: 'n4', type: 'send', x: 590, y: 30, f: { name: 'open_door' } }, { id: 'n5', type: 'say', x: 590, y: 170, f: { who: '', line: 'It is locked.' } }],
    [{ from: ['n1', 'then'], to: ['n2', 'in'] }, { from: ['n3', 'v'], to: ['n2', 'cond'] }, { from: ['n2', 'yes'], to: ['n4', 'in'] }, { from: ['n2', 'no'], to: ['n5', 'in'] }])],
};
