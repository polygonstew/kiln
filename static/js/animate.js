// Animate: pixel editor + timeline + live previewer + motion generators + export.
import { $, h, api, toast, emit, on, pref, clamp, uid, field, range, select, check, seg, hex, rgb, luma,
  newImg, cloneImg, toCanvas, toDataURL, imgData, blit, bbox, flipX, shift, colorsOf, pixelize, rawURL, checker, HARDWARE, PALETTES } from './core.js';
import { icon } from './icons.js';
import { Player, loadActor } from './player.js';
import { MOTIONS } from './motion.js';
import { openSlicer } from './slicer.js';
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

function blankActor(name = 'hero', w = 32, hh = 32, pal = null) {
  return { id: uid(), name, w, h: hh, desc: '', pal: pal || PALETTES.sweetie.colors.slice(), anims: [{ name: 'idle', fps: 8, loop: true, frames: [newImg(w, hh)] }] };
}

on('to-animate', d => { pending.push(['forge', d]); if (mounted) drain(); });
on('open-actor', d => { pending.push(['open', d]); if (mounted) drain(); });
on('slice-sheet', d => { pending.push(['slice', d]); if (mounted) drain(); });

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
};

async function drain() {
  while (pending.length) {
    const [k, d] = pending.shift();
    if (k === 'forge') fromForge(d);
    if (k === 'open') await openActorDir(d);
    if (k === 'slice') sliceInto(rawURL(d), d.split('/').pop().replace(/\.\w+$/, ''));
  }
}

