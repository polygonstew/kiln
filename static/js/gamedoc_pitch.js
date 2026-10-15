// The Game doc as something to show: a one-page pitch (HTML, pictures inside, prints well) and the whole document
// (the same page with every section, and Markdown for docs/GAME.md). Pure functions: the doc, the game's facts and
// the pictures (data URLs) go in, text comes out.
import { SECTIONS } from './gamedoc_shape.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const paras = s => String(s || '').trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const v = (doc, key) => doc.v[key];
const has = x => Array.isArray(x) ? x.length > 0 : !!String(x || '').trim();

const CSS = `
:root { --ir: pixelated; --bg: #151514; --p: #1e1e1c; --ink: #e9e5d9; --dim: #a29e92; --line: #34332f; --ember: #ff5b2e; }
* { box-sizing: border-box; } :root[data-look="modern"] { --ir: auto; } body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 'IBM Plex Sans', system-ui, sans-serif; }
.page { max-width: 920px; margin: 0 auto; padding: 0 24px 60px; }
.art { width: 100%; image-rendering: var(--ir); display: block; border-bottom: 3px solid var(--ember); }
.title { margin: 28px 0 6px; } .title img { image-rendering: var(--ir); max-width: 100%; } .title h1 { font-size: 46px; margin: 0; letter-spacing: .02em; }
.logline { font-size: 21px; color: var(--ink); margin: 6px 0 18px; max-width: 760px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 26px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 24px; }
.facts div { font-size: 14px; } .facts b { display: block; font: 600 11px 'IBM Plex Sans Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
h2 { font: 600 13px 'IBM Plex Sans Condensed', sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--ember); margin: 34px 0 10px; }
h3 { font-size: 16px; margin: 16px 0 4px; }
.hook { font-size: 20px; border-left: 3px solid var(--ember); padding: 4px 0 4px 18px; margin: 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card { background: var(--p); border: 1px solid var(--line); padding: 12px 14px; } .card b { display: block; margin-bottom: 4px; } .card p { margin: 0; color: var(--dim); font-size: 14px; }
.cast { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.cast .card img { width: 100%; height: 150px; object-fit: contain; image-rendering: var(--ir); background: #0e0e0d; margin-bottom: 8px; }
.tags span { display: inline-block; border: 1px solid var(--line); padding: 2px 10px; margin: 0 6px 6px 0; font-size: 14px; }
table { border-collapse: collapse; font-size: 14px; } td { padding: 3px 18px 3px 0; border-bottom: 1px solid var(--line); } td:first-child { color: var(--dim); }
.done { text-decoration: line-through; color: var(--dim); }
.swatches span { display: inline-block; width: 22px; height: 22px; margin-right: 3px; border: 1px solid #0008; }
footer { margin-top: 50px; color: var(--dim); font-size: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
@media print { body { background: #fff; color: #111; } :root { --p: #f4f2ec; --ink: #111; --dim: #555; --line: #ccc; } .art { border-bottom-color: var(--ember); } }
`;

