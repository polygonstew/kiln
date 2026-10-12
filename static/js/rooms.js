// Rooms: the point & click area. A room is a background picture with a walk area, hotspots (things to look at, use,
// pick up, talk to, or leave by), entries (where you arrive) and a depth scale; the room's music and every hotspot's
// sound live here too. Save writes rooms/<name>/ for Godot (adventure_godot.js) and the game's items to
// adventure/items.json. The map is rooms_canvas.js, the right panel rooms_inspect.js; Items, Flow (the puzzle
// flowchart) and Script (every line in the game) open from the left panel.
import { h, api, toast, on, emit, pref, uid, field, select, seg, check, imgData, toCanvas, rawURL, toDataURL, newImg } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { openProjects } from './projects.js';
import { registerWheel, registerKeys } from './wheel.js';
import { loadOwners, claim } from './owners.js';
import { ensureBrain } from './layout.js';
import { BRAIN_GD } from './brains.js';
import { roomCanvas } from './rooms_canvas.js';
import { inspector } from './rooms_inspect.js';
import { roomScene, itemsJSON, adventureRuntime, crossed, picFile } from './adventure_godot.js';
import { listScenes, buildKey } from './playbuild.js';
import { pickPicture } from './pictures.js';
import { LOOK } from './gametype.js';

const slug = s => String(s || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'room';
const blank = (name = 'room', w = LOOK().w, h = LOOK().h) => ({ id: uid(), name, w, h, bg: null, fg: null, walk: [], depth: { farY: Math.round(h * .55), farS: .6, nearY: h, nearS: 1 },
  entries: [{ name: 'start', x: Math.round(w / 4), y: Math.round(h * .85) }], hotspots: [], music: '' });
const getProject = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);
const ls = async rel => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + rel)).catch(() => ({ items: [] }))).items || []);
const AUDIO = /\.(wav|ogg|mp3)$/i;

let R = null, I = { items: [], combos: [] }, V = {}, map = null, mounted = false, tool = 'select', sel = null, zoom = 0, saveT = 0;
let images = { bg: null, fg: null }, undo = [], redo = [], ready = Promise.resolve();
const show = { front: true };
export let lists = { items: [], rooms: {}, dialogues: [], actors: [], sounds: [], voices: [], pictures: [], flags: [] };

export const rooms = {
  id: 'rooms', title: 'Rooms', key: '',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    map = roomCanvas({ room: () => R, sel: () => sel, select: setSel, tool: () => tool, setTool, images: () => images, changed, snapshot, show, zoom: () => zoom, newHotspot, dropAsset });
    V.vp = h('div', { class: 'viewport', style: { background: '#0e0e0d' } }, map.el);
    V.tools = h('span');
    el.append(V.left, h('section', { class: 'stage' },
      h('div', { class: 'bar' }, V.tools, h('span', { class: 'lbl' }, 'Zoom'), Object.assign(select([[0, 'Fit'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], zoom, v => { zoom = +v; map.draw(); }), { title: 'Map zoom' }),
        check('front layer', show.front, v => { show.front = v; map.draw(); }), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm go', title: 'Build the game starting in this room and play it in the Stage', onclick: playHere }, '▶ Play this room')),
      V.vp,
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'S select · W walk area · H hotspot (drag a box) · E entry · D depth · right click removes a point · double click an edge adds one · Delete removes · Ctrl+Z undo'))),
      V.right);
    document.addEventListener('keydown', e => { if (el.classList.contains('on') && !e.target.matches('input,textarea,select') && !document.querySelector('.modal')) keys(e); });
    new ResizeObserver(() => map.draw()).observe(V.vp);
    drawTools();
    ready = start();
  },
  show() { if (R) { loadLists().then(drawPanels); map.draw(); } },
  async saveProject(id) { await ready; await openRoom(id); await saveRoom(); },
};

/* ------------------------------------------------------------ open / new / keep ---- */
async function start() {
  const ps = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'room').sort((a, b) => b.mtime - a.mtime);
  const want = pref.get('room.cur:' + FS.root, ps[0]?.id);
  if (want && ps.some(p => p.id === want)) await openRoom(want); else { R = blank(); await setImages(); }
  await loadLists(); drawPanels(); map.draw(true);
}
on('root', () => { if (mounted) ready = start(); });
on('open-room', n => { if (mounted) openRoom('room-' + n).then(() => { loadLists(); drawPanels(); }); });
on('room-bg', url => { if (!mounted || !R) return; snapshot(); setPicture('bg', url); });

