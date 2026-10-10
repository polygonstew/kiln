// Command wheel (Shift+A) and Kiln's own right-click menu.
// Three rings around the cursor: AREA (inner, the workspaces), TOOL (middle) and GUIDE (outer), filled by
// whichever workspace is showing. Black and gold, angular, in the spirit of an augmentation HUD.
// Tap Shift+A and click, or hold A, flick toward a segment and let go.
import { h, emit } from './core.js';

const providers = {};          // area id -> () => ({ tools: [item], guides: [item] })
const menus = [];              // [selector, (el, event) => [item]] for the right-click menu
let areas = () => [];          // [{id, label, key}]
let current = () => null;
// item: { label, key?, on?: bool, run: fn, hint? }

export function registerWheel(area, fn) { providers[area] = fn; }
export function registerMenu(selector, fn) { menus.push([selector, fn]); }
export function initWheel(getAreas, getCurrent) {
  areas = getAreas; current = getCurrent;
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'a' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target.matches?.('input,textarea,select,[contenteditable]')) return;
    e.preventDefault(); e.stopPropagation();
    if (W) return close();
    open(mouse[0], mouse[1], true);
  }, true);
  window.addEventListener('keyup', e => {
    // released after a flick onto a segment: run it (quick use); a plain tap leaves the wheel open
    if (W && W.held && e.key.toLowerCase() === 'a') { W.held = false; if (W.hot && W.moved) choose(W.hot); }
  }, true);
  window.addEventListener('pointermove', e => { mouse = [e.clientX, e.clientY]; }, true);
  document.addEventListener('contextmenu', e => {
    if (e.defaultPrevented || e.shiftKey) return;               // canvases that erase on right-click opt out; Shift = browser menu
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    e.preventDefault();
    showMenu(e);
  });
}
let mouse = [innerWidth / 2, innerHeight / 2];

