// Levels: paint a room from tiles (in the spirit of LDtk), mark which tiles are solid, export a Godot
// TileSet + TileMapLayer scene with collision. Left click paints, right click erases, wheel rolls tiles.
import { h, api, toast, on, emit, pref, clamp, field, range, select, seg, check, imgData, toCanvas, toDataURL, newImg, rawURL, checker, uid, fitZoom } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { loadActor } from './player.js';
import { openProjects } from './projects.js';
import { writeRuntime, rtRes, baseOf } from './layout.js';
import { registerWheel } from './wheel.js';
import { registerKeys } from './wheel.js';
import { loadOwners, claim } from './owners.js';
import { ZONE_KINDS, zoneAt, drawZones, zonePanel, zoneNodes, zoneShapes, ZONE_GD } from './zones.js';
import { TOOLS, brushCells, rectCells, lineCells, floodCells, copyCells, selRect, history } from './leveltools.js';
import { STYLES, buildPieces, appendPieces, fixAround, terrainOf, terrainHeader, terrainLines } from './autotile.js';
import { KINDS, kindColour, drawKind, tileLines, TILESET_LAYERS, LEVEL_TILES_GD } from './tilekinds.js';
import { layerPanel } from './layers.js';
import { CRATE_GD, drawCrates, crateParts } from './crates.js';
import { SHAPES as BODIES, physicsParts, drawPhysics } from './physics_godot.js';
import { P as gamePath, LOOK } from './gametype.js';
import { SHARP } from './gametype.js';

// Entities: things placed on the map (actors exported from Animate, the player start). x,y = feet, in level pixels.
let mode = 'tiles', zonePick = 'checkpoint', zoneSel = null, levelNames = [], entPick = 'start', actorList = [], sprites = {};   // sprites: actor name -> first idle frame (canvas)
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
// painting tools (leveltools.js): the tool, brush size, a selected rectangle, copied cells being stamped, Space held (pan)
let tool = pref.get('level.tool', 'brush'), bsize = 1, sel = null, clipC = null, stamping = false, spaceDown = false;
const H = history(() => ({ id: L.id, cols: L.cols, rows: L.rows, cells: L.cells, ents: L.ents || [], zones: L.zones || [] }),
  d => { if (d.id !== L.id) return toast('That undo belongs to another level'); delete d.id; Object.assign(L, d); changed(); drawLeft(); draw(); drawBar(); });
let L = null, V = {}, mounted = false, tsImg = null, zoom = 0, hover = null, drag = null, saveT;
// zoom steps (big Modern levels need to zoom out below 1×); the next one in or out from where it is now
const ZOOMS = [.25, .33, .5, .67, 1, 1.5, 2, 3, 4, 6, 8];
const nextZoom = (z, dir) => dir > 0 ? (ZOOMS.find(s => s > z + .01) || 8) : ([...ZOOMS].reverse().find(s => s < z - .01) || .25);
// zoom keeping the spot under the cursor (or the middle of the view) where it is
function zoomAt(dir, e) {
  const r1 = V.cv.getBoundingClientRect(), cx = e ? e.clientX : r1.left + V.vp.clientWidth / 2, cy = e ? e.clientY : r1.top + V.vp.clientHeight / 2;
  const px = (cx - r1.left) / V.z, py = (cy - r1.top) / V.z;
  zoom = nextZoom(V.z, dir); draw();
  const r2 = V.cv.getBoundingClientRect();
  V.vp.scrollLeft += r2.left + px * V.z - cx; V.vp.scrollTop += r2.top + py * V.z - cy;
}
// the last tiles and things used, as a strip over the map (Mario Maker's quick bar): 't<tile>' or 'e<thing>'
let recent = pref.get('level.recent', []);
const used = k => { recent = [k, ...recent.filter(x => x !== k)].slice(0, 10); pref.set('level.recent', recent); drawBar(); };
// what a tile does in the game (tilekinds.js); old levels only had `solid: [tile…]`
const kindOf = i => (L.kinds ||= Object.fromEntries((L.solid || []).map(k => [k, 'solid'])))[i] || '';
function setKind(i, k) { kindOf(i); if (k) L.kinds[i] = k; else delete L.kinds[i]; L.solid = Object.keys(L.kinds).filter(t => L.kinds[t] === 'solid').map(Number); changed(); }
const slug = s => (s || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'level';

// a new level is the size the game's path likes (gametype.js): wide for a side-scroller, 2×2 rooms top-down, one screen;
// path sizes are in 16 px tiles of a 480×270 screen, so they become screens and then tiles of the game's look
function blank(name = 'room') {
  const L0 = LOOK(), T = L0.tile, [c0, r0] = gamePath().level;
  const cols = Math.round(c0 / 30 * Math.ceil(L0.w / T)), rows = Math.round(r0 / 17 * Math.ceil(L0.h / T));
  return { id: uid(), name, tile: T, cols, rows, ts: null, tsCols: 8, solid: [0, 1, 2, 3, 5], kinds: { 0: 'solid', 1: 'solid', 2: 'solid', 3: 'solid', 5: 'solid' }, cells: Array(cols * rows).fill(-1), pick: 0, grid: true };
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
  L.ts = d.url; L.tile = d.tile; L.solid = []; L.kinds = {}; L.terrains = []; L.pick = 0; await loadTiles(); changed(); drawLeft(); draw();
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
      h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'Zoom'), Object.assign(select([[0, 'Fit'], [.25, '¼×'], [.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], zoom, v => { zoom = +v; draw(); }), { title: 'Map zoom (also Ctrl+wheel at the cursor, + and −)' }),
        h('button', { class: 'btn sm go', title: 'Save this level and play it with the player starting in the middle of what you see', onclick: playHere }, '▶ Play from here'),
        h('button', { class: 'ibtn' + (L.grid ? ' on' : ''), title: 'Tile grid', onclick: e => { L.grid = !L.grid; e.currentTarget.classList.toggle('on', L.grid); draw(); } }, '#'),
        V.bar = h('span', { class: 'lv-tools' }),
        h('span', { class: 'grow' }), V.info),
      V.vp,
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Left click paints · right click erases · B R L G I M tools · [ ] brush size · Ctrl+Z undo · Space+drag pans · Ctrl+wheel or + − zooms · wheel rolls tiles'))),
      V.right);
    bind();
    // keys work whenever Levels is the area on screen (clicking the map does not give it keyboard focus)
    document.addEventListener('keydown', e => { if (el.classList.contains('on') && !document.querySelector('.modal, .tour-bub, .dx-menu')) keys(e); });
    document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; V.cv.style.cursor = 'crosshair'; } });
    drawBar();
    new ResizeObserver(() => draw()).observe(V.vp);
    loadTiles().then(() => { drawLeft(); drawRight(); draw(); takeTs(); loadBg(); takeOpen(); });
  },
  // Save all / the demo game: open a saved level and save it for Godot
  async saveProject(id) { await openLevel(id); await exportLevel(); },
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

