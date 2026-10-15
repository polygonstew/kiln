// Game doc: the game's design document in one long page. Pitch, story, world and lore, characters, mechanics, levels,
// look and sound, plan, notes (the sections are in gamedoc_shape.js). Parts that the game already knows (the cast,
// enemies, controls, levels, the style) come in by themselves. Stuck? The right panel follows the section you are in
// with questions, themes, genre checklists, an idea roll and names (gamedoc_stuck.js); ✦ next to a part asks for three
// ideas that fit what is written. Kept as kiln/gamedoc-game.json (autosaved); Save writes docs/GAME.md, docs/pitch.html
// and docs/game_doc.html into the asset folder; "Pitch page" shows the one-pager to send to people.
import { h, api, toast, on, emit, download, artCtx } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { drawText, measure } from './text.js';
import { editStyle } from './style.js';
import { SECTIONS, filled } from './gamedoc_shape.js';
import { gameFacts, thumb, keyArtChoices, sceneShot, actorShot } from './gamedoc_facts.js';
import { pitchHTML, docMarkdown } from './gamedoc_pitch.js';
import { stuckPanel } from './gamedoc_stuck.js';

const ID = 'gamedoc-game';
const uid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random() * 999);
let V = {}, doc = { v: {} }, facts = null, here = 'pitch', keepT = 0, loaded = '';

export const gamedoc = {
  id: 'gamedoc', title: 'Game doc', key: '',
  mount(el) {
    el.className = 'view ws gd';
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.page = h('div', { class: 'gd-page' });
    V.scroll = h('section', { class: 'gd-scroll', onscroll: spy }, V.page);
    el.append(V.left, V.scroll, V.right);
  },
  async show() { await load(); },
  async saveProject() { await load(); await save(); },
};
on('root', () => { loaded = ''; if (V.page?.offsetParent) load(); });

/* ------------------------------------------------------------ the document ---- */
async function load() {
  if (loaded !== FS.root) {
    const d = await fetch('/api/project?id=' + ID).then(r => r.ok ? r.json() : null).catch(() => null);
    doc = d?.doc || { v: {} }; loaded = FS.root;
  }
  facts = await gameFacts();
  drawLeft(); drawPage(); drawRight();
}
const keep = () => { clearTimeout(keepT); keepT = setTimeout(() => api('/api/project', { id: ID, data: { meta: { kind: 'gamedoc', name: 'game' }, doc } }).then(() => drawMeters()).catch(e => toast('Could not keep the doc: ' + e.message, 'bad')), 700); };
const get = key => doc.v[key];
const set = (key, val) => { doc.v[key] = val; keep(); };
const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
const area = (val, ph, rows, onInput) => { const t = h('textarea', { rows: rows || 2, placeholder: ph || '', oninput: e => { onInput(e.target.value); grow(e.target); } }, val || ''); requestAnimationFrame(() => grow(t)); return t; };

