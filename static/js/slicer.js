// Sheet slicer: cut a sprite sheet (grid or loose poses) into uniform, baseline-aligned frames.
import { h, $, toast, field, range, seg, check, imgData, keyBackground, crop, blit, newImg, toCanvas, pixelize, buildPalette, HARDWARE, clamp } from './core.js';

function components(im, gap, minFrac) {
  const w = im.width, hh = im.height, a = im.data;
  const lab = new Int32Array(w * hh).fill(-1), boxes = [];
  for (let p = 0; p < w * hh; p++) {
    if (lab[p] >= 0 || a[p * 4 + 3] < 128) continue;
    const id = boxes.length, b = { x0: w, y0: hh, x1: 0, y1: 0, n: 0 };
    const st = [p]; lab[p] = id;
    while (st.length) {
      const q = st.pop(), x = q % w, y = (q / w) | 0;
      b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= hh) continue;
        const r = ny * w + nx; if (lab[r] < 0 && a[r * 4 + 3] >= 128) { lab[r] = id; st.push(r); }
      }
    }
    boxes.push(b);
  }
  // merge boxes closer than `gap` (capes, swords and loose bits belong to their body)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (A.x0 - gap <= B.x1 && B.x0 - gap <= A.x1 && A.y0 - gap <= B.y1 && B.y0 - gap <= A.y1) {
        A.x0 = Math.min(A.x0, B.x0); A.y0 = Math.min(A.y0, B.y0); A.x1 = Math.max(A.x1, B.x1); A.y1 = Math.max(A.y1, B.y1); A.n += B.n;
        boxes.splice(j, 1); merged = true; break;
      }
    }
  }
  const maxN = Math.max(0, ...boxes.map(b => b.n));
  const keep = boxes.filter(b => b.n >= maxN * minFrac).map(b => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }));
  // reading order: rows by vertical overlap, then left to right
  keep.sort((p, q) => p.y - q.y);
  const rows = [];
  for (const b of keep) {
    const r = rows.find(r => b.y < r.y + r.h * 0.6 && r.y < b.y + b.h * 0.6);
    if (r) { r.items.push(b); r.y = Math.min(r.y, b.y); r.h = Math.max(r.h, b.h); } else rows.push({ y: b.y, h: b.h, items: [b] });
  }
  return rows.map(r => r.items.sort((p, q) => p.x - q.x));
}

/* opts.onDone({anims:[{name, frames}], w, h, pal}) ; opts.target {w,h,hw,count} */
export async function openSlicer(src, opts = {}) {
  let im;
  try { im = await imgData(src); } catch { return toast('Could not open that image', 'bad'); }
  const guessStrip = im.width > im.height * 1.8 && im.width % im.height === 0;
  const st = {
    mode: guessStrip ? 'grid' : 'auto', cols: guessStrip ? im.width / im.height : 4, rows: 1, key: !hasAlpha(im), tol: 36, gap: Math.round(Math.max(im.width, im.height) / 120), minFrac: 0.08,
    rowsAsAnims: true, pixel: im.width > 600 || !!opts.target, th: opts.target?.h || 64, hw: opts.target?.hw || 'snes', count: opts.target?.count || 15, name: opts.name || 'imported', fps: 8,
  };
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
    } else rows = components(keyed, st.gap, st.minFrac);
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
    info.textContent = `${im.width}×${im.height} · ${n} frame${n === 1 ? '' : 's'} in ${rows.length} row${rows.length === 1 ? '' : 's'}`;
  }
  function drawCtl() {
    ctl.replaceChildren(
      h('div', { class: 'sec', style: { padding: '8px 0' } }, h('h3', {}, 'Find frames'),
        field('How', seg([['auto', 'Find figures'], ['grid', 'Even grid']], st.mode, v => { st.mode = v; drawCtl(); compute(); })),
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
          : h('p', { class: 'note' }, 'Frames keep their exact pixels. Use this for sheets that already are pixel art.')),
      h('div', { class: 'sec', style: { padding: '8px 0', borderBottom: 0 } }, h('h3', {}, 'Name'),
        h('input', { type: 'text', value: st.name, oninput: e => st.name = e.target.value }),
        field('Speed', range(st.fps, 2, 24, 1, v => st.fps = v, v => v + ' fps'))));
  }
  function finish() {
    const all = rows.flat();
    if (!all.length) return toast('No frames found. Try the even grid, or lower "Ignore specks"');
    const mw = Math.max(...all.map(b => b.w)), mh = Math.max(...all.map(b => b.h));
    // uniform frames at source scale, feet on the bottom row, centred
    const norm = rows.map(r => r.map(b => {
      const part = crop(keyed, b.x, b.y, b.w, b.h);
      return blit(newImg(mw, mh), part, Math.floor((mw - b.w) / 2), mh - b.h);
    }));
    let out = norm, w = mw, hh = mh, pal = null;
    if (st.pixel) {
      hh = st.th; w = Math.max(4, Math.round(mw * st.th / mh));
      // one palette for every frame so colours don't flicker between frames
      const sheet = newImg(mw * Math.min(all.length, 12), mh);
      norm.flat().slice(0, 12).forEach((f, i) => blit(sheet, f, i * mw, 0));
      pal = buildPalette(sheet, { hw: st.hw, count: st.count });
      out = norm.map(r => r.map(f => pixelize(f, { w, h: hh, hw: st.hw, lock: pal, fit: 'stretch', despeckle: true }).img));
    }
    const anims = st.rowsAsAnims && out.length > 1
      ? out.map((frames, i) => ({ name: `${st.name}_${i + 1}`, frames, fps: st.fps }))
      : [{ name: st.name, frames: out.flat(), fps: st.fps }];
    m.remove();
    opts.onDone?.({ anims, w, h: hh, pal });
  }
  drawCtl(); compute();
}
function hasAlpha(im) { for (let i = 3; i < im.data.length; i += 4 * 97) if (im.data[i] < 250) return true; return false; }