/* -------------------------------------------------------------- layers ---- */
// the map's layers, back to front; each can be hidden, locked or faded (L.view, kept with the level, not exported)
const LAYERS = [['bg', 'Background', 'the scene behind the map'], ['tiles', 'Tiles', 'walls, floors, ladders, spikes'], ['ents', 'Things', 'actors and the player start'], ['zones', 'Zones', 'areas that trigger things']];
const lay = id => ((L.view ||= {})[id] ||= {});
const shown = id => !lay(id).hidden, alpha = id => lay(id).opacity ?? 1;
function layersPanel() {
  const at = i => LAYERS[i][0], pick = i => { const id = at(i); if (id !== 'bg') { mode = id; } drawLeft(); draw(); };
  return layerPanel({
    items: LAYERS, sel: LAYERS.findIndex(l => l[0] === mode), key: l => l[0], name: l => l[1],
    sub: l => l[0] === 'tiles' ? `${L.cells.filter(t => t >= 0).length} placed` : l[0] === 'ents' ? `${(L.ents || []).length} placed` : l[0] === 'zones' ? `${(L.zones || []).length} zones` : (L.bg || 'none'),
    visible: l => shown(l[0]), locked: l => !!lay(l[0]).locked,
    on: {
      select: pick,
      visible: (i, v) => { lay(at(i)).hidden = !v; changed(); drawLeft(); draw(); },
      lock: (i, v) => { lay(at(i)).locked = v; changed(); drawLeft(); },
      opacity: { get: l => alpha(l[0]), set: (i, v) => { lay(at(i)).opacity = v; changed(); draw(); } },
    } });
}
// painting on a hidden or locked layer does nothing: say why
function blocked() {
  const l = lay(mode), name = LAYERS.find(x => x[0] === mode)[1];
  if (l.locked) { toast(`${name} is locked: click its lock in Layers to change it`, 'bad'); return true; }
  if (l.hidden) { toast(`${name} is hidden: show it in Layers first`, 'bad'); return true; }
  return false;
}

