// Levels: paint a room from tiles (in the spirit of LDtk), mark which tiles are solid, export a Godot
// TileSet + TileMapLayer scene with collision. Left click paints, right click erases, wheel rolls tiles.
import { h, api, toast, on, pref, clamp, field, range, select, seg, check, imgData, toCanvas, toDataURL, newImg, rawURL, checker, uid } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { loadActor } from './player.js';
import { registerWheel } from './wheel.js';
import { registerKeys } from './wheel.js';
import { loadOwners, claim } from './owners.js';
import { KINDS, kindColour, drawKind, tileLines, TILESET_LAYERS, LEVEL_TILES_GD } from './tilekinds.js';

// Entities: things placed on the map (actors exported from Animate, the player start). x,y = feet, in level pixels.
let mode = 'tiles', entPick = 'start', actorList = [], sprites = {};   // sprites: actor name -> first idle frame (canvas)
async function loadActorList() {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  actorList = [];
  for (const d of (r.items || []).filter(i => i.dir && !i.name.startsWith('_'))) {
    const inner = await api('/api/fs?path=' + encodeURIComponent(d.path)).catch(() => ({ items: [] }));
    if (!(inner.items || []).some(i => i.name === d.name + '.tscn')) continue;     // only actors with a Godot scene can be placed
    actorList.push(d.name);
    if (!sprites[d.name]) loadActor(d.path).then(a => { const n = a.anims.find(n => /idle|stand/i.test(n.name)) || a.anims[0]; if (n) { sprites[d.name] = toCanvas(n.frames[0]); draw(); } }).catch(() => {});
  }
  if (mode === 'ents') drawLeft();
}
let bgLayers = null;     // the background scene's layers, drawn behind the map: [{cv, y, scroll}]
let L = null, V = {}, mounted = false, tsImg = null, zoom = 0, hover = null, drag = null, saveT;
// what a tile does in the game (tilekinds.js); old levels only had `solid: [tile…]`
const kindOf = i => (L.kinds ||= Object.fromEntries((L.solid || []).map(k => [k, 'solid'])))[i] || '';
function setKind(i, k) { kindOf(i); if (k) L.kinds[i] = k; else delete L.kinds[i]; L.solid = Object.keys(L.kinds).filter(t => L.kinds[t] === 'solid').map(Number); changed(); }
const slug = s => (s || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'level';

function blank(name = 'room') {
  return { id: uid(), name, tile: 16, cols: 40, rows: 23, ts: null, tsCols: 8, solid: [0, 1, 2, 3, 5], kinds: { 0: 'solid', 1: 'solid', 2: 'solid', 3: 'solid', 5: 'solid' }, cells: Array(40 * 23).fill(-1), pick: 0, grid: true };
}

/* ------------------------------------------------- starter tileset ---- */
// 8 tiles drawn in code so the tab works before you have art: stone, dark stone, grass top, dirt,
// planks, grate, spikes, ladder. Swap it for your own tileset image any time.
function starterTiles(T = 16) {
  const cv = document.createElement('canvas'); cv.width = T * 8; cv.height = T; const x = cv.getContext('2d');
  const r = (c, X, Y, W, H) => { x.fillStyle = c; x.fillRect(X, Y, W, H); };
  const at = i => i * T;
  // 0 stone bricks
  r('#5b5a63', at(0), 0, T, T); r('#3c3b44', at(0), T / 2 - 1, T, 1); r('#3c3b44', at(0), T - 1, T, 1); r('#3c3b44', at(0) + T / 2, 0, 1, T / 2); r('#3c3b44', at(0) + 3, T / 2, 1, T / 2); r('#74737d', at(0), 0, T, 1);
  // 1 dark stone
  r('#2b2a31', at(1), 0, T, T); for (let i = 0; i < 6; i++) r('#3a3942', at(1) + (i * 5) % T, (i * 7) % T, 2, 2);
  // 2 grass top over dirt
  r('#6b4a2e', at(2), 0, T, T); r('#4c8a3a', at(2), 0, T, 4); for (let i = 0; i < T; i += 3) r('#6fb34f', at(2) + i, 0, 1, 2); r('#523720', at(2) + 4, 9, 2, 2); r('#523720', at(2) + 11, 12, 2, 2);
  // 3 dirt
  r('#6b4a2e', at(3), 0, T, T); r('#523720', at(3) + 3, 4, 2, 2); r('#523720', at(3) + 10, 9, 2, 2); r('#7d5838', at(3) + 7, 2, 1, 1);
  // 4 planks (background wood, not solid)
  r('#7a5230', at(4), 0, T, T); r('#5a3a1f', at(4), 0, 1, T); r('#5a3a1f', at(4) + T / 2, 0, 1, T); r('#8f6239', at(4) + 2, 5, 3, 1);
  // 5 grate
  r('#2e3236', at(5), 0, T, T); for (let i = 1; i < T; i += 4) { r('#6c757d', at(5) + i, 0, 1, T); r('#6c757d', at(5), i, T, 1); }
  // 6 spikes
  for (let i = 0; i < 4; i++) { x.fillStyle = '#b8bcc4'; x.beginPath(); x.moveTo(at(6) + i * 4, T); x.lineTo(at(6) + i * 4 + 2, T - 9); x.lineTo(at(6) + i * 4 + 4, T); x.fill(); }
  // 7 ladder
  r('#8f6239', at(7) + 3, 0, 2, T); r('#8f6239', at(7) + T - 5, 0, 2, T); for (let y = 2; y < T; y += 5) r('#a8743f', at(7) + 3, y, T - 6, 2);
  return cv.toDataURL('image/png');
}

// a tileset cut from a Scenes layer arrives here
let pendingTs = null;
on('level-tileset', d => { pendingTs = d; if (mounted) takeTs(); });
async function takeTs() {
  if (!pendingTs || !L) return;
  const d = pendingTs; pendingTs = null;
  // a whole picture sent as a tileset makes thousands of tiles: check first
  const probe = await imgData(d.url).catch(() => null);
  if (probe && Math.floor(probe.width / d.tile) * Math.floor(probe.height / d.tile) > 256 && !confirm(`That image cuts into ${Math.floor(probe.width / d.tile) * Math.floor(probe.height / d.tile)} tiles of ${d.tile} px. It is probably a picture, not a tileset.\n\nUse it anyway?`)) return;
  L.ts = d.url; L.tile = d.tile; L.solid = []; L.kinds = {}; L.pick = 0; await loadTiles(); changed(); drawLeft(); draw();
  toast(`Tileset from "${d.name}": ${tileCount()} tiles of ${d.tile} px. Pick a tile, then set what it does (solid, one-way, ladder…)`, 'ok');
}
async function loadBg() {
  bgLayers = null;
  if (!L.bg) return;
  try {
    const dir = FS.root + '/backgrounds/' + L.bg, sj = await (await fetch(rawURL(dir + '/scene.json'))).json();
    bgLayers = [];
    for (const l of sj.layers) if (l.file && l.visible !== false) bgLayers.push({ cv: toCanvas(await imgData(rawURL(dir + '/' + l.file))), y: l.y, scroll: l.scroll, repeat: l.repeat, opacity: l.opacity ?? 1 });
    V.bgView = sj.view;
  } catch { bgLayers = null; toast(`Background "${L.bg}" isn't saved yet: save it in Scenes first`, 'bad'); }
  draw();
}

/* -------------------------------------------------------------- module ---- */
export const levels = {
  id: 'levels', title: 'Levels', key: '7',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    L = pref.get('level.cur', null) || blank();
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.cv = h('canvas', { style: { cursor: 'crosshair' } });
    V.vp = h('div', { class: 'viewport', style: { background: '#0e0e0d' } }, V.cv);
    V.info = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
    el.append(V.left, h('section', { class: 'stage' },
      h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'Zoom'), select([[0, 'Fit'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], zoom, v => { zoom = +v; draw(); }),
        h('button', { class: 'ibtn' + (L.grid ? ' on' : ''), title: 'Tile grid', onclick: e => { L.grid = !L.grid; e.currentTarget.classList.toggle('on', L.grid); draw(); } }, '#'),
        h('span', { class: 'grow' }), V.info),
      V.vp,
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Left click paints · right click erases · wheel rolls through tiles · Ctrl+wheel zooms · Shift+click a tile: solid on/off · "Tile N is" sets one-way, ladder, hazard…'))),
      V.right);
    bind();
    new ResizeObserver(() => draw()).observe(V.vp);
    loadTiles().then(() => { drawLeft(); drawRight(); draw(); takeTs(); loadBg(); });
  },
  show() { draw(); },
};

