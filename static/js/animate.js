// Animate: pixel editor + timeline + live previewer + motion generators; saving lives in actor_save.js (Godot files: actor_godot.js).
import { $, h, api, toast, emit, on, pref, clamp, uid, field, range, select, check, seg, hex, rgb, luma,
  newImg, cloneImg, toCanvas, toDataURL, imgData, blit, bbox, flipX, shift, colorsOf, pixelize, rawURL, checker, HARDWARE, PALETTES, fitZoom, artCtx } from './core.js';
import { icon } from './icons.js';
import { Player, loadActor } from './player.js';
import { MOTIONS } from './motion.js';
import { openSlicer } from './slicer.js';
import { SETS, makeTemplate, readTemplate, download as downloadSheet } from './sheets.js';
import { registerWheel, registerMenu } from './wheel.js';
import { loadOwners, claim } from './owners.js';
import { openWorkshop } from './workshop.js';
import { openProjects } from './projects.js';
import { saveActor } from './actor_save.js';
import { shrinkActor, bodyBoxOf, guessHits } from './actor_tools.js';
import { openPuppet } from './puppet.js';
import { saveFiles, S as FS } from './files.js';

const ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'attack', 'hurt', 'death', 'crouch', 'cast', 'climb', 'dash', 'block', 'spin'];
const A = {
  actor: null, ai: 0, fi: 0, tool: 'pencil', c1: [0, 0, 0], c2: null, zoom: pref.get('anim.zoom', 0), grid: pref.get('anim.grid', true),
  onion: pref.get('anim.onion', true), mirror: false, sel: null, float: null, undo: [], redo: [], dirty: false, hw: pref.get('anim.hw', 'snes'),
  motion: null, mp: {},
};
let V = {}, mounted = false, pending = [];
const anim = () => A.actor.anims[A.ai];
const frame = () => anim()?.frames[A.fi];

function blankActor(name = 'new_actor', w = 32, hh = 32, pal = null) {
  return { id: uid(), name, w, h: hh, desc: '', pal: pal || PALETTES.sweetie.colors.slice(), anims: [{ name: 'idle', fps: 8, loop: true, frames: [newImg(w, hh)] }] };
}

on('to-animate', d => { pending.push(['forge', d]); if (mounted) drain(); });
on('open-actor', d => { pending.push(['open', d]); if (mounted) drain(); });
on('shrink-actor', d => { pending.push(['shrink', d]); if (mounted) drain(); });
on('slice-sheet', d => { pending.push(['slice', d]); if (mounted) drain(); });
on('tune-actor', d => { pending.push(['tune', d]); if (mounted) drain(); });

export const animate = {
  id: 'animate', title: 'Animate', key: '3',
  mount(el) {
    el.className = 'view ws';
    mounted = true;
    A.actor = restore() || blankActor();
    build(el);
    // drop a sprite sheet (or a single image) anywhere on this tab: it goes straight to the slicer
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); el.classList.add('dropping'); } });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('dropping'); });
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('dropping');
      const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
      if (!f) return toast('Drop an image (PNG, GIF, WebP, JPG)', 'bad');
      const r = new FileReader(); r.onload = () => sliceInto(r.result, f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f);
    });
    drain();
  },
  show() { refreshAll(); },
  // Save all / the demo game: open a saved actor and save it for Godot
  async saveProject(id) { await openProject(id); return exportActor(); },
};

async function drain() {
  while (pending.length) {
    const [k, d] = pending.shift();
    if (k === 'forge') fromForge(d);
    if (k === 'open') await openActorDir(d);
    if (k === 'shrink') { const ok = await fetch('/api/project?id=actor-' + d).then(r => r.ok); if (ok) await openProject('actor-' + d); else await openActorDir(FS.root + '/sprites/' + d); shrinkCopy(); }
    if (k === 'tune') await keepTuning(d);
    if (k === 'slice') typeof d === 'string' ? sliceInto(rawURL(d), d.split('/').pop().replace(/\.\w+$/, '')) : sliceInto(d.url, d.name);
  }
}

// Stage's "Keep in actor": open the actor, take the playtested numbers (brain + hit reaction) and save it
async function keepTuning({ name, brain, react }) {
  if (A.actor.name !== name) { const ok = await fetch('/api/project?id=actor-' + name).then(r => r.ok); if (ok) await openProject('actor-' + name); else await openActorDir(FS.root + '/sprites/' + name); }
  if (A.actor.name !== name) return toast('Could not open ' + name, 'bad');
  pushUndo();
  A.actor.brainParams = { ...A.actor.brainParams, ...brain }; A.actor.react = { ...A.actor.react, ...react };
  changed(); if (await exportActor()) toast(`Kept the playtest numbers in ${name}`, 'ok');
}

/* --------------------------------------------------------- persistence ---- */
function serialize(a = A.actor) {
  return { meta: { kind: 'actor', name: a.name, thumb: a.anims[0]?.frames[0] ? toDataURL(a.anims[0].frames[0]) : null },
    actor: { ...a, anims: a.anims.map(n => ({ ...n, frames: n.frames.map(f => toDataURL(f)), boxes: n.frames.map(f => f.boxes || null) })) } };
}
async function deserialize(d) {
  const a = d.actor;
  const anims = [];
  for (const n of a.anims) { const frames = await Promise.all(n.frames.map(u => imgData(u))); (n.boxes || []).forEach((b, i) => { if (b && frames[i]) frames[i].boxes = b; }); const { boxes, ...rest } = n; anims.push({ ...rest, frames }); }
  return { ...a, anims };
}
const cloneF = f => { const c = cloneImg(f); if (f.boxes) c.boxes = JSON.parse(JSON.stringify(f.boxes)); return c; };      // a frame with its hit/hurt boxes
function snapshot() { return { ...A.actor, pal: A.actor.pal.map(c => c.slice()), anims: A.actor.anims.map(n => ({ ...n, frames: n.frames.map(cloneF) })) }; }
function pushUndo() { A.undo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); if (A.undo.length > 40) A.undo.shift(); A.redo = []; }
function undo() { if (!A.undo.length) return; A.redo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); const s = A.undo.pop(); A.actor = s.actor; A.ai = s.ai; A.fi = s.fi; changed(true); }
function redo() { if (!A.redo.length) return; A.undo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); const s = A.redo.pop(); A.actor = s.actor; A.ai = s.ai; A.fi = s.fi; changed(true); }
let saveT;
function changed(structure = false) {
  A.dirty = true;
  A.ai = clamp(A.ai, 0, A.actor.anims.length - 1);
  A.fi = clamp(A.fi, 0, anim().frames.length - 1);
  drawEditor();
  if (structure) { drawTimeline(); drawLeft(); drawSheet(); if (V.saveBtn) V.saveBtn.textContent = 'Save ' + A.actor.name; } else updateThumb();
  feedPlayer();
  clearTimeout(saveT);
  saveT = setTimeout(autosave, 1500);
}
// show an actor that was just opened: everything redrawn, nothing marked changed (opening never saves)
function opened() {
  changed(true); clearTimeout(saveT); A.dirty = false;
  try { localStorage.setItem('kiln.anim.cur', JSON.stringify(serialize())); } catch { }
}
async function autosave() {
  await loadOwners('actor');
  if (claim('actor', A.actor, slug)) drawLeft();
  try { localStorage.setItem('kiln.anim.cur', JSON.stringify(serialize())); } catch { }
  api('/api/project', { id: 'actor-' + slug(A.actor.name), data: serialize() }).catch(() => { });
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem('kiln.anim.cur') || 'null');
    if (!d) return null;
    deserialize(d).then(a => { A.actor = a; A.ai = 0; A.fi = 0; refreshAll(); });
    return blankActor(d.actor.name, d.actor.w, d.actor.h, d.actor.pal);
  } catch { return null; }
}
const slug = s => (s || 'actor').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'actor';