async function openRoom(id) {
  const d = await getProject(id);
  if (!d?.room) return toast('That room could not be read', 'bad');
  R = d.room; sel = null; undo = []; redo = [];
  pref.set('room.cur:' + FS.root, id);
  await setImages(); map?.draw(true);
}
async function setImages() {
  images = { bg: R.bg ? toCanvas(await imgData(R.bg).catch(() => newImg(1, 1))) : null, fg: R.fg ? toCanvas(await imgData(R.fg).catch(() => newImg(1, 1))) : null };
}
// every change is kept (autosaved as a project) a moment later; full = the panels change too
function changed(full) {
  map.draw(); if (full) drawPanels();
  clearTimeout(saveT); saveT = setTimeout(keep, 1200);
}
async function keep() {
  await loadOwners('room');
  if (claim('room', R, slug)) drawPanels();
  const thumb = images.bg ? (() => { const c = document.createElement('canvas'); c.width = 64; c.height = Math.round(64 * R.h / R.w); c.getContext('2d').drawImage(images.bg, 0, 0, c.width, c.height); return c.toDataURL(); })() : undefined;
  await api('/api/project', { id: 'room-' + R.name, data: { meta: { kind: 'room', name: R.name, thumb }, room: R } }).catch(e => toast('Could not keep the room: ' + e.message, 'bad'));
  pref.set('room.cur:' + FS.root, 'room-' + R.name);
}
const strip = r => JSON.stringify({ ...r, bg: undefined, fg: undefined });
function snapshot() { undo.push(strip(R)); if (undo.length > 80) undo.shift(); redo = []; }
function undoRedo(back) {
  const from = back ? undo : redo, to = back ? redo : undo;
  if (!from.length) return;
  to.push(strip(R)); Object.assign(R, JSON.parse(from.pop()), { bg: R.bg, fg: R.fg });
  if (sel && !R.hotspots.some(q => q.id === sel) && !['walk', 'depth'].includes(sel) && !String(sel).startsWith('entry:')) sel = null;
  changed(true);
}
function newRoom() {
  const n = prompt('Name for the new room', 'hall'); if (!n) return;
  R = blank(slug(n)); sel = null; undo = []; images = { bg: null, fg: null };
  changed(true); map.draw(true);
  toast('A new room: pick its background on the left, then draw where people can walk', 'ok');
}
const openMenu = () => openProjects('room', { current: R.name, open: p => openRoom(p.id).then(() => { loadLists(); drawPanels(); }), renamed: n => { R.name = n; drawPanels(); } });

/* ------------------------------------------------------------ selection, tools, keys ---- */
function setSel(id) { sel = id; drawPanels(); map.draw(); }
function setTool(t) { tool = t; drawTools(); if (t === 'walk') sel = 'walk'; if (t === 'depth') sel = 'depth'; drawPanels(); map.draw(); }
const TOOLS = [['select', 'Select', 'Pick and drag things (S)'], ['walk', 'Walk area', 'Click around the floor where people can walk (W)'], ['hotspot', 'Hotspot', 'Drag a box around something to look at or use (H)'],
  ['entry', 'Entry', 'Click where people arrive in this room (E)'], ['depth', 'Depth', 'Drag the blue lines: people shrink further back (D)']];
