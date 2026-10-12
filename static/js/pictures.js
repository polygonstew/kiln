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

// one picture out of a sheet (icons in a grid, a character sheet): pick the sheet, set how many columns and rows it
// has (Kiln guesses from the gaps), click the cell you want. use(dataURL) gets that cell, trimmed.
export function pickFromSheet(title, use) {
  pickPicture(title + ': the sheet', async url => {
    const im = await imgData(url), cv = toCanvas(im), guess = gaps(im);
    let cols = guess[0], rows = guess[1];
    const view = h('canvas', { class: 'sheet-view', title: 'Click the picture you want' });
    const draw = () => { view.width = cv.width; view.height = cv.height; const x = view.getContext('2d'); x.drawImage(cv, 0, 0); x.strokeStyle = '#ff5b2e'; x.lineWidth = Math.max(1, cv.width / 400);
      for (let c = 1; c < cols; c++) { x.beginPath(); x.moveTo(c * cv.width / cols, 0); x.lineTo(c * cv.width / cols, cv.height); x.stroke(); }
      for (let r = 1; r < rows; r++) { x.beginPath(); x.moveTo(0, r * cv.height / rows); x.lineTo(cv.width, r * cv.height / rows); x.stroke(); } };
    const num = (v, set) => h('input', { type: 'number', min: 1, max: 32, value: v, style: { width: '56px' }, onchange: e => { set(Math.max(1, +e.target.value)); draw(); } });
    const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(900px, 96vw)' } },
      h('header', {}, h('span', { class: 'grow' }, title + ': pick one'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
      h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Columns ', num(cols, v => { cols = v; }), ' rows ', num(rows, v => { rows = v; }), ' · click the one you want.'), h('div', { class: 'sheet-wrap' }, view))));
    view.onclick = e => {
      const r = view.getBoundingClientRect(), c = Math.floor((e.clientX - r.left) / r.width * cols), w = Math.floor((e.clientY - r.top) / r.height * rows);
      const cw = cv.width / cols, ch = cv.height / rows, o = document.createElement('canvas'); o.width = Math.round(cw); o.height = Math.round(ch);
      o.getContext('2d').drawImage(cv, c * cw, w * ch, cw, ch, 0, 0, o.width, o.height);
      m.remove(); use(o.toDataURL('image/png'));
    };
    document.body.append(m); draw();
  });
}
// columns and rows of a sheet from its empty (transparent or near-white) lines between pictures
function gaps(im) {
  const empty = (i) => im.data[i + 3] < 30 || (im.data[i] > 240 && im.data[i + 1] > 240 && im.data[i + 2] > 240);
  const runs = (n, m, at) => { let count = 0, inside = false; for (let a = 0; a < n; a++) { let blank = true; for (let b = 0; b < m && blank; b += 2) blank = empty(at(a, b)); if (!blank && !inside) count++; inside = !blank; } return Math.max(1, count); };
  return [runs(im.width, im.height, (x, y) => (y * im.width + x) * 4), runs(im.height, im.width, (y, x) => (y * im.width + x) * 4)];
}
