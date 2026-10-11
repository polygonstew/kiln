// Logic graph editor: nodes on a board you pan (drag the board) and zoom (wheel), wired port to port (drag from a
// port to another; drop on empty board to pick a node that fits and wire it in one go). Fields sit on the nodes and
// hide while a wire feeds that input. Box select (Shift+drag), Ctrl+C / V / D, Delete, Ctrl+Z / Y, F shows everything.
// It edits the graph object in place and calls onChange(structural) after each change; logic.js saves and compiles.
import { h, clamp } from './core.js';
import { NODES, CATS, KEY_OPTIONS, portsOf, fits } from './graph_nodes.js';
import { fieldsOf } from './graph_compile.js';

export const COL = { exec: '#e6e2d6', num: '#5fbf7f', text: '#e07fb0', bool: '#e8694f', any: '#a8a49a' };
const TYPE_NAME = { exec: 'chain', num: 'number', text: 'text', bool: 'yes/no', any: 'anything' };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
const curve = ([x1, y1], [x2, y2]) => { const d = Math.max(30, Math.abs(x2 - x1) / 2); return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };
const snap = v => Math.round(v / 10) * 10;

export function graphView({ onChange, lists }) {
  let G = { nodes: [], wires: [] }, view = { x: 40, y: 40, z: 1 }, sel = new Set(), selWire = null, drag = null, mouse = [0, 0], clip = null;
  const undoS = [], redoS = [];
  const world = h('div', { class: 'gv-world' }), svg = svgEl('svg', { class: 'gv-wires' }), temp = svgEl('path', { class: 'gv-w gv-temp' });
  const menu = h('div', { class: 'gv-menu', style: { display: 'none' } }), box = h('div', { class: 'gv-box', style: { display: 'none' } });
  const zones = h('datalist', { id: 'gv-zones' });
  const el = h('div', { class: 'gv', tabIndex: 0 }, world, box, menu, zones,
    h('div', { class: 'gv-hint' }, 'Drag from a port to wire · drop on the board to add a node that fits · right-click or double-click the board to add · wheel zooms · drag the board to pan · Shift+drag selects · Del · Ctrl+D · F'));
  world.append(svg);
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  const byId = id => G.nodes.find(n => n.id === id);
  const nodeEl = id => world.querySelector(`.gv-node[data-id="${id}"]`);
  const portEl = (id, port, dir) => world.querySelector(`.gv-port[data-node="${id}"][data-port="${port}"][data-dir="${dir}"]`);
  const toWorld = e => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left - view.x) / view.z, (e.clientY - r.top - view.y) / view.z]; };
  const portAt = p => { const r = p.getBoundingClientRect(), w = world.getBoundingClientRect(); return [(r.left + r.width / 2 - w.left) / view.z, (r.top + r.height / 2 - w.top) / view.z]; };

  /* ------------------------------------------------------------- drawing ---- */
  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    el.style.backgroundSize = `${20 * view.z}px ${20 * view.z}px`; el.style.backgroundPosition = `${view.x}px ${view.y}px`;
  }
  function render() {
    world.replaceChildren(svg, ...G.nodes.filter(n => NODES[n.type]).map(drawNode));
    requestAnimationFrame(drawWires);
  }
  function drawNode(n) {
    const N = NODES[n.type], f = fieldsOf(n), P = portsOf(n.type), outs = P.filter(p => p.dir === 'out'), execIn = P.find(p => p.dir === 'in' && p.type === 'exec');
    const port = p => {
      const e = h('span', { class: 'gv-port' + (p.type === 'exec' ? ' ex' : ''), 'data-node': n.id, 'data-port': p.id, 'data-dir': p.dir, 'data-type': p.type,
        title: `${p.label || (p.dir === 'in' ? 'in' : 'then')} (${TYPE_NAME[p.type]})` });
      e.style.setProperty('--c', COL[p.type]);      // (a CSS variable: style.x = … does not set these)
      return e;
    };
    const wired = id => G.wires.some(w => w.to[0] === n.id && w.to[1] === id);
    const single = outs.length === 1;
    const rows = [];
    const inRow = ([id, t, label]) => rows.push(h('div', { class: 'gv-row' }, port(P.find(q => q.id === id && q.dir === 'in')), label ? h('span', { class: 'gv-l' }, label) : '',
      wired(id) ? h('span', { class: 'gv-wired' }, '◂ wired') : control(n, id, t === 'bool' ? 'check' : t === 'num' ? 'num' : 'text', f[id])));
    (N.ins || []).forEach(inRow);
    for (const [id, label, kind, , opts] of N.fields || []) rows.push(h('div', { class: 'gv-row' }, h('i', { class: 'gv-sp' }), label ? h('span', { class: 'gv-l' }, label) : '', control(n, id, kind, f[id], opts)));
    (N.ins2 || []).forEach(inRow);
    if (!single) for (const p of outs) rows.push(h('div', { class: 'gv-row out' }, h('span', { class: 'gv-l' }, p.label || p.id), port(p)));
    return h('div', { class: 'gv-node' + (sel.has(n.id) ? ' sel' : ''), 'data-id': n.id, style: { left: n.x + 'px', top: n.y + 'px' } },
      h('div', { class: 'gv-head cat-' + N.cat, title: N.hint || '' }, execIn ? port(execIn) : h('i', { class: 'gv-sp' }), h('span', { class: 'gv-title' }, N.label), single ? port(outs[0]) : h('i', { class: 'gv-sp' })),
      rows.length ? h('div', { class: 'gv-body' }, ...rows) : '');
  }
  // a field on a node; changes are saved straight into the node
  function control(n, id, kind, v, opts) {
    const set = val => { push(); n.f = { ...n.f, [id]: val }; onChange(false); };
    let c;
    if (kind === 'check') c = h('input', { type: 'checkbox', checked: v === true || v === 'true', onchange: e => set(e.target.checked) });
    else if (kind === 'num') c = h('input', { type: 'number', value: v, step: 'any', onchange: e => set(+e.target.value) });
    else if (kind === 'text' || kind === 'zone') c = h('input', { type: 'text', value: v ?? '', list: kind === 'zone' ? 'gv-zones' : null, placeholder: kind === 'zone' ? 'zone name' : '', onchange: e => set(e.target.value) });
    else {
      const L = lists(), options = kind === 'sel' ? opts : kind === 'key' ? KEY_OPTIONS : kind === 'var' ? L.vars.map(x => [x.name, x.name]) : kind === 'actor' ? L.actors : kind === 'sound' ? L.sounds : kind === 'voice' ? L.voices : [];
      c = h('select', { onchange: e => set(e.target.value) }, ...(['var', 'actor', 'sound', 'voice'].includes(kind) ? [h('option', { value: '' }, '— pick —')] : []),
        ...options.map(([k, l]) => h('option', { value: k, selected: k === v }, l)));
      if (v && !options.some(o => o[0] === v)) c.append(h('option', { value: v, selected: true }, v + ' (missing)'));
    }
    c.classList.add('gv-in');
    c.addEventListener('pointerdown', e => e.stopPropagation()); c.addEventListener('keydown', e => e.stopPropagation());
    return c;
  }
  function drawWires() {
    svg.replaceChildren(temp);
    for (const w of G.wires) {
      const a = portEl(w.from[0], w.from[1], 'out'), b = portEl(w.to[0], w.to[1], 'in');
      if (!a || !b) continue;
      const d = curve(portAt(a), portAt(b)), t = a.dataset.type;
      const hit = svgEl('path', { d, class: 'gv-hit' });
      hit.addEventListener('pointerdown', e => { e.stopPropagation(); selWire = w; sel.clear(); markSel(); drawWires(); el.focus(); });
      svg.append(svgEl('path', { d, class: 'gv-w' + (t === 'exec' ? ' ex' : '') + (w === selWire ? ' sel' : ''), stroke: COL[t] }), hit);
    }
  }
  const markSel = () => world.querySelectorAll('.gv-node').forEach(e => e.classList.toggle('sel', sel.has(e.dataset.id)));

  /* -------------------------------------------------------------- editing ---- */
  const snapshot = () => JSON.stringify({ nodes: G.nodes, wires: G.wires });
  const push = () => { undoS.push(snapshot()); if (undoS.length > 60) undoS.shift(); redoS.length = 0; };
  const restore = s => { const d = JSON.parse(s); G.nodes = d.nodes; G.wires = d.wires; sel.clear(); selWire = null; render(); onChange(true); };
  const undo = () => { if (undoS.length) { redoS.push(snapshot()); restore(undoS.pop()); } };
  const redo = () => { if (redoS.length) { undoS.push(snapshot()); restore(redoS.pop()); } };
  const newId = () => { let i = G.nodes.length + 1; while (byId('n' + i)) i++; return 'n' + i; };
  // join two ports (either order); an exec output and a data input hold one wire, the old one goes
  function link(a, b) {
    const [o, i] = a.dir === 'out' ? [a, b] : [b, a];
    if (o.dir !== 'out' || i.dir !== 'in' || o.node === i.node || !fits(o.type, i.type)) return false;
    G.wires = G.wires.filter(w => !(i.type !== 'exec' && w.to[0] === i.node && w.to[1] === i.port) && !(o.type === 'exec' && w.from[0] === o.node && w.from[1] === o.port));
    G.wires.push({ from: [o.node, o.port], to: [i.node, i.port] });
    return true;
  }
  const portInfo = e => ({ node: e.dataset.node, port: e.dataset.port, dir: e.dataset.dir, type: e.dataset.type });
  const fitsPort = (from, p) => p.dir !== from.dir && (from.dir === 'out' ? fits(from.type, p.type) : fits(p.type, from.type));
  function add(type, at, from = null) {
    push();
    const n = { id: newId(), type, x: snap(at[0]), y: snap(at[1]), f: {} };
    G.nodes.push(n); sel = new Set([n.id]); selWire = null;
    if (from) { const p = portsOf(type).find(p => fitsPort(from, p)); if (p) link(from, { node: n.id, port: p.id, dir: p.dir, type: p.type }); }
    render(); onChange(true); el.focus();
    return n;
  }
  function del() {
    if (selWire) { push(); G.wires = G.wires.filter(w => w !== selWire); selWire = null; }
    else if (sel.size) { push(); G.nodes = G.nodes.filter(n => !sel.has(n.id)); G.wires = G.wires.filter(w => !sel.has(w.from[0]) && !sel.has(w.to[0])); sel.clear(); }
    else return;
    render(); onChange(true);
  }
  const copySel = () => { const ns = G.nodes.filter(n => sel.has(n.id)); if (ns.length) clip = JSON.parse(JSON.stringify({ nodes: ns, wires: G.wires.filter(w => sel.has(w.from[0]) && sel.has(w.to[0])) })); };
  function paste(at) {
    if (!clip?.nodes.length) return;
    push();
    const x0 = Math.min(...clip.nodes.map(n => n.x)), y0 = Math.min(...clip.nodes.map(n => n.y)), map = {};
    sel = new Set();
    for (const n of clip.nodes) { const id = newId(); map[n.id] = id; G.nodes.push({ ...JSON.parse(JSON.stringify(n)), id, x: snap(at[0] + n.x - x0), y: snap(at[1] + n.y - y0) }); sel.add(id); }
    for (const w of clip.wires) G.wires.push({ from: [map[w.from[0]], w.from[1]], to: [map[w.to[0]], w.to[1]] });
    render(); onChange(true);
  }
  function frameAll() {
    if (!G.nodes.length) return;
    const els = [...world.querySelectorAll('.gv-node')], x0 = Math.min(...G.nodes.map(n => n.x)), y0 = Math.min(...G.nodes.map(n => n.y));
    const x1 = Math.max(...els.map(e => e.offsetLeft + e.offsetWidth)), y1 = Math.max(...els.map(e => e.offsetTop + e.offsetHeight));
    const W = el.clientWidth, H = el.clientHeight, z = clamp(Math.min((W - 60) / (x1 - x0 || 1), (H - 60) / (y1 - y0 || 1)), .3, 1.2);
    Object.assign(view, { z, x: (W - (x1 - x0) * z) / 2 - x0 * z, y: (H - (y1 - y0) * z) / 2 - y0 * z }); applyView();
  }

  /* ------------------------------------------------------- the add menu ---- */
  // every node type (or, dragging a wire, the ones with a port that fits), grouped and searchable
  function openMenu(e, from = null) {
    const r = el.getBoundingClientRect(), at = toWorld(e);
    const q = h('input', { type: 'text', placeholder: from ? 'Nodes that fit this port…' : 'Find a node…' }), list = h('div', { class: 'gv-mlist' });
    const ok = t => !from || portsOf(t).some(p => fitsPort(from, p));
    const draw = () => {
      const s = q.value.toLowerCase();
      list.replaceChildren(...CATS.flatMap(([c, label]) => {
        const ts = Object.keys(NODES).filter(t => NODES[t].cat === c && ok(t) && (NODES[t].label.toLowerCase().includes(s) || (NODES[t].hint || '').toLowerCase().includes(s)));
        return ts.length ? [h('div', { class: 'gv-mcat cat-' + c }, label), ...ts.map(t => h('button', { class: 'gv-mi', title: NODES[t].hint || '', onclick: () => { hideMenu(); add(t, at, from); } }, NODES[t].label))] : [];
      }));
    };
    q.oninput = draw;
    q.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Escape') hideMenu(); if (ev.key === 'Enter') list.querySelector('.gv-mi')?.click(); };
    menu.replaceChildren(q, list); menu.style.display = '';
    menu.style.left = clamp(e.clientX - r.left, 4, r.width - 250) + 'px'; menu.style.top = clamp(e.clientY - r.top, 4, r.height - 340) + 'px';
    draw(); setTimeout(() => q.focus(), 0);
  }
  function nodeMenu(e, id) {
    const r = el.getBoundingClientRect();
    if (!sel.has(id)) { sel = new Set([id]); markSel(); }
    const item = (label, fn) => h('button', { class: 'gv-mi', onclick: () => { hideMenu(); fn(); } }, label);
    menu.replaceChildren(h('div', { class: 'gv-mlist' }, item('Duplicate (Ctrl+D)', () => { copySel(); paste([mouse[0] + 20, mouse[1] + 20]); }),
      item('Disconnect', () => { push(); G.wires = G.wires.filter(w => !sel.has(w.from[0]) && !sel.has(w.to[0])); render(); onChange(true); }), item('Delete (Del)', del)));
    menu.style.display = ''; menu.style.left = clamp(e.clientX - r.left, 4, r.width - 250) + 'px'; menu.style.top = clamp(e.clientY - r.top, 4, r.height - 140) + 'px';
  }
  const hideMenu = () => { menu.style.display = 'none'; };

  /* ------------------------------------------------------------ pointer ---- */
  el.addEventListener('pointerdown', e => {
    hideMenu();
    if (!e.target.closest('input,select')) el.focus();
    const pe = e.target.closest('.gv-port'), ne = e.target.closest('.gv-node'), p = toWorld(e);
    if (e.button === 1 || (e.button === 0 && !pe && !ne && !e.shiftKey && !e.ctrlKey)) {
      drag = { t: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    } else if (pe && e.button === 0) {
      let from = portInfo(pe);
      // a wired data input: pick its wire up and carry it from the other end
      const w = from.dir === 'in' && from.type !== 'exec' && G.wires.find(w => w.to[0] === from.node && w.to[1] === from.port);
      if (w) { push(); G.wires = G.wires.filter(x => x !== w); const src = portEl(w.from[0], w.from[1], 'out'); render(); from = portInfo(src); drag = { t: 'wire', from, at: () => portAt(portEl(from.node, from.port, 'out')), picked: true }; }
      else drag = { t: 'wire', from, at: () => portAt(pe) };
    } else if (ne && e.button === 0) {
      const id = ne.dataset.id;
      if (e.shiftKey || e.ctrlKey) sel.has(id) ? sel.delete(id) : sel.add(id); else if (!sel.has(id)) sel = new Set([id]);
      selWire = null; markSel(); drawWires(); push();
      drag = { t: 'move', p0: p, start: [...sel].map(i => { const n = byId(i); return [n, n.x, n.y]; }), moved: false };
    } else if (e.button === 0) drag = { t: 'box', p0: p, s0: [e.clientX, e.clientY], had: new Set(sel) };
    if (drag) { el.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  el.addEventListener('pointermove', e => {
    mouse = toWorld(e);
    if (!drag) return;
    if (drag.t === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; drag.moved ||= Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3; applyView(); }
    if (drag.t === 'move') {
      const dx = mouse[0] - drag.p0[0], dy = mouse[1] - drag.p0[1];
      drag.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      for (const [n, x, y] of drag.start) { n.x = snap(x + dx); n.y = snap(y + dy); const ne = nodeEl(n.id); ne.style.left = n.x + 'px'; ne.style.top = n.y + 'px'; }
      drawWires();
    }
    if (drag.t === 'wire') { const a = drag.at(); temp.setAttribute('d', drag.from.dir === 'out' ? curve(a, mouse) : curve(mouse, a)); temp.setAttribute('stroke', COL[drag.from.type]); }
    if (drag.t === 'box') {
      const r = el.getBoundingClientRect(), [x0, y0] = drag.s0, x = Math.min(x0, e.clientX), y = Math.min(y0, e.clientY), w = Math.abs(e.clientX - x0), hh = Math.abs(e.clientY - y0);
      Object.assign(box.style, { display: '', left: x - r.left + 'px', top: y - r.top + 'px', width: w + 'px', height: hh + 'px' });
      sel = new Set(drag.had);
      for (const ne of world.querySelectorAll('.gv-node')) { const b = ne.getBoundingClientRect(); if (b.right > x && b.left < x + w && b.bottom > y && b.top < y + hh) sel.add(ne.dataset.id); }
      markSel();
    }
  });
  el.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.t === 'pan' && !d.moved && e.button === 0) { sel.clear(); selWire = null; markSel(); drawWires(); }
    if (d.t === 'move') { if (d.moved) onChange(true); else undoS.pop(); }
    if (d.t === 'box') box.style.display = 'none';
    if (d.t === 'wire') {
      temp.setAttribute('d', '');
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.gv-port');
      if (target) { if (!d.picked) push(); if (link(d.from, portInfo(target))) { render(); onChange(true); } else if (d.picked) { render(); onChange(true); } }
      else if (!d.picked) openMenu(e, d.from);
      else { render(); onChange(true); }     // a wire picked up and dropped on nothing: it is gone
    }
  });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, z0 = view.z, z = clamp(z0 * Math.exp(-e.deltaY * .0015), .3, 2);
    view.x = mx - (mx - view.x) * z / z0; view.y = my - (my - view.y) * z / z0; view.z = z; applyView();
  }, { passive: false });
  el.addEventListener('dblclick', e => { if (!e.target.closest('.gv-node,.gv-menu')) openMenu(e); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); const ne = e.target.closest('.gv-node'); ne ? nodeMenu(e, ne.dataset.id) : openMenu(e); });
  el.addEventListener('keydown', e => {
    if (e.target !== el) return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, scr = () => { const r = el.getBoundingClientRect(); return { clientX: r.left + view.x + mouse[0] * view.z, clientY: r.top + view.y + mouse[1] * view.z }; };
    if (k === 'delete' || k === 'backspace') del();
    else if (ctrl && k === 'd') { copySel(); paste([mouse[0], mouse[1]]); }
    else if (ctrl && k === 'c') copySel();
    else if (ctrl && k === 'v') paste(mouse);
    else if (ctrl && k === 'z') e.shiftKey ? redo() : undo();
    else if (ctrl && k === 'y') redo();
    else if (ctrl && k === 'a') { sel = new Set(G.nodes.map(n => n.id)); markSel(); }
    else if (!ctrl && k === 'f') frameAll();
    else if (!ctrl && (k === 'a' || k === 'tab')) openMenu(scr());
    else if (k === 'escape') { hideMenu(); sel.clear(); selWire = null; markSel(); drawWires(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  new ResizeObserver(() => drawWires()).observe(el);

  return {
    el,
    load(g) { G = g; G.view ||= { x: 40, y: 40, z: 1 }; view = G.view; sel.clear(); selWire = null; undoS.length = redoS.length = 0; applyView(); render(); },
    // after the lists change (variables, zones, actors, sounds): redraw the fields
    refresh() { zones.replaceChildren(...lists().zones.map(z => h('option', { value: z }))); render(); },
    addAtCentre(type) { return add(type, [(el.clientWidth / 2 - view.x) / view.z - 80, (el.clientHeight / 2 - view.y) / view.z - 30]); },
    frame: frameAll, undo, redo,
  };
}
