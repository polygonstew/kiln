// Files: the asset folder as engines see it. Tree on the left, folder in the middle,
// preview + actions on the right. Every other tab saves into this folder.
import { $, h, api, rawURL, toast, emit, on, pref, imgData, colorsOf, hex, rgb, checker, fitZoom, artCtx, thumbURL } from './core.js';
import { icon } from './icons.js';
import { Player, loadActor } from './player.js';

export const S = { settings: null, root: '', home: '', path: '', items: [], here: {}, sel: null, expanded: new Set(pref.get('fm.open', [])), mode: pref.get('fm.mode', 'grid') };
const ROLE_NAMES = { sprites: 'Sprites', backgrounds: 'Backgrounds', tiles: 'Tiles', hud: 'HUD', fonts: 'Fonts', palettes: 'Palettes', kiln: 'Kiln projects', actor: 'Actor', scene: 'Scene', root: 'Asset folder' };
const BLURB = { sprites: 'One folder per character or object, animations inside', backgrounds: 'One folder per scene, a PNG per parallax layer', tiles: 'Tilesets for level geometry', hud: 'Bars, gauges, panels and icons', fonts: 'Bitmap fonts your engine can load', palettes: 'Colour palettes (.hex)', kiln: 'Editable Kiln projects' };
const IMG = /\.(png|gif|jpe?g|webp)$/i, TXT = /\.(json|md|txt|fnt|hex|tscn|tres|gd|csv)$/i;
const short = p => p && S.home ? p.replace(S.home, '~') : p;
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : new Date(t * 1000).toLocaleDateString(); };

export async function loadSettings() {
  S.settings = await api('/api/settings');
  S.root = S.settings.root; S.home = S.settings.home;
  drawRootChip();
  emit('root', S.root);
  return S.settings;
}
function drawRootChip() {
  const c = $('#rootchip');
  // just the folder's name, so every tab fits; the full path is in the tooltip
  c.replaceChildren(h('b', {}, 'Folder'), S.root.split('/').pop()); c.dataset.root = S.root;
  // is this folder inside a Godot project? Then every export uses res:// paths and Godot picks it up directly
  api('/api/godot?path=' + encodeURIComponent(S.root)).then(g => {
    c.append(h('i', { class: 'godot ' + (g.root ? 'ok' : 'no') }, g.root ? 'Godot ✓' : 'not in Godot'));
    c.title = `Asset folder: ${short(S.root)}\n` + (g.root ? `Inside the Godot project ${g.root}: saves land in it with res:// paths. Click to browse.`
      : 'Not inside a Godot project yet: saves work, but use File → Asset folder… to point Kiln into your Godot project (see Help → Into Godot).');
  }).catch(() => {});
}
export const rootPath = (...p) => [S.root, ...p].join('/');

let V;   // view elements
export const files = {
  id: 'files', title: 'Files', key: '1',
  mount(el) {
    el.className = 'view ws fm';
    V = {
      tree: h('div', { class: 'tree' }),
      crumbs: h('div', { class: 'crumbs' }),
      role: h('div', { class: 'rolebar' }),
      grid: h('div', { class: 'grid' }),
      detail: h('aside', { class: 'r detail', style: { borderLeft: '1px solid var(--line)', background: 'var(--p1)', overflow: 'auto' } }),
      drop: h('div', { class: 'dropzone' }, 'Drop files to copy them here'),
      upload: h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: e => importFiles([...e.target.files]) }),
    };
    const modeBtn = h('button', { class: 'ibtn', title: 'Grid or list', onclick: () => { S.mode = S.mode === 'grid' ? 'list' : 'grid'; pref.set('fm.mode', S.mode); drawGrid(); } }, icon('grid'));
    const main = h('section', { class: 'stage', style: { overflow: 'hidden' } },
      h('div', { class: 'bar' },
        h('button', { class: 'ibtn', title: 'Up one folder (Backspace)', onclick: () => up() }, icon('up')),
        V.crumbs, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: newFolder }, icon('plus'), 'Folder'),
        h('button', { class: 'btn sm', onclick: () => V.upload.click() }, icon('export'), 'Import'),
        modeBtn, V.upload),
      V.role,
      h('div', { style: { flex: 1, overflow: 'auto', position: 'relative' } }, V.grid, V.drop));
    el.append(h('aside', { class: 'l', style: { background: 'var(--p1)', borderRight: '1px solid var(--line)', overflow: 'auto' } }, V.tree), main, V.detail);
    // drag files in from the desktop
    let depth = 0;
    main.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { depth++; V.drop.classList.add('on'); } });
    main.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; V.drop.classList.remove('on'); } });
    main.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    main.addEventListener('drop', e => { e.preventDefault(); depth = 0; V.drop.classList.remove('on'); importFiles([...e.dataTransfer.files]); });
    el.tabIndex = -1;
    // listen on the page while Files is showing: after a confirm()/prompt() the focus is on <body>, not this view
    document.addEventListener('keydown', e => {
      if (!el.classList.contains('on') || document.querySelector('.modal, .dx-veil') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'Backspace') { e.preventDefault(); up(); }
      if (e.key === 'Delete' && S.sel) trash(S.sel);
      if (e.key === 'F2' && S.sel) rename(S.sel);
      if (e.key === 'Enter' && S.sel?.dir) go(S.sel.path);
    });
    $('#rootchip').onclick = () => { emit('tab', 'files'); go(S.root); };
    on('saved', p => { if (p && p.startsWith(S.path)) refresh(); drawTree(); });
    on('root', () => drawTree());
  },
  show() { if (!S.path) go(S.root); else refresh(); },
};

