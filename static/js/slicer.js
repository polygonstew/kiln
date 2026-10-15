// Sheet slicer: cut a sprite sheet (grid or loose poses) into uniform, baseline-aligned frames.
import { h, $, toast, field, range, seg, check, imgData, keyBackground, crop, blit, newImg, toCanvas, pixelize, buildPalette, HARDWARE, clamp, bbox, cloneImg } from './core.js';

export function components(im, gap, minFrac) {
  // pixels closer than `gap` belong together (capes, swords, loose bits): grow the opaque mask by
  // gap/2 each way, label that, and measure each label on the real pixels. Unlike merging boxes,
  // this never chains a whole packed sheet into one frame.
  const w = im.width, hh = im.height, a = im.data, N = w * hh;
  let m = new Uint8Array(N);
  for (let p = 0; p < N; p++) m[p] = a[p * 4 + 3] >= 128 ? 1 : 0;
  const r = Math.ceil(gap / 2);
  if (r > 0) {
    const t = new Uint8Array(N);
    for (let y = 0; y < hh; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) t[y * w + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) t[y * w + x] = 1; } }
    const u = new Uint8Array(N);
    for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < hh; y++) { if (t[y * w + x]) last = y; if (y - last <= r) u[y * w + x] = 1; } last = 1e9; for (let y = hh - 1; y >= 0; y--) { if (t[y * w + x]) last = y; if (last - y <= r) u[y * w + x] = 1; } }
    m = u;
  }
  const lab = new Int32Array(N).fill(-1);
  let boxes = [];
  for (let p = 0; p < N; p++) {
    if (lab[p] >= 0 || !m[p]) continue;
    const id = boxes.length; boxes.push({ x0: w, y0: hh, x1: -1, y1: -1, n: 0 });
    const st = [p]; lab[p] = id;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q / w) | 0;
      if (x > 0 && m[q - 1] && lab[q - 1] < 0) { lab[q - 1] = id; st.push(q - 1); }
      if (x < w - 1 && m[q + 1] && lab[q + 1] < 0) { lab[q + 1] = id; st.push(q + 1); }
      if (y > 0 && m[q - w] && lab[q - w] < 0) { lab[q - w] = id; st.push(q - w); }
      if (y < hh - 1 && m[q + w] && lab[q + w] < 0) { lab[q + w] = id; st.push(q + w); }
    }
  }
  for (let p = 0; p < N; p++) if (a[p * 4 + 3] >= 128) {
    const B = boxes[lab[p]], x = p % w, y = (p / w) | 0;
    B.n++; if (x < B.x0) B.x0 = x; if (x > B.x1) B.x1 = x; if (y < B.y0) B.y0 = y; if (y > B.y1) B.y1 = y;
  }
  boxes = boxes.filter(B => B.n);
  const maxN = Math.max(0, ...boxes.map(b => b.n));
  let keep = boxes.filter(b => b.n >= maxN * minFrac).map(b => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, n: b.n }));
  // captions ("Walk", "ripped by …"): short, wide, thin strokes compared with the figures
  const hs = keep.map(b => b.h).sort((a, b) => a - b), medH = hs[hs.length >> 1] || 0;
  keep = keep.filter(b => !(b.h < medH * 0.45 && (b.w > b.h * 2.2 || b.n < b.w * b.h * 0.3)));
  // reading order: rows by vertical overlap, then left to right
  keep.sort((p, q) => p.y - q.y);
  const rows = [];
  for (const b of keep) {
    const r = rows.find(r => b.y < r.y + r.h * 0.6 && r.y < b.y + b.h * 0.6);
    if (r) { r.items.push(b); r.y = Math.min(r.y, b.y); r.h = Math.max(r.h, b.h); } else rows.push({ y: b.y, h: b.h, items: [b] });
  }
  return rows.map(r => r.items.sort((p, q) => p.x - q.x));
}