/* --------------------------------------------------------------- layout ---- */
function build(el) {
  V.view = el;
  V.left = h('aside', { class: 'l' });
  V.right = h('aside', { class: 'r' });
  V.cv = h('canvas', { style: { cursor: 'crosshair', touchAction: 'none' } });
  V.vp = h('div', { class: 'viewport', style: { background: '#121211' } }, V.cv);
  V.status = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
  V.tabs = h('div', { class: 'anims-tabs' });
  V.frames = h('div', { class: 'frames' });
  V.animCtl = h('div', { class: 'bar', style: { borderBottom: '1px solid var(--line)', borderTop: 0 } });
  const tb = (ic, t, fn, on) => { const b = h('button', { class: 'ibtn' + (on && on() ? ' on' : ''), title: t, onclick: () => { fn(); if (on) b.classList.toggle('on', on()); } }, icon(ic)); return b; };
  el.append(V.left,
    h('section', { class: 'stage' },
      h('div', { class: 'bar' },
        tb('undo', 'Undo (Ctrl+Z)', undo), tb('redo', 'Redo (Ctrl+Shift+Z)', redo), h('i', { class: 'sep' }),
        tb('onion', 'Onion skin: see the frames either side (O)', () => { A.onion = !A.onion; pref.set('anim.onion', A.onion); drawEditor(); }, () => A.onion),
        tb('grid', 'Pixel grid', () => { A.grid = !A.grid; pref.set('anim.grid', A.grid); drawEditor(); }, () => A.grid),
        tb('mirror', 'Mirror drawing left-right', () => { A.mirror = !A.mirror; drawEditor(); }, () => A.mirror),
        h('i', { class: 'sep' }),
        tb('flip', 'Flip this frame (H)', () => { pushUndo(); setFrame(flipX(frame())); }),
        h('button', { class: 'btn sm ghost', title: 'Flip every frame of this animation', onclick: () => { pushUndo(); anim().frames = anim().frames.map(flipX); changed(true); } }, 'Flip anim'),
        h('i', { class: 'sep' }),
        h('button', { class: 'btn sm go', title: 'Workshop: everything this actor needs (animations, status faces) as a checklist', onclick: () => workshop() }, 'Workshop'),
        h('button', { class: 'btn sm go', title: 'Puppet: bones for this actor. Rig a frame, pose it on a timeline with tweens, make walk / run / attack from the rig, bake to frames', onclick: () => puppet() }, 'Puppet'),
        V.boxBtn = h('button', { class: 'btn sm' + (A.boxes ? ' on' : ' ghost'), title: 'Hit and hurt boxes: drag to draw (red hits, blue gets hit), right-click removes. Exported to Godot frame by frame', onclick: () => { A.boxes = !A.boxes; V.boxBtn.className = 'btn sm' + (A.boxes ? ' on' : ' ghost'); drawTimeline(); drawEditor(); } }, 'Boxes'),
        h('span', { class: 'grow' }), V.status,
        h('span', { class: 'lbl' }, 'Zoom'),
        V.zoomSel = Object.assign(select([[0, 'Fit'], ...[2, 3, 4, 6, 8, 10, 12, 16, 20].map(z => [z, z + '×'])], A.zoom, v => { A.zoom = +v; pref.set('anim.zoom', A.zoom); drawEditor(); }), { title: 'Editor zoom (Fit fills the space)' })),
      V.vp,
      h('div', { class: 'timeline' }, V.tabs, V.animCtl, V.frames)),
    V.right);
  bindCanvas();
  new ResizeObserver(() => drawEditor()).observe(V.vp);
  el.tabIndex = -1;
  el.addEventListener('keydown', keys);
  refreshAll();
}
function refreshAll() { if (!V.cv) return; drawLeft(); drawRight(); drawTimeline(); drawEditor(); feedPlayer(); }

/* ----------------------------------------------------------- left panel ---- */
const TOOLS = [['pencil', 'B', 'Pencil'], ['eraser', 'E', 'Eraser'], ['fill', 'G', 'Fill'], ['pick', 'I', 'Pick colour'], ['line', 'L', 'Line'],
  ['rect', 'R', 'Rectangle (Shift: filled)'], ['select', 'M', 'Select and move (arrows nudge)'], ['move', 'V', 'Move the whole frame']];
