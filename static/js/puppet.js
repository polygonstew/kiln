// Puppet: bone animation for one actor. Rig: a skeleton fitted to a drawing (or built bone by bone), with a brush
// that says which pixels belong to which bone. Pose: drag a bone's tip to turn it, the hip to move the body; poses are
// keyframes on a Flash-style timeline with tweens and easing. Presets (walk, run, attack…) fill a motion in one click.
// Bake renders every frame into an ordinary Animate animation; the rig is kept on the actor (a.rig) for later.
// An image dropped in (or Import image…) is rigged too: one drawing as it is, a sheet of parts via the kit screen.
import { h, toast, toCanvas, toDataURL, imgData, checker, rawURL } from './core.js';
import { autoRig, skin, prepare, render, transforms, apply, motion as presetMotion, PRESETS, partsToB64, partsFromB64 } from './rig.js';
import { drawTimeline, poseAt, valueAt, setKey, clearKey, keyFor, insertFrame, removeFrame } from './timeline.js';
import { exportSkeleton } from './rig_godot.js';
import { readImage, assemble, standIn, darkArt } from './rig_import.js';
import { openKit } from './rig_kit.js';
import { buildFace, SHAPES } from './face.js';
import { decode, analyse, shapeAt } from './lipsync.js';
import { saveFiles, S as FS } from './files.js';
import { faceCard } from './puppet_face.js';

const HUES = [12, 200, 48, 280, 120, 330, 170, 30, 240, 90, 300, 60, 150, 0, 220];
const boneColour = (i, a = 1) => `hsla(${HUES[i % HUES.length]}, 75%, 58%, ${a})`;

