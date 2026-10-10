// Doctor: checks the asset folder (server: /api/doctor) and lists what is wrong or odd, each with a fix or a
// way to look at it: missing files scenes need, sprites too big or with too many colours, loose images, items
// never saved for Godot, very heavy project files.
import { h, api, emit } from './core.js';
import { S as FS, go } from './files.js';

const LEVEL = { bad: ['Problems', '#e5534b'], warn: ['Worth fixing', '#e3b04b'], info: ['Good to know', '#7cc4d9'] };

export async function openDoctor() {
  const body = h('div', { class: 'body' }, h('p', { class: 'note' }, 'Checking…'));
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(680px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Doctor: the asset folder'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  const list = await api('/api/doctor?root=' + encodeURIComponent(FS.root)).catch(e => [{ level: 'bad', msg: 'Could not check: ' + e.message }]);
  const fix = f => {
    if (f.fix === 'shrink') return h('button', { class: 'btn sm', title: 'Opens it in Animate and makes a smaller copy (the original stays)', onclick: () => { m.remove(); emit('tab', 'animate'); emit('shrink-actor', f.name); } }, 'Game-size copy');
    if (f.fix === 'open') return h('button', { class: 'btn sm ghost', onclick: () => { m.remove(); emit('tab', { actor: 'animate', scene: 'scenes', level: 'levels', hud: 'hud' }[f.kindOf] || 'files'); } }, 'Go there');
    if (f.fix === 'show') return h('button', { class: 'btn sm ghost', onclick: () => { m.remove(); emit('tab', 'files'); const p = FS.root + '/' + f.path; go(p.slice(0, p.lastIndexOf('/')), p.slice(p.lastIndexOf('/') + 1)); } }, 'Show');
    return '';
  };
  body.replaceChildren(list.length ? '' : h('p', { class: 'lg-ok' }, '✓ Nothing wrong found'),
    ...Object.entries(LEVEL).map(([lv, [title, c]]) => {
      const fs = list.filter(f => f.level === lv); if (!fs.length) return '';
      return h('div', { class: 'doc-g' }, h('h3', { style: { color: c } }, `${title} (${fs.length})`),
        ...fs.map(f => h('div', { class: 'doc-r', style: { borderLeftColor: c } }, h('span', { class: 'grow' }, f.msg), fix(f))));
    }));
}
