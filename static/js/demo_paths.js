// Templates for every game path but the side-scroller (demo.js) and point & click (templates.js): a small complete game
// in a new folder, in the Modern look, on painted pictures from static/templates/ (made once by tools/template_art.py),
// tied together by a Flow: a text adventure, an interactive movie (stills turned into zooming clips), a top-down shooter,
// push puzzles, a stacking tower, match-3 boards, a card battler, a visual novel and an endless runner. Every area saves
// its part (saveall.js), then Kiln starts again in the new game and plays it.
import { h, api, toast, pref, uid, imgData } from './core.js';
import { S as FS, loadSettings } from './files.js';
import { DEFAULTS as MENU_DEFAULTS } from './menus.js';
import { starterHud } from './hud.js';
import { saveAll } from './saveall.js';
import { buildKey } from './playbuild.js';
import { setPath, PATHS } from './gametype.js';
import { restart } from './games.js';

const flow = (nodes, links) => ({ meta: { kind: 'flow', name: 'game' }, flow: { id: uid(), nodes: nodes.map(([id, kind, name, x, extra]) => ({ id, kind, name, x, y: 0, ...(extra || {}) })), links: links.map(([from, out, to]) => ({ from, out, to })), start: nodes[0][0] } });
const say = (id, who, text, extra = {}) => ({ id, who, text, voice: '', next: '', choices: [], do: [], ...extra });

export async function makePathDemo(pick) {
  if (pick.path === 'adventure') return import('./templates.js').then(m => m.openAdventureKits());
  const make = { match3: match3Demo, cards: cardsDemo, vn: vnDemo, runner: runnerDemo, text: textDemo, fmv: fmvDemo, topdown: topdownDemo, puzzle: pick.puzzle === 'stack' ? stackDemo : pushDemo }[pick.path];
  if (!make) return toast('No template for that kind of game yet', 'bad');
  const g = await newGameFolder(`my_${pick.path === 'puzzle' ? pick.puzzle : pick.path}`, `the ${PATHS[pick.path].label.toLowerCase()} template`, { ...pick, look: 'modern' });
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

/* ------------------------------------------------------------ levels from rows of text ---- */
// '#' stone wall (solid), '.' floor planks (no collision), '=' planks; T = the tile size
function levelFrom(name, rows, { kinds, ents = [], zones = [], bg = null, T = 32 }) {
  const cols = rows[0].length, cells = [];
  for (const row of rows) for (const ch of row) cells.push({ '#': 0, '.': 4, '=': 4, '^': 6, g: 2, d: 3 }[ch] ?? -1);
  return { meta: { kind: 'level', name }, level: { id: uid(), name, tile: T, cols, rows: rows.length, ts: null, tsCols: 8, solid: [0, 2, 3], kinds, cells, pick: 0, grid: true, ents, zones, bg } };
}
// a scene with one picture filling w×h (a level's backdrop); scroll 1 moves with the level (top-down floors)
async function pictureScene(g, name, art, w, hh, scroll = .2, tile = false) {
  const im = await imgData(ARTURL(art)), c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d');
  if (tile) for (let ty = 0; ty < hh; ty += im.height) for (let tx = 0; tx < w; tx += im.width) x.drawImage(toCv(im), tx, ty); else x.drawImage(toCv(im), 0, 0, w, hh);
  await g.put('scene-' + name, { meta: { kind: 'scene', name }, scene: { id: uid(), name, view: { w: 1280, h: hh }, look: 'paint', layers: [
    { id: uid(), name, kind: 'image', srcURL: c.toDataURL('image/webp', .88), w, h: hh, y: 0, scroll, repeat: !tile, visible: true, key: false, tol: 30 }] } });
}
// someone from one picture with idle, walk (and run / jump) frames, ready for Animate
async function person(g, name, artName, height, role, extra = {}) {
  const { personFrames } = await import('./templates.js'), { cutout } = await import('./cutout.js');
  const P = personFrames(cutout(await imgData(ARTURL(artName)), { height }));
  P.anims.push({ ...P.anims[1], name: 'run', fps: 9 }, { ...P.anims[0], name: 'jump' }, { ...P.anims[0], name: 'fall' });
  await g.put('actor-' + name, { meta: { kind: 'actor', name, thumb: P.anims[0].frames[0] }, actor: { id: uid(), name, w: P.w, h: P.h, role, pal: [], anims: P.anims, react: { knockback: 140, iframes: .6, health: 3 }, ...extra } });
  return P;
}
const ballFrame = (r, c1, c2) => { const c = document.createElement('canvas'); c.width = c.height = r * 2; const x = c.getContext('2d'), gr = x.createRadialGradient(r * .7, r * .7, 1, r, r, r);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2); x.fillStyle = gr; x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.fill(); return c.toDataURL('image/png'); };

