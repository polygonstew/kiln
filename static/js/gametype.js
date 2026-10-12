// Game paths: what kind of game this asset folder is. File → New game asks; File → Kind of game changes it. A path
// picks what each role does (its brain), how the camera moves, how big a new level is, the "Your game" steps, which
// areas show and Kiln's accent colour. A folder with no path is the Wild card: every tool and area, as before.
// Paths: side-scroller, top-down shooter, one-screen puzzler (push or stack), point & click adventure, text adventure,
// interactive movie (FMV), match-3, card battler, visual novel, endless runner, wild card.
// Saved as the project kiln/game-path.json: { path, puzzle }.
import { h, api, emit, on, toast } from './core.js';

// tint: [accent, lighter, dark background] (null = Kiln's own ember); level: [cols, rows] of a new level;
// camera: follow (scrolls with the player), rooms (snaps screen by screen), fixed (one screen);
// tabs: the path's own top bar, [area id, name it goes by on this path] (topbar.js puts every other area under More)
const ACTION_TABS = [['gamedoc', 'Doc'], ['flow', 'Flow'], ['forge', 'Forge'], ['animate', 'Animate'], ['scenes', 'Scenes'], ['levels', 'Levels'], ['hud', 'HUD'], ['dialogue', 'Dialogue'], ['logic', 'Logic'], ['menus', 'Menus'], ['stage', 'Stage']];
export const PATHS = {
  scroller: { label: '2D side-scroller', like: 'Mario, Contra, Celeste', what: 'Run, jump and fight across wide levels.', tint: ['#f29a3a', '#ffbb6e', '#3a2610'],
    brains: { hero: 'player', enemy: 'patrol', flyer: 'flyer', boss: 'patrol' }, camera: 'follow', level: [60, 17], tabs: ACTION_TABS },
  topdown: { label: '2D top-down shooter', like: 'The Binding of Isaac, Enter the Gungeon', what: 'Rooms seen from above: move with WASD or the left stick, shoot with the arrows or the right stick.', tint: ['#ff4f6d', '#ff8a9c', '#3a121b'],
    brains: { hero: 'topdown', enemy: 'chaser', flyer: 'flyer', boss: 'turret' }, camera: 'rooms', level: [60, 34], tabs: ACTION_TABS },
  puzzle: { label: 'One-screen puzzler', like: 'Tricky Towers, Unit 404, Baba Is You', what: 'Every level fits on one screen: work out how to reach the goal.', tint: ['#36c3ae', '#79dccc', '#0f302b'],
    brains: { hero: 'player', enemy: 'patrol', flyer: 'flyer', boss: 'patrol' }, camera: 'fixed', level: [30, 17],
    tabs: [['gamedoc', 'Doc'], ['flow', 'Flow'], ['forge', 'Forge'], ['animate', 'Animate'], ['levels', 'Levels'], ['scenes', 'Scenes'], ['hud', 'HUD'], ['menus', 'Menus'], ['stage', 'Stage']] },
  adventure: { label: 'Point & click adventure', like: 'Monkey Island, Broken Sword, Thimbleweed Park', what: 'Click to walk, look, pick things up, use them and talk your way from room to room.', tint: ['#b48cff', '#cfb6ff', '#251a3a'],
    brains: { hero: 'walker', enemy: '', flyer: '', boss: '' }, camera: 'follow', level: [30, 17],
    tabs: [['gamedoc', 'Story'], ['flow', 'Flow'], ['rooms', 'Rooms'], ['animate', 'Characters'], ['forge', 'Art'], ['dialogue', 'Talk'], ['menus', 'Menus'], ['stage', 'Play test']] },
  text: { label: 'Text adventure', like: 'Zork, Choose Your Own Adventure, 80 Days', what: 'Pages of words and pictures: the reader chooses (or types) what to do next. Written in Dialogue.', tint: ['#d9bf6a', '#ead79a', '#302812'],
    brains: { hero: '', enemy: '', flyer: '', boss: '' }, camera: 'fixed', level: [30, 17],
    tabs: [['gamedoc', 'Story'], ['flow', 'Flow'], ['dialogue', 'Pages'], ['forge', 'Pictures'], ['menus', 'Menus'], ['stage', 'Read it']] },
  fmv: { label: 'Interactive movie', like: 'Dragon\'s Lair, Night Trap, The Adventures of Willy Beamish', what: 'Video scenes joined by choices and split-second moves, on a flow from intro to ending (FMV).', tint: ['#5aa8ff', '#93c6ff', '#10223a'],
    brains: { hero: 'walker', enemy: '', flyer: '', boss: '' }, camera: 'fixed', level: [30, 17],
    tabs: [['gamedoc', 'Story'], ['flow', 'Flow'], ['dialogue', 'Talk'], ['rooms', 'Rooms'], ['forge', 'Art'], ['menus', 'Menus'], ['stage', 'Watch it']] },
  match3: { label: 'Match-3 puzzler', like: 'Candy Crush, Bejeweled', what: 'Swap pieces to line up three of a kind; the Flow chains boards from easy to hard.', tint: ['#ff5d9e', '#ff94c0', '#3a1226'],
    brains: { hero: '', enemy: '', flyer: '', boss: '' }, camera: 'fixed', level: [30, 17], tabs: [['gamedoc', 'Doc'], ['flow', 'Flow'], ['forge', 'Pieces'], ['menus', 'Menus'], ['stage', 'Play']] },
  cards: { label: 'Card battler', like: 'Slay the Spire, Inscryption', what: 'Build a deck and fight one enemy after another; the Flow is the road between fights.', tint: ['#e3b04b', '#f0cd7a', '#33270e'],
    brains: { hero: '', enemy: '', flyer: '', boss: '' }, camera: 'fixed', level: [30, 17], tabs: [['gamedoc', 'Doc'], ['flow', 'Flow'], ['cards', 'Cards'], ['forge', 'Art'], ['menus', 'Menus'], ['stage', 'Play']] },
  vn: { label: 'Visual novel', like: 'Phoenix Wright, Doki Doki Literature Club', what: 'Talk scenes over backgrounds with characters, and choices that branch the story.', tint: ['#ff8fb1', '#ffb8cd', '#3a1a24'],
    brains: { hero: '', enemy: '', flyer: '', boss: '' }, camera: 'fixed', level: [30, 17], tabs: [['gamedoc', 'Story'], ['flow', 'Flow'], ['dialogue', 'Script'], ['forge', 'Art'], ['menus', 'Menus'], ['stage', 'Play']] },
  runner: { label: 'Endless runner', like: 'Canabalt, Jetpack Joyride, Geometry Dash', what: 'The hero runs by itself, faster and faster; jump at the right moment.', tint: ['#7bd88f', '#a8e8b5', '#13301b'],
    brains: { hero: 'runner', enemy: 'patrol', flyer: 'flyer', boss: 'patrol' }, camera: 'follow', level: [150, 17], tabs: ACTION_TABS },
  wild: { label: 'Wild card', like: 'anything: mix it all', what: 'No path: every area and every tool, platforms, rooms, puzzles and point & click together.', tint: null,
    brains: { hero: 'player', enemy: 'patrol', flyer: 'flyer', boss: 'patrol' }, camera: 'follow', level: [40, 23], tabs: null },
};
// the two kinds of one-screen puzzle: [label, like]
export const PUZZLES = {
  push: ['Push and reach the exit', 'Unit 404, Sokoban: push crates to climb and block, reach the door'],
  stack: ['Stack the tower', 'Tricky Towers: falling bricks with real physics, stack them up to the line'],
};

