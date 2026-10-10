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
import { registerWheel, registerKeys } from './wheel.js';
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
let undoS = [], redoS = [];
const snap = () => ({ layers: SC.layers.map(L => ({ ...L, params: L.params ? { ...L.params } : L.params })), sel });
function pushUndo() { undoS.push(snap()); if (undoS.length > 60) undoS.shift(); redoS = []; }
function undo() { if (!undoS.length) return toast('Nothing to undo'); redoS.push(snap()); const s = undoS.pop(); SC.layers = s.layers; sel = Math.min(s.sel, SC.layers.length - 1); drawAll(); save(); }
function redo() { if (!redoS.length) return; undoS.push(snap()); const s = redoS.pop(); SC.layers = s.layers; sel = Math.min(s.sel, SC.layers.length - 1); drawAll(); save(); }
let solo = null;     // id of the only layer shown (Alt+click an eye), null = all
let zoomPick = pref.get('scene.zoom', 0);
let cam = 0, playing = true, speed = pref.get('scene.speed', 30), actor = null, actorX = 0;

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
    restore().then(() => { if (!SC.layers.length) usePreset('pallid', true); drain(); });
  },
  show() { drawAll(); },
};
async function drain() {
  while (pending.length) {
    const [k, d] = pending.shift();
    if (k === 'open') await openSceneDir(d);
    if (k === 'layer') await addImageLayer(rawURL(d), d.split('/').pop().replace(/\.\w+$/, ''));
  }
}

