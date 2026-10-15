// "Start over" for an area that keeps ONE thing per game (Camera, Cards, Flow, Menus, Game doc, Style) or one folder per idea
// (Concepts sessions): the kept file or folder moves into the asset folder's .trash (never a delete), the area starts blank,
// and "Put back…" lists what was archived and restores it (the current one is archived first, so nothing is ever lost).
// Same place and naming as projects.js (<stamp>-kiln__<id>.json), so Files → .trash shows them too.
// o: { noun, path (the file or folder, or a function giving it), tag ('kiln' | 'concepts'), name (its trash name), suffix ('.json' | ''),
//      (name too may be a function),
//      pathOf?(name) (where a trashed name goes back to; default path), many? (list every name with this tag), taken?(name) (many: is that name in use),
//      ask? (the question), fileNew? (false: File → New does not press it), flush?() (write what is on screen first), reload(restoredName?) (the area reads its thing again), label? }
import { h, api, toast } from './core.js';
import { S as FS } from './files.js';

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export function startOverBar(o) {
  const noun = o.noun, nm = () => typeof o.name === 'function' ? o.name() : o.name, here = () => typeof o.path === 'function' ? o.path() : o.path, pathOf = o.pathOf || here, esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = () => new RegExp(`^(\\d{8})-(\\d{6})-${o.tag}__(${o.many ? '.+' : esc(nm())})${esc(o.suffix)}$`);
  const trashed = async () => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/.trash')).catch(() => ({ items: [] }))).items || [])
    .filter(i => re().test(i.name)).sort((a, b) => b.name.localeCompare(a.name));
  // is the current one saved on disk (a blank one nobody edited is not worth archiving)
  const present = async () => { const p = here(); return ((await api('/api/fs?path=' + encodeURIComponent(p.slice(0, p.lastIndexOf('/')))).catch(() => ({ items: [] }))).items || []).some(i => i.path === p); };
  // move the current one into .trash; false when there is nothing saved yet
  async function archive() {
    await o.flush?.();
    await api('/api/fs', { op: 'mkdir', path: FS.root + '/.trash' });
    return api('/api/fs', { op: 'rename', path: here(), to: `${FS.root}/.trash/${stamp()}-${o.tag}__${nm()}${o.suffix}` }).then(() => true, () => false);
  }
  const putBack = h('button', { class: 'btn sm ghost', style: { display: 'none' }, title: `Bring back a ${noun} you started over from`, onclick: openList }, 'Put back…');
  const bar = h('span', { class: 'so-bar' },
    h('button', { class: 'btn sm ghost danger', ...(o.fileNew === false ? {} : { 'data-file': 'new', 'data-noun': noun }), title: `Put this ${noun} away (to .trash, nothing is deleted) and start with a blank one`, onclick: start }, o.label || 'Start over'), putBack);
  const refresh = async () => { putBack.style.display = (await trashed()).length ? '' : 'none'; };
  async function start() {
    if (!confirm(o.ask || `Start over with a blank ${noun}?\n\nWhat you have goes to .trash: "Put back…" brings it back. Game files it already wrote stay until you save again.`)) return;
    if (await archive()) toast(`Put the ${noun} away: "Put back…" brings it back`, 'ok'); else toast(`Nothing was saved yet, so this ${noun} starts blank`);
    await o.reload(); refresh();
  }
  async function openList() {
    const list = await trashed(), body = h('div', { class: 'pj-gone' });
    const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(560px, 94vw)' } },
      h('header', {}, h('span', { class: 'grow' }, `Put away: ${noun}`), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
      h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Newest first. Putting one back puts the current one away first.'), body)));
    body.replaceChildren(...list.slice(0, 20).map(i => {
      const [, d, tm, n] = i.name.match(re());
      return h('div', { class: 'pj-row gone' }, h('span', { class: 'pj-name' }, o.many ? n : nm()), h('span', { class: 'pj-when' }, `${d.slice(6)}/${d.slice(4, 6)} ${tm.slice(0, 2)}:${tm.slice(2, 4)}`),
        h('span', { class: 'pj-acts' }, h('button', { class: 'btn sm', onclick: async () => {
          if (o.many && await o.taken?.(n)) return toast(`There is already a ${noun} called "${n}": rename or put that one away first`, 'bad');
          const dest = pathOf(n);
          if (!o.many && await present()) await archive();
          await api('/api/fs', { op: 'rename', path: i.path, to: dest }).then(() => toast(`Put back ${o.many ? n : noun}`, 'ok'), e => toast('Could not put it back: ' + e.message, 'bad'));
          m.remove(); await o.reload(o.many ? n : undefined); refresh();
        } }, 'Put back')));
    }));
    document.body.append(m);
  }
  refresh(); bar.refresh = refresh;
  return bar;
}
// a project file kept by an area: kiln/<id>.json (camera-game, cards-game, flow-game, menus-game, gamedoc-game, style)
export const projectBar = (id, noun, o) => startOverBar({ noun, tag: 'kiln', name: id, suffix: '.json', path: () => `${FS.root}/kiln/${id}.json`, ...o });
