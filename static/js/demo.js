// The demo game: one click makes a small, complete game in a new asset folder (yours stays as it is), using every
// area of Kiln the way you would: a hero drawn and rigged in Puppet (idle, walk, run, jump, attack, hurt, death), a
// slime enemy, an old miner to talk to, a parallax night wood, a two-screen level (platforms, a ladder, spikes, zones),
// a HUD with a dialogue box, menus, a conversation with a choice, a Logic graph tying it together, and a coin sound.
// Everything is written as Kiln projects, saved for Godot by each area (saveall.js), then played in the Stage.
// The other game paths have their own demos (demo_paths.js), made from the same pieces exported here.
import { h, api, toast, emit, pref, uid, newImg, toDataURL, outline } from './core.js';
import { S as FS, loadSettings } from './files.js';
import { autoRig, prepare, render, motion, PRESETS as MOTIONS } from './rig.js';
import { guessHits } from './actor_tools.js';
import { GENS, PRESETS as SCENES } from './procgen.js';
import { DEFAULTS as MENU_DEFAULTS } from './menus.js';
import { starterHud } from './hud.js';
import { PRESETS as SOUNDS, synth, wav } from './sfx.js';
import { saveAll } from './saveall.js';
import { buildKey } from './playbuild.js';
import { setPath } from './gametype.js';
import { restart } from './games.js';

/* ------------------------------------------------------------- drawing ---- */
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const HERO = { skin: '#e8b796', hair: '#6b3d1f', tunic: '#3f6fb5', dark: '#2c4f86', belt: '#7a5230', legs: '#4a4a58', boots: '#2e2620', blade: '#cfd3dc', line: '#1b1420' };
export const MINER = { ...HERO, hair: '#a8a8a8', tunic: '#7a5a3a', dark: '#5a412a', legs: '#3e3a36', blade: '#00000000' };
// a side-view figure, 32×32, facing right, feet on the bottom row: rect by rect, then an outline
export function figure(c) {
  const im = newImg(32, 32), px = (x, y, w, hh, col) => { if (col.length > 7) return; const v = hex(col); for (let j = y; j < y + hh; j++) for (let i = x; i < x + w; i++) im.data.set([...v, 255], (j * 32 + i) * 4); };
  px(12, 4, 8, 8, c.skin); px(11, 3, 9, 3, c.hair); px(11, 6, 3, 4, c.hair); px(18, 8, 1, 1, c.line);     // head, hair, eye
  px(10, 12, 3, 9, c.dark);                                                                            // back arm
  px(12, 12, 9, 10, c.tunic); px(12, 19, 9, 2, c.belt);                                               // body, belt
  px(12, 22, 3, 7, c.legs); px(17, 22, 3, 7, c.legs); px(11, 29, 5, 3, c.boots); px(16, 29, 6, 3, c.boots);
  px(20, 12, 3, 9, c.tunic); px(20, 20, 3, 2, c.skin);                                                 // front arm, hand
  px(22, 10, 1, 11, c.blade);                                                                          // a sword held up
  return outline(im, hex(c.line));
}
// a slime: a squashable blob with eyes; k = how squashed (0..1)
export function slime(k = 0, white = false) {
  const im = newImg(20, 16), w = 16 + k * 4, hh = 12 - k * 4, cx = 10, base = 15, body = white ? [255, 255, 255] : [86, 186, 92], shade = white ? [230, 230, 230] : [52, 128, 60];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 20; x++) {
    const dx = (x + .5 - cx) / (w / 2), dy = (y + .5 - (base - hh / 2)) / (hh / 2);
    if (dx * dx + dy * dy <= 1) im.data.set([...(dy > .3 ? shade : body), 255], (y * 20 + x) * 4);
  }
  for (const ex of [cx + 1, cx + 4]) im.data.set([20, 30, 20, 255], ((base - Math.round(hh * .6)) * 20 + ex) * 4);
  return outline(im, [22, 40, 24]);
}

