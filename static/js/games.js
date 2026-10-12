// Your games (File → New game / Open game). A game is an asset folder: Kiln's projects (kiln/) and everything saved
// for Godot. New game makes an empty one in Kiln's games folder and switches to it, where the "Your game" steps take
// over. Open game lists the games there and the other folders you used (bookmarks), newest first, and switches.
// Switching is safe at any time: every area keeps its work in the folder it came from.
import { h, api, toast, pref } from './core.js';
import { S as FS, loadSettings } from './files.js';

const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '');
const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t * 1000).toLocaleDateString(); };
const ls = async p => ((await api('/api/fs?path=' + encodeURIComponent(p)).catch(() => ({ items: [] }))).items || []);
const remember = path => pref.set('games.recent', [path, ...pref.get('games.recent', []).filter(p => p !== path)].slice(0, 8));

async function switchTo(path, scaffold = false) {
  await api('/api/fs', { op: 'root', path, scaffold });
  remember(path);
  await loadSettings();                       // every area hears 'root' and loads from the new folder
}

function modal(title, ...body) {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(600px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, title), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, ...body)));
  document.body.append(m);
  return m;
}

export function newGame() {
  const name = h('input', { type: 'text', placeholder: 'e.g. Bell Tower', onkeydown: e => e.key === 'Enter' && make() });
  const m = modal('New game',
    h('p', { class: 'note', style: { marginTop: 0 } }, 'A new, empty game folder. The one you have open now stays as it is; File → Open game brings it back.'),
    h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Name'), name),
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' } },
      h('button', { class: 'btn go', onclick: make }, 'Make it'),
      h('span', { class: 'note' }, 'or ', h('a', { href: '#', onclick: e => { e.preventDefault(); m.remove(); import('./demo.js').then(x => x.makeDemo()); } }, 'start from the demo game'), ' (a complete small game to change)')));
  setTimeout(() => name.focus(), 0);
  async function make() {
    const s = slug(name.value);
    if (!s) return name.focus();
    const path = FS.settings.games + '/' + s;
    if ((await ls(FS.settings.games)).some(i => i.name === s)) return toast(`There is already a game called ${s}: open it with File → Open game`, 'bad');
    m.remove();
    await switchTo(path, true);
    toast(`${s} is ready: the "Your game" steps show where to begin`, 'ok');
  }
}

export async function openGame() {
  const list = h('div', { class: 'pj-list' }, h('p', { class: 'note' }, 'Looking…'));
  const m = modal('Open a game', list,
    h('p', { class: 'note' }, 'Another folder (inside a Godot project, say)? ', h('a', { href: '#', onclick: e => { e.preventDefault(); m.remove(); document.querySelector('#tabs button[data-id=files]')?.click(); setTimeout(() => [...document.querySelectorAll('#v-files button')].find(b => b.textContent.trim() === 'Change')?.click(), 300); } }, 'Choose any folder'), '.'));
  const paths = new Set([...(await ls(FS.settings.games)).filter(i => i.dir).map(i => i.path), ...(FS.settings.bookmarks || []).map(b => b.path || b), ...pref.get('games.recent', []), FS.root]);
  const games = [];
  const inGames = p => p.startsWith(FS.settings.games + '/');
  for (const path of paths) {
    const kiln = await ls(path + '/kiln');
    if (!kiln.length && !inGames(path) && path !== FS.root) continue;      // a bookmark that is not a game
    const projects = kiln.filter(i => /\.json$/.test(i.name) && !i.name.startsWith('style'));
    games.push({ path, name: path.split('/').pop(), n: projects.length, at: Math.max(0, ...kiln.map(i => i.mtime || 0)), actor: projects.find(i => i.name.startsWith('actor-'))?.name.slice(6, -5) });
  }
  games.sort((a, b) => (b.path === FS.root) - (a.path === FS.root) || b.at - a.at);
  list.replaceChildren(...games.map(g => {
    const thumb = h('i', { class: 'gm-thumb' });
    if (g.actor) fetch('/api/fs/raw?path=' + encodeURIComponent(`${g.path}/sprites/${g.actor}/manifest.json`)).then(r => r.ok ? r.json() : null).then(mf => {
      const a = mf?.anims && (mf.anims.idle || Object.values(mf.anims)[0]);
      if (a) Object.assign(thumb.style, { backgroundImage: `url("/api/fs/raw?path=${encodeURIComponent(`${g.path}/sprites/${g.actor}/${a.file}`)}")`, backgroundSize: `${a.frames * 100}% 100%` });
    }).catch(() => {});
    const here = g.path === FS.root;
    return h('button', { class: 'pj-row gm-row' + (here ? ' on' : ''), title: g.path, onclick: async () => { m.remove(); if (!here) { await switchTo(g.path); toast(`Opened ${g.name}`, 'ok'); } } },
      thumb, h('b', {}, g.name), h('small', {}, here ? 'open now' : g.n ? `${g.n} thing${g.n > 1 ? 's' : ''} · ${ago(g.at)}` : 'empty'));
  }));
}