export async function go(path, selName) {
  try {
    const r = await api('/api/fs?path=' + encodeURIComponent(path));
    Object.assign(S, { path: r.path, items: r.items, here: r.here || {}, parent: r.parent });
    S.sel = selName ? r.items.find(i => i.name === selName) || null : null;
    if (r.path.startsWith(S.root)) { let p = r.path; while (p.length > S.root.length) { S.expanded.add(p); p = p.slice(0, p.lastIndexOf('/')); } }
    drawCrumbs(); drawRole(); drawGrid(); drawDetail(); drawTree();
  } catch (e) { toast(e.message, 'bad'); }
}
const refresh = () => go(S.path, S.sel?.name);
const up = () => S.parent && go(S.parent, S.path.split('/').pop());

function drawCrumbs() {
  const parts = [], segs = S.path.split('/').filter(Boolean);
  let acc = '';
  segs.forEach((s, i) => {
    acc += '/' + s;
    if (acc.length < S.home.length) return;
    const p = acc;
    if (parts.length) parts.push(h('span', {}, '/'));
    parts.push(h('button', { title: p === S.root ? 'The asset folder' : 'Go to ' + p.replace(S.home, '~'), onclick: () => go(p) }, p === S.home ? '~' : p === S.root ? '◆ ' + s : s));
  });
  V.crumbs.replaceChildren(...parts);
}
function drawRole() {
  const r = S.here.role, inRoot = S.path.startsWith(S.root);
  const kids = [];
  if (!inRoot) {
    kids.push(h('b', { style: { color: 'var(--dim)' } }, 'Outside the asset folder'),
      h('span', {}, 'Browse anywhere in your home folder. Use a folder like this as the asset folder to save into it.'),
      h('span', { class: 'grow', style: { flex: 1 } }),
      h('button', { class: 'btn sm', onclick: () => setRoot(S.path) }, 'Use as asset folder'));
  } else if (r === 'root') {
    const missing = Object.keys(S.settings.layout).filter(k => !S.items.some(i => i.dir && i.name === k));
    kids.push(h('b', {}, 'Asset folder'), h('span', {}, missing.length ? `Missing the standard folders: ${missing.join(', ')}.` : 'Everything Kiln makes lands in the folders below, ready for your engine.'));
    if (missing.length) kids.push(h('span', { style: { flex: 1 } }), h('button', { class: 'btn sm', onclick: () => api('/api/fs', { op: 'scaffold', path: S.path }).then(refresh) }, 'Add them'));
  } else if (r) {
    kids.push(h('b', {}, ROLE_NAMES[r] || r), h('span', {}, S.here.help || S.here.info || ''));
    if (r === 'actor') kids.push(h('span', { style: { flex: 1 } }), h('button', { class: 'btn sm go', onclick: () => emit('open-actor', S.path) }, 'Open in Animate'));
    if (r === 'scene') kids.push(h('span', { style: { flex: 1 } }), h('button', { class: 'btn sm go', onclick: () => emit('open-scene', S.path) }, 'Open in Scenes'));
  } else {
    kids.push(h('b', { style: { color: 'var(--dim)' } }, 'Folder'), h('span', {}, short(S.path)));
  }
  V.role.replaceChildren(...kids);
}

