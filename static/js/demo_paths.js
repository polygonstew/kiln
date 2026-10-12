// Demo games for the other game paths (gametype.js), each a small complete game in a new folder, made the way you would
// make it and tied together by a Flow: a point & click ("The Last Light": two rooms, a puzzle with a key, a lamp, oil
// and a talk), a text adventure (pages with pictures and a check), an interactive movie (title-card videos, a timed
// choice, a quick-time moment), a top-down shooter (four rooms, chasers, a turret boss), three push puzzles and a
// stacking tower. Pictures are drawn in code; every area saves its part (saveall.js); then Kiln starts again in it.
import { h, api, toast, pref, uid, newImg, toDataURL, outline } from './core.js';
import { S as FS, loadSettings } from './files.js';
import { hero, HERO, MINER, slime, anim, project, scene } from './demo.js';
import { DEFAULTS as MENU_DEFAULTS } from './menus.js';
import { starterHud } from './hud.js';
import { saveAll } from './saveall.js';
import { buildKey } from './playbuild.js';
import { setPath, PATHS } from './gametype.js';
import { restart } from './games.js';

const T = 16;
const paint = (w, hh, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); fn(x, (col, X, Y, W, H) => { x.fillStyle = col; x.fillRect(X, Y, W, H); }); return c.toDataURL('image/png'); };
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const menus = title => { const m = MENU_DEFAULTS(); m.title.title = title; return { meta: { kind: 'menus', name: 'game' }, menus: m }; };
const flow = (nodes, links) => ({ meta: { kind: 'flow', name: 'game' }, flow: { id: uid(), nodes: nodes.map(([id, kind, name, x, extra]) => ({ id, kind, name, x, y: 0, ...(extra || {}) })), links: links.map(([from, out, to]) => ({ from, out, to })), start: nodes[0][0] } });
const say = (id, who, text, extra = {}) => ({ id, who, text, voice: '', next: '', choices: [], do: [], ...extra });

export async function makePathDemo(pick) {
  const make = { adventure: adventureDemo, text: textDemo, fmv: fmvDemo, topdown: topdownDemo, puzzle: pick.puzzle === 'stack' ? stackDemo : pushDemo }[pick.path];
  if (!make) return toast('No demo for that kind of game yet', 'bad');
  const name = (prompt(`Name for the new game, from the ${PATHS[pick.path].label.toLowerCase()} template (a new game folder; yours stays as it is)`, `my_${pick.path === 'puzzle' ? pick.puzzle : pick.path}`) || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!name) return;
  const path = FS.settings.games + '/' + name;
  const there = await api('/api/fs?path=' + encodeURIComponent(path + '/kiln')).catch(() => ({ items: [] }));
  if ((there.items || []).length && !confirm(`${name} already has Kiln projects. Make the template there anyway (same names are replaced)?`)) return;
  const log = h('div', { class: 'play-log', style: { maxHeight: '300px' } }), step = t => { log.append(h('div', {}, t)); log.scrollTop = 1e9; };
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(560px, 94vw)' } }, h('header', {}, h('span', { class: 'grow' }, 'Making the template')),
    h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Every area takes its turn: watch the tabs.'), log)));
  document.body.append(m);
  await api('/api/fs', { op: 'root', path, scaffold: true }); await loadSettings();
  await setPath(pick.path, pick.puzzle);
  const put = (id, data) => api('/api/project', { id, data });
  const files = (dest, list) => api('/api/export', { dest, files: list });
  const buildPick = await make({ put, files, step });
  step('Every area saves its part for Godot:');
  const r = await saveAll(t => step('  ' + t));
  if (r.failed.length) step('Some parts failed: ' + r.failed.join('; '));
  pref.set(buildKey(), { start: 'none', ...buildPick });
  step('Done. Starting it in the Stage…');
  sessionStorage.setItem('kiln.play', '1');
  setTimeout(() => restart(`The ${PATHS[pick.path].label.toLowerCase()} template is ready: look inside Flow and each area, then make it yours`, 'stage'), 800);
}

