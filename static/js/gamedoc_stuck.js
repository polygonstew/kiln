// The Game doc's "Stuck?" panel: it follows the section you are reading. Questions to think about (each one can
// become a note in that section), and per section a spark: an idea roll (Pitch), themes (Story), names (World,
// Characters), what a genre usually has (Mechanics, Levels) and a scope check (Plan). ctx comes from gamedoc.js.
import { h, toast } from './core.js';
import { QUESTIONS, THEMES, GENRES, rollIdea, makeNames, FLAVOUR_NAMES } from './gamedoc_sparks.js';

const shuffled = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
let flavour = 'Gothic', genre = '';

export function stuckPanel(sec, ctx) {
  const qbox = h('div', { class: 'gd-qs' });
  const drawQs = () => {
    const asked = new Set((ctx.get(`${sec}.thoughts`) || []).map(t => t.name));
    qbox.replaceChildren(...shuffled((QUESTIONS[sec] || []).filter(q => !asked.has(q))).slice(0, 4).map(q => h('div', { class: 'gd-qrow' },
      h('p', {}, q), h('button', { class: 'btn sm ghost', title: 'Add it to this section with room for your answer', onclick: () => { ctx.think(q); drawQs(); } }, 'Think about it'))));
  };
  drawQs();
  return h('div', {},
    h('div', { class: 'sec' }, h('h3', {}, 'Stuck?', h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Other questions', onclick: drawQs }, '↻')),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Questions for this section. Answer one in a sentence and the rest often follows.'), qbox),
    spark(sec, ctx) || '',
    h('div', { class: 'sec' }, h('p', { class: 'note', style: { margin: 0 } }, '✦ next to a part gives three ideas that fit what you have written so far.')));
}

function spark(sec, ctx) {
  if (sec === 'pitch') {
    const out = h('p', { class: 'gd-roll' }, rollIdea());
    return h('div', { class: 'sec' }, h('h3', {}, 'Roll an idea'), out,
      h('div', { class: 'pp-row' }, h('button', { class: 'btn sm', onclick: () => out.textContent = rollIdea() }, '🎲 Roll again'),
        h('button', { class: 'btn sm ghost', title: 'Make this the logline (you can change it there)', onclick: () => { ctx.useLogline(out.textContent); toast('It is your logline now: make it yours', 'ok'); } }, 'Use as logline')));
  }
  if (sec === 'story') {
    const on = new Set(ctx.get('story.themes') || []);
    return h('div', { class: 'sec' }, h('h3', {}, 'Themes'), h('p', { class: 'note', style: { marginTop: 0 } }, 'What it is about underneath. Click to add or remove.'),
      h('div', { class: 'gd-themes' }, ...THEMES.map(([t, why]) => h('button', { class: 'gd-theme' + (on.has(t) ? ' on' : ''), title: why, onclick: () => ctx.theme(t, !on.has(t)) }, t))));
  }
  if (sec === 'world' || sec === 'cast') {
    const names = h('div', { class: 'gd-chips' });
    const draw = () => names.replaceChildren(...makeNames(flavour).map(n => h('button', { class: 'gd-chip', title: sec === 'world' ? 'Add as a place' : 'Add as a character',
      onclick: () => { ctx.addEntry(sec === 'world' ? 'world.places' : 'cast.people', n, ''); toast(`${n} added`, 'ok'); } }, n)));
    draw();
    return h('div', { class: 'sec' }, h('h3', {}, 'Names', h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'More names', onclick: draw }, '↻')),
      h('div', { class: 'seg', style: { flexWrap: 'wrap' } }, ...FLAVOUR_NAMES.map(f => h('button', { class: f === flavour ? 'on' : '', onclick: e => { flavour = f; e.currentTarget.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); draw(); } }, f))),
      names, h('p', { class: 'note' }, 'Click one to add it' + (sec === 'world' ? ' as a place.' : ' as a character.')));
  }
  if (sec === 'play' || sec === 'levels') {
    const said = String(ctx.get('pitch.genre') || '').toLowerCase(), named = GENRES.filter(([n]) => said.includes(n.toLowerCase().split(/[ /]/)[0])).map(([n]) => n);
    const g = genre || named.find(n => n !== 'Platformer') || named[0] || GENRES[0][0];      // the most specific genre the pitch names
    const have = new Set((ctx.get('play.verbs') || []).map(v => v.name.toLowerCase()));
    const items = GENRES.find(([n]) => n === g)[1];
    return h('div', { class: 'sec' }, h('h3', {}, 'What games like this have'),
      h('select', { onchange: e => { genre = e.target.value; e.target.closest('aside').replaceChildren(stuckPanel(sec, ctx)); } }, ...GENRES.map(([n]) => h('option', { value: n, selected: n === g }, n))),
      h('div', { class: 'gd-genre' }, ...items.map(([t, why]) => h('div', { class: 'gd-qrow' }, h('p', {}, h('b', {}, t), ' ', h('small', {}, why)),
        have.has(t.toLowerCase()) ? h('small', { class: 'note' }, 'in your doc') : h('button', { class: 'btn sm ghost', title: 'Add to Mechanics → Verbs', onclick: e => { ctx.addEntry('play.verbs', t, why); e.currentTarget.replaceWith(h('small', { class: 'note' }, 'added')); } }, '+')))),
      h('p', { class: 'note' }, 'Not a checklist to finish: pick what fits, skip what doesn\'t.'));
  }
  if (sec === 'plan') {
    const f = ctx.facts, made = [[f.cast.length, 'actors'], [f.enemies.length, 'enemies'], [f.levels.length, 'levels'], [f.scenes.length, 'scenes'], [f.dialogues.length, 'conversations'], [f.graphs.length, 'Logic graphs'], [f.icons.length, 'item icons']];
    return h('div', { class: 'sec' }, h('h3', {}, 'Made so far'), h('table', { class: 'gd-table' }, ...made.map(([n, l]) => h('tr', {}, h('td', {}, String(n)), h('td', {}, l)))),
      h('p', { class: 'note' }, 'Hold it against the scope above: a first playable usually needs one level, a hero, two enemies and an ending.'));
  }
  return null;
}