/* ------------------------------------------------------------- actors ---- */
// frames as Kiln saves them in a project (data URLs, hit boxes beside them)
export const anim = (name, frames, fps, loop, span = 1) => ({ name, fps, loop, span, frames });
export const project = a => ({ meta: { kind: 'actor', name: a.name, thumb: toDataURL(a.anims[0].frames[0]) },
  actor: { ...a, anims: a.anims.map(n => ({ ...n, frames: n.frames.map(f => toDataURL(f)), boxes: n.frames.map(f => f.boxes || null) })) } });
// the hero: drawn once, rigged with Puppet's bones, every motion made from the rig
export function hero(name, colours, role, withMotions) {
  const base = figure(colours), rig = autoRig(base), P = prepare(base, rig, rig.parts, true);
  const anims = [];
  for (const k of withMotions) {
    const M = MOTIONS[k], span = M.span || 1;
    anims.push(anim(k, motion(rig, k, 1).map(pose => render(P, rig, pose, 32 * span, 32)), M.fps, M.loop, span));
  }
  const a = { id: uid(), name, w: 32, h: 32, desc: role === 'hero' ? 'A hooded adventurer with a short sword' : 'An old miner', role, pal: [], anims,
    react: { knockback: 90, iframes: .8, health: role === 'hero' ? 5 : 99 } };
  const atk = a.anims.find(n => n.name === 'attack'); if (atk) guessHits(a, atk);   // the sword swings hurt what they touch
  if (role === 'hero') a.sounds = { jump: SOUNDS.jump(), attack: SOUNDS.shoot(), hurt: SOUNDS.hurt(), die: SOUNDS.die() };
  return project(a);
}
export function slimeActor() {
  const a = { id: uid(), name: 'slime', w: 20, h: 16, desc: 'A green slime that patrols', role: 'enemy', brain: 'patrol', brainParams: { speed: 22, turn_at_ledges: 1 }, pal: [],
    react: { knockback: 120, iframes: .3, health: 2 }, sounds: { hurt: SOUNDS.hit(), die: SOUNDS.explosion() },
    anims: [anim('idle', [slime(0), slime(.25)], 4, true), anim('walk', [slime(0), slime(.3), slime(.6), slime(.3)], 8, true),
      anim('hurt', [slime(.5, true), slime(.2)], 10, false), anim('death', [slime(.6), slime(.85), slime(1)], 10, false)] };
  return project(a);
}

