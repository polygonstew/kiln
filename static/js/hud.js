// HUD: pixel-exact bars, gauges, pips, counters, text, panels, slots and portraits.
// Everything is drawn at 1× with no anti-aliasing, then exported as engine-ready parts.
import { $, h, api, toast, on, pref, clamp, uid, field, range, select, check, seg, hex, rgb, mix, luma,
  newImg, toCanvas, toDataURL, imgData, rawURL, PALETTES } from './core.js';
import { drawText, measure, buildBMFont, FONTS } from './text.js';
import { icon } from './icons.js';
import { loadOwners, claim } from './owners.js';
import { openProjects } from './projects.js';
import { writeRuntime } from './layout.js';
import { saveFiles, S as FS } from './files.js';
import { STYLE } from './style.js';
import { buildGodotHud, HUD_GD } from './hud_godot.js';
import { layerPanel } from './layers.js';

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
const TIPS = { bar: 'A health or stamina bar', gauge: 'A round meter', pips: 'Hearts, drops or other icons that empty one by one', counter: 'A number: score, coins, ammo', text: 'A label in a bitmap font', panel: 'A framed box behind other widgets', slot: 'Item slots', portrait: 'A face frame (status faces from an actor)', inventory: 'A grid of items with a cursor (I or your inventory key)', dialogue: 'The dialogue box: Logic and Dialogue show lines in it', prompt: 'A button prompt: [E] Open' };
const NAMES = { bar: 'Bar', gauge: 'Gauge', pips: 'Pips', counter: 'Counter', text: 'Text', panel: 'Panel', slot: 'Slot', portrait: 'Portrait', inventory: 'Inventory', dialogue: 'Dialogue', prompt: 'Prompt' };

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
    case 'inventory': return { ...base, x: 120, y: 50, cols: 6, rows: 3, size: 22, gap: 2, pad: 7, title: 'INVENTORY', style: 'gothic', slotStyle: 'plate', fill: P.dark, edge: P.lit, edge2: P.mid,
      cursor: P.accent, text: P.light, details: true, sel: 0, items: [{ id: 'flask', name: 'Ashen Flask', desc: 'Restores a little health.', icon: '', count: 3 }, { id: 'key', name: 'Bell Key', desc: 'Opens the belfry door.', icon: '', count: 1 }] };
    case 'dialogue': return { ...base, x: 40, y: 196, w: 400, h: 58, style: 'double', fill: P.dark, edge: P.light, edge2: P.mid, img: '', speaker: 'MONK', text: 'The bells have not rung since the flood. Something sleeps in the tower.', font: 'small', color: P.light, nameColor: P.accent };
    case 'prompt': return { ...base, x: 220, y: 150, key: 'E', text: 'Open', font: 'small', fill: P.dark, edge: P.light, color: P.light, keyColor: P.accent };
  }
}
let HUD = pref.get('hud.cur', null) || { id: uid(), name: 'hud', view: { w: 480, h: 270 }, bg: 'checker', widgets: [] };
let sel = null, V = {}, mounted = false, demo = false, demoT = 0, bgImg = null;
// undo / redo: snapshots of the whole HUD, one per burst of changes (taken when it saves), up to 60
let hist = [], hi = -1;
const snap = () => { const t = JSON.stringify(HUD); if (t === hist[hi]) return; hist = hist.slice(0, hi + 1); hist.push(t); if (hist.length > 60) hist.shift(); hi = hist.length - 1; };
function undoHud(d) {
  snap(); const j = hi + d; if (j < 0 || j >= hist.length) return;
  hi = j; HUD = JSON.parse(hist[hi]); sel = null; save(); drawRight(); drawCanvas();
}
// another HUD on screen (opened, new, or the open one removed): its pictures, the bar, a fresh undo history
function useHud(next) {
  HUD = next; sel = null; pref.set('hud.cur', HUD); hist = [JSON.stringify(HUD)]; hi = 0;
  for (const w of HUD.widgets) { loadImg(w.item); loadImg(w.img); loadFaces(w.faces); for (const it of w.items || []) loadImg(it.icon); }
  if (V.sizeSel) { V.sizeSel.value = `${HUD.view.w}x${HUD.view.h}`; V.bgSel.value = HUD.bg; }
  loadBg(); drawLeft(); drawRight(); drawCanvas();
}
const newHud = name => ({ id: uid(), name, view: { w: 480, h: 270 }, bg: 'checker', widgets: [] });
const hslug = s => (s || 'hud').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'hud';
const save = () => { pref.set('hud.cur', HUD); clearTimeout(save.t); save.t = setTimeout(async () => { snap(); await loadOwners('hud'); if (claim('hud', HUD, hslug)) { pref.set('hud.cur', HUD); drawLeft?.(); } api('/api/project', { id: 'hud-' + HUD.name, data: { meta: { kind: 'hud', name: HUD.name }, hud: HUD } }).catch(() => { }); }, 1200); };

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
    case 'inventory': { const g = invGeom(w); return { w: g.W + 2, h: g.H + 2 }; }
    case 'dialogue': return { w: w.w + 2, h: w.h + 2 };
    case 'prompt': { const m = measure(w.text || ' ', w.font), k = measure(w.key || ' ', w.font); return { w: k.w + 6 + 4 + m.w + 2, h: Math.max(k.h + 6, m.h) + 2 }; }
  }
};
// Inventory layout: frame padding, a title line, the slot grid, then a details box for the selected item.
function invGeom(w) {
  const tH = w.title ? FONTS.small.h + 4 : 0, gW = w.cols * w.size + (w.cols - 1) * w.gap, gH = w.rows * w.size + (w.rows - 1) * w.gap;
  const dH = w.details ? FONTS.small.h + FONTS.tiny.h * 2 + 10 : 0;
  return { tH, gW, gH, dH, W: gW + w.pad * 2, H: w.pad * 2 + tH + gH + (dH ? dH + w.pad : 0),
    slot: i => ({ x: w.pad + (i % w.cols) * (w.size + w.gap), y: w.pad + tH + Math.floor(i / w.cols) * (w.size + w.gap) }) };
}
// nearest-neighbour fit of an icon into a box (sprites can be bigger than the slot)
function fitIcon(it, box) {
  const k = Math.min(1, box / Math.max(it.width, it.height)); if (k >= 1) return it;
  const w = Math.max(1, Math.round(it.width * k)), hh = Math.max(1, Math.round(it.height * k)), o = newImg(w, hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const s = (Math.floor(y / k) * it.width + Math.floor(x / k)) * 4, d = (y * w + x) * 4; for (let c = 0; c < 4; c++) o.data[d + c] = it.data[s + c]; }
  return o;
}
function wrap(text, font, maxW) {
  const out = []; let line = '';
  for (const word of String(text).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (measure(t, font).w > maxW && line) { out.push(line); line = word; } else line = t; }
  if (line) out.push(line); return out;
}
// Render one widget into its own image (so it can be exported alone). value overrides w.value.
const imgCache = new Map(), facesMeta = new Map();
// health → face: the same rule hud.gd uses in Godot
export function faceFor(faces, v) {
  const want = v <= 0 ? 'dead' : v < .25 ? 'near' : v < .5 ? 'badly' : v < .75 ? 'hurt' : 'healthy';
  const order = ['dead', 'near', 'badly', 'hurt', 'healthy'];
  for (let i = order.indexOf(want); i < order.length; i++) if (faces.includes(order[i])) return order[i];
  return faces[0];
}
async function loadFaces(dir) {
  if (!dir || facesMeta.has(dir)) return;
  try { facesMeta.set(dir, await (await fetch(rawURL(dir + '/faces.json'))).json()); await loadImg(dir + '/faces.png'); drawCanvas(); } catch { }
}
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
    const fm = w.faces && facesMeta.get(w.faces), strip = w.faces && imgCache.get(w.faces + '/faces.png');
    if (fm && strip) {        // status faces: health picks the face, like the Doom marine
      const i = Math.max(0, fm.faces.indexOf(faceFor(fm.faces, value))), cell = cropIm(strip, i * fm.size, 0, fm.size, fm.size);
      const cw = w.size - 6, k = Math.max(1, Math.floor(cw / fm.size)), big = newImg(fm.size * k, fm.size * k);
      for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) { const sI = (Math.floor(y / k) * fm.size + Math.floor(x / k)) * 4; big.data.set(cell.data.subarray(sI, sI + 4), (y * big.width + x) * 4); }
      blitIm(im, big, o + 3 + Math.floor((cw - big.width) / 2), o + 3 + Math.floor((cw - big.height) / 2));
    } else {
      const it = w.img && imgCache.get(w.img);
      if (it) { const cw = w.size - 6; const crop = cropTop(it, cw); blitIm(im, crop, o + 3, o + 3); }
    }
  } else if (w.type === 'inventory') {
    const G = invGeom(w), ctx = imCtx(im);
    if (part !== 'slots') frameBox(g, o, o, G.W, G.H, w.style, w.fill, w.edge, w.edge2, 4);
    if (w.title && part === 'all') drawText(ctx, w.title, o + w.pad, o + w.pad - 1, { font: 'small', color: w.text, shadow: w.fill });
    for (let i = 0; i < w.cols * w.rows; i++) {
      const p = G.slot(i), it = w.items?.[i];
      if (part !== 'frame') frameBox(g, o + p.x, o + p.y, w.size, w.size, w.slotStyle, hex(mix(C(w.fill), [0, 0, 0], .25)), w.edge2, w.edge2, 2);
      if (part !== 'all') continue;
      const ic = it?.icon && imgCache.get(it.icon);
      if (ic) { const f = fitIcon(ic, w.size - 4); blitIm(im, f, o + p.x + Math.floor((w.size - f.width) / 2), o + p.y + Math.floor((w.size - f.height) / 2)); }
      else if (it) { const c = C(w.edge); g.rect(o + p.x + w.size / 2 - 2, o + p.y + w.size / 2 - 3, 4, 6, c); g.rect(o + p.x + w.size / 2 - 1, o + p.y + w.size / 2 - 5, 2, 2, c); }     // a placeholder bottle
      if (it && it.count > 1) drawText(ctx, String(it.count), o + p.x + w.size - 2, o + p.y + w.size - 7, { font: 'tiny', color: w.text, shadow: '#000000', align: 'right' });
    }
    if (part === 'all') {
      const sp = G.slot(clamp(w._sel ?? w.sel ?? 0, 0, w.cols * w.rows - 1)), cur = C(w.cursor);
      for (let k = -1; k <= w.size; k++) { g.put(o + sp.x + k, o + sp.y - 1, cur); g.put(o + sp.x + k, o + sp.y + w.size, cur); g.put(o + sp.x - 1, o + sp.y + k, cur); g.put(o + sp.x + w.size, o + sp.y + k, cur); }
      if (w.details) {
        const y0 = o + w.pad + G.tH + G.gH + w.pad, it = w.items?.[w._sel ?? w.sel ?? 0];
        frameBox(g, o + w.pad, y0, G.gW, G.dH, 'line', hex(mix(C(w.fill), [0, 0, 0], .3)), w.edge2, null, 2);
        if (it) {
          drawText(ctx, it.name || '', o + w.pad + 4, y0 + 3, { font: 'small', color: w.cursor, shadow: '#000000' });
          wrap(it.desc || '', 'tiny', G.gW - 8).slice(0, 2).forEach((ln, k) => drawText(ctx, ln, o + w.pad + 4, y0 + 5 + FONTS.small.h + k * (FONTS.tiny.h + 1), { font: 'tiny', color: w.text }));
        }
      }
    }
  } else if (w.type === 'dialogue') {
    const ctx = imCtx(im), ps = w.h - 10, face = w.img && imgCache.get(w.img);
    frameBox(g, o, o, w.w, w.h, w.style, w.fill, w.edge, w.edge2, 4);
    frameBox(g, o + 5, o + 5, ps, ps, 'line', hex(mix(C(w.fill), [0, 0, 0], .3)), w.edge2, null, 2);
    if (face) blitIm(im, cropTop(face, ps - 4), o + 7, o + 7);
    const tx = o + ps + 12, tw = w.w - ps - 20;
    drawText(ctx, w.speaker || '', tx, o + 5, { font: w.font, color: w.nameColor, shadow: '#000000' });
    const shown = w._reveal == null ? w.text : String(w.text).slice(0, w._reveal);
    wrap(shown, w.font, tw).slice(0, Math.max(1, Math.floor((w.h - 12 - FONTS[w.font].h) / (FONTS[w.font].h + 2)))).forEach((ln, k) => drawText(ctx, ln, tx, o + 8 + FONTS[w.font].h + k * (FONTS[w.font].h + 2), { font: w.font, color: w.color }));
    if (w._reveal == null || w._reveal >= String(w.text).length) { const ax = o + w.w - 9, ay = o + w.h - 7 + ((w._blink || 0) & 1); for (let k = 0; k < 3; k++) g.rect(ax + k, ay + k, 5 - k * 2, 1, C(w.nameColor)); }
  } else if (w.type === 'prompt') {
    const ctx = imCtx(im), k = measure(w.key || ' ', w.font), kw = k.w + 6, kh = k.h + 5;
    frameBox(g, o, o, kw, kh, 'bevel', w.fill, w.edge, null, 2);
    drawText(ctx, w.key || '', o + 3, o + 2, { font: w.font, color: w.keyColor });
    drawText(ctx, w.text || '', o + kw + 4, o + Math.floor((kh - FONTS[w.font].h) / 2), { font: w.font, color: w.color, shadow: '#000000' });
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
          V.sizeSel = Object.assign(select([['480x270', '480×270'], ['384x216', '384×216'], ['320x180', '320×180'], ['256x224', '256×224'], ['256x240', '256×240'], ['240x160', '240×160']], `${HUD.view.w}x${HUD.view.h}`, v => { const [w, hh] = v.split('x').map(Number); HUD.view = { w, h: hh }; save(); drawCanvas(); }), { title: 'Screen size the HUD is laid out for (the game resolution)' }),
          h('span', { class: 'lbl' }, 'Behind'), V.bgSel = Object.assign(select([['checker', 'Checker'], ['#000000', 'Black'], ['#5f6b5c', 'Field'], ['scene', 'Latest scene']], HUD.bg, v => { HUD.bg = v; save(); loadBg(); }), { title: 'What shows behind the HUD here (only for checking contrast)' }),
          V.demoBtn, h('button', { class: 'ibtn', title: 'Undo (Ctrl+Z)', onclick: () => undoHud(-1) }, '↶'), h('button', { class: 'ibtn', title: 'Redo (Ctrl+Y)', onclick: () => undoHud(1) }, '↷'),
          h('span', { class: 'grow' }), V.info),
        V.vp,
        h('div', { class: 'bar bot' }, h('span', { class: 'note', style: { margin: 0 } }, 'Drag widgets to place them. Arrows nudge 1px, Shift+arrows 8px, Delete removes, Ctrl+D duplicates, Ctrl+Z / Ctrl+Y undo and redo.'))),
      V.right);
    bindCanvas(el);
    new ResizeObserver(() => drawCanvas()).observe(V.vp);
    let last = performance.now();
    const tick = t => { const dt = (t - last) / 1000; last = t; if (demo && el.classList.contains('on')) { demoT += dt; drawCanvas(); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    if (!HUD.widgets.length) starter();
    for (const w of HUD.widgets) { loadImg(w.item); loadImg(w.img); loadFaces(w.faces); for (const it of w.items || []) loadImg(it.icon); }
    hist = [JSON.stringify(HUD)]; hi = 0;
    loadBg(); drawLeft(); drawRight(); drawCanvas();
  },
  show() { drawCanvas(); },
  // Save all / the demo game: open a saved HUD and save it for Godot
  async saveProject(id) { const d = await fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.json()); useHud(d.hud); await exportHud(); },
};
// Kiln's starting HUD (portrait, health, stamina, flasks, score, madness) into a HUD (the open one unless given)
// a new HUD with the starting widgets plus any extra kinds (the demo game adds a dialogue box)
export function starterHud(name, extra = []) { const x = newHud(name); starter(x); for (const t of extra) x.widgets.push(defaults(t)); return x; }
function starter(target = HUD) {
  const P = palette();
  const add = (t, o) => { const w = { ...defaults(t), ...o }; target.widgets.push(w); return w; };
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
    let live = wd.type === 'counter' && demo ? { ...wd, num: wd.num + Math.floor(demoT * 37) } : wd;
    if (demo && wd.type === 'dialogue') live = { ...wd, _reveal: Math.floor((demoT * 28) % (String(wd.text).length + 40)), _blink: Math.floor(demoT * 3) };
    if (demo && wd.type === 'portrait' && wd.faces) live = { ...wd, value: (Math.sin(demoT * .7) + 1) / 2 };
    if (demo && wd.type === 'inventory') live = { ...wd, _sel: Math.floor(demoT * 1.5) % Math.max(1, Math.min(wd.items?.length || 1, wd.cols * wd.rows)) };
    const im = render(live, v);
    x.drawImage(toCanvas(im), wd.x - 1, wd.y - 1 + (demo && wd.type === 'prompt' ? Math.round(Math.sin(demoT * 4)) : 0));
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
    if (hit && !hit.locked) { drag = { id: hit.id, dx: x - hit.x, dy: y - hit.y }; V.cv.setPointerCapture(e.pointerId); }
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
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (ctrl && (k === 'z' || k === 'y')) { e.preventDefault(); return undoHud(k === 'y' || e.shiftKey ? 1 : -1); }
    const w = HUD.widgets.find(w => w.id === sel); if (!w) return;
    if (w.locked && !(k === 'd' && ctrl)) return;
    const d = e.shiftKey ? 8 : 1;
    if (e.key === 'ArrowLeft') w.x -= d; else if (e.key === 'ArrowRight') w.x += d; else if (e.key === 'ArrowUp') w.y -= d; else if (e.key === 'ArrowDown') w.y += d;
    else if (e.key === 'Delete' || e.key === 'Backspace') return delWidget(w);
    else if (k === 'd' && ctrl) return dupWidget(w);
    else return;
    e.preventDefault(); save(); drawCanvas();
  });
}

