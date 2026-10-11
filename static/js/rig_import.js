// Images into Puppet: a dropped picture is either one whole figure (rigged as it is by rig.js autoRig) or a cut-out
// kit, a sheet of separate body parts (heads, torso, arms, legs, hands, feet, a prop). For a kit this finds the
// pieces on the art's own pixel grid, guesses what each one is, and assembles them into one standing figure with
// a skeleton whose bones own exactly their piece's pixels. The result is an ordinary rig (rig.js format).
import { newImg, cloneImg, blit, keyBackground, detectGrid, snapGrid, bbox, crop } from './core.js';

// what a piece can be; the order is the order of the label buttons in the kit screen
export const KINDS = [['head', 'Head'], ['head2', 'Extra head (swap)'], ['torso', 'Torso'], ['arm', 'Arm (upper, or whole)'], ['forearm', 'Forearm'], ['hand', 'Hand'],
  ['thigh', 'Leg (upper, or whole)'], ['shin', 'Shin'], ['foot', 'Foot'], ['prop', 'Prop (held)'], ['spare', 'Not used']];

/* ------------------------------------------------------------ finding ---- */
// background noise decides the keying tolerance: dark art on black needs a tight one, JPEG noise a looser one
function keyTol(im) {
  const { width: w, height: hh, data: d } = im, ds = [];
  const at = (x, y) => (y * w + x) * 4;
  for (let x = 0; x < w; x += 3) for (const y of [0, 1, hh - 2, hh - 1]) { const i = at(x, y); ds.push(d[i] + d[i + 1] + d[i + 2]); }
  ds.sort((a, b) => a - b);
  const base = ds[ds.length >> 1], noise = Math.abs(ds[Math.floor(ds.length * .95)] - base) / 3;
  return Math.max(8, Math.min(40, Math.round(noise * 2.5 + 6)));
}
// the art's own pixels, background clear
export function nativeOf(src) {
  const hasAlpha = (() => { for (let i = 3; i < src.data.length; i += 4 * 61) if (src.data[i] < 250) return true; return false; })();
  const keyed = hasAlpha ? cloneImg(src) : keyBackground(src, keyTol(src));
  const g = detectGrid(src);
  return g ? snapGrid(keyed, g) : keyed;
}
// separate pieces: pixels up to `gap` apart join (thin strokes break up when shrunk), each with its own pixels
export function findPieces(im, gap = 2) {
  const w = im.width, hh = im.height, N = w * hh, on = new Uint8Array(N);
  for (let p = 0; p < N; p++) on[p] = im.data[p * 4 + 3] >= 128 ? 1 : 0;
  const lab = new Int32Array(N).fill(-1), pieces = [];
  for (let p0 = 0; p0 < N; p0++) {
    if (!on[p0] || lab[p0] >= 0) continue;
    const id = pieces.length, px = [p0]; lab[p0] = id;
    for (let k = 0; k < px.length; k++) {
      const x = px[k] % w, y = (px[k] / w) | 0;
      for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) {
        const X = x + dx, Y = y + dy, q = Y * w + X;
        if (X >= 0 && Y >= 0 && X < w && Y < hh && on[q] && lab[q] < 0) { lab[q] = id; px.push(q); }
      }
    }
    pieces.push(measure(im, px, id));
  }
  return pieces;
}
function measure(im, px, id) {
  const w = im.width;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
  for (const p of px) { const x = p % w, y = (p / w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); sx += x; sy += y; }
  const n = px.length, cx = sx / n, cy = sy / n, img = newImg(x1 - x0 + 1, y1 - y0 + 1);
  const mine = new Set(px), seen = new Set();
  let islands = 0;
  for (const p of px) {
    if (seen.has(p)) continue;
    islands++; const st = [p]; seen.add(p);
    while (st.length) { const q = st.pop(); for (const r of [q - 1, q + 1, q - w, q + w]) if (mine.has(r) && !seen.has(r) && Math.abs((r % w) - (q % w)) <= 1) { seen.add(r); st.push(r); } }
  }
  let a = 0, b = 0, c = 0;
  for (const p of px) {
    const x = p % w, y = (p / w) | 0; a += (x - cx) ** 2; b += (x - cx) * (y - cy); c += (y - cy) ** 2;
    img.data.set(im.data.subarray(p * 4, p * 4 + 4), ((y - y0) * img.width + x - x0) * 4);
  }
  // principal axes: how long and how thick the piece is, whatever way it lies
  a /= n; b /= n; c /= n;
  const t = (a + c) / 2, s = Math.sqrt(((a - c) / 2) ** 2 + b * b), L = 4 * Math.sqrt(t + s), T = 4 * Math.sqrt(Math.max(.25, t - s));
  return { id, x: x0, y: y0, w: img.width, h: img.height, n, cx, cy, img, len: L, thick: T, fill: n / (img.width * img.height), islands, kind: 'spare' };
}

