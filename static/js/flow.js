// Flow: the game's path of scenes, from the first video to the ending. Intro video → title menu → a level → a talk
// in an alley → the next level…, or a point & click room, a text adventure's pages, an interactive movie's choices
// and quick-time moments. Each scene is a card (flow_view.js); each way it can end is a dot wired to what comes next.
// Double click a card to go into it: its level, room, conversation or menu opens in its own area. ▶ Play follows the
// flow when it has scenes (playbuild.js writes flow/game.json; flow_godot.js plays it).
import { h, api, toast, on, emit, pref, uid, field, select, check, thumbURL } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { projectBar } from './startover.js';
import { registerKeys } from './wheel.js';
import { flowView, KINDS } from './flow_view.js';
import { flowJSON, FLOW_GD, FLOW } from './flow_godot.js';
import { STORY, STORY_GD } from './story_godot.js';
import { listScenes } from './playbuild.js';
import { pickPicture } from './pictures.js';
import { addVideo } from './video_add.js';
import { GAME } from './gametype.js';

const get = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);
const ls = async rel => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + rel)).catch(() => ({ items: [] }))).items || []);
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
const nodeName = s => String(s || 'thing').replace(/[^A-Za-z0-9_]/g, '_');

let F = null, V = {}, view = null, sel = null, mounted = false, saveT = 0, undo = [], ready = Promise.resolve();
let L = { videos: [], menus: [], levels: [], rooms: {}, dialogues: [], items: [], outs: { level: {}, room: {}, talk: {} } };

// starting shapes: [label, what, [[kind, name, x, y, extra]], [[from, out, to]]] (indexes into the list)
const SHAPES = {
  classic: ['Intro → title → stages', 'A video, the title menu, a level, a talk between levels, the next level, the end',
    [['video', 'Intro', 0, 0], ['menu', 'Title', 240, 0, { menu: 'title' }], ['level', 'Stage 1', 480, 0], ['talk', 'Scene: alley', 720, 0], ['level', 'Stage 1.1', 960, 0], ['end', 'The end', 1200, 0, { text: 'The end.' }]],
    [[0, 'done', 1], [1, 'done', 2], [2, 'done', 3], [3, 'done', 4], [4, 'done', 5]]],
  adventure: ['Point & click', 'A video, the title menu, the adventure from its first room, an ending video, the end',
    [['video', 'Intro', 0, 0], ['menu', 'Title', 240, 0, { menu: 'title' }], ['room', 'The adventure', 480, 0, { entry: 'start' }], ['video', 'Ending', 720, 0], ['end', 'The end', 960, 0, { text: 'The end.' }]],
    [[0, 'done', 1], [1, 'done', 2], [2, 'done', 3], [3, 'done', 4]]],
  fmv: ['Interactive movie', 'An intro, the title, a scene, a choice, a quick-time moment with a death scene, the end',
    [['video', 'Intro', 0, 0], ['menu', 'Title', 240, 0, { menu: 'title' }], ['video', 'Scene 1', 480, 0], ['choice', 'Which way?', 720, 0, { text: 'Which way?', options: ['Left', 'Right'], seconds: 6 }],
      ['quick', 'The trap', 960, -80, { from: 2, to: 3, action: 'any', text: 'NOW!' }], ['video', 'Scene 2', 960, 120], ['video', 'Death', 1200, -170], ['end', 'The end', 1440, 60, { text: 'The end.' }]],
    [[0, 'done', 1], [1, 'done', 2], [2, 'done', 3], [3, 'Left', 4], [3, 'Right', 5], [4, 'hit', 5], [4, 'miss', 6], [6, 'done', 3], [5, 'done', 7]]],
  text: ['Text adventure', 'The title, then chapters of pages, a check on what the reader did, two endings',
    [['menu', 'Title', 0, 0, { menu: 'title' }], ['story', 'Chapter 1', 240, 0], ['check', 'Has the key?', 480, 0], ['story', 'Chapter 2', 720, -70], ['end', 'Good ending', 960, -70, { text: 'You got out.' }], ['end', 'Bad ending', 720, 110, { text: 'The door stayed shut.' }]],
    [[0, 'done', 1], [1, 'done', 2], [2, 'yes', 3], [2, 'no', 5], [3, 'done', 4]]],
};

