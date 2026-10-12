// Menus: the game's title menu, options (volumes, fullscreen, on/off options, the controls) and pause menu.
// Edit the screens here with a live preview; saved as menus/<screen>.tscn (+ _kiln/ui/menu.gd and settings.gd),
// and ▶ Play uses them (title first, Esc pauses, options from either).
import { writeRuntime } from './layout.js';
import { h, api, toast, pref, field, select, range, check, rawURL } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { registerKeys } from './wheel.js';
import { MENU_GD, SETTINGS_GD, menuScene } from './menus_godot.js';

const ACTIONS = [['start', 'Start the game'], ['open:options', 'Open options'], ['back', 'Back'], ['resume', 'Resume'], ['title', 'Quit to title'], ['quit', 'Quit the game'],
  ['volume', 'Volume slider'], ['fullscreen', 'Fullscreen on/off'], ['toggle', 'On/off option'], ['controls', 'Show the controls']];
export const DEFAULTS = () => ({
  title: { id: 'title', on: true, title: 'My Game', items: [{ label: 'Play', action: 'start' }, { label: 'Options', action: 'open:options' }, { label: 'Quit', action: 'quit' }] },
  options: { id: 'options', on: true, title: 'Options', dim: .9, items: [{ label: 'Master', action: 'volume', bus: 'Master' }, { label: 'Music', action: 'volume', bus: 'Music' }, { label: 'Sound', action: 'volume', bus: 'SFX' },
    { label: 'Fullscreen', action: 'fullscreen' }, { label: 'Screen shake', action: 'toggle', key: 'screen_shake' }, { label: 'Controls', action: 'controls' }, { label: 'Back', action: 'back' }] },
  pause: { id: 'pause', on: true, title: 'Paused', dim: .7, items: [{ label: 'Resume', action: 'resume' }, { label: 'Options', action: 'open:options' }, { label: 'Quit to title', action: 'title' }] },
});
let M = null, cur = 'title', V = {}, saveT, scenes = [];

export const menus = {
  id: 'menus', title: 'Menus', key: '0',
  async mount(el) {
    el.className = 'view ws';
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.pv = h('div', { class: 'mn-pv' });
    el.append(V.left, h('section', { class: 'stage' }, h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'Preview at game size (480×270)'), h('span', { class: 'grow' }),
      h('span', { class: 'note', style: { margin: 0 } }, 'Arrow keys and Enter work in the game; the mouse too')), h('div', { class: 'viewport', style: { background: '#0c0c0b' } }, V.pv)), V.right);
    const r = await fetch('/api/project?id=menus-game').then(r => r.ok ? r.json() : null).catch(() => null);
    M = r?.menus || DEFAULTS();
    const b = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/backgrounds')).catch(() => ({ items: [] }));
    scenes = (b.items || []).filter(i => i.dir).map(i => i.name);
    draw();
  },
  show() { if (M) draw(); },
  // Save all / the demo game: the saved menus, written for Godot
  async saveProject(id) { const d = await fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.json()); M = d.menus; draw(); await exportMenus(); },
};
function changed() { clearTimeout(saveT); saveT = setTimeout(() => api('/api/project', { id: 'menus-game', data: { meta: { kind: 'menus', name: 'game' }, menus: M } }).catch(() => {}), 800); drawPreview(); }
function draw() { drawLeft(); drawRight(); drawPreview(); }

function drawLeft() {
  const m = M[cur];
  const items = h('div', { class: 'mn-items' }, ...m.items.map((it, i) => h('div', { class: 'mn-item' },
    h('input', { type: 'text', value: it.label, title: 'What the button says', oninput: e => { it.label = e.target.value; changed(); } }),
    Object.assign(select(ACTIONS, it.action, v => { it.action = v; if (v === 'volume') it.bus ||= 'Master'; if (v === 'toggle') it.key ||= it.label.toLowerCase().replace(/\W+/g, '_'); changed(); drawLeft(); }), { title: 'What pressing it does' }),
    it.action === 'volume' ? select([['Master', 'all sound'], ['Music', 'music'], ['SFX', 'effects']], it.bus, v => { it.bus = v; changed(); }) : '',
    it.action === 'toggle' ? h('input', { type: 'text', value: it.key, title: 'Name your code reads: KilnSettings.flag("…")', style: { width: '90px' }, onchange: e => { it.key = e.target.value.replace(/\W+/g, '_'); changed(); } }) : '',
    h('button', { class: 'ibtn', title: 'Up', onclick: () => { if (i) { [m.items[i - 1], m.items[i]] = [m.items[i], m.items[i - 1]]; changed(); drawLeft(); } } }, '↑'),
    h('button', { class: 'ibtn', title: 'Remove', onclick: () => { m.items.splice(i, 1); changed(); drawLeft(); } }, '✕'))));
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Screens'),
      h('div', { class: 'seg' }, ...Object.values(M).map(s => h('button', { class: s.id === cur ? 'on' : '', title: { title: 'The first screen: start, options, quit', options: 'Volumes, fullscreen and your own switches', pause: 'What Esc shows while playing' }[s.id] || 'Edit this screen', onclick: () => { cur = s.id; draw(); } }, s.id[0].toUpperCase() + s.id.slice(1) + (s.on ? '' : ' (off)')))),
      field('Use it', check(cur === 'title' ? 'show before the game' : cur === 'pause' ? 'Esc pauses the game' : 'reachable from the menus', m.on, v => { m.on = v; changed(); drawLeft(); }))),
    h('div', { class: 'sec' }, h('h3', {}, 'This screen'),
      field('Title', h('input', { type: 'text', value: m.title || '', oninput: e => { m.title = e.target.value; changed(); } })),
      field('Behind it', select([['', cur === 'pause' ? 'The game (dimmed)' : 'Plain colour'], ...scenes.map(n => [n, 'Scene: ' + n])], m.background || '', v => { m.background = v; changed(); })),
      field('Dim', range(m.dim ?? .55, 0, 1, .05, v => { m.dim = +v; changed(); }, v => Math.round(v * 100) + '%')),
      field('Text size', range(m.fontSize || 16, 8, 32, 1, v => { m.fontSize = +v; changed(); }, v => v + ' px')),
      field('Colours', h('span', { style: { display: 'flex', gap: '6px' } }, h('input', { type: 'color', value: m.accent || '#ff5b2e', title: 'Title and the chosen item', oninput: e => { m.accent = e.target.value; changed(); } }),
        h('input', { type: 'color', value: m.text || '#ebe3d0', title: 'Text', oninput: e => { m.text = e.target.value; changed(); } }))),
      field('Layout', check('left-aligned', !!m.left, v => { m.left = v; changed(); }))),
    h('div', { class: 'sec' }, h('h3', {}, 'Items', h('span', { class: 'grow' }), h('button', { class: 'btn sm', title: 'Add a button, slider or option to this screen', onclick: () => { m.items.push({ label: 'New item', action: 'start' }); changed(); drawLeft(); } }, '+ Item')), items,
      h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, title: 'Put this screen back the way Kiln first made it', onclick: () => { if (confirm(`Put "${cur}" back to Kiln's default?`)) { M[cur] = DEFAULTS()[cur]; changed(); draw(); } } }, 'Reset this screen')));
}

