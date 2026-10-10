// HUD: pixel-exact bars, gauges, pips, counters, text, panels, slots and portraits.
// Everything is drawn at 1× with no anti-aliasing, then exported as engine-ready parts.
import { $, h, api, toast, on, pref, clamp, uid, field, range, select, check, seg, hex, rgb, mix, luma,
  newImg, toCanvas, toDataURL, imgData, rawURL, PALETTES } from './core.js';
import { drawText, measure, buildBMFont, FONTS } from './text.js';
import { icon } from './icons.js';
import { saveFiles, S as FS } from './files.js';
import { STYLE } from './style.js';

/* ------------------------------------------------------------ glyphs ---- */
const SHAPES = {
  heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  diamond: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  circle: ['..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..'],
  square: ['XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX'],
  skull: ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'XXXXXXX', '.XX.XX.', '.XXXXX.', '.X.X.X.'],
  bolt: ['...XXX.', '..XXX..', '.XXX...', 'XXXXXX.', '..XXX..', '.XX....', 'X......'],
  drop: ['...X...', '..XXX..', '.XXXXX.', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.'],
  star: ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', 'X.....X'],
  eye: ['.......', '..XXX..', '.XX.XX.', 'XX.X.XX', '.XX.XX.', '..XXX..', '.......'],
};
const NAMES = { bar: 'Bar', gauge: 'Gauge', pips: 'Pips', counter: 'Counter', text: 'Text', panel: 'Panel', slot: 'Slot', portrait: 'Portrait' };

/* ------------------------------------------------------------- state ---- */
function palette() {
  const p = STYLE.palette && STYLE.palette.length >= 4 ? STYLE.palette : PALETTES.bone.colors;
  const byL = p.slice().sort((a, b) => luma(a) - luma(b));
  const vivid = p.slice().sort((a, b) => sat(b) - sat(a));
  return { dark: hex(byL[0]), mid: hex(byL[Math.floor(byL.length * .35)]), light: hex(byL[byL.length - 1]), lit: hex(byL[Math.floor(byL.length * .7)]), accent: hex(vivid[0]), accent2: hex(vivid[1] || vivid[0]) };
}
const sat = c => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
function defaults(type) {
  const P = palette();
  const base = { id: uid(), type, name: type + '_' + Math.random().toString(36).slice(2, 5), x: 16, y: 16, value: .7 };
  switch (type) {
    case 'bar': return { ...base, w: 96, h: 9, style: 'solid', segments: 10, frame: 'bevel', cap: 'square', fill: P.accent, back: P.dark, edge: P.light, ghost: true, ghostCol: P.light, label: '', font: 'tiny' };
    case 'gauge': return { ...base, r: 18, thick: 4, start: 135, end: 405, fill: P.accent, back: P.dark, edge: P.light, ticks: 8, needle: false, label: '', font: 'tiny' };
    case 'pips': return { ...base, shape: 'heart', count: 5, value: .7, scale: 1, gap: 2, full: P.accent, empty: P.dark, edge: P.light, halves: true };
    case 'counter': return { ...base, num: 1250, digits: 6, prefix: 'SCORE ', font: 'small', color: P.light, outline: P.dark, shadow: '', scale: 1 };
    case 'text': return { ...base, text: 'THE PALLID MASK', font: 'body', color: P.light, outline: '', shadow: P.dark, scale: 1, align: 'left' };
    case 'panel': return { ...base, w: 120, h: 48, style: 'plate', corner: 4, fill: P.dark, edge: P.lit, edge2: P.mid };
    case 'slot': return { ...base, size: 20, style: 'plate', fill: P.dark, edge: P.lit, edge2: P.mid, count: 3, item: '' };
    case 'portrait': return { ...base, size: 36, style: 'double', fill: P.dark, edge: P.light, edge2: P.mid, img: '' };
  }
}
let HUD = pref.get('hud.cur', null) || { name: 'hud', view: { w: 480, h: 270 }, bg: 'checker', widgets: [] };
let sel = null, V = {}, mounted = false, demo = false, demoT = 0, bgImg = null;
const save = () => { pref.set('hud.cur', HUD); clearTimeout(save.t); save.t = setTimeout(() => api('/api/project', { id: 'hud-' + HUD.name, data: { meta: { kind: 'hud', name: HUD.name }, hud: HUD } }).catch(() => { }), 1200); };