export const flow = {
  id: 'flow', title: 'Flow', key: '',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    view = flowView({ flow: () => F, sel: () => sel, select: pick, changed, outs, summary, poster, enter, add, drop });
    el.append(V.left, h('section', { class: 'stage' },
      h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'The game, scene by scene'), h('span', { class: 'grow' }),
        projectBar('flow-game', 'flow', { flush: async () => { clearTimeout(saveT); if (F) await keep(); }, reload: async () => { await (ready = start()); } }),
        h('button', { class: 'btn sm ghost', title: 'Show every scene (F)', onclick: () => view.fit() }, 'Show all'),
        h('button', { class: 'btn sm ghost', title: 'Build the game and play it from the picked scene', onclick: () => play(true) }, '▶ From here'),
        h('button', { class: 'btn sm go', title: 'Build the game and play it from the start', onclick: () => play(false) }, '▶ Play')),
      view.el,
      h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Drag a dot to the next scene (or onto empty board) · double click a scene to go into it · drag the board to move around, wheel zooms · Delete removes · Ctrl+Z undo'))),
      V.right);
    document.addEventListener('keydown', e => { if (el.classList.contains('on') && !e.target.matches('input,textarea,select') && !document.querySelector('.modal')) keys(e); });
    ready = start();
  },
  show() { if (F) loadLists().then(() => { view.draw(); drawPanels(); }); },
  async saveProject() { await ready; await saveFlow(); },
};

async function start() {
  F = (await get('flow-game'))?.flow || { id: uid(), nodes: [], links: [], start: '' };
  sel = null; undo = [];
  await loadLists(); view.draw(); drawPanels(); setTimeout(() => view.fit(), 50);
}
on('root', () => { if (mounted) ready = start(); });

function changed(full) {
  if (full) { view.draw(); drawPanels(); }
  clearTimeout(saveT); saveT = setTimeout(keep, 800);
}
const keep = () => api('/api/project', { id: 'flow-game', data: { meta: { kind: 'flow', name: 'game' }, flow: F } }).catch(e => toast('Could not keep the flow: ' + e.message, 'bad'));
const snapshot = () => { undo.push(JSON.stringify(F)); if (undo.length > 60) undo.shift(); };
function pick(x) { sel = x; view.draw(); drawPanels(); }
function add(kind, x, y, extra = {}) {
  snapshot();
  const n = { id: uid(), kind, name: KINDS[kind][0], x, y, ...extra };
  if (kind === 'choice' && !n.options) n.options = ['Yes', 'No'];
  if (kind === 'quick') Object.assign(n, { from: n.from ?? 1, to: n.to ?? 2, action: n.action || 'any' });
  F.nodes.push(n); if (!F.start) F.start = n.id;
  sel = n.id; changed(true);
  return n;
}
// an asset from the shelf dropped on the board: the scene that plays it
function drop(a, x, y) {
  const base = { name: a.name.replace(/\.\w+$/, '') };
  const made = { room: ['room', { room: a.name, entry: 'start' }], level: ['level', { level: a.name }], dialogue: ['talk', { dialogue: a.name }], video: ['video', { video: a.path }] }[a.kind];
  if (!made) return toast(`A ${a.kind} can't be a scene by itself: drop a room, a level, a conversation or a video`);
  add(made[0], Math.round(x), Math.round(y), { ...base, ...made[1] });
}
function shape(key) {
  const [, , nodes, links] = SHAPES[key];
  if (F.nodes.length && !confirm('Add this shape next to the scenes you have? (Nothing is removed.)')) return;
  snapshot();
  const dy = F.nodes.length ? Math.max(...F.nodes.map(n => n.y)) + 260 : 0, made = nodes.map(([kind, name, x, y, extra]) => ({ id: uid(), kind, name, x, y: y + dy, ...(extra || {}) }));
  F.nodes.push(...made); F.links.push(...links.map(([a, out, b]) => ({ from: made[a].id, out, to: made[b].id })));
  if (!F.start) F.start = made[0].id;
  changed(true); setTimeout(() => view.fit(), 30);
}
function remove() {
  snapshot();
  if ((typeof sel === 'object' && sel?.link)) F.links = F.links.filter(l => l !== sel.link);
  else { F.nodes = F.nodes.filter(n => n.id !== sel); F.links = F.links.filter(l => l.from !== sel && l.to !== sel); if (F.start === sel) F.start = F.nodes[0]?.id || ''; }
  sel = null; changed(true);
}
function keys(e) {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (undo.length) { F = JSON.parse(undo.pop()); sel = null; changed(true); } return; }
  if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); remove(); }
  else if (k === 'f' && !e.ctrlKey) view.fit();
  else if (k === 'escape') pick(null);
}