// the preview: the same layout the Godot script builds, in HTML at 480×270, scaled up crisply
async function drawPreview() {
  const m = M[cur], s = m.fontSize || 16;
  const bg = m.background ? await sceneThumb(m.background) : null;
  const rows = m.items.map(it => it.action === 'volume' ? h('div', { class: 'mn-r' }, it.label, h('span', { class: 'mn-slider' }, h('i', { style: { width: '80%' } })))
    : it.action === 'fullscreen' || it.action === 'toggle' ? h('div', { class: 'mn-r' }, it.label, h('span', { class: 'mn-check' }))
      : it.action === 'controls' ? h('div', { class: 'mn-r mn-small' }, 'Left: ←  Right: →  Accept: Enter, Space  Attack: X  Shoot: C')
        : h('div', { class: 'mn-r mn-btn' }, it.label));
  if (rows[0]) rows[0].classList.add('focus');
  const screen = h('div', { class: 'mn-screen', style: { '--a': m.accent || '#ff5b2e', '--t': m.text || '#ebe3d0', '--s': s + 'px', background: bg ? `url(${bg}) center bottom / cover` : cur === 'pause' ? '#3a3d48' : '#111' } },
    h('div', { class: 'mn-dim', style: { opacity: m.dim ?? .55 } }),
    h('div', { class: 'mn-box' + (m.left ? ' left' : '') }, m.title ? h('div', { class: 'mn-title' }, m.title) : '', ...rows));
  const k = Math.max(1, Math.floor(Math.min((V.pv.parentElement.clientWidth - 30) / 480, (V.pv.parentElement.clientHeight - 30) / 270)));
  screen.style.transform = `scale(${k})`; V.pv.style.width = 480 * k + 'px'; V.pv.style.height = 270 * k + 'px';
  V.pv.replaceChildren(screen);
}
const thumbs = {};
async function sceneThumb(name) {     // the scene's layers flattened, for the preview background
  if (thumbs[name]) return thumbs[name];
  const sj = await fetch(rawURL(`${FS.root}/backgrounds/${name}/scene.json`)).then(r => r.json()).catch(() => null); if (!sj) return null;
  const cv = document.createElement('canvas'); cv.width = sj.view?.w || 480; cv.height = sj.view?.h || 270; const x = cv.getContext('2d');
  for (const l of sj.layers || []) { if (!l.file) continue; const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = rawURL(`${FS.root}/backgrounds/${name}/${l.file}`); }); if (im) x.drawImage(im, 0, cv.height - im.height + (l.y || 0)); }
  return (thumbs[name] = cv.toDataURL());
}

function drawRight() {
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
    h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, 'menus/'), ' gets one scene per screen that is on, kiln_menu.gd (builds the screen from its items) and kiln_settings.gd (volumes, fullscreen and options, saved for the player). ▶ Play uses them: the title menu first, Esc pauses.'),
    h('button', { 'data-file': 'save', class: 'btn go wide', onclick: exportMenus }, 'Save menus')),
    h('div', { class: 'sec' }, h('h3', {}, 'In your own Godot code'),
      h('pre', { class: 'mn-code' }, 'var m = preload("res://menus/title.tscn").instantiate()\nadd_child(m)\nm.action.connect(func(a):\n\tif a == "start": m.queue_free()\n)\nKilnSettings.flag("screen_shake")\nKilnSettings.volume("Music")')));
}
async function exportMenus() {
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const base = g.root ? 'res://' + (FS.root.slice(g.root.length + 1) ? FS.root.slice(g.root.length + 1) + '/' : '') : '';
  const files = Object.values(M).filter(m => m.on).map(m => ({ name: m.id + '.tscn', text: menuScene(m, base) }));
  try { await saveFiles('menus', files); await writeRuntime({ menu: MENU_GD, settings: SETTINGS_GD }); toast(`Saved ${files.length} menu screens to menus/ (their scripts: _kiln/ui/)`, 'ok'); } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
registerKeys('menus', [['Click a screen', 'Edit it'], ['+ Item', 'Add a button, slider or option']]);
