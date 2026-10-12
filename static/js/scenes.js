// Scenes: parallax backgrounds built from layers (generated, drawn by AI, or imported),
// crushed into one of three looks, previewed scrolling, exported for engines.
import { $, h, api, toast, emit, on, pref, clamp, uid, field, range, select, check, seg, hex, rgb, mix, luma,
  newImg, cloneImg, toCanvas, toDataURL, imgData, keyBackground, buildPalette, applyPalette, PALETTES, HARDWARE, snapDepth, nearest, BAYER4, checker, rawURL, crop, blit, tracePolys } from './core.js';
import { GENS, PRESETS } from './procgen.js';
import { enqueue, budgetTag } from './queue.js';
import { icon } from './icons.js';
import { saveFiles, S as FS } from './files.js';
import { STYLE, stylePrompt, styleAvoid } from './style.js';
import { loadActor } from './player.js';
import { openProjects } from './projects.js';
import { registerWheel, registerKeys } from './wheel.js';
import { layerPanel } from './layers.js';
import { SHARP } from './gametype.js';
// a slider drag is one undo step: the first change records it, letting go ends it
window.addEventListener('pointerup', () => { V.editing = false; });

const VIEWS = [['480x270', '480×270 (16:9)'], ['384x216', '384×216 (16:9)'], ['256x224', '256×224 (SNES)'], ['256x240', '256×240 (NES)'], ['320x180', '320×180'], ['240x160', '240×160 (GBA)']];
export const LOOKS = {
  cart: { name: '8-bit Cartridge', note: 'NES master palette, 3 colours per layer plus one shared backdrop. No dithering: flat, hard shapes.' },
  paint: { name: '16-bit Painted', note: '15-bit colour, up to 15 per layer, ordered dithering in gradients, distance haze.' },
  ink: { name: 'Noir Ink', note: 'Black and white with one accent colour. Hard shadows, dithered mid-tones.' },
};
const ROLE_WORDS = l => l.scroll <= .05 ? 'distant sky, far background' : l.scroll < .35 ? 'far background layer' : l.scroll < .75 ? 'middle-ground layer' : 'foreground layer';

let SC = null, sel = 0, V = {}, mounted = false, pending = [];
// scene files can be ~70 MB and take seconds to load: every load takes a ticket, and New / Open take a new one,
// so a load that finishes after you started or opened something else is dropped instead of replacing it
let loads = 0;
let undoS = [], redoS = [];
const snap = () => ({ layers: SC.layers.map(L => ({ ...L, params: L.params ? { ...L.params } : L.params })), sel });
function pushUndo() { undoS.push(snap()); if (undoS.length > 60) undoS.shift(); redoS = []; }
function undo() { if (!undoS.length) return toast('Nothing to undo'); redoS.push(snap()); const s = undoS.pop(); SC.layers = s.layers; sel = Math.min(s.sel, SC.layers.length - 1); drawAll(); save(); }
function redo() { if (!redoS.length) return; undoS.push(snap()); const s = redoS.pop(); SC.layers = s.layers; sel = Math.min(s.sel, SC.layers.length - 1); drawAll(); save(); }
// one undo step per control gesture (a slider drag, a colour pick)
const edit = () => { if (!V.editing) { pushUndo(); V.editing = true; } };
window.addEventListener('change', () => { V.editing = false; });
let overlay = pref.get('scene.overlay', 'none'), hudImg = null;     // review overlays: safe frame and/or the latest HUD mock-up
async function loadHud() {
  hudImg = null;
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/hud')).catch(() => ({ items: [] }));
  const d = (r.items || []).find(i => i.dir);
  if (d) try { hudImg = toCanvas(await imgData(rawURL(d.path + '/hud.png'))); } catch { }
  drawPreview();
}
let solo = null;     // id of the only layer shown (Alt+click an eye), null = all
let zoomPick = pref.get('scene.zoom', 0);
let cam = 0, playing = true, speed = pref.get('scene.speed', 30), actor = null, actorX = 0;

// a tooltip on every control inside (for the bar's sliders and pickers)
const tip = (el, t) => { for (const c of [el, ...el.querySelectorAll('input, select')]) if (c.matches('input, select')) c.title = t; return el; };
function blankScene() {
  return { id: uid(), name: 'scene', view: { w: 480, h: 270 }, look: 'paint', haze: '#8a7f99', hazeAmt: .35, layers: [] };
}
on('open-scene', d => { pending.push(['open', d]); if (mounted) drain(); });
on('scene-layer', d => { pending.push(['layer', d]); if (mounted) drain(); });

export const scenes = {
  id: 'scenes', title: 'Scenes', key: '4',
  mount(el) {
    el.className = 'view ws';
    mounted = true;
    SC = blankScene();
    build(el);
    const t = ++loads;
    restore(t).then(() => { if (t === loads && !SC.layers.length) usePreset('pallid', true); drain(); });
  },
  // Save all / the demo game: open a saved scene, draw every layer, save it for Godot
  async saveProject(id) {
    const d = await (await fetch('/api/project?id=' + encodeURIComponent(id))).json();
    ++loads; SC = d.scene; sel = 0; undoS = []; redoS = [];
    for (const [i, L] of SC.layers.entries()) await renderLayer(L, i);
    drawAll(); await exportScene();
  },
  show() { drawAll(); },
};
async function drain() {
  while (pending.length) {
    const [k, d] = pending.shift();
    if (k === 'open') d?.id ? await openSceneProject(d.id) : await openSceneDir(d);
    if (k === 'layer') await addImageLayer(/^(data:|\/api\/|https?:)/.test(d) ? d : rawURL(d), layerName(d));
  }
}

