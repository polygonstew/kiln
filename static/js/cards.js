// Cards: the deck of a card battler. Each card has a cost in energy and what it does (deal damage, block, heal, draw),
// a picture, and how many copies the starting deck holds; the player's health, energy and hand size sit beside them.
// Kept as the project kiln/cards-game.json; Save writes cards/cards.json (cards_godot.js), which battles in the Flow use.
// Enemies are Card battle scenes in the Flow (their health, picture and moves).
import { h, api, toast, emit, on, field } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { projectBar } from './startover.js';
import { cardsJSON } from './cards_godot.js';
import { pickPicture, pickFromSheet } from './pictures.js';

const slug = s => String(s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'card';
const STARTER = () => ({ hp: 40, energy: 3, hand: 5, cards: [
  { id: 'strike', name: 'Strike', cost: 1, attack: 6, copies: 4 }, { id: 'guard', name: 'Guard', cost: 1, block: 5, copies: 4 },
  { id: 'mend', name: 'Mend', cost: 1, heal: 4, copies: 1 }, { id: 'focus', name: 'Focus', cost: 0, draw: 2, copies: 1 }, { id: 'smash', name: 'Smash', cost: 2, attack: 14, copies: 1 }] });
let C = null, V = {}, sel = null, mounted = false, keepT = 0;

export const cards = {
  id: 'cards', title: 'Cards', key: '',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' }); V.grid = h('div', { class: 'cd-grid' });
    el.append(V.left, h('section', { class: 'stage' }, h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'Your deck'), h('span', { class: 'grow' }),
      projectBar('cards-game', 'deck', { flush, reload: load }), h('button', { class: 'btn sm', title: 'A new card', onclick: add }, '+ Card'), h('button', { 'data-file': 'save', 'data-noun': 'cards', class: 'btn sm go', title: 'Write cards/cards.json for the game', onclick: save }, 'Save')),
      h('div', { class: 'viewport cd-view' }, V.grid)), V.right);
    load();
  },
  show() { if (C) draw(); },
  async saveProject() { await save(); },
};
async function load() {
  C = (await fetch('/api/project?id=cards-game').then(r => r.ok ? r.json() : null).catch(() => null))?.cards || STARTER();
  sel = C.cards[0]?.id || null; draw();
}
on('root', () => { if (mounted) load(); });
const flush = () => { clearTimeout(keepT); return C ? api('/api/project', { id: 'cards-game', data: { meta: { kind: 'cards', name: 'game' }, cards: C } }) : null; };
const keep = () => { clearTimeout(keepT); keepT = setTimeout(() => api('/api/project', { id: 'cards-game', data: { meta: { kind: 'cards', name: 'game' }, cards: C } }), 500); };
function changed() { keep(); draw(); }
function add() { const n = prompt('Name of the card', 'Fireball'); if (!n) return; let id = slug(n); while (C.cards.some(c => c.id === id)) id += '_2'; C.cards.push({ id, name: n, cost: 1, attack: 0, block: 0, heal: 0, draw: 0, copies: 1 }); sel = id; changed(); }
const does = c => [c.attack && `Deal ${c.attack}`, c.block && `Block ${c.block}`, c.heal && `Heal ${c.heal}`, c.draw && `Draw ${c.draw}`].filter(Boolean).join('. ') || 'Does nothing yet';
const kindColour = c => c.attack ? '#e05d5d' : c.block ? '#4cc9f0' : '#06d6a0';

function card(c) {
  return h('button', { class: 'cd-card' + (sel === c.id ? ' on' : ''), style: { '--k': kindColour(c) }, onclick: () => { sel = c.id; draw(); } },
    h('b', {}, `Cost ${c.cost}`), h('div', { class: 'cd-pic' }, c.picture ? h('img', { src: '/api/fs/raw?path=' + encodeURIComponent(FS.root + '/' + c.picture) }) : ''),
    h('strong', {}, c.name), h('small', {}, does(c)), h('i', {}, `×${c.copies || 0} in the deck`));
}
function draw() {
  const deck = C.cards.reduce((n, c) => n + (+c.copies || 0), 0);
  V.grid.replaceChildren(...C.cards.map(card));
  const num = (obj, key, label, min, max, hint) => field(label, h('input', { type: 'number', min, max, value: obj[key] ?? 0, style: { width: '70px' }, onchange: e => { obj[key] = +e.target.value; changed(); } }), hint);
  V.left.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'The player'),
    num(C, 'hp', 'Health', 1, 999, 'Carries from fight to fight'), num(C, 'energy', 'Energy', 1, 10, 'Each turn'), num(C, 'hand', 'Hand', 1, 10, 'Cards drawn each turn'),
    h('p', { class: 'note' }, `The starting deck: ${deck} cards. Enemies are Card battle scenes in Flow.`), h('button', { class: 'btn sm', onclick: () => emit('tab', 'flow') }, 'Open Flow')));
  const c = C.cards.find(x => x.id === sel);
  if (!c) return V.right.replaceChildren(h('div', { class: 'sec' }, h('p', { class: 'note' }, 'Pick a card, or + Card.')));
  const setPic = async url => { const b64 = url.startsWith('data:') ? url : await fetch(url).then(r => r.blob()).then(b => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); }));
    await saveFiles('pictures/cards', [{ name: c.id + '.png', b64 }]); c.picture = `pictures/cards/${c.id}.png`; changed(); };
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Card', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost danger', onclick: () => { C.cards = C.cards.filter(x => x !== c); sel = C.cards[0]?.id; changed(); } }, 'Delete')),
    field('Name', h('input', { type: 'text', value: c.name, onchange: e => { c.name = e.target.value; changed(); } })),
    num(c, 'cost', 'Cost', 0, 9, 'Energy to play it'), num(c, 'attack', 'Damage', 0, 99), num(c, 'block', 'Block', 0, 99, 'Taken off the next hit'), num(c, 'heal', 'Heal', 0, 99), num(c, 'draw', 'Draw', 0, 9, 'Extra cards'),
    num(c, 'copies', 'Copies', 0, 20, 'In the starting deck'),
    field('Picture', h('span', { class: 'rm-pic' }, h('button', { class: 'btn sm', onclick: () => pickPicture('Picture for ' + c.name, setPic) }, 'Pick…'), h('button', { class: 'btn sm ghost', onclick: () => pickFromSheet('Picture for ' + c.name, setPic) }, 'From a sheet…')))));
}
async function save() {
  clearTimeout(keepT); await api('/api/project', { id: 'cards-game', data: { meta: { kind: 'cards', name: 'game' }, cards: C } });
  await saveFiles('cards', [{ name: 'cards.json', text: cardsJSON(C, rel => 'res://' + rel) }]);
  toast('Saved cards/cards.json', 'ok');
}
