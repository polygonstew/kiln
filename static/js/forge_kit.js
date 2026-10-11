// What Forge's makers share (Background, Tileset, Icon set): the generator choice and "generate one image and wait".
import { h, seg } from './core.js';
import { enqueue, budgetTag } from './queue.js';
import { stylePrompt, styleAvoid } from './style.js';

// cloud: detailed, wide formats; fast / scene: on this PC, free
export const ENGINES = [['cloud', 'Cloud', 'Detailed; free daily quota first, then a few cents from the capped budget'],
  ['fast', 'This PC', 'The local pixel model kept loaded: free, about half a minute each'],
  ['scene', 'This PC (scenes)', 'The local model for landscapes: free, a minute or two each']];
export const engineSeg = (value, onChange, which = ENGINES.map(e => e[0])) =>
  seg(ENGINES.filter(e => which.includes(e[0])).map(([k, l, t]) => [k, k === 'cloud' ? h('span', {}, l, budgetTag()) : l, t]), value, onChange);

// a flat white or black frame round a picture (generators like to add one): cropped off
export function trimFrame(im) {
  const { width: w, height: hh, data: d } = im, at = (x, y) => (y * w + x) * 4, c = [d[0], d[1], d[2]];
  if (!(c.every(v => v > 230) || c.every(v => v < 25))) return im;
  const flat = i => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < 40;
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = hh - 1;
  const rowFlat = y => { for (let x = 0; x < w; x += 2) if (!flat(at(x, y))) return false; return true; }, colFlat = x => { for (let y = 0; y < hh; y += 2) if (!flat(at(x, y))) return false; return true; };
  while (y0 < y1 && rowFlat(y0)) y0++; while (y1 > y0 && rowFlat(y1)) y1--; while (x0 < x1 && colFlat(x0)) x0++; while (x1 > x0 && colFlat(x1)) x1--;
  if (x1 - x0 < w * .3 || y1 - y0 < hh * .3 || (x0 < 3 && y0 < 3 && x1 > w - 4 && y1 > hh - 4)) return im;
  const o = new ImageData(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) o.data.set(d.subarray(at(x0, y), at(x1 + 1, y)), (y - y0) * o.width * 4);
  return o;
}
// one image: the prompt (with the style bible), w × h as a shape (the cloud picks the nearest format), resolves to its URL.
// hint tells the generator what kind of picture: 'sprite' (one figure on white, the default), 'scene' (a whole background),
// 'layer' (scenery for one background layer) or 'texture' (a surface for tiles); the last three drop the style bible's
// silhouette words, which pull a single figure into the middle
export async function genOne(engine, prompt, w, hh, label, avoid = '', hint = 'sprite') {
  const style = hint === 'sprite' ? stylePrompt() : stylePrompt().replace(/,?\s*strong silhouettes?/gi, '');
  const req = { engine, engine_hint: hint, prompt: [prompt, style].filter(Boolean).join(', '), neg: [avoid, styleAvoid()].filter(Boolean).join(', '), w, h: hh, batch: 1, steps: 4, fast: true, seed: -1 };
  if (engine !== 'cloud') { const k = 512 / Math.max(w, hh); req.w = Math.round(w * k / 8) * 8; req.h = Math.round(hh * k / 8) * 8; }
  const job = enqueue(req, label);
  const imgs = await job.done;
  return imgs[0];
}
