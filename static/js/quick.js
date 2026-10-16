// Ctrl+K: find anything (areas, actions in the area you're in, saved actors/scenes/HUDs, files) and go there.
import { h, emit, api, rawURL } from './core.js';
import { wheelActions, areaList, currentArea } from './wheel.js';
import { go as filesGo, S as FS } from './files.js';

let Q = null;
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); Q ? close() : open(); }
}, true);

// subsequence match, rewarded for word starts and runs; null = no match
function score(q, text) {
  const t = text.toLowerCase(); let s = 0, ti = 0, run = 0;
  for (const ch of q) {
    const j = t.indexOf(ch, ti); if (j < 0) return null;
    run = j === ti ? run + 1 : 0;
    s += 1 + run * 2 + (j === 0 || /[\s_\-/.]/.test(t[j - 1]) ? 4 : 0) - Math.min(3, (j - ti) * 0.1);
    ti = j + 1;
  }
  return s - t.length * 0.02;
}
function quickSources() {
  const area = currentArea(), out = [];
  for (const a of areaList()) out.push({ kind: 'Area', label: a.label, hint: a.key, run: () => emit('tab', a.id) });
  for (const it of wheelActions(area)) out.push({ kind: 'Action', label: it.label, hint: it.key || it.hint || '', run: it.run });
  return out;
}
async function sources() {
  const out = quickSources();
  const [projects, idx] = await Promise.all([api('/api/projects').catch(() => []), api('/api/index').catch(() => ({ items: [] }))]);
  for (const p of projects) {
    if (p.kind === 'actor') out.push({ kind: 'Actor', label: p.name, thumb: p.thumb, run: () => emit('open-actor', FS.root + '/sprites/' + p.name) });
    else if (p.kind === 'scene') out.push({ kind: 'Scene', label: p.name, run: () => emit('open-scene', FS.root + '/backgrounds/' + p.name) });
    else out.push({ kind: p.kind.toUpperCase(), label: p.name, run: () => emit('tab', p.kind) });
  }
  const rel = p => p.slice(FS.root.length + 1);
  for (const f of idx.items) {
    const dir = f.path.slice(0, f.path.lastIndexOf('/'));
    out.push({ kind: f.dir ? 'Folder' : 'File', label: f.name, hint: rel(dir) || '', path: f.path,
      thumb: /\.(png|gif|webp|jpe?g)$/i.test(f.name) ? rawURL(f.path) : null,
      run: () => { emit('tab', 'files'); f.dir ? filesGo(f.path) : filesGo(dir, f.name); } });
  }
  return out;
}
async function open() {
  const input = h('input', { type: 'text', placeholder: 'Find an area, action, actor, scene or file…', spellcheck: false });
  const list = h('div', { class: 'qk-list' });
  const box = h('div', { class: 'qk-box' }, h('div', { class: 'qk-top' }, h('span', { class: 'qk-k' }, 'Find'), input), list,
    h('div', { class: 'qk-foot' }, '↑ ↓ choose  ·  Enter go  ·  Esc close'));
  Q = { veil: h('div', { class: 'dx-veil qk', onpointerdown: e => { if (e.target === Q.veil) close(); } }, box), all: [], shown: [], sel: 0 };
  document.body.append(Q.veil); input.focus();
  Q.all = quickSources();          // areas and actions at once; actors, scenes and files join when loaded
  const draw = () => {
    if (!Q) return;
    const q = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
    let res;
    if (!q) res = Q.all.filter(x => x.kind !== 'File' && x.kind !== 'Folder').slice(0, 14);
    // files match on their path ("pallid grou" finds backgrounds/pallid/ground.png); a space means "anywhere after"
    else res = Q.all.map(x => ({ x, s: score(q.replace(/ /g, ''), x.kind === 'File' || x.kind === 'Folder' ? (x.hint ? x.hint + '/' : '') + x.label : x.label) })).filter(r => r.s !== null)
      .map(r => ({ ...r, s: r.s + (r.x.kind === 'File' || r.x.kind === 'Folder' ? 0 : 6) }))     // places and actions before loose files
      .sort((a, b) => b.s - a.s).slice(0, 14).map(r => r.x);
    Q.shown = res; Q.sel = Math.min(Q.sel, Math.max(0, res.length - 1));
    list.replaceChildren(...(res.length ? res.map((x, i) => h('div', { class: 'qk-row' + (i === Q.sel ? ' on' : ''), onpointerenter: () => { Q.sel = i; mark(); }, onclick: () => pick(i) },
      x.thumb ? h('img', { src: x.thumb, loading: 'lazy' }) : h('i', { class: 'qk-dot' }), h('span', { class: 'qk-l' }, x.label), h('span', { class: 'qk-h' }, x.hint || ''), h('span', { class: 'qk-kind' }, x.kind)))
      : [h('div', { class: 'qk-none' }, 'Nothing matches.')]));
  };
  const mark = () => [...list.children].forEach((r, i) => r.classList.toggle('on', i === Q.sel));
  input.addEventListener('input', () => { Q.sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { Q.sel = Math.min(Q.shown.length - 1, Q.sel + 1); mark(); list.children[Q.sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { Q.sel = Math.max(0, Q.sel - 1); mark(); list.children[Q.sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(Q.sel); e.preventDefault(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
  });
  draw();
  const all = await sources().catch(() => null);
  if (Q && all) { Q.all = all; draw(); }
}
function pick(i) { const x = Q?.shown[i]; close(); if (x) try { x.run(); } catch (e) { console.error(e); } }
function close() { Q?.veil.remove(); Q = null; }
