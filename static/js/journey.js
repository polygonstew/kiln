// Your game: how far the game in this asset folder has come, as a short path of steps that follow the game's path
// (a side-scroller: an idea, a hero, its moves, a world, a backdrop, a foe…; a point & click: a room, hotspots, an item…). The top-bar chip shows the count; its panel shows each
// step with a "Do it" that opens the right area. After a save that finishes a step, a small card says so and points
// at the next one, so there is always a clear, inviting next thing to make.
import { h, api, emit, on } from './core.js';
import { S as FS } from './files.js';
import { GAME } from './gametype.js';

// [id, title, why, area, test(state)]: every step any path uses; PATH_STEPS orders them per game path (gametype.js)
const hero = s => s.actors.find(a => a.role === 'hero');
const ALL = [
  ['idea', 'An idea', 'A title and one sentence about your game in the Game doc. Stuck? It has questions, themes and an idea roll.', 'gamedoc', s => s.idea],
  ['hero', 'A hero', 'Someone to play: describe one in Forge, or draw and rig one in Animate.', 'forge', s => !!hero(s)],
  ['moves', 'It moves', 'Walk, jump and attack: Animate → Puppet makes them from one drawing.', 'animate', s => s.actors.some(a => a.role === 'hero' && ['walk', 'jump', 'attack'].every(n => a.anims.includes(n)))],
  ['world', 'A world', 'Paint a level with platforms, ladders and spikes, and put your hero in it.', 'levels', s => s.kinds.level],
  ['backdrop', 'A backdrop', 'Parallax layers behind the level: Scenes builds a whole sky-to-ground world.', 'scenes', s => s.kinds.scene],
  ['foe', 'Something to fight', 'An enemy that patrols: make a creature in Forge, give it the enemy role.', 'forge', s => s.actors.some(a => a.role === 'enemy' || a.role === 'boss' || a.role === 'flyer')],
  ['hud', 'A HUD', 'Health, score and a dialogue box on screen.', 'hud', s => s.kinds.hud],
  ['words', 'Words', 'Someone to talk to: a conversation with choices in Dialogue.', 'dialogue', s => s.kinds.dialogue],
  ['rules', 'Rules', 'What happens when: a Logic graph (a zone gives gold, a key opens a door…).', 'logic', s => s.kinds.graph],
  ['menus', 'Menus', 'A title screen, options and pause.', 'menus', s => s.kinds.menus],
  ['play', 'Play it', 'Build it and play it right here, with keys or a gamepad.', 'stage', s => s.built && !!(s.kinds.level || s.kinds.room || s.flow.length)],
  ['share', 'Share it', 'Export it for the web (itch.io), Windows, Linux or a Mac, ready for other people to play.', 'export', s => s.shared],
  // top-down shooter
  ['td_moves', 'It moves and shoots', 'A walk, and a projectile (Animate → Workshop → Projectiles): WASD moves, the arrows shoot.', 'animate', s => s.actors.some(a => a.role === 'hero' && a.anims.includes('walk') && a.shoots)],
  ['td_rooms', 'Rooms', 'A level of screen-sized rooms (the dotted lines) with walls and doorways between them; the camera moves room by room.', 'levels', s => s.levels.some(l => l.cols >= 60 || l.rows >= 34)],
  ['td_foe', 'Something to shoot', 'An enemy that chases you: make a creature in Forge, give it the enemy role.', 'forge', s => s.actors.some(a => a.role === 'enemy' || a.role === 'flyer')],
  ['td_boss', 'A boss', 'Something big that shoots back: an actor with the Boss role and a projectile.', 'forge', s => s.actors.some(a => a.role === 'boss')],
  // one-screen puzzler
  ['pz_moves', 'It moves', 'Walk and jump: Animate → Puppet makes them from one drawing.', 'animate', s => s.actors.some(a => a.role === 'hero' && ['walk', 'jump'].every(n => a.anims.includes(n)))],
  ['pz_level', 'A puzzle', 'One screen: walls, crates to push (Levels → Things → Crate) and a Door zone to the next level.', 'levels', s => s.levels.some(l => l.crates)],
  ['pz_more', 'Three puzzles', 'Teach, test, twist: each level adds one idea. Each door goes to the next level.', 'levels', s => s.levels.length >= 3],
  ['st_base', 'The base', 'A small platform for the tower to stand on (solid tiles) in a one-screen level; a Door or Event zone named "goal" marks the height to reach.', 'levels', s => s.kinds.level],
  ['st_bricks', 'Bricks', 'The tile your bricks are made of: the level\'s tileset (Forge → Tileset makes one), or Kiln\'s coloured blocks.', 'levels', s => s.levels.some(l => l.ts)],
  // point & click adventure
  ['av_story', 'The story', 'Who, where and why in the Game doc (Story, Characters); Rooms → Script later shows every line in the game.', 'gamedoc', s => s.story],
  ['av_hero', 'A hero who walks', 'Someone to play with a walk: describe one in Forge, then Animate → Puppet makes the walk.', 'forge', s => s.actors.some(a => a.role === 'hero' && a.anims.includes('walk'))],
  ['av_room', 'A room', 'A background picture (Forge or Scenes) and where you can walk, in Rooms.', 'rooms', s => s.rooms.some(r => r.bg && r.walk)],
  ['av_hotspots', 'Things to look at', 'Hotspots: drag a box around a thing in the room and say what the hero thinks of it.', 'rooms', s => s.rooms.some(r => r.hotspots >= 3)],
  ['av_item', 'Something to pick up', 'An item (Rooms → Items) and a hotspot that picks it up.', 'rooms', s => s.rooms.some(r => r.picks)],
  ['av_talk', 'Someone to talk to', 'A conversation with choices in Dialogue, started by a Talk hotspot.', 'dialogue', s => s.kinds.dialogue && s.rooms.some(r => r.talks)],
  ['av_puzzle', 'A puzzle', 'A hotspot that needs an item (a locked door, a hungry dog). Rooms → Flow shows how it all connects.', 'rooms', s => s.rooms.some(r => r.needs)],
  ['av_second', 'Another room', 'A second room and an exit hotspot that goes there.', 'rooms', s => s.rooms.length >= 2 && s.rooms.some(r => r.exits)],
  ['flow', 'The flow', 'The game scene by scene in Flow: intro, title, then what follows what (a shape gets you started).', 'flow', s => s.flow.length >= 3],
  ['tx_pages', 'Pages', 'A conversation with choices in Dialogue: each line a page, each choice a way on. Lines can have pictures.', 'dialogue', s => s.kinds.dialogue],
  ['tx_story', 'Story scenes', 'Story scenes in Flow, one per chapter, and a Check that remembers what the reader did.', 'flow', s => s.flow.includes('story')],
  ['fm_video', 'Videos', 'Your video clips: Flow → a Video scene → Add… turns any video into one Godot plays.', 'flow', s => s.videos > 0],
  ['fm_choice', 'A choice', 'A Choice scene: buttons over a picture or a looping video, maybe against the clock.', 'flow', s => s.flow.includes('choice')],
  ['fm_quick', 'A quick-time moment', 'Press in time or it goes wrong: a Quick-time scene with a hit and a miss.', 'flow', s => s.flow.includes('quick')],
  ['m3_board', 'A board', 'A Match-3 scene in Flow: its size, the score to reach, the moves you get.', 'flow', s => s.flow.includes('match3')],
  ['m3_pieces', 'Pieces', 'Six pictures for the pieces (Flow → the board → Pieces), from a sheet or one by one.', 'flow', s => s.flow.includes('match3')],
  ['cd_cards', 'Cards', 'Your deck in the Cards area: what each card costs and does, and a picture.', 'cards', s => s.kinds.cards],
  ['cd_fight', 'A fight', 'A Card battle scene in Flow: an enemy, its health and what it does each turn.', 'flow', s => s.flow.includes('cards')],
  ['vn_scene', 'A scene', 'A Talk scene in Flow with a background and a character on the right.', 'flow', s => s.flow.includes('talk')],
  ['rn_level', 'A long run', 'A long level with gaps and steps, and a Door zone going to "Next in the game Flow" at the end.', 'levels', s => s.levels.some(l => l.cols >= 100)],
  ['av_sound', 'Sound', 'Music for a room and a sound when something is used (Rooms), voice lines in Dialogue.', 'rooms', s => s.rooms.some(r => r.sound)],
];
const PATH_STEPS = {
  scroller: ['idea', 'hero', 'moves', 'world', 'backdrop', 'foe', 'hud', 'words', 'rules', 'menus', 'play', 'share'],
  topdown: ['idea', 'hero', 'td_moves', 'td_rooms', 'td_foe', 'td_boss', 'hud', 'rules', 'menus', 'play', 'share'],
  push: ['idea', 'hero', 'pz_moves', 'pz_level', 'pz_more', 'backdrop', 'menus', 'play', 'share'],
  stack: ['idea', 'st_base', 'st_bricks', 'backdrop', 'hud', 'menus', 'play', 'share'],
  adventure: ['idea', 'av_story', 'av_hero', 'av_room', 'av_hotspots', 'av_item', 'av_talk', 'av_puzzle', 'av_second', 'av_sound', 'flow', 'menus', 'play', 'share'],
  text: ['idea', 'av_story', 'tx_pages', 'tx_story', 'flow', 'menus', 'play', 'share'],
  fmv: ['idea', 'av_story', 'fm_video', 'flow', 'fm_choice', 'fm_quick', 'menus', 'play', 'share'],
  match3: ['idea', 'm3_board', 'm3_pieces', 'flow', 'menus', 'play', 'share'],
  cards: ['idea', 'cd_cards', 'cd_fight', 'flow', 'menus', 'play', 'share'],
  vn: ['idea', 'av_story', 'tx_pages', 'vn_scene', 'flow', 'menus', 'play', 'share'],
  runner: ['idea', 'hero', 'rn_level', 'backdrop', 'flow', 'menus', 'play', 'share'],
  wild: ['idea', 'hero', 'moves', 'world', 'backdrop', 'foe', 'hud', 'words', 'rules', 'menus', 'play', 'share'],
};
const stepsNow = () => PATH_STEPS[GAME.path === 'puzzle' ? GAME.puzzle : GAME.path].map(id => ALL.find(s => s[0] === id));
let STEPS = stepsNow();
// "Do it": the area, or the Export game dialog
const go = area => area === 'export' ? import('./release.js').then(m => m.openRelease()) : emit('tab', area);
let state = null, done = new Set(), chip = null, first = true;