/* --------------------------------------------------------------- grid ---- */
const anims = new Set();   // animated thumbnails
function drawGrid() {
  anims.clear();
  V.grid.className = 'grid' + (S.mode === 'list' ? ' list' : '');
  if (!S.items.length) {
    V.grid.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1/-1', background: 'var(--bg)' } }, h('h2', {}, 'Empty folder'),
      S.here.role === 'sprites' ? 'Actors you export from Animate appear here, one folder each.' :
        S.here.role === 'backgrounds' ? 'Scenes you export from Scenes appear here.' : 'Drop files here or use Import.'));
    return;
  }
  V.grid.replaceChildren(...S.items.map(it => {
    const th = h('div', { class: 'th' });
    const role = it.role === 'actor' || it.role === 'scene' ? it.role : null;
    const el = h('div', {
      class: 'it' + (S.sel?.path === it.path ? ' on' : ''), tabIndex: 0, 'data-name': it.name, title: it.help || it.info || it.name,
      onclick: () => { S.sel = it; for (const x of V.grid.children) x.classList.toggle('on', x === el); drawDetail(); },
      ondblclick: () => it.dir ? go(it.path) : openFile(it),
    }, th, h('div', { class: 'nm' }, it.name),
      h('div', { class: 'mt' }, it.dir ? `${it.count} item${it.count === 1 ? '' : 's'}` : fmtSize(it.size), h('span', {}, '·'), ago(it.mtime)),
      role ? h('span', { class: 'badge ' + (it.ok === true ? 'ok' : it.ok === false ? 'no' : '') }, ROLE_NAMES[role] || role) : null);
    thumb(it, th);
    return el;
  }));
}
function thumb(it, th) {
  if (it.dir) {
    if (it.role === 'actor' && it.ok) {
      const cv = h('canvas'); th.append(cv);
      loadActor(it.path).then(a => {
        const an = a.anims.find(x => /idle/i.test(x.name)) || a.anims[0];
        if (an) { anims.add({ cv, an, i: 0 }); paintThumb(cv, an.frames[0]); }
      }).catch(() => { });
      return;
    }
    if (it.role === 'scene' && it.ok) {
      const cv = h('canvas'); th.append(cv);
      fetch(rawURL(it.path + '/scene.json')).then(r => r.json()).then(async sc => {
        const L = sc.layers || [];
        cv.width = sc.view?.w || 256; cv.height = sc.view?.h || 144;
        const x = cv.getContext('2d'); artCtx(x);
        for (const l of L) { try { const i = await imgFromPath(it.path + '/' + l.file); x.drawImage(i, 0, l.y || 0); } catch { } }
      }).catch(() => { });
      return;
    }
    if (it.help) { th.append(h('div', { class: 'role' }, h('b', {}, ROLE_NAMES[it.role] || it.role), h('span', {}, BLURB[it.role] || it.help))); return; }
    const ic = icon('folder'); ic.style.cssText = 'width:30px;height:30px;color:var(--faint)';
    th.append(ic);
    return;
  }
  if (IMG.test(it.name)) { th.append(h('img', { src: thumbURL(it.path, 192, it.mtime), loading: 'lazy', decoding: 'async' })); return; }
  if (/\.hex$/i.test(it.name)) {
    fetch(rawURL(it.path)).then(r => r.text()).then(t => th.append(h('div', { class: 'sw' }, ...t.split(/\s+/).filter(Boolean).slice(0, 32).map(c => h('i', { style: { background: '#' + c.replace('#', '') } })))));
    return;
  }
  th.append(h('span', { class: 'glyph' }, (it.name.split('.').pop() || 'file').slice(0, 5)));
}
const imgFromPath = p => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = rawURL(p); });
function paintThumb(cv, f) {
  cv.width = f.width; cv.height = f.height;
  cv.getContext('2d').putImageData(f, 0, 0);
  cv.style.width = Math.min(120, f.width * Math.max(1, Math.floor(84 / f.height))) + 'px';
}
let lastT = 0;
(function tick(t) {
  if (t - lastT > 110) { lastT = t; for (const a of anims) { if (!a.cv.isConnected) { anims.delete(a); continue; } a.i = (a.i + 1) % a.an.frames.length; a.cv.getContext('2d').putImageData(a.an.frames[a.i], 0, 0); } }
  requestAnimationFrame(tick);
})(0);