function drawTools() { V.tools.replaceChildren(seg(TOOLS, tool, setTool)); }
function newHotspot(poly) {
  snapshot();
  const n = R.hotspots.length + 1, q = { id: uid(), name: 'thing_' + n, title: 'Thing ' + n, poly, does: 'say', look: '', text: '' };
  R.hotspots.push(q); sel = q.id; tool = 'select'; drawTools(); changed(true);
}
// from the asset shelf: a person stands where dropped, a picture sits there; either is a hotspot to set up
function dropAsset(a, [x, y]) {
  if (!['actor', 'picture', 'item'].includes(a.kind)) return toast('Drop a character, a picture or an item here');
  const s = Math.round(Math.min(R.w, R.h) * (a.kind === 'actor' ? .14 : .05));
  newHotspot(a.kind === 'actor' ? [[x - s / 2, y - s * 2], [x + s / 2, y - s * 2], [x + s / 2, y], [x - s / 2, y]] : [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]]);
  const q = R.hotspots[R.hotspots.length - 1];
  Object.assign(q, { title: a.name.replace(/\.\w+$/, ''), name: a.name.replace(/\W+/g, '_').toLowerCase() },
    a.kind === 'actor' ? { does: 'talk', shows: { kind: 'actor', name: a.name } } : a.kind === 'item' ? { does: 'pick', item: a.id, vanish: true } : { shows: { kind: 'picture', path: a.path, scale: .5 } });
  changed(true);
}
function remove() {
  snapshot();
  if (String(sel).startsWith('entry:')) R.entries = R.entries.filter(e => 'entry:' + e.name !== sel);
  else R.hotspots = R.hotspots.filter(q => q.id !== sel);
  sel = null; changed(true);
}
function keys(e) {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return undoRedo(!e.shiftKey); }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); return undoRedo(false); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = { s: 'select', w: 'walk', h: 'hotspot', e: 'entry', d: 'depth' }[k];
  if (t) { setTool(t); e.preventDefault(); }
  else if ((k === 'delete' || k === 'backspace') && sel && sel !== 'walk' && sel !== 'depth') { remove(); e.preventDefault(); }
  else if (k === 'escape') { setSel(null); setTool('select'); }
}

/* ------------------------------------------------------------ lists the panels pick from ---- */
async function loadLists() {
  const ps = await api('/api/projects').catch(() => []);
  const roomsMap = {}, flags = new Set();
  for (const p of ps.filter(p => p.kind === 'room')) {
    const d = p.name === R?.name ? { room: R } : await getProject(p.id);
    roomsMap[p.name] = (d?.room?.entries || []).map(e => e.name);
    for (const q of d?.room?.hotspots || []) for (const f of [q.setsFlag, q.needsFlag, q.when, q.unless]) if (f) flags.add(f);
  }
  if (R && !roomsMap[R.name]) roomsMap[R.name] = R.entries.map(e => e.name);
  const dialogues = ps.filter(p => p.kind === 'dialogue');
  for (const p of dialogues) {
    const d = (await getProject(p.id))?.dialogue;
    for (const b of d?.beats || []) for (const x of [...(b.do || []), ...(b.choices || []).flatMap(c => [...(c.do || []), c.if || {}])]) if (['flag', 'unflag', 'noflag'].includes(x.k) && x.v) flags.add(x.v);
  }
  I = (await getProject('items-adventure'))?.items || I;
  const audio = async d => (await ls(d)).filter(i => AUDIO.test(i.name)).map(i => [`${d}/${i.name}`, `${d}/${i.name}`]);
  const actors = (await listScenes('sprites')).map(([n]) => n);
  const voices = [];
  for (const a of actors) for (const i of await ls(`sprites/${a}/voice`)) if (i.name.endsWith('.lipsync.json')) voices.push([`sprites/${a}/voice/${i.name}`, `${a}: ${i.name.replace('.lipsync.json', '')}`]);
  const pictures = [];
  for (const d of (await ls('icons')).filter(i => i.dir)) for (const i of await ls('icons/' + d.name)) if (/\.png$/i.test(i.name) && i.name !== 'sheet.png') pictures.push(`icons/${d.name}/${i.name}`);
  lists = { items: I.items, rooms: roomsMap, dialogues: dialogues.map(p => [`dialogue/${p.name}.json`, p.name]), actors, sounds: [...await audio('sfx'), ...await audio('music')], music: [...await audio('music'), ...await audio('sfx')], voices, pictures, flags: [...flags].sort() };
}