/* ------------------------------------------------------------ what each scene can end with ---- */
function outs(n) {
  switch (n.kind) {
    case 'level': return L.outs.level[n.level] || ['done'];
    case 'room': return L.outs.room[n.room] || ['done'];
    case 'talk': case 'story': return ['done', ...(L.outs.talk[n.dialogue] || [])];
    case 'choice': return (n.options || []).filter(Boolean).length ? n.options.filter(Boolean) : ['…'];
    case 'quick': return ['hit', 'miss'];
    case 'check': return ['yes', 'no'];
    case 'match3': case 'cards': return ['win', 'lose'];
    case 'end': return [];
    default: return ['done'];
  }
}
// a small picture for a scene's card: a frame of its video, or its picture
function poster(n) {
  const rel = n.video || n.picture;
  return rel ? thumbURL(FS.root + '/' + rel, 192, 0) : '';
}
function summary(n) {
  const v = p => (p || '').split('/').pop();
  switch (n.kind) {
    case 'video': return n.video ? v(n.video) : 'no video yet';
    case 'menu': return `menus/${n.menu || 'title'}`;
    case 'level': return n.level || 'pick a level';
    case 'room': return n.room ? `${n.room} (from ${n.entry || 'start'})` : 'pick a room';
    case 'talk': case 'story': return n.dialogue || 'pick a conversation';
    case 'choice': return (n.text || '') + (n.seconds ? ` · ${n.seconds}s` : '');
    case 'quick': return `${n.video ? v(n.video) : 'no video'} · press ${n.action === 'any' ? 'any key' : n.action} at ${n.from}–${n.to}s`;
    case 'check': return [n.flag && 'flag ' + n.flag, n.item && 'has ' + n.item].filter(Boolean).join(' and ') || 'pick a flag or an item';
    case 'end': return (n.text || '').slice(0, 40);
    case 'match3': return `${n.cols || 8}×${n.rows || 8} · ${n.goal || 1500} in ${n.moves || 20} moves`;
    case 'cards': return `${n.name}: ${n.hp || 30} health · ${n.pattern || 'attack 6'}`;
    default: return '';
  }
}
async function loadLists() {
  const ps = await api('/api/projects').catch(() => []);
  const outsTalk = {}, outsRoom = {}, outsLevel = {};
  for (const p of ps.filter(p => p.kind === 'dialogue')) {
    const d = (await get(p.id))?.dialogue, words = new Set();
    for (const b of d?.beats || []) for (const x of [...(b.do || []), ...(b.choices || []).flatMap(c => c.do || [])]) if (x.k === 'flow' && x.v) words.add(x.v); else if (x.k === 'message' && String(x.v).startsWith('flow:')) words.add(String(x.v).slice(5));
    if (words.size) outsTalk[p.name] = [...words];
  }
  const rooms = {};
  for (const p of ps.filter(p => p.kind === 'room')) {
    const R = (await get(p.id))?.room; if (!R) continue;
    rooms[p.name] = (R.entries || []).map(e => e.name);
    const leaves = (R.hotspots || []).filter(q => q.does === 'leave').map(q => nodeName(q.name || q.title));
    if (leaves.length) outsRoom[p.name] = leaves;
  }
  for (const p of ps.filter(p => p.kind === 'level')) {
    const Lv = (await get(p.id))?.level, exits = (Lv?.zones || []).filter(z => z.kind === 'door' && z.target === 'flow').map(z => z.name || 'done');
    if (exits.length) outsLevel[p.name] = [...new Set(exits)];
  }
  L = {
    videos: (await ls('videos')).filter(i => /\.ogv$/i.test(i.name)).map(i => 'videos/' + i.name),
    menus: (await ls('menus')).filter(i => i.name.endsWith('.tscn')).map(i => i.name.replace('.tscn', '')),
    levels: (await listScenes('levels')).map(([n]) => n), rooms, dialogues: ps.filter(p => p.kind === 'dialogue').map(p => p.name),
    items: ((await get('items-adventure'))?.items?.items || []).map(i => [i.id, i.name]), outs: { level: outsLevel, room: outsRoom, talk: outsTalk },
  };
}