async function loadTiles() {
  if (!L.ts) L.ts = starterTiles(L.tile);
  try { tsImg = await imgData(L.ts); } catch { L.ts = starterTiles(L.tile); tsImg = await imgData(L.ts); }
  L.tsCols = Math.max(1, Math.floor(tsImg.width / L.tile));
}
const tileCount = () => tsImg ? L.tsCols * Math.max(1, Math.floor(tsImg.height / L.tile)) : 0;
function changed() {
  pref.set('level.cur', L);
  clearTimeout(saveT); saveT = setTimeout(async () => {
    await loadOwners('level');
    if (claim('level', L, slug)) { drawLeft(); drawRight(); pref.set('level.cur', L); }
    api('/api/project', { id: 'level-' + slug(L.name), data: { meta: { kind: 'level', name: L.name }, level: L } }).catch(() => {});
  }, 1500);
}

/* ------------------------------------------------------------- drawing ---- */
function draw() {
  if (!V.cv || !L || !tsImg) return;
  const T = L.tile, W = L.cols * T, H = L.rows * T;
  const z = zoom || Math.max(1, Math.floor(Math.min((V.vp.clientWidth - 30) / W, (V.vp.clientHeight - 30) / H)));
  V.z = z;
  V.cv.width = W * z; V.cv.height = H * z;
  const x = V.cv.getContext('2d'); x.imageSmoothingEnabled = false;
  checker(x, W * z, H * z, 8 * z, '#1a1a19', '#1f1f1e');
  if (bgLayers) {
    // the scene is one screen tall; it sits at the bottom of the map and repeats across, each layer at its parallax rate
    const vh = V.bgView?.h || H, oy = H - vh;
    for (const b of bgLayers) {
      x.globalAlpha = b.opacity;
      const bw = b.cv.width;
      for (let bx = 0; bx < W; bx += bw) x.drawImage(b.cv, bx * z, (oy + b.y) * z, bw * z, b.cv.height * z);
      x.globalAlpha = 1;
    }
  }
  const src = toCanvas(tsImg);
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
    const t = L.cells[r * L.cols + c]; if (t < 0) continue;
    x.drawImage(src, (t % L.tsCols) * T, Math.floor(t / L.tsCols) * T, T, T, c * T * z, r * T * z, T * z, T * z);
  }
  if (L.grid) {
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.beginPath();
    for (let c = 1; c < L.cols; c++) { x.moveTo(c * T * z + .5, 0); x.lineTo(c * T * z + .5, H * z); }
    for (let r = 1; r < L.rows; r++) { x.moveTo(0, r * T * z + .5); x.lineTo(W * z, r * T * z + .5); }
    x.stroke();
  }
  for (const e of L.ents || []) {
    const sp = e.type === 'actor' ? sprites[e.name] : null;
    if (sp) x.drawImage(sp, (e.x - sp.width / 2) * z, (e.y - sp.height) * z, sp.width * z, sp.height * z);
    else { x.fillStyle = e.type === 'start' ? '#9cc76b' : '#e3b04b'; x.fillRect((e.x - 1) * z, (e.y - 14) * z, 2 * z, 14 * z); x.fillRect((e.x + 1) * z, (e.y - 14) * z, 7 * z, 5 * z); }
    if (mode === 'ents') { x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect((e.x - 3) * z + .5, (e.y - 1) * z + .5, 6 * z, 2 * z); }
  }
  if (V.showSolid) for (let i = 0; i < L.cells.length; i++) if (L.cells[i] >= 0) drawKind(x, kindOf(L.cells[i]), (i % L.cols) * T * z, Math.floor(i / L.cols) * T * z, T * z);
  if (hover) { x.globalAlpha = .55; x.drawImage(src, (L.pick % L.tsCols) * T, Math.floor(L.pick / L.tsCols) * T, T, T, hover[0] * T * z, hover[1] * T * z, T * z, T * z); x.globalAlpha = 1; x.strokeStyle = '#fff'; x.strokeRect(hover[0] * T * z + .5, hover[1] * T * z + .5, T * z - 1, T * z - 1); }
  const used = L.cells.filter(t => t >= 0).length;
  V.info.textContent = `${L.cols}×${L.rows} tiles · ${W}×${H} px · ${used} placed${hover ? ` · ${hover[0]},${hover[1]}` : ''} · ${z}×`;
}
function cellAt(e) { const r = V.cv.getBoundingClientRect(), T = L.tile * V.z; const c = Math.floor((e.clientX - r.left) / T), w = Math.floor((e.clientY - r.top) / T); return c >= 0 && w >= 0 && c < L.cols && w < L.rows ? [c, w] : null; }
function paint(p, t) { if (!p) return; const i = p[1] * L.cols + p[0]; if (L.cells[i] === t) return; L.cells[i] = t; draw(); }
function bind() {
  V.cv.addEventListener('contextmenu', e => e.preventDefault());
  V.cv.addEventListener('pointerdown', e => {
    V.cv.setPointerCapture(e.pointerId);
    if (mode === 'ents') {
      const r = V.cv.getBoundingClientRect(), px = (e.clientX - r.left) / V.z, py = (e.clientY - r.top) / V.z;
      L.ents = L.ents || [];
      if (e.button === 2) {     // right click removes the nearest entity
        let bi = -1, bd = 1e9; L.ents.forEach((en, i) => { const d = Math.hypot(en.x - px, en.y - 8 - py); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0 && bd < L.tile * 1.5) { L.ents.splice(bi, 1); changed(); draw(); drawLeft(); }
        return;
      }
      // feet snap to the top of the tile under the cursor, centred in the column
      const cx = Math.floor(px / L.tile), cy = Math.floor(py / L.tile);
      const en = { id: uid(), type: entPick === 'start' ? 'start' : 'actor', name: entPick === 'start' ? 'PlayerStart' : entPick, x: cx * L.tile + L.tile / 2, y: (cy + 1) * L.tile };
      if (en.type === 'start') L.ents = L.ents.filter(q => q.type !== 'start');   // only one start
      L.ents.push(en); changed(); draw(); drawLeft(); return;
    }
    if (e.button === 1) { const p = cellAt(e); if (p && L.cells[p[1] * L.cols + p[0]] >= 0) { L.pick = L.cells[p[1] * L.cols + p[0]]; drawLeft(); } return; }
    drag = { t: e.button === 2 ? -1 : L.pick }; paint(cellAt(e), drag.t);
  });
  V.cv.addEventListener('pointermove', e => { hover = mode === 'tiles' ? cellAt(e) : null; if (drag) paint(hover, drag.t); else draw(); });
  const up = () => { if (drag) { drag = null; changed(); } };
  V.cv.addEventListener('pointerup', up); V.cv.addEventListener('pointercancel', up);
  V.cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  V.vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.altKey) { zoom = clamp((zoom || V.z) + (e.deltaY < 0 ? 1 : -1), 1, 8); draw(); return; }
    const n = tileCount(); if (!n) return;
    L.pick = ((L.pick + (e.deltaY > 0 ? 1 : -1)) % n + n) % n; drawLeft(); draw();
  }, { passive: false });
}