function listHTML(items, cls = 'cards') {
  return `<div class="${cls}">${items.map(i => `<div class="card${i.done ? ' done' : ''}"><b>${esc(i.name)}</b>${i.text ? `<p>${esc(i.text)}</p>` : ''}</div>`).join('')}</div>`;
}
function castHTML(doc, facts, pics) {
  const notes = v(doc, 'cast.notes') || {};
  const cards = facts.cast.map(a => {
    const n = notes[a.name] || {}, lines = [n.want && `Wants: ${n.want}`, n.flaw && `Flaw: ${n.flaw}`, n.voice && `Voice: ${n.voice}`].filter(Boolean);
    return `<div class="card">${pics.cast?.[a.name] ? `<img src="${pics.cast[a.name]}" alt="">` : ''}<b>${esc(a.name.replace(/_/g, ' '))}</b><p>${esc(a.role)}${a.desc ? ' · ' + esc(a.desc) : ''}</p>${lines.map(l => `<p>${esc(l)}</p>`).join('')}${n.notes ? `<p>${esc(n.notes)}</p>` : ''}</div>`;
  });
  const more = (v(doc, 'cast.people') || []).map(i => `<div class="card"><b>${esc(i.name)}</b><p>${esc(i.text)}</p></div>`);
  return cards.length + more.length ? `<div class="cast">${[...cards, ...more].join('')}</div>` : '';
}
function factHTML(kind, doc, facts) {
  if (kind === 'cast') return '';
  if (kind === 'controls') return `<table>${facts.controls.map(c => `<tr><td>${esc(c.what)}</td><td>${esc(c.keys)}</td><td>${esc(c.pad)}</td></tr>`).join('')}</table>`;
  if (kind === 'enemies') return facts.enemies.length ? listHTML(facts.enemies.map(a => ({ name: a.name.replace(/_/g, ' '), text: `${a.role}${a.desc ? ': ' + a.desc : ''}` }))) : '';
  if (kind === 'levels') { const notes = v(doc, 'levels.notes') || {}; return facts.levels.length ? listHTML(facts.levels.map(n => ({ name: n.replace(/_/g, ' '), text: notes[n] || '' }))) : ''; }
  if (kind === 'systems') return facts.graphs.length + facts.dialogues.length ? `<p>${[facts.graphs.length && `Rules (Logic graphs): ${facts.graphs.join(', ')}`, facts.dialogues.length && `Conversations: ${facts.dialogues.join(', ')}`].filter(Boolean).map(esc).join('<br>')}</p>` : '';
  if (kind === 'look') return `<p>${esc(facts.style.words)}</p>${facts.style.palette.length ? `<div class="swatches">${facts.style.palette.map(c => `<span style="background:rgb(${c.join(',')})"></span>`).join('')}</div>` : ''}${facts.scenes.length ? `<p>Scenes: ${esc(facts.scenes.join(', '))}</p>` : ''}`;
  return '';
}
function sectionHTML(sec, doc, facts, pics) {
  const out = [];
  for (const [kind, key, label] of sec.parts) {
    const val = v(doc, `${sec.id}.${key}`);
    if (kind === 'keyart' || (sec.id === 'pitch' && ['title', 'logline', 'genre', 'compare', 'tone', 'audience', 'hook'].includes(key))) continue;
    if (kind === 'text' && has(val)) out.push(`<h3>${esc(label)}</h3>${paras(val)}`);
    if (kind === 'list' && has(val)) out.push(`<h3>${esc(label)}</h3>${listHTML(val)}`);
    if (kind === 'themes' && has(val)) out.push(`<h3>${esc(label)}</h3><div class="tags">${val.map(t => `<span>${esc(t)}</span>`).join('')}</div>`);
    if (kind === 'facts') { const f = key === 'cast' ? castHTML(doc, facts, pics) : factHTML(key, doc, facts); if (f) out.push(`<h3>${esc(label)}</h3>${f}`); }
  }
  const thoughts = (v(doc, `${sec.id}.thoughts`) || []).filter(t => has(t.text));
  if (thoughts.length) out.push(`<h3>Things thought through</h3>${thoughts.map(t => `<p><b>${esc(t.name)}</b><br>${esc(t.text)}</p>`).join('')}`);
  return out.length ? `<h2>${esc(sec.title)}</h2>${out.join('')}` : '';
}

