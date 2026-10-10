// Kiln core: DOM helpers, API, palettes, hardware limits and the pixel pipeline.

/* ----------------------------------------------------------------- dom ---- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k in e && k !== 'list' && k !== 'type') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 10);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

let toastT;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) document.body.append(t = h('div', { id: 'toast' }));
  t.className = 'show ' + kind;
  t.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = ''), kind === 'bad' ? 6000 : 3200);
}

export const bus = new EventTarget();
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
export const on = (n, f) => bus.addEventListener(n, e => f(e.detail));

/* ----------------------------------------------------------------- api ---- */
export async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ err: r.statusText }));
  if (!r.ok) throw new Error(j.err || r.statusText);
  return j;
}
export const rawURL = p => '/api/fs/raw?path=' + encodeURIComponent(p) + '&t=' + Date.now();

/* --------------------------------------------------------------- color ---- */
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
export const rgb = s => { s = s.replace('#', ''); if (s.length === 3) s = [...s].map(c => c + c).join(''); const n = parseInt(s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// "redmean" distance: cheap and close to perceptual for palette work
export function dist(a, b) {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
export const luma = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
export const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
export function nearest(c, pal) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) { const d = dist(c, pal[i]); if (d < bd) { bd = d; bi = i; } }
  return bi;
}

/* ------------------------------------------------------------ palettes ---- */
const P = s => s.trim().split(/\s+/).map(rgb);
export const PALETTES = {
  nes: { name: 'NES 2C02', colors: P(`
    7c7c7c 0000fc 0000bc 4428bc 940084 a80020 a81000 881400 503000 007800 006800 005800 004058 000000
    bcbcbc 0078f8 0058f8 6844fc d800cc e40058 f83800 e45c10 ac7c00 00b800 00a800 00a844 008888
    f8f8f8 3cbcfc 6888fc 9878f8 f878f8 f85898 f87858 fca044 f8b800 b8f818 58d854 58f898 00e8d8 787878
    fcfcfc a4e4fc b8b8f8 d8b8f8 f8b8f8 f8a4c0 f0d0b0 fce0a8 f8d878 d8f878 b8f8b8 b8f8d8 00fcfc f8d8f8`) },
  dmg: { name: 'Game Boy DMG', colors: P('0f380f 306230 8bac0f 9bbc0f') },
  pocket: { name: 'GB Pocket', colors: P('000000 555555 aaaaaa ffffff') },
  pico8: { name: 'PICO-8', colors: P('000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa') },
  c64: { name: 'C64', colors: P('000000 ffffff 880000 aaffee cc44cc 00cc55 0000aa eeee77 dd8855 664400 ff7777 333333 777777 aaff66 0088ff bbbbbb') },
  sweetie: { name: 'Sweetie 16', colors: P('1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57') },
  noir: { name: 'Noir (ink + blood)', colors: P('000000 141414 3a3a3a 7a7a7a c8c8c8 f2f2f2 8a0012 d1001f') },
  bone: { name: 'Bone & rust', colors: P('0d0b0a 2a211c 4b3a2f 7a5c45 a98a6a d8c4a4 f1e9d8 5a1a14 9c3a1c d9772f') },
};

/* Hardware modes: colour depth + how many colours a sprite / a scene may use. */
export const HARDWARE = {
  nes: { name: 'NES', note: '3 colours + transparent per sprite, from the 54-colour master', master: 'nes', sprite: 3, scene: 13, depth: null },
  gb: { name: 'Game Boy', note: '4 shades of green', master: 'dmg', sprite: 3, scene: 4, depth: null },
  sms: { name: 'Master System', note: '6-bit RGB, 15 colours + transparent', master: null, sprite: 15, scene: 31, depth: 2 },
  genesis: { name: 'Genesis', note: '9-bit RGB, 15 colours + transparent per palette line', master: null, sprite: 15, scene: 61, depth: 3 },
  snes: { name: 'SNES', note: '15-bit RGB, 15 colours + transparent per sprite palette', master: null, sprite: 15, scene: 96, depth: 5 },
  free: { name: 'Free', note: 'any 24-bit colours, you set the count', master: null, sprite: 24, scene: 64, depth: null },
};
// Round to a hardware colour grid with `bits` per channel (SNES 5, Genesis 3, SMS 2).
export function snapDepth(c, bits) {
  if (!bits) return c;
  const m = (1 << bits) - 1;
  return c.map(v => Math.round(Math.round(v / 255 * m) * 255 / m));
}

/* -------------------------------------------------------------- images ---- */
export const newImg = (w, h) => new ImageData(w, h);
export const cloneImg = im => new ImageData(new Uint8ClampedArray(im.data), im.width, im.height);
export function toCanvas(im, scale = 1, cv) {
  cv = cv || document.createElement('canvas');
  cv.width = im.width * scale; cv.height = im.height * scale;
  const x = cv.getContext('2d');
  if (scale === 1) x.putImageData(im, 0, 0);
  else { x.imageSmoothingEnabled = false; x.drawImage(toCanvas(im), 0, 0, cv.width, cv.height); }
  return cv;
}
export const toDataURL = im => toCanvas(im).toDataURL('image/png');
export function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('could not load image')); i.src = src; });
}
export async function imgData(src) {
  const i = typeof src === 'string' ? await loadImage(src) : src;
  const c = document.createElement('canvas');
  c.width = i.naturalWidth || i.width; c.height = i.naturalHeight || i.height;
  const x = c.getContext('2d'); x.drawImage(i, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}
export function crop(im, x0, y0, w, h) {
  const o = newImg(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0;
    if (sx < 0 || sy < 0 || sx >= im.width || sy >= im.height) continue;
    const s = (sy * im.width + sx) * 4, d = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) o.data[d + k] = im.data[s + k];
  }
  return o;
}
// Paste src into dst at (x,y), alpha > 0 wins.
export function blit(dst, src, x0, y0) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const dx = x + x0, dy = y + y0;
    if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
    const s = (y * src.width + x) * 4;
    if (src.data[s + 3] < 128) continue;
    const d = (dy * dst.width + dx) * 4;
    dst.data[d] = src.data[s]; dst.data[d + 1] = src.data[s + 1]; dst.data[d + 2] = src.data[s + 2]; dst.data[d + 3] = 255;
  }
  return dst;
}
export function bbox(im) {
  let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] >= 128) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function flipX(im) {
  const o = newImg(im.width, im.height);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const s = (y * im.width + x) * 4, d = (y * im.width + (im.width - 1 - x)) * 4;
    for (let k = 0; k < 4; k++) o.data[d + k] = im.data[s + k];
  }
  return o;
}
export function shift(im, dx, dy) { const o = newImg(im.width, im.height); return blit(o, im, dx, dy); }
// nearest-neighbour resize
export function resizeNN(im, w, h) {
  const o = newImg(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(im.width - 1, Math.floor(x * im.width / w)), sy = Math.min(im.height - 1, Math.floor(y * im.height / h));
    const s = (sy * im.width + sx) * 4, d = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) o.data[d + k] = im.data[s + k];
  }
  return o;
}
export function colorsOf(im) {
  const m = new Map();
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) {
    const k = im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => [k >> 16 & 255, k >> 8 & 255, k & 255]);
}