/* ------------------------------------------------------------ drawing ---- */
// A tiny pixel context: integer fills only, so exports are crisp.
function px(im) {
  const put = (x, y, c) => { if (c === null) { if (x >= 0 && y >= 0 && x < im.width && y < im.height) im.data[(y * im.width + x) * 4 + 3] = 0; return; } if (!c || x < 0 || y < 0 || x >= im.width || y >= im.height) return; const i = (y * im.width + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; };
  return {
    put, rect(x, y, w, hh, c) { if (!c) return; for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c); },
    box(x, y, w, hh, c) { if (!c) return; for (let xx = x; xx < x + w; xx++) { put(xx, y, c); put(xx, y + hh - 1, c); } for (let yy = y; yy < y + hh; yy++) { put(x, yy, c); put(x + w - 1, yy, c); } },
  };
}
const C = s => s ? rgb(s) : null;
function frameBox(g, x, y, w, hh, style, fill, edge, edge2, corner = 3) {
  const F = C(fill), E = C(edge), E2 = C(edge2) || (E && mix(E, [0, 0, 0], .45));
  g.rect(x, y, w, hh, F);
  if (style === 'none') return;
  if (style === 'line') { g.box(x, y, w, hh, E); return; }
  if (style === 'bevel' || style === 'plate') {
    for (let i = 0; i < w; i++) { g.put(x + i, y, E); g.put(x + i, y + hh - 1, E2); }
    for (let i = 0; i < hh; i++) { g.put(x, y + i, E); g.put(x + w - 1, y + i, E2); }
    if (style === 'plate') { g.box(x - 1, y - 1, w + 2, hh + 2, C('#000000')); g.put(x - 1, y - 1, null); }
    return;
  }
  if (style === 'double') { g.box(x, y, w, hh, E); g.box(x + 2, y + 2, w - 4, hh - 4, E2); return; }
  if (style === 'rivets') { g.box(x, y, w, hh, E2); for (const [rx, ry] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + hh - 3], [x + w - 3, y + hh - 3]]) g.put(rx, ry, E); return; }
  if (style === 'notch') {
    g.box(x, y, w, hh, E);
    for (let i = 0; i < corner; i++) for (let j = 0; j < corner - i; j++) for (const [cx, cy] of [[x + i, y + j], [x + w - 1 - i, y + j], [x + i, y + hh - 1 - j], [x + w - 1 - i, y + hh - 1 - j]]) g.put(cx, cy, null);
    for (let i = 0; i < corner; i++) { g.put(x + i, y + corner - i, E); g.put(x + w - 1 - i, y + corner - i, E); g.put(x + i, y + hh - 1 - corner + i, E); g.put(x + w - 1 - i, y + hh - 1 - corner + i, E); }
    return;
  }
  if (style === 'gothic') {
    // pointed-arch top, ornamented corners: fits the darker games
    g.box(x, y, w, hh, E2); g.box(x + 1, y + 1, w - 2, hh - 2, E);
    const mid = x + Math.floor(w / 2);
    for (let i = 0; i < 4; i++) { g.put(mid - i, y - 1 - (3 - i), E); g.put(mid + i, y - 1 - (3 - i), E); }
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + hh - 1], [x + w - 1, y + hh - 1]]) { g.put(cx, cy, null); g.put(cx + (cx === x ? 1 : -1), cy + (cy === y ? 1 : -1), E2); }
  }
}
// clear-pixel helper: put(null) should erase
function erase(im, x, y) { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return; im.data[(y * im.width + x) * 4 + 3] = 0; }
function glyph(g, im, shape, x, y, s, fill, edge, half) {
  const G = SHAPES[shape] || SHAPES.heart;
  const on = (cx, cy) => G[cy] && G[cy][cx] === 'X';
  for (let cy = -1; cy <= 7; cy++) for (let cx = -1; cx <= 7; cx++) {
    const inside = on(cx, cy), near = !inside && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(cx + dx, cy + dy));
    let c = inside ? (half != null && cx >= half ? null : fill) : near ? edge : undefined;
    if (inside && half != null && cx >= half) c = 'EMPTY';
    if (c === undefined) continue;
    for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
      const X = x + (cx + 1) * s + xx, Y = y + (cy + 1) * s + yy;
      if (c === 'EMPTY') g.put(X, Y, g.emptyCol); else g.put(X, Y, c);
    }
  }
  // a one-pixel shine keeps the icon from reading flat
  if (fill && (half == null || half > 2)) g.put(x + 2 * s, y + 2 * s, mix(fill, [255, 255, 255], .6));
}
function arcFill(g, cx, cy, r0, r1, a0, a1, c) {
  for (let y = -r1; y <= r1; y++) for (let x = -r1; x <= r1; x++) {
    const d = Math.hypot(x + .5 - .5, y + .5 - .5);
    if (d < r0 - .5 || d > r1 + .5) continue;
    let a = Math.atan2(y, x) * 180 / Math.PI; if (a < 0) a += 360;
    let t = a; while (t < a0) t += 360;
    if (t <= a1) g.put(cx + x, cy + y, c);
  }
}
const sizeOf = w => {
  switch (w.type) {
    case 'bar': return { w: w.w + 2, h: w.h + 2 };
    case 'gauge': return { w: w.r * 2 + 3, h: w.r * 2 + 3 + (w.label ? 8 : 0) };
    case 'pips': return { w: w.count * (9 * w.scale + w.gap), h: 9 * w.scale };
    case 'counter': { const t = w.prefix + String(Math.round(w.num)).padStart(w.digits, '0'); const m = measure(t, w.font); return { w: m.w * w.scale + 2, h: m.h * w.scale + 2 }; }
    case 'text': { const m = measure(w.text || ' ', w.font); return { w: m.w * w.scale + 2, h: m.h * w.scale + 2 }; }
    case 'panel': return { w: w.w + 2, h: w.h + 6 };
    case 'slot': return { w: w.size + 2, h: w.size + 2 };
    case 'portrait': return { w: w.size + 2, h: w.size + 2 };
  }
};
// Render one widget into its own image (so it can be exported alone). value overrides w.value.
const imgCache = new Map();
function render(w, value = w.value, part = 'all') {
  const sz = sizeOf(w), pad = w.type === 'panel' ? 4 : 1;
  const im = newImg(sz.w + 2, sz.h + 2 + (w.type === 'panel' ? 0 : 0)), g = px(im);
  const o = 1;
  if (w.type === 'bar') {
    const ix = o + 1, iy = o + 1, iw = w.w - 2, ih = w.h - 2;
    if (part !== 'fill') frameBox(g, o, o, w.w, w.h, w.frame === 'bevel' ? 'bevel' : w.frame, w.back, w.edge, null);
    const F = C(w.fill), hi = mix(F, [255, 255, 255], .35), lo = mix(F, [0, 0, 0], .3);
    const fw = Math.round(iw * clamp(value, 0, 1));
    if (part !== 'frame') {
      if (w.ghost && part === 'all' && w._ghost > value) g.rect(ix, iy, Math.round(iw * w._ghost), ih, C(w.ghostCol));
      if (w.style === 'segments' || w.style === 'pips') {
        const n = w.segments, sw = Math.floor((iw - (n - 1)) / n), lit = Math.round(n * clamp(value, 0, 1));
        for (let i = 0; i < n; i++) { const sx = ix + i * (sw + 1); if (i < lit) { g.rect(sx, iy, sw, ih, F); g.rect(sx, iy, sw, 1, hi); g.rect(sx, iy + ih - 1, sw, 1, lo); } else if (w.style === 'pips') g.rect(sx, iy + ih - 1, sw, 1, C(w.edge) && mix(C(w.back), C(w.edge), .25)); }
      } else if (fw > 0) {
        g.rect(ix, iy, fw, ih, F); g.rect(ix, iy, fw, 1, hi); if (ih > 3) g.rect(ix, iy + ih - 1, fw, 1, lo);
      }
    }
    if (w.label && part === 'all') drawText(imCtx(im), w.label, o + 3, o + Math.max(0, Math.floor((w.h - FONTS[w.font].h) / 2)), { font: w.font, color: w.edge, shadow: w.back });
  } else if (w.type === 'gauge') {
    const cx = o + w.r + 1, cy = o + w.r + 1, a0 = w.start, a1 = w.end, av = a0 + (a1 - a0) * clamp(value, 0, 1);
    arcFill(g, cx, cy, w.r - w.thick, w.r, a0, a1, C(w.back));
    if (!w.needle) arcFill(g, cx, cy, w.r - w.thick + 1, w.r - 1, a0, av, C(w.fill));
    for (let i = 0; i <= w.ticks && w.ticks; i++) { const a = (a0 + (a1 - a0) * i / w.ticks) * Math.PI / 180; g.put(Math.round(cx + Math.cos(a) * (w.r + 1)), Math.round(cy + Math.sin(a) * (w.r + 1)), C(w.edge)); }
    if (w.needle) { const a = av * Math.PI / 180; for (let t = 0; t <= w.r - 2; t++) g.put(Math.round(cx + Math.cos(a) * t), Math.round(cy + Math.sin(a) * t), C(w.fill)); g.rect(cx - 1, cy - 1, 3, 3, C(w.edge)); }
    if (w.label) drawText(imCtx(im), w.label, cx, cy + w.r - 4, { font: w.font, color: w.edge, align: 'center' });
  } else if (w.type === 'pips') {
    const step = 9 * w.scale + w.gap, filled = w.count * clamp(value, 0, 1);
    g.emptyCol = C(w.empty);
    for (let i = 0; i < w.count; i++) {
      const f = clamp(filled - i, 0, 1);
      const half = f >= 1 ? null : f >= .5 && w.halves ? 4 : 0;
      glyph(g, im, w.shape, o + i * step - 1, o - 1, w.scale, half === 0 ? C(w.empty) : C(w.full), C(w.edge), half === 0 ? null : half);
    }
  } else if (w.type === 'counter') {
    const t = w.prefix + String(Math.round(w.num * (part === 'all' ? 1 : 1))).padStart(w.digits, '0');
    drawText(imCtx(im), t, o, o, { font: w.font, color: w.color, outline: w.outline || null, shadow: w.shadow || null, scale: w.scale });
  } else if (w.type === 'text') {
    const m = measure(w.text || ' ', w.font);
    drawText(imCtx(im), w.text || '', w.align === 'center' ? o + Math.floor(m.w * w.scale / 2) : w.align === 'right' ? o + m.w * w.scale : o, o, { font: w.font, color: w.color, outline: w.outline || null, shadow: w.shadow || null, scale: w.scale, align: w.align });
  } else if (w.type === 'panel') {
    frameBox(g, o, o + 4, w.w, w.h, w.style, w.fill, w.edge, w.edge2, w.corner);
  } else if (w.type === 'slot') {
    frameBox(g, o, o, w.size, w.size, w.style, w.fill, w.edge, w.edge2, 3);
    const it = w.item && imgCache.get(w.item);
    if (it) { const s = Math.min(1, (w.size - 4) / Math.max(it.width, it.height)); const d = s < 1 ? null : it; if (d) blitIm(im, d, o + Math.floor((w.size - d.width) / 2), o + Math.floor((w.size - d.height) / 2)); }
    if (w.count) drawText(imCtx(im), String(w.count), o + w.size - 2, o + w.size - 7, { font: 'tiny', color: w.edge, shadow: '#000000', align: 'right' });
  } else if (w.type === 'portrait') {
    frameBox(g, o, o, w.size, w.size, w.style, w.fill, w.edge, w.edge2, 3);
    const it = w.img && imgCache.get(w.img);
    if (it) { const cw = w.size - 6; const crop = cropTop(it, cw); blitIm(im, crop, o + 3, o + 3); }
  }
  return im;
}
function imCtx(im) {
  // drawText wants a 2D context; give it one that writes straight into the ImageData
  const g = px(im);
  return { set fillStyle(c) { this._c = rgb(c); }, fillRect(x, y, w, hh) { g.rect(x, y, w, hh, this._c); } };
}
function blitIm(dst, src, x0, y0) { for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) { const s = (y * src.width + x) * 4; if (src.data[s + 3] < 128) continue; const X = x + x0, Y = y + y0; if (X < 0 || Y < 0 || X >= dst.width || Y >= dst.height) continue; const d = (Y * dst.width + X) * 4; dst.data.set(src.data.subarray(s, s + 3), d); dst.data[d + 3] = 255; } }
function cropTop(im, size) {
  // head-and-shoulders: the top of the sprite, centred
  const o = newImg(size, size);
  let top = 0; outer: for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] >= 128) { top = y; break outer; }
  blitIm(o, im, Math.floor((size - im.width) / 2), -top + 1);
  return o;
}
async function loadImg(path) { if (!path || imgCache.has(path)) return; try { imgCache.set(path, await imgData(rawURL(path))); drawCanvas(); } catch { } }

