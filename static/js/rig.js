// Bones for pixel art: a skeleton over one drawing, a pose per frame, and a renderer that rotates parts the way
// pixel artists do (RotSprite-style: EPX ×8 upscale, rotate, sample back down) so limbs stay crisp. Each pixel of the
// drawing belongs to one bone ("parts"); pixels a limb covered on its parent are filled in from the parent's colours so
// moving the limb leaves no hole. Poses are bone angles (degrees, + = clockwise on screen) plus a root move (dx, dy).
//   rig = { w, h, src (data URL), parts (base64, one byte per pixel: bone index + 1), bones: [{ id, name, parent, x, y, tx, ty, z }] }

/* ---------------------------------------------------------------- maths ---- */
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const rotAbout = (x, y, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y]; };
const inv = M => { const d = M[0] * M[3] - M[1] * M[2]; return [M[3] / d, -M[1] / d, -M[2] / d, M[0] / d, (M[2] * M[5] - M[3] * M[4]) / d, (M[1] * M[4] - M[0] * M[5]) / d]; };
export const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

// every bone's transform for a pose: parent first, each bone turning about its own joint
export function transforms(rig, pose = {}) {
  const T = {}, root = pose._root || { dx: 0, dy: 0 };
  const get = b => {
    if (T[b.id]) return T[b.id];
    const own = rotAbout(b.x, b.y, pose[b.id] || 0);
    const par = b.parent != null ? get(rig.bones.find(q => q.id === b.parent)) : [1, 0, 0, 1, root.dx || 0, root.dy || 0];
    return (T[b.id] = mul(par, own));
  };
  rig.bones.forEach(get);
  return T;
}

/* ------------------------------------------------------- the humanoid rig ---- */
// side view, facing right: names the presets know. [name, parent, pivot fraction (x, y of the figure box), tip fraction, z]
const HUMAN = [
  ['hip', null, [.5, .56], [.5, .5], 3], ['torso', 'hip', [.5, .56], [.5, .27], 4], ['head', 'torso', [.5, .22], [.5, .02], 6],
  ['arm_back', 'torso', [.47, .27], [.45, .43], 1], ['hand_back', 'arm_back', [.45, .43], [.47, .58], 0],
  ['leg_back', 'hip', [.45, .56], [.42, .78], 2], ['shin_back', 'leg_back', [.42, .78], [.42, .99], 2],
  ['leg_front', 'hip', [.55, .56], [.58, .78], 5], ['shin_front', 'leg_front', [.58, .78], [.58, .99], 5],
  ['arm_front', 'torso', [.53, .27], [.55, .43], 7], ['hand_front', 'arm_front', [.55, .43], [.57, .58], 8],
];
const bboxOf = im => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] > 127) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
// opaque runs on one row: [[start, end]]
const runsAt = (im, y) => { const out = []; let a = -1; for (let x = 0; x <= im.width; x++) { const on = x < im.width && im.data[(y * im.width + x) * 4 + 3] > 127; if (on && a < 0) a = x; if (!on && a >= 0) { out.push([a, x - 1]); a = -1; } } return out; };

export function autoRig(im) {
  const b = bboxOf(im); if (!b) return null;
  const at = ([fx, fy]) => [Math.round(b.x + fx * b.w), Math.round(b.y + fy * b.h)];
  const bones = HUMAN.map(([name, parent, p, t, z], i) => { const [x, y] = at(p), [tx, ty] = at(t); return { id: i, name, parent: parent == null ? null : HUMAN.findIndex(r => r[0] === parent), x, y, tx, ty, z }; });
  // the legs: two runs of pixels low down tell where they really are
  const low = runsAt(im, Math.min(im.height - 1, Math.round(b.y + b.h * .88))).filter(r => r[1] - r[0] >= 1);
  if (low.length >= 2) {
    const [l, r] = [low[0], low[low.length - 1]], lc = (l[0] + l[1]) / 2, rc = (r[0] + r[1]) / 2, byName = n => bones.find(q => q.name === n);
    for (const [leg, shin, cx] of [['leg_back', 'shin_back', lc], ['leg_front', 'shin_front', rc]]) {
      const L = byName(leg), S = byName(shin);
      L.x = Math.round((L.x + cx) / 2); L.tx = Math.round(cx); S.x = L.tx; S.tx = Math.round(cx);
    }
  }
  // the arms: at chest height, pixels standing apart on both sides of the body are the arms (a front view, or arms held out)
  const mid = runsAt(im, Math.round(b.y + b.h * .36)).filter(r => r[1] - r[0] >= 0);
  if (mid.length >= 3) {
    const [l, r] = [mid[0], mid[mid.length - 1]], byName = n => bones.find(q => q.name === n), body = mid.slice(1, -1), bl = body[0][0], br = body[body.length - 1][1];
    for (const [arm, hand, run, edge] of [['arm_back', 'hand_back', l, bl], ['arm_front', 'hand_front', r, br]]) {
      const A = byName(arm), H = byName(hand), cx = Math.round((run[0] + run[1]) / 2);
      A.x = edge; A.tx = cx; H.x = cx; H.tx = cx;
    }
  }
  const rig = { w: im.width, h: im.height, bones };
  rig.parts = skin(im, rig);
  return rig;
}