/* ------------------------------------------------------------ point & click: The Last Light ---- */
function icon(fn) { return paint(16, 16, (x, r) => fn(r)); }
const ICONS = {
  key: icon(r => { r('#7a5a14', 3, 6, 6, 5); r('#e3b04b', 4, 7, 4, 3); r('#e3b04b', 9, 8, 6, 2); r('#e3b04b', 12, 10, 1, 2); r('#e3b04b', 14, 10, 1, 3); }),
  lamp: icon(r => { r('#5b4a2a', 5, 13, 6, 2); r('#9c8a5a', 6, 6, 4, 7); r('#cfd3dc66', 5, 5, 6, 8); r('#5b4a2a', 7, 2, 2, 3); }),
  oil: icon(r => { r('#2c5a2e', 5, 5, 6, 10); r('#4c8a3a', 6, 6, 4, 8); r('#7a5230', 7, 2, 2, 3); r('#e8e2c0', 6, 9, 4, 3); }),
  lit_lamp: icon(r => { r('#ffd66688', 2, 1, 12, 13); r('#5b4a2a', 5, 13, 6, 2); r('#9c8a5a', 6, 6, 4, 7); r('#ffe48a', 7, 7, 2, 4); r('#5b4a2a', 7, 2, 2, 3); }),
};
const COTTAGE = () => paint(480, 270, (x, r) => {
  r('#3b2f45', 0, 0, 480, 180); for (let i = 0; i < 480; i += 24) r('#352a3e', i, 0, 2, 180);
  r('#5a4632', 0, 180, 480, 90); for (let y = 186; y < 270; y += 12) r('#4d3c2b', 0, y, 480, 1);
  r('#2a2232', 0, 176, 480, 4);
  r('#1f2a44', 60, 50, 80, 60); r('#2e4a72', 64, 54, 72, 52); r('#cfe0ff33', 66, 56, 30, 20); r('#6b4a2e', 98, 50, 4, 60); r('#6b4a2e', 60, 78, 80, 4); r('#6b4a2e', 56, 108, 88, 6);
  r('#6b4a2e', 398, 78, 54, 100); r('#4d3420', 402, 82, 46, 96); r('#e3b04b', 438, 128, 4, 4);
  r('#6b4a2e', 210, 138, 100, 10); r('#4d3420', 216, 148, 6, 40); r('#4d3420', 298, 148, 6, 40);
  r('#7a2e2e', 150, 205, 120, 30); r('#9c3b3b', 156, 209, 108, 22); r('#7a2e2e', 170, 214, 80, 2);
});
const SHORE = () => paint(480, 270, (x, r) => {
  for (let y = 0; y < 120; y++) r(`rgb(${12 + y / 6 | 0},${16 + y / 5 | 0},${40 + y / 3 | 0})`, 0, y, 480, 1);
  for (const [sx, sy] of [[40, 20], [120, 45], [200, 15], [300, 35], [450, 25], [260, 60]]) r('#e6e2d6', sx, sy, 2, 2);
  r('#16304f', 0, 120, 480, 55); for (let y = 128; y < 175; y += 9) r('#2a4e78', (y * 37) % 60, y, 420, 1);
  r('#b89a62', 0, 175, 480, 95); r('#a3884f', 0, 175, 480, 4); for (let i = 0; i < 40; i++) r('#9c8150', (i * 53) % 480, 190 + (i * 29) % 75, 3, 1);
  r('#e6e2d6', 380, 20, 50, 160); r('#b03b3b', 380, 60, 50, 22); r('#b03b3b', 380, 110, 50, 22); r('#2a2232', 395, 138, 22, 42); r('#3a3a44', 374, 12, 62, 10); r('#ffd666', 392, 0, 26, 12);
  r('#3b2f45', 0, 90, 70, 90); r('#4d3420', 18, 110, 36, 70); r('#e3b04b', 46, 146, 3, 3);
});
async function adventureDemo({ put, files, step }) {
  step('Drawing the keeper and the old miner…');
  await put('actor-keeper', hero('keeper', { ...HERO, tunic: '#2f5d7c', dark: '#244a63', blade: '#00000000' }, 'hero', ['idle', 'walk']));
  await put('actor-old_miner', hero('old_miner', MINER, 'npc', ['idle']));
  step('Items, their pictures, and how two make a third…');
  await files('icons/demo', Object.entries(ICONS).map(([n, b64]) => ({ name: n + '.png', b64 })));
  await put('items-adventure', { meta: { kind: 'items', name: 'adventure' }, items: { items: [
    { id: 'key', name: 'Brass key', look: 'Warm from my pocket. It opens the lighthouse.', icon: 'icons/demo/key.png' },
    { id: 'lamp', name: 'Empty lamp', look: 'Not a drop of oil in it.', icon: 'icons/demo/lamp.png' },
    { id: 'oil', name: 'Lamp oil', look: 'The miner\'s last bottle.', icon: 'icons/demo/oil.png' },
    { id: 'lit_lamp', name: 'Lit lamp', look: 'It burns bright.', icon: 'icons/demo/lit_lamp.png' }],
    combos: [{ a: 'lamp', b: 'oil', makes: 'lit_lamp', text: 'The lamp burns bright.' }] } });
  step('Two rooms: the cottage and the shore…');
  const H = (name, title, poly, extra) => ({ id: uid(), name, title, poly, does: 'say', look: '', text: '', ...extra });
  await put('room-cottage', { meta: { kind: 'room', name: 'cottage' }, room: { id: uid(), name: 'cottage', w: 480, h: 270, bg: COTTAGE(), fg: null, music: '',
    walk: [[16, 186], [464, 186], [474, 266], [6, 266]], depth: { farY: 186, farS: .8, nearY: 266, nearS: 1.1 },
    entries: [{ name: 'start', x: 120, y: 240 }, { name: 'from_shore', x: 420, y: 205 }],
    hotspots: [
      H('window', 'Window', rect(60, 50, 140, 110), { look: 'The sea is calm tonight. Too calm.', does: 'none' }),
      H('rug', 'Rug', rect(150, 205, 270, 235), { look: 'A dusty old rug. Something is under it.', text: 'I lift the rug. A key!', setsFlag: 'rug_moved' }),
      H('key', 'Brass key', rect(203, 214, 221, 228), { when: 'rug_moved', does: 'pick', item: 'key', text: 'The lighthouse key!', vanish: true, shows: { kind: 'picture', path: 'icons/demo/key.png' } }),
      H('lamp', 'Lamp', rect(248, 120, 266, 138), { look: 'My old oil lamp.', does: 'pick', item: 'lamp', text: 'Empty. I\'ll need oil.', vanish: true, shows: { kind: 'picture', path: 'icons/demo/lamp.png' }, stand: [258, 200] }),
      H('door', 'Door', rect(398, 78, 452, 178), { look: 'Out to the shore.', does: 'go', room: 'shore', entry: 'from_cottage', stand: [420, 200] })] } });
  await put('room-shore', { meta: { kind: 'room', name: 'shore' }, room: { id: uid(), name: 'shore', w: 480, h: 270, bg: SHORE(), fg: null, music: '',
    walk: [[10, 188], [470, 188], [470, 266], [10, 266]], depth: { farY: 188, farS: .75, nearY: 266, nearS: 1.05 },
    entries: [{ name: 'from_cottage', x: 60, y: 215 }, { name: 'start', x: 60, y: 215 }],
    hotspots: [
      H('sea', 'Sea', rect(0, 120, 360, 175), { look: 'Somewhere out there, ships are waiting for the light.', does: 'none' }),
      H('cottage', 'Cottage', rect(18, 110, 54, 180), { look: 'Home.', does: 'go', room: 'cottage', entry: 'from_shore', stand: [50, 205] }),
      H('miner', 'Old miner', rect(222, 168, 246, 214), { look: 'Old Tam. He knows everyone\'s business.', does: 'talk', dialogue: 'dialogue/miner.json', shows: { kind: 'actor', name: 'old_miner', flip: true }, stand: [196, 222] }),
      H('door_shut', 'Lighthouse door', rect(395, 138, 417, 180), { look: 'The lighthouse. Its door is locked.', unless: 'lighthouse_open', needs: 'key', takes: true, setsFlag: 'lighthouse_open', lockedText: 'Locked. The key is somewhere at home.', text: 'The key turns. The door creaks open.', stand: [406, 200] }),
      H('lighthouse', 'Lighthouse', rect(395, 138, 417, 180), { look: 'Dark as a well inside.', when: 'lighthouse_open', needs: 'lit_lamp', lockedText: 'It\'s pitch black in there. I need a light.', does: 'leave', text: 'Up the stairs I go.', stand: [406, 200] })] } });
  step('A conversation with the miner…');
  await put('dialogue-miner', { meta: { kind: 'dialogue', name: 'miner' }, dialogue: { name: 'miner', cast: [{ name: 'Old Tam', actor: 'old_miner' }], beats: [
    say('b1', 'Old Tam', 'Evening, keeper. The light\'s gone out again.'),
    say('b2', 'Old Tam', 'What do you need?', { choices: [{ text: 'Have you any lamp oil?', next: 'b3', if: { k: 'noflag', v: 'got_oil' }, do: [] }, { text: 'Nothing. Goodnight, Tam.', next: 'end', do: [] }] }),
    say('b3', 'Old Tam', 'My last bottle. Get that light burning, or the boats won\'t make it home.', { next: 'end', do: [{ k: 'give', v: 'oil' }, { k: 'flag', v: 'got_oil' }] })] } });
  step('Menus and the flow: title → the adventure → the end…');
  await put('menus-game', menus('THE LAST LIGHT'));
  await put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['a', 'room', 'The cottage', 260, { room: 'cottage', entry: 'start' }], ['e', 'end', 'The light shines', 520, { text: 'The light shines again. Every boat comes home.' }]],
    [['t', 'done', 'a'], ['a', 'lighthouse', 'e']]));
  return { level: 'res://rooms/cottage/cottage.tscn', player: 'res://sprites/keeper/keeper.tscn' };
}

