// Faces for puppets: extra heads to swap in (front / side / back / angry…) and a set of pixel mouths, so a rig can
// look around and talk. The nine mouth shapes are the usual lip-sync set (as in Rhubarb Lip Sync / Preston Blair):
//   X rest · A closed (M B P) · B slightly open (K S T EE) · C open (EH AE) · D wide (AA) · E round (AO ER)
//   F pucker (UW OO W) · G teeth on lip (F V) · H tongue up (L)
// Heads: rig.heads = [{ id, name, view, src, ax, ay, mouth: [x, y] | null }] (ax, ay = the neck point in the head picture;
// view = front | back | left | right | 3l | 3r | up | down | '' for an expression).
// The drawn head (the rig's own pixels) is id "drawn"; its mouth spot is rig.mouthAt (drawing coordinates), its name and
// view rig.drawnName / rig.drawnView.
// Poses carry _head (a head id) and _mouth (a shape letter); rig.js render() draws them (face from buildFace()).
import { newImg, imgData, bbox, crop, luma } from './core.js';
import { prepImage } from './rig.js';
import { nativeOf } from './rig_import.js';

export const SHAPES = [['X', 'rest'], ['A', 'M B P'], ['B', 'K S T EE'], ['C', 'EH AE'], ['D', 'AA (wide)'], ['E', 'AO ER (round)'], ['F', 'OO W (pucker)'], ['G', 'F V'], ['H', 'L']];

// the colours a mouth is drawn in, from the head's own pixels: its darkest colour for the lips' line, a dark red
// inside, and its lightest for teeth
export function faceColours(im, parts, headIndex) {
  const cols = [];
  for (let i = 0; i < im.width * im.height; i++) if ((parts == null || parts[i] === headIndex) && im.data[i * 4 + 3] >= 128) cols.push([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]);
  if (!cols.length) return { line: [24, 16, 16], inside: [80, 22, 26], teeth: [230, 226, 214] };
  cols.sort((a, b) => luma(a) - luma(b));
  const line = luma(cols[0]) < 70 ? cols[0] : [24, 16, 16], top = cols[cols.length - 1];
  return { line, inside: [Math.round(line[0] * .4 + 110 * .6), Math.round(line[1] * .4 + 26 * .6), Math.round(line[2] * .4 + 32 * .6)], teeth: luma(top) > 150 ? top : [230, 226, 214] };
}

// nine small mouths, w pixels wide (3–12), in those colours
export function mouthShapes(w, c) {
  w = Math.max(3, Math.min(12, Math.round(w)));
  const H = Math.max(3, Math.round(w * .7)), out = {};
  const make = (ww, hh, draw) => { const im = newImg(ww, hh), px = (x, y, col) => { if (x >= 0 && y >= 0 && x < ww && y < hh) im.data.set([...col, 255], (y * ww + x) * 4); }; draw(px, ww, hh); return im; };
  // an open mouth: an outlined oval ww × hh with the inside filled, optional teeth on the top row and a tongue
  const oval = (ww, hh, { teeth = false, tongue = false } = {}) => make(ww, hh, (px) => {
    const cx = (ww - 1) / 2, cy = (hh - 1) / 2, rx = ww / 2, ry = hh / 2;
    for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1.05) continue;
      const edge = ((x - cx) / (rx - 1 || 1)) ** 2 + ((y - cy) / (ry - 1 || 1)) ** 2 > .95 || ww <= 3 || hh <= 2;
      px(x, y, edge ? c.line : c.inside);
    }
    if (teeth) for (let x = 1; x < ww - 1; x++) if (hh > 3) px(x, 1, c.teeth);
    if (tongue && hh > 3) for (let x = Math.floor(ww / 2) - 1; x <= Math.ceil(ww / 2); x++) px(x, 1, [200, 90, 100]);
  });
  out.X = make(w, 1, (px, ww) => { for (let x = 1; x < ww - 1; x++) px(x, 0, c.line); });
  out.A = make(w, 2, (px, ww) => { for (let x = 1; x < ww - 1; x++) px(x, 0, c.line); for (let x = 2; x < ww - 2; x++) px(x, 1, c.line); });
  out.B = make(w, 2, (px, ww) => { for (let x = 0; x < ww; x++) px(x, 0, c.line); for (let x = 1; x < ww - 1; x++) px(x, 1, x > 1 && x < ww - 2 ? c.teeth : c.line); });
  out.C = oval(w, Math.max(3, Math.round(H * .6)), { teeth: true });
  out.D = oval(w, H, { teeth: true });
  out.E = oval(Math.max(3, Math.round(w * .65)), Math.max(3, H - 1));
  out.F = oval(Math.max(3, Math.round(w * .45)), Math.max(3, Math.round(H * .6)));
  out.G = make(w, 2, (px, ww) => { for (let x = 1; x < ww - 1; x++) { px(x, 0, c.teeth); px(x, 1, c.line); } });
  out.H = oval(w, Math.max(3, Math.round(H * .75)), { tongue: true });
  return out;
}

// a picture → a head to swap in: the art's own pixels, background gone, cropped; the neck at its bottom middle
export async function headFromImage(url) {
  const n = nativeOf(await imgData(url)), b = bbox(n);
  if (!b) return null;
  const im = crop(n, b.x, b.y, b.w, b.h);
  return { im, ax: Math.floor(im.width / 2), ay: im.height - 1 };
}
export function mirror(im) {
  const o = newImg(im.width, im.height);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) o.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), (y * im.width + im.width - 1 - x) * 4);
  return o;
}

// what render() needs: each head and mouth as an EPX copy, ready to draw through the head bone
export async function buildFace(R) {
  const heads = {};
  for (const hd of R.heads || []) heads[hd.id] = { Q: prepImage(await imgData(hd.src)), ax: hd.ax, ay: hd.ay, mouth: hd.mouth || null };
  const mouths = {};
  for (const [k, src] of Object.entries(R.mouths?.shapes || {})) mouths[k] = prepImage(await imgData(src));
  return { heads, mouths, mouthAt: R.mouthAt || null };
}