/* ------------------------------------------------------------- process ---- */
// source -> layer pixels (size, seam, sky key, haze) -> look (palette + dither)
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
  if (!SC.hazeAmt || SC.look === 'cart' || L.scroll >= 1 || L.kind === 'gen' && L.gen === 'sky') return im;
  const t = SC.hazeAmt * (1 - L.scroll), hc = rgb(SC.haze), o = cloneImg(im);
  for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3] >= 128) { const c = mix([o.data[i], o.data[i + 1], o.data[i + 2]], hc, t); o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; }
  return o;
}
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
function process(only) {
  clearTimeout(procT);
  procT = setTimeout(async () => {
    for (const [i, L] of SC.layers.entries()) {
      if (only != null && only !== L) continue;
      L.out = look(haze(await source(L), L), L, i);
      L.tiles = tileCount(L.out);
    }
    drawLayers(); drawPreview(); save();
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
  if (SC.name === 'scene' || PRESETS[SC.name]) SC.name = k;
  sel = 0; drawAll(); process();
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
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem('kiln.scene.cur', JSON.stringify(serial())); } catch { }
    api('/api/project', { id: 'scene-' + slug(SC.name), data: serial() }).catch(() => { });
  }, 1200);
}
async function restore() {
  try { const d = JSON.parse(localStorage.getItem('kiln.scene.cur') || 'null'); if (d) { SC = d.scene; sel = 0; drawAll(); process(); } } catch { }
}
const slug = s => (s || 'scene').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'scene';
async function openSceneDir(dir) {
  const name = dir.split('/').pop();
  const proj = await fetch('/api/project?id=scene-' + slug(name)).then(r => r.ok ? r.json() : null).catch(() => null);
  if (proj) { SC = proj.scene; sel = 0; drawAll(); process(); toast('Opened ' + name); return; }
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
      h('div', { class: 'bar' }, V.play, h('span', { class: 'lbl' }, 'Pan'), range(speed, 0, 160, 1, v => { speed = v; pref.set('scene.speed', v); }, v => v + 'px/s'),
        h('i', { class: 'sep' }), h('span', { class: 'lbl' }, 'Actor'), V.actorSel,
        h('i', { class: 'sep' }), h('span', { class: 'lbl' }, 'Zoom'),
        select([[0, 'Auto'], [-2, 'Sharp'], [-1, 'Fill'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], zoomPick, v => { zoomPick = +v; pref.set('scene.zoom', zoomPick); drawPreview(); }),
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
  const tick = t => { const dt = Math.min(.1, (t - last) / 1000); last = t; if (playing && el.classList.contains('on')) { cam += speed * dt; actorX += dt; drawPreview(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  refreshActors();
}
function drawAll() { if (!V.left) return; drawLeft(); drawLayers(); drawRight(); drawLooks(); drawPreview(); }
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
    if (!L.out || (solo ? L.id !== solo : !L.visible)) continue;
    const c = L._cv && L._cvFor === L.out ? L._cv : (L._cv = toCanvas(L.out), L._cvFor = L.out, L._cv);
    const y = hh - L.h + (L.y || 0);
    let ox = -cam * L.scroll;
    if (L.repeat) { ox = ((ox % L.w) + L.w) % L.w - L.w; for (; ox < w; ox += L.w) x.drawImage(c, Math.round(ox), y); }
    else x.drawImage(c, Math.round(ox), y);
    // the actor walks on the layer that scrolls at camera speed (the ground)
    if (actor && L.scroll >= 1 && L === SC.layers.filter(l => l.scroll >= 1).pop()) drawActor(x);
  }
  if (actor && !SC.layers.some(l => l.scroll >= 1)) drawActor(x);
  const sel0 = SC.layers[sel];
  V.info.textContent = `${w}×${hh} · ${+zoomNow.toFixed(2)}× · camera ${Math.round(cam)}px${sel0?.tiles ? ` · ${sel0.name}: ${sel0.tiles} unique 8×8 tiles` : ''}`;
}
function drawActor(x) {
  const a = actor.anim, f = a.frames[Math.floor(actorX * a.fps) % a.frames.length];
  const ground = SC.layers.filter(l => l.scroll >= 1).pop();
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
  if (!path) { actor = null; return; }
  const a = await loadActor(path);
  const an = a.anims.find(n => /walk|run/i.test(n.name)) || a.anims.find(n => /idle/i.test(n.name)) || a.anims[0];
  actor = an ? { anim: an } : null;
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
      h('button', { class: 'btn sm ghost', onclick: openMenu }, 'Open'), h('button', { class: 'btn sm ghost', onclick: () => { if (confirm('Start an empty scene?')) { SC = blankScene(); sel = 0; drawAll(); } } }, 'New')),
      field('Name', nm),
      field('Screen', select(VIEWS, `${SC.view.w}x${SC.view.h}`, v => { const [w, hh] = v.split('x').map(Number); SC.view = { w, h: hh }; for (const L of SC.layers) { L.w = L.gen === 'sky' && L.kind === 'gen' ? w : w * 2; L.h = hh; } drawAll(); process(); })),
      field('Haze', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('input', { type: 'color', value: SC.haze, oninput: e => { SC.haze = e.target.value; process(); } }),
        range(SC.hazeAmt, 0, .8, .01, v => { SC.hazeAmt = v; process(); }, v => Math.round(v * 100) + '%')), 'Far layers fade toward this colour')),
    h('div', { class: 'sec' }, h('h3', {}, 'Start from'),
      h('div', { class: 'chips' }, ...Object.entries(PRESETS).map(([k, p]) => h('button', { onclick: () => usePreset(k) }, p.name)))),
    h('div', { class: 'sec' }, h('h3', {}, 'Add a layer'), gens,
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => { const L = newLayer({ name: 'painted', kind: 'ai', prompt: '', scroll: .3, engine: 'cloud' }); SC.layers.push(L); sel = SC.layers.length - 1; drawAll(); setTimeout(() => $('#layerPrompt')?.focus(), 50); } }, icon('wand'), 'Described layer'),
        h('button', { class: 'btn', onclick: () => { const i = h('input', { type: 'file', accept: 'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => addImageLayer(r.result, f.name.replace(/\.\w+$/, '')); r.readAsDataURL(f); }; i.click(); } }, 'Image…')),
      h('p', { class: 'note' }, 'Generated layers are instant and tile perfectly. Described layers are drawn by the generator from your words, matched to the layers already here.')));
}
async function openMenu() {
  const list = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'scene');
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', {},
    h('header', {}, h('span', { class: 'grow' }, 'Open a scene'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' }, list.length ? list.map(p => h('div', { class: 'palrow', onclick: async () => {
      m.remove(); const d = await (await fetch('/api/project?id=' + encodeURIComponent(p.id))).json(); SC = d.scene; sel = 0; drawAll(); process();
    } }, icon('folder'), h('span', {}, p.name))) : h('p', { class: 'note' }, 'No saved scenes yet. They save themselves as you work.'))));
  document.body.append(m);
}