/* ------------------------------------------------------------ text adventure: The Cave ---- */
async function textDemo({ put, files, step }) {
  step('Pictures for the pages…');
  await files('pictures', [{ name: 'cave_mouth.png', b64: paint(240, 120, (x, r) => { r('#1b2a3a', 0, 0, 240, 120); r('#3a3a34', 0, 60, 240, 60); r('#0a0a0c', 80, 40, 80, 80); r('#0a0a0c', 92, 30, 56, 20); r('#c9a227', 40, 100, 10, 8); r('#ffe48a55', 34, 92, 22, 22); }) },
    { name: 'cave_deep.png', b64: paint(240, 120, (x, r) => { r('#0a0a0c', 0, 0, 240, 120); r('#ffe48a22', 60, 10, 120, 110); r('#4a3a2a', 100, 40, 40, 70); r('#c9a227', 132, 74, 4, 4); }) }]);
  step('The story, line by line, with choices…');
  await put('dialogue-cave', { meta: { kind: 'dialogue', name: 'cave' }, dialogue: { name: 'cave', cast: [], beats: [
    say('c1', '', 'Rain hammers the hillside. Ahead, the mouth of a cave. At your feet, a brass lamp glints in the mud.', { pic: 'pictures/cave_mouth.png' }),
    say('c2', '', 'What do you do?', { pic: 'pictures/cave_mouth.png', choices: [{ text: 'Pick up the lamp', next: 'c3', do: [{ k: 'give', v: 'lamp' }, { k: 'flag', v: 'has_lamp' }] }, { text: 'Walk into the dark', next: 'end', do: [] }] }),
    say('c3', '', 'The lamp sputters, then catches. Shadows jump back along the walls. You step inside.', { pic: 'pictures/cave_mouth.png', next: 'end' })] } });
  await put('dialogue-deep', { meta: { kind: 'dialogue', name: 'deep' }, dialogue: { name: 'deep', cast: [], beats: [
    say('d1', '', 'Deep inside, the lamplight finds a door of old oak, its handle green with age.', { pic: 'pictures/cave_deep.png' }),
    say('d2', '', 'The handle turns. Behind it: stairs, and far above, daylight.', { pic: 'pictures/cave_deep.png', choices: [{ text: 'Climb the stairs', next: 'end', do: [{ k: 'flow', v: 'out' }] }] })] } });
  await put('menus-game', menus('THE CAVE'));
  await put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['s1', 'story', 'The cave mouth', 240, { dialogue: 'cave' }], ['k', 'check', 'Has the lamp?', 480, { flag: 'has_lamp' }],
    ['s2', 'story', 'Deep inside', 720, { dialogue: 'deep' }], ['good', 'end', 'Daylight', 960, { text: 'You climb into the sunlight. THE END.' }], ['bad', 'end', 'Lost', 720, { text: 'In the dark you lose your way. THE END.', y: 200 }]],
    [['t', 'done', 's1'], ['s1', 'done', 'k'], ['k', 'yes', 's2'], ['k', 'no', 'bad'], ['s2', 'out', 'good'], ['s2', 'done', 'good']]));
  return {};
}