/* ----------------------------------------------------------- guessing ---- */
// Kits are usually laid out like a body: heads up top, the torso, arms beside it, legs below, each limb's pieces
// stacked in a column (thigh over shin over foot). Every guess can be changed in the kit screen.
export function guessKinds(pieces) {
  const big = Math.max(...pieces.map(p => p.n));
  for (const p of pieces) p.kind = 'spare';
  // dust and sparkles: many specks rather than one shape
  const real = pieces.filter(p => p.n >= Math.max(6, big * .02) && !(p.islands >= 4 && p.n / p.islands < 4));
  const torso = real.filter(p => p.fill >= .5 && p.len / p.thick < 2.4).sort((p, q) => q.n - p.n)[0];
  if (!torso) return pieces;
  torso.kind = 'torso';
  // heads: compact pieces about head-sized; the first in reading order is used, the others are spares
  const heads = real.filter(p => p !== torso && p.fill >= .35 && p.len / p.thick < 2.2 && p.n >= torso.n * .4 && p.n <= torso.n * 1.4).sort((p, q) => (p.y - q.y) || (p.x - q.x));
  if (heads[0]) heads[0].kind = 'head';
  for (const p of heads.slice(1)) p.kind = 'head2';      // other views / expressions: heads to swap in (Puppet → Head & mouth)
  // a prop: big and sparse (a pick, a sword on a slant)
  const free = real.filter(p => p !== torso && !heads.includes(p));
  const prop = free.filter(p => p.fill < .3 && p.len > torso.h * .9).sort((p, q) => q.len - p.len)[0];
  if (prop) prop.kind = 'prop';
  // limbs: columns of pieces, each hanging just below the one above it
  const rest = free.filter(p => p !== prop), gap = Math.max(3, torso.h * .3), below = new Map();
  for (const p of rest) {
    const q = rest.filter(q => q !== p && q.y > p.y + p.h * .5 && q.y - (p.y + p.h) <= gap && q.x <= p.x + p.w && p.x <= q.x + q.w).sort((u, v) => u.y - v.y)[0];
    if (q && ![...below.values()].includes(q)) below.set(p, q);
  }
  const tops = rest.filter(p => ![...below.values()].includes(p)), chains = tops.map(p => { const c = [p]; while (below.has(c[c.length - 1]) && c.length < 4) c.push(below.get(c[c.length - 1])); return c; });
  // a chain starting beside the torso is an arm, one starting below it a leg; the last piece, if small, is the hand or foot
  const limbs = chains.filter(c => c.length >= 2 || c[0].len / c[0].thick >= 2.5);
  const arms = pair(limbs.filter(c => c[0].y < torso.y + torso.h * .75)), legs = pair(limbs.filter(c => c[0].y >= torso.y + torso.h * .75));
  const label = (c, upper, lower, end) => c.forEach((p, i) => {
    const last = i === c.length - 1 && i > 0 && (p.n < c[0].n * .6 || p.len / p.thick < 2);
    p.kind = last ? end : i === 0 ? upper : lower;
  });
  arms.forEach(c => label(c, 'arm', 'forearm', 'hand'));
  legs.forEach(c => label(c, 'thigh', 'shin', 'foot'));
  return pieces;
}
// the two chains most alike in size (a left and a right), or the only one
function pair(list) {
  if (list.length <= 2) return list;
  const n = c => c.reduce((s, p) => s + p.n, 0);
  let best = null;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const d = Math.abs(n(list[i]) - n(list[j])) / Math.max(n(list[i]), n(list[j])); if (!best || d < best[0]) best = [d, list[i], list[j]]; }
  return [best[1], best[2]];
}