/* ------------------------------------------------------------ going into a scene ---- */
function enter(n) {
  const want = { level: [n.level, 'open-level', 'levels'], room: [n.room, 'open-room', 'rooms'], talk: [n.dialogue, 'open-dialogue', 'dialogue'], story: [n.dialogue, 'open-dialogue', 'dialogue'] }[n.kind];
  if (want) { if (want[0]) emit(want[1], want[0]); else { emit('tab', want[2]); toast(`Make or open one there, then pick it in Flow for "${n.name}"`); } return; }
  if (n.kind === 'menu') return emit('tab', 'menus');
  if (n.kind === 'video' || n.kind === 'quick') return preview(n.video);
  pick(n.id);
}
async function preview(video) {
  if (!video) return toast('No video yet: add one on the right');
  const base = video.split('/').pop().replace(/\.ogv$/, ''), src = (await ls('videos/.src')).find(i => i.name.replace(/\.\w+$/, '') === base);
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(900px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, base), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, src ? h('video', { src: '/api/fs/raw?path=' + encodeURIComponent(src.path), controls: true, autoplay: true, style: { width: '100%' } }) : h('p', { class: 'note' }, 'The original is not in videos/.src/, so it cannot be previewed here; it plays in the game.'))));
  document.body.append(m);
}
async function titleCard(n, then) {
  const text = prompt('Words on the card', n.name); if (!text) return;
  const r = await api('/api/video/card', { text, seconds: Math.max(2, Math.min(8, 1.5 + text.length / 10)), name: 'card_' + (slug(n.name) || 'title'), colour: '10223a' }).catch(e => ({ err: e.message }));
  if (r.err) return toast('Could not make it: ' + r.err, 'bad');
  await loadLists(); then(r.file); toast(`${r.file} made`, 'ok');
}