/* ------------------------------------------------------------ text adventure: The Cave ---- */
async function textDemo(g) {
  g.step('Pictures for the pages…');
  const mouth = await art(g, 'cave_mouth', 'pictures', 'cave_mouth'), deep = await art(g, 'cave_deep', 'pictures', 'cave_deep');
  g.step('The story, line by line, with choices…');
  await g.put('dialogue-cave', { meta: { kind: 'dialogue', name: 'cave' }, dialogue: { name: 'cave', cast: [], beats: [
    say('c1', '', 'Rain hammers the hillside. Ahead, the mouth of a cave. At your feet, a brass lamp glints in the mud.', { pic: mouth }),
    say('c2', '', 'What do you do?', { pic: mouth, choices: [{ text: 'Pick up the lamp', next: 'c3', do: [{ k: 'give', v: 'lamp' }, { k: 'flag', v: 'has_lamp' }] }, { text: 'Walk into the dark', next: 'end', do: [] }] }),
    say('c3', '', 'The lamp sputters, then catches. Shadows jump back along the walls. You step inside.', { pic: mouth, next: 'end' })] } });
  await g.put('dialogue-deep', { meta: { kind: 'dialogue', name: 'deep' }, dialogue: { name: 'deep', cast: [], beats: [
    say('d1', '', 'Deep inside, the lamplight finds a door of old oak, its handle green with age.', { pic: deep }),
    say('d2', '', 'The handle turns. Behind it: stairs, and far above, daylight.', { pic: deep, choices: [{ text: 'Climb the stairs', next: 'end', do: [{ k: 'flow', v: 'out' }] }] })] } });
  await g.put('menus-game', titleMenu('THE CAVE', '#d9bf6a'));
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title', picture: mouth }], ['s1', 'story', 'The cave mouth', 240, { dialogue: 'cave' }], ['k', 'check', 'Has the lamp?', 480, { flag: 'has_lamp' }],
    ['s2', 'story', 'Deep inside', 720, { dialogue: 'deep' }], ['good', 'end', 'Daylight', 960, { text: 'You climb into the sunlight. THE END.' }], ['bad', 'end', 'Lost', 720, { text: 'In the dark you lose your way. THE END.', y: 200 }]],
    [['t', 'done', 's1'], ['s1', 'done', 'k'], ['k', 'yes', 's2'], ['k', 'no', 'bad'], ['s2', 'out', 'good'], ['s2', 'done', 'good']]));
  return {};
}

