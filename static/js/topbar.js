// The top bar: the KILN menu, then the game chip (this game's name and path, tinted; its menu switches games and
// paths), then the path's own tabs under the names that path gives them (a point & click has Story, Flow, Rooms,
// Characters…), every other area under "More", and on the right ▶ Play, Your game, the style bible and the job tray.
// The Wild card shows every area as a tab. app.js owns the areas; this only draws the way to them.
import { h, on } from './core.js';
import { S as FS } from './files.js';
import { P } from './gametype.js';

let mods = [], go = () => {}, cur = '';

export function initTop(areas, show) {
  mods = areas; go = show;
  const chip = h('button', { id: 'gamechip', title: 'This game: switch games, change its path, see its folder', onclick: gameMenu });
  document.querySelector('#logo').after(chip);
  on('root', drawChip); on('path', () => { drawChip(); drawTabs(); });
  drawChip(); drawTabs();
}
export function markTab(id) {
  cur = id;
  for (const b of document.querySelectorAll('#tabs [data-id]')) b.classList.toggle('on', b.dataset.id === id);
  const more = document.querySelector('#tabs .tb-more');
  if (more) more.classList.toggle('on', !main().some(([m]) => m === id));
}

const main = () => (P().tabs || mods.map(m => [m.id, m.title])).filter(([id]) => mods.some(m => m.id === id));
function drawChip() {
  const c = document.querySelector('#gamechip'); if (!c) return;
  const p = P();
  c.replaceChildren(h('i', { style: { background: p.tint ? p.tint[0] : 'var(--ember)' } }), h('b', {}, (FS.root || '').split('/').pop() || 'game'), h('small', {}, p.label), h('span', { class: 'caret' }, '▾'));
}
function drawTabs() {
  const tabs = main(), rest = mods.filter(m => !tabs.some(([id]) => id === m.id));
  const tab = (id, label) => { const m = mods.find(x => x.id === id); return h('button', { 'data-id': id, title: m.key ? `${m.title} (key ${m.key})` : m.title, onclick: () => go(id) }, label); };
  document.querySelector('#tabs').replaceChildren(...tabs.map(([id, label]) => tab(id, label)),
    rest.length ? h('button', { class: 'tb-more', title: 'Every other area: still here, just out of the way on this path', onclick: e => moreMenu(e.currentTarget, rest) }, 'More ▾') : '',
    h('button', { class: 'tb-more tb-layout', title: 'This area\'s panels: show or put away, saved layouts, Simple mode', onclick: e => layoutPop(e.currentTarget) }, 'Layout ▾'));
  markTab(cur);
}

function popup(anchor, items) {
  document.querySelector('.tb-pop')?.remove();
  const r = anchor.getBoundingClientRect();
  const pop = h('div', { class: 'tb-pop', style: { left: r.left + 'px', top: r.bottom + 2 + 'px' } }, ...items);
  document.body.append(pop);
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  return pop;
}
const row = (label, hint, run) => h('button', { title: hint, onclick: () => { document.querySelector('.tb-pop')?.remove(); run(); } }, label, hint ? h('small', {}, hint) : '');
// the dock layout of the area on screen (dock.js): panels, saved layouts, Simple mode
function layoutPop(anchor) {
  import('./dock.js').then(D => popup(anchor, D.layoutMenu(cur).map(([label, run]) => run ? row(label, '', run) : h('div', { class: 'tb-sub' }, label))));
}
function moreMenu(anchor, rest) { popup(anchor, rest.map(m => row(m.title, '', () => go(m.id)))); }
function gameMenu(e) {
  const godot = document.querySelector('#rootchip .godot');
  popup(e.currentTarget, [
    h('div', { class: 'tb-head' }, h('b', {}, (FS.root || '').split('/').pop()), h('small', {}, FS.root.replace(FS.home, '~')), godot ? h('small', {}, godot.textContent) : ''),
    row('New game…', 'A new game folder, starting clean', () => import('./games.js').then(m => m.newGame())),
    row('Open game…', 'Switch to another of your games', () => import('./games.js').then(m => m.openGame())),
    row('Kind of game…', `Now: ${P().label}`, () => import('./gametype.js').then(m => m.choosePath())),
    row('Rule book…', 'How to play, written from your game', () => import('./rules.js').then(m => m.openRules())),
    row('Browse its files', 'The Files area', () => go('files')),
    row('Export game…', 'For players: web, Windows, Linux, macOS', () => import('./release.js').then(m => m.openRelease())),
  ]);
}
