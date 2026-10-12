// A Flash-style timeline: layers as rows, frames as columns. Each row has keyframes; between two keyframes a row
// either holds the first value (grey, like held frames) or tweens to the next one (blue, a motion tween) with an
// ease from -100 (slow start) to +100 (slow finish), as in Flash. Frame labels sit above. Used by the puppet screen:
// rows are bones (+ the root move), values are angles (or { dx, dy } for the root, a head id / mouth letter for _head / _mouth).
//   motion = { name, n, fps, loop, span, labels: { frame: text }, keys: { rowId: { frame: { v, tween, ease } } } }
import { h } from './core.js';
import { icon } from './icons.js';

// Flash's classic ease: blend between linear and a quadratic curve
export function ease(t, e = 0) {
  const q = Math.max(-1, Math.min(1, e / 100));
  return q > 0 ? t + q * ((1 - (1 - t) * (1 - t)) - t) : t + -q * (t * t - t);
}
const mix = (a, b, t, root) => root ? { dx: Math.round(a.dx + (b.dx - a.dx) * t), dy: Math.round(a.dy + (b.dy - a.dy) * t) } : a + (b - a) * t;
const REST = root => root ? { dx: 0, dy: 0 } : 0;

// a row's value at frame f; null = no keyframes at all (rest)
export function valueAt(motion, rowId, f) {
  const row = motion.keys?.[rowId], root = rowId === '_root';
  if (!row) return null;
  const fs = Object.keys(row).map(Number).sort((a, b) => a - b);
  if (!fs.length) return null;
  let i = -1; for (let k = 0; k < fs.length; k++) if (fs[k] <= f) i = k;
  if (i < 0) return row[fs[0]].v;                                   // before the first key: the first key's value
  const k0 = row[fs[i]];
  if (fs[i] === f || !k0.tween || typeof k0.v === 'string') return k0.v;      // head views and mouth shapes hold, never tween
  let f1 = fs[i + 1], k1 = row[f1];
  if (k1 == null && motion.loop) { f1 = fs[0] + motion.n; k1 = row[fs[0]]; }   // a loop tweens round to its first key
  if (k1 == null) return k0.v;
  return mix(k0.v ?? REST(root), k1.v ?? REST(root), ease((f - fs[i]) / (f1 - fs[i]), k0.ease || 0), root);
}
// the whole pose at frame f
export function poseAt(motion, f) {
  const pose = {};
  for (const id of Object.keys(motion.keys || {})) { const v = valueAt(motion, id, f); if (v != null) pose[id] = v; }
  return pose;
}
export function setKey(motion, rowId, f, v) {
  const row = (motion.keys[rowId] ||= {}), had = row[f];
  // a new key tweens like the key before it (so a smooth motion stays smooth); the very first one tweens by default
  const prev = Object.keys(row).map(Number).filter(x => x < f).sort((a, b) => b - a)[0];
  row[f] = { v, tween: typeof v === 'string' ? false : had ? had.tween : prev != null ? row[prev].tween : true, ease: had?.ease || 0 };
}
export function clearKey(motion, rowId, f) { if (motion.keys[rowId]) { delete motion.keys[rowId][f]; if (!Object.keys(motion.keys[rowId]).length) delete motion.keys[rowId]; } }
// the key a frame belongs to (the last one at or before it), for tween / ease settings
export function keyFor(motion, rowId, f) { const row = motion.keys?.[rowId]; if (!row) return null; const k = Object.keys(row).map(Number).filter(x => x <= f).sort((a, b) => b - a)[0]; return k == null ? null : { f: k, key: row[k] }; }
// insert / remove a frame at f: every key after it moves one frame
export function insertFrame(motion, f) { motion.n++; shiftKeys(motion, f, 1); }
export function removeFrame(motion, f) { if (motion.n <= 1) return; for (const r of Object.values(motion.keys)) delete r[f]; shiftKeys(motion, f + 1, -1); motion.n--; }
function shiftKeys(motion, from, d) {
  for (const id of Object.keys(motion.keys)) { const row = motion.keys[id], out = {}; for (const [k, v] of Object.entries(row)) out[+k >= from ? +k + d : +k] = v; motion.keys[id] = out; }
  const L = {}; for (const [k, v] of Object.entries(motion.labels || {})) L[+k >= from ? +k + d : +k] = v; motion.labels = L;
}