/* ------------------------------------------------------------ interactive movie: stills that move ---- */
async function fmvDemo(g) {
  g.step('Video clips from stills: a slow zoom with a caption (stand-ins until you film your own)…');
  const still = async n => { const b = await fetch(ARTURL(n)).then(r => r.blob()); return new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }); };
  const clip = async (name, text, seconds, pic, colour) => (await api('/api/video/card', { name, text, seconds, colour, image: pic ? await still(pic) : '' })).file;
  const v = { intro: await clip('intro', 'THE NIGHT SHIFT', 4, 'fmv_intro'), s1: await clip('scene_1', 'The long corridor', 4, 'fmv_corridor'),
    trap: await clip('trap', 'The ceiling gives way. DUCK!', 4, 'fmv_trap'), s2: await clip('scene_2', 'You made it out', 4, 'fmv_exit'), death: await clip('death', 'Too slow…', 2.5, null, '2a0a0a') };
  const title = await art(g, 'fmv_intro', 'pictures', 'title');
  await g.put('menus-game', titleMenu('THE NIGHT SHIFT', '#5aa8ff'));
  g.step('The flow: intro → title → a scene → a timed choice → a quick-time moment…');
  await g.put('flow-game', flow([['i', 'video', 'Intro', 0, { video: v.intro }], ['t', 'menu', 'Title', 240, { menu: 'title', picture: title }], ['s1', 'video', 'Scene 1', 480, { video: v.s1 }],
    ['c', 'choice', 'Which way?', 720, { text: 'Two doors. Which way?', options: ['Left door', 'Right door'], seconds: 6, fallback: 0, video: v.s1 }],
    ['q', 'quick', 'The trap', 960, { video: v.trap, from: 1.5, to: 3, action: 'any', text: 'NOW!' }], ['s2', 'video', 'Scene 2', 1200, { video: v.s2 }],
    ['d', 'video', 'Death', 1200, { video: v.death, y: -170 }], ['e', 'end', 'The end', 1440, { text: 'You made it. THE END.' }]],
    [['i', 'done', 't'], ['t', 'done', 's1'], ['s1', 'done', 'c'], ['c', 'Left door', 'q'], ['c', 'Right door', 'd'], ['q', 'hit', 's2'], ['q', 'miss', 'd'], ['d', 'done', 'c'], ['s2', 'done', 'e']]));
  return {};
}

/* ------------------------------------------------------------ top-down: four rooms ---- */
async function topdownDemo(g) {
  g.step('A hero who shoots, slimes that chase, a slime king that fires back…');
  const P = await person(g, 'ranger', 'ranger', 96, 'hero');
  const bolt = { name: 'proj_bolt', fps: 12, loop: true, span: 1, frames: [ballFrame(8, '#fff6c0', '#f0a030'), ballFrame(7, '#fff6c0', '#f0a030')], boxes: [null, null] };
  const pr = await (await fetch('/api/project?id=actor-ranger')).json();
  pr.actor.anims.push(bolt); pr.actor.projectiles = [{ name: 'bolt', anim: 'proj_bolt', speed: 380, gravity: 0, lifetime: 1.4, damage: 1, pierce: false }];
  await g.put('actor-ranger', pr);
  await person(g, 'slime', 'slime', 64, 'enemy', { brain: 'chaser', brainParams: { speed: 70, sight: 320 }, react: { knockback: 160, iframes: .25, health: 2 } });
  await person(g, 'slime_king', 'slime', 150, 'boss', { brain: 'turret', brainParams: { speed: 20, fire_every: 1.4, shots: 3, sight: 520 }, react: { knockback: 40, iframes: .2, health: 14 },
    projectiles: [{ name: 'spit', anim: 'proj_spit', speed: 220, gravity: 0, lifetime: 3, damage: 1, pierce: false }] });
  const k = await (await fetch('/api/project?id=actor-slime_king')).json();
  k.actor.anims.push({ ...bolt, name: 'proj_spit', frames: [ballFrame(9, '#c8ffd0', '#2e8a3a')], boxes: [null] }); await g.put('actor-slime_king', k);
  g.step('Four rooms, the camera moving room by room, a flagstone floor…');
  const Tl = 32, W = 80, Hh = 46, R = [];
  for (let y = 0; y < Hh; y++) { let row = ''; for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === Hh - 1, wallX = x === 39 || x === 40, wallY = y === 22 || y === 23;
    const door = (wallX && ((y >= 8 && y <= 13) || (y >= 31 && y <= 36))) || (wallY && ((x >= 16 && x <= 22) || (x >= 56 && x <= 62)));
    row += edge || ((wallX || wallY) && !door) ? '#' : ' '; } R.push(row); }
  await pictureScene(g, 'flagstones', 'dungeon', W * Tl, Hh * Tl, 1, true);
  const at2 = (cx, cy) => ({ x: cx * Tl + Tl / 2, y: (cy + 1) * Tl });
  await g.put('level-dungeon', levelFrom('dungeon', R, { T: Tl, kinds: { 0: 'solid' }, bg: 'flagstones',
    ents: [{ id: uid(), type: 'start', name: 'PlayerStart', ...at2(8, 11) }, ...[[26, 6], [30, 16], [64, 8], [12, 34], [24, 38]].map(([x, y]) => ({ id: uid(), type: 'actor', name: 'slime', ...at2(x, y) })),
      { id: uid(), type: 'actor', name: 'slime_king', ...at2(60, 36) }] }));
  await g.put('hud-hud', { meta: { kind: 'hud', name: 'hud' }, hud: starterHud('hud') });
  await g.put('menus-game', titleMenu('SLIME CELLAR', '#ff4f6d'));
  return { level: 'res://levels/dungeon/dungeon.tscn', player: 'res://sprites/ranger/ranger.tscn', hud: 'res://hud/hud/hud.tscn' };
}