/* ------------------------------------------------------------- detail ---- */
let detailPlayer;
async function drawDetail() {
  detailPlayer?.destroy(); detailPlayer = null;
  const it = S.sel;
  const d = V.detail;
  if (!it) {
    d.replaceChildren(layoutHelp());
    return;
  }
  const pv = h('div', { class: 'pv' });
  const info = h('dl', { class: 'kv' });
  const acts = h('div', { class: 'btns' });
  // every piece is its own panel so the dock (dock.js) can place it; later pieces are appended, and dropped if the selection moved on
  const more = n => { if (S.sel === it) d.append(n); };
  d.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Preview'), pv), h('div', { class: 'sec' }, h('h3', {}, it.name), info, acts));
  const kv = (k, v) => info.append(h('dt', {}, k), h('dd', {}, v));
  kv('Path', short(it.path));
  kv(it.dir ? 'Items' : 'Size', it.dir ? String(it.count) : fmtSize(it.size));
  kv('Modified', ago(it.mtime));
  if (it.dir) {
    if (it.role === 'actor') {
      if (it.ok) {
        detailPlayer = new Player({ compact: true, height: 240 });
        pv.replaceChildren(detailPlayer.el); pv.style.display = 'block';
        try {
          const a = await loadActor(it.path);
          detailPlayer.set(a.anims);
          kv('Frame', `${a.w}×${a.h}`);
          kv('Anims', a.anims.map(x => x.name).join(', '));
        } catch (e) { pv.replaceChildren(h('div', { class: 'empty' }, 'manifest.json could not be read')); }
      } else pv.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'No manifest.json'), 'Kiln writes one when you export an actor from Animate.'));
      acts.append(h('button', { class: 'btn go', onclick: () => emit('open-actor', it.path) }, 'Open in Animate'));
    } else if (it.role === 'scene') {
      pv.replaceChildren(h('span', { class: 'faint' }, 'Scene'));
      acts.append(h('button', { class: 'btn go', onclick: () => emit('open-scene', it.path) }, 'Open in Scenes'));
    } else pv.replaceChildren(icon('folder'));
    if (it.help) more(h('div', { class: 'sec' }, h('h3', {}, 'What goes here'), h('p', { class: 'note' }, it.help)));
    acts.append(h('button', { class: 'btn', onclick: () => go(it.path) }, 'Open folder'));
    if (it.path !== S.root) acts.append(h('button', { class: 'btn', onclick: () => setRoot(it.path) }, 'Use as asset folder'));
  } else if (IMG.test(it.name)) {
    const im = await imgData(rawURL(it.path)).catch(() => null);
    if (im) {
      const cv = h('canvas'); const W = 330, H = 240;
      const z = fitZoom(W, H, im.width, im.height);
      const s = Math.min(1, W / im.width, H / im.height);
      cv.width = im.width; cv.height = im.height; cv.getContext('2d').putImageData(im, 0, 0);
      cv.style.width = (im.width * (z >= 1 && im.width * z <= W ? z : s)) + 'px';
      const box = h('div', { style: { padding: '14px', backgroundImage: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%)', backgroundSize: '16px 16px' } }, cv);
      pv.replaceChildren(box);
      const cols = colorsOf(im);
      kv('Pixels', `${im.width}×${im.height}`);
      kv('Colours', cols.length > 256 ? '256+ (not paletted)' : String(cols.length));
      if (cols.length <= 64) more(h('div', { class: 'sec' }, h('h3', {}, 'Palette'), h('div', { class: 'sw' }, ...cols.map(c => h('i', { title: hex(c), style: { background: hex(c) } })))));
      if (im.width > im.height * 1.5) kv('As strip', `${Math.round(im.width / im.height)} frames of ${im.height}×${im.height}?`);
    }
    acts.append(
      h('button', { class: 'btn go', onclick: () => emit('slice-sheet', it.path) }, 'Animate from sheet'),
      h('button', { class: 'btn', onclick: () => emit('forge-image', it.path) }, 'Pixelize in Forge'),
      h('button', { class: 'btn', onclick: () => emit('scene-layer', it.path) }, 'Add to scene'));
  } else if (TXT.test(it.name)) {
    const t = await fetch(rawURL(it.path)).then(r => r.text()).catch(() => '');
    if (/\.hex$/i.test(it.name)) {
      const cols = t.split(/\s+/).filter(Boolean).map(c => rgb(c));
      pv.replaceChildren(h('div', { class: 'sw big', style: { padding: '14px' } }, ...cols.map(c => h('i', { style: { background: hex(c) } }))));
      acts.append(h('button', { class: 'btn go', onclick: () => emit('use-palette', { name: it.name.replace(/\.hex$/, ''), colors: cols }) }, 'Use this palette'));
    } else pv.replaceChildren(h('span', { class: 'glyph faint mono' }, it.name.split('.').pop().toUpperCase()));
    more(h('div', { class: 'sec' }, h('h3', {}, 'Contents'), h('pre', {}, t.slice(0, 20000))));
  } else pv.replaceChildren(icon('file'));
  acts.append(
    h('button', { class: 'btn ghost', title: 'Rename (F2)', onclick: () => rename(it) }, 'Rename'),
    h('button', { class: 'btn ghost danger', title: 'Move to the trash folder (Delete)', onclick: () => trash(it) }, 'Trash'),
    h('button', { class: 'btn ghost', title: 'Copy the full path', onclick: () => navigator.clipboard?.writeText(it.path).then(() => toast('Path copied')) }, 'Copy path'));
}
function openFile(it) {
  if (IMG.test(it.name)) emit('slice-sheet', it.path);
}
function layoutHelp() {
  const L = S.settings?.layout || {};
  return h('div', {},
    h('div', { class: 'sec' }, h('h3', {}, 'How the asset folder is laid out'),
      h('div', { class: 'layout' }, ...Object.entries(L).map(([k, v]) => h('div', {}, h('code', {}, k + '/'), h('span', {}, v)))),
      h('p', { class: 'note' }, 'Point the asset folder at your game (for example a Godot project\'s ', h('b', {}, 'assets/'), ' folder) and exports go straight where the engine looks. Godot paths are written as res:// automatically.')),
    h('div', { class: 'sec' }, h('h3', {}, 'Keys'),
      h('dl', { class: 'kv' }, ...[['Double-click', 'open'], ['Backspace', 'up a folder'], ['F2', 'rename'], ['Delete', 'move to trash'], ['Drag in', 'copy files here']].flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)]))));
}