/* ------------------------------------------------------------ interactive movie: title cards for now ---- */
async function fmvDemo({ put, step }) {
  step('Title-card videos (stand-ins until you film the real scenes)…');
  const card = async (name, text, seconds, colour) => (await api('/api/video/card', { name, text, seconds, colour })).file;
  const v = { intro: await card('intro', 'THE NIGHT SHIFT', 3, '10223a'), s1: await card('scene_1', 'Scene 1: the long corridor', 3, '1a1a2a'),
    trap: await card('trap', 'The ceiling gives way. DUCK!', 4, '3a1018'), s2: await card('scene_2', 'Scene 2: you made it out', 3, '10301e'), death: await card('death', 'Too slow…', 2.5, '2a0a0a') };
  await put('menus-game', menus('THE NIGHT SHIFT'));
  step('The flow: intro → title → a scene → a timed choice → a quick-time moment…');
  await put('flow-game', flow([['i', 'video', 'Intro', 0, { video: v.intro }], ['t', 'menu', 'Title', 240, { menu: 'title' }], ['s1', 'video', 'Scene 1', 480, { video: v.s1 }],
    ['c', 'choice', 'Which way?', 720, { text: 'Two doors. Which way?', options: ['Left door', 'Right door'], seconds: 6, fallback: 0 }],
    ['q', 'quick', 'The trap', 960, { video: v.trap, from: 1.5, to: 3, action: 'any', text: 'NOW!' }], ['s2', 'video', 'Scene 2', 1200, { video: v.s2 }],
    ['d', 'video', 'Death', 1200, { video: v.death, y: -170 }], ['e', 'end', 'The end', 1440, { text: 'You made it. THE END.' }]],
    [['i', 'done', 't'], ['t', 'done', 's1'], ['s1', 'done', 'c'], ['c', 'Left door', 'q'], ['c', 'Right door', 'd'], ['q', 'hit', 's2'], ['q', 'miss', 'd'], ['d', 'done', 'c'], ['s2', 'done', 'e']]));
  return {};
}

