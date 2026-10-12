// The Flow board: the game's scenes as cards on a board you pan (drag the empty board) and zoom (wheel). A card's
// outcomes are dots on its right; drag one to another card to say what comes next (drop on the empty board to make
// the next scene there). Click a card or a link to pick it, double click a card to go into it (its area opens).
// flow.js owns the flow and the panels; this draws it and edits positions and links in place.
import { h } from './core.js';

// kind → [name, colour, what it is]
export const KINDS = {
  video: ['Video', '#5aa8ff', 'A video: intro, cutscene, a full-motion scene'],
  menu: ['Menu', '#e3b04b', 'A menu screen from Menus (the title)'],
  level: ['Level', '#f29a3a', 'A level to play, from Levels'],
  room: ['Room', '#b48cff', 'Point & click from this room (and every room it leads to)'],
  talk: ['Talk', '#c06bd6', 'A conversation over a picture, from Dialogue'],
  story: ['Story', '#d9bf6a', 'Pages of words and pictures, from Dialogue (a text adventure)'],
  choice: ['Choice', '#36c3ae', 'Buttons over a picture or a looping video, maybe against the clock'],
  quick: ['Quick-time', '#ff4f6d', 'A video with a moment to press a key in: hit or miss'],
  check: ['Check', '#9cc76b', 'A story flag or an item: yes or no'],
  match3: ['Match-3', '#ff5d73', 'A board of pieces: line up three of a kind to reach the score'],
  cards: ['Card battle', '#e3b04b', 'A fight with your deck (Cards) against one enemy'],
  end: ['End', '#a29e92', 'The end: words on screen, then back to the start'],
};
const NS = 'http://www.w3.org/2000/svg';