/* ------------------------------------------------------------- layout ---- */
on('style', () => { if (mounted) drawRight(); });
export const hud = {
  id: 'hud', title: 'HUD', key: '5',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.cv = h('canvas', { style: { cursor: 'default' } });
    V.vp = h('div', { class: 'viewport', style: { background: '#0e0e0d' } }, V.cv);
    V.info = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
    V.demoBtn = h('button', { class: 'btn sm', title: 'Animate the values: see the meters move like in the game', onclick: () => { demo = !demo; V.demoBtn.classList.toggle('go', demo); } }, 'Play values');
    el.append(V.left,
      h('section', { class: 'stage' },
        h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'Screen'),
          select([['480x270', '480×270'], ['384x216', '384×216'], ['320x180', '320×180'], ['256x224', '256×224'], ['256x240', '256×240'], ['240x160', '240×160']], `${HUD.view.w}x${HUD.view.h}`, v => { const [w, hh] = v.split('x').map(Number); HUD.view = { w, h: hh }; save(); drawCanvas(); }),
          h('span', { class: 'lbl' }, 'Behind'), select([['checker', 'Checker'], ['#000000', 'Black'], ['#5f6b5c', 'Field'], ['scene', 'Latest scene']], HUD.bg, v => { HUD.bg = v; save(); loadBg(); }),
          V.demoBtn, h('span', { class: 'grow' }), V.info),
        V.vp,
        h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Drag widgets to place them. Arrows nudge 1px, Shift+arrows 8px, Delete removes, Ctrl+D duplicates.'))),
      V.right);
    bindCanvas(el);
    new ResizeObserver(() => drawCanvas()).observe(V.vp);
    let last = performance.now();
    const tick = t => { const dt = (t - last) / 1000; last = t; if (demo && el.classList.contains('on')) { demoT += dt; drawCanvas(); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (!HUD.widgets.length) starter();
    for (const w of HUD.widgets) { loadImg(w.item); loadImg(w.img); }
    loadBg(); drawLeft(); drawRight(); drawCanvas();
  },
  show() { drawCanvas(); },
};
function starter() {
  const P = palette();
  const add = (t, o) => { const w = { ...defaults(t), ...o }; HUD.widgets.push(w); return w; };
  add('portrait', { name: 'portrait', x: 8, y: 8 });
  add('bar', { name: 'health', x: 50, y: 10, w: 100, h: 8, fill: P.accent, value: .72 });
  add('bar', { name: 'stamina', x: 50, y: 21, w: 70, h: 5, style: 'segments', segments: 12, fill: P.lit, ghost: false, value: .5 });
  add('pips', { name: 'flasks', x: 50, y: 30, shape: 'drop', count: 4, value: .75 });
  add('counter', { name: 'score', x: 380, y: 8, num: 4180, digits: 6, prefix: '' });
  add('gauge', { name: 'madness', x: 432, y: 214, r: 18, thick: 4, value: .4, label: '' });
}
async function loadBg() {
  bgImg = null;
  if (HUD.bg === 'scene') {
    try {
      const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/backgrounds'));
      const sc = r.items.filter(i => i.dir && i.ok).sort((a, b) => b.mtime - a.mtime)[0];
      if (sc) {
        const sj = await (await fetch(rawURL(sc.path + '/scene.json'))).json();
        const c = document.createElement('canvas'); c.width = HUD.view.w; c.height = HUD.view.h;
        const x = c.getContext('2d');
        for (const l of sj.layers) { const im = await imgData(rawURL(sc.path + '/' + l.file)); x.drawImage(toCanvas(im), 0, l.y - (sj.view.h - HUD.view.h)); }
        bgImg = c;
      } else toast('No saved scene in backgrounds/ yet');
    } catch { }
  }
  drawCanvas();
}

