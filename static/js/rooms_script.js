// Rooms → Script: every line in the game on one page, the way an actor or a proofreader wants it: room by room what
// the hero says looking at and using each thing (and when it is locked), what they say about each item and
// combination, then every conversation in order with its choices. Lines with a voice recording are marked. Save
// writes docs/SCRIPT.md into the game folder (next to the Game doc's docs/GAME.md).
import { h, api, toast } from './core.js';
import { saveFiles } from './files.js';

const get = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);

// [{ title, lines: [{ who, text, note, voice }] }]
async function collect() {
  const ps = await api('/api/projects').catch(() => []), parts = [];
  const I = (await get('items-adventure'))?.items || { items: [], combos: [] };
  for (const p of ps.filter(p => p.kind === 'room').sort((a, b) => a.name.localeCompare(b.name))) {
    const R = (await get(p.id))?.room; if (!R) continue;
    const lines = [];
    for (const q of R.hotspots || []) {
      const t = q.title || q.name;
      if (q.look) lines.push({ who: 'HERO', text: q.look, note: `looking at ${t}`, voice: !!q.lookVoice });
      if (q.text) lines.push({ who: 'HERO', text: q.text, note: `using ${t}` });
      if (q.lockedText) lines.push({ who: 'HERO', text: q.lockedText, note: `${t}, before it can be used` });
    }
    parts.push({ title: `Room: ${R.name}`, lines });
  }
  const il = [...I.items.filter(i => i.look).map(i => ({ who: 'HERO', text: i.look, note: `looking at the ${i.name}` })),
    ...(I.combos || []).filter(c => c.text).map(c => ({ who: 'HERO', text: c.text, note: `${c.a} + ${c.b} → ${c.makes}` }))];
  if (il.length) parts.push({ title: 'Items', lines: il });
  for (const p of ps.filter(p => p.kind === 'dialogue').sort((a, b) => a.name.localeCompare(b.name))) {
    const d = (await get(p.id))?.dialogue; if (!d) continue;
    const lines = [];
    for (const [i, b] of (d.beats || []).entries()) {
      lines.push({ who: (b.who || 'NARRATOR').toUpperCase(), text: b.text, note: `line ${i + 1}`, voice: !!b.voice });
      for (const c of b.choices || []) lines.push({ who: '', text: '→ ' + (c.text || c.label || ''), note: 'choice' });
    }
    parts.push({ title: `Conversation: ${p.name}`, lines });
  }
  return parts;
}

const markdown = parts => '# Script\n\nEvery line in the game, written by Kiln from the Rooms, Items and Dialogue areas.\n\n' + parts.map(p => `## ${p.title}\n\n`
  + p.lines.map(l => l.who ? `**${l.who}** _(${l.note}${l.voice ? ', recorded' : ''})_  \n${l.text}\n` : `- ${l.text}\n`).join('\n')).join('\n');

export async function openScript() {
  const parts = await collect(), all = parts.flatMap(p => p.lines.filter(l => l.who)), words = all.reduce((n, l) => n + String(l.text).split(/\s+/).filter(Boolean).length, 0);
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(780px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Script'),
      h('button', { class: 'btn sm', title: 'Write docs/SCRIPT.md into the game folder', onclick: async () => { await saveFiles('docs', [{ name: 'SCRIPT.md', text: markdown(parts) }]); toast('Saved docs/SCRIPT.md', 'ok'); } }, 'Save as docs/SCRIPT.md'),
      h('button', { class: 'btn sm ghost', title: 'Copy the whole script as text', onclick: () => navigator.clipboard.writeText(markdown(parts)).then(() => toast('Copied', 'ok')) }, 'Copy'),
      h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body sc-page' },
      h('p', { class: 'note', style: { marginTop: 0 } }, `${all.length} lines, ${words} words, ${all.filter(l => l.voice).length} recorded. Change a line where it lives: Rooms (looks and uses), Items, Dialogue.`),
      ...parts.map(p => h('section', {}, h('h3', {}, p.title), p.lines.length ? '' : h('p', { class: 'note' }, 'Nothing said here yet.'),
        ...p.lines.map(l => l.who ? h('div', { class: 'sc-line' }, h('b', {}, l.who), h('small', {}, l.note, l.voice ? ' · 🎙' : ''), h('p', {}, l.text)) : h('div', { class: 'sc-choice' }, l.text)))))));
  document.body.append(m);
}