/* ------------------------------------------------------------ push puzzles: three screens ---- */
async function pushDemo(g) {
  g.step('A robot who walks, jumps and pushes, a lab behind…');
  await person(g, 'bot', 'robot', 120, 'hero', { brainParams: { speed: 150, jump_height: 76, jump_time: .38 } });
  await pictureScene(g, 'lab', 'lab', 1280, 736);
  g.step('Three one-screen puzzles: push a crate to climb out…');
  const Tl = 32, kinds = { 0: 'solid', 2: 'solid', 3: 'solid' }, at2 = (cx, cy) => ({ x: cx * Tl + Tl / 2, y: (cy + 1) * Tl });
  const exit = (x, y) => ({ id: uid(), kind: 'door', name: 'exit', target: 'flow', x: x * Tl, y: y * Tl, w: 2 * Tl, h: 3 * Tl });
  const crate = (x, y) => ({ id: uid(), type: 'crate', name: 'Crate', tile: 5, ...at2(x, y) });
  const base = fn => { const gr = Array.from({ length: 23 }, (_, y) => Array.from({ length: 40 }, (_, x) => x === 0 || x === 39 || y >= 21 ? '#' : ' ')); fn(gr); return gr.map(r => r.join('')); };
  const start = { id: uid(), type: 'start', name: 'PlayerStart', ...at2(3, 20) };
  await g.put('level-push_1', levelFrom('push_1', base(gr => { for (let x = 28; x < 39; x++) for (let y = 18; y < 21; y++) gr[y][x] = '#'; }), { T: Tl, kinds, bg: 'lab', ents: [start, crate(14, 20)], zones: [exit(33, 15)] }));
  await g.put('level-push_2', levelFrom('push_2', base(gr => { for (let y = 18; y < 21; y++) gr[y][20] = '#'; }), { T: Tl, kinds, bg: 'lab', ents: [start, crate(10, 20)], zones: [exit(33, 18)] }));
  await g.put('level-push_3', levelFrom('push_3', base(gr => { for (let y = 18; y < 21; y++) { gr[y][13] = '#'; gr[y][27] = '#'; } }), { T: Tl, kinds, bg: 'lab', ents: [{ ...start, ...at2(2, 20) }, crate(8, 20), crate(20, 20)], zones: [exit(34, 18)] }));
  await g.put('menus-game', titleMenu('CRATE ESCAPE', '#36c3ae'));
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['l1', 'level', 'Puzzle 1', 240, { level: 'push_1' }], ['l2', 'level', 'Puzzle 2', 480, { level: 'push_2' }],
    ['l3', 'level', 'Puzzle 3', 720, { level: 'push_3' }], ['e', 'end', 'Free', 960, { text: 'You escaped. THE END.' }]],
    [['t', 'done', 'l1'], ['l1', 'exit', 'l2'], ['l2', 'exit', 'l3'], ['l3', 'exit', 'e']]));
  return { level: 'res://levels/push_1/push_1.tscn', player: 'res://sprites/bot/bot.tscn' };
}

