// The rule book: how to play this game, written by Kiln from what is in it (the goal for its kind of game, the
// controls, the cards and what they do, the foes, the items, the physics things) and then yours to edit. Kept as the
// project kiln/rules-game.json; Save writes docs/RULES.md (to read, print or post) and rules/rules.json, which the
// game shows from its menus ("How to play"). Opened from the game chip, Help and Gloop.
import { h, api, toast } from './core.js';
import { saveFiles } from './files.js';
import { GAME, P } from './gametype.js';
import { controlsText } from './playbuild.js';

const get = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);
const GOALS = {
  scroller: 'Get to the end of each level. Jump the gaps, beat or dodge what attacks you, and find what is hidden off the main path.',
  topdown: 'Fight your way through the rooms. Doors lead on; clear what is inside, find what helps, and face the boss.',
  puzzle: 'Each level is one puzzle on one screen. Work out how to reach the exit; if it goes wrong, try again.',
  adventure: 'Explore, talk to people, pick things up and use them in the right places to get past every obstacle.',
  text: 'Read each page and choose what to do. Your choices change what happens, and some lead to different endings.',
  fmv: 'Watch, decide and react: choose at each turning point, and press in time when the moment comes.',
  match3: 'Swap two neighbouring pieces to line up three or more of a kind. Reach the score before you run out of moves.',
  cards: 'Defeat each foe with your deck. Each turn you get energy and a hand of cards; the foe shows what it will do next.',
  vn: 'Read the story and choose at the turning points. Your choices decide where it goes.',
  runner: 'You run by yourself, faster and faster. Jump over the gaps and get as far as you can.',
  wild: 'Explore, survive and find your way through the game.',
};
const does = c => [c.attack && `deal ${c.attack} damage`, c.block && `block ${c.block}`, c.heal && `heal ${c.heal}`, c.draw && `draw ${c.draw} more`].filter(Boolean).join(', ') || 'does nothing yet';

// the rule book as Kiln would write it today: [{ title, text }]
async function written() {
  const ps = await api('/api/projects').catch(() => []), doc = (await get('gamedoc-game'))?.doc?.v || {};
  const F = (await get('flow-game'))?.flow, C = (await get('cards-game'))?.cards, I = (await get('items-adventure'))?.items;
  const path = GAME.path, out = [];
  out.push({ title: doc['pitch.title'] || 'This game', text: [doc['pitch.logline'], `A ${P().label.toLowerCase()}.`].filter(Boolean).join('\n') });
  out.push({ title: 'The goal', text: GOALS[path] || GOALS.wild });
  out.push({ title: 'Controls', text: controlsText(path === 'adventure' ? 'rooms/' : '').split(' · ').map(s => '• ' + s).join('\n') + '\n• Esc or Start pauses.' });
  if (C?.cards?.length) out.push({ title: 'Your cards', text: `You start with ${C.hp || 40} health, ${C.energy || 3} energy a turn and draw ${C.hand || 5} cards.\n` + C.cards.map(c => `• ${c.name} (${c.cost} energy): ${does(c)}.`).join('\n') + '\nBlock lasts until the foe\'s next hit. Your health carries from fight to fight.' });
  const foes = (F?.nodes || []).filter(n => n.kind === 'cards');
  if (foes.length) out.push({ title: 'Foes', text: foes.map(n => `• ${n.name}: ${n.hp || 30} health; ${String(n.pattern || 'attack 6').replace(/,/g, ', then')}.`).join('\n') });
  const boards = (F?.nodes || []).filter(n => n.kind === 'match3');
  if (boards.length) out.push({ title: 'Boards', text: boards.map((n, i) => `• ${n.name || 'Board ' + (i + 1)}: ${n.goal || 1500} points in ${n.moves || 20} moves.`).join('\n') + '\nLonger lines and chains (pieces falling into new matches) score more.' });
  if (I?.items?.length) out.push({ title: 'Things you carry', text: 'Click an item, then something in the world, to use it there; click an item, then another, to combine them. Right click anything to look at it.\n' + I.items.map(i => `• ${i.name}`).join('\n') });
  if (F?.nodes?.some(n => n.kind === 'quick')) out.push({ title: 'Quick moments', text: 'When NOW! appears, press at once. Too early or too late, and it goes wrong.' });
  const levels = await Promise.all(ps.filter(p => p.kind === 'level').map(p => get(p.id)));
  const things = new Set(levels.flatMap(l => (l?.level?.ents || []).map(e => e.type === 'body' ? e.shape : e.type)));
  const phys = [things.has('crate') && 'Crates slide when you walk into them, and you can climb on them.', (things.has('box') || things.has('ball') || things.has('plank')) && 'Boxes, balls and planks are heavy: shove them, stack them, roll them.',
    things.has('seesaw') && 'A seesaw flings whatever sits on its high end when the other end drops.', things.has('button') && 'A red button stays down while something heavy stands on it, and every gate opens while it does.'].filter(Boolean);
  if (phys.length) out.push({ title: 'Things in the world', text: phys.map(s => '• ' + s).join('\n') });
  if (path === 'adventure' || F?.nodes?.some(n => n.kind === 'room')) out.push({ title: 'Saving', text: 'F5 saves, F9 loads (also in the menus).' });
  return out;
}

export async function openRules() {
  const kept = (await get('rules-game'))?.rules;
  let R = kept || { sections: await written() };
  const body = h('div', { class: 'body rb-page' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(760px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Rule book'),
      h('button', { class: 'btn sm ghost', title: 'Write it again from the game as it is now (your edits are replaced)', onclick: async () => { if (!confirm('Write the rule book again from the game? Your edits are replaced.')) return; R = { sections: await written() }; draw(); keep(); } }, 'Write it again'),
      h('button', { class: 'btn sm go', title: 'docs/RULES.md to read or share, and rules/rules.json for the game\'s "How to play"', onclick: save }, 'Save'),
      h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  let t = 0; const keep = () => { clearTimeout(t); t = setTimeout(() => api('/api/project', { id: 'rules-game', data: { meta: { kind: 'rules', name: 'game' }, rules: R } }), 500); };
  function draw() {
    body.replaceChildren(h('p', { class: 'note', style: { marginTop: 0 } }, 'How to play, written from your game: change anything. In the game, a menu button "How to play" shows it (Menus → an item that does "How to play").'),
      ...R.sections.map((s, i) => h('div', { class: 'rb-sec' },
        h('input', { type: 'text', class: 'rb-title', value: s.title, onchange: e => { s.title = e.target.value; keep(); } }),
        h('textarea', { rows: Math.max(2, s.text.split('\n').length + 1), value: s.text, oninput: e => { s.text = e.target.value; keep(); } }),
        h('button', { class: 'ibtn', title: 'Remove this part', onclick: () => { R.sections.splice(i, 1); keep(); draw(); } }, '✕'))),
      h('button', { class: 'btn sm', onclick: () => { R.sections.push({ title: 'More', text: '' }); keep(); draw(); } }, '+ Part'));
  }
  async function save() {
    clearTimeout(t); await api('/api/project', { id: 'rules-game', data: { meta: { kind: 'rules', name: 'game' }, rules: R } });
    await saveFiles('docs', [{ name: 'RULES.md', text: '# How to play\n\n' + R.sections.map(s => `## ${s.title}\n\n${s.text}\n`).join('\n') }]);
    await saveFiles('rules', [{ name: 'rules.json', text: JSON.stringify(R.sections, null, 1) + '\n' }]);
    toast('Saved docs/RULES.md and rules/rules.json', 'ok');
  }
  draw();
}
