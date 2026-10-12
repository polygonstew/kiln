// Layer panels: one look and feel for every area with layers (Scenes, HUD widgets, Levels, Puppet parts, Forge's
// Background maker). Each row has a thumbnail, its name (double-click or F2 to rename), a line under it, an eye (click:
// show / hide; Alt+click: show only this one) and a lock (a locked layer can't be changed, moved or deleted). Drag a row
// to reorder (a line shows where it lands); right-click for the menu. Above the list: the selected layer's blend and
// opacity. Below it: add, duplicate, delete, move. The area owns its layers; this only draws them and calls back:
//   o = { items, sel, key(L), name(L), sub?(L), thumb?(L) → canvas, visible(L), locked?(L), solo?: key | null,
//         front?: 'top' | 'bottom' (which end of the list is in front, for the menu words), empty?: text,
//         on: { select(i), visible(i, v), rename?(i, name), lock?(i, v), solo?(key | null), move?(from, to),
//               add?() or [[label, fn]], dup?(i), del?(i), opacity?: { get(L), set(i, v) }, blend?: { options, get(L), set(i, v) } } }
import { h } from './core.js';
import { icon } from './icons.js';
import { registerMenu } from './wheel.js';

let last = { k: null, t: 0 };       // the last row clicked: a second click on its name soon after renames it

export function layerPanel(o) {
  const { items, on } = o, sel = o.sel ?? -1, L = items[sel], key = o.key || (x => x.id);
  const locked = x => !!o.locked?.(x);
  const root = h('div', { class: 'lp', tabindex: 0, onkeydown: e => keys(e, o) });
  if (L && (on.opacity || on.blend)) {
    const op = on.opacity?.get(L) ?? 1, out = h('output', {}, Math.round(op * 100) + '%');
    root.append(h('div', { class: 'lp-top' + (locked(L) ? ' off' : '') },
      on.blend ? h('select', { title: 'Blend: how this layer mixes with the ones behind it', disabled: locked(L), onchange: e => on.blend.set(sel, e.target.value) },
        ...on.blend.options.map(([k, l]) => h('option', { value: k, selected: on.blend.get(L) === k }, l))) : '',
      on.opacity ? h('label', { class: 'lp-op', title: 'Opacity of the selected layer' }, h('span', {}, 'Opacity'),
        h('input', { type: 'range', min: 0, max: 1, step: .05, value: op, disabled: locked(L), oninput: e => { out.textContent = Math.round(e.target.value * 100) + '%'; on.opacity.set(sel, +e.target.value); } }), out) : ''));
  }
  const list = h('div', { class: 'lp-list' });
  let from = null;
  items.forEach((x, i) => {
    const k = key(x), vis = o.visible(x), lk = locked(x);
    const nm = h('b', { title: on.rename ? 'Double-click to rename' : '' }, o.name(x));
    const row = h('div', { class: 'lp-row' + (i === sel ? ' on' : '') + (vis ? '' : ' hid') + (o.solo != null && o.solo !== k ? ' dim' : '') + (lk ? ' locked' : ''),
      draggable: !!on.move && !lk, 'data-key': k, onclick: e => {
        const again = last.k === k && Date.now() - last.t < 450 && e.target.closest('.lp-nm') && on.rename;
        last = again ? { k: null, t: 0 } : { k, t: Date.now() };
        if (i !== sel) on.select(i);                       // (selecting redraws the list: find the row again to rename)
        if (again) { const r = [...document.querySelectorAll('.lp-row')].find(x => x.dataset.key === String(k) && x.isConnected); if (r?._lp) rename(r.querySelector('.lp-nm b'), x, r._lp.i, r._lp.o); }
      } },
      h('button', { class: 'lp-eye' + (o.solo === k ? ' solo' : ''), title: 'Show / hide · Alt+click: show only this one', onclick: e => {
        e.stopPropagation();
        if (e.altKey && on.solo) on.solo(o.solo === k ? null : k); else on.visible(i, !vis);
      } }, icon(o.solo === k ? 'solo' : vis ? 'eye' : 'eyeoff')),
      o.thumb ? h('span', { class: 'lp-thumb' }, o.thumb(x) || '') : '',
      h('span', { class: 'lp-nm' }, nm, o.sub ? h('small', {}, o.sub(x)) : ''),
      on.lock ? h('button', { class: 'lp-lock' + (lk ? ' on' : ''), title: lk ? 'Locked: click to unlock' : 'Lock it so it can\'t be changed by accident', onclick: e => { e.stopPropagation(); on.lock(i, !lk); } }, icon(lk ? 'lock' : 'unlock')) : '');
    row._lp = { o, i };
    if (on.move) {
      row.addEventListener('dragstart', e => { from = i; e.dataTransfer.effectAllowed = 'move'; row.classList.add('lifted'); });
      row.addEventListener('dragend', () => { row.classList.remove('lifted'); list.querySelectorAll('.drop-a, .drop-b').forEach(r => r.classList.remove('drop-a', 'drop-b')); });
      row.addEventListener('dragover', e => {
        if (from == null) return; e.preventDefault();
        const below = e.clientY - row.getBoundingClientRect().top > row.offsetHeight / 2;
        list.querySelectorAll('.drop-a, .drop-b').forEach(r => r.classList.remove('drop-a', 'drop-b'));
        row.classList.add(below ? 'drop-b' : 'drop-a');
      });
      row.addEventListener('drop', e => {
        e.preventDefault(); if (from == null) return;
        let to = e.clientY - row.getBoundingClientRect().top > row.offsetHeight / 2 ? i + 1 : i;
        if (from < to) to--;
        const f = from; from = null;
        if (to !== f && !locked(items[f])) on.move(f, to);
      });
    }
    list.append(row);
  });
  if (!items.length) list.append(h('p', { class: 'note' }, o.empty || 'No layers yet.'));
  const btn = (ic, title, fn, off) => h('button', { class: 'ibtn', title, disabled: !!off, onclick: fn }, icon(ic));
  const addBtn = Array.isArray(on.add)
    ? h('button', { class: 'ibtn', title: 'Add a layer', onclick: e => addMenu(e.currentTarget, on.add) }, icon('plus'))
    : on.add ? btn('plus', 'Add a layer', on.add) : '';
  const up = o.front === 'top' ? 'Toward the front' : 'Toward the back', down = o.front === 'top' ? 'Toward the back' : 'Toward the front';
  root.append(list, h('div', { class: 'lp-bar' }, addBtn,
    on.dup ? btn('dup', 'Duplicate (Ctrl+D)', () => on.dup(sel), !L) : '',
    on.del ? btn('trash', 'Delete (Delete)', () => on.del(sel), !L || locked(L)) : '',
    h('span', { class: 'grow' }),
    on.move ? btn('up', up, () => on.move(sel, sel - 1), !L || sel <= 0 || locked(L)) : '',
    on.move ? btn('down', down, () => on.move(sel, sel + 1), !L || sel >= items.length - 1 || locked(L)) : ''));
  return root;
}

