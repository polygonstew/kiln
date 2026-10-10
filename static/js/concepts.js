// Concepts: a board per idea. Open an image site (meta.ai, Gemini…) in a tab on your own device, then drop,
// paste or upload what you like here. Works from any browser that reaches Kiln (SSH/LAN/phone), unlike Kiln Studio.
// Images live in <asset folder>/concepts/<session>/, notes in notes.md next to them; Forge's tray shows new ones.
import { h, api, toast, emit, pref, rawURL } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { registerWheel, registerKeys } from './wheel.js';

const SITES = [['meta.ai', 'https://www.meta.ai/'], ['Gemini', 'https://gemini.google.com/'], ['ChatGPT', 'https://chatgpt.com/'],
  ['Bing Image Creator', 'https://www.bing.com/images/create'], ['OpenGameArt', 'https://opengameart.org/'], ['Lospec palettes', 'https://lospec.com/palette-list']];
const slug = s => (s || 'ideas').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ideas';
let V = {}, mounted = false, session = pref.get('concepts.session', 'ideas'), items = [], notesT;
const dir = () => `${FS.root}/concepts/${session}`;

export const concepts = {
  id: 'concepts', title: 'Concepts', key: '8',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.grid = h('div', { class: 'cgrid' });
    V.pick = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onchange: e => addFiles([...e.target.files]) });
    V.drop = h('div', { class: 'cdrop', title: 'Drop images here, paste with Ctrl+V, or click to pick (on a phone: from your photos)', onclick: () => V.pick.click() },
      h('b', {}, 'Drop, paste (Ctrl+V) or click to add images'), h('span', {}, 'Save or copy an image on the site you have open, then bring it here'));
    el.append(V.left, h('section', { class: 'stage', style: { overflow: 'auto', padding: '14px' } }, V.drop, V.pick, V.grid), V.right);
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); V.drop.classList.add('hot'); } });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) V.drop.classList.remove('hot'); });
    el.addEventListener('drop', e => { e.preventDefault(); V.drop.classList.remove('hot'); addFiles([...e.dataTransfer.files]); });
    document.addEventListener('paste', e => {
      if (!el.classList.contains('on') || e.target.matches('input,textarea')) return;
      const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
      if (fs.length) { e.preventDefault(); addFiles(fs); }
    });
    drawLeft(); load();
  },
  show() { load(); },
};

async function sessions() {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/concepts')).catch(() => ({ items: [] }));
  return (r.items || []).filter(i => i.dir).map(i => i.name);
}
async function load() {
  if (!mounted) return;
  const r = await api('/api/fs?path=' + encodeURIComponent(dir())).catch(() => ({ items: [] }));
  items = (r.items || []).filter(i => /\.(png|jpe?g|webp|gif)$/i.test(i.name)).sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  let notes = '';
  try { const n = await fetch(rawURL(dir() + '/notes.md')); if (n.ok) notes = (await n.text()).replace(/^# .*\n\n?/, ''); } catch { }
  drawGrid(); drawRight(notes); drawLeft();
}
async function addFiles(files) {
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return toast('Those aren\'t images', 'bad');
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const out = await Promise.all(imgs.map((f, i) => new Promise(res => { const r = new FileReader(); r.onload = () => res({ name: `${stamp}-${i + 1}-${slug(f.name.replace(/\.\w+$/, '')).slice(0, 30)}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, b64: r.result }); r.readAsDataURL(f); })));
  try { await saveFiles(`concepts/${session}`, out); toast(`Added ${out.length} to "${session}"`, 'ok'); } catch (e) { return toast('Could not save: ' + e.message, 'bad'); }
  load();
}

function drawLeft() {
  const sel = h('select', { title: 'Concept session (one folder each)', onchange: () => { session = sel.value; pref.set('concepts.session', session); load(); } }, h('option', { value: session }, session));
  sessions().then(list => { const all = [...new Set([session, ...list])].sort(); sel.replaceChildren(...all.map(n => h('option', { value: n }, n))); sel.value = session; });
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Session', h('span', { class: 'grow' }),
        h('button', { class: 'btn sm ghost', title: 'Start a new concept session (a new folder)', onclick: () => { const n = prompt('Name for the session, e.g. "sewer level" or "bell-ringer boss"'); if (!n) return; session = slug(n); pref.set('concepts.session', session); api('/api/fs', { op: 'mkdir', path: dir() }).catch(() => {}).then(load); } }, 'New')),
      sel, h('p', { class: 'note' }, `${items.length} image${items.length === 1 ? '' : 's'} in concepts/${session}/`)),
    h('div', { class: 'sec' }, h('h3', {}, 'Make images on'),
      h('div', { class: 'csites' }, ...SITES.map(([n, u]) => h('a', { href: u, target: '_blank', rel: 'noopener', class: 'btn sm', title: `Open ${n} in a new tab on this device` }, n + ' ↗'))),
      h('p', { class: 'note' }, 'It opens on the device you are using (laptop, phone). Copy or save an image there, then paste or drop it here.')));
}
function drawGrid() {
  V.grid.replaceChildren(...(items.length ? items.map(it => {
    const url = rawURL(it.path);
    return h('div', { class: 'ccard' }, h('img', { src: url, loading: 'lazy', title: it.name, onclick: () => window.open(url, '_blank') }),
      h('div', { class: 'cacts' },
        h('button', { class: 'btn sm', title: 'Open in Forge as the source: pixelize it into a sprite', onclick: () => emit('forge-image', it.path) }, 'Pixelize'),
        h('button', { class: 'btn sm ghost', title: 'Use as the guide image in Forge (shape and design reference for a new generation)', onclick: () => emit('forge-guide', url) }, 'Guide'),
        h('button', { class: 'btn sm ghost', title: 'Cut it into frames in Animate (for sheets)', onclick: () => emit('slice-sheet', it.path) }, 'Frames'),
        h('button', { class: 'ibtn', title: 'Move to the trash (kept in .trash, not deleted)', onclick: async () => { await api('/api/fs', { op: 'trash', path: it.path }).catch(e => toast(e.message, 'bad')); load(); } }, '✕')));
  }) : [h('p', { class: 'note', style: { gridColumn: '1/-1' } }, 'Nothing here yet. Open meta.ai (left), make something, then paste or drop it above.')]));
}
function drawRight(notes) {
  const ta = h('textarea', { rows: 18, value: notes, placeholder: 'Ideas, prompts that worked, what to try next…', style: { width: '100%' },
    oninput: () => { clearTimeout(notesT); notesT = setTimeout(() => saveFiles(`concepts/${session}`, [{ name: 'notes.md', text: `# ${session}\n\n${ta.value}\n` }]).catch(() => {}), 1000); } });
  V.right.replaceChildren(h('div', { class: 'sec' }, h('h3', {}, 'Notes'), ta, h('p', { class: 'note' }, 'Saved as notes.md in this session\'s folder.')));
}

registerWheel('concepts', () => ({
  tools: [{ label: 'Add images', run: () => V.pick?.click() }, ...SITES.slice(0, 4).map(([n, u]) => ({ label: n, hint: 'new tab', run: () => window.open(u, '_blank', 'noopener') }))],
  guides: [{ label: 'Refresh', run: load }],
}));
registerKeys('concepts', [['Ctrl+V', 'Paste an image you copied on meta.ai (or anywhere)'], ['Drop files', 'Add them to this session'], ['Click an image', 'Open it full size']]);
