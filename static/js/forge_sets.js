// Forge → Icon set and Tileset: things that come in sets and must match. An icon set is a list of items (potion,
// key, sword…) generated one by one, then crushed into ONE shared palette at one size, so they sit together in an
// inventory; saved as icons/<set>/<item>.png + a sheet. A tileset is one material (mossy stone, rotten planks…)
// generated as a seamless texture, shrunk to a tile, and turned into fill variants, lit top edges and platform pieces
// that Levels takes as its tileset (its autotile then joins walls up).
import { h, toast, emit, pref, imgData, toCanvas, toDataURL, pixelize, buildPalette, newImg, blit, luma } from './core.js';
import { saveFiles } from './files.js';
import { STYLE } from './style.js';
import { engineSeg, genOne } from './forge_kit.js';

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'set';
// onNew: the maker's own "start a new one" (settings and pictures in hand go; what was already saved to the game stays)
const shell = (host, title, sub, onNew) => {
  const ov = h('div', { class: 'workshop fm' }), left = h('div', { class: 'pp-side' }), mid = h('div', { class: 'pp-stage fm-grid' }), right = h('div', { class: 'pp-side' });
  ov.append(h('div', { class: 'pp-bar' }, h('b', {}, title), h('span', {}, sub), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm ghost', title: `Start a new one: clears what is here (pictures already saved to the game stay)`, onclick: () => confirm(`Start a new ${title.toLowerCase()}?\n\nWhat is on this page is cleared; anything already saved into the game stays.`) && onNew() }, 'New'),
    h('button', { class: 'btn sm go', onclick: () => ov.remove() }, 'Back to Forge')),
    h('div', { class: 'fm-body' }, left, mid, right));
  host.append(ov);
  return { ov, left, mid, right };
};
const zoomed = (im, z) => { const c = toCanvas(im); c.style.width = im.width * z + 'px'; c.style.height = im.height * z + 'px'; c.style.imageRendering = 'var(--ir)'; return c; };
const hw = () => STYLE.hw || 'snes';

/* ------------------------------------------------------------ icon set ---- */
export function openIconSet(host) {
  const DEF = () => ({ set: 'items', names: 'healing potion, iron key, short sword, round shield, gold coin, bomb', look: '', size: 16, colours: 16, outline: true, engine: 'cloud' });
  const S = Object.assign(DEF(), pref.get('forge.icons', {}));
  const keep = () => pref.set('forge.icons', S), src = {}, out = {};      // name → source picture, name → icon
  const fresh = () => { Object.assign(S, DEF()); for (const k of Object.keys(src)) delete src[k]; for (const k of Object.keys(out)) delete out[k]; keep(); drawLeft(); draw(); };
  const { left, mid, right } = shell(host, 'Icon set', 'a list of items, one look', fresh);
  const names = () => S.names.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  function drawLeft() {
    left.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'The items'),
      h('textarea', { rows: 5, title: 'One item per line or comma', oninput: e => { S.names = e.target.value; keep(); draw(); } }, S.names),
      h('input', { type: 'text', value: S.look, placeholder: 'their look, e.g. "rusted, gothic, worn leather"', title: 'Words every icon gets, so they belong together', oninput: e => { S.look = e.target.value; keep(); } }),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Size'), ...[16, 24, 32].map(n => h('button', { class: 'btn sm' + (S.size === n ? ' go' : ' ghost'), title: `${n}×${n} pixels`, onclick: () => { S.size = n; keep(); drawLeft(); crush(); } }, n + ''))),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Colours'), h('input', { type: 'range', min: 4, max: 32, value: S.colours, title: 'How many colours the whole set shares', oninput: e => { S.colours = +e.target.value; keep(); crush(); } }),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.outline, onchange: e => { S.outline = e.target.checked; keep(); crush(); } }), ' outline'))),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Generator'), engineSeg(S.engine, v => { S.engine = v; keep(); }, ['cloud', 'fast']),
        h('button', { class: 'btn go wide', style: { marginTop: '8px' }, title: 'One image per item (items you already have stay)', onclick: () => names().filter(n => !src[n]).forEach(make) }, 'Make the icons')));
    right.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'Into the game'), h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Set name'), h('input', { type: 'text', value: S.set, title: 'Saved as icons/<set name>/', oninput: e => { S.set = slug(e.target.value); keep(); } })),
      h('button', { class: 'btn go wide', title: 'Save each icon and a sheet into icons/<set>/', onclick: saveSet }, 'Save the set'),
      h('p', { class: 'note' }, 'Every icon shares one palette and one size, so the set looks made together. HUD → Inventory → an item → Icon picks them.')));
  }
  function draw() {
    mid.replaceChildren(...names().map(n => h('div', { class: 'fm-cell' }, out[n] ? zoomed(out[n], Math.max(2, Math.floor(96 / S.size))) : h('div', { class: 'fm-wait' }, src[n] === null ? '…' : '·'),
      h('small', {}, n), src[n] ? h('button', { class: 'ibtn', title: 'Make this one again', onclick: () => make(n) }, '↻') : '')));
  }
  async function make(n) {
    src[n] = null; draw();
    try { src[n] = await imgData(await genOne(S.engine, `a single ${n} as a game item icon, centered, filling most of the picture, ${S.look}, isolated on a plain white background`, 512, 512, 'icon · ' + n, 'text, frame, border, hands')); }
    catch (e) { delete src[n]; toast(`${n}: ${e.message}`, 'bad'); }
    crush();
  }
  // one palette from every source together, then each icon in it at the set size
  function crush() {
    const have = names().filter(n => src[n]);
    if (!have.length) return draw();
    const firsts = have.map(n => pixelize(src[n], { w: S.size, h: S.size, hw: hw(), count: S.colours, key: true, tol: 40, outline: false, despeckle: true, fit: 'contain', anchor: 'center' }).img);
    const pool = newImg(S.size * firsts.length, S.size); firsts.forEach((im, i) => blit(pool, im, i * S.size, 0));
    const pal = buildPalette(pool, { hw: hw(), count: S.colours });
    for (const n of have) out[n] = pixelize(src[n], { w: S.size, h: S.size, hw: hw(), count: S.colours, lock: pal, key: true, tol: 40, outline: S.outline ? 'outer' : false, despeckle: true, fit: 'contain', anchor: 'center' }).img;
    draw();
  }
  async function saveSet() {
    const have = names().filter(n => out[n]);
    if (!have.length) return toast('Make some icons first', 'bad');
    const sheet = newImg(S.size * have.length, S.size); have.forEach((n, i) => blit(sheet, out[n], i * S.size, 0));
    await saveFiles(`icons/${S.set}`, [...have.map(n => ({ name: slug(n) + '.png', b64: toDataURL(out[n]) })), { name: 'sheet.png', b64: toDataURL(sheet) },
      { name: 'sheet.json', text: JSON.stringify({ size: S.size, icons: have.map(slug) }, null, 1) + '\n' }]);
    toast(`Saved ${have.length} icons to icons/${S.set}/`, 'ok');
  }
  drawLeft(); draw();
}