/* ------------------------------------------------------- quantisation ---- */
export function kmeans(px, k, iters = 10) {
  if (!px.length) return [];
  k = Math.min(k, px.length);
  const cs = [px[Math.floor(px.length / 2)]];
  const d2 = new Float64Array(px.length).fill(Infinity);
  while (cs.length < k) {          // k-means++ seeding, deterministic (farthest point)
    let bi = 0, bd = -1;
    const last = cs[cs.length - 1];
    for (let i = 0; i < px.length; i++) { const d = dist(px[i], last); if (d < d2[i]) d2[i] = d; if (d2[i] > bd) { bd = d2[i]; bi = i; } }
    if (bd <= 0) break;
    cs.push(px[bi]);
  }
  for (let it = 0; it < iters; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) { const s = sum[nearest(p, cs)]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; }
    let moved = false;
    for (let i = 0; i < cs.length; i++) if (sum[i][3]) {
      const n = sum[i].slice(0, 3).map(v => Math.round(v / sum[i][3]));
      if (dist(n, cs[i]) > 1) moved = true;
      cs[i] = n;
    }
    if (!moved) break;
  }
  return cs;
}
function samplePx(im, max = 24000) {
  const out = [], n = im.width * im.height, step = Math.max(1, Math.floor(n / max));
  for (let i = 0; i < n; i += step) { const o = i * 4; if (im.data[o + 3] >= 128) out.push([im.data[o], im.data[o + 1], im.data[o + 2]]); }
  return out;
}
// Choose a palette for an image under a hardware mode. Returns unique colours, dark→light.
export function buildPalette(im, { hw = 'free', count, lock = null, master: mOver = null } = {}) {
  if (lock && lock.length) return lock.slice();
  const H = HARDWARE[hw] || HARDWARE.free;
  const master = mOver || (H.master ? PALETTES[H.master].colors : null);
  const n = count || H.sprite;
  if (master && master.length <= n) return master.slice().sort((a, b) => luma(a) - luma(b));
  let cs = kmeans(samplePx(im), n);
  if (master) cs = cs.map(c => master[nearest(c, master)]);
  else cs = cs.map(c => snapDepth(c, H.depth));
  const seen = new Set();
  cs = cs.filter(c => { const k = hex(c); if (seen.has(k)) return false; seen.add(k); return true; });
  return cs.sort((a, b) => luma(a) - luma(b));
}
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
export const BAYER2 = [0, 2, 3, 1].map(v => (v + 0.5) / 4 - 0.5);
// Map every pixel to the palette, optionally with ordered dithering.
export function applyPalette(im, pal, { dither = 'none', amount = 0.5, alpha = 128 } = {}) {
  const o = newImg(im.width, im.height);
  const spread = amount * 64;
  const cache = new Map();
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const i = (y * im.width + x) * 4;
    if (im.data[i + 3] < alpha) continue;
    let c = [im.data[i], im.data[i + 1], im.data[i + 2]];
    if (dither !== 'none') {
      const t = dither === 'bayer2' ? BAYER2[(y & 1) * 2 + (x & 1)] : BAYER4[(y & 3) * 4 + (x & 3)];
      c = c.map(v => clamp(Math.round(v + t * spread), 0, 255));
    }
    const k = c[0] << 16 | c[1] << 8 | c[2];
    let pi = cache.get(k);
    if (pi === undefined) { pi = nearest(c, pal); cache.set(k, pi); }
    const p = pal[pi];
    o.data[i] = p[0]; o.data[i + 1] = p[1]; o.data[i + 2] = p[2]; o.data[i + 3] = 255;
  }
  return o;
}

