// Dialogue: conversations for the game, written as lines. Each line has a speaker (the cast: names, each can be an
// actor), the words, an optional voice line (recorded in Puppet, with lip sync), and then: the next line, a jump,
// the end, or choices (each with a condition on items or flags and things it does). The preview plays it. Save
// writes dialogue/<name>.json and the runner (dialogue_godot.js) that plays it through the Kiln HUD in Godot.
import { h, api, toast, pref, select } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { listScenes } from './playbuild.js';
import { gameJSON, DIALOGUE_GD } from './dialogue_godot.js';
import { dialoguePlayer } from './dialogue_play.js';
import { openProjects } from './projects.js';

const IFS = [['', 'always'], ['item', 'if has item'], ['noitem', 'if lacks item'], ['flag', 'if flag set'], ['noflag', 'if flag not set']];
const DOS = [['', 'does nothing'], ['give', 'gives item'], ['take', 'takes item'], ['flag', 'sets flag'], ['unflag', 'clears flag'], ['message', 'messages Logic']];
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
const newBeat = () => ({ id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 99), who: '', text: '', voice: '', next: '', choices: [], do: [] });
let V = {}, D = null, list = [], actors = [], voices = {}, keepT = 0;

export const dialogue = {
  id: 'dialogue', title: 'Dialogue', key: '',
  mount(el) {
    el.className = 'view ws';
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.name = h('span', { class: 'mono', style: { fontSize: '12px' } }); V.state = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
    V.list = h('div', { class: 'dl-list' });
    V.play = dialoguePlayer();
    el.append(V.left, h('section', { class: 'stage', style: { display: 'flex', flexDirection: 'column' } },
      h('div', { class: 'bar' }, V.name, V.state, h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Play it in the preview from the first line', onclick: () => D && V.play.load(D) }, '▶ Play'),
        h('button', { class: 'btn sm go', title: 'Write dialogue/<name>.json and its runner for the game', onclick: save }, 'Save')),
      h('div', { class: 'dl-scroll' }, V.list)), V.right);
    V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Play it', h('small', {}, 'Space / click: go on')), V.play.el),
      h('div', { class: 'sec' }, h('h3', {}, 'In the game'), h('p', { class: 'note', style: { marginTop: 0 } }, 'Start it from a Logic graph ("Start a dialogue", e.g. when the player enters a zone); "When a dialogue ends" and "Dialogue flag is set" carry on from it. Lines show in the HUD\'s dialogue box (HUD → add a Dialogue widget), or a plain box if the HUD has none; voice lines move the speaker\'s mouth; the player stands still until it ends.')));
    refresh();
  },
  show() { refresh(); },
  hide() { V.play?.stop(); },
};

/* -------------------------------------------------------------- lists ---- */
async function refresh() {
  list = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'dialogue').sort((a, b) => a.name.localeCompare(b.name));
  actors = (await listScenes('sprites')).map(([n]) => n);
  voices = {};
  for (const a of actors) voices[a] = ((await api('/api/fs?path=' + encodeURIComponent(`${FS.root}/sprites/${a}/voice`)).catch(() => ({ items: [] }))).items || [])
    .filter(i => i.name.endsWith('.lipsync.json')).map(i => [`sprites/${a}/voice/${i.name}`, i.name.replace('.lipsync.json', '')]);
  if (!D && pref.get('dialogue.cur', '') && list.some(p => p.name === pref.get('dialogue.cur', ''))) return open(pref.get('dialogue.cur', ''));
  drawLeft(); if (D) drawBeats(); else V.list.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'No dialogue open'), h('p', {}, 'Make one on the left: a conversation, line by line, with choices.')));
}
function drawLeft() {
  V.left.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Dialogues', h('span', { class: 'grow' }), h('small', {}, list.length || '')),
    ...list.map(p => h('button', { class: 'lg-file' + (D?.name === p.name ? ' on' : ''), title: `dialogue/${p.name}.json`, onclick: () => open(p.name) }, p.name)),
    h('div', { style: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', title: 'A new conversation', onclick: create }, 'New dialogue'),
      list.length ? h('button', { class: 'btn sm ghost', title: 'Rename, copy, remove or bring back dialogues', onclick: manage }, 'Manage…') : '',
      D ? h('button', { class: 'btn sm ghost danger', title: 'Delete this dialogue (its game file goes to .trash)', onclick: remove }, 'Delete') : '')),
    D ? h('div', { class: 'sec' }, h('h3', {}, 'Cast', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', title: 'Someone who speaks', onclick: addCast }, '+ Speaker')),
      D.cast.length ? h('div', { class: 'dl-cast' }, ...D.cast.map(castRow)) : h('p', { class: 'note', style: { marginTop: 0 } }, 'Who speaks. Link a speaker to an actor and its voice lines (Puppet → Voice line…) and mouth come along.')) : '');
}
function castRow(c) {
  return h('div', { class: 'dl-castrow' },
    h('input', { type: 'text', value: c.name, title: 'The name shown in the dialogue box', onchange: e => { const n = e.target.value.trim() || c.name; for (const b of D.beats) if (b.who === c.name) b.who = n; c.name = n; changed(); drawLeft(); drawBeats(); } }),
    select([['', 'no actor'], ...actors.map(a => [a, a])], c.actor || '', v => { c.actor = v; changed(); drawBeats(); }),
    h('button', { class: 'ibtn', title: 'Remove from the cast', onclick: () => { D.cast = D.cast.filter(x => x !== c); changed(); drawLeft(); drawBeats(); } }, '✕'));
}
function addCast() { let n = 'Someone', k = 2; while (D.cast.some(c => c.name === n)) n = 'Someone ' + k++; D.cast.push({ name: n, actor: '' }); changed(); drawLeft(); drawBeats(); }

