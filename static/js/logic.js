// Logic: the game's GDScript in one place. Every .gd in the asset folder (Kiln's shared scripts, actor
// brains, HUD scripts, your own in scripts/), an editor that checks with the real Godot, and a reference of
// what Kiln's scripts offer (click to insert). Kiln makes the default decisions; this is where you overrule them.
import { h, api, toast, pref, rawURL, select } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { gdEditor } from './gdedit.js';
import { BRAIN_GD, BRAINS } from './brains.js';

let V = {}, cur = null, saved = '', list = [];

// what Kiln's scripts give you, for the reference panel: [call to insert, what it does]
const REF = [
  ['Any Kiln actor (juice.gd)', [
    ['hurt(from_position, damage)', 'Take a hit: health down, flash, knockback, blink; dies at 0'], ['heal(1)', 'Give health back (the player\'s HUD follows)'],
    ['die()', 'Play "death", then enemies vanish / the player\'s level restarts'], ['shoot(Vector2.RIGHT)', 'Fire its projectile'],
    ['hit_flash()', 'Flash white'], ['squash()', 'Squash and stretch'], ['shake()', 'Shake the camera'],
    ['health', 'Current health (max_health from the Workshop)'], ['invulnerable', 'True while blinking after a hit'],
    ['died.connect(func(): pass)', 'Signal: out of health'], ['hurt_started.connect(func(from): pass)', 'Signal: took a hit']]],
  ['Level tiles (level_tiles.gd)', [
    ['var tiles = get_tree().get_first_node_in_group("kiln_tiles")', 'The level\'s TileMapLayer'],
    ['tiles.kind_at(global_position)', '"solid", "oneway", "ladder", "hazard", "water", "slope_r/l" or ""'],
    ['tiles.touches(rect, "hazard")', 'Does a rectangle touch a kind of tile?']]],
  ['HUD (hud.gd)', [
    ['var hud = get_tree().get_first_node_in_group("kiln_hud")', 'The Kiln HUD in the scene'],
    ['hud.set_health(0.5)', 'Health bar + status face'], ['hud.set_value("stamina", 0.8)', 'Any bar, gauge or pips (0..1)'],
    ['hud.set_number("score", 120)', 'A counter'], ['hud.say("Name", "Hello")', 'Dialogue box'], ['hud.show_face("grin", 1.5)', 'Flash a status face'],
    ['hud.add_item("key", icon)', 'Inventory'], ['hud.prompt("E", "Open")', 'Button prompt']]],
  ['Zones (zone.gd)', [['$Zones/door_1.triggered.connect(func(name, body): pass)', 'Any zone: fires when the player walks in']]],
  ['Groups', [['get_tree().get_first_node_in_group("player")', 'The player (Workshop role Player)'], ['get_tree().get_nodes_in_group("kiln_actors")', 'Every Kiln actor']]],
];
const NEW = { empty: ['Empty Node script', 'extends Node\n## What this script does, in one line.\n\nfunc _ready() -> void:\n\tpass\n\nfunc _process(delta: float) -> void:\n\tpass\n'],
  ...Object.fromEntries(Object.entries(BRAINS).map(([k, b]) => ['brain_' + k, ['Copy of the ' + b.label + ' brain', BRAIN_GD[k]]])) };

