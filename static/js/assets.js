// The asset shelf: everything the game has, in one panel you can dock in any area (Layout ▾ → Add a panel): its
// characters, rooms, levels, backdrops, conversations, items, pictures, sounds and videos, with a picture each. Filter by
// kind or name; click one to open it where it is edited; drag it onto a canvas that takes it (Flow makes a scene of
// it, Levels places a character, Rooms places a character or a picture as a hotspot).
import { h, api, emit } from './core.js';
import { S as FS } from './files.js';

export const DRAG = 'application/x-kiln-asset';
const KINDS = [['all', 'All'], ['actor', 'Characters'], ['room', 'Rooms'], ['level', 'Levels'], ['scene', 'Backdrops'], ['dialogue', 'Talk'], ['item', 'Items'], ['picture', 'Pictures'], ['sound', 'Sounds'], ['video', 'Videos']];
const OPEN = { actor: n => emit('open-actor', `${FS.root}/sprites/${n}`), room: n => emit('open-room', n), level: n => emit('open-level', n), scene: n => emit('open-scene', `${FS.root}/backgrounds/${n}`), dialogue: n => emit('open-dialogue', n) };
const ls = async rel => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + rel)).catch(() => ({ items: [] }))).items || []);
const raw = p => '/api/fs/raw?path=' + encodeURIComponent(p);

async function gather() {
  const ps = await api('/api/projects').catch(() => []), out = [];
  for (const p of ps) if (['actor', 'room', 'level', 'scene', 'dialogue'].includes(p.kind)) out.push({ kind: p.kind, name: p.name, thumb: p.thumb, at: p.mtime });
  const I = (await fetch('/api/project?id=items-adventure').then(r => r.ok ? r.json() : null).catch(() => null))?.items;
  for (const it of I?.items || []) out.push({ kind: 'item', name: it.name, id: it.id, thumb: it.icon ? raw(FS.root + '/' + it.icon) : '' });
  const files = async (dir, kind, re) => { for (const f of await ls(dir)) if (!f.dir && re.test(f.name)) out.push({ kind, name: f.name, path: `${dir}/${f.name}`, thumb: kind === 'picture' ? raw(f.path) : '', at: f.mtime }); };
  await files('pictures', 'picture', /\.(png|webp|jpe?g)$/i);
  for (const d of (await ls('icons')).filter(f => f.dir)) await files('icons/' + d.name, 'picture', /\.(png|webp)$/i);
  await files('sfx', 'sound', /\.(wav|ogg|mp3)$/i); await files('music', 'sound', /\.(wav|ogg|mp3)$/i);
  await files('videos', 'video', /\.ogv$/i);
  return out;
}

export function assetShelf() {
  let kind = 'all', q = '', all = [];
  const grid = h('div', { class: 'as-grid' }), search = h('input', { type: 'text', placeholder: 'Find…', oninput: () => { q = search.value.toLowerCase(); draw(); } });
  const chips = h('div', { class: 'as-chips' });
  const el = h('div', { class: 'sec as-shelf' }, h('h3', {}, 'Assets', h('span', { class: 'grow' }), h('button', { class: 'ibtn', title: 'Look again', onclick: load }, '↻')), h('div', { class: 'as-top' }, chips, search), grid);
  function draw() {
    chips.replaceChildren(...KINDS.filter(([k]) => k === 'all' || all.some(a => a.kind === k)).map(([k, l]) => h('button', { class: kind === k ? 'on' : '', onclick: () => { kind = k; draw(); } }, l)));
    const shown = all.filter(a => (kind === 'all' || a.kind === kind) && (!q || a.name.toLowerCase().includes(q)));
    grid.replaceChildren(...(shown.length ? shown.map(tile) : [h('p', { class: 'note' }, all.length ? 'Nothing by that name.' : 'Nothing made yet.')]));
  }
  const tile = a => h('div', { class: 'as-tile', draggable: true, title: `${a.name} (${a.kind}): click to open, drag onto a canvas`,
    ondragstart: e => { e.dataTransfer.setData(DRAG, JSON.stringify(a)); e.dataTransfer.effectAllowed = 'copy'; },
    onclick: () => OPEN[a.kind]?.(a.name) },
    a.thumb ? h('img', { src: a.thumb, loading: 'lazy' }) : h('i', {}, { sound: '♪', video: '▶', dialogue: '❝', level: '▦', scene: '▭', item: '◆', room: '⌂' }[a.kind] || '·'),
    h('b', {}, a.name.replace(/\.\w+$/, '')), h('small', {}, a.kind));
  async function load() { all = await gather(); draw(); }
  load();
  return el;
}
// read a dragged asset from a drop event (or null)
export const dropped = e => { try { return JSON.parse(e.dataTransfer.getData(DRAG)); } catch { return null; } };