/* --------------------------------------------------- pixel pipeline ---- */
// Flood-fill the background away starting from the border. Returns a copy.
export function keyBackground(im, tol = 40, global = false) {
  const o = cloneImg(im), { width: w, height: hh, data: d } = o;
  // the most common border colour is the background
  const counts = new Map();
  const at = (x, y) => (y * w + x) * 4;
  const quant = i => (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3;
  for (let x = 0; x < w; x++) for (const y of [0, hh - 1]) { const q = quant(at(x, y)); counts.set(q, (counts.get(q) || 0) + 1); }
  for (let y = 0; y < hh; y++) for (const x of [0, w - 1]) { const q = quant(at(x, y)); counts.set(q, (counts.get(q) || 0) + 1); }
  const topQ = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [(topQ >> 10 & 31) << 3 | 4, (topQ >> 5 & 31) << 3 | 4, (topQ & 31) << 3 | 4];
  const T = tol * tol * 3;
  const near = i => dist([d[i], d[i + 1], d[i + 2]], bg) <= T;
  if (global) {
    for (let i = 0; i < d.length; i += 4) if (near(i)) d[i + 3] = 0;
    return o;
  }
  const seen = new Uint8Array(w * hh), st = [];
  const push = (x, y) => { const p = y * w + x; if (!seen[p] && near(p * 4)) { seen[p] = 1; st.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, hh - 1); }
  for (let y = 0; y < hh; y++) { push(0, y); push(w - 1, y); }
  while (st.length) {
    const p = st.pop(), x = p % w, y = (p / w) | 0;
    d[p * 4 + 3] = 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < hh - 1) push(x, y + 1);
  }
  // gaps the figure closes in (between legs, inside a lantern handle): same flat background colour,
  // tighter tolerance, and big enough to be a gap rather than a highlight
  const T2 = T / 4, minA = Math.max(4, w * hh / 2500);
  for (let p0 = 0; p0 < w * hh; p0++) {
    if (seen[p0] || d[p0 * 4 + 3] === 0 || dist([d[p0 * 4], d[p0 * 4 + 1], d[p0 * 4 + 2]], bg) > T2) continue;
    const comp = [p0]; seen[p0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < hh - 1 ? p + w : -1])
        if (q >= 0 && !seen[q] && dist([d[q * 4], d[q * 4 + 1], d[q * 4 + 2]], bg) <= T2) { seen[q] = 1; comp.push(q); }
    }
    if (comp.length >= minA) for (const p of comp) d[p * 4 + 3] = 0;
  }
  return o;
}
// Reduce to (tw, th) by majority vote per block of an already palette-mapped image.
export function majorityDown(im, tw, th) {
  const o = newImg(tw, th), sw = im.width / tw, sh = im.height / th;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * sw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw));
    const y0 = Math.floor(y * sh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh));
    const m = new Map(); let clear = 0, tot = 0;
    // weight the block centre more: keeps thin features from being voted away
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * im.width + xx) * 4; tot++;
      if (im.data[i + 3] < 128) { clear++; continue; }
      const cx = (xx - x0 + 0.5) / (x1 - x0) - 0.5, cy = (yy - y0 + 0.5) / (y1 - y0) - 0.5;
      const wgt = 1.5 - Math.min(1, Math.hypot(cx, cy) * 1.4);
      const k = im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2];
      m.set(k, (m.get(k) || 0) + wgt);
    }
    if (clear > tot * 0.55 || !m.size) continue;
    let bk = 0, bv = -1; for (const [k, v] of m) if (v > bv) { bv = v; bk = k; }
    const d = (y * tw + x) * 4;
    o.data[d] = bk >> 16 & 255; o.data[d + 1] = bk >> 8 & 255; o.data[d + 2] = bk & 255; o.data[d + 3] = 255;
  }
  return o;
}
// 1px outline outside the shape (4-neighbour), in colour c.
export function outline(im, c, diagonal = false) {
  const o = cloneImg(im), w = im.width, hh = im.height, a = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && im.data[(y * w + x) * 4 + 3] >= 128;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    if (a(x, y)) continue;
    let n = a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1);
    if (!n && diagonal) n = a(x - 1, y - 1) || a(x + 1, y - 1) || a(x - 1, y + 1) || a(x + 1, y + 1);
    if (n) { const i = (y * w + x) * 4; o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; o.data[i + 3] = 255; }
  }
  return o;
}
// Remove lone pixels: an opaque pixel with no opaque 4-neighbours, and single
// pixels whose colour matches none of their 8 neighbours (replaced by the majority).
export function despeckle(im) {
  const o = cloneImg(im), w = im.width, hh = im.height;
  const px = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= hh) return -1; const i = (y * w + x) * 4; return im.data[i + 3] < 128 ? -1 : im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2]; };
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const c = px(x, y); if (c < 0) continue;
    const n4 = [px(x - 1, y), px(x + 1, y), px(x, y - 1), px(x, y + 1)];
    const i = (y * w + x) * 4;
    if (n4.every(v => v < 0)) { o.data[i + 3] = 0; continue; }
    const n8 = [...n4, px(x - 1, y - 1), px(x + 1, y - 1), px(x - 1, y + 1), px(x + 1, y + 1)].filter(v => v >= 0);
    if (n8.length >= 6 && !n8.includes(c)) {
      const m = new Map(); for (const v of n8) m.set(v, (m.get(v) || 0) + 1);
      const [best, cnt] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      if (cnt >= 4) { o.data[i] = best >> 16 & 255; o.data[i + 1] = best >> 8 & 255; o.data[i + 2] = best & 255; }
    }
  }
  return o;
}
/* ----------------------------------------------- native pixel grid ---- */
// AI "pixel art" is a big image drawn on a coarse grid of fake pixels (often 10-20 px each,
// not perfectly even). Resampling it on any other grid smears features, so find the real grid:
// colour edges line up on the cell boundaries. Returns {cell, xs, ys} (cut lines) or null.
export function detectGrid(im, hint = 0) {
  const { width: w, height: hh, data: d } = im;
  if (w < 96 || hh < 96) return null;
  const prof = (n, m, at) => {          // edge strength at each boundary along one axis
    const p = new Float64Array(n);
    for (let a = 1; a < n; a++) { let s = 0; for (let b = 0; b < m; b += 2) { const i = at(a, b), j = at(a - 1, b); s += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]); } p[a] = s; }
    const pm = new Float64Array(n);     // max-filter radius 1: tolerates uneven cells
    for (let a = 1; a < n - 1; a++) pm[a] = Math.max(p[a - 1], p[a], p[a + 1]);
    let base = 0; for (let a = 0; a < n; a++) base += pm[a]; base = base / n || 1;
    return { p, pm, base, n };
  };
  const X = prof(w, hh, (x, y) => (y * w + x) * 4), Y = prof(hh, w, (y, x) => (y * w + x) * 4);
  // the cell size is the strongest period in the edge profiles (a Fourier peak, both axes summed)
  const ft = (P, s) => { let re = 0, im2 = 0; const k = 2 * Math.PI / s; for (let a = 0; a < P.n; a++) { const v = P.pm[a] - P.base; re += v * Math.cos(k * a); im2 -= v * Math.sin(k * a); } return [re, im2]; };
  const mag = s => { const [a, b] = ft(X, s), [c, e] = ft(Y, s); return Math.hypot(a, b) + Math.hypot(c, e); };
  // real cells are small next to the picture (>= ~40 across); a hint (the reference's cell, for an
  // actor's later frames) narrows the search so every frame is read on the same kind of grid
  const lo = hint ? Math.max(4, hint * 0.6) : 4, hi = hint ? Math.min(Math.min(w, hh) / 24, hint * 1.6) : Math.min(w, hh) / 40, ms = [];
  for (let s = lo; s <= hi; s += 0.04) ms.push([s, mag(s)]);
  if (!ms.length) return null;
  const sorted = ms.map(m => m[1]).sort((a, b) => a - b), med = sorted[sorted.length >> 1] || 1;
  let bi = 0; for (let i = 1; i < ms.length; i++) if (ms[i][1] > ms[bi][1]) bi = i;
  if (ms[bi][1] / med < 2.2) return null;   // no clear grid (photo, painting, already-small sprite)
  const c = { s: ms[bi][0] };
  // phase of the peak = where the cut lines sit
  const phase = P => { const [re, im2] = ft(P, c.s); return ((-Math.atan2(im2, re) / (2 * Math.PI) * c.s) % c.s + c.s) % c.s; };
  c.px = phase(X); c.py = phase(Y);
  const lines = (P, ph) => {
    const out = [], win = Math.max(1, Math.floor(c.s * 0.3)), strong = P.base * 1.5;
    const snap = e => {
      let bi = Math.round(e), bv = -1;
      for (let a = Math.max(1, Math.round(e) - win); a <= Math.min(P.n - 1, Math.round(e) + win); a++) if (P.p[a] > bv) { bv = P.p[a]; bi = a; }
      return bv > strong ? bi : Math.round(e);
    };
    let first = snap(ph); while (first - c.s > 0) first = Math.round(first - c.s);
    for (let pos = first; pos < P.n - 1;) { if (pos > 0 && (!out.length || pos - out[out.length - 1] >= c.s * 0.5)) out.push(pos); pos = snap(pos + c.s); if (pos <= out[out.length - 1]) pos = out[out.length - 1] + Math.round(c.s); }
    if (out[0] > 0) out.unshift(0);
    if (P.n - out[out.length - 1] >= c.s * 0.5) out.push(P.n); else out[out.length - 1] = P.n;
    return out;
  };
  return { cell: c.s, xs: lines(X, c.px), ys: lines(Y, c.py) };
}
// One pixel per grid cell: the dominant colour of the cell's middle (edges blur between cells).
export function snapGrid(im, g) {
  const { xs, ys } = g, o = newImg(xs.length - 1, ys.length - 1), W = im.width;
  for (let cy = 0; cy < ys.length - 1; cy++) for (let cx = 0; cx < xs.length - 1; cx++) {
    const x0 = xs[cx], x1 = xs[cx + 1], y0 = ys[cy], y1 = ys[cy + 1];
    const mx = Math.floor((x1 - x0) * 0.25), my = Math.floor((y1 - y0) * 0.25);
    const m = new Map(); let clear = 0, tot = 0;
    for (let y = y0 + my; y < Math.max(y0 + my + 1, y1 - my); y++) for (let x = x0 + mx; x < Math.max(x0 + mx + 1, x1 - mx); x++) {
      const i = (y * W + x) * 4; tot++;
      if (im.data[i + 3] < 128) { clear++; continue; }
      const k = (im.data[i] >> 3) << 10 | (im.data[i + 1] >> 3) << 5 | im.data[i + 2] >> 3;
      let e = m.get(k); if (!e) m.set(k, e = [0, 0, 0, 0]);
      e[0] += im.data[i]; e[1] += im.data[i + 1]; e[2] += im.data[i + 2]; e[3]++;
    }
    if (clear * 2 > tot || !m.size) continue;
    let b = null; for (const e of m.values()) if (!b || e[3] > b[3]) b = e;
    const j = (cy * o.width + cx) * 4;
    o.data[j] = Math.round(b[0] / b[3]); o.data[j + 1] = Math.round(b[1] / b[3]); o.data[j + 2] = Math.round(b[2] / b[3]); o.data[j + 3] = 255;
  }
  return o;
}