/* ---------------------------------------------------------- layer list ---- */
function drawLayers() {
  if (!V.list) return;
  for (const L of SC.layers) if (!L.id) L.id = uid();
  V.list.replaceChildren(...SC.layers.map((L, i) => {
    const c = h('canvas'); if (L.out) toCanvas(L.out, 1, c);
    const row = h('div', { class: 'ly' + (i === sel ? ' on' : '') + (solo && solo !== L.id ? ' dim' : ''), draggable: true, title: 'Drag to reorder (back at the top, front at the bottom)', onclick: () => { sel = i; drawRight(); drawLayers(); drawPreview(); } },
      h('button', { class: 'eye' + (L.visible ? ' on' : '') + (solo === L.id ? ' solo' : ''), title: 'Show / hide (H)  ·  Alt+click: show only this layer',
        onclick: e => { e.stopPropagation(); if (e.altKey) { solo = solo === L.id ? null : L.id; } else { pushUndo(); L.visible = !L.visible; save(); } drawLayers(); drawPreview(); } }, icon(L.visible ? 'eye' : 'eyeoff')),
      c, h('div', { class: 'nm' }, L.name, h('small', {}, L.busy ? 'drawing…' : `${L.kind === 'gen' ? GENS[L.gen].name : L.kind === 'ai' ? (L.srcURL ? 'described' : 'not drawn yet') : 'image'} · scroll ${L.scroll}`)),
      h('span', { style: { display: 'flex', flexDirection: 'column' } },
        h('button', { class: 'eye', title: 'Move toward the back', onclick: e => { e.stopPropagation(); move(i, -1); } }, icon('up')),
        h('button', { class: 'eye', title: 'Move toward the front', onclick: e => { e.stopPropagation(); move(i, 1); } }, icon('down'))));
    row.addEventListener('dragstart', e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => { e.preventDefault(); row.classList.remove('drag-over'); if (dragFrom == null || dragFrom === i) return; pushUndo(); const [m] = SC.layers.splice(dragFrom, 1); SC.layers.splice(i, 0, m); sel = i; dragFrom = null; drawAll(); save(); });
    return row;
  }));
  if (!SC.layers.length) V.list.append(h('p', { class: 'note' }, 'No layers. Start from a preset or add one on the left.'));
  // layers further back should scroll slower; flag any that would slide in front of nearer ones
  const bad = SC.layers.findIndex((L, i) => i > 0 && L.scroll < SC.layers[i - 1].scroll - 1e-6);
  if (bad > 0) V.list.append(h('div', { class: 'depthwarn' }, h('span', {}, `"${SC.layers[bad].name}" scrolls slower than "${SC.layers[bad - 1].name}" behind it: it will look like it's further away.`),
    h('button', { class: 'btn sm', title: 'Order the layers by scroll speed: slow (far) at the back, fast (near) at the front', onclick: () => { pushUndo(); const cur = SC.layers[sel]; SC.layers.sort((a, b) => a.scroll - b.scroll); sel = SC.layers.indexOf(cur); drawAll(); save(); } }, 'Sort by depth')));
}
let dragFrom = null;
function move(i, d) { const j = i + d; if (j < 0 || j >= SC.layers.length) return; pushUndo(); [SC.layers[i], SC.layers[j]] = [SC.layers[j], SC.layers[i]]; sel = j; drawLayers(); drawPreview(); save(); }
function dupLayer() {
  const L = SC.layers[sel]; if (!L) return;
  pushUndo();
  const c = { ...L, id: uid(), name: L.name + '_2', params: L.params ? { ...L.params } : L.params };
  SC.layers.splice(sel + 1, 0, c); sel++; drawAll(); save(); toast(`Duplicated "${L.name}"`);
}
function delLayer() {
  const L = SC.layers[sel]; if (!L) return;
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
      field('Solid', check('player stands on it (Godot collision)', isSolid(L), v => { L.solid = v; save(); }), 'Exports collision polygons traced from this layer\'s shapes')));
    if (L.kind === 'gen') {
      const G = GENS[L.gen];
      insp.append(h('div', { class: 'sec' }, h('h3', {}, G.name, h('span', { class: 'grow' }),
        L.params.seed !== undefined ? h('button', { class: 'btn sm ghost', title: 'Another variation', onclick: () => { L.params.seed = 1 + Math.floor(Math.random() * 9998); drawRight(); process(L); } }, icon('dice'), 'Reroll') : null),
        ...G.params.filter(q => q[0] !== 'seed').map(([k, l, d, mn, mx, stp]) => mn === 'color'
          ? field(l, h('input', { type: 'color', value: L.params[k], oninput: e => { L.params[k] = e.target.value; process(L); } }))
          : field(l, range(L.params[k], mn, mx, stp, v => { L.params[k] = v; process(L); }, v => stp < 1 ? (+v).toFixed(2) : v)))));
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
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Layers', h('span', { class: 'grow' }), h('small', {}, 'back to front')), V.list),
    insp,
    h('div', { class: 'sec' }, h('h3', {}, 'Save to asset folder'),
      h('p', { class: 'note', style: { marginTop: 0 } }, h('b', {}, `backgrounds/${SC.name}/`), ' gets a PNG per layer, scene.json (scroll speeds, offsets) and a Godot Parallax2D scene.'),
      h('button', { class: 'btn go wide', onclick: exportScene }, 'Save ' + SC.name)));
  drawLayers();
}

