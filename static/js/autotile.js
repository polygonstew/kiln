// Autotile: from one tile, build the 16 pieces a platform or wall needs (every combination of open top / right /
// bottom / left sides: caps, edges, corners) and paint with them so neighbouring tiles join up by themselves.
// A level's terrains are { name, first } (first = index of piece 0 in the tileset); piece = first + mask, where
// mask bit 1 = a same-terrain neighbour above, 2 = right, 4 = below, 8 = left. Godot gets a matching terrain set.
import { newImg, luma } from './core.js';

export const STYLES = [['grass', 'Grass top'], ['light', 'Lit top edge'], ['outline', 'Outline only']];

const px = (im, x, y) => im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4);
const mix = (c, k) => c.map((v, i) => i < 3 ? Math.max(0, Math.min(255, Math.round(v * k))) : v);

// one T×T tile (ImageData) → 16 tiles in a 8×2 strip
export function buildPieces(tile, T, style = 'grass') {
  const cols = []; for (let i = 0; i < tile.data.length; i += 4) if (tile.data[i + 3] > 128) cols.push([...tile.data.subarray(i, i + 4)]);
  const sorted = cols.sort((a, b) => luma(a) - luma(b)), dark = mix(sorted[0] || [40, 30, 30, 255], .55), lite = mix(sorted[sorted.length - 1] || [200, 200, 200, 255], 1.25);
  const grass = [[134, 196, 64, 255], [82, 150, 52, 255], [44, 96, 44, 255]];
  const out = newImg(T * 8, T * 2), cap = Math.max(2, Math.round(T / 5));
  for (let m = 0; m < 16; m++) {
    const ox = (m % 8) * T, oy = Math.floor(m / 8) * T, U = m & 1, R = m & 2, D = m & 4, Lf = m & 8;
    const set = (x, y, c) => out.data.set(c, ((oy + y) * out.width + ox + x) * 4);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) set(x, y, px(tile, x, y));
    if (!U) for (let x = 0; x < T; x++) {
      if (style === 'grass') { for (let y = 0; y < cap; y++) set(x, y, y === cap - 1 && (x * 7) % 5 < 2 ? grass[2] : y === 0 ? grass[0] : grass[1]); set(x, cap, grass[2]); }
      else if (style === 'light') { set(x, 0, dark); set(x, 1, lite); }
      else set(x, 0, dark);
    }
    if (!D) for (let x = 0; x < T; x++) set(x, T - 1, dark);
    if (!Lf) for (let y = U ? 0 : 1; y < T; y++) set(0, y, dark);
    if (!R) for (let y = U ? 0 : 1; y < T; y++) set(T - 1, y, dark);
    const clear = (x, y) => set(x, y, [0, 0, 0, 0]);                       // rounded outer corners
    if (!U && !Lf) { clear(0, 0); if (style !== 'outline') set(1, 1, style === 'grass' ? grass[0] : lite); }
    if (!U && !R) clear(T - 1, 0);
    if (!D && !Lf) clear(0, T - 1);
    if (!D && !R) clear(T - 1, T - 1);
  }
  return out;
}

// append the 16 pieces as new rows under the tileset, keeping its width (so existing tile numbers stay put)
export function appendPieces(tsImg, T, pieces) {
  const cols = Math.max(1, Math.floor(tsImg.width / T)), rows = Math.max(1, Math.floor(tsImg.height / T)), add = Math.ceil(16 / cols);
  const cv = document.createElement('canvas'); cv.width = tsImg.width; cv.height = (rows + add) * T;
  const x = cv.getContext('2d'); x.putImageData(tsImg, 0, 0);
  const pc = document.createElement('canvas'); pc.width = pieces.width; pc.height = pieces.height; pc.getContext('2d').putImageData(pieces, 0, 0);
  const first = rows * cols;
  for (let m = 0; m < 16; m++) x.drawImage(pc, (m % 8) * T, Math.floor(m / 8) * T, T, T, ((first + m) % cols) * T, Math.floor((first + m) / cols) * T, T, T);
  return { url: cv.toDataURL('image/png'), first };
}

// which terrain a tile belongs to (or null); the right piece for a cell from its neighbours
export const terrainOf = (terrains, t) => (terrains || []).find(r => t >= r.first && t < r.first + 16) || null;
export function fixCell(L, c, r) {
  if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return;
  const i = r * L.cols + c, ter = terrainOf(L.terrains, L.cells[i]); if (!ter) return;
  const same = (cc, rr) => cc >= 0 && rr >= 0 && cc < L.cols && rr < L.rows && terrainOf(L.terrains, L.cells[rr * L.cols + cc]) === ter;
  L.cells[i] = ter.first + (same(c, r - 1) ? 1 : 0) + (same(c + 1, r) ? 2 : 0) + (same(c, r + 1) ? 4 : 0) + (same(c - 1, r) ? 8 : 0);
}
// after painting (c, r): the cell and its 4 neighbours pick their pieces again
export const fixAround = (L, c, r) => [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => fixCell(L, c + dx, r + dy));

// TileSet lines: the terrain set header, and the peering bits for one tile
export const terrainHeader = terrains => !terrains?.length ? '' : 'terrain_set_0/mode = 2\n'
  + terrains.map((t, i) => `terrain_set_0/terrain_${i}/name = "${t.name}"\nterrain_set_0/terrain_${i}/color = Color(${(.3 + i * .2) % 1}, 0.6, 0.35, 1)\n`).join('');
export function terrainLines(key, terrains, t) {
  const ti = (terrains || []).findIndex(r => t >= r.first && t < r.first + 16); if (ti < 0) return '';
  const m = t - terrains[ti].first, out = [`${key}/terrain_set = 0`, `${key}/terrain = ${ti}`];
  if (m & 1) out.push(`${key}/terrains_peering_bit/top_side = ${ti}`);
  if (m & 2) out.push(`${key}/terrains_peering_bit/right_side = ${ti}`);
  if (m & 4) out.push(`${key}/terrains_peering_bit/bottom_side = ${ti}`);
  if (m & 8) out.push(`${key}/terrains_peering_bit/left_side = ${ti}`);
  return '\n' + out.join('\n');
}