function drawLeft() {
  V.meters = {};
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Game doc'),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Everything about your game in one place: to pitch it to people, and to keep it straight for yourself. It keeps itself as you type.'),
      h('div', { class: 'gd-toc' }, ...SECTIONS.map(s => h('button', { class: 'gd-tocrow' + (s.id === here ? ' on' : ''), 'data-sec': s.id, title: s.blurb, onclick: () => V.page.querySelector(`#gd-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }) },
        h('span', {}, s.title), V.meters[s.id] = h('i', { class: 'gd-meter' }))))),
    h('div', { class: 'sec' }, h('h3', {}, 'Show it'),
      h('div', { class: 'pp-row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn sm go', title: 'The one-page pitch: title, key art, hook, pillars, characters, how it plays. Opens in a new tab (print it to PDF from there)', onclick: () => show('pitch') }, 'Pitch page'),
        h('button', { class: 'btn sm', title: 'Every section on one page, in a new tab', onclick: () => show('full') }, 'Whole document'),
        h('button', { 'data-file': 'save', 'data-noun': 'doc', class: 'btn sm', title: 'Write docs/GAME.md, docs/pitch.html and docs/game_doc.html into the asset folder', onclick: save }, 'Save doc')),
      h('div', { class: 'pp-row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn sm ghost', title: 'Download the pitch page (one HTML file, pictures inside)', onclick: () => pack('pitch').then(x => download(slug() + '-pitch.html', new Blob([x], { type: 'text/html' }))) }, '↓ Pitch'),
        h('button', { class: 'btn sm ghost', title: 'Download the whole document as Markdown', onclick: () => download(slug() + '-game-doc.md', new Blob([docMarkdown(doc, facts)], { type: 'text/markdown' })) }, '↓ Markdown')),
      h('p', { class: 'note' }, 'From the pitch page, the browser\'s Print → Save as PDF makes a PDF to send.')));
  drawMeters();
}
function drawMeters() {
  for (const s of SECTIONS) { const [a, b] = filled(s, doc), m = V.meters?.[s.id]; if (m) { m.style.setProperty('--f', b ? a / b : 0); m.title = `${a} of ${b} parts written`; } }
}
const slug = () => String(get('pitch.title') || FS.root.split('/').pop()).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'game';

function drawPage() {
  V.page.replaceChildren(...SECTIONS.map(sec => h('div', { class: 'gd-sec', id: 'gd-' + sec.id, 'data-sec': sec.id },
    h('h2', {}, sec.title), h('p', { class: 'note gd-blurb' }, sec.blurb),
    ...sec.parts.map(p => part(sec, p)), thoughts(sec))));
}
// one part of a section, by its kind (gamedoc_shape.js)
function part(sec, [kind, key, label, hint, extra]) {
  const k = `${sec.id}.${key}`, head = (...more) => h('div', { class: 'gd-head' }, h('b', {}, label), h('span', { class: 'grow' }), ...more);
  const box = h('div', { class: 'gd-part' });
  if (kind === 'text') {
    const t = area(get(k), hint, extra, val => set(k, val));
    box.append(head(ideasBtn(sec, label, () => t.value, idea => { t.value = t.value.trim() ? t.value.trim() + '\n\n' + idea : idea; set(k, t.value); grow(t); })), t);
  } else if (kind === 'list') {
    const rows = h('div', { class: 'gd-list' }), items = () => (doc.v[k] ||= []);
    const draw = () => rows.replaceChildren(...items().map((it, i) => entry(k, it, extra, draw, i)), h('button', { class: 'btn sm ghost', title: 'Add one', onclick: () => { items().push({ id: uid(), name: '', text: '' }); keep(); draw(); rows.querySelectorAll('.gd-entry input[type=text]')[items().length - 1]?.focus(); } }, '+ Add'));
    box.append(head(ideasBtn(sec, label, () => items().map(i => i.name).join(', '), idea => { const [n, ...r] = idea.split(':'); items().push({ id: uid(), name: r.length ? n.trim() : idea.slice(0, 40), text: r.length ? r.join(':').trim() : '' }); keep(); draw(); })),
      h('p', { class: 'note gd-hint' }, hint), rows);
    draw();
  } else if (kind === 'themes') {
    const tags = h('div', { class: 'gd-tags' }), input = h('input', { type: 'text', placeholder: 'Type a theme and press Enter', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { toggleTheme(e.target.value.trim(), true); e.target.value = ''; } } });
    V.themes = () => tags.replaceChildren(...(get(k) || []).map(t => h('span', { class: 'gd-tag' }, t, h('button', { class: 'ibtn', title: 'Remove', onclick: () => toggleTheme(t, false) }, '✕'))));
    V.themes();
    box.append(head(), h('p', { class: 'note gd-hint' }, hint), tags, input);
  } else if (kind === 'keyart') {
    box.append(head(), h('p', { class: 'note gd-hint' }, hint), keyArt(k));
  } else if (kind === 'facts') {
    box.append(head(), h('p', { class: 'note gd-hint' }, hint), factsPart(key));
  }
  return box;
}
function entry(k, it, fields, redraw, i) {
  const list = doc.v[k];
  const links = [['', 'not linked'], ...facts.levels.map(n => ['level:' + n, 'Level: ' + n]), ...facts.scenes.map(n => ['scene:' + n, 'Scene: ' + n])];
  return h('div', { class: 'gd-entry' + (it.done ? ' done' : '') },
    fields.includes('done') ? h('input', { type: 'checkbox', checked: !!it.done, title: 'Done', onchange: e => { it.done = e.target.checked; keep(); redraw(); } }) : '',
    h('div', { class: 'gd-entry-b' },
      h('input', { type: 'text', value: it.name || '', placeholder: 'Name', oninput: e => { it.name = e.target.value; keep(); } }),
      area(it.text, 'What it is, why it matters', 1, val => { it.text = val; keep(); }),
      fields.includes('link') ? h('select', { title: 'Link it to a level or scene', onchange: e => { it.link = e.target.value; keep(); } }, ...links.map(([v, l]) => h('option', { value: v, selected: (it.link || '') === v }, l))) : ''),
    h('div', { class: 'gd-entry-a' },
      h('button', { class: 'ibtn', title: 'Move up', disabled: i === 0, onclick: () => { list.splice(i - 1, 0, list.splice(i, 1)[0]); keep(); redraw(); } }, '↑'),
      h('button', { class: 'ibtn', title: 'Remove', onclick: () => { if (it.name || it.text) { if (!confirm(`Remove "${it.name || 'this'}"?`)) return; } list.splice(i, 1); keep(); redraw(); } }, '✕')));
}
// questions answered from the Stuck? panel, at the end of their section
function thoughts(sec) {
  const k = `${sec.id}.thoughts`, box = h('div', { class: 'gd-part gd-thoughts' });
  const draw = () => {
    const list = doc.v[k] || [];
    box.style.display = list.length ? '' : 'none';
    box.replaceChildren(h('div', { class: 'gd-head' }, h('b', {}, 'Things you thought about')), ...list.map((t, i) => h('div', { class: 'gd-entry' },
      h('div', { class: 'gd-entry-b' }, h('i', { class: 'gd-q' }, t.name), area(t.text, 'Your answer', 1, val => { t.text = val; keep(); })),
      h('div', { class: 'gd-entry-a' }, h('button', { class: 'ibtn', title: 'Remove', onclick: () => { list.splice(i, 1); keep(); draw(); } }, '✕')))));
  };
  box.redraw = draw; draw();
  return box;
}
function toggleTheme(t, on) {
  const k = 'story.themes', cur = get(k) || [];
  set(k, on ? (cur.includes(t) ? cur : [...cur, t]) : cur.filter(x => x !== t));
  V.themes?.(); drawRight();
}

/* --------------------------------------------------- parts from the game ---- */
function factsPart(kind) {
  const box = h('div', { class: 'gd-facts' });
  if (kind === 'cast') {
    const notes = (doc.v['cast.notes'] ||= {});
    if (!facts.cast.length) return h('p', { class: 'note' }, 'No actors yet: make one in Forge or Animate and it appears here.');
    for (const a of facts.cast) {
      const n = (notes[a.name] ||= {}), pic = h('i', { class: 'gd-pic' });
      thumb(a.name).then(s => s && Object.assign(pic.style, s));
      const f = (key, ph) => h('input', { type: 'text', value: n[key] || '', placeholder: ph, oninput: e => { n[key] = e.target.value; keep(); } });
      box.append(h('div', { class: 'gd-cast' }, pic, h('div', { class: 'gd-entry-b' },
        h('div', { class: 'gd-head' }, h('b', {}, a.name.replace(/_/g, ' ')), h('small', {}, a.role), h('span', { class: 'grow' }),
          h('button', { class: 'ibtn', title: 'Open in Animate', onclick: () => emit('open-actor', `${FS.root}/sprites/${a.name}`) }, '↗')),
        a.desc ? h('p', { class: 'note', style: { margin: '0 0 4px' } }, a.desc) : '',
        f('want', 'Wants…'), f('flaw', 'Flaw or fear…'), f('voice', 'How they talk…'),
        area(n.notes, 'Notes: history, secrets, who they know', 1, val => { n.notes = val; keep(); }))));
    }
  } else if (kind === 'controls') {
    box.append(h('table', { class: 'gd-table' }, h('tr', {}, h('th', {}, 'Action'), h('th', {}, 'Keys'), h('th', {}, 'Gamepad')),
      ...facts.controls.map(c => h('tr', {}, h('td', {}, c.what), h('td', {}, c.keys), h('td', {}, c.pad)))));
  } else if (kind === 'enemies') {
    box.append(facts.enemies.length ? h('div', { class: 'gd-chips' }, ...facts.enemies.map(a => h('button', { class: 'gd-chip', title: 'Open in Animate', onclick: () => emit('open-actor', `${FS.root}/sprites/${a.name}`) }, a.name, h('small', {}, a.role))))
      : h('p', { class: 'note' }, 'No enemies yet: give an actor the enemy, boss or flyer role in Animate → Workshop.'));
  } else if (kind === 'levels') {
    const notes = (doc.v['levels.notes'] ||= {});
    if (!facts.levels.length) return h('p', { class: 'note' }, 'No levels yet: paint one in Levels.');
    for (const n of facts.levels) box.append(h('div', { class: 'gd-cast' }, h('div', { class: 'gd-entry-b' },
      h('div', { class: 'gd-head' }, h('b', {}, n), h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Open in Levels', onclick: () => emit('open-level', n) }, '↗')),
      area(notes[n], 'What happens here, what it teaches, its secret', 1, val => { notes[n] = val; keep(); }))));
  } else if (kind === 'systems') {
    box.append(h('p', { class: 'note' }, facts.graphs.length ? 'Logic graphs: ' + facts.graphs.join(', ') : 'No Logic graphs yet.'),
      h('p', { class: 'note' }, facts.dialogues.length ? 'Conversations: ' + facts.dialogues.join(', ') : 'No conversations yet.'));
  } else if (kind === 'look') {
    box.append(h('p', {}, facts.style.words || 'No style bible yet.'),
      facts.style.palette.length ? h('div', { class: 'gd-swatches' }, ...facts.style.palette.map(c => h('i', { style: { background: `rgb(${c.join(',')})` } }))) : '',
      h('div', { class: 'pp-row' }, h('button', { class: 'btn sm ghost', onclick: editStyle }, 'Edit the style bible'), facts.scenes.length ? h('span', { class: 'note' }, 'Scenes: ' + facts.scenes.join(', ')) : ''));
  }
  return box;
}
function keyArt(k) {
  const cv = h('div', { class: 'gd-keyart' }), choices = keyArtChoices(facts), cur = get(k) || choices[0] || null;
  const paint = async c => { cv.replaceChildren(); const shot = c && (c.kind === 'scene' ? await sceneShot(c.name) : await actorShot(c.name, 200)); if (shot) cv.append(shot); else cv.append(h('p', { class: 'note' }, choices.length ? 'Save it for Godot first (its area\'s Save), then it shows here.' : 'Make a scene or an actor and pick it here.')); };
  paint(cur);
  return h('div', {}, choices.length ? h('select', { onchange: e => { const c = choices[+e.target.value] || null; set(k, c); paint(c); } },
    ...choices.map((c, i) => h('option', { value: i, selected: cur && c.kind === cur.kind && c.name === cur.name }, c.label))) : '', cv);
}

/* ------------------------------------------------------- ideas (free text) ---- */
function ideasBtn(sec, label, current, use) {
  return h('button', { class: 'ibtn gd-spark', title: 'Three ideas that fit what you have written', onclick: async e => {
    const host = e.currentTarget.closest('.gd-part'); host.querySelector('.gd-ideas')?.remove();
    const box = h('div', { class: 'gd-ideas' }, h('p', { class: 'note' }, 'Thinking…'));
    host.querySelector('.gd-head').after(box);
    const r = await api('/api/write', { part: label, section: sec.title, doc: docMarkdown(doc, facts), text: current() }).catch(err => ({ err: err.message }));
    if (r.err || !r.ideas?.length) return box.replaceChildren(h('p', { class: 'note' }, r.err || 'No ideas came back: try again.'), h('button', { class: 'ibtn', onclick: () => box.remove() }, '✕'));
    box.replaceChildren(h('div', { class: 'gd-head' }, h('small', {}, 'Ideas: use one, or let them start you off'), h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Close', onclick: () => box.remove() }, '✕')),
      ...r.ideas.map(t => h('div', { class: 'gd-idea' }, h('p', {}, t), h('button', { class: 'btn sm ghost', onclick: ev => { use(t); ev.currentTarget.textContent = 'Used'; ev.currentTarget.disabled = true; } }, 'Use'))));
  } }, '✦');
}

/* ------------------------------------------------- the panel that follows ---- */
function spy() {
  const top = V.scroll.getBoundingClientRect().top + 90;
  let cur = SECTIONS[0].id;
  for (const s of V.page.children) if (s.getBoundingClientRect().top < top) cur = s.dataset.sec;
  if (cur === here) return;
  here = cur;
  V.left.querySelectorAll('.gd-tocrow').forEach(b => b.classList.toggle('on', b.dataset.sec === here));
  drawRight();
}
function drawRight() {
  if (!facts) return;
  V.right.replaceChildren(stuckPanel(here, {
    doc, facts, get, set,
    think: q => { const k = `${here}.thoughts`; (doc.v[k] ||= []).push({ id: uid(), name: q, text: '' }); keep(); const t = V.page.querySelector(`#gd-${here} .gd-thoughts`); t.redraw(); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.querySelectorAll('textarea')[doc.v[k].length - 1]?.focus(); },
    theme: (t, on) => toggleTheme(t, on),
    addEntry: (k, name, text) => { (doc.v[k] ||= []).push({ id: uid(), name, text }); keep(); const y = V.scroll.scrollTop; drawPage(); V.scroll.scrollTop = y; },
    useLogline: t => { set('pitch.logline', t); drawPage(); },
  }));
}

/* ------------------------------------------------------- show and save ---- */
// the page with its pictures inside: the key art, the title in a pixel font, each actor's first frame
async function pack(mode) {
  facts = await gameFacts();
  const pics = { cast: {} }, ka = get('pitch.keyart') || keyArtChoices(facts)[0];
  const art = ka && (ka.kind === 'scene' ? await sceneShot(ka.name) : await actorShot(ka.name, 270));
  if (art) { const c = h('canvas', { width: art.width * 2, height: art.height * 2 }), x = c.getContext('2d'); artCtx(x, 2); x.drawImage(art, 0, 0, c.width, c.height); pics.keyart = c.toDataURL('image/png'); }
  const title = String(get('pitch.title') || '').trim();
  if (title) {
    const m = measure(title, 'large', 1), s = 4, c = h('canvas', { width: (m.w + 2) * s, height: (m.h + 2) * s });
    drawText(c.getContext('2d'), title, 0, 0, { font: 'large', spacing: 1, scale: s, color: '#ff5b2e', shadow: '#5a1f0d' });
    pics.title = c.toDataURL('image/png');
  }
  for (const a of facts.cast) { const c = await actorShot(a.name, 150); if (c) pics.cast[a.name] = c.toDataURL('image/png'); }
  return pitchHTML(doc, facts, pics, mode);
}
async function show(mode) {
  const w = window.open('', '_blank');
  const html = await pack(mode);
  if (w) { w.document.open(); w.document.write(html); w.document.close(); } else download(slug() + (mode === 'pitch' ? '-pitch' : '-game-doc') + '.html', new Blob([html], { type: 'text/html' }));
}
async function save() {
  const [pitch, full] = [await pack('pitch'), await pack('full')];
  await saveFiles('docs', [{ name: 'GAME.md', text: docMarkdown(doc, facts) }, { name: 'pitch.html', text: pitch }, { name: 'game_doc.html', text: full }]);
  toast('Saved docs/GAME.md, docs/pitch.html and docs/game_doc.html', 'ok');
}
