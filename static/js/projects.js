// Your things, one dialog for every area: open, rename, copy and remove the actors, scenes, levels, HUDs, graphs and
// dialogues you made (Kiln projects in <asset folder>/kiln/). Removing moves the project into the asset folder's .trash
// (the game files it wrote stay where they are) and "Removed" at the bottom puts it back. Areas keep their own data;
// this only moves project files and tells the area when the one it has open was renamed or removed.
import { h, api, toast, uid } from './core.js';
import { S as FS } from './files.js';

const NOUN = { actor: 'actor', scene: 'scene', level: 'level', hud: 'HUD', graph: 'graph', dialogue: 'dialogue' };
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t * 1000).toLocaleDateString(); };

// opts: { current: name open now, open(project), renamed?(newName), removed?(), extra?: element under the list, title?,
//         afterRename?(old, new), afterRemove?(name): for game files named after the item (graphs, dialogues) }
export async function openProjects(kind, opts) {
  const noun = NOUN[kind] || kind, q = h('input', { type: 'text', placeholder: `Find a ${noun}…` });
  const listEl = h('div', { class: 'pj-list' }), gone = h('div', { class: 'pj-gone' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(640px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, opts.title || `Your ${noun}s`), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, q, listEl, opts.extra || '', gone)));
  document.body.append(m); setTimeout(() => q.focus(), 0);
  let items = [];
  const reload = async () => { items = (await api('/api/projects').catch(() => [])).filter(p => p.kind === kind).sort((a, b) => b.mtime - a.mtime); draw(); drawGone(); };
  q.oninput = () => draw();
  q.onkeydown = e => { if (e.key === 'Enter') listEl.querySelector('.pj-row')?.click(); if (e.key === 'Escape') m.remove(); };

  function draw() {
    const s = q.value.toLowerCase(), shown = items.filter(p => p.name.toLowerCase().includes(s));
    listEl.replaceChildren(...(shown.length ? shown.map(row) : [h('p', { class: 'note' }, items.length ? 'Nothing by that name.' : `No ${noun}s yet: they save themselves as you work.`)]));
  }
  const row = p => h('div', { class: 'pj-row' + (p.name === opts.current ? ' on' : ''), title: `Open ${p.name}`, onclick: () => { m.remove(); opts.open(p); } },
    p.thumb ? h('img', { class: 'pj-thumb', src: p.thumb }) : h('i', { class: 'pj-thumb' }),
    h('span', { class: 'pj-name' }, p.name, p.name === opts.current ? h('small', {}, ' open now') : ''),
    h('span', { class: 'pj-when' }, ago(p.mtime)),
    h('span', { class: 'pj-acts', onclick: e => e.stopPropagation() },
      h('button', { class: 'btn sm ghost', title: `Give this ${noun} another name`, onclick: () => rename(p, false) }, 'Rename'),
      h('button', { class: 'btn sm ghost', title: `Make a copy to change without touching this one`, onclick: () => rename(p, true) }, 'Copy'),
      h('button', { class: 'btn sm ghost danger', title: `Remove it (it goes to .trash: "Removed" below brings it back)`, onclick: () => remove(p) }, 'Remove')));

  // rename or copy: the project under a new name (a copy also gets its own id, so it is a separate item)
  async function rename(p, copy) {
    const raw = prompt(copy ? `Name for the copy of ${p.name}` : `New name for ${p.name}`, copy ? p.name + '_copy' : p.name);
    const name = slug(raw || ''); if (!name || name === p.name) return;
    if (items.some(x => x.name === name)) return toast(`There is already a ${noun} "${name}"`, 'bad');
    const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.json()).catch(() => null);
    if (!d) return toast('Could not read ' + p.name, 'bad');
    const inner = d[kind];
    d.meta = { ...(d.meta || {}), kind, name };
    if (inner && typeof inner === 'object' && 'name' in inner) inner.name = name;
    if (copy && inner && 'id' in inner) inner.id = uid();
    await api('/api/project', { id: `${kind}-${name}`, data: d });
    if (!copy) {
      await api('/api/project/delete', { id: p.id });
      await opts.afterRename?.(p.name, name);
      if (p.name === opts.current) { opts.current = name; opts.renamed?.(name); }
      toast(`Renamed to ${name}. Its game files get the new name the next time you save it.`, 'ok');
    } else toast(`Copied as ${name}`, 'ok');
    reload();
  }
  async function remove(p) {
    if (!confirm(`Remove the ${noun} "${p.name}"? Its Kiln project goes to .trash ("Removed" brings it back); game files it saved stay where they are.`)) return;
    await api('/api/fs', { op: 'mkdir', path: FS.root + '/.trash' });
    await api('/api/fs', { op: 'rename', path: `${FS.root}/kiln/${p.id}.json`, to: `${FS.root}/.trash/${stamp()}-kiln__${p.id}.json` }).catch(e => toast('Could not remove: ' + e.message, 'bad'));
    await opts.afterRemove?.(p.name);
    if (p.name === opts.current) opts.removed?.();
    toast(`Removed ${p.name}`); reload();
  }
  // removed projects of this kind, newest first: Restore puts each back
  async function drawGone() {
    const re = new RegExp(`^(\\d{8})-(\\d{6})-kiln__(${kind}-.+)\\.json$`);
    const t = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/.trash')).catch(() => ({ items: [] }))).items || []).filter(i => re.test(i.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 10);
    gone.replaceChildren(...(t.length ? [h('h3', { class: 'lbl', style: { margin: '14px 0 6px' } }, 'Removed'), ...t.map(i => {
      const [, d, tm, id] = i.name.match(re);
      return h('div', { class: 'pj-row gone' }, h('span', { class: 'pj-name' }, id.slice(kind.length + 1)), h('span', { class: 'pj-when' }, `removed ${d.slice(6)}/${d.slice(4, 6)} ${tm.slice(0, 2)}:${tm.slice(2, 4)}`),
        h('span', { class: 'pj-acts' }, h('button', { class: 'btn sm', title: 'Put it back', onclick: async () => {
          if (items.some(x => x.id === id)) return toast(`A ${noun} with that name exists: rename it first`, 'bad');
          await api('/api/fs', { op: 'rename', path: i.path, to: `${FS.root}/kiln/${id}.json` }).then(() => toast('Restored ' + id.slice(kind.length + 1), 'ok'), e => toast('Could not restore: ' + e.message, 'bad'));
          reload();
        } }, 'Restore')));
    })] : []));
  }
  reload();
}