/* --------------------------------------------------------- persistence ---- */
function serialize(a = A.actor) {
  return { meta: { kind: 'actor', name: a.name, thumb: a.anims[0]?.frames[0] ? toDataURL(a.anims[0].frames[0]) : null },
    actor: { ...a, anims: a.anims.map(n => ({ ...n, frames: n.frames.map(f => toDataURL(f)) })) } };
}
async function deserialize(d) {
  const a = d.actor;
  const anims = [];
  for (const n of a.anims) anims.push({ ...n, frames: await Promise.all(n.frames.map(u => imgData(u))) });
  return { ...a, anims };
}
function snapshot() { return { ...A.actor, pal: A.actor.pal.map(c => c.slice()), anims: A.actor.anims.map(n => ({ ...n, frames: n.frames.map(cloneImg) })) }; }
function pushUndo() { A.undo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); if (A.undo.length > 40) A.undo.shift(); A.redo = []; }
function undo() { if (!A.undo.length) return; A.redo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); const s = A.undo.pop(); A.actor = s.actor; A.ai = s.ai; A.fi = s.fi; changed(true); }
function redo() { if (!A.redo.length) return; A.undo.push({ actor: snapshot(), ai: A.ai, fi: A.fi }); const s = A.redo.pop(); A.actor = s.actor; A.ai = s.ai; A.fi = s.fi; changed(true); }
let saveT;
function changed(structure = false) {
  A.dirty = true;
  A.ai = clamp(A.ai, 0, A.actor.anims.length - 1);
  A.fi = clamp(A.fi, 0, anim().frames.length - 1);
  drawEditor();
  if (structure) { drawTimeline(); drawLeft(); } else updateThumb();
  feedPlayer();
  clearTimeout(saveT);
  saveT = setTimeout(autosave, 1500);
}
function autosave() {
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
        h('span', { class: 'grow' }), V.status,
        h('span', { class: 'lbl' }, 'Zoom'),
        V.zoomSel = select([[0, 'Fit'], ...[2, 3, 4, 6, 8, 10, 12, 16, 20].map(z => [z, z + '×'])], A.zoom, v => { A.zoom = +v; pref.set('anim.zoom', A.zoom); drawEditor(); })),
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
  const wIn = h('input', { type: 'number', value: a.w, min: 4, max: 256, style: { width: '62px' } });
  const hIn = h('input', { type: 'number', value: a.h, min: 4, max: 256, style: { width: '62px' } });
  const sw = h('div', { class: 'sw big' }, ...a.pal.map((c, i) => h('i', {
    class: A.c1 && hex(A.c1) === hex(c) ? 'on' : '', title: `${hex(c)}  ·  click: draw  ·  right-click: second colour  ·  double-click: recolour everywhere`,
    style: { background: hex(c) },
    onclick: () => { A.c1 = c; if (A.tool === 'eraser' || A.tool === 'pick') A.tool = 'pencil'; drawLeft(); },
    oncontextmenu: e => { e.preventDefault(); A.c2 = c; drawLeft(); },
    ondblclick: () => recolour(i),
  })), h('i', { title: 'Add a colour', style: { background: 'none', border: '1px dashed var(--line2)', display: 'grid', placeItems: 'center', color: 'var(--faint)' }, onclick: addColour }, '+'));
  const chip = (c, label, set) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--faint)' } },
    h('i', { style: { width: '22px', height: '22px', display: 'block', border: '1px solid var(--line2)', background: c ? hex(c) : 'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0/8px 8px' } }), label);
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Actor', h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: openMenu }, 'Open'), h('button', { class: 'btn sm ghost', onclick: newActor }, 'New')),
      field('Name', nm),
      field('Frame', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, wIn, '×', hIn,
        h('button', { class: 'btn sm', title: 'Change the frame size. Art stays on the floor, centred.', onclick: () => resizeActor(+wIn.value, +hIn.value) }, 'Set'))),
      h('p', { class: 'note' }, `${a.anims.length} animation${a.anims.length > 1 ? 's' : ''} · ${a.anims.reduce((s, n) => s + n.frames.length, 0)} frames`)),
    h('div', { class: 'sec' }, h('h3', {}, 'Tools'),
      h('div', { class: 'tools' }, ...TOOLS.map(([t, k, title]) => h('button', { class: A.tool === t ? 'on' : '', title: `${title} (${k})`, onclick: () => setTool(t) }, icon(t === 'pick' ? 'pick' : t), h('kbd', {}, k)))),
      h('div', { style: { display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'center' } },
        chip(A.c1, 'draw'), chip(A.c2, 'right-click'),
        h('button', { class: 'btn sm ghost', title: 'Swap (X)', onclick: () => { [A.c1, A.c2] = [A.c2, A.c1]; drawLeft(); } }, 'Swap'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Palette', h('span', { class: 'grow' }), h('small', { style: { color: used.size > H.sprite ? 'var(--warn)' : 'var(--faint)' } }, `${used.size} used · ${H.name} allows ${H.sprite}`)),
      sw,
      h('div', { class: 'btns' },
        h('button', { class: 'btn sm', title: 'Replace the palette with the colours actually used in the frames', onclick: () => { A.actor.pal = [...used].map(rgb).sort((x, y) => luma(x) - luma(y)); drawLeft(); } }, 'From frames'),
        select([['', 'Load preset…'], ...Object.entries(PALETTES).map(([k, p]) => [k, p.name])], '', v => { if (v) { A.actor.pal = PALETTES[v].colors.slice(); drawLeft(); } }),
        select(Object.entries(HARDWARE).map(([k, H]) => [k, 'Check: ' + H.name]), A.hw, v => { A.hw = v; pref.set('anim.hw', v); drawLeft(); })),
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
function resizeActor(w, hh) {
  w = clamp(w | 0, 4, 256); hh = clamp(hh | 0, 4, 256);
  if (w === A.actor.w && hh === A.actor.h) return;
  pushUndo();
  for (const n of A.actor.anims) n.frames = n.frames.map(f => blit(newImg(w, hh), f, Math.floor((w - f.width) / 2), hh - f.height));
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
  const list = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'actor');
  const sprites = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const dirs = sprites.items.filter(i => i.dir && i.ok);
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', {},
    h('header', {}, h('span', { class: 'grow' }, 'Open an actor'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' },
      h('h3', { class: 'lbl', style: { margin: '0 0 6px' } }, 'Kiln projects (editable, keep your palette)'),
      list.length ? list.map(p => h('div', { class: 'palrow', onclick: async () => { m.remove(); await openProject(p.id); } },
        p.thumb ? h('img', { src: p.thumb, style: { width: '32px', height: '32px', imageRendering: 'pixelated', objectFit: 'contain', background: 'var(--p3)' } }) : null,
        h('span', {}, p.name), h('span', { class: 'faint mono', style: { marginLeft: 'auto', fontSize: '11px' } }, new Date(p.mtime * 1000).toLocaleString()))) : h('p', { class: 'note' }, 'None yet.'),
      h('h3', { class: 'lbl', style: { margin: '16px 0 6px' } }, 'Exported actors in sprites/'),
      dirs.length ? dirs.map(d => h('div', { class: 'palrow', onclick: () => { m.remove(); openActorDir(d.path); } }, icon('folder'), h('span', {}, d.name), h('span', { class: 'faint mono', style: { marginLeft: 'auto', fontSize: '11px' } }, d.info))) : h('p', { class: 'note' }, 'None yet.'))));
  document.body.append(m);
}
async function openProject(id) {
  try {
    const d = await (await fetch('/api/project?id=' + encodeURIComponent(id))).json();
    A.actor = await deserialize(d); A.ai = A.fi = 0; A.undo = []; A.redo = []; changed(true); toast('Opened ' + A.actor.name);
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
        pal: [...pal.values()].slice(0, 64).sort((x, y) => luma(x) - luma(y)), anims: a.anims.map(n => ({ name: n.name, fps: n.fps, loop: n.loop, frames: n.frames })) };
    }
    A.ai = A.fi = 0; A.undo = []; A.redo = []; changed(true);
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
    A.ai = A.fi = 0; A.undo = []; A.redo = [];
    toast('New actor from Forge. Try a motion on the right to start animating', 'ok');
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
function drawEditor() {
  if (!V.cv || !A.actor) return;
  const a = A.actor, W = V.vp.clientWidth, H = V.vp.clientHeight;
  zoomNow = A.zoom || Math.max(1, Math.floor(Math.min((W - 40) / a.w, (H - 40) / a.h)));
  const cw = a.w * zoomNow, ch = a.h * zoomNow;
  V.cv.width = cw; V.cv.height = ch;
  V.cv.style.width = cw + 'px'; V.cv.style.height = ch + 'px';
  const x = V.cv.getContext('2d');
  x.imageSmoothingEnabled = false;
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
    for (let i = 1; i < a.w; i++) { x.moveTo(i * zoomNow + .5, 0); x.lineTo(i * zoomNow + .5, ch); }
    for (let i = 1; i < a.h; i++) { x.moveTo(0, i * zoomNow + .5); x.lineTo(cw, i * zoomNow + .5); }
    x.stroke();
    // 8×8 tile lines, slightly stronger: hardware sprites are built from these
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.beginPath();
    for (let i = 8; i < a.w; i += 8) { x.moveTo(i * zoomNow + .5, 0); x.lineTo(i * zoomNow + .5, ch); }
    for (let i = 8; i < a.h; i += 8) { x.moveTo(0, i * zoomNow + .5); x.lineTo(cw, i * zoomNow + .5); }
    x.stroke();
  }
  if (A.mirror) { x.strokeStyle = '#ff5b2e88'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(cw / 2, 0); x.lineTo(cw / 2, ch); x.stroke(); x.setLineDash([]); }
  const s = A.float ? { x: A.float.x, y: A.float.y, w: A.float.img.width, h: A.float.img.height } : A.sel;
  if (s) { x.strokeStyle = '#fff'; x.setLineDash([3, 3]); x.lineDashOffset = (performance.now() / 60) % 6; x.strokeRect(s.x * zoomNow + .5, s.y * zoomNow + .5, s.w * zoomNow - 1, s.h * zoomNow - 1); x.setLineDash([]); }
  if (hover && !drag) { x.strokeStyle = 'rgba(255,255,255,.5)'; x.strokeRect(hover[0] * zoomNow + .5, hover[1] * zoomNow + .5, zoomNow - 1, zoomNow - 1); }
  V.status.textContent = `${anim().name} ${A.fi + 1}/${fr.length}${hover ? `  ·  ${hover[0]},${hover[1]}` : ''}  ·  ${zoomNow}×`;
}
setInterval(() => { if (mounted && (A.sel || A.float) && V.cv?.isConnected) drawEditor(); }, 120);
const px = e => { const r = V.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / zoomNow), Math.floor((e.clientY - r.top) / zoomNow)]; };
const inside = ([x, y]) => x >= 0 && y >= 0 && x < A.actor.w && y < A.actor.h;
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
    const p = px(e), f = frame(), c = e.button === 2 ? A.c2 : A.c1;
    const t = A.tool;
    if (t === 'pick') { if (inside(p)) { const k = getPx(f, ...p); if (e.button === 2) A.c2 = k; else A.c1 = k; drawLeft(); } return; }
    if (t === 'select') {
      if (A.float && hit(p, A.float)) { drag = { t: 'float', p0: p, o: [A.float.x, A.float.y] }; return; }
      if (A.sel && hit(p, A.sel) && !A.float) { liftSel(); drag = { t: 'float', p0: p, o: [A.float.x, A.float.y] }; return; }
      commitFloat(); A.sel = null; drag = { t: 'sel', p0: p }; return;
    }
    pushUndo();
    if (t === 'move') { drag = { t: 'move', p0: p, base: cloneImg(f) }; return; }
    if (t === 'fill') { if (inside(p)) { flood(f, ...p, c); changed(); } return; }
    if (t === 'line' || t === 'rect') { drag = { t, p0: p, base: cloneImg(f), c, fill: e.shiftKey }; return; }
    const col = t === 'eraser' ? null : c;
    drag = { t: 'paint', last: p, c: col };
    setPx(f, ...p, col); drawEditor();
  });
  cv.addEventListener('pointermove', e => {
    const p = px(e);
    hover = inside(p) ? p : null;
    if (!drag) { drawEditor(); return; }
    const f = frame();
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
      const x0 = clamp(Math.min(drag.p0[0], p[0]), 0, A.actor.w - 1), y0 = clamp(Math.min(drag.p0[1], p[1]), 0, A.actor.h - 1);
      const x1 = clamp(Math.max(drag.p0[0], p[0]), 0, A.actor.w - 1), y1 = clamp(Math.max(drag.p0[1], p[1]), 0, A.actor.h - 1);
      A.sel = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; drawEditor();
    } else if (drag.t === 'float') {
      A.float.x = drag.o[0] + p[0] - drag.p0[0]; A.float.y = drag.o[1] + p[1] - drag.p0[1]; drawEditor();
    }
  });
  const up = () => { if (!drag) return; const t = drag.t; drag = null; if (t !== 'sel' && t !== 'float') changed(); else drawEditor(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { hover = null; drawEditor(); });
  V.vp.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.altKey) return;
    e.preventDefault();
    A.zoom = clamp((A.zoom || zoomNow) + (e.deltaY < 0 ? 1 : -1), 1, 40); pref.set('anim.zoom', A.zoom); drawEditor();
  }, { passive: false });
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
  if (e.target.matches('input,textarea,select')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c') { const s = A.sel || { x: 0, y: 0, w: A.actor.w, h: A.actor.h }; clip = { img: cropImg(frame(), s), x: s.x, y: s.y }; toast('Copied'); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && clip) { commitFloat(); pushUndo(); A.float = { img: cloneImg(clip.img), x: clip.x, y: clip.y }; A.tool = 'select'; drawLeft(); drawEditor(); e.preventDefault(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = TOOLS.find(t => t[1].toLowerCase() === k);
  if (tool) { setTool(tool[0]); return; }
  if (k === 'x') { [A.c1, A.c2] = [A.c2, A.c1]; drawLeft(); }
  else if (k === 'o') { A.onion = !A.onion; drawEditor(); }
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
    onclick: () => { commitFloat(); A.ai = i; A.fi = 0; drawTimeline(); drawEditor(); feedPlayer(); },
    ondblclick: () => { const v = prompt('Animation name', n.name); if (v) { n.name = slug(v); changed(true); } },
  }, n.name, h('small', {}, n.frames.length))),
  h('button', { title: 'New animation', onclick: addAnim }, '+ Animation'));
  const n = anim();
  const fps = h('input', { type: 'number', min: 1, max: 60, value: n.fps, style: { width: '56px' }, onchange: () => { n.fps = clamp(+fps.value, 1, 60); changed(); } });
  V.animCtl.replaceChildren(
    h('span', { class: 'lbl' }, 'Speed'), fps, h('span', { class: 'faint', style: { fontSize: '11px' } }, 'fps'),
    check('loop', n.loop !== false, v => { n.loop = v; changed(); }),
    h('i', { class: 'sep' }),
    h('button', { class: 'btn sm', title: 'Duplicate frame (N)', onclick: dupFrame }, icon('dup'), 'Copy frame'),
    h('button', { class: 'btn sm', onclick: () => { pushUndo(); n.frames.splice(A.fi + 1, 0, newImg(a.w, a.h)); A.fi++; changed(true); } }, icon('plus'), 'Blank'),
    h('button', { class: 'btn sm ghost', title: 'Move frame left', onclick: () => moveFrame(-1) }, '◂'),
    h('button', { class: 'btn sm ghost', title: 'Move frame right', onclick: () => moveFrame(1) }, '▸'),
    h('button', { class: 'btn sm ghost danger', onclick: delFrame }, 'Delete frame'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm ghost', title: 'Copy this whole animation as a new one', onclick: () => { pushUndo(); a.anims.splice(A.ai + 1, 0, { ...n, name: n.name + '_copy', frames: n.frames.map(cloneImg) }); A.ai++; A.fi = 0; changed(true); } }, 'Duplicate anim'),
    h('button', { class: 'btn sm ghost danger', onclick: () => { if (a.anims.length < 2) return toast('An actor needs at least one animation'); if (!confirm(`Delete the animation "${n.name}"?`)) return; pushUndo(); a.anims.splice(A.ai, 1); A.ai = Math.max(0, A.ai - 1); A.fi = 0; changed(true); } }, 'Delete anim'));
  const th = Math.min(64, Math.max(32, a.h * 2)), z = th / a.h;
  let dragFrom = null;
  V.frames.replaceChildren(...n.frames.map((f, i) => {
    const c = toCanvas(f); c.style.width = Math.round(a.w * z) + 'px'; c.style.height = th + 'px';
    c.style.background = 'repeating-conic-gradient(#2a2a28 0 25%, #313130 0 50%) 0 0/8px 8px';
    const el = h('div', { class: 'frame' + (i === A.fi ? ' on' : ''), draggable: true, onclick: () => { commitFloat(); A.fi = i; drawTimeline(); drawEditor(); } }, c, h('span', { class: 'n' }, i + 1));
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
function dupFrame() { pushUndo(); anim().frames.splice(A.fi + 1, 0, cloneImg(frame())); A.fi++; changed(true); }
function delFrame() { const n = anim(); if (n.frames.length < 2) { pushUndo(); n.frames[0] = newImg(A.actor.w, A.actor.h); changed(true); return; } pushUndo(); n.frames.splice(A.fi, 1); changed(true); }
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
    h('div', { class: 'sec' }, h('h3', {}, 'Import'),
      h('button', { class: 'btn', title: 'Or drop a sheet anywhere on this tab', onclick: () => pickFile((src, name) => sliceInto(src, name)) }, 'Cut a sprite sheet…'),
      h('p', { class: 'note' }, 'Or pick any image in Files and press "Animate from sheet".')),
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `sprites/${A.actor.name}/`), ' gets one strip PNG per animation, manifest.json, a Godot SpriteFrames .tres, and a packed sheet + JSON for other engines.'),
      h('button', { class: 'btn go wide', onclick: exportActor }, 'Save ' + A.actor.name)));
  feedPlayer();
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
  const refImg = id?.ref ? h('img', { src: id.ref, style: { width: '72px', height: '72px', objectFit: 'contain', background: '#fff', imageRendering: 'pixelated' } }) : null;
  const sprite = id?.refSprite ? (() => { const c = h('canvas', { style: { height: '72px', imageRendering: 'pixelated', background: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/8px 8px' } }); imgData(id.refSprite).then(im => toCanvas(im, 1, c)); return c; })() : null;
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
  const x = card.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.imageSmoothingEnabled = false;
  const ox = Math.floor((S - A.actor.w * z) / 2), oy = S - A.actor.h * z - Math.floor(S * .05);
  x.drawImage(toCanvas(f), ox, oy, A.actor.w * z, A.actor.h * z);
  pushUndo();
  A.actor.identity = { ref: card.toDataURL('image/png'), refW: S, scale: 1 / z, cell: z * 1024 / S, figH: bb.h, refSprite: toDataURL(f), seed: -1 };
  A.actor.pal = colorsOf(f).sort((p, q) => luma(p) - luma(q));
  changed(true);
  toast('Reference set. Its palette is now the actor palette', 'ok');
}
async function makeMore() {
  if (!A.actor.identity) setReference();
  const id = A.actor.identity;
  if (!id) return;
  if (!A.actor.desc?.trim()) { const d = prompt('Describe this actor in a few words (it keeps the generator on-model)', A.actor.name.replace(/_/g, ' ')); if (!d) return; A.actor.desc = d; changed(); }
  emit('forge-for', { name: A.actor.name, desc: A.actor.desc, kind: A.actor.kind || 'character', ref: id.ref, refW: id.refW, scale: id.scale, cell: id.cell || 0, figH: id.figH,
    refSprite: await imgData(id.refSprite), pal: A.actor.pal.slice(), w: A.actor.w, h: A.actor.h, seed: id.seed });
}

/* --------------------------------------------------------------- export ---- */
async function exportActor() {
  commitFloat();
  const a = A.actor, dir = `sprites/${a.name}`;
  const files = [], man = { w: a.w, h: a.h, source: 'kiln', anims: {} };
  for (const n of a.anims) {
    const strip = newImg(a.w * n.frames.length, a.h);
    n.frames.forEach((f, i) => blit(strip, f, i * a.w, 0));
    files.push({ name: `${n.name}.png`, b64: toDataURL(strip) });
    man.anims[n.name] = { file: `${n.name}.png`, frames: n.frames.length, fps: n.fps, loop: n.loop !== false };
  }
  files.push({ name: 'manifest.json', text: JSON.stringify(man, null, 2) + '\n' });
  // packed sheet: one row per animation, plus an Aseprite-style JSON (frames + frameTags)
  const cols = Math.max(...a.anims.map(n => n.frames.length));
  const sheet = newImg(cols * a.w, a.anims.length * a.h);
  const sj = { frames: {}, meta: { app: 'kiln', image: 'sheet.png', size: { w: sheet.width, h: sheet.height }, frameTags: [] } };
  let idx = 0;
  a.anims.forEach((n, r) => {
    const from = idx;
    n.frames.forEach((f, i) => {
      blit(sheet, f, i * a.w, r * a.h);
      sj.frames[`${n.name}_${i}`] = { frame: { x: i * a.w, y: r * a.h, w: a.w, h: a.h }, duration: Math.round(1000 / n.fps) };
      idx++;
    });
    sj.meta.frameTags.push({ name: n.name, from, to: idx - 1, direction: 'forward' });
  });
  files.push({ name: 'sheet.png', b64: toDataURL(sheet) }, { name: 'sheet.json', text: JSON.stringify(sj, null, 1) + '\n' });
  // Godot 4 SpriteFrames
  const dest = FS.root + '/' + dir;
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + dest.slice(g.root.length + 1) : dir;
  files.push({ name: `${a.name}.tres`, text: spriteFrames(a, res) });
  // body hitbox from the idle (or first) animation: the figure's box, trimmed to its core width
  // so a cape or a held weapon doesn't widen it
  const base = a.anims.find(n => /idle|stand/i.test(n.name)) || a.anims[0];
  const bbs = base.frames.map(bbox).filter(Boolean);
  if (bbs.length) {
    const med = k => bbs.map(b => b[k]).sort((p, q) => p - q)[bbs.length >> 1];
    const bh = med('h'), bw = Math.max(2, Math.round(med('w') * 0.6)), cx = med('x') + med('w') / 2;
    man.hitbox = { x: Math.round(cx - bw / 2), y: a.h - bh, w: bw, h: bh };
    files.find(f => f.name === 'manifest.json').text = JSON.stringify(man, null, 2) + '\n';
    files.push({ name: `${a.name}.tscn`, text: actorScene(a, res, man.hitbox) });
  }
  if (a.identity?.ref) files.push({ name: 'reference.png', b64: a.identity.ref });
  files.push({ name: 'palette.hex', text: a.pal.map(c => hex(c).slice(1)).join('\n') + '\n' });
  files.push({ name: 'CHARACTER.md', text: await characterDoc(a, dir, base) });
  try {
    const r = await saveFiles(dir, files);
    // keep the editable source too
    await api('/api/project', { id: 'actor-' + a.name, data: serialize() });
    A.dirty = false;
    toast(`Saved ${files.length} files to ${dir}/${g.root ? ' (Godot paths)' : ''}`, 'ok');
    return r;
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
// Godot 4 drop-in: CharacterBody2D (origin at the feet) + AnimatedSprite2D + body hitbox
function actorScene(a, res, hb) {
  const start = (a.anims.find(n => /idle|stand/i.test(n.name)) || a.anims[0]).name;
  return `[gd_scene load_steps=3 format=3]\n\n[ext_resource type="SpriteFrames" path="${res}/${a.name}.tres" id="1"]\n\n`
    + `[sub_resource type="RectangleShape2D" id="body"]\nsize = Vector2(${hb.w}, ${hb.h})\n\n`
    + `[node name="${a.name}" type="CharacterBody2D"]\n\n`
    + `[node name="Sprite" type="AnimatedSprite2D" parent="."]\ntexture_filter = 1\nposition = Vector2(0, ${-a.h / 2})\nsprite_frames = ExtResource("1")\nanimation = &"${start}"\nautoplay = "${start}"\n\n`
    + `[node name="Body" type="CollisionShape2D" parent="."]\nposition = Vector2(${hb.x + hb.w / 2 - a.w / 2}, ${hb.y + hb.h / 2 - a.h})\nshape = SubResource("body")\n`;
}
// CHARACTER.md: everything needed to come back later (a person or an agent) and make more of this
// actor on-model. The "## Notes" section is yours: it is kept when the file is rewritten.
async function characterDoc(a, dir, base) {
  let notes = '';
  try { const old = await (await fetch(rawURL(FS.root + '/' + dir + '/CHARACTER.md'))).text(); const i = old.indexOf('## Notes'); if (i >= 0) notes = old.slice(i).trim(); } catch { }
  const id = a.identity || {}, fb = bbox(base.frames[0]);
  return `# ${a.name}

${a.desc?.trim() || '_No description yet. Add one in Animate → Identity; it is what keeps the generator on-model._'}

| | |
|---|---|
| Kind | ${a.kind || 'character'} |
| Frame | ${a.w}×${a.h} px, feet on the bottom row |
| Figure | ${id.figH || fb?.h || a.h} px tall${id.cell ? `; art drawn on ~${id.cell.toFixed(1)} px cells per 1024 px` : ''} |
| Palette | ${a.pal.length <= 32 ? `${a.pal.length} colours: ${a.pal.map(hex).join(' ')}` : `${a.pal.length} colours (full list in \`palette.hex\`)`} |
| Reference | ${id.ref ? '\`reference.png\` (the image new frames are redrawn from)' : 'none yet (Animate → Identity → Use this frame as reference)'} |

## Animations

${a.anims.map(n => `- **${n.name}**: ${n.frames.length} frame${n.frames.length > 1 ? 's' : ''} at ${n.fps} fps${n.loop === false ? ', plays once' : ''} (\`${n.name}.png\`)`).join('\n')}

## Making more of it (stay on-model)

1. Kiln → Animate → open **${a.name}** → **Make more frames**. Forge locks the reference, the palette above,
   the frame size and the pixel scale, and warns when height or colours drift.
2. The cloud prompt Kiln sends, if you need to do it by hand with \`reference.png\` attached:

   > Redraw this exact ${a.kind || 'character'} from the reference image: ${a.desc?.trim() || '<description>'}. Change: <pose or action>.
   > Keep the identical design, costume, proportions, colours, line weight and facing direction; only the pose or action changes.

3. Then pixelize with: palette locked to the colours above, figure ${id.figH || fb?.h || a.h} px tall, outline 1 px, feet on the floor.

## Files

\`${a.name}.tres\` Godot SpriteFrames · \`${a.name}.tscn\` CharacterBody2D + sprite + body hitbox · \`manifest.json\` · \`sheet.png\`/\`sheet.json\` (Aseprite-style) · one strip PNG per animation.

${notes || '## Notes\n\n_Your notes: personality, rules (e.g. "always holds the lantern in the left hand"), what to avoid. Kept when Kiln rewrites this file._'}
`;
}
function spriteFrames(a, res) {
  const ext = [], subs = [], animsOut = [];
  a.anims.forEach((n, ai) => {
    ext.push(`[ext_resource type="Texture2D" path="${res}/${n.name}.png" id="${ai + 1}"]`);
    const fr = n.frames.map((_, i) => {
      const id = `a${ai}_${i}`;
      subs.push(`[sub_resource type="AtlasTexture" id="${id}"]\natlas = ExtResource("${ai + 1}")\nregion = Rect2(${i * a.w}, 0, ${a.w}, ${a.h})`);
      return `{\n"duration": 1.0,\n"texture": SubResource("${id}")\n}`;
    });
    animsOut.push(`{\n"frames": [${fr.join(', ')}],\n"loop": ${n.loop !== false},\n"name": &"${n.name}",\n"speed": ${n.fps.toFixed(1)}\n}`);
  });
  return `[gd_resource type="SpriteFrames" load_steps=${ext.length + subs.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n\n')}\n\n[resource]\nanimations = [${animsOut.join(', ')}]\n`;
}
