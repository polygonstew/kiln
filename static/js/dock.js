// Docks: every area's side panels (the sections of its left and right columns) become panels you arrange yourself.
// Drag a panel by its title to the left, right or bottom dock (or to another place in the same one), click its title
// to fold it, ✕ to put it away (the Layout menu brings it back), pin a whole dock to the screen's edge so it slides
// out only when you point at it, and drag a dock's edge to resize it. The layout is kept per area; Layout → Save
// layout as… keeps named ones (workspaces). Simple mode hides the advanced panels everywhere.
// Areas know nothing of this: they keep building their columns as before (now hidden "sources"), and every time
// they do, the panels are moved to where you put them. app.js calls dockArea() once per area.
import { h, pref, emit } from './core.js';

const SKIP = new Set(['gamedoc']);              // areas that read their own columns later (the Game doc's contents)
// advanced panels (by area and title) that Simple mode hides
export const ADVANCED = { forge: ['Hardware', 'Colour', 'Clean-up'], levels: ['Layers'], scenes: ['Weather', 'Review'], animate: ['Juice', 'Hit boxes'], rooms: ['Depth'], hud: ['Style'] };
const areas = {};                               // id → { el, zones, src, placed, layout }
// panels any area can add (Layout ▾ → Add a panel): made fresh for each area that asks
const EXTRA = { Assets: () => import('./assets.js').then(m => m.assetShelf()), Preview: () => import('./preview.js').then(m => m.previewPanel()) };