/* ------------------------------------------------------------ stacking tower ---- */
async function stackDemo(g) {
  g.step('A base to build on, a line to reach, a sky behind…');
  await pictureScene(g, 'sky', 'sky', 1280, 736);
  const Tl = 32, rows = Array.from({ length: 23 }, (_, y) => Array.from({ length: 40 }, (_, x) => y >= 20 && x >= 15 && x <= 24 ? '#' : ' ').join(''));
  await g.put('level-tower', levelFrom('tower', rows, { T: Tl, kinds: { 0: 'solid' }, bg: 'sky', ents: [{ id: uid(), type: 'start', name: 'PlayerStart', x: 20 * Tl, y: 3 * Tl }],
    zones: [{ id: uid(), kind: 'door', name: 'goal', target: 'flow', x: 0, y: 9 * Tl, w: 40 * Tl, h: Tl }] }));
  await g.put('menus-game', titleMenu('TOWER OF BRICKS', '#36c3ae'));
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['l', 'level', 'The tower', 240, { level: 'tower' }], ['e', 'end', 'Built', 480, { text: 'What a tower! THE END.' }]],
    [['t', 'done', 'l'], ['l', 'goal', 'e']]));
  return { level: 'res://levels/tower/tower.tscn' };
}
/* ------------------------------------------------------------ painted templates (Modern look) ---- */
const ARTURL = n => `/templates/${n}.webp`;
const dataOf = c => c.toDataURL('image/png');
const toCv = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0); return c; };
// a template picture into the game folder: as it is (WebP), or cut out of its plain background and sized (PNG)
async function art(g, name, dest, file, { cut = false, height = 0 } = {}) {
  if (!cut) { const b64 = await fetch(ARTURL(name)).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }));
    await g.files(dest, [{ name: file + '.webp', b64 }]); return `${dest}/${file}.webp`; }
  const { cutout } = await import('./cutout.js');
  await g.files(dest, [{ name: file + '.png', b64: dataOf(toCv(cutout(await imgData(ARTURL(name)), { height }))) }]);
  return `${dest}/${file}.png`;
}
const titleMenu = (title, accent) => { const m = MENU_DEFAULTS(); m.title.title = title; m.title.dim = .3; m.title.fontSize = 22; if (accent) m.title.accent = accent; return { meta: { kind: 'menus', name: 'game' }, menus: m }; };

async function match3Demo(g) {
  g.step('Sweets for the pieces, a candy land behind the board…');
  const pieces = [];
  for (const c of ['red', 'yellow', 'green', 'blue', 'purple', 'orange']) pieces.push(await art(g, 'm3_' + c, 'pictures/pieces', c, { cut: true, height: 128 }));
  const bg = await art(g, 'm3_bg', 'pictures', 'candy_land');
  await g.put('menus-game', titleMenu('SWEET SWAP', '#ff5d9e'));
  g.step('Three boards, each harder, in the flow…');
  const board = (id, name, x, cols, goal, moves) => [id, 'match3', name, x, { cols, rows: cols, goal, moves, pieces, picture: bg }];
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title', picture: bg }], board('b1', 'Board 1', 240, 7, 1200, 18), board('b2', 'Board 2', 480, 8, 2400, 20), board('b3', 'Board 3', 720, 8, 4000, 22),
    ['e', 'end', 'Sweet!', 960, { text: 'Every board cleared. Sweet!' }]],
    [['t', 'done', 'b1'], ['b1', 'win', 'b2'], ['b2', 'win', 'b3'], ['b3', 'win', 'e'], ['b1', 'lose', 'b1'], ['b2', 'lose', 'b2'], ['b3', 'lose', 'b3']]));
  return {};
}