/* ------------------------------------------------------------ panels ---- */
function drawPanels() {
  if (!R) return;
  const name = h('input', { type: 'text', value: R.name, onchange: () => { R.name = slug(name.value); name.value = R.name; changed(true); } });
  const warn = R.walk.length >= 3 && crossed(R.walk) ? h('p', { class: 'note', style: { color: 'var(--warn)' } }, 'The walk area\'s edges cross: drag a point so they don\'t, or people walk strangely.') : '';
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Room', h('span', { class: 'grow' }),
        h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy or remove your rooms', onclick: openMenu }, 'Open'),
        h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'A new empty room (this one is kept)', onclick: newRoom }, 'New')),
      field('Name', name),
      field('Background', h('span', { class: 'rm-pic' }, R.bg ? h('img', { src: R.bg }) : '', h('button', { class: 'btn sm', title: 'A picture from Scenes, your folder or your computer (or right click any picture → Send to → Rooms)', onclick: () => pickPicture('Background', u => setPicture('bg', u)) }, R.bg ? 'Change' : 'Pick…')), `${R.w}×${R.h} px: the room's size`),
      field('Front', h('span', { class: 'rm-pic' }, R.fg ? h('img', { src: R.fg }) : '', h('button', { class: 'btn sm ghost', title: 'Drawn over everyone: pillars, plants, a doorframe (transparent elsewhere)', onclick: () => pickPicture('Front layer', u => setPicture('fg', u)) }, R.fg ? 'Change' : 'Pick…'),
        R.fg ? h('button', { class: 'ibtn', title: 'No front layer', onclick: () => { snapshot(); R.fg = null; images.fg = null; changed(true); } }, '✕') : ''), 'Optional'),
      field('Music', select([['', 'None'], ...(lists.music || [])], R.music || '', v => { R.music = v; changed(); }), lists.music?.length ? 'Plays in this room (carries on into rooms with the same music)' : 'Put .ogg / .mp3 / .wav files in music/ (Files)'),
      warn),
    h('div', { class: 'sec' }, h('h3', {}, 'In this room'),
      h('div', { class: 'rm-list' },
        h('button', { class: sel === 'walk' ? 'on' : '', onclick: () => setTool('walk') }, `▱ Walk area (${R.walk.length >= 3 ? R.walk.length + ' points' : 'none yet'})`),
        ...R.entries.map(e => h('button', { class: sel === 'entry:' + e.name ? 'on' : '', onclick: () => setSel('entry:' + e.name) }, '⚑ ' + e.name)),
        ...R.hotspots.map(q => h('button', { class: sel === q.id ? 'on' : '', title: q.look || '', onclick: () => setSel(q.id) }, '◆ ' + (q.title || q.name), h('small', {}, ' ' + q.does + (q.needs ? ' · needs ' + q.needs : ''))))),
      h('p', { class: 'note' }, 'Drag a box with the Hotspot tool (H) to add one.')),
    h('div', { class: 'sec' }, h('h3', {}, 'The whole adventure'),
      h('div', { class: 'rm-acts' },
        h('button', { class: 'btn sm', title: 'Every item: name, picture, what the hero says about it, and which two make a third', onclick: () => import('./rooms_items.js').then(m => m.openItems(I, saveItems)) }, `Items (${I.items.length})`),
        h('button', { class: 'btn sm', title: 'The puzzle flowchart: what you need for what, room by room, and anything that can never be reached', onclick: () => import('./rooms_flow.js').then(m => m.openFlow()) }, 'Puzzles'),
        h('button', { class: 'btn sm', title: 'The script: every line in the game (looks, uses, conversations), ready to read aloud or record', onclick: () => import('./rooms_script.js').then(m => m.openScript()) }, 'Script')),
      h('button', { 'data-file': 'save', 'data-noun': 'room', class: 'btn go', style: { marginTop: '10px', width: '100%' }, title: 'Write this room and the items for Godot (rooms/, adventure/)', onclick: saveRoom }, 'Save room')));
  V.right.replaceChildren(inspector({ R, sel, lists, changed, select: setSel, remove, newItem, makeSound, goRoom: n => openRoom('room-' + n) }));
}

