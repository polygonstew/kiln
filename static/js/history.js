// History: earlier versions of every saved actor, scene, level and HUD (the server keeps one per 10 minutes,
// the newest 5 of each). Restoring brings a version back as a new copy next to the current one; nothing is overwritten.
import { h, api, toast, emit } from './core.js';

const KIND_TAB = { actor: 'animate', scene: 'scenes', level: 'levels', hud: 'hud' };
const when = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(9, 11)}:${s.slice(11, 13)}`;
const mb = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

export async function openHistory() {
  const items = (await api('/api/projects').catch(() => [])).filter(p => KIND_TAB[p.kind]);
  const body = h('div', { class: 'body hist' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(620px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'History: earlier versions'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')), body));
  const list = () => body.replaceChildren(h('p', { class: 'note', style: { marginTop: 0 } }, 'Kiln keeps the version before each save (one per 10 minutes, the newest 5). Pick an item:'),
    ...items.map(p => h('div', { class: 'palrow', onclick: () => versions(p) }, h('span', { class: 'hist-k' }, p.kind), h('span', { class: 'grow' }, p.name))));
  async function versions(p) {
    const vs = await api('/api/history?id=' + encodeURIComponent(p.id)).catch(() => []);
    body.replaceChildren(h('button', { class: 'btn sm ghost', onclick: list }, '‹ All items'),
      h('h3', { style: { margin: '10px 0 6px' } }, `${p.kind} · ${p.name}`),
      vs.length ? '' : h('p', { class: 'note' }, 'No earlier versions yet: they appear after it has been saved again (at most one per 10 minutes).'),
      ...vs.map(v => h('div', { class: 'palrow' }, h('span', { class: 'grow mono' }, when(v.stamp)), h('span', { class: 'faint', style: { marginRight: '10px' } }, mb(v.size)),
        h('button', { class: 'btn sm', title: 'Bring this version back as a new copy; the current one stays as it is', onclick: async e => {
          e.stopPropagation();
          const r = await api('/api/history/restore', { id: p.id, stamp: v.stamp }).catch(err => toast('Restore failed: ' + err.message, 'bad'));
          if (r?.ok) { m.remove(); toast(`Restored as "${r.name}": open it from ${KIND_TAB[r.kind][0].toUpperCase() + KIND_TAB[r.kind].slice(1)} → Open`, 'ok'); emit('tab', KIND_TAB[r.kind]); }
        } }, 'Restore as copy'))));
  }
  list(); document.body.append(m);
}