/* --------------------------------------------------------- the world ---- */
export function scene(name) {
  const layers = SCENES.wood.layers.map(([g, params]) => {
    const G = GENS[g], p = { ...Object.fromEntries(G.params.map(q => [q[0], q[2]])), ...params };
    if (p.seed !== undefined && params.seed === undefined) p.seed = 7;
    return { id: uid(), name: G.name.toLowerCase().replace(/\s+/g, '_'), kind: 'gen', gen: g, params: p, w: g === 'sky' ? 480 : 960, h: 270, y: 0, scroll: G.scroll, repeat: true, visible: true, key: false, tol: 30 };
  });
  return { meta: { kind: 'scene', name }, scene: { id: uid(), name, view: { w: 480, h: 270 }, look: 'paint', haze: '#2a3550', hazeAmt: .35, tod: -.3, layers } };
}
// two screens of platforming on Kiln's starter tiles: 0 stone, 2 grass, 3 dirt, 4 planks (one-way), 6 spikes, 7 ladder
function level(name, bg) {
  const cols = 60, rows = 17, cells = Array(cols * rows).fill(-1), set = (x, y, t) => { if (x >= 0 && y >= 0 && x < cols && y < rows) cells[y * cols + x] = t; };
  for (let x = 0; x < cols; x++) { set(x, 14, 2); set(x, 15, 3); set(x, 16, 3); }
  for (let y = 0; y < 14; y++) { set(0, y, 0); set(cols - 1, y, 0); }
  for (let x = 30; x <= 32; x++) { set(x, 14, -1); set(x, 15, -1); set(x, 16, 6); }        // a spike pit
  for (let x = 12; x <= 16; x++) set(x, 12, 4);                                          // planks to hop on (a jump is 40 px)
  for (let x = 20; x <= 24; x++) set(x, 10, 4);
  for (let x = 40; x <= 47; x++) set(x, 7, 0);                                           // the high ledge
  for (let y = 6; y <= 13; y++) set(39, y, 7);                                           // its ladder, one rung above the ledge to step off
  const T = 16, at = (cx, cy) => ({ x: cx * T + T / 2, y: (cy + 1) * T });
  const ents = [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(3, 13) }, { id: uid(), type: 'actor', name: 'old_miner', ...at(8, 13) },
    { id: uid(), type: 'actor', name: 'slime', ...at(20, 13) }, { id: uid(), type: 'actor', name: 'slime', ...at(50, 13) }];
  const zones = [{ id: uid(), kind: 'event', name: 'miner', x: 6 * T, y: 11 * T, w: 5 * T, h: 3 * T, once: true },
    { id: uid(), kind: 'checkpoint', name: 'after_pit', x: 34 * T, y: 11 * T, w: 2 * T, h: 3 * T },
    { id: uid(), kind: 'event', name: 'treasure', x: 44 * T, y: 4 * T, w: 3 * T, h: 3 * T, once: true }];
  return { meta: { kind: 'level', name }, level: { id: uid(), name, tile: T, cols, rows, ts: null, tsCols: 8, solid: [0, 1, 2, 3, 5],
    kinds: { 0: 'solid', 1: 'solid', 2: 'solid', 3: 'solid', 5: 'solid', 4: 'oneway', 6: 'hazard', 7: 'ladder' }, cells, pick: 2, grid: true, ents, zones, bg } };
}
const dialogue = () => ({ meta: { kind: 'dialogue', name: 'old_miner' }, dialogue: { name: 'old_miner', cast: [{ name: 'Old Miner', actor: 'old_miner' }],
  beats: [{ id: 'b1', who: 'Old Miner', text: 'Careful, young one. These woods eat the careless.', next: '', choices: [], do: [] },
    { id: 'b2', who: 'Old Miner', text: 'What brings you down here?', voice: '', next: '', do: [],
      choices: [{ text: 'I am looking for treasure.', next: 'b3', do: [{ k: 'flag', v: 'helped' }] }, { text: 'Just passing through.', next: 'b4', do: [] }] },
    { id: 'b3', who: 'Old Miner', text: 'Then climb the ladder past the spike pit. My old gold is up on the ledge. Take this lamp.', next: 'end', choices: [], do: [{ k: 'give', v: 'lamp' }] },
    { id: 'b4', who: 'Old Miner', text: 'Mind the slimes, then.', next: 'end', choices: [], do: [] }] } });
function graph() {
  const N = (id, type, x, y, f = {}) => ({ id, type, x, y, f }), W = (a, b, c, d) => ({ from: [a, b], to: [c, d] });
  return { meta: { kind: 'graph', name: 'demo' }, graph: { vars: [{ name: 'score', type: 'int', value: '0' }], view: { x: 40, y: 40, z: .8 },
    nodes: [N('n1', 'start', 0, 0), N('n2', 'wait', 260, 0, { secs: 1 }), N('n3', 'say', 500, 0, { who: '', line: 'Arrows or stick move, Space or A jumps, X attacks. Talk to the old miner.' }),
      N('n4', 'zone', 0, 200, { zone: 'miner' }), N('n5', 'talk', 300, 200, { dlg: 'dialogue/old_miner.json' }),
      N('n6', 'zone', 0, 380, { zone: 'treasure' }), N('n7', 'add', 300, 380, { var: 'score', v: 100 }), N('n8', 'counter', 560, 380, { widget: 'score' }),
      N('n9', 'get', 300, 540, { var: 'score' }), N('n10', 'sound', 820, 380, { file: 'sfx/coin.wav' }), N('n11', 'say', 1060, 380, { who: '', line: 'You found the old gold!' }),
      N('n12', 'talked', 0, 680, { dlg: 'dialogue/old_miner.json' }), N('n13', 'if', 300, 680), N('n14', 'flag', 40, 820, { name: 'helped' }), N('n15', 'say', 560, 680, { who: 'Old Miner', line: 'Good luck up there.' })],
    wires: [W('n1', 'then', 'n2', 'in'), W('n2', 'then', 'n3', 'in'), W('n4', 'then', 'n5', 'in'), W('n6', 'then', 'n7', 'in'), W('n7', 'then', 'n8', 'in'), W('n9', 'v', 'n8', 'v'),
      W('n8', 'then', 'n10', 'in'), W('n10', 'then', 'n11', 'in'), W('n12', 'then', 'n13', 'in'), W('n14', 'v', 'n13', 'cond'), W('n13', 'yes', 'n15', 'in')] } };
}