/* -------------------------------------------------------------- export ---- */
async function exportScene() {
  if (!SC.layers.some(l => l.out)) return toast('Nothing to save yet');
  const dir = `backgrounds/${SC.name}`, files = [];
  const sj = { view: SC.view, look: SC.look, source: 'kiln', layers: [] };
  const used = new Map();
  for (const L of SC.layers) {
    if (!L.out) continue;
    const n = (used.get(L.name) || 0) + 1; used.set(L.name, n);
    const name = n > 1 ? `${L.name}_${n}` : L.name, file = `${name}.png`;
    files.push({ name: file, b64: toDataURL(L.out) });
    const lj = { name, file, scroll: L.scroll, y: SC.view.h - L.h + (L.y || 0), repeat: L.repeat, w: L.w, h: L.h, visible: L.visible };
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
  const ext = sj.layers.map((l, i) => `[ext_resource type="Texture2D" path="${res}/${l.file}" id="${i + 1}"]`);
  const nodes = sj.layers.map((l, i) => `[node name="${l.name}" type="Parallax2D" parent="."]\nscroll_scale = Vector2(${l.scroll}, 1)\n${l.repeat ? `repeat_size = Vector2(${l.w}, 0)\nrepeat_times = 3\n` : ''}${l.visible === false ? 'visible = false\n' : ''}\n[node name="Sprite2D" type="Sprite2D" parent="${l.name}"]\ntexture = ExtResource("${i + 1}")\ncentered = false\nposition = Vector2(0, ${l.y})\ntexture_filter = 1\n`);
  // solid layers: a StaticBody2D of traced polygons in world space (one copy per repeat, starting at x=0)
  const bodies = sj.layers.filter(l => l.collision?.length).map(l => {
    const copies = l.repeat ? 3 : 1, out = [`[node name="${l.name}_solid" type="StaticBody2D" parent="."]\nposition = Vector2(0, ${l.y})\n`];
    for (let c = 0; c < copies; c++) l.collision.forEach((poly, i) => out.push(`[node name="shape_${c}_${i}" type="CollisionPolygon2D" parent="${l.name}_solid"]\npolygon = PackedVector2Array(${poly.map(([x, y]) => `${x + c * l.w}, ${y}`).join(', ')})\n`));
    return out.join('\n');
  });
  return `[gd_scene load_steps=${ext.length + 1} format=3]\n\n${ext.join('\n')}\n\n[node name="${SC.name}" type="Node2D"]\n\n${nodes.join('\n')}${bodies.length ? '\n' + bodies.join('\n') : ''}`;
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