// the look: Modern (full colour, smooth, a 1280×720 screen, art at any size) or Pixel (retro: 480×270, sharp pixels,
// Forge pixelizes). Folders from before looks existed are Pixel. LOOKS[look]: the screen and the tile size it likes.
export const LOOKS = {
  modern: { label: 'Modern', what: 'Full colour, smooth, any size of art: painted, drawn or photographed', w: 1280, h: 720, tile: 32 },
  pixel: { label: 'Pixel', what: 'Retro: a small screen of sharp pixels, palettes and hardware limits (NES, SNES, GB…)', w: 480, h: 270, tile: 16 },
};
export const GAME = { path: 'wild', puzzle: 'push', look: 'pixel' };
export const LOOK = () => LOOKS[GAME.look] || LOOKS.pixel;
// the line a scene writer adds to keep a picture's pixels sharp (Pixel look only; Modern lets Godot smooth it)
export const SHARP = () => GAME.look === 'pixel' ? 'texture_filter = 1\n' : '';
export const P = () => PATHS[GAME.path] || PATHS.wild;
// the brain a role gets on this path ('' = stands still); a stacking puzzle has no player to move
export const roleBrain = role => GAME.path === 'puzzle' && GAME.puzzle === 'stack' && role === 'hero' ? '' : (P().brains[role] ?? '');