export const logic = {
  id: 'logic', title: 'Logic', key: '9',
  mount(el) {
    el.className = 'view ws';
    V.ed = gdEditor({ onChange: t => dirty(t !== saved), onSave: save });
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.path = h('span', { class: 'mono', style: { fontSize: '12px' } }, 'No script open');
    V.state = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
    V.note = h('div', { class: 'note lg-note' });
    el.append(V.left, h('section', { class: 'stage', style: { display: 'flex', flexDirection: 'column' } },
      h('div', { class: 'bar' }, V.path, V.state, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Ask Godot whether this script is valid (also runs on save)', onclick: check }, 'Check'),
        h('button', { class: 'btn sm ghost', title: 'Throw away unsaved changes', onclick: () => { if (cur) { V.ed.set(saved); dirty(false); } } }, 'Revert'),
        h('button', { class: 'btn sm go', title: 'Save (Ctrl+S); Godot checks it straight after', onclick: save }, 'Save')),
      V.note, h('div', { style: { flex: 1, minHeight: 0 } }, V.ed.el),
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Tab / Shift+Tab indent · Enter keeps the indent · Ctrl+/ comments lines · Ctrl+S saves · Ctrl+F finds'))), V.right);
    drawRight(); refresh();
    window.addEventListener('beforeunload', e => { if (V.dirty) e.preventDefault(); });
  },
  show() { refresh(); },
};

async function refresh() {
  const r = await api('/api/scripts?root=' + encodeURIComponent(FS.root)).catch(() => ({ scripts: [] }));
  list = r.scripts || []; V.godot = r.godot;
  drawLeft();
  if (!cur && list.length) open(pref.get('logic.cur', '') && list.includes(pref.get('logic.cur', '')) ? pref.get('logic.cur', '') : list[0]);
}
function drawLeft() {
  const groups = {};
  for (const p of list) { const g = p.startsWith('sprites/_kiln/brains/') ? 'Brains (yours to change)' : p.startsWith('sprites/_kiln/') ? 'Kiln\'s scripts' : p.startsWith('scripts/') ? 'Your scripts' : p.split('/')[0]; (groups[g] ||= []).push(p); }
  V.left.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Scripts', h('span', { class: 'grow' }), h('small', {}, list.length + ' .gd')),
    list.length ? '' : h('p', { class: 'note' }, 'No scripts yet. Kiln writes them when you save an actor, level or HUD; or start your own below.'),
    ...Object.entries(groups).map(([g, ps]) => h('div', { class: 'lg-group' }, h('div', { class: 'lg-gh' }, g),
      ...ps.map(p => h('button', { class: 'lg-file' + (p === cur ? ' on' : ''), title: p, onclick: () => open(p) }, p.split('/').pop().replace(/\.gd$/, ''), h('small', {}, p.split('/').slice(0, -1).join('/')))))),
    h('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      V.newSel = select(Object.entries(NEW).map(([k, [l]]) => [k, l]), 'empty', () => {}),
      h('button', { class: 'btn sm', title: 'A new script in scripts/', onclick: newScript }, 'New script'))));
}
function drawRight() {
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Problems'), V.probs = h('div', { class: 'lg-probs' }, h('p', { class: 'note' }, 'Godot checks the script when you save or press Check.'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Kiln reference', h('small', {}, 'click to insert')),
      ...REF.map(([g, rows]) => h('details', { class: 'lg-ref' }, h('summary', {}, g),
        ...rows.map(([code, what]) => h('button', { class: 'lg-r', title: 'Insert at the cursor', onclick: () => V.ed.insert(code) }, h('code', {}, code), h('span', {}, what)))))));
}
function dirty(d) { V.dirty = d; V.state.textContent = d ? '● unsaved' : ''; }
async function open(p) {
  if (V.dirty && !confirm('Leave this script without saving?')) return;
  const t = await fetch(rawURL(FS.root + '/' + p)).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status))).catch(e => { toast('Could not open ' + p + ': ' + e.message, 'bad'); return null; });
  if (t == null) return;
  cur = p; saved = t; pref.set('logic.cur', p);
  V.ed.set(t); dirty(false); V.path.textContent = p;
  V.note.textContent = p.startsWith('sprites/_kiln/') && !p.includes('/brains/') ? 'Kiln writes this file again whenever it saves an actor or level, so changes here do not last. Brains (and your scripts/) are never overwritten.' : '';
  V.note.style.display = V.note.textContent ? '' : 'none';
  V.probs && V.probs.replaceChildren(h('p', { class: 'note' }, 'Not checked yet.'));
  drawLeft();
}
async function save() {
  if (!cur) return;
  const dir = cur.split('/').slice(0, -1).join('/'), name = cur.split('/').pop(), text = V.ed.get();
  try { await saveFiles(dir || '.', [{ name, text }]); saved = text; dirty(false); toast('Saved ' + cur, 'ok'); } catch (e) { return toast('Save failed: ' + e.message, 'bad'); }
  check();
}
async function check() {
  if (!cur) return;
  V.probs.replaceChildren(h('p', { class: 'note' }, 'Asking Godot…'));
  const r = await api('/api/godot/check', { root: FS.root, path: cur, text: V.ed.get() }).catch(e => ({ ok: null, errors: [{ line: 0, msg: e.message }] }));
  V.ed.mark(r.errors);
  if (r.godot === false) return V.probs.replaceChildren(h('p', { class: 'note' }, 'Godot is not installed on this machine, so scripts cannot be checked here.'));
  V.probs.replaceChildren(r.ok ? h('p', { class: 'lg-ok' }, '✓ Godot finds no problems') : h('div', {},
    ...r.errors.map(e => h('button', { class: 'lg-err', onclick: () => e.line && V.ed.goLine(e.line) }, h('b', {}, e.line ? 'Line ' + e.line : 'Godot'), h('span', {}, e.msg)))));
}
async function newScript() {
  const raw = prompt('Name for the script (saved in scripts/)', 'my_script'); if (!raw) return;
  const name = raw.toLowerCase().replace(/\.gd$/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'script';
  if (list.includes(`scripts/${name}.gd`)) return toast(`scripts/${name}.gd already exists`, 'bad');
  await saveFiles('scripts', [{ name: name + '.gd', text: NEW[V.newSel.value || 'empty'][1] }]);
  await refresh(); open(`scripts/${name}.gd`);
}