/* ------------------------------------------------------------- drawing ---- */
function draw() {
  if (!V.cv || !L || !tsImg) return;
  const T = L.tile, W = L.cols * T, H = L.rows * T;
  const z = zoom || fitZoom(V.vp.clientWidth - 30, V.vp.clientHeight - 30, W, H);
  V.z = z;
  V.cv.width = W * z; V.cv.height = H * z;
  const x = V.cv.getContext('2d'); x.imageSmoothingEnabled = false;
  checker(x, W * z, H * z, 8 * z, '#1a1a19', '#1f1f1e');
  if (bgLayers && shown('bg')) {
    // the scene is one screen tall; it sits at the bottom of the map and repeats across, each layer at its parallax rate
    const vh = V.bgView?.h || H, oy = H - vh;
    for (const b of bgLayers) {
      x.globalAlpha = b.opacity * alpha('bg');
      const bw = b.cv.width;
      for (let bx = 0; bx < W; bx += bw) x.drawImage(b.cv, bx * z, (oy + b.y) * z, bw * z, b.cv.height * z);
      x.globalAlpha = 1;
    }
  }
  const src = toCanvas(tsImg);
  x.globalAlpha = alpha('tiles');
  if (shown('tiles')) for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
    const t = L.cells[r * L.cols + c]; if (t < 0) continue;
    x.drawImage(src, (t % L.tsCols) * T, Math.floor(t / L.tsCols) * T, T, T, c * T * z, r * T * z, T * z, T * z);
  }
  x.globalAlpha = 1;
  if (L.grid) {
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.beginPath();
    for (let c = 1; c < L.cols; c++) { x.moveTo(c * T * z + .5, 0); x.lineTo(c * T * z + .5, H * z); }
    for (let r = 1; r < L.rows; r++) { x.moveTo(0, r * T * z + .5); x.lineTo(W * z, r * T * z + .5); }
    x.stroke();
  }
  if (gamePath().camera !== 'follow') {     // top-down rooms and one-screen puzzles: where each screen ends
    const RW = Math.ceil(LOOK().w / T) * T, RH = Math.ceil(LOOK().h / T) * T;
    x.save(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.setLineDash([6, 4]); x.beginPath();
    for (let c = RW; c < W; c += RW) { x.moveTo(c * z + .5, 0); x.lineTo(c * z + .5, H * z); }
    for (let r = RH; r < H; r += RH) { x.moveTo(0, r * z + .5); x.lineTo(W * z, r * z + .5); }
    x.stroke(); x.restore();
  }
  x.globalAlpha = alpha('ents');
  if (shown('ents')) { drawCrates(x, L.ents || [], src, T, L.tsCols, z); drawPhysics(x, L.ents || [], T, z); }
  for (const e of shown('ents') ? L.ents || [] : []) {
    const sp = e.type === 'actor' ? sprites[e.name] : null;
    if (sp) x.drawImage(sp, (e.x - sp.width / 2) * z, (e.y - sp.height) * z, sp.width * z, sp.height * z);
    else { x.fillStyle = e.type === 'start' ? '#9cc76b' : '#e3b04b'; x.fillRect((e.x - 1) * z, (e.y - 14) * z, 2 * z, 14 * z); x.fillRect((e.x + 1) * z, (e.y - 14) * z, 7 * z, 5 * z); }
    if (mode === 'ents') { x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect((e.x - 3) * z + .5, (e.y - 1) * z + .5, 6 * z, 2 * z); }
  }
  x.globalAlpha = alpha('zones');
  if ((L.zones || []).length && shown('zones')) drawZones(x, L.zones, z, zoneSel, mode === 'zones');
  x.globalAlpha = 1;
  if (drag?.t === 'zone' && drag.r) drawZones(x, [{ ...drag.r, kind: zonePick, id: 'new' }], z, 'new', true);
  if (V.showSolid) for (let i = 0; i < L.cells.length; i++) if (L.cells[i] >= 0) drawKind(x, kindOf(L.cells[i]), (i % L.cols) * T * z, Math.floor(i / L.cols) * T * z, T * z);
  // previews: the brush under the cursor, a rectangle or line being dragged, the selection, copied cells being stamped
  const ghost = (c, r, v) => { if (v < 0) { x.fillStyle = 'rgba(229,83,75,.35)'; x.fillRect(c * T * z, r * T * z, T * z, T * z); } else { x.globalAlpha = .55; x.drawImage(src, (v % L.tsCols) * T, Math.floor(v / L.tsCols) * T, T, T, c * T * z, r * T * z, T * z, T * z); x.globalAlpha = 1; } };
  if (drag?.p1) for (const [c, r] of (drag.t === 'rect' ? rectCells : lineCells)(L, drag.p0, drag.p1)) ghost(c, r, drag.v);
  else if (stamping && clipC && hover) { for (let r = 0; r < clipC.h; r++) for (let c = 0; c < clipC.w; c++) if (clipC.cells[r * clipC.w + c] >= 0) ghost(hover[0] + c, hover[1] + r, clipC.cells[r * clipC.w + c]); x.strokeStyle = '#e3b04b'; x.strokeRect(hover[0] * T * z + .5, hover[1] * T * z + .5, clipC.w * T * z - 1, clipC.h * T * z - 1); }
  else if (hover && mode === 'tiles' && !drag && tool !== 'select') {
    const cs = tool === 'brush' ? brushCells(L, hover, bsize) : [hover];
    if (tool !== 'pick') for (const [c, r] of cs) ghost(c, r, L.pick);
    x.strokeStyle = '#fff'; for (const [c, r] of cs) x.strokeRect(c * T * z + .5, r * T * z + .5, T * z - 1, T * z - 1);
  }
  if (sel) { x.save(); x.strokeStyle = '#e3b04b'; x.lineWidth = 2; x.setLineDash([5, 4]); x.strokeRect(sel.x * T * z + 1, sel.y * T * z + 1, sel.w * T * z - 2, sel.h * T * z - 2); x.restore(); }
  const used = L.cells.filter(t => t >= 0).length;
  V.info.textContent = `${L.cols}×${L.rows} tiles · ${W}×${H} px · ${used} placed${hover ? ` · ${hover[0]},${hover[1]}` : ''} · ${z}×`;
}
function cellAt(e) { const r = V.cv.getBoundingClientRect(), T = L.tile * V.z; const c = Math.floor((e.clientX - r.left) / T), w = Math.floor((e.clientY - r.top) / T); return c >= 0 && w >= 0 && c < L.cols && w < L.rows ? [c, w] : null; }
function putCell(c, r, t) {
  const i = r * L.cols + c, ter = t >= 0 && L.pickTer != null ? L.terrains?.[L.pickTer] : null;
  if (ter ? terrainOf(L.terrains, L.cells[i]) === ter : L.cells[i] === t) return;
  L.cells[i] = ter ? ter.first : t;
  if (L.terrains?.length) fixAround(L, c, r);      // autotile pieces next to it join up again
}
const putAll = (cells, t) => { for (const [c, r] of cells) putCell(c, r, t); draw(); };
function paint(p, t) { if (p) { putCell(p[0], p[1], t); draw(); } }
// copied cells placed with their top-left on p (empty cells in the copy leave what is there)
function stampAt(p) {
  for (let r = 0; r < clipC.h; r++) for (let c = 0; c < clipC.w; c++) { const t = clipC.cells[r * clipC.w + c], x = p[0] + c, y = p[1] + r; if (t >= 0 && x < L.cols && y < L.rows) { L.cells[y * L.cols + x] = t; } }
  if (L.terrains?.length) for (let r = -1; r <= clipC.h; r++) for (let c = -1; c <= clipC.w; c++) fixAround(L, p[0] + c, p[1] + r);
  changed(); draw();
}
const selCells = () => rectCells(L, [sel.x, sel.y], [sel.x + sel.w - 1, sel.y + sel.h - 1]);
function setTool(t) { tool = t; pref.set('level.tool', t); stamping = false; if (t !== 'select') sel = null; drawBar(); draw(); }
function drawBar() {
  if (!V.bar) return;
  const [u, r] = H.sizes;
  V.bar.replaceChildren(h('i', { class: 'sep' }),
    ...TOOLS.map(([id, label, key, glyph]) => h('button', { class: 'ibtn' + (tool === id ? ' on' : ''), title: `${label} (${key})`, onclick: () => setTool(id) }, glyph)),
    h('i', { class: 'sep' }), h('span', { class: 'lbl' }, 'Size'),
    ...[1, 2, 3].map(n => h('button', { class: 'ibtn' + (bsize === n ? ' on' : ''), title: `Brush ${n}×${n} ([ and ] change it)`, onclick: () => { bsize = n; drawBar(); } }, String(n))),
    h('i', { class: 'sep' }),
    h('button', { class: 'ibtn', title: 'Undo (Ctrl+Z)', disabled: !u, onclick: () => H.undo() }, '↶'), h('button', { class: 'ibtn', title: 'Redo (Ctrl+Y)', disabled: !r, onclick: () => H.redo() }, '↷'),
    sel ? h('span', { class: 'lv-sel' }, h('i', { class: 'sep' }), `${sel.w}×${sel.h}`,
      h('button', { class: 'btn sm ghost', title: 'Copy (Ctrl+C), then click to stamp it', onclick: () => copySel(false) }, 'Copy'),
      h('button', { class: 'btn sm ghost', title: 'Cut (Ctrl+X)', onclick: () => copySel(true) }, 'Cut'),
      h('button', { class: 'btn sm ghost danger', title: 'Clear the selection (Delete)', onclick: clearSel }, 'Clear')) : '',
    stamping ? h('span', { class: 'lv-sel' }, h('i', { class: 'sep' }), 'Stamping · click to place, Esc stops') : '',
    recent.length ? h('span', { class: 'lv-recent', title: 'Used lately: click to pick it again' }, h('i', { class: 'sep' }), ...recent.map(quick)) : '');
}
// one of the recent strip: a tile (its picture) or a thing (its name)
function quick(k) {
  const pickIt = () => { if (k[0] === 't') { mode = 'tiles'; L.pick = +k.slice(1); L.pickTer = null; } else { mode = 'ents'; entPick = k.slice(1); } drawLeft(); drawBar(); draw(); };
  if (k[0] === 't' && tsImg) {
    const t = +k.slice(1), T = L.tile, c = h('canvas', { width: T, height: T }); c.getContext('2d').drawImage(toCanvas(tsImg), (t % L.tsCols) * T, Math.floor(t / L.tsCols) * T, T, T, 0, 0, T, T);
    return h('button', { class: 'lv-q' + (mode === 'tiles' && L.pick === t ? ' on' : ''), title: `Tile ${t + 1}`, onclick: pickIt }, c);
  }
  const n = k.slice(1).replace('body:', '');
  return h('button', { class: 'lv-q txt' + (mode === 'ents' && entPick === k.slice(1) ? ' on' : ''), title: n, onclick: pickIt }, n === 'start' ? '⚑' : n.slice(0, 6));
}
// ▶ Play from here: save, then play this level alone with the player in the middle of the view (no title, no Flow)
async function playHere() {
  await exportLevel();
  const r = V.cv.getBoundingClientRect(), vr = V.vp.getBoundingClientRect();
  const x = Math.round((Math.max(r.left, vr.left) + Math.min(r.right, vr.right)) / 2 - r.left) / V.z, y = Math.round((Math.max(r.top, vr.top) + Math.min(r.bottom, vr.bottom)) / 2 - r.top) / V.z;
  pref.set('play.from', { level: `res://levels/${L.name}/${L.name}.tscn`, x: Math.round(x), y: Math.round(y) });
  emit('play');
}
function copySel(cut) { if (!sel) return; clipC = copyCells(L, sel); if (cut) { H.push(); putAll(selCells(), -1); changed(); } stamping = true; toast(`${cut ? 'Cut' : 'Copied'} ${sel.w}×${sel.h}: click to stamp it, Esc to stop`); sel = null; drawBar(); draw(); }
function clearSel() { if (!sel) return; H.push(); putAll(selCells(), -1); changed(); drawBar(); }
function keys(e) {
  if (e.target.matches('textarea,select,input:not([type=checkbox]):not([type=range])')) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? H.redo() : H.undo(); drawBar(); return; }
  if (ctrl && k === 'y') { e.preventDefault(); H.redo(); drawBar(); return; }
  if (ctrl && (k === 'c' || k === 'x') && sel) { e.preventDefault(); copySel(k === 'x'); return; }
  if (ctrl && k === 'v' && clipC) { e.preventDefault(); stamping = true; drawBar(); draw(); return; }
  if (ctrl || e.altKey) return;
  if (k === 'escape') { sel = null; stamping = false; drawBar(); draw(); return; }
  if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); clearSel(); return; }
  if (k === ' ') { e.preventDefault(); spaceDown = true; V.cv.style.cursor = 'grab'; return; }
  if (k === '[' || k === ']') { bsize = Math.max(1, Math.min(3, bsize + (k === ']' ? 1 : -1))); drawBar(); draw(); return; }
  if (k === '+' || k === '=' || k === '-') { zoomAt(k === '-' ? -1 : 1); return; }
  const t = mode === 'tiles' && TOOLS.find(t => t[2].toLowerCase() === k);
  if (t) setTool(t[0]);
}
function bind() {
  V.cv.addEventListener('contextmenu', e => e.preventDefault());
  // a character from the asset shelf: placed with its feet on the tile under the drop
  V.cv.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-kiln-asset')) e.preventDefault(); });
  V.cv.addEventListener('drop', e => {
    let a; try { a = JSON.parse(e.dataTransfer.getData('application/x-kiln-asset')); } catch { return; }
    e.preventDefault();
    if (a.kind !== 'actor') return toast('Drop a character here (from the asset shelf) to place it');
    const p = cellAt(e); if (!p) return;
    H.push(); (L.ents ||= []).push({ id: uid(), type: 'actor', name: a.name, x: p[0] * L.tile + L.tile / 2, y: (p[1] + 1) * L.tile });
    if (!actorList.includes(a.name)) loadActorList();
    changed(); draw(); drawLeft();
  });
  V.cv.addEventListener('pointerdown', e => {
    if (blocked()) return;
    V.cv.setPointerCapture(e.pointerId);
    if (mode !== 'tiles') { H.push(); drawBar(); }
    if (mode === 'zones') {
      const r = V.cv.getBoundingClientRect(), px = (e.clientX - r.left) / V.z, py = (e.clientY - r.top) / V.z, T = L.tile;
      const hit = zoneAt(L.zones || [], px, py);
      if (e.button === 2) { if (hit) { L.zones = L.zones.filter(q => q !== hit); zoneSel = null; changed(); drawLeft(); draw(); } return; }
      if (hit) { zoneSel = hit.id; drawLeft(); draw(); return; }
      drag = { t: 'zone', c0: [Math.floor(px / T), Math.floor(py / T)], r: null }; return;
    }
    if (mode === 'ents') {
      const r = V.cv.getBoundingClientRect(), px = (e.clientX - r.left) / V.z, py = (e.clientY - r.top) / V.z;
      L.ents = L.ents || [];
      if (e.button === 2) {     // right click removes the nearest entity
        let bi = -1, bd = 1e9; L.ents.forEach((en, i) => { const d = Math.hypot(en.x - px, en.y - 8 - py); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0 && bd < L.tile * 1.5) { L.ents.splice(bi, 1); changed(); draw(); drawLeft(); }
        return;
      }
      // on a thing already placed: drag it somewhere else
      const near = [...L.ents].reverse().find(en => Math.abs(en.x - px) < L.tile * .7 && py < en.y + 2 && py > en.y - L.tile * 1.6);
      if (near) { drag = { t: 'ent', en: near }; return; }
      // feet snap to the top of the tile under the cursor, centred in the column
      const cx = Math.floor(px / L.tile), cy = Math.floor(py / L.tile);
      used('e' + entPick);
      const foot = { x: cx * L.tile + L.tile / 2, y: (cy + 1) * L.tile };
      const en = entPick === 'crate' ? { id: uid(), type: 'crate', name: 'Crate', tile: L.pick, ...foot }
        : entPick.startsWith('body:') ? { id: uid(), type: 'body', name: entPick.slice(5), shape: entPick.slice(5), ...foot }
        : entPick === 'button' || entPick === 'gate' ? { id: uid(), type: entPick, name: entPick, ...foot }
        : { id: uid(), type: entPick === 'start' ? 'start' : 'actor', name: entPick === 'start' ? 'PlayerStart' : entPick, x: cx * L.tile + L.tile / 2, y: (cy + 1) * L.tile };
      if (en.type === 'start') L.ents = L.ents.filter(q => q.type !== 'start');   // only one start
      L.ents.push(en); changed(); draw(); drawLeft(); return;
    }
    if (spaceDown || (e.button === 1 && e.shiftKey)) { drag = { t: 'pan', x: e.clientX, y: e.clientY, sl: V.vp.scrollLeft, st: V.vp.scrollTop }; V.cv.style.cursor = 'grabbing'; return; }
    const p = cellAt(e); if (!p) return;
    if (e.button === 1 || (tool === 'pick' && e.button === 0)) { const t = L.cells[p[1] * L.cols + p[0]]; if (t >= 0) { L.pick = t; L.pickTer = null; drawLeft(); if (tool === 'pick') setTool('brush'); } return; }
    if (stamping && clipC && e.button === 0) { H.push(); stampAt(p); drawBar(); return; }
    if (stamping && e.button === 2) { stamping = false; drawBar(); draw(); return; }
    if (tool === 'select') { drag = { t: 'sel', p0: p }; sel = selRect(p, p); drawBar(); draw(); return; }
    const v = e.button === 2 ? -1 : L.pick;
    if (v >= 0) used('t' + v);
    H.push(); drawBar();
    if (tool === 'fill') { putAll(floodCells(L, p), v); changed(); return; }
    if (tool === 'rect' || tool === 'line') { drag = { t: tool, v, p0: p, p1: p }; draw(); return; }
    drag = { t: 'brush', v }; putAll(brushCells(L, p, bsize), v);
  });
  V.cv.addEventListener('pointermove', e => {
    if (drag?.t === 'zone') {      // a zone snaps to whole tiles
      const p = cellAt(e); if (!p) return; const [c0, r0] = drag.c0, T = L.tile;
      drag.r = { x: Math.min(c0, p[0]) * T, y: Math.min(r0, p[1]) * T, w: (Math.abs(p[0] - c0) + 1) * T, h: (Math.abs(p[1] - r0) + 1) * T }; draw(); return;
    }
    if (drag?.t === 'pan') { V.vp.scrollLeft = drag.sl - (e.clientX - drag.x); V.vp.scrollTop = drag.st - (e.clientY - drag.y); return; }
    if (drag?.t === 'ent') { const p = cellAt(e); if (p) { drag.en.x = p[0] * L.tile + L.tile / 2; drag.en.y = (p[1] + 1) * L.tile; drag.moved = true; draw(); } return; }
    hover = mode === 'tiles' ? cellAt(e) : null;
    if (drag?.t === 'brush' && hover) putAll(brushCells(L, hover, bsize), drag.v);
    else if ((drag?.t === 'rect' || drag?.t === 'line') && hover) { drag.p1 = hover; draw(); }
    else if (drag?.t === 'sel' && hover) { sel = selRect(drag.p0, hover); drawBar(); draw(); }
    else draw();
  });
  const up = () => {
    if (drag?.t === 'zone') {
      const r = drag.r || { x: drag.c0[0] * L.tile, y: drag.c0[1] * L.tile, w: L.tile, h: L.tile }; drag = null;
      const q = { id: uid(), kind: zonePick, ...r, name: '', text: '', target: '', once: zonePick === 'message' };
      (L.zones ||= []).push(q); zoneSel = q.id; changed(); drawLeft(); draw(); return;
    }
    if (drag?.t === 'rect' || drag?.t === 'line') putAll((drag.t === 'rect' ? rectCells : lineCells)(L, drag.p0, drag.p1), drag.v);
    if (drag?.t === 'pan') V.cv.style.cursor = spaceDown ? 'grab' : 'crosshair';
    if (drag?.t === 'pan' || drag?.t === 'sel') { drag = null; return; }
    if (drag?.t === 'ent') { const m = drag.moved; drag = null; if (m) { changed(); drawLeft(); } return; }
    if (drag) { drag = null; changed(); }
  };
  V.cv.addEventListener('pointerup', up); V.cv.addEventListener('pointercancel', up);
  V.cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  V.vp.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.altKey) { zoomAt(e.deltaY < 0 ? 1 : -1, e); return; }
    const n = tileCount(); if (!n) return;
    L.pick = ((L.pick + (e.deltaY > 0 ? 1 : -1)) % n + n) % n; L.pickTer = null; drawLeft(); draw();
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
      onclick: e => { if (e.shiftKey) setKind(i, kindOf(i) === 'solid' ? '' : 'solid'); else { L.pick = i; L.pickTer = null; } drawLeft(); draw(); } }, c);
  }));
  const name = h('input', { type: 'text', value: L.name, onchange: () => { L.name = slug(name.value); name.value = L.name; changed(); drawRight(); } });
  const cols = h('input', { type: 'number', value: L.cols, min: 4, max: 400, title: 'Width in tiles (then Set)', style: { width: '60px' } }), rows = h('input', { type: 'number', value: L.rows, min: 4, max: 200, title: 'Height in tiles (then Set)', style: { width: '60px' } });
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Level', h('span', { class: 'grow' }),
        h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy or remove your levels', onclick: openMenu }, 'Open'),
        h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'Start a new empty level (this one is kept)', onclick: () => { const n = prompt('Name for the new level', 'room'); if (!n) return; L = { ...blank(slug(n)), ts: L.ts, tile: L.tile, solid: L.solid, kinds: { ...(L.kinds || {}) } }; loadTiles().then(() => { changed(); drawLeft(); drawRight(); draw(); }); } }, 'New')),
      field('Name', name),
      field('Size', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, cols, '×', rows,
        h('button', { class: 'btn sm', title: 'Resize the level in tiles (tiles stay where they are)', onclick: () => { H.push(); resize(+cols.value, +rows.value); drawBar(); } }, 'Set'),
        h('button', { class: 'btn sm ghost danger', title: 'Remove every tile, thing and zone (Ctrl+Z brings them back)', onclick: () => { if (!confirm('Clear the whole level? Ctrl+Z undoes it.')) return; H.push(); L.cells = L.cells.map(() => -1); L.ents = []; L.zones = []; changed(); drawLeft(); draw(); drawBar(); } }, 'Clear')), 'In tiles. 480×270 px is 30×17 tiles of 16'),
      field('Background', V.bgSel = select([['', 'None']], L.bg || '', v => { L.bg = v || null; changed(); loadBg(); }), 'A scene from Scenes, shown behind the map and placed behind it in Godot'),
      field('Tile', seg([[8, '8'], [16, '16'], [32, '32']], L.tile, v => { L.tile = +v; L.ts = null; L.terrains = []; loadTiles().then(() => { changed(); drawLeft(); draw(); }); }), 'Pixels per tile')),
    h('div', { class: 'sec' }, h('h3', {}, 'Layers', h('span', { class: 'grow' }), h('small', {}, 'pick one to paint on it')), layersPanel(),
      mode === 'zones' ? zonesUI() : null,
      mode === 'ents' ? [h('div', { class: 'entlist' },
          h('button', { class: entPick === 'start' ? 'on' : '', title: 'Where the player appears (exported as a Marker2D named PlayerStart)', onclick: () => { entPick = 'start'; drawLeft(); } }, '⚑ Player start'),
          h('button', { class: entPick === 'crate' ? 'on' : '', title: 'A box the player pushes by walking into it; it falls and lands on whole tiles. It looks like the tile picked under Tiles.', onclick: () => { entPick = 'crate'; drawLeft(); } }, '▣ Crate'),
          ...Object.entries(BODIES).map(([k, [label, , , c, what]]) => h('button', { class: entPick === 'body:' + k ? 'on' : '', title: what + ' (real physics: Help → Physics guide)', onclick: () => { entPick = 'body:' + k; drawLeft(); } }, h('i', { class: 'ph-dot', style: { background: c } }), label)),
          h('button', { class: entPick === 'button' ? 'on' : '', title: 'A pressure plate: while anything heavy stands on it, every gate in the level is open', onclick: () => { entPick = 'button'; drawLeft(); } }, '▁ Button'),
          h('button', { class: entPick === 'gate' ? 'on' : '', title: 'A gate that rises while a button is held down', onclick: () => { entPick = 'gate'; drawLeft(); } }, '▮ Gate'),
          ...actorList.map(a => h('button', { class: entPick === a ? 'on' : '', title: `Place ${a} (its Godot scene, with hitbox and juice)`, onclick: () => { entPick = a; drawLeft(); } }, sprites[a] ? (() => { const c = h('canvas', { width: sprites[a].width, height: sprites[a].height }); c.getContext('2d').drawImage(sprites[a], 0, 0); return c; })() : null, a))),
        h('p', { class: 'note' }, actorList.length ? 'Left click places on the tile under the cursor (feet on its top). Right click removes.' : 'Save an actor in Animate to place it here. The player start works now.'),
        h('p', { class: 'note' }, `${(L.ents || []).length} placed · `, h('a', { href: '#', onclick: e => { e.preventDefault(); import('./guide_physics.js').then(m => m.openPhysicsGuide()); } }, 'how physics things work'))] : null),
    mode !== 'tiles' ? '' : h('div', { class: 'sec' }, h('h3', {}, 'Tiles', h('span', { class: 'grow' }), h('small', {}, `${n} tiles`)), tiles,
      n ? h('div', { class: 'kindpick' }, h('span', { class: 'fl' }, `Tile ${L.pick + 1} is`),
        h('div', { class: 'kinds' }, ...KINDS.map(([id, label, c, hint]) => h('button', { class: kindOf(L.pick) === id ? 'on' : '', style: { '--kc': c }, title: hint, onclick: () => { setKind(L.pick, id); drawLeft(); if (!V.showSolid) { V.showSolid = true; } draw(); } }, label)))) : null,
      n ? autotileUI() : null,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', title: 'Use any image as the tileset: it is cut into tiles of the size above', onclick: pickTileset }, 'Tileset image…'),
        h('button', { class: 'btn sm ghost', title: 'Go back to the built-in starter tiles', onclick: () => { L.ts = null; L.terrains = []; loadTiles().then(() => { changed(); drawLeft(); draw(); }); } }, 'Starter tiles'),
        h('button', { class: 'btn sm ghost' + (V.showSolid ? ' on' : ''), title: 'Show what each tile does on the map (solid red, one-way yellow, ladders green, hazards purple, water blue)', onclick: () => { V.showSolid = !V.showSolid; drawLeft(); draw(); } }, 'Show behaviours'))));
  fillBgSel();
  if (mode === 'ents' && !actorList.length && !V.listed) { V.listed = true; loadActorList(); }
}
// autotile: make a 16-piece set from the picked tile, and paint with a set so edges join up
function autotileUI() {
  const style = V.atStyle || 'grass';
  return h('div', { class: 'kindpick' }, h('span', { class: 'fl' }, 'Autotile (edges and corners join up as you paint)'),
    (L.terrains || []).length ? h('div', { class: 'kinds', style: { marginBottom: '6px' } }, ...L.terrains.map((t, i) => h('button', { class: L.pickTer === i ? 'on' : '', style: { '--kc': '#9cc76b' }, title: `Paint with "${t.name}": each tile picks its edge piece from its neighbours`, onclick: () => { L.pickTer = L.pickTer === i ? null : i; drawLeft(); } }, '▦ ' + t.name))) : '',
    h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, Object.assign(select(STYLES, style, v => { V.atStyle = v; }), { title: 'How the autotile draws its edges: a grass top, a lit top edge, or an outline' }),
      h('button', { class: 'btn sm', title: `Build 16 pieces (caps, edges, corners) from tile ${L.pick + 1} and add them to the tileset`, onclick: makeAutotile }, `From tile ${L.pick + 1}`)));
}
async function makeAutotile() {
  const T = L.tile, cols = L.tsCols, src = L.pick;
  const cv = document.createElement('canvas'); cv.width = T; cv.height = T; cv.getContext('2d').drawImage(toCanvas(tsImg), (src % cols) * T, Math.floor(src / cols) * T, T, T, 0, 0, T, T);
  const tile = cv.getContext('2d').getImageData(0, 0, T, T);
  const { url, first } = appendPieces(tsImg, T, buildPieces(tile, T, V.atStyle || 'grass'));
  const name = slug(prompt('Name for this autotile', ['ground', 'wall', 'stone', 'platform'][(L.terrains || []).length % 4]) || 'ground');
  L.ts = url; await loadTiles();
  (L.terrains ||= []).push({ name, first });
  for (let m = 0; m < 16; m++) { kindOf(first + m); L.kinds[first + m] = kindOf(src) || 'solid'; }
  L.solid = Object.keys(L.kinds).filter(t => L.kinds[t] === 'solid').map(Number);
  L.pickTer = L.terrains.length - 1; changed(); drawLeft(); draw();
  toast(`Autotile "${name}": paint with it and edges join up`, 'ok');
}
function zonesUI() {
  const zs = L.zones || [], sel = zs.find(q => q.id === zoneSel);
  if (!V.lvListed) { V.lvListed = true; api('/api/fs?path=' + encodeURIComponent(FS.root + '/levels')).then(r => { levelNames = (r.items || []).filter(i => i.dir).map(i => i.name); if (mode === 'zones') drawLeft(); }).catch(() => {}); }
  return [h('div', { class: 'kinds', style: { marginTop: '8px' } }, ...ZONE_KINDS.map(([id, label, c, hint]) => h('button', { class: zonePick === id ? 'on' : '', style: { '--kc': c }, title: hint, onclick: () => { zonePick = id; drawLeft(); } }, label))),
    h('p', { class: 'note' }, 'Drag on the map to draw a zone (it snaps to tiles). Click one to edit it, right click removes it.'),
    sel ? zonePanel(sel, levelNames.filter(n => n !== L.name), redo => { changed(); draw(); if (redo) drawLeft(); }, () => { L.zones = zs.filter(q => q !== sel); zoneSel = null; changed(); drawLeft(); draw(); })
      : h('p', { class: 'note' }, `${zs.length} zone${zs.length === 1 ? '' : 's'}`)];
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
  i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { L.ts = r.result; L.solid = []; L.kinds = {}; L.terrains = []; await loadTiles(); L.pick = 0; changed(); drawLeft(); draw(); toast(`Tileset: ${tileCount()} tiles of ${L.tile} px. Pick a tile, then set what it does`); }; r.readAsDataURL(f); };
  i.click();
}
function openMenu() {
  openProjects('level', { current: L.name, open: p => openLevel(p.id),
    renamed: n => { L.name = n; pref.set('level.cur', L); drawLeft(); drawRight(); },
    removed: () => { L = blank(); pref.set('level.cur', L); loadTiles().then(() => { drawLeft(); drawRight(); draw(); }); } });
}
async function openLevel(id) {
  const d = await (await fetch('/api/project?id=' + encodeURIComponent(id))).json();
  L = d.level; await loadTiles(); pref.set('level.cur', L); drawLeft(); drawRight(); draw(); loadBg();
}
// Stage's "open this level": by its saved name
let pendingOpen = null;
on('open-level', n => { pendingOpen = n; if (mounted) takeOpen(); });
async function takeOpen() {
  if (!pendingOpen) return;
  const n = pendingOpen; pendingOpen = null;
  const p = (await api('/api/projects').catch(() => [])).find(p => p.kind === 'level' && p.name === n);
  p ? openLevel(p.id) : toast(`No Kiln project for level "${n}"`, 'bad');
}