/* ------------------------------------------------------------- tree ---- */
async function drawTree() {
  if (!V) return;
  const t = V.tree;
  const rows = [];
  rows.push(h('div', { class: 'grp' }, h('span', { class: 'grow' }, 'Asset folder'),
    h('button', { class: 'btn sm ghost', title: 'Pick another asset folder', onclick: pickRoot }, 'Change')));
  rows.push(...await branch(S.root, 0, true));
  rows.push(h('div', { class: 'grp' }, 'Places'));
  const places = [{ name: 'Home', path: S.home }, { name: 'Kiln library', path: S.home + '/.jcodes/kiln/library' }, ...(S.settings.bookmarks || [])];
  for (const p of places) rows.push(h('div', { class: 'tn' + (S.path === p.path ? ' on' : ''), title: short(p.path), onclick: () => go(p.path) },
    h('span', { class: 'tw' }), iconEl(p.name === 'Home' ? 'folder' : 'star'), h('span', { class: 'nm' }, p.name)));
  rows.push(h('div', { style: { padding: '10px 14px' } }, h('button', { class: 'btn sm ghost', onclick: () => bookmark(S.path) }, icon('star'), 'Bookmark this folder')));
  t.replaceChildren(...rows);
}
const iconEl = n => { const i = icon(n, 'ic'); return i; };
async function branch(path, depth, isRoot) {
  let r;
  try { r = await api('/api/fs?path=' + encodeURIComponent(path)); } catch { return []; }
  const out = [];
  if (isRoot) out.push(h('div', { class: 'tn' + (S.path === path ? ' on' : ''), onclick: () => go(path) },
    h('span', { class: 'tw' }, '◆'), h('span', { class: 'nm', style: { color: 'var(--ink)' } }, path.split('/').pop())));
  for (const it of r.items.filter(i => i.dir)) {
    const open = S.expanded.has(it.path);
    const hasKids = it.count > 0;
    out.push(h('div', { class: 'tn' + (S.path === it.path ? ' on' : ''), style: { paddingLeft: (10 + (depth + 1) * 14) + 'px' }, title: it.help || it.info || '', onclick: () => go(it.path) },
      h('span', { class: 'tw', onclick: e => { e.stopPropagation(); open ? S.expanded.delete(it.path) : S.expanded.add(it.path); pref.set('fm.open', [...S.expanded]); drawTree(); } }, hasKids ? (open ? '▾' : '▸') : ''),
      iconEl('folder'), h('span', { class: 'nm', style: it.role && it.role !== 'actor' && it.role !== 'scene' ? { color: 'var(--ink)' } : {} }, it.name),
      it.ok === true ? h('i', { class: 'flag ok', title: it.info }) : it.ok === false ? h('i', { class: 'flag no', title: it.info }) : null,
      h('span', { class: 'ct' }, it.count || '')));
    if (open && depth < 4) out.push(...await branch(it.path, depth + 1));
  }
  return out;
}