// the timeline element. rows: [{ id, name, depth, part?, hidden?, locked? }]; st: { f, row } (playhead and selected row);
// on: { seek(f), select(rowId, f), move(rowId, from, to), toggle(rowId, f), visible?(rowId, v), lock?(rowId, v) }: a part row
// gets an eye and a lock like every layer list in Kiln (layers.js)
export function drawTimeline(el, motion, rows, st, on) {
  const N = motion.n, cell = (row, f) => {
    const r = motion.keys?.[row.id], key = r?.[f], kf = keyFor(motion, row.id, f);
    let next = null; if (r) next = Object.keys(r).map(Number).filter(x => x > f).sort((a, b) => a - b)[0];
    const tw = kf && kf.key.tween && (next != null || (motion.loop && Object.keys(r).length > 1) || (motion.loop && kf.f !== f));
    const cls = ['tl-c', key ? 'k' : kf ? (tw ? 't' : 'h') : '', f === st.f ? 'ph' : '', row.id === st.row && f === st.f ? 'sel' : '', (f + 1) % 5 === 0 ? 'five' : ''].join(' ');
    const c = h('div', { class: cls, 'data-f': f, title: key ? `Keyframe ${f + 1}${key.tween ? ' · tweens to the next' : ' · holds'}${key.ease ? ` · ease ${key.ease}` : ''} (drag to move, double-click to remove)` : `Frame ${f + 1} (double-click: keyframe)` });
    c.onpointerdown = e => {
      e.preventDefault(); on.select(row.id, f);
      if (!key) return;
      const move = ev => { const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tl-c'); for (const x of el.querySelectorAll('.tl-c.drop')) x.classList.remove('drop'); if (t && t.parentElement === c.parentElement) t.classList.add('drop'); };
      const up = ev => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tl-c'); if (t && t.parentElement === c.parentElement && +t.dataset.f !== f) on.move(row.id, f, +t.dataset.f); else for (const x of el.querySelectorAll('.tl-c.drop')) x.classList.remove('drop'); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
    c.ondblclick = () => on.toggle(row.id, f);
    return c;
  };
  const head = h('div', { class: 'tl-cells' }, ...Array.from({ length: N }, (_, f) => h('div', { class: 'tl-n' + (f === st.f ? ' ph' : '') + ((f + 1) % 5 === 0 || f === 0 ? ' show' : ''), 'data-f': f }, String(f + 1))));
  const scrub = e => { const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-f]'); if (t) on.seek(+t.dataset.f); };
  head.onpointerdown = e => { scrub(e); const mv = ev => scrub(ev), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  const labels = h('div', { class: 'tl-cells' }, ...Array.from({ length: N }, (_, f) => h('div', { class: 'tl-l', title: motion.labels?.[f] || '' }, motion.labels?.[f] ? '⚑ ' + motion.labels[f] : '')));
  el.replaceChildren(h('div', { class: 'tl-grid', style: { '--n': N } },
    h('div', { class: 'tl-row tl-top' }, h('div', { class: 'tl-name' }, 'Labels'), labels),
    h('div', { class: 'tl-row tl-top' }, h('div', { class: 'tl-name' }, ''), head),
    ...rows.map(row => h('div', { class: 'tl-row' + (row.id === st.row ? ' sel' : '') },
      h('div', { class: 'tl-name' + (row.hidden ? ' hid' : ''), style: { paddingLeft: 6 + row.depth * 10 + 'px' }, onclick: () => on.select(row.id, st.f) },
        row.part && on.visible ? h('button', { class: 'tl-eye', title: 'Show / hide this part (hidden parts are not baked)', onclick: e => { e.stopPropagation(); on.visible(row.id, !!row.hidden); } }, icon(row.hidden ? 'eyeoff' : 'eye')) : '',
        h('span', {}, row.name),
        row.part && on.lock ? h('button', { class: 'tl-lock' + (row.locked ? ' on' : ''), title: row.locked ? 'Locked: click to unlock' : 'Lock it so it can\'t be turned or painted by accident', onclick: e => { e.stopPropagation(); on.lock(row.id, !row.locked); } }, icon(row.locked ? 'lock' : 'unlock')) : ''),
      h('div', { class: 'tl-cells' }, ...Array.from({ length: N }, (_, f) => cell(row, f)))))));
}