/* ------------------------------------------------------------- the lines ---- */
function drawBeats() {
  V.name.textContent = 'dialogue · ' + D.name;
  V.list.replaceChildren(...D.beats.map(beatCard), h('button', { class: 'btn dl-add', title: 'Another line at the end', onclick: () => { D.beats.push(newBeat()); changed(); drawBeats(); } }, '+ Line'));
}
const targets = b => [['', 'the next line'], ['end', 'the end'], ...D.beats.filter(x => x !== b).map(x => [x.id, `line ${D.beats.indexOf(x) + 1}: ${(x.text || '…').slice(0, 26)}`])];
function beatCard(b, i) {
  const actor = D.cast.find(c => c.name === b.who)?.actor, vs = voices[actor] || [];
  const ta = h('textarea', { class: 'dl-text', rows: 2, placeholder: 'What they say…', oninput: e => { b.text = e.target.value; grow(e.target); changed(); } }, b.text || '');
  const move = d => { const j = i + d; if (j < 0 || j >= D.beats.length) return; [D.beats[i], D.beats[j]] = [D.beats[j], D.beats[i]]; changed(); drawBeats(); };
  const fx = (arr, x) => h('div', { class: 'dl-fx' }, select(DOS, x.k || '', v => { x.k = v; changed(); }), h('input', { type: 'text', value: x.v || '', placeholder: 'name', oninput: e => { x.v = e.target.value; changed(); } }),
    h('button', { class: 'ibtn', title: 'Remove', onclick: () => { arr.splice(arr.indexOf(x), 1); changed(); drawBeats(); } }, '✕'));
  const choice = c => h('div', { class: 'dl-ch' },
    h('div', { class: 'dl-chrow' }, h('span', { class: 'dl-arrow' }, '▸'), h('input', { type: 'text', value: c.text || '', placeholder: 'The choice…', oninput: e => { c.text = e.target.value; changed(); } }),
      h('span', { class: 'faint' }, '→'), select(targets(b), c.next || '', v => { c.next = v; changed(); }),
      h('button', { class: 'ibtn', title: 'Remove this choice', onclick: () => { b.choices = b.choices.filter(x => x !== c); changed(); drawBeats(); } }, '✕')),
    h('div', { class: 'dl-chrow sub' }, select(IFS, c.if?.k || '', v => { c.if = { ...(c.if || {}), k: v }; changed(); drawBeats(); }),
      c.if?.k ? h('input', { type: 'text', value: c.if.v || '', placeholder: c.if.k.includes('item') ? 'item' : 'flag', oninput: e => { c.if.v = e.target.value; changed(); } }) : '',
      ...(c.do || []).map(x => fx(c.do, x)), h('button', { class: 'btn sm ghost', title: 'Something this choice does (give or take an item, set a flag, message Logic)', onclick: () => { (c.do ||= []).push({ k: 'flag', v: '' }); changed(); drawBeats(); } }, '+ does')));
  return h('div', { class: 'dl-beat' },
    h('div', { class: 'dl-head' }, h('b', { class: 'dl-n' }, '#' + (i + 1)),
      select([['', 'Narrator'], ...D.cast.map(c => [c.name, c.name])], b.who || '', v => { b.who = v; b.voice = ''; changed(); drawBeats(); }),
      actor ? select([['', vs.length ? 'no voice' : 'no voice lines yet'], ...vs], b.voice || '', v => { b.voice = v; changed(); }) : '',
      h('span', { class: 'grow' }),
      h('button', { class: 'ibtn', title: 'Move up', onclick: () => move(-1) }, '↑'), h('button', { class: 'ibtn', title: 'Move down', onclick: () => move(1) }, '↓'),
      h('button', { class: 'ibtn', title: 'Insert a line after this one', onclick: () => { D.beats.splice(i + 1, 0, { ...newBeat(), who: b.who }); changed(); drawBeats(); } }, '+'),
      h('button', { class: 'ibtn', title: 'Delete this line', onclick: () => { D.beats.splice(i, 1); for (const x of D.beats) { if (x.next === b.id) x.next = ''; for (const c of x.choices || []) if (c.next === b.id) c.next = ''; } if (!D.beats.length) D.beats.push(newBeat()); changed(); drawBeats(); } }, '✕')),
    ta,
    ...(b.do || []).map(x => fx(b.do, x)),
    b.choices?.length ? h('div', { class: 'dl-chs' }, ...b.choices.map(choice)) : '',
    h('div', { class: 'dl-foot' },
      b.choices?.length ? h('span', { class: 'note', style: { margin: 0 } }, 'The choices decide what comes next.') : h('span', { class: 'dl-then' }, 'then ', select(targets(b), b.next || '', v => { b.next = v; changed(); })),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', title: 'Something this line does when it shows (give or take an item, set a flag, message Logic)', onclick: () => { (b.do ||= []).push({ k: 'give', v: '' }); changed(); drawBeats(); } }, '+ does'),
      h('button', { class: 'btn sm', title: 'A choice for the player', onclick: () => { (b.choices ||= []).push({ text: '', next: '', do: [] }); changed(); drawBeats(); } }, '+ Choice')));
}
const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };

/* --------------------------------------------------------- keeping it ---- */
function changed() { V.state.textContent = '● not saved for the game yet'; clearTimeout(keepT); keepT = setTimeout(keep, 1200); }
const keep = () => D && api('/api/project', { id: 'dialogue-' + D.name, data: { meta: { kind: 'dialogue', name: D.name }, dialogue: D } }).catch(e => toast('Could not keep the dialogue: ' + e.message, 'bad'));
async function open(name) {
  const d = await fetch('/api/project?id=dialogue-' + encodeURIComponent(name)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!d?.dialogue) return toast('Could not open ' + name, 'bad');
  D = d.dialogue; D.cast ||= []; D.beats ||= [newBeat()];
  pref.set('dialogue.cur', name); V.state.textContent = '';
  drawLeft(); drawBeats(); V.play.load(D);
  requestAnimationFrame(() => V.list.querySelectorAll('.dl-text').forEach(grow));
}
// rename / copy / remove / restore: the game file is named after the dialogue, so the old one goes to .trash
const trashGame = async n => { await api('/api/fs', { op: 'mkdir', path: FS.root + '/.trash' }); await api('/api/fs', { op: 'rename', path: `${FS.root}/dialogue/${n}.json`, to: `${FS.root}/.trash/${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-dialogue__${n}.json` }).catch(() => {}); };
const manage = () => openProjects('dialogue', { current: D?.name, open: p => open(p.name),
  renamed: n => { D.name = n; pref.set('dialogue.cur', n); V.state.textContent = '● not saved for the game yet'; drawBeats(); }, removed: () => { D = null; pref.set('dialogue.cur', ''); },
  afterRename: async old => { await trashGame(old); toast('Save the renamed dialogue for the game, and pick it again in Logic nodes that started the old name', 'ok'); refresh(); },
  afterRemove: async n => { await trashGame(n); refresh(); } });
async function create() {
  const name = slug(prompt('Name for the dialogue (its game file is dialogue/<name>.json)', 'miner_greeting') || '');
  if (!name) return;
  if (list.some(p => p.name === name)) return toast(`There is already a dialogue "${name}"`, 'bad');
  D = { name, cast: [{ name: 'Stranger', actor: '' }], beats: [{ ...newBeat(), who: 'Stranger', text: 'You there. You lost?' }] };
  await keep(); await refresh(); open(name);
}
async function remove() {
  if (!D || !confirm(`Delete the dialogue "${D.name}"? Its game file goes to the .trash folder.`)) return;
  await api('/api/project/delete', { id: 'dialogue-' + D.name });
  await api('/api/fs', { op: 'trash', path: `${FS.root}/dialogue/${D.name}.json` }).catch(() => {});
  toast('Deleted ' + D.name); D = null; pref.set('dialogue.cur', ''); refresh();
}
async function save() {
  if (!D) return;
  clearTimeout(keepT); await keep();
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + FS.root.slice(g.root.length + 1) + '/' : 'res://';
  try {
    await saveFiles('dialogue', [{ name: D.name + '.json', text: JSON.stringify(gameJSON(D, res), null, 1) + '\n' }, { name: 'kiln_dialogue.gd', text: DIALOGUE_GD }]);
    V.state.textContent = ''; toast(`Saved dialogue/${D.name}.json`, 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