/* ------------------------------------------------------------- canvas ---- */
let zoom = 2;
function liveValue(w, i) {
  if (!demo) return w.value;
  // each widget breathes on its own phase; bars also show the damage trail
  const v = (Math.sin(demoT * 1.3 + i * 1.7) + 1) / 2;
  if (w.type === 'bar') { w._ghost = Math.max(v, (w._ghost || 0) - .004); if (v > w._ghost) w._ghost = v; }
  return v;
}
function drawCanvas() {
  if (!V.cv) return;
  const { w, h: hh } = HUD.view;
  const zf = Math.min((V.vp.clientWidth - 24) / w, (V.vp.clientHeight - 24) / hh);
  zoom = zf >= 2 ? Math.floor(zf) : Math.max(.5, zf);
  V.cv.width = w; V.cv.height = hh; V.cv.style.width = Math.round(w * zoom) + 'px'; V.cv.style.height = Math.round(hh * zoom) + 'px';
  const x = V.cv.getContext('2d'); x.imageSmoothingEnabled = false;
  if (HUD.bg === 'checker') { x.fillStyle = '#2a2a28'; x.fillRect(0, 0, w, hh); x.fillStyle = '#31302d'; for (let yy = 0; yy < hh; yy += 8) for (let xx = (yy / 8 & 1) * 8; xx < w; xx += 16) x.fillRect(xx, yy, 8, 8); }
  else if (HUD.bg === 'scene' && bgImg) x.drawImage(bgImg, 0, 0);
  else { x.fillStyle = HUD.bg === 'scene' ? '#000' : HUD.bg; x.fillRect(0, 0, w, hh); }
  HUD.widgets.forEach((wd, i) => {
    if (wd.hidden) return;
    const v = liveValue(wd, i);
    if (wd.type === 'counter' && demo) wd._num = wd._num == null ? wd.num : wd._num;
    const im = render(wd.type === 'counter' && demo ? { ...wd, num: wd.num + Math.floor(demoT * 37) } : wd, v);
    x.drawImage(toCanvas(im), wd.x - 1, wd.y - 1 - (wd.type === 'panel' ? 0 : 0));
  });
  const s = HUD.widgets.find(w => w.id === sel);
  if (s) { const sz = sizeOf(s); x.strokeStyle = '#ff5b2e'; x.lineWidth = 1 / zoom; x.setLineDash([2 / zoom, 2 / zoom]); x.strokeRect(s.x - .5, s.y - .5, sz.w + 1, sz.h + 1); x.setLineDash([]); }
  V.info.textContent = `${w}×${hh} · ${+zoom.toFixed(2)}× · ${HUD.widgets.length} widgets${s ? ` · ${s.name} at ${s.x},${s.y}` : ''}`;
}
function bindCanvas(el) {
  let drag = null;
  const pos = e => { const r = V.cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)]; };
  V.cv.addEventListener('pointerdown', e => {
    const [x, y] = pos(e);
    const hit = [...HUD.widgets].reverse().find(w => { const s = sizeOf(w); return !w.hidden && x >= w.x && y >= w.y && x < w.x + s.w && y < w.y + s.h; });
    sel = hit?.id || null;
    if (hit) { drag = { id: hit.id, dx: x - hit.x, dy: y - hit.y }; V.cv.setPointerCapture(e.pointerId); }
    drawRight(); drawCanvas();
  });
  V.cv.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (drag) { const w = HUD.widgets.find(w => w.id === drag.id); w.x = x - drag.dx; w.y = y - drag.dy; drawCanvas(); V.cv.style.cursor = 'grabbing'; return; }
    const over = HUD.widgets.some(w => { const s = sizeOf(w); return x >= w.x && y >= w.y && x < w.x + s.w && y < w.y + s.h; });
    V.cv.style.cursor = over ? 'grab' : 'default';
  });
  V.cv.addEventListener('pointerup', () => { if (drag) { drag = null; save(); drawRight(); } });
  el.tabIndex = -1;
  el.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    const w = HUD.widgets.find(w => w.id === sel); if (!w) return;
    const d = e.shiftKey ? 8 : 1;
    if (e.key === 'ArrowLeft') w.x -= d; else if (e.key === 'ArrowRight') w.x += d; else if (e.key === 'ArrowUp') w.y -= d; else if (e.key === 'ArrowDown') w.y += d;
    else if (e.key === 'Delete' || e.key === 'Backspace') { HUD.widgets = HUD.widgets.filter(x => x !== w); sel = null; drawRight(); }
    else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) { const c = { ...JSON.parse(JSON.stringify(w)), id: uid(), name: w.name + '_2', x: w.x + 8, y: w.y + 8 }; HUD.widgets.push(c); sel = c.id; drawRight(); }
    else return;
    e.preventDefault(); save(); drawCanvas();
  });
}

