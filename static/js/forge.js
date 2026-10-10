// Forge: describe a thing, generate it, crush it into real sprite pixels.
// Two modes: a new thing (sets up an actor's identity), or more of an existing actor,
// where the reference, palette, frame size and pixel scale are locked so it stays on-model.
import { $, h, api, toast, emit, on, pref, clamp, field, range, select, check, seg, imgData, toCanvas, toDataURL, hex, rgb, luma,
  PALETTES, HARDWARE, pixelize, rawURL, bbox, newImg, resizeNN } from './core.js';
import { enqueue, estimate, fmtSecs, Q } from './queue.js';
import { icon } from './icons.js';
import { saveFiles } from './files.js';
import { STYLE, stylePrompt, styleAvoid } from './style.js';

const KINDS = [
  ['character', 'Character', 'full body character, standing, whole figure visible'],
  ['creature', 'Creature', 'full body monster creature, whole body visible'],
  ['item', 'Item', 'single game item icon, centered, isolated object'],
  ['prop', 'Prop', 'single environment prop object, isolated'],
  ['fx', 'Effect', 'game effect, magic burst, isolated'],
  ['portrait', 'Portrait', 'character portrait bust, head and shoulders, facing viewer'],
  ['vehicle', 'Vehicle', 'vehicle, side view, whole vehicle visible'],
];
const VIEWS = [['side', 'Side', 'side view, facing right'], ['front', 'Front', 'front view, facing viewer'], ['three', '¾', 'three-quarter view'], ['back', 'Back', 'back view'], ['top', 'Top-down', 'top-down view from above']];
const MOODS = ['grim', 'cheerful', 'eerie', 'heroic', 'grotesque', 'regal', 'ragged', 'mechanical', 'holy', 'feral'];
export const POSES = [
  ['standing still, relaxed', 'Stand'], ['walking, left leg forward', 'Step L'], ['walking, right leg forward', 'Step R'], ['running, leaning forward', 'Run'],
  ['crouching low', 'Crouch'], ['jumping, knees tucked', 'Jump'], ['falling, arms up', 'Fall'], ['winding up a swing, weapon raised behind', 'Wind-up'],
  ['striking forward, weapon fully extended', 'Strike'], ['blocking, guard up', 'Block'], ['recoiling in pain', 'Hurt'], ['collapsed on the ground', 'Down'],
  ['casting a spell, hands raised', 'Cast'], ['turned to face the viewer', 'Face us'], ['seen from behind', 'Back'],
];

const st = Object.assign({
  prompt: '', neg: '', engine: 'cloud', kind: 'character', view: 'side', moods: [],
  size: 384, batch: 2, seed: -1, lockSeed: false, steps: 4, denoise: 0.5,
  hw: 'snes', count: 12, palMode: 'auto', palName: 'pico8', w: 48, h: 48, fit: 'contain', anchor: 'bottom',
  key: true, tol: 38, keyGlobal: false, outline: 'outer', despeckle: true, dither: 'none', ditherAmt: 0.5, zoom: 0,
  change: '', poses: [],
}, pref.get('forge', {}));
const save = () => pref.set('forge', st);
let results = pref.get('forge.results', []);     // [{url, seed, prompt, engine, for, w}]
let srcURL = null, src = null, out = null, outPal = [], outInfo = null, customPal = null, mounted = false, V = {};
let pending = null;
let ID = null;   // identity of the actor being extended: {name, desc, kind, ref, refW, refH, refSprite, pal, w, h, scale, seed}

on('forge-image', p => { pending = { path: p }; if (mounted) takePending(); });
on('use-palette', p => { customPal = p; st.palMode = 'custom'; if (mounted) { drawRight(); run(); } });
on('job-done', j => { if (j.forge) addResults(j); });
on('forge-for', id => { ID = id; if (mounted) { drawLeft(); drawRight(); drawResults(); run(); } });
on('style', s => {
  st.hw = s.hw; st.outline = s.outline; if (s.palette) st.palMode = 'style'; else if (st.palMode === 'style') st.palMode = 'auto';
  save(); if (mounted) { drawRight(); run(); }
});

