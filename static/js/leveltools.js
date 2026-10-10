// Level painting tools: which cells a brush, rectangle, line or fill covers, a copy/paste clipboard of cells,
// and undo history. Pure functions over the level object L ({ cols, rows, cells, ents, zones }); levels.js
// does the drawing and the pointer handling.

export const TOOLS = [['brush', 'Brush', 'B', '✎'], ['rect', 'Rectangle', 'R', '▭'], ['line', 'Line', 'L', '╱'], ['fill', 'Fill', 'G', '◧'], ['pick', 'Pick a tile', 'I', '⌖'], ['select', 'Select (copy, cut, paste, delete)', 'M', '⬚']];

const inside = (L, c, r) => c >= 0 && r >= 0 && c < L.cols && r < L.rows;
// a size×size square (1, 2 or 3) with p at its top-left-ish centre
export function brushCells(L, [c, r], size = 1) {
  const out = [], o = Math.floor((size - 1) / 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (inside(L, c - o + x, r - o + y)) out.push([c - o + x, r - o + y]);
  return out;
}
export function rectCells(L, [c0, r0], [c1, r1]) {
  const out = [];
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) if (inside(L, c, r)) out.push([c, r]);
  return out;
}
export function lineCells(L, [c0, r0], [c1, r1]) {
  const out = [], n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
  for (let i = 0; i <= n; i++) { const c = Math.round(c0 + (c1 - c0) * i / n), r = Math.round(r0 + (r1 - r0) * i / n); if (inside(L, c, r)) out.push([c, r]); }
  return out;
}
// every cell connected to p (4 ways) holding the same tile (empty counts as a tile), capped so a click never hangs
export function floodCells(L, [c0, r0], cap = 20000) {
  const want = L.cells[r0 * L.cols + c0], seen = new Uint8Array(L.cols * L.rows), out = [], st = [[c0, r0]];
  seen[r0 * L.cols + c0] = 1;
  while (st.length && out.length < cap) {
    const [c, r] = st.pop(); out.push([c, r]);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c + dc, y = r + dr, i = y * L.cols + x;
      if (inside(L, x, y) && !seen[i] && L.cells[i] === want) { seen[i] = 1; st.push([x, y]); }
    }
  }
  return out;
}
// a rectangle of cells to carry around: { w, h, cells } (-1 = empty)
export function copyCells(L, s) {
  const cells = [];
  for (let r = 0; r < s.h; r++) for (let c = 0; c < s.w; c++) cells.push(inside(L, s.x + c, s.y + r) ? L.cells[(s.y + r) * L.cols + s.x + c] : -1);
  return { w: s.w, h: s.h, cells };
}
export const selRect = ([c0, r0], [c1, r1]) => ({ x: Math.min(c0, c1), y: Math.min(r0, r1), w: Math.abs(c1 - c0) + 1, h: Math.abs(r1 - r0) + 1 });

// undo / redo of the level's tiles, things and zones (60 steps)
export function history(get, set) {
  let U = [], R = [];
  const snap = () => JSON.stringify(get());
  return {
    push() { U.push(snap()); if (U.length > 60) U.shift(); R = []; },
    undo() { if (!U.length) return false; R.push(snap()); set(JSON.parse(U.pop())); return true; },
    redo() { if (!R.length) return false; U.push(snap()); set(JSON.parse(R.pop())); return true; },
    clear() { U = []; R = []; },
    get sizes() { return [U.length, R.length]; },
  };
}