/* ---------------------------------------------------------- export ---- */
function drawRight() {
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
    h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `levels/${L.name}/`), ' gets the tileset PNG, a Godot TileSet (.tres) with each tile\'s collision and kind, and a scene (.tscn) with a TileMapLayer running _kiln/level_tiles.gd (kind_at(), hazards hurt).'),
    h('button', { 'data-file': 'save', class: 'btn go wide', title: 'Write the level for Godot', onclick: exportLevel }, 'Save ' + L.name)));
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
    tiles.push(tileLines(k, kindOf(i), hT) + terrainLines(k, L.terrains, i));
  }
  const tres = `[gd_resource type="TileSet" load_steps=3 format=3]\n\n[ext_resource type="Texture2D" path="${res}/tileset.png" id="1"]\n\n`
    + `[sub_resource type="TileSetAtlasSource" id="atlas"]\ntexture = ExtResource("1")\ntexture_region_size = Vector2i(${T}, ${T})\n${tiles.join('\n')}\n\n`
    + `[resource]\ntile_size = Vector2i(${T}, ${T})\n${TILESET_LAYERS}${terrainHeader(L.terrains)}sources/0 = SubResource("atlas")\n`;
  const zoneGd = rtRes(baseOf(res), 'zone'), tilesGd = rtRes(baseOf(res), 'tiles');
  // res is ".../levels/<name>": the background scene lives next door in ".../backgrounds/<scene>/"
  const base = res.replace(/(^|\/)levels\/[^/]+$/, '');
  const bgRes = L.bg ? (base ? base + '/' : '') + `backgrounds/${L.bg}/${L.bg}.tscn` : null;
  // placed actors: one PackedScene per actor type, one instance each; the start is a Marker2D
  const ents = L.ents || [], types = [...new Set(ents.filter(e => e.type === 'actor').map(e => e.name))];
  const aid = n => 4 + types.indexOf(n), count = {};
  const entExt = types.map(n => `[ext_resource type="PackedScene" path="${(base ? base + '/' : '')}sprites/${n}/${n}.tscn" id="${aid(n)}"]\n`).join('');
  const crates = crateParts(ents, T, L.tsCols, `${res}/tileset.png`, rtRes(baseOf(res), 'crate'));
  const phys = physicsParts(ents, T, key => rtRes(baseOf(res), key));
  const entNodes = ents.filter(e => e.type === 'start' || e.type === 'actor').map(e => e.type === 'start' ? `[node name="PlayerStart" type="Marker2D" parent="."]\nposition = Vector2(${e.x}, ${e.y})\n\n`
    : `[node name="${e.name}_${count[e.name] = (count[e.name] || 0) + 1}" parent="." instance=ExtResource("${aid(e.name)}")]\nposition = Vector2(${e.x}, ${e.y})\n\n`).join('');
  const zones = L.zones || [];
  const tscn = `[gd_scene load_steps=${(bgRes ? 4 : 3) + types.length + (zones.length ? 1 + zones.length : 0)} format=3]\n\n[ext_resource type="TileSet" path="${res}/${L.name}.tres" id="1"]\n[ext_resource type="Script" path="${tilesGd}" id="3"]\n`
    + (zones.length ? `[ext_resource type="Script" path="${zoneGd}" id="zone"]\n` : '')
    + (bgRes ? `[ext_resource type="PackedScene" path="${bgRes}" id="2"]\n` : '') + entExt + crates.ext + phys.ext + '\n' + zoneShapes(zones) + crates.subs + phys.subs + `[node name="${L.name}" type="Node2D"]\n\n`
    + (bgRes ? `[node name="Background" parent="." instance=ExtResource("2")]\nposition = Vector2(0, ${(L.rows * T) - (V.bgView?.h || L.rows * T)})\n\n` : '')
    + `[node name="Tiles" type="TileMapLayer" parent="."]\n${SHARP()}tile_map_data = PackedByteArray(${tileMapData()})\ntile_set = ExtResource("1")\nscript = ExtResource("3")\n` + (entNodes ? '\n' + entNodes : '') + (crates.nodes ? '\n' + crates.nodes : '') + (phys.nodes ? '\n' + phys.nodes : '')
    + (zones.length ? `\n[node name="Zones" type="Node2D" parent="."]\n\n` + zoneNodes(zones, base ? base + '/' : '', 'zone') : '');
  const json = { background: L.bg || null, entities: (L.ents || []).map(({ type, name, x, y, tile, shape, colour }) => ({ type, name, x, y, tile, shape, colour })), tile: T, cols: L.cols, rows: L.rows, tileset: 'tileset.png', tilesetCols: L.tsCols, solid: L.solid, kinds: Object.fromEntries(Object.entries(L.kinds || {}).filter(([, k]) => k)), cells: L.cells, zones: zones.map(({ id, ...q }) => q), source: 'kiln' };
  try {
    await saveFiles(dir, [{ name: 'tileset.png', b64: toDataURL(tsImg) }, { name: `${L.name}.tres`, text: tres }, { name: `${L.name}.tscn`, text: tscn },
      { name: 'level.json', text: JSON.stringify(json) + '\n' }]);
    await writeRuntime({ tiles: LEVEL_TILES_GD, zone: ZONE_GD, ...(crates.nodes ? { crate: CRATE_GD } : {}), ...(phys.runtime || {}) }).catch(() => {});
    changed(); toast(`Saved to ${dir}/${g.root ? ' (Godot paths)' : ''}`, 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}

registerWheel('levels', () => ({
  tools: Array.from({ length: Math.min(12, tileCount()) }, (_, i) => ({ label: `Tile ${i + 1}`, on: L.pick === i, hint: kindOf(i), run: () => { L.pick = i; drawLeft(); } })),
  guides: [{ label: 'Tile grid', on: !!L?.grid, run: () => { L.grid = !L.grid; draw(); } }, { label: 'Show behaviours', on: !!V.showSolid, run: () => { V.showSolid = !V.showSolid; drawLeft(); draw(); } },
    { label: 'Save level', run: exportLevel }],
}));
registerKeys('levels', [['B R L G I M', 'Brush, Rectangle, Line, Fill, Pick, Select'], ['[ ]', 'Brush size 1–3'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / X / V', 'Copy / cut the selection, then click to stamp it'], ['Delete', 'Clear the selection'], ['Space+drag', 'Pan'], ['+ / −', 'Zoom'], ['Esc', 'Stop stamping / drop the selection'], ['Left click', 'Paint the picked tile'], ['Right click', 'Erase'], ['Middle click', 'Pick the tile under the cursor'], ['Mouse wheel', 'Roll through tiles'], ['Ctrl+wheel', 'Zoom'], ['Shift+click a tile', 'Solid on/off (other behaviours: "Tile N is" under the tiles)']]);