export const forge = {
  id: 'forge', title: 'Forge', key: '2',
  mount(el) {
    el.className = 'view ws';
    mounted = true;
    V.left = h('aside', { class: 'l' });
    V.right = h('aside', { class: 'r' });
    V.srcCv = h('canvas'); V.outCv = h('canvas');
    V.srcCap = h('div', { class: 'cap r' }); V.outCap = h('div', { class: 'cap r' });
    V.results = h('div', { class: 'results' });
    V.fits = h('span', { class: 'mono dim', style: { fontSize: '12px' } });
    const srcBox = h('div', {}, h('div', { class: 'cap' }, 'Source'), V.srcCap, h('div', { class: 'viewport' }, V.srcCv));
    const outBox = h('div', {}, h('div', { class: 'cap' }, 'Sprite'), V.outCap, h('div', { class: 'viewport' }, V.outCv));
    V.srcCv.addEventListener('click', e => pickKey(e));
    V.srcCv.title = 'Click a colour to make it the background that gets removed';
    el.append(V.left,
      h('section', { class: 'stage' },
        h('div', { class: 'bar' }, V.fits, h('span', { class: 'grow' }),
          h('span', { class: 'lbl' }, 'Zoom'), select([[0, 'Fit'], [2, '2×'], [4, '4×'], [6, '6×'], [8, '8×'], [12, '12×']], st.zoom, v => { st.zoom = +v; save(); paint(); }),
          h('button', { class: 'btn sm', title: 'Open an image from your computer as the source (or paste with Ctrl+V)', onclick: () => V.file.click() }, 'Open image'),
          V.file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: e => e.target.files[0] && loadLocal(e.target.files[0]) })),
        h('div', { class: 'split' }, srcBox, outBox),
        h('div', { class: 'bar bot', style: { display: 'block', maxHeight: '34%', overflow: 'auto', padding: '10px 12px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, V.resLbl = h('span', { class: 'lbl' }, 'Generated'), h('span', { class: 'grow', style: { flex: 1 } }),
            h('button', { class: 'btn sm ghost', onclick: () => { if (confirm('Clear the list? The image files are kept.')) { results = []; pref.set('forge.results', results); drawResults(); } } }, 'Clear list')),
          V.results)),
      V.right);
    document.addEventListener('paste', e => {
      if (!el.classList.contains('on')) return;
      const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
      if (f) loadLocal(f);
    });
    new ResizeObserver(() => paint()).observe(V.srcCv.parentElement);
    drawLeft(); drawRight(); drawResults();
    const qs = new URLSearchParams(location.search).get('src');
    if (qs) setSource(qs, 'linked image'); else if (results[0]) useResult(results[0]);
    takePending();
  },
  show() { drawResults(); },
};

async function takePending() {
  if (!pending) return;
  const p = pending; pending = null;
  await setSource(rawURL(p.path), p.path.split('/').pop());
}