// each opaque pixel goes to the nearest bone, with the body's layout as a guide (heads above the neck, legs below the hips)
export function skin(im, rig) {
  const parts = new Uint8Array(im.width * im.height), B = rig.bones;
  const byName = n => B.find(b => b.name === n), hip = byName('hip'), head = byName('head');
  const segD = (b, x, y) => { const dx = b.tx - b.x, dy = b.ty - b.y, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - b.x) * dx + (y - b.y) * dy) / L)); return Math.hypot(x - b.x - t * dx, y - b.y - t * dy); };
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    if (im.data[(y * im.width + x) * 4 + 3] <= 127) continue;
    let best = -1, bd = 1e9;
    B.forEach((b, i) => {
      if (head && b.name === 'head' && y > head.x * 0 + head.y + 1) return;
      if (hip && /^(leg|shin)/.test(b.name) && y < hip.y - 1) return;
      if (head && /^(arm|hand)/.test(b.name) && y < head.y) return;
      let d = segD(b, x, y); if (b.name === 'torso' || b.name === 'hip') d *= .9;     // the body wins ties
      if (d < bd) { bd = d; best = i; }
    });
    parts[y * im.width + x] = best + 1;
  }
  return parts;
}
export const partsToB64 = p => { let s = ''; for (let i = 0; i < p.length; i += 0x8000) s += String.fromCharCode(...p.subarray(i, i + 0x8000)); return btoa(s); };
export const partsFromB64 = (b, n) => { const s = atob(b || ''), p = new Uint8Array(n); for (let i = 0; i < Math.min(n, s.length); i++) p[i] = s.charCodeAt(i); return p; };

/* ------------------------------------------------------------- rendering ---- */
// EPX / scale2x: doubles pixel art without blurring, used three times for an 8× copy to rotate from
function scale2x(src, w, h) {
  const W = w * 2, out = new Uint32Array(W * h * 2), at = (x, y) => src[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let p1 = P, p2 = P, p3 = P, p4 = P;
    if (C === A && C !== D && A !== B) p1 = A; if (A === B && A !== C && B !== D) p2 = B;
    if (D === C && D !== B && C !== A) p3 = C; if (B === D && B !== A && D !== C) p4 = D;
    const i = y * 2 * W + x * 2; out[i] = p1; out[i + 1] = p2; out[i + W] = p3; out[i + W + 1] = p4;
  }
  return out;
}
// what a renderer needs, made once per drawing: colours ×8, parts, and the "behind the limb" fill for parents
export function prepare(im, rig, parts, fillBehind = true) {
  const w = im.width, h = im.height, px = new Uint32Array(im.data.buffer.slice(0));
  let up = px, uw = w, uh = h; for (let k = 0; k < 3; k++) { up = scale2x(up, uw, uh); uw *= 2; uh *= 2; }
  // under each limb pixel that sits inside its parent's row span, the parent gets that row's nearest colour of its own
  const under = new Uint8Array(w * h), underC = new Uint32Array(w * h);
  if (fillBehind) rig.bones.forEach((b, bi) => {
    if (b.parent == null) return;
    const pi = b.parent + 1;
    for (let y = 0; y < h; y++) {
      let lo = 1e9, hi = -1; for (let x = 0; x < w; x++) if (parts[y * w + x] === pi) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      if (hi < 0) continue;
      for (let x = lo; x <= hi; x++) if (parts[y * w + x] === bi + 1) {
        let c = 0; for (let d = 1; d < w && !c; d++) for (const xx of [x - d, x + d]) if (xx >= 0 && xx < w && parts[y * w + xx] === pi) { c = px[y * w + xx]; break; }
        if (c) { under[y * w + x] = pi; underC[y * w + x] = c; }
      }
    }
  });
  return { w, h, px, up, uw, parts, under, underC };
}
// one posed frame: bones back to front, each pixel pulled from where it came from. W×H may be wider than the drawing
// (a 2-wide frame for a lunge or a fall): the drawing sits centred, feet on the bottom row
export function render(P, rig, pose, W = P.w, H = P.h) {
  const out = new ImageData(W, H), o32 = new Uint32Array(out.data.buffer), T = transforms(rig, pose), ox = Math.floor((W - P.w) / 2), oy = H - P.h;
  const order = rig.bones.map((b, i) => [b, i]).sort((a, c) => a[0].z - c[0].z);
  for (const [b, i] of order) {
    const M = T[b.id], I = inv(M), id = i + 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [sx, sy] = apply(I, x - ox + .5, y - oy + .5), xi = Math.floor(sx), yi = Math.floor(sy);
      if (xi < 0 || yi < 0 || xi >= P.w || yi >= P.h) continue;
      const k = yi * P.w + xi;
      if (P.parts[k] === id) { const c = P.up[Math.min(P.uw * 8 * P.h - 1, Math.floor(sy * 8) * P.uw + Math.floor(sx * 8))]; if (c >>> 24) o32[y * W + x] = c; }
      else if (P.under[k] === id && !o32[y * W + x]) o32[y * W + x] = P.underC[k];
    }
  }
  return out;
}