function drawLeft() {
  const a = A.actor, H = HARDWARE[A.hw];
  const used = new Set();
  for (const n of a.anims) for (const f of n.frames) for (const c of colorsOf(f)) used.add(hex(c));
  const nm = h('input', { type: 'text', value: a.name, onchange: () => { a.name = slug(nm.value); nm.value = a.name; changed(); } });
  const wIn = h('input', { type: 'number', value: a.w, min: 4, max: 256, title: 'Frame width in pixels (then Set)', style: { width: '62px' } });
  const hIn = h('input', { type: 'number', value: a.h, min: 4, max: 256, title: 'Frame height in pixels (then Set)', style: { width: '62px' } });
  const sw = h('div', { class: 'sw big' }, ...a.pal.map((c, i) => h('i', {
    class: (A.c1 && hex(A.c1) === hex(c) ? 'on' : '') + ((A.cyc || []).includes(hex(c)) ? ' cyc' : ''), 'data-cyc': (A.cyc || []).indexOf(hex(c)) + 1 || '', title: `${hex(c)}  ·  click: draw with it  ·  Shift+click: add to a colour cycle  ·  double-click: recolour it everywhere  ·  on the canvas: left adds, right removes, wheel rolls colours, middle-click picks`,
    style: { background: hex(c) },
    onclick: e => {
      // Shift+click picks colours for a colour cycle (torch, water, glow); a plain click draws with it
      if (e.shiftKey) { const k = hex(c); A.cyc = (A.cyc || []).includes(k) ? A.cyc.filter(x => x !== k) : [...(A.cyc || []), k]; drawLeft(); return; }
      A.c1 = c; if (A.tool === 'eraser' || A.tool === 'pick') A.tool = 'pencil'; drawLeft();
    },
    oncontextmenu: e => { e.preventDefault(); A.c2 = c; drawLeft(); },
    ondblclick: () => recolour(i),
  })), h('i', { title: 'Add a colour', style: { background: 'none', border: '1px dashed var(--line2)', display: 'grid', placeItems: 'center', color: 'var(--faint)' }, onclick: addColour }, '+'));
  const chip = (c, label, set) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--faint)' } },
    h('i', { style: { width: '22px', height: '22px', display: 'block', border: '1px solid var(--line2)', background: c ? hex(c) : 'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0/8px 8px' } }), label);
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Actor', h('span', { class: 'grow' }),
      h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy or remove your actors', onclick: openMenu }, 'Open'), h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'Start a new actor (this one is kept)', onclick: newActor }, 'New')),
      field('Name', nm),
      field('Frame', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, wIn, '×', hIn,
        h('button', { class: 'btn sm', title: 'Change the frame size. Art stays on the floor, centred.', onclick: () => resizeActor(+wIn.value, +hIn.value) }, 'Set'))),
      h('p', { class: 'note' }, `${a.anims.length} animation${a.anims.length > 1 ? 's' : ''} · ${a.anims.reduce((s, n) => s + n.frames.length, 0)} frames`),
      a.h > 128 || a.w > 128 ? h('div', { class: 'big-warn' }, `${a.w}×${a.h} is big for a game sprite (most are 16–96 px tall).`,
        h('button', { class: 'btn sm', title: 'A copy with every frame shrunk by the same amount onto one shared palette; this actor stays as it is', onclick: shrinkCopy }, 'Make a game-size copy')) : ''),
    h('div', { class: 'sec' }, h('h3', {}, 'Tools'),
      h('div', { class: 'tools' }, ...TOOLS.map(([t, k, title]) => h('button', { class: A.tool === t ? 'on' : '', title: `${title} (${k})`, onclick: () => setTool(t) }, icon(t === 'pick' ? 'pick' : t), h('kbd', {}, k)))),
      h('div', { style: { display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'center' } },
        chip(A.c1, 'left click adds'), h('span', { style: { fontSize: '11px', color: 'var(--faint)' } }, 'right click removes · wheel rolls colours · middle click picks'),
        )),
    h('div', { class: 'sec' }, h('h3', {}, 'Palette', h('span', { class: 'grow' }), h('small', { style: { color: used.size > H.sprite ? 'var(--warn)' : 'var(--faint)' } }, `${used.size} used · ${H.name} allows ${H.sprite}`)),
      sw,
      (A.cyc || []).length >= 2 ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '8px 0 2px' } },
        h('button', { class: 'btn sm go', title: 'Make a looping animation where the picked colours rotate through each other, in the order you picked them. Classic for torches, water, glowing runes', onclick: colourCycle }, `Colour cycle (${A.cyc.length})`),
        h('button', { class: 'btn sm ghost', title: 'Clear the picked colours', onclick: () => { A.cyc = []; drawLeft(); } }, 'Clear')) :
        h('p', { class: 'note', style: { margin: '6px 0 0' } }, 'Shift+click 2 or more colours to make a colour cycle (torch, water, glow).'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn sm', title: 'Replace the palette with the colours actually used in the frames', onclick: () => { A.actor.pal = [...used].map(rgb).sort((x, y) => luma(x) - luma(y)); drawLeft(); } }, 'From frames'),
        Object.assign(select([['', 'Load preset…'], ...Object.entries(PALETTES).map(([k, p]) => [k, p.name])], '', v => { if (v) { A.actor.pal = PALETTES[v].colors.slice(); drawLeft(); } }), { title: 'Swap the palette for a ready-made one (the pixels keep their colours until you recolour)' }),
        Object.assign(select(Object.entries(HARDWARE).map(([k, H]) => [k, 'Check: ' + H.name]), A.hw, v => { A.hw = v; pref.set('anim.hw', v); drawLeft(); }), { title: 'Warn when the actor uses more colours than this console could show' })),
      h('p', { class: 'note' }, 'Double-click a colour to recolour it in every frame: quick enemy variants and palette swaps.')));
}
function setTool(t) { commitFloat(); A.tool = t; drawLeft(); drawEditor(); }
function addColour() {
  const inp = h('input', { type: 'color', value: A.c1 ? hex(A.c1) : '#ffffff' });
  inp.onchange = () => { const c = rgb(inp.value); A.actor.pal.push(c); A.c1 = c; drawLeft(); };
  inp.click();
}
function recolour(i) {
  const old = A.actor.pal[i];
  const inp = h('input', { type: 'color', value: hex(old) });
  inp.onchange = () => {
    const c = rgb(inp.value); pushUndo();
    for (const n of A.actor.anims) for (const f of n.frames) for (let p = 0; p < f.data.length; p += 4)
      if (f.data[p + 3] >= 128 && f.data[p] === old[0] && f.data[p + 1] === old[1] && f.data[p + 2] === old[2]) { f.data[p] = c[0]; f.data[p + 1] = c[1]; f.data[p + 2] = c[2]; }
    A.actor.pal[i] = c; if (A.c1 && hex(A.c1) === hex(old)) A.c1 = c;
    changed(true);
  };
  inp.click();
}
// change an animation's box width; art stays centred, and narrowing never silently cuts art off
// Colour cycling: frame k shifts each picked colour k places along the cycle (order = order picked).
function colourCycle() {
  const cyc = (A.cyc || []).map(rgb), n = cyc.length;
  if (n < 2) return;
  const base = frame(), idx = new Map(cyc.map((c, i) => [c[0] << 16 | c[1] << 8 | c[2], i]));
  let hits = 0;
  const frames = Array.from({ length: n }, (_, k) => {
    const f = cloneImg(base), d = f.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const j = idx.get(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
      if (j === undefined) continue;
      if (k === 0) hits++;
      const c = cyc[(j + k) % n]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    return f;
  });
  if (!hits) return toast('None of the picked colours are in this frame. Draw with them first, then cycle', 'bad');
  pushUndo();
  const name = slug(anim().name + '_cycle');
  A.actor.anims.splice(A.ai + 1, 0, { name, fps: Math.max(6, Math.min(14, n * 2)), loop: true, span: anim().span, frames });
  A.ai++; A.fi = 0; changed(true);
  toast(`"${name}": ${n} frames, ${hits} pixels cycle. Change its speed under the timeline`, 'ok');
}
function setSpan(n, span) {
  if ((n.span || 1) === span) return;
  const W = A.actor.w * span;
  const cut = n.frames.some(f => { const b = bbox(f); return b && (b.w > W || b.x < (f.width - W) / 2 || b.x + b.w > (f.width + W) / 2); });
  if (cut && !confirm(`Some frames of "${n.name}" have art outside a ${W}px box and it would be cut off.\n\nNarrow it anyway?`)) return drawTimeline();
  pushUndo();
  n.frames = n.frames.map(f => blit(newImg(W, A.actor.h), f, Math.floor((W - f.width) / 2), 0));
  n.span = span; changed(true);
}
function resizeActor(w, hh) {
  w = clamp(w | 0, 4, 256); hh = clamp(hh | 0, 4, 256);
  if (w === A.actor.w && hh === A.actor.h) return;
  pushUndo();
  for (const n of A.actor.anims) n.frames = n.frames.map(f => blit(newImg(w * (n.span || 1), hh), f, Math.floor((w * (n.span || 1) - f.width) / 2), hh - f.height));
  A.actor.w = w; A.actor.h = hh; changed(true);
}
function newActor() {
  const n = prompt('Name for the new actor', 'hero');
  if (!n) return;
  if (A.dirty) autosave();
  A.actor = blankActor(slug(n), A.actor.w, A.actor.h, A.actor.pal.slice());
  A.ai = A.fi = 0; A.undo = []; A.redo = []; changed(true);
}
async function openMenu() {
  // the exported actors in sprites/ (made elsewhere, or saved without a project) open from below the list
  const sprites = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const dirs = sprites.items.filter(i => i.dir && i.ok && !i.name.startsWith('_'));
  const extra = h('div', {}, h('h3', { class: 'lbl', style: { margin: '16px 0 6px' } }, 'Exported actors in sprites/'),
    dirs.length ? dirs.map(d => h('div', { class: 'palrow', title: 'Open from its exported files', onclick: () => { document.querySelector('.modal')?.remove(); openActorDir(d.path); } }, icon('folder'), h('span', {}, d.name), h('span', { class: 'faint mono', style: { marginLeft: 'auto', fontSize: '11px' } }, d.info))) : h('p', { class: 'note' }, 'None yet.'));
  openProjects('actor', { current: A.actor.name, extra, open: p => openProject(p.id),
    renamed: n => { A.actor.name = n; drawLeft(); if (V.saveBtn) V.saveBtn.textContent = 'Save ' + n; },
    removed: () => { A.actor = blankActor(); A.ai = A.fi = 0; A.undo = []; A.redo = []; opened(); } });
}
async function openProject(id) {
  try {
    const d = await (await fetch('/api/project?id=' + encodeURIComponent(id))).json();
    A.actor = await deserialize(d); A.ai = A.fi = 0; A.undo = []; A.redo = []; opened(); toast('Opened ' + A.actor.name);
  } catch (e) { toast('Could not open: ' + e.message, 'bad'); }
}
async function openActorDir(dir) {
  try {
    const name = dir.split('/').pop();
    // a Kiln project with the same name keeps palette and description
    const proj = await fetch('/api/project?id=actor-' + slug(name)).then(r => r.ok ? r.json() : null).catch(() => null);
    if (proj) { A.actor = await deserialize(proj); }
    else {
      const a = await loadActor(dir);
      const pal = new Map();
      for (const n of a.anims) for (const f of n.frames.slice(0, 2)) for (const c of colorsOf(f)) pal.set(hex(c), c);
      A.actor = { id: uid(), name: slug(name), w: a.w || a.anims[0].frames[0].width, h: a.h || a.anims[0].frames[0].height, desc: '',
        pal: [...pal.values()].slice(0, 64).sort((x, y) => luma(x) - luma(y)), anims: a.anims.map(n => ({ name: n.name, fps: n.fps, loop: n.loop, frames: n.frames, span: Math.max(1, Math.round(n.frames[0].width / (a.w || n.frames[0].width))) })) };
    }
    A.ai = A.fi = 0; A.undo = []; A.redo = []; opened();
    toast('Opened ' + name);
  } catch (e) { toast('Could not open that actor: ' + e.message, 'bad'); }
}
function fromForge(d) {
  const img = d.img;
  if (d.mode === 'new' || !A.actor) {
    if (A.dirty) autosave();
    A.actor = blankActor(slug(d.name), img.width, img.height, d.pal.length ? d.pal : null);
    A.actor.desc = d.identity?.desc || d.name.replace(/_/g, ' ');
    A.actor.kind = d.identity?.kind;
    A.actor.anims[0].frames = [cloneImg(img)];
    if (d.identity) A.actor.identity = { ...d.identity, refSprite: toDataURL(img) };
    if (d.set && SETS[d.set]) {
      // the whole set laid out; every frame starts as the sprite (centred, feet down) so you pose instead of drawing from nothing
      A.actor.anims = SETS[d.set].anims.map(([name, n, span, fps, loop]) => ({ name, fps, loop, span,
        frames: Array.from({ length: n }, () => blit(newImg(img.width * span, img.height), img, Math.floor((img.width * span - img.width) / 2), 0)) }));
    }
    A.ai = A.fi = 0; A.undo = []; A.redo = [];
    toast(d.set ? `${A.actor.name}: ${A.actor.anims.length} animations ready to pose. Animations & sheet → Box template to draw them on paper or in another app` : 'New actor from Forge. Try a motion on the right to start animating', 'ok');
  } else {
    if (d.forName && d.forName !== A.actor.name) { toast(`That frame is for ${d.forName}, but ${A.actor.name} is open. Open ${d.forName} first`, 'bad'); return; }
    if (img.width > A.actor.w || img.height > A.actor.h) {
      const w = Math.max(A.actor.w, img.width), hh = Math.max(A.actor.h, img.height);
      if (!confirm(`This frame is ${img.width}×${img.height}, bigger than ${A.actor.name}'s ${A.actor.w}×${A.actor.h} frames.\n\nOK: grow every frame to ${w}×${hh} (art stays put, feet on the floor)\nCancel: crop the new frame to fit`)) {}
      else resizeActor(w, hh);
    }
    pushUndo();
    const f = blit(newImg(A.actor.w, A.actor.h), img, Math.floor((A.actor.w - img.width) / 2), A.actor.h - img.height);
    anim().frames.splice(A.fi + 1, 0, f); A.fi++;
    for (const c of d.pal) if (!A.actor.pal.some(p => hex(p) === hex(c))) A.actor.pal.push(c);
    toast('Added as a frame after the current one');
  }
  changed(true);
}
const isBlank = () => A.actor.anims.length === 1 && A.actor.anims[0].frames.length === 1 && !bbox(A.actor.anims[0].frames[0]);
function sliceInto(src, name) {
  const file = name;   // "enemy02_4x8_idle_walk_run_attack_anims" -> actor "enemy02"; the rest tells the slicer the layout
  name = name.replace(/(^|[_\-\s])\d{1,2}\s*x\s*\d{1,2}(?=$|[_\-\s]).*$/i, '').replace(/[_\-\s](idle|walk|run|attack|jump|dash|roll|anims?|sheet|sprites?)([_\-\s].*)?$/i, '') || name;
  openSlicer(src, {
    name: slug(name), file, target: { h: isBlank() ? 64 : A.actor.h, hw: A.hw, count: HARDWARE[A.hw].sprite },
    onDone: ({ anims, w, h: hh, pal }) => {
      const empty = isBlank();
      pushUndo();
      if (empty || confirm(`Make a new actor from these ${anims.length} animation(s)?\n\nOK: new actor "${slug(name)}"\nCancel: add them to "${A.actor.name}"`)) {
        if (A.dirty && !empty) autosave();
        A.actor = blankActor(slug(name), w, hh, pal || null);
        A.actor.anims = anims.map(a => ({ name: a.name, fps: a.fps, loop: true, frames: a.frames }));
        if (!pal) { const m = new Map(); for (const a of anims) for (const f of a.frames.slice(0, 3)) for (const c of colorsOf(f)) m.set(hex(c), c); A.actor.pal = [...m.values()].slice(0, 64).sort((x, y) => luma(x) - luma(y)); }
        A.ai = 0;
      } else {
        for (const a of anims) A.actor.anims.push({ name: a.name, fps: a.fps, loop: true, frames: a.frames.map(f => blit(newImg(A.actor.w, A.actor.h), f, Math.floor((A.actor.w - f.width) / 2), A.actor.h - f.height)) });
        A.ai = A.actor.anims.length - anims.length;
      }
      A.fi = 0; changed(true);
    },
  });
}

/* --------------------------------------------------------------- editor ---- */
let zoomNow = 8, origin = [0, 0];
// An animation can be 1 or 2 boxes wide (a long swing, a lunge): its frames are span × the actor's width.
const fw = (n = anim()) => A.actor.w * (n.span || 1);
function drawEditor() {
  if (!V.cv || !A.actor) return;
  const a = A.actor, W = V.vp.clientWidth, H = V.vp.clientHeight;
  const FW = frame().width;
  // a newly opened actor that would not fit at the chosen zoom goes back to Fit, so it is always all in view
  if (V.shown !== a) { V.shown = a; if (A.zoom && (FW * A.zoom > W - 40 || a.h * A.zoom > H - 40)) { A.zoom = 0; if (V.zoomSel) V.zoomSel.value = 0; } }
  // Fit (core.fitZoom): whole pixels when the frame is small, scaled down when it is bigger than the editor
  zoomNow = A.zoom || fitZoom(W - 40, H - 40, FW, a.h);
  const cw = Math.round(FW * zoomNow), ch = Math.round(a.h * zoomNow);
  V.cv.width = cw; V.cv.height = ch;
  V.cv.style.width = cw + 'px'; V.cv.style.height = ch + 'px';
  const x = V.cv.getContext('2d');
  artCtx(x, zoomNow);
  checker(x, cw, ch, Math.max(4, zoomNow * 2), '#2a2a28', '#313130');
  const fr = anim().frames;
  if (A.onion && fr.length > 1) {
    const put = (f, al, tint) => { const c = toCanvas(f); const t = c.getContext('2d'); t.globalCompositeOperation = 'source-atop'; t.fillStyle = tint; t.fillRect(0, 0, c.width, c.height); x.globalAlpha = al; x.drawImage(c, 0, 0, cw, ch); x.globalAlpha = 1; };
    put(fr[(A.fi - 1 + fr.length) % fr.length], .3, '#ff5b2e66');
    if (fr.length > 2) put(fr[(A.fi + 1) % fr.length], .18, '#6fb3d966');
  }
  x.drawImage(toCanvas(frame()), 0, 0, cw, ch);
  if (A.float) x.drawImage(toCanvas(A.float.img), A.float.x * zoomNow, A.float.y * zoomNow, A.float.img.width * zoomNow, A.float.img.height * zoomNow);
  if (A.grid && zoomNow >= 6) {
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1; x.beginPath();
    for (let i = 1; i < FW; i++) { x.moveTo(i * zoomNow + .5, 0); x.lineTo(i * zoomNow + .5, ch); }
    for (let i = 1; i < a.h; i++) { x.moveTo(0, i * zoomNow + .5); x.lineTo(cw, i * zoomNow + .5); }
    x.stroke();
    // 8×8 tile lines, slightly stronger: hardware sprites are built from these
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.beginPath();
    for (let i = 8; i < FW; i += 8) { x.moveTo(i * zoomNow + .5, 0); x.lineTo(i * zoomNow + .5, ch); }
    for (let i = 8; i < a.h; i += 8) { x.moveTo(0, i * zoomNow + .5); x.lineTo(cw, i * zoomNow + .5); }
    x.stroke();
  }
  // a 2-wide frame: show where the normal 1-box body area sits, so the body stays put between animations
  if (FW > a.w) { x.strokeStyle = 'rgba(227,176,75,.45)'; x.setLineDash([2, 4]); const bx = (FW - a.w) / 2 * zoomNow; x.strokeRect(bx + .5, .5, a.w * zoomNow - 1, ch - 1); x.setLineDash([]); }
  // art touching the left, right or top edge may be cut off in the game: mark that edge
  const edge = touches(frame());
  if (edge.length) { x.fillStyle = '#e5534b'; for (const e of edge) { if (e === 'l') x.fillRect(0, 0, 3, ch); if (e === 'r') x.fillRect(cw - 3, 0, 3, ch); if (e === 't') x.fillRect(0, 0, cw, 3); } }
  if (A.mirror) { x.strokeStyle = '#ff5b2e88'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(cw / 2, 0); x.lineTo(cw / 2, ch); x.stroke(); x.setLineDash([]); }
  const s = A.float ? { x: A.float.x, y: A.float.y, w: A.float.img.width, h: A.float.img.height } : A.sel;
  if (s) { x.strokeStyle = '#fff'; x.setLineDash([3, 3]); x.lineDashOffset = (performance.now() / 60) % 6; x.strokeRect(s.x * zoomNow + .5, s.y * zoomNow + .5, s.w * zoomNow - 1, s.h * zoomNow - 1); x.setLineDash([]); }
  if (A.boxes) {      // hit (red) / hurt (blue) boxes of this frame; the body box shows dashed when no hurtbox is set
    const f0 = frame(), B = f0.boxes || {}, body = bodyBox(f0.width), put = (r, c, dash) => { x.strokeStyle = c; x.lineWidth = 2; x.setLineDash(dash ? [4, 4] : []); x.strokeRect(r.x * zoomNow + 1, r.y * zoomNow + 1, r.w * zoomNow - 2, r.h * zoomNow - 2); x.fillStyle = c.replace(/[\d.]+\)$/, '.12)'); x.fillRect(r.x * zoomNow, r.y * zoomNow, r.w * zoomNow, r.h * zoomNow); x.setLineDash([]); };
    if (!(B.hurt || []).length && body) put(body, 'rgba(111,179,217,.7)', true);
    for (const r of B.hurt || []) put(r, 'rgba(111,179,217,.95)');
    for (const r of B.hit || []) put(r, 'rgba(229,83,75,.95)');
    if (drag?.t === 'box' && drag.r) put(drag.r, drag.kind === 'hit' ? 'rgba(229,83,75,.95)' : 'rgba(111,179,217,.95)');
  }
  if (hover && !drag) { x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect(hover[0] * zoomNow + .5, hover[1] * zoomNow + .5, zoomNow - 1, zoomNow - 1); }
  V.status.textContent = `${anim().name} ${A.fi + 1}/${fr.length}${hover ? `  ·  ${hover[0]},${hover[1]}` : ''}  ·  ${zoomNow >= 1 ? zoomNow + '×' : Math.round(zoomNow * 100) + '%'}${edge.length ? '  ·  touches the box edge: may be cut off' : ''}`;
}
setInterval(() => { if (mounted && (A.sel || A.float) && V.cv?.isConnected) drawEditor(); }, 120);
const px = e => { const r = V.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / zoomNow), Math.floor((e.clientY - r.top) / zoomNow)]; };
const inside = ([x, y]) => x >= 0 && y >= 0 && x < frame().width && y < A.actor.h;
// which edges (left, right, top) have opaque pixels on them; the bottom row is the floor, feet belong there
function touches(f) {
  const out = [], a = (x, y) => f.data[(y * f.width + x) * 4 + 3] >= 128;
  let l = false, r = false, t = false;
  for (let y = 0; y < f.height; y++) { if (a(0, y)) l = true; if (a(f.width - 1, y)) r = true; }
  for (let x = 0; x < f.width; x++) if (a(x, 0)) t = true;
  if (l) out.push('l'); if (r) out.push('r'); if (t) out.push('t');
  return out;
}
function setPx(f, x, y, c) {
  const put = (x, y) => { if (x < 0 || y < 0 || x >= f.width || y >= f.height) return; const i = (y * f.width + x) * 4; if (!c) { f.data[i + 3] = 0; return; } f.data[i] = c[0]; f.data[i + 1] = c[1]; f.data[i + 2] = c[2]; f.data[i + 3] = 255; };
  put(x, y); if (A.mirror) put(f.width - 1 - x, y);
}
const getPx = (f, x, y) => { const i = (y * f.width + x) * 4; return f.data[i + 3] < 128 ? null : [f.data[i], f.data[i + 1], f.data[i + 2]]; };
function line(f, [x0, y0], [x1, y1], c) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (; ;) { setPx(f, x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
function flood(f, x, y, c) {
  const t = getPx(f, x, y), same = p => { const q = getPx(f, p % f.width, (p / f.width) | 0); return t ? q && q[0] === t[0] && q[1] === t[1] && q[2] === t[2] : !q; };
  if (c && t && hex(c) === hex(t)) return;
  const seen = new Uint8Array(f.width * f.height), st = [y * f.width + x];
  seen[st[0]] = 1;
  while (st.length) {
    const p = st.pop(), px = p % f.width, py = (p / f.width) | 0;
    setPx(f, px, py, c);
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (nx < 0 || ny < 0 || nx >= f.width || ny >= f.height) continue;
      const q = ny * f.width + nx; if (!seen[q] && same(q)) { seen[q] = 1; st.push(q); }
    }
  }
}
let drag = null, hover = null;
function bindCanvas() {
  const cv = V.cv;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    if (A.boxes) {
      const p0 = px(e), f0 = frame(), B = (f0.boxes ||= { hit: [], hurt: [] });
      if (e.button === 2) {
        for (const k of ['hit', 'hurt']) { const i = (B[k] || []).findIndex(r => p0[0] >= r.x && p0[1] >= r.y && p0[0] < r.x + r.w && p0[1] < r.y + r.h); if (i >= 0) { pushUndo(); frame().boxes[k].splice(i, 1); changed(); return; } }
        return;
      }
      drag = { t: 'box', kind: A.boxKind || 'hit', p0: p0, r: null }; return;
    }
    const p = px(e), f = frame();
    // left click adds, right click removes (with any drawing tool), middle click picks the colour under the cursor
    if (e.button === 1) { e.preventDefault(); if (inside(p)) { const k = getPx(f, ...p); if (k) { A.c1 = k; drawLeft(); } } return; }
    const erase = e.button === 2, c = erase ? null : A.c1;
    const t = erase && ['pick', 'select', 'move'].includes(A.tool) ? 'pencil' : A.tool;
    if (t === 'pick') { if (inside(p)) { const k = getPx(f, ...p); if (k) A.c1 = k; drawLeft(); } return; }
    if (t === 'select') {
      if (A.float && hit(p, A.float)) { drag = { t: 'float', p0: p, o: [A.float.x, A.float.y] }; return; }
      if (A.sel && hit(p, A.sel) && !A.float) { liftSel(); drag = { t: 'float', p0: p, o: [A.float.x, A.float.y] }; return; }
      commitFloat(); A.sel = null; drag = { t: 'sel', p0: p }; return;
    }
    pushUndo();
    if (t === 'move') { drag = { t: 'move', p0: p, base: cloneImg(f) }; return; }
    if (t === 'fill') { if (inside(p)) { flood(f, ...p, c); changed(); } return; }
    if (t === 'line' || t === 'rect') { drag = { t, p0: p, base: cloneImg(f), c, fill: e.shiftKey }; return; }
    const col = t === 'eraser' || erase ? null : c;
    drag = { t: 'paint', last: p, c: col };
    setPx(f, ...p, col); drawEditor();
  });
  cv.addEventListener('pointermove', e => {
    const p = px(e);
    hover = inside(p) ? p : null;
    if (!drag) { drawEditor(); return; }
    const f = frame();
    if (drag.t === 'box') { const [x0, y0] = drag.p0; drag.r = { x: Math.max(0, Math.min(x0, p[0])), y: Math.max(0, Math.min(y0, p[1])), w: Math.abs(p[0] - x0) + 1, h: Math.abs(p[1] - y0) + 1 }; drawEditor(); return; }
    if (drag.t === 'paint') { line(f, drag.last, p, drag.c); drag.last = p; drawEditor(); }
    else if (drag.t === 'line' || drag.t === 'rect') {
      f.data.set(drag.base.data);
      if (drag.t === 'line') line(f, drag.p0, p, drag.c);
      else {
        const [x0, x1] = [Math.min(drag.p0[0], p[0]), Math.max(drag.p0[0], p[0])], [y0, y1] = [Math.min(drag.p0[1], p[1]), Math.max(drag.p0[1], p[1])];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (drag.fill || x === x0 || x === x1 || y === y0 || y === y1) setPx(f, x, y, drag.c);
      }
      drawEditor();
    } else if (drag.t === 'move') {
      f.data.set(shift(drag.base, p[0] - drag.p0[0], p[1] - drag.p0[1]).data); drawEditor();
    } else if (drag.t === 'sel') {
      const FW = frame().width;
      const x0 = clamp(Math.min(drag.p0[0], p[0]), 0, FW - 1), y0 = clamp(Math.min(drag.p0[1], p[1]), 0, A.actor.h - 1);
      const x1 = clamp(Math.max(drag.p0[0], p[0]), 0, FW - 1), y1 = clamp(Math.max(drag.p0[1], p[1]), 0, A.actor.h - 1);
      A.sel = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; drawEditor();
    } else if (drag.t === 'float') {
      A.float.x = drag.o[0] + p[0] - drag.p0[0]; A.float.y = drag.o[1] + p[1] - drag.p0[1]; drawEditor();
    }
  });
  const up = () => {
    if (drag?.t === 'box') { const d = drag; drag = null; if (d.r && d.r.w > 1 && d.r.h > 1) { pushUndo(); const B = (frame().boxes ||= { hit: [], hurt: [] }); (B[d.kind] ||= []).push(d.r); changed(); } else drawEditor(); return; }
    if (!drag) return; const t = drag.t; drag = null; if (t !== 'sel' && t !== 'float') changed(); else drawEditor(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { hover = null; drawEditor(); });
  V.vp.addEventListener('wheel', e => {
    e.preventDefault();
    // plain wheel rolls through the palette; Ctrl or Alt + wheel zooms
    if (!e.ctrlKey && !e.altKey) { rollColour(e.deltaY > 0 ? 1 : -1); return; }
    A.zoom = clamp((A.zoom || zoomNow) + (e.deltaY < 0 ? 1 : -1), 1, 40); pref.set('anim.zoom', A.zoom); drawEditor();
  }, { passive: false });
}
let rollT = 0;
function rollColour(d) {
  const now = performance.now(); if (now - rollT < 45) return; rollT = now;      // a fast wheel shouldn't skip half the palette
  const pal = A.actor.pal; if (!pal.length) return;
  const i = A.c1 ? pal.findIndex(c => hex(c) === hex(A.c1)) : -1;
  A.c1 = pal[((i < 0 ? 0 : i + d) % pal.length + pal.length) % pal.length];
  if (A.tool === 'eraser' || A.tool === 'pick') A.tool = 'pencil';
  drawLeft(); drawEditor();
  if (hover) { const x = V.cv.getContext('2d'); x.fillStyle = hex(A.c1); x.fillRect(hover[0] * zoomNow + 1, hover[1] * zoomNow + 1, zoomNow - 2, zoomNow - 2); }
}
const hit = ([x, y], r) => { const w = r.w ?? r.img.width, hh = r.h ?? r.img.height; return x >= r.x && y >= r.y && x < r.x + w && y < r.y + hh; };
function liftSel() {
  pushUndo();
  const s = A.sel, f = frame(), img = newImg(s.w, s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const c = getPx(f, s.x + x, s.y + y); if (c) { const i = (y * s.w + x) * 4; img.data.set([...c, 255], i); setPxRaw(f, s.x + x, s.y + y, null); } }
  A.float = { img, x: s.x, y: s.y }; A.sel = null;
}
function setPxRaw(f, x, y, c) { const i = (y * f.width + x) * 4; if (!c) f.data[i + 3] = 0; else f.data.set([...c, 255], i); }
function commitFloat() {
  if (!A.float) return;
  blit(frame(), A.float.img, A.float.x, A.float.y);
  A.sel = { x: A.float.x, y: A.float.y, w: A.float.img.width, h: A.float.img.height };
  A.float = null; changed();
}
let clip = null;
function keys(e) {
  // text fields keep their keys; after a checkbox or slider, Ctrl+Z and friends still work
  if (e.target.matches('textarea,select,input:not([type=checkbox]):not([type=range]):not([type=radio])')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && !A.sel && !A.float && picked().length > 1) { copyFrames(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && clip?.frames) { e.preventDefault(); pasteFrames(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c') { const s = A.sel || { x: 0, y: 0, w: frame().width, h: A.actor.h }; clip = { img: cropImg(frame(), s), x: s.x, y: s.y }; toast('Copied'); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && clip) { commitFloat(); pushUndo(); A.float = { img: cloneImg(clip.img), x: clip.x, y: clip.y }; A.tool = 'select'; drawLeft(); drawEditor(); e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = TOOLS.find(t => t[1].toLowerCase() === k);
  if (tool) { setTool(tool[0]); return; }
  if (k === 'x') { [A.c1, A.c2] = [A.c2, A.c1]; drawLeft(); }
  else if (k === 'o') { A.onion = !A.onion; drawEditor(); }
  else if (k === 'f') player?.juice('flash');
  else if (k === 's') player?.juice('squash');
  else if (k === 'k') player?.juice('shake');
  else if (k === 'h') { pushUndo(); setFrame(flipX(frame())); }
  else if (k === ',') goFrame(-1);
  else if (k === '.') goFrame(1);
  else if (k === 'n') dupFrame();
  else if (k === 'enter') { commitFloat(); A.sel = null; drawEditor(); }
  else if (k === 'escape') { commitFloat(); A.sel = null; drawEditor(); }
  else if (k === 'delete' || k === 'backspace') {
    if (A.float) { A.float = null; changed(); } else if (A.sel) { pushUndo(); const f = frame(); for (let y = 0; y < A.sel.h; y++) for (let x = 0; x < A.sel.w; x++) setPxRaw(f, A.sel.x + x, A.sel.y + y, null); changed(); }
    e.preventDefault();
  } else if (k.startsWith('arrow')) {
    e.preventDefault();
    const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (A.sel && !A.float) liftSel();
    if (A.float) { A.float.x += d[0]; A.float.y += d[1]; drawEditor(); }
    else { pushUndo(); setFrame(shift(frame(), d[0], d[1])); }
  }
}
const cropImg = (f, s) => { const o = newImg(s.w, s.h); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const c = getPx(f, s.x + x, s.y + y); if (c) o.data.set([...c, 255], (y * s.w + x) * 4); } return o; };
function setFrame(img) { anim().frames[A.fi] = img; changed(); }
function goFrame(d) { commitFloat(); const n = anim().frames.length; A.fi = (A.fi + d + n) % n; A.sel = null; drawTimeline(); drawEditor(); }

/* ------------------------------------------------------------- timeline ---- */
function drawTimeline() {
  if (!V.tabs) return;
  const a = A.actor;
  V.tabs.replaceChildren(...a.anims.map((n, i) => h('button', {
    class: i === A.ai ? 'on' : '', title: 'Double-click to rename',
    onclick: () => { commitFloat(); A.ai = i; A.fi = 0; A.fsel = null; drawTimeline(); drawEditor(); feedPlayer(); },
    ondblclick: () => { const v = prompt('Animation name', n.name); if (v) { n.name = slug(v); changed(true); } },
  }, n.name, h('small', {}, n.frames.length))),
  h('button', { title: 'New animation', onclick: addAnim }, '+ Animation'));
  const n = anim();
  const fps = h('input', { type: 'number', min: 1, max: 60, value: n.fps, title: 'Frames per second for this animation', style: { width: '56px' }, onchange: () => { n.fps = clamp(+fps.value, 1, 60); changed(); } });
  V.animCtl.replaceChildren(
    h('span', { class: 'lbl' }, 'Speed'), fps, h('span', { class: 'faint', style: { fontSize: '11px' } }, 'fps'),
    check('loop', n.loop !== false, v => { n.loop = v; changed(); }),
    h('i', { class: 'sep' }),
    h('button', { class: 'btn sm', title: 'Duplicate frame (N)', onclick: dupFrame }, icon('dup'), 'Duplicate'),
    h('button', { class: 'btn sm', onclick: () => { pushUndo(); n.frames.splice(A.fi + 1, 0, newImg(fw(n), a.h)); A.fi++; changed(true); } }, icon('plus'), 'Blank'),
    h('i', { class: 'sep' }),
    ...(A.boxes ? [seg([['hit', 'Hitbox (red)'], ['hurt', 'Hurtbox (blue)']], A.boxKind || 'hit', v => { A.boxKind = v; }),
      h('button', { class: 'btn sm', title: 'Box whatever sticks out past the body on every frame of this animation (weapons, slashes)', onclick: guessHitboxes }, 'Guess hitboxes'),
      h('button', { class: 'btn sm ghost', title: 'Copy this frame\'s boxes to the next frame', onclick: () => { const fr = anim().frames, nx = fr[A.fi + 1]; if (!nx) return; pushUndo(); nx.boxes = JSON.parse(JSON.stringify(frame().boxes || {})); A.fi++; changed(true); } }, 'Copy → next'),
      h('button', { class: 'btn sm ghost', title: 'Remove this frame\'s boxes', onclick: () => { pushUndo(); frame().boxes = null; changed(); } }, 'Clear'), h('i', { class: 'sep' })] : []),
    h('span', { class: 'lbl', title: 'How many boxes wide this animation\'s frames are. 2 gives a long swing or lunge room without cutting it off' }, 'Box'),
    seg([[1, '1 wide'], [2, '2 wide']], n.span || 1, v => setSpan(n, +v)),
    h('i', { class: 'sep' }),
    h('button', { class: 'btn sm ghost', title: 'Copy the picked frames (Shift/Ctrl+click in the timeline to pick several) · Ctrl+C', onclick: copyFrames }, picked().length > 1 ? `Copy ${picked().length} frames` : 'Copy frame'),
    clip?.frames ? h('button', { class: 'btn sm', title: 'Insert the copied frames after the picked one(s), here or in another animation · Ctrl+V', onclick: pasteFrames }, `Paste ${clip.frames.length}`) : '',
    h('button', { class: 'btn sm ghost', title: 'Play forward then back: 1 2 3 4 → 1 2 3 4 3 2 1 (the picked frames, or the whole animation)', onclick: pingPong }, 'Ping-pong'),
    h('i', { class: 'sep' }),
    h('button', { class: 'btn sm ghost', title: 'Move frame left', onclick: () => moveFrame(-1) }, '◂'),
    h('button', { class: 'btn sm ghost', title: 'Move frame right', onclick: () => moveFrame(1) }, '▸'),
    h('button', { class: 'btn sm ghost danger', onclick: delFrame }, picked().length > 1 ? `Delete ${picked().length} frames` : 'Delete frame'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm ghost', title: 'Copy this whole animation as a new one', onclick: () => { pushUndo(); a.anims.splice(A.ai + 1, 0, { ...n, name: n.name + '_copy', frames: n.frames.map(cloneF) }); A.ai++; A.fi = 0; changed(true); } }, 'Duplicate anim'),
    h('button', { class: 'btn sm ghost danger', onclick: () => { if (a.anims.length < 2) return toast('An actor needs at least one animation'); if (!confirm(`Delete the animation "${n.name}"?`)) return; pushUndo(); a.anims.splice(A.ai, 1); A.ai = Math.max(0, A.ai - 1); A.fi = 0; changed(true); } }, 'Delete anim'));
  const th = Math.min(64, Math.max(32, a.h * 2)), z = th / a.h;
  let dragFrom = null;
  V.frames.replaceChildren(...n.frames.map((f, i) => {
    const c = toCanvas(f); c.style.width = Math.round(f.width * z) + 'px'; c.style.height = th + 'px';
    if (touches(f).length) c.style.boxShadow = 'inset 0 0 0 2px #e5534b';
    c.style.background = 'repeating-conic-gradient(#2a2a28 0 25%, #313130 0 50%) 0 0/8px 8px';
    const el = h('div', { class: 'frame' + (i === A.fi ? ' on' : '') + (A.fsel?.has(i) ? ' pick' : ''), draggable: true, title: 'Click: this frame · Shift+click: a range · Ctrl+click: add or remove one (then Ctrl+C / Ctrl+V copy frames)', onclick: e => {
      commitFloat();
      if (e.shiftKey) { const a0 = Math.min(A.fa ?? A.fi, i), a1 = Math.max(A.fa ?? A.fi, i); A.fsel = new Set(Array.from({ length: a1 - a0 + 1 }, (_, k) => a0 + k)); }
      else if (e.ctrlKey || e.metaKey) { A.fsel ||= new Set([A.fi]); A.fsel.has(i) && A.fsel.size > 1 ? A.fsel.delete(i) : A.fsel.add(i); }
      else { A.fsel = null; A.fa = i; }
      A.fi = i; drawTimeline(); drawEditor();
    } }, c, h('span', { class: 'n' }, i + 1));
    el.addEventListener('dragstart', () => { dragFrom = i; });
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => { e.preventDefault(); if (dragFrom == null || dragFrom === i) return; pushUndo(); const [m] = n.frames.splice(dragFrom, 1); n.frames.splice(i, 0, m); A.fi = i; changed(true); });
    return el;
  }), h('div', { class: 'frame add', title: 'Copy this frame to the end', onclick: () => { pushUndo(); n.frames.push(cloneImg(frame())); A.fi = n.frames.length - 1; changed(true); } }, '+'));
  V.frames.children[A.fi]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function updateThumb() {
  const el = V.frames?.children[A.fi]; if (!el) return;
  const c = el.querySelector('canvas'); if (!c) return;
  c.getContext('2d').putImageData(frame(), 0, 0);
}
const bodyBox = W => bodyBoxOf(A.actor, W);
function guessHitboxes() {
  const n = anim(); pushUndo(); const made = guessHits(A.actor, n);
  changed(); toast(made ? `Hitboxes on ${made} of ${n.frames.length} frames (what sticks out past the body). Adjust by drawing / right-click` : 'Nothing sticks out past the body in this animation', made ? 'ok' : '');
}
// a copy of this actor at game size: every frame scaled by the same amount (area average, then despeckled)
// and mapped onto one palette built from all frames, so the copy stays consistent across its animations
function shrinkCopy() {
  const a = A.actor, want = Math.round(+prompt(`Game-size copy of "${a.name}" (${a.w}×${a.h} now). Height in pixels:`, a.h > 200 ? 64 : 48) || 0);
  if (!want || want >= a.h) return;
  const name = slug(a.name.slice(0, 40) + '_' + want);
  A.actor = { ...shrinkActor(a, want), id: uid(), name };
  const pal = A.actor.pal;
  A.ai = A.fi = 0; A.undo = []; A.redo = []; changed(true);
  toast(`Made "${name}": ${A.actor.w}×${want}, ${pal.length} colours. The big one is unchanged`, 'ok');
}
// several frames picked in the timeline (Shift / Ctrl+click), in order; otherwise just the current one
const picked = () => A.fsel && A.fsel.size > 1 ? [...A.fsel].filter(i => i < anim().frames.length).sort((p, q) => p - q) : [A.fi];
function copyFrames() { const n = anim(), ix = picked(); clip = { frames: ix.map(i => cloneF(n.frames[i])) }; toast(`Copied ${ix.length} frame${ix.length > 1 ? 's' : ''}`); drawTimeline(); }
function pasteFrames() {
  if (!clip?.frames) return;
  const n = anim(), W = fw(n), at = Math.max(...picked()) + 1;
  // frames from a wider/narrower animation are centred in this one's box
  const fit = f => { if (f.width === W && f.height === A.actor.h) return cloneF(f); const o = newImg(W, A.actor.h); blit(o, f, Math.round((W - f.width) / 2), A.actor.h - f.height); return o; };
  pushUndo(); n.frames.splice(at, 0, ...clip.frames.map(fit));
  A.fsel = new Set(clip.frames.map((_, k) => at + k)); A.fi = at; changed(true);
  toast(`Pasted ${clip.frames.length} frame${clip.frames.length > 1 ? 's' : ''} after frame ${at}`);
}
// play forward then back: 1 2 3 4 → 1 2 3 4 3 2 1 (a looping animation skips the last 1, since the loop starts there again)
function pingPong() {
  const n = anim(), ix = picked().length > 1 ? picked() : n.frames.map((_, i) => i);
  if (ix.length < 2) return toast('Ping-pong needs at least 2 frames');
  const whole = ix.length === n.frames.length, back = ix.slice(0, -1).reverse();
  if (whole && n.loop !== false) back.pop();
  pushUndo(); n.frames.splice(ix[ix.length - 1] + 1, 0, ...back.map(i => cloneF(n.frames[i])));
  A.fsel = null; changed(true);
  toast(whole && n.loop !== false ? `Now ${n.frames.length} frames; looping it plays ${ix.map(i => i + 1).join(' ')} ${back.map(i => i + 1).join(' ')} 1 …` : `Added ${back.length} frames going back`);
}
function dupFrame() { pushUndo(); anim().frames.splice(A.fi + 1, 0, cloneF(frame())); A.fi++; changed(true); }
function delFrame() {
  const n = anim(), ix = picked();
  if (ix.length > 1) { if (ix.length >= n.frames.length) return toast('Keep at least one frame'); pushUndo(); for (const i of ix.reverse()) n.frames.splice(i, 1); A.fsel = null; A.fi = Math.min(A.fi, n.frames.length - 1); changed(true); return; }
  if (n.frames.length < 2) { pushUndo(); n.frames[0] = newImg(fw(n), A.actor.h); changed(true); return; } pushUndo(); n.frames.splice(A.fi, 1); changed(true); }
function moveFrame(d) { const n = anim(), j = A.fi + d; if (j < 0 || j >= n.frames.length) return; pushUndo(); [n.frames[A.fi], n.frames[j]] = [n.frames[j], n.frames[A.fi]]; A.fi = j; changed(true); }
function addAnim() {
  const have = new Set(A.actor.anims.map(a => a.name));
  const sug = ANIM_NAMES.find(n => !have.has(n)) || 'anim';
  const v = prompt(`Name for the new animation\n(common: ${ANIM_NAMES.join(', ')})`, sug);
  if (!v) return;
  pushUndo();
  A.actor.anims.push({ name: slug(v), fps: 8, loop: !/attack|hurt|death|jump/.test(v), frames: [cloneImg(frame())] });
  A.ai = A.actor.anims.length - 1; A.fi = 0; changed(true);
}

/* ---------------------------------------------------------- right panel ---- */
let player, playerT;
function feedPlayer() {
  if (!player) return;
  clearTimeout(playerT);
  playerT = setTimeout(() => { player.set(A.actor.anims.map(n => ({ name: n.name, fps: n.fps, loop: n.loop, frames: n.frames }))); const k = A.actor.anims.indexOf(anim()); if (player.cur !== k) player.select(k); }, 80);
}
function drawRight() {
  player?.destroy();
  player = new Player({ compact: true, height: 220 });
  const motionBox = h('div');
  const drawMotion = () => {
    const m = MOTIONS.find(m => m.id === A.motion);
    motionBox.replaceChildren(h('div', { class: 'motions' }, ...MOTIONS.map(mm => h('button', { class: mm.id === A.motion ? 'on' : '', title: mm.note, onclick: () => { A.motion = mm.id === A.motion ? null : mm.id; drawMotion(); } }, h('b', {}, mm.name), h('span', {}, mm.note)))));
    if (!m) return;
    const p = A.mp[m.id] = A.mp[m.id] || Object.fromEntries(m.params.map(q => [q[0], q[2]]));
    const name = h('input', { type: 'text', value: A.actor.anims.some(a => a.name === m.anim) ? m.anim + '_2' : m.anim });
    motionBox.append(h('div', { style: { marginTop: '10px', padding: '10px', border: '1px solid var(--line2)', background: 'var(--bg)' } },
      h('div', { class: 'note', style: { marginTop: 0, marginBottom: '6px' } }, `Built from the frame you are on (${anim().name} ${A.fi + 1}).`),
      ...m.params.map(([k, l, d, mn, mx, stp]) => field(l, range(p[k], mn, mx, stp, v => p[k] = v, v => stp < 1 ? (+v).toFixed(2) : v))),
      field('Into', name),
      h('div', { class: 'btns' },
        h('button', { class: 'btn go', onclick: () => applyMotion(m, p, slug(name.value), false) }, 'Make animation'),
        h('button', { class: 'btn', title: 'Replace the frames of the animation you are on', onclick: () => applyMotion(m, p, null, true) }, 'Replace current'))));
  };
  drawMotion();
  V.right.replaceChildren(
    h('div', { class: 'sec', style: { padding: 0 } }, h('h3', { style: { padding: '12px 14px 0' } }, 'Preview', h('span', { class: 'grow' }), h('small', {}, 'live, as the game shows it')), player.el),
    identityBox(),
    h('div', { class: 'sec' }, h('h3', {}, 'Motions'), motionBox),
    V.sheet = h('div', { class: 'sec' }),
    h('div', { class: 'sec' }, h('h3', {}, 'Import'),
      h('button', { class: 'btn', title: 'Or drop a sheet anywhere on this tab', onclick: () => pickFile((src, name) => sliceInto(src, name)) }, 'Cut a sprite sheet…'),
      h('p', { class: 'note' }, 'Or pick any image in Files and press "Animate from sheet".')),
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `sprites/${A.actor.name}/`), ' gets one strip PNG per animation, manifest.json, a Godot SpriteFrames .tres, and a packed sheet + JSON for other engines.'),
      V.saveBtn = h('button', { 'data-file': 'save', class: 'btn go wide', onclick: exportActor }, 'Save ' + A.actor.name)));
  drawSheet();
  feedPlayer();
}
// Animations & sheet: the breakdown of what this actor has, sets of animations to add,
// and a box template to draw or generate into, read back by exact boxes.
function drawSheet() {
  if (!V.sheet?.isConnected) return;
  const a = A.actor;
  const setSel = Object.assign(select([['', 'Add an animation set…'], ...Object.entries(SETS).map(([k, v]) => [k, `${v.name} (${v.anims.length})`])], '', k => {
    if (!k) return;
    // a brand-new actor (one blank animation) takes the whole set; otherwise only what's missing is added
    const blankOnly = a.anims.length === 1 && a.anims[0].frames.every(f => !bbox(f));
    const S = SETS[k], have = new Set(blankOnly ? [] : a.anims.map(n => n.name)), add = S.anims.filter(([n]) => !have.has(n));
    if (!add.length) return toast(`${a.name} already has every ${S.name} animation`);
    if (!confirm(`Add ${add.length} animation${add.length > 1 ? 's' : ''} to ${a.name}?\n\n${add.map(([n, f, sp]) => `${n}: ${f} frames${sp > 1 ? ', 2 wide' : ''}`).join('\n')}\n\nExisting animations are not touched.`)) return drawSheet();
    pushUndo();
    if (blankOnly) a.anims = [];
    for (const [name, n, span, fps, loop] of add) a.anims.push({ name, fps, loop, span, frames: Array.from({ length: n }, () => newImg(a.w * span, a.h)) });
    A.ai = 0; A.fi = 0; changed(true);
  }), { title: 'Lay out every animation a hero, enemy, flyer… needs, as boxes to draw into' });
  const rows = a.anims.map((n, i) => {
    const edge = n.frames.filter(f => touches(f).length).length, empty = n.frames.filter(f => !bbox(f)).length;
    return h('tr', { class: i === A.ai ? 'on' : '', onclick: () => { commitFloat(); A.ai = i; A.fi = 0; A.fsel = null; drawTimeline(); drawEditor(); drawSheet(); feedPlayer(); } },
      h('td', {}, n.name), h('td', {}, n.frames.length), h('td', {}, (n.span || 1) > 1 ? '2 wide' : '1'), h('td', {}, n.fps),
      h('td', { class: edge ? 'warn' : empty ? 'faint' : 'ok' }, edge ? `${edge} at edge` : empty ? `${empty} empty` : '✓'));
  });
  V.sheet.replaceChildren(h('h3', {}, 'Animations & sheet'),
    h('table', { class: 'breakdown' }, h('tr', {}, ...['Animation', 'Frames', 'Box', 'fps', ''].map(t => h('th', {}, t))), ...rows),
    h('div', { style: { margin: '8px 0' } }, setSel),
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', title: 'One white box per frame, labelled. Draw or generate inside the boxes, then read it back.', onclick: templateOut }, 'Box template'),
      h('button', { class: 'btn sm', title: 'Read a filled template back into the frames, box by box', onclick: () => pickFile(templateIn) }, 'Read filled template…')),
    h('p', { class: 'note' }, 'Keep each pose inside its box: frames marked red touch the box edge and may be cut off in the game. Use "2 wide" for long swings.'));
}
async function templateOut() {
  const a = A.actor, scale = a.h <= 48 ? 4 : a.h <= 96 ? 2 : 1;
  const { canvas, layout: L } = makeTemplate(a, { withArt: true, scale });
  const one = makeTemplate(a, { withArt: true, scale: 1 }).canvas;
  try {
    await saveFiles(`sprites/${a.name}`, [{ name: 'template.png', b64: one.toDataURL('image/png') }, { name: `template_${scale}x.png`, b64: canvas.toDataURL('image/png') },
      { name: 'template.json', text: JSON.stringify({ actor: a.name, w: a.w, h: a.h, layout: L }, null, 1) + '\n' }]);
    toast(`Template saved: sprites/${a.name}/template.png (+ a ${scale}× copy to draw on)`, 'ok');
  } catch (e) { toast('Could not save the template: ' + e.message, 'bad'); }
  downloadSheet(canvas, `${a.name}_template_${scale}x.png`);
}
async function templateIn(src) {
  let r;
  try { r = readTemplate(await imgData(src), A.actor); } catch (e) { return toast(e.message, 'bad'); }
  const got = r.frames.flat().filter(Boolean).length;
  if (!got) return toast('No art found in the boxes', 'bad');
  pushUndo();
  A.actor.anims.forEach((n, ai) => r.frames[ai].forEach((f, i) => { if (f) n.frames[i] = f; }));
  for (const n of A.actor.anims) for (const f of n.frames) for (const c of colorsOf(f)) if (A.actor.pal.length < 64 && !A.actor.pal.some(p => hex(p) === hex(c))) A.actor.pal.push(c);
  changed(true);
  toast(`Read ${got} frame${got > 1 ? 's' : ''}${r.scale !== 1 ? ` (image was ${r.scale.toFixed(2)}× the template)` : ''}${r.spill.length ? `. Art spills out of: ${r.spill.slice(0, 6).join(', ')}${r.spill.length > 6 ? '…' : ''}` : ''}`, r.spill.length ? 'bad' : 'ok');
}
function pickFile(cb) {
  const i = h('input', { type: 'file', accept: 'image/*' });
  i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(r.result, f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f); };
  i.click();
}
function applyMotion(m, p, name, replace) {
  const base = frame();
  if (!bbox(base)) return toast('Draw something on this frame first');
  const frames = m.make(base, p);
  pushUndo();
  if (replace) { anim().frames = frames; anim().fps = m.fps; A.fi = 0; }
  else { A.actor.anims.push({ name: name || m.anim, fps: m.fps, loop: !/hurt|death|jump|attack/.test(m.anim), frames }); A.ai = A.actor.anims.length - 1; A.fi = 0; }
  changed(true);
  toast(`${frames.length} frames made. Touch them up, then check the preview`);
}
/* ------------------------------------------------------------- identity ---- */
// The actor's identity: what it is, a reference image, its palette and its pixel scale.
// Forge uses it to draw more of the same actor without drifting off-model.
function identityBox() {
  const a = A.actor, id = a.identity;
  const desc = h('textarea', { rows: 2, value: a.desc || '', placeholder: 'what this actor is, e.g. "hooded knight with a red cape and a broken sword"', oninput: e => { a.desc = e.target.value; changed(); } });
  const refImg = id?.ref ? h('img', { src: id.ref, style: { width: '72px', height: '72px', objectFit: 'contain', background: '#fff', imageRendering: 'var(--ir)' } }) : null;
  const sprite = id?.refSprite ? (() => { const c = h('canvas', { style: { height: '72px', imageRendering: 'var(--ir)', background: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/8px 8px' } }); imgData(id.refSprite).then(im => toCanvas(im, 1, c)); return c; })() : null;
  return h('div', { class: 'sec' }, h('h3', {}, 'Identity', h('span', { class: 'grow' }), h('small', {}, id ? 'reference set' : 'no reference yet')),
    field('Actor is', desc),
    id ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '8px 0' } }, refImg, sprite,
      h('div', { class: 'note', style: { margin: 0 } }, `${id.figH}px tall · ${a.pal.length} colours · ${a.w}×${a.h}`)) : null,
    h('div', { class: 'btns' },
      h('button', { class: 'btn go', title: 'Open Forge locked to this actor: same reference, palette, size and scale', onclick: makeMore }, 'Make more frames'),
      h('button', { class: 'btn', title: 'Use the frame you are on as the reference everything is matched to', onclick: setReference }, 'Use this frame as reference')),
    h('p', { class: 'note' }, 'New frames are drawn from the reference, forced into this palette at the same pixel scale, and checked for height and colour match before you add them.'));
}
function setReference() {
  const f = frame(), bb = bbox(f);
  if (!bb) return toast('This frame is empty');
  // a clean upscaled card of the sprite: the generator redraws from it, colours and all
  const S = 512, z = Math.floor(S * 0.86 / Math.max(A.actor.w, A.actor.h));
  const card = document.createElement('canvas'); card.width = card.height = S;
  const x = card.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); artCtx(x, z);
  const ox = Math.floor((S - A.actor.w * z) / 2), oy = S - A.actor.h * z - Math.floor(S * .05);
  x.drawImage(toCanvas(f), ox, oy, A.actor.w * z, A.actor.h * z);
  pushUndo();
  A.actor.identity = { ref: card.toDataURL('image/png'), refW: S, scale: 1 / z, cell: z * 1024 / S, figH: bb.h, refSprite: toDataURL(f), seed: -1 };
  A.actor.pal = colorsOf(f).sort((p, q) => luma(p) - luma(q));
  changed(true);
  toast('Reference set. Its palette is now the actor palette', 'ok');
}
async function makeMore(poses) {
  if (!A.actor.identity) setReference();
  const id = A.actor.identity;
  if (!id) return;
  if (!A.actor.desc?.trim()) { const d = prompt('Describe this actor in a few words (it keeps the generator on-model)', A.actor.name.replace(/_/g, ' ')); if (!d) return; A.actor.desc = d; changed(); }
  emit('forge-for', { name: A.actor.name, desc: A.actor.desc, kind: A.actor.kind || 'character', ref: id.ref, refW: id.refW, scale: id.scale, cell: id.cell || 0, figH: id.figH,
    refSprite: await imgData(id.refSprite), pal: A.actor.pal.slice(), w: A.actor.w, h: A.actor.h, seed: id.seed, poses: Array.isArray(poses) ? poses : null });
}
// the Workshop: everything this actor needs, as a checklist (workshop.js)
function puppet() {
  commitFloat();
  openPuppet(V.view, {
    actor: () => A.actor, frame: () => frame(), isBlank, resize: resizeActor, setFrame: img => { pushUndo(); anim().frames[A.fi] = img; changed(true); },
    changed: () => { A.dirty = true; clearTimeout(saveT); saveT = setTimeout(autosave, 1500); },
    redraw: () => { drawTimeline(); drawLeft(); drawEditor(); feedPlayer(); },
    // a baked motion becomes an animation of the actor (same name: replaced after asking, unless quiet)
    addAnim(name, frames, fps, loop, span, quiet) {
      const a = A.actor, i = a.anims.findIndex(n => n.name === name);
      if (i >= 0 && !quiet && !confirm(`Replace the animation "${name}" with the baked one?`)) return;
      pushUndo();
      const n = { name, fps, loop, span, frames };
      if (i >= 0) a.anims[i] = n; else a.anims.push(n);
      A.ai = i >= 0 ? i : a.anims.length - 1; A.fi = 0; changed(true);
    },
  });
}
function workshop() {
  commitFloat();
  openWorkshop(V.view, {
    actor: () => A.actor, changed, pushUndo, save: exportActor, makeMore, redraw: () => { drawTimeline(); drawLeft(); drawEditor(); feedPlayer(); },
    goto: name => { const i = A.actor.anims.findIndex(n => n.name === name); if (i >= 0) { A.ai = i; A.fi = 0; } changed(true); },
  });
}

/* --------------------------------------------------------------- export ---- */
async function exportActor() {
  commitFloat();
  const r = await saveActor(A.actor, serialize, () => { drawLeft(); if (V.saveBtn) V.saveBtn.textContent = 'Save ' + A.actor.name; });
  if (r) A.dirty = false;
  return r;
}

/* ------------------------------------------------- command wheel & menu ---- */
registerWheel('animate', () => ({
  tools: TOOLS.map(([t, k, title]) => ({ label: title, key: k, on: A.tool === t, run: () => setTool(t) })).concat(
    [{ label: 'Copy frame', key: 'N', run: dupFrame }, { label: 'Flip frame', key: 'H', run: () => { pushUndo(); setFrame(flipX(frame())); } }]),
  guides: [
    { label: 'Onion skin', key: 'O', on: !!A.onion, run: () => { A.onion = !A.onion; drawEditor(); } },
    { label: 'Pixel grid', on: !!A.grid, run: () => { A.grid = !A.grid; drawEditor(); } },
    { label: 'Mirror draw', on: !!A.mirror, hint: 'draw both sides', run: () => { A.mirror = !A.mirror; drawEditor(); } },
    { label: '2-wide box', on: (anim().span || 1) > 1, hint: 'room for long swings', run: () => setSpan(anim(), (anim().span || 1) > 1 ? 1 : 2) },
    { label: 'Hit flash', key: 'F', hint: 'preview', run: () => player?.juice('flash') },
    { label: 'Squash', key: 'S', hint: 'preview', run: () => player?.juice('squash') },
    { label: 'Shake', key: 'K', hint: 'preview', run: () => player?.juice('shake') },
    { label: 'Colour cycle', hint: 'Shift+click colours', run: () => (A.cyc || []).length >= 2 ? colourCycle() : toast('Shift+click 2 or more palette colours first') },
    { label: 'Box template', hint: 'draw into boxes', run: templateOut },
    { label: 'Save actor', run: exportActor },
  ],
}));
registerMenu('#v-animate .frame:not(.add)', el => {
  const i = [...el.parentElement.children].indexOf(el);
  const go = fn => () => { commitFloat(); A.fi = i; fn(); };
  return [{ head: `Frame ${i + 1}` },
    { label: 'Copy frame', key: 'N', run: go(dupFrame) },
    { label: 'Move left', run: go(() => moveFrame(-1)) }, { label: 'Move right', run: go(() => moveFrame(1)) },
    { label: 'Flip', key: 'H', run: go(() => { pushUndo(); setFrame(flipX(frame())); }) },
    { label: 'Use as reference', hint: 'identity', run: go(setReference) },
    { label: 'Delete frame', run: go(delFrame) }];
});