let seq = 0;
function apply() {
  const t = P().tint, root = document.documentElement;
  for (const [i, v] of ['--ember', '--ember2', '--emberbg'].entries()) t ? root.style.setProperty(v, t[i]) : root.style.removeProperty(v);
  root.dataset.path = GAME.path;
  emit('path', { ...GAME });               // topbar.js redraws the tabs, journey.js the steps
}
async function load() {
  const mine = ++seq;
  const d = await fetch('/api/project?id=game-path').then(r => r.ok ? r.json() : null).catch(() => null);
  if (mine !== seq) return;                 // a newer choice was made meanwhile
  Object.assign(GAME, { path: 'wild', puzzle: 'push', look: 'pixel' }, d?.game || {});
  apply();
}
export async function setPath(path, puzzle = GAME.puzzle, look = GAME.look) {
  seq++;
  Object.assign(GAME, { path, puzzle, look });
  apply();
  await api('/api/project', { id: 'game-path', data: { meta: { kind: 'game', name: 'path' }, game: { ...GAME } } }).catch(e => toast('Could not keep the game path: ' + e.message, 'bad'));
}
on('root', load);

// the cards: one per path, the chosen one lit, the puzzle kinds under the puzzler. onPick(path, puzzle)
export function pathCards(cur, onPick) {
  let pick = { look: 'modern', ...cur };
  const box = h('div', { class: 'gp-wrap' });
  const draw = () => box.replaceChildren(h('div', { class: 'gp-look' }, h('span', { class: 'fl' }, 'Look'), ...Object.entries(LOOKS).map(([k, L]) => h('button', {
    class: 'btn sm' + (pick.look === k ? ' go' : ' ghost'), title: L.what, onclick: () => { pick.look = k; draw(); onPick({ ...pick }); } }, L.label)),
    h('small', {}, LOOKS[pick.look].what)), h('div', { class: 'gp-cards' }, ...Object.entries(PATHS).map(([id, p]) => h('button', {
    class: 'gp-card' + (pick.path === id ? ' on' : ''), 'data-path': id, title: p.what, style: p.tint ? { '--gp': p.tint[0] } : {},
    onclick: () => { pick.path = id; draw(); onPick({ ...pick }); },
  }, h('b', {}, p.label), h('small', {}, p.what), h('i', {}, 'Like ' + p.like),
    id === 'puzzle' && pick.path === 'puzzle' ? h('span', { class: 'gp-sub', onclick: e => e.stopPropagation() }, ...Object.entries(PUZZLES).map(([k, [l, like]]) =>
      h('button', { class: 'btn sm' + (pick.puzzle === k ? ' go' : ' ghost'), title: like, onclick: () => { pick.puzzle = k; draw(); onPick({ ...pick }); } }, l))) : ''))));
  draw();
  return box;
}

// File → Kind of game: change the path of the game open now (nothing is removed; areas and steps follow)
export function choosePath() {
  let pick = { ...GAME };
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(760px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Kind of game'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' },
      h('p', { class: 'note', style: { marginTop: 0 } }, 'The path sets what the player does, how the camera moves, the "Your game" steps and which areas show. Changing it removes nothing; the Wild card shows everything.'),
      pathCards(GAME, p => { pick = p; }),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px' } },
        h('button', { class: 'btn go', onclick: async () => { m.remove(); await setPath(pick.path, pick.puzzle, pick.look); toast(`This game is now a ${PATHS[pick.path].label.toLowerCase()}`, 'ok'); } }, 'Use this path'),
        h('button', { class: 'btn ghost', onclick: () => m.remove() }, 'Cancel')))));
  document.body.append(m);
}
