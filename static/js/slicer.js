// Sheet slicer: cut a sprite sheet (grid or loose poses) into uniform, baseline-aligned frames.
import { h, $, toast, field, range, seg, check, imgData, keyBackground, crop, blit, newImg, toCanvas, pixelize, buildPalette, HARDWARE, clamp, bbox } from './core.js';

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
  try { im = await imgData(src); } catch { return toast('Could not open that image', 'bad'); }
  const ps = pixelScale(im), pixelArt = ps.k >= 2 || fewColours(im), bg = border(im);
  const st = {
    mode: 'auto', cols: 4, rows: 1, key: bg.key, tol: bg.tol, gap: Math.round(Math.max(im.width, im.height) / 120), minFrac: 0.08,
    rowsAsAnims: true, pixel: false, unscale: ps.k, th: opts.target?.h || 64, hw: opts.target?.hw || 'snes', count: opts.target?.count || 15, name: opts.name || 'imported', fps: 8,
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
  let rows = [], keyed = im;
  const cv = h('canvas', { style: { maxWidth: '100%', maxHeight: '58vh', background: 'repeating-conic-gradient(#2a2a28 0 25%, #33322f 0 50%) 0 0/16px 16px' } });
  const info = h('div', { class: 'note' });
  const ctl = h('div');
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(1200px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Cut a sheet into frames'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 300px' } },
      h('div', { style: { padding: '14px', display: 'grid', placeItems: 'center', borderRight: '1px solid var(--line)' } }, cv, info),
      h('div', { style: { padding: '6px 14px' } }, ctl)),
    h('footer', {}, h('button', { class: 'btn ghost', onclick: () => m.remove() }, 'Cancel'), h('button', { class: 'btn go', onclick: () => finish() }, 'Make frames'))));
  document.body.append(m);

  function compute() {
    keyed = st.key ? keyBackground(im, st.tol) : im;
    if (st.mode === 'grid') {
      const fw = Math.floor(im.width / st.cols), fh = Math.floor(im.height / st.rows);
      rows = Array.from({ length: st.rows }, (_, r) => Array.from({ length: st.cols }, (_, c) => ({ x: c * fw, y: r * fh, w: fw, h: fh })));
    } else if (st.mode === 'bands' && A.bands) {
      rows = A.bands.map(b => Array.from({ length: A.cols }, (_, c) => {
        const x = Math.round(A.x0 + c * A.pitch), x1 = Math.min(im.width, Math.round(A.x0 + (c + 1) * A.pitch));
        return { x, y: b.a, w: x1 - x, h: b.b - b.a };
      }).filter(b => b.w > 0));
    } else rows = components(keyed, st.gap, st.minFrac);
    // empty cells (the end of a short last row) are not frames
    rows = rows.map(r => r.filter(b => bbox(crop(keyed, b.x, b.y, b.w, b.h)))).filter(r => r.length);
    draw();
  }
  function draw() {
    cv.width = im.width; cv.height = im.height;
    const x = cv.getContext('2d');
    x.putImageData(keyed, 0, 0);
    x.lineWidth = Math.max(1, Math.round(im.width / 500));
    const colors = ['#ff5b2e', '#9cc76b', '#e3b04b', '#6fb3d9', '#d97ab3'];
    rows.forEach((r, ri) => r.forEach((b, i) => {
      x.strokeStyle = colors[ri % colors.length]; x.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
      x.fillStyle = colors[ri % colors.length]; x.font = `${Math.max(10, Math.round(im.width / 90))}px monospace`; x.fillText(`${ri + 1}.${i + 1}`, b.x + 3, b.y + 14);
    }));
    const n = rows.reduce((s, r) => s + r.length, 0);
    info.textContent = `${im.width}×${im.height} · ${n} frame${n === 1 ? '' : 's'} in ${rows.length} row${rows.length === 1 ? '' : 's'}`
      + (st.mode === A.mode ? ` · found ${A.why}` : '') + (pixelArt ? ` · already pixel art${st.unscale > 1 ? `, blown up ${st.unscale}×` : ''}` : '');
  }
  function drawCtl() {
    ctl.replaceChildren(
      h('div', { class: 'sec', style: { padding: '8px 0' } }, h('h3', {}, 'Find frames'),
        field('How', seg([...(A.bands ? [['bands', 'Rows found']] : []), ['auto', 'Find figures'], ['grid', 'Even grid']], st.mode, v => { st.mode = v; drawCtl(); compute(); })),
        st.mode === 'grid' ? [field('Columns', range(st.cols, 1, 32, 1, v => { st.cols = v; compute(); })), field('Rows', range(st.rows, 1, 16, 1, v => { st.rows = v; compute(); }))]
          : [field('Join gaps', range(st.gap, 0, 40, 1, v => { st.gap = v; compute(); }), 'Bigger joins loose capes and weapons to their body'),
          field('Ignore specks', range(st.minFrac, 0, .5, .01, v => { st.minFrac = v; compute(); }, v => Math.round(v * 100) + '%'))],
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
    const k = !st.pixel && st.unscale > 1 ? st.unscale : 1;
    if (k > 1) {   // line boxes up with the blown-up pixel grid so each k×k block is one pixel
      const sn = v => ps.off + Math.floor((v - ps.off) / k) * k;
      rows = rows.map(r => r.map(b => { const x = Math.max(0, sn(b.x)), y = Math.max(0, sn(b.y)); return { x, y, w: Math.ceil((b.x + b.w - x) / k) * k, h: Math.ceil((b.y + b.h - y) / k) * k }; }));
    }
    const all = rows.flat();
    if (!all.length) return toast('No frames found. Try the even grid, or lower "Ignore specks"');
    const mw = Math.max(...all.map(b => b.w)), mh = Math.max(...all.map(b => b.h));
    // uniform frames at source scale, feet on the bottom row, centred
    const norm = rows.map(r => r.map(b => {
      const part = crop(keyed, b.x, b.y, b.w, b.h);
      return blit(newImg(mw, mh), part, Math.floor((mw - b.w) / 2), mh - b.h);
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
