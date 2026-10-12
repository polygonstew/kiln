// Full-colour art for the Modern look (gametype.js): a picture cut out of its background, trimmed to what is drawn and
// smoothly scaled to a height, every colour kept. The Pixel look uses core.js pixelize() instead.
import { keyBackground, bbox, crop } from './core.js';

// im: ImageData; o: { key, tol, keyGlobal, height (px, 0 = as drawn) } → ImageData
export function cutout(im, { key = true, tol = 38, keyGlobal = false, height = 0 } = {}) {
  let out = key ? keyBackground(im, tol, keyGlobal) : im;
  const b = bbox(out);
  if (b) out = crop(out, b.x, b.y, b.w, b.h);
  if (!height || height === out.height) return out;
  const k = height / out.height, w = Math.max(1, Math.round(out.width * k));
  const src = document.createElement('canvas'); src.width = out.width; src.height = out.height; src.getContext('2d').putImageData(out, 0, 0);
  const c = document.createElement('canvas'); c.width = w; c.height = height;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, height);
  return x.getImageData(0, 0, w, height);
}