/* ----------------------------------------- untangling touching frames ---- */
// AI sheets often let a sword or cape poke into the next box, or two poses touch. Instead of cutting by
// rectangles, every separate piece of art goes to the box it mostly sits in, and pieces shared by two
// neighbouring boxes are split along the seam that crosses the fewest pixels. Returns owner[pixel] = box
// index (-1 = background) and the seams (for the preview).
export function untangle(im, boxes) {
  const w = im.width, hh = im.height, N = w * hh, a = im.data, op = p => a[p * 4 + 3] >= 128;
  const owner = new Int32Array(N).fill(-1), comp = new Int32Array(N).fill(-1), seams = [];
  const cellAt = (x, y) => { for (let i = 0; i < boxes.length; i++) { const b = boxes[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return i; } return -1; };
  const nearest = (x, y) => { let bi = 0, bd = 1e18; boxes.forEach((b, i) => { const d = (x - b.x - b.w / 2) ** 2 + (y - b.y - b.h / 2) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
  let nc = 0;
  for (let p0 = 0; p0 < N; p0++) {
    if (comp[p0] >= 0 || !op(p0)) continue;
    const id = nc++, list = [p0]; comp[p0] = id;
    for (let k = 0; k < list.length; k++) {
      const p = list[k], x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
        const q = ny * w + nx; if (comp[q] < 0 && op(q)) { comp[q] = id; list.push(q); }
      }
    }
    // how much of this piece sits in each box
    const share = new Map();
    for (const p of list) { const c = cellAt(p % w, (p / w) | 0); share.set(c, (share.get(c) || 0) + 1); }
    const ranked = [...share.entries()].filter(([c]) => c >= 0).sort((x, y) => y[1] - x[1]);
    if (!ranked.length) { const c = nearest(list[0] % w, (list[0] / w) | 0); for (const p of list) owner[p] = c; continue; }
    const [c1] = ranked[0], B1 = boxes[c1];
    // boxes in c1's row that hold a real part of this piece: one pose with a stray bit, or several poses joined (slash
    // effects can chain a whole row together)
    const sig = ranked.filter(([c, n]) => n >= Math.max(40, list.length * .08) && Math.abs((boxes[c].y + boxes[c].h / 2) - (B1.y + B1.h / 2)) < Math.min(boxes[c].h, B1.h) / 2)
      .map(([c]) => c).sort((p, q) => boxes[p].x - boxes[q].x);
    if (sig.length < 2) { for (const p of list) owner[p] = c1; continue; }
    // a seam between each neighbouring pair: a top-to-bottom path crossing the fewest pixels of this piece
    const cuts = [];
    for (let k = 0; k + 1 < sig.length; k++) {
      const P = boxes[sig[k]], Q = boxes[sig[k + 1]];
      const xa = Math.round(P.x + P.w / 2), xb = Math.max(xa + 1, Math.round(Q.x + Q.w / 2));
      const ya = Math.max(0, Math.min(P.y, Q.y)), yb = Math.min(hh, Math.max(P.y + P.h, Q.y + Q.h));
      const W = xb - xa + 1, H = yb - ya, mid = (P.x + P.w + Q.x) / 2;
      const cost = (x, y) => (comp[y * w + x] === id ? 10 : 0) + Math.abs(x - mid) * 0.02;   // empty columns first, then near the box edge
      const D = new Float32Array(W * H), from = new Int8Array(W * H);
      for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
        const c = cost(xa + i, ya + y);
        if (!y) { D[i] = c; continue; }
        let best = D[(y - 1) * W + i], f = 0;
        if (i > 0 && D[(y - 1) * W + i - 1] < best) { best = D[(y - 1) * W + i - 1]; f = -1; }
        if (i < W - 1 && D[(y - 1) * W + i + 1] < best) { best = D[(y - 1) * W + i + 1]; f = 1; }
        D[y * W + i] = best + c; from[y * W + i] = f;
      }
      let bi = 0; for (let i = 1; i < W; i++) if (D[(H - 1) * W + i] < D[(H - 1) * W + bi]) bi = i;
      const xs = new Int32Array(H); for (let y = H - 1; y >= 0; y--) { xs[y] = xa + bi; bi += from[y * W + bi]; }
      cuts.push({ y0: ya, xs, mid }); seams.push({ y0: ya, xs });
    }
    for (const p of list) {
      const x = p % w, y = (p / w) | 0;
      let k = 0;
      while (k < cuts.length) { const c = cuts[k], sx = y >= c.y0 && y < c.y0 + c.xs.length ? c.xs[y - c.y0] : c.mid; if (x < sx) break; k++; }
      owner[p] = sig[k];
    }
  }
  return { owner, seams };
}

/* ------------------------------------------------- sheet auto-analysis ---- */
const ANIM_WORDS = new Set(['idle', 'walk', 'run', 'attack', 'jump', 'dash', 'roll', 'hurt', 'hit', 'death', 'die', 'dead', 'fall', 'crouch', 'block',
  'cast', 'climb', 'slide', 'land', 'shoot', 'stand', 'spawn', 'special', 'charge', 'guard', 'dodge', 'fly', 'swim', 'throw', 'taunt', 'parry', 'kick', 'punch', 'slash']);
// "enemy_4x8_idle_walk_run_attack" -> 4 rows, 8 columns, row names
function nameHints(name) {
  const base = name.toLowerCase().replace(/\.\w+$/, '');
  const m = base.match(/(?:^|[^0-9])(\d{1,2})\s*x\s*(\d{1,2})(?:[^0-9]|$)/);
  return { rows: m ? +m[1] : 0, cols: m ? +m[2] : 0, names: base.split(/[^a-z]+/).filter(w => ANIM_WORDS.has(w)) };
}
// opaque runs along one axis of a region
function runs(im, horiz, a0, a1, b0, b1, minOcc) {
  const out = []; let start = -1;
  for (let a = a0; a <= a1; a++) {
    let n = 0;
    if (a < a1) for (let b = b0; b < b1; b++) { const i = horiz ? (b * im.width + a) * 4 : (a * im.width + b) * 4; if (im.data[i + 3] >= 128) n++; }
    const on = a < a1 && n > minOcc;
    if (on && start < 0) start = a;
    if (!on && start >= 0) { out.push({ a: start, b: a }); start = -1; }
  }
  return out;
}
const even = segs => {
  if (segs.length < 2) return false;
  const c = segs.map(s => (s.a + s.b) / 2), d = c.slice(1).map((v, i) => v - c[i]);
  const m = d.reduce((x, y) => x + y, 0) / d.length, sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / d.length);
  return sd / m < 0.18 ? m : false;
};
// Is it already pixel art, and blown up by an integer factor? (k×k blocks of one colour)
export function pixelScale(im) {
  const w = im.width, hh = im.height, d = im.data;
  const same = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) <= 24 && (d[i + 3] >= 128) === (d[j + 3] >= 128);
  for (let k = 8; k >= 2; k--) {
    for (let off = 0; off < k; off++) {
      let tested = 0, ok = 0;
      for (let by = off; by + k <= hh && tested < 600; by += k * 7) for (let bx = off; bx + k <= w && tested < 600; bx += k * 5) {
        const i0 = (by * w + bx) * 4, i1 = (by * w + bx + k) * 4;
        if (bx + k >= w || same(i0, i1) && d[i0 + 3] < 128) continue;      // skip empty background
        let u = true;
        for (let y = 0; y < k && u; y++) for (let x = 0; x < k; x++) if (!same(i0, ((by + y) * w + bx + x) * 4)) { u = false; break; }
        tested++; if (u) ok++;
      }
      if (tested > 40 && ok / tested > 0.9) return { k, off };
    }
  }
  return { k: 1, off: 0 };
}
function fewColours(im) {
  const m = new Set();
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) { m.add(im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2]); if (m.size > 600) return false; }
  return true;
}
// Work out how a sheet is laid out: filename "RxC", else even gaps between frames, else loose figures.
export function analyzeSheet(keyed, name) {
  const hint = nameHints(name);
  const W = keyed.width, H = keyed.height;
  const rb = runs(keyed, false, 0, H, 0, W, W * 0.002).filter(r => r.b - r.a > H * 0.02);
  if (hint.rows && hint.cols) {
    const fw = W / hint.cols, fh = H / hint.rows;
    return { mode: 'grid', cols: hint.cols, rows: hint.rows, names: hint.names.length === hint.rows ? hint.names : [], why: `the file name says ${hint.rows}×${hint.cols}` };
  }
  // per row band: columns of figures; accept when most bands are evenly spaced with the same count
  const per = rb.map(r => runs(keyed, true, 0, W, r.a, r.b, (r.b - r.a) * 0.01).filter(c => c.b - c.a > 2));
  const counts = per.map(c => c.length), mode = [...counts].sort((a, b) => counts.filter(v => v === b).length - counts.filter(v => v === a).length)[0];
  const good = per.filter(c => c.length === mode && even(c));
  // rows with gaps (a pose left out) still sit on the same columns: a grid when every figure lands on the fullest rows' pitch
  const most = Math.max(...counts), full = per.filter(c => c.length === most && even(c));
  if (rb.length >= 2 && rb.length <= 16 && most >= 2 && full.length && !(good.length >= rb.length * 0.6 && mode === most)) {
    const pitch = full.map(even).reduce((a, b) => a + b, 0) / full.length;
    const x0 = Math.max(0, full.map(c => (c[0].a + c[0].b) / 2).reduce((a, b) => a + b, 0) / full.length - pitch / 2);
    const onGrid = c => c.every(q => { const k = ((q.a + q.b) / 2 - x0) / pitch - .5; return Math.abs(k - Math.round(k)) < .25; });
    if (per.every(c => c.length <= most && onGrid(c)))
      return { mode: 'bands', bands: rb, pitch, x0, cols: most, rows: rb.length, names: hint.names.length === rb.length ? hint.names : [], why: `${rb.length} rows of up to ${most} frames (gaps left out)` };
  }
  if (rb.length >= 1 && mode >= 2 && good.length >= Math.max(1, rb.length * 0.6) && rb.length <= 16) {
    const pitch = good.map(even).reduce((a, b) => a + b, 0) / good.length;
    const x0 = Math.max(0, good.map(c => (c[0].a + c[0].b) / 2).reduce((a, b) => a + b, 0) / good.length - pitch / 2);
    return { mode: 'bands', bands: rb, pitch, x0, cols: mode, rows: rb.length, names: hint.names.length === rb.length ? hint.names : [], why: `${rb.length} row${rb.length > 1 ? 's' : ''} of ${mode} evenly spaced frames` };
  }
  return { mode: 'auto', names: hint.names, why: 'loose figures' };
}