/* ------------------------------------------------------------- wheel ---- */
const R = { c: 54, a0: 66, a1: 126, t0: 134, t1: 196, g0: 204, g1: 258 };
let W = null;
function open(x, y, held) {
  const P = providers[current()]?.() || {};
  const rings = [
    { name: 'AREA', r0: R.a0, r1: R.a1, items: areas().map(a => ({ label: a.label, key: a.key, on: a.id === current(), run: () => emit('tab', a.id) })) },
    { name: 'TOOL', r0: R.t0, r1: R.t1, items: P.tools || [] },
    { name: 'GUIDE', r0: R.g0, r1: R.g1, items: P.guides || [] },
  ];
  const S = R.g1 * 2 + 40, cx = S / 2;
  x = Math.max(S / 2, Math.min(innerWidth - S / 2, x)); y = Math.max(S / 2, Math.min(innerHeight - S / 2, y));
  const ns = 'http://www.w3.org/2000/svg', el = (t, a = {}, ...k) => { const n = document.createElementNS(ns, t); for (const [q, v] of Object.entries(a)) n.setAttribute(q, v); n.append(...k); return n; };
  const svg = el('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}`, class: 'dx-svg' });
  svg.append(el('defs', {}, el('pattern', { id: 'dxhex', width: 14, height: 24, patternUnits: 'userSpaceOnUse' },
    el('path', { d: 'M7 0 L14 4 L14 12 L7 16 L0 12 L0 4 Z M7 16 L7 24', fill: 'none', stroke: 'rgba(232,165,54,.07)', 'stroke-width': 1 }))));
  svg.append(el('circle', { cx, cy: cx, r: R.g1 + 14, fill: 'url(#dxhex)' }));
  const segs = [];
  for (const ring of rings) {
    const n = ring.items.length;
    // ring guide: a thin broken circle with the ring's name
    svg.append(el('circle', { cx, cy: cx, r: ring.r1 + 3, fill: 'none', stroke: 'rgba(232,165,54,.25)', 'stroke-width': 1, 'stroke-dasharray': '2 6' }));
    if (!n) { svg.append(el('text', { x: cx, y: cx - (ring.r0 + ring.r1) / 2 + 4, class: 'dx-empty', 'text-anchor': 'middle' }, `no ${ring.name.toLowerCase()}s here`)); continue; }
    const span = (Math.PI * 2) / n, gap = Math.min(0.06, span * 0.08);
    ring.items.forEach((it, i) => {
      const a0 = -Math.PI / 2 + i * span - span / 2 + gap, a1 = a0 + span - gap * 2;
      const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cx + r * Math.sin(a)).toFixed(1)}`;
      // chamfered segment: the outer corners are cut, which gives the angular look
      const ch = Math.min(0.05, (a1 - a0) * 0.18);
      const d = `M ${p(ring.r0, a0)} L ${p(ring.r1 - 8, a0)} L ${p(ring.r1, a0 + ch)} A ${ring.r1} ${ring.r1} 0 ${a1 - a0 - 2 * ch > Math.PI ? 1 : 0} 1 ${p(ring.r1, a1 - ch)} L ${p(ring.r1 - 8, a1)} L ${p(ring.r0, a1)} A ${ring.r0} ${ring.r0} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${p(ring.r0, a0)} Z`;
      const g = el('g', { class: 'dx-seg' + (it.on ? ' on' : '') });
      g.append(el('path', { d }));
      const am = (a0 + a1) / 2, rm = (ring.r0 + ring.r1) / 2;
      const t = el('text', { x: cx + rm * Math.cos(am), y: cx + rm * Math.sin(am) + 3, 'text-anchor': 'middle', class: 'dx-lbl' }, short(it.label, n > 10 ? 10 : 14));
      g.append(t);
      if (it.key) g.append(el('text', { x: cx + rm * Math.cos(am), y: cx + rm * Math.sin(am) + 14, 'text-anchor': 'middle', class: 'dx-key' }, it.key));
      g.addEventListener('pointerenter', () => hot({ it, ring: ring.name, g }));
      g.addEventListener('click', e => { e.stopPropagation(); choose({ it, ring: ring.name, g }); });
      svg.append(g); segs.push(g);
    });
  }
  // centre: hexagon readout
  const hx = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return `${cx + R.c * Math.cos(a)},${cx + R.c * Math.sin(a)}`; }).join(' ');
  svg.append(el('polygon', { points: hx, class: 'dx-core' }));
  const t1 = el('text', { x: cx, y: cx - 4, 'text-anchor': 'middle', class: 'dx-title' }, 'KILN');
  const t2 = el('text', { x: cx, y: cx + 12, 'text-anchor': 'middle', class: 'dx-sub' }, 'SELECT');
  svg.append(t1, t2);
  const box = h('div', { class: 'dx-wheel', style: { left: x - S / 2 + 'px', top: y - S / 2 + 'px', width: S + 'px', height: S + 'px' } }, svg);
  const veil = h('div', { class: 'dx-veil', onpointerdown: e => { if (e.target === veil) close(); }, oncontextmenu: e => { e.preventDefault(); close(); } }, box,
    h('div', { class: 'dx-help' }, 'SHIFT+A  ·  CLICK A SEGMENT  ·  OR HOLD A, FLICK, RELEASE  ·  ESC CLOSES'));
  document.body.append(veil);
  W = { veil, t1, t2, held, moved: false, hot: null, x, y };
  const esc = e => { if (e.key === 'Escape' && W) { e.stopPropagation(); close(); } };
  window.addEventListener('keydown', esc, true); W.esc = esc;
  veil.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x, e.clientY - y) > R.a0) W.moved = true; });
}
// "Rectangle (Shift: filled)" -> "RECTANGLE", "Move the whole frame" -> "MOVE THE WHOLE" fitted by words
function short(t, max) {
  t = t.replace(/\s*\(.*?\)\s*/g, ' ').trim().toUpperCase();
  if (t.length <= max) return t;
  let out = ''; for (const w of t.split(/\s+/)) { if ((out + ' ' + w).trim().length > max) break; out = (out + ' ' + w).trim(); }
  return out || t.slice(0, max);
}
function hot(s) {
  if (!W) return;
  W.hot?.g.classList.remove('hot'); W.hot = s; s.g.classList.add('hot');
  W.t1.textContent = s.it.label.toUpperCase().slice(0, 12); W.t2.textContent = s.ring + (s.it.hint ? ' · ' + s.it.hint.toUpperCase().slice(0, 18) : '');
}
function choose(s) { close(); try { s.it.run(); } catch (e) { console.error(e); } }
function close() {
  if (!W) return;
  window.removeEventListener('keydown', W.esc, true);
  W.veil.remove(); W = null;
}

/* -------------------------------------------------------------- menu ---- */
let M = null;
function showMenu(e) {
  closeMenu();
  const items = [];
  for (const [sel, fn] of menus) { const t = e.target.closest(sel); if (t) { const got = fn(t, e) || []; if (got.length) items.push(...got, null); } }
  const P = providers[current()]?.() || {};
  if (P.tools?.length) items.push({ head: 'Tools' }, ...P.tools.slice(0, 8), null);
  if (P.guides?.length) items.push({ head: 'Guides' }, ...P.guides.slice(0, 6), null);
  items.push({ label: 'Controls and shortcuts', key: '?', run: showKeys }, null, { head: 'Go to' }, ...areas().filter(a => a.id !== current()).map(a => ({ label: a.label, key: a.key, run: () => emit('tab', a.id) })), null,
    { label: 'Command wheel', key: 'Shift+A', run: () => open(e.clientX, e.clientY, false) }, { head: 'Shift + right-click: browser menu' });
  while (items.length && items[items.length - 1] === null) items.pop();
  const box = h('div', { class: 'dx-menu' }, ...items.map(it => it === null ? h('i', { class: 'dx-sep' })
    : it.head ? h('div', { class: 'dx-head' }, it.head)
      : h('button', { class: it.on ? 'on' : '', disabled: it.disabled || false, onclick: () => { closeMenu(); it.run(); } }, h('span', {}, it.label), it.key ? h('kbd', {}, it.key) : '')));
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px';
  box.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
  M = box;
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', escMenu, true); });
}
const outside = e => { if (M && !M.contains(e.target)) closeMenu(); };
const escMenu = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } };
function closeMenu() {
  if (!M) return;
  M.remove(); M = null;
  window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escMenu, true);
}

/* --------------------------------------------------------- shortcuts (?) ---- */
// Press ? anywhere for the keys and mouse moves that work in the area you're in, plus the global ones.
const KEYS = {
  '*': [['1 – 6', 'Switch area'], ['Shift+A', 'Command wheel (area / tool / guide)'], ['Right-click', 'Kiln menu (Shift+right-click: browser menu)'], ['?', 'This list'], ['Esc', 'Close wheel, menu or this list']],
  files: [['Enter', 'Open'], ['F2', 'Rename'], ['Delete', 'Move to trash'], ['Backspace', 'Up a folder'], ['Drop files', 'Copy them into this folder']],
  forge: [['Ctrl+V', 'Paste an image as the source'], ['Click source', 'Pick the background colour to remove'], ['Drop on guide box', 'Set a guide image'], ['Right-click a result', 'Use as source / as guide']],
  animate: [['Left click', 'Add pixels'], ['Right click', 'Remove pixels'], ['Mouse wheel', 'Roll through the palette'], ['Middle click', 'Pick the colour under the cursor'], ['Ctrl/Alt+wheel', 'Zoom'],
    ['B E G I L R M V', 'Pencil, eraser, fill, pick, line, rectangle, select, move'], ['Shift+drag (R)', 'Filled rectangle'], ['O', 'Onion skin'], ['H', 'Flip frame'], ['N', 'Copy frame'],
    [', and .', 'Previous / next frame'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / Ctrl+V', 'Copy / paste selection'], ['Enter or Esc', 'Drop the selection'], ['Delete', 'Clear the selection'], ['Drop a sheet', 'Cut it into frames']],
  scenes: [['← →', 'Pan the camera'], ['Space', 'Play / pause the scroll']],
  hud: [['Arrows', 'Nudge the widget (Shift: 8 px)'], ['Ctrl+D', 'Duplicate widget'], ['Delete', 'Remove widget']],
  stage: [['← →', 'Walk'], ['Shift', 'Run'], ['Space or ↑', 'Jump'], ['↓', 'Crouch'], ['Z', 'Attack'], ['X', 'Hurt'], ['K', 'Death / back to idle']],
};
export function registerKeys(area, list) { KEYS[area] = list; }
let K = null;
function showKeys() {
  if (K) return closeKeys();
  const area = current(), name = areas().find(a => a.id === area)?.label || '';
  const col = (title, list) => h('div', { class: 'dx-kcol' }, h('div', { class: 'dx-head' }, title), ...list.map(([k, d]) => h('div', { class: 'dx-krow' }, h('kbd', {}, k), h('span', {}, d))));
  K = h('div', { class: 'dx-veil dx-keys', onpointerdown: e => { if (e.target === K) closeKeys(); } },
    h('div', { class: 'dx-kbox' }, h('div', { class: 'dx-ktitle' }, 'CONTROLS', h('small', {}, name.toUpperCase())),
      h('div', { class: 'dx-kcols' }, KEYS[area] ? col(name, KEYS[area]) : null, col('Everywhere', KEYS['*']))));
  document.body.append(K);
}
function closeKeys() { K?.remove(); K = null; }
window.addEventListener('keydown', e => {
  if (e.target.matches?.('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?') { e.preventDefault(); showKeys(); }
  else if (e.key === 'Escape' && K) { e.stopPropagation(); closeKeys(); }
}, true);

/* ------------------------------------------------------- shared tooltips ---- */
// Buttons whose label is plain but whose effect isn't obvious get a tip here, once, for every area.
const TIPS = {
  'Bookmark this folder': 'Add this folder to Places in the sidebar', 'Folder': 'Make a new folder here', 'Import': 'Copy files from your computer into this folder',
  'Generate': 'Make new images from the description (they appear under Generated)', 'Clear list': 'Forget the Generated list (image files are kept)',
  'New actor in Animate': 'Start an actor from this sprite: its look, palette, size and scale become the reference', 'Add as frame': 'Add this sprite to the actor open in Animate',
  'Save PNG': 'Save this sprite into the asset folder', 'Save palette': 'Save these colours as a palette file (palettes/)',
  'Blank': 'Insert an empty frame after this one', 'Delete frame': 'Remove this frame (Ctrl+Z brings it back)', 'Delete anim': 'Remove this whole animation (asks first)',
  'New': 'Start a new one (the current one is autosaved)', 'Open': 'Open one you saved before', 'Delete': 'Delete this (asks first)',
  'Described layer': 'A layer drawn from your words, matched to the layers behind it', 'Image…': 'Use an image file as a layer',
  'Bar': 'Add a health/stamina bar', 'Gauge': 'Add a round or segmented gauge', 'Pips': 'Add a row of icons (flasks, hearts)', 'Panel': 'Add a nine-slice panel',
  'Slot': 'Add an item slot', 'Portrait': 'Add a portrait frame', 'Counter': 'Add a number counter (souls, coins)', 'Text': 'Add a text label in a bitmap font',
  'Save font for engines': 'Write the bitmap font as .fnt + .png (Godot loads it as a FontFile)',
};
const tip = el => { if (el.title || el.dataset.tip) return; const t = TIPS[el.textContent.trim()] || (/^Save /.test(el.textContent.trim()) ? 'Save into the asset folder, ready for Godot' : null); if (t) el.title = t; el.dataset.tip = 1; };
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('button')) tip(n); n.querySelectorAll?.('button').forEach(tip); } })
  .observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll('button').forEach(tip);
