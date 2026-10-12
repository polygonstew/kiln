// Templates for the other game paths (gametype.js; point & click has its kits in templates.js), each a small complete
// game in a new folder, made the way you would make it and tied together by a Flow: a text adventure (pages with pictures and a check), an interactive movie (title-card videos, a timed
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
  if (pick.path === 'adventure') return import('./templates.js').then(m => m.openAdventureKits());
  const make = { text: textDemo, fmv: fmvDemo, topdown: topdownDemo, puzzle: pick.puzzle === 'stack' ? stackDemo : pushDemo }[pick.path];
  if (!make) return toast('No template for that kind of game yet', 'bad');
  const g = await newGameFolder(`my_${pick.path === 'puzzle' ? pick.puzzle : pick.path}`, `the ${PATHS[pick.path].label.toLowerCase()} template`, { ...pick, look: 'pixel' });   // these templates are drawn as pixel art
  if (g) await g.finish(await make(g));
}

// A new game folder for a template: asks its name, switches to it with the path set, and gives the template
// { put(id, project), files(dest, list), step(text), finish(stage picks) }; finish saves every area and plays it.
export async function newGameFolder(suggested, what, pick) {
  const name = (prompt(`Name for the new game, from ${what} (a new game folder; yours stays as it is)`, suggested) || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!name) return null;
  const path = FS.settings.games + '/' + name;
  const there = await api('/api/fs?path=' + encodeURIComponent(path + '/kiln')).catch(() => ({ items: [] }));
  if ((there.items || []).length && !confirm(`${name} already has Kiln projects. Make the template there anyway (same names are replaced)?`)) return null;
  const log = h('div', { class: 'play-log', style: { maxHeight: '300px' } }), step = t => { log.append(h('div', {}, t)); log.scrollTop = 1e9; };
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(560px, 94vw)' } }, h('header', {}, h('span', { class: 'grow' }, 'Making your game from ' + what)),
    h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Every area takes its turn: watch the tabs.'), log)));
  document.body.append(m);
  await api('/api/fs', { op: 'root', path, scaffold: true }); await loadSettings();
  await setPath(pick.path, pick.puzzle, pick.look || 'modern');
  return {
    step, put: (id, data) => api('/api/project', { id, data }), files: (dest, list) => api('/api/export', { dest, files: list }),
    async finish(buildPick) {
      step('Every area saves its part for Godot:');
      const r = await saveAll(t => step('  ' + t));
      if (r.failed.length) step('Some parts failed: ' + r.failed.join('; '));
      pref.set(buildKey(), { start: 'none', ...buildPick });
      step('Done. Starting it in the Stage…');
      sessionStorage.setItem('kiln.play', '1');
      setTimeout(() => restart(`Your game from ${what} is ready: look inside Flow and each area, then make it yours`, 'stage'), 800);
    },
  };
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