/* ------------------------------------------------------------ actions ---- */
async function setRoot(path) {
  const scaffold = confirm(`Use ${short(path)} as the asset folder?\n\nOK also adds any missing standard folders (sprites/, backgrounds/, hud/, fonts/, palettes/, tiles/, kiln/). Cancel keeps the folder as it is.`);
  await api('/api/fs', { op: 'root', path, scaffold });
  (await import('./games.js')).restart('Asset folder: ' + short(path), 'files');     // start clean in it (nothing of the last game held)
}
async function pickRoot() {
  const choices = [S.home + '/.jcodes/kiln/library/games/untitled'];
  const pm = S.home + '/.jcodes/pallidmask/assets';
  choices.push(pm);
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } },
    h('div', {}, h('header', {}, h('span', { class: 'grow' }, 'Choose the asset folder'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
      h('div', { class: 'body' },
        h('p', { class: 'note', style: { marginTop: 0 } }, 'Everything Kiln exports is saved inside this folder. Pick a game\'s assets folder, or browse to any folder in Files and press "Use as asset folder".'),
        ...choices.map(p => h('div', { class: 'palrow', onclick: () => { m.remove(); setRoot(p); } }, icon('folder'), h('span', { class: 'mono' }, short(p)))),
        h('div', { class: 'fld wide', style: { marginTop: '14px' } }, h('span', { class: 'fl' }, 'Or type a path'),
          h('div', { style: { display: 'flex', gap: '6px' } }, h('input', { type: 'text', id: 'rootIn', value: short(S.root) }),
            h('button', { class: 'btn go', onclick: () => { const v = $('#rootIn').value.replace(/^~/, S.home); m.remove(); setRoot(v); } }, 'Use'))))));
  document.body.append(m);
}
async function bookmark(path) {
  await api('/api/fs', { op: 'bookmark', path });
  await loadSettings(); drawTree(); toast('Bookmarked ' + short(path));
}
async function newFolder() {
  const n = prompt('New folder name' + (S.here.role === 'sprites' ? ' (an actor, e.g. "hero")' : S.here.role === 'backgrounds' ? ' (a scene, e.g. "cathedral")' : ''));
  if (!n) return;
  await api('/api/fs', { op: 'mkdir', path: S.path + '/' + n.replace(/[\/]/g, '_') }).catch(e => toast(e.message, 'bad'));
  go(S.path, n);
}
async function rename(it) {
  const n = prompt('Rename to', it.name);
  if (!n || n === it.name) return;
  await api('/api/fs', { op: 'rename', path: it.path, to: S.path + '/' + n.replace(/[\/]/g, '_') }).then(() => go(S.path, n)).catch(e => toast(e.message, 'bad'));
}
async function trash(it) {
  if (!confirm(`Move "${it.name}" to the trash folder?\n(${short(S.root)}/.trash — nothing is deleted for good)`)) return;
  await api('/api/fs', { op: 'trash', path: it.path }).then(() => { S.sel = null; refresh(); toast('Moved to .trash'); }).catch(e => toast(e.message, 'bad'));
}
async function importFiles(list) {
  if (!list.length) return;
  const files = await Promise.all(list.map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res({ name: f.name, b64: r.result }); r.readAsDataURL(f); })));
  try {
    await api('/api/export', { dest: S.path, files });
    toast(`Copied ${files.length} file${files.length > 1 ? 's' : ''} here`, 'ok');
    go(S.path, files[0].name);
  } catch (e) { toast(e.message, 'bad'); }
}

/* Save files into the asset folder (relative path like "sprites/hero"). Shared by all tabs. */
export async function saveFiles(rel, files) {
  const r = await api('/api/export', { dest: rel, files });
  emit('saved', r.dir);
  return r;
}
