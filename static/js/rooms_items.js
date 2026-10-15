// Rooms → Items: every item of the adventure (its name, picture and what the hero says about it) and the
// combinations (this + that → something new). Kept as the project kiln/items-adventure.json; Save room writes
// adventure/items.json for the game. Pictures come from icons/ (Forge → Icon set makes a matching set).
import { h, api, rawURL, imgData } from './core.js';
import { S as FS, saveFiles } from './files.js';

const slug = s => String(s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';
const ls = async rel => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + rel)).catch(() => ({ items: [] }))).items || []);

// I: { items: [{ id, name, look, icon }], combos: [{ a, b, makes, text }] }; save(I) keeps it
export async function openItems(I, save) {
  I.items ||= []; I.combos ||= [];
  const icons = [];
  for (const d of (await ls('icons')).filter(i => i.dir)) for (const i of await ls('icons/' + d.name)) if (/\.png$/i.test(i.name) && i.name !== 'sheet.png') icons.push(`icons/${d.name}/${i.name}`);
  const body = h('div', { class: 'body' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(820px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'The game\'s items'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  let t = 0; const keep = () => { clearTimeout(t); t = setTimeout(() => save(I), 500); };
  const opts = (v, none) => [h('option', { value: '' }, none), ...I.items.map(i => h('option', { value: i.id, selected: i.id === v }, i.name))];
  const pic = it => h('button', { class: 'it-pic', title: 'Pick its picture (from icons/)', onclick: () => pickIcon(it) }, it.icon ? h('img', { src: rawURL(FS.root + '/' + it.icon) }) : '?');
  // your own picture, or one cut out of a sheet: its background removed, 96 px tall, saved as icons/items/<id>.png
  const own = (it, fromSheet) => import('./pictures.js').then(P => (fromSheet ? P.pickFromSheet : P.pickPicture)(`Picture for ${it.name}`, async url => {
    const { cutout } = await import('./cutout.js'), im = cutout(await imgData(url, true), { height: 96 });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').putImageData(im, 0, 0);
    await saveFiles('icons/items', [{ name: it.id + '.png', b64: c.toDataURL('image/png') }]);
    it.icon = `icons/items/${it.id}.png`; keep(); draw();
  }));
  function pickIcon(it) {
    const box = h('div', { class: 'it-icons' }, h('button', { onclick: () => { it.icon = ''; keep(); draw(); } }, 'none'),
      h('button', { class: 'wide', title: 'Any picture: its plain background is removed', onclick: () => own(it, false) }, 'Picture…'),
      h('button', { class: 'wide', title: 'One picture cut out of a sheet of them', onclick: () => own(it, true) }, 'Sheet…'),
      ...icons.map(p => h('button', { title: p, onclick: () => { it.icon = p; keep(); draw(); } }, h('img', { src: rawURL(FS.root + '/' + p) }))));
    body.querySelector('.it-icons')?.remove();
    body.prepend(box);
  }
  function draw() {
    body.replaceChildren(
      h('p', { class: 'note', style: { marginTop: 0 } }, 'What the hero can carry. In the game: click an item to hold it, then click a thing to use it there, or another item to combine them. Right click an item to look at it.'),
      h('div', { class: 'it-rows' }, ...I.items.map(it => h('div', { class: 'it-row' }, pic(it),
        h('input', { type: 'text', value: it.name, title: 'Its name', onchange: e => { it.name = e.target.value; keep(); } }),
        h('small', { class: 'mono dim', title: 'The id hotspots, conversations and Logic use' }, it.id),
        h('input', { type: 'text', value: it.look || '', placeholder: 'What the hero says looking at it', class: 'grow', onchange: e => { it.look = e.target.value; keep(); } }),
        h('button', { class: 'ibtn', title: 'Remove this item', onclick: () => { I.items = I.items.filter(x => x !== it); keep(); draw(); } }, '✕')))),
      h('button', { class: 'btn sm', onclick: () => { const n = prompt('Name of the item', 'Rusty key'); if (!n) return; const id = slug(n); if (!I.items.some(i => i.id === id)) I.items.push({ id, name: n.trim(), look: '', icon: '' }); keep(); draw(); } }, '+ Item'),
      h('h3', { style: { marginTop: '18px' } }, 'Combinations'),
      h('div', { class: 'it-rows' }, ...I.combos.map(c => h('div', { class: 'it-row' },
        h('select', { title: 'This', onchange: e => { c.a = e.target.value; keep(); } }, ...opts(c.a, 'this…')), '+',
        h('select', { title: 'That', onchange: e => { c.b = e.target.value; keep(); } }, ...opts(c.b, 'that…')), '→',
        h('select', { title: 'Makes', onchange: e => { c.makes = e.target.value; keep(); } }, ...opts(c.makes, 'makes…')),
        h('input', { type: 'text', value: c.text || '', placeholder: 'What the hero says ("A grappling hook!")', class: 'grow', onchange: e => { c.text = e.target.value; keep(); } }),
        h('button', { class: 'ibtn', title: 'Remove this combination', onclick: () => { I.combos = I.combos.filter(x => x !== c); keep(); draw(); } }, '✕')))),
      h('button', { class: 'btn sm', title: 'Two items that make a third (both are used up)', onclick: () => { I.combos.push({ a: '', b: '', makes: '', text: '' }); keep(); draw(); } }, '+ Combination'));
  }
  draw();
}