/* ----------------------------------------------------------- motions ---- */
// a pose for frame t of n; facing: 1 right, -1 left. f = "forward" rotation sign (forward is anticlockwise when facing right)
const S = Math.sin, C = Math.cos, TAU = Math.PI * 2;
export const PRESETS = {
  idle: { n: 6, fps: 6, loop: true, pose: (t, n, f) => { const p = S(t / n * TAU); return { torso: f * 1.5 * p, head: -f * 1 * p, arm_front: -f * 2 * p, arm_back: -f * 2 * p, _root: { dx: 0, dy: p > .5 ? 1 : 0 } }; } },
  walk: { n: 8, fps: 10, loop: true, pose: (t, n, f) => gait(t / n * TAU, f, 24, 28, 18, 1, 3) },
  run: { n: 8, fps: 14, loop: true, pose: (t, n, f) => ({ ...gait(t / n * TAU, f, 38, 55, 34, 2, 10), hand_front: -f * 70, hand_back: -f * 70 }) },
  attack: { n: 6, fps: 12, loop: false, span: 2, pose: (t, n, f) => { const k = [0, 1, .2, -.9, -1, -.3][t] ?? 0; return { arm_front: -f * (k > 0 ? 150 * k : 95 * k), hand_front: -f * (k > 0 ? 30 * k : -15 * k), torso: -f * 8 * k, head: f * 4 * k, leg_front: -f * (k < 0 ? 15 : 0), shin_front: f * (k < 0 ? 15 : 0), _root: { dx: Math.round(-f * 2 * Math.min(0, k)), dy: 0 } }; } },
  jump: { n: 6, fps: 10, loop: false, pose: (t, n, f) => { const k = [[.6, 0], [0, -2], [.3, -6], [.8, -8], [.4, -6], [.7, 0]][t] || [0, 0]; return { leg_front: -f * 45 * k[0], shin_front: f * 80 * k[0], leg_back: -f * 35 * k[0], shin_back: f * 70 * k[0], arm_front: f * 40 * (1 - k[0]), arm_back: f * 30 * (1 - k[0]), torso: -f * 10 * k[0], _root: { dx: 0, dy: Math.round(k[0] * 4 + k[1]) } }; } },
  hurt: { n: 4, fps: 10, loop: false, pose: (t, n, f) => { const k = [1, .8, .4, 0][t] ?? 0; return { torso: f * 16 * k, head: f * 14 * k, arm_front: -f * 35 * k, arm_back: f * 25 * k, leg_front: -f * 10 * k, _root: { dx: Math.round(-f * 3 * k), dy: 0 } }; } },
  death: { n: 8, fps: 10, loop: false, span: 2, pose: (t, n, f, rig) => { const k = Math.min(1, t / (n - 2)), down = k * k; const hip = rig?.bones.find(b => b.name === 'hip'), drop = hip ? (rig.h - hip.y) : 8; return { hip: f * 88 * down, torso: f * 10 * k, head: f * 20 * k, arm_front: -f * 50 * k, arm_back: -f * 30 * k, leg_front: -f * 20 * k, shin_front: f * 30 * k, _root: { dx: Math.round(-f * 4 * k), dy: Math.round(down * Math.max(0, drop - 6)) } }; } },
};
// walking and running: legs swing in turns, knees fold on the way through, arms swing against the legs, the body bobs
function gait(ph, f, leg, knee, arm, bob, lean) {
  const L = (p, side) => ({ [`leg_${side}`]: -f * leg * S(p), [`shin_${side}`]: f * knee * Math.max(0, C(p - .6)) });
  return { ...L(ph, 'front'), ...L(ph + Math.PI, 'back'), arm_front: f * arm * S(ph), arm_back: -f * arm * S(ph), hand_front: -f * 12, hand_back: -f * 12,
    torso: -f * lean / 3, head: f * lean / 6, _root: { dx: 0, dy: Math.round(bob * Math.abs(S(ph))) * -1 + bob } };
}
// a preset → a pose per frame, keyed by bone id
export function motion(rig, kind, facing = 1) {
  const P = PRESETS[kind], f = facing, byName = Object.fromEntries(rig.bones.map(b => [b.name, b.id]));
  return Array.from({ length: P.n }, (_, t) => {
    const named = P.pose(t, P.n, f, rig), pose = {};
    for (const [k, v] of Object.entries(named)) if (k === '_root') pose._root = v; else if (byName[k] != null) pose[byName[k]] = v;
    return pose;
  });
}
// in-between of two poses (keyframes), t in 0..1
export function lerpPose(a, b, t) {
  const out = {}, keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (k === '_root') { const A = a._root || { dx: 0, dy: 0 }, B = b._root || { dx: 0, dy: 0 }; out._root = { dx: Math.round(A.dx + (B.dx - A.dx) * t), dy: Math.round(A.dy + (B.dy - A.dy) * t) }; }
    else out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
  return out;
}
