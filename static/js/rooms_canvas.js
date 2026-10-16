// The Rooms map: draws a room (background, walk area, depth lines, hotspots, where to stand, entries, the front layer)
// and edits it with the mouse. Tools: select (drag things, their points, stand marks, entries, depth lines), walk
// (click adds a point to the walk area, on the nearest edge), hotspot (drag a box), entry (click places one), depth.
// In every tool: right click a point removes it, double click an edge adds one. rooms.js owns the room and panels.
import { checker, fitZoom, artCtx } from './core.js';

const near = (a, b, r) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
export function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// the edge of poly nearest to p: [index to insert at, distance]
function nearestEdge(poly, p) {
  let best = [poly.length, Infinity];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)), d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d < best[1]) best = [i + 1, d];
  });
  return best;
}
export const standOf = q => q.stand || [Math.round(q.poly.reduce((s, p) => s + p[0], 0) / q.poly.length), Math.max(...q.poly.map(p => p[1]))];

// ctx: { room(), sel(), select(id), tool(), setTool(t), images() → {bg, fg} canvases, changed(full), snapshot(), show: {front} }
export function roomCanvas(ctx) {
  const cv = document.createElement('canvas');
  let z = 2, drag = null, hover = null;
  const at = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / z), Math.round((e.clientY - r.top) / z)]; };
  const hot = id => ctx.room().hotspots.find(q => q.id === id);
  const R_ = () => 6 / z;                    // how close counts as "on" a point, in room pixels

  function draw(fit) {
    const R = ctx.room(); if (!R) return;
    const vp = cv.parentElement;
    if (fit || !ctx.zoom()) z = vp ? fitZoom(vp.clientWidth - 30, vp.clientHeight - 30, R.w, R.h) : 2; else z = ctx.zoom();
    cv.width = R.w * z; cv.height = R.h * z;
    const x = cv.getContext('2d'), { bg, fg } = ctx.images(), sel = ctx.sel(), tool = ctx.tool();
    artCtx(x, z);
    checker(x, cv.width, cv.height, 8 * z, '#1a1a19', '#1f1f1e');
    if (bg) x.drawImage(bg, 0, 0, R.w * z, R.h * z);
    const poly = (pts, fill, stroke, w = 1, dash = []) => { if (pts.length < 2) return; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0] * z, p[1] * z) : x.moveTo(p[0] * z, p[1] * z)); x.closePath(); x.fillStyle = fill; x.fill(); x.setLineDash(dash); x.lineWidth = w; x.strokeStyle = stroke; x.stroke(); x.setLineDash([]); };
    const dots = (pts, c) => { x.fillStyle = c; for (const p of pts) x.fillRect(p[0] * z - 3, p[1] * z - 3, 6, 6); };
    // walk area
    const walkOn = tool === 'walk' || sel === 'walk';
    if (R.walk.length) { poly(R.walk, walkOn ? '#9cc76b38' : '#9cc76b1c', '#9cc76b', walkOn ? 2 : 1, walkOn ? [] : [5, 4]); if (walkOn) dots(R.walk, '#9cc76b'); }
    // depth: the far and near lines, a figure at each showing how big people are there
    const D = R.depth, depthOn = tool === 'depth' || sel === 'depth';
    for (const [y, s, label] of [[D.farY, D.farS, 'far'], [D.nearY, D.nearS, 'near']]) {
      x.strokeStyle = depthOn ? '#6fb3d9' : '#6fb3d966'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, y * z + .5); x.lineTo(R.w * z, y * z + .5); x.stroke(); x.setLineDash([]);
      const fh = 40 * s * z, fw = 14 * s * z; x.fillStyle = depthOn ? '#6fb3d9aa' : '#6fb3d944'; x.fillRect(8 * z, y * z - fh, fw, fh);
      if (depthOn) { x.fillStyle = '#6fb3d9'; x.font = '11px monospace'; x.fillText(`${label} ${Math.round(s * 100)}%`, 8 * z + fw + 4, y * z - 4); }
    }
    // hotspots
    x.font = '11px var(--sans, sans-serif)';
    for (const q of R.hotspots) {
      const on = q.id === sel, c = q.does === 'go' ? '#6fb3d9' : q.does === 'pick' ? '#9cc76b' : q.does === 'talk' ? '#c06bd6' : '#e3b04b';
      poly(q.poly, c + (on ? '40' : hover === q.id ? '30' : '1c'), c, on ? 2 : 1);
      const top = q.poly.reduce((a, p) => p[1] < a[1] ? p : a, q.poly[0]);
      x.fillStyle = '#000a'; const t = (q.title || q.name) + (q.needs ? ' (locked)' : '') + (q.when || q.unless ? ' ⚑' : ''), tw = x.measureText(t).width;
      x.fillRect(top[0] * z - tw / 2 - 3, top[1] * z - 16, tw + 6, 14); x.fillStyle = c; x.fillText(t, top[0] * z - tw / 2, top[1] * z - 5);
      if (on) {
        dots(q.poly, c);
        const s = standOf(q); x.strokeStyle = '#fff'; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(s[0] * z, s[1] * z); x.lineTo(q.poly.reduce((a, p) => a + p[0], 0) / q.poly.length * z, q.poly.reduce((a, p) => a + p[1], 0) / q.poly.length * z); x.stroke(); x.setLineDash([]);
        x.beginPath(); x.arc(s[0] * z, s[1] * z, 5, 0, 7); x.fillStyle = '#fff'; x.fill(); x.fillStyle = '#000'; x.fillText('stand', s[0] * z + 7, s[1] * z + 4);
      }
    }
    // entries: little flags
    for (const e of R.entries) {
      const on = sel === 'entry:' + e.name;
      x.fillStyle = on ? '#fff' : '#ff8a5c'; x.fillRect(e.x * z - 1, e.y * z - 18, 2, 18); x.fillRect(e.x * z + 1, e.y * z - 18, 10, 7);
      x.fillStyle = '#000a'; const tw = x.measureText(e.name).width; x.fillRect(e.x * z + 12, e.y * z - 20, tw + 6, 13); x.fillStyle = on ? '#fff' : '#ff8a5c'; x.fillText(e.name, e.x * z + 15, e.y * z - 10);
    }
    if (fg && ctx.show.front) { x.globalAlpha = .55; x.drawImage(fg, 0, 0, R.w * z, R.h * z); x.globalAlpha = 1; }
    if (drag?.box) { const [a, b] = drag.box; x.strokeStyle = '#e3b04b'; x.setLineDash([4, 3]); x.strokeRect(Math.min(a[0], b[0]) * z + .5, Math.min(a[1], b[1]) * z + .5, Math.abs(b[0] - a[0]) * z, Math.abs(b[1] - a[1]) * z); x.setLineDash([]); }
  }

  // what is under the mouse, best first: a point of the selected thing, its stand mark, an entry, a depth line, a hotspot
  function pickAt(p) {
    const R = ctx.room(), sel = ctx.sel(), q = hot(sel), r = R_() * 1.5;
    if (q) { const i = q.poly.findIndex(v => near(v, p, r)); if (i >= 0) return { kind: 'point', pts: q.poly, i }; if (near(standOf(q), p, r)) return { kind: 'stand', q }; }
    if (sel === 'walk' || ctx.tool() === 'walk') { const i = R.walk.findIndex(v => near(v, p, r)); if (i >= 0) return { kind: 'point', pts: R.walk, i }; }
    const e = R.entries.find(e => p[0] >= e.x - 3 && p[0] <= e.x + 12 && p[1] >= e.y - 19 && p[1] <= e.y + 2); if (e) return { kind: 'entry', e };
    if (sel === 'depth' || ctx.tool() === 'depth') for (const k of ['farY', 'nearY']) if (Math.abs(R.depth[k] - p[1]) <= r) return { kind: 'depth', k };
    const h = [...R.hotspots].reverse().find(q => inPoly(p, q.poly)); if (h) return { kind: 'hotspot', q: h };
    return null;
  }

  cv.addEventListener('contextmenu', e => e.preventDefault());
  // from the asset shelf: a character or a picture becomes a hotspot that shows it, where it lands
  cv.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-kiln-asset')) e.preventDefault(); });
  cv.addEventListener('drop', e => { let a; try { a = JSON.parse(e.dataTransfer.getData('application/x-kiln-asset')); } catch { return; } e.preventDefault(); ctx.dropAsset?.(a, at(e)); });
  cv.addEventListener('pointerdown', e => {
    const R = ctx.room(); if (!R) return;
    const p = at(e), hit = pickAt(p), tool = ctx.tool();
    cv.setPointerCapture(e.pointerId);
    if (e.button === 2) {                                   // right click: remove a point
      if (hit?.kind === 'point' && (hit.pts !== R.walk || R.walk.length > 3) && hit.pts.length > 3) { ctx.snapshot(); hit.pts.splice(hit.i, 1); ctx.changed(); }
      return;
    }
    if (tool === 'hotspot' && !hit) { drag = { box: [p, p] }; return; }
    if (tool === 'entry' && !hit) {
      ctx.snapshot();
      const names = new Set(R.entries.map(e => e.name)); let n = R.entries.length ? 'entry_' + (R.entries.length + 1) : 'start'; while (names.has(n)) n += '_2';
      R.entries.push({ name: n, x: p[0], y: p[1] }); ctx.select('entry:' + n); ctx.setTool('select'); ctx.changed(true); return;
    }
    if (tool === 'walk' && hit?.kind !== 'point') {
      ctx.snapshot(); ctx.select('walk');
      if (R.walk.length < 3) R.walk.push(p); else R.walk.splice(nearestEdge(R.walk, p)[0], 0, p);
      ctx.changed(); return;
    }
    if (!hit) { ctx.select(tool === 'depth' ? 'depth' : null); return; }
    ctx.snapshot();
    if (hit.kind === 'point') drag = { move: v => { hit.pts[hit.i] = v; } };
    else if (hit.kind === 'stand') drag = { move: v => { hit.q.stand = v; } };
    else if (hit.kind === 'entry') { ctx.select('entry:' + hit.e.name); drag = { move: v => { hit.e.x = v[0]; hit.e.y = v[1]; } }; }
    else if (hit.kind === 'depth') { ctx.select('depth'); drag = { move: v => { R.depth[hit.k] = Math.max(0, Math.min(R.h, v[1])); } }; }
    else if (hit.kind === 'hotspot') {
      ctx.select(hit.q.id);
      const start = p, orig = hit.q.poly.map(v => [...v]), st = hit.q.stand && [...hit.q.stand];
      drag = { move: v => { const dx = v[0] - start[0], dy = v[1] - start[1]; hit.q.poly = orig.map(o => [o[0] + dx, o[1] + dy]); if (st) hit.q.stand = [st[0] + dx, st[1] + dy]; } };
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = at(e);
    if (drag?.box) { drag.box[1] = p; draw(); return; }
    if (drag?.move) { drag.move(p); drag.moved = true; draw(); return; }
    const h = ctx.room() && [...ctx.room().hotspots].reverse().find(q => inPoly(p, q.poly));
    if ((h?.id || null) !== hover) { hover = h?.id || null; draw(); }
    cv.title = h ? `${h.title || h.name}: click to pick, drag to move` : '';
  });
  cv.addEventListener('pointerup', () => {
    const d = drag; drag = null;
    if (d?.box) {
      const [a, b] = d.box, x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
      if (x1 - x0 >= 4 && y1 - y0 >= 4) ctx.newHotspot([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); else draw();
      return;
    }
    if (d?.moved) ctx.changed(true);
  });
  cv.addEventListener('dblclick', e => {                    // double click an edge of the selected shape: a new point there
    const R = ctx.room(), p = at(e), q = hot(ctx.sel()), pts = q ? q.poly : ctx.sel() === 'walk' ? R.walk : null;
    if (!pts || pts.length < 3) return;
    const [i, d] = nearestEdge(pts, p);
    if (d <= R_() * 2) { ctx.snapshot(); pts.splice(i, 0, p); ctx.changed(); }
  });
  return { el: cv, draw, zoomNow: () => z };
}