async function look() {
  const projects = await api('/api/projects').catch(() => []);
  const kinds = {}; for (const p of projects) kinds[p.kind] = true;
  const actors = [];
  for (const p of projects.filter(p => p.kind === 'actor')) {
    const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.ok ? r.json() : null).catch(() => null);
    if (d?.actor) actors.push({ name: d.actor.name, role: d.actor.role || (d.actor.kind === 'creature' ? 'enemy' : 'hero'), anims: (d.actor.anims || []).map(n => n.name), shoots: !!(d.actor.projectiles || []).length });
  }
  // levels and rooms: just the counts the steps ask about
  const get = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);
  const levels = [], rooms = [];
  for (const p of projects.filter(p => p.kind === 'level')) { const L = (await get(p.id))?.level; if (L) levels.push({ cols: L.cols, rows: L.rows, ts: !!L.ts, crates: (L.ents || []).some(e => e.type === 'crate') }); }
  for (const p of projects.filter(p => p.kind === 'room')) {
    const R = (await get(p.id))?.room; if (!R) continue;
    const hs = R.hotspots || [];
    rooms.push({ bg: !!R.bg, walk: (R.walk || []).length >= 3, hotspots: hs.length, picks: hs.some(q => q.does === 'pick' && q.item), talks: hs.some(q => q.does === 'talk' && q.dialogue),
      needs: hs.some(q => q.needs), exits: hs.some(q => q.does === 'go' && q.room), sound: !!R.music || hs.some(q => q.sound) });
  }
  const built = !!(await api('/api/play/status').catch(() => ({}))).built;
  const gd = await fetch('/api/project?id=gamedoc-game').then(r => r.ok ? r.json() : null).catch(() => null);
  const idea = !!(gd?.doc?.v?.['pitch.title']?.trim() && gd.doc.v['pitch.logline']?.trim());
  const story = String(gd?.doc?.v?.['story.premise'] || '').trim().length > 40;
  const flow = ((await fetch('/api/project?id=flow-game').then(r => r.ok ? r.json() : null).catch(() => null))?.flow?.nodes || []).map(n => n.kind);
  const videos = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/videos')).catch(() => ({ items: [] }))).items || []).filter(i => /\.ogv$/.test(i.name)).length;
  const shared = !!((await api('/api/release/status').catch(() => ({}))).releases || []).length;
  return { kinds, actors, levels, rooms, built, shared, idea, story, flow, videos, empty: !projects.some(p => !['style', 'game'].includes(p.kind)) };
}
async function refresh(saved) {
  state = await look();
  STEPS = stepsNow();
  const now = new Set(STEPS.filter(s => s[4](state)).map(s => s[0]));
  const fresh = saved && [...now].filter(id => !done.has(id));
  done = now;
  chip.textContent = `Your game ${now.size}/${STEPS.length}`;
  chip.classList.toggle('go', now.size < STEPS.length && now.size > 0);
  if (fresh?.length) nudge(STEPS.find(s => s[0] === fresh[0]));
  if (first && state.empty) import('./helper.js').then(m => m.helloOnce(FS.root));     // Gloop asks once, no big window
  first = false;
}
const next = () => STEPS.find(s => !done.has(s[0]));
// for Gloop (helper.js): the steps panel, the next step, doing it
export const openSteps = () => refresh(false).then(() => openPath());
export const nextStep = () => refresh(false).then(next);
export const doStep = s => go(s[3]);