function rename(nm, x, i, o) {
  const inp = h('input', { type: 'text', class: 'lp-rename', value: o.name(x) });
  let fin = false;          // Enter, Escape and the blur that removing the box causes: finish once
  const done = ok => { if (fin) return; fin = true; const v = inp.value.trim(); if (inp.isConnected) inp.replaceWith(nm); if (ok && v && v !== o.name(x)) o.on.rename(i, v); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(true);
  inp.onclick = e => e.stopPropagation();
  nm.replaceWith(inp); inp.focus(); inp.select();
}
function keys(e, o) {
  if (e.target.matches('input, select, textarea')) return;
  const i = o.sel ?? -1, L = o.items[i];
  if (!L) return;
  const lk = !!o.locked?.(L);
  if (e.key === 'F2' && o.on.rename) { e.preventDefault(); const nm = e.currentTarget.querySelectorAll('.lp-row')[i]?.querySelector('.lp-nm b'); if (nm) rename(nm, L, i, o); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && o.on.del && !lk) { e.preventDefault(); e.stopPropagation(); o.on.del(i); }
  else if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && o.on.dup) { e.preventDefault(); e.stopPropagation(); o.on.dup(i); }
  else if (e.key === 'ArrowUp' && i > 0 && !e.altKey) { e.preventDefault(); o.on.select(i - 1); }
  else if (e.key === 'ArrowDown' && i < o.items.length - 1 && !e.altKey) { e.preventDefault(); o.on.select(i + 1); }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey && o.on.move && !lk) { e.preventDefault(); const j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j >= 0 && j < o.items.length) o.on.move(i, j); }
  else return;
  // the panel was redrawn: keep the keys going to it
  requestAnimationFrame(() => document.querySelector('.lp-row.on')?.closest('.lp')?.focus({ preventScroll: true }));
}
function addMenu(anchor, list) {
  document.querySelector('.lp-add')?.remove();
  const r = anchor.getBoundingClientRect();
  const m = h('div', { class: 'lp-add', style: { left: r.left + 'px', top: r.bottom + 4 + 'px' } }, ...list.map(([label, fn]) => h('button', { onclick: () => { m.remove(); fn(); } }, label)));
  document.body.append(m);
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
}

// right-click a row: the same actions as words
registerMenu('.lp-row', el => {
  const { o, i } = el._lp || {}; if (!o) return [];
  const L = o.items[i], on = o.on, k = (o.key || (x => x.id))(L), lk = !!o.locked?.(L), vis = o.visible(L);
  return [{ head: o.name(L) },
    on.rename && { label: 'Rename', key: 'F2', run: () => { const nm = el.querySelector('.lp-nm b'); if (nm?.isConnected) rename(nm, L, i, o); } },
    { label: vis ? 'Hide' : 'Show', run: () => on.visible(i, !vis) },
    on.solo && { label: o.solo === k ? 'Show all again' : 'Show only this one', key: 'Alt+click eye', run: () => on.solo(o.solo === k ? null : k) },
    on.lock && { label: lk ? 'Unlock' : 'Lock', run: () => on.lock(i, !lk) },
    on.dup && { label: 'Duplicate', key: 'Ctrl+D', run: () => on.dup(i) },
    on.move && !lk && { label: o.front === 'top' ? 'Bring forward' : 'Send backward', disabled: i <= 0, run: () => on.move(i, i - 1) },
    on.move && !lk && { label: o.front === 'top' ? 'Send backward' : 'Bring forward', disabled: i >= o.items.length - 1, run: () => on.move(i, i + 1) },
    on.del && { label: 'Delete', key: 'Delete', disabled: lk, run: () => on.del(i) }].filter(Boolean);
});