/* ----------------------------------------------------------- left side ---- */
function drawLeft() {
  const nm = h('input', { type: 'text', value: HUD.name, onchange: () => { HUD.name = nm.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'hud'; nm.value = HUD.name; save(); } });
  const P = palette();
  const btn = t => { const w = defaults(t); const im = render(w, .7); const c = toCanvas(im); c.style.height = Math.min(22, im.height * 2) + 'px'; return h('button', { onclick: () => { w.x = 20 + Math.floor(Math.random() * 60); w.y = 40 + Math.floor(Math.random() * 60); HUD.widgets.push(w); sel = w.id; save(); drawRight(); drawCanvas(); } }, c, NAMES[t]); };
  const fontBox = h('div');
  const fst = { font: 'small', color: P.light, outline: '', shadow: P.dark };
  const drawFont = () => {
    const prev = h('canvas'); const m = measure('The Quick 0123', fst.font);
    prev.width = m.w + 4; prev.height = m.h + 4; drawText(prev.getContext('2d'), 'The Quick 0123', 2, 2, { font: fst.font, color: fst.color, outline: fst.outline || null, shadow: fst.shadow || null });
    prev.style.height = (prev.height * 2) + 'px';
    fontBox.replaceChildren(
      field('Font', select(Object.entries(FONTS).map(([k, f]) => [k, f.label]), fst.font, v => { fst.font = v; drawFont(); })),
      field('Colour', colorPick(fst.color, v => { fst.color = v; drawFont(); })),
      field('Edge', seg([['none', 'None'], ['outline', 'Outline'], ['shadow', 'Shadow']], fst.outline ? 'outline' : fst.shadow ? 'shadow' : 'none', v => { fst.outline = v === 'outline' ? P.dark : ''; fst.shadow = v === 'shadow' ? P.dark : ''; drawFont(); })),
      h('div', { style: { padding: '8px', background: 'var(--bg)', margin: '6px 0' } }, prev),
      h('button', { class: 'btn', onclick: () => exportFont(fst) }, 'Save font for engines'));
  };
  drawFont();
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'HUD'), field('Name', nm),
      h('p', { class: 'note' }, 'Colours start from the style bible palette, so the HUD matches the sprites and scenes.')),
    h('div', { class: 'sec' }, h('h3', {}, 'Add'), h('div', { class: 'widgets' }, ...Object.keys(NAMES).map(btn))),
    h('div', { class: 'sec' }, h('h3', {}, 'Bitmap font'), fontBox,
      h('p', { class: 'note' }, 'Writes fonts/<name>.png + .fnt (BMFont). Godot loads .fnt directly as a FontFile.')));
}
function colorPick(val, onChange) {
  const P = STYLE.palette || PALETTES.bone.colors;
  const inp = h('input', { type: 'color', value: val || '#000000', oninput: () => { onChange(inp.value); } });
  const sw = h('div', { class: 'sw' }, ...P.slice(0, 16).map(c => h('i', { title: hex(c), style: { background: hex(c), width: '12px', height: '16px' }, onclick: () => { inp.value = hex(c); onChange(hex(c)); } })));
  return h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, inp, sw);
}