// the panel: every step, the done ones ticked, the next one lit with its "Do it"
function openPath() {
  document.querySelector('.jr-panel')?.remove();
  const n = next();
  const p = h('div', { class: 'jr-panel' },
    h('div', { class: 'jr-head' }, h('b', {}, 'Your game'), h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Close', onclick: () => p.remove() }, '✕')),
    h('p', { class: 'note' }, `${STEPS.length} small steps from an idea to a game other people can play. Each opens the right place; nothing is locked or in order.`),
    h('div', { class: 'jr-steps' }, ...STEPS.map(([id, title, why, area], i) => h('div', { class: 'jr-step' + (done.has(id) ? ' done' : n?.[0] === id ? ' next' : '') },
      h('i', {}, done.has(id) ? '✓' : String(i + 1)), h('div', { class: 'jr-t' }, h('b', {}, title), h('small', {}, why)),
      done.has(id) ? '' : h('button', { class: 'btn sm' + (n?.[0] === id ? ' go' : ' ghost'), title: 'Open ' + area, onclick: () => { p.remove(); go(area); } }, 'Do it')))),
    h('p', { class: 'note' }, 'Want to see it all working first? ', h('a', { href: '#', onclick: e => { e.preventDefault(); p.remove(); import('./demo.js').then(m => m.makeDemo({ ...GAME })); } }, 'Start from a template'), ': a small complete game of this kind to look inside and change.'));
  document.body.append(p);
  // a click anywhere else closes it (it never stands in the way)
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!p.contains(e.target) && e.target.id !== 'journey') { p.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
}
// after a save that finished a step: well done, and what could come next
function nudge(step) {
  document.querySelector('.jr-nudge')?.remove();
  const n = next();
  const card = h('div', { class: 'jr-nudge' }, h('b', {}, `✓ ${step[1]}`), n ? h('span', {}, ` Next: ${n[1].toLowerCase()}. `) : h('span', {}, ' Every step done: it is a game.'),
    n ? h('button', { class: 'btn sm go', onclick: () => { card.remove(); go(n[3]); } }, 'Go') : '', h('button', { class: 'ibtn', title: 'Close', onclick: () => card.remove() }, '✕'));
  document.body.append(card);
  setTimeout(() => card.remove(), 12000);
}

export function initJourney() {
  chip = h('button', { id: 'journey', class: 'btn sm ghost', title: 'How far your game has come, and what to make next', onclick: async () => { await refresh(false); openPath(); } }, 'Your game');
  document.querySelector('#stylechip')?.before(chip);
  let t = 0; on('saved', () => { clearTimeout(t); t = setTimeout(() => refresh(true), 1500); });
  on('root', () => { first = true; refresh(false); });
  on('path', () => { STEPS = stepsNow(); if (state) refresh(false); });
  refresh(false);
}