/* ------------------------------------------------------------- process ---- */
// source -> layer pixels (size, seam, sky key, haze) -> look (palette + dither)
// Weather: animated particle layers. Drawn live each frame in the preview (seeded, so they look the same
// every time) and exported to Godot as GPUParticles2D. speed < 0 rises (embers).
export const WEATHER = {
  rain: { name: 'Rain', note: 'Slanted streaks', p: { color: '#9fb2d9', amount: .5, speed: 260, wind: -50, size: 4 } },
  snow: { name: 'Snow', note: 'Slow drifting flakes', p: { color: '#eef2f8', amount: .4, speed: 28, wind: 12, size: 1 } },
  embers: { name: 'Embers', note: 'Sparks rising and flickering', p: { color: '#ff8a3c', amount: .25, speed: -35, wind: 8, size: 1 } },
  mist: { name: 'Mist', note: 'Soft drifting fog wisps', p: { color: '#a9a2b8', amount: .3, speed: 0, wind: 10, size: 18 } },
};
const hsh = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
let wT = 0;
function drawWeather(x, L, w, hh) {
  const P = L.params, n = Math.round(P.amount * (P.size > 8 ? 40 : 600)), c = P.color, al = L.opacity ?? 1;
  x.fillStyle = c;
  for (let i = 0; i < n; i++) {
    const a = hsh(i, 1), b = hsh(i, 2), v = .7 + .6 * hsh(i, 3);
    const H = hh + 20, W = w + 20;
    const y = (((b * H + wT * P.speed * v) % H) + H) % H - 10;
    const X = (((a * W + wT * P.wind * v - cam * L.scroll) % W) + W) % W - 10;
    if (P.size > 8) {          // mist: wide translucent wisps
      x.globalAlpha = al * .07 * (.5 + hsh(i, 4)); x.fillRect(Math.round(X - P.size * 2), Math.round(y), P.size * 4, Math.max(2, P.size / 3)); x.fillRect(Math.round(X - P.size), Math.round(y - 2), P.size * 2, 2);
    } else if (Math.abs(P.speed) > 120) {   // rain: a streak along its fall direction
      x.globalAlpha = al * .7; const dx = P.wind / P.speed;
      for (let k = 0; k < P.size; k++) x.fillRect(Math.round(X + dx * k), Math.round(y + k), 1, 1);
    } else {                    // snow and embers: dots; embers flicker
      x.globalAlpha = al * (P.speed < 0 ? .5 + .5 * Math.sin(wT * 9 + i) : .9);
      x.fillRect(Math.round(X), Math.round(y), P.size + (hsh(i, 5) < .2 ? 1 : 0), P.size);
    }
  }
  x.globalAlpha = 1;
}
// Cut a layer into T×T tiles, keep each distinct one once (empty ones skipped), pack them 16 per row, send to Levels.
function cutTiles(L, T) {
  const im = L.out, seen = new Map(), tiles = [];
  for (let ty = 0; ty + T <= im.height; ty += T) for (let tx = 0; tx + T <= im.width; tx += T) {
    let key = '', any = false;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const i = ((ty + y) * im.width + tx + x) * 4; if (im.data[i + 3] >= 128) { any = true; key += im.data[i] + ',' + im.data[i + 1] + ',' + im.data[i + 2] + ';'; } else key += '.;'; }
    if (!any || seen.has(key)) continue;
    seen.set(key, 1); tiles.push([tx, ty]);
    if (tiles.length >= 256) break;
  }
  if (!tiles.length) return toast('This layer has no solid pixels to cut', 'bad');
  const cols = Math.min(16, tiles.length), rows = Math.ceil(tiles.length / cols), cv = document.createElement('canvas');
  cv.width = cols * T; cv.height = rows * T;
  const x = cv.getContext('2d'), src = toCanvas(im);
  tiles.forEach(([tx, ty], i) => x.drawImage(src, tx, ty, T, T, (i % cols) * T, Math.floor(i / cols) * T, T, T));
  emit('level-tileset', { url: cv.toDataURL('image/png'), tile: T, name: L.name });
}
function addWeather(k) {
  pushUndo();
  const W = WEATHER[k], L = newLayer({ name: k, kind: 'weather', weather: k, params: { ...W.p }, scroll: 1, w: SC.view.w, h: SC.view.h, repeat: false });
  SC.layers.push(L); sel = SC.layers.length - 1; drawAll(); save();
}
async function source(L) {
  if (L.kind === 'gen') return GENS[L.gen].make(L.w, L.h, L.params);
  if (!L._src && L.srcURL) L._src = await imgData(L.srcURL);
  if (!L._src) return newImg(L.w, L.h);
  // area-average down to layer size (keeps detail as colour, the look step makes it pixels)
  const seam = L.repeat ? Math.round(L.w * .08) : 0;
  const c = document.createElement('canvas'); c.width = L.w + seam; c.height = L.h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(toCanvas(L._src), 0, 0, c.width, c.height);
  let im = x.getImageData(0, 0, c.width, c.height);
  if (seam) {
    // cross-fade the extra strip into the start so the right edge flows into the left
    const o = newImg(L.w, L.h);
    for (let y = 0; y < L.h; y++) for (let xx = 0; xx < L.w; xx++) {
      const a = (y * im.width + xx) * 4, d = (y * L.w + xx) * 4;
      if (xx < seam) {
        const b = (y * im.width + L.w + xx) * 4, t = xx / seam;
        for (let k = 0; k < 4; k++) o.data[d + k] = im.data[b + k] * (1 - t) + im.data[a + k] * t;
      } else for (let k = 0; k < 4; k++) o.data[d + k] = im.data[a + k];
    }
    im = o;
  }
  if (L.key) im = keyBackground(im, L.tol || 30);
  return im;
}
function haze(im, L) {
  // the layer's own haze amount wins; otherwise far layers (low scroll) fade toward the scene haze
  const auto = SC.look === 'cart' || L.scroll >= 1 || L.kind === 'gen' && L.gen === 'sky' ? 0 : SC.hazeAmt * (1 - L.scroll);
  const t = L.hazeOver != null ? L.hazeOver : auto, tt = L.tint && L.tintAmt ? L.tintAmt : 0;
  if (!t && !tt) return im;
  const hc = rgb(SC.haze), tc = tt ? rgb(L.tint) : null, o = cloneImg(im);
  for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3] >= 128) {
    let c = [o.data[i], o.data[i + 1], o.data[i + 2]];
    if (tt) c = mix(c, tc, tt);
    if (t) c = mix(c, hc, t);
    o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2];
  }
  return o;
}
const BLEND = { normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply' };
function look(im, L, idx) {
  const master = STYLE.palette;
  if (SC.look === 'ink') {
    const accent = master ? master.reduce((b, c) => sat(c) > sat(b) ? c : b, master[0]) : [209, 0, 31];
    const paper = master ? master.reduce((b, c) => luma(c) > luma(b) ? c : b, master[0]) : [242, 242, 242];
    const inkC = master ? master.reduce((b, c) => luma(c) < luma(b) ? c : b, master[0]) : [0, 0, 0];
    const o = newImg(im.width, im.height);
    // figure against ground: stretch this layer's own contrast, then push far layers toward paper
    let lo = 255, hi = 0;
    for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) { const l = luma([im.data[i], im.data[i + 1], im.data[i + 2]]); if (l < lo) lo = l; if (l > hi) hi = l; }
    const depth = clamp(1 - L.scroll, 0, 1), flat = hi - lo < 24;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      const i = (y * im.width + x) * 4; if (im.data[i + 3] < 128) continue;
      const c = [im.data[i], im.data[i + 1], im.data[i + 2]];
      let out;
      if (sat(c) > .55 && luma(c) > 50 && c[0] > c[2] * 1.3 && c[0] > c[1] * 1.5) out = accent;
      else {
        // silhouettes stay solid ink (far ones get sparse dots); gradients get a steep curve so dither only lives in the middle
        const stretched = flat ? 0 : clamp(((luma(c) - lo) / (hi - lo) - .5) * 2.4 + .5, 0, 1);
        const v = L.scroll <= .05 ? Math.max(clamp(y / im.height * 1.6 - .35, 0, 1), stretched > .9 ? 1 : 0)   // the sky: ink above, paper at the horizon
          : flat ? (depth > .6 ? .3 : depth > .3 ? .14 : 0) : stretched;
        out = v + BAYER4[(y & 3) * 4 + (x & 3)] > .5 ? paper : inkC;
      }
      o.data[i] = out[0]; o.data[i + 1] = out[1]; o.data[i + 2] = out[2]; o.data[i + 3] = 255;
    }
    return o;
  }
  if (SC.look === 'cart') {
    const count = L.scroll <= .05 ? 4 : 3;
    const M = master || PALETTES.nes.colors;
    const pick = buildPalette(im, { hw: 'free', count });
    // snap each chosen colour to the master palette by Lab distance (closer to the eye than RGB)
    const pal = [...new Map(pick.map(c => { const m = nearestLab(c, M); return [hex(m), m]; })).values()];
    return applyPalette(im, pal, { dither: 'none' });
  }
  const pal = buildPalette(im, { hw: 'snes', count: L.colors || 15, master });
  return applyPalette(im, pal, { dither: L.kind === 'gen' && L.gen !== 'sky' ? 'none' : 'bayer4', amount: .4 });
}
function lab([r, g, b]) {
  const f = v => { v /= 255; return v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * .4124 + G * .3576 + B * .1805) / .95047, Y = R * .2126 + G * .7152 + B * .0722, Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
  const q = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * q(Y) - 16, 500 * (q(X) - q(Y)), 200 * (q(Y) - q(Z))];
}
function nearestLab(c, pal) {
  const a = lab(c); let best = pal[0], bd = Infinity;
  for (const p of pal) { const b = lab(p), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
const sat = c => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
let procT;
// quiet = just opened: draw it, but don't write it back to disk until something actually changes
// a saved scene project by id: drawn, ready to edit (nothing is saved until you change something)
async function openSceneProject(id) {
  const d = await fetch('/api/project?id=' + encodeURIComponent(id)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!d?.scene) return toast('Could not open that scene', 'bad');
  ++loads; SC = d.scene; sel = 0; undoS = []; redoS = [];
  for (const [i, L] of SC.layers.entries()) await renderLayer(L, i);
  drawAll();
}
// one layer's pixels: its source (generator, image…) → haze → the scene's look
async function renderLayer(L, i) {
  if (L.kind === 'weather') { L.out = null; return; }
  L.out = look(haze(await source(L), L), L, i);
  L.tiles = tileCount(L.out);
}
function process(only, quiet) {
  clearTimeout(procT);
  procT = setTimeout(async () => {
    for (const [i, L] of SC.layers.entries()) if (only == null || only === L) await renderLayer(L, i);
    drawLayers(); drawPreview(); if (!quiet) save();
  }, 40);
}
function tileCount(im) {
  const set = new Set();
  for (let ty = 0; ty < im.height; ty += 8) for (let tx = 0; tx < im.width; tx += 8) {
    let k = '';
    for (let y = ty; y < Math.min(ty + 8, im.height); y++) for (let x = tx; x < Math.min(tx + 8, im.width); x++) { const i = (y * im.width + x) * 4; k += im.data[i + 3] < 128 ? '.' : (im.data[i] >> 4).toString(16) + (im.data[i + 1] >> 4).toString(16) + (im.data[i + 2] >> 4).toString(16); }
    set.add(k);
  }
  return set.size;
}

/* -------------------------------------------------------------- layers ---- */
function newLayer(over) {
  return { id: uid(), name: 'layer', kind: 'gen', gen: 'sky', params: {}, w: SC.view.w * 2, h: SC.view.h, y: 0, scroll: .5, repeat: true, visible: true, key: false, tol: 30, ...over };
}
function addGen(g, params = {}, at) {
  const G = GENS[g];
  const p = Object.fromEntries(G.params.map(q => [q[0], q[2]]));
  Object.assign(p, params);
  if (p.seed !== undefined && params.seed === undefined) p.seed = 1 + Math.floor(Math.random() * 9998);
  const L = newLayer({ name: G.name.toLowerCase().replace(/\s+/g, '_'), gen: g, params: p, scroll: G.scroll, w: g === 'sky' ? SC.view.w : SC.view.w * 2 });
  SC.layers.splice(at ?? SC.layers.length, 0, L);
  sel = SC.layers.indexOf(L);
  return L;
}
function usePreset(k, silent) {
  if (!silent && SC.layers.length && !confirm(`Replace the current layers with "${PRESETS[k].name}"?`)) return;
  SC.layers = [];
  for (const [g, p] of PRESETS[k].layers) addGen(g, p);
  if (SC.name === 'scene') SC.name = freeName(k, SC.id);     // only an unnamed scene takes the preset's name, and never a taken one
  sel = 0; drawAll(); process(null, silent);      // the starting preset (silent) is saved only once you change something
}
// a readable layer name from a path, a /api/fs/raw?path=… URL or a data URL
function layerName(d) {
  if (d.startsWith('data:')) return 'image';
  const p = d.includes('path=') ? decodeURIComponent(d.split('path=')[1].split('&')[0]) : d.split('?')[0];
  return p.split('/').pop().replace(/\.\w+$/, '').replace(/^\d{8,}-\d+-/, '') || 'image';
}
async function addImageLayer(url, name) {
  try {
    const im = await imgData(url);
    const L = newLayer({ name: name || 'image', kind: 'image', srcURL: toDataURL(shrink(im, 1600)), scroll: .5, key: false });
    L._src = await imgData(L.srcURL);
    SC.layers.push(L); sel = SC.layers.length - 1; drawAll(); process();
  } catch { toast('Could not load that image', 'bad'); }
}
function shrink(im, max) {
  const k = Math.min(1, max / Math.max(im.width, im.height));
  if (k >= 1) return im;
  const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(toCanvas(im), 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}
function composite(upTo) {
  const c = document.createElement('canvas'); c.width = SC.view.w * 2; c.height = SC.view.h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  for (const L of SC.layers.slice(0, upTo)) if (L.out && L.visible) for (let ox = 0; ox < c.width; ox += L.w) x.drawImage(toCanvas(L.out), ox, SC.view.h - L.h + L.y);
  return c.toDataURL('image/png');
}
function genAI(L) {
  const idx = SC.layers.indexOf(L);
  const what = (L.prompt || '').trim();
  if (!what) return toast('Describe what this layer shows');
  const cutout = L.scroll > .05;
  const words = `${what}, ${ROLE_WORDS(L)}, ${stylePrompt()}${cutout ? ', isolated silhouette shapes against a plain flat white sky, nothing in the sky' : ''}`;
  let req;
  if ((L.engine || 'cloud') === 'cloud') {
    const ref = L.matchRef !== false && idx > 0 && SC.layers.slice(0, idx).some(l => l.out) ? composite(idx) : null;
    req = { engine: 'cloud', engine_hint: 'scene', w: 1536, h: Math.round(1536 * L.h / L.w), batch: 1,
      prompt: ref ? `Use the reference image only as a guide to art style, palette and lighting. Draw a NEW, separate parallax layer for a 2D game: ${words}. Do not copy the reference's shapes.` : `Parallax layer for a 2D side-scrolling game: ${words}` };
    if (ref) req.init = ref;
  } else {
    req = { engine: 'scene', prompt: words, neg: styleAvoid(), w: 768, h: 384, steps: 5, fast: true, batch: 1 };
  }
  L.busy = true; drawLayers();
  enqueue(req, `${SC.name}: ${L.name}`).done.then(async urls => {
    L._src = await imgData(urls[0]); L.srcURL = toDataURL(shrink(L._src, 1600)); L._src = await imgData(L.srcURL);
    L.kind = 'ai'; L.key = cutout; L.busy = false;
    process(L); toast(`Layer "${L.name}" is in`);
  }).catch(e => { L.busy = false; drawLayers(); });
}

/* -------------------------------------------------------- persistence ---- */
function serial() {
  return { meta: { kind: 'scene', name: SC.name }, scene: { ...SC, layers: SC.layers.map(({ out, _src, busy, tiles, ...L }) => L) } };
}
// Names already used by other scenes: name -> that scene's id. A scene never saves over another one:
// if its name is taken by a different scene it gets a free name instead (pallid -> pallid_2).
let owners = new Map();
async function loadOwners() {
  const ps = await api('/api/projects').catch(() => null);
  if (ps) owners = new Map(ps.filter(p => p.kind === 'scene').map(p => [p.name, p.sid]));
}
function freeName(base, id) {
  base = slug(base); let n = base, i = 2;
  while (owners.has(n) && owners.get(n) !== id) n = `${base}_${i++}`;
  return n;
}
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!SC.id) SC.id = uid();
    const free = freeName(SC.name, SC.id);
    if (free !== SC.name) { toast(`"${SC.name}" is another scene's name, so this one is saved as "${free}"`); SC.name = free; drawLeft(); }
    owners.set(SC.name, SC.id);
    try { localStorage.setItem('kiln.scene.cur', JSON.stringify(serial())); } catch { }
    api('/api/project', { id: 'scene-' + slug(SC.name), data: serial() }).catch(() => { });
  }, 1200);
}
async function restore(t) {
  try { const d = JSON.parse(localStorage.getItem('kiln.scene.cur') || 'null'); if (d) { SC = d.scene; sel = 0; drawAll(); process(null, true); return; } } catch { }
  // a browser that has never opened Scenes: open the most recent saved scene rather than starting a new one
  // (a new one used to take a preset's name and could land on top of an existing scene)
  const latest = (await api('/api/projects').catch(() => [])).find(p => p.kind === 'scene');
  if (latest) {
    try { const d = await (await fetch('/api/project?id=' + encodeURIComponent(latest.id))).json(); if (t !== loads) return; SC = d.scene; sel = 0; drawAll(); process(null, true); } catch { }
  }
}
const slug = s => (s || 'scene').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'scene';
async function openSceneDir(dir) {
  const name = dir.split('/').pop(), t = ++loads;
  const proj = await fetch('/api/project?id=scene-' + slug(name)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (t !== loads) return;
  if (proj) { SC = proj.scene; sel = 0; drawAll(); process(null, true); toast('Opened ' + name); return; }
  try {
    const sj = await (await fetch(rawURL(dir + '/scene.json'))).json();
    SC = blankScene(); SC.name = slug(name); SC.view = sj.view || SC.view; SC.look = sj.look || SC.look;
    for (const l of sj.layers || []) {
      const im = await imgData(rawURL(dir + '/' + l.file));
      const L = newLayer({ name: l.name || l.file.replace('.png', ''), kind: 'image', srcURL: toDataURL(im), scroll: l.scroll ?? .5, y: (l.y || 0) - (SC.view.h - im.height), repeat: l.repeat !== false, w: im.width, h: im.height });
      SC.layers.push(L);
    }
    sel = 0; drawAll(); process(); toast('Opened ' + name);
  } catch (e) { toast('Could not open that scene', 'bad'); }
}

/* -------------------------------------------------------------- layout ---- */
function build(el) {
  V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
  V.cv = h('canvas', { style: { cursor: 'grab' } });
  V.vp = h('div', { class: 'viewport', style: { background: '#0e0e0d' } }, V.cv);
  V.info = h('span', { class: 'mono dim', style: { fontSize: '11px' } });
  V.play = h('button', { class: 'ibtn', title: 'Pan the camera (space)', onclick: () => { playing = !playing; V.play.replaceChildren(icon(playing ? 'pause' : 'play')); } }, icon('pause'));
  V.actorSel = h('select', { title: 'Walk an actor across the scene to judge scale and contrast', onchange: () => pickActor(V.actorSel.value) }, h('option', { value: '' }, 'No actor'));
  el.append(V.left,
    h('section', { class: 'stage' },
      h('div', { class: 'bar' }, V.play, h('span', { class: 'lbl' }, 'Pan'), tip(range(speed, 0, 160, 1, v => { speed = v; pref.set('scene.speed', v); }, v => v + 'px/s'), 'How fast the preview camera pans, to judge the depth of the layers'),
        h('i', { class: 'sep' }), h('span', { class: 'lbl' }, 'Actor'), V.actorSel,
        h('i', { class: 'sep' }), h('span', { class: 'lbl' }, 'Zoom'),
        tip(select([[0, 'Auto'], [-2, 'Sharp'], [-1, 'Fill'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], zoomPick, v => { zoomPick = +v; pref.set('scene.zoom', zoomPick); drawPreview(); }), 'Preview size: Sharp keeps whole pixels, Fill uses all the space'),
        h('i', { class: 'sep' }), h('span', { class: 'lbl', title: 'Check the scene the way the game will show it' }, 'Show'),
        Object.assign(select([['none', 'Scene only'], ['safe', 'Safe frame'], ['hud', 'HUD'], ['both', 'HUD + safe']], overlay, v => { overlay = v; pref.set('scene.overlay', v); if (v !== 'none' && v !== 'safe' && !hudImg) loadHud(); drawPreview(); }), { title: 'Draw guides over the preview: the safe frame (where nothing important should be cut off) and/or your HUD' }),
        h('span', { class: 'lbl', title: 'Time of day: left is night, right is bright day. Night is also exported to Godot (CanvasModulate)' }, 'Time'),
        V.tod = tip(range(SC?.tod || 0, -1, 1, .05, v => { SC.tod = v; drawPreview(); save(); }, v => todLabel(v)), 'Time of day: left is night, right is bright day'),
        h('button', { class: 'ibtn', title: 'Snapshot: download this frame as a PNG (3× size)', onclick: () => snapshot() }, icon('export')),
        h('button', { class: 'btn sm', title: 'Record a 4-second camera pan (3× size, WebM video) to share', onclick: () => recordPan(4) }, 'Record pan'),
        h('span', { class: 'grow' }), V.info),
      V.vp,
      h('div', { class: 'bar bot' }, h('span', { class: 'lbl' }, 'Look'), V.looks = h('span', { style: { display: 'flex', gap: '6px' } }), h('span', { class: 'grow' }),
        h('span', { class: 'note', style: { margin: 0 } }, 'Drag the scene or use ← → to move the camera'))),
    V.right);
  let dragX = null;
  V.cv.addEventListener('pointerdown', e => { dragX = e.clientX; V.cv.setPointerCapture(e.pointerId); V.cv.style.cursor = 'grabbing'; });
  V.cv.addEventListener('pointermove', e => { if (dragX == null) return; cam -= (e.clientX - dragX) / zoomNow; dragX = e.clientX; drawPreview(); });
  V.cv.addEventListener('pointerup', () => { dragX = null; V.cv.style.cursor = 'grab'; });
  el.tabIndex = -1;
  el.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); dupLayer(); return; }
    if (e.key === 'Delete') { delLayer(); return; }
    if (k === '[' || k === ']') { sel = clamp(sel + (k === ']' ? 1 : -1), 0, SC.layers.length - 1); drawLayers(); drawRight(); return; }
    if (k === 'h' && SC.layers[sel]) { pushUndo(); SC.layers[sel].visible = !SC.layers[sel].visible; drawLayers(); drawPreview(); save(); return; }
    if (e.key === 'ArrowLeft') cam -= 8; else if (e.key === 'ArrowRight') cam += 8; else if (e.key === ' ') { V.play.click(); e.preventDefault(); } else return;
    drawPreview();
  });
  new ResizeObserver(() => drawPreview()).observe(V.vp);
  let last = performance.now();
  const tick = t => { const dt = Math.min(.1, (t - last) / 1000); last = t; if (el.classList.contains('on')) { wT += dt; if (playing) { cam += speed * dt; actorX += dt; drawPreview(); } else if (SC?.layers.some(l => l.kind === 'weather' && l.visible !== false)) drawPreview(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  refreshActors();
  loadOwners();
}
const todLabel = v => v < -.02 ? 'night ' + Math.round(-v * 100) + '%' : v > .02 ? 'day ' + Math.round(v * 100) + '%' : 'as made';
function drawAll() { if (!V.left) return;
  // show this scene's time of day on the slider (setting it directly: opening a scene must not save it)
  const t = V.tod?.querySelector('input'), o = V.tod?.querySelector('output'); if (t) { t.value = SC.tod || 0; if (o) o.textContent = todLabel(SC.tod || 0); } drawLeft(); drawLayers(); drawRight(); drawLooks(); drawPreview(); }
function addDescribed() { const L = newLayer({ name: 'painted', kind: 'ai', prompt: '', scroll: .3, engine: 'cloud' }); SC.layers.push(L); sel = SC.layers.length - 1; drawAll(); setTimeout(() => $('#layerPrompt')?.focus(), 50); }
function pickImageLayer() { const i = h('input', { type: 'file', accept: 'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => addImageLayer(r.result, f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f); }; i.click(); }
function drawLooks() {
  V.looks.replaceChildren(...Object.entries(LOOKS).map(([k, l]) => h('button', { class: 'btn sm' + (SC.look === k ? ' go' : ''), title: l.note, onclick: () => { SC.look = k; drawLooks(); drawLeft(); process(); } }, l.name)));
}

/* ------------------------------------------------------------- preview ---- */
let zoomNow = 2;
function drawPreview() {
  if (!V.cv || !SC) return;
  const { w, h: hh } = SC.view;
  const W = V.vp.clientWidth - 24, H = V.vp.clientHeight - 24;
  // sharp = whole-number zoom so every game pixel is the same size on screen; fill = as big as fits
  // Sharp = whole-number zoom (every game pixel the same size); Fill = as big as fits; Auto = sharp once 2× fits
  const zf = Math.min(W / w, H / hh), fill = Math.max(.25, zf);
  zoomNow = zoomPick > 0 ? zoomPick : zoomPick === -1 || zf < 1 ? fill : zoomPick === -2 ? Math.floor(zf) : zf >= 2 ? Math.floor(zf) : fill;
  V.cv.width = w; V.cv.height = hh; V.cv.style.width = Math.round(w * zoomNow) + 'px'; V.cv.style.height = Math.round(hh * zoomNow) + 'px';
  const x = V.cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, hh);
  for (const L of SC.layers) {
    if (solo ? L.id !== solo : !L.visible) continue;
    if (L.kind === 'weather') { drawWeather(x, L, w, hh); continue; }
    if (!L.out) continue;
    const c = L._cv && L._cvFor === L.out ? L._cv : (L._cv = toCanvas(L.out), L._cvFor = L.out, L._cv);
    const y = hh - L.h + (L.y || 0);
    x.globalAlpha = L.opacity ?? 1; x.globalCompositeOperation = BLEND[L.blend] || 'source-over';
    let ox = -cam * L.scroll;
    if (L.repeat) { ox = ((ox % L.w) + L.w) % L.w - L.w; for (; ox < w; ox += L.w) x.drawImage(c, Math.round(ox), y); }
    else x.drawImage(c, Math.round(ox), y);
    // the actor walks on the layer that scrolls at camera speed (the ground)
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    // the actor walks on the ground (the last layer moving at camera speed); foreground (scroll > 1.1) passes in front
    if (actor && L === groundLayer()) drawActor(x);
  }
  if (actor && !groundLayer()) drawActor(x);
  // time of day: night multiplies toward moonlit blue, day screens toward warm light (preview grade)
  const tod = SC.tod || 0;
  if (tod < -.02) { x.globalCompositeOperation = 'multiply'; x.fillStyle = nightColour(-tod); x.fillRect(0, 0, w, hh); }
  else if (tod > .02) { x.globalCompositeOperation = 'screen'; x.globalAlpha = tod * .35; x.fillStyle = '#ffd9a0'; x.fillRect(0, 0, w, hh); }
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  if ((overlay === 'hud' || overlay === 'both') && hudImg) x.drawImage(hudImg, 0, 0);
  if (overlay === 'safe' || overlay === 'both') {
    const box = (k, c) => { x.strokeStyle = c; x.setLineDash([3, 3]); x.strokeRect(Math.round(w * (1 - k) / 2) + .5, Math.round(hh * (1 - k) / 2) + .5, Math.round(w * k) - 1, Math.round(hh * k) - 1); };
    box(.95, 'rgba(232,165,54,.9)'); box(.9, 'rgba(255,255,255,.55)'); x.setLineDash([]);
    x.fillStyle = 'rgba(232,165,54,.9)'; x.fillRect(w / 2 - 3, hh / 2, 7, 1); x.fillRect(w / 2, hh / 2 - 3, 1, 7);
  }
  const sel0 = SC.layers[sel];
  V.info.textContent = `${w}×${hh} · ${+zoomNow.toFixed(2)}× · camera ${Math.round(cam)}px${sel0?.tiles ? ` · ${sel0.name}: ${sel0.tiles} unique 8×8 tiles` : ''}`;
}
const groundLayer = () => SC.layers.filter(l => l.visible !== false && l.kind !== 'weather' && l.scroll >= 1 && l.scroll < 1.1).pop();   // weather is never the ground
// night tint as a multiply colour: white at 0 (no change) to a deep moonlit blue at 1
function nightColour(t) { const c = mix([255, 255, 255], [70, 84, 150], Math.min(1, t)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
function snapshot() {
  const k = 3, c = document.createElement('canvas'); c.width = V.cv.width * k; c.height = V.cv.height * k;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(V.cv, 0, 0, c.width, c.height);
  const a = h('a', { href: c.toDataURL('image/png'), download: `${SC.name}_snapshot.png` }); document.body.append(a); a.click(); a.remove();
  toast('Snapshot downloaded');
}
// Record a 4 s pan of the preview at 3× as WebM (the browser's own recorder), then download it.
async function recordPan(secs = 4) {
  if (V.rec) return;
  const k = 3, c = document.createElement('canvas'); c.width = V.cv.width * k; c.height = V.cv.height * k;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  let rec;
  // the recorder only gets frames from a canvas the page actually composites: keep it on screen at 1 css px (full resolution inside)
  c.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;pointer-events:none'; document.body.append(c);
  try { rec = new MediaRecorder(c.captureStream(30), { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm' }); }
  catch (e) { c.remove(); return toast('This browser cannot record video: ' + e.message, 'bad'); }
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const wasPlaying = playing; playing = true; V.rec = true; toast(`Recording ${secs} s…`);
  // stop after enough frames for the length, not after wall time: a busy page (layers still generating) would
  // otherwise give a clip of 3 frames. Capped at 3× the length in case the page stays busy.
  let n = 0; const t0 = performance.now(), want = secs * 30;
  const copy = () => { x.drawImage(V.cv, 0, 0, c.width, c.height); n++; if (n < want && performance.now() - t0 < secs * 3000) requestAnimationFrame(copy); else rec.stop(); };
  rec.onstop = () => {
    playing = wasPlaying; V.rec = false; c.remove();
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const a = h('a', { href: url, download: `${SC.name}_pan.webm` }); document.body.append(a); a.click(); a.remove();
    toast('Pan video downloaded', 'ok');
  };
  rec.start(250); copy();
}
function drawActor(x) {
  const a = actor.anim, f = a.frames[Math.floor(actorX * a.fps) % a.frames.length];
  const ground = groundLayer();
  const gy = ground ? SC.view.h - Math.round(ground.h * (ground.params?.height ?? .14)) : SC.view.h - 4;
  x.drawImage(toCanvas(f), Math.round(SC.view.w / 2 - f.width / 2), gy - f.height + 1);
}
async function refreshActors() {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites')).catch(() => ({ items: [] }));
  const ok = r.items.filter(i => i.dir && i.ok);
  V.actorSel.replaceChildren(h('option', { value: '' }, 'No actor'), ...ok.map(i => h('option', { value: i.path }, i.name)));
}
on('saved', () => { if (V.actorSel) refreshActors(); });
async function pickActor(path) {
  if (!path) { actor = null; drawPreview(); return; }
  const a = await loadActor(path);
  const an = a.anims.find(n => /walk|run/i.test(n.name)) || a.anims.find(n => /idle/i.test(n.name)) || a.anims[0];
  actor = an ? { anim: an } : null;
  drawPreview();          // show it now, even while the preview is paused
}

/* ---------------------------------------------------------- left panel ---- */
function drawLeft() {
  const nm = h('input', { type: 'text', value: SC.name, onchange: () => { SC.name = slug(nm.value); nm.value = SC.name; save(); } });
  const gens = h('div', { class: 'gens' }, ...Object.entries(GENS).map(([k, G]) => {
    const c = h('canvas', { width: 96, height: 24 });
    const p = Object.fromEntries(G.params.map(q => [q[0], q[2]]));
    try { const im = G.make(96, 24, p); c.getContext('2d').putImageData(im, 0, 0); } catch { }
    return h('button', { title: G.note, onclick: () => { addGen(k); drawAll(); process(); } }, c, G.name);
  }));
  const L0 = LOOKS[SC.look];
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Scene', h('span', { class: 'grow' }),
      h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy or remove your scenes', onclick: openMenu }, 'Open'), h('button', { 'data-file': 'new', class: 'btn sm ghost', title: 'Start a new empty scene (the current one is kept)', onclick: async () => { const n = prompt('Name for the new scene', 'scene'); if (!n) return; await loadOwners(); ++loads; SC = blankScene(); SC.name = freeName(n, SC.id); sel = 0; undoS = []; redoS = []; drawAll(); save(); } }, 'New')),
      field('Name', nm),
      field('Screen', select(VIEWS, `${SC.view.w}x${SC.view.h}`, v => { const [w, hh] = v.split('x').map(Number); SC.view = { w, h: hh }; for (const L of SC.layers) { L.w = L.gen === 'sky' && L.kind === 'gen' ? w : w * 2; L.h = hh; } drawAll(); process(); })),
      field('Haze', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('input', { type: 'color', value: SC.haze, oninput: e => { SC.haze = e.target.value; process(); } }),
        range(SC.hazeAmt, 0, .8, .01, v => { SC.hazeAmt = v; process(); }, v => Math.round(v * 100) + '%')), 'Far layers fade toward this colour')),
    h('div', { class: 'sec' }, h('h3', {}, 'Start from'),
      h('div', { class: 'chips' }, ...Object.entries(PRESETS).map(([k, p]) => h('button', { title: `Start from the "${p.name}" look: its layers replace this scene's (Ctrl+Z undoes)`, onclick: () => usePreset(k) }, p.name)))),
    h('div', { class: 'sec' }, h('h3', {}, 'Add a layer'), gens,
      h('div', { class: 'chips', style: { margin: '8px 0' } }, h('span', { class: 'lbl', style: { marginRight: '4px' } }, 'Weather'),
        ...Object.entries(WEATHER).map(([k, W]) => h('button', { title: W.note + ' (animated; exported to Godot as particles)', onclick: () => addWeather(k) }, W.name))),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: addDescribed }, icon('wand'), 'Described layer'),
        h('button', { class: 'btn', onclick: pickImageLayer }, 'Image…')),
      h('p', { class: 'note' }, 'Generated layers are instant and tile perfectly. Described layers are drawn by the generator from your words, matched to the layers already here.')));
}
async function openMenu() {
  openProjects('scene', { current: SC.name,
    open: async p => { const t = ++loads; const d = await (await fetch('/api/project?id=' + encodeURIComponent(p.id))).json(); if (t !== loads) return; SC = d.scene; sel = 0; undoS = []; redoS = []; drawAll(); process(null, true); },
    renamed: n => { SC.name = n; drawAll(); },
    removed: () => { ++loads; SC = blankScene(); sel = 0; undoS = []; redoS = []; drawAll(); } });
}

/* ---------------------------------------------------------- layer list ---- */
function drawLayers() {
  if (!V.list) return;
  for (const L of SC.layers) if (!L.id) L.id = uid();
  const kindOf = L => L.kind === 'weather' ? 'Weather' : L.kind === 'gen' ? GENS[L.gen].name : L.kind === 'ai' ? (L.srcURL ? 'described' : 'not drawn yet') : 'image';
  const redraw = () => { drawLayers(); drawPreview(); };
  V.list.replaceChildren(layerPanel({
    items: SC.layers, sel, solo, front: 'bottom', empty: 'No layers. Start from a preset or add one on the left.',
    name: L => L.name, sub: L => L.busy ? 'drawing…' : `${kindOf(L)} · scroll ${L.scroll}`,
    thumb: L => { const c = h('canvas'); if (L.out) toCanvas(L.out, 1, c); return c; },
    visible: L => L.visible, locked: L => !!L.locked,
    on: {
      select: i => { sel = i; drawRight(); drawLayers(); drawPreview(); },
      visible: (i, v) => { pushUndo(); SC.layers[i].visible = v; save(); redraw(); },
      solo: id => { solo = id; redraw(); },
      rename: (i, n) => { pushUndo(); SC.layers[i].name = slug(n) || SC.layers[i].name; save(); drawRight(); drawLayers(); },
      lock: (i, v) => { SC.layers[i].locked = v; save(); drawRight(); drawLayers(); },
      move: (a, b) => { pushUndo(); const [m] = SC.layers.splice(a, 1); SC.layers.splice(b, 0, m); sel = b; drawAll(); save(); },
      dup: i => { sel = i; dupLayer(); }, del: i => { sel = i; delLayer(); },
      add: [...Object.entries(GENS).map(([k, G]) => [G.name, () => { addGen(k); drawAll(); process(); }]), ['Described layer', addDescribed], ['Image…', pickImageLayer]],
      opacity: { get: L => L.opacity ?? 1, set: (i, v) => { edit(); SC.layers[i].opacity = v; drawPreview(); save(); } },
      blend: { options: [['normal', 'Normal'], ['add', 'Glow'], ['screen', 'Light'], ['multiply', 'Shade']], get: L => L.blend || 'normal', set: (i, v) => { pushUndo(); SC.layers[i].blend = v; drawPreview(); save(); drawRight(); } },
    } }));
  // depth ruler: where each layer sits between "fixed to the screen" (0) and "moves with the camera" (1)
  if (SC.layers.length > 1) {
    const max = Math.max(1.2, ...SC.layers.map(L => L.scroll));
    V.list.prepend(h('div', { class: 'ruler', title: 'Scroll speed of each layer: left = far (moves slowly), right = near. Click one to select it' },
      h('i', { class: 'mk', style: { left: (1 / max * 100) + '%' }, title: 'camera speed (the ground)' }),
      ...SC.layers.map((L, i) => h('b', { class: i === sel ? 'on' : '', style: { left: (L.scroll / max * 100) + '%', top: (4 + (i % 3) * 9) + 'px' }, title: `${L.name}: scroll ${L.scroll}`, onclick: () => { sel = i; drawLayers(); drawRight(); } }, L.name.slice(0, 8)))));
  }
  // layers further back should scroll slower; flag any that would slide in front of nearer ones
  const bad = SC.layers.findIndex((L, i) => i > 0 && L.scroll < SC.layers[i - 1].scroll - 1e-6);
  if (bad > 0) V.list.append(h('div', { class: 'depthwarn' }, h('span', {}, `"${SC.layers[bad].name}" scrolls slower than "${SC.layers[bad - 1].name}" behind it: it will look like it's further away.`),
    h('button', { class: 'btn sm', title: 'Order the layers by scroll speed: slow (far) at the back, fast (near) at the front', onclick: () => { pushUndo(); const cur = SC.layers[sel]; SC.layers.sort((a, b) => a.scroll - b.scroll); sel = SC.layers.indexOf(cur); drawAll(); save(); } }, 'Sort by depth')));
}
function move(i, d) { const j = i + d; if (j < 0 || j >= SC.layers.length || SC.layers[i].locked) return; pushUndo(); [SC.layers[i], SC.layers[j]] = [SC.layers[j], SC.layers[i]]; sel = j; drawLayers(); drawPreview(); save(); }
function dupLayer() {
  const L = SC.layers[sel]; if (!L) return;
  pushUndo();
  const c = { ...L, id: uid(), name: L.name + '_2', params: L.params ? { ...L.params } : L.params };
  SC.layers.splice(sel + 1, 0, c); sel++; drawAll(); save(); toast(`Duplicated "${L.name}"`);
}
function delLayer() {
  const L = SC.layers[sel]; if (!L) return;
  if (L.locked) return toast(`"${L.name}" is locked: unlock it in the layer list first`, 'bad');
  pushUndo(); SC.layers.splice(sel, 1); sel = Math.max(0, sel - 1); drawAll(); save();
  toast(`Deleted "${L.name}". Ctrl+Z brings it back`);
}

/* --------------------------------------------------------- right panel ---- */
function drawRight() {
  V.list = h('div', { class: 'layers' });
  const L = SC.layers[sel];
  const insp = h('div');
  if (L) {
    const nm = h('input', { type: 'text', value: L.name, onchange: () => { L.name = slug(nm.value); drawLayers(); save(); } });
    insp.append(h('div', { class: 'sec' }, h('h3', {}, 'Layer', h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', title: 'Duplicate this layer (Ctrl+D)', onclick: dupLayer }, 'Duplicate'),
      h('button', { class: 'btn sm ghost danger', title: 'Delete this layer (Delete; Ctrl+Z undoes)', onclick: delLayer }, 'Delete')),
      field('Name', nm),
      field('Scroll', range(L.scroll, 0, 1.5, .01, v => { if (!V.editing) { pushUndo(); V.editing = true; } L.scroll = v; drawLayers(); drawPreview(); save(); }), '0 is fixed to the screen (sky), 1 moves with the camera (ground), above 1 is foreground'),
      field('Raise', range(L.y || 0, -SC.view.h, SC.view.h, 1, v => { if (!V.editing) { pushUndo(); V.editing = true; } L.y = v; drawPreview(); save(); }, v => v + 'px')),
      field('Width', select([[SC.view.w, '1 screen'], [SC.view.w * 2, '2 screens'], [SC.view.w * 3, '3 screens'], [SC.view.w * 4, '4 screens']], L.w, v => { L.w = +v; process(L); }), 'Wider layers repeat less often'),
      field('Repeat', check('tile sideways', L.repeat, v => { L.repeat = v; process(L); })),
      field('Solid', check('player stands on it (Godot collision)', isSolid(L), v => { L.solid = v; save(); }), 'Exports collision polygons traced from this layer\'s shapes'),
      L.out ? h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
        h('button', { class: 'btn sm', title: 'Cut this layer into 16 px tiles (each different tile once) and open them in Levels as a tileset', onclick: () => cutTiles(L, 16) }, 'Tiles for Levels (16)'),
        h('button', { class: 'btn sm ghost', title: 'Same with 8 px tiles', onclick: () => cutTiles(L, 8) }, '8 px')) : null),
      h('div', { class: 'sec' }, h('h3', {}, 'Look of this layer', h('span', { class: 'grow' }),
          h('button', { class: 'btn sm ghost', title: 'Back to plain: full opacity, normal blend, no tint, scene haze', onclick: () => { pushUndo(); Object.assign(L, { opacity: 1, blend: 'normal', tint: null, tintAmt: 0, hazeOver: null }); drawRight(); process(L); } }, 'Reset')),
        field('Tint', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          h('input', { type: 'color', value: L.tint || '#ff5b2e', title: 'Tint colour', oninput: e => { edit(); L.tint = e.target.value; if (!L.tintAmt) L.tintAmt = .3; process(L); } }),
          range(L.tintAmt || 0, 0, 1, .05, v => { edit(); L.tintAmt = v; if (!L.tint) L.tint = '#ff5b2e'; process(L); }, v => Math.round(v * 100) + '%')), 'Pushes the layer toward a colour, then back into the palette'),
        field('Haze', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          check('own', L.hazeOver != null, v => { pushUndo(); L.hazeOver = v ? +(SC.hazeAmt * (1 - L.scroll)).toFixed(2) : null; drawRight(); process(L); }),
          L.hazeOver != null ? range(L.hazeOver, 0, 1, .02, v => { edit(); L.hazeOver = v; process(L); }, v => Math.round(v * 100) + '%') : h('span', { class: 'faint', style: { fontSize: '11px' } }, `auto ${Math.round((SC.look === 'cart' || L.scroll >= 1 ? 0 : SC.hazeAmt * (1 - L.scroll)) * 100)}% from depth`)), 'How much this layer fades into the scene haze')));
    if (L.kind === 'weather') {
      const P = L.params, f = (k, lbl, mn, mx, st, fmt, hint) => field(lbl, range(P[k], mn, mx, st, v => { edit(); P[k] = v; drawPreview(); save(); }, fmt), hint);
      insp.append(h('div', { class: 'sec' }, h('h3', {}, WEATHER[L.weather]?.name || 'Weather'),
        field('Colour', h('input', { type: 'color', value: P.color, oninput: e => { edit(); P.color = e.target.value; drawPreview(); save(); } })),
        f('amount', 'Amount', .02, 1, .02, v => Math.round(v * 100) + '%'),
        f('speed', 'Fall speed', -120, 400, 2, v => v + ' px/s', 'Negative rises (embers, ash)'),
        f('wind', 'Wind', -150, 150, 2, v => v + ' px/s'),
        f('size', 'Size', 1, 32, 1, v => v + ' px', 'Streak length for rain, wisp size for mist')));
    } else if (L.kind === 'gen') {
      const G = GENS[L.gen];
      insp.append(h('div', { class: 'sec' }, h('h3', {}, G.name, h('span', { class: 'grow' }),
        L.params.seed !== undefined ? [
          h('button', { class: 'btn sm ghost', title: 'Previous roll', disabled: !(L.seedAt > 0), onclick: () => { pushUndo(); L.seedAt--; L.params.seed = L.seeds[L.seedAt]; drawRight(); process(L); } }, '◀'),
          h('button', { class: 'btn sm ghost', title: 'Next roll (back to a newer one)', disabled: !(L.seeds && L.seedAt < L.seeds.length - 1), onclick: () => { pushUndo(); L.seedAt++; L.params.seed = L.seeds[L.seedAt]; drawRight(); process(L); } }, '▶'),
          h('button', { class: 'btn sm ghost', title: 'Another variation (◀ ▶ step back through the rolls)', onclick: () => {
            pushUndo();
            if (!L.seeds) { L.seeds = [L.params.seed]; L.seedAt = 0; }
            L.seeds = L.seeds.slice(0, L.seedAt + 1); L.params.seed = 1 + Math.floor(Math.random() * 9998); L.seeds.push(L.params.seed); L.seedAt = L.seeds.length - 1;
            if (L.seeds.length > 30) { L.seeds.shift(); L.seedAt--; }
            drawRight(); process(L);
          } }, icon('dice'), 'Reroll')] : null),
        ...G.params.filter(q => q[0] !== 'seed').map(([k, l, d, mn, mx, stp]) => mn === 'color'
          ? field(l, h('input', { type: 'color', value: L.params[k], oninput: e => { edit(); L.params[k] = e.target.value; process(L); } }))
          : field(l, range(L.params[k], mn, mx, stp, v => { edit(); L.params[k] = v; process(L); }, v => stp < 1 ? (+v).toFixed(2) : v)))));
    } else {
      const pr = h('textarea', { id: 'layerPrompt', rows: 3, value: L.prompt || '', placeholder: 'what this layer shows, e.g. "ruined gothic towers and broken bridges"', oninput: e => { L.prompt = e.target.value; save(); } });
      insp.append(h('div', { class: 'sec' }, h('h3', {}, L.kind === 'image' ? 'Image' : 'Described layer'),
        L.kind !== 'image' ? [h('div', { class: 'fld wide' }, h('span', { class: 'fl' }, 'Shows'), pr),
          field('Drawn by', seg([['cloud', h('span', {}, 'Cloud', budgetTag())], ['local', 'This PC']], L.engine || 'cloud', v => { L.engine = v; save(); })),
          (L.engine || 'cloud') === 'cloud' ? field('Match', check('style of the layers behind it', L.matchRef !== false, v => { L.matchRef = v; save(); })) : null,
          h('button', { class: 'btn go', style: { marginTop: '8px' }, disabled: L.busy, onclick: () => genAI(L) }, L.srcURL ? 'Draw again' : 'Draw this layer')] : null,
        field('Cut out sky', check('remove the background colour', L.key, v => { L.key = v; process(L); })),
        L.key ? field('Tolerance', range(L.tol || 30, 4, 120, 1, v => { L.tol = v; process(L); })) : null,
        SC.look === 'paint' ? field('Colours', range(L.colors || 15, 2, 15, 1, v => { L.colors = v; process(L); })) : null));
    }
  }
  if (L?.locked) { insp.inert = true; insp.classList.add('lp-frozen'); }      // a locked layer: look, don't touch
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Layers', h('span', { class: 'grow' }), h('small', {}, 'back to front')), V.list,
      L?.locked ? h('p', { class: 'note' }, `"${L.name}" is locked: click its lock to change it.`) : ''),
    insp,
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `backgrounds/${SC.name}/`), ' gets a PNG per layer, scene.json (scroll speeds, offsets) and a Godot Parallax2D scene.'),
      h('button', { 'data-file': 'save', class: 'btn go wide', onclick: async e => {      // a scene takes a few seconds to write: say so on the button
        const b = e.currentTarget, t = b.textContent; b.disabled = true; b.textContent = 'Saving…';
        try { await exportScene(); } finally { b.disabled = false; b.textContent = t; }
      } }, 'Save ' + SC.name)));
  drawLayers();
}