/* ------------------------------------------------------------ levels from rows of text ---- */
// '#' stone wall (solid), '.' floor planks (top-down: walk on it), '=' planks (side view: one-way), '^' spikes
function levelFrom(name, rows, { kinds, ents = [], zones = [], bg = null }) {
  const cols = rows[0].length, cells = [];
  for (const row of rows) for (const ch of row) cells.push({ '#': 0, '.': 4, '=': 4, '^': 6, g: 2, d: 3 }[ch] ?? -1);
  return { meta: { kind: 'level', name }, level: { id: uid(), name, tile: T, cols, rows: rows.length, ts: null, tsCols: 8, solid: [0, 2, 3], kinds, cells, pick: 0, grid: true, ents, zones, bg } };
}
const at = (cx, cy) => ({ x: cx * T + T / 2, y: (cy + 1) * T });

/* ------------------------------------------------------------ top-down: four rooms ---- */
function bolt(k) { const im = newImg(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x - 3.5, y - 3.5); if (d < 3.2) im.data.set(d < 1.6 + k ? [255, 240, 160, 255] : [240, 170, 60, 255], (y * 8 + x) * 4); } return im; }
async function topdownDemo({ put, step }) {
  step('A hero who shoots, slimes that chase, a turret boss…');
  const p = hero('ranger', { ...HERO, tunic: '#7a3b5e', dark: '#5a2b46' }, 'hero', ['idle', 'walk']);
  p.actor.anims.push({ ...anim('proj_bolt', [bolt(0), bolt(.8)], 12, true), frames: [toDataURL(bolt(0)), toDataURL(bolt(.8))], boxes: [null, null] });
  p.actor.projectiles = [{ name: 'bolt', anim: 'proj_bolt', speed: 200, gravity: 0, lifetime: 1.2, damage: 1, pierce: false }];
  await put('actor-ranger', p);
  const blob = (name, role, brain, health, scale) => {
    const fr = k => { const s = slime(k); if (scale === 1) return s; const big = newImg(s.width * scale, s.height * scale); for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) big.data.set(s.data.subarray(((y / scale | 0) * s.width + (x / scale | 0)) * 4, ((y / scale | 0) * s.width + (x / scale | 0)) * 4 + 4), (y * big.width + x) * 4); return big; };
    const a = { id: uid(), name, w: 20 * scale, h: 16 * scale, role, brain, pal: [], react: { knockback: 100, iframes: .3, health },
      anims: [anim('idle', [fr(0), fr(.25)], 4, true), anim('walk', [fr(0), fr(.3), fr(.6), fr(.3)], 8, true)] };
    if (brain === 'turret') { a.anims.push(anim('proj_spit', [bolt(0)], 8, true)); a.projectiles = [{ name: 'spit', anim: 'proj_spit', speed: 110, gravity: 0, lifetime: 2.5, damage: 1, pierce: false }]; }
    return project(a);
  };
  await put('actor-slime', blob('slime', 'enemy', 'chaser', 2, 1));
  await put('actor-slime_king', blob('slime_king', 'boss', 'turret', 12, 2));
  step('Four rooms, the camera moving room by room…');
  const R = [], W = 60, Hh = 34;
  for (let y = 0; y < Hh; y++) { let row = ''; for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === Hh - 1, wallX = x === 29 || x === 30, wallY = y === 16 || y === 17;
    const door = (wallX && ((y >= 6 && y <= 9) || (y >= 23 && y <= 26))) || (wallY && ((x >= 12 && x <= 16) || (x >= 42 && x <= 46)));
    row += edge || ((wallX || wallY) && !door) ? '#' : '.'; } R.push(row); }
  await put('level-dungeon', levelFrom('dungeon', R, { kinds: { 0: 'solid' },
    ents: [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(6, 8) }, ...[[20, 5], [22, 12], [48, 6], [10, 26], [18, 28]].map(([x, y]) => ({ id: uid(), type: 'actor', name: 'slime', ...at(x, y) })),
      { id: uid(), type: 'actor', name: 'slime_king', ...at(45, 27) }] }));
  await put('hud-hud', { meta: { kind: 'hud', name: 'hud' }, hud: starterHud('hud') });
  await put('menus-game', menus('SLIME CELLAR'));
  return { level: 'res://levels/dungeon/dungeon.tscn', player: 'res://sprites/ranger/ranger.tscn', hud: 'res://hud/hud/hud.tscn' };
}