/* --------------------------------------------------------- assembling ---- */
const rowSpan = (im, y) => { let a = -1, b = -1; for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; } return a < 0 ? null : (a + b) / 2; };
const topX = im => { for (let y = 0; y < Math.min(im.height, 3); y++) { const c = rowSpan(im, y); if (c != null) return c; } return im.width / 2; };
const botX = im => { for (let y = im.height - 1; y >= Math.max(0, im.height - 3); y--) { const c = rowSpan(im, y); if (c != null) return c; } return im.width / 2; };
// cut a whole limb in two at its middle row (shoulder→elbow, elbow→hand)
const halves = im => { const m = Math.round(im.height / 2); return [crop(im, 0, 0, im.width, m), crop(im, 0, m, im.width, im.height - m)]; };
const byX = list => list.slice().sort((p, q) => p.cx - q.cx);
const side = (list, front) => { const s = byX(list); return s.length ? (front ? s[s.length - 1] : s[0]) : null; };

// pieces with kinds → { im (the standing figure, w × h), rig: { w, h, bones, parts } } in rig.js terms, facing right.
// Each limb is a chain hung from its joint: the next piece's top-middle meets the previous piece's bottom-middle.
export function assemble(pieces, W0 = 0, H0 = 0) {
  const K = k => pieces.filter(p => p.kind === k), torso = K('torso')[0];
  if (!torso) return { err: 'Mark one piece as the torso' };
  const head = K('head')[0], placed = [];       // { img, x, y, bone }
  const T = torso.img, tw = T.width, th = T.height;
  // hip at (0, 0): the torso stands on it, the head sits on the torso (a little overlap for the neck)
  placed.push({ img: T, x: -Math.round(tw / 2), y: -th, bone: 'torso' });
  const neckY = -th + 1;
  let headTop = -th;
  if (head) { const H = head.img; placed.push({ img: H, x: -Math.round(botX(H)), y: neckY - H.height + Math.max(1, Math.round(H.height * .06)), bone: 'head' }); headTop = neckY - H.height; }
  // a chain of pieces (upper, lower, end) hung from a joint; returns the joints [top, mid, end, bottom]
  const chain = (parts, jx, jy, names) => {
    const joints = [[jx, jy]];
    let x = jx, y = jy;
    parts.forEach((im, i) => {
      if (!im) return;
      const px = Math.round(x - topX(im)), py = y - (i ? 1 : 0);
      placed.push({ img: im, x: px, y: py, bone: names[i] });
      x = px + botX(im); y = py + im.height;
      joints.push([Math.round(x), y]);
    });
    return joints;
  };
  const limb = (upperK, lowerK, endK, front) => {
    const up = side(K(upperK), front), lo = side(K(lowerK), front), end = side(K(endK), front);
    if (!up) return null;
    let [a, b] = lo ? [up.img, lo.img] : halves(up.img);
    return { a, b, end: end?.img || null };
  };
  const bones = [], joint = {};
  const shoulderY = -th + Math.max(1, Math.round(th * .1));
  for (const front of [false, true]) {
    const s = front ? 'front' : 'back', arm = limb('arm', 'forearm', 'hand', front), leg = limb('thigh', 'shin', 'foot', front);
    if (arm) {
      // a front-view torso (wide) has the arms just outside its edges; a side view has them over the body
      const ax = Math.round((front ? 1 : -1) * (tw > th * .65 ? tw / 2 + arm.a.width / 2 - 1 : Math.max(1, tw / 2 - arm.a.width / 2 - 1)));
      const j = chain([arm.a, arm.b, arm.end], ax, shoulderY, [`arm_${s}`, `hand_${s}`, `hand_${s}`]);
      joint[`arm_${s}`] = [j[0], j[1]]; joint[`hand_${s}`] = [j[1], j[j.length - 1]];
    }
    if (leg) {
      const lx = Math.round((front ? 1 : -1) * tw * .2);
      const j = chain([leg.a, leg.b, leg.end], lx, 0, [`leg_${s}`, `shin_${s}`, `shin_${s}`]);
      joint[`leg_${s}`] = [j[0], j[1]]; joint[`shin_${s}`] = [j[1], j[j.length - 1]];
    }
  }
  // a prop: held at its lowest point in the front hand
  const prop = K('prop')[0], hf = joint.hand_front || joint.hand_back;
  if (prop && hf) {
    const P = prop.img, by = P.height - 1, gx = rowSpan(P, by) ?? P.width / 2, [hx, hy] = [hf[1][0], hf[1][1] - 2];
    placed.push({ img: P, x: Math.round(hx - gx), y: hy - by, bone: 'prop' });
    let far = [gx, by], fd = 0; for (let y = 0; y < P.height; y++) for (let x = 0; x < P.width; x++) if (P.data[(y * P.width + x) * 4 + 3] >= 128) { const d = Math.hypot(x - gx, y - by); if (d > fd) { fd = d; far = [x, y]; } }
    joint.prop = [[hx, hy], [Math.round(hx - gx + far[0]), hy - by + far[1]]];
  }
  joint.hip = [[0, -1], [0, -Math.max(2, Math.round(th * .15))]];
  joint.torso = [[0, -1], [0, neckY]];
  if (head) joint.head = [[0, neckY], [0, headTop]];
  // the frame: everything, feet on the bottom row, centred; at least W0 × H0 (the actor's frame)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of placed) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.img.width); y1 = Math.max(y1, q.y + q.img.height); }
  const fw = x1 - x0, fh = y1 - y0, W = Math.max(W0, fw + 2), H = Math.max(H0, fh);
  const ox = Math.floor((W - fw) / 2) - x0, oy = H - fh - y0;
  // bones in the rig's order: parents first; z = drawing order (back limbs behind the body, front ones in front)
  const SPEC = [['hip', null, 3], ['torso', 'hip', 4], ['head', 'torso', 6], ['arm_back', 'torso', 1], ['hand_back', 'arm_back', 0],
    ['leg_back', 'hip', 2], ['shin_back', 'leg_back', 2], ['leg_front', 'hip', 5], ['shin_front', 'leg_front', 5],
    ['arm_front', 'torso', 7], ['hand_front', 'arm_front', 9], ['prop', joint.hand_front ? 'hand_front' : 'hand_back', 8]];
  const used = SPEC.filter(([n]) => joint[n]);
  for (const [n, par, z] of used) {
    const [[x, y], [tx, ty]] = joint[n];
    bones.push({ id: bones.length, name: n, parent: par == null ? null : used.findIndex(u => u[0] === par), x: x + ox, y: y + oy, tx: tx + ox, ty: ty + oy, z });
  }
  // paint back to front: each pixel belongs to the bone of the piece drawn on it last
  const im = newImg(W, H), parts = new Uint8Array(W * H), zOf = n => bones.find(b => b.name === n)?.z ?? 4;
  for (const q of placed.slice().sort((p, r) => zOf(p.bone) - zOf(r.bone))) {
    const bi = bones.findIndex(b => b.name === q.bone) + 1, X = q.x + ox, Y = q.y + oy;
    for (let y = 0; y < q.img.height; y++) for (let x = 0; x < q.img.width; x++) {
      const s = (y * q.img.width + x) * 4, X2 = X + x, Y2 = Y + y;
      if (q.img.data[s + 3] < 128 || X2 < 0 || Y2 < 0 || X2 >= W || Y2 >= H) continue;
      im.data.set(q.img.data.subarray(s, s + 4), (Y2 * W + X2) * 4); parts[Y2 * W + X2] = bi;
    }
  }
  // extra heads: their neck where the drawn head's is (bottom middle, the same small overlap)
  const heads = K('head2').map(p => ({ im: p.img, ax: Math.round(botX(p.img)), ay: p.img.height - Math.max(1, Math.round(p.img.height * .06)) }));
  return { im, rig: { w: W, h: H, bones, parts }, size: [fw, fh], heads };
}