const keyOf = (node, side, i) => { const t = node.querySelector?.(':scope > h3'); const txt = t ? [...t.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : ''; return txt || `${side}#${i}`; };
// the canvases that take dropped assets start with the shelf under them
const START_EXTRA = { flow: ['Assets'], levels: ['Assets'], rooms: ['Assets'] };
const blank = id => ({ where: {}, order: { l: [], r: [], b: [] }, hidden: [], folded: [], pinned: {}, size: { l: 300, r: 330, b: 220 }, extra: [...(START_EXTRA[id] || [])] });
const load = id => Object.assign(blank(id), pref.get('dock.' + id, {}));
const keep = id => { pref.set('dock.' + id, areas[id].layout); };

export function dockArea(id, el) {
  if (SKIP.has(id) || areas[id]) return;
  const srcL = el.querySelector(':scope > aside.l'), srcR = el.querySelector(':scope > aside.r'), stage = el.querySelector(':scope > section.stage');
  if (!stage || (!srcL && !srcR)) return;
  const A = areas[id] = { id, el, layout: load(id), placed: { l: [], r: [] }, zones: {} };
  el.classList.add('dk'); el.style.gridTemplateColumns = '';
  for (const s of [srcL, srcR]) if (s) s.classList.add('dk-src');
  for (const z of ['l', 'r', 'b']) {
    const zone = h('div', { class: 'dk-zone dk-' + z, 'data-zone': z },
      h('div', { class: 'dk-bar' }, h('button', { class: 'dk-pin', title: 'Pin this dock to the edge: it slides out when you point at it', onclick: () => pin(A, z) }, z === 'b' ? '⤓' : z === 'l' ? '⇤' : '⇥')),
      h('div', { class: 'dk-list' }), h('div', { class: 'dk-size', title: 'Drag to resize', onpointerdown: e => resize(A, z, e) }));
    zone.addEventListener('pointerenter', () => zone.classList.add('peek')); zone.addEventListener('pointerleave', () => zone.classList.remove('peek'));
    A.zones[z] = zone; el.append(zone);
  }
  A.hold = h('div', { class: 'dk-hold', hidden: true }); el.append(A.hold);
  // a column rebuilt with replaceChildren replaces its panels; anything appended joins them
  for (const [side, s] of [['l', srcL], ['r', srcR]]) if (s) {
    s.replaceChildren = (...n) => { A.fresh = { ...A.fresh, [side]: true }; return Element.prototype.replaceChildren.apply(s, n); };
    new MutationObserver(() => place(A, side, s)).observe(s, { childList: true });
    A.fresh = { ...A.fresh, [side]: true }; place(A, side, s);
  }
  for (const k of A.layout.extra) addExtra(A, k);
  apply(A);
}

// a column was (re)built: move its panels to their docks, in their order; the ones it had before go
function place(A, side, src) {
  // a wrapper holding several sections (an inspector) gives each of them as a panel
  const kids = [...src.children].flatMap(k => !k.classList.contains('sec') && k.querySelector(':scope > .sec') ? [...k.children] : [k]);
  if (!kids.length) return;
  if (A.fresh?.[side]) { for (const old of A.placed[side]) old.remove(); A.placed[side] = []; A.fresh[side] = false; }
  const base = A.placed[side].length;
  A.placed[side].push(...kids);
  kids.forEach((node, j) => { const i = base + j;
    const k = keyOf(node, side, i);
    node.dataset.dk = k; node.classList.add('dk-panel');
    if (ADVANCED[A.id]?.includes(k)) node.dataset.adv = '1';
    head(A, node, k);
    put(A, node, k, A.layout.where[k] || side);
  });
  apply(A);
}
// an added panel (the asset shelf, the preview): bottom dock unless moved
async function addExtra(A, k) {
  if (!EXTRA[k] || A.el.querySelector(`.dk-panel[data-dk="${k}"]`)) return;
  const node = await EXTRA[k]();
  node.dataset.dk = k; node.classList.add('dk-panel', 'dk-extra');
  head(A, node, k);
  put(A, node, k, A.layout.where[k] || (k === 'Assets' ? 'b' : 'r'));
  apply(A);
}
function put(A, node, k, zone) {
  if (A.layout.hidden.includes(k)) return A.hold.append(node);
  const list = A.zones[zone].querySelector('.dk-list'), order = A.layout.order[zone];
  if (!order.includes(k)) order.push(k);
  const at = order.indexOf(k), next = [...list.children].find(c => order.indexOf(c.dataset.dk) > at);
  list.insertBefore(node, next || null);
  node.classList.toggle('dk-folded', A.layout.folded.includes(k));
}
// the panel's title becomes its handle: drag to move, click to fold, ✕ to put away
function head(A, node, k) {
  let t = node.querySelector(':scope > h3');
  if (!t) { t = h('h3', { class: 'dk-mini' }, k.includes('#') ? 'Panel' : k); node.prepend(t); }
  if (t.dataset.dk) return;
  t.dataset.dk = '1'; t.classList.add('dk-head');
  t.prepend(h('i', { class: 'dk-grip', title: 'Drag to another dock' }, '⋮⋮'));
  t.append(h('button', { class: 'dk-x', title: 'Put this panel away (Layout ▾ brings it back)', onclick: e => { e.stopPropagation(); A.layout.hidden.push(k); keep(A.id); A.hold.append(node); apply(A); } }, '✕'));
  t.addEventListener('click', e => { if (e.target.closest('button,input,select,a') || t.dataset.moved) return; node.classList.toggle('dk-folded'); A.layout.folded = node.classList.contains('dk-folded') ? [...new Set([...A.layout.folded, k])] : A.layout.folded.filter(x => x !== k); keep(A.id); });
  t.addEventListener('pointerdown', e => drag(A, node, k, e));
}

function drag(A, node, k, e) {
  if (e.button !== 0 || e.target.closest('button,input,select,a,textarea')) return;
  const x0 = e.clientX, y0 = e.clientY; let ghost = null, mark = null, target = null;
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!ghost) { ghost = h('div', { class: 'dk-ghost' }, k.includes('#') ? 'Panel' : k); document.body.append(ghost); mark = h('div', { class: 'dk-mark' }); A.el.classList.add('dk-dragging'); node.querySelector('.dk-head').dataset.moved = '1'; }
    ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 8 + 'px';
    const zone = document.elementsFromPoint(ev.clientX, ev.clientY).map(el => el.closest?.('.dk-zone')).find(z => z && A.el.contains(z));
    if (!zone) { mark.remove(); target = null; return; }
    const z = zone.dataset.zone, list = zone.querySelector('.dk-list'), horiz = z === 'b';
    const before = [...list.children].find(c => c !== node && (horiz ? ev.clientX < c.getBoundingClientRect().left + c.offsetWidth / 2 : ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2));
    list.insertBefore(mark, before || null); target = { z, before: before?.dataset.dk };
  };
  const up = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    if (!ghost) return;
    ghost.remove(); mark.remove(); A.el.classList.remove('dk-dragging');
    setTimeout(() => delete node.querySelector('.dk-head').dataset.moved, 0);
    if (!target) return;
    for (const z of ['l', 'r', 'b']) A.layout.order[z] = A.layout.order[z].filter(x => x !== k);
    const o = A.layout.order[target.z], i = target.before ? o.indexOf(target.before) : -1;
    o.splice(i < 0 ? o.length : i, 0, k);
    A.layout.where[k] = target.z; keep(A.id); put(A, node, k, target.z); apply(A);
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}