/* ---------------------------------------------------------- right side ---- */
function drawRight() {
  const list = h('div', { class: 'wlist' }, ...HUD.widgets.map(w => h('div', { class: 'w' + (w.id === sel ? ' on' : ''), onclick: () => { sel = w.id; drawRight(); drawCanvas(); } },
    h('button', { class: 'eye' + (w.hidden ? '' : ' on'), style: { background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 }, onclick: e => { e.stopPropagation(); w.hidden = !w.hidden; save(); drawRight(); drawCanvas(); } }, icon(w.hidden ? 'eyeoff' : 'eye')),
    w.name, h('small', {}, NAMES[w.type]))));
  const w = HUD.widgets.find(w => w.id === sel);
  const insp = h('div');
  if (w) {
    const r = () => { save(); drawCanvas(); };
    const F = [];
    const num = (k, l, mn, mx, st = 1, hint) => F.push(field(l, range(w[k], mn, mx, st, v => { w[k] = v; r(); }, v => st < 1 ? (+v).toFixed(2) : v), hint));
    const col = (k, l) => F.push(field(l, colorPick(w[k], v => { w[k] = v; r(); })));
    const txt = (k, l) => F.push(field(l, h('input', { type: 'text', value: w[k], oninput: e => { w[k] = e.target.value; r(); } })));
    const opt = (k, l, o) => F.push(field(l, select(o, w[k], v => { w[k] = isNaN(+v) || v === '' ? v : +v; r(); drawRight(); })));
    const fonts = Object.entries(FONTS).map(([k, f]) => [k, f.label]);
    const frames = [['none', 'None'], ['line', 'Line'], ['bevel', 'Bevel'], ['plate', 'Plate'], ['double', 'Double'], ['rivets', 'Rivets'], ['notch', 'Notched'], ['gothic', 'Gothic']];
    txt('name', 'Name');
    if (w.type === 'bar') { num('w', 'Length', 8, 400); num('h', 'Thickness', 3, 32); opt('style', 'Fill', [['solid', 'Solid'], ['segments', 'Segments'], ['pips', 'Cells']]); if (w.style !== 'solid') num('segments', 'Segments', 2, 40); opt('frame', 'Frame', frames); col('fill', 'Fill'); col('back', 'Empty'); col('edge', 'Edge'); F.push(field('Damage trail', check('show', w.ghost, v => { w.ghost = v; r(); }))); if (w.ghost) col('ghostCol', 'Trail'); txt('label', 'Label'); }
    if (w.type === 'gauge') { num('r', 'Radius', 6, 64); num('thick', 'Thickness', 1, 16); num('start', 'From °', 0, 360); num('end', 'To °', 1, 720); num('ticks', 'Ticks', 0, 24); F.push(field('Needle', check('needle instead of fill', w.needle, v => { w.needle = v; r(); }))); col('fill', 'Fill'); col('back', 'Track'); col('edge', 'Ticks'); txt('label', 'Label'); }
    if (w.type === 'pips') { opt('shape', 'Shape', Object.keys(SHAPES).map(k => [k, k])); num('count', 'Count', 1, 20); num('scale', 'Scale', 1, 4); num('gap', 'Gap', 0, 8); F.push(field('Halves', check('allow half pips', w.halves, v => { w.halves = v; r(); }))); col('full', 'Full'); col('empty', 'Empty'); col('edge', 'Edge'); }
    if (w.type === 'counter') { num('num', 'Value', 0, 999999); num('digits', 'Digits', 1, 9); txt('prefix', 'Prefix'); opt('font', 'Font', fonts); num('scale', 'Scale', 1, 4); col('color', 'Colour'); col('outline', 'Outline'); col('shadow', 'Shadow'); }
    if (w.type === 'text') { txt('text', 'Text'); opt('font', 'Font', fonts); num('scale', 'Scale', 1, 4); opt('align', 'Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]); col('color', 'Colour'); col('outline', 'Outline'); col('shadow', 'Shadow'); }
    if (w.type === 'panel') { num('w', 'Width', 8, 480); num('h', 'Height', 8, 270); opt('style', 'Frame', frames); num('corner', 'Corner', 1, 12); col('fill', 'Fill'); col('edge', 'Light edge'); col('edge2', 'Dark edge'); }
    if (w.type === 'slot' || w.type === 'portrait') {
      num('size', 'Size', 10, 96); opt('style', 'Frame', frames); col('fill', 'Fill'); col('edge', 'Light edge'); col('edge2', 'Dark edge');
      if (w.type === 'slot') num('count', 'Count', 0, 99);
      F.push(field(w.type === 'slot' ? 'Item' : 'Face', h('button', { class: 'btn sm', onclick: () => pickSprite(p => { if (w.type === 'slot') w.item = p; else w.img = p; loadImg(p); r(); drawRight(); }) }, (w.item || w.img) ? (w.item || w.img).split('/').slice(-2).join('/') : 'Pick a sprite…')));
    }
    if (['bar', 'gauge', 'pips'].includes(w.type)) F.push(field('Value', range(w.value, 0, 1, .01, v => { w.value = v; w._ghost = Math.max(w._ghost || 0, v); r(); }, v => Math.round(v * 100) + '%')));
    insp.append(h('div', { class: 'sec' }, h('h3', {}, NAMES[w.type], h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost danger', onclick: () => { HUD.widgets = HUD.widgets.filter(x => x !== w); sel = null; save(); drawRight(); drawCanvas(); } }, 'Delete')), ...F));
  }
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Widgets'), HUD.widgets.length ? list : h('p', { class: 'note' }, 'Add one on the left.')),
    insp,
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `hud/${HUD.name}/`), ' gets the full mock-up, each widget as parts (frame, fill, state strips, icons, 9-slice panels) and hud.json with positions and margins.'),
      field('States', range(pref.get('hud.states', 11), 2, 33, 1, v => pref.set('hud.states', v)), 'Frames in each meter strip (0% to 100%)'),
      h('button', { class: 'btn go wide', onclick: exportHud }, 'Save ' + HUD.name)));
}
async function pickSprite(cb) {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const actors = r.items.filter(i => i.dir && i.ok);
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', {},
    h('header', {}, h('span', { class: 'grow' }, 'Pick a sprite'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, actors.length ? actors.map(a => h('div', { class: 'palrow', onclick: async () => {
      m.remove();
      const man = await (await fetch(rawURL(a.path + '/manifest.json'))).json();
      const first = Object.values(man.anims)[0];
      // first frame of the first animation, saved as its own PNG beside the strips
      const im = await imgData(rawURL(a.path + '/' + first.file));
      const f = newImg(man.w, man.h); blitIm(f, cropIm(im, 0, 0, man.w, man.h), 0, 0);
      await saveFiles(a.path.slice(FS.root.length + 1), [{ name: 'icon.png', b64: toDataURL(f) }]);
      cb(a.path + '/icon.png');
    } }, icon('folder'), h('span', {}, a.name))) : h('p', { class: 'note' }, 'Save an actor from Animate first.'))));
  document.body.append(m);
}
function cropIm(im, x0, y0, w, hh) { const o = newImg(w, hh); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const s = ((y + y0) * im.width + x + x0) * 4, d = (y * w + x) * 4; for (let k = 0; k < 4; k++) o.data[d + k] = im.data[s + k]; } return o; }