/* ------------------------------------------------------------- reading ---- */
// one picture in: { whole: figure ImageData } for a single drawing, else { native, pieces } for a kit
export function readImage(src) {
  const native = nativeOf(src), pieces = findPieces(native);
  const total = pieces.reduce((s, p) => s + p.n, 0), top = pieces.slice().sort((p, q) => q.n - p.n)[0];
  if (!top) return { err: 'No picture found (is it all background?)' };
  if (top.n >= total * .8) { const b = bbox(native); return { whole: crop(native, b.x, b.y, b.w, b.h) }; }
  guessKinds(pieces);
  return { native, pieces };
}
// a whole figure into a frame of at least W0 × H0, feet on the bottom row
export function standIn(fig, W0, H0) {
  const W = Math.max(W0, fig.width + 2), H = Math.max(H0, fig.height), o = newImg(W, H);
  return blit(o, fig, Math.floor((W - fig.width) / 2), H - fig.height);
}
// mostly dark art (a miner in a mine) disappears on Kiln's dark checker: screens show it on a lighter one
export function darkArt(im) {
  let sum = 0, n = 0;
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) { sum += im.data[i] * .3 + im.data[i + 1] * .59 + im.data[i + 2] * .11; n++; }
  return n > 0 && sum / n < 70;
}
