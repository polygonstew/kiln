// Rooms → Flow: the puzzle flowchart. Kiln plays the adventure through in its head from the room it starts in: each
// column is a step, holding what can be done with what is known by then (things to pick up, locks that open,
// conversations, exits, flags), and arrows show what each one needed and where that came from. Whatever it can never
// reach is listed as a problem: an item nobody gives, a flag nobody sets, a room no exit leads to, a key behind its lock.
import { h, api, pref } from './core.js';
import { buildKey } from './playbuild.js';

const get = id => fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);

// everything the chart needs: rooms with their hotspots, items, and what each conversation gives and sets (all of it,
// as if every choice were taken: the chart is about what is possible)
async function gather() {
  const ps = await api('/api/projects').catch(() => []);
  const rooms = [], talks = {};
  for (const p of ps.filter(p => p.kind === 'room')) { const R = (await get(p.id))?.room; if (R) rooms.push(R); }
  for (const p of ps.filter(p => p.kind === 'dialogue')) {
    const d = (await get(p.id))?.dialogue, out = { gives: new Set(), flags: new Set() };
    for (const b of d?.beats || []) for (const e of [...(b.do || []), ...(b.choices || []).flatMap(c => c.do || [])]) { if (e.k === 'give' && e.v) out.gives.add(e.v); if (e.k === 'flag' && e.v) out.flags.add(e.v); }
    talks[`dialogue/${p.name}.json`] = out;
  }
  const I = (await get('items-adventure'))?.items || { items: [], combos: [] };
  const pick = pref.get(buildKey(), {}).level || '', named = pick.match(/rooms\/([^/]+)\//)?.[1];
  const start = rooms.find(r => r.name === named) || rooms.find(r => r.entries?.some(e => e.name === 'start')) || rooms[0];
  return { rooms, talks, I, start };
}

// play it through: [{ act, step }] in order, plus what never happened
function simulate({ rooms, talks, I, start }) {
  const acts = [];
  for (const R of rooms) for (const q of R.hotspots || [])
    if (['pick', 'talk', 'go'].includes(q.does) || q.needs || q.needsFlag || q.setsFlag || q.when) acts.push({ room: R.name, q, key: R.name + ':' + q.id });
  const have = new Map(), flags = new Map(), reach = new Map(start ? [[start.name, { step: 0 }]] : []), done = new Map();
  const ok = a => (!a.q.needs || have.has(a.q.needs)) && (!a.q.needsFlag || flags.has(a.q.needsFlag)) && (!a.q.when || flags.has(a.q.when));
  for (let step = 1; step < 200; step++) {
    const now = acts.filter(a => !done.has(a.key) && reach.has(a.room) && ok(a));
    const combos = (I.combos || []).filter(c => c.a && c.b && c.makes && have.has(c.a) && have.has(c.b) && !have.has(c.makes));
    if (!now.length && !combos.length) break;
    for (const a of now) {
      done.set(a.key, step);
      const by = { act: a, step };
      if (a.q.does === 'pick' && a.q.item && !have.has(a.q.item)) have.set(a.q.item, by);
      if (a.q.does === 'go' && a.q.room && !reach.has(a.q.room)) reach.set(a.q.room, by);
      if (a.q.setsFlag && !flags.has(a.q.setsFlag)) flags.set(a.q.setsFlag, by);
      const t = a.q.does === 'talk' && talks[a.q.dialogue];
      if (t) { for (const i of t.gives) if (!have.has(i)) have.set(i, by); for (const f of t.flags) if (!flags.has(f)) flags.set(f, by); }
    }
    for (const c of combos) have.set(c.makes, { combo: c, step });
  }
  return { acts, done, have, flags, reach };
}

// why something never happens, in words
function problems(S, { rooms, talks, I }) {
  const out = [], givers = new Set([...rooms.flatMap(R => (R.hotspots || []).filter(q => q.does === 'pick').map(q => q.item)), ...(I.combos || []).map(c => c.makes), ...Object.values(talks).flatMap(t => [...t.gives])]);
  const setters = new Set([...rooms.flatMap(R => (R.hotspots || []).map(q => q.setsFlag)), ...Object.values(talks).flatMap(t => [...t.flags])]);
  const name = id => (I.items.find(i => i.id === id) || {}).name || id;
  for (const R of rooms) if (!S.reach.has(R.name)) out.push(['bad', `The room "${R.name}" is never reached: ${rooms.some(o => (o.hotspots || []).some(q => q.does === 'go' && q.room === R.name)) ? 'its way in is behind something that never happens' : 'no exit leads there'}.`]);
  for (const a of S.acts) if (!S.done.has(a.key) && S.reach.has(a.room)) {
    const why = a.q.needs && !S.have.has(a.q.needs) ? (givers.has(a.q.needs) ? `${name(a.q.needs)} is out of reach (behind this lock, or behind another that never opens)` : `nobody gives ${name(a.q.needs)}`)
      : a.q.needsFlag && !S.flags.has(a.q.needsFlag) ? (setters.has(a.q.needsFlag) ? `the flag ${a.q.needsFlag} is set somewhere out of reach` : `nothing sets the flag ${a.q.needsFlag}`)
        : a.q.when ? (setters.has(a.q.when) ? `the flag ${a.q.when} is set somewhere out of reach` : `nothing sets the flag ${a.q.when}, so it never appears`) : 'it is out of reach';
    out.push(['bad', `${a.room} · ${a.q.title || a.q.name} can never happen: ${why}.`]);
  }
  const needed = new Set([...rooms.flatMap(R => (R.hotspots || []).map(q => q.needs)), ...(I.combos || []).flatMap(c => [c.a, c.b])]);
  for (const it of I.items) if (!needed.has(it.id) && givers.has(it.id)) out.push(['info', `${it.name} is never used on anything (fine if it is only a joke).`]);
  for (const it of I.items) if (!givers.has(it.id)) out.push(['info', `${it.name} is never given: pick it up somewhere, or have a conversation give it.`]);
  return out;
}

const verb = (q, I) => {
  const n = id => (I.items.find(i => i.id === id) || {}).name || id;
  return q.does === 'pick' ? `picks up ${n(q.item)}` : q.does === 'go' ? `leads to ${q.room || '?'}` : q.does === 'talk' ? `talk: ${(q.dialogue || '?').replace(/^dialogue\/|\.json$/g, '')}` : q.setsFlag ? `sets ${q.setsFlag}` : 'used';
};

export async function openFlow() {
  const data = await gather();
  const body = h('div', { class: 'body' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(1200px, 97vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Puzzle flow'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  if (!data.start) return body.append(h('p', { class: 'note' }, 'No rooms yet: make one in Rooms first.'));
  const S = simulate(data), probs = problems(S, data), I = data.I;
  // cards in columns by step; arrows from what gave each need
  const W = 210, HC = 58, GX = 56, GY = 12, cols = {}, pos = new Map();
  const cards = [{ key: 'start', step: 0, room: data.start.name, title: `Start in ${data.start.name}`, sub: '', kind: 'start' }];
  for (const a of S.acts) if (S.done.has(a.key)) cards.push({ key: a.key, step: S.done.get(a.key), room: a.room, title: a.q.title || a.q.name, sub: verb(a.q, I), needs: [a.q.needs && '🔑 ' + ((I.items.find(i => i.id === a.q.needs) || {}).name || a.q.needs), a.q.needsFlag && '⚑ ' + a.q.needsFlag, a.q.when && '⚑ ' + a.q.when].filter(Boolean), kind: a.q.does, act: a });
  for (const [it, by] of S.have) if (by.combo) cards.push({ key: 'combo:' + it, step: by.step, room: '', title: `Combine → ${(I.items.find(i => i.id === it) || {}).name || it}`, sub: `${by.combo.a} + ${by.combo.b}`, kind: 'combo', combo: by.combo });
  for (const c of cards) { const i = (cols[c.step] ||= []).length; cols[c.step].push(c); pos.set(c.key, [c.step * (W + GX), i * (HC + GY)]); }
  const maxRows = Math.max(...Object.values(cols).map(c => c.length)), width = (Math.max(...Object.keys(cols).map(Number)) + 1) * (W + GX), height = maxRows * (HC + GY);
  const from = (map, k) => { const by = map.get(k); return by ? (by.act ? by.act.key : by.combo ? 'combo:' + by.combo.makes : 'start') : null; };
  const links = [];
  for (const c of cards) {
    const q = c.act?.q;
    if (q?.needs) links.push([from(S.have, q.needs), c.key, (I.items.find(i => i.id === q.needs) || {}).name || q.needs]);
    for (const f of [q?.needsFlag, q?.when]) if (f) links.push([from(S.flags, f), c.key, f]);
    if (c.act && c.act.room !== data.start.name) { const k = from(S.reach, c.act.room); if (k && k !== 'start') links.push([k, c.key, '']); }
    if (c.combo) for (const it of [c.combo.a, c.combo.b]) links.push([from(S.have, it), c.key, it]);
  }
  const svg = `<svg width="${width}" height="${height}" style="position:absolute;inset:0;pointer-events:none">${links.filter(([a]) => a && pos.has(a)).map(([a, b, label]) => {
    const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b), sx = x1 + W, sy = y1 + HC / 2, ex = x2, ey = y2 + HC / 2, mx = (sx + ex) / 2;
    return `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}" fill="none" stroke="${label ? '#b48cff' : '#6fb3d9'}" stroke-width="1.5" opacity=".8"/>` + (label ? `<text x="${mx}" y="${(sy + ey) / 2 - 3}" fill="#cfb6ff" font-size="10" text-anchor="middle">${label.replace(/[<&]/g, '')}</text>` : '');
  }).join('')}</svg>`;
  const board = h('div', { class: 'fl-board', style: { width: width + 'px', height: height + 'px' } });
  board.innerHTML = svg;
  for (const c of cards) { const [x, y] = pos.get(c.key); board.append(h('div', { class: 'fl-card k-' + c.kind, style: { left: x + 'px', top: y + 'px', width: W + 'px', height: HC + 'px' }, title: c.needs?.length ? 'Needs ' + c.needs.join(', ') : '' },
    h('small', {}, c.room), h('b', {}, c.title), h('span', {}, c.sub, ...(c.needs || []).map(n => h('i', {}, n))))); }
  body.append(
    h('p', { class: 'note', style: { marginTop: 0 } }, `Played through from ${data.start.name}: each column is a step, holding what can be done by then. Arrows show where each needed item, flag or room came from. Plain things to look at are left out.`),
    h('div', { class: 'fl-scroll' }, board),
    h('h3', {}, probs.some(p => p[0] === 'bad') ? 'Problems' : 'Problems: none, every puzzle can be solved'),
    ...probs.map(([k, t]) => h('p', { class: 'note fl-p ' + k }, (k === 'bad' ? '✕ ' : '· ') + t)));
}