/* ------------------------------------------------------------ panels ---- */
function drawPanels() {
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Add a scene'),
      h('div', { class: 'fw-palette' }, ...Object.entries(KINDS).map(([k, [label, colour, what]]) => h('button', { title: what, style: { '--k': colour }, onclick: () => { const [x, y] = view.middle(); add(k, x, y); } }, label)))),
    h('div', { class: 'sec' }, h('h3', {}, 'Start from a shape'),
      ...Object.entries(SHAPES).map(([k, [label, what]]) => h('button', { class: 'btn sm ghost fw-shape' + (k === GAME.path || (k === 'classic' && ['scroller', 'topdown', 'puzzle', 'wild'].includes(GAME.path)) ? ' go' : ''), title: what, onclick: () => shape(k) }, label, h('small', {}, what)))),
    h('div', { class: 'sec' }, h('h3', {}, 'Scenes', h('span', { class: 'grow' }), h('small', {}, F.nodes.length)),
      h('div', { class: 'rm-list' }, ...F.nodes.map(n => h('button', { class: sel === n.id ? 'on' : '', onclick: () => pick(n.id) }, (F.start === n.id ? '▶ ' : '') + n.name, h('small', {}, ' ' + KINDS[n.kind][0])))),
      h('button', { 'data-file': 'save', 'data-noun': 'flow', class: 'btn go', style: { marginTop: '10px', width: '100%' }, title: 'Write flow/game.json and its runtime for Godot (▶ Play does this by itself)', onclick: saveFlow }, 'Save flow')));
  V.right.replaceChildren(inspector());
}
function inspector() {
  if ((typeof sel === 'object' && sel?.link)) return h('div', { class: 'sec' }, h('h3', {}, 'Link'), h('p', { class: 'note', style: { marginTop: 0 } }, `When "${F.nodes.find(n => n.id === sel.link.from)?.name}" ends with "${sel.link.out}", "${F.nodes.find(n => n.id === sel.link.to)?.name}" comes next.`),
    h('button', { class: 'btn sm ghost danger', onclick: remove }, 'Remove link'));
  const n = F.nodes.find(x => x.id === sel);
  if (!n) return h('div', { class: 'sec' }, h('h3', {}, 'The flow'), h('p', { class: 'note', style: { marginTop: 0 } }, F.nodes.length
    ? `${F.nodes.length} scenes. ▶ Play follows this flow from the scene marked START. Pick a scene to set it up; double click it to go into it.`
    : 'Nothing yet. Add scenes on the left, or start from a shape: intro video → title → stage 1 → a talk in an alley → stage 1.1 → the end, say. Each dot on a scene is a way it can end; drag it to what comes next.'));
  const set = (k, full = true) => v => { snapshot(); n[k] = v; changed(full); };
  const opts = (list, none) => [['', none], ...list.map(x => Array.isArray(x) ? x : [x, x])];
  const pic = (key = 'picture', label = 'Picture') => field(label, h('span', { class: 'rm-pic' }, n[key] ? h('img', { src: '/api/fs/raw?path=' + encodeURIComponent(FS.root + '/' + n[key]) }) : '',
    h('button', { class: 'btn sm', onclick: () => pickPicture('Picture', async url => { const b64 = url.startsWith('data:') ? url : await fetch(url).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }));
      const name = (slug(n.name) || 'picture') + (key === 'picture' ? '' : '_' + key);
      await saveFiles('pictures', [{ name: name + '.png', b64: key === 'portrait' ? await cutOut(b64) : b64 }]); set(key)(`pictures/${name}.png`); }) }, n[key] ? 'Change' : 'Pick…'),
    n[key] ? h('button', { class: 'ibtn', title: 'No picture', onclick: () => set(key)('') }, '✕') : ''), key === 'portrait' ? 'Who is talking: stands on the right, over the background' : 'Copied into pictures/');
  const vid = k => field('Video', h('span', { class: 'rm-pic' }, select(opts(L.videos, L.videos.length ? 'Pick a video…' : 'None yet'), n[k] || '', set(k)), h('button', { class: 'btn sm', title: 'A video file from your computer: Kiln turns it into Ogg Theora for Godot', onclick: () => addVideo(async f => { await loadLists(); set(k)(f); }) }, 'Add…'),
    h('button', { class: 'btn sm ghost', title: 'Words on a plain colour for a few seconds: a stand-in until the scene is filmed, a chapter title, credits', onclick: () => titleCard(n, set(k)) }, 'Title card…')), 'videos/*.ogv');
  const k = n.kind, body = [];
  if (k === 'video') body.push(vid('video'), field('', check('Space / Esc / a click skips it', n.skip !== false, set('skip', false))));
  if (k === 'menu') body.push(field('Screen', select(opts(L.menus, 'Make one in Menus'), n.menu || 'title', set('menu')), 'Its "start" button ends this scene'), pic());
  if (k === 'level') body.push(field('Level', select(opts(L.levels, 'Pick a level…'), n.level || '', set('level')), 'A Door zone going to "Next in the game Flow" ends it'));
  if (k === 'room') body.push(field('Room', select(opts(Object.keys(L.rooms), 'Pick a room…'), n.room || '', set('room')), 'A "Leaves" hotspot ends it'),
    n.room ? field('Arrive at', select((L.rooms[n.room] || ['start']).map(e => [e, e]), n.entry || 'start', set('entry'))) : '');
  if (k === 'talk' || k === 'story') body.push(field('Conversation', select(opts(L.dialogues, 'Pick one…'), n.dialogue || '', set('dialogue')), 'A line or choice sending the message flow:<word> ends it with <word>'),
    k === 'talk' ? [pic('picture', 'Background'), pic('portrait', 'Character')] : h('p', { class: 'note' }, 'Shown as full pages: each line of the conversation can have its own picture (Dialogue → a line\'s Picture).'));
  if (k === 'choice') {
    body.push(field('Words', h('input', { type: 'text', value: n.text || '', placeholder: 'Which way?', onchange: e => set('text', false)(e.target.value) })), vid('video'), n.video ? '' : pic(),
      field('Buttons', h('div', { class: 'fw-opts' }, ...(n.options || []).map((o, i) => h('span', {}, h('input', { type: 'text', value: o, onchange: e => { snapshot(); const old = n.options[i]; n.options[i] = e.target.value; for (const l of F.links) if (l.from === n.id && l.out === old) l.out = e.target.value; changed(true); } }),
        h('button', { class: 'ibtn', title: 'Remove', onclick: () => { snapshot(); F.links = F.links.filter(l => !(l.from === n.id && l.out === o)); n.options.splice(i, 1); changed(true); } }, '✕'))),
        (n.options || []).length < 6 ? h('button', { class: 'btn sm ghost', onclick: () => { snapshot(); n.options = [...(n.options || []), 'Option ' + ((n.options || []).length + 1)]; changed(true); } }, '+ Button') : ''), 'Each is a way it ends (keys 1–6 too)'),
      field('Clock', h('input', { type: 'number', min: 0, max: 60, step: 1, value: n.seconds || 0, style: { width: '70px' }, onchange: e => set('seconds')(+e.target.value) }), 'Seconds to choose, 0 = no clock'),
      n.seconds ? field('Too slow', select((n.options || []).map((o, i) => [i, o]), n.fallback || 0, v => set('fallback')(+v)), 'What happens when the clock runs out') : '');
  }
  if (k === 'quick') body.push(vid('video'),
    field('Press', select([['any', 'Any key or click'], ['attack', 'Attack (X / pad X)'], ['jump', 'Jump (Space / pad A)'], ['shoot', 'Shoot (C / pad B)'], ['interact', 'Interact (E / pad Y)'], ['move_left', 'Left'], ['move_right', 'Right'], ['move_up', 'Up'], ['move_down', 'Down']], n.action || 'any', set('action'))),
    field('From', h('input', { type: 'number', min: 0, step: .1, value: n.from ?? 1, style: { width: '70px' }, onchange: e => set('from')(+e.target.value) }), 'Seconds into the video'),
    field('To', h('input', { type: 'number', min: 0, step: .1, value: n.to ?? 2, style: { width: '70px' }, onchange: e => set('to')(+e.target.value) }), 'Pressing early, late or not at all is a miss'),
    field('Prompt', h('input', { type: 'text', value: n.text || '', placeholder: 'NOW!', onchange: e => set('text', false)(e.target.value) })));
  if (k === 'check') body.push(field('Flag', h('input', { type: 'text', value: n.flag || '', placeholder: 'e.g. door_open', onchange: e => set('flag')(slug(e.target.value)) }), 'Set by a hotspot or a conversation'),
    field('Item', select(opts(L.items, 'Any'), n.item || '', set('item')), 'Carried now'));
  if (k === 'match3') {
    const num = (key, label, d, hint) => field(label, h('input', { type: 'number', min: 1, value: n[key] || d, style: { width: '80px' }, onchange: e => set(key)(+e.target.value) }), hint);
    body.push(num('cols', 'Columns', 8), num('rows', 'Rows', 8), num('goal', 'Goal', 1500, 'Points to win'), num('moves', 'Moves', 20, 'Swaps you get'), pic(),
      field('Pieces', h('div', { class: 'fw-pieces' }, ...[0, 1, 2, 3, 4, 5].map(i => { const p = (n.pieces || [])[i];
        return h('button', { class: 'fw-piece', title: p ? `${p} (click to change, right click to remove)` : 'A picture for this piece (a gem, a sweet…)', oncontextmenu: e => { e.preventDefault(); const a = [...(n.pieces || [])]; a[i] = ''; set('pieces')(a); },
          onclick: () => import('./pictures.js').then(m => m.pickFromSheet(`Piece ${i + 1}`, async url => { const name = `${slug(n.name) || 'board'}_${i + 1}`; await saveFiles('pictures/pieces', [{ name: name + '.png', b64: url }]); const a = [...(n.pieces || [])]; a[i] = `pictures/pieces/${name}.png`; set('pieces')(a); })) },
          p ? h('img', { src: '/api/fs/raw?path=' + encodeURIComponent(FS.root + '/' + p) }) : String(i + 1)); })), 'Six kinds; none = coloured gems. Pick from a sheet or any picture'));
  }
  if (k === 'cards') body.push(field('Health', h('input', { type: 'number', min: 1, value: n.hp || 30, style: { width: '80px' }, onchange: e => set('hp')(+e.target.value) }), 'The enemy\'s'),
    field('Moves', h('input', { type: 'text', value: n.pattern || 'attack 6, attack 8, block 5', onchange: e => set('pattern')(e.target.value) }), 'What it does, turn by turn: attack N or block N, repeating'),
    pic(), h('p', { class: 'note' }, 'The picture is the enemy. Your cards and deck: the Cards area.'), h('button', { class: 'btn sm', onclick: () => emit('tab', 'cards') }, 'Open Cards'));
  if (k === 'end') body.push(field('Words', h('textarea', { rows: 4, value: n.text || '', placeholder: 'The end.', onchange: e => set('text')(e.target.value) })));
  return h('div', {},
    h('div', { class: 'sec' }, h('h3', {}, KINDS[k][0], h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost danger', title: 'Remove this scene (Ctrl+Z brings it back)', onclick: remove }, 'Delete')),
      h('p', { class: 'note', style: { marginTop: 0 } }, KINDS[k][2]),
      field('Name', h('input', { type: 'text', value: n.name || '', onchange: e => set('name')(e.target.value) })),
      F.start === n.id ? h('p', { class: 'note' }, '▶ The game starts here.') : h('button', { class: 'btn sm', title: 'The game begins with this scene', onclick: () => { snapshot(); F.start = n.id; changed(true); } }, 'Start the game here'),
      ['level', 'room', 'talk', 'story', 'menu', 'video', 'quick'].includes(k) ? h('button', { class: 'btn sm ghost', style: { marginLeft: '6px' }, onclick: () => enter(n) }, k === 'video' || k === 'quick' ? 'Watch' : 'Go into it') : ''),
    h('div', { class: 'sec' }, ...body),
    h('div', { class: 'sec' }, h('h3', {}, 'Then'), ...outs(n).map(o => { const l = F.links.find(l => l.from === n.id && l.out === o);
      return field(o, select([['', 'nothing yet'], ...F.nodes.filter(x => x.id !== n.id).map(x => [x.id, x.name])], l?.to || '', v => { snapshot(); F.links = F.links.filter(x => !(x.from === n.id && x.out === o)); if (v) F.links.push({ from: n.id, out: o, to: v }); changed(true); })); }),
      k === 'end' ? h('p', { class: 'note' }, 'After the end, the game goes back to the start.') : ''));
}