/* -------------------------------------------------------------- export ---- */
async function exportScene() {
  if (!SC.layers.some(l => l.out)) return toast('Nothing to save yet');
  await loadOwners();
  if (!SC.id) SC.id = uid();
  const free = freeName(SC.name, SC.id);
  if (free !== SC.name) { toast(`"${SC.name}" belongs to another scene, so this one is saved as "${free}"`); SC.name = free; drawAll(); }
  owners.set(SC.name, SC.id);
  const dir = `backgrounds/${SC.name}`, files = [];
  const sj = { view: SC.view, look: SC.look, tod: SC.tod || 0, source: 'kiln', layers: [] };
  const used = new Map();
  for (const L of SC.layers) {
    if (L.kind === 'weather') {
      const n = (used.get(L.name) || 0) + 1; used.set(L.name, n);
      sj.layers.push({ name: n > 1 ? `${L.name}_${n}` : L.name, kind: 'weather', weather: L.weather, scroll: L.scroll, visible: L.visible, opacity: L.opacity ?? 1, w: SC.view.w, h: SC.view.h, ...L.params });
      continue;
    }
    if (!L.out) continue;
    const n = (used.get(L.name) || 0) + 1; used.set(L.name, n);
    const name = n > 1 ? `${L.name}_${n}` : L.name, file = `${name}.png`;
    files.push({ name: file, b64: toDataURL(L.out) });
    const lj = { name, file, scroll: L.scroll, y: SC.view.h - L.h + (L.y || 0), repeat: L.repeat, w: L.w, h: L.h, visible: L.visible, opacity: L.opacity ?? 1, blend: L.blend || 'normal' };
    if (isSolid(L)) lj.collision = tracePolys(L.out, { minArea: 16, eps: 1.5 });
    sj.layers.push(lj);
  }
  files.push({ name: 'scene.json', text: JSON.stringify(sj, null, 2) + '\n' });
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + (FS.root + '/' + dir).slice(g.root.length + 1) : dir;
  files.push({ name: `${SC.name}.tscn`, text: godotScene(sj, res) });
  try {
    await saveFiles(dir, files);
    await api('/api/project', { id: 'scene-' + SC.name, data: serial() });
    toast(`Saved ${sj.layers.length} layers to ${dir}/`, 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
// a gameplay layer (moves with the camera) named like ground/floor/platform is solid unless switched off
function isSolid(L) { return L.solid ?? (Math.abs(L.scroll - 1) < .05 && /ground|floor|platform|terrain|street|road/i.test(L.name)); }
function godotScene(sj, res) {
  const img = sj.layers.filter(l => l.file), eid = l => img.indexOf(l) + 1;
  const ext = img.map(l => `[ext_resource type="Texture2D" path="${res}/${l.file}" id="${eid(l)}"]`);
  const wsub = [], wnode = l => {
    const id = 'w_' + l.name, c = rgb(l.color).map(v => (v / 255).toFixed(3)), up = l.speed < 0, mist = l.size > 8, sp = Math.abs(l.speed) || 1;
    const life = mist ? 12 : +((l.h + 20) / sp).toFixed(2), amount = Math.max(4, Math.round(l.amount * (mist ? 40 : 600)));
    wsub.push(`[sub_resource type="ParticleProcessMaterial" id="${id}"]\nparticle_flag_disable_z = true\nemission_shape = 3\nemission_box_extents = Vector3(${l.w / 2 + 40}, ${mist ? l.h / 2 : 1}, 1)\n`
      + `direction = Vector3(${(l.wind / sp).toFixed(3)}, ${up ? -1 : mist ? 0 : 1}, 0)\nspread = ${mist ? 10 : 4}.0\ninitial_velocity_min = ${mist ? Math.abs(l.wind) * .6 : sp * .8}\ninitial_velocity_max = ${mist ? Math.abs(l.wind) * 1.2 + 1 : sp * 1.2}\n`
      + `gravity = Vector3(0, 0, 0)\nscale_min = ${mist ? l.size : 1}.0\nscale_max = ${mist ? l.size * 2 : l.size > 1 ? l.size : 2}.0\ncolor = Color(${c.join(', ')}, ${mist ? .08 : .8})\n`);
    return `[node name="${l.name}" type="Parallax2D" parent="."]\nscroll_scale = Vector2(${l.scroll}, 1)\n${l.visible === false ? 'visible = false\n' : ''}\n`
      + `[node name="Particles" type="GPUParticles2D" parent="${l.name}"]\nposition = Vector2(${l.w / 2}, ${up ? l.h + 8 : mist ? l.h / 2 : -8})\namount = ${amount}\nlifetime = ${life}\npreprocess = ${life}\n`
      + `visibility_rect = Rect2(${-l.w}, ${-l.h - 40}, ${l.w * 2}, ${l.h * 2 + 80})\nprocess_material = SubResource("${id}")\n${l.opacity < 1 ? `modulate = Color(1, 1, 1, ${l.opacity})\n` : ''}`;
  };
  // Godot CanvasItemMaterial blend modes: 1 add, 3 multiply ("screen" has no built-in: add is the closest)
  const GB = { add: 1, screen: 1, multiply: 3 }, mats = [...new Set(sj.layers.map(l => GB[l.blend]).filter(Boolean))];
  const subs = mats.map(m => `[sub_resource type="CanvasItemMaterial" id="blend${m}"]\nblend_mode = ${m}\n`);
  const nodes = sj.layers.map((l, i) => l.kind === 'weather' ? wnode(l) : `[node name="${l.name}" type="Parallax2D" parent="."]\nscroll_scale = Vector2(${l.scroll}, 1)\n${l.repeat ? `repeat_size = Vector2(${l.w}, 0)\nrepeat_times = 3\n` : ''}${l.visible === false ? 'visible = false\n' : ''}\n[node name="Sprite2D" type="Sprite2D" parent="${l.name}"]\n${GB[l.blend] ? `material = SubResource("blend${GB[l.blend]}")\n` : ''}${l.opacity < 1 ? `modulate = Color(1, 1, 1, ${l.opacity})\n` : ''}texture = ExtResource("${eid(l)}")\ncentered = false\nposition = Vector2(0, ${l.y})\n${SHARP()}`);
  // solid layers: a StaticBody2D of traced polygons in world space (one copy per repeat, starting at x=0)
  const bodies = sj.layers.filter(l => l.collision?.length).map(l => {
    const copies = l.repeat ? 3 : 1, out = [`[node name="${l.name}_solid" type="StaticBody2D" parent="."]\nposition = Vector2(0, ${l.y})\n`];
    for (let c = 0; c < copies; c++) l.collision.forEach((poly, i) => out.push(`[node name="shape_${c}_${i}" type="CollisionPolygon2D" parent="${l.name}_solid"]\npolygon = PackedVector2Array(${poly.map(([x, y]) => `${x + c * l.w}, ${y}`).join(', ')})\n`));
    return out.join('\n');
  });
  const tod = sj.tod || 0, nightNode = tod < -.02 ? (() => { const c = mix([255, 255, 255], [70, 84, 150], Math.min(1, -tod)).map(v => (v / 255).toFixed(3)); return `\n[node name="TimeOfDay" type="CanvasModulate" parent="."]\ncolor = Color(${c.join(', ')}, 1)\n`; })() : '';
  return `[gd_scene load_steps=${ext.length + subs.length + wsub.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.length ? subs.join('\n') + '\n' : ''}${wsub.length ? wsub.join('\n') + '\n' : ''}[node name="${SC.name}" type="Node2D"]\n\n${nodes.join('\n')}${bodies.length ? '\n' + bodies.join('\n') : ''}${nightNode}`;
}

/* ------------------------------------------------- command wheel & keys ---- */
registerWheel('scenes', () => ({
  tools: [...Object.entries(GENS).slice(0, 9).map(([k, G]) => ({ label: G.name, hint: 'add layer', run: () => { pushUndo(); addGen(k); } })),
    { label: 'Duplicate', key: 'Ctrl+D', run: dupLayer }, { label: 'Delete layer', key: 'Del', run: delLayer }, { label: 'Undo', key: 'Ctrl+Z', run: undo }],
  guides: [
    { label: 'Sort by depth', hint: 'slow at back', run: () => { pushUndo(); const cur = SC.layers[sel]; SC.layers.sort((a, b) => a.scroll - b.scroll); sel = SC.layers.indexOf(cur); drawAll(); save(); } },
    { label: 'Solo layer', on: !!solo, hint: 'only this one', run: () => { solo = solo ? null : SC.layers[sel]?.id || null; drawLayers(); drawPreview(); } },
    { label: 'Sharp zoom', on: zoomPick === -2, run: () => { zoomPick = -2; pref.set('scene.zoom', -2); drawPreview(); } },
    { label: 'Fill zoom', on: zoomPick === -1, run: () => { zoomPick = -1; pref.set('scene.zoom', -1); drawPreview(); } },
    { label: playing ? 'Pause pan' : 'Play pan', key: 'Space', run: () => V.play?.click() },
    { label: 'Save scene', run: exportScene }],
}));
registerKeys('scenes', [['← →', 'Pan the camera'], ['Space', 'Play / pause the pan'], ['[ and ]', 'Select the layer behind / in front'], ['H', 'Hide / show the layer'],
  ['Alt+click an eye', 'Show only that layer (solo)'], ['Drag a layer', 'Reorder'], ['Ctrl+D', 'Duplicate layer'], ['Delete', 'Delete layer'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo']]);