/* ------------------------------------------------------------ push puzzles: three screens ---- */
async function pushDemo({ put, step }) {
  step('A hero who walks, jumps and pushes…');
  await put('actor-bot', hero('bot', { ...HERO, skin: '#b8c4cc', hair: '#5a6670', tunic: '#36c3ae', dark: '#24887a', blade: '#00000000' }, 'hero', ['idle', 'walk', 'jump']));
  step('Three one-screen puzzles: push a crate to climb out…');
  const kinds = { 0: 'solid', 2: 'solid', 3: 'solid' }, exit = (x, y) => ({ id: uid(), kind: 'door', name: 'exit', target: 'flow', x: x * T, y: y * T, w: 2 * T, h: 2 * T });
  const crate = (x, y) => ({ id: uid(), type: 'crate', name: 'Crate', tile: 5, ...at(x, y) });
  const base = (fn) => { const g = Array.from({ length: 17 }, (_, y) => Array.from({ length: 30 }, (_, x) => x === 0 || x === 29 || y === 0 || y >= 15 ? '#' : ' ')); fn(g); return g.map(r => r.join('')); };
  await put('level-push_1', levelFrom('push_1', base(g => { for (let x = 21; x < 29; x++) for (let y = 12; y < 15; y++) g[y][x] = '#'; }),
    { kinds, ents: [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(3, 14) }, crate(10, 14)], zones: [exit(25, 10)] }));
  await put('level-push_2', levelFrom('push_2', base(g => { for (let y = 12; y < 15; y++) g[y][15] = '#'; }),
    { kinds, ents: [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(3, 14) }, crate(8, 14)], zones: [exit(25, 13)] }));
  await put('level-push_3', levelFrom('push_3', base(g => { for (let y = 12; y < 15; y++) { g[y][10] = '#'; g[y][20] = '#'; } }),
    { kinds, ents: [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(2, 14) }, crate(6, 14), crate(15, 14)], zones: [exit(25, 13)] }));
  await put('menus-game', menus('CRATE ESCAPE'));
  await put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['l1', 'level', 'Puzzle 1', 240, { level: 'push_1' }], ['l2', 'level', 'Puzzle 2', 480, { level: 'push_2' }],
    ['l3', 'level', 'Puzzle 3', 720, { level: 'push_3' }], ['e', 'end', 'Free', 960, { text: 'You escaped. THE END.' }]],
    [['t', 'done', 'l1'], ['l1', 'exit', 'l2'], ['l2', 'exit', 'l3'], ['l3', 'exit', 'e']]));
  return { level: 'res://levels/push_1/push_1.tscn', player: 'res://sprites/bot/bot.tscn' };
}

/* ------------------------------------------------------------ stacking tower ---- */
async function stackDemo({ put, step }) {
  step('A base to build on and a line to reach…');
  const rows = Array.from({ length: 17 }, (_, y) => Array.from({ length: 30 }, (_, x) => y >= 14 && x >= 11 && x <= 18 ? '#' : ' ').join(''));
  await put('level-tower', levelFrom('tower', rows, { kinds: { 0: 'solid' }, ents: [{ id: uid(), type: 'start', name: 'PlayerStart', x: 15 * T, y: 2 * T }],
    zones: [{ id: uid(), kind: 'door', name: 'goal', target: 'flow', x: 0, y: 6 * T, w: 30 * T, h: T }] }));
  await put('menus-game', menus('TOWER OF BRICKS'));
  await put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['l', 'level', 'The tower', 240, { level: 'tower' }], ['e', 'end', 'Built', 480, { text: 'What a tower! THE END.' }]],
    [['t', 'done', 'l'], ['l', 'goal', 'e']]));
  return { level: 'res://levels/tower/tower.tscn' };
}