export async function openPuppet(host, api) {
  const a = api.actor();
  let R = a.rig || null, im = null, parts = null, P = null, bg = ['#2a2a28', '#313130'], face = null;
  const FC = { sel: 'drawn' };      // the face card's state (which head is picked)
  let mode = R ? 'pose' : 'rig', tool = 'move', sel = 0, mi = 0, f = 0, playing = null, brush = 2, showParts = true, onion = true, addPivot = null;
  const undoS = [], redoS = [];
  const ov = h('div', { class: 'workshop puppet' });
  const cv = h('canvas', { class: 'pp-cv' }), tlEl = h('div', { class: 'pp-tl' });
  const left = h('div', { class: 'pp-side' }), right = h('div', { class: 'pp-side' }), bar = h('div', { class: 'pp-bar' }), tlBar = h('div', { class: 'pp-tlbar' });
  host.append(ov);

  async function load() {
    if (!R) return;
    im = await imgData(R.src); parts = partsFromB64(R.parts, im.width * im.height);
    R.motions ||= []; R.facing ||= 1; R.fill ??= true;
    if (!R.motions.length) R.motions.push(blankMotion('pose'));
    P = prepare(im, R, parts, R.fill);
    bg = darkArt(im) ? ['#5c5c66', '#66666f'] : ['#2a2a28', '#313130'];
    face = await buildFace(R);
  }
  const blankMotion = name => ({ name, n: 8, fps: 10, loop: true, span: 1, labels: {}, keys: {} });
  const M = () => R.motions[mi];
  const save = () => { R.parts = partsToB64(parts); a.rig = R; api.changed(); };
  const snap = () => JSON.stringify({ bones: R.bones, motions: R.motions, parts: partsToB64(parts), fill: R.fill });
  const push = () => { undoS.push(snap()); if (undoS.length > 40) undoS.shift(); redoS.length = 0; };
  const restore = s => { const d = JSON.parse(s); R.bones = d.bones; R.motions = d.motions; R.fill = d.fill; parts = partsFromB64(d.parts, im.width * im.height); mi = Math.min(mi, R.motions.length - 1); P = prepare(im, R, parts, R.fill); save(); drawAll(); };
  const undo = () => { if (undoS.length) { redoS.push(snap()); restore(undoS.pop()); } };
  const redo = () => { if (redoS.length) { undoS.push(snap()); restore(redoS.pop()); } };

  /* ---------------------------------------------------------- rigging ---- */
  async function rigFrom(frame) {
    const r = autoRig(frame);
    if (!r) return toast('That frame is empty: draw or open the actor first', 'bad');
    R = { ...r, src: toDataURL(frame), parts: partsToB64(r.parts), facing: R?.facing || 1, fill: true, motions: R?.motions || [] };
    delete R.parts_; await load(); sel = R.bones.findIndex(b => b.name === 'torso'); mode = 'rig'; save(); drawAll();
    toast(`Rigged with ${R.bones.length} bones. Check the coloured parts, fix them with the brush, then Pose`, 'ok');
  }
  /* ------------------------------------------------- an image dropped in ---- */
  async function importImage(url) {
    const r = readImage(await imgData(url));
    if (r.err) return toast(r.err, 'bad');
    if (r.whole) return useFigure(r.whole);
    openKit(ov, r, [a.w, a.h], { done: () => useKit(r.pieces), whole: useFigure });
  }
  const pickURL = (cb, accept = 'image/*') => { const i = h('input', { type: 'file', accept, onchange: () => { const fl = i.files[0]; if (!fl) return; const r = new FileReader(); r.onload = () => cb(r.result, fl); r.readAsDataURL(fl); } }); i.click(); };
  const pickImage = () => { const i = h('input', { type: 'file', accept: 'image/*', onchange: () => readFile(i.files[0]) }); i.click(); };
  const readFile = f => { if (!f?.type.startsWith('image/')) return toast('Drop an image (PNG, JPG, WebP, GIF)', 'bad'); const r = new FileReader(); r.onload = () => importImage(r.result); r.readAsDataURL(f); };
  // the actor's frames must hold the figure: they grow (nothing is lost), after asking unless the actor is still empty
  function roomFor(w, hh) {
    if (w <= a.w && hh <= a.h) return true;
    const W = Math.ceil(Math.max(w, a.w) / 8) * 8, H = Math.ceil(Math.max(hh, a.h) / 8) * 8;
    if (!api.isBlank() && !confirm(`The figure is ${w}×${hh} pixels; ${a.name}'s frames are ${a.w}×${a.h}.\n\nMake the frames ${W}×${H}? Existing frames keep their art (feet stay on the bottom row).`)) return false;
    api.resize(W, H); return true;
  }
  async function useFigure(fig) {
    if (!roomFor(fig.width + 2, fig.height)) return;
    const frame = standIn(fig, a.w, a.h);
    if (api.isBlank()) api.setFrame(frame);
    await rigFrom(frame);
  }
  // a kit: every piece is its bone's own pixels, so the parts are marked as painted (moving a joint keeps them)
  async function useKit(pieces) {
    const first = assemble(pieces, a.w, a.h);
    if (first.err || !roomFor(first.size[0] + 2, first.size[1])) return first.err && toast(first.err, 'bad');
    const k = assemble(pieces, a.w, a.h);
    if (api.isBlank()) api.setFrame(k.im);
    R = { w: k.im.width, h: k.im.height, bones: k.rig.bones, src: toDataURL(k.im), parts: partsToB64(k.rig.parts), facing: 1, fill: true, painted: true, motions: R?.motions || [],
      heads: k.heads.map((hd, i) => ({ id: 'kit' + i, name: 'head ' + (i + 2), src: toDataURL(hd.im), ax: hd.ax, ay: hd.ay, mouth: null })) };
    await load(); sel = Math.max(0, R.bones.findIndex(b => b.name === 'torso')); mode = 'rig'; tool = 'move'; save(); drawAll();
    toast(`Assembled ${R.bones.length} bones from the parts. Check the joints (drag the dots), then Pose or Make a motion`, 'ok');
  }
  ov.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } });
  ov.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); readFile([...e.dataTransfer.files][0]); });

  const reskin = () => { push(); parts = skin(im, R); P = prepare(im, R, parts, R.fill); R.painted = false; save(); drawAll(); };

  /* -------------------------------------------------------- the canvas ---- */
  const span = () => mode === 'pose' ? (M().span || 1) : 1;
  let Z = 4, OX = 0;
  function drawCanvas() {
    if (!R) { cv.width = cv.height = 1; return; }
    const W = im.width * span(), H = im.height, box = cv.parentElement;
    Z = Math.max(1, Math.floor(Math.min((box.clientWidth - 30) / W, (box.clientHeight - 30) / H)));
    OX = Math.floor((W - im.width) / 2);
    cv.width = W * Z; cv.height = H * Z;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    checker(x, cv.width, cv.height, Math.max(4, Z * 2), ...bg);
    let T;
    if (mode === 'rig') {
      x.drawImage(toCanvas(im), OX * Z, 0, im.width * Z, H * Z);
      if (showParts) { const o = new ImageData(im.width, im.height); for (let i = 0; i < parts.length; i++) if (parts[i]) { const c = HUES[(parts[i] - 1) % HUES.length]; o.data.set(hsl(c), i * 4); } x.globalAlpha = .5; x.drawImage(toCanvas(o), OX * Z, 0, im.width * Z, H * Z); x.globalAlpha = 1; }
      T = transforms(R, {});
    } else {
      const pose = { ...poseAt(M(), f), ...(peek || {}) };      // peek: a head or mouth being tried out (Try mouths / heads)
      if (onion && M().n > 1) { const pv = render(P, R, poseAt(M(), (f - 1 + M().n) % M().n), W, H, face); x.globalAlpha = .28; x.drawImage(toCanvas(pv), 0, 0, W * Z, H * Z); x.globalAlpha = 1; }
      x.drawImage(toCanvas(render(P, R, pose, W, H, face)), 0, 0, W * Z, H * Z);
      T = transforms(R, pose);
    }
    // the skeleton: each bone from its joint to its tip; the selected one bright
    R.bones.forEach((b, i) => {
      const [px, py] = apply(T[b.id], b.x, b.y), [tx, ty] = apply(T[b.id], b.tx, b.ty), s = (u, v) => [(u + OX) * Z, v * Z];
      const [ax, ay] = s(px, py), [bx, by] = s(tx, ty);
      x.strokeStyle = i === sel ? '#fff' : boneColour(i, .9); x.lineWidth = i === sel ? 3 : 2;
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      x.fillStyle = i === sel ? '#fff' : boneColour(i); x.beginPath(); x.arc(ax, ay, 4, 0, 7); x.fill();
      x.strokeStyle = '#000'; x.lineWidth = 1; x.beginPath(); x.arc(bx, by, 3.5, 0, 7); x.stroke(); x.fillStyle = boneColour(i, .6); x.fill();
    });
    if (addPivot) { x.fillStyle = '#e3b04b'; x.beginPath(); x.arc((addPivot[0] + OX) * Z, addPivot[1] * Z, 5, 0, 7); x.fill(); }
  }
  const hsl = hue => { const c = (1 - Math.abs(2 * .58 - 1)) * .75, X = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = .58 - c / 2; const [r, g, b] = hue < 60 ? [c, X, 0] : hue < 120 ? [X, c, 0] : hue < 180 ? [0, c, X] : hue < 240 ? [0, X, c] : hue < 300 ? [X, 0, c] : [c, 0, X]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255, 255]; };
  const at = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / Z - OX, (e.clientY - r.top) / Z]; };
  // the joint or tip nearest the pointer (in the current pose): { i, end: 'pivot' | 'tip' }
  function handleAt(p, T) {
    let best = null, bd = 6 / Z + 1.5;
    R.bones.forEach((b, i) => { for (const end of ['tip', 'pivot']) { const [x, y] = apply(T[b.id], end === 'tip' ? b.tx : b.x, end === 'tip' ? b.ty : b.y), d = Math.hypot(x - p[0], y - p[1]); if (d < bd) { bd = d; best = { i, end }; } } });
    return best;
  }
  // the bone whose pixels are under the pointer (front-most first)
  function partAt(p, T) {
    const order = R.bones.map((b, i) => [b, i]).sort((u, v) => v[0].z - u[0].z);
    for (const [b, i] of order) { const I = invT(T[b.id]), [sx, sy] = apply(I, p[0], p[1]), xi = Math.floor(sx), yi = Math.floor(sy); if (xi >= 0 && yi >= 0 && xi < im.width && yi < im.height && parts[yi * im.width + xi] === i + 1) return i; }
    return -1;
  }
  const invT = M0 => { const d = M0[0] * M0[3] - M0[1] * M0[2]; return [M0[3] / d, -M0[1] / d, -M0[2] / d, M0[0] / d, (M0[2] * M0[5] - M0[3] * M0[4]) / d, (M0[1] * M0[4] - M0[0] * M0[5]) / d]; };
  let drag = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!R) return; cv.setPointerCapture(e.pointerId);
    const p = at(e), T = mode === 'rig' ? transforms(R, {}) : transforms(R, poseAt(M(), f));
    if (mode === 'rig' && tool === 'bone') {
      if (!addPivot) { addPivot = p.map(Math.round); drawCanvas(); return; }
      push(); const id = Math.max(...R.bones.map(b => b.id), -1) + 1, par = R.bones[sel]?.id ?? null;
      R.bones.push({ id, name: 'bone' + id, parent: par, x: addPivot[0], y: addPivot[1], tx: Math.round(p[0]), ty: Math.round(p[1]), z: Math.max(...R.bones.map(b => b.z), 0) + 1 });
      sel = R.bones.length - 1; addPivot = null; P = prepare(im, R, parts, R.fill); save(); drawAll(); toast('Bone added: now paint its pixels with the brush', 'ok'); return;
    }
    if (mode === 'rig' && tool === 'paint') {
      if (e.button === 2) { const i = partAt(p, T); if (i >= 0) { sel = i; drawAll(); } return; }
      push(); drag = { t: 'paint' }; paintAt(p); return;
    }
    const hd = handleAt(p, T);
    if (hd) { sel = hd.i; push(); drag = { t: mode === 'rig' ? 'joint' : (R.bones[hd.i].parent == null && hd.end === 'pivot' ? 'root' : 'turn'), ...hd, p0: p, T }; drawAll(); return; }
    const i = partAt(p, T); if (i >= 0) { sel = i; drawAll(); }
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = at(e), b = R.bones[drag.i];
    if (drag.t === 'paint') { paintAt(p); return; }
    if (drag.t === 'joint') {      // rest pose: move a joint; children starting at a moved tip move with it
      const [nx, ny] = p.map(Math.round);
      if (drag.end === 'pivot') { const par = R.bones.find(q => q.id === b.parent); if (par && Math.hypot(par.tx - b.x, par.ty - b.y) < 1.5) { par.tx = nx; par.ty = ny; } b.x = nx; b.y = ny; }
      else { for (const c of R.bones) if (c.parent === b.id && Math.hypot(c.x - b.tx, c.y - b.ty) < 1.5) { c.x = nx; c.y = ny; } b.tx = nx; b.ty = ny; }
      drawCanvas(); return;
    }
    if (drag.t === 'root') { const v = { dx: Math.round(p[0] - drag.p0[0]) + (drag.base?.dx ?? (drag.base = valueAt(M(), '_root', f) || { dx: 0, dy: 0 }).dx), dy: 0 }; v.dy = Math.round(p[1] - drag.p0[1]) + drag.base.dy; setKey(M(), '_root', f, v); drawCanvas(); return; }
    if (drag.t === 'turn') {       // turn the bone so its tip points at the pointer
      const T = drag.T, [px, py] = apply(T[b.id], b.x, b.y), [tx, ty] = apply(T[b.id], b.tx, b.ty);
      const d = (Math.atan2(p[1] - py, p[0] - px) - Math.atan2(ty - py, tx - px)) * 180 / Math.PI;
      const base = drag.base ?? (drag.base = valueAt(M(), b.id, f) || 0);
      setKey(M(), String(b.id), f, Math.round((base + d) * 2) / 2); drawCanvas();
    }
  });
  const up = () => {
    if (!drag) return;
    const t = drag.t; drag = null;
    if (t === 'joint' && !R.painted) parts = skin(im, R);
    if (t === 'joint' || t === 'paint') P = prepare(im, R, parts, R.fill);
    save(); drawAll();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function paintAt(p) {
    const [cx, cy] = p, id = sel + 1;
    for (let y = Math.floor(cy - brush); y <= cy + brush; y++) for (let x = Math.floor(cx - brush); x <= cx + brush; x++)
      if (x >= 0 && y >= 0 && x < im.width && y < im.height && (x - cx) ** 2 + (y - cy) ** 2 <= brush * brush && im.data[(y * im.width + x) * 4 + 3] > 127) parts[y * im.width + x] = id;
    R.painted = true; drawCanvas();
  }

  /* -------------------------------------------------------- panels ---- */
  const depthOf = b => { let d = 0, q = b; while (q.parent != null && d < 20) { q = R.bones.find(x => x.id === q.parent); d++; if (!q) break; } return d; };
  const treeOrder = () => { const out = [], walk = (pid, d) => R.bones.filter(b => b.parent === pid).sort((u, v) => u.z - v.z).forEach(b => { out.push(b); walk(b.id, d + 1); }); walk(null, 0); for (const b of R.bones) if (!out.includes(b)) out.push(b); return out; };
  function drawLeft() {
    if (!R) {
      left.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'Rig'),
        h('p', { class: 'note', style: { marginTop: 0 } }, 'Fit a skeleton to the frame open in Animate (a side-view character works best), or start with none and add bones one by one.'),
        h('button', { class: 'btn go', onclick: () => rigFrom(api.frame()) }, 'Rig this frame'), ' ',
        h('button', { class: 'btn sm', title: 'Rig a picture: one drawing, or a sheet of separate body parts (head, torso, arms, legs…) that Kiln puts together. Or drop it anywhere here.', onclick: pickImage }, 'Import image…'), ' ',
        h('button', { class: 'btn sm ghost', onclick: async () => { R = { w: api.frame().width, h: api.frame().height, src: toDataURL(api.frame()), parts: partsToB64(new Uint8Array(api.frame().width * api.frame().height)), bones: [], facing: 1, fill: true, painted: true, motions: [] }; await load(); mode = 'rig'; tool = 'bone'; save(); drawAll(); toast('Click a joint, then the tip, to add a bone'); } }, 'Start empty')));
      return;
    }
    const b = R.bones[sel];
    left.replaceChildren(
      h('div', { class: 'wk-card' }, h('h3', {}, 'Bones', h('span', { class: 'grow' }), h('small', {}, R.bones.length)),
        h('div', { class: 'pp-bones' }, ...treeOrder().map(q => { const i = R.bones.indexOf(q); return h('div', { class: 'pp-bone' + (i === sel ? ' on' : ''), style: { paddingLeft: 6 + depthOf(q) * 12 + 'px' }, onclick: () => { sel = i; drawAll(); }, ondblclick: () => { const n = prompt('Bone name', q.name); if (n) { push(); q.name = n.replace(/\W+/g, '_'); save(); drawAll(); } } }, h('i', { style: { background: boneColour(i) } }), q.name); })),
        b ? h('div', { class: 'pp-row' }, h('button', { class: 'ibtn', title: 'Draw in front (later)', onclick: () => { push(); b.z += 1.5; normZ(); save(); drawAll(); } }, '↑'), h('button', { class: 'ibtn', title: 'Draw behind (earlier)', onclick: () => { push(); b.z -= 1.5; normZ(); save(); drawAll(); } }, '↓'),
          h('span', { class: 'faint', style: { fontSize: '11px' } }, 'layer ' + Math.round(b.z)), h('span', { class: 'grow' }),
          h('button', { class: 'btn sm ghost danger', title: 'Delete this bone (its pixels go to its parent)', onclick: () => delBone(sel) }, 'Delete')) : ''),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Rig tools'),
        h('div', { class: 'seg' }, ...[['move', 'Move joints'], ['paint', 'Paint parts'], ['bone', 'Add bone']].map(([k, l]) => h('button', { class: mode === 'rig' && tool === k ? 'on' : '', onclick: () => { mode = 'rig'; tool = k; addPivot = null; drawAll(); } }, l))),
        h('p', { class: 'note' }, { move: 'Drag a joint (dot) or tip (ring). Parts follow until you paint them yourself.', paint: 'Paint pixels onto the selected bone. Right-click a part to select its bone.', bone: 'Click the joint, then the tip. The new bone hangs from the selected one.' }[tool]),
        tool === 'paint' ? h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Brush'), h('input', { type: 'range', min: 0, max: 8, value: brush, oninput: e => { brush = +e.target.value; } })) : '',
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: showParts, onchange: e => { showParts = e.target.checked; drawCanvas(); } }), ' show parts'), ' ',
        h('label', { class: 'chk', title: 'Fill the body behind a limb with the body\'s colours, so moving the limb leaves no hole' }, h('input', { type: 'checkbox', checked: R.fill, onchange: e => { push(); R.fill = e.target.checked; P = prepare(im, R, parts, R.fill); save(); drawCanvas(); } }), ' fill behind limbs'),
        h('div', { class: 'pp-row' }, h('button', { class: 'btn sm ghost', title: 'Give every pixel to its nearest bone again (undoes painting)', onclick: reskin }, 'Re-skin'),
          h('button', { class: 'btn sm ghost', title: 'Rig the frame open in Animate again (keeps motions)', onclick: () => { if (confirm('Fit a new skeleton to the current Animate frame? Bones and parts are replaced; motions are kept.')) rigFrom(api.frame()); } }, 'Re-rig'),
          h('button', { class: 'btn sm ghost', title: 'Rig a picture instead: one drawing, or a sheet of separate body parts (or drop it here). Motions are kept.', onclick: pickImage }, 'Import image…'))));
  }
  const normZ = () => R.bones.slice().sort((u, v) => u.z - v.z).forEach((b, i) => { b.z = i; });
  function delBone(i) {
    const b = R.bones[i]; if (!b) return; push();
    const par = b.parent, pi = R.bones.findIndex(q => q.id === par);
    for (const c of R.bones) if (c.parent === b.id) c.parent = par;
    for (let k = 0; k < parts.length; k++) { if (parts[k] === i + 1) parts[k] = pi >= 0 ? pi + 1 : 0; else if (parts[k] > i + 1) parts[k]--; }
    R.bones.splice(i, 1); for (const m of R.motions) delete m.keys[b.id];
    sel = Math.max(0, Math.min(sel, R.bones.length - 1)); P = prepare(im, R, parts, R.fill); save(); drawAll();
  }
  function drawRight() {
    if (!R) { right.replaceChildren(); return; }
    const m = M();
    right.replaceChildren(
      h('div', { class: 'wk-card' }, h('h3', {}, 'Motions', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { const n = prompt('Name for the new motion', 'walk'); if (!n) return; push(); R.motions.push(blankMotion(n.replace(/\W+/g, '_'))); mi = R.motions.length - 1; f = 0; save(); drawAll(); } }, '+ New')),
        h('div', { class: 'pp-motions' }, ...R.motions.map((q, i) => h('div', { class: 'pp-motion' + (i === mi ? ' on' : ''), onclick: () => { mi = i; f = 0; mode = 'pose'; drawAll(); }, ondblclick: () => { const n = prompt('Motion name', q.name); if (n) { q.name = n.replace(/\W+/g, '_'); save(); drawAll(); } } }, q.name, h('small', {}, `${q.n}f`)))),
        h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Facing'), h('div', { class: 'seg' }, ...[[1, 'Right'], [-1, 'Left']].map(([v, l]) => h('button', { class: R.facing === v ? 'on' : '', onclick: () => { R.facing = v; save(); drawRight(); } }, l))))),
      R.bones.some(b => b.name === 'head') ? faceCard(Object.assign(FC, { R, im, parts, motion: () => M(), frame: () => f, push, save, redraw: drawAll, pickFile: pickURL,
        key: (row, v) => { mode = 'pose'; setKey(M(), row, f, v); save(); drawAll(); }, refaced: async () => { face = await buildFace(R); drawCanvas(); drawTl(); },
        voice: () => pickURL(voiceLine, 'audio/*'), bakeMouths, tryOut })) : '',
      h('div', { class: 'wk-card' }, h('h3', {}, 'Make a motion', h('small', {}, 'from the rig, no AI')),
        h('div', { class: 'pp-presets' }, ...Object.keys(PRESETS).map(k => h('button', { class: 'btn sm', title: `${PRESETS[k].n} frames at ${PRESETS[k].fps} fps${PRESETS[k].span === 2 ? ', 2 boxes wide' : ''}`, onclick: () => usePreset(k) }, k))),
        h('p', { class: 'note' }, 'Uses the bone names of the auto rig (hip, torso, head, arm_front…). Each frame becomes a keyframe you can adjust.')),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Into the game'),
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Box'), h('div', { class: 'seg' }, ...[[1, '1 wide'], [2, '2 wide']].map(([v, l]) => h('button', { class: (m.span || 1) === v ? 'on' : '', onclick: () => { m.span = v; save(); drawAll(); } }, l)))),
        h('button', { class: 'btn go wide', title: 'Render every frame of this motion into an Animate animation of the same name', onclick: () => bake(m) }, `Bake "${m.name}" into Animate`),
        h('button', { class: 'btn sm ghost', style: { marginTop: '6px' }, title: 'Bake every motion', onclick: () => { for (const q of R.motions) bake(q, true); toast(`Baked ${R.motions.length} motions`, 'ok'); } }, 'Bake all'),
        h('button', { class: 'btn sm ghost', style: { marginTop: '6px' }, title: 'The rig as Godot bones (Skeleton2D + Bone2D + an AnimationPlayer with every motion): smooth, in-engine', onclick: async () => { const r = await exportSkeleton(a, R, im, parts).catch(e => ({ err: e.message })); toast(r.err ? 'Export failed: ' + r.err : `Saved ${r.path}`, r.err ? 'bad' : 'ok'); } }, 'Export Godot skeleton')));
  }
  function usePreset(k) {
    const P0 = PRESETS[k], poses = presetMotion(R, k, R.facing);
    push();
    let m = R.motions.find(q => q.name === k);
    if (m && Object.keys(m.keys).length && !confirm(`Replace the motion "${k}"?`)) return;
    if (!m) { m = blankMotion(k); R.motions.push(m); }
    Object.assign(m, { n: P0.n, fps: P0.fps, loop: P0.loop, span: P0.span || 1, keys: {} });
    poses.forEach((pose, t) => { for (const [id, v] of Object.entries(pose)) { (m.keys[id] ||= {})[t] = { v, tween: false, ease: 0 }; } });
    mi = R.motions.indexOf(m); f = 0; mode = 'pose'; save(); drawAll();
    toast(`"${k}": ${P0.n} frames. Drag bone tips to adjust any frame, then Bake`, 'ok');
  }
  function bake(m, quiet) {
    const W = im.width * (m.span || 1), H = im.height;
    const frames = Array.from({ length: m.n }, (_, t) => render(P, R, poseAt(m, t), W, H, face));
    api.addAnim(m.name, frames, m.fps, m.loop, m.span || 1, quiet);
    if (!quiet) toast(`Baked "${m.name}": ${m.n} frames into Animate`, 'ok');
  }

  /* -------------------------------------------------------- timeline ---- */
  const rows = () => [{ id: '_root', name: '⊕ body move', depth: 0 }, ...(R.heads?.length ? [{ id: '_head', name: '◐ head view', depth: 0 }] : []),
    ...(R.mouths ? [{ id: '_mouth', name: '◡ mouth', depth: 0 }] : []), ...treeOrder().map(b => ({ id: String(b.id), name: b.name, depth: depthOf(b) + 1 }))];
  const rest = row => row === '_root' ? { dx: 0, dy: 0 } : row === '_head' ? 'drawn' : row === '_mouth' ? 'X' : 0;
  const selRow = () => R.bones[sel] ? String(R.bones[sel].id) : '_root';
  function drawTl() {
    if (!R) { tlEl.replaceChildren(); tlBar.replaceChildren(); return; }
    const m = M(), row = selRow(), kf = keyFor(m, row, f);
    drawTimeline(tlEl, m, rows(), { f, row }, {
      seek: t => { f = t; mode = 'pose'; drawCanvas(); drawTl(); },
      select: (id, t) => { const i = R.bones.findIndex(b => String(b.id) === id); if (i >= 0) sel = i; f = t; mode = 'pose'; drawAll(); },
      move: (id, from, to) => { if (m.keys[id]?.[to]) return toast('There is a keyframe there already'); push(); m.keys[id][to] = m.keys[id][from]; delete m.keys[id][from]; f = to; save(); drawAll(); },
      toggle: (id, t) => { push(); if (m.keys[id]?.[t]) clearKey(m, id, t); else setKey(m, id, t, valueAt(m, id, t) ?? rest(id)); save(); drawAll(); },
    });
    const num = (v, mn, mx, fn, w = 46) => h('input', { type: 'number', value: v, min: mn, max: mx, style: { width: w + 'px' }, onchange: e => fn(Math.max(mn, Math.min(mx, +e.target.value || mn))) });
    tlBar.replaceChildren(
      h('button', { class: 'ibtn', title: 'Play / stop (Space)', onclick: togglePlay }, playing ? '■' : '▶'),
      h('button', { class: 'ibtn', title: 'Previous frame (,)', onclick: () => step(-1) }, '◂'), h('button', { class: 'ibtn', title: 'Next frame (.)', onclick: () => step(1) }, '▸'),
      h('span', { class: 'lbl' }, 'Frames'), num(m.n, 1, 120, v => { push(); if (v > m.n) m.n = v; else while (m.n > v) removeFrame(m, m.n - 1); f = Math.min(f, m.n - 1); save(); drawAll(); }),
      h('span', { class: 'lbl' }, 'fps'), num(m.fps, 1, 60, v => { m.fps = v; save(); }),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: m.loop, onchange: e => { m.loop = e.target.checked; save(); drawAll(); } }), ' loop'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: onion, onchange: e => { onion = e.target.checked; drawCanvas(); } }), ' onion'),
      h('i', { class: 'sep' }),
      h('button', { class: 'btn sm', title: 'Keyframe the selected bone here (F6)', onclick: () => keyOp('key') }, 'Key'),
      h('button', { class: 'btn sm ghost', title: 'Keyframe every bone here: a full pose (Shift+F6)', onclick: () => keyOp('pose') }, 'Key pose'),
      h('button', { class: 'btn sm ghost', title: 'Blank keyframe: back to the drawing\'s own pose (F7)', onclick: () => keyOp('blank') }, 'Blank'),
      h('button', { class: 'btn sm ghost', title: 'Remove this keyframe (Delete)', onclick: () => keyOp('clear') }, 'Clear'),
      h('button', { class: 'btn sm ghost', title: 'Insert a frame here: later keys move one frame (F5)', onclick: () => { push(); insertFrame(m, f); save(); drawAll(); } }, '+ Frame'),
      h('button', { class: 'btn sm ghost', title: 'Remove this frame (Shift+F5)', onclick: () => { push(); removeFrame(m, f); f = Math.min(f, m.n - 1); save(); drawAll(); } }, '− Frame'),
      h('i', { class: 'sep' }),
      ...(kf ? [h('label', { class: 'chk', title: 'Motion tween: glide from this keyframe to the next one instead of holding still' }, h('input', { type: 'checkbox', checked: kf.key.tween, onchange: e => { push(); kf.key.tween = e.target.checked; save(); drawAll(); } }), ' tween'),
        h('span', { class: 'lbl', title: '-100 starts slow, +100 ends slow (like Flash)' }, 'Ease'), h('input', { type: 'range', min: -100, max: 100, step: 5, value: kf.key.ease || 0, style: { width: '90px' }, oninput: e => { kf.key.ease = +e.target.value; easeV.textContent = e.target.value; drawCanvas(); }, onchange: () => save() }), easeV = h('span', { class: 'mono faint', style: { width: '30px', fontSize: '11px' } }, String(kf.key.ease || 0)),
        h('canvas', { class: 'pp-ease', width: 40, height: 20, title: 'The ease curve' })] : [h('span', { class: 'faint', style: { fontSize: '11px' } }, 'No keyframe on this row yet')]),
      h('i', { class: 'sep' }),
      h('input', { type: 'text', placeholder: 'label', value: m.labels?.[f] || '', title: 'A label on this frame (like Flash frame labels)', style: { width: '80px' }, onchange: e => { (m.labels ||= {}); if (e.target.value) m.labels[f] = e.target.value; else delete m.labels[f]; save(); drawTl(); } }));
    const ec = tlBar.querySelector('.pp-ease'); if (ec && kf) { const x = ec.getContext('2d'); x.strokeStyle = '#6f8fd9'; x.beginPath(); for (let i = 0; i <= 20; i++) { const t = i / 20, y = 18 - 16 * (kf.key.ease > 0 ? t + kf.key.ease / 100 * ((1 - (1 - t) * (1 - t)) - t) : t - kf.key.ease / 100 * (t * t - t)); i ? x.lineTo(2 + t * 36, y) : x.moveTo(2, y); } x.stroke(); }
  }
  let easeV;
  function keyOp(k) {
    const m = M(), row = selRow(); push();
    if (k === 'key') setKey(m, row, f, valueAt(m, row, f) ?? rest(row));
    if (k === 'pose') for (const r of rows()) setKey(m, r.id, f, valueAt(m, r.id, f) ?? rest(r.id));
    if (k === 'blank') setKey(m, row, f, rest(row));
    if (k === 'clear') clearKey(m, row, f);
    save(); drawAll();
  }
  const step = d => { f = (f + d + M().n) % M().n; mode = 'pose'; drawCanvas(); drawTl(); };
  // a motion with a voice line plays its sound too, and follows the sound's clock so the mouth stays in time
  // Try mouths / Try heads: flash through a list of overrides on the canvas without touching the timeline
  let peek = null, peekT = 0;
  const tryOut = list => { clearInterval(peekT); mode = 'pose'; let i = 0; peekT = setInterval(() => { peek = list[i++] || null; drawCanvas(); if (!peek) clearInterval(peekT); }, 260); };
  let audio = null;
  function togglePlay() {
    if (playing) { clearInterval(playing); playing = null; audio?.pause(); audio = null; drawTl(); return; }
    mode = 'pose'; const m0 = M();
    if (m0.voice) { audio = new Audio(rawURL(`${FS.root}/sprites/${a.name}/${m0.voice.file}`)); audio.currentTime = f / m0.fps; audio.play().catch(() => {}); }
    playing = setInterval(() => {
      const m = M();
      if (audio) f = Math.min(m.n - 1, Math.floor(audio.currentTime * m.fps)); else f = m.loop ? (f + 1) % m.n : Math.min(m.n - 1, f + 1);
      drawCanvas(); tlEl.querySelectorAll('.tl-n').forEach((n, i) => n.classList.toggle('ph', i === f));
      if (audio ? audio.ended : !m.loop && f === m.n - 1) togglePlay();
    }, 1000 / m0.fps);
    drawTl();
  }

  /* ------------------------------------------------ a voice line (lip sync) ---- */
  // the sound goes next to the actor (sprites/<actor>/voice/) with its mouth timings (lipsync.js); a motion
  // "say_<name>" gets a mouth key wherever the shape changes and a small head nod on the loud parts
  async function voiceLine(url, file) {
    if (!R.mouths || !(R.mouthAt || (R.heads || []).some(x => x.mouth))) return toast('Place the mouth first: click the face in Head & mouth', 'bad');
    const sound = await decode(await (await fetch(url)).arrayBuffer()).catch(() => null);
    if (!sound) return toast('Could not read that sound', 'bad');
    const { cues, level, step } = analyse(sound), name = (file.name.replace(/\.\w+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'line').slice(0, 32);
    const ext = (file.name.match(/\.(wav|ogg|mp3)$/i)?.[1] || 'wav').toLowerCase();
    await saveFiles(`sprites/${a.name}/voice`, [{ name: `${name}.${ext}`, b64: url }, { name: `${name}.lipsync.json`, text: JSON.stringify({ sound: `${name}.${ext}`, duration: +sound.duration.toFixed(3), cues }) + '\n' }]);
    push();
    const fps = 15, n = Math.max(1, Math.ceil(sound.duration * fps)), mname = 'say_' + name;
    let m = R.motions.find(q => q.name === mname); if (!m) { m = blankMotion(mname); R.motions.push(m); }
    Object.assign(m, { n, fps, loop: false, span: 1, voice: { file: `voice/${name}.${ext}`, cues: `voice/${name}.lipsync.json`, duration: sound.duration } });
    m.keys._mouth = {}; let last = null;
    for (let t = 0; t < n; t++) { const sh = shapeAt(cues, t / fps); if (sh !== last) { m.keys._mouth[t] = { v: sh, tween: false, ease: 0 }; last = sh; } }
    const head = R.bones.find(b => b.name === 'head');
    if (head) { m.keys[head.id] = {}; for (let t = 0; t < n; t += 4) { const lv = level[Math.min(level.length - 1, Math.round(t / fps / step))] || 0; m.keys[head.id][t] = { v: +(R.facing * (lv - .4) * 5).toFixed(1), tween: true, ease: 0 }; } }
    mi = R.motions.indexOf(m); f = 0; mode = 'pose'; save(); drawAll();
    toast(`"${mname}": ${cues.length} mouth changes in ${sound.duration.toFixed(1)} s, saved with the actor. Space plays it with the sound`, 'ok');
  }
  // the mouth set for lip sync in Godot: the rest pose once per mouth shape (an animation "mouths": X A B … H)
  function bakeMouths() {
    if (!R.mouths) return toast('Place the mouth first: click the face in Head & mouth', 'bad');
    const frames = SHAPES.map(([k]) => render(P, R, { _head: FC.sel || 'drawn', _mouth: k }, im.width, im.height, face));
    api.addAnim('mouths', frames, 1, false, 1);
    toast('Baked "mouths": one frame per mouth shape. Saved actors with it talk in Godot (lipsync.gd)', 'ok');
  }

  /* ---------------------------------------------------------- keys & frame ---- */
  const keys = e => {
    if (e.target.matches('input[type=text],input[type=number],textarea') || ov.querySelector('.kit')) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey; let done = true;
    if (ctrl && k.toLowerCase() === 'z') e.shiftKey ? redo() : undo();
    else if (ctrl && k.toLowerCase() === 'y') redo();
    else if (k === 'F6') keyOp(e.shiftKey ? 'pose' : 'key');
    else if (k === 'F7') keyOp('blank');
    else if (k === 'F5') { push(); e.shiftKey ? removeFrame(M(), f) : insertFrame(M(), f); f = Math.min(f, M().n - 1); save(); drawAll(); }
    else if (k === 'Delete') keyOp('clear');
    else if (k === ' ') togglePlay();
    else if (k === ',') step(-1); else if (k === '.') step(1);
    else if (k === 'Escape') close();
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
  };
  window.addEventListener('keydown', keys, true);
  function close() { if (playing) clearInterval(playing); window.removeEventListener('keydown', keys, true); ov.remove(); api.redraw(); }
  function drawBar() {
    bar.replaceChildren(h('b', {}, 'Puppet'), h('span', {}, a.name),
      R ? h('div', { class: 'seg' }, ...[['rig', 'Rig'], ['pose', 'Pose']].map(([k, l]) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; drawAll(); } }, l))) : '',
      h('span', { class: 'grow' }), h('span', { class: 'faint', style: { fontSize: '11px' } }, 'F6 key · F7 blank · F5 frame · Space play · Ctrl+Z undo'),
      h('button', { class: 'btn sm go', onclick: close }, 'Back to Animate'));
  }
  function drawAll() { drawBar(); drawLeft(); drawRight(); drawTl(); requestAnimationFrame(drawCanvas); }
  ov.append(bar, h('div', { class: 'pp-body' }, left, h('div', { class: 'pp-stage' }, cv), right), h('div', { class: 'pp-bottom' }, tlBar, tlEl));
  new ResizeObserver(() => drawCanvas()).observe(ov);
  await load(); drawAll();
}
