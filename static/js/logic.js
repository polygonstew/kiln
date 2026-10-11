// Logic: the game's logic in one place. Graphs (logic_graph.js: events wired to actions, turned into GDScript) and
// every .gd in the asset folder (Kiln's shared scripts, actor brains, HUD scripts, your own in scripts/), with an
// editor that checks with the real Godot and a reference of what Kiln's scripts offer (click to insert).
import { h, api, toast, pref, rawURL, select } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { gdEditor } from './gdedit.js';
import { BRAIN_GD, BRAINS } from './brains.js';
import { graphArea } from './logic_graph.js';

let V = {}, cur = null, saved = '', list = [], G = null, mode = pref.get('logic.mode', 'code');

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
    V.ed = gdEditor({ onChange: t => { dirty(t !== saved); clearTimeout(V.olT); V.olT = setTimeout(() => outline(t), 400); }, onSave: save });
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.path = h('span', { class: 'mono', style: { fontSize: '12px' } }, 'No script open');
    V.state = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
    V.note = h('div', { class: 'note lg-note' });
    G = graphArea({ setMode, openScript: p => refresh().then(() => open(p)) });
    V.codePane = h('div', { class: 'lg-pane' },
      h('div', { class: 'bar' }, V.path, V.state, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Ask Godot whether this script is valid (also runs on save)', onclick: check }, 'Check'),
        h('button', { class: 'btn sm ghost', title: 'Throw away unsaved changes', onclick: () => { if (cur) { V.ed.set(saved); dirty(false); } } }, 'Revert'),
        V.rm = h('button', { class: 'btn sm ghost danger', onclick: removeScript }, 'Delete'),
        h('button', { class: 'btn sm go', title: 'Save (Ctrl+S); Godot checks it straight after', onclick: save }, 'Save')),
      V.note, h('div', { style: { flex: 1, minHeight: 0 } }, V.ed.el),
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Tab / Shift+Tab indent · Enter keeps the indent · Ctrl+/ comments lines · Ctrl+S saves · Ctrl+F finds')));
    el.append(V.left, h('section', { class: 'stage', style: { display: 'flex', flexDirection: 'column' } }, V.codePane, G.center), V.right);
    drawRight(); drawRemove(); refresh(); G.refresh().then(() => { if (mode === 'graph' && pref.get('logic.graph', '')) G.open(pref.get('logic.graph', '')); else setMode('code'); });
    window.addEventListener('beforeunload', e => { if (V.dirty) e.preventDefault(); });
  },
  show() { refresh(); G?.refresh(); },
  // Save all / the demo game: open a saved graph and write its script
  async saveProject(id) { await G.saveGraph(id.replace(/^graph-/, '')); },
};

// graphs or scripts in the middle (and their panel on the right)
function setMode(m) {
  mode = m; pref.set('logic.mode', m);
  V.codePane.style.display = m === 'code' ? 'flex' : 'none'; G.center.style.display = m === 'graph' ? 'flex' : 'none';
  V.right.replaceChildren(m === 'graph' ? G.side : V.codeSide); drawLeft();
}