/* The whole sprite pipeline: AI image -> transparent, paletted, sized sprite.
   opts: {w, h, hw, count, lock, key, tol, outline, outlineColor, despeckle, dither, fit:'contain'|'stretch', anchor:'bottom'|'center', pad} */
function centreDown(im, w, h) {
  const o = newImg(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.floor((y + 0.5) * im.height / h) * im.width + Math.floor((x + 0.5) * im.width / w)) * 4, d = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) o.data[d + k] = im.data[s + k];
  }
  return o;
}
const GRIDS = new WeakMap();
export function gridOf(src, hint = 0) {
  const k = 'g' + (hint ? hint.toFixed(1) : '');
  let m = GRIDS.get(src); if (!m) GRIDS.set(src, m = {});
  if (!(k in m)) m[k] = detectGrid(src, hint);
  return m[k];
}
export function pixelize(src, o) {
  let im = o.key ? keyBackground(src, o.tol ?? 40, o.keyGlobal) : cloneImg(src);
  // painted mask (Uint8Array, one per source pixel): 1 = always keep (undo the background removal there), 2 = always remove
  if (o.mask && o.mask.length === src.width * src.height) for (let p = 0; p < o.mask.length; p++) {
    if (o.mask[p] === 1) im.data.set(src.data.subarray(p * 4, p * 4 + 4), p * 4); else if (o.mask[p] === 2) im.data[p * 4 + 3] = 0;
  }
  // work on the art's own pixels when it has a grid: 1 cell = 1 sprite pixel, nothing smeared
  const g = o.grid !== false && o.fit !== 'stretch' ? gridOf(src, o.cellHint ? o.cellHint * src.width / 1024 : 0) : null;
  const unit = g ? g.cell : 1;          // source px per working px
  if (g) im = snapGrid(im, g);
  const bb = o.fit === 'stretch' ? { x: 0, y: 0, w: im.width, h: im.height } : bbox(im);
  if (!bb) return { img: newImg(o.w, o.h), pal: [] };
  const pad = (o.outline ? 1 : 0) + (o.pad || 0);
  const pal = buildPalette(g ? crop(im, bb.x, bb.y, bb.w, bb.h) : im, { hw: o.hw, count: o.count, lock: o.lock, master: o.master });
  const mapped = applyPalette(crop(im, bb.x, bb.y, bb.w, bb.h), pal, { dither: o.dither || 'none', amount: o.ditherAmt ?? 0.5 });
  let tw = o.w - pad * 2, th = o.h - pad * 2, scale = null;
  if (o.fit !== 'stretch') {
    // a fixed scale (sprite px per source px) keeps every pose of an actor the same size
    scale = o.scale ? o.scale * unit : Math.min(tw / bb.w, th / bb.h);
    if (g && (o.scale ? Math.abs(scale - 1) < 0.1 : scale >= 1)) scale = 1;   // native art: never resample by a hair, never blow up
    tw = Math.max(1, Math.round(bb.w * scale)); th = Math.max(1, Math.round(bb.h * scale));
    if (!o.scale) { tw = Math.min(tw, o.w - pad * 2); th = Math.min(th, o.h - pad * 2); }
    if (o.auto && g) { scale = 1; tw = bb.w; th = bb.h; }   // the art's own size, every pixel kept
  }
  // with a fixed scale a wide pose (a lunge, a swing) is never squashed: the canvas grows instead
  const up8 = v => Math.ceil(v / 8) * 8;
  const W = o.auto && g ? up8(tw + pad * 2) : Math.max(o.w, tw + pad * 2), H = o.auto && g ? up8(th + pad * 2) : Math.max(o.h, th + pad * 2);
  const same = tw === bb.w && th === bb.h;
  // from native art, sampling each block's centre keeps 1-px features (eyes, a staff) that a vote would drop
  let small = same ? mapped : g ? centreDown(mapped, tw, th) : majorityDown(mapped, tw, th);
  if (o.despeckle && !g) small = despeckle(small);
  let out = newImg(W, H);
  const ox = Math.floor((W - tw) / 2), oy = o.anchor === 'center' ? Math.floor((H - th) / 2) : H - pad - th;
  blit(out, small, ox, oy);
  if (o.outline) {
    const oc = o.outlineColor ? rgb(o.outlineColor) : pal[0] || [0, 0, 0];
    out = outline(out, oc, o.outline === 'thick');
  }
  return { img: out, pal: colorsOf(out).sort((a, b) => luma(a) - luma(b)), scale: scale == null ? null : scale / unit, grid: g, cell1024: g ? g.cell * 1024 / src.width : 0, native: g ? [bb.w, bb.h] : null };
}