function addWidget(t) {
  const w = defaults(t);
  if (!['inventory', 'dialogue', 'prompt'].includes(t)) { w.x = 20 + Math.floor(Math.random() * 60); w.y = 40 + Math.floor(Math.random() * 60); }
  HUD.widgets.push(w); sel = w.id; save(); drawRight(); drawCanvas();
}
const dupWidget = w => { const c = { ...JSON.parse(JSON.stringify(w)), id: uid(), name: w.name + '_2', x: w.x + 8, y: w.y + 8, locked: false }; HUD.widgets.push(c); sel = c.id; save(); drawRight(); drawCanvas(); };
const delWidget = w => { if (w.locked) return toast(`${w.name} is locked: unlock it first`, 'bad'); HUD.widgets = HUD.widgets.filter(x => x !== w); sel = null; save(); drawRight(); drawCanvas(); };

/* ----------------------------------------------------------- left side ---- */
function drawLeft() {
  const nm = h('input', { type: 'text', value: HUD.name, onchange: () => { HUD.name = nm.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'hud'; nm.value = HUD.name; save(); } });
  const P = palette();
  const btn = t => { const w = defaults(t); const im = render(w, .7); const c = toCanvas(im); c.style.height = Math.min(22, im.height * 2) + 'px'; return h('button', { title: 'Add: ' + TIPS[t], onclick: () => addWidget(t) }, c, NAMES[t]); };
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
    h('div', { class: 'sec' }, h('h3', {}, 'HUD', h('span', { class: 'grow' }),
      h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy or remove your HUDs', onclick: () => openProjects('hud', { current: HUD.name,
        open: async p => { const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.json()).catch(() => null); if (d?.hud) useHud(d.hud); },
        renamed: n => { HUD.name = n; pref.set('hud.cur', HUD); drawLeft(); }, removed: () => { HUD = newHud('hud'); starter(); useHud(HUD); } }) }, 'Open'),
      h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'Start a new HUD (this one is kept)', onclick: () => { const n = prompt('Name for the new HUD', 'hud_2'); if (n) { HUD = newHud(hslug(n)); starter(); useHud(HUD); save(); } } }, 'New')),
      field('Name', nm),
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
  const at = i => HUD.widgets[i], redraw = () => { save(); drawRight(); drawCanvas(); };
  const list = layerPanel({
    items: HUD.widgets, sel: HUD.widgets.findIndex(w => w.id === sel), front: 'bottom', empty: 'Add one on the left.',
    name: w => w.name, sub: w => NAMES[w.type] + (w.hidden ? ' · hidden' : ''),
    thumb: w => { try { return toCanvas(render(w, 1)); } catch { return null; } },
    visible: w => !w.hidden, locked: w => !!w.locked,
    on: {
      select: i => { sel = at(i).id; drawRight(); drawCanvas(); },
      visible: (i, v) => { at(i).hidden = !v; redraw(); },
      rename: (i, n) => { at(i).name = n.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || at(i).name; redraw(); },
      lock: (i, v) => { at(i).locked = v; redraw(); },
      move: (a, b) => { const [m] = HUD.widgets.splice(a, 1); HUD.widgets.splice(b, 0, m); sel = m.id; redraw(); },
      dup: i => dupWidget(at(i)), del: i => delWidget(at(i)),
      add: Object.keys(NAMES).map(t => [NAMES[t], () => addWidget(t)]),
    } });
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
      if (w.type === 'portrait') F.push(field('Status faces', h('span', { style: { display: 'flex', gap: '6px' } },
        h('button', { class: 'btn sm', title: 'Use an actor\'s status faces (made in Animate → Workshop): the face changes with health', onclick: () => pickFaces(dir => { w.faces = dir; loadFaces(dir); r(); drawRight(); }) }, w.faces ? w.faces.split('/').pop() : 'From an actor…'),
        w.faces ? h('button', { class: 'ibtn', title: 'Stop using status faces', onclick: () => { w.faces = ''; r(); drawRight(); } }, '✕') : null), 'Health picks the face: healthy → hurt → badly hurt → near death → dead'));
    }
    if (w.type === 'inventory') {
      num('cols', 'Columns', 1, 12); num('rows', 'Rows', 1, 8); num('size', 'Slot size', 12, 48); num('gap', 'Gap', 0, 8); num('pad', 'Padding', 2, 16); txt('title', 'Title');
      opt('style', 'Frame', frames); opt('slotStyle', 'Slots', frames); col('fill', 'Fill'); col('edge', 'Light edge'); col('edge2', 'Dark edge'); col('cursor', 'Cursor'); col('text', 'Text');
      F.push(field('Details', check('item name + description box', w.details, v => { w.details = v; r(); })));
      F.push(h('div', { class: 'sec', style: { padding: '8px 0 0', borderBottom: 0 } }, h('h3', {}, 'Items', h('span', { class: 'grow' }),
        // one list of items for the whole game (Rooms → Items keeps it): fill this inventory from it
        h('button', { class: 'btn sm ghost', title: 'Fill this inventory from the game\'s items (Rooms → Items): names, descriptions, pictures', onclick: async () => {
          const G = (await fetch('/api/project?id=items-adventure').then(x => x.ok ? x.json() : null).catch(() => null))?.items?.items || [];
          if (!G.length) return toast('The game has no items yet: Rooms → Items (or Help → Rule book lists them)');
          w.items = G.map(g => ({ id: g.id, name: g.name, desc: g.look || '', icon: g.icon ? FS.root + '/' + g.icon : '', count: 1 }));
          for (const it of w.items) if (it.icon) loadImg(it.icon);
          w.sel = 0; r(); drawRight(); toast(`${G.length} items from the game`, 'ok');
        } }, 'Game\'s items'),
        h('button', { class: 'btn sm', title: 'Add an item to the next free slot', onclick: () => { (w.items = w.items || []).push({ id: 'item' + (w.items.length + 1), name: 'New item', desc: '', icon: '', count: 1 }); w.sel = w.items.length - 1; r(); drawRight(); } }, '+ Item')),
        ...(w.items || []).map((it, i) => h('div', { class: 'invitem' + (i === w.sel ? ' on' : ''), onclick: () => { w.sel = i; r(); drawRight(); } },
          h('button', { class: 'btn sm ghost', title: 'Pick an icon (first frame of a saved actor or sprite)', onclick: e => { e.stopPropagation(); pickSprite(p => { it.icon = p; loadImg(p); r(); drawRight(); }); } }, it.icon ? '🖼' : 'Icon…'),
          h('input', { type: 'text', value: it.name, title: 'Item name', oninput: e => { it.name = e.target.value; it.id = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || it.id; r(); } }),
          h('input', { type: 'number', value: it.count, min: 0, max: 999, title: 'How many', style: { width: '46px' }, oninput: e => { it.count = +e.target.value; r(); } }),
          h('button', { class: 'ibtn', title: 'Remove this item', onclick: e => { e.stopPropagation(); w.items.splice(i, 1); r(); drawRight(); } }, '✕'),
          i === w.sel ? h('textarea', { rows: 2, value: it.desc, placeholder: 'Description shown in the details box', oninput: e => { it.desc = e.target.value; r(); } }) : null))));
    }
    if (w.type === 'dialogue') {
      num('w', 'Width', 80, 480); num('h', 'Height', 30, 140); txt('speaker', 'Speaker'); F.push(field('Line', h('textarea', { rows: 3, value: w.text, oninput: e => { w.text = e.target.value; r(); } })));
      opt('font', 'Font', fonts); opt('style', 'Frame', frames); col('fill', 'Fill'); col('edge', 'Light edge'); col('edge2', 'Dark edge'); col('color', 'Text'); col('nameColor', 'Name');
      F.push(field('Face', h('button', { class: 'btn sm', onclick: () => pickSprite(p => { w.img = p; loadImg(p); r(); drawRight(); }) }, w.img ? w.img.split('/').slice(-2).join('/') : 'Pick a sprite…')));
    }
    if (w.type === 'prompt') { txt('key', 'Key'); txt('text', 'Action'); opt('font', 'Font', fonts); col('fill', 'Key cap'); col('edge', 'Key edge'); col('keyColor', 'Key letter'); col('color', 'Text'); }
    if (['bar', 'gauge', 'pips'].includes(w.type) || (w.type === 'portrait' && w.faces)) F.push(field(w.type === 'portrait' ? 'Health' : 'Value', range(w.value, 0, 1, .01, v => { w.value = v; w._ghost = Math.max(w._ghost || 0, v); r(); }, v => Math.round(v * 100) + '%')));
    insp.append(h('div', { class: 'sec' }, h('h3', {}, NAMES[w.type], h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost danger', disabled: !!w.locked, onclick: () => delWidget(w) }, 'Delete')), ...F));
    if (w.locked) { insp.inert = true; insp.classList.add('lp-frozen'); }
  }
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Widgets', h('span', { class: 'grow' }), h('small', {}, 'back to front')), list),
    insp,
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `hud/${HUD.name}/`), ' gets the full mock-up, each widget as parts (frame, fill, state strips, icons, 9-slice panels) and hud.json with positions and margins.'),
      field('States', range(pref.get('hud.states', 11), 2, 33, 1, v => pref.set('hud.states', v)), 'Frames in each meter strip (0% to 100%)'),
      h('button', { 'data-file': 'save', class: 'btn go wide', onclick: exportHud }, 'Save ' + HUD.name)));
}
// actors that have status faces (faces.json saved by the Workshop)
async function pickFaces(cb) {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const dirs = [];
  for (const d of r.items.filter(i => i.dir)) { const x = await api('/api/fs?path=' + encodeURIComponent(d.path)).catch(() => ({ items: [] })); if (x.items.some(i => i.name === 'faces.json')) dirs.push(d); }
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', {},
    h('header', {}, h('span', { class: 'grow' }, 'Status faces from…'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, dirs.length ? dirs.map(d => h('div', { class: 'palrow', onclick: () => { m.remove(); cb(d.path); } }, icon('folder'), h('span', {}, d.name)))
      : h('p', { class: 'note' }, 'No actor has status faces yet: make them in Animate → Workshop, then save the actor.'))));
  document.body.append(m);
}
async function pickSprite(cb) {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const actors = r.items.filter(i => i.dir && i.ok);
  // icon sets made in Forge (icons/<set>/<item>.png): click one to use it as it is
  const iconBox = h('div', { class: 'hud-icons' });
  for (const set of ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/icons')).catch(() => ({ items: [] }))).items || []).filter(i => i.dir)) {
    const files = ((await api('/api/fs?path=' + encodeURIComponent(set.path)).catch(() => ({ items: [] }))).items || []).filter(i => /\.png$/.test(i.name) && i.name !== 'sheet.png');
    if (files.length) iconBox.append(h('div', { class: 'lbl', style: { margin: '6px 0 4px' } }, 'Icons: ' + set.name),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } }, ...files.map(f => h('img', { src: rawURL(f.path), title: f.name.replace('.png', ''), style: { width: '32px', height: '32px', imageRendering: 'pixelated', cursor: 'pointer', background: 'var(--p3)' }, onclick: () => { m.remove(); cb(f.path); } }))));
  }
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', {},
    h('header', {}, h('span', { class: 'grow' }, 'Pick a sprite'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, iconBox, actors.length ? actors.map(a => h('div', { class: 'palrow', onclick: async () => {
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
  await loadOwners('hud');
  if (claim('hud', HUD, hslug)) { pref.set('hud.cur', HUD); drawLeft(); }
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
  // Godot: a CanvasLayer scene of real Control nodes + hud.gd, and white bitmap fonts the labels tint
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + (FS.root + '/' + dir).slice(g.root.length + 1) : dir, base = res.replace(/(^|\/)hud\/[^/]+$/, '');
  const W2 = { ...HUD, widgets: HUD.widgets.map(w => ({ ...w, slotFill: w.fill ? hex(mix(rgb(w.fill), [0, 0, 0], .25)) : null, detFill: w.fill ? hex(mix(rgb(w.fill), [0, 0, 0], .3)) : null })) };
  const G = buildGodotHud(W2, GT, res, base);
  files.push(...G.files);
  const fontFiles = G.fonts.flatMap(k => { const { canvas, fnt } = buildBMFont(k, { color: '#ffffff', name: `kiln_${k}_white` }); return [{ name: `kiln_${k}_white.png`, b64: canvas.toDataURL('image/png') }, { name: `kiln_${k}_white.fnt`, text: fnt }]; });
  try {
    await saveFiles(dir, files);
    await writeRuntime({ hud: HUD_GD });
    if (fontFiles.length) await saveFiles('fonts', fontFiles);
    toast(`Saved ${files.length} files to ${dir}/ (Godot scene ${HUD.name}.tscn; its script is _kiln/ui/hud.gd)`, 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
// helpers the Godot builder needs
function nineIm(style, fill, edge, edge2, c) { const im = newImg(c * 2 + 3, c * 2 + 3); frameBox(px(im), 1, 1, c * 2 + 1, c * 2 + 1, style, fill, edge, edge2, c); return im; }
function stripIm(ims) { const s = newImg(ims[0].width * ims.length, ims[0].height); ims.forEach((im, i) => blitIm(s, im, i * im.width, 0)); return s; }
function diffIm(a, b) { const o = newImg(a.width, a.height); for (let i = 0; i < a.data.length; i += 4) { if (a.data[i + 3] < 128) continue; if (b.data[i + 3] >= 128 && a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2]) continue; o.data.set(a.data.subarray(i, i + 4), i); } return o; }
function cursorIm(size, color) { const im = newImg(size + 2, size + 2), c = rgb(color); for (let k = 0; k < size + 2; k++) for (const [x, y] of [[k, 0], [k, size + 1], [0, k], [size + 1, k]]) im.data.set([...c, 255], (y * (size + 2) + x) * 4); return im; }
const GT = { render, sizeOf, invGeom, toDataURL, FONTS, measure, nine: nineIm, strip: stripIm, diff: diffIm, cursor: cursorIm, facesMeta };
async function exportFont(f) {
  const name = `kiln_${f.font}${f.outline ? '_outline' : f.shadow ? '_shadow' : ''}`;
  const { canvas, fnt } = buildBMFont(f.font, { color: f.color, outline: f.outline || null, shadow: f.shadow || null, name });
  try { await saveFiles('fonts', [{ name: name + '.png', b64: canvas.toDataURL('image/png') }, { name: name + '.fnt', text: fnt }]); toast(`Saved fonts/${name}.fnt`, 'ok'); } catch (e) { toast(e.message, 'bad'); }
}