/* opts.onDone({anims:[{name, frames}], w, h, pal}) ; opts.target {w,h,hw,count} */
export async function openSlicer(src, opts = {}) {
  let im;
  try { im = await imgData(src, true); } catch { return toast('Could not open that image', 'bad'); }
  const ps = pixelScale(im), pixelArt = ps.k >= 2 || fewColours(im), bg = border(im);
  const st = {
    mode: 'auto', cols: 4, rows: 1, key: bg.key, tol: bg.tol, gap: Math.round(Math.max(im.width, im.height) / 120), minFrac: 0.08,
    rowsAsAnims: true, pixel: false, unscale: ps.k, untangle: im.width * im.height <= 9e6, th: opts.target?.h || 64, hw: opts.target?.hw || 'snes', count: opts.target?.count || 15, name: opts.name || 'imported', fps: 8,
  };
  let A = null;   // what the auto-analysis found
  {
    const k0 = st.key ? keyBackground(im, st.tol) : im;
    A = analyzeSheet(k0, opts.file || opts.name || '');
    if (A.mode === 'auto') {
      // join distance from the figures themselves (a cape or sword sits a few % of a body away),
      // not from the sheet size: ripped sheets pack poses tightly
      const hs = components(k0, 1, 0.05).flat().map(b => b.h).sort((a, b) => a - b);
      const medH = hs.length ? hs[Math.floor(hs.length * 0.6)] : 0;
      if (medH) st.gap = clamp(Math.round(medH * 0.08), 1, 40);
    }
    st.mode = A.mode; if (A.cols) st.cols = A.cols; if (A.rows) st.rows = A.rows;
  }
  let rows = [], keyed = im, tangle = null, custom = null;
  const cv = h('canvas', { style: { maxWidth: '100%', maxHeight: '58vh', background: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/16px 16px' } });
  const info = h('div', { class: 'note' });
  // tools for cleaning the sheet before cutting: erase brush, clear a rectangle, undo; double-click a box to work on one frame
  const tools = h('div', { class: 'sltools' });
  const W0 = im.width, H0 = im.height, erased = new Uint8Array(W0 * H0), undoMask = [], skip = new Set();
  let VW = { x: 0, y: 0, w: W0, h: H0 }, focus = -1, brush = Math.max(3, Math.round(Math.max(W0, H0) / 120));
  const skey = b => `${Math.round(b.x)},${Math.round(b.y)}`;
  const ctl = h('div');
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(1200px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Cut a sheet into frames'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 300px' } },
      h('div', { style: { padding: '10px 14px 14px', display: 'grid', placeItems: 'center', alignContent: 'start', gap: '8px', borderRight: '1px solid var(--line)' } }, tools, cv, info),
      h('div', { style: { padding: '6px 14px' } }, ctl)),
    h('footer', {}, h('button', { class: 'btn ghost', onclick: () => m.remove() }, 'Cancel'), h('button', { class: 'btn go', onclick: () => finish() }, 'Make frames'))));
  document.body.append(m);

  function compute() {
    keyed = st.key ? keyBackground(im, st.tol) : cloneImg(im);
    for (let p = 0; p < erased.length; p++) if (erased[p]) keyed.data[p * 4 + 3] = 0;     // what you erased stays erased
    if (st.mode === 'grid') {
      // the grid: offset (gX, gY), cell size (gW, gH) and gap; until you size it by hand it fills the sheet evenly
      if (!st.gManual) { st.gX = 0; st.gY = 0; st.gapX = st.gapY = 0; st.gW = Math.floor(im.width / st.cols); st.gH = Math.floor(im.height / st.rows); }
      rows = Array.from({ length: st.rows }, (_, r) => Array.from({ length: st.cols }, (_, c) => {
        const x = Math.round(st.gX + c * (st.gW + st.gapX)), y = Math.round(st.gY + r * (st.gH + st.gapY));
        const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(im.width, x + st.gW), y1 = Math.min(im.height, y + st.gH);
        return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
      }).filter(Boolean)).filter(r => r.length);
    } else if (st.mode === 'bands' && A.bands) {
      rows = A.bands.map(b => Array.from({ length: A.cols }, (_, c) => {
        const x = Math.round(A.x0 + c * A.pitch), x1 = Math.min(im.width, Math.round(A.x0 + (c + 1) * A.pitch));
        return { x, y: b.a, w: x1 - x, h: b.b - b.a };
      }).filter(b => b.w > 0));
    } else if (st.mode === 'custom') rows = custom || [];
    else rows = components(keyed, st.gap, st.minFrac);
    // empty cells (the end of a short last row) are not frames
    if (st.mode !== 'custom') rows = rows.map(r => r.filter(b => bbox(crop(keyed, b.x, b.y, b.w, b.h)))).filter(r => r.length);
    else custom = rows;
    tangle = st.untangle && st.mode !== 'auto' ? untangle(keyed, rows.flat()) : null;
    draw();
  }
  const full = document.createElement('canvas');
  function draw() {
    full.width = im.width; full.height = im.height;
    const x = full.getContext('2d');
    x.putImageData(keyed, 0, 0);
    x.lineWidth = Math.max(1, Math.round(im.width / 500));
    const colors = ['#ff5b2e', '#9cc76b', '#e3b04b', '#6fb3d9', '#d97ab3'];
    const hs = handle();
    rows.forEach((r, ri) => r.forEach((b, i) => {
      x.strokeStyle = colors[ri % colors.length]; x.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
      if (b === hot) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(b.x, b.y, b.w, b.h); }
      x.fillStyle = colors[ri % colors.length]; x.fillRect(b.x + b.w - hs, b.y + b.h - hs, hs, hs);     // resize handle
      x.fillStyle = colors[ri % colors.length]; x.font = `${Math.max(10, Math.round(im.width / 90))}px monospace`; x.fillText(`${ri + 1}.${i + 1}`, b.x + 3, b.y + 14);
    }));
    if (tangle) {
      // show what moved: art that sits in one box but belongs to another is tinted, seams drawn in white
      const all = rows.flat(), o = x.getImageData(0, 0, im.width, im.height), d = o.data;
      for (let p = 0; p < tangle.owner.length; p++) {
        const c = tangle.owner[p]; if (c < 0) continue;
        const px = p % im.width, py = (p / im.width) | 0, b = all[c];
        if (!(px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h)) { d[p * 4] = (d[p * 4] + 255) >> 1; d[p * 4 + 1] = d[p * 4 + 1] >> 1; d[p * 4 + 2] = (d[p * 4 + 2] + 200) >> 1; }
      }
      x.putImageData(o, 0, 0);
      x.fillStyle = '#fff'; for (const sm of tangle.seams) sm.xs.forEach((sx, i) => x.fillRect(sx, sm.y0 + i, 1, 1));
      // putImageData wiped the boxes: draw them again
      rows.forEach((r, ri) => r.forEach(b => { x.strokeStyle = colors[ri % colors.length]; x.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1); }));
    }
    // skipped frames get a red cross
    x.strokeStyle = '#e5534b'; x.lineWidth = Math.max(2, Math.round(im.width / 300));
    for (const b of rows.flat()) if (skip.has(skey(b))) { x.beginPath(); x.moveTo(b.x, b.y); x.lineTo(b.x + b.w, b.y + b.h); x.moveTo(b.x + b.w, b.y); x.lineTo(b.x, b.y + b.h); x.stroke(); }
    // the visible canvas shows the whole sheet, or one frame up close
    cv.width = VW.w; cv.height = VW.h;
    const v = cv.getContext('2d'); v.imageSmoothingEnabled = false; v.drawImage(full, VW.x, VW.y, VW.w, VW.h, 0, 0, VW.w, VW.h);
    if (st.tool === 'erase' && cursor) { v.strokeStyle = '#fff'; v.beginPath(); v.arc(cursor[0] - VW.x, cursor[1] - VW.y, brush, 0, Math.PI * 2); v.stroke(); }
    if (dragRect) { v.strokeStyle = '#e5534b'; v.setLineDash([4, 3]); v.strokeRect(dragRect.x - VW.x + .5, dragRect.y - VW.y + .5, dragRect.w, dragRect.h); v.setLineDash([]); }
    cv.style.width = focus >= 0 ? '100%' : ''; cv.style.imageRendering = focus >= 0 ? 'pixelated' : '';
    drawTools();
    const n = rows.reduce((s, r) => s + r.length, 0) - rows.flat().filter(b => skip.has(skey(b))).length;
    info.textContent = `${im.width}×${im.height} · ${n} frame${n === 1 ? '' : 's'} in ${rows.length} row${rows.length === 1 ? '' : 's'}`
      + (st.mode === A.mode ? ` · found ${A.why}` : '') + (pixelArt ? ` · already pixel art${st.unscale > 1 ? `, blown up ${st.unscale}×` : ''}` : '');
  }
  /* ---- moving the grid / boxes by hand ---- */
  let hot = null, act = null;
  const handle = () => Math.max(6, Math.round(im.width / 120));
  const at = e => { const r = cv.getBoundingClientRect(); return [VW.x + (e.clientX - r.left) * VW.w / r.width, VW.y + (e.clientY - r.top) * VW.h / r.height]; };
  /* ---- erase / clear area / undo ---- */
  let cursor = null, dragRect = null, painting = 0, rafT = 0;
  const redraw = () => { if (!rafT) rafT = requestAnimationFrame(() => { rafT = 0; draw(); }); };
  const pushMask = () => { undoMask.push(erased.slice()); if (undoMask.length > (W0 * H0 > 4e6 ? 4 : 12)) undoMask.shift(); };
  function undoErase() { if (!undoMask.length) return toast('Nothing to undo'); erased.set(undoMask.pop()); compute(); }
  function dab(px, py, val) {
    const r = brush, r2 = r * r;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H0 - 1, py + r); y++) for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W0 - 1, px + r); x++) {
      if ((x - px) ** 2 + (y - py) ** 2 > r2) continue;
      const p = y * W0 + x; erased[p] = val; if (val) keyed.data[p * 4 + 3] = 0;
    }
  }
  function clearRect(R, val = 1) {
    for (let y = Math.max(0, R.y); y < Math.min(H0, R.y + R.h); y++) for (let x = Math.max(0, R.x); x < Math.min(W0, R.x + R.w); x++) { erased[y * W0 + x] = val; if (val) keyed.data[(y * W0 + x) * 4 + 3] = 0; }
  }
  // capture phase: when a cleaning tool is active it takes the mouse before the arrange handlers
  cv.addEventListener('pointerdown', e => {
    if (st.tool === 'arrange' || !st.tool) return;
    e.stopImmediatePropagation(); e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const p = at(e).map(Math.round);
    if (st.tool === 'erase') { pushMask(); painting = e.button === 2 ? 0 : 1; dab(p[0], p[1], painting); painting === 1 ? redraw() : null; painting = painting === 1 ? 1 : -1; }
    else { pushMask(); dragRect = { x0: p[0], y0: p[1], x: p[0], y: p[1], w: 0, h: 0, val: e.button === 2 ? 0 : 1 }; }
  }, true);
  cv.addEventListener('pointermove', e => {
    if (st.tool === 'arrange' || !st.tool) return;
    e.stopImmediatePropagation();
    const p = at(e).map(Math.round); cursor = p;
    if (painting) dab(p[0], p[1], painting > 0 ? 1 : 0);
    if (dragRect) Object.assign(dragRect, { x: Math.min(dragRect.x0, p[0]), y: Math.min(dragRect.y0, p[1]), w: Math.abs(p[0] - dragRect.x0), h: Math.abs(p[1] - dragRect.y0) });
    redraw();
  }, true);
  cv.addEventListener('pointerup', e => {
    if (st.tool === 'arrange' || !st.tool) return;
    e.stopImmediatePropagation();
    if (dragRect) { clearRect(dragRect, dragRect.val); dragRect = null; }
    const restored = painting < 0 || (dragRect && !dragRect.val); painting = 0;
    compute();          // re-cut with the cleaned sheet (and bring restored pixels back from the original)
  }, true);
  cv.addEventListener('pointerleave', () => { cursor = null; if (st.tool !== 'arrange') redraw(); });
  cv.addEventListener('contextmenu', e => { if (st.tool !== 'arrange') { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  /* ---- one frame at a time ---- */
  function focusOn(i) {
    const all = rows.flat(); if (!all.length) return;
    focus = ((i % all.length) + all.length) % all.length;
    const b = all[focus], mx = Math.round(b.w * .12), my = Math.round(b.h * .12);
    VW = { x: Math.max(0, b.x - mx), y: Math.max(0, b.y - my), w: Math.min(W0, b.x + b.w + mx) - Math.max(0, b.x - mx), h: Math.min(H0, b.y + b.h + my) - Math.max(0, b.y - my) };
    draw();
  }
  function wholeSheet() { focus = -1; VW = { x: 0, y: 0, w: W0, h: H0 }; draw(); }
  cv.addEventListener('dblclick', e => { if (st.tool && st.tool !== 'arrange') return; const hh = hit(at(e)); if (hh) focusOn(rows.flat().indexOf(hh.b)); });
  function drawTools() {
    const b = focus >= 0 ? rows.flat()[focus] : null;
    tools.replaceChildren(...[
      seg([['arrange', 'Arrange'], ['erase', 'Erase'], ['clear', 'Clear area']], st.tool || 'arrange', v => { st.tool = v; draw(); }),
      st.tool === 'erase' ? h('span', { class: 'rngw', title: 'Brush size (px of the sheet)' }, range(brush, 1, Math.max(8, Math.round(Math.max(W0, H0) / 20)), 1, v => { brush = v; })) : null,
      h('button', { class: 'btn sm ghost', title: 'Undo the last erase or clear (Ctrl+Z)', onclick: undoErase, disabled: !undoMask.length }, 'Undo'),
      h('span', { class: 'grow' }),
      b ? [h('button', { class: 'btn sm ghost', title: 'Previous frame (,)', onclick: () => focusOn(focus - 1) }, '◀'),
        h('span', { class: 'mono dim', style: { fontSize: '11px' } }, `frame ${focus + 1}/${rows.flat().length}`),
        h('button', { class: 'btn sm ghost', title: 'Next frame (.)', onclick: () => focusOn(focus + 1) }, '▶'),
        h('button', { class: 'btn sm ghost', title: 'Erase everything in this frame\'s box', onclick: () => { pushMask(); clearRect(b); compute(); } }, 'Clear frame'),
        h('button', { class: 'btn sm' + (skip.has(skey(b)) ? ' go' : ' ghost'), title: 'Leave this frame out of the result', onclick: () => { const k = skey(b); skip.has(k) ? skip.delete(k) : skip.add(k); draw(); } }, skip.has(skey(b)) ? 'Skipped' : 'Skip frame'),
        h('button', { class: 'btn sm', title: 'Back to the whole sheet (Esc)', onclick: wholeSheet }, 'Whole sheet')]
        : h('span', { class: 'faint', style: { fontSize: '11px' } }, 'Double-click a frame to work on it up close')].flat().filter(Boolean));
  }
  m.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoErase(); }
    else if (e.key === 'Escape' && focus >= 0) { e.preventDefault(); e.stopPropagation(); wholeSheet(); }
    else if (focus >= 0 && (e.key === ',' || e.key === '.')) focusOn(focus + (e.key === '.' ? 1 : -1));
    else if (!e.ctrlKey && !e.altKey && ['a', 'e', 'c'].includes(e.key.toLowerCase())) { st.tool = { a: 'arrange', e: 'erase', c: 'clear' }[e.key.toLowerCase()]; draw(); }
  });
  const hit = ([px, py]) => {
    const all = rows.flat(); const hs = handle() * 1.6;
    for (let i = all.length - 1; i >= 0; i--) { const b = all[i]; if (px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h) return { b, corner: px > b.x + b.w - hs && py > b.y + b.h - hs }; }
    return null;
  };
  cv.style.cursor = 'crosshair'; cv.style.touchAction = 'none';
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const hh = hit(at(e)); if (!hh) return;
    if (st.mode === 'grid') { const k = skey(hh.b); skip.has(k) ? skip.delete(k) : skip.add(k); draw(); return; }     // grid: right click skips a frame
    rows = rows.map(r => r.filter(b => b !== hh.b)).filter(r => r.length); hot = null; draw();     // right click removes a box
  });
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const p = at(e), hh = hit(p);
    if (st.mode === 'grid') { st.gManual = true; act = { kind: hh?.corner ? 'cell' : 'grid', p0: p, g: { x: st.gX, y: st.gY, w: st.gW, h: st.gH } }; return; }
    if (hh) act = { kind: hh.corner ? 'size' : 'move', b: hh.b, p0: p, o: { ...hh.b } };
    else { const b = { x: Math.round(p[0]), y: Math.round(p[1]), w: 1, h: 1 }; addBox(b); act = { kind: 'size', b, p0: p, o: { ...b } }; }   // drag on empty space draws a new box
  });
  cv.addEventListener('pointermove', e => {
    const p = at(e);
    if (!act) { const hh = hit(p); cv.style.cursor = hh ? (hh.corner ? 'nwse-resize' : 'move') : st.mode === 'grid' ? 'move' : 'crosshair'; if (hh?.b !== hot) { hot = hh?.b || null; draw(); } return; }
    const dx = Math.round(p[0] - act.p0[0]), dy = Math.round(p[1] - act.p0[1]);
    if (act.kind === 'grid') { st.gX = act.g.x + dx; st.gY = act.g.y + dy; compute(); syncGrid(); }
    else if (act.kind === 'cell') { st.gW = Math.max(4, act.g.w + dx); st.gH = Math.max(4, act.g.h + dy); compute(); syncGrid(); }
    else if (act.kind === 'move') { act.b.x = act.o.x + dx; act.b.y = act.o.y + dy; draw(); }
    else { act.b.w = Math.max(2, act.o.w + dx); act.b.h = Math.max(2, act.o.h + dy); draw(); }
  });
  const end = () => { if (act && act.kind === 'size' && act.b.w < 4 && act.b.h < 4) { rows = rows.map(r => r.filter(b => b !== act.b)).filter(r => r.length); draw(); } act = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  function addBox(b) {
    const r = rows.find(r => r.some(o => b.y < o.y + o.h * .6 && o.y < b.y + 10));
    if (r) r.push(b); else { rows.push([b]); rows.sort((p, q) => p[0].y - q[0].y); }
    draw();
  }
  // arrow keys nudge the grid (or the box under the mouse); Shift moves 8
  m.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select') || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const d = e.shiftKey ? 8 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    if (st.mode === 'grid') { st.gManual = true; st.gX += dx; st.gY += dy; compute(); syncGrid(); }
    else if (hot) { hot.x += dx; hot.y += dy; draw(); }
  });
  m.tabIndex = -1; setTimeout(() => m.focus(), 50);
  const num = (k, lbl, title) => { const i = h('input', { type: 'number', value: Math.round(st[k] || 0), style: { width: '64px' }, title, oninput: () => { st.gManual = true; st[k] = +i.value || 0; compute(); } }); i.dataset.k = k; return field(lbl, i); };
  function syncGrid() { ctl.querySelectorAll('input[data-k]').forEach(i => { if (document.activeElement !== i) i.value = Math.round(st[i.dataset.k]); }); }
  function drawCtl() {
    ctl.replaceChildren(
      h('div', { class: 'sec', style: { padding: '8px 0' } }, h('h3', {}, 'Find frames'),
        field('How', seg([...(A.bands ? [['bands', 'Rows found']] : []), ['auto', 'Find figures'], ['grid', 'Even grid'], ['custom', 'Custom']], st.mode, v => {
          // Custom starts from the boxes you see now and keeps them: nothing is re-found, you place every box
          if (v === 'custom') custom = rows.map(r => r.map(b => ({ ...b })));
          st.mode = v; drawCtl(); compute();
        }), { bands: 'Rows of evenly spaced poses, found in the sheet; empty spots are left out', auto: 'Each separate figure is a frame; Join gaps glues capes and weapons to their body',
          grid: 'Cut the sheet into equal cells; drag the grid to line it up, right-click a cell to skip it', custom: 'Your own boxes: drag to move, corner square to size, drag on empty space to add, right-click to remove' }[st.mode] || ''),
        st.mode === 'custom' ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0' } },
          h('button', { class: 'btn sm', title: 'Make every box the size of the box under the mouse / the first box', onclick: () => { const all = rows.flat(), ref = hot || all[0]; if (!ref) return; for (const b of all) { b.w = ref.w; b.h = ref.h; } draw(); } }, 'Same size for all'),
          h('button', { class: 'btn sm', title: 'Line every row up: same top edge within a row', onclick: () => { for (const r of rows) { const y = Math.min(...r.map(b => b.y)); for (const b of r) b.y = y; } draw(); } }, 'Align rows'),
          h('button', { class: 'btn sm ghost', title: 'Remove every box and start drawing from scratch', onclick: () => { rows.length = 0; custom = rows; draw(); } }, 'Clear boxes')) : null,
        st.mode === 'grid' ? [field('Columns', range(st.cols, 1, 32, 1, v => { st.cols = v; compute(); })), field('Rows', range(st.rows, 1, 16, 1, v => { st.rows = v; compute(); })),
          h('div', { class: 'gridnums' }, num('gX', 'Left', 'Where the first cell starts (px). Or drag the grid'), num('gY', 'Top', 'Where the first row starts (px)'),
            num('gW', 'Cell W', 'Cell width (px). Or drag a corner handle'), num('gH', 'Cell H', 'Cell height (px)'),
            num('gapX', 'Gap X', 'Space between columns (px)'), num('gapY', 'Gap Y', 'Space between rows (px)')),
          h('button', { class: 'btn sm ghost', title: 'Back to an even grid over the whole sheet', onclick: () => { st.gManual = false; compute(); drawCtl(); } }, 'Fit to sheet'),
          h('p', { class: 'note' }, 'Drag the sheet to move the grid, drag a corner square to size the cells, arrows nudge (Shift: 8 px).')]
          : [field('Join gaps', range(st.gap, 0, 40, 1, v => { st.gap = v; compute(); }), 'Bigger joins loose capes and weapons to their body'),
          field('Ignore specks', range(st.minFrac, 0, .5, .01, v => { st.minFrac = v; compute(); }, v => Math.round(v * 100) + '%')),
          h('p', { class: 'note' }, 'Drag a box to move it, its corner square to size it, drag on empty space to draw a new one, right-click to remove. Changing a slider above finds the frames again.')],
        st.mode !== 'auto' ? field('Untangle', check('touching frames', st.untangle, v => { st.untangle = v; compute(); }), 'Pieces poking into the next box go back to their own frame; joined poses are split along the emptiest seam (tinted = moved, white = seam)') : null,
        field('Background', check('remove', st.key, v => { st.key = v; compute(); })),
        st.key ? field('Tolerance', range(st.tol, 4, 120, 1, v => { st.tol = v; compute(); })) : null,
        field('Rows are', seg([[true, 'Separate anims'], [false, 'One anim']], st.rowsAsAnims, v => { st.rowsAsAnims = v; }))),
      h('div', { class: 'sec', style: { padding: '8px 0' } }, h('h3', {}, 'Pixels'),
        check('Convert to pixel art', st.pixel, v => { st.pixel = v; drawCtl(); }),
        st.pixel ? [field('Height', range(st.th, 16, 192, 1, v => { st.th = v; }), 'Frame height in game pixels; width follows'),
          field('Hardware', seg(Object.entries(HARDWARE).map(([k, H]) => [k, H.name.replace('Master System', 'SMS')]), st.hw, v => { st.hw = v; st.count = Math.min(st.count, HARDWARE[v].sprite); drawCtl(); })),
          field('Colours', range(Math.min(st.count, HARDWARE[st.hw].sprite), 2, HARDWARE[st.hw].sprite, 1, v => { st.count = v; }))]
          : [h('p', { class: 'note' }, 'Frames keep their exact pixels. Use this for sheets that already are pixel art.'),
            ps.k > 1 ? check(`Shrink back to 1× (sheet is blown up ${ps.k}×)`, st.unscale > 1, v => { st.unscale = v ? ps.k : 1; }) : null]),
      h('div', { class: 'sec', style: { padding: '8px 0', borderBottom: 0 } }, h('h3', {}, 'Name'),
        h('input', { type: 'text', value: st.name, oninput: e => st.name = e.target.value }),
        field('Speed', range(st.fps, 2, 24, 1, v => st.fps = v, v => v + ' fps'))));
  }
  function finish() {
    rows = rows.map(r => r.filter(b => !skip.has(skey(b)))).filter(r => r.length);
    const k = !st.pixel && st.unscale > 1 ? st.unscale : 1;
    if (k > 1) {   // line boxes up with the blown-up pixel grid so each k×k block is one pixel
      const sn = v => ps.off + Math.floor((v - ps.off) / k) * k;
      rows = rows.map(r => r.map(b => { const x = Math.max(0, sn(b.x)), y = Math.max(0, sn(b.y)); return { x, y, w: Math.ceil((b.x + b.w - x) / k) * k, h: Math.ceil((b.y + b.h - y) / k) * k }; }));
    }
    const all = rows.flat();
    if (!all.length) return toast('No frames found. Try the even grid, or lower "Ignore specks"');
    let parts = null, grow = { l: 0, r: 0, t: 0, b: 0 };
    if (st.untangle && st.mode !== 'auto') {
      // each frame = the pixels it owns, which may reach outside its box; every frame grows by the same margins
      // so nothing is clipped and the poses keep their places relative to each other
      const T = untangle(keyed, all), W = keyed.width, own = all.map(() => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 }));
      for (let p = 0; p < T.owner.length; p++) { const c = T.owner[p]; if (c < 0) continue; const x = p % W, y = (p / W) | 0, o = own[c]; if (x < o.x0) o.x0 = x; if (y < o.y0) o.y0 = y; if (x > o.x1) o.x1 = x; if (y > o.y1) o.y1 = y; }
      all.forEach((b, i) => { const o = own[i]; if (o.x1 < 0) return; grow.l = Math.max(grow.l, b.x - o.x0); grow.t = Math.max(grow.t, b.y - o.y0); grow.r = Math.max(grow.r, o.x1 + 1 - b.x - b.w); grow.b = Math.max(grow.b, o.y1 + 1 - b.y - b.h); });
      if (k > 1) for (const s of ['l', 'r', 't', 'b']) grow[s] = Math.ceil(grow[s] / k) * k;
      parts = all.map((b, i) => {
        const fx = b.x - grow.l, fy = b.y - grow.t, fw = b.w + grow.l + grow.r, fh = b.h + grow.t + grow.b, f = newImg(fw, fh);
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          const sx = fx + x, sy = fy + y; if (sx < 0 || sy < 0 || sx >= W || sy >= keyed.height) continue;
          const p = sy * W + sx; if (T.owner[p] !== i) continue;
          const si = p * 4, di = (y * fw + x) * 4; f.data[di] = keyed.data[si]; f.data[di + 1] = keyed.data[si + 1]; f.data[di + 2] = keyed.data[si + 2]; f.data[di + 3] = keyed.data[si + 3];
        }
        return f;
      });
    }
    const mw = Math.max(...all.map(b => b.w)) + grow.l + grow.r, mh = Math.max(...all.map(b => b.h)) + grow.t + grow.b;
    // uniform frames at source scale, feet on the bottom row, centred
    let pi = 0;
    const norm = rows.map(r => r.map(b => {
      const part = parts ? parts[pi++] : crop(keyed, b.x, b.y, b.w, b.h);
      return blit(newImg(mw, mh), part, Math.floor((mw - part.width) / 2), mh - part.height);
    }));
    let out = norm, w = mw, hh = mh, pal = null;
    if (k > 1) {
      w = Math.ceil(mw / k); hh = Math.ceil(mh / k);
      out = norm.map(r => r.map(f => { const o = newImg(w, hh); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const sx = Math.min(f.width - 1, x * k + (k >> 1)), sy = Math.min(f.height - 1, y * k + (k >> 1)); const si = (sy * f.width + sx) * 4, di = (y * w + x) * 4; for (let c = 0; c < 4; c++) o.data[di + c] = f.data[si + c]; } return o; }));
    }
    if (st.pixel) {
      hh = st.th; w = Math.max(4, Math.round(mw * st.th / mh));
      // one palette for every frame so colours don't flicker between frames
      const sheet = newImg(mw * Math.min(all.length, 12), mh);
      norm.flat().slice(0, 12).forEach((f, i) => blit(sheet, f, i * mw, 0));
      pal = buildPalette(sheet, { hw: st.hw, count: st.count });
      out = norm.map(r => r.map(f => pixelize(f, { w, h: hh, hw: st.hw, lock: pal, fit: 'stretch', despeckle: true }).img));
    }
    const anims = st.rowsAsAnims && out.length > 1
      ? out.map((frames, i) => ({ name: A.names?.[i] && A.names.length === out.length ? A.names[i] : `${st.name}_${i + 1}`, frames, fps: st.fps }))
      : [{ name: st.name, frames: out.flat(), fps: st.fps }];
    m.remove();
    opts.onDone?.({ anims, w, h: hh, pal });
  }
  compute();
  if (!pixelArt && Math.max(0, ...rows.flat().map(b => b.h)) > 256) st.pixel = true;   // big painted frames: shrink to sprite size
  drawCtl();
}
// Background from the border: already transparent -> nothing to remove; one flat colour -> remove it
// with a tight tolerance (keeps dark outlines next to a black background); noisy -> looser.
function border(im) {
  const w = im.width, hh = im.height, d = im.data, px = [];
  for (let x = 0; x < w; x += 2) px.push(x * 4, ((hh - 1) * w + x) * 4);
  for (let y = 0; y < hh; y += 2) px.push(y * w * 4, (y * w + w - 1) * 4);
  const clear = px.filter(i => d[i + 3] < 128).length / px.length;
  if (clear > 0.5) return { key: false, tol: 36 };
  const m = new Map(); for (const i of px) { const k = d[i] >> 3 << 10 | d[i + 1] >> 3 << 5 | d[i + 2] >> 3; m.set(k, (m.get(k) || 0) + 1); }
  const top = Math.max(...m.values()) / px.length;
  return { key: true, tol: top > 0.9 ? 14 : 36 };
}
function hasAlpha(im) { for (let i = 3; i < im.data.length; i += 4 * 97) if (im.data[i] < 250) return true; return false; }