async function cardsDemo(g) {
  g.step('Card pictures and three foes…');
  const pic = {};
  for (const c of ['strike', 'guard', 'mend', 'focus', 'smash']) pic[c] = await art(g, 'cd_' + c, 'pictures/cards', c);
  const foe = {};
  for (const f of ['goblin', 'knight', 'dragon']) foe[f] = await art(g, 'cd_' + f, 'pictures/foes', f, { cut: true, height: 300 });
  await g.put('cards-game', { meta: { kind: 'cards', name: 'game' }, cards: { hp: 45, energy: 3, hand: 5, cards: [
    { id: 'strike', name: 'Strike', cost: 1, attack: 6, copies: 5, picture: pic.strike }, { id: 'guard', name: 'Guard', cost: 1, block: 5, copies: 4, picture: pic.guard },
    { id: 'mend', name: 'Mend', cost: 1, heal: 5, copies: 1, picture: pic.mend }, { id: 'focus', name: 'Focus', cost: 0, draw: 2, copies: 1, picture: pic.focus },
    { id: 'smash', name: 'Smash', cost: 2, attack: 15, copies: 1, picture: pic.smash }] } });
  await g.put('menus-game', titleMenu('THREE FOES', '#e3b04b'));
  g.step('The road: three fights in the flow…');
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['f1', 'cards', 'Goblin', 240, { hp: 22, pattern: 'attack 5, attack 7, block 4', picture: foe.goblin }],
    ['f2', 'cards', 'Skeleton knight', 480, { hp: 36, pattern: 'block 6, attack 9, attack 11', picture: foe.knight }], ['f3', 'cards', 'Dragon whelp', 720, { hp: 55, pattern: 'attack 8, attack 14, block 10, attack 18', picture: foe.dragon }],
    ['win', 'end', 'Victory', 960, { text: 'Three foes down. The road is yours.' }], ['lose', 'end', 'Fallen', 960, { text: 'You fell. Try another way to play your deck.', y: 200 }]],
    [['t', 'done', 'f1'], ['f1', 'win', 'f2'], ['f2', 'win', 'f3'], ['f3', 'win', 'win'], ['f1', 'lose', 'lose'], ['f2', 'lose', 'lose'], ['f3', 'lose', 'lose']]));
  return {};
}

async function vnDemo(g) {
  g.step('Backgrounds and a character…');
  const shop = await art(g, 'bn_bookshop', 'pictures', 'bookshop'), yard = await art(g, 'bn_cemetery', 'pictures', 'cemetery');
  const grace = await art(g, 'bn_priestess', 'pictures', 'grace', { cut: true, height: 640 });
  g.step('The script, with a choice that splits the story…');
  await g.put('dialogue-visit', { meta: { kind: 'dialogue', name: 'visit' }, dialogue: { name: 'visit', cast: [{ name: 'Grace', actor: '' }], beats: [
    say('v1', '', 'Midnight. The bell over the shop door rings. Nobody comes in at midnight.'),
    say('v2', 'Grace', 'You are the one with the old books. And the old blood.'),
    say('v3', 'Grace', 'Something walks the cemetery tonight. Will you come?', { choices: [{ text: 'I\'ll get my coat.', next: 'v4', do: [{ k: 'flow', v: 'follow' }] }, { text: 'It\'s late. Come back tomorrow.', next: 'v5', do: [{ k: 'flow', v: 'stay' }] }] }),
    say('v4', 'Grace', 'Bring a light.', { next: 'end' }), say('v5', 'Grace', 'Tomorrow may be too late.', { next: 'end' })] } });
  await g.put('dialogue-graves', { meta: { kind: 'dialogue', name: 'graves' }, dialogue: { name: 'graves', cast: [{ name: 'Grace', actor: '' }], beats: [
    say('w1', 'Grace', 'There. The serpent tomb. Its door was shut yesterday.'), say('w2', '', 'It is open now.', { next: 'end' })] } });
  await g.put('menus-game', titleMenu('MIDNIGHT VISITOR', '#ff8fb1'));
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title', picture: yard }], ['s1', 'talk', 'The visit', 240, { dialogue: 'visit', picture: shop, portrait: grace }],
    ['s2', 'talk', 'The graves', 480, { dialogue: 'graves', picture: yard, portrait: grace }], ['a', 'end', 'Into the dark', 720, { text: 'To be continued…' }],
    ['b', 'end', 'Morning', 480, { text: 'In the morning, the papers speak of an open tomb. THE END?', y: 200 }]],
    [['t', 'done', 's1'], ['s1', 'follow', 's2'], ['s1', 'stay', 'b'], ['s2', 'done', 'a']]));
  return {};
}

