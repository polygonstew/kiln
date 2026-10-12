// The physics guide: how Kiln's physics things work (bodies, the seesaw's pivot, buttons and gates, ragdolls), each with
// a small moving picture and a "Build this example" that makes a working level in the game open now, plus ideas for
// puzzles built from them. Opened from Help, from Gloop and from Levels.
import { h, api, toast, emit, uid } from './core.js';
import { LOOK } from './gametype.js';

const SVG = (body, cls) => `<svg viewBox="0 0 220 110" class="pg-svg ${cls}"><rect x="0" y="96" width="220" height="14" fill="#5b5a63"/>${body}</svg>`;
const CARDS = [
  ['Bodies', 'A box, a ball and a plank are real physics bodies: they fall, tumble, stack, roll down slopes and get shoved when the player walks into them. Heavier ones push lighter ones.',
    SVG('<rect class="pg-fall" x="96" y="20" width="26" height="26" fill="#c8894a" stroke="#7a5230" stroke-width="2"/><circle class="pg-roll" cx="30" cy="84" r="12" fill="#e05d5d"/>', 'a'), 'box'],
  ['Buttons and gates', 'A button is held down by anything heavy standing on it. While any button in the level is down, every gate in it rises. Push a box onto the button and walk through.',
    SVG('<rect class="pg-push" x="40" y="70" width="26" height="26" fill="#c8894a" stroke="#7a5230" stroke-width="2"/><rect x="118" y="92" width="34" height="4" fill="#e5534b"/><rect class="pg-gate" x="180" y="48" width="16" height="48" fill="#7c8794"/>', 'b'), 'button'],
  ['Seesaw', 'A plank on a pivot. Drop weight on one end and the other end flings what sits on it: jump on it to launch a ball up to a ledge.',
    SVG('<polygon points="100,96 110,78 120,96" fill="#3f6f99"/><g class="pg-tilt"><rect x="50" y="72" width="120" height="7" fill="#6aa5d9"/></g><circle class="pg-launch" cx="160" cy="64" r="8" fill="#e05d5d"/>', 'c'), 'seesaw'],
  ['Ragdolls', 'An actor rigged in Puppet can fall apart when it dies: every bone becomes a piece, every joint a hinge that bends only so far. Turn it on in the Workshop (Ragdoll), then put the actor near some spikes.',
    SVG('<g class="pg-rag"><rect x="104" y="24" width="12" height="12" rx="3" fill="#e8b796"/><rect x="102" y="38" width="16" height="22" fill="#3f6fb5"/><rect class="pg-arm" x="92" y="40" width="8" height="18" fill="#3f6fb5"/><rect x="103" y="62" width="6" height="22" fill="#4a4a58"/><rect class="pg-leg" x="111" y="62" width="6" height="22" fill="#4a4a58"/></g>', 'd'), 'ragdoll'],
];
const IDEAS = ['Weigh it down: a button needs something to stay on it while you walk through the gate.', 'Build stairs: stack boxes to reach a high ledge.',
  'Roll it: a ball rolls down a slope onto a button far away.', 'Catapult: a seesaw flings a box over a wall.', 'Bridge: drop a plank across a gap, then walk over it.',
  'Two gates, one button: what you leave on the button decides what stays open.'];

export function openPhysicsGuide() {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(900px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Physics guide'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' },
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Levels → Things has a box, a ball, a plank, a seesaw, a button and a gate. They are plain Godot physics nodes; ▶ Play to try them.'),
      h('div', { class: 'pg-cards' }, ...CARDS.map(([title, what, svg, ex]) => { const c = h('div', { class: 'pg-card' }, h('div', { class: 'pg-pic' }), h('b', {}, title), h('p', {}, what),
        h('button', { class: 'btn sm go', onclick: () => { m.remove(); example(ex); } }, ex === 'ragdoll' ? 'Show me how' : 'Build this example')); c.querySelector('.pg-pic').innerHTML = svg; return c; })),
      h('h3', {}, 'Puzzle ideas'), h('ul', { class: 'pg-ideas' }, ...IDEAS.map(t => h('li', {}, t))))));
  document.body.append(m);
}

// an example level in the game open now: a floor, walls, the things, the player's start
async function example(kind) {
  if (kind === 'ragdoll') { emit('tab', 'animate'); return toast('Rig your character in Animate → Puppet, then Workshop → Ragdoll: falls apart when it dies. Spikes in a level make a quick test.', 'ok'); }
  const L0 = LOOK(), T = L0.tile, cols = Math.ceil(L0.w / T), rows = Math.ceil(L0.h / T), cells = Array(cols * rows).fill(-1);
  const set = (x, y, t = 0) => { if (x >= 0 && y >= 0 && x < cols && y < rows) cells[y * cols + x] = t; };
  for (let x = 0; x < cols; x++) { set(x, rows - 2); set(x, rows - 1); set(x, 0); }
  for (let y = 0; y < rows; y++) { set(0, y); set(cols - 1, y); }
  const at = (cx, cy = rows - 3) => ({ x: cx * T + T / 2, y: (cy + 1) * T }), ents = [{ id: uid(), type: 'start', name: 'PlayerStart', ...at(2) }];
  const zones = [];
  if (kind === 'box') {
    ents.push({ id: uid(), type: 'body', shape: 'box', name: 'box', ...at(8) }, { id: uid(), type: 'body', shape: 'box', name: 'box', ...at(8, rows - 6) }, { id: uid(), type: 'body', shape: 'ball', name: 'ball', ...at(14) },
      { id: uid(), type: 'body', shape: 'plank', name: 'plank', ...at(20) });
    for (let x = cols - 9; x < cols - 1; x++) set(x, rows - 3, 2);                       // a slope-ish step for the ball
  }
  if (kind === 'button') {
    ents.push({ id: uid(), type: 'body', shape: 'box', name: 'box', ...at(7) }, { id: uid(), type: 'button', name: 'button', ...at(12) }, { id: uid(), type: 'gate', name: 'gate', ...at(cols - 8) });
    zones.push({ id: uid(), kind: 'message', name: 'win', text: 'Through the gate!', x: (cols - 5) * T, y: (rows - 5) * T, w: 3 * T, h: 3 * T, once: true });
  }
  if (kind === 'seesaw') {
    ents.push({ id: uid(), type: 'body', shape: 'seesaw', name: 'seesaw', ...at(12) }, { id: uid(), type: 'body', shape: 'ball', name: 'ball', ...at(14, rows - 5) });
    for (let x = cols - 8; x < cols - 1; x++) set(x, rows - 8);                            // a ledge to launch onto
  }
  const name = 'physics_' + kind;
  await api('/api/project', { id: 'level-' + name, data: { meta: { kind: 'level', name }, level: { id: uid(), name, tile: T, cols, rows, ts: null, tsCols: 8, solid: [0, 2, 3],
    kinds: { 0: 'solid', 2: 'solid', 3: 'solid' }, cells, pick: 0, grid: true, ents, zones } } });
  emit('open-level', name);
  toast(`Made the level "${name}": Save it in Levels, then ▶ Play in Stage (pick it as the level) to try it`, 'ok');
}
