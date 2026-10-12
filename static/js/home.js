// Home: the game at a glance, the first tab of every path. Its name, kind and look; what to do next (the "Your game"
// steps); the flow of scenes as a small map (click → Flow); what was worked on last (click → open it); how much of each
// thing it has (click → that area); and the big doors: play it, export it, the rule book.
import { h, api, emit, on } from './core.js';
import { S as FS } from './files.js';
import { GAME, P, LOOK } from './gametype.js';
import { KINDS } from './flow_view.js';

const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t * 1000).toLocaleDateString(); };
const AREA = { actor: ['animate', 'Characters'], room: ['rooms', 'Rooms'], level: ['levels', 'Levels'], scene: ['scenes', 'Backdrops'], dialogue: ['dialogue', 'Conversations'], hud: ['hud', 'HUDs'], graph: ['logic', 'Logic graphs'], menus: ['menus', 'Menus'] };
const OPEN = { actor: n => emit('open-actor', `${FS.root}/sprites/${n}`), room: n => emit('open-room', n), level: n => emit('open-level', n), scene: n => emit('open-scene', `${FS.root}/backgrounds/${n}`), dialogue: n => emit('open-dialogue', n) };
let V = {}, mounted = false;

export const home = {
  id: 'home', title: 'Home', key: '',
  mount(el) { el.className = 'view hm'; mounted = true; V.el = h('div', { class: 'hm-page' }); el.append(V.el); draw(); },
  show() { draw(); },
};
on('root', () => { if (mounted) draw(); });
on('path', () => { if (mounted) draw(); });

async function draw() {
  const ps = await api('/api/projects').catch(() => []), name = (FS.root || '').split('/').pop(), p = P();
  const F = (await fetch('/api/project?id=flow-game').then(r => r.ok ? r.json() : null).catch(() => null))?.flow;
  const step = await import('./journey.js').then(m => m.nextStep()).catch(() => null);
  const recent = ps.filter(x => OPEN[x.kind]).sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  const counts = Object.entries(AREA).map(([k, [area, label]]) => [k, area, label, ps.filter(x => x.kind === k).length]).filter(c => c[3]);
  V.el.replaceChildren(
    h('header', { class: 'hm-head' },
      h('div', {}, h('small', {}, `${p.label} · ${GAME.look === 'pixel' ? 'Pixel' : 'Modern'} look · ${LOOK().w}×${LOOK().h}`), h('h1', {}, name)),
      h('div', { class: 'hm-doors' },
        h('button', { class: 'btn go', title: 'Build it and play it in the Stage', onclick: () => emit('play') }, '▶ Play it'),
        h('button', { class: 'btn', title: 'For players: web, Windows, Linux, macOS', onclick: () => import('./release.js').then(m => m.openRelease()) }, 'Export'),
        h('button', { class: 'btn ghost', title: 'How to play, written from the game', onclick: () => import('./rules.js').then(m => m.openRules()) }, 'Rule book'))),
    step ? h('section', { class: 'hm-next' }, h('small', {}, 'Next'), h('b', {}, step[1]), h('span', {}, step[2]),
      h('button', { class: 'btn sm go', onclick: () => import('./journey.js').then(m => m.doStep(step)) }, 'Do it'), h('button', { class: 'btn sm ghost', onclick: () => import('./journey.js').then(m => m.openSteps()) }, 'All steps'))
      : h('section', { class: 'hm-next done' }, h('b', {}, 'Every step is done.'), h('span', {}, 'It\'s a game: export it and share it.')),
    h('section', {}, h('h2', {}, 'The game, scene by scene', h('button', { class: 'btn sm ghost', onclick: () => emit('tab', 'flow') }, 'Open Flow')),
      F?.nodes?.length ? flowMap(F) : h('p', { class: 'note' }, 'No flow yet: Flow lays out the game from its first video to the end. Start from a shape there.')),
    h('div', { class: 'hm-cols' },
      h('section', {}, h('h2', {}, 'Lately'), recent.length ? h('div', { class: 'hm-recent' }, ...recent.map(x => h('button', { onclick: () => OPEN[x.kind](x.name), title: `Open ${x.name}` },
        x.thumb ? h('img', { src: x.thumb }) : h('i', {}), h('b', {}, x.name), h('small', {}, `${AREA[x.kind][1].replace(/s$/, '').toLowerCase()} · ${ago(x.mtime)}`)))) : h('p', { class: 'note' }, 'Nothing made yet.')),
      h('section', {}, h('h2', {}, 'In this game'), counts.length ? h('div', { class: 'hm-counts' }, ...counts.map(([k, area, label, n]) => h('button', { onclick: () => emit('tab', area) }, h('b', {}, n), h('span', {}, label)))) : h('p', { class: 'note' }, 'Empty so far.'))));
}

// the flow as columns of small scene cards, in the order they play from the start
function flowMap(F) {
  const depth = { [F.start]: 0 }, q = [F.start];
  while (q.length) { const id = q.shift(); for (const l of F.links.filter(l => l.from === id)) if (depth[l.to] === undefined) { depth[l.to] = depth[id] + 1; q.push(l.to); } }
  const cols = [];
  for (const n of F.nodes) (cols[depth[n.id] ?? cols.length] ||= []).push(n);
  const list = cols.filter(Boolean);
  return h('div', { class: 'hm-flow' }, ...list.flatMap((c, i) => [h('div', { class: 'hm-col' }, ...c.map(n => h('button', { class: 'hm-scene', style: { '--k': (KINDS[n.kind] || [])[1] || '#777' }, title: `${(KINDS[n.kind] || [''])[0]}: double click in Flow to go into it`, onclick: () => emit('tab', 'flow') },
    h('small', {}, (KINDS[n.kind] || ['?'])[0]), h('b', {}, n.name || n.kind)))), i < list.length - 1 ? h('i', { class: 'hm-arrow' }, '→') : '']));
}