/* -------------------------------------------------------------- prompt ---- */
function fullPrompt() {
  const k = KINDS.find(k => k[0] === st.kind), v = VIEWS.find(v => v[0] === st.view);
  if (ID) {
    const change = [st.change.trim(), ...st.poses].filter(Boolean).join(', ') || 'same pose';
    if (st.engine === 'cloud')
      return `Redraw this exact ${ID.kind || 'character'} from the reference image: ${ID.desc}. Change: ${change}. Keep the identical design, costume, proportions, colours, line weight and facing direction; only the pose or action changes. ${stylePrompt()}`;
    return [ID.desc, change, k?.[2], stylePrompt()].filter(Boolean).join(', ');
  }
  const bits = [st.prompt.trim()];
  if (st.moods.length) bits.push(st.moods.join(', '));
  if (k) bits.push(k[2]);
  if (v && st.kind !== 'item' && st.kind !== 'fx') bits.push(v[2]);
  bits.push(stylePrompt());
  return bits.filter(Boolean).join(', ');
}
function chips(list, key, multi, onChange) {
  const box = h('div', { class: 'chips' });
  const draw = () => box.replaceChildren(...list.map(([k, l]) => h('button', {
    class: (multi ? st[key].includes(k) : st[key] === k) ? 'on' : '',
    onclick: () => { if (multi) st[key] = st[key].includes(k) ? st[key].filter(x => x !== k) : [...st[key], k]; else st[key] = k; save(); draw(); onChange?.(); },
  }, l)));
  draw(); return box;
}
function drawLeft() {
  const est = () => {
    const s = estimate(genReq(ID ? 'x' : null));
    const ahead = Q.jobs.filter(j => ['queued', 'running', 'sending'].includes(j.state)).length;
    V.est.textContent = `~${fmtSecs(s * (ID && st.engine === 'cloud' ? Math.max(1, st.poses.length) : 1))}${ahead ? ` · ${ahead} ahead in queue` : ''}`;
  };
  V.est = h('div', { class: 'note' });
  const engineSeg = seg([['cloud', 'Cloud', 'Detailed and best at keeping a character on-model. Free quota first, then a few cents from the capped budget'],
    ['sprite', 'Sprite', 'Local pixel model tuned for game sprites (free, a minute or two)'], ['painted', 'Painted', 'Local DreamShaper + pixel-art LoRA: richer shading'], ['scene', 'Scene', 'Local pixel model for 16-bit scenes']],
    st.engine, v => { st.engine = v; save(); drawLeft(); });
  const seedIn = h('input', { type: 'number', value: st.seed, style: { width: '84px' }, onchange: () => { st.seed = +seedIn.value; save(); } });
  const local = st.engine !== 'cloud';
  const gen = h('div', { class: 'sec' }, h('h3', {}, 'Generator'),
    field('Model', engineSeg),
    local ? [field('Canvas', seg([[384, '384'], [512, '512']], st.size, v => { st.size = v; save(); est(); }), '384 is about twice as fast'),
      field('Steps', range(st.steps, 3, 8, 1, v => { st.steps = v; save(); est(); })),
      field('Seed', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, seedIn,
        h('button', { class: 'ibtn', title: 'Random seed each time', onclick: () => { st.seed = -1; seedIn.value = -1; save(); } }, icon('dice')),
        check('keep', st.lockSeed, v => { st.lockSeed = v; save(); })))] : null,
    !ID || local ? field('How many', range(st.batch, 1, 4, 1, v => { st.batch = v; save(); est(); })) : null,
    ID && local ? field('Freedom', range(st.denoise, .25, .8, .05, v => { st.denoise = v; save(); }, v => Math.round(v * 100) + '%'), 'How far from the reference it may drift') : null,
    h('button', { class: 'btn go wide', style: { marginTop: '10px' }, onclick: generate }, ID ? `Generate for ${ID.name}` : 'Generate'),
    V.est);
  if (ID) {
    const thumb = h('canvas', { style: { width: Math.min(96, ID.w * 2) + 'px', imageRendering: 'pixelated', background: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/8px 8px' } });
    toCanvas(ID.refSprite, 1, thumb);
    const ta = h('textarea', { rows: 2, value: st.change, placeholder: 'what is different: a pose, an action, a held item, an expression', oninput: () => { st.change = ta.value; save(); } });
    V.left.replaceChildren(
      h('div', { class: 'sec', style: { background: 'var(--emberbg)', borderBottom: '1px solid var(--ember)' } },
        h('h3', { style: { color: 'var(--ember2)' } }, 'Making frames for ' + ID.name, h('span', { class: 'grow' }),
          h('button', { class: 'btn sm ghost', onclick: () => { ID = null; drawLeft(); drawRight(); drawResults(); run(); } }, 'Stop')),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, thumb,
          h('div', { style: { fontSize: '12px', color: 'var(--dim)' } }, ID.desc,
            h('div', { class: 'note' }, `Locked: reference, ${ID.pal.length} colours, ${ID.w}×${ID.h}, ${ID.figH}px tall figure`)))),
      h('div', { class: 'sec' }, h('h3', {}, 'What changes'), ta,
        h('div', { style: { marginTop: '8px' } }, chips(POSES.map(p => [p[0], p[1]]), 'poses', true, est)),
        h('p', { class: 'note' }, st.engine === 'cloud' ? 'Each picked pose is one image, drawn from the reference.' : 'This PC redraws the reference; Freedom sets how much it may change.')),
      gen);
  } else {
    const ta = h('textarea', { rows: 3, value: st.prompt, placeholder: 'What is it? e.g. "drowned sailor with an anchor chain"', oninput: () => { st.prompt = ta.value; save(); } });
    const neg = h('input', { type: 'text', value: st.neg, placeholder: 'things to keep out', oninput: () => { st.neg = neg.value; save(); } });
    V.left.replaceChildren(...[
      h('div', { class: 'sec' }, h('h3', {}, 'Describe it'), ta,
        h('div', { style: { marginTop: '8px' } }, chips(KINDS.map(k => [k[0], k[1]]), 'kind')),
        h('div', { style: { marginTop: '8px' } }, chips(VIEWS.map(v => [v[0], v[1]]), 'view')),
        h('div', { style: { marginTop: '8px' } }, chips(MOODS.map(m => [m, m]), 'moods', true)),
        field('Leave out', neg),
        h('p', { class: 'note' }, 'The style bible (top bar) is added to every prompt so new things match the rest of the game.')),
      gen,
      local ? h('div', { class: 'sec' }, h('h3', {}, 'Rework the source'),
        field('Change', range(st.denoise, .2, .85, .05, v => { st.denoise = v; save(); }, v => Math.round(v * 100) + '%'), 'Low keeps the layout, high reinvents it'),
        h('button', { class: 'btn', style: { marginTop: '6px' }, onclick: () => variations() }, 'Make variations')) : null].filter(Boolean));
  }
  est();
}
function genReq(init) {
  const r = { engine: st.engine, prompt: fullPrompt(), neg: [st.neg, styleAvoid()].filter(Boolean).join(', '), w: st.size, h: st.size, batch: st.batch, steps: st.steps, fast: true, seed: st.lockSeed ? st.seed : -1 };
  if (st.engine === 'cloud') { r.w = r.h = 512; delete r.steps; }
  if (init) { r.init = init; r.denoise = st.denoise; }
  return r;
}
function track(j, label) { j.forge = true; j.forId = ID?.name || null; pendingTiles.push(j); drawResults(); }
function generate() {
  if (ID) {
    const req = genReq(ID.ref);
    if (st.engine !== 'cloud' && ID.seed >= 0 && st.lockSeed) req.seed = ID.seed;
    if (st.engine === 'cloud') {
      // one image per pose keeps each request simple: reference + one change
      const changes = st.poses.length ? st.poses : [st.change.trim() || 'same pose'];
      for (const p of changes) {
        const saved = st.poses; st.poses = st.poses.length ? [p] : [];
        const r = genReq(ID.ref); st.poses = saved;
        r.batch = 1;
        track(enqueue(r, `${ID.name}: ${p.split(',')[0]}`));
      }
    } else {
      req.w = req.h = ID.refW <= 400 ? 384 : 512;
      track(enqueue(req, `${ID.name}: ${(st.change || st.poses.join(', ')).slice(0, 40)}`));
    }
    return;
  }
  if (!st.prompt.trim()) return toast('Describe what to make first');
  track(enqueue(genReq(), st.prompt.trim().slice(0, 60)));
}
function variations() {
  if (!src) return toast('Pick a source image first');
  track(enqueue(genReq(toCanvas(src).toDataURL('image/png')), 'variations: ' + st.prompt.trim().slice(0, 48)));
}
const pendingTiles = [];
function addResults(j) {
  const i = pendingTiles.indexOf(j); if (i >= 0) pendingTiles.splice(i, 1);
  for (const url of j.images) results.unshift({ url, seed: j.seed, prompt: j.req.prompt, engine: j.req.engine, for: j.forId, t: Date.now() });
  results = results.slice(0, 120);
  pref.set('forge.results', results);
  if (st.lockSeed && j.seed) { st.seed = j.seed; save(); }
  drawResults();
  if (mounted && j.images[0] && (!ID || j.forId === ID.name)) useResult(results[0]);
}
function drawResults() {
  if (!V.results) return;
  const mine = r => ID ? r.for === ID.name : !r.for;
  V.resLbl.textContent = ID ? `Generated for ${ID.name}` : 'Generated';
  const tiles = [];
  for (const j of pendingTiles.filter(j => ['sending', 'queued', 'running'].includes(j.state) && (ID ? j.forId === ID.name : !j.forId))) {
    for (let b = 0; b < (j.req.batch || 1); b++) {
      const bar = h('i', { style: { width: (j.state === 'running' ? j.step / j.steps * 100 : 0) + '%' } });
      tiles.push(h('div', { class: 'r' }, h('div', { class: 'pend' }, j.state === 'running' ? (j.req.engine === 'cloud' ? 'drawing' : `${j.step}/${j.steps}`) : 'queued', bar)));
    }
  }
  tiles.push(...results.filter(mine).map(r => h('div', { class: 'r' + (srcURL === r.url ? ' on' : ''), title: r.prompt, onclick: () => useResult(r) }, h('img', { src: r.url, loading: 'lazy' }))));
  if (!tiles.length) tiles.push(h('div', { class: 'faint', style: { gridColumn: '1/-1', fontSize: '12px' } },
    ID ? `Nothing for ${ID.name} yet. Pick poses on the left and generate.` : 'Nothing generated yet. Describe a thing on the left and press Generate, or open / paste an existing image.'));
  V.results.replaceChildren(...tiles);
}
setInterval(() => { if (mounted && pendingTiles.some(j => j.state === 'running')) drawResults(); }, 1500);
async function useResult(r) { await setSource(r.url, r.prompt); drawResults(); }
async function setSource(url, label) {
  try { src = await imgData(url); srcURL = url; keyAt = null; run(); } catch { toast('Could not load that image', 'bad'); }
}
function loadLocal(f) { const r = new FileReader(); r.onload = () => setSource(r.result, f.name); r.readAsDataURL(f); }
let keyAt = null;
function pickKey(e) {
  if (!src) return;
  const r = V.srcCv.getBoundingClientRect();
  keyAt = [Math.floor((e.clientX - r.left) / r.width * src.width), Math.floor((e.clientY - r.top) / r.height * src.height)];
  st.key = true; save(); drawRight(); run();
}

/* ----------------------------------------------------------- pixelize ---- */
function palMaster() {
  if (st.palMode === 'style' && STYLE.palette) return STYLE.palette;
  if (st.palMode === 'named') return PALETTES[st.palName]?.colors;
  if (st.palMode === 'custom' && customPal) return customPal.colors;
  return null;
}
let runT;
function run() {
  clearTimeout(runT);
  runT = setTimeout(() => {
    if (!src) { out = null; paint(); return; }
    const s = keyAt ? floodFrom(src, keyAt, st.tol) : src;
    const common = { key: st.key && !keyAt, tol: st.tol, keyGlobal: st.keyGlobal, outline: st.outline === 'none' ? false : st.outline, despeckle: st.despeckle, dither: st.dither, ditherAmt: st.ditherAmt, anchor: 'bottom' };
    let r;
    if (ID) {
      // same palette, same frame, same pixels-per-source-pixel as the reference
      const scale = ID.scale * ID.refW / s.width;
      r = pixelize(s, { ...common, w: ID.w, h: ID.h, lock: ID.pal, scale, fit: 'contain' });
      const bb = bbox(r.img);
      outInfo = { figH: bb ? bb.h : 0, match: similarity(ID.refSprite, r.img) };
    } else {
      const H = HARDWARE[st.hw];
      r = pixelize(s, { ...common, w: st.w, h: st.h, hw: st.hw, count: Math.min(st.count, H.sprite), master: palMaster(), fit: st.fit, anchor: st.anchor });
      outInfo = null;
    }
    out = r.img; outPal = r.pal; out.scale = r.scale; out.srcW = s.width;
    paint(); drawPal();
  }, 60);
}
// How alike two sprites' colour use is (0..1): a quick off-model alarm.
function similarity(a, b) {
  const hist = im => { const m = new Map(); let n = 0; for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) { const k = im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2]; m.set(k, (m.get(k) || 0) + 1); n++; } for (const [k, v] of m) m.set(k, v / (n || 1)); return m; };
  const A = hist(a), B = hist(b), keys = new Set([...A.keys(), ...B.keys()]);
  let d = 0; for (const k of keys) d += Math.abs((A.get(k) || 0) - (B.get(k) || 0));
  return 1 - d / 2;
}
function floodFrom(im, [sx, sy], tol) {
  const o = new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), w = im.width, hh = im.height, d = o.data;
  const i0 = (sy * w + sx) * 4, bg = [d[i0], d[i0 + 1], d[i0 + 2]], T = tol * tol * 3;
  const near = p => { const i = p * 4, a = d[i] - bg[0], b = d[i + 1] - bg[1], c = d[i + 2] - bg[2]; return a * a + b * b + c * c <= T; };
  const seen = new Uint8Array(w * hh), stack = [];
  const push = p => { if (!seen[p] && near(p)) { seen[p] = 1; stack.push(p); } };
  push(sy * w + sx);
  for (let x = 0; x < w; x++) { push(x); push((hh - 1) * w + x); }
  for (let y = 0; y < hh; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) { const p = stack.pop(), x = p % w, y = (p / w) | 0; d[p * 4 + 3] = 0; if (x) push(p - 1); if (x < w - 1) push(p + 1); if (y) push(p - w); if (y < hh - 1) push(p + w); }
  return o;
}
function paint() {
  if (!V.srcCv) return;
  const fit = (cv, im, box, isOut) => {
    const W = box.clientWidth - 24, H = box.clientHeight - 24;
    if (!im) { cv.width = 1; cv.height = 1; return; }
    const z = isOut ? (st.zoom || Math.max(1, Math.floor(Math.min(W / im.width, H / im.height)))) : Math.min(W / im.width, H / im.height);
    cv.width = im.width; cv.height = im.height;
    cv.getContext('2d').putImageData(im, 0, 0);
    cv.style.width = Math.floor(im.width * z) + 'px'; cv.style.height = Math.floor(im.height * z) + 'px';
    const t = Math.max(2, Math.floor(z)) * 2;
    cv.style.background = isOut ? `repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/${t}px ${t}px` : '';
  };
  fit(V.srcCv, src, V.srcCv.parentElement, false);
  fit(V.outCv, out, V.outCv.parentElement, true);
  V.srcCap.textContent = src ? `${src.width}×${src.height}` : '';
  V.outCap.textContent = out ? `${out.width}×${out.height} · ${outPal.length} colours` : '';
  if (out && ID && outInfo) {
    const hOk = Math.abs(outInfo.figH - ID.figH) <= Math.max(2, ID.figH * .12), mOk = outInfo.match >= .6;
    V.fits.replaceChildren(
      h('span', { style: { color: hOk ? 'var(--ok)' : 'var(--warn)' } }, `Height ${outInfo.figH}px`), h('span', { class: 'faint' }, ` (reference ${ID.figH}) · `),
      h('span', { style: { color: mOk ? 'var(--ok)' : 'var(--warn)' } }, `Colour match ${Math.round(outInfo.match * 100)}%`),
      h('span', { class: 'faint' }, mOk ? '' : ' · looks off-model'),
      out.width > ID.w || out.height > ID.h ? h('span', { style: { color: 'var(--warn)' } }, ` · needs a ${out.width}×${out.height} frame`) : '');
  } else if (out) {
    const H = HARDWARE[st.hw], ok = outPal.length <= H.sprite;
    V.fits.replaceChildren(h('span', { style: { color: ok ? 'var(--ok)' : 'var(--warn)' } }, ok ? `Fits ${H.name}` : `Over ${H.name} limit`), ` · ${outPal.length}/${H.sprite} colours + transparent`);
  } else V.fits.textContent = 'Generate something, or open / paste an image to pixelize';
}