/* --------------------------------------------------------- left panel ---- */
function drawLeft() {
  const n = tileCount(), T = L.tile, src = tsImg && toCanvas(tsImg), s = 3;
  const tiles = h('div', { class: 'tileset' }, ...Array.from({ length: n }, (_, i) => {
    const c = h('canvas', { width: T, height: T, style: { width: T * s / 1.5 + 'px', height: T * s / 1.5 + 'px' } });
    c.getContext('2d').drawImage(src, (i % L.tsCols) * T, Math.floor(i / L.tsCols) * T, T, T, 0, 0, T, T);
    const k = kindOf(i);
    return h('div', { class: 'tl' + (i === L.pick ? ' on' : '') + (k ? ' kind' : ''), style: k ? { '--kc': kindColour(k) } : {}, title: `Tile ${i + 1}${k ? ' · ' + KINDS.find(r => r[0] === k)[1] : ''}  ·  click: paint with it  ·  Shift+click: solid on/off`,
      onclick: e => { if (e.shiftKey) setKind(i, kindOf(i) === 'solid' ? '' : 'solid'); else L.pick = i; drawLeft(); draw(); } }, c);
  }));
  const name = h('input', { type: 'text', value: L.name, onchange: () => { L.name = slug(name.value); name.value = L.name; changed(); drawRight(); } });
  const cols = h('input', { type: 'number', value: L.cols, min: 4, max: 400, style: { width: '60px' } }), rows = h('input', { type: 'number', value: L.rows, min: 4, max: 200, style: { width: '60px' } });
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Level', h('span', { class: 'grow' }),
        h('button', { class: 'btn sm ghost', title: 'Open a level you made before', onclick: openMenu }, 'Open'),
        h('button', { class: 'btn sm ghost', title: 'Start a new empty level (this one is kept)', onclick: () => { const n = prompt('Name for the new level', 'room'); if (!n) return; L = { ...blank(slug(n)), ts: L.ts, tile: L.tile, solid: L.solid, kinds: { ...(L.kinds || {}) } }; loadTiles().then(() => { changed(); drawLeft(); drawRight(); draw(); }); } }, 'New')),
      field('Name', name),
      field('Size', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, cols, '×', rows,
        h('button', { class: 'btn sm', title: 'Resize the level in tiles (tiles stay where they are)', onclick: () => resize(+cols.value, +rows.value) }, 'Set')), 'In tiles. 480×270 px is 30×17 tiles of 16'),
      field('Background', V.bgSel = select([['', 'None']], L.bg || '', v => { L.bg = v || null; changed(); loadBg(); }), 'A scene from Scenes, shown behind the map and placed behind it in Godot'),
      field('Tile', seg([[8, '8'], [16, '16'], [32, '32']], L.tile, v => { L.tile = +v; L.ts = null; loadTiles().then(() => { changed(); drawLeft(); draw(); }); }), 'Pixels per tile')),
    h('div', { class: 'sec' }, h('h3', {}, 'Paint'), seg([['tiles', 'Tiles'], ['ents', 'Things']], mode, v => { mode = v; drawLeft(); draw(); }),
      mode === 'ents' ? [h('div', { class: 'entlist' },
          h('button', { class: entPick === 'start' ? 'on' : '', title: 'Where the player appears (exported as a Marker2D named PlayerStart)', onclick: () => { entPick = 'start'; drawLeft(); } }, '⚑ Player start'),
          ...actorList.map(a => h('button', { class: entPick === a ? 'on' : '', title: `Place ${a} (its Godot scene, with hitbox and juice)`, onclick: () => { entPick = a; drawLeft(); } }, sprites[a] ? (() => { const c = h('canvas', { width: sprites[a].width, height: sprites[a].height }); c.getContext('2d').drawImage(sprites[a], 0, 0); return c; })() : null, a))),
        h('p', { class: 'note' }, actorList.length ? 'Left click places on the tile under the cursor (feet on its top). Right click removes.' : 'Save an actor in Animate to place it here. The player start works now.'),
        h('p', { class: 'note' }, `${(L.ents || []).length} placed`)] : null),
    mode === 'ents' ? null : h('div', { class: 'sec' }, h('h3', {}, 'Tiles', h('span', { class: 'grow' }), h('small', {}, `${n} tiles`)), tiles,
      n ? h('div', { class: 'kindpick' }, h('span', { class: 'fl' }, `Tile ${L.pick + 1} is`),
        h('div', { class: 'kinds' }, ...KINDS.map(([id, label, c, hint]) => h('button', { class: kindOf(L.pick) === id ? 'on' : '', style: { '--kc': c }, title: hint, onclick: () => { setKind(L.pick, id); drawLeft(); if (!V.showSolid) { V.showSolid = true; } draw(); } }, label)))) : null,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', title: 'Use any image as the tileset: it is cut into tiles of the size above', onclick: pickTileset }, 'Tileset image…'),
        h('button', { class: 'btn sm ghost', title: 'Go back to the built-in starter tiles', onclick: () => { L.ts = null; loadTiles().then(() => { changed(); drawLeft(); draw(); }); } }, 'Starter tiles'),
        h('button', { class: 'btn sm ghost' + (V.showSolid ? ' on' : ''), title: 'Show what each tile does on the map (solid red, one-way yellow, ladders green, hazards purple, water blue)', onclick: () => { V.showSolid = !V.showSolid; drawLeft(); draw(); } }, 'Show behaviours'))));
  fillBgSel();
  if (mode === 'ents' && !actorList.length && !V.listed) { V.listed = true; loadActorList(); }
}
async function fillBgSel() {
  if (!V.bgSel) return;
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/backgrounds')).catch(() => ({ items: [] }));
  const names = (r.items || []).filter(i => i.dir).map(i => i.name);
  V.bgSel.replaceChildren(h('option', { value: '' }, 'None'), ...names.map(n => h('option', { value: n }, n)));
  V.bgSel.value = L.bg || '';
}
function resize(c, r) {
  c = clamp(c | 0, 4, 400); r = clamp(r | 0, 4, 200);
  const cells = Array(c * r).fill(-1);
  for (let y = 0; y < Math.min(r, L.rows); y++) for (let x = 0; x < Math.min(c, L.cols); x++) cells[y * c + x] = L.cells[y * L.cols + x];
  L.cols = c; L.rows = r; L.cells = cells; changed(); drawLeft(); draw();
}
function pickTileset() {
  const i = h('input', { type: 'file', accept: 'image/*' });
  i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { L.ts = r.result; L.solid = []; L.kinds = {}; await loadTiles(); L.pick = 0; changed(); drawLeft(); draw(); toast(`Tileset: ${tileCount()} tiles of ${L.tile} px. Pick a tile, then set what it does`); }; r.readAsDataURL(f); };
  i.click();
}
async function openMenu() {
  const list = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'level');
  if (!list.length) return toast('No saved levels yet');
  const n = prompt('Open which level?\n\n' + list.map(p => p.name).join('\n'), list[0].name);
  const p = list.find(p => p.name === n); if (!p) return;
  const d = await (await fetch('/api/project?id=' + encodeURIComponent(p.id))).json();
  L = d.level; await loadTiles(); pref.set('level.cur', L); drawLeft(); drawRight(); draw();
}