/* ---------------------------------------------------------- file save ---- */
export function download(name, data) {
  const a = h('a', { href: typeof data === 'string' ? data : URL.createObjectURL(data), download: name });
  document.body.append(a); a.click(); a.remove();
}
export const b64 = dataURL => dataURL.split(',')[1];

/* ------------------------------------------------- checker background ---- */
export function checker(x, w, hh, s = 4, a = '#2a2a28', b = '#33322f') {
  x.fillStyle = a; x.fillRect(0, 0, w, hh); x.fillStyle = b;
  for (let y = 0; y < hh; y += s) for (let xx = ((y / s) & 1) * s; xx < w; xx += s * 2) x.fillRect(xx, y, s, s);
}

/* --------------------------------------------- persisted small prefs ---- */
// zoom that shows a w×h image whole in a W×H area: whole pixels (crisp) when it fits, scaled down below 1× when it does not
export const fitZoom = (W, H, w, h) => { const f = Math.min(W / w, H / h); return !(f > 0) ? 1 : f >= 1 ? Math.floor(f) : f; };
export const pref = {
  get(k, d) { try { const v = localStorage.getItem('kiln.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kiln.' + k, JSON.stringify(v)); } catch { } },
};

/* ------------------------------------------------------ number fields ---- */
// A labelled control row. kind: range|number|select|color|check|text
export function field(label, input, hint) {
  return h('label', { class: 'fld' }, h('span', { class: 'fl' }, label), input, hint ? h('span', { class: 'fh' }, hint) : null);
}
export function range(val, min, max, step, onInput, fmt = v => v) {
  const out = h('output', {}, fmt(val));
  const r = h('input', { type: 'range', min, max, step, value: val, oninput: () => { out.textContent = fmt(+r.value); onInput(+r.value); } });
  return h('span', { class: 'rng' }, r, out);
}
export function select(opts, val, onChange) {
  const s = h('select', { onchange: () => onChange(s.value) }, ...opts.map(o => Array.isArray(o) ? h('option', { value: o[0] }, o[1]) : h('option', { value: o }, o)));
  s.value = val;
  return s;
}
export function check(label, val, onChange) {
  const c = h('input', { type: 'checkbox', checked: !!val, onchange: () => onChange(c.checked) });
  return h('label', { class: 'chk' }, c, h('span', {}, label));
}
export function seg(opts, val, onChange) {
  const box = h('div', { class: 'seg' });
  const draw = v => { box.replaceChildren(...opts.map(([k, l, t]) => h('button', { class: k === v ? 'on' : '', title: t || '', onclick: () => { draw(k); onChange(k); } }, l))); };
  draw(val);
  return box;
}