/* --------------------------------------------------------- right panel ---- */
function drawRight() {
  V.palBox = h('div', { class: 'sw big' });
  const clean = h('div', { class: 'sec' }, h('h3', {}, 'Clean-up'),
    field('Background', h('span', {}, check('remove', st.key, v => { st.key = v; keyAt = null; save(); run(); }), check('also inside', st.keyGlobal, v => { st.keyGlobal = v; save(); run(); }))),
    field('Tolerance', range(st.tol, 5, 120, 1, v => { st.tol = v; save(); run(); }), 'Or click the source to pick the background colour'),
    field('Outline', seg([['none', 'None'], ['outer', '1px'], ['thick', 'Round']], st.outline, v => { st.outline = v; save(); run(); })),
    field('Lone pixels', check('tidy', st.despeckle, v => { st.despeckle = v; save(); run(); })));
  if (ID) {
    V.right.replaceChildren(
      h('div', { class: 'sec' }, h('h3', {}, 'Locked to ' + ID.name),
        h('dl', { class: 'kv' }, h('dt', {}, 'Frame'), h('dd', {}, `${ID.w}×${ID.h}`), h('dt', {}, 'Figure'), h('dd', {}, `${ID.figH}px tall, same scale`), h('dt', {}, 'Palette'), h('dd', {}, `${ID.pal.length} colours`)),
        h('div', { class: 'sw', style: { marginTop: '8px' } }, ...ID.pal.map(c => h('i', { style: { background: hex(c) } }))),
        h('p', { class: 'note' }, 'Every result is squeezed into exactly these colours at the reference\'s pixel scale, so frames line up and nothing drifts.')),
      clean,
      h('div', { class: 'sec' }, h('h3', {}, 'Use it'),
        h('button', { class: 'btn go wide', onclick: () => sendToAnimate('frame') }, `Add to ${ID.name}`),
        h('p', { class: 'note' }, 'Goes in after the frame you are on in Animate.')));
    return;
  }
  const hwBtns = h('div', { class: 'hwgrid' }, ...Object.entries(HARDWARE).map(([k, H]) => h('button', {
    class: st.hw === k ? 'on' : '', title: H.note,
    onclick: () => { st.hw = k; st.count = Math.min(Math.max(st.count, 3), H.sprite); if (k === 'nes' || k === 'gb') st.count = 3; save(); drawRight(); run(); },
  }, H.name, h('small', {}, `${H.sprite}+1 col`))));
  const H = HARDWARE[st.hw];
  const wIn = h('input', { type: 'number', value: st.w, min: 8, max: 256, style: { width: '64px' }, onchange: () => { st.w = clamp(+wIn.value, 8, 256); save(); run(); } });
  const hIn = h('input', { type: 'number', value: st.h, min: 8, max: 256, style: { width: '64px' }, onchange: () => { st.h = clamp(+hIn.value, 8, 256); save(); run(); } });
  const palRows = h('div', { style: { display: st.palMode === 'named' ? '' : 'none', marginTop: '6px' } }, ...Object.entries(PALETTES).map(([k, p]) => h('div', {
    class: 'palrow' + (st.palName === k ? ' on' : ''), onclick: () => { st.palName = k; save(); drawRight(); run(); },
  }, h('span', { class: 'nm' }, p.name), h('div', { class: 'sw' }, ...p.colors.slice(0, 20).map(c => h('i', { style: { background: hex(c) } }))))));
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Hardware'), hwBtns, h('p', { class: 'note' }, H.note)),
    h('div', { class: 'sec' }, h('h3', {}, 'Size'),
      h('div', { class: 'chips' }, ...[16, 24, 32, 48, 64, 96, 128].map(s => h('button', { class: st.w === s && st.h === s ? 'on' : '', onclick: () => { st.w = st.h = s; save(); drawRight(); run(); } }, s))),
      field('Frame', h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, wIn, '×', hIn)),
      field('Fit', seg([['contain', 'Keep shape'], ['stretch', 'Fill frame']], st.fit, v => { st.fit = v; save(); run(); })),
      field('Stand on', seg([['bottom', 'Floor'], ['center', 'Middle']], st.anchor, v => { st.anchor = v; save(); run(); }), 'Floor keeps feet on the bottom row, so frames line up')),
    h('div', { class: 'sec' }, h('h3', {}, 'Colour'),
      field('Colours', range(Math.min(st.count, H.sprite), 2, H.sprite, 1, v => { st.count = v; save(); run(); })),
      field('Palette', seg([['auto', 'From image'], ...(STYLE.palette ? [['style', 'Style']] : []), ['named', 'Preset'], ...(customPal ? [['custom', customPal.name.slice(0, 10)]] : [])], st.palMode, v => { st.palMode = v; save(); drawRight(); run(); })),
      palRows,
      field('Dither', seg([['none', 'None'], ['bayer2', '2×2'], ['bayer4', '4×4']], st.dither, v => { st.dither = v; save(); run(); })),
      st.dither !== 'none' ? field('Strength', range(st.ditherAmt, .1, 1, .05, v => { st.ditherAmt = v; save(); run(); })) : null,
      h('div', { style: { marginTop: '10px' } }, V.palBox)),
    clean,
    h('div', { class: 'sec' }, h('h3', {}, 'Use it'),
      h('button', { class: 'btn go wide', onclick: () => sendToAnimate('new') }, 'New actor in Animate'),
      h('p', { class: 'note' }, 'Makes this the actor\'s reference: its description, palette, size and scale are kept for every later frame.'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => sendToAnimate('frame') }, 'Add as frame'),
        h('button', { class: 'btn', onclick: savePNG }, 'Save PNG'),
        h('button', { class: 'btn', onclick: savePalette }, 'Save palette'))));
  drawPal();
}
function drawPal() { if (V.palBox) V.palBox.replaceChildren(...outPal.map(c => h('i', { title: hex(c), style: { background: hex(c) } }))); }
function nameFromPrompt() {
  const stop = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'in', 'on', 'holding', 'wearing']);
  const words = (st.prompt.trim().split(/[,.]/)[0] || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w && !stop.has(w));
  return words.slice(0, 2).join('_') || 'sprite';
}
// Reference image kept with the actor: the source, at most 512px wide (scale is adjusted to match).
function refImage() {
  const s = keyAt ? floodFrom(src, keyAt, st.tol) : src;
  const k = Math.min(1, 512 / Math.max(s.width, s.height));
  const im = k < 1 ? resizeNN(s, Math.round(s.width * k), Math.round(s.height * k)) : s;
  const cv = toCanvas(im), x = cv.getContext('2d');
  // flatten onto white: references go back to the generator as an image to redraw
  x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
  return { url: cv.toDataURL('image/png'), w: im.width };
}
function sendToAnimate(mode) {
  if (!out) return toast('Nothing to send yet');
  const bb = bbox(out);
  const identity = mode === 'new' ? (() => {
    const ref = refImage();
    return { desc: st.prompt.trim(), kind: st.kind, ref: ref.url, refW: ref.w, scale: (out.scale || 1) * out.srcW / ref.w, figH: bb ? bb.h : out.height, seed: results.find(r => r.url === srcURL)?.seed ?? -1 };
  })() : null;
  emit('to-animate', { mode, img: out, pal: outPal, name: ID ? ID.name : nameFromPrompt(), identity, forName: ID?.name });
}
async function savePNG() {
  if (!out) return;
  const base = ID ? ID.name : nameFromPrompt();
  const n = prompt('Save as (inside the asset folder)', `sprites/${base}/${base}.png`);
  if (!n) return;
  const r = await saveFiles(n.split('/').slice(0, -1).join('/'), [{ name: n.split('/').pop(), b64: toDataURL(out) }]).catch(e => toast(e.message, 'bad'));
  if (r) toast('Saved ' + n, 'ok');
}
async function savePalette() {
  if (!outPal.length) return;
  const n = prompt('Palette name', nameFromPrompt());
  if (!n) return;
  const cv = document.createElement('canvas'); cv.width = outPal.length; cv.height = 1;
  const x = cv.getContext('2d'); outPal.forEach((c, i) => { x.fillStyle = hex(c); x.fillRect(i, 0, 1, 1); });
  await saveFiles('palettes', [{ name: n + '.hex', text: outPal.map(c => hex(c).slice(1)).join('\n') + '\n' }, { name: n + '.png', b64: cv.toDataURL() }]);
  toast('Saved palettes/' + n + '.hex', 'ok');
}