/* ------------------------------------------------------------- tileset ---- */
// the cleanest quarter of a texture, resized to n × n and made to wrap: blended with itself shifted by half, so each edge
// meets the opposite one (the classic offset trick); a tile made from it repeats with no seam
function seamless(src, n) {
  const s = Math.min(src.width, src.height) / 2, c = document.createElement('canvas'); c.width = c.height = n;
  // the cleanest quarter: fewest stark white / black pixels (generators sometimes drop a stray object in)
  const stark = (qx, qy) => { let k = 0; for (let y = qy; y < qy + s; y += 4) for (let x = qx; x < qx + s; x += 4) { const i = (y * src.width + x) * 4, l = src.data[i] + src.data[i + 1] + src.data[i + 2]; if (l > 700 || l < 45) k++; } return k; };
  const [qx, qy] = [[0, 0], [s, 0], [0, s], [s, s]].sort((a, b) => stark(...a) - stark(...b))[0];
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(toCanvas(src), qx, qy, s, s, 0, 0, n, n);
  const a = x.getImageData(0, 0, n, n), o = newImg(n, n), half = n / 2;
  for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
    const m = Math.min(1, 2 * Math.min(xx, n - 1 - xx) / n * 2, 2 * Math.min(y, n - 1 - y) / n * 2);   // 1 inside, 0 at the edges
    const i = (y * n + xx) * 4, j = (((y + half) % n) * n + (xx + half) % n) * 4;
    for (let k = 0; k < 3; k++) o.data[i + k] = a.data[i + k] * m + a.data[j + k] * (1 - m);
    o.data[i + 3] = 255;
  }
  return o;
}
export function openTileset(host) {
  const DEF = () => ({ material: 'mossy cathedral stone blocks', tile: 16, colours: 12, engine: 'cloud', name: 'stone' });
  const S = Object.assign(DEF(), pref.get('forge.tiles', {}));
  const keep = () => pref.set('forge.tiles', S);
  let src = null, sheet = null;
  const fresh = () => { Object.assign(S, DEF()); src = null; sheet = null; keep(); mid.replaceChildren(); drawLeft(); };
  const { left, mid, right } = shell(host, 'Tileset', 'one material, tiles that join up', fresh);
  function drawLeft() {
    left.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'The material'),
      h('textarea', { rows: 3, title: 'What the ground, walls or platforms are made of', oninput: e => { S.material = e.target.value; keep(); } }, S.material),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Tile'), ...[16, 32].map(n => h('button', { class: 'btn sm' + (S.tile === n ? ' go' : ' ghost'), title: `${n}×${n} pixel tiles`, onclick: () => { S.tile = n; keep(); drawLeft(); build(); } }, n + ''))),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Colours'), h('input', { type: 'range', min: 4, max: 24, value: S.colours, title: 'Colours in the whole tileset', oninput: e => { S.colours = +e.target.value; keep(); build(); } }))),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Generator'), engineSeg(S.engine, v => { S.engine = v; keep(); }, ['cloud', 'fast']),
        h('button', { class: 'btn go wide', style: { marginTop: '8px' }, title: 'A seamless texture of the material, turned into tiles', onclick: make }, src ? 'Make another' : 'Make the tiles')));
    right.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'Into the game'), h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Name'), h('input', { type: 'text', value: S.name, oninput: e => { S.name = slug(e.target.value); keep(); } })),
      h('button', { class: 'btn go wide', title: 'Use these tiles in Levels (set what each tile is there: solid, one-way…; its Autotile joins walls up)', onclick: toLevels }, 'Use in Levels'),
      h('button', { class: 'btn sm ghost', style: { marginTop: '6px' }, title: 'Save the sheet as tiles/<name>.png', onclick: () => sheet && saveFiles('tiles', [{ name: S.name + '.png', b64: toDataURL(sheet) }]).then(() => toast(`Saved tiles/${S.name}.png`, 'ok')) }, 'Save the sheet'),
      h('p', { class: 'note' }, 'Row 1: four fills (flipped so repeats don\'t show). Row 2: two lit tops, a platform and its underside.')));
  }
  async function make() {
    mid.replaceChildren(h('div', { class: 'fm-wait' }, 'Making the texture…'));
    try { src = await imgData(await genOne(S.engine, `seamless texture of ${S.material}, a close-up surface filling the whole square edge to edge, evenly lit, flat straight-on view`, 512, 512, 'tiles · ' + S.material.slice(0, 30), 'text, border, frame, vignette', 'texture')); }
    catch (e) { return toast(e.message, 'bad'); }
    build();
  }
  // the middle of the texture at a tile-friendly scale, made seamless, then variants and edges from it
  function build() {
    if (!src) return;
    const T = S.tile, base = pixelize(seamless(src, T * 4), { w: T, h: T, hw: hw(), count: S.colours, key: false, outline: false, despeckle: false, fit: 'stretch' }).img;
    const flip = (im, fx, fy) => { const o = newImg(T, T); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) o.data.set(im.data.subarray(((fy ? T - 1 - y : y) * T + (fx ? T - 1 - x : x)) * 4, ((fy ? T - 1 - y : y) * T + (fx ? T - 1 - x : x)) * 4 + 4), (y * T + x) * 4); return o; };
    const cols = []; for (let i = 0; i < base.data.length; i += 4) cols.push([base.data[i], base.data[i + 1], base.data[i + 2]]);
    const sorted = cols.slice().sort((a, b) => luma(a) - luma(b)), light = sorted[sorted.length - 1], dark = sorted[0];
    // a lit top (a light row over a dark one, like a ledge's rim) and / or a dark bottom row
    const edge = (im, top, bottom) => {
      const o = newImg(T, T); o.data.set(im.data);
      for (let x = 0; x < T; x++) {
        if (top) { o.data.set([...light, 255], x * 4); o.data.set([...dark, 255], (T + x) * 4); }
        if (bottom) o.data.set([...dark, 255], ((T - 1) * T + x) * 4);
      }
      return o;
    };
    const tiles = [base, flip(base, 1, 0), flip(base, 0, 1), flip(base, 1, 1), edge(base, 1, 0), edge(flip(base, 1, 0), 1, 0), edge(base, 1, 1), edge(flip(base, 0, 1), 0, 1)];
    sheet = newImg(T * 4, T * 2); tiles.forEach((t, i) => blit(sheet, t, (i % 4) * T, Math.floor(i / 4) * T));
    // how it reads in a level: a little wall of the tiles
    const demo = newImg(T * 8, T * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) blit(demo, y === 0 ? tiles[4 + (x % 2)] : tiles[(x + y * 3) % 4], x * T, y * T);
    const z = Math.max(2, Math.floor(320 / (T * 8)));
    mid.replaceChildren(h('div', { class: 'fm-cell' }, zoomed(sheet, z), h('small', {}, 'the tiles')), h('div', { class: 'fm-cell' }, zoomed(demo, z), h('small', {}, 'as a wall')));
  }
  function toLevels() {
    if (!sheet) return toast('Make the tiles first', 'bad');
    emit('level-tileset', { url: toDataURL(sheet), tile: S.tile, name: S.name });
  }
  drawLeft();
}
