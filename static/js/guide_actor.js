// The character guide: which pictures a character needs on each game path, and how to clean up a picture that came
// out not quite right (Forge's clean-up, the mask, Animate's pixel editor, keeping a character on-model). Opened from
// Help, the template kits and Animate.
import { h, emit } from './core.js';
import { GAME } from './gametype.js';

const NEEDS = {
  adventure: ['Point & click', [['A side view, facing right', 'Required. Full body, feet at the bottom. Kiln flips it to walk left and makes a gentle walk from it; Puppet makes a real walk cycle from the same picture.'],
    ['Front and back views', 'Optional: walking towards you and away (name the animations walk_down and walk_up).'],
    ['A talking head', 'Optional: Puppet → Head & mouth gives it mouths that move with voice lines.'],
    ['A portrait', 'Optional: a close-up for Talk scenes in Flow.']]],
  scroller: ['Side-scroller', [['One side view, facing right', 'Animate → Puppet rigs it and makes idle, walk, run, jump, attack, hurt and death.'],
    ['Or each move drawn', 'Idle, walk, jump, attack, hurt, death: frames of one size, feet on the same line.'], ['A projectile', 'Optional: a small picture it shoots (Workshop → Projectiles).']]],
  topdown: ['Top-down', [['Seen from above', 'Idle and walk; facing right is enough (Kiln flips it).'], ['Up and down walks', 'Optional: walk_up and walk_down.'], ['A projectile', 'What it shoots.']]],
  text: ['Text adventure', [['Pictures for pages', 'Any size: Dialogue → a line\'s ▣ Picture.'], ['Portraits', 'Optional, one per speaker.']]],
  fmv: ['Interactive movie', [['Your video clips', 'Flow → a Video scene → Add…'], ['Stills', 'Optional: Title card… makes stand-ins until a scene is filmed.']]],
};
const FIXES = [
  ['The background is not fully gone', 'Forge → Clean-up: raise Tolerance, or click the leftover background colour on the source. Paint it red with the Mask\'s Remove.'],
  ['Part of the character vanished (white eyes, a white shirt)', 'Forge → Mask → Keep: paint it green and it stays. Shift+click keeps a whole area of one colour.'],
  ['A hand, a face or an edge came out wrong', 'Open the frame in Animate and fix it by hand: left click paints, right click erases, middle click picks a colour from the picture, the wheel rolls through colours. Onion skin shows the frame before, so fixes line up.'],
  ['It drifts off-model between pictures', 'Make the first good picture the character\'s reference (New actor in Animate), then make every new pose from Forge locked to it: same palette, same size, same scale. The Style bible keeps the whole game in one look.'],
  ['Too smooth or too blocky', 'Forge → Look: Full colour keeps every colour; Pixel art snaps it to a grid and a palette (pick the hardware for the era).'],
];

export function openActorGuide(path = GAME.path) {
  const [label, needs] = NEEDS[path] || NEEDS[path === 'puzzle' || path === 'wild' ? 'scroller' : 'adventure'];
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(720px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Character guide'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body guide' },
      h('h3', {}, `What a character needs (${label})`),
      h('ol', {}, ...needs.map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d)))),
      h('h3', {}, 'When a picture comes out not quite right'),
      h('ul', {}, ...FIXES.map(([t, d]) => h('li', {}, h('b', {}, t), h('span', {}, d)))),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
        h('button', { class: 'btn go', onclick: () => { m.remove(); emit('tab', 'forge'); } }, 'Open Forge'),
        h('button', { class: 'btn', onclick: () => { m.remove(); emit('tab', 'animate'); } }, 'Open Animate')))));
  document.body.append(m);
}