function resize(A, z, e) {
  e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY, s0 = A.layout.size[z];
  const move = ev => { A.layout.size[z] = Math.max(160, Math.min(z === 'b' ? 600 : 640, s0 + (z === 'l' ? ev.clientX - x0 : z === 'r' ? x0 - ev.clientX : y0 - ev.clientY))); apply(A); };
  const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); keep(A.id); };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
function pin(A, z) { A.layout.pinned[z] = !A.layout.pinned[z]; keep(A.id); apply(A); }

// sizes, pinned docks, empty docks out of the way
function apply(A) {
  const L = A.layout, has = z => A.zones[z].querySelector('.dk-list').children.length > 0;
  const w = z => !has(z) ? 0 : L.pinned[z] ? 30 : L.size[z];
  A.el.style.setProperty('--dkL', w('l') + 'px'); A.el.style.setProperty('--dkR', w('r') + 'px'); A.el.style.setProperty('--dkB', w('b') + 'px');
  for (const z of ['l', 'r', 'b']) { A.zones[z].classList.toggle('pinned', !!L.pinned[z]); A.zones[z].classList.toggle('empty', !has(z)); A.zones[z].style.setProperty('--full', L.size[z] + 'px'); }
  emit('dock', A.id);
}

/* ------------------------------------------------------------ the Layout menu ---- */
export function layoutMenu(id) {
  const A = areas[id];
  const items = [];
  if (A) {
    const all = [...A.el.querySelectorAll('.dk-panel:not(.dk-extra)')].map(n => n.dataset.dk).filter((k, i, a) => a.indexOf(k) === i);
    items.push(['Panels', null], ...all.map(k => [(A.layout.hidden.includes(k) ? '☐ ' : '☑ ') + (k.includes('#') ? 'Panel ' + k.split('#')[1] : k), () => {
      A.layout.hidden = A.layout.hidden.includes(k) ? A.layout.hidden.filter(x => x !== k) : [...A.layout.hidden, k]; keep(id);
      const node = A.el.querySelector(`.dk-panel[data-dk="${CSS.escape(k)}"]`); if (A.layout.hidden.includes(k)) A.hold.append(node); else put(A, node, k, A.layout.where[k] || (A.placed.r.includes(node) ? 'r' : 'l')); apply(A);
    }]));
    items.push(['Add a panel', null], ...Object.keys(EXTRA).map(k => [(A.layout.extra.includes(k) ? '☑ ' : '☐ ') + k, () => {
      if (A.layout.extra.includes(k)) { A.layout.extra = A.layout.extra.filter(x => x !== k); A.el.querySelector(`.dk-panel[data-dk="${k}"]`)?.remove(); }
      else { A.layout.extra.push(k); A.layout.hidden = A.layout.hidden.filter(x => x !== k); addExtra(A, k); }
      keep(id); apply(A); }]));
    const saved = pref.get('dock.saved.' + id, {});
    items.push(['Layouts', null], ['Save this layout as…', () => { const n = prompt('Name for this layout', 'My layout'); if (n) pref.set('dock.saved.' + id, { ...saved, [n]: A.layout }); }],
      ...Object.keys(saved).map(n => [`Use "${n}"`, () => { A.layout = Object.assign(blank(id), JSON.parse(JSON.stringify(saved[n]))); keep(id); relayout(A); }]),
      ['Reset to Kiln\'s layout', () => { A.layout = blank(id); keep(id); relayout(A); }]);
  } else items.push(['This area has no panels to arrange', null]);
  items.push(['View', null], [(document.body.classList.contains('simple') ? '☑' : '☐') + ' Simple mode (hide the advanced panels)', () => setSimple(!document.body.classList.contains('simple'))]);
  return items;
}
function relayout(A) {
  for (const n of [...A.el.querySelectorAll('.dk-panel')]) {
    if (n.classList.contains('dk-extra') && !A.layout.extra.includes(n.dataset.dk)) { n.remove(); continue; }
    const side = A.placed.r.includes(n) ? 'r' : 'l'; put(A, n, n.dataset.dk, A.layout.where[n.dataset.dk] || side);
  }
  for (const k of A.layout.extra) addExtra(A, k);
  apply(A);
}
export function setSimple(on) { document.body.classList.toggle('simple', on); pref.set('simple', on); }
setSimple(pref.get('simple', false));