async function refresh() {
  const r = await api('/api/scripts?root=' + encodeURIComponent(FS.root)).catch(() => ({ scripts: [] }));
  list = r.scripts || []; V.godot = r.godot;
  drawLeft();
  if (!cur && list.length) open(pref.get('logic.cur', '') && list.includes(pref.get('logic.cur', '')) ? pref.get('logic.cur', '') : list[0]);
}
function drawLeft() {
  const groups = {};
  for (const p of list) { const g = /^(sprites\/)?_kiln\/brains\//.test(p) ? 'Brains (yours to change)' : /^(sprites\/)?_kiln\//.test(p) || /^(menus\/kiln_|dialogue\/kiln_)/.test(p) ? 'Kiln\'s scripts' : p.startsWith('scripts/') ? 'Your scripts' : p.startsWith('logic/') ? 'Written by graphs' : p.split('/')[0]; (groups[g] ||= []).push(p); }
  V.left.replaceChildren(G.listSec, h('div', { class: 'sec' }, h('h3', {}, 'Scripts', h('span', { class: 'grow' }), h('small', {}, list.length + ' .gd')),
    list.length ? '' : h('p', { class: 'note' }, 'No scripts yet. Kiln writes them when you save an actor, level or HUD; or start your own below.'),
    ...Object.entries(groups).map(([g, ps]) => h('div', { class: 'lg-group' }, h('div', { class: 'lg-gh' }, g),
      ...ps.map(p => h('button', { class: 'lg-file' + (p === cur && mode === 'code' ? ' on' : ''), title: p, onclick: () => open(p) }, p.split('/').pop().replace(/\.gd$/, ''), h('small', {}, p.split('/').slice(0, -1).join('/')))))),
    h('div', { style: { marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      V.newSel = Object.assign(select(Object.entries(NEW).map(([k, [l]]) => [k, l]), 'empty', () => {}), { title: 'What the new script starts as' }),
      h('button', { class: 'btn sm', title: 'A new script in scripts/', onclick: newScript }, 'New script'))), V.trash ||= h('div', { class: 'sec' }));
  drawTrash();
}
function drawRight() {
  V.codeSide = h('div', {}, h('div', { class: 'sec' }, h('h3', {}, 'Problems'), V.probs = h('div', { class: 'lg-probs' }, h('p', { class: 'note' }, 'Godot checks the script when you save or press Check.'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Outline', h('small', {}, 'click to jump')), V.outline = h('div', { class: 'lg-outline' })),
    h('div', { class: 'sec' }, h('h3', {}, 'Kiln reference', h('small', {}, 'click to insert')),
      ...REF.map(([g, rows]) => h('details', { class: 'lg-ref' }, h('summary', {}, g),
        ...rows.map(([code, what]) => h('button', { class: 'lg-r', title: 'Insert at the cursor', onclick: () => V.ed.insert(code) }, h('code', {}, code), h('span', {}, what)))))));
  V.right.replaceChildren(mode === 'graph' ? G.side : V.codeSide);
}
// the script's functions, signals and exported settings, to jump to
function outline(text) {
  const rows = [];
  text.split('\n').forEach((l, i) => { const m = l.match(/^(func|signal|@export var|var|const)\s+(\w+)/); if (m && (m[1] !== 'var' || i < 60)) rows.push([i + 1, m[1].replace('@export var', 'setting'), m[2]]); });
  V.outline.replaceChildren(...(rows.length ? rows.filter(r => r[1] !== 'var').map(([ln, k, n]) => h('button', { class: 'lg-r', title: 'Line ' + ln, onclick: () => V.ed.goLine(ln) }, h('code', {}, n), h('span', {}, k)))
    : [h('p', { class: 'note' }, 'No functions yet.')]));
}
function dirty(d) { V.dirty = d; V.state.textContent = d ? '● unsaved' : ''; }
async function open(p) {
  if (V.dirty && !confirm('Leave this script without saving?')) return;
  const t = await fetch(rawURL(FS.root + '/' + p)).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status))).catch(e => { toast('Could not open ' + p + ': ' + e.message, 'bad'); return null; });
  if (t == null) return;
  cur = p; saved = t; pref.set('logic.cur', p);
  V.ed.set(t); dirty(false); V.path.textContent = p;
  const graph = p.match(/^logic\/(\w+)\.gd$/)?.[1];
  V.note.replaceChildren(graph ? h('span', {}, `Written by the graph "${graph}" on every Save, so change the graph instead (or use its "Make it my script"). `, h('button', { class: 'btn sm', onclick: () => G.open(graph) }, 'Open the graph'))
    : /^(sprites\/)?_kiln\//.test(p) && !p.includes('/brains/') ? 'Kiln writes this file again whenever it saves an actor or level, so changes here do not last. Brains (and your scripts/) are never overwritten.' : '');
  V.note.style.display = V.note.textContent ? '' : 'none';
  outline(t); setMode('code'); drawRemove();
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
// what removing a script means: yours → to .trash (Restore brings it back); a brain → back to Kiln's own (your copy to
// .trash); a graph's script → delete the graph; Kiln's own scripts can't be removed (it writes them again on save)
const KILN_OWN = /^((sprites\/)?_kiln\/(?!brains\/).*\.gd|hud\/.*\/hud\.gd|dialogue\/kiln_dialogue\.gd|menus\/kiln_\w+\.gd)$/;   // either layout (layout.js, old)
const kindOf = p => p.match(/^logic\/\w+\.gd$/) ? 'graph' : BRAINS[p.match(/^(?:sprites\/)?_kiln\/brains\/(\w+)\.gd$/)?.[1]] ? 'brain' : KILN_OWN.test(p) ? 'kiln' : 'yours';
function drawRemove() {
  const k = cur ? kindOf(cur) : 'kiln';
  V.rm.textContent = k === 'brain' ? 'Reset' : 'Delete'; V.rm.disabled = !cur || k === 'kiln';
  V.rm.title = { yours: 'Delete this script (it goes to the .trash folder: "Removed scripts" can bring it back)', brain: 'Put back Kiln\'s original brain (your edited copy goes to .trash)',
    graph: 'Written by a graph: delete the graph instead', kiln: 'Kiln writes this file again when it saves, so it can\'t be deleted here' }[k];
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
// into <asset folder>/.trash, with its old place in the name so Restore can put it back
async function trash(p) {
  await api('/api/fs', { op: 'mkdir', path: FS.root + '/.trash' });
  await api('/api/fs', { op: 'rename', path: `${FS.root}/${p}`, to: `${FS.root}/.trash/${stamp()}-${p.replaceAll('/', '__')}` });
}
async function removeScript() {
  if (!cur) return;
  const k = kindOf(cur), p = cur;
  if (k === 'graph') return G.remove(p.match(/^logic\/(\w+)\.gd$/)[1]);
  if (k === 'brain') {
    const id = p.match(/brains\/(\w+)\.gd$/)[1];
    if (!confirm(`Put back Kiln's original ${BRAINS[id].label} brain? Your edited copy goes to the .trash folder ("Removed scripts" can bring it back).`)) return;
    await trash(p); await saveFiles(p.slice(0, p.lastIndexOf('/')), [{ name: id + '.gd', text: BRAIN_GD[id] }]);
    toast('Brain reset to Kiln\'s original', 'ok'); V.dirty = false; cur = null; await refresh(); return open(p);
  }
  if (!confirm(`Delete ${p}? It goes to the .trash folder; "Removed scripts" (left) can bring it back.`)) return;
  await trash(p).catch(e => toast('Could not delete: ' + e.message, 'bad'));
  toast(`Deleted ${p}`); V.dirty = false; cur = null; pref.set('logic.cur', ''); await refresh();
}
// scripts moved to .trash by Logic (old place kept in the name) or by Files (those go back to scripts/)
async function drawTrash() {
  const items = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/.trash')).catch(() => ({ items: [] }))).items || []).filter(i => /\.gd$/.test(i.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 12);
  V.trash.replaceChildren(...(items.length ? [h('h3', {}, 'Removed scripts', h('span', { class: 'grow' }), h('small', {}, items.length)),
    ...items.map(i => {
      const m = i.name.match(/^(\d{8})-(\d{6})-(.+)$/), to = m ? (m[3].includes('__') ? m[3].replaceAll('__', '/') : 'scripts/' + m[3]) : 'scripts/' + i.name;
      return h('div', { class: 'lg-trash' }, h('span', { title: `${to}, removed ${m ? m[1].slice(6) + '/' + m[1].slice(4, 6) + ' ' + m[2].slice(0, 2) + ':' + m[2].slice(2, 4) : ''}` }, to.split('/').pop(), h('small', {}, ' ' + to.split('/').slice(0, -1).join('/'))),
        h('button', { class: 'btn sm ghost', title: 'Put it back at ' + to, onclick: async () => {
          if (list.includes(to) && !confirm(`${to} exists. Keep the current one in .trash and put this one back?`)) return;
          if (list.includes(to)) await trash(to);
          await api('/api/fs', { op: 'mkdir', path: `${FS.root}/${to.split('/').slice(0, -1).join('/')}` });
          await api('/api/fs', { op: 'rename', path: i.path, to: `${FS.root}/${to}` }).then(() => toast('Restored ' + to, 'ok'), e => toast('Could not restore: ' + e.message, 'bad'));
          cur = null; await refresh(); open(to);
        } }, 'Restore'));
    })] : []));
}
async function newScript() {
  const raw = prompt('Name for the script (saved in scripts/)', 'my_script'); if (!raw) return;
  const name = raw.toLowerCase().replace(/\.gd$/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'script';
  if (list.includes(`scripts/${name}.gd`)) return toast(`scripts/${name}.gd already exists`, 'bad');
  await saveFiles('scripts', [{ name: name + '.gd', text: NEW[V.newSel.value || 'empty'][1] }]);
  await refresh(); open(`scripts/${name}.gd`);
}
