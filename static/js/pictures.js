// Picking a picture for a room, a scene of the Flow or a page: a saved Scenes backdrop (its layers flattened into one
// image), a picture already in the game folder (rooms/, concepts/, backgrounds/, pictures/), or a file from the computer.
// use(url) gets a data URL or a /api/fs/raw URL.
import { h, imgData, toCanvas, rawURL } from './core.js';
import { S as FS } from './files.js';
import { listScenes } from './playbuild.js';

const ls = async rel => ((await (await fetch('/api/fs?path=' + encodeURIComponent(FS.root + '/' + rel))).json().catch(() => ({ items: [] }))).items || []);

// a picture from a saved scene (its layers flattened), the folder, or the computer
export async function pickPicture(title, use) {
  const body = h('div', { class: 'rm-picks' }, h('p', { class: 'note' }, 'Looking…'));
  const file = h('input', { type: 'file', accept: 'image/*', onchange: () => { const f = file.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { m.remove(); use(r.result); }; r.readAsDataURL(f); } });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(760px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, title), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, body, h('p', { class: 'note' }, 'From your computer: ', file, ' · Forge → Background makes painted places; Scenes stacks them in layers.'))));
  document.body.append(m);
  const tiles = [];
  for (const [n] of await listScenes('backgrounds')) tiles.push(h('button', { class: 'rm-pick', title: `The scene "${n}", its layers flattened`, onclick: async () => { m.remove(); use(await flatten(n)); } }, h('img', { src: rawURL(`${FS.root}/backgrounds/${n}/${n}.png`), onerror: e => e.target.remove() }), h('b', {}, 'Scene: ' + n)));
  const IMG = /\.(png|jpe?g|webp)$/i, found = [];
  for (const d of ['pictures', 'rooms', 'concepts', 'backgrounds']) {
    const top = await ls(d);
    found.push(...top.filter(i => IMG.test(i.name)));
    for (const sub of top.filter(i => i.dir && !i.name.startsWith('.'))) found.push(...(await ls(`${d}/${sub.name}`)).filter(i => IMG.test(i.name)).slice(0, 24));
  }
  for (const i of found)
    tiles.push(h('button', { class: 'rm-pick', title: i.path.slice(FS.root.length + 1), onclick: () => { m.remove(); use(rawURL(i.path)); } }, h('img', { src: rawURL(i.path), loading: 'lazy' }), h('b', {}, i.name)));
  body.replaceChildren(...(tiles.length ? tiles : [h('p', { class: 'note' }, 'Nothing in this game yet: make a background in Forge or Scenes, or pick a file below.')]));
}
async function flatten(name) {
  const dir = `${FS.root}/backgrounds/${name}`, sj = await (await fetch(rawURL(dir + '/scene.json'))).json();
  const layers = [];
  for (const l of sj.layers) if (l.file && l.visible !== false) layers.push({ ...l, cv: toCanvas(await imgData(rawURL(`${dir}/${l.file}`))) });
  const W = Math.max(sj.view?.w || 480, ...layers.map(l => l.cv.width)), H = sj.view?.h || 270;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  for (const l of layers) { x.globalAlpha = l.opacity ?? 1; for (let px = 0; px < W; px += l.repeat ? l.cv.width : W) x.drawImage(l.cv, px, l.y || 0); }
  return c.toDataURL('image/png');
}