/* ------------------------------------------------------------ pictures, items, sounds ---- */
async function setPicture(which, url) {
  const im = await imgData(url).catch(() => null);
  if (!im) return toast('That picture could not be read', 'bad');
  if (im.width > 4096 || im.height > 2048) return toast(`That picture is ${im.width}×${im.height}: too big for a room (up to 4096×2048)`, 'bad');
  R[which] = toDataURL(im);
  if (which === 'bg' && (im.width !== R.w || im.height !== R.h)) {           // the room takes the background's size
    const sx = im.width / R.w, sy = im.height / R.h;
    if (R.walk.length || R.hotspots.length) toast(`The room is now ${im.width}×${im.height}; drawn things kept their places`);
    else { R.depth = { ...R.depth, farY: Math.round(R.depth.farY * sy), nearY: Math.round(R.depth.nearY * sy) }; R.entries.forEach(e => { e.x = Math.round(e.x * sx); e.y = Math.round(e.y * sy); }); }
    R.w = im.width; R.h = im.height;
  }
  await setImages(); changed(true); map.draw(true);
}
async function saveItems(next) {
  I = next;
  await api('/api/project', { id: 'items-adventure', data: { meta: { kind: 'items', name: 'adventure' }, items: I } });
  lists.items = I.items; drawPanels();
}
function newItem() {
  const n = prompt('Name of the item', 'Rusty key'); if (!n) return '';
  const id = slug(n);
  if (!I.items.some(i => i.id === id)) { I.items.push({ id, name: n.trim(), look: '', icon: '' }); saveItems(I); }
  return id;
}
async function makeSound() {
  const kinds = ['blip', 'coin', 'powerup', 'hit', 'explosion'], k = prompt(`A new sound for using it. Kind: ${kinds.join(', ')}`, 'blip');
  if (!k || !kinds.includes(k.trim())) return '';
  const { roll, synth, wav, play } = await import('./sfx.js'), p = roll(k.trim()), n = `use_${k.trim()}_${Date.now().toString(36).slice(-3)}`;
  play(p); await saveFiles('sfx', [{ name: n + '.wav', b64: wav(synth(p)) }]);
  await loadLists(); return `sfx/${n}.wav`;
}

/* ------------------------------------------------------------ for Godot ---- */
async function saveRoom() {
  clearTimeout(saveT); await keep();
  const dir = `rooms/${R.name}`, g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const inside = g.root ? FS.root.slice(g.root.length + 1) : null, pre = inside === null ? '' : 'res://' + (inside ? inside + '/' : '');
  const at = rel => pre + rel, res = rel => (pre || 'res://') + rel;     // scenes: folder-relative outside Godot (play.py fixes them); JSON: res://
  try {
    const files = [{ name: `${R.name}.tscn`, text: roomScene(R, at, at(dir)) }, { name: 'room.json', text: strip(R) + '\n' }];
    if (R.bg) files.push({ name: picFile('background', R.bg), b64: R.bg });
    if (R.fg) files.push({ name: picFile('front', R.fg), b64: R.fg });
    await saveFiles(dir, files);
    await saveFiles('adventure', [{ name: 'items.json', text: itemsJSON(I, res) }]);
    const byDir = {};
    for (const [p, text] of Object.entries(adventureRuntime())) (byDir[p.slice(0, p.lastIndexOf('/'))] ||= []).push({ name: p.split('/').pop(), text });
    for (const [d, f] of Object.entries(byDir)) await saveFiles(d, f);
    await ensureBrain('walker', BRAIN_GD.walker);
    const miss = [!R.bg && 'a background', R.walk.length < 3 && 'a walk area', !R.entries.some(e => e.name === 'start') && 'a "start" entry (or an exit that arrives here)'].filter(Boolean);
    toast(`Saved to ${dir}/` + (miss.length ? `; still missing ${miss.join(', ')}` : ''), miss.length ? '' : 'ok');
    emit('saved', FS.root);
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
// ▶ Play this room: save it, make it the first room in the Stage, build and play
async function playHere() {
  await saveRoom();
  pref.set(buildKey(), { ...pref.get(buildKey(), { start: 'none' }), level: `res://rooms/${R.name}/${R.name}.tscn`, start: 'none' });
  emit('play');
}

registerWheel('rooms', () => ({
  tools: TOOLS.map(([id, label, hint]) => ({ label, hint, on: tool === id, run: () => setTool(id) })),
  guides: [{ label: 'Front layer', on: show.front, run: () => { show.front = !show.front; map.draw(); } }, { label: 'Save room', run: saveRoom }, { label: 'Play this room', run: playHere }],
}));
registerKeys('rooms', [['S W H E D', 'Select, Walk area, Hotspot, Entry, Depth'], ['Delete', 'Remove the selected hotspot or entry'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Esc', 'Select nothing'],
  ['Right click a point', 'Remove it'], ['Double click an edge', 'Add a point']]);