// ctx: { flow(), sel(), select(id | {link}), changed(full), outs(node), summary(node), enter(node), add(kind, x, y) → node }
export function flowView(ctx) {
  const surf = h('div', { class: 'fw-surf' }), svg = document.createElementNS(NS, 'svg'), board = h('div', { class: 'fw-board', tabindex: 0 }, surf);
  svg.setAttribute('class', 'fw-links'); surf.append(svg);
  let pan = { x: 40, y: 40, z: 1 }, drag = null, temp = null;
  const place = () => { surf.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.z})`; };
  const toBoard = e => { const r = board.getBoundingClientRect(); return [(e.clientX - r.left - pan.x) / pan.z, (e.clientY - r.top - pan.y) / pan.z]; };
  const portAt = el => { const r = el.getBoundingClientRect(), b = board.getBoundingClientRect(); return [(r.left + r.width / 2 - b.left - pan.x) / pan.z, (r.top + r.height / 2 - b.top - pan.y) / pan.z]; };
  const curve = ([x1, y1], [x2, y2]) => { const d = Math.max(40, Math.abs(x2 - x1) / 2); return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };

  function draw() {
    const F = ctx.flow(); if (!F) return;
    for (const el of [...surf.querySelectorAll('.fw-node')]) el.remove();
    const sel = ctx.sel();
    for (const n of F.nodes) {
      const [label, colour, what] = KINDS[n.kind] || ['?', '#777', ''];
      const outs = ctx.outs(n);
      const card = h('div', { class: 'fw-node' + (sel === n.id ? ' on' : ''), 'data-id': n.id, title: `${what}. Double click to go into it.`, style: { left: n.x + 'px', top: n.y + 'px', '--k': colour } },
        h('i', { class: 'fw-in' }),
        h('header', {}, h('small', {}, label), F.start === n.id ? h('b', { class: 'fw-start' }, 'START') : ''),
        h('div', { class: 'fw-name' }, n.name || label),
        h('div', { class: 'fw-sum' }, ctx.summary(n)),
        ...outs.map(o => h('div', { class: 'fw-out', 'data-out': o }, h('span', {}, o), h('i', { class: 'fw-dot', title: `When it ends with "${o}": drag to the next scene` }))));
      surf.append(card);
    }
    drawLinks();
  }
  function drawLinks() {
    const F = ctx.flow(), sel = ctx.sel();
    svg.replaceChildren();
    for (const l of F.links) {
      const a = surf.querySelector(`.fw-node[data-id="${l.from}"] .fw-out[data-out="${CSS.escape(l.out)}"] .fw-dot`), b = surf.querySelector(`.fw-node[data-id="${l.to}"] .fw-in`);
      if (!a || !b) continue;
      const p = document.createElementNS(NS, 'path'), on = typeof sel === 'object' && sel?.link === l;
      p.setAttribute('d', curve(portAt(a), portAt(b))); p.setAttribute('class', 'fw-link' + (on ? ' on' : ''));
      p.addEventListener('pointerdown', e => { e.stopPropagation(); ctx.select({ link: l }); });
      svg.append(p);
    }
    if (temp) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', curve(temp.a, temp.b)); p.setAttribute('class', 'fw-link temp'); svg.append(p); }
  }

  board.addEventListener('pointerdown', e => {
    const F = ctx.flow(), dot = e.target.closest('.fw-dot'), card = e.target.closest('.fw-node');
    board.setPointerCapture(e.pointerId);
    if (dot) { const id = card.dataset.id, out = dot.parentElement.dataset.out; temp = { id, out, a: portAt(dot), b: toBoard(e) }; drag = { kind: 'link' }; return; }
    if (card) {
      const n = F.nodes.find(x => x.id === card.dataset.id); ctx.select(n.id);
      const [sx, sy] = toBoard(e), ox = n.x, oy = n.y;
      drag = { kind: 'node', move: ev => { const [x, y] = toBoard(ev); n.x = Math.round(ox + x - sx); n.y = Math.round(oy + y - sy); const el = surf.querySelector(`.fw-node[data-id="${n.id}"]`); el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; drawLinks(); } };
      return;
    }
    if (!e.target.closest('.fw-link')) ctx.select(null);
    const sx = e.clientX - pan.x, sy = e.clientY - pan.y;
    drag = { kind: 'pan', move: ev => { pan.x = ev.clientX - sx; pan.y = ev.clientY - sy; place(); } };
  });
  board.addEventListener('pointermove', e => {
    if (drag?.kind === 'link') { temp.b = toBoard(e); drawLinks(); return; }
    if (drag?.move) { drag.move(e); drag.moved = true; }
  });
  board.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (d?.kind === 'link') {
      const t = temp; temp = null;
      const over = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest?.('.fw-node')).find(Boolean), F = ctx.flow();
      const link = to => { F.links = F.links.filter(l => !(l.from === t.id && l.out === t.out)); if (to !== t.id) F.links.push({ from: t.id, out: t.out, to }); ctx.changed(true); };
      if (over) link(over.dataset.id);
      else kindMenu(e, toBoard(e), n => link(n.id));
      drawLinks(); return;
    }
    if (d?.kind === 'node' && d.moved) ctx.changed(false);
  });
  // an asset dragged from the shelf (assets.js): a scene of it where it lands
  board.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-kiln-asset')) e.preventDefault(); });
  board.addEventListener('drop', e => { const a = (() => { try { return JSON.parse(e.dataTransfer.getData('application/x-kiln-asset')); } catch { return null; } })(); if (!a) return; e.preventDefault(); const [x, y] = toBoard(e); ctx.drop?.(a, x - 90, y - 20); });
  board.addEventListener('dblclick', e => { const card = e.target.closest('.fw-node'); if (card) ctx.enter(ctx.flow().nodes.find(n => n.id === card.dataset.id)); });
  board.addEventListener('wheel', e => {
    e.preventDefault();
    const r = board.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.exp(-e.deltaY * .0015), z = Math.min(2, Math.max(.3, pan.z * k));
    pan.x = mx - (mx - pan.x) * z / pan.z; pan.y = my - (my - pan.y) * z / pan.z; pan.z = z; place(); drawLinks();
  }, { passive: false });

  // dropped a wire on the empty board: which scene comes next?
  function kindMenu(e, [x, y], then) {
    document.querySelector('.fw-menu')?.remove();
    const m = h('div', { class: 'fw-menu tb-pop', style: { left: e.clientX + 'px', top: e.clientY + 'px' } }, h('div', { class: 'tb-head' }, h('b', {}, 'Then…')),
      ...Object.entries(KINDS).map(([k, [label, colour, what]]) => h('button', { onclick: () => { m.remove(); then(ctx.add(k, x, y - 20)); } }, h('span', { style: { color: colour } }, label), h('small', {}, what))));
    document.body.append(m);
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
  }
  // show every card
  function fit() {
    const F = ctx.flow(); if (!F?.nodes.length) return;
    const xs = F.nodes.map(n => n.x), ys = F.nodes.map(n => n.y), w = Math.max(...xs) - Math.min(...xs) + 280, hh = Math.max(...ys) - Math.min(...ys) + 200;
    pan.z = Math.min(1.2, Math.max(.3, Math.min(board.clientWidth / w, board.clientHeight / hh)));
    pan.x = 30 - Math.min(...xs) * pan.z; pan.y = 30 - Math.min(...ys) * pan.z; place(); drawLinks();
  }
  // where a new card goes: the middle of what is on screen
  const middle = () => [Math.round((board.clientWidth / 2 - pan.x) / pan.z - 90), Math.round((board.clientHeight / 2 - pan.y) / pan.z - 40)];
  place();
  return { el: board, draw, fit, middle };
}