/* ------------------------------------------------------------- export ---- */
async function exportHud() {
  const dir = `hud/${HUD.name}`, files = [], states = pref.get('hud.states', 11);
  const json = { view: HUD.view, source: 'kiln', widgets: [] };
  // full mock-up, transparent
  const full = newImg(HUD.view.w, HUD.view.h);
  for (const w of HUD.widgets) if (!w.hidden) blitIm(full, render(w), w.x - 1, w.y - 1);
  files.push({ name: 'hud.png', b64: toDataURL(full) });
  for (const w of HUD.widgets) {
    const n = w.name, sz = sizeOf(w), entry = { name: n, type: w.type, x: w.x, y: w.y, w: sz.w, h: sz.h, parts: {} };
    const strip = (fn) => { const ims = Array.from({ length: states }, (_, i) => fn(i / (states - 1))); const s = newImg(ims[0].width * states, ims[0].height); ims.forEach((im, i) => blitIm(s, im, i * im.width, 0)); return { s, fw: ims[0].width }; };
    if (w.type === 'bar') {
      files.push({ name: `${n}_frame.png`, b64: toDataURL(render(w, 0, 'frame')) }, { name: `${n}_fill.png`, b64: toDataURL(render({ ...w, back: null, edge: null, frame: 'none' }, 1, 'fill')) });
      const { s, fw } = strip(v => render({ ...w, ghost: false }, v));
      files.push({ name: `${n}_states.png`, b64: toDataURL(s) });
      Object.assign(entry.parts, { frame: `${n}_frame.png`, fill: `${n}_fill.png`, states: `${n}_states.png`, frames: states, frameW: fw, fillRect: { x: 2, y: 2, w: w.w - 2, h: w.h - 2 } });
    } else if (w.type === 'gauge') {
      const { s, fw } = strip(v => render(w, v));
      files.push({ name: `${n}_states.png`, b64: toDataURL(s) });
      Object.assign(entry.parts, { states: `${n}_states.png`, frames: states, frameW: fw });
    } else if (w.type === 'pips') {
      const one = v => render({ ...w, count: 1 }, v);
      const icons = [one(1), one(.5), one(0)], s = newImg(icons[0].width * 3, icons[0].height);
      icons.forEach((im, i) => blitIm(s, im, i * im.width, 0));
      files.push({ name: `${n}_icons.png`, b64: toDataURL(s) });
      Object.assign(entry.parts, { icons: `${n}_icons.png`, order: ['full', 'half', 'empty'], iconW: icons[0].width, count: w.count, spacing: 9 * w.scale + w.gap });
    } else if (w.type === 'panel' || w.type === 'slot' || w.type === 'portrait') {
      // minimal 9-slice: corners + a 1px stretchable middle
      const c = Math.max(3, w.corner || 3), base = w.type === 'panel' ? w : { ...w, w: w.size, h: w.size, img: '', item: '', count: 0 };
      const small = render({ ...base, type: 'panel', w: c * 2 + 1, h: c * 2 + 1 + 0 });
      files.push({ name: `${n}_9slice.png`, b64: toDataURL(small) }, { name: `${n}.png`, b64: toDataURL(render(w)) });
      Object.assign(entry.parts, { nineSlice: `${n}_9slice.png`, margin: c + 1, full: `${n}.png` });
    } else {
      files.push({ name: `${n}.png`, b64: toDataURL(render(w)) });
      entry.parts.image = `${n}.png`;
      if (w.font) entry.parts.font = w.font;
    }
    json.widgets.push(entry);
  }
  files.push({ name: 'hud.json', text: JSON.stringify(json, null, 2) + '\n' });
  try { await saveFiles(dir, files); toast(`Saved ${files.length} files to ${dir}/`, 'ok'); } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
async function exportFont(f) {
  const name = `kiln_${f.font}${f.outline ? '_outline' : f.shadow ? '_shadow' : ''}`;
  const { canvas, fnt } = buildBMFont(f.font, { color: f.color, outline: f.outline || null, shadow: f.shadow || null, name });
  try { await saveFiles('fonts', [{ name: name + '.png', b64: canvas.toDataURL('image/png') }, { name: name + '.fnt', text: fnt }]); toast(`Saved fonts/${name}.fnt`, 'ok'); } catch (e) { toast(e.message, 'bad'); }
}