// a character picture without its plain background
async function cutOut(url) {
  const { cutout } = await import('./cutout.js'), { imgData } = await import('./core.js'), im = cutout(await imgData(url));
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

/* ------------------------------------------------------------ for Godot / playing ---- */
async function saveFlow() {
  clearTimeout(saveT); await keep();
  await saveFiles('flow', [{ name: 'game.json', text: flowJSON(F, rel => 'res://' + rel) }]);
  await saveFiles('_kiln/game', [{ name: FLOW.split('/').pop(), text: FLOW_GD }]);
  await saveFiles('_kiln/ui', [{ name: STORY.split('/').pop(), text: STORY_GD }]);
  const gaps = F.nodes.filter(n => ({ level: !n.level, room: !n.room, talk: !n.dialogue, story: !n.dialogue, video: !n.video, quick: !n.video }[n.kind]));
  toast('Saved flow/game.json' + (gaps.length ? `; still to set up: ${gaps.map(n => n.name).join(', ')}` : ''), gaps.length ? '' : 'ok');
}
async function play(here) {
  await keep();
  if (here && typeof sel === 'string') pref.set('flow.from', sel);
  emit('play');
}

registerKeys('flow', [['Drag a dot', 'Link that ending to the next scene (drop on the empty board to make one)'], ['Double click a scene', 'Go into it'], ['Delete', 'Remove the picked scene or link'], ['Ctrl+Z', 'Undo'], ['F', 'Show every scene'], ['Wheel', 'Zoom']]);
