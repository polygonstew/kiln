// Your game: how far the game in this asset folder has come, as a short path of steps (an idea, a hero, its moves, a world,
// a backdrop, a foe, a HUD, words, rules, menus, playing it, sharing it). The top-bar chip shows the count; its panel shows each
// step with a "Do it" that opens the right area. After a save that finishes a step, a small card says so and points
// at the next one, so there is always a clear, inviting next thing to make.
import { h, api, emit, on } from './core.js';
import { S as FS } from './files.js';

// [id, title, why, area, test(state)]
const STEPS = [
  ['idea', 'An idea', 'A title and one sentence about your game in the Game doc. Stuck? It has questions, themes and an idea roll.', 'gamedoc', s => s.idea],
  ['hero', 'A hero', 'Someone to play: describe one in Forge, or draw and rig one in Animate.', 'forge', s => s.actors.some(a => a.role === 'hero')],
  ['moves', 'It moves', 'Walk, jump and attack: Animate → Puppet makes them from one drawing.', 'animate', s => s.actors.some(a => a.role === 'hero' && ['walk', 'jump', 'attack'].every(n => a.anims.includes(n)))],
  ['world', 'A world', 'Paint a level with platforms, ladders and spikes, and put your hero in it.', 'levels', s => s.kinds.level],
  ['backdrop', 'A backdrop', 'Parallax layers behind the level: Scenes builds a whole sky-to-ground world.', 'scenes', s => s.kinds.scene],
  ['foe', 'Something to fight', 'An enemy that patrols: make a creature in Forge, give it the enemy role.', 'forge', s => s.actors.some(a => a.role === 'enemy' || a.role === 'boss' || a.role === 'flyer')],
  ['hud', 'A HUD', 'Health, score and a dialogue box on screen.', 'hud', s => s.kinds.hud],
  ['words', 'Words', 'Someone to talk to: a conversation with choices in Dialogue.', 'dialogue', s => s.kinds.dialogue],
  ['rules', 'Rules', 'What happens when: a Logic graph (a zone gives gold, a key opens a door…).', 'logic', s => s.kinds.graph],
  ['menus', 'Menus', 'A title screen, options and pause.', 'menus', s => s.kinds.menus],
  ['play', 'Play it', 'Build it and play it right here, with keys or a gamepad.', 'stage', s => s.built && !!s.kinds.level],
  ['share', 'Share it', 'Export it for the web (itch.io), Windows, Linux or a Mac, ready for other people to play.', 'export', s => s.shared],
];
// "Do it": the area, or the Export game dialog
const go = area => area === 'export' ? import('./release.js').then(m => m.openRelease()) : emit('tab', area);
let state = null, done = new Set(), chip = null, first = true;

async function look() {
  const projects = await api('/api/projects').catch(() => []);
  const kinds = {}; for (const p of projects) kinds[p.kind] = true;
  const actors = [];
  for (const p of projects.filter(p => p.kind === 'actor')) {
    const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.ok ? r.json() : null).catch(() => null);
    if (d?.actor) actors.push({ name: d.actor.name, role: d.actor.role || (d.actor.kind === 'creature' ? 'enemy' : 'hero'), anims: (d.actor.anims || []).map(n => n.name) });
  }
  const built = !!(await api('/api/play/status').catch(() => ({}))).built;
  const gd = await fetch('/api/project?id=gamedoc-game').then(r => r.ok ? r.json() : null).catch(() => null);
  const idea = !!(gd?.doc?.v?.['pitch.title']?.trim() && gd.doc.v['pitch.logline']?.trim());
  const shared = !!((await api('/api/release/status').catch(() => ({}))).releases || []).length;
  return { kinds, actors, built, shared, idea, empty: !projects.some(p => p.kind !== 'style') };
}
async function refresh(saved) {
  state = await look();
  const now = new Set(STEPS.filter(s => s[4](state)).map(s => s[0]));
  const fresh = saved && [...now].filter(id => !done.has(id));
  done = now;
  chip.textContent = `Your game ${now.size}/${STEPS.length}`;
  chip.classList.toggle('go', now.size < STEPS.length && now.size > 0);
  if (fresh?.length) nudge(STEPS.find(s => s[0] === fresh[0]));
  if (first && state.empty) openPath(true);
  first = false;
}
const next = () => STEPS.find(s => !done.has(s[0]));

// the panel: every step, the done ones ticked, the next one lit with its "Do it"
function openPath(welcome) {
  document.querySelector('.jr-panel')?.remove();
  const n = next();
  const p = h('div', { class: 'jr-panel' },
    h('div', { class: 'jr-head' }, h('b', {}, welcome ? 'Let\'s make a game' : 'Your game'), h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Close', onclick: () => p.remove() }, '✕')),
    welcome ? h('p', { class: 'note' }, 'Twelve small steps from an idea to a game other people can play, with a gamepad. Each opens the right place; nothing here is locked or in order.') : '',
    h('div', { class: 'jr-steps' }, ...STEPS.map(([id, title, why, area], i) => h('div', { class: 'jr-step' + (done.has(id) ? ' done' : n?.[0] === id ? ' next' : '') },
      h('i', {}, done.has(id) ? '✓' : String(i + 1)), h('div', { class: 'jr-t' }, h('b', {}, title), h('small', {}, why)),
      done.has(id) ? '' : h('button', { class: 'btn sm' + (n?.[0] === id ? ' go' : ' ghost'), title: 'Open ' + area, onclick: () => { p.remove(); go(area); } }, 'Do it')))),
    h('p', { class: 'note' }, 'Want to see it all working first? ', h('a', { href: '#', onclick: e => { e.preventDefault(); p.remove(); import('./demo.js').then(m => m.makeDemo()); } }, 'Make the demo game'), ' and look inside each area.'));
  document.body.append(p);
  // a click anywhere else closes it (it never stands in the way)
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!p.contains(e.target) && e.target.id !== 'journey') { p.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
}
// after a save that finished a step: well done, and what could come next
function nudge(step) {
  document.querySelector('.jr-nudge')?.remove();
  const n = next();
  const card = h('div', { class: 'jr-nudge' }, h('b', {}, `✓ ${step[1]}!`), n ? h('span', {}, ` Next: ${n[1].toLowerCase()}. `) : h('span', {}, ' Every step done: it is a game.'),
    n ? h('button', { class: 'btn sm go', onclick: () => { card.remove(); go(n[3]); } }, 'Go') : '', h('button', { class: 'ibtn', title: 'Close', onclick: () => card.remove() }, '✕'));
  document.body.append(card);
  setTimeout(() => card.remove(), 12000);
}

export function initJourney() {
  chip = h('button', { id: 'journey', class: 'btn sm ghost', title: 'How far your game has come, and what to make next', onclick: async () => { await refresh(false); openPath(false); } }, 'Your game');
  document.querySelector('#playbtn')?.after(chip);
  let t = 0; on('saved', () => { clearTimeout(t); t = setTimeout(() => refresh(true), 1500); });
  on('root', () => { first = true; refresh(false); });
  refresh(false);
}