async function runnerDemo(g) {
  g.step('A robot who runs, a sky behind…');
  const { personFrames } = await import('./templates.js'), { cutout } = await import('./cutout.js');
  const P = personFrames(cutout(await imgData(ARTURL('robot')), { height: 120 }));
  P.anims.push({ ...P.anims[1], name: 'run', fps: 10 }, { ...P.anims[0], name: 'jump' });
  await g.put('actor-bot', { meta: { kind: 'actor', name: 'bot', thumb: P.anims[0].frames[0] }, actor: { id: uid(), name: 'bot', w: P.w, h: P.h, role: 'hero', pal: [], anims: P.anims, react: { knockback: 0, iframes: .5, health: 1 } } });
  const skyIm = await imgData(ARTURL('sky')), sc = document.createElement('canvas'); sc.width = 1280; sc.height = 720;      // the screen's size
  sc.getContext('2d').drawImage(toCv(skyIm), 0, 0, 1280, 720); const sky = sc.toDataURL('image/webp', .9);
  await g.put('scene-sky', { meta: { kind: 'scene', name: 'sky' }, scene: { id: uid(), name: 'sky', view: { w: 1280, h: 720 }, look: 'paint', layers: [
    { id: uid(), name: 'sky', kind: 'image', srcURL: sky, w: 1280, h: 720, y: 0, scroll: .2, repeat: true, visible: true, key: false, tol: 30 }] } });
  g.step('A long run with gaps to jump…');
  const T = 32, cols = 160, rows = 23, R = [];
  for (let y = 0; y < rows; y++) { let row = ''; for (let x = 0; x < cols; x++) { const gap = x > 14 && x % 19 > 15, step = x > 40 && x % 31 < 6 && y >= rows - 4; row += (y >= rows - 2 && !gap) || step ? '#' : ' '; } R.push(row); }
  const lv = levelFrom('run', R, { kinds: { 0: 'solid' }, ents: [{ id: uid(), type: 'start', name: 'PlayerStart', x: 3 * T, y: (rows - 2) * T }], bg: 'sky',
    zones: [{ id: uid(), kind: 'door', name: 'finish', target: 'flow', x: (cols - 4) * T, y: (rows - 8) * T, w: 3 * T, h: 6 * T }] });
  lv.level.tile = T;
  await g.put('level-run', lv);
  await g.put('menus-game', titleMenu('BOT DASH', '#7bd88f'));
  await g.put('flow-game', flow([['t', 'menu', 'Title', 0, { menu: 'title' }], ['r', 'level', 'The run', 240, { level: 'run' }], ['e', 'end', 'Made it', 480, { text: 'Made it! Now make it longer.' }]],
    [['t', 'done', 'r'], ['r', 'finish', 'e']]));
  return { level: 'res://levels/run/run.tscn', player: 'res://sprites/bot/bot.tscn' };
}