/* ---------------------------------------------------------- export ---- */
function drawRight() {
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
    h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `levels/${L.name}/`), ' gets the tileset PNG, a Godot TileSet (.tres) with each tile\'s collision and kind, and a scene (.tscn) with a TileMapLayer running _kiln/level_tiles.gd (kind_at(), hazards hurt).'),
    h('button', { class: 'btn go wide', title: 'Write the level for Godot', onclick: exportLevel }, 'Save ' + L.name)));
}
// Godot 4 TileMapLayer.tile_map_data: uint16 format (0), then per cell 6 × int16: x, y, source, atlas x, atlas y, alternative
function tileMapData() {
  const cells = []; L.cells.forEach((t, i) => { if (t >= 0) cells.push([i % L.cols, Math.floor(i / L.cols), t]); });
  const b = new DataView(new ArrayBuffer(2 + cells.length * 12));
  b.setUint16(0, 0, true);
  cells.forEach(([x, y, t], k) => { const o = 2 + k * 12; b.setInt16(o, x, true); b.setInt16(o + 2, y, true); b.setUint16(o + 4, 0, true); b.setUint16(o + 6, t % L.tsCols, true); b.setUint16(o + 8, Math.floor(t / L.tsCols), true); b.setUint16(o + 10, 0, true); });
  return [...new Uint8Array(b.buffer)].join(', ');
}
async function exportLevel() {
  await loadOwners('level');
  if (claim('level', L, slug)) { drawLeft(); drawRight(); }
  const dir = `levels/${L.name}`, T = L.tile, hT = T / 2;
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + (FS.root + '/' + dir).slice(g.root.length + 1) : dir;
  const rowsT = Math.max(1, Math.floor(tsImg.height / T));
  const tiles = [];
  for (let i = 0; i < L.tsCols * rowsT; i++) {
    const k = `${i % L.tsCols}:${Math.floor(i / L.tsCols)}/0`;
    tiles.push(tileLines(k, kindOf(i), hT));
  }
  const tres = `[gd_resource type="TileSet" load_steps=3 format=3]\n\n[ext_resource type="Texture2D" path="${res}/tileset.png" id="1"]\n\n`
    + `[sub_resource type="TileSetAtlasSource" id="atlas"]\ntexture = ExtResource("1")\ntexture_region_size = Vector2i(${T}, ${T})\n${tiles.join('\n')}\n\n`
    + `[resource]\ntile_size = Vector2i(${T}, ${T})\n${TILESET_LAYERS}sources/0 = SubResource("atlas")\n`;
  const tilesGd = (base => (base ? base + '/' : '') + 'sprites/_kiln/level_tiles.gd')(res.replace(/(^|\/)levels\/[^/]+$/, ''));
  // res is ".../levels/<name>": the background scene lives next door in ".../backgrounds/<scene>/"
  const base = res.replace(/(^|\/)levels\/[^/]+$/, '');
  const bgRes = L.bg ? (base ? base + '/' : '') + `backgrounds/${L.bg}/${L.bg}.tscn` : null;
  // placed actors: one PackedScene per actor type, one instance each; the start is a Marker2D
  const ents = L.ents || [], types = [...new Set(ents.filter(e => e.type === 'actor').map(e => e.name))];
  const aid = n => 4 + types.indexOf(n), count = {};
  const entExt = types.map(n => `[ext_resource type="PackedScene" path="${(base ? base + '/' : '')}sprites/${n}/${n}.tscn" id="${aid(n)}"]\n`).join('');
  const entNodes = ents.map(e => e.type === 'start' ? `[node name="PlayerStart" type="Marker2D" parent="."]\nposition = Vector2(${e.x}, ${e.y})\n\n`
    : `[node name="${e.name}_${count[e.name] = (count[e.name] || 0) + 1}" parent="." instance=ExtResource("${aid(e.name)}")]\nposition = Vector2(${e.x}, ${e.y})\n\n`).join('');
  const tscn = `[gd_scene load_steps=${(bgRes ? 4 : 3) + types.length} format=3]\n\n[ext_resource type="TileSet" path="${res}/${L.name}.tres" id="1"]\n[ext_resource type="Script" path="${tilesGd}" id="3"]\n`
    + (bgRes ? `[ext_resource type="PackedScene" path="${bgRes}" id="2"]\n` : '') + entExt + `\n[node name="${L.name}" type="Node2D"]\n\n`
    + (bgRes ? `[node name="Background" parent="." instance=ExtResource("2")]\nposition = Vector2(0, ${(L.rows * T) - (V.bgView?.h || L.rows * T)})\n\n` : '')
    + `[node name="Tiles" type="TileMapLayer" parent="."]\ntexture_filter = 1\ntile_map_data = PackedByteArray(${tileMapData()})\ntile_set = ExtResource("1")\nscript = ExtResource("3")\n` + (entNodes ? '\n' + entNodes : '');
  const json = { background: L.bg || null, entities: (L.ents || []).map(({ type, name, x, y }) => ({ type, name, x, y })), tile: T, cols: L.cols, rows: L.rows, tileset: 'tileset.png', tilesetCols: L.tsCols, solid: L.solid, kinds: Object.fromEntries(Object.entries(L.kinds || {}).filter(([, k]) => k)), cells: L.cells, source: 'kiln' };
  try {
    await saveFiles(dir, [{ name: 'tileset.png', b64: toDataURL(tsImg) }, { name: `${L.name}.tres`, text: tres }, { name: `${L.name}.tscn`, text: tscn },
      { name: 'level.json', text: JSON.stringify(json) + '\n' }]);
    await saveFiles('sprites/_kiln', [{ name: 'level_tiles.gd', text: LEVEL_TILES_GD }]).catch(() => {});
    changed(); toast(`Saved to ${dir}/${g.root ? ' (Godot paths)' : ''}`, 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}

registerWheel('levels', () => ({
  tools: Array.from({ length: Math.min(12, tileCount()) }, (_, i) => ({ label: `Tile ${i + 1}`, on: L.pick === i, hint: kindOf(i), run: () => { L.pick = i; drawLeft(); } })),
  guides: [{ label: 'Tile grid', on: !!L?.grid, run: () => { L.grid = !L.grid; draw(); } }, { label: 'Show behaviours', on: !!V.showSolid, run: () => { V.showSolid = !V.showSolid; drawLeft(); draw(); } },
    { label: 'Save level', run: exportLevel }],
}));
registerKeys('levels', [['Left click', 'Paint the picked tile'], ['Right click', 'Erase'], ['Middle click', 'Pick the tile under the cursor'], ['Mouse wheel', 'Roll through tiles'], ['Ctrl+wheel', 'Zoom'], ['Shift+click a tile', 'Solid on/off (other behaviours: "Tile N is" under the tiles)']]);
