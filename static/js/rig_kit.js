// The kit screen: a sheet of body parts dropped into Puppet. Shows the sheet with every piece outlined in the colour
// of what Kiln thinks it is; click a piece and press a label (or 1–0) to change it. The figure on the right is
// assembled live (rig_import.js) and walks, so a wrong guess shows at once. "Use these parts" hands back the rig.
import { h, toCanvas, checker, bbox, crop } from './core.js';
import { KINDS, assemble, darkArt } from './rig_import.js';
import { prepare, render, motion } from './rig.js';

const HUE = { head: 48, torso: 12, arm: 200, forearm: 175, hand: 140, thigh: 275, shin: 305, foot: 335, prop: 28 };
const colour = (k, a = 1) => HUE[k] == null ? `rgba(150,150,150,${a * .55})` : `hsla(${HUE[k]}, 80%, 60%, ${a})`;

// kit = { native, pieces } from readImage; frame = [w, h] the actor's frame; done({ im, rig }) or whole(image)
export function openKit(host, kit, frame, { done, whole }) {
  const { native, pieces } = kit, shown = pieces.filter(p => p.n >= 3);
  let sel = shown.find(p => p.kind === 'torso') || shown[0], walk = null, wf = 0, built = null;
  const bg = darkArt(native) ? ['#5c5c66', '#66666f'] : ['#202020', '#262625'];
  const ov = h('div', { class: 'workshop kit' }), cv = h('canvas', { class: 'pp-cv' }), pv = h('canvas', { class: 'pp-cv', title: 'The assembled figure, walking' });
  const info = h('span'), labels = h('div', { class: 'kit-labels' }), note = h('p', { class: 'note' });
  const close = () => { clearInterval(walk); window.removeEventListener('keydown', keys, true); ov.remove(); };
  ov.append(
    h('div', { class: 'pp-bar' }, h('b', {}, 'Parts kit'), info, h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', title: 'It is one drawing, not separate parts: rig the whole picture', onclick: () => { close(); const b = bbox(native); whole(crop(native, b.x, b.y, b.w, b.h)); } }, 'Whole figure instead'),
      h('button', { class: 'btn sm ghost', onclick: close }, 'Cancel'),
      h('button', { class: 'btn sm go', title: 'Rig the assembled figure: every piece becomes its bone', onclick: () => { if (!built || built.err) return; close(); done(built); } }, 'Use these parts')),
    h('div', { class: 'kit-body' }, h('div', { class: 'pp-stage' }, cv),
      h('div', { class: 'pp-side' },
        h('div', { class: 'wk-card' }, h('h3', {}, 'This piece is…'), labels, h('p', { class: 'note' }, 'Click a piece on the sheet, then its label (keys 1–0). Pairs go back/front from left to right; one piece of a pair is used for both sides. A whole arm or leg is cut at the elbow or knee.')),
        h('div', { class: 'wk-card' }, h('h3', {}, 'Assembled'), h('div', { class: 'kit-pv' }, pv), note))));
  host.append(ov);

  function drawSheet() {
    const box = cv.parentElement, Z = Math.max(1, Math.floor(Math.min((box.clientWidth - 30) / native.width, (box.clientHeight - 30) / native.height)));
    cv.width = native.width * Z; cv.height = native.height * Z;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    checker(x, cv.width, cv.height, Math.max(4, Z * 2), ...bg);
    x.drawImage(toCanvas(native), 0, 0, cv.width, cv.height);
    for (const p of shown) {
      x.strokeStyle = colour(p.kind, p === sel ? 1 : .8); x.lineWidth = p === sel ? 3 : 1.5;
      x.strokeRect(p.x * Z - 2, p.y * Z - 2, p.w * Z + 4, p.h * Z + 4);
      if (p.kind !== 'spare' || p === sel) { x.fillStyle = colour(p.kind); x.font = '600 11px "IBM Plex Sans Condensed", sans-serif'; x.fillText(KINDS.find(k => k[0] === p.kind)[1].split(' ')[0], p.x * Z, p.y * Z - 5); }
    }
    cv.dataset.z = Z;
  }
  function drawLabels() {
    labels.replaceChildren(...KINDS.map(([k, l], i) => h('button', { class: 'btn sm' + (sel?.kind === k ? ' go' : ''), title: `Key ${(i + 1) % 10}`, onclick: () => setKind(k) },
      h('i', { class: 'kit-dot', style: { background: colour(k) } }), l)));
    info.textContent = `${shown.filter(p => p.kind !== 'spare').length} of ${shown.length} pieces used · click a piece, then say what it is`;
  }
  function setKind(k) {
    if (!sel) return;
    if (k === 'torso' || k === 'head' || k === 'prop') for (const p of pieces) if (p.kind === k) p.kind = 'spare';     // only one of these
    sel.kind = k; build(); drawAll();
  }
  function build() {
    built = assemble(pieces, frame[0], frame[1]);
    clearInterval(walk);
    if (built.err) { note.textContent = built.err; pv.width = pv.height = 1; return; }
    note.textContent = `${built.size[0]}×${built.size[1]} pixels, ${built.rig.bones.length} bones` + (built.size[1] > frame[1] ? ` · taller than the actor's ${frame[1]} px frame: it will grow to fit` : '');
    const P = prepare(built.im, built.rig, built.rig.parts, true), poses = motion(built.rig, 'walk', 1), W = built.im.width, H = built.im.height;
    const frames = poses.map(q => toCanvas(render(P, built.rig, q, W, H)));
    const Z = Math.max(1, Math.min(4, Math.floor(260 / Math.max(W, H))));
    pv.width = W * Z; pv.height = H * Z;
    const x = pv.getContext('2d'); x.imageSmoothingEnabled = false;
    const tick = () => { checker(x, pv.width, pv.height, Z * 4, ...bg); x.drawImage(frames[wf++ % frames.length], 0, 0, pv.width, pv.height); };
    tick(); walk = setInterval(tick, 100);
  }
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), Z = +cv.dataset.z, px = (e.clientX - r.left) / Z, py = (e.clientY - r.top) / Z;
    const hit = shown.filter(p => px >= p.x - 1 && py >= p.y - 1 && px <= p.x + p.w + 1 && py <= p.y + p.h + 1).sort((p, q) => p.n - q.n)[0];
    if (hit) { sel = hit; drawAll(); }
  });
  const keys = e => {
    const i = '1234567890'.indexOf(e.key);
    if (i >= 0 && KINDS[i]) { setKind(KINDS[i][0]); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
  };
  window.addEventListener('keydown', keys, true);
  function drawAll() { drawLabels(); requestAnimationFrame(drawSheet); }
  new ResizeObserver(() => drawSheet()).observe(ov);
  build(); drawAll();
}