// mode 'pitch': the one-pager (pitch, hook, pillars, cast, the core of play, the world in short); 'full': every section
export function pitchHTML(doc, facts, pics, mode = 'pitch') {
  const title = v(doc, 'pitch.title') || 'Untitled game';
  const top = [['Genre', 'pitch.genre'], ['It is like', 'pitch.compare'], ['Tone', 'pitch.tone'], ['Who it is for', 'pitch.audience']].filter(([, k]) => has(v(doc, k)));
  const body = [];
  if (has(v(doc, 'pitch.hook'))) body.push(`<h2>The hook</h2><p class="hook">${esc(v(doc, 'pitch.hook'))}</p>`);
  if (mode === 'pitch') {
    if (has(v(doc, 'pitch.pillars'))) body.push(`<h2>Pillars</h2>${listHTML(v(doc, 'pitch.pillars'))}`);
    const cast = castHTML(doc, facts, pics); if (cast) body.push(`<h2>Characters</h2>${cast}`);
    const play = [has(v(doc, 'play.loop')) && `<h3>Core loop</h3>${paras(v(doc, 'play.loop'))}`, has(v(doc, 'play.verbs')) && `<h3>What you do</h3>${listHTML(v(doc, 'play.verbs'))}`].filter(Boolean);
    if (play.length) body.push(`<h2>How it plays</h2>${play.join('')}`);
    const world = [has(v(doc, 'world.setting')) && paras(v(doc, 'world.setting')), has(v(doc, 'world.places')) && listHTML(v(doc, 'world.places'))].filter(Boolean);
    if (world.length) body.push(`<h2>The world</h2>${world.join('')}`);
    if (has(v(doc, 'story.premise')) || has(v(doc, 'story.themes'))) body.push(`<h2>The story</h2>${paras(v(doc, 'story.premise'))}${has(v(doc, 'story.themes')) ? `<div class="tags">${v(doc, 'story.themes').map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`);
  } else for (const sec of SECTIONS) body.push(sectionHTML(sec, doc, facts, pics));
  return `<!doctype html><html lang="en"${facts.look === 'modern' ? ' data-look="modern"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@600&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
${pics.keyart ? `<img class="art" src="${pics.keyart}" alt="">` : ''}<div class="page">
<div class="title">${pics.title ? `<img src="${pics.title}" alt="${esc(title)}">` : `<h1>${esc(title)}</h1>`}</div>
${has(v(doc, 'pitch.logline')) ? `<p class="logline">${esc(v(doc, 'pitch.logline'))}</p>` : ''}
${top.length ? `<div class="facts">${top.map(([l, k]) => `<div><b>${l}</b>${esc(v(doc, k))}</div>`).join('')}</div>` : ''}
${body.filter(Boolean).join('\n')}
<footer>${esc(title)} · ${mode === 'pitch' ? 'pitch' : 'game design document'} · ${new Date().toLocaleDateString()}</footer></div></body></html>`;
}

// the whole document as Markdown (docs/GAME.md): readable in any editor, on GitHub, in Godot's script editor
export function docMarkdown(doc, facts) {
  const L = [`# ${v(doc, 'pitch.title') || 'Untitled game'}`, ''];
  const mdList = items => items.map(i => `- ${i.done ? '[x] ' : ''}**${i.name}**${i.text ? ': ' + i.text.replace(/\n/g, ' ') : ''}${i.link ? ` (${i.link})` : ''}`).join('\n');
  for (const sec of SECTIONS) {
    const out = [];
    for (const [kind, key, label] of sec.parts) {
      const val = v(doc, `${sec.id}.${key}`);
      if (kind === 'text' && has(val)) out.push(`**${label}**\n\n${val.trim()}`);
      if (kind === 'list' && has(val)) out.push(`**${label}**\n\n${mdList(val)}`);
      if (kind === 'themes' && has(val)) out.push(`**${label}**: ${val.join(', ')}`);
      if (kind === 'facts' && key === 'cast' && facts.cast.length) {
        const notes = v(doc, 'cast.notes') || {};
        out.push(`**${label}**\n\n` + facts.cast.map(a => { const n = notes[a.name] || {}; return `- **${a.name}** (${a.role})${a.desc ? ': ' + a.desc : ''}${['want', 'flaw', 'voice', 'notes'].filter(k => n[k]).map(k => `\n  - ${k}: ${n[k]}`).join('')}`; }).join('\n'));
      }
      if (kind === 'facts' && key === 'controls') out.push(`**${label}**\n\n| Action | Keys | Gamepad |\n|---|---|---|\n` + facts.controls.map(c => `| ${c.what} | ${c.keys} | ${c.pad} |`).join('\n'));
      if (kind === 'facts' && key === 'enemies' && facts.enemies.length) out.push(`**${label}**\n\n` + facts.enemies.map(a => `- **${a.name}** (${a.role})${a.desc ? ': ' + a.desc : ''}`).join('\n'));
      if (kind === 'facts' && key === 'levels' && facts.levels.length) { const notes = v(doc, 'levels.notes') || {}; out.push(`**${label}**\n\n` + facts.levels.map(n => `- **${n}**${notes[n] ? ': ' + notes[n] : ''}`).join('\n')); }
      if (kind === 'facts' && key === 'systems' && facts.graphs.length + facts.dialogues.length) out.push(`**${label}**: graphs ${facts.graphs.join(', ') || 'none'}; dialogues ${facts.dialogues.join(', ') || 'none'}`);
      if (kind === 'facts' && key === 'look') out.push(`**${label}**: ${facts.style.words}`);
    }
    const th = (v(doc, `${sec.id}.thoughts`) || []).filter(t => has(t.text));
    if (th.length) out.push('**Things thought through**\n\n' + th.map(t => `- *${t.name}* ${t.text.replace(/\n/g, ' ')}`).join('\n'));
    if (out.length) L.push(`## ${sec.title}`, '', out.join('\n\n'), '');
  }
  return L.join('\n');
}
