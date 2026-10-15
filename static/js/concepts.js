// Concepts: a board per idea. Open an image site (meta.ai, Gemini…) in a tab on your own device, then drop,
// paste or upload what you like here. Works from any browser that reaches Kiln (SSH/LAN/phone), unlike Kiln Studio.
// Images live in <asset folder>/concepts/<session>/, notes in notes.md next to them; Forge's tray shows new ones.
import { h, api, toast, emit, pref, rawURL, imgData, pixelize, buildPalette, newImg, blit, bbox, toCanvas, toDataURL, HARDWARE, field, range, seg, select, smooth } from './core.js';
import { cutout } from './cutout.js';
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
        h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'Start a new concept session (a new folder)', onclick: () => { const n = prompt('Name for the session, e.g. "sewer level" or "bell-ringer boss"'); if (!n) return; session = slug(n); pref.set('concepts.session', session); api('/api/fs', { op: 'mkdir', path: dir() }).catch(() => {}).then(load); } }, 'New')),
      sel, h('p', { class: 'note' }, `${items.length} image${items.length === 1 ? '' : 's'} in concepts/${session}/`),
      items.length ? h('button', { class: 'btn go wide', title: 'Turn every image here into a sprite with ONE shared height (and, in the Pixel look, palette and outline), so they belong together', onclick: batch }, 'Batch → sprites') : null),
    h('div', { class: 'sec' }, h('h3', {}, 'Make images on'),
      h('div', { class: 'csites' }, ...SITES.map(([n, u]) => h('a', { href: u, target: '_blank', rel: 'noopener', class: 'btn sm', title: `Open ${n} in a new tab on this device` }, n + ' ↗'))),
      h('p', { class: 'note' }, 'It opens on the device you are using (laptop, phone). Copy or save an image there, then paste or drop it here.')));
}
/* ---- batch: the whole session as one consistent set of sprites ---- */
async function batch() {
  const fp = pref.get('forge', {}), o = { hw: fp.hw || 'snes', count: fp.count || 12, outline: fp.outline === 'none' ? false : (fp.outline || 'outer'), height: 0 };
  const full = smooth();                                // Modern look: keep every colour (cutout), no palette or hardware
  const srcs = [];
  for (const it of items) { try { srcs.push({ it, im: await imgData(rawURL(it.path)) }); } catch { } }
  if (!srcs.length) return toast('No images to read', 'bad');
  const body = h('div', { class: 'bgrid' }), ctl = h('div'), info = h('p', { class: 'note' });
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(1200px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, `Batch: ${srcs.length} images → sprites`), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 280px', maxHeight: '74vh' } }, h('div', { style: { overflow: 'auto', padding: '12px' } }, body), h('div', { style: { padding: '10px 14px', borderLeft: '1px solid var(--line)' } }, ctl, info)),
    h('footer', {}, h('button', { class: 'btn ghost', onclick: () => m.remove() }, 'Cancel'), h('button', { class: 'btn go', onclick: () => saveAll() }, 'Save ticked to sprites/'))));
  document.body.append(m);
  // pass 1: each image's own pixels (art grid, background removed) to measure them and pool their colours
  const first = srcs.map(({ im }) => full ? cutout(im) : pixelize(im, { w: 256, h: 256, auto: true, hw: o.hw, count: HARDWARE[o.hw].sprite, key: true, tol: 38, outline: false, anchor: 'bottom' }).img);
  const hs = first.map(f => bbox(f)?.h || f.height).sort((a, b) => a - b);
  o.height = hs[hs.length >> 1];                        // default: everyone at the median height
  let res = [];
  const run = () => {
    const H = HARDWARE[o.hw], n = Math.min(o.count, H.sprite);
    // one palette from all of them together, so the set shares colours
    const W = first.reduce((a, f) => a + f.width, 0), Hh = Math.max(...first.map(f => f.height)), pool = newImg(W, Hh);
    let x = 0; for (const f of first) { blit(pool, f, x, 0); x += f.width; }
    const pal = full ? [] : buildPalette(pool, { hw: o.hw, count: n });
    const pad = o.outline ? 1 : 0;
    res = srcs.map(({ it, im }, i) => {
      const r = full ? { img: cutout(im, { height: o.height }) } : o.height > 0
        ? pixelize(im, { w: 512, h: o.height + pad * 2, fit: 'contain', hw: o.hw, lock: pal, key: true, tol: 38, outline: o.outline, anchor: 'bottom' })
        : pixelize(im, { w: 64, h: 64, auto: true, hw: o.hw, lock: pal, key: true, tol: 38, outline: o.outline, anchor: 'bottom' });
      // trim the empty sides so each sprite is just as wide as it needs to be
      const b = bbox(r.img), img = b ? (() => { const t = newImg(b.w + pad * 2, r.img.height); blit(t, r.img, -b.x + pad, 0); return t; })() : r.img;
      const prev = res[i];
      return { it, img, keep: prev ? prev.keep : true, name: prev ? prev.name : it.name.replace(/^\d+-\d+-/, '').replace(/\.\w+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'sprite_' + (i + 1) };
    });
    info.textContent = `${full ? 'full colour' : pal.length + ' shared colours'} · ${o.height > 0 ? o.height + ' px tall each' : 'each at its own size'}`;
    body.replaceChildren(...res.map(r => {
      const c = toCanvas(r.img); c.style.cssText = `height:${Math.min(160, r.img.height * 3)}px;image-rendering:var(--ir)`;
      const nm = h('input', { type: 'text', value: r.name, oninput: () => { r.name = nm.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_'); } });
      return h('div', { class: 'bcard' + (r.keep ? '' : ' off') }, c,
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: r.keep, onchange: e => { r.keep = e.target.checked; e.target.closest('.bcard').classList.toggle('off', !r.keep); } }), h('span', {}, `${r.img.width}×${r.img.height}`)), nm);
    }));
  };
  ctl.replaceChildren(
    h('h3', {}, 'Same for all'),
    field('Height', range(o.height, 0, 160, 1, v => { o.height = v; run(); }, v => v ? v + ' px' : 'own size'), 'Every sprite this tall (0 keeps each one\'s own size)'),
    ...(full ? [] : [field('Hardware', select(Object.entries(HARDWARE).map(([k, H]) => [k, H.name]), o.hw, v => { o.hw = v; run(); })),
      field('Colours', range(o.count, 2, 32, 1, v => { o.count = v; run(); }), 'Shared by the whole set'),
      field('Outline', seg([['none', 'None'], ['outer', '1px']], o.outline ? 'outer' : 'none', v => { o.outline = v === 'none' ? false : 'outer'; run(); }))]));
  run();
  async function saveAll() {
    const keep = res.filter(r => r.keep && r.name);
    if (!keep.length) return toast('Nothing ticked', 'bad');
    const have = new Set(((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }))).items || []).map(i => i.name));
    const done = [];
    for (const r of keep) {
      let n = r.name, k = 2; while (have.has(n)) n = `${r.name}_${k++}`;    // never write into an existing sprite folder
      have.add(n);
      await saveFiles(`sprites/${n}`, [{ name: n + '.png', b64: toDataURL(r.img) }]).catch(e => toast(e.message, 'bad'));
      done.push(n);
    }
    m.remove(); toast(`Saved ${done.length} sprite${done.length > 1 ? 's' : ''}: ${done.join(', ')}`, 'ok');
  }
}
function drawGrid() {
  V.grid.replaceChildren(...(items.length ? items.map(it => {
    const url = rawURL(it.path);
    return h('div', { class: 'ccard' }, h('img', { src: url, loading: 'lazy', title: it.name, onclick: () => window.open(url, '_blank') }),
      h('div', { class: 'cacts' },
        h('button', { class: 'btn sm', title: 'Open in Forge as the source: pixelize it into a sprite', onclick: () => emit('forge-image', it.path) }, 'Pixelize'),
        h('button', { class: 'btn sm ghost', title: 'Use as the guide image in Forge (shape and design reference for a new generation)', onclick: () => emit('forge-guide', url) }, 'Guide'),
        h('button', { class: 'btn sm ghost', title: 'Cut it into frames in Animate (for sheets)', onclick: () => emit('slice-sheet', it.path) }, 'Frames'),
        h('button', { class: 'btn sm go', title: 'Make an actor from it: pixelized with your Forge settings, with the full hero animation set laid out to pose', onclick: () => { const n = prompt('Name for the actor', it.name.replace(/^\d+-\d+-/, '').replace(/\.\w+$/, '').slice(0, 24)); if (n) emit('make-actor', { path: it.path, name: n.toLowerCase().replace(/[^a-z0-9]+/g, '_'), set: 'hero' }); } }, 'Actor'),
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