/* ------------------------------------------------------------ making it ---- */
// pick: the game path (gametype.js) the demo shows; the other paths have their own demos (demo_paths.js)
export async function makeDemo(pick = { path: 'scroller' }) {
  if (!['scroller', 'wild'].includes(pick.path)) return import('./demo_paths.js').then(m => m.makePathDemo(pick));
  const name = (prompt('Name for the new game, from the side-scroller template (a new game folder; yours stays as it is)', 'my_platformer') || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!name) return;
  const path = FS.settings.games + '/' + name;
  const there = await api('/api/fs?path=' + encodeURIComponent(path + '/kiln')).catch(() => ({ items: [] }));
  if ((there.items || []).length && !confirm(`${name} already has Kiln projects. Make the template there anyway (same names are replaced)?`)) return;
  const log = h('div', { class: 'play-log', style: { maxHeight: '300px' } }), step = t => { log.append(h('div', {}, t)); log.scrollTop = 1e9; };
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(560px, 94vw)' } }, h('header', {}, h('span', { class: 'grow' }, 'Making the game from the template')),
    h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Every area takes its turn: watch the tabs. It takes about a minute.'), log)));
  document.body.append(m);
  await api('/api/fs', { op: 'root', path, scaffold: true }); await loadSettings();
  await setPath(pick.path === 'wild' ? 'wild' : 'scroller');
  const put = (id, data) => api('/api/project', { id, data });
  step('Drawing and rigging the hero (Puppet: idle, walk, run, jump, attack, hurt, death)…');
  await put('actor-hero', hero('hero', HERO, 'hero', ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death']));
  await put('actor-old_miner', hero('old_miner', MINER, 'npc', ['idle']));
  await put('actor-slime', slimeActor());
  step('A night wood, a level, a HUD, menus, a conversation and the logic…');
  await put('scene-night_wood', scene('night_wood'));
  await put('level-demo', level('demo', 'night_wood'));
  const hud = starterHud('hud', ['dialogue']);
  for (const w of hud.widgets) { if (w.type === 'counter') w.num = 0; if (w.type === 'dialogue') { w.y = 44; w.speaker = ''; w.text = ''; } }   // score from 0; talk above the ground
  await put('hud-hud', { meta: { kind: 'hud', name: 'hud' }, hud });
  const menus = MENU_DEFAULTS(); menus.title.title = 'DEMO QUEST'; menus.title.background = 'night_wood';
  await put('menus-game', { meta: { kind: 'menus', name: 'game' }, menus });
  await put('dialogue-old_miner', dialogue());
  await put('graph-demo', graph());
  await api('/api/export', { dest: 'sfx', files: [{ name: 'coin.wav', b64: wav(synth(SOUNDS.coin())) }] });
  step('Every area saves its part for Godot:');
  const r = await saveAll(t => step('  ' + t));
  if (r.failed.length) step('Some parts failed: ' + r.failed.join('; '));
  pref.set(buildKey(), { level: 'res://levels/demo/demo.tscn', player: 'res://sprites/hero/hero.tscn', hud: 'res://hud/hud/hud.tscn', start: 'menu' });
  step('Done. Building it in the Stage…');
  sessionStorage.setItem('kiln.play', '1');
  setTimeout(() => restart('Your game from the template is ready: open any area to see how its part was made', 'stage'), 900);
}