/* ---------------------------------------------------- collision outlines ---- */
// Opaque shapes -> simplified closed polygons (pixel-corner coordinates), for Godot CollisionPolygon2D.
// Holes are filled (a collider is solid), shapes smaller than minArea px are skipped.
export function tracePolys(im, { minArea = 24, eps = 1.5, alpha = 128 } = {}) {
  const w = im.width, hh = im.height, N = w * hh, d = im.data;
  const lab = new Int32Array(N).fill(-1), polys = [];
  const solid = p => d[p * 4 + 3] >= alpha;
  for (let p0 = 0; p0 < N; p0++) {
    if (lab[p0] >= 0 || !solid(p0)) continue;
    // 4-connected component
    const id = polys.length + 1e6 + p0, comp = [p0]; lab[p0] = id;
    let x0 = w, y0 = hh, x1 = 0, y1 = 0;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < hh - 1 ? p + w : -1])
        if (q >= 0 && lab[q] < 0 && solid(q)) { lab[q] = id; comp.push(q); }
    }
    if (comp.length < minArea) continue;
    // fill holes: everything in the box not reachable from outside the shape is inside
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3, out = new Uint8Array(bw * bh), inC = (x, y) => {
      const X = x + x0 - 1, Y = y + y0 - 1; return X >= 0 && Y >= 0 && X < w && Y < hh && lab[Y * w + X] === id;
    };
    const st = [0]; out[0] = 1;
    while (st.length) {
      const q = st.pop(), x = q % bw, y = (q / bw) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]])
        if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && !out[ny * bw + nx] && !inC(nx, ny)) { out[ny * bw + nx] = 1; st.push(ny * bw + nx); }
    }
    const ins = (X, Y) => { const x = X - x0 + 1, y = Y - y0 + 1; return x >= 0 && y >= 0 && x < bw && y < bh && !out[y * bw + x]; };
    // walk the pixel-edge contour clockwise (inside on the right), from the top-left pixel's top-left corner
    const sx = comp.reduce((m, p) => { const x = p % w, y = (p / w) | 0; return y < m[1] || (y === m[1] && x < m[0]) ? [x, y] : m; }, [w, hh]);
    const AL = [[0, -1], [0, 0], [-1, 0], [-1, -1]], AR = [[0, 0], [-1, 0], [-1, -1], [0, -1]], DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
    let x = sx[0], y = sx[1], dir = 0, pts = [], guard = 0;
    do {
      const l = ins(x + AL[dir][0], y + AL[dir][1]), r = ins(x + AR[dir][0], y + AR[dir][1]);
      const nd = l ? (dir + 3) % 4 : r ? dir : (dir + 1) % 4;
      if (nd !== dir || !pts.length) pts.push([x, y]);
      dir = nd; x += DX[dir]; y += DY[dir];
    } while ((x !== sx[0] || y !== sx[1]) && ++guard < 4 * N);
    polys.push(simplifyClosed(pts, eps));
  }
  return polys.filter(p => p.length >= 3);
}
function simplifyClosed(pts, eps) {
  if (pts.length < 4) return pts;
  // split at the point farthest from the first, simplify both halves (Douglas-Peucker)
  let far = 0, fd = -1;
  pts.forEach((p, i) => { const dd = (p[0] - pts[0][0]) ** 2 + (p[1] - pts[0][1]) ** 2; if (dd > fd) { fd = dd; far = i; } });
  const dp = (a) => {
    if (a.length < 3) return a;
    const [p, q] = [a[0], a[a.length - 1]], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    let bi = 0, bd = -1;
    for (let i = 1; i < a.length - 1; i++) { const dd = Math.abs((q[0] - p[0]) * (p[1] - a[i][1]) - (p[0] - a[i][0]) * (q[1] - p[1])) / L; if (dd > bd) { bd = dd; bi = i; } }
    return bd > eps ? [...dp(a.slice(0, bi + 1)).slice(0, -1), ...dp(a.slice(bi))] : [p, q];
  };
  const A = dp(pts.slice(0, far + 1)), B = dp([...pts.slice(far), pts[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}
