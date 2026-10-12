// Gloop, the helper: a little green slime who pops up once in a new game to ask what you'd like to do (instead of a
// big welcome window), then goes away. Help → Gloop brings him back with the next step for your game, a tour of the
// area you are in, and the guides. He never blocks anything: click elsewhere and he slides off.
import { h, pref, emit } from './core.js';

const SLIME = `<svg viewBox="0 0 64 56" width="64" height="56" aria-hidden="true">
  <ellipse cx="32" cy="52" rx="22" ry="3" fill="#0006"/>
  <g class="gl-body"><path d="M8 50 C4 50 4 40 8 32 C12 14 22 6 32 6 C44 6 52 16 56 32 C60 42 60 50 54 50 Z" fill="#5fd36b"/>
  <path d="M12 46 C10 40 12 32 16 26" stroke="#9ff0a5" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="22" cy="17" rx="5" ry="3" fill="#c8ffd0" opacity=".7"/>
  <g class="gl-eyes"><ellipse cx="24" cy="30" rx="4" ry="5" fill="#13261a"/><ellipse cx="40" cy="30" rx="4" ry="5" fill="#13261a"/>
  <circle cx="25.5" cy="28" r="1.5" fill="#fff"/><circle cx="41.5" cy="28" r="1.5" fill="#fff"/></g>
  <path d="M27 39 Q32 43 37 39" stroke="#13261a" stroke-width="2.4" fill="none" stroke-linecap="round"/></g></svg>`;

// show Gloop with words and buttons: [[label, run, primary?]]
export function showHelper(words, buttons = []) {
  document.querySelector('.gloop')?.remove();
  const close = () => { g.classList.add('out'); setTimeout(() => g.remove(), 350); };
  const g = h('div', { class: 'gloop' },
    h('div', { class: 'gl-say' }, h('p', {}, words),
      h('div', { class: 'gl-btns' }, ...buttons.map(([label, run, go]) => h('button', { class: 'btn sm' + (go ? ' go' : ' ghost'), onclick: () => { close(); run(); } }, label)),
        h('button', { class: 'btn sm ghost', onclick: close }, buttons.length ? 'Not now' : 'Bye'))),
    h('div', { class: 'gl-slime', title: 'Gloop' }));
  g.querySelector('.gl-slime').innerHTML = SLIME;
  document.body.append(g);
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!g.contains(e.target)) { close(); document.removeEventListener('pointerdown', off, true); } }, true), 400);
}

// a new, empty game: say hello once (per game folder), then stay out of the way
export function helloOnce(root) {
  const seen = pref.get('gloop.seen', []);
  if (seen.includes(root)) return;
  pref.set('gloop.seen', [...seen, root].slice(-40));
  setTimeout(() => showHelper('Hi, I\'m Gloop! A fresh game. Want me to show you where to start? (I\'ll be in Help → Gloop if you need me.)', [
    ['Show me the steps', () => import('./journey.js').then(m => m.openSteps()), true],
    ['Tour this area', () => import('./tour.js').then(m => m.tour(document.querySelector('#tabs .on')?.dataset.id || 'files'))],
  ]), 1200);
}

// Help → Gloop: the next step for this game, and the guides
export async function callGloop() {
  const n = await import('./journey.js').then(m => m.nextStep()).catch(() => null);
  showHelper(n ? `Next for your game: ${n[1].toLowerCase()}. ${n[2]}` : 'Every step is done: it\'s a game! Export it from the game chip and share it.', [
    ...(n ? [['Do it', () => import('./journey.js').then(m => m.doStep(n)), true]] : []),
    ['All the steps', () => import('./journey.js').then(m => m.openSteps())],
    ['Character guide', () => import('./guide_actor.js').then(m => m.openActorGuide())],
    ['Physics guide', () => import('./guide_physics.js').then(m => m.openPhysicsGuide())],
  ]);
}
export const goTab = id => emit('tab', id);
